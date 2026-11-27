// The main's `split` tool (local-first spec §2.3, TREE-4, TREE-12 a): a node's split plan, validated (S37), committed as the
// canonical file on the node's branch by a path-limited commit in the node's worktree (D66; never on the main branch), then
// the tree op `split` and the node's state `split`, one `split` line and one `node` line (TREE-11). `node` absent = the root of
// the active branch's node: E16 = `local`, the main's split of the root is the top-level plan. `submit_split` (TREE-13) is the
// same for a package child's own node, a child tool that ends the child and tells the main.
import type { ChildTool } from "../api.ts";
import type { Result, RouterSettings } from "../types.ts";
import type { BranchStore } from "./branches.ts";
import { errorReply, type NodeDeps, type RouterTool } from "./branchtool.ts";
import type { Git } from "./git.ts";
import { commitSplit, normalizeSplit, renderSplit, validateSplit } from "./split.ts";
import { nodeLine, nodeOf, rootOf, type Node, type SplitPlan, type Tree } from "./tree.ts";

/** `crossing`: SIZE-10, an accepted split whose rendering has more than `planLines` lines (its `crossing` line, kind `plan`). */
export type SplitDeps = { git: Pick<Git, "commitPath">; branches: Pick<BranchStore, "active">; settings: RouterSettings; nodes: NodeDeps;
  crossing?(n: Node, lines: number, budget: number): void };
const CHILD = { type: "object", required: ["slug", "goal", "files", "estimate", "check"], properties: {
  slug: { type: "string", pattern: "^[a-z0-9-]{1,40}$" }, goal: { type: "string", maxLength: 400 },
  files: { type: "array", minItems: 1, maxItems: 30, items: { type: "string" }, description: "paths or globs, relative to the repository root" },
  estimate: { type: "object", required: ["lines", "kind"], properties: { lines: { type: "integer", minimum: 0 }, kind: { type: "string", enum: ["code", "plan", "inert"] } } },
  check: { type: "string" },
  forbidden: { type: "array", items: { type: "string" }, description: "globs the package must not touch" },
} };
const PLAN = { summary: { type: "string", maxLength: 400 }, children: { type: "array", minItems: 1, items: CHILD } };
/** Spec §2.3: `{node?, summary, children}`. */
export const SPLIT_SCHEMA = { type: "object", required: ["summary", "children"], properties: {
  node: { type: "string", description: "the node to split; absent: the root (the top-level plan)" }, ...PLAN,
} };
/** Spec §2.3: `submit_split` takes `split`'s input without `node`. */
export const SUBMIT_SPLIT_SCHEMA = { type: "object", required: ["summary", "children"], properties: PLAN };

/** The node a split without `node` splits: the root of the active branch's node. */
function activeRoot(t: Tree, branches: SplitDeps["branches"]): Node | undefined {
  const rec = branches.active();
  const n = rec && Object.values(t.nodes).find((x) => x.branch === rec.branch && x.worktree === rec.worktree);
  return n && rootOf(t, n.id);
}
/** The rendered plan's line count (S37's `planLines` budget reads it). */
export const planLinesOf = (node: string, plan: SplitPlan): number => renderSplit(node, plan).trimEnd().split("\n").length;

/** The custom message a `submit_split` sends the main (TREE-13). */
export const SPLIT_MESSAGE_TYPE = "task-router/split";
type Split = { node: string; commit: string; file: string; children: string[] };
/** Review m4: the splits of one tree run one at a time (the main's `split` and a child's `submit_split` share the store), so a
 *  second split of a node validates against the first's result and never commits. */
const queues = new WeakMap<object, Promise<unknown>>();
function serial<T>(key: object, f: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(f, f);
  queues.set(key, next.catch(() => undefined));
  return next;
}
/** One split of node `id` (S37): validated, committed in its worktree, the tree op, the `split` and `node` lines. */
const splitNode = (d: SplitDeps, id: string | undefined, p: Record<string, unknown>): Promise<Result<Split>> =>
  serial(d.nodes.tree, () => splitNow(d, id === undefined ? undefined : nodeOf(d.nodes.tree.tree(), id), p));
