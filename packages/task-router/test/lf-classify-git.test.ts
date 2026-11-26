// Local-first plan LF6.T4 (spec CLS-2, design §5.4, D89): the classifier's policy comes from the BASE commit's `policyFile`
// (real git), never from the branch under review; no file there → the settings' globs; a malformed one → an error the
// gate classes elevated. A branch that edits the policy file is elevated (`policy-edit`) and judged by the base's policy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGit, gitRunner } from "../core/local/git.ts";
import { readPolicy } from "../core/local/policyfile.ts";
import { classify } from "../core/strategy/classify.ts";
import { globMatch } from "../core/glob.ts";
import type { Policy } from "../core/strategy/types.ts";
import { tempRepo } from "./git-repo.ts";

const FALLBACK: Policy = {
  inertGlobs: ["**/*.md"], testGlobs: ["test/**"], ciGlobs: [".github/**"], riskGlobs: ["**/auth/**"],
  configGlobs: ["**/*.json"], publicApiGlobs: [], componentDepth: 1,
};
const FILE = ".pi/task-router-policy.json";
const rig = () => {
  const r = tempRepo();
  const git = createGit(gitRunner("git", r.env));
  return { ...r, port: git, base: () => r.git(["rev-parse", "HEAD"]) };
};

test("CLS-2 no policy file at the base → the settings' policy", async () => {
  const r = rig();
  assert.deepEqual(await readPolicy(r.port, r.dir, r.base(), FILE, FALLBACK), { policy: FALLBACK, source: "settings" });
});

test("CLS-2 a policy file at the base overrides only the keys it names", async () => {
  const r = rig();
  r.commit(FILE, JSON.stringify({ riskGlobs: ["secret/**"], componentDepth: 2 }));
  const got = await readPolicy(r.port, r.dir, r.base(), FILE, FALLBACK);
  assert.deepEqual(got, { policy: { ...FALLBACK, riskGlobs: ["secret/**"], componentDepth: 2 }, source: "base" });
});

test("CLS-2 the branch edits the policy file to mark everything inert → elevated, by the base's policy", async () => {
  const r = rig();
  r.commit(FILE, JSON.stringify({ inertGlobs: ["docs/**"] }));
  const base = r.base();
  r.git(["checkout", "-q", "-b", "feat"]);
  r.commit(FILE, JSON.stringify({ inertGlobs: ["**"], riskGlobs: [], testGlobs: ["**"] }), "weaken the policy");
  r.commit("src/a.ts", "x\n", "code");
  const got = await readPolicy(r.port, r.dir, base, FILE, FALLBACK);
  assert.ok("policy" in got);
  assert.deepEqual(got.policy.inertGlobs, ["docs/**"], "the base's globs, not the branch tip's");
  assert.deepEqual(got.policy.riskGlobs, FALLBACK.riskGlobs);
  const ctx = { plansDir: "docs/plans", policyFile: FILE, glob: globMatch, inertChecked: true };
  const c = classify([{ path: FILE, added: 1, deleted: 1 }, { path: "src/a.ts", added: 1, deleted: 0 }], got.policy, ctx);
  assert.deepEqual([c.cls, c.why, c.inertLike], ["elevated", ["policy-edit"], false]);
  // by the base's policy, the branch's code file is plain code (the tip's would have made it inert)
  assert.equal(classify([{ path: "src/a.ts", added: 1, deleted: 0 }], got.policy, ctx).cls, "standard");
});

test("CLS-2 a branch that adds the policy file is judged by the settings and is elevated", async () => {
  const r = rig();
  const base = r.base();
  r.git(["checkout", "-q", "-b", "feat"]);
  r.commit(FILE, JSON.stringify({ inertGlobs: ["**"] }));
  const got = await readPolicy(r.port, r.dir, base, FILE, FALLBACK);
  assert.deepEqual(got, { policy: FALLBACK, source: "settings" });
  const ctx = { plansDir: "docs/plans", policyFile: FILE, glob: globMatch, inertChecked: true };
  assert.deepEqual(classify([{ path: FILE, added: 1, deleted: 0 }], FALLBACK, ctx).why, ["policy-edit"]);
});

test("CLS-2 a malformed policy file at the base is an error (elevated)", async () => {
  const bad: [string, string][] = [
    ["not json", "{"], ["empty", ""], ["an array", "[]"], ["null", "null"],
    ["unknown key", JSON.stringify({ inertGlob: [] })],
    ["globs not an array", JSON.stringify({ riskGlobs: "x" })],
    ["a glob not a string", JSON.stringify({ riskGlobs: ["a", 3] })],
    ["depth 0", JSON.stringify({ componentDepth: 0 })],
    ["depth fraction", JSON.stringify({ componentDepth: 1.5 })],
    ["depth string", JSON.stringify({ componentDepth: "2" })],
  ];
  for (const [name, text] of bad) {
    const r = rig();
    r.commit(FILE, text);
    const got = await readPolicy(r.port, r.dir, r.base(), FILE, FALLBACK);
    assert.ok("error" in got && got.error.length > 0, `${name}: ${JSON.stringify(got)}`);
  }
});

test("CLS-2 an unknown base is an error, not the settings' policy (fail closed)", async () => {
  const r = rig();
  const got = await readPolicy(r.port, r.dir, "0".repeat(40), FILE, FALLBACK);
  assert.ok("error" in got, JSON.stringify(got));
});
