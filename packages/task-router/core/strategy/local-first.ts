// The one composition the mechanism sees (local-first D60, D92, NR-6): the local-first strategy's parts behind `Strategy`.
// A part not built yet throws; its task replaces the stub here (one wiring task per lane, D92). Pure: no I/O.
import type { RouterSettings } from "../types.ts";
import type { Strategy } from "./types.ts";

const notYet = (part: keyof Strategy) => (): never => { throw new Error(`task-router: strategy part ${part}: not yet`); };

export const localFirst = (_settings: RouterSettings): Strategy => ({
  sessionTier: notYet("sessionTier"),
  tierBudget: notYet("tierBudget"),
  tierOfLines: notYet("tierOfLines"),
  treeCaps: notYet("treeCaps"),
  classify: notYet("classify"),
  reviewer: notYet("reviewer"),
  points: notYet("points"),
  ladder: notYet("ladder"),
  breaker: notYet("breaker"),
  quota: notYet("quota"),
  child: notYet("child"),
  context: notYet("context"),
});
