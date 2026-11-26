// Local-first plan LF6.T1 (spec CLS-1, design §5.4, plan S38, D89): the deterministic classifier. One case per rule, a mixed
// change takes its highest file class, an error fails closed, `why` lists every proxy that fired (sorted, `classBy`), and a
// component is the first `componentDepth` directories of a path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, type ClassifyContext } from "../core/strategy/classify.ts";
import { globMatch } from "../core/glob.ts";
import type { FileFact, Policy } from "../core/strategy/types.ts";

const POLICY: Policy = {
  inertGlobs: ["**/*.md", "**/*.txt", "**/*.rst", "**/LICENSE", "**/NOTICE"],
  testGlobs: ["test/**", "**/*.test.ts"],
  ciGlobs: [".github/**", ".gitlab-ci.yml", "flake.nix", "flake.lock", "**/Dockerfile"],
  riskGlobs: ["**/auth/**", "**/migrations/**", "**/secrets/**"],
  configGlobs: ["**/*.json", "**/*.toml", "**/*.yaml", "**/*.yml", "**/*.nix"],
  publicApiGlobs: ["api/**"],
  componentDepth: 1,
};
const CTX: ClassifyContext = { plansDir: "docs/plans", policyFile: ".pi/task-router-policy.json", glob: globMatch };
const f = (path: string, added = 5, deleted = 1): FileFact => ({ path, added, deleted });
const run = (paths: (string | FileFact)[], p: Policy = POLICY, ctx: ClassifyContext = CTX) =>
  classify(paths.map((x) => (typeof x === "string" ? f(x) : x)), p, ctx);

test("CLS-1 risk: a riskGlobs match is elevated", () => {
  const r = run(["src/auth/login.ts"]);
  assert.deepEqual([r.cls, r.why], ["elevated", ["risk"]]);
});

test("CLS-1 ci: CI and infrastructure files are elevated", () => {
  for (const p of [".github/workflows/x.yml", "flake.nix", "flake.lock", "svc/Dockerfile", ".gitlab-ci.yml"]) {
    const r = run([p]);
    assert.deepEqual([p, r.cls, r.why], [p, "elevated", ["ci"]]);
  }
});

test("CLS-1 gate-config: the gate's own configuration is elevated", () => {
  for (const p of [".pi/settings.json", "task-router.json", "conf/task-router-local.json"]) {
    const r = run([p]);
    assert.deepEqual([p, r.cls, r.why], [p, "elevated", ["gate-config"]]);
  }
});

test("CLS-1 policy-edit: the policy file itself is elevated", () => {
  const r = run([".pi/task-router-policy.json"]);
  assert.deepEqual([r.cls, r.why], ["elevated", ["policy-edit"]]);
  const other = run(["cfg/policy.json"], POLICY, { ...CTX, policyFile: "cfg/policy.json" });
  assert.deepEqual([other.cls, other.why], ["elevated", ["policy-edit"]]);
});

test("CLS-1 public-api: plans.publicApiGlobs matches are elevated", () => {
  const r = run(["api/v1/routes.ts"]);
  assert.deepEqual([r.cls, r.why], ["elevated", ["public-api"]]);
});

test("CLS-1 weakened-tests: a test file with more deleted than added lines, or deleted, is elevated", () => {
  assert.deepEqual([run([f("test/a.test.ts", 3, 9)]).cls, run([f("test/a.test.ts", 3, 9)]).why], ["elevated", ["weakened-tests"]]);
  assert.deepEqual([run([f("test/a.test.ts", 0, 40)]).cls, run([f("test/a.test.ts", 0, 40)]).why], ["elevated", ["weakened-tests"]]);
  for (const [a, d] of [[9, 3], [4, 4]] as const) assert.equal(run([f("test/a.test.ts", a, d)]).cls, "standard", `${a}/${d}`);
  // a non-test file may delete more than it adds
  assert.equal(run([f("src/a.ts", 1, 90)]).cls, "standard");
});

test("CLS-1 coupled: ≥ 3 changed code files in ≥ 2 components is elevated", () => {
  const r = run(["src/a.ts", "src/b.ts", "lib/c.ts"]);
  assert.deepEqual([r.cls, r.why], ["elevated", ["coupled"]]);
  assert.equal(run(["src/a.ts", "src/b.ts", "src/c.ts"]).cls, "standard", "three files, one component");
  assert.equal(run(["src/a.ts", "lib/c.ts"]).cls, "standard", "two components, two files");
  // docs, tests and config are not code
  assert.equal(run(["src/a.ts", "lib/b.ts", "docs/c.md", "test/d.test.ts"]).cls, "standard");
});

test("CLS-1 multi-component-config: config files in ≥ 2 components is elevated", () => {
  const r = run(["svc/a.json", "web/b.toml"]);
  assert.deepEqual([r.cls, r.why], ["elevated", ["multi-component-config"]]);
  assert.equal(run(["svc/a.json", "svc/b.toml"]).cls, "standard", "one component");
  assert.equal(run(["svc/a.json", "web/b.ts"]).cls, "standard", "one config file");
});

test("CLS-1 componentDepth: depth 2 splits packages/a from packages/b, depth 1 does not", () => {
  const paths = ["packages/a/x.nix", "packages/b/y.nix"];
  assert.deepEqual([run(paths, { ...POLICY, componentDepth: 2 }).cls, run(paths, { ...POLICY, componentDepth: 2 }).why], ["elevated", ["multi-component-config"]]);
  assert.deepEqual([run(paths, { ...POLICY, componentDepth: 1 }).cls, run(paths, { ...POLICY, componentDepth: 1 }).why], ["standard", []]);
  // a root file is its own component: it does not share one with a nested file
  assert.equal(run(["a.json", "b.json"]).cls, "standard");
  assert.equal(run(["a.json", "svc/b.json"]).cls, "elevated");
});

test("CLS-1 everything else is standard; inert files are standard here, with no why", () => {
  const r = run(["src/a.ts", "src/b.ts"]);
  assert.deepEqual([r.cls, r.why], ["standard", []]);
});

test("CLS-1 mixed: the highest file class wins", () => {
  assert.equal(run(["docs/a.md", "src/a.ts"]).cls, "standard");
  assert.equal(run(["docs/a.md", "src/a.ts", "src/auth/x.ts"]).cls, "elevated");
  assert.equal(run(["docs/a.md", ".github/ci.yml"]).cls, "elevated");
});

test("CLS-1 why lists every proxy that fired, sorted", () => {
  const r = run([
    "src/auth/x.ts", ".github/ci.yml", ".pi/settings.json", ".pi/task-router-policy.json", "api/x.ts", f("test/a.test.ts", 0, 9),
    "svc/a.json", "web/b.json", "src/c.ts", "lib/d.ts",
  ]);
  assert.equal(r.cls, "elevated");
  assert.deepEqual(r.why, ["ci", "coupled", "gate-config", "multi-component-config", "policy-edit", "public-api", "risk", "weakened-tests"]);
});

test("CLS-1 an error fails closed: elevated, why [error]", () => {
  const broken = { ...POLICY, riskGlobs: undefined as unknown as string[] };
  const r = run(["src/a.ts"], broken);
  assert.deepEqual([r.cls, r.why, r.inertLike], ["elevated", ["error"], false]);
  const bad = classify([{ path: undefined as unknown as string, added: 0, deleted: 0 }], POLICY, CTX);
  assert.deepEqual([bad.cls, bad.why], ["elevated", ["error"]]);
});
