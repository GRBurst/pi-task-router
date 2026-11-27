// Local-first plan LF5.T4 (spec SIZE-4, design §5.3): `start_branch` refuses a package whose estimate is above the session
// tier's budget (`tierBudget(sessionTier, "standard")`); the text names the budget, `maxChildren` and `split`. An `inert` or a
// `plan` estimate is never refused. It is the only place size blocks: no other tool result is a size refusal. Real git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE_REFUSAL, startNode, type NodeDeps } from "../core/local/branchtool.ts";
import { createBranchStore } from "../core/local/branches.ts";
import { createGit, gitRunner } from "../core/local/git.ts";
import { createTreeStore } from "../core/local/treestore.ts";
import { parseSettings } from "../core/settings.ts";
import { localFirst } from "../core/strategy/local-first.ts";
import { tempRepo } from "./git-repo.ts";
import { LF, treeRig, type Reply } from "./tree-rig.ts";

const est = (lines: number, kind = "code") => ({ goal: "do it", check: "true", estimate: { lines, kind } });

test("SIZE-4", async () => {
  const s = treeRig();
  const replies: Reply[] = [];
  const start = async (p: Record<string, unknown>) => { const r = await s.start(p); replies.push(r); return r; };
  // standard (E2 disabled): 150 lines; one more is refused, naming the budget, maxChildren and split
  const no = await start({ slug: "big", ...est(151) });
  assert.equal(no.isError, true);
  const text = no.content[0]!.text;
  assert.ok(text.startsWith(SIZE_REFUSAL), text);
  assert.ok(text.includes("150 changed lines") && text.includes("5 children") && text.includes("split"), text);
  assert.deepEqual(s.nodes(), [], "a refusal starts no node");
  // at the budget, inert and plan estimates of any size start
  for (const [slug, p] of [["fits", est(150)], ["docs", est(5000, "inert")], ["req", est(9000, "plan")]] as const) {
    const r = await start({ slug, ...p });
    assert.equal(r.isError, undefined, `${slug}: ${r.content[0]!.text}`);
  }
  // a package of a split brings its estimate: above the budget it is refused too
  assert.equal(s.h.router.tree.apply({ op: "split", node: "req", plan: { summary: "s", children: [
    { slug: "a", goal: "g", files: ["a.ts"], estimate: { lines: 200, kind: "code" }, check: "true" },
    { slug: "b", goal: "g", files: ["b.ts"], estimate: { lines: 20, kind: "code" }, check: "true" }] } }), undefined);
  assert.ok((await start({ parent: "req", child: "a" })).content[0]!.text.startsWith(SIZE_REFUSAL));
  assert.equal((await start({ parent: "req", child: "b" })).isError, undefined);
  // property: only the refused starts carry the refusal's prefix
  assert.deepEqual(replies.map((r) => r.content[0]!.text.startsWith(SIZE_REFUSAL)), [true, false, false, false, true, false]);
});

test("SIZE-4 the session's tier: E2 large → 300 lines", async () => {
  const r = tempRepo(), settings = parseSettings({ ...LF }).settings;
  const nodes: NodeDeps = { tree: createTreeStore(() => undefined), localFirst: () => true, caps: () => settings.localFirst.tree,
    strategy: localFirst(settings), arms: () => ({ E2: "large" }), log: { node() {}, split() {} } };
  const d = { git: createGit(gitRunner("git", r.env)), store: createBranchStore(() => undefined), settings };
  assert.equal((await startNode(d, nodes, { slug: "x", ...est(300) }, r.dir)).ok, true);
  const no = await startNode(d, nodes, { slug: "y", ...est(301) }, r.dir);
  assert.ok(!no.ok && no.errors[0]!.startsWith(SIZE_REFUSAL) && no.errors[0]!.includes("300 changed lines (tier large)"), JSON.stringify(no));
});
