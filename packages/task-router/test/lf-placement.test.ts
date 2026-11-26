// Local-first plan LF4.T12 (spec TREE-6, PRO-10 b; S34b): in a local-first session the spawn policy places a `package` card by
// the tree (the start member, the node's worktree, the package contract in the brief, `meta.node`), a `t2` package card on the
// cloud route as an open-ended contact, and a card without `package` by its kind's `localFirst.placement`. Real git.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PolicyResult } from "../core/api.ts";
import type { SplitPlan } from "../core/local/tree.ts";
import { accepted, card, harness, provideSkills } from "./harness.ts";
import { treeRig } from "./tree-rig.ts";

type Placed = Extract<PolicyResult, { model: string }>;
const QWEN = "llama/qwen3.8";
const ROOT = { slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } };
const PLAN: SplitPlan = { summary: "two packages", children: [
  { slug: "form", goal: "build the login form", files: ["src/form/**", "test/form.test.ts"], estimate: { lines: 60, kind: "code" }, check: "npm test -- form", forbidden: ["src/db/**"] },
  { slug: "docs", goal: "document it", files: ["docs/login.md"], estimate: { lines: 0, kind: "inert" }, check: "true" },
] };

async function packaged() {
  const s = treeRig();
  provideSkills(s.h, ["tdd-implementation-planner", "code-reviewer"]);
  await s.start(ROOT);
  assert.equal((await s.call("split", PLAN as never)).isError, undefined);
  const form = await s.start({ parent: "auth", child: "form" });
  assert.equal(form.isError, undefined, form.content[0]!.text);
  return { s, worktree: form.details.worktree as string };
}
const spawn = async (h: ReturnType<typeof harness>, name: string, task: unknown) => await h.a.spawn({ name, task } as never);

test("TREE-6", async () => {
  const { s, worktree } = await packaged();
  // a package card: the start member, the node's worktree, the contract, meta.node
  const r = accepted(await spawn(s.h, "p1", card({ kind: "implement", files: ["src/form/a.ts"], package: "auth.form" } as never))) as Placed;
  assert.equal(r.model, QWEN);
  assert.equal(r.cwd, worktree);
  assert.deepEqual([(r.meta as Record<string, unknown>).node, (r.meta as Record<string, unknown>).contact], ["auth.form", undefined]);
  const brief = r.briefAppend!.split("\n");
  for (const l of ["Package auth.form: your contract.", "- goal: build the login form", "- files: src/form/**, test/form.test.ts",
    "- budget: 60 changed lines (code)", "- check: npm test -- form", "- forbidden: src/db/**"]) assert.ok(brief.includes(l), `${l}\n---\n${r.briefAppend}`);
  // a t2 package card: the cloud route, an open-ended contact, still in the node's worktree under its contract
  const t2 = accepted(await spawn(s.h, "p2", card({ package: "auth.form", t2: ["security"] } as never))) as Placed;
  assert.notEqual(t2.model, QWEN);
  assert.equal(t2.cwd, worktree);
  assert.deepEqual([(t2.meta as Record<string, unknown>).node, (t2.meta as Record<string, unknown>).contact], ["auth.form", "open"]);
  assert.ok(t2.briefAppend!.split("\n").includes("- goal: build the login form"));
  // refused: an unknown node, a node that is not active (split), a node that is no package (the request node)
  const why = async (pkg: string) => { const x = await spawn(s.h, `x-${pkg}`, card({ package: pkg } as never)); assert.ok("reject" in x, pkg); return x.reject; };
  assert.equal(await why("nope"), "package nope: unknown node");
  assert.equal(await s.h.router.tree.apply({ op: "state", node: "auth.form", state: "blocked" }), undefined);
  assert.equal(await why("auth.form"), "package auth.form: the node is blocked, not active");
  assert.equal(await s.h.router.tree.apply({ op: "state", node: "auth.form", state: "active" }), undefined);
  const lone = await s.start({ parent: "auth", slug: "lone", goal: "g", check: "true", estimate: { kind: "code", lines: 5 } });
  assert.equal(lone.isError, undefined, lone.content[0]!.text);
  assert.equal(await why("auth.lone"), "package auth.lone: the node is no package of a split (start it with start_branch({parent, child}))");
  // a card field of the wrong type is a card error
  const bad = await spawn(s.h, "x-bad", card({ package: 3 } as never));
  assert.ok("reject" in bad && bad.reject.includes("package: expected string"), JSON.stringify(bad));
});

test("PRO-10 b", async () => {
  const { s } = await packaged();
  // a local kind: the start member, ungated
  const scout = accepted(await spawn(s.h, "k1", card({ kind: "scout", files: ["src/a.ts"] }) as never)) as Placed;
  assert.equal(scout.model, QWEN);
  assert.equal((scout.meta as Record<string, unknown>).ungated, true);
  // a cloud kind and a t2 card: today's planning, as a cloud-first session places them
  const cf = harness();
  provideSkills(cf, ["tdd-implementation-planner", "code-reviewer"]);
  for (const [name, c] of [["k2", card({ kind: "review", files: ["src/a.ts"] })], ["k3", card({ kind: "scout", t2: ["security"] })]] as const) {
    const lf = accepted(await spawn(s.h, name, c as never)) as Placed, today = accepted(await spawn(cf, name, c as never)) as Placed;
    assert.deepEqual([lf.model, lf.thinkingLevel, (lf.meta as Record<string, unknown>).ungated], [today.model, today.thinkingLevel, undefined], name);
  }
  // cloud-first: a package card is placed as today (the field is ignored), no ungated mark
  const ignored = accepted(await spawn(cf, "k4", card({ kind: "scout", package: "auth.form" } as never))) as Placed;
  const plain = accepted(await spawn(cf, "k5", card({ kind: "scout" }) as never)) as Placed;
  assert.deepEqual([ignored.model, ignored.cwd, (ignored.meta as Record<string, unknown>).node, (ignored.meta as Record<string, unknown>).ungated], [plain.model, plain.cwd, undefined, undefined]);
});
