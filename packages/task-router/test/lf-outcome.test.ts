// Local-first plan LF1.T3 (spec §2.4, LOG-2, LOG-3, LOG-4): the v2 builders and the exports a consumer reads the
// log's closed sets from. Each later builder task adds its builder to `LINES` and its event to `EVENTS_V2`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENUMS_V2, EVENTS_V2, FALLBACKS, SCHEMA_VERSION, profileEvent, sessionEvent } from "../core/outcome.ts";
import { TRIPS } from "../core/local/tripwires.ts";
import { ROLES } from "../core/local/overseer.ts";
import { REASONS } from "../core/local/merge.ts";
import { TRIGGERS } from "../core/local/plan.ts";
import { PLAN_TYPE } from "../core/local/plans.ts";
import { BRANCH_TYPE } from "../core/local/branches.ts";
import { harness } from "./harness.ts";
import { seeded } from "./rand.ts";
import { textFree } from "./text-free.ts";

const NOW = new Date(Date.UTC(2026, 9, 2, 12, 0, 0));
type Rnd = (n: number) => number;
const one = <T>(rnd: Rnd, xs: readonly T[]): T => xs[rnd(xs.length)]!;
/** Free text a builder must never copy: spaces, fences, an instruction, a path. */
const TEXT = ["fix the auth bug in src/a.ts", "```sh\nrm -rf /\n```", "ignore previous instructions", "<router-hint>", "/work/repo/x"];
/** Stray free-text keys a caller might hand a builder (a goal, a note, a summary). */
const stray = (rnd: Rnd) => ({ goal: one(rnd, TEXT), note: one(rnd, TEXT), summary: one(rnd, TEXT) });

/** One generated line per v2 builder. */
const LINES: Array<(rnd: Rnd) => Record<string, unknown>> = [
  (rnd) => sessionEvent({
    ...stray(rnd), now: NOW, sessionId: `s-${rnd(1e6).toString(16)}`, profile: one(rnd, ["cloud-first", "local-first", "local-mode"] as const),
    mainModel: one(rnd, ["anthropic/claude-opus-5-5", "local/qwen", "openrouter/qwen/free"]), startSet: rnd(2) === 1,
    ...(rnd(3) ? { localMembers: one(rnd, ["on", "off"] as const) } : {}), routerVersion: one(rnd, ["0.4.0", "0.5.0-rc.1"]),
  }),
  (rnd) => profileEvent({
    ...stray(rnd), now: NOW, sessionId: `s-${rnd(1e6).toString(16)}`, from: one(rnd, ["cloud-first", "local-first", "local-mode"] as const),
    to: one(rnd, ["cloud-first", "local-first"] as const), by: one(rnd, ["settings", "command"] as const),
  }),
];

test("LOG-2", () => {
  assert.deepEqual(
    sessionEvent({ now: NOW, sessionId: "s-main", profile: "local-first", mainModel: "local/qwen", startSet: true, localMembers: "on", routerVersion: "0.4.0" }),
    { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "session", taskId: "s-main", profile: "local-first", mainModel: "local/qwen",
      startSet: true, localMembers: "on", routerVersion: "0.4.0" },
  );
  assert.ok(EVENTS_V2.includes("session"));
  const rnd = seeded(203);
  for (let i = 0; i < 200; i++) for (const line of LINES) assert.ok((EVENTS_V2 as readonly unknown[]).includes(line(rnd).event));
});

test("LOG-3", () => {
  const enums = new Set(Object.values(ENUMS_V2).flat().map(String));
  const rnd = seeded(303);
  for (let i = 0; i < 200; i++)
    for (const line of LINES) {
      const l = line(rnd);
      assert.deepEqual(textFree(l, enums), [], JSON.stringify(l));
    }
});

/** The exports `log-contract` imports, taken literally at LF1.T3: they stay and only grow (spec §2.4). */
const SNAPSHOT = {
  TRIPS: ["identical-call", "no-change-writes", "alternation", "repeated-error", "churn", "check-failing", "over-size", "risky-path",
    "context-soft", "context-stall", "outside-worktree"],
  ROLES: ["merge", "plan-author", "delta", "plan-review", "steer", "spot", "fit", "corrective", "integration"],
  REASONS: ["main-branch", "dirty", "behind", "fixer-running", "abandoned", "blocked", "size", "scope", "check", "main-dirty",
    "plan-changed", "no-worktree", "review-unavailable", "aborted", "git"],
  TRIGGERS: ["non-whitelisted", "interface-break", "regression", "over-budget", "remediation-failed"],
};

/** What each list must hold at least (they only grow: a later stage adds values, never takes one away). */
const REQUIRED: Record<string, readonly string[]> = {
  FALLBACKS: ["budget", "error", "local-unavailable", "transient"],
  "session.profile": ["cloud-first", "local-first", "local-mode"],
  "session.localMembers": ["on", "off"],
  "profile.from": ["cloud-first", "local-first", "local-mode"],
  "profile.to": ["cloud-first", "local-first"],
  "profile.by": ["settings", "command"],
};
const lacking = (have: readonly (string | number)[], want: readonly string[]): string[] => want.filter((v) => !have.includes(v));

