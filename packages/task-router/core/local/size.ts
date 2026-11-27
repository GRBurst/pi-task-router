// A node's size during the work (local-first spec SIZE-2, design §5.3, D68): the changed lines of its worktree against its base,
// added + deleted of `git diff --numstat <base>` (committed, staged and unstaged) plus the lines of its untracked files that are
// not ignored (`Git.diffStat`, D42). The router's split files (`<plans.dir>/split/**`, D85) never count. The gate keeps its own
// measure of the commits (`merge.ts` `sizeOf`); this one feeds the hints. A failing git measures 0 (no hint), as the legacy
// size monitor does.
import type { Git, Stat } from "./git.ts";
import { isSplitFile } from "./split.ts";

/** The added + deleted lines of a numstat. */
export const linesOf = (st: Stat): number => st.reduce((n, f) => n + f.added + f.deleted, 0);
/** D85: a numstat without the router's split files (`isSplitFile`, the one definition). */
export const withoutSplits = (st: Stat, plansDir: string): Stat => st.filter((f) => !isSplitFile(plansDir, f.path));

/** The changed lines of the worktree `wt` against `base`, split files excluded. */
export async function workSize(git: Pick<Git, "diffStat">, wt: string, base: string, plansDir: string): Promise<number> {
  return linesOf(withoutSplits(await git.diffStat(wt, base), plansDir));
}
