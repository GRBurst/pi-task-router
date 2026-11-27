// Split plans (local-first spec §2.3, TREE-4; plan S37, D66): the router validates a node's split (one reason per violation,
// in S37's order) and renders it as canonical JSON, the file `<plans.dir>/split/<node>.json` it commits on the node's branch.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Result } from "../types.ts";
import type { Git } from "./git.ts";
import { type Caps, type Node, refFormatOk, type SplitChild, type SplitPlan } from "./tree.ts";
/** spec §2.3 (the same pattern as `start_branch`'s slug; kept here so that worktree.ts may import this file). */
const SLUG = /^[a-z0-9-]{1,40}$/;

export type { SplitChild, SplitPlan } from "./tree.ts";
const MAX_TEXT = 400, MAX_FILES = 30;
const KINDS: readonly string[] = ["code", "plan", "inert"];
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === "string" && x.length > 0 && [...x].length <= MAX_TEXT;
/** A relative path without a `..` segment. */
const relativePath = (f: unknown): boolean => typeof f === "string" && f !== "" && !f.startsWith("/") && !/^[A-Za-z]:/.test(f) && !f.split(/[\\/]/).includes("..");

/** SIZE-4 at the split (review lf56 M2): the session tier's package budget; a `code` child above it is refused here, where the
 *  split can still change, since its start would be refused (`start_branch`) and a split node cannot split again. */
export type SplitBudget = { lines: number; tier: string };
/** S37: every violation's reason, in order; [] = valid. `node`: the node the plan splits (undefined: unknown); `budget`: the
 *  package budget a code child's estimate must not exceed (absent: no size rule). */
export function validateSplit(plan: unknown, node: Node | undefined, caps: Caps, budget?: SplitBudget): string[] {
  const out: string[] = [];
  const p = isObj(plan) ? plan : {};
  if (!text(p.summary)) out.push(`summary: must be 1 to ${MAX_TEXT} characters`);
  const kids = Array.isArray(p.children) ? p.children : undefined;
  if (!kids || kids.length < 1 || kids.length > caps.maxChildren) {
    out.push(`children: ${kids ? kids.length : "none"}; a split has 1 to maxChildren ${caps.maxChildren}`);
  }
  const seen = new Set<string>();
  (kids ?? []).forEach((c: unknown, i) => {
    const at = `children[${i}]`;
    if (!isObj(c)) { out.push(`${at}: must be {slug, goal, files, estimate, check, forbidden?}`); return; }
    if (typeof c.slug !== "string" || !SLUG.test(c.slug)) out.push(`${at}.slug: must match ${SLUG.source}`);
    else if (seen.has(c.slug)) out.push(`${at}.slug: duplicate ${c.slug}`);
    else {
      seen.add(c.slug);
      // review m2: the child's branch `<node's branch>.<slug>` must be one git accepts (`lock` would end it in `.lock`)
      const b = node && `${node.branch}.${c.slug}`;
      if (b !== undefined && !refFormatOk(b)) out.push(`${at}.slug: ${c.slug} makes the branch ${b}, which git refuses (check-ref-format)`);
    }
    if (!text(c.goal)) out.push(`${at}.goal: must be 1 to ${MAX_TEXT} characters`);
    if (!Array.isArray(c.files) || c.files.length < 1 || c.files.length > MAX_FILES) out.push(`${at}.files: 1 to ${MAX_FILES} paths`);
    else for (const f of c.files) if (!relativePath(f)) out.push(`${at}.files: ${String(f)} must be relative, without ..`);
    if (c.forbidden !== undefined && !(Array.isArray(c.forbidden) && c.forbidden.every(relativePath))) out.push(`${at}.forbidden: relative globs, without ..`);
    const e = isObj(c.estimate) ? c.estimate : {};
    if (!(Number.isInteger(e.lines) && (e.lines as number) >= 0 && KINDS.includes(e.kind as string))) {
      out.push(`${at}.estimate: lines must be an integer >= 0 and kind ${KINDS.join(" | ")}`);
    } else if (budget && e.kind === "code" && (e.lines as number) > budget.lines) {
      out.push(`${at}.estimate: ${typeof c.slug === "string" ? c.slug : "?"}: the estimate of ${e.lines as number} changed lines is above the package `
        + `budget of ${budget.lines} changed lines (tier ${budget.tier}); give it less work (more children) or the kind plan (it splits again)`);
    }
    if (typeof c.check !== "string" || c.check.trim() === "") out.push(`${at}.check: must not be empty`);
  });
  if (!node) out.push("unknown node");
  else {
    if (node.state !== "active") out.push(`node ${node.id} is ${node.state}: only an active node splits`);
    else if (node.split) out.push(`node ${node.id} is split already`);
    if (node.depth + 1 > caps.maxDepth) out.push(`node ${node.id} is at depth ${node.depth}: its children would exceed maxDepth ${caps.maxDepth}`);
  }
  return out;
}

/** The known fields of a valid plan, nothing else (the canonical content). */
export const normalizeSplit = (p: SplitPlan): SplitPlan => ({
  summary: p.summary,
  children: p.children.map((c): SplitChild => ({ slug: c.slug, goal: c.goal, files: [...c.files],
    estimate: { lines: c.estimate.lines, kind: c.estimate.kind }, check: c.check, ...(c.forbidden !== undefined && { forbidden: [...c.forbidden] }) })),
});
const sorted = (x: unknown): unknown => Array.isArray(x) ? x.map(sorted)
  : isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x;
/** Canonical JSON of `{v: 1, node, summary, children}`: sorted keys, two-space indent, a trailing newline (byte-stable). */
export const renderSplit = (node: string, p: SplitPlan): string => `${JSON.stringify(sorted({ v: 1, node, ...normalizeSplit(p) }), null, 2)}\n`;
/** The plan file's repository-relative path (spec §2.3; router-owned, D85). */
export const splitFile = (plansDir: string, node: string): string => `${plansDir.replace(/\/+$/, "")}/split/${node}.json`;
/** D85: `<plans.dir>/split/**`, the router's own files: never a scope violation (TREE-14), never counted by the classifier (its
 *  `ClassifyContext.isSplit` is this function: the one definition). A plain prefix, anchored at the repository root. */
export const isSplitFile = (plansDir: string, path: string): boolean => path.startsWith(`${plansDir.replace(/\/+$/, "")}/split/`);

/** D66: writes the plan's file in the node's worktree and commits it alone on the node's branch (`commitPath`); a failure (a
 *  hook's refusal) gives its output and restores the file as it was. */
export async function commitSplit(git: Pick<Git, "commitPath">, worktree: string, plansDir: string, node: string, plan: SplitPlan): Promise<Result<{ commit: string; file: string }>> {
  const file = splitFile(plansDir, node), abs = join(worktree, file);
  let old: string | undefined;
  try { old = readFileSync(abs, "utf8"); } catch { old = undefined; }
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, renderSplit(node, plan));
  } catch (e) { return { ok: false, errors: [`split file: ${(e as Error).message}`] }; }
  const r = await git.commitPath(worktree, file, `task-router: split ${node}`);
  if (r.ok) return { ok: true, value: { commit: r.out, file } };
  try { if (old === undefined) rmSync(abs, { force: true }); else writeFileSync(abs, old); } catch { /* best effort */ }
  return { ok: false, errors: [`split commit refused: ${r.err}`] };
}
