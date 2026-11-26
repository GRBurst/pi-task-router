// Local-first plan LF4.T11a–f, T12a (spec TREE-7, TREE-14; D65): a node merges into its parent node's branch. The target is
// the parent node's branch and tip (the root's and a nodeless branch's: the main branch); `behind`, the size, the red run and
// the review diff take the target's tip as base; a node→parent merge fast-forwards the parent in its worktree and never pushes
// or records a main-ref; the guard protects an open parent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startNode, type NodeDeps } from "../core/local/branchtool.ts";
import type { MergeInput } from "../core/outcome.ts";
import { MAIN_REF_TYPE, reasonText, targetOf } from "../core/local/merge.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { replay, type Node, type TreeOp } from "../core/local/tree.ts";
import { createTreeStore } from "../core/local/treestore.ts";
import { fakeGit } from "./fake-git.ts";
import { mergeRig, REVISE } from "./merge-rig.ts";
import { treeRig } from "./tree-rig.ts";
import { MERGE_REASON } from "../core/local/gitcmd.ts";

/** The merge rig with a work tree: `node(input)` starts a node by start_branch's local-first path, `lines` the merge lines. */
function nodeRig(settings: Record<string, unknown> = {}) {
  const m = mergeRig({ settings });
  const tree = createTreeStore((type, data) => { m.entries.push({ type, data: structuredClone(data) }); });
  const nodeLines: Array<Record<string, unknown>> = [];
  const nodes: NodeDeps = { tree, localFirst: () => true, caps: () => ({ maxDepth: 3, maxChildren: 5, planLines: 150 }),
    log: { node(i) { nodeLines.push(i); }, split() {} } };
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
  return { ...m, tree, nodes, nodeLines, lines, node, shape };
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
  const tips = [x.r.git(["rev-parse", root.branch]), x.r.git(["rev-parse", child.branch])] as const;
  const r = await x.merge({ branch: child.branch });
  assert.notEqual(r.reason, "behind", r.detail);
  // the size against the parent's tip: the child's two lines, not the root's plan or main's commit
  const st = await x.git.numstat(x.r.dir, ...tips);
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

/** The root `auth` with a plan commit and its child `auth.form` with one commit, main not moved; a bare remote `origin`. */
async function pushShape(x: ReturnType<typeof nodeRig>) {
  const remote = join(x.r.base, "remote.git");
  x.r.git(["init", "-q", "--bare", remote]);
  x.r.git(["remote", "add", "origin", remote]);
  const root = await x.node({ slug: "auth", estimate: { kind: "plan", lines: 0 } });
  x.r.commit("docs/auth.md", "one\n", "plan", root.worktree);
  const child = await x.node({ parent: "auth", slug: "form", estimate: { kind: "code", lines: 2 } });
  const tip = x.r.commit("form.ts", "a\nb\n", "form", child.worktree);
  const pushed = () => x.r.git(["for-each-ref", "--format=%(refname)"], remote);
  return { remote, root, child, tip, pushed };
}

test("TREE-7 no push", async () => {
  const x = nodeRig({ mergeGate: { push: true } });
  const { remote, root, child, tip, pushed } = await pushShape(x);
  const before = x.r.git(["rev-parse", root.branch]);
  const r = await x.merge({ branch: child.branch });
  // node → parent: the parent's branch fast-forwarded in its worktree (in sync, clean), nothing pushed
  assert.equal(r.status, "merged", r.detail);
  assert.equal(r.pushed, undefined);
  assert.equal(r.detail.startsWith(`merged ${child.branch} into ${root.branch} at ${tip.slice(0, 7)}`), true, r.detail);
  assert.equal(x.r.git(["rev-parse", root.branch]), tip);
  assert.equal(x.r.git(["rev-parse", "HEAD"], root.worktree), tip);
  assert.equal(x.r.git(["status", "--porcelain"], root.worktree), "");
  assert.equal(pushed(), "");
  assert.deepEqual([x.lines[0]?.target, x.lines[0]?.base], [root.branch, before]);
  // the node is merged: one op, the parent counts it
  assert.equal(x.tree.tree().nodes["auth.form"]?.state, "merged");
  assert.deepEqual(x.tree.tree().nodes["auth"]?.merged, ["form"]);
  assert.deepEqual(x.nodeLines.filter((l) => l.outcome === "merged").map((l) => l.node), ["auth.form"]);
  // root → main: pushed once, as today
  const m = await x.merge({ branch: root.branch });
  assert.equal(m.status, "merged", m.detail);
  assert.equal(m.pushed, true);
  assert.equal(x.r.git(["rev-parse", "main"], remote), tip);
});

test("TREE-7 no push: a dirty parent worktree", async () => {
  const x = nodeRig({ mergeGate: { push: true } });
  const { root, child, pushed } = await pushShape(x);
  const before = x.r.git(["rev-parse", root.branch]);
  writeFileSync(join(root.worktree, "scratch"), "s\n");
  const r = await x.merge({ branch: child.branch });
  assert.deepEqual([r.status, r.reason], ["refused", "dirty"], r.detail);
  assert.equal(r.detail, reasonText("dirty", { worktree: root.worktree }));
  assert.equal(x.r.git(["rev-parse", root.branch]), before);
  assert.equal(x.tree.tree().nodes["auth.form"]?.state, "active");
  assert.equal(pushed(), "");
});

test("TREE-7 main-ref", async () => {
  const x = nodeRig();
  const { root, child, tip } = await pushShape(x);
  const refs = () => x.entries.filter((e) => e.type === MAIN_REF_TYPE).map((e) => e.data);
  assert.equal((await x.merge({ branch: child.branch })).status, "merged");
  assert.deepEqual(refs(), []); // node → parent: none
  assert.equal((await x.merge({ branch: root.branch })).status, "merged");
  assert.deepEqual(refs(), [{ repo: x.r.dir, branch: "main", sha: tip }]); // root → main: one
});

test("TREE-7 guard", async () => {
  const s = treeRig();
  /** The main session's git guard on `git commit` in `cwd`: its block reasons. */
  const blocks = async (cwd: string) => (await Promise.all(s.h.f.fire("tool_call", { toolName: "bash", toolCallId: `t${Math.random()}`,
    input: { command: "git commit -qm x" } }, { ...s.ctx, cwd }))).filter((x) => x !== undefined).map((x) => (x as { reason: string }).reason);
  const root = (await s.start({ slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } })).details;
  assert.deepEqual(await blocks(root.worktree), [], "no child yet");
  assert.equal(s.h.router.tree.apply({ op: "split", node: "auth", plan: { summary: "two", children: [
    { slug: "form", goal: "the form", files: ["form.ts"], estimate: { lines: 2, kind: "code" }, check: "true" },
    { slug: "docs", goal: "the docs", files: ["docs.md"], estimate: { lines: 0, kind: "inert" }, check: "true" }] } }), undefined);
  const form = (await s.start({ parent: "auth", child: "form" })).details;
  await s.start({ parent: "auth", child: "docs" });
  // the parent has open children: the main's direct commit on its branch is blocked; the child's own branch is not
  assert.deepEqual(await blocks(root.worktree), [MERGE_REASON("lm/auth")]);
  assert.deepEqual(await blocks(form.worktree), []);
  assert.equal(s.h.router.tree.apply({ op: "state", node: "auth.form", state: "merged" }), undefined);
  assert.deepEqual(await blocks(root.worktree), [MERGE_REASON("lm/auth")], "one child is still open");
  assert.equal(s.h.router.tree.apply({ op: "state", node: "auth.docs", state: "merged" }), undefined);
  assert.deepEqual(await blocks(root.worktree), [], "after the last child merged");
  assert.deepEqual(await blocks(s.r.dir), [MERGE_REASON("main")]);
});
