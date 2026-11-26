// Package children (local-first spec TREE-6, PRO-10 b; plan S34b, LF4.T12): where a card runs in a local-first session. A
// `package` card is placed by the tree, whatever its kind: the start member in the node's worktree under the package contract;
// a `t2` package card goes to the cloud (today's planning) as an open-ended contact, counted from LF8 on. A card without
// `package` goes to the start member iff its kind's placement is `local`, ungated (a CON-8 (ii) unit); else today's planning.
// Pure: the policy (core/policy.ts) applies the placement.
import type { Arms, Strategy } from "../strategy/types.ts";
import type { SyncGuard } from "../toolguard.ts";
import type { Card, Profile, Result } from "../types.ts";
import { analyse, hasGitToken } from "./gitcmd.ts";
import { contractOf, nodeOf } from "./tree.ts";
import type { Node, SplitChild, Tree } from "./tree.ts";

/** What the policy reads of a local-first session (absent in every other session); no `startMember` in E0's cloud-only arm. */
export type LocalFirstView = { tree: Tree; strategy: Strategy; arms: Arms; startMember?: string };
/** `member`: the start member, alone (absent: today's planning); `cwd`, `brief`, `guard`: the package's; `meta`: added to the
 *  result's. */
export type Placement = { member?: string; cwd?: string; brief?: string; guard?: SyncGuard; meta: Record<string, unknown> };

/** The git subcommands that reach a remote. */
const REMOTE = new Set(["push", "remote", "fetch", "pull", "clone", "ls-remote"]);
/** R26 (D65): a package child never pushes or reaches a remote; the reason names the command. A command the git parser cannot
 *  read is refused iff it has a `git` token (LD8). */
export function refusesRemote(cmd: string): string | undefined {
  const no = (what: string) => `a package child never reaches a remote (R26): ${what} is refused; commit in your worktree, the main merges the node`;
  try {
    const a = analyse(cmd, "/");
    if (a.strays.length && hasGitToken(cmd)) return no("a git command the router cannot read");
    const hit = a.calls.find((c) => REMOTE.has(c.sub));
    return hit ? no(`git ${hit.sub}`) : undefined;
  } catch { return hasGitToken(cmd) ? no("a git command the router cannot read") : undefined; }
}
/** R26: the package child's own guard, `refusesRemote` on its shell calls. */
export const packageGuard: SyncGuard = (tool, input) => {
  const cmd = (input as { command?: unknown } | null | undefined)?.command;
  return (tool === "bash" || tool === "powershell") && typeof cmd === "string" ? refusesRemote(cmd) : undefined;
};

/** The package contract (TREE-6, S47: goal, files, budget, check, forbidden), the lines a package child's brief carries. */
export function packageBrief(n: Node, c: SplitChild): string {
  return [
    `Package ${n.id}: your contract.`,
    `- goal: ${c.goal}`,
    `- files: ${c.files.join(", ")}`,
    `- budget: ${c.estimate.lines} changed lines (${c.estimate.kind})`,
    `- check: ${c.check}`,
    `- forbidden: ${c.forbidden?.length ? c.forbidden.join(", ") : "none"}`,
    "Work only in this worktree and commit there; the main merges the node with request_merge.",
  ].join("\n");
}

/** TREE-6: a card naming `package` must name an active package node (a started child of a split). */
export function placePackage(card: Card & { package: string }, v: LocalFirstView): Result<Placement> {
  const id = card.package, n = nodeOf(v.tree, id);
  const no = (why: string): Result<Placement> => ({ ok: false, errors: [`package ${id}: ${why}`] });
  if (!n) return no("unknown node");
  if (n.state !== "active") return no(`the node is ${n.state}, not active`);
  const c = contractOf(v.tree, n);
  if (!c) return no("the node is no package of a split (start it with start_branch({parent, child}))");
  const at = { cwd: n.worktree, brief: packageBrief(n, c), guard: packageGuard };
  return { ok: true, value: card.t2.length ? { ...at, meta: { node: id, contact: "open" } } : { ...at, ...(v.startMember !== undefined && { member: v.startMember }), meta: { node: id } } };
}

/** PRO-10 b, S34b: a card without `package` and without `t2` goes to the start member iff its kind's placement is `local`. */
export const placeByKind = (card: Card, profile: Profile, v: Pick<LocalFirstView, "startMember">): Placement | undefined =>
  v.startMember !== undefined && !card.t2.length && profile.localFirst?.placement === "local" ? { member: v.startMember, meta: { ungated: true } } : undefined;

/** The placement of `card` in a local-first session; undefined = today's planning. */
export const placement = (card: Card, profile: Profile, v: LocalFirstView): Result<Placement> | undefined =>
  card.package !== undefined ? placePackage(card as Card & { package: string }, v) : wrap(placeByKind(card, profile, v));
const wrap = (p: Placement | undefined): Result<Placement> | undefined => (p ? { ok: true, value: p } : undefined);
