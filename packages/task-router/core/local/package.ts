// Package children (local-first spec TREE-6, PRO-10 b; plan S34b, LF4.T12): where a card runs in a local-first session. A
// `package` card is placed by the tree, whatever its kind: the start member in the node's worktree under the package contract;
// a `t2` package card goes to the cloud (today's planning) as an open-ended contact, counted from LF8 on. A card without
// `package` goes to the start member iff its kind's placement is `local`, ungated (a CON-8 (ii) unit); else today's planning.
// Pure: the policy (core/policy.ts) applies the placement.
import type { ChildTool } from "../api.ts";
import type { Arms, Strategy } from "../strategy/types.ts";
import type { SyncGuard } from "../toolguard.ts";
import type { Card, Profile, Result } from "../types.ts";
import { basename } from "node:path";
import { analyse, DYN, hasGitToken, segments, unwrap } from "./gitcmd.ts";
import { contractOf, nodeOf } from "./tree.ts";
import type { Node, SplitChild, Tree } from "./tree.ts";

/** What the policy reads of a local-first session (absent in every other session); no `startMember` in E0's cloud-only arm.
 *  `submitSplit`: the child tool `submit_split` for a package node (TREE-13). */
export type LocalFirstView = { tree: Tree; strategy: Strategy; arms: Arms; startMember?: string; submitSplit?(node: string): ChildTool | undefined };
/** `member`: the start member, alone (absent: today's planning); `cwd`, `brief`, `guard`: the package's; `meta`: added to the
 *  result's. */
export type Placement = { member?: string; cwd?: string; brief?: string; guard?: SyncGuard; childTools?: ChildTool[]; meta: Record<string, unknown> };

/** R26 (review M3): the git subcommands a package child may run, an allow-list: each reads or changes only its own repository.
 *  Not on it: whatever reaches a remote (push, fetch, pull, remote, clone, ls-remote, archive --remote, send-email), runs a
 *  helper or a command it is given (submodule, subtree, lfs, bisect, an external `git-x`), changes git's configuration
 *  (config) or other worktrees and refs directly (worktree, update-ref), and every user alias (an unknown subcommand). */
export const LOCAL_GIT: ReadonlySet<string> = new Set(["status", "diff", "log", "show", "shortlog", "describe", "add", "commit",
  "restore", "checkout", "switch", "branch", "rev-parse", "rev-list", "ls-files", "ls-tree", "show-ref", "grep", "stash", "reset",
  "mv", "rm", "merge-base", "cat-file", "blame", "diff-tree", "check-ignore", "apply", "clean", "merge", "rebase", "cherry-pick",
  "revert", "version"]);
/** The `-c` keys a package child may set: their values never run anything. */
const SAFE_CONFIG = /^(user\.(name|email)|commit\.gpgsign|color\.[a-z.]+)=/i;
/** The options of an allowed subcommand that run a command they are given (a short option also in a cluster: `-ix`). */
const RUNS_GIVEN: Record<string, { short: string; long: string }> = { rebase: { short: "x", long: "--exec" },
  grep: { short: "O", long: "--open-files-in-pager" } };
/** Programs that push or copy to another host: the forges' clients and git's own remote transports. */
const REMOTE_TOOLS = new Set(["gh", "glab", "hub", "ssh", "scp", "sftp", "rsync"]);
const toolToken = (cmd: string): boolean => /(^|[^A-Za-z0-9_.-])(gh|glab|hub|ssh|scp|sftp|rsync)($|[^A-Za-z0-9_-])/.test(cmd);
/** R26 (D65): a package child runs only local git subcommands (LOCAL_GIT) and no remote tool; the reason names the command.
 *  Refused too: a computed command name or git subcommand (`git $(…)`, `… | xargs git`), a `-c` other than SAFE_CONFIG,
 *  `--exec-path`, `rebase --exec`, `grep -O`, and a git command the parser cannot read (LD8). A filter, not a boundary: a script or a
 *  program the child writes and runs is not read (docs/task-router.md "Package children"). */
