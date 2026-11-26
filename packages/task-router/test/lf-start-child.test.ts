// Local-first plan LF4.T8 (spec §2.3, TREE-5): `start_branch({parent, child})` starts a package of the parent's recorded split:
// goal, files, estimate and check come from the split; a parent that is not split, an unknown slug and a started slug are each
// refused. Real git.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SplitPlan } from "../core/local/tree.ts";
import { treeRig } from "./tree-rig.ts";

const ROOT = { slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } };
const LONG = `${"a goal of four hundred characters ".repeat(12)}`.slice(0, 400);
const PLAN: SplitPlan = { summary: "two packages", children: [
  { slug: "form", goal: LONG, files: ["src/form/**"], estimate: { lines: 60, kind: "code" }, check: "test -n form", forbidden: ["src/db/**"] },
  { slug: "docs", goal: "document it", files: ["docs/login.md"], estimate: { lines: 0, kind: "inert" }, check: "true" },
] };

test("TREE-5", async () => {
  const s = treeRig();
  const reason = async (p: Record<string, unknown>) => { const x = await s.start(p); assert.equal(x.isError, true, JSON.stringify(p)); return x.content[0]!.text; };
  await s.start(ROOT);
  // not split yet
  assert.equal(await reason({ parent: "auth", child: "form" }), "node auth is active, not split: split it first");
  assert.equal(s.h.router.tree.apply({ op: "split", node: "auth", plan: PLAN }), undefined);
  // the package from the split: goal (≤ 400, longer than a slug start's 300), check, estimate, files
  const form = await s.start({ parent: "auth", child: "form" });
  assert.equal(form.isError, undefined, form.content[0]!.text);
  assert.deepEqual([form.details.node, form.details.branch, form.details.check, form.details.files], ["auth.form", "lm/auth.form", "test -n form", ["src/form/**"]]);
  const node = s.h.router.tree.tree().nodes["auth.form"]!;
  assert.deepEqual([node.parent, node.depth, node.kind, node.estimate], ["auth", 1, "leaf", { lines: 60, kind: "code" }]);
  assert.equal(s.h.router.branches.all().find((r) => r.branch === "lm/auth.form")!.goal, LONG);
  assert.deepEqual(s.h.router.tree.tree().nodes.auth!.started, ["form"]);
  // the refusals, one each
  assert.equal(await reason({ parent: "auth", child: "form" }), "auth.form is started already");
  assert.equal(await reason({ parent: "auth", child: "nope" }), "the split of auth has no child nope");
  assert.equal(await reason({ child: "docs" }), "child needs a parent");
  assert.equal(await reason({ parent: "auth", child: "docs", goal: "mine" }), "child takes its slug, goal, check and estimate from the split; give none of them");
  // the other package still starts; an inert one is an inert node
  const docs = await s.start({ parent: "auth", child: "docs" });
  assert.equal(docs.isError, undefined, docs.content[0]!.text);
  assert.deepEqual(s.nodes().map((l) => [l.taskId, l.tier]), [["auth", "standard"], ["auth.form", "standard"], ["auth.docs", "inert"]]);
  assert.deepEqual(s.ops().map((o) => [o.op, o.node?.id ?? o.node]), [["add", "auth"], ["split", "auth"], ["add", "auth.form"], ["add", "auth.docs"]]);
});
