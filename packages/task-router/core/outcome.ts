// Outcome log events (spec §5.2.7, R2): allowlisted keys, bounded strings, no card or prompt text.
import { createHash } from "node:crypto";
import { basename, isAbsolute, join } from "node:path";
import type { MergeReason } from "./local/merge.ts";
import type { Role, TicketRole } from "./local/overseer.ts";
import type { TriggerKind } from "./local/plan.ts";
import type { Trip } from "./local/tripwires.ts";
import type { Card, LoggedPlan, Start, ThinkingLevel } from "./types.ts";

export type OutcomeEvent = Record<string, string | number | boolean | string[]>;
export type Verdict = "accepted" | "partial" | "rejected" | "unjudged";

/** Schema version of an outcome event (docs/outcome-log.md); readers treat an absent `v` as 0 (legacy). 2: the
 *  experiments `arm` is retired (local-first spec RND-8, NR-3). */
export const SCHEMA_VERSION = 2;
const KEYS = [
  "v", "ts", "event", "taskId", "cardHash", "kind", "workerTier", "workerEffort", "reviewTier", "reviewEffort",
  "base", "importance", "reasons", "sessionId", "parentSessionId", "attemptOf", "from", "to", "reason",
  "exit", "durationMs", "verdict", "note",
  // optional, T5.20
  "unresolved", "assigned", "routeBase", "reviewOf", "requested",
  // optional, router 2026-10-17 (spec §6.4): requirement, levels, started member, model, effort, wait; reroute/escalate models, levels
  "ability", "level", "draft", "workerLevel", "reviewLevel", "workerMember", "workerModel", "startEffort", "waitMs",
  "fromModel", "toModel", "fromLevel", "toLevel",
  // local mode L2 (design §3.0.3): the force line; a forced spawn's source and what routing would have chosen
  "action", "source", "model", "effort", "forced", "forceSource", "routedModel", "routedEffort",
  // local mode L3 (design §3.0.3): the hint line
  "trip", "stage", "count",
  // local mode L4 (design §3.0.3): the review line; a ticket child's spawn line names its ticket role
  "role", "member", "outcome", "blocking", "findings", "fallback", "inconsistent", "attempt", "commit", "branch", "ticket",
  // local mode L6 (design §3.0.3): the merge and gatebypass lines
  "nLines", "nFiles", "reviewId", "pushed", "repo",
  // local mode L7 (design §3.0.3): the plan line
  "trigger", "nTasks", "full",
  // outcome log v2 (local-first spec §2.4): the session line
  "profile", "mainModel", "startSet", "localMembers", "routerVersion",
  // the profile line (LF3.T4)
  "by",
  // outcome log v2: what a revert needs on a merge line (LOG-1); class, tier, actualTier, node from LF5/LF6
  "target", "repoId", "class", "tier", "actualTier", "node",
  // NOT listed: `arms` (RND-6, S33) is added by log.ts after the builders, and is not clipped to MAX_ITEMS: the registry has 21
  // factors, so a line can carry 21 `id=level` items, one more than the cap.
];
const MAX_STR = 256;
const MAX_ITEMS = 20;
const clip = (s: string) => s.slice(0, MAX_STR);

/** Only allowlisted keys, strings clipped, undefined dropped. */
function finish(raw: Record<string, unknown>): OutcomeEvent {
  const out: OutcomeEvent = {};
  for (const k of KEYS) {
    const v = raw[k];
    if (typeof v === "string") out[k] = clip(v);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, MAX_ITEMS).map((x) => clip(String(x)));
  }
  return out;
}

const base = (event: string, now: Date, taskId: string) => ({ v: SCHEMA_VERSION, ts: now.toISOString(), event, taskId });

/** Hash of the card; the card text itself is never logged. */
export const cardHash = (c: Card): string => createHash("sha256").update(JSON.stringify(c)).digest("hex").slice(0, 16);

/** `workerTier`/`workerEffort` are the planned leg (RD2); `start` is what the child started on (a routed spawn only; a forced
 *  non-member has no member, so no `workerMember`, plan D10); `forced`: the force it ran under and the routed counterfactual. */
export const spawnEvent = (i: { now: Date; taskId: string; card: Card; plan: LoggedPlan; start?: Start; sessionId?: string; parentSessionId?: string; attemptOf?: string; unresolved?: boolean; forced?: Forced }) =>
  finish({
    ...base("spawn", i.now, i.taskId), cardHash: cardHash(i.card), kind: i.card.kind,
    workerTier: i.plan.worker.tier, workerEffort: i.plan.worker.effort,
    reviewTier: i.plan.review?.tier, reviewEffort: i.plan.review?.effort,
    ability: i.plan.ability, level: i.plan.level, draft: i.plan.draft, workerLevel: i.plan.worker.level, reviewLevel: i.plan.review?.level,
    workerMember: i.start?.member || undefined, workerModel: i.start?.model, startEffort: i.start?.effort, waitMs: i.start?.waitMs,
    base: i.plan.base, importance: i.plan.importance, reasons: i.plan.reasons,
    sessionId: i.sessionId, parentSessionId: i.parentSessionId, attemptOf: i.attemptOf ?? i.card.attemptOf,
    assigned: i.plan.assigned, routeBase: i.plan.routeBase, unresolved: i.unresolved || undefined, reviewOf: i.card.reviewOf,
    ...(i.forced ? { forced: true, forceSource: i.forced.source, routedModel: i.forced.routedModel, routedEffort: i.forced.routedEffort } : {}),
  });
