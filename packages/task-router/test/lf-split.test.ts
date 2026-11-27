// Local-first plan LF4.T4 (spec TREE-4, §2.3; plan S37): a split plan is validated by the router, one reason per violation in
// S37's order, and rendered as canonical JSON (sorted keys, two spaces, a trailing newline) of `{v: 1, node, summary, children}`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSplit, validateSplit } from "../core/local/split.ts";
import type { Node, SplitChild, SplitPlan } from "../core/local/tree.ts";
import { planLinesOf } from "../core/local/splittool.ts";
import { treeRig } from "./tree-rig.ts";

const CAPS = { maxDepth: 3, maxChildren: 5, planLines: 150 };
const kid = (slug: string, over: Partial<SplitChild> = {}): SplitChild =>
  ({ slug, goal: "add the parser", files: ["src/parse.ts", "test/parse.test.ts"], estimate: { lines: 80, kind: "code" }, check: "npm test", ...over });
const plan = (over: Partial<SplitPlan> = {}): SplitPlan => ({ summary: "parser, then the CLI", children: [kid("parser"), kid("cli")], ...over });
const root = (over: Partial<Node> = {}): Node => ({ id: "req", depth: 0, kind: "plan", branch: "lm/req", worktree: "/r/w/req", base: "0".repeat(40),
  profile: "local-first", estimate: { lines: 0, kind: "plan" }, state: "active", started: [], merged: [], contacts: {}, ladder: [], effort: "xhigh", ...over });
const only = (p: unknown, n: Node | undefined, want: RegExp) => {
  const r = validateSplit(p, n, CAPS);
  assert.equal(r.length, 1, `exactly one reason: ${JSON.stringify(r)}`);
  assert.match(r[0]!, want);
};

