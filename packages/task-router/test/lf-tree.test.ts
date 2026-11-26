// Local-first plan LF4.T1 (spec TREE-3, plan S35): the work tree is a pure fold of tree ops. `replay(ops)` = folding
// `apply` from the empty tree; an op on an unknown node leaves the tree unchanged and yields one problem.
import { test } from "node:test";
import assert from "node:assert/strict";
import { seeded } from "./rand.ts";
import { EMPTY_TREE, apply, replay, step, type Node, type TreeOp } from "../core/local/tree.ts";
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
