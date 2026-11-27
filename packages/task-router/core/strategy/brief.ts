// The budgets a coordinator and a package child read at the start (local-first spec SIZE-9, design §5.3): the session tier's
// budget per package and the plan budgets of a split. One line, rendered here for the main's section and every package brief.
// Pure: no I/O, no settings read (the composition's parts give the values).
import type { Arms, Strategy, Tier } from "./types.ts";

/** `tier`: the session's (`sessionTier`); the budget of a standard-class package of it and the tree caps the arms give. */
export const budgetLine = (tier: Exclude<Tier, "inert">, s: Pick<Strategy, "tierBudget" | "treeCaps">, a: Arms): string => {
  const caps = s.treeCaps(a);
  return `Budgets: package ≤ ${s.tierBudget(tier, "standard")} changed lines; split ≤ ${caps.planLines} lines, ≤ ${caps.maxChildren} children.`;
};
