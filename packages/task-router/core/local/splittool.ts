// The main's `split` tool (local-first spec §2.3, TREE-4, TREE-12 a): a node's split plan, validated (S37), committed as the
// canonical file on the node's branch by a path-limited commit in the node's worktree (D66; never on the main branch), then
// the tree op `split` and the node's state `split`, one `split` line and one `node` line (TREE-11). `node` absent = the root of
// the active branch's node: E16 = `local`, the main's split of the root is the top-level plan.
import type { RouterSettings } from "../types.ts";
import type { BranchStore } from "./branches.ts";
import { errorReply, type NodeDeps, type RouterTool } from "./branchtool.ts";
import type { Git } from "./git.ts";
import { commitSplit, normalizeSplit, renderSplit, validateSplit } from "./split.ts";
import { nodeLine, nodeOf, rootOf, type Node, type SplitPlan, type Tree } from "./tree.ts";

export type SplitDeps = { git: Pick<Git, "commitPath">; branches: Pick<BranchStore, "active">; settings: RouterSettings; nodes: NodeDeps };
const CHILD = { type: "object", required: ["slug", "goal", "files", "estimate", "check"], properties: {
  slug: { type: "string", pattern: "^[a-z0-9-]{1,40}$" }, goal: { type: "string", maxLength: 400 },
  files: { type: "array", minItems: 1, maxItems: 30, items: { type: "string" }, description: "paths or globs, relative to the repository root" },
  estimate: { type: "object", required: ["lines", "kind"], properties: { lines: { type: "integer", minimum: 0 }, kind: { type: "string", enum: ["code", "plan", "inert"] } } },
  check: { type: "string" },
  forbidden: { type: "array", items: { type: "string" }, description: "globs the package must not touch" },
} };
/** Spec §2.3: `{node?, summary, children}`. */
export const SPLIT_SCHEMA = { type: "object", required: ["summary", "children"], properties: {
  node: { type: "string", description: "the node to split; absent: the root (the top-level plan)" },
  summary: { type: "string", maxLength: 400 }, children: { type: "array", minItems: 1, items: CHILD },
} };

/** The node a split without `node` splits: the root of the active branch's node. */
function activeRoot(t: Tree, branches: SplitDeps["branches"]): Node | undefined {
  const rec = branches.active();
  const n = rec && Object.values(t.nodes).find((x) => x.branch === rec.branch && x.worktree === rec.worktree);
  return n && rootOf(t, n.id);
}
/** The rendered plan's line count (S37's `planLines` budget reads it). */
export const planLinesOf = (node: string, plan: SplitPlan): number => renderSplit(node, plan).trimEnd().split("\n").length;

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
      const p = (typeof params === "object" && params !== null ? params : {}) as Record<string, unknown>;
      const t = d.nodes.tree.tree();
      if (p.node !== undefined && typeof p.node !== "string") return errorReply("node must be a node id");
      const node = p.node === undefined ? activeRoot(t, d.branches) : nodeOf(t, p.node as string);
      if (p.node === undefined && !node) return errorReply("no active node: start the request node with start_branch, or give node");
      const plan = { summary: p.summary, children: p.children };
      const why = validateSplit(plan, node, d.nodes.caps());
      if (why.length > 0) return errorReply(why.join("; "));
      const n = node!, norm = normalizeSplit(plan as SplitPlan);
      const c = await commitSplit(d.git, n.worktree, d.settings.plans.dir, n.id, norm);
      if (!c.ok) return errorReply(c.errors.join("; "));
      d.nodes.tree.apply({ op: "split", node: n.id, plan: norm });
      d.nodes.log.split({ node: n.id, reason: "choice", children: norm.children.length, depth: n.depth, planLines: planLinesOf(n.id, norm) });
      d.nodes.log.node(nodeLine(nodeOf(d.nodes.tree.tree(), n.id)!));
      const value = { node: n.id, commit: c.value.commit, file: c.value.file, children: norm.children.map((x) => x.slug) };
      return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
    },
  };
}
