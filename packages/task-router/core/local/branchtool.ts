// The `start_branch` tool (design §3.3.2; plan D48): the main session's way to a worktree. The logic is `startBranch`; this is
// the tool's shape: the schema, and the result as text plus `details`. In a local-first session it starts a node of the work
// tree (local-first spec §2.3, TREE-1): `parent` cuts it from that node's tip, else from the main tip (the request node, D65).
import type { NodeLogInput, SplitLogInput } from "../outcome.ts";
import type { Arms, Strategy } from "../strategy/types.ts";
import type { Result } from "../types.ts";
import { nodeLine, nodeOf, startable, type Caps, type Estimate, type Node, type SplitChild } from "./tree.ts";
import type { TreeStore } from "./treestore.ts";
import { startBranch, type StartDeps, type Started } from "./worktree.ts";

export type ToolReply = { content: { type: "text"; text: string }[]; details: unknown; isError?: boolean };
export type RouterTool = {
  name: string; label: string; description: string; parameters: unknown;
  execute(id: string, params: any, signal: unknown, onUpdate: unknown, ctx: any): Promise<ToolReply>;
};
/** Design §3.3.2, verbatim. */
export const START_BRANCH_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    slug: { type: "string", pattern: "^[a-z0-9-]{1,40}$" },
    plan: { type: "object", required: ["slug", "id"], properties: { slug: { type: "string" }, id: { type: "string" } } },
    goal: { type: "string", maxLength: 300 },
    check: { type: "string", maxLength: 300 },
    repo: { type: "string", description: "absolute path; default: the session cwd's repository" },
  },
};
const ESTIMATE_KINDS: readonly Estimate["kind"][] = ["code", "plan", "inert"];
/** Local-first spec §2.3: today's fields + `parent`, `child`, `estimate` (registered when `localFirst.experimental` is on). */
export const START_NODE_SCHEMA = {
  ...START_BRANCH_SCHEMA,
  properties: {
    ...START_BRANCH_SCHEMA.properties,
    parent: { type: "string", description: "a node id: the new node branches off that node's tip; absent: off the main branch" },
    child: { type: "string", pattern: "^[a-z0-9-]{1,40}$", description: "a slug of the parent's recorded split" },
    estimate: { type: "object", additionalProperties: false, required: ["lines", "kind"],
      properties: { lines: { type: "integer", minimum: 0 }, kind: { type: "string", enum: ESTIMATE_KINDS } } },
  },
};

/** The error shape of D48: the reason as text, `{status: "error", reason}` as details, `isError`. */
export const errorReply = (reason: string): ToolReply => ({ content: [{ type: "text", text: reason }], details: { status: "error", reason }, isError: true });

/** The work tree's ports (local-first): the store, whether the session is local-first now, the caps, the `node` and `split` lines;
 *  the strategy (D60, the composition the shell built) and the session's arms (S33). */
export type NodeDeps = { tree: TreeStore; localFirst(): boolean; caps(): Caps; strategy: Strategy; arms(): Arms;
  /** The arms of one review (LF14.T1, S33): `id=level` of the enabled factors whose unit is a review (E3), drawn for `unit`, the
   *  reviewing node's id and the reviewed commit (`<node>:<commit>`: a parent's review of its last child's commit is another
   *  review); none when absent. The session's `arms` hold no review factor. */
  reviewArms?(unit: string): string[];
  log: { node(i: Omit<NodeLogInput, "now">): void; split(i: Omit<SplitLogInput, "now">): void } };
const fail = (e: string): Result<never> => ({ ok: false, errors: [e] });
const estimateOf = (x: unknown): Estimate | undefined => {
  const e = x as Partial<Estimate> | null;
  return typeof e === "object" && e !== null && Number.isInteger(e.lines) && e.lines! >= 0 && ESTIMATE_KINDS.includes(e.kind!)
    ? { lines: e.lines!, kind: e.kind! } : undefined;
};

/** SIZE-4: the start refusal's prefix; no other tool result starts with it. */
export const SIZE_REFUSAL = "size: ";
/** SIZE-4 (design §5.3): the refusal of an estimate above the session tier's package budget; it says how to split. */
export const sizeRefusal = (lines: number, budget: number, tier: string, maxChildren: number): string =>
  `${SIZE_REFUSAL}the estimate of ${lines} changed lines is above the package budget of ${budget} changed lines (tier ${tier}); ` +
  `split it: call split with at most ${maxChildren} children, then start each with start_branch({parent, child})`;

/** `start_branch` in a local-first session (TREE-1): a slug start is a node; the same node again re-activates it (no second op
 *  or line). A plan unit (L7) stays a plain branch. Validates before it touches git, so a refusal changes nothing. */
