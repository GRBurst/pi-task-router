// Local-first plan LF1.T8 (spec §6, D61, RND-2): the deterministic draw. A unit's level depends only on the seed, the
// factor's id and the unit, so a replay assigns the same arms; over many units the levels follow the weights.
import { test } from "node:test";
import assert from "node:assert/strict";
import { draw, pick } from "../core/strategy/draw.ts";
import { seeded } from "./rand.ts";

const word = (rnd: (n: number) => number): string => Array.from({ length: 1 + rnd(12) }, () => "ab-_0Z\u00e9 \u0000"[rnd(9)]).join("");

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
