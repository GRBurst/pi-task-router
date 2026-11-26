// The risk classifier (local-first spec CLS-1, design §5.4, plan S38, D89): from a diff's files and the policy (globs read at
// the base commit, `core/local/policyfile.ts`) to a class and the proxies that fired. A mixed change takes its highest file
// class; any error fails closed. Pure: the glob matcher is injected, because a strategy part imports nothing outside
// `core/strategy/` (NR-6); the composition passes `globMatch` (`core/glob.ts`).
import type { FileFact, Policy, RiskClass } from "./types.ts";

/** What the classifier needs besides the files and the policy: settings-level constants and the matcher. */
export interface ClassifyContext {
  /** `plans.dir`: its files are never inert (a plan rewrite goes through a code review, MGS §2.1). */
  plansDir: string;
  /** `localFirst.policyFile`: an edit of it is `policy-edit`. */
  policyFile: string;
  /** Anchored glob match: `**\/` any leading directories, `**` anything, `*` within a segment (`core/glob.ts`). */
  glob: (glob: string, path: string) => boolean;
}
export interface Classification { cls: RiskClass; inertLike: boolean; why: string[] }

/** The gate's own configuration besides the policy file (S38). */
const GATE_CONFIG = [".pi/**", "**/task-router*.json"];

/** A component = the first `depth` directories of the path; a root file has the component "". */
const component = (path: string, depth: number): string => path.split("/").slice(0, -1).slice(0, depth).join("/");

export function classify(files: readonly FileFact[], p: Policy, ctx: ClassifyContext): Classification {
  try {
    return classifyFiles(files, p, ctx);
  } catch {
    return { cls: "elevated", inertLike: false, why: ["error"] };
  }
}

function classifyFiles(files: readonly FileFact[], p: Policy, ctx: ClassifyContext): Classification {
  const any = (globs: readonly string[], path: string): boolean => globs.some((g) => ctx.glob(g, path));
  const depth = Number.isInteger(p.componentDepth) && p.componentDepth >= 1 ? p.componentDepth : 1;
  const why = new Set<string>();
  const proxy = (name: string, fired: boolean): boolean => { if (fired) why.add(name); return fired; };
  const configFiles: string[] = [], codeFiles: string[] = [];
  let elevated = false;
  for (const { path, added, deleted } of files) {
    if (typeof path !== "string" || !Number.isFinite(added) || !Number.isFinite(deleted)) throw new Error("malformed file fact");
    const fired = [
      proxy("risk", any(p.riskGlobs, path)),
      proxy("ci", any(p.ciGlobs, path)),
      proxy("policy-edit", path === ctx.policyFile),
      proxy("gate-config", path !== ctx.policyFile && any(GATE_CONFIG, path)),
      proxy("public-api", any(p.publicApiGlobs, path)),
      proxy("weakened-tests", any(p.testGlobs, path) && deleted > added),
    ];
    if (fired.includes(true)) elevated = true;
    if (any(p.configGlobs, path)) configFiles.push(path);
    else if (!any(p.inertGlobs, path) && !any(p.testGlobs, path)) codeFiles.push(path);
  }
  const components = (paths: string[]): number => new Set(paths.map((x) => component(x, depth))).size;
  if (proxy("coupled", codeFiles.length >= 3 && components(codeFiles) >= 2)) elevated = true;
  if (proxy("multi-component-config", configFiles.length >= 2 && components(configFiles) >= 2)) elevated = true;
  return { cls: elevated ? "elevated" : "standard", inertLike: false, why: [...why].sort() };
}
