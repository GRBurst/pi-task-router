// The persisted work tree (local-first spec §2.2, TREE-3; plan S36): each tree op that changes the tree is one
// `task-router/tree` entry `{v: 1, …op}`; session_start replays the branch's entries (a fold keeps entries), so the
// restored tree equals the live one. An op that changes nothing (its problem: `step`) writes no entry.
import { EMPTY_TREE, step, type Tree, type TreeOp } from "./tree.ts";

export const TREE_TYPE = "task-router/tree";
export type TreeStore = {
  tree(): Tree;
  /** Applies `o`; on a change, one entry. Returns the problem when nothing changed. */
  apply(o: TreeOp): string | undefined;
  /** Replaces the tree with the replay (`replay`, op by op) of the branch's well-formed entries (`v: 1`), in order. */
  restore(branch: readonly unknown[]): void;
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
/** The op an entry holds, or undefined (another type, another version, no op). */
const opOf = (e: unknown): TreeOp | undefined => {
  if (!isObj(e) || e.customType !== TREE_TYPE || !isObj(e.data) || e.data.v !== 1 || typeof e.data.op !== "string") return undefined;
  const { v: _v, ...op } = e.data;
  return structuredClone(op) as TreeOp;
};

export function createTreeStore(append: (customType: string, data: unknown) => void): TreeStore {
  let tree: Tree = EMPTY_TREE;
  return {
    tree: () => tree,
    apply(o) {
      const r = step(tree, o);
      if (r.problem !== undefined) return r.problem;
      tree = r.tree;
      append(TREE_TYPE, { v: 1, ...structuredClone(o) });
      return undefined;
    },
    restore(branch) {
      let t = EMPTY_TREE;
      for (const o of branch.map(opOf)) {
        if (o) try { t = step(t, o).tree; } catch { /* a malformed op (a field of the wrong type) is ignored */ }
      }
      tree = t;
    },
  };
}