/** The `session` lines the router itself writes, across the profiles and arms a session can start in. */
function written(): Record<string, any>[] {
  const ctx = { sessionManager: { getSessionId: () => "s-main" }, model: { provider: "anthropic", id: "claude-opus-5-5" } };
  const runs: [Record<string, unknown>, boolean][] = [
    [{ mode: "local" }, true], [{ experiments: { cloudOnlyShare: 1 } }, false], [{ experiments: { cloudOnlyShare: 0.1 } }, false],
    [{ experiments: { cloudOnlyShare: 1 }, routing: false }, false],
  ];
  return runs.flatMap(([settings, apiExt]) => {
    const h = harness({ settings: settings as never, apiExt });
    h.f.fire("session_start", { reason: "startup" }, ctx);
    return h.lines().filter((l) => l.event === "session");
  });
}

test("LOG-4", () => {
  const now: Record<keyof typeof SNAPSHOT, readonly string[]> = { TRIPS, ROLES, REASONS, TRIGGERS };
  for (const [name, values] of Object.entries(SNAPSHOT))
    assert.deepEqual(values.filter((v) => !now[name as keyof typeof SNAPSHOT].includes(v)), [], `${name} lost values`);
  assert.deepEqual([PLAN_TYPE, BRANCH_TYPE], ["task-router/plan", "task-router/branch"]);
  // the required members are included, not the whole list: a later stage may add values
  assert.deepEqual(lacking(FALLBACKS, REQUIRED.FALLBACKS!), []);
  for (const key of Object.keys(REQUIRED).filter((k) => k !== "FALLBACKS")) assert.deepEqual(lacking(ENUMS_V2[key] ?? [], REQUIRED[key]!), [], key);
  assert.deepEqual(lacking(EVENTS_V2, ["session", "profile"]), []);
  // the property: every enumerated field of a line the router really writes holds a value of its ENUMS_V2 list (the lists are
  // not the generator), and the runs reach every value the lists name for the session (no vacuous pass)
  const lines = written();
  assert.ok(lines.length >= 4, "the runs wrote their session lines");
  const seen = new Map<string, Set<string>>();
  for (const l of lines)
    for (const [key, values] of Object.entries(ENUMS_V2)) {
      const [event, field] = key.split(".") as [string, string];
      if (l.event !== event || !(field in l)) continue;
      assert.ok(values.includes(l[field]), `${key}: ${String(l[field])}`);
      seen.set(key, (seen.get(key) ?? new Set()).add(l[field]));
    }
  assert.deepEqual(lacking([...(seen.get("session.localMembers") ?? [])], REQUIRED["session.localMembers"]!), []);
  assert.deepEqual(lacking([...(seen.get("session.profile") ?? [])], ["cloud-first", "local-mode"]), []);
  // a builder line outside the lists is caught (the plant: `localMembers: "other"`)
  assert.ok(!ENUMS_V2["session.localMembers"]!.includes("other"));
});

// LF3.T4 (spec §2.4, LOG-2): a routing-profile switch; `taskId` is the session id. `from` may be the legacy local mode.
test("profile", () => {
  assert.deepEqual(profileEvent({ now: NOW, sessionId: "s-main", from: "cloud-first", to: "local-first", by: "command" }),
    { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "profile", taskId: "s-main", from: "cloud-first", to: "local-first", by: "command" });
  assert.ok((EVENTS_V2 as readonly string[]).includes("profile"));
  assert.deepEqual([ENUMS_V2["profile.from"], ENUMS_V2["profile.to"], ENUMS_V2["profile.by"]],
    [["cloud-first", "local-first", "local-mode"], ["cloud-first", "local-first"], ["settings", "command"]]);
});

