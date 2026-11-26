// The classifier's policy from the base commit (local-first spec CLS-2, design §5.4, D89, plan S38): the file `policyFile` at
// the commit the base names, never the branch under review, so a branch that rewrites the policy cannot grade itself. The
// file's absence at the base → the settings' policy; anything else that is not a readable, valid policy (an unresolvable base,
// a git failure or timeout, a directory or symlink at the path, malformed JSON, an unknown key) → an error, which the gate
// classes elevated (`classBy: error`): the policy is a security boundary, so only a proven absence falls back (LF6 review m2).
// Git is read through `PolicyGit`, built from the runner `createGit` is built on; the module imports only the policy's type (NR-6).
import type { GitRun } from "./git.ts";
import type { Policy } from "../strategy/types.ts";

export type PolicyRead = { policy: Policy; source: "base" | "settings" } | { error: string };

/** A file at a commit: its text, a proven absence, or a failure (never told apart by `undefined`, as `Git.show` does). */
export type Shown = { text: string } | { absent: true } | { error: string };
export interface PolicyGit {
  /** The commit `ref` names; undefined when it names none or git fails. */
  sha(repo: string, ref: string): Promise<string | undefined>;
  /** The file `path` at the commit `sha`: `absent` only when git lists nothing at the path; a directory, a symlink and a
   *  submodule are errors, like a failing or timed-out git. */
  show(repo: string, sha: string, path: string): Promise<Shown>;
}

const MS = 5000;
const failed = (what: string, r: { out: string; err: string; timedOut: boolean; exit: number }): { error: string } =>
  ({ error: `${what}: ${r.timedOut ? "git timed out" : r.err.trim().slice(-300) || `git exited ${r.exit}`}` });

export const policyGit = (run: GitRun): PolicyGit => ({
  async sha(repo, ref) {
    const r = await run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], repo, MS);
    return r.exit === 0 && r.out.trim() !== "" ? r.out.trim() : undefined;
  },
  async show(repo, sha, path) {
    const ls = await run(["ls-tree", "-z", sha, "--", path], repo, MS);
    if (ls.exit !== 0) return failed("git ls-tree", ls);
    const entries = ls.out.split("\0").filter((x) => x !== "");
    if (entries.length === 0) return { absent: true };
    const m = /^(\d+) (\S+) ([0-9a-f]+)\t/.exec(entries[0]!);
    if (entries.length !== 1 || !m || m[2] !== "blob" || m[1] === "120000") return { error: "not a regular file" };
    const blob = await run(["cat-file", "blob", m[3]!], repo, MS);
    return blob.exit === 0 ? { text: blob.out } : failed("git cat-file", blob);
  },
});

const GLOB_KEYS = ["inertGlobs", "testGlobs", "ciGlobs", "riskGlobs", "configGlobs", "publicApiGlobs"] as const;
const KEYS = new Set<string>([...GLOB_KEYS, "componentDepth"]);

/** `fallback` = the settings' policy (`settingsPolicy(s)`: the built-in globs, `mergeGate.inertGlobs`, `riskGlobs`,
 *  `plans.publicApiGlobs`). `base` is resolved once; the file is read at the resolved commit. */
export async function readPolicy(git: PolicyGit, repo: string, base: string, policyFile: string, fallback: Policy): Promise<PolicyRead> {
  const sha = await git.sha(repo, base);
  if (sha === undefined) return { error: `policy: cannot resolve the base ${base}` };
  const shown = await git.show(repo, sha, policyFile);
  if ("error" in shown) return { error: `policy: cannot read ${policyFile} at the base ${base}: ${shown.error}` };
  if ("absent" in shown) return { policy: fallback, source: "settings" };
  let raw: unknown;
  try { raw = JSON.parse(shown.text); } catch (e) { return { error: `policy: ${policyFile} at the base is not JSON: ${(e as Error).message}` }; }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { error: `policy: ${policyFile} must be an object` };
  const o = raw as Record<string, unknown>;
  const unknown = Object.keys(o).filter((k) => !KEYS.has(k));
  if (unknown.length > 0) return { error: `policy: ${policyFile} has unknown keys: ${unknown.join(", ")}` };
  const policy: Policy = { ...fallback };
  for (const k of GLOB_KEYS) {
    if (!(k in o)) continue;
    const v = o[k];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return { error: `policy: ${k} must be a list of strings` };
    policy[k] = v as string[];
  }
  if ("componentDepth" in o) {
    const d = o.componentDepth;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1) return { error: "policy: componentDepth must be an integer >= 1" };
    policy.componentDepth = d;
  }
  return { policy, source: "base" };
}
