// The work tree (local-first design §5.2; plan S35, spec TREE-3): nodes are branches with worktrees; the request node is
// level 0, a split's children are one level below. The tree is a pure fold of tree ops, so the session's `task-router/tree`
// entries replay to the live tree (S36). Pure: no I/O.
import type { NodeLogInput } from "../outcome.ts";
import type { ContactKind, LadderStep, NodeKind, RoutingProfile } from "../strategy/types.ts";

/** A package's size estimate (spec §2.3). */
export type Estimate = { lines: number; kind: "code" | "plan" | "inert" };
/** One package of a split plan (spec §2.3); `forbidden`: globs the package must not touch. */
export type SplitChild = { slug: string; goal: string; files: string[]; estimate: Estimate; check: string; forbidden?: string[] };
/** A node's split plan (spec §2.3; its file adds `v` and `node`). */
export type SplitPlan = { summary: string; children: SplitChild[] };
export type NodeState = "active" | "split" | "merged" | "blocked" | "abandoned";
/** A node: `id` = the request's slug at level 0, `<parent>.<slug>` below (a dot never occurs in a slug, so ids, branches and
 *  worktrees of different nodes never collide); `profile`: the routing profile it was started in (PRO-6); `started`/`merged`:
 *  the slugs of its split's children that started and merged; `contacts`: counts per contact kind (absent = 0). */
export interface Node {
  id: string; parent?: string; depth: number; kind: NodeKind; branch: string; worktree: string; base: string; profile: RoutingProfile;
  estimate: Estimate; state: NodeState; split?: SplitPlan; started: string[]; merged: string[];
  contacts: Partial<Record<ContactKind, number>>; ladder: LadderStep[]; effort: "xhigh" | "medium";
}
export type TreeOp =
  | { op: "add"; node: Node } | { op: "state"; node: string; state: NodeState }
  | { op: "split"; node: string; plan: SplitPlan } | { op: "contact"; node: string; kind: ContactKind }
  | { op: "ladder"; node: string; step: LadderStep } | { op: "fit"; node: string; child: SplitChild };
export type Tree = { readonly nodes: Readonly<Record<string, Node>> };
export const EMPTY_TREE: Tree = { nodes: {} };

/** `name` passes `git check-ref-format --branch` (its rules, without git; test/merge-log.test.ts compares them with git). A
 *  node's branch must (review m2: the child `lock` of `auth` would be `lm/auth.lock`, a name git refuses). */
