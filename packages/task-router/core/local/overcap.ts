// The over-cap review input (local-first spec SIZE-8, design §5.3, O3): a diff above `large`, or one longer than the review's
// line budget, is reviewed on the numstat, the checks' output and the hunks of the riskiest files (risk rules first, then the
// most changed lines), within `localFirst.overCapBytes` in all; the review line says `overCap`. A file part that does not fit is
// left out, except the riskiest one, whose head is shown up to the budget. Pure.
import { quotePath, type Stat } from "./git.ts";

/** One file's part of a `git diff` text: its header and hunks; `lines` its numstat's added + deleted. */
export type Hunk = { path: string; lines: number; text: string };

const enc = new TextEncoder();
const bytesOf = (s: string): number => enc.encode(s).length;
/** The longest prefix of `s` within `n` UTF-8 bytes (no split character). */
export function cutBytes(s: string, n: number): string {
  if (bytesOf(s) <= n) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (bytesOf(s.slice(0, mid)) <= n) lo = mid; else hi = mid - 1; }
  const out = s.slice(0, lo);
  return /[\uD800-\uDBFF]$/.test(out) ? out.slice(0, -1) : out;
}

/** The files' parts of a `git diff --no-renames` text, matched to the numstat: by the `diff --git a/<p> b/<p>` header, else by
 *  position (both list the files in git's order). */
export function fileHunks(diff: string, st: Stat): Hunk[] {
  const parts: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ") || parts.length === 0) parts.push(line);
    else parts[parts.length - 1] += `\n${line}`;
  }
  const byPath = new Map(st.map((f) => [f.path, f.added + f.deleted]));
  return parts.filter((p) => p.startsWith("diff --git ")).map((text, i) => {
    const rest = text.slice("diff --git ".length, text.indexOf("\n") < 0 ? undefined : text.indexOf("\n"));
    const half = (rest.length - 5) / 2, path = rest.startsWith("a/") && Number.isInteger(half) ? rest.slice(2, 2 + half) : undefined;
    const p = path !== undefined && byPath.has(path) ? path : st[i]?.path ?? path ?? "";
    return { path: p, lines: byPath.get(p) ?? 0, text };
  });
}

/** The riskiest first: a risk rule's match, then the most changed lines, then the path. */
export const riskOrder = (hunks: readonly Hunk[], risk: (path: string) => boolean): Hunk[] =>
  [...hunks].sort((a, b) => Number(risk(b.path)) - Number(risk(a.path)) || b.lines - a.lines || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

/** SIZE-8: the over-cap part of the review input within `bytes` UTF-8 bytes: the numstat, `checkOut` (the checks as the input
 *  renders them), then whole file parts in risk order while they fit; the riskiest one is cut to fit when it alone does not. */
export function overCapInput(stat: Stat, hunks: readonly Hunk[], checkOut: string, bytes: number, risk: (path: string) => boolean): string {
  const total = stat.reduce((n, f) => n + f.added + f.deleted, 0);
  const head = [
    `Over-cap review: ${total} changed lines in ${stat.length} files, more than one review reads. Shown: the numstat, the checks' output and the hunks of the riskiest files (risk rules first, then the most changed lines) within ${bytes} bytes; review what is shown and name what you could not check.`,
    "Numstat:",
    ...stat.map((f) => `${f.added}\t${f.deleted}\t${quotePath(f.path)}`),
    checkOut,
  ].join("\n");
  const order = riskOrder(hunks, risk), shown: string[] = [];
  const label = (k: number): string => `Hunks of ${k} of ${stat.length} files:`;
  let used = bytesOf(head) + 1 + bytesOf(label(order.length)) + 1;
  for (const [i, h] of order.entries()) {
    const need = bytesOf(h.text) + 1;
    if (used + need <= bytes) { shown.push(h.text); used += need; continue; }
    if (i === 0 && bytes - used > 0) { // the riskiest alone exceeds the budget: its head, marked
      const mark = `\n… cut: the rest of ${quotePath(h.path)} is not shown`;
      const room = bytes - used - 1 - bytesOf(mark);
      if (room > 0) { const part = cutBytes(h.text, room) + mark; shown.push(part); used += bytesOf(part) + 1; }
    }
  }
  return cutBytes([head, label(shown.length), ...shown].join("\n"), bytes);
}