test("TREE-4 valid", () => {
  assert.deepEqual(validateSplit(plan(), root(), CAPS), []);
  assert.deepEqual(validateSplit(plan({ children: [kid("a", { forbidden: ["src/cli/**"] })] }), root({ depth: 2 }), CAPS), []);
});
test("TREE-4 summary", () => {
  only(plan({ summary: "" }), root(), /^summary: /);
  only(plan({ summary: "x".repeat(401) }), root(), /^summary: /);
});
test("TREE-4 children count", () => {
  only(plan({ children: [] }), root(), /^children: .*maxChildren 5/);
  only(plan({ children: ["a", "b", "c", "d", "e", "f"].map((s) => kid(s)) }), root(), /^children: .*maxChildren 5/);
});
test("TREE-4 slugs", () => {
  only(plan({ children: [kid("Bad_Slug")] }), root(), /^children\[0\]\.slug: must match/);
  only(plan({ children: [kid("a"), kid("a")] }), root(), /^children\[1\]\.slug: duplicate a/);
});
test("TREE-4 slugs make valid branch names (review m2)", () => {
  // `<node>.lock` ends a ref component in .lock: git check-ref-format refuses it, so that child could never start
  only(plan({ children: [kid("a"), kid("lock")] }), root(), /^children\[1\]\.slug: lock makes the branch lm\/req\.lock, which git refuses/);
  // the node's own branch name rules apply too (a prefix git refuses)
  only(plan({ children: [kid("a")] }), root({ branch: "lm/.req" }), /^children\[0\]\.slug: a makes the branch lm\/\.req\.a, which git refuses/);
  assert.deepEqual(validateSplit(plan({ children: [kid("locks"), kid("lock-x")] }), root(), CAPS), []);
});
test("TREE-4 goal", () => only(plan({ children: [kid("a", { goal: "g".repeat(401) })] }), root(), /^children\[0\]\.goal: /));
test("TREE-4 files", () => {
  only(plan({ children: [kid("a", { files: [] })] }), root(), /^children\[0\]\.files: 1 to 30/);
  only(plan({ children: [kid("a", { files: Array.from({ length: 31 }, (_, i) => `f${i}`) })] }), root(), /^children\[0\]\.files: 1 to 30/);
  only(plan({ children: [kid("a", { files: ["src/../etc/x"] })] }), root(), /^children\[0\]\.files: src\/\.\.\/etc\/x/);
  only(plan({ children: [kid("a", { files: ["/etc/passwd"] })] }), root(), /^children\[0\]\.files: \/etc\/passwd/);
});
test("TREE-4 estimate", () => {
  only(plan({ children: [kid("a", { estimate: { lines: 1.5, kind: "code" } })] }), root(), /^children\[0\]\.estimate: /);
  only(plan({ children: [kid("a", { estimate: { lines: -1, kind: "code" } })] }), root(), /^children\[0\]\.estimate: /);
  only(plan({ children: [kid("a", { estimate: { lines: 3, kind: "docs" as never } })] }), root(), /^children\[0\]\.estimate: /);
});
test("TREE-4 check", () => only(plan({ children: [kid("a", { check: "" })] }), root(), /^children\[0\]\.check: /));
test("TREE-4 node state", () => {
  only(plan(), root({ state: "merged" }), /^node req is merged/);
  only(plan(), root({ state: "active", split: plan() }), /^node req is split already/);
  only(plan(), undefined, /^unknown node/);
});
test("TREE-4 depth", () => only(plan(), root({ depth: 3 }), /maxDepth 3/));
test("TREE-4 malformed input", () => {
  assert.ok(validateSplit(null, root(), CAPS).length >= 1);
  only({ summary: "s", children: "x" }, root(), /^children: /);
  only({ summary: "s", children: [null] }, root(), /^children\[0\]: /);
});
test("TREE-4 rendering is canonical and byte-stable", () => {
  const p = plan({ children: [kid("a", { forbidden: ["x/**"] })] });
  const text = renderSplit("req", p);
  assert.equal(text, `{
  "children": [
    {
      "check": "npm test",
      "estimate": {
        "kind": "code",
        "lines": 80
      },
      "files": [
        "src/parse.ts",
        "test/parse.test.ts"
      ],
      "forbidden": [
        "x/**"
      ],
      "goal": "add the parser",
      "slug": "a"
    }
  ],
  "node": "req",
  "summary": "parser, then the CLI",
  "v": 1
}
`);
  const shuffled = JSON.parse(JSON.stringify({ children: [{ slug: "a", check: "npm test", forbidden: ["x/**"], goal: "add the parser",
    files: ["src/parse.ts", "test/parse.test.ts"], estimate: { lines: 80, kind: "code" }, extra: 1 }], summary: "parser, then the CLI" }));
  assert.equal(renderSplit("req", shuffled), text, "key order and unknown keys do not change the bytes");
});

/** A plan for `node` whose rendering has exactly `n` lines (one more file adds one line). */
const sized = (node: string, n: number): SplitPlan => {
  const p = plan({ children: ["a", "b", "c", "d", "e"].map((x) => kid(x, { files: [`src/${x}.ts`] })) });
  for (let i = 0; planLinesOf(node, p) < n; i++) p.children[i % 5]!.files.push(`src/p${i}.ts`);
  assert.equal(planLinesOf(node, p), n);
  return p;
};

test("SIZE-4 split children above the budget (review lf56 M2)", async () => {
  // a code child whose estimate is above the session tier's package budget is refused at the split, naming the child and the
  // budget (its start would be refused, and a split node cannot split again); at the budget, inert and plan children pass
  const kids = [kid("big", { estimate: { lines: 151, kind: "code" } }), kid("fits", { estimate: { lines: 150, kind: "code" } }),
    kid("docs", { estimate: { lines: 900, kind: "inert" } }), kid("sub", { estimate: { lines: 900, kind: "plan" } })];
  const r = validateSplit(plan({ children: kids }), root(), CAPS, { lines: 150, tier: "standard" });
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.ok(r[0]!.startsWith("children[0].estimate: big: ") && r[0]!.includes("151 changed lines") && r[0]!.includes("budget of 150 changed lines (tier standard)"), r[0]);
  assert.deepEqual(validateSplit(plan({ children: kids }), root(), CAPS), [], "no budget given: no size rule");
  // the split tool gives the session tier's budget: refused, nothing committed or logged
  const s = treeRig();
  await s.start({ slug: "req", goal: "the parser", check: "true", estimate: { lines: 0, kind: "plan" } });
  const no = await s.call("split", { node: "req", ...plan({ children: [kid("big", { estimate: { lines: 151, kind: "code" } })] }) } as never);
  assert.equal(no.isError, true);
  assert.ok(no.content[0]!.text.startsWith("children[0].estimate: big: "), no.content[0]!.text);
  assert.deepEqual(s.h.lines().filter((l) => l.event === "split"), []);
});

