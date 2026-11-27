// The size stages (local-first spec SIZE-5, SIZE-6, design §5.3, plan S48): at 80 % and at 100 % of a node's budget, once per
// stage per node, one hint (S48's pinned texts, never a block) and one `crossing` line. The budget is the drawn tier's
// (`tierBudget(sessionTier, class)`), the class the settings policy's of the worktree's files (the gate classifies again with
// the policy file at merge); an `inert` estimate has no budget. The main measures after its writes (`install.ts`), a package
// child on its turns (`childtrips.ts`, D68).
import { globMatch } from "../glob.ts";
import type { CrossingInput } from "../outcome.ts";
import type { Arms, Strategy } from "../strategy/types.ts";
import type { RouterSettings } from "../types.ts";
import type { Stat } from "./git.ts";
import { settingsPolicy } from "./policyfile.ts";
import { linesOf, withoutSplits } from "./size.ts";
import { isSplitFile } from "./split.ts";
import type { Node } from "./tree.ts";

export type Stage = 80 | 100;
const STAGES: readonly Stage[] = [80, 100];

/** S48 (pinned). */
export const sizeText = (stage: Stage, lines: number, budget: number, reviewer: string): string => stage === 80
  ? `Size: ${lines}/${budget} changed lines (80 %). Finish or plan a split.`
  : `Size: ${lines}/${budget} changed lines (100 %). The reviewer is now ${reviewer}; consider a split.`;
/** The main's block on a tool result (a package child gets the bare text as a message). */
export const sizeBlock = (stage: Stage, text: string): string => `<router-hint size="${stage}">${text}</router-hint>`;

/** A stage is reached at `lines ≥ stage % of budget`; each once. The budget is given per observation: a class that turns
 *  elevated caps it at the standard tier's (`tierBudget`); Infinity (inert) reaches none. */
export function createSizeStages(): { observe(lines: number, budget: number): Stage[] } {
  const done = new Set<Stage>();
  return {
    observe(lines, budget) {
      const out = STAGES.filter((s) => !done.has(s) && lines * 100 >= s * budget);
      for (const s of out) done.add(s);
      return out;
    },
  };
}

export type SizeHintDeps = {
  settings: RouterSettings; strategy: Strategy; arms(): Arms; now(): number;
  log: { crossing(i: Omit<CrossingInput, "now">): void };
};
export type SizeHint = { stage: Stage; text: string };

/** The stages of every node of the session: `observe` takes a node's worktree numstat and when it was read (the turn and the
 *  call of the session that measures), logs one `crossing` per stage reached and returns their hints. */
export function createSizeHints(d: SizeHintDeps): { observe(n: Node, st: Stat, at: { turn: number; call: number }): SizeHint[] } {
  const nodes = new Map<string, { stages: ReturnType<typeof createSizeStages>; first: number }>();
  const s = d.settings, plansDir = s.plans.dir;
  const ctx = { glob: globMatch, plansDir, isSplit: (p: string) => isSplitFile(plansDir, p), policyFile: s.localFirst.policyFile, inertChecked: false };
  return {
    observe(n, st, at) {
      if (n.estimate.kind === "inert") return [];
      const now = d.now();
      let k = nodes.get(n.id);
      if (!k) nodes.set(n.id, (k = { stages: createSizeStages(), first: now }));
      const files = withoutSplits(st, plansDir), lines = linesOf(files), arms = d.arms();
      const c = d.strategy.classify(files, settingsPolicy(s), ctx);
      const cls = c.cls === "inert" ? "standard" : c.cls; // no configured check is read here: never inert (CLS-3)
      const tier = d.strategy.sessionTier(arms), budget = d.strategy.tierBudget(tier, cls);
      return k.stages.observe(lines, budget).map((stage) => {
        d.log.crossing({ node: n.id, stage, lines, budget, estimate: n.estimate.lines, tier, class: cls, depth: n.depth, kind: n.estimate.kind,
          turn: at.turn, call: at.call, sinceStartMs: now - k.first });
        const who = d.strategy.reviewer({ cls, actual: d.strategy.tierOfLines(lines), inertLike: c.inertLike, review: arms }).reviewer;
        return { stage, text: sizeText(stage, lines, budget, who) };
      });
    },
  };
}
