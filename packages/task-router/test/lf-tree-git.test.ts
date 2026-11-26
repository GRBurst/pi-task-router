// Local-first plan LF4.T7 (spec §2.3, TREE-1, TREE-11): `start_branch` in a local-first session makes a node. No parent: a
// level-0 node off the main tip (the request node, D65); `parent`: a node one level below, off the parent node's tip. Real git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGit, gitRunner } from "../core/local/git.ts";
import { TREE_TYPE } from "../core/local/treestore.ts";
import { START_BRANCH_SCHEMA } from "../core/local/branchtool.ts";
import { harness } from "./harness.ts";
import { tempRepo } from "./git-repo.ts";

const LF = { profile: "local-first", localFirst: { experimental: true } };
type Reply = { content: { text: string }[]; details: Record<string, any>; isError?: boolean };

export function treeRig(settings: Record<string, unknown> = LF) {
  const r = tempRepo();
  const git = createGit(gitRunner("git", r.env));
  const h = harness({ settings: settings as never, extra: { git } as never });
  const ctx = { sessionManager: { getSessionId: () => "s-main", getBranch: () => [] }, cwd: r.dir };
  h.f.fire("session_start", { reason: "startup" }, ctx);
  const start = async (params: Record<string, unknown>) => (await h.f.callTool("start_branch", params, ctx)) as Reply;
  const ops = () => h.f.entries.filter((e) => e.type === TREE_TYPE).map((e) => e.data as Record<string, any>);
  const nodes = () => h.lines().filter((l) => l.event === "node");
  return { r, git, h, ctx, start, ops, nodes };
}
const ROOT = { slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } };
const LOGIN = { parent: "auth", slug: "login", goal: "the form", check: "true", estimate: { kind: "code", lines: 40 } };

test("TREE-1", async () => {
  const s = treeRig();
  const tip = s.r.git(["rev-parse", "main"]);
  const root = await s.start(ROOT);
  assert.equal(root.isError, undefined, root.content[0]!.text);
  assert.deepEqual([root.details.node, root.details.branch, root.details.base], ["auth", "lm/auth", tip], "level 0: off the main tip");
  // the root moves, and so does main: the child is cut from the root's tip, not from main's
  const rootTip = s.r.commit("a.ts", "a\n", "root work", root.details.worktree);
  s.r.commit("m.ts", "m\n", "main moves");
  const child = await s.start(LOGIN);
  assert.equal(child.isError, undefined, child.content[0]!.text);
  assert.deepEqual([child.details.node, child.details.branch, child.details.base], ["auth.login", "lm/auth.login", rootTip]);
  assert.equal(s.r.git(["rev-parse", "lm/auth.login"]), rootTip, "the branch is the parent's tip");
  // one `add` op per node, the parent's `started` holds the child's slug
  assert.deepEqual(s.ops().map((o) => [o.op, o.node.id, o.node.parent, o.node.depth, o.node.kind, o.node.base, o.node.profile]),
    [["add", "auth", undefined, 0, "plan", tip, "local-first"], ["add", "auth.login", "auth", 1, "leaf", rootTip, "local-first"]]);
  assert.deepEqual(s.h.router.tree.tree().nodes.auth!.started, ["login"]);
  // one `node` line per node (TREE-11), outcome started
  assert.deepEqual(s.nodes().map((l) => [l.taskId, l.parent, l.depth, l.kind, l.fanout, l.outcome, l.tier, l.profile]),
    [["auth", undefined, 0, "plan", 0, "started", "standard", "local-first"], ["auth.login", "auth", 1, "leaf", 0, "started", "standard", "local-first"]]);
  // the same node again re-activates it: no second op, no second line
  const again = await s.start(ROOT);
  assert.deepEqual([again.isError, again.details.node, s.ops().length, s.nodes().length], [undefined, "auth", 2, 2]);
});

test("TREE-1 refusals", async () => {
  const s = treeRig({ ...LF, localFirst: { experimental: true, tree: { maxDepth: 1, maxChildren: 5, planLines: 150 } } });
  const reason = async (p: Record<string, unknown>) => { const x = await s.start(p); assert.equal(x.isError, true, JSON.stringify(p)); return x.content[0]!.text; };
  assert.equal(await reason({ slug: "auth", goal: "g", check: "true" }), "estimate is required in a local-first session");
  for (const estimate of [{ kind: "code" }, { kind: "big", lines: 1 }, { kind: "code", lines: -1 }, { kind: "code", lines: 1.5 }])
    assert.equal(await reason({ slug: "auth", goal: "g", check: "true", estimate }), "estimate must be {lines: an integer ≥ 0, kind: code, plan or inert}");
  assert.equal(await reason(LOGIN), "unknown node auth");
  await s.start(ROOT);
  await s.start(LOGIN);
  assert.equal(await reason({ ...LOGIN, parent: "auth.login", slug: "form" }), "node auth.login is at depth 1: maxDepth 1 allows no node below it");
  assert.deepEqual([s.ops().length, s.nodes().length], [2, 2], "a refusal adds nothing");
});

test("TREE-1 legacy: the local mode's schema and branches are unchanged; no node", async () => {
  const s = treeRig({ mode: "local" });
  assert.deepEqual(s.h.f.tools.get("start_branch")!.parameters, START_BRANCH_SCHEMA);
  const x = await s.start({ slug: "auth", goal: "g", check: "true" });
  assert.deepEqual([x.isError, x.details.branch, "node" in x.details, s.ops().length, s.nodes().length], [undefined, "lm/auth", false, 0, 0]);
});
