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

// LF2 review minor 1: a key that names an Object.prototype member is no factor id: a problem, never a throw, and the
// file's other settings stay (the whole file is not dropped to defaults).
test("factor ids are own keys", () => {
  for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    const raw = JSON.parse(`{"experiments":{"seed":"s","factors":{"${id}":{"weights":[1]},"E2":{"enabled":true}}}}`);
    let r: ReturnType<typeof parseSettings> | undefined;
    assert.doesNotThrow(() => { r = parseSettings(raw, "0.8.0"); }, id);
    assert.deepEqual(r!.problems, [`experiments.factors.${id}: unknown factor; ignored`], id);
    assert.deepEqual(r!.settings.experiments, { seed: "s", cloudOnlyShare: 0.1, factors: { E2: { enabled: true } } }, id);
  }
});

// LF3.T2 (spec §2.1, PRO-1, D82): the routing profile `profile` beside the card-kind `profiles`; `profile` wins over the
// legacy `mode` when both are set, `mode: "local"` alone keeps the legacy local mode (until RET-1). An invalid value is a
// problem and the key is dropped (the effective profile then follows `mode`, cloud-first by default).
const OPEN = "0.5.0", PREVIEW = "0.4.0"; // the router's version is a parameter, so the cases survive releases
const XP = { localFirst: { experimental: true } };
test("PRO-1", () => {
  const p = (raw: Record<string, unknown>, version = OPEN) => {
    const r = parseSettings(raw, version);
    return { profile: r.settings.profile, mode: r.settings.mode, problems: r.problems };
  };
  assert.deepEqual(p({}), { profile: undefined, mode: "default", problems: [] }, "no profile: cloud-first by default");
  assert.deepEqual(p({ profile: "cloud-first" }), { profile: "cloud-first", mode: "default", problems: [] });
  assert.deepEqual(p({ profile: "local-first", ...XP }, PREVIEW), { profile: "local-first", mode: "default", problems: [] });
  assert.deepEqual(p({ profile: "local-first" }), { profile: "local-first", mode: "default", problems: [] }, "from 0.5.0 no gate");
  for (const bad of ["local", "", 1, true, null, []]) {
    const r = p({ profile: bad }, PREVIEW);
    assert.deepEqual([r.profile, r.mode], [undefined, "default"], JSON.stringify(bad));
    assert.deepEqual(r.problems, ['profile: must be "cloud-first" or "local-first"; default kept'], JSON.stringify(bad));
  }
  // a card-kind profile in the wrong key
  assert.deepEqual(p({ profile: { tools: "all" } }), { profile: undefined, mode: "default",
    problems: ["profile takes cloud-first | local-first; card-kind profiles go under profiles.<kind>"] });
  // both set: profile wins; mode alone: the legacy local mode, unchanged
  assert.deepEqual(p({ profile: "cloud-first", mode: "local" }), { profile: "cloud-first", mode: "default", problems: [] });
  assert.deepEqual(p({ profile: "local-first", mode: "local" }), { profile: "local-first", mode: "default", problems: [] });
  assert.deepEqual(p({ mode: "local" }), { profile: undefined, mode: "local", problems: [] });
  assert.deepEqual(p({ mode: "local", profile: 5 }, PREVIEW).mode, "local", "an invalid profile does not override mode");
});

// LF3.T2 (spec §2.1): the `localFirst` keys and their defaults, one nested object; `experimental` false (D81).
test("localFirst defaults", () => {
  const LF = {
    experimental: false, startMember: "qwen-local", tiers: { small: 60, standard: 150, large: 300 }, tree: { maxDepth: 3, maxChildren: 5, planLines: 150 },
    reviewers: { haiku: "haiku", sonnet: "sonnet", opus: "opus", local: "qwen-local" }, spotCheckShare: 0.1,
    context: { childSoftTokens: 65536, mainSoftTokens: 98304, mainFoldTokens: 204800, uncachedBreakerTokens: 65536 },
    breakers: { sameTest: 3, diffApply: 2, verify: 2, turns: 12 }, localQueue: { enabled: true, affinitySec: 10, mainHoldSec: 600, hookTimeoutSec: 600 },
    policyFile: ".pi/task-router-policy.json", e17ShadowShare: 0.5, quotaFallback: { maxCloud: 2, q5hOpenEnded: 0.8 }, overCapBytes: 60000,
  };
  assert.deepEqual(parseSettings({}).settings.localFirst, LF);
  // breakers.turns defaults to plans.taskTurns; its own value wins
  assert.equal(parseSettings({ plans: { taskTurns: 20 } }).settings.localFirst.breakers.turns, 20);
  assert.equal(parseSettings({ plans: { taskTurns: 20 }, localFirst: { breakers: { turns: 7 } } }).settings.localFirst.breakers.turns, 7);
  assert.deepEqual(parseSettings({ localFirst: { experimental: true, tree: { maxDepth: 2 } } }).settings.localFirst.tree, { maxDepth: 2, maxChildren: 5, planLines: 150 });
});

// LF3.T2 (spec PRO-9 a, D81): before 0.5.0 local-first needs `localFirst.experimental: true`; without it the settings'
// profile is a problem and the session is cloud-first.
test("PRO-9", () => {
  const gated = parseSettings({ profile: "local-first" }, PREVIEW);
  assert.deepEqual(gated.problems, ["profile local-first is experimental before 0.5.0; set localFirst.experimental"]);
  assert.equal(gated.settings.profile, "cloud-first");
  assert.equal(parseSettings({ profile: "local-first", localFirst: { experimental: false } }, "0.4.9").settings.profile, "cloud-first");
  assert.equal(parseSettings({ profile: "local-first", localFirst: { experimental: "yes" } }, PREVIEW).settings.profile, "cloud-first");
  assert.equal(parseSettings({ profile: "local-first", ...XP }, "0.3.0").settings.profile, "local-first");
  assert.equal(parseSettings({ profile: "local-first" }, "").settings.profile, "cloud-first", "an unreadable version stays gated");
});