test("SIZE-10", async () => {
  // above planLines: accepted, one crossing of kind plan against planLines
  const s = treeRig();
  await s.start({ slug: "req", goal: "the parser", check: "true", estimate: { lines: 0, kind: "plan" } });
  const ok = await s.call("split", sized("req", 151) as never);
  assert.equal(ok.isError, undefined, ok.content[0]!.text);
  const c = s.h.lines().filter((l) => l.event === "crossing");
  assert.deepEqual(c.map((l) => [l.node, l.stage, l.lines, l.budget, l.estimate, l.tier, l.class, l.depth, l.kind]),
    [["req", 100, 151, 150, 0, "standard", "standard", 0, "plan"]]);
  for (const f of ["turn", "call", "sinceStartMs"]) assert.equal(typeof c[0]![f], "number", f);
  // at planLines: no crossing
  const at = treeRig();
  await at.start({ slug: "req", goal: "the parser", check: "true", estimate: { lines: 0, kind: "plan" } });
  assert.equal((await at.call("split", sized("req", 150) as never)).isError, undefined);
  assert.deepEqual(at.h.lines().filter((l) => l.event === "crossing"), []);
  // more than maxChildren: refused with TREE-2's reason, no crossing
  const six = await at.call("split", { node: "req", ...plan({ children: ["a", "b", "c", "d", "e", "f"].map((x) => kid(x)) }) } as never);
  assert.equal(six.isError, true);
  assert.match(six.content[0]!.text, /children: 6; a split has 1 to maxChildren 5/);
  assert.deepEqual(at.h.lines().filter((l) => l.event === "crossing"), []);
});

// ---- R3A.T2 (owner B10, review LF4 m7; spec TREE-15): a split stays inside the node's contract ----
const FORM: SplitChild = { slug: "form", goal: "the login form", files: ["src/form/**", "test/form.test.ts"], estimate: { lines: 60, kind: "code" },
  check: "true", forbidden: ["src/db/**"] };
const formNode = (): Node => root({ id: "auth.form", depth: 1, branch: "lm/auth.form" });
const within = (files: string[], contract: SplitChild | null = FORM) =>
  validateSplit(plan({ children: [kid("a", { files })] }), formNode(), CAPS, undefined, contract ?? undefined);

test("TREE-15 contract: a file outside the contract's files is refused, naming the path", () => {
  assert.deepEqual(within(["src/other.ts"]), ["children[0].files: src/other.ts is outside the contract of auth.form (src/form/**, test/form.test.ts)"]);
  // one reason per path, in order, each child by its index
  assert.deepEqual(validateSplit(plan({ children: [kid("a", { files: ["src/form/a.ts", "docs/x.md"] }), kid("b", { files: ["lib/y.ts", "src/form/b.ts", "src/z.ts"] })] }),
    formNode(), CAPS, undefined, FORM).map((r) => r.split(" is ")[0]), ["children[0].files: docs/x.md", "children[1].files: lib/y.ts", "children[1].files: src/z.ts"]);
  // inside: the contract's own paths and globs, narrower globs, the test file
  assert.deepEqual(within(["src/form/a.ts", "src/form/ui/b.ts", "src/form/**", "src/form/ui/**", "src/form/*.ts", "test/form.test.ts"]), []);
  // a glob that reaches beyond the contract is outside, however it is written
  for (const wide of ["src/**", "**", "src/*", "**/*.ts", "src/form*", "test/*.ts"]) {
    const r = within([wide]);
    assert.equal(r.length, 1, `${wide}: ${JSON.stringify(r)}`);
    assert.ok(r[0]!.startsWith(`children[0].files: ${wide} is outside the contract of auth.form`), r[0]);
  }
});

