// The classifier's policy from the base commit (local-first spec CLS-2, design §5.4, D89, plan S38): `git show
// <base>:<policyFile>`, never the branch under review, so a branch that rewrites the policy cannot grade itself. Absent
// file → the settings' policy; a malformed file, an unknown key or an unreadable base → an error, which the gate classes
// elevated (`classBy: error`). The module reads git through the port and imports only the policy's type (NR-6).
import type { Git } from "./git.ts";
import type { Policy } from "../strategy/types.ts";

export type PolicyRead = { policy: Policy; source: "base" | "settings" } | { error: string };

const GLOB_KEYS = ["inertGlobs", "testGlobs", "ciGlobs", "riskGlobs", "configGlobs", "publicApiGlobs"] as const;
const KEYS = new Set<string>([...GLOB_KEYS, "componentDepth"]);

/** `fallback` = the settings' globs (`mergeGate.inertGlobs`, `riskGlobs`, `plans.publicApiGlobs`, the built-in test, CI and config globs). */
export async function readPolicy(
  git: Pick<Git, "show" | "sha">, repo: string, base: string, policyFile: string, fallback: Policy,
): Promise<PolicyRead> {
  if ((await git.sha(repo, base)) === undefined) return { error: `policy: cannot resolve the base ${base}` };
  const text = await git.show(repo, base, policyFile);
  if (text === undefined) return { policy: fallback, source: "settings" };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { error: `policy: ${policyFile} at the base is not JSON: ${(e as Error).message}` }; }
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
