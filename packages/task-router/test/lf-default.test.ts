// Local-first plan LF1 (spec NR-2, NR-3): cloud-first stays as built. `v1Session` is one default-mode session that writes
// a line of every event the router logs: the routed path (spawn, verdict, spot check, an unjudged kill) through the shell,
// the rest through the router's log. Its v1 lines are captured in fixtures/v1-lines.jsonl (LF1.T1a), before the v2 bump.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { defaults } from "../core/settings.ts";
import { accepted, card, harness } from "./harness.ts";

const FIXTURE = new URL("./fixtures/v1-lines.jsonl", import.meta.url);
const fixture = (): Record<string, unknown>[] =>
  readFileSync(FIXTURE, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
/** The events the capture covers: every builder of core/outcome.ts in v1. */
const EVENTS = ["check", "corrective", "escalate", "force", "gatebypass", "hint", "merge", "plan", "reroute", "review", "spawn", "spotcheck", "verdict"];
/** The experiments package's arm id in v1 (the router read it from `__piExperimentsApi_v1.armFor`). */
const ARM = "+-+--";
/** A fixture line as the router writes it now: no experiments read (NR-3), so no `arm`; a routed spawn line also names the as-used
 *  plan's member (R3A.T3): the fixture's q1 is planned on the local member and it is up, q2 on a cloud member. */
const CF: Record<string, Record<string, unknown>> = { q1: { planned: "qwen-local", localUp: true, triggered: true }, q2: { planned: "sonnet", triggered: false } };
const now = (l: Record<string, unknown>): Record<string, unknown> => {
  const { arm: _arm, ...rest } = l;
  return l.event === "spawn" && typeof l.taskId === "string" && l.taskId in CF ? { ...rest, ...CF[l.taskId] } : rest;
};

/** The v1 session; the experiments stub stays in place: the router no longer reads it (NR-3, LF1.T1). */
export async function v1Session(share?: number): Promise<Record<string, unknown>[]> {
  const g = globalThis as { __piExperimentsApi_v1?: unknown };
  g.__piExperimentsApi_v1 = { version: 1, flag: (_n: string, d: string) => d, armFor: (s: string) => (s === "s-main" ? { id: ARM } : undefined) };
  try {
    const h = harness({ settings: { spotCheck: { enabled: true, share: 1 }, ...(share === undefined ? {} : { experiments: { cloudOnlyShare: share } }) } as never, extra: { rng: () => 0 } });
    h.f.fire("session_start", {}, share === undefined ? {} : { sessionManager: { getSessionId: () => "s-main" }, model: { provider: "anthropic", id: "claude-opus-5-5" } });
    accepted(await h.a.spawn({ name: "q1", task: card() }));
    h.a.emit({ type: "spawn", name: "q1", by: "main", parent: "main", childSessionId: "s-q1", ts: 1 });
    await h.f.callTool("task_verdict", { name: "q1", verdict: "accepted", note: "fine" }); // verdict + spotcheck
    accepted(await h.a.spawn({ name: "q2", task: card({ kind: "lookup" }) }));
    h.a.emit({ type: "spawn", name: "q2", by: "main", parent: "main", childSessionId: "s-q2", ts: 2 });
    h.a.emit({ type: "kill", name: "q2", ts: 3 }); // unjudged
    const log = h.router.log;
    log.reroute("q1", "local", "cloud", "health", "local/qwen", "anthropic/sonnet");
    log.check("q1", 1, 1200);
    log.corrective("q1");
    log.escalate("q1", "local", "cloud", "q0", { fromModel: "local/qwen", toModel: "anthropic/sonnet", ability: "code", fromLevel: 1, toLevel: 2 });
    log.force({ action: "set", source: "command", model: "anthropic/opus", effort: "high" });
    log.hint("main", "identical-call", "hint", 2, "s-main");
    log.review({ reviewId: "r1", role: "merge", member: "sonnet", model: "anthropic/sonnet", outcome: "approve", attempt: 1, durationMs: 900, findings: 1, blocking: 0, commit: "abc123", branch: "b1" });
    log.ticketSpawn({ taskId: "r1-c", role: "merge", member: "sonnet", tier: "sonnet", model: "anthropic/sonnet", effort: "high", sessionId: "s-r1", parentSessionId: "s-main" });
    log.merge({ branch: "b1", outcome: "merged", commit: "abc123", nLines: 40, nFiles: 2, reviewId: "r1", pushed: true });
    log.gatebypass({ branch: "main", from: "abc123", to: "def456", repo: "/work/repo" });
    log.plan({ slug: "p1", action: "approve", nTasks: 3, reviewId: "r2", full: true });
    return h.lines();
  } finally {
    delete g.__piExperimentsApi_v1;
  }
}

test("NR-2 v1 capture", async () => {
  const want = fixture();
  assert.ok(want.length > 0, "the v1 fixture is empty");
  assert.ok(want.every((l) => l.v === 1), "the fixture holds v1 lines only");
  assert.deepEqual([...new Set(want.map((l) => l.event))].sort(), EVENTS);
  assert.ok(want.some((l) => l.event === "spawn" && l.arm === ARM), "a v1 spawn line carries the experiments arm");
});

test("NR-2 cloud-first lines", async () => {
  // v2 (RND-8): the same lines, with `v: 2` and without the retired `arm`.
  assert.deepEqual(await v1Session(), fixture().map((l) => ({ ...now(l), v: 2 })));
});

test("NR-2 the session line is the only new line, at the real default share", async () => {
  const share = defaults().experiments.cloudOnlyShare;
  assert.equal(share, 0.1);
  const version: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  // draw("task-router", "E0", "s-main") ≈ 0.09 < 0.9: the session is drawn as-used, so every spawn is placed as before
  const session = { v: 2, ts: "2026-10-02T12:00:00.000Z", event: "session", taskId: "s-main", profile: "cloud-first",
    mainModel: "anthropic/claude-opus-5-5", startSet: false, localMembers: "on", cloudOnlyShare: share, routerVersion: version, arms: ["E0=as-used"] }; // E0's arm (LF2.T7), its share (R3A.T1)
  assert.deepEqual(await v1Session(share), [session, ...fixture().map((l) => ({ ...now(l), v: 2 }))]);
});

/** Source text without comments (a comment may name what the router no longer reads). */
const code = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const sources = (dir: URL): URL[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(new URL(`${e.name}/`, dir)) : e.name.endsWith(".ts") ? [new URL(e.name, dir)] : []);

test("NR-3 no experiments read", () => {
  const files = [...sources(new URL("../core/", import.meta.url)), new URL("../index.ts", import.meta.url)];
  assert.ok(files.length > 50, "the scan sees the sources");
  const hits = files.filter((f) => /__piExperimentsApi_v1|ExperimentsApi/.test(code(readFileSync(f, "utf8"))));
  assert.deepEqual(hits.map((f) => f.pathname.replace(/^.*\/task-router\//, "")), []);
});
