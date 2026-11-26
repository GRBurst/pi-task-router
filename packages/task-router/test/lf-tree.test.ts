// Local-first plan LF4.T1 (spec TREE-3, plan S35): the work tree is a pure fold of tree ops. `replay(ops)` = folding
// `apply` from the empty tree; an op on an unknown node leaves the tree unchanged and yields one problem.
import { test } from "node:test";
import assert from "node:assert/strict";
import { seeded } from "./rand.ts";
import { EMPTY_TREE, apply, canSplit, replay, step, type Node, type Tree, type TreeOp } from "../core/local/tree.ts";
import { localFirst } from "../core/strategy/local-first.ts";
import { defaults, parseSettings } from "../core/settings.ts";
import { TREE_TYPE } from "../core/local/treestore.ts";
import { harness } from "./harness.ts";
import type { ContactKind, LadderStep } from "../core/strategy/types.ts";

const CONTACTS: ContactKind[] = ["review", "plan-review", "integration", "corrective", "handoff", "spot", "fit"];
const STEPS: LadderStep[] = ["retry-xhigh", "split", "corrective", "handoff", "steer", "stop"];
const STATES: Node["state"][] = ["active", "split", "merged", "blocked", "abandoned"];
const child = (slug: string) => ({ slug, goal: "g", files: ["src/a.ts"], estimate: { lines: 10, kind: "code" as const }, check: "true" });
export const node = (id: string, parent?: { id: string; depth: number }, over: Partial<Node> = {}): Node => ({
  id, ...(parent && { parent: parent.id }), depth: parent ? parent.depth + 1 : 0, kind: parent ? "leaf" : "plan",
  branch: `lm/${id}`, worktree: `/r/.worktrees/${id}`, base: "0".repeat(40), profile: "local-first",
  estimate: { lines: 0, kind: parent ? "code" : "plan" }, state: "active", started: [], merged: [], contacts: {}, ladder: [], effort: "xhigh", ...over,
});

/** Random ops over a small id space, some on ids never added. */
function randomOps(rnd: (n: number) => number): TreeOp[] {
  const ops: TreeOp[] = [], known: { id: string; depth: number }[] = [];
  for (let n = 1 + rnd(25); n > 0; n--) {
    const k = rnd(7), pick = known.length && rnd(5) ? known[rnd(known.length)]!.id : `ghost${rnd(3)}`;
    if (k === 0 || known.length === 0) {
      const p = known.length && rnd(3) ? known[rnd(known.length)] : undefined;
      const id = p ? `${p.id}.c${rnd(4)}` : `r${rnd(3)}`;
      ops.push({ op: "add", node: node(id, p) });
      if (!known.some((x) => x.id === id)) known.push({ id, depth: p ? p.depth + 1 : 0 });
    } else if (k === 1) ops.push({ op: "state", node: pick, state: STATES[rnd(STATES.length)]! });
    else if (k === 2) ops.push({ op: "split", node: pick, plan: { summary: "s", children: [child("c0"), child("c1")] } });
    else if (k === 3) ops.push({ op: "contact", node: pick, kind: CONTACTS[rnd(CONTACTS.length)]! });
    else if (k === 4) ops.push({ op: "ladder", node: pick, step: STEPS[rnd(STEPS.length)]! });
    else ops.push({ op: "fit", node: pick, child: { ...child("fix"), estimate: { lines: 5, kind: "code" } } });
  }
  return ops;
}

test("TREE-3 replay", () => {
  const rnd = seeded(43);
  let unknown = 0, added = 0;
  for (let i = 0; i < 300; i++) {
    const ops = randomOps(rnd);
    assert.deepEqual(replay(ops), ops.reduce(apply, EMPTY_TREE), "replay = folding apply");
    let t = EMPTY_TREE;
    for (const o of ops) {
      const r = step(t, o);
      const target = o.op === "add" ? o.node.parent : o.node;
      if (target !== undefined && !Object.hasOwn(t.nodes, target)) {
        unknown++;
        assert.deepEqual(r.tree, t, `an op on the unknown node ${target} leaves the tree unchanged`);
        assert.equal(typeof r.problem, "string", "one problem");
      } else if ((o.op === "add" && Object.hasOwn(t.nodes, o.node.id)) || (o.op === "fit" && !t.nodes[o.node]!.split)) {
        assert.deepEqual(r.tree, t, "a second add of an id, or a fit without a split, changes nothing");
        assert.equal(typeof r.problem, "string");
      } else {
        assert.equal(r.problem, undefined, JSON.stringify(o));
        if (o.op === "add") added++;
      }
      t = r.tree;
    }
  }
  assert.ok(unknown > 50 && added > 50, `both kinds exercised (${unknown}, ${added})`);
});

