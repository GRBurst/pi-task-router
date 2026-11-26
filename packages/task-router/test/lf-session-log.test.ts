// Local-first plan LF1.T5 (spec §2.4, MEAS-1): a `session` line at every legacy local-mode (later: local-first)
// session_start, and at a cloud-first one while E0 runs (`experiments.cloudOnlyShare > 0`); none with the share at 0 (G7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { harness } from "./harness.ts";

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
