// Local-first plan LF5.T1, T2 (spec SIZE-1, SIZE-3, design §5.3): the size tiers' budgets, the tier of a line count and the
// session's tier (the E2 level). Pure: the parts take the settings' constants, never read settings themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTiers } from "../core/strategy/tiers.ts";
import type { Tier } from "../core/strategy/types.ts";
import { defaults } from "../core/settings.ts";
import { seeded } from "./rand.ts";

const TIERS: Tier[] = ["small", "standard", "large", "inert"];
const dflt = () => createTiers(defaults().localFirst.tiers);

test("SIZE-1 the table", () => {
  const t = dflt();
  // inert and standard classes: the tier's own budget; the inert tier has none
  const table: Record<Tier, number> = { small: 60, standard: 150, large: 300, inert: Infinity };
  for (const tier of TIERS) for (const c of ["inert", "standard"] as const) assert.equal(t.tierBudget(tier, c), table[tier], `${tier}/${c}`);
  // elevated is capped at the standard tier's budget, whatever the tier
  assert.deepEqual(TIERS.map((x) => t.tierBudget(x, "elevated")), [60, 150, 150, 150]);
});

test("SIZE-1 elevated is never above 150 (property)", () => {
  const rnd = seeded(5101);
  for (let i = 0; i < 300; i++) {
    const small = 1 + rnd(100), standard = small + rnd(200), large = standard + rnd(500);
    const t = createTiers({ small, standard, large });
    for (const tier of TIERS) {
      assert.ok(t.tierBudget(tier, "elevated") <= standard, `${tier} ${JSON.stringify({ small, standard, large })}`);
    }
  }
  for (const tier of TIERS) assert.ok(dflt().tierBudget(tier, "elevated") <= 150);
});

test("SIZE-1 the tier of a line count is monotone and edge-exact", () => {
  const t = dflt();
  const order = ["small", "standard", "large", "over"];
  assert.deepEqual([0, 1, 60, 61, 150, 151, 300, 301, 100000].map((n) => t.tierOfLines(n)),
    ["small", "small", "small", "standard", "standard", "large", "large", "over", "over"]);
  const rnd = seeded(5102);
  for (let i = 0; i < 300; i++) {
    const a = rnd(400), b = a + rnd(400);
    assert.ok(order.indexOf(t.tierOfLines(a)) <= order.indexOf(t.tierOfLines(b)), `${a} ≤ ${b}`);
  }
  // the budgets are the settings' constants
  const custom = createTiers({ small: 10, standard: 20, large: 30 });
  assert.deepEqual([10, 11, 20, 21, 30, 31].map((n) => custom.tierOfLines(n)), ["small", "standard", "standard", "large", "large", "over"]);
  assert.equal(custom.tierBudget("large", "standard"), 30);
});
