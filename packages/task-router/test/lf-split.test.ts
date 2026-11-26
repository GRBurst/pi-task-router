// Local-first plan LF4.T4 (spec TREE-4, §2.3; plan S37): a split plan is validated by the router, one reason per violation in
// S37's order, and rendered as canonical JSON (sorted keys, two spaces, a trailing newline) of `{v: 1, node, summary, children}`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSplit, validateSplit } from "../core/local/split.ts";
import type { Node, SplitChild, SplitPlan } from "../core/local/tree.ts";

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