test("TREE-15 contract: a file inside the contract's forbidden is refused; a root and a contractless node are not checked", () => {
  const wide: SplitChild = { ...FORM, files: ["src/**"] };
  assert.deepEqual(within(["src/db/x.ts"], wide), ["children[0].files: src/db/x.ts is in the forbidden of auth.form (src/db/**)"]);
  assert.deepEqual(within(["src/db/**"], wide), ["children[0].files: src/db/** is in the forbidden of auth.form (src/db/**)"]);
  assert.deepEqual(within(["src/form/x.ts", "src/db"], wide).length, 0, "a path next to the forbidden glob is fine");
  assert.deepEqual(within(["src/other.ts"], null), [], "no contract: the node is a root, or started without child");
  // a path the plan's own rule refuses (..) gets that one reason only
  assert.deepEqual(within(["src/form/../x"]).map((r) => r.split(":")[0]), ["children[0].files"]);
  assert.match(within(["src/form/../x"])[0]!, /must be relative, without \.\./);
});

const ROOT = { slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } };
const PLAN: SplitPlan = { summary: "form and docs", children: [FORM,
  { slug: "docs", goal: "document it", files: ["docs/login.md"], estimate: { lines: 0, kind: "inert" }, check: "true" }] };

test("TREE-15", async () => {
  const s = treeRig();
  await s.start(ROOT);
  assert.equal((await s.call("split", PLAN as never)).isError, undefined);
  assert.equal((await s.start({ parent: "auth", child: "form" })).isError, undefined);
  const before = [s.ops().length, s.h.lines().filter((l) => l.event === "split").length];
  // the proposed RED: a child outside the contract is refused naming the path; nothing committed, recorded or logged
  const no = await s.call("split", { node: "auth.form", summary: "x", children: [{ ...kid("other"), files: ["src/other.ts"] }] } as never);
  assert.equal(no.isError, true);
  assert.equal(no.content[0]!.text, "children[0].files: src/other.ts is outside the contract of auth.form (src/form/**, test/form.test.ts)");
  assert.deepEqual([s.ops().length, s.h.lines().filter((l) => l.event === "split").length], before);
  assert.equal(s.h.router.tree.tree().nodes["auth.form"]!.split, undefined);
  assert.throws(() => s.r.git(["show", `lm/auth.form:${s.h.router.settings.plans.dir}/split/auth.form.json`]));
  // inside: accepted; the children inherit the node's forbidden (theirs follow, no duplicate), in the tree and in the committed file
  const ok = await s.call("split", { node: "auth.form", summary: "two", children: [
    { ...kid("fields"), files: ["src/form/fields.ts"] },
    { ...kid("ui"), files: ["src/form/ui/**"], forbidden: ["src/db/**", "src/form/ui/old/**"] }] } as never);
  assert.equal(ok.isError, undefined, ok.content[0]!.text);
  const split = s.h.router.tree.tree().nodes["auth.form"]!.split!;
  assert.deepEqual(split.children.map((c) => c.forbidden), [["src/db/**"], ["src/db/**", "src/form/ui/old/**"]]);
  const file = JSON.parse(s.r.git(["show", `lm/auth.form:${s.h.router.settings.plans.dir}/split/auth.form.json`]));
  assert.deepEqual(file.children.map((c: SplitChild) => c.forbidden), [["src/db/**"], ["src/db/**", "src/form/ui/old/**"]]);
  // the root has no contract: its split is free, and a node's own forbidden is not invented for it
  const free = treeRig();
  await free.start(ROOT);
  const top = await free.call("split", { node: "auth", summary: "anything", children: [{ ...kid("any"), files: ["whatever/x.ts"] }] } as never);
  assert.equal(top.isError, undefined, top.content[0]!.text);
  assert.equal(free.h.router.tree.tree().nodes.auth!.split!.children[0]!.forbidden, undefined);
});
