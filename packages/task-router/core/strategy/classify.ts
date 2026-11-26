// The risk classifier (local-first spec CLS-1, design §5.4, plan S38, D89): from a diff's files and the policy (globs read at
// the base commit, `core/local/policyfile.ts`) to a class and the proxies that fired. A mixed change takes its highest file
// class; any error fails closed. Pure: the glob matcher is injected, because a strategy part imports nothing outside
// `core/strategy/` (NR-6); the composition passes `globMatch` (`core/glob.ts`).
import type { Classification, ClassifyContext, FileFact, Policy } from "./types.ts";

/** The gate's own configuration besides the policy file (S38). */
const GATE_CONFIG = [".pi/**", "**/task-router*.json"];

/** Agent-instruction files (`AGENTS.md`, `CLAUDE.md`, `.pi/`, `skills`/`prompts` directories) are prose, never inert (MGS §2.1). */
const INSTRUCTION_GLOBS = ["**/AGENTS.md", "**/CLAUDE.md", "**/.pi/**", "**/skills/**", "**/prompts/**"];

/** A component = the first `depth` directories of the path; a root file has the component "". */
const component = (path: string, depth: number): string => path.split("/").slice(0, -1).slice(0, depth).join("/");

export function classify(files: readonly FileFact[], p: Policy, ctx: ClassifyContext): Classification {
  try {
    return classifyFiles(files, p, ctx);
  } catch {
    return { cls: "elevated", inertLike: false, why: ["error"] };
  }
}

function classifyFiles(all: readonly FileFact[], p: Policy, ctx: ClassifyContext): Classification {
  // D85: the router owns `<plans.dir>/split/**`; it never counts toward class, size or scope
  const files = all.filter((x) => !ctx.glob(`${ctx.plansDir}/split/**`, x.path));
  const any = (globs: readonly string[], path: string): boolean => globs.some((g) => ctx.glob(g, path));
  const depth = p.componentDepth;
  if (!Number.isInteger(depth) || depth < 1) throw new Error("componentDepth must be an integer >= 1"); // fail closed, never depth 1
  const why = new Set<string>();
  const proxy = (name: string, fired: boolean): boolean => { if (fired) why.add(name); return fired; };
  const configFiles: string[] = [], codeFiles: string[] = [];
  let elevated = false, inertFiles = 0, likeFiles = 0;
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
    const owned = any(INSTRUCTION_GLOBS, path) || ctx.glob(`${ctx.plansDir}/**`, path);
    const isTest = any(p.testGlobs, path), isConfig = any(p.configGlobs, path), isInert = any(p.inertGlobs, path);
    if (isInert && !owned) inertFiles++;
    if ((isInert || isTest) && !owned) likeFiles++;
    // one kind per file: a config file under a test glob is a test fixture; instruction and plan files are code, as they are
    // never inert or inert-like (a plain doc or a test is not code)
    if (isConfig && !isTest) configFiles.push(path);
    else if (!isConfig && (owned || !(isInert || isTest))) codeFiles.push(path);
  }
  const components = (paths: string[]): number => new Set(paths.map((x) => component(x, depth))).size;
  if (proxy("coupled", codeFiles.length >= 3 && components(codeFiles) >= 2)) elevated = true;
  if (proxy("multi-component-config", configFiles.length >= 2 && components(configFiles) >= 2)) elevated = true;
  // CLS-3: inert only when every file is inert and a configured check passes; a riskGlobs match is elevated, never inert
  const inert = files.length > 0 && inertFiles === files.length && ctx.inertChecked;
  // CLS-4: every file inert-class, or tests and docs only; an elevated change is in no E17 stratum
  const inertLike = !elevated && likeFiles === files.length;
  return { cls: elevated ? "elevated" : inert ? "inert" : "standard", inertLike, why: [...why].sort() };
}
