// The local-first work-tree rig (LF4): a harness in a local-first session over a real temporary repository, `start_branch`
// as a call, the tree ops written and the `node` lines.
import { createGit, gitRunner } from "../core/local/git.ts";
import { TREE_TYPE } from "../core/local/treestore.ts";
import { harness } from "./harness.ts";
import { tempRepo } from "./git-repo.ts";

export const LF = { profile: "local-first", localFirst: { experimental: true } };
export type Reply = { content: { text: string }[]; details: Record<string, any>; isError?: boolean };

export function treeRig(settings: Record<string, unknown> = LF) {
  const r = tempRepo();
  const git = createGit(gitRunner("git", r.env));
  const h = harness({ settings: settings as never, extra: { git } as never });
  const ctx = { sessionManager: { getSessionId: () => "s-main", getBranch: () => [] }, cwd: r.dir };
  h.f.fire("session_start", { reason: "startup" }, ctx);
  const call = async (tool: string, params: Record<string, unknown>) => (await h.f.callTool(tool, params, ctx)) as Reply;
  const start = (params: Record<string, unknown>) => call("start_branch", params);
  const ops = () => h.f.entries.filter((e) => e.type === TREE_TYPE).map((e) => e.data as Record<string, any>);
  const nodes = () => h.lines().filter((l) => l.event === "node");
  return { r, git, h, ctx, call, start, ops, nodes };
}