export async function startNode(d: StartDeps, n: NodeDeps, input: unknown, cwd: string): Promise<Result<Started & { node?: string }>> {
  const i = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (!n.localFirst() || i.plan !== undefined) {
    if (i.parent !== undefined || i.child !== undefined || i.estimate !== undefined) return fail("parent, child and estimate need a local-first session");
    return startBranch(d, input, cwd);
  }
  if (i.parent !== undefined && typeof i.parent !== "string") return fail("parent must be a node id");
  const tree = n.tree.tree(), caps = n.caps();
  // TREE-5: a package of the parent's split brings its slug, goal, check, estimate and files
  let pkg: SplitChild | undefined;
  if (i.child !== undefined) {
    if (i.parent === undefined) return fail("child needs a parent");
    if (["slug", "goal", "check", "estimate"].some((k) => i[k] !== undefined)) {
      return fail("child takes its slug, goal, check and estimate from the split; give none of them");
    }
    const c = startable(tree, i.parent as string, String(i.child));
    if (typeof c === "string") return fail(c);
    pkg = c;
  } else {
    // review m3 (TREE-5): a slug of the parent's split is that package (its start or its re-activation): goal, check, estimate
    // and files come from the split, whatever the call gives
    const p = typeof i.parent === "string" ? nodeOf(tree, i.parent) : undefined;
    const c = p?.split?.children.find((x) => x.slug === i.slug);
    if (c) pkg = structuredClone(c);
    else if (i.estimate === undefined) return fail("estimate is required in a local-first session");
  }
  const estimate = pkg?.estimate ?? estimateOf(i.estimate);
  if (!estimate) return fail("estimate must be {lines: an integer ≥ 0, kind: code, plan or inert}");
  // SIZE-4: a new code node above the session tier's budget is refused (with the split tool, the only place size blocks); inert and plan never are
  const tier = n.strategy.sessionTier(n.arms()), budget = n.strategy.tierBudget(tier, "standard");
  if (estimate.kind === "code" && estimate.lines > budget) return fail(sizeRefusal(estimate.lines, budget, tier, caps.maxChildren));
  const parent = i.parent === undefined ? undefined : nodeOf(tree, i.parent as string);
  if (i.parent !== undefined && !parent) return fail(`unknown node ${i.parent as string}`);
  if (parent && parent.state !== "active" && parent.state !== "split") return fail(`node ${parent.id} is ${parent.state}`);
  if (parent && parent.depth + 1 > caps.maxDepth) {
    return fail(`node ${parent.id} is at depth ${parent.depth}: maxDepth ${caps.maxDepth} allows no node below it`);
  }
  const id = parent ? `${parent.id}.${String(pkg?.slug ?? i.slug)}` : String(i.slug);
  // a child lives in its parent's repository (a branch record knows it); else the input's or the cwd's
  const repo = i.repo ?? (parent && d.store.all().find((r) => r.branch === parent.branch && r.worktree === parent.worktree)?.repo);
  const res = await startBranch(d, { ...i, ...(repo !== undefined && { repo }), ...(pkg && { slug: pkg.slug }), parent: undefined, child: undefined,
    estimate: undefined }, cwd, { name: id, ...(parent && { from: parent.branch }), ...(pkg && { unit: { goal: pkg.goal, check: pkg.check } }) });
  if (!res.ok) return res;
  if (!nodeOf(tree, id)) {
    const node: Node = { id, ...(parent && { parent: parent.id }), depth: parent ? parent.depth + 1 : 0, kind: estimate.kind === "plan" ? "plan" : "leaf",
      branch: res.value.branch, worktree: res.value.worktree, base: res.value.base, profile: "local-first", estimate, state: "active",
      started: [], merged: [], contacts: {}, ladder: [], effort: "medium" };
    n.tree.apply({ op: "add", node });
    n.log.node(nodeLine(node, n.strategy.sessionTier(n.arms())));
  }
  return { ok: true, value: { ...res.value, node: id, ...(pkg && { files: pkg.files }) } };
}

/** `after`: awaited after a branch started, before the result (the merge gate's baseline of the repository's main tip).
 *  `nodes`: the work tree's ports; with them the schema is local-first's (spec §2.3) and a local-first session starts nodes. */
export function startBranchTool(d: StartDeps, ready: () => Promise<void> = async () => undefined, after?: () => Promise<void>, nodes?: NodeDeps): RouterTool {
  return {
    name: "start_branch",
    label: "Start branch",
    description: "Start a branch for a code change: makes a git worktree on a new branch from the main branch and returns its directory; "
      + "it becomes the active worktree. Give a slug, a goal and the check command that proves the change. The same slug again re-activates the branch."
      + (nodes ? " In a local-first session give an estimate; parent starts the branch off that node's tip." : ""),
    parameters: nodes ? START_NODE_SCHEMA : START_BRANCH_SCHEMA,
    async execute(_id, params, _signal, _update, ctx) {
      await ready(); // the session_start work (abandoned branches, facts) comes first
      const cwd = typeof ctx?.cwd === "string" ? ctx.cwd : process.cwd();
      const res = nodes ? await startNode(d, nodes, params, cwd) : await startBranch(d, params, cwd);
      if (!res.ok) return errorReply(res.errors.join("; "));
      await after?.();
      return { content: [{ type: "text", text: JSON.stringify(res.value) }], details: res.value };
    },
  };
}
