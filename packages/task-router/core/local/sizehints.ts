// The size stages (local-first spec SIZE-5, SIZE-6, design §5.3, plan S48): at 80 % and at 100 % of a node's budget, once per
// stage per node, one hint (S48's pinned texts, never a block) and one `crossing` line. The budget is the drawn tier's
// (`tierBudget(sessionTier, class)`), the class the settings policy's of the worktree's files (the gate classifies again with
// the policy file at merge); an `inert` or `plan` estimate has no work stages. The main measures after its writes (`install.ts`), a package
// child on its turns (`childtrips.ts`, D68).
import { globMatch } from "../glob.ts";
import type { CrossingInput } from "../outcome.ts";
import { FACTORS } from "../strategy/arms.ts";
import type { Arms, Strategy } from "../strategy/types.ts";
import type { RouterSettings } from "../types.ts";
import type { Git, Stat } from "./git.ts";
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
/** The block of a stage: the main gets it on a tool result, a package child as a message from the router. */
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

/** The reviewer the size gives, as the hint names it (review lf14 L2). The review's draw (E3) exists only at its gate, and the
 *  worker is never told it, so the text is the same under every level: where the level decides the reviewer it names every
 *  one the draw can give (true in each arm), elsewhere the one reviewer. The session's `arms` hold no review factor. */
const reviewerText = (strategy: Strategy, i: Omit<Parameters<Strategy["reviewer"]>[0], "review">): string =>
  [...new Set(FACTORS.E3.levels.map((e3) => strategy.reviewer({ ...i, review: { E3: e3 } }).reviewer))].join(" or ");

export type SizeHintDeps = {
  settings: RouterSettings; strategy: Strategy; arms(): Arms; now(): number;
  log: { crossing(i: Omit<CrossingInput, "now">): void };
};
export type SizeHint = { stage: Stage; text: string };

/** The stages of every node of the session: `observe` takes a node's worktree numstat and when it was read (the turn and the
 *  call of the session that measures), logs one `crossing` per stage reached and returns their hints. */
export function createSizeHints(d: SizeHintDeps): {
  observe(n: Node, st: Stat, at: { turn: number; call: number }): SizeHint[];
  /** SIZE-10: an accepted split of `n` rendering to `lines` > `budget` (`planLines`): one `crossing`, stage 100, kind `plan`,
   *  class standard (a split file never counts toward the class, D85); no hint. */
  plan(n: Node, lines: number, budget: number, at: { turn: number; call: number }): void;
} {
  const nodes = new Map<string, { stages: ReturnType<typeof createSizeStages>; first: number }>();
  const s = d.settings, plansDir = s.plans.dir;
  const ctx = { glob: globMatch, plansDir, isSplit: (p: string) => isSplitFile(plansDir, p), policyFile: s.localFirst.policyFile, inertChecked: false };
  const track = (id: string, now: number) => {
    let k = nodes.get(id);
    if (!k) nodes.set(id, (k = { stages: createSizeStages(), first: now }));
    return k;
  };
  return {
    plan(n, lines, budget, at) {
      const now = d.now(), k = track(n.id, now);
      d.log.crossing({ node: n.id, stage: 100, lines, budget, estimate: n.estimate.lines, tier: d.strategy.sessionTier(d.arms()), class: "standard",
        depth: n.depth, kind: "plan", turn: at.turn, call: at.call, sinceStartMs: now - k.first });
    },
    observe(n, st, at) {
      // an inert estimate has no budget; a plan estimate no work stages, so a crossing of kind plan is only a split above
      // planLines (`plan` above, SIZE-10; review lf56 m5)
      if (n.estimate.kind !== "code") return [];
      const now = d.now(), k = track(n.id, now);
      const files = withoutSplits(st, plansDir), lines = linesOf(files), arms = d.arms();
      const c = d.strategy.classify(files, settingsPolicy(s), ctx);
      const cls = c.cls === "inert" ? "standard" : c.cls; // no configured check is read here: never inert (CLS-3)
      const tier = d.strategy.sessionTier(arms), budget = d.strategy.tierBudget(tier, cls);
      return k.stages.observe(lines, budget).map((stage) => {
        d.log.crossing({ node: n.id, stage, lines, budget, estimate: n.estimate.lines, tier, class: cls, depth: n.depth, kind: n.estimate.kind,
          turn: at.turn, call: at.call, sinceStartMs: now - k.first });
        return { stage, text: sizeText(stage, lines, budget, reviewerText(d.strategy, { cls, actual: d.strategy.tierOfLines(lines), inertLike: c.inertLike })) };
      });
    },
  };
}

/** D68: a package child's size, measured on its actor `turn` events (API v1): one read at a time per child (a turn that comes
 *  meanwhile makes one more read); its hints go to the child as messages (`send`), never a kill or a pause. Total. */
export function createChildSizes(d: {
  hints: ReturnType<typeof createSizeHints>; git: Pick<Git, "diffStat">; node(id: string): Node | undefined;
  send(to: string, text: string): void; calls(child: string): number;
}): { turn(child: string, node: string): void; forget(child: string): void; settled(): Promise<void> } {
  const turns = new Map<string, number>(), busy = new Map<string, Promise<void>>(), again = new Set<string>();
  const read = async (child: string, id: string): Promise<void> => {
    do {
      again.delete(child);
      const n = d.node(id);
      if (!n || n.profile !== "local-first" || n.state !== "active") return;
      const st = await d.git.diffStat(n.worktree, n.base);
      if (!turns.has(child)) return; // forgotten (killed) meanwhile
      for (const x of d.hints.observe(n, st, { turn: turns.get(child) ?? 0, call: d.calls(child) })) d.send(child, sizeBlock(x.stage, x.text));
    } while (again.has(child));
  };
  return {
    turn(child, node) {
      try {
        turns.set(child, (turns.get(child) ?? 0) + 1);
        if (busy.has(child)) { again.add(child); return; }
        busy.set(child, read(child, node).catch(() => undefined).finally(() => busy.delete(child)));
      } catch { /* an event handler never throws */ }
    },
    forget(child) { turns.delete(child); again.delete(child); },
    async settled() { while (busy.size) await Promise.all([...busy.values()]); },
  };
}
