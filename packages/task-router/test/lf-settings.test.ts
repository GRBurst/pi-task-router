// Local-first plan LF1.T4 (spec §2.1): the `experiments` settings. E0 runs from the first release (D64: cloudOnlyShare 0.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSettings } from "../core/settings.ts";

test("experiments keys", () => {
  const set = parseSettings({ experiments: { seed: "s", cloudOnlyShare: 0.2 } });
  assert.deepEqual(set.problems, []);
  assert.deepEqual(set.settings.experiments, { seed: "s", cloudOnlyShare: 0.2, factors: {} });
  assert.deepEqual(parseSettings({}).settings.experiments, { seed: "task-router", cloudOnlyShare: 0.1, factors: {} });
  for (const bad of [2, -0.1, "0.5"]) {
    const r = parseSettings({ experiments: { cloudOnlyShare: bad } });
    assert.equal(r.settings.experiments.cloudOnlyShare, 0.1, String(bad));
    assert.equal(r.problems.length, 1, JSON.stringify(r.problems));
  }
  // a value of the wrong type is a problem, never a crash at session_start (review LF1 m)
  const DEFAULT = { seed: "task-router", cloudOnlyShare: 0.1, factors: {} };
  for (const bad of [null, 5, "x", [], true]) {
    const r = parseSettings({ experiments: bad });
    assert.deepEqual(r.settings.experiments, DEFAULT, String(bad));
    assert.equal(r.problems.length, 1, JSON.stringify([bad, r.problems]));
    assert.ok(r.problems[0]!.startsWith("experiments: must be an object"), r.problems[0]);
  }
  for (const [k, bad] of [["seed", 5], ["seed", null], ["factors", null], ["factors", 5]] as const) {
    const r = parseSettings({ experiments: { [k]: bad } });
    assert.deepEqual(r.settings.experiments, DEFAULT, `${k} ${bad}`);
    assert.equal(r.problems.length, 1, JSON.stringify([k, bad, r.problems]));
    assert.ok(r.problems[0]!.startsWith(`experiments.${k}: `), r.problems[0]);
  }
  const off = parseSettings({ experiments: { cloudOnlyShare: 0 } });
  assert.deepEqual([off.settings.experiments.cloudOnlyShare, off.problems], [0, []]);
});
