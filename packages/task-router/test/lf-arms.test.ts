// Local-first plan LF1.T8 (spec §6, D61, RND-2): the deterministic draw. A unit's level depends only on the seed, the
// factor's id and the unit, so a replay assigns the same arms; over many units the levels follow the weights.
// LF2 (spec §2.8, RND-1, RND-3, RND-4): the factor registry, the assignment and its independence across factors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { draw, pick } from "../core/strategy/draw.ts";
import { FACTORS, armsOf, assign } from "../core/strategy/arms.ts";
import type { ExperimentsSettings } from "../core/types.ts";
import { seeded } from "./rand.ts";

const word = (rnd: (n: number) => number): string => Array.from({ length: 1 + rnd(12) }, () => "ab-_0Z\u00e9 \u0000"[rnd(9)]).join("");

/** Known answers, computed outside the code under test: `printf '%s\0%s\0%s' seed id unit | sha256sum`, the first 16 hex digits
 *  as a 64-bit integer, shifted right by 11, over 2^53 (D61). They pin the hash input (separator, order, UTF-8) and the scale,
 *  so an arm drawn today is the arm a resumed session draws after an upgrade. */
const KNOWN: [string, string, string, number][] = [
  ["task-router", "E0", "s-main", 0.0924791663625033],
  ["task-router", "E0", "s-1", 0.31711324480614644],
  ["abc", "F1", "unit-7", 0.24065039388980214],
  ["se", "id", "\u00e9", 0.9017311676405272],
  ["", "", "", 0.5884184134528798],
];

test("RND-2 known answers", () => {
  for (const [s, id, unit, u] of KNOWN) assert.equal(draw(s, id, unit), u, JSON.stringify([s, id, unit]));
  // the E0 draw of the first session in the plan's examples is as-used at the default share
  assert.equal(pick(["as-used", "cloud-only"], [0.9, 0.1], draw("task-router", "E0", "s-main")), "as-used");
});

test("RND-2", () => {
  const rnd = seeded(802);
  for (let i = 0; i < 1000; i++) {
    const [s, id, unit] = [word(rnd), word(rnd), word(rnd)];
    const u = draw(s, id, unit);
    assert.ok(u >= 0 && u < 1, String(u));
    assert.equal(draw(s, id, unit), u, JSON.stringify([s, id, unit]));
  }
  const N = 20_000;
  for (const w of [[1, 1], [1, 1, 1], [9, 1]]) {
    const levels = w.map((_, i) => `L${i}`);
    const n = new Map<string, number>();
    for (let i = 0; i < N; i++) { const l = pick(levels, w, draw("task-router", "E0", `s-${i}`)); n.set(l, (n.get(l) ?? 0) + 1); }
    const sum = w.reduce((a, b) => a + b, 0);
    levels.forEach((l, i) => {
      const share = (n.get(l) ?? 0) / N;
      assert.ok(Math.abs(share - w[i]! / sum) <= 0.02, `${JSON.stringify(w)} ${l}: ${share}`);
    });
  }
  // pick at the edges: u below the first share → the first level; u near 1 → the last; a zero weight is never picked
  assert.deepEqual([pick(["a", "b"], [1, 1], 0), pick(["a", "b"], [1, 1], 0.999999), pick(["a", "b"], [0, 1], 0)], ["a", "b", "b"]);
});

// Spec §2.8, literally: id, unit, levels (the default first), from. Every factor ships disabled (D63).
const TABLE: [string, string, string[], string][] = [
  ["E0", "session", ["as-used", "cloud-only"], "0.3.0"],
  ["E2", "session", ["standard", "small", "large"], "0.4.0"],
  ["E3", "review", ["opus", "sonnet"], "0.4.0"],
  ["E12", "child", ["xhigh", "medium"], "0.5.0"],
  ["E13", "child", ["unbounded", "16k", "32k"], "0.5.0"],
  ["E4", "session", ["off", "on"], "0.6.0"],
  ["E5", "session", ["150", "300"], "0.6.0"],
  ["E6", "request", ["recursive", "flat"], "0.7.0"],
  ["E7", "request", ["on", "off"], "0.7.0"],
  ["E8", "node", ["on", "off"], "0.7.0"],
  ["E9", "request", ["on", "off"], "0.7.0"],
  ["E10", "package", ["2", "1"], "0.7.0"],
  ["E11", "ladder", ["corrective-handoff", "corrective", "steer"], "0.8.0"],
  ["E14c", "session", ["64k", "32k"], "0.8.0"],
  ["E14m", "session", ["96k", "64k"], "0.8.0"],
  ["E14f", "session", ["200k", "150k"], "0.8.0"],
  ["E14b", "session", ["64k", "32k"], "0.8.0"],
  ["E15", "session", ["5x150", "3x80"], "0.8.0"],
  ["E16", "request", ["local", "opus"], "0.8.0"],
  ["E17", "review", ["cloud", "qwen"], "0.8.0"],
  ["E18", "child", ["full", "lean"], "0.8.0"],
];

