// T8.5 (R10): routing / verifyGate / autoEscalate / freshOnCold are switches; the cases set them through the router's
// settings (local-first LF1.T1b: the router stops reading `__piExperimentsApi_v1`, NR-3; owner decision 2026-11-16).
import { test } from "node:test";
import assert from "node:assert/strict";
import { withFlags } from "../core/flags.ts";
import { defaults } from "../core/settings.ts";
import { accepted, card, harness } from "./harness.ts";

const settle = () => new Promise((r) => setImmediate(r));

test("withFlags: live view over the settings; the own setting is the default; other keys untouched", () => {
  const s = defaults();
  let flags: Record<string, string> = {};
  const v = withFlags(s, (n, d) => flags[n] ?? d);
  assert.deepEqual([v.routing, v.verifyGate, v.autoEscalate, v.freshOnCold], [true, true, true, s.freshOnCold]);
  flags = { routing: "off", verifyGate: "off", autoEscalate: "off", freshOnCold: "off" };
  assert.deepEqual([v.routing, v.verifyGate, v.autoEscalate], [false, false, false]);
  assert.deepEqual(v.freshOnCold, { ...s.freshOnCold, mode: "off" });
  assert.deepEqual(v.models, s.models);
  flags = { routing: "on" };
  assert.equal(withFlags({ ...s, routing: false }, (n, d) => flags[n] ?? d).routing, true);
});

test("withFlags passes importanceTable through", () => {
  const s = defaults();
  const v = withFlags(s, (_n, d) => d);
  assert.deepEqual(v.importanceTable, s.importanceTable);
  assert.equal(v.readOnlyReview, s.readOnlyReview);
  assert.equal(v.contextFit, s.contextFit);
});

test("routing flag off → no task_cards section", () => {
  const h = harness({ settings: { routing: false } });
  const options = { sections: {} as Record<string, string>, skills: [] };
  h.f.fire("session_start", {}, { sessionManager: { getSessionId: () => "s-main" } });
  h.f.fire("before_agent_start", { systemPromptOptions: options }, {});
  assert.equal(options.sections.task_cards, undefined);
});

test("autoEscalate flag off → no failover (on: failover runs)", async () => {
  for (const off of [false, true]) {
    const h = harness({ settings: { autoEscalate: !off } });
    accepted(await h.a.spawn({ name: "q1", task: card() }));
    h.a.emit({ type: "error", name: "q1", reason: "x", ts: 1 });
    await settle();
    assert.equal(h.a.retunes.length === 0, off);
  }
});

test("verifyGate flag off → the check does not run", async () => {
  const runs: string[] = [];
  const h = harness({ settings: { verifyGate: false }, extra: { run: async (cmd: string) => (runs.push(cmd), { exit: 0, output: "", timedOut: false }) } as any });
  accepted(await h.a.spawn({ name: "q1", task: card({ check: "npm test" }) }));
  h.a.agents.splice(0, h.a.agents.length, { name: "q1", parent: "main", sessionId: "q1", model: "x", thinkingLevel: "xhigh", state: "idle" } as any);
  h.a.emit({ type: "route", from: "q1", to: "main", preview: "done", buffered: false, ts: 1 });
  await settle(); await settle();
  assert.deepEqual(runs, []);
});

test("freshOnCold flag off → a send to a cold, big child is untouched", () => {
  for (const off of [false, true]) {
    const h = harness({ settings: { freshOnCold: { mode: off ? "off" : "advise", minTokens: 150000 } } });
    h.a.agents.push({ name: "w1", parent: "main", sessionId: "w1", model: "m", thinkingLevel: "high", state: "idle", lastRequestAt: h.clock.t - 600_000, contextTokens: 180_000 } as any);
    h.f.fire("tool_call", { toolName: "send_message", toolCallId: "t", input: { to: ["w1"], content: "x" } }, {});
    const r = h.f.fire("tool_result", { toolName: "send_message", toolCallId: "t", content: [{ type: "text", text: "sent" }] }, {})[0] as any;
    assert.equal(r === undefined, off);
  }
});
