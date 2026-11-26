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
  const off = parseSettings({ experiments: { cloudOnlyShare: 0 } });
  assert.deepEqual([off.settings.experiments.cloudOnlyShare, off.problems], [0, []]);
});