export const refFormatOk = (name: string): boolean =>
  name !== "" && name !== "@" && name.length <= 256 && !name.startsWith("-") && !name.startsWith("/") && !name.endsWith("/") &&
  !name.endsWith(".") && !/[\x00-\x20\x7f~^:?*[\\]|\.\.|@\{|\/\//.test(name) &&
  name.split("/").every((c) => !c.startsWith(".") && !c.endsWith(".lock"));
/** The slug of a child node within its parent's split (the request node: its id). */
export const slugOf = (n: Pick<Node, "id" | "parent">): string => (n.parent === undefined ? n.id : n.id.slice(n.parent.length + 1));
const put = (t: Tree, ...ns: Node[]): Tree => ({ nodes: { ...t.nodes, ...Object.fromEntries(ns.map((n) => [n.id, n])) } });
const add = (xs: readonly string[], x: string): string[] => (xs.includes(x) ? [...xs] : [...xs, x]);

/** One op: the new tree, or the tree unchanged and the problem (an unknown node, a second add of an id, a fit without a split,
 *  a split of a node that is split or not active). */
export function step(t: Tree, o: TreeOp): { tree: Tree; problem?: string } {
  const keep = (problem: string) => ({ tree: t, problem });
  if (o.op === "add") {
    const n = structuredClone(o.node), p = n.parent === undefined ? undefined : t.nodes[n.parent];
    if (Object.hasOwn(t.nodes, n.id)) return keep(`tree: node ${n.id} exists`);
    if (n.parent !== undefined && !p) return keep(`tree: unknown parent ${n.parent} of ${n.id}`);
    return { tree: p ? put(t, n, { ...p, started: add(p.started, slugOf(n)) }) : put(t, n) };
  }
  const n = Object.hasOwn(t.nodes, o.node) ? t.nodes[o.node]! : undefined;
  if (!n) return keep(`tree: unknown node ${o.node} (${o.op})`);
  switch (o.op) {
    case "state": {
      const p = o.state === "merged" && n.parent !== undefined ? t.nodes[n.parent] : undefined;
      const next = { ...n, state: o.state };
      return { tree: p ? put(t, next, { ...p, merged: add(p.merged, slugOf(n)) }) : put(t, next) };
    }
    case "split": { // review m4: only an active node that is not split yet splits (a second, concurrent split is refused)
      if (n.state !== "active" || n.split) return keep(`tree: node ${n.id} is ${n.state}${n.split ? " (split already)" : ""}: no split`);
      return { tree: put(t, { ...n, state: "split", split: structuredClone(o.plan) }) };
    }
    case "contact": return { tree: put(t, { ...n, contacts: { ...n.contacts, [o.kind]: (n.contacts[o.kind] ?? 0) + 1 } }) };
    case "ladder": return { tree: put(t, { ...n, ladder: [...n.ladder, o.step] }) };
    case "fit": {
      if (!n.split) return keep(`tree: node ${n.id} has no split to add ${o.child.slug} to`);
      return { tree: put(t, { ...n, split: { ...n.split, children: [...n.split.children, structuredClone(o.child)] } }) };
    }
    default: { const _: never = o; return keep(`tree: unknown op ${JSON.stringify(_)}`); }
  }
}
/** Pure: an unknown node leaves the tree unchanged (its problem: `step`). */
export const apply = (t: Tree, o: TreeOp): Tree => step(t, o).tree;
export const replay = (ops: readonly TreeOp[]): Tree => ops.reduce(apply, EMPTY_TREE);

/** The tree's caps (spec §2.1 `localFirst.tree`, the strategy's `treeCaps`). */
export type Caps = { maxDepth: number; maxChildren: number; planLines: number };
/** TREE-2: the reason a split of `id` into `n` children is refused (the cap named), or undefined. The request node is level 0; a
 *  split puts its children one level below, at most `maxDepth`. */
export function canSplit(t: Tree, id: string, n: number, caps: Caps): string | undefined {
  const node = Object.hasOwn(t.nodes, id) ? t.nodes[id] : undefined;
  if (!node) return `unknown node ${id}`;
  if (node.depth + 1 > caps.maxDepth) return `node ${id} is at depth ${node.depth}: its children would exceed maxDepth ${caps.maxDepth}`;
  if (n > caps.maxChildren) return `${n} children exceed maxChildren ${caps.maxChildren}`;
  return undefined;
}

/** The node `id`, or undefined (own keys only: an id is model text). */
export const nodeOf = (t: Tree, id: string): Node | undefined => (Object.hasOwn(t.nodes, id) ? t.nodes[id] : undefined);
/** TREE-5: the package `slug` of `parent`'s recorded split, to start as a child node; else the reason it cannot start (the parent
 *  is unknown or not split, the slug is not in the split or started already). */
export function startable(t: Tree, parent: string, slug: string): SplitChild | string {
  const p = nodeOf(t, parent);
  if (!p) return `unknown node ${parent}`;
  if (p.state !== "split" || !p.split) return `node ${parent} is ${p.state}, not split: split it first`;
  const c = p.split.children.find((x) => x.slug === slug);
  if (!c) return `the split of ${parent} has no child ${slug}`;
  if (p.started.includes(slug)) return `${parent}.${slug} is started already`;
  return structuredClone(c);
}
/** The level-0 node above `id` (itself at level 0); undefined for an unknown node. */
export function rootOf(t: Tree, id: string): Node | undefined {
  let n = nodeOf(t, id);
  for (let i = 0; n?.parent !== undefined && i < 64; i++) n = nodeOf(t, n.parent);
  return n;
}
/** TREE-11: the `node` line of `n` after a state change (`outcome`: its new state, `started` for `active`). `tier`: the session
 *  tier (SIZE-3) is `standard` until LF5 wires `sessionTier(arms)`; an inert node has no budget. */
export const nodeLine = (n: Node): Omit<NodeLogInput, "now"> => ({
  node: n.id, ...(n.parent !== undefined && { parent: n.parent }), depth: n.depth, kind: n.kind, fanout: n.split?.children.length ?? 0,
  outcome: n.state === "active" ? "started" : n.state, tier: n.estimate.kind === "inert" ? "inert" : "standard", profile: n.profile,
});
/** A node still open: not merged, blocked or abandoned. */
export const isOpen = (n: Node): boolean => n.state === "active" || n.state === "split";
/** The node of a branch (a node's branch is unique: `<prefix><id>`). */
export const nodeOfBranch = (t: Tree, branch: string): Node | undefined => Object.values(t.nodes).find((n) => n.branch === branch);
/** PRO-6: an open node started in `profile` exists (its merge keeps that profile's gate after a switch). */
export const openIn = (t: Tree, profile: RoutingProfile): boolean => Object.values(t.nodes).some((n) => isOpen(n) && n.profile === profile);
/** The ids of `n`'s started children not merged yet (D65: while there is one, `n` does not merge). */
export const openChildren = (n: Pick<Node, "id" | "started" | "merged">): string[] =>
  n.started.filter((s) => !n.merged.includes(s)).map((s) => `${n.id}.${s}`);
/** TREE-7 f: the branches of the open parents, nodes with a started child not merged yet; the git guard protects them as main. */
export const openParents = (t: Tree): string[] =>
  Object.values(t.nodes).filter((n) => openChildren(n).length > 0).map((n) => n.branch);
/** TREE-6, TREE-14: a package node's contract, the child of its parent's split it was started from; undefined for a root and a
 *  node started without `child`. */
export function contractOf(t: Tree, n: Pick<Node, "id" | "parent">): SplitChild | undefined {
  const p = n.parent === undefined ? undefined : nodeOf(t, n.parent);
  return p?.split?.children.find((c) => c.slug === slugOf(n));
}
/** TREE-7 a: the parent node of the node whose branch is `branch`; undefined for a root or a nodeless branch. */
export function parentOf(t: Tree, branch: string): Node | undefined {
  const n = nodeOfBranch(t, branch);
  return n?.parent === undefined ? undefined : nodeOf(t, n.parent);
}
