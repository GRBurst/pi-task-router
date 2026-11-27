// Local-first plan LF5.T3, T3a (spec SIZE-2, D85): the changed lines of a node during the work, with real git: the worktree's
// numstat against its base (committed, staged and unstaged, deleted lines too) plus the lines of its untracked files that are
// not ignored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGit, gitRunner } from "../core/local/git.ts";
import { workSize } from "../core/local/size.ts";
import { tempRepo } from "./git-repo.ts";

const lines = (n: number, tag = "l"): string => Array.from({ length: n }, (_, i) => `${tag}${i}\n`).join("");

/** A worktree on a new branch off main; its base (main's tip). */
function rig() {
  const r = tempRepo();
  r.commit("old.txt", lines(4, "o"), "base file");
  const base = r.git(["rev-parse", "HEAD"]), wt = join(r.base, "wt");
  r.git(["worktree", "add", "-q", "-b", "lm/x", wt, base]);
  return { r, git: createGit(gitRunner("git", r.env)), base, wt };
}

test("SIZE-2 committed, uncommitted and untracked lines; ignored files do not count", async () => {
  const { r, git, base, wt } = rig();
  r.commit("a.ts", lines(10), "ten lines", wt); // 10 added, committed
  appendFileSync(join(wt, "a.ts"), lines(5, "m")); // 5 added, uncommitted
  writeFileSync(join(wt, "u.ts"), lines(7, "u")); // an untracked 7-line file
  mkdirSync(join(r.dir, ".git", "info"), { recursive: true });
  appendFileSync(join(r.dir, ".git", "info", "exclude"), "ignored.log\n");
  writeFileSync(join(wt, "ignored.log"), lines(50, "i")); // ignored: never counted
  assert.equal(await workSize(git, wt, base), 22);
  // deleted lines count too: 2 of the base file's 4 lines removed
  writeFileSync(join(wt, "old.txt"), lines(2, "o"));
  assert.equal(await workSize(git, wt, base), 24);
});

test("SIZE-2 a failing git measures nothing", async () => {
  const { git, wt } = rig();
  assert.equal(await workSize(git, wt, "no-such-ref"), 0);
});
