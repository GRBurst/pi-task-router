// Local-first plan LF4.T5 (spec TREE-4 commit, D66): the split file is committed in the node's worktree by a path-limited
// commit (`git add <f>`, `git commit --only -- <f>`): other staged changes stay staged and uncommitted; hooks run, and a failing
// hook refuses the split with its output and leaves the index as it was. Real git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRepo } from "./git-repo.ts";
import { createGit, gitRunner } from "../core/local/git.ts";
import { commitSplit, renderSplit, splitFile } from "../core/local/split.ts";
import type { SplitPlan } from "../core/local/tree.ts";

const PLAN: SplitPlan = { summary: "two packages", children: [
  { slug: "a", goal: "part a", files: ["src/a.ts"], estimate: { lines: 40, kind: "code" }, check: "true" },
  { slug: "b", goal: "part b", files: ["src/b.ts"], estimate: { lines: 30, kind: "code" }, check: "true" },
] };
const setup = () => {
  const r = tempRepo(), wt = join(r.base, "wt-req");
  r.git(["worktree", "add", "-q", "-b", "lm/req", wt, "main"]);
  writeFileSync(join(wt, "unrelated.txt"), "staged, not part of the split\n");
  r.git(["add", "unrelated.txt"], wt);
  return { r, wt, git: createGit(gitRunner("git", r.env)) };
};

test("TREE-4 commit", async () => {
  const { r, wt, git } = setup();
  const before = r.git(["rev-parse", "HEAD"], wt);
  const res = await commitSplit(git, wt, "docs/plans", "req", PLAN);
  assert.ok(res.ok, JSON.stringify(res));
  const file = splitFile("docs/plans", "req");
  assert.equal(file, "docs/plans/split/req.json");
  assert.equal(r.git(["rev-parse", "HEAD^"], wt), before, "one commit on the node's branch");
  assert.equal(res.value.commit, r.git(["rev-parse", "lm/req"]));
  assert.equal(r.git(["show", `HEAD:${file}`], wt) + "\n", renderSplit("req", PLAN));
  assert.deepEqual(r.git(["show", "--name-only", "--format=", "HEAD"], wt).split("\n"), [file], "the commit holds the split file only");
  assert.deepEqual(r.git(["diff", "--cached", "--name-only"], wt).split("\n"), ["unrelated.txt"], "the unrelated file is still staged");
  assert.equal(r.git(["rev-parse", "main"]), before, "the main branch did not move");
});

test("TREE-4 commit: a failing hook refuses with its output", async () => {
  const { r, wt, git } = setup();
  const hook = join(r.dir, ".git", "hooks", "pre-commit");
  writeFileSync(hook, "#!/bin/sh\necho 'hook says no' >&2\nexit 1\n");
  chmodSync(hook, 0o755);
  const before = r.git(["rev-parse", "HEAD"], wt);
  const res = await commitSplit(git, wt, "docs/plans", "req", PLAN);
  assert.ok(!res.ok);
  assert.match(res.errors.join("\n"), /hook says no/);
  assert.equal(r.git(["rev-parse", "HEAD"], wt), before, "no commit");
  assert.deepEqual(r.git(["diff", "--cached", "--name-only"], wt).split("\n"), ["unrelated.txt"], "the index is as it was");
  assert.equal(existsSync(join(wt, "docs/plans/split/req.json")), false, "the new file is taken back");
});