/** A failover's line: the routes and, when known, the models on both (spec §6.4). */
export const rerouteEvent = (i: { now: Date; taskId: string; from: string; to: string; reason: string; fromModel?: string; toModel?: string }) =>
  finish({ ...base("reroute", i.now, i.taskId), from: i.from, to: i.to, reason: i.reason, fromModel: i.fromModel, toModel: i.toModel });
export const checkEvent = (i: { now: Date; taskId: string; exit: number; durationMs: number }) =>
  finish({ ...base("check", i.now, i.taskId), exit: i.exit, durationMs: i.durationMs });
export const correctiveEvent = (i: { now: Date; taskId: string }) => finish(base("corrective", i.now, i.taskId));
/** The escalate line's router fields (spec §6.4): the models on both routes, the re-spawn's ability, the levels. */
export type EscalateFields = { fromModel?: string; toModel?: string; ability?: string; fromLevel?: number; toLevel?: number };
export const escalateEvent = (i: { now: Date; taskId: string; from: string; to: string; attemptOf?: string } & EscalateFields) =>
  finish({
    ...base("escalate", i.now, i.taskId), from: i.from, to: i.to, attemptOf: i.attemptOf,
    fromModel: i.fromModel, toModel: i.toModel, ability: i.ability, fromLevel: i.fromLevel, toLevel: i.toLevel,
  });
export const verdictEvent = (i: { now: Date; taskId: string; verdict: Verdict; note?: string; reviewOf?: string }) =>
  finish({ ...base("verdict", i.now, i.taskId), verdict: i.verdict, note: i.note, reviewOf: i.reviewOf });
export const spotcheckEvent = (i: { now: Date; taskId: string }) => finish({ ...base("spotcheck", i.now, i.taskId), requested: true });
export type ForceAction = "set" | "clear" | "used" | "expired" | "rejected";
export type ForceSource = "command" | "settings";
export type Forced = { source: ForceSource; routedModel: string; routedEffort: ThinkingLevel };
/** A session-level line (design §3.0.3): `taskId: ""`; `model` is a model reference, never the command's text. */
export const forceEvent = (i: { now: Date; action: ForceAction; source: ForceSource; model?: string; effort?: string; reason?: "unknown-model" | "usage" }) =>
  finish({ ...base("force", i.now, ""), action: i.action, source: i.source, model: i.model, effort: i.effort, reason: i.reason });

export type HintStage = "hint" | "steer" | "parent";
/** A hint (design §3.1.2, §3.0.3): `taskId` is "main" or the child's name; the trip and stage, never the hint's text. */
export const hintEvent = (i: { now: Date; taskId: string; trip: Trip; stage: HintStage; count?: number; sessionId?: string }) =>
  finish({ ...base("hint", i.now, i.taskId), trip: i.trip, stage: i.stage, count: i.count, sessionId: i.sessionId });

export type ReviewOutcome = "approve" | "revise" | "invalid" | "timeout" | "error";
export type ReviewInput = { reviewId: string; role: Role; member: string; model: string; outcome: ReviewOutcome; attempt: number; durationMs: number;
  fallback?: Fallback; findings?: number; blocking?: number; inconsistent?: boolean; commit?: string; branch?: string };
/** One overseer attempt (design §3.0.3): `taskId` is the review id; the verdict's counts and flags, never its text. */
export const reviewEvent = (i: ReviewInput & { now: Date }) =>
  finish({
    ...base("review", i.now, i.reviewId), role: i.role, member: i.member, model: i.model, outcome: i.outcome, attempt: i.attempt,
    durationMs: i.durationMs, fallback: i.fallback, findings: i.findings, blocking: i.blocking, inconsistent: i.inconsistent,
    commit: i.commit, branch: i.branch,
  });
/** A ticket child's spawn line (D26): no card, so no `cardHash`; kind `overseer` (a fixer: `implement`), `ticket` its role. */
export const ticketSpawnEvent = (i: { now: Date; taskId: string; role: TicketRole; member: string; tier: string; model: string; effort: ThinkingLevel; sessionId?: string; parentSessionId?: string; forced?: Forced }) =>
  finish({
    ...base("spawn", i.now, i.taskId), kind: i.role === "fixer" ? "implement" : "overseer", ticket: i.role,
    workerTier: i.tier, workerEffort: i.effort, workerMember: i.member, workerModel: i.model, sessionId: i.sessionId, parentSessionId: i.parentSessionId,
    ...(i.forced ? { forced: true, forceSource: i.forced.source, routedModel: i.forced.routedModel, routedEffort: i.forced.routedEffort } : {}),
  });