test("RND-1", () => {
  const strip = Object.fromEntries(Object.entries(FACTORS).map(([k, f]) => [k, { id: f.id, unit: f.unit, levels: f.levels, from: f.from, enabled: f.enabled }]));
  assert.deepEqual(strip, Object.fromEntries(TABLE.map(([id, unit, levels, from]) => [id, { id, unit, levels, from, enabled: false }])));
  // the code default weights: one non-negative weight per level, not all zero (an enabled factor without weights draws by them)
  for (const f of Object.values(FACTORS)) {
    assert.equal(f.weights.length, f.levels.length, f.id);
    assert.ok(f.weights.every((w) => w >= 0) && f.weights.some((w) => w > 0), f.id);
  }
});

test("RND-4", () => {
  const off: ExperimentsSettings = { seed: "task-router", cloudOnlyShare: 0, factors: {} };
  const on: ExperimentsSettings = { ...off, factors: { E2: { enabled: true, weights: [0, 1, 0] } } };
  const units = Array.from({ length: 300 }, (_, i) => `s-${i}`);
  // disabled (the code default, or switched off with weights) → the first level for every unit, and in no unit's arms
  for (const x of [off, { ...off, factors: { E2: { enabled: false, weights: [0, 1, 0] } } }])
    for (const f of Object.values(FACTORS)) for (const u of units.slice(0, 20)) assert.equal(assign(x, f.id, u), f.levels[0], `${f.id} ${u}`);
  for (const k of ["session", "review", "child", "request", "node", "package", "ladder"] as const) assert.deepEqual(armsOf(off, k, "u-1"), [], k);
  // enabled: weights from the settings, else the factor's (equal: every level drawn)
  assert.deepEqual(new Set(units.map((u) => assign(on, "E2", u))), new Set(["small"]));
  const eq = { ...off, factors: { E2: { enabled: true } } };
  assert.deepEqual(new Set(units.map((u) => assign(eq, "E2", u))), new Set(["standard", "small", "large"]));
  // a unit's arms: its kind's enabled factors, `id=level`, sorted
  const two: ExperimentsSettings = { ...off, factors: { E2: { enabled: true, weights: [0, 1, 0] }, E4: { enabled: true, weights: [0, 1] }, E3: { enabled: true } } };
  assert.deepEqual(armsOf(two, "session", "s-1"), ["E2=small", "E4=on"]);
  assert.deepEqual(armsOf(two, "review", "r-1"), [`E3=${assign(two, "E3", "r-1")}`]);
});

test("RND-3", () => {
  // two factors drawn for the same units: their joint frequencies are the product of their marginals (the id is in the hash)
  const x: ExperimentsSettings = { seed: "task-router", cloudOnlyShare: 0, factors: { E2: { enabled: true, weights: [1, 1, 1] }, E4: { enabled: true, weights: [1, 1] } } };
  const N = 20_000, joint = new Map<string, number>(), a = new Map<string, number>(), b = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (let i = 0; i < N; i++) {
    const [l2, l4] = [assign(x, "E2", `s-${i}`), assign(x, "E4", `s-${i}`)];
    bump(a, l2); bump(b, l4); bump(joint, `${l2}|${l4}`);
  }
  for (const l2 of FACTORS.E2.levels) for (const l4 of FACTORS.E4.levels) {
    const p = ((joint.get(`${l2}|${l4}`) ?? 0) / N), q = ((a.get(l2) ?? 0) / N) * ((b.get(l4) ?? 0) / N);
    assert.ok(Math.abs(p - q) <= 0.02, `${l2}|${l4}: ${p} vs ${q}`);
  }
});
