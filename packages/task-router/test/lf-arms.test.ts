// Local-first plan LF1.T8 (spec §6, D61, RND-2): the deterministic draw. A unit's level depends only on the seed, the
// factor's id and the unit, so a replay assigns the same arms; over many units the levels follow the weights.
import { test } from "node:test";
import assert from "node:assert/strict";
import { draw, pick } from "../core/strategy/draw.ts";
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