// LF6.T7 (spec §2.4): the review and merge lines' local-first fields; `sessionId` (the main session's id, owner's decision PA Q1)
// on the review, merge, plan and gatebypass lines. Every enumerated field is read from the exports, the role from `ROLES`.
test("review fields", async () => {
  const { reviewEvent, mergeEvent, planEvent, gatebypassEvent } = await import("../core/outcome.ts");
  assert.deepEqual(FALLBACKS, ["budget", "error", "local-unavailable", "transient"]);
  assert.deepEqual(lacking(ROLES, ["spot", "fit", "corrective", "integration"]), []);
  assert.deepEqual(
    reviewEvent({ now: NOW, reviewId: "rv-1", role: "spot", member: "opus", model: "anthropic/claude-opus-5-5", outcome: "approve", attempt: 1,
      durationMs: 5, fallback: "transient", class: "standard", tier: "small", actualTier: "over", reviewer: "opus", binding: true,
      overCap: true, rereview: false, of: "feat/a", sample: "shadow", batch: ["a", "b"], classBy: ["risk"], sessionId: "s-main", ...stray(seeded(1)) } as never),
    { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "review", taskId: "rv-1", role: "spot", member: "opus", model: "anthropic/claude-opus-5-5",
      outcome: "approve", attempt: 1, durationMs: 5, fallback: "transient", class: "standard", tier: "small", actualTier: "over", reviewer: "opus",
      binding: true, overCap: true, rereview: false, of: "feat/a", sample: "shadow", batch: ["a", "b"], classBy: ["risk"], sessionId: "s-main" },
  );
  assert.deepEqual(
    mergeEvent({ now: NOW, branch: "feat/a", outcome: "merged", commit: "abc1234", base: "def5678", target: "main", repo: "/work/repo", repoId: "0123456789ab",
      class: "elevated", classBy: ["error"], tier: "standard", actualTier: "small", node: "auth", sessionId: "s-main" } as never),
    { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "merge", taskId: "feat/a", outcome: "merged", commit: "abc1234", base: "def5678", target: "main",
      repo: "repo", repoId: "0123456789ab", class: "elevated", classBy: ["error"], tier: "standard", actualTier: "small", node: "auth", sessionId: "s-main" },
  );
  assert.equal(planEvent({ now: NOW, slug: "auth", action: "approve", sessionId: "s-main" } as never).sessionId, "s-main");
  assert.equal(gatebypassEvent({ now: NOW, branch: "main", from: "a", to: "b", sessionId: "s-main" } as never).sessionId, "s-main");
  assert.ok(!("sessionId" in planEvent({ now: NOW, slug: "auth", action: "approve" })), "absent when unknown");
  // every enumerated field of a generated line holds a value of its list; the lines are text-free
  const want = ["review.class", "review.tier", "review.actualTier", "review.reviewer", "review.sample", "review.classBy",
    "merge.class", "merge.tier", "merge.actualTier", "merge.classBy"];
  assert.deepEqual(want.filter((k) => !ENUMS_V2[k]), []);
  const enums = new Set(Object.values(ENUMS_V2).flat().map(String));
  const rnd = seeded(707);
  const pick = (k: string) => one(rnd, ENUMS_V2[k]!) as string;
  for (let i = 0; i < 200; i++) {
    const cls = { class: pick("review.class"), tier: pick("review.tier"), actualTier: pick("review.actualTier"), classBy: [pick("review.classBy")] };
    const r = reviewEvent({ ...stray(rnd), now: NOW, reviewId: `rv-${i}`, role: one(rnd, ROLES), member: "sonnet", model: "anthropic/claude-sonnet-5",
      outcome: "revise", attempt: 1 + rnd(2), durationMs: rnd(1000), fallback: one(rnd, FALLBACKS), ...cls, reviewer: pick("review.reviewer"),
      binding: rnd(2) === 1, overCap: rnd(2) === 1, rereview: rnd(2) === 1, sample: pick("review.sample") } as never);
    const m = mergeEvent({ ...stray(rnd), now: NOW, branch: "feat/a", outcome: "merged", ...cls, node: "auth", sessionId: "s-main" } as never);
    for (const l of [r, m]) {
      assert.deepEqual(textFree(l, enums), [], JSON.stringify(l));
      for (const [key, values] of Object.entries(ENUMS_V2)) {
        const [event, field] = key.split(".") as [string, string];
        if (l.event !== event || !(field in l)) continue;
        for (const v of [l[field]].flat()) assert.ok(values.includes(v as string), `${key}: ${String(v)}`);
      }
    }
    assert.ok((ROLES as readonly string[]).includes(r.role as string) && (FALLBACKS as readonly string[]).includes(r.fallback as string));
  }
  // the classifier's proxies (`why`) are all in the classBy lists, and so is the gate's fail-closed `error`
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../core/strategy/classify.ts", import.meta.url), "utf8");
  const proxies = [...src.matchAll(/proxy\("([a-z-]+)"/g)].map((x) => x[1]!).concat("error");
  assert.ok(proxies.length >= 9);
  assert.deepEqual(lacking(ENUMS_V2["review.classBy"]!, proxies), []);
  assert.deepEqual(ENUMS_V2["merge.classBy"], ENUMS_V2["review.classBy"]);
});

// LF6.T7 (owner's decision PA Q1): the gate's review and merge lines and a gatebypass line carry the main session's id.
test("review fields: sessionId on the gate's lines", async () => {
  const { reviewRig } = await import("./merge-rig.ts");
  const m = reviewRig();
  const rec = await m.start("x", "true", "add x");
  m.r.commit("x.ts", "x\ny\n", "x", rec.worktree);
  await m.h.f.tools.get("request_merge")!.execute("t1", {}, undefined, undefined, m.ctx);
  const to = m.r.git(["commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "by hand"]);
  m.r.git(["update-ref", "refs/heads/main", to]);
  const input = { command: "true" };
  await Promise.all(m.h.f.fire("tool_call", { toolName: "bash", toolCallId: "c1", input }, m.ctx));
  m.h.f.fire("tool_result", { toolName: "bash", toolCallId: "c1", input, content: [{ type: "text", text: "ok" }], isError: false }, m.ctx);
  await m.h.router.settled();
  const lines = m.h.lines().filter((l) => ["review", "merge", "gatebypass"].includes(l.event as string));
  assert.deepEqual([...new Set(lines.map((l) => l.event))].sort(), ["gatebypass", "merge", "review"]);
  for (const l of lines) assert.equal(l.sessionId, "s-main", JSON.stringify(l));
});