export type MergeOutcome = "merged" | "refused" | "revise" | "fixer" | "failed";
export type MergeInput = { branch: string; outcome: MergeOutcome; reason?: MergeReason; commit?: string; nLines?: number; nFiles?: number;
  reviewId?: string; pushed?: boolean;
  /** v2 (LOG-1): the target's tip before the merge, the branch merged into, the repository (a path: logged as its basename)
   *  and its root commit (12 hex); the node's size class and tiers. */
  base?: string; target?: string; repo?: string; repoId?: string; class?: string; tier?: string; actualTier?: string; node?: string };
/** One `request_merge` call (design §3.0.3): `taskId` is the branch; the fixed reason code, never the detail text. */
export const mergeEvent = (i: MergeInput & { now: Date }) =>
  finish({ ...base("merge", i.now, i.branch), outcome: i.outcome, reason: i.reason, commit: i.commit, nLines: i.nLines, nFiles: i.nFiles,
    reviewId: i.reviewId, pushed: i.pushed, base: i.base, target: i.target, repo: i.repo === undefined ? undefined : basename(i.repo),
    repoId: i.repoId, class: i.class, tier: i.tier, actualTier: i.actualTier, node: i.node });
/** Main moved outside the gate (design §3.4.6): `taskId` is the main branch, `from`/`to` its shas, `repo` the repository's
 *  basename, never a path (D35). */
export const gatebypassEvent = (i: { now: Date; branch: string; from: string; to: string; repo?: string }) =>
  finish({ ...base("gatebypass", i.now, i.branch), from: i.from, to: i.to, repo: i.repo === undefined ? undefined : basename(i.repo) });
export type PlanAction = "skeleton" | "approve" | "trigger" | "amend" | "reject";
export type PlanLogInput = { slug: string; action: PlanAction; trigger?: TriggerKind; nTasks?: number; reviewId?: string; full?: boolean };
/** A plan event (design §3.0.3): `taskId` is the plan's slug; the plan author's skeleton accepted, the plan committed, a replan
 *  trigger opened (its code), an amendment applied or rejected (`full`: by a plan-review); never the plan's text. */
export const planEvent = (i: PlanLogInput & { now: Date }) =>
  finish({ ...base("plan", i.now, i.slug), action: i.action, trigger: i.trigger, nTasks: i.nTasks, reviewId: i.reviewId, full: i.full });

/** The events v2 added (local-first spec §2.4, LOG-2); a consumer reads the event list from here. */
export const EVENTS_V2 = ["session", "profile"] as const;
/** The review line's `fallback` values. */
export const FALLBACKS = ["budget", "error"] as const;
export type Fallback = (typeof FALLBACKS)[number];
const PROFILES = ["cloud-first", "local-first", "local-mode"] as const;
const LOCAL_MEMBERS = ["on", "off"] as const;
const ROUTING_PROFILES = ["cloud-first", "local-first"] as const;
const PROFILE_BY = ["settings", "command"] as const;
/** Every v2 enumerated field's values, by `"<event>.<field>"` (LOG-4); the lists only grow. */
export const ENUMS_V2: Readonly<Record<string, readonly (string | number)[]>> = {
  "session.profile": PROFILES,
  "session.localMembers": LOCAL_MEMBERS,
  "profile.from": PROFILES,
  "profile.to": ROUTING_PROFILES,
  "profile.by": PROFILE_BY,
};
export type SessionInput = { now: Date; sessionId: string; profile: (typeof PROFILES)[number]; mainModel: string; startSet: boolean;
  localMembers?: (typeof LOCAL_MEMBERS)[number]; routerVersion: string };
/** A session's start (MEAS-1): `taskId` is the session id; the profile, the main's model, whether a start set was
 *  configured, the router's version; `localMembers` (E0's arm): `off` = the router routed no spawn of the session to a local
 *  member (forced spawns excluded), `on` = it may; absent = the session is outside E0 (routing off, or no cloud member). */
export const sessionEvent = (i: SessionInput) =>
  finish({ ...base("session", i.now, i.sessionId), profile: i.profile, mainModel: i.mainModel, startSet: i.startSet,
    localMembers: i.localMembers, routerVersion: i.routerVersion });

export type ProfileInput = { now: Date; sessionId: string; from: (typeof PROFILES)[number]; to: (typeof ROUTING_PROFILES)[number];
  by: (typeof PROFILE_BY)[number] };
/** A routing-profile switch (PRO-2, spec §2.4): `taskId` is the session id; `from` may be the legacy local mode. */
export const profileEvent = (i: ProfileInput) =>
  finish({ ...base("profile", i.now, i.sessionId), from: i.from, to: i.to, by: i.by });

export const serializeEvent = (e: OutcomeEvent): string => `${JSON.stringify(e)}\n`;

/** <agentDir>/task-router/outcomes/YYYY-MM.jsonl by UTC month; an absolute `dir` is used as is. */
export function outcomeFile(agentDir: string, now: Date, dir = "task-router/outcomes"): string {
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return join(isAbsolute(dir) ? dir : join(agentDir, dir), `${now.getUTCFullYear()}-${m}.jsonl`);
}
