// Local-first plan LF4.T11a–f, T12a (spec TREE-7, TREE-14; D65): a node merges into its parent node's branch. The target is
// the parent node's branch and tip (the root's and a nodeless branch's: the main branch); `behind`, the size, the red run and
// the review diff take the target's tip as base; a node→parent merge fast-forwards the parent in its worktree and never pushes
// or records a main-ref; the guard protects an open parent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startNode, type NodeDeps } from "../core/local/branchtool.ts";
import type { MergeInput } from "../core/outcome.ts";
import { targetOf } from "../core/local/merge.ts";
import { replay, type Node, type TreeOp } from "../core/local/tree.ts";
import { createTreeStore } from "../core/local/treestore.ts";
import { fakeGit } from "./fake-git.ts";
import { mergeRig, REVISE } from "./merge-rig.ts";

/** The merge rig with a work tree: `node(input)` starts a node by start_branch's local-first path, `lines` the merge lines. */
function nodeRig(settings: Record<string, unknown> = {}) {
  const m = mergeRig({ settings });
  const tree = createTreeStore((type, data) => { m.entries.push({ type, data: structuredClone(data) }); });
  const nodes: NodeDeps = { tree, localFirst: () => true, caps: () => ({ maxDepth: 3, maxChildren: 5, planLines: 150 }), log: { node() {}, split() {} } };
  const lines: MergeInput[] = [];
  m.ports.nodes = nodes;
  m.ports.log = (i) => { lines.push(i); };
  const node = async (input: Record<string, unknown>) => {
    const res = await startNode({ git: m.git, store: m.store, settings: m.settings }, nodes, { goal: "do it", check: "true", ...input }, m.r.dir);
    if (!res.ok) throw new Error(res.errors.join("; "));
    return res.value;
  };
  /** The root `auth` (a plan node) with one commit, main moved on after it, and its child `auth.form` with one commit. */
  const shape = async () => {
    const root = await node({ slug: "auth", estimate: { kind: "plan", lines: 0 } });
    m.r.commit("docs/auth.md", "one\ntwo\nthree\n", "plan", root.worktree);
    m.r.commit("main.txt", "moved\n", "main moves");
    const child = await node({ parent: "auth", slug: "form", estimate: { kind: "code", lines: 2 } });
    m.r.commit("form.ts", "a\nb\n", "form", child.worktree);
    return { root, child };
  };
  return { ...m, tree, nodes, lines, node, shape };
}

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

test("TREE-7 base", async () => {
  const x = nodeRig();
  const { root, child } = await x.shape();
  const r = await x.merge({ branch: child.branch });
  assert.notEqual(r.reason, "behind", r.detail);
  // the size against the parent's tip: the child's two lines, not the root's plan or main's commit
  const st = await x.git.numstat(x.r.dir, x.r.git(["rev-parse", root.branch]), x.r.git(["rev-parse", child.branch]));
  assert.deepEqual([x.lines[0]?.nLines, x.lines[0]?.nFiles], [st!.reduce((a, f) => a + f.added + f.deleted, 0), 1]);
  assert.equal(x.lines[0]?.nLines, 2);
});

test("TREE-7 red-run base", async () => {
  const x = nodeRig();
  const { root, child } = await x.shape();
  // the red run's base: the HEAD of its temporary worktree while the check runs
  const bases: string[] = [], run = x.ports.run;
  x.ports.run = (cmd, cwd, ms, signal) => { if (cwd.includes("/red-")) bases.push(x.r.git(["rev-parse", "HEAD"], cwd)); return run(cmd, cwd, ms, signal); };
  x.verdicts.push(REVISE);
  const r = await x.merge({ branch: child.branch });
  assert.equal(r.status, "revise", r.detail);
  const rootTip = x.r.git(["rev-parse", root.branch]), childTip = x.r.git(["rev-parse", child.branch]);
  assert.deepEqual(bases, [rootTip]);
  const input = String(x.reviews[0]?.input);
  assert.ok(input.includes(`Diff ${rootTip}..${childTip}`), input);
  assert.ok(input.includes("form.ts") && !input.includes("docs/auth.md") && !input.includes("main.txt"), input);
  assert.equal(x.store.get(x.r.dir, child.branch)?.base, rootTip);
});
