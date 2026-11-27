// Local-first plan LF4.T9 (spec §2.3, TREE-4, TREE-12 a, TREE-11): the main's `split` tool. E16 = `local` (the default): the
// main's split of the root is the top-level plan. It validates, commits the canonical file on the node's branch in the node's
// worktree (never on the main branch), sets the node `split`, writes one `split` line and one `node` line. Real git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSplit } from "../core/local/split.ts";
import type { SplitPlan } from "../core/local/tree.ts";
import { treeRig } from "./tree-rig.ts";

const ROOT = { slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } };
const PLAN: SplitPlan = { summary: "two packages", children: [
  { slug: "form", goal: "the form", files: ["src/form/**"], estimate: { lines: 60, kind: "code" }, check: "true", forbidden: ["src/db/**"] },
  { slug: "docs", goal: "document it", files: ["docs/login.md"], estimate: { lines: 0, kind: "inert" }, check: "true" },
] };
const FILE = "docs/plans/split/auth.json";

test("TREE-12 local", async () => {
  const s = treeRig();
  assert.ok(s.h.f.tools.has("split") && s.h.f.active.has("split"), "a local-first tool (S34a)");
  await s.start(ROOT);
  const mainTip = s.r.git(["rev-parse", "main"]);
  // node absent = the root
  const x = await s.call("split", { summary: PLAN.summary, children: PLAN.children });
  assert.equal(x.isError, undefined, x.content[0]!.text);
  assert.deepEqual([x.details.node, x.details.file, x.details.children], ["auth", FILE, ["form", "docs"]]);
  // committed on the root's branch, by itself; the main branch did not move
  assert.equal(s.r.git(["rev-parse", "main"]), mainTip, "not on the main branch");
  assert.equal(s.r.git(["rev-parse", "lm/auth"]), x.details.commit);
  assert.equal(s.r.git(["show", `lm/auth:${FILE}`]) + "\n", renderSplit("auth", PLAN));
  assert.equal(s.r.git(["diff", "--name-only", `${mainTip}..lm/auth`]), FILE);
  // the op, the state, the lines (TREE-11)
  assert.deepEqual(s.ops().at(-1), { v: 1, op: "split", node: "auth", plan: PLAN });
  assert.deepEqual(s.h.router.tree.tree().nodes.auth!.state, "split");
  const planLines = renderSplit("auth", PLAN).trimEnd().split("\n").length;
  assert.deepEqual(s.h.lines().filter((l) => l.event === "split").map((l) => [l.taskId, l.node, l.reason, l.children, l.depth, l.planLines]),
    [["auth", "auth", "choice", 2, 0, planLines]]);
  assert.deepEqual(s.nodes().map((l) => [l.taskId, l.outcome, l.fanout]), [["auth", "started", 0], ["auth", "split", 2]]);
  // review lf56 m5: the main session's id
  assert.deepEqual(s.h.lines().filter((l) => l.event === "split" || l.event === "node").map((l) => l.sessionId), ["s-main", "s-main", "s-main"]);
  // a second split of the same node is refused, and changes nothing
  const again = await s.call("split", { node: "auth", ...PLAN });
  assert.deepEqual([again.isError, again.content[0]!.text], [true, "node auth is split: only an active node splits"]);
  assert.equal(s.r.git(["rev-parse", "lm/auth"]), x.details.commit);
  // a named node: a package splits on its own branch
  await s.start({ parent: "auth", child: "form" });
  const sub = await s.call("split", { node: "auth.form", summary: "one", children: [{ ...PLAN.children[0]!, slug: "inputs" }] });
  assert.equal(sub.isError, undefined, sub.content[0]!.text);
  assert.equal(s.r.git(["diff", "--name-only", "lm/auth..lm/auth.form"]), "docs/plans/split/auth.form.json");
  assert.deepEqual(s.h.lines().filter((l) => l.event === "split").map((l) => [l.node, l.depth]), [["auth", 0], ["auth.form", 1]]);
});

test("TREE-12 local refusals: one reason per violation, nothing written", async () => {
  const s = treeRig();
  const reason = async (p: Record<string, unknown>) => { const x = await s.call("split", p); assert.equal(x.isError, true, JSON.stringify(p)); return x.content[0]!.text; };
  assert.equal(await reason(PLAN), "no active node: start the request node with start_branch, or give node");
  await s.start(ROOT);
  assert.equal(await reason({ summary: "", children: [] }), "summary: must be 1 to 400 characters; children: 0; a split has 1 to maxChildren 5");
  assert.equal(await reason({ node: "nope", ...PLAN }), "unknown node");
  assert.deepEqual([s.ops().length, s.h.lines().filter((l) => l.event === "split").length], [1, 0]);
});

test("TREE-12 local: cloud-first takes split out of the active set; the legacy local mode has no split", async () => {
  const s = treeRig();
  await s.h.f.commands.get("profile")!.handler("cloud-first", s.ctx);
  assert.equal(s.h.f.active.has("split"), false);
  assert.equal(treeRig({ mode: "local" }).h.f.tools.has("split"), false);
});
