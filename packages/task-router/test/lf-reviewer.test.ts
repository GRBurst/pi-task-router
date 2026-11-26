// Local-first plan LF6.T5, T6 (spec REV-1, REV-2, SIZE-7, design §5.4, plan S39): the reviewer is the stronger of the class's
// and the actual-size tier's; elevated adds the orthogonal check; a drawn tier never enters (the actual lines do).
import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewer } from "../core/strategy/reviewer.ts";
import { createTiers, sessionTier } from "../core/strategy/tiers.ts";
import type { Arms, ReviewerChoice, RiskClass, Tier } from "../core/strategy/types.ts";
import { defaults } from "../core/settings.ts";
import { seeded } from "./rand.ts";

type Actual = Tier | "over";
const CLASSES: RiskClass[] = ["inert", "standard", "elevated"];
const ACTUALS: Actual[] = ["inert", "small", "standard", "large", "over"];
const pick = (cls: RiskClass, actual: Actual, inertLike = false, review: Arms = {}): ReviewerChoice => reviewer({ cls, actual, inertLike, review });
const brief = (c: ReviewerChoice) => [c.reviewer, c.binding, c.orthogonal];

test("REV-1 the S39 table", () => {
  // actual inert, class inert: no review
  assert.deepEqual(brief(pick("inert", "inert", true)), ["none", false, false]);
  // inert-like (class standard), small: Haiku, advisory, in the inert-like stratum
  assert.deepEqual(pick("standard", "small", true), { reviewer: "haiku", binding: false, fresh: true, orthogonal: false, stratum: "inert-like" });
  // small: Sonnet binding, in the small stratum
  assert.deepEqual(pick("standard", "small"), { reviewer: "sonnet", binding: true, fresh: true, orthogonal: false, stratum: "small" });
  // an inert class at a small size: Sonnet binding (the table's inert column)
  assert.deepEqual(brief(pick("inert", "small", true)), ["sonnet", true, false]);
  // standard (E3 absent), large, over: Opus
  for (const a of ["standard", "large", "over"] as const) assert.deepEqual(brief(pick("standard", a)), ["opus", true, false], a);
  // elevated: Opus plus the orthogonal check, whatever the size
  for (const a of ACTUALS) assert.deepEqual(brief(pick("elevated", a)), ["opus", true, true], a);
  // every choice is a fresh session; only the two cheap strata carry a stratum
  for (const c of CLASSES) for (const a of ACTUALS) for (const l of [false, true]) {
    const r = pick(c, a, l);
    assert.equal(r.fresh, true);
    assert.equal(r.stratum !== undefined, r.reviewer === "haiku" || (r.reviewer === "sonnet" && a === "small"), JSON.stringify([c, a, l]));
  }
});

/** The spec's formula, written out: strength none 0 < haiku 1 < sonnet 2 < opus 3. */
const STRENGTH: Record<string, number> = { none: 0, haiku: 1, sonnet: 2, opus: 3 };
const classStrength = (c: RiskClass): number => (c === "elevated" ? 3 : 0);
const tierStrength = (a: Actual, relaxed: boolean): number => (a === "inert" ? 0 : a === "small" ? (relaxed ? 1 : 2) : 3);

test("REV-1 property: strength = max(class's, tier's), orthogonal iff elevated", () => {
  const rnd = seeded(6101);
  for (let i = 0; i < 500; i++) {
    const c = CLASSES[rnd(3)]!, a = ACTUALS[rnd(5)]!, inertLike = rnd(2) === 1;
    const r = pick(c, a, inertLike);
    const want = Math.max(classStrength(c), tierStrength(a, inertLike && c !== "inert"));
    assert.equal(STRENGTH[r.reviewer], want, JSON.stringify([c, a, inertLike]));
    assert.equal(r.orthogonal, c === "elevated");
    assert.equal(r.binding, r.reviewer === "sonnet" || r.reviewer === "opus");
  }
});

test("REV-1 monotone: a larger actual tier never weakens the reviewer", () => {
  for (const c of CLASSES) for (const l of [false, true]) {
    const s = ["small", "standard", "large", "over"].map((a) => STRENGTH[pick(c, a as Actual, l).reviewer]!);
    assert.deepEqual(s, [...s].sort((x, y) => x - y), JSON.stringify([c, l]));
  }
});

test("SIZE-7 the actual lines decide, not the drawn tier: small drawn, 200 lines → Opus", () => {
  const t = createTiers(defaults().localFirst.tiers);
  const drawn = sessionTier({ E2: "small" });
  assert.equal(drawn, "small");
  const actual = t.tierOfLines(200);
  assert.equal(actual, "large");
  assert.deepEqual(brief(pick("standard", actual)), ["opus", true, false]);
  assert.deepEqual(brief(pick("standard", t.tierOfLines(20))), ["sonnet", true, false], "20 lines of the same session stay small");
  assert.deepEqual(brief(pick("standard", t.tierOfLines(10_000))), ["opus", true, false], "over the large tier");
});