export function refusesRemote(cmd: string): string | undefined {
  const no = (what: string) => `a package child runs only local git commands and never reaches a remote (R26): ${what} is refused; commit in your worktree, the main merges the node`;
  const unread = () => (hasGitToken(cmd) || toolToken(cmd) ? no("a command the router cannot read") : undefined);
  try {
    for (const s of segments(cmd, "/")) {
      const a = unwrap(s.argv, s.dir).argv, name = basename(a[0] ?? "");
      if (a.length && a[0]!.includes(DYN)) return no("a computed command name");
      if (REMOTE_TOOLS.has(name) || name.startsWith("git-")) return no(name);
    }
    const x = analyse(cmd, "/");
    if (x.strays.length && hasGitToken(cmd)) return no("a git command the router cannot read");
    if (x.calls.length && cmd.includes("--exec-path")) return no("git --exec-path");
    for (const c of x.calls) {
      const bad = c.config?.find((k) => !SAFE_CONFIG.test(k));
      if (bad !== undefined) return no(`git -c ${bad.split("=")[0]!.replaceAll(DYN, "$(…)")}`);
      if (c.sub.includes(DYN)) return no("a computed git subcommand");
      if (!LOCAL_GIT.has(c.sub)) return no(`git ${c.sub}`);
      const o = RUNS_GIVEN[c.sub];
      if (o && c.args.some((w) => w.startsWith(o.long) || (/^-[A-Za-z]/.test(w) && w.slice(1).includes(o.short)))) return no(`git ${c.sub} ${o.long}`);
    }
    return undefined;
  } catch { return unread(); }
}
/** R26: the package child's own guard, `refusesRemote` on its shell calls. */
export const packageGuard: SyncGuard = (tool, input) => {
  const cmd = (input as { command?: unknown } | null | undefined)?.command;
  return (tool === "bash" || tool === "powershell") && typeof cmd === "string" ? refusesRemote(cmd) : undefined;
};

/** The package contract (TREE-6, S47: goal, files, budget, check, forbidden), the lines a package child's brief carries; with
 *  `maxChildren` (the node may split, TREE-13) the do-or-split rule too. */
export function packageBrief(n: Node, c: SplitChild, maxChildren?: number): string {
  return [
    `Package ${n.id}: your contract.`,
    `- goal: ${c.goal}`,
    `- files: ${c.files.join(", ")}`,
    `- budget: ${c.estimate.lines} changed lines (${c.estimate.kind})`,
    `- check: ${c.check}`,
    `- forbidden: ${c.forbidden?.length ? c.forbidden.join(", ") : "none"}`,
    "Work only in this worktree and commit there; the main merges the node with request_merge.",
    ...(maxChildren === undefined ? [] : [`Do or split: do this package within its budget, or, if it does not fit, call submit_split with `
      + `at most ${maxChildren} smaller packages and end; the main starts them.`]),
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
  // TREE-13: submit_split and its rule while the node's depth is below the cap
  const caps = v.strategy.treeCaps(v.arms), tool = n.depth < caps.maxDepth ? v.submitSplit?.(id) : undefined;
  const at = { cwd: n.worktree, brief: packageBrief(n, c, tool && caps.maxChildren), guard: packageGuard, ...(tool && { childTools: [tool] }) };
  return { ok: true, value: card.t2.length ? { ...at, meta: { node: id, contact: "open" } } : { ...at, ...(v.startMember !== undefined && { member: v.startMember }), meta: { node: id } } };
}

/** PRO-10 b, S34b: a card without `package` and without `t2` goes to the start member iff its kind's placement is `local`. */
export const placeByKind = (card: Card, profile: Profile, v: Pick<LocalFirstView, "startMember">): Placement | undefined =>
  v.startMember !== undefined && !card.t2.length && profile.localFirst?.placement === "local" ? { member: v.startMember, meta: { ungated: true } } : undefined;

/** The placement of `card` in a local-first session; undefined = today's planning. */
export const placement = (card: Card, profile: Profile, v: LocalFirstView): Result<Placement> | undefined =>
  card.package !== undefined ? placePackage(card as Card & { package: string }, v) : wrap(placeByKind(card, profile, v));
const wrap = (p: Placement | undefined): Result<Placement> | undefined => (p ? { ok: true, value: p } : undefined);
