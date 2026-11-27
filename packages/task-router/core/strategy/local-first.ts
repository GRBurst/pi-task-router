// The one composition the mechanism sees (local-first D60, D92, NR-6): the local-first strategy's parts behind `Strategy`.
// A part not built yet throws; its task replaces the stub here (one wiring task per lane, D92). Pure: no I/O.
import type { RouterSettings } from "../types.ts";
import type { Strategy } from "./types.ts";
import { createTiers, sessionTier } from "./tiers.ts";
import { classify } from "./classify.ts";
import { reviewer } from "./reviewer.ts";

/** SIZE-9: the budgets line (`brief.ts`), re-exported here: the mechanism reaches strategy files only through this one (NR-6). */
export { budgetLine } from "./brief.ts";

const notYet = (part: keyof Strategy) => (): never => { throw new Error(`task-router: strategy part ${part}: not yet`); };

export const localFirst = (settings: RouterSettings): Strategy => {
  const tiers = createTiers(settings.localFirst.tiers);
  return {
    sessionTier,
    tierBudget: tiers.tierBudget,
    tierOfLines: tiers.tierOfLines,
    treeCaps: () => ({ ...settings.localFirst.tree }), // E6/E15 draw them later (LF14+)
    classify,
    reviewer,
    points: notYet("points"),
    ladder: notYet("ladder"),
    breaker: notYet("breaker"),
    quota: notYet("quota"),
    child: notYet("child"),
    context: notYet("context"),
  };
};