test("TREE-3 ops: started, merged, split, contacts, ladder, fit", () => {
  const root = node("req");
  let t = replay([
    { op: "add", node: root },
    { op: "split", node: "req", plan: { summary: "two", children: [child("a"), child("b")] } },
    { op: "add", node: node("req.a", root) },
    { op: "contact", node: "req.a", kind: "review" }, { op: "contact", node: "req.a", kind: "review" },
    { op: "ladder", node: "req.a", step: "retry-xhigh" },
    { op: "state", node: "req.a", state: "merged" },
    { op: "fit", node: "req", child: child("fix") },
  ]);
  assert.equal(t.nodes.req!.state, "split");
  assert.deepEqual(t.nodes.req!.started, ["a"]);
  assert.deepEqual(t.nodes.req!.merged, ["a"]);
  assert.deepEqual(t.nodes.req!.split!.children.map((c) => c.slug), ["a", "b", "fix"]);
  assert.equal(t.nodes["req.a"]!.contacts.review, 2);
  assert.deepEqual(t.nodes["req.a"]!.ladder, ["retry-xhigh"]);
  t = apply(t, { op: "state", node: "req.a", state: "merged" });
  assert.deepEqual(t.nodes.req!.merged, ["a"], "merged once");
  assert.equal(step(t, { op: "fit", node: "req.a", child: child("x") }).problem !== undefined, true, "fit needs a split");
});

// LF4.T2 (spec TREE-2, S35): a split may not put a child below `maxDepth` (levels 1…maxDepth under the request's 0) nor give a
// node more than `maxChildren` children; the refusal names the cap. The caps come from the strategy (settings now; E6/E15 later).
test("TREE-2", () => {
  const caps = localFirst(defaults()).treeCaps({});
  assert.deepEqual(caps, { maxDepth: 3, maxChildren: 5, planLines: 150 });
  const chain = (depth: number): Tree => {
    const ops: TreeOp[] = [];
    let p: { id: string; depth: number } | undefined;
    for (let d = 0; d <= depth; d++) { const n = node(p ? `${p.id}.n${d}` : "req", p); ops.push({ op: "add", node: n }); p = { id: n.id, depth: d }; }
    return replay(ops);
  };
  const deep = chain(3), at3 = Object.values(deep.nodes).find((n) => n.depth === 3)!.id;
  assert.match(canSplit(deep, at3, 2, caps) ?? "", /maxDepth 3/);
  const at2 = Object.values(deep.nodes).find((n) => n.depth === 2)!.id;
  assert.equal(canSplit(deep, at2, 5, caps), undefined, "depth 2 with 5 children is allowed");
  assert.match(canSplit(deep, at2, 6, caps) ?? "", /maxChildren 5/);
  assert.match(canSplit(deep, "nope", 1, caps) ?? "", /unknown node nope/);
  const tight = localFirst(parseSettings({ localFirst: { tree: { maxDepth: 1, maxChildren: 2, planLines: 40 } } }).settings).treeCaps({});
  assert.deepEqual(tight, { maxDepth: 1, maxChildren: 2, planLines: 40 });
  assert.match(canSplit(deep, "req.n1", 1, tight) ?? "", /maxDepth 1/);
  assert.equal(canSplit(deep, "req", 2, tight), undefined);
});

// LF4.T3 (spec TREE-3, §2.2, S36): every tree op is one `task-router/tree` entry `{v: 1, …op}`; session_start replays them. A
// fold keeps the entries and drops messages; the resumed session's tree deep-equals the live one.
test("TREE-3 resume", () => {
  const rnd = seeded(7);
  const lf = { profile: "local-first", localFirst: { experimental: true } } as never;
  for (let i = 0; i < 40; i++) {
    const live = harness({ settings: lf });
    live.f.fire("session_start", { reason: "startup" }, { sessionManager: { getSessionId: () => "s-tree", getBranch: () => [] } });
    let problems = 0;
    const ops = randomOps(rnd);
    for (const o of ops) if (live.router.tree.apply(o) !== undefined) problems++;
    const written = live.f.entries.filter((e) => e.type === TREE_TYPE);
    assert.equal(written.length, ops.length - problems, "one entry per op that changed the tree");
    for (const e of written) assert.equal((e.data as { v?: unknown }).v, 1);
    // a fold: entries kept, messages dropped (none here but the noise below); a malformed entry is ignored
    const branch = [{ type: "message" }, ...live.f.entries.map((e) => ({ type: "custom", customType: e.type, data: e.data })),
      { type: "custom", customType: TREE_TYPE, data: { v: 2, op: "add", node: node("later") } }, { type: "custom", customType: TREE_TYPE, data: null }];
    const resumed = harness({ settings: lf });
    resumed.f.fire("session_start", { reason: "resume" }, { sessionManager: { getSessionId: () => "s-tree", getBranch: () => branch } });
    assert.deepEqual(resumed.router.tree.tree(), live.router.tree.tree());
  }
});
