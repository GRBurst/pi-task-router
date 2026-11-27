// The merge rig with a work tree (local-first LF4.T11, moved here for the LF5/LF6 gate tests): nodes started by
// start_branch's local-first path over the merge rig's real repository, the merge lines collected.
import { startNode, type NodeDeps } from "../core/local/branchtool.ts";
import type { MergeInput } from "../core/outcome.ts";
import { createTreeStore } from "../core/local/treestore.ts";
import { localFirst } from "../core/strategy/local-first.ts";
import { mergeRig } from "./merge-rig.ts";

/** The merge rig with a work tree: `node(input)` starts a node by start_branch's local-first path, `lines` the merge lines. */
export function nodeRig(settings: Record<string, unknown> = {}) {
  const m = mergeRig({ settings });
  const tree = createTreeStore((type, data) => { m.entries.push({ type, data: structuredClone(data) }); });
  const nodeLines: Array<Record<string, unknown>> = [];
  const nodes: NodeDeps = { tree, localFirst: () => true, caps: () => ({ maxDepth: 3, maxChildren: 5, planLines: 150 }),
    strategy: localFirst(m.settings), arms: () => ({}), log: { node(i) { nodeLines.push(i); }, split() {} } };
  const lines: MergeInput[] = [];
  m.ports.nodes = nodes;
  m.ports.log = (i) => { lines.push(i); };
  const node = async (input: Record<string, unknown>) => {
    const res = await startNode({ git: m.git, store: m.store, settings: m.settings }, nodes, { goal: "do it", check: "true", ...input }, m.r.dir);
    if (!res.ok) throw new Error(res.errors.join("; "));
    return res.value;
  };
  /** The root `auth` (a plan node) with one commit, main moved on after it, and its child `auth.form` with one commit. */
  const shape = async () => {
    const root = await node({ slug: "auth", estimate: { kind: "plan", lines: 0 } });
    m.r.commit("docs/auth.md", "one\ntwo\nthree\n", "plan", root.worktree);
    m.r.commit("main.txt", "moved\n", "main moves");
    const child = await node({ parent: "auth", slug: "form", estimate: { kind: "code", lines: 2 } });
    m.r.commit("form.ts", "a\nb\n", "form", child.worktree);
    return { root, child };
  };
  return { ...m, tree, nodes, nodeLines, lines, node, shape };
}

