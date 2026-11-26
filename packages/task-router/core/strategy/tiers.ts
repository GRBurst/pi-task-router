// Size tiers (local-first spec SIZE-1, design §5.3, plan S31): the budget of a tier in changed lines and the tier of a line
// count. The constants are `localFirst.tiers`, given by the composition; the parts read no settings (D60). Pure: no I/O.
import type { RiskClass, Tier } from "./types.ts";

/** `localFirst.tiers`: the changed-line budgets of the three sized tiers. */
export interface TierLines { small: number; standard: number; large: number }

export interface Tiers {
  /** The budget in changed lines: the tier's own, Infinity for `inert`; an elevated class is capped at the standard tier's. */
  tierBudget(t: Tier, c: RiskClass): number;
  /** The smallest tier that holds `lines`; `over` above `large`. Monotone. */
  tierOfLines(lines: number): Exclude<Tier, "inert"> | "over";
}

export const createTiers = (lines: TierLines): Tiers => ({
  tierBudget: (t, c) => {
    const own = t === "inert" ? Infinity : lines[t];
    return c === "elevated" ? Math.min(own, lines.standard) : own;
  },
  tierOfLines: (n) => (n <= lines.small ? "small" : n <= lines.standard ? "standard" : n <= lines.large ? "large" : "over"),
});
