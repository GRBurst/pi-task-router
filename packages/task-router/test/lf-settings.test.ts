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

// LF2.T4 (spec §2.1, §2.8): `experiments.factors.<id>` = {enabled?, weights?}, checked against the registry; a factor is
// available from its `from` release (the router's version is a parameter, so the cases survive releases).
test("factor keys", () => {
  const ok = parseSettings({ experiments: { factors: { E2: { enabled: true, weights: [1, 1, 1] }, E3: { weights: [0, 1] } } } }, "0.4.0");
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.settings.experiments.factors, { E2: { enabled: true, weights: [1, 1, 1] }, E3: { weights: [0, 1] } });
  const one = (factors: unknown, version = "0.8.0") => {
    const r = parseSettings({ experiments: { factors } }, version);
    assert.equal(r.problems.length, 1, `${JSON.stringify(factors)}: ${JSON.stringify(r.problems)}`);
    assert.ok(r.problems[0]!.startsWith("experiments.factors"), r.problems[0]);
    return r;
  };
  assert.deepEqual(one({ E1: { enabled: true } }).settings.experiments.factors, {}, "an unknown id is dropped");
  assert.deepEqual(one({ E2: { enabled: true, weights: [1, 1] } }).settings.experiments.factors, { E2: { enabled: true } }, "a wrong weight count");
  assert.deepEqual(one({ E2: { enabled: true, weights: [1, -1, 1] } }).settings.experiments.factors, { E2: { enabled: true } }, "a negative weight");
  assert.deepEqual(one({ E2: { weights: [0, 0, 0] } }).settings.experiments.factors, { E2: {} }, "no positive weight");
  assert.deepEqual(one({ E2: { enabled: "yes" } }).settings.experiments.factors, { E2: {} }, "enabled not a boolean");
  assert.deepEqual(one({ E2: true }).settings.experiments.factors, {}, "not an object");
  assert.deepEqual(one({ E2: { enabled: true, weight: [1, 0, 0] } }).settings.experiments.factors, { E2: { enabled: true } }, "an unknown key");
  assert.deepEqual(one({ E0: { enabled: true } }).settings.experiments.factors, {}, "E0 runs by cloudOnlyShare");
  assert.deepEqual(one([]).settings.experiments.factors, {}, "factors not an object");
  // before its release a factor stays disabled, with the problem the spec names
  const early = one({ E2: { enabled: true, weights: [1, 1, 1] } }, "0.3.0");
  assert.equal(early.problems[0], "experiments.factors.E2 is available from 0.4.0");
  assert.deepEqual(early.settings.experiments.factors, { E2: { enabled: false, weights: [1, 1, 1] } });
  assert.deepEqual(parseSettings({ experiments: { factors: { E2: { enabled: true } } } }, "0.10.0").problems, [], "a numeric compare");
  assert.deepEqual(parseSettings({ experiments: { factors: { E2: { enabled: false } } } }, "0.3.0").problems, [], "disabled is always fine");
});