async function splitNow(d: SplitDeps, n: Node | undefined, p: Record<string, unknown>): Promise<Result<Split>> {
  const plan = { summary: p.summary, children: p.children };
  const caps = d.nodes.caps(), why = validateSplit(plan, n, caps);
  if (why.length > 0) return { ok: false, errors: [why.join("; ")] };
  const norm = normalizeSplit(plan as SplitPlan);
  const c = await commitSplit(d.git, n!.worktree, d.settings.plans.dir, n!.id, norm);
  if (!c.ok) return c;
  const problem = d.nodes.tree.apply({ op: "split", node: n!.id, plan: norm });
  if (problem !== undefined) return { ok: false, errors: [`the split of ${n!.id} was committed at ${c.value.commit.slice(0, 7)} but not recorded: ${problem}`] };
  const lines = planLinesOf(n!.id, norm);
  d.nodes.log.split({ node: n!.id, reason: "choice", children: norm.children.length, depth: n!.depth, planLines: lines });
  if (lines > caps.planLines) d.crossing?.(n!, lines, caps.planLines); // SIZE-10: accepted, logged
  d.nodes.log.node(nodeLine(nodeOf(d.nodes.tree.tree(), n!.id)!));
  return { ok: true, value: { node: n!.id, commit: c.value.commit, file: c.value.file, children: norm.children.map((x) => x.slug) } };
}
const record = (p: unknown): Record<string, unknown> => (typeof p === "object" && p !== null ? p : {}) as Record<string, unknown>;

/** TREE-13: a package child's `submit_split` for its node `node`; a valid split ends the child and sends `tell` one message
 *  naming the node (the main starts the children). An invalid one is an error the child may answer with another. */
export function submitSplitTool(d: SplitDeps & { tell(text: string): void }, node: string): ChildTool {
  return {
    name: "submit_split",
    description: "Split your package into smaller packages instead of doing it: a summary and 1 to maxChildren children, each with a "
      + "slug, goal, files, estimate and check. Commits the plan on your node's branch and ends your session; the main starts them.",
    parameters: SUBMIT_SPLIT_SCHEMA,
    async execute(input) {
      const r = await splitNode(d, node, record(input));
      if (!r.ok) return { text: r.errors.join("; "), isError: true };
      const v = r.value;
      d.tell(`Package ${v.node} split itself into ${v.children.length} packages (${v.children.join(", ")}), plan ${v.file} at ${v.commit.slice(0, 7)}: `
        + `start each with start_branch({parent: "${v.node}", child: <slug>}) and spawn its package card.`);
      return { text: JSON.stringify(v), terminate: true };
    },
  };
}

export function splitTool(d: SplitDeps, ready: () => Promise<void> = async () => undefined): RouterTool {
  return {
    name: "split",
    label: "Split",
    description: "Split a node into packages: a summary and 1 to maxChildren children, each with a slug, goal, files, estimate and check. "
      + "Commits the plan on the node's branch; start each package with start_branch({parent: node, child: slug}). No node: the root.",
    parameters: SPLIT_SCHEMA,
    async execute(_id, params) {
      await ready();
      if (!d.nodes.localFirst()) return errorReply("split needs a local-first session");
      const p = record(params);
      const t = d.nodes.tree.tree();
      if (p.node !== undefined && typeof p.node !== "string") return errorReply("node must be a node id");
      const node = p.node === undefined ? activeRoot(t, d.branches) : nodeOf(t, p.node as string);
      if (p.node === undefined && !node) return errorReply("no active node: start the request node with start_branch, or give node");
      const r = await splitNode(d, node?.id ?? (p.node as string | undefined), p);
      if (!r.ok) return errorReply(r.errors.join("; "));
      return { content: [{ type: "text", text: JSON.stringify(r.value) }], details: r.value };
    },
  };
}
