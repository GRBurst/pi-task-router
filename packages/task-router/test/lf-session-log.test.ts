// Local-first plan LF1.T5 (spec §2.4, MEAS-1): a `session` line at every legacy local-mode (later: local-first)
// session_start, and at a cloud-first one while E0 runs (`experiments.cloudOnlyShare > 0`); none with the share at 0 (G7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, harness } from "./harness.ts";

const VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const CTX = { sessionManager: { getSessionId: () => "s-main" }, model: { provider: "anthropic", id: "claude-opus-5-5" } };

const sessions = (settings: Record<string, unknown>, apiExt = false) => {
  const h = harness({ settings: settings as never, apiExt });
  h.f.fire("session_start", { reason: "startup" }, CTX);
  return h.lines().filter((l) => l.event === "session");
};

test("MEAS-1", () => {
  const want = (profile: string) => [{ v: 2, ts: "2026-10-02T12:00:00.000Z", event: "session", taskId: "s-main", profile,
    mainModel: "anthropic/claude-opus-5-5", startSet: false, localMembers: "on", routerVersion: VERSION }];
  assert.match(VERSION, /^\d+\.\d+\.\d+/);
  // legacy local mode: always, whatever the share
  assert.deepEqual(sessions({ mode: "local" }, true), want("local-mode"));
  // cloud-first: only while E0 runs (D64's default share 0.1)
  assert.deepEqual(sessions({ experiments: { cloudOnlyShare: 0 } }), []);
  assert.deepEqual(sessions({ experiments: { cloudOnlyShare: 0.1 } }), want("cloud-first"));
});

// ---- LF1 review: who writes a session line, and when ----
const ctxOf = (id: string) => ({ sessionManager: { getSessionId: () => id }, model: { provider: "anthropic", id: "claude-opus-5-5" } });
const E0_ALL = { experiments: { cloudOnlyShare: 1 } };

test("MEAS-1 child: a child session that loads the router writes no line and draws nothing", async () => {
  const h = harness({ settings: E0_ALL as never });
  h.a.agents.push({ name: "c1", parent: "main", sessionId: "s-c1", model: "m", thinkingLevel: undefined, state: "running" });
  h.f.fire("session_start", { reason: "startup" }, ctxOf("s-c1"));
  assert.deepEqual(h.lines(), []);
  // the child is no E0 session: a card still lands on the local member (a drawn cloud-only arm would keep it off)
  assert.equal(((await h.a.spawn({ name: "c2", task: card() })) as any).model, "llama/qwen3.8");
  // the main in the same process is a session as usual
  h.f.fire("session_start", { reason: "startup" }, ctxOf("s-main"));
  assert.deepEqual(h.lines().map((l) => [l.event, l.taskId, l.localMembers]), [["session", "s-main", "off"]]);
});

test("MEAS-1 no session id: no line and no draw (an empty id would give every such session one arm)", async () => {
  const h = harness({ settings: E0_ALL as never });
  h.f.fire("session_start", { reason: "startup" }, {});
  assert.deepEqual(h.lines(), []);
  assert.equal(((await h.a.spawn({ name: "c1", task: card() })) as any).model, "llama/qwen3.8");
});

test("MEAS-1 no actor API: routing is off, so no draw and no localMembers", () => {
  const h = harness({ settings: E0_ALL as never, extra: { api: () => undefined } });
  h.f.fire("session_start", { reason: "startup" }, ctxOf("s-main"));
  assert.deepEqual(h.lines().map((l) => [l.event, "localMembers" in l]), [["session", false]]);
});

test("MEAS-1 resume: every session_start of a session writes a line; the draw is a function of the id, so the lines agree and the first one stands (outcome log, Session)", () => {
  const h = harness({ settings: { experiments: { cloudOnlyShare: 0.5 } } as never }); // a share that splits sessions: a redraw would show
  const reasons = ["startup", "reload", "resume", "resume", "reload", "resume", "resume", "reload", "resume", "resume"];
  for (const reason of reasons) h.f.fire("session_start", { reason }, ctxOf("s-main"));
  const lines = h.lines().filter((l) => l.event === "session");
  assert.equal(lines.length, reasons.length);
  assert.deepEqual([...new Set(lines.map((l) => JSON.stringify({ ...l, ts: undefined })))].length, 1);
});

test("settings: experiments null is a problem, not a crash at session_start", () => {
  const h = harness({ settings: { experiments: null } as never });
  h.f.fire("session_start", { reason: "startup" }, ctxOf("s-main"));
  assert.ok(h.f.tools.has("task_verdict"), "the rest of the handler ran");
  assert.equal(h.router.settings.experiments.cloudOnlyShare, 0.1);
});
