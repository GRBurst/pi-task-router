// Local-first plan LF4.T11a–f, T12a (spec TREE-7, TREE-14; D65): a node merges into its parent node's branch. The target is
// the parent node's branch and tip (the root's and a nodeless branch's: the main branch); `behind`, the size, the red run and
// the review diff take the target's tip as base; a node→parent merge fast-forwards the parent in its worktree and never pushes
// or records a main-ref; the guard protects an open parent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { targetOf } from "../core/local/merge.ts";
import { replay, type Node, type TreeOp } from "../core/local/tree.ts";
import { fakeGit } from "./fake-git.ts";

const A = "a".repeat(40), B = "b".repeat(40);
const nodeAt = (id: string, parent?: string): Node => ({ id, ...(parent !== undefined && { parent }), depth: parent === undefined ? 0 : 1,
  kind: "leaf", branch: `lm/${id}`, worktree: `/r/x.worktrees/lm--${id}`, base: A, profile: "local-first", estimate: { lines: 1, kind: "code" },
  state: "active", started: [], merged: [], contacts: {}, ladder: [], effort: "medium" });

test("TREE-7 target", async () => {
  const g = fakeGit({ repos: [{ root: "/r/x" }] });
  g.repos.get("/r/x")!.refs.set("lm/auth", B);
  const tree = replay([{ op: "add", node: nodeAt("auth") }, { op: "add", node: nodeAt("auth.form", "auth") }] as TreeOp[]);
  const main = { name: "main", sha: A };
  // a child node → its parent node's branch and tip
  const t = await targetOf(g.git, "/r/x", tree, "lm/auth.form", main);
  assert.deepEqual([t?.name, t?.sha, t?.parent?.id], ["lm/auth", B, "auth"]);
  // the root, a nodeless branch, no tree → the main branch
  for (const [tr, branch] of [[tree, "lm/auth"], [tree, "lm/legacy"], [undefined, "lm/auth.form"]] as const)
    assert.deepEqual(await targetOf(g.git, "/r/x", tr, branch, main), main, branch);
  // a parent whose branch is gone: no target
  g.repos.get("/r/x")!.refs.delete("lm/auth");
  assert.equal(await targetOf(g.git, "/r/x", tree, "lm/auth.form", main), undefined);
});
