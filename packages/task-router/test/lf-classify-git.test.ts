// Local-first plan LF6.T4 (spec CLS-2, design §5.4, D89): the classifier's policy comes from the BASE commit's `policyFile`
// (real git), never from the branch under review; no file there → the settings' globs; a malformed one → an error the
// gate classes elevated. A branch that edits the policy file is elevated (`policy-edit`) and judged by the base's policy.
import { mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { gitRunner, type GitOut, type GitRun } from "../core/local/git.ts";
import { policyGit, readPolicy } from "../core/local/policyfile.ts";
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
  const port = policyGit(gitRunner("git", r.env));
  return { ...r, port, base: () => r.git(["rev-parse", "HEAD"]) };
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

test("CLS-2 a directory or a symlink at the policy path is an error, not an absent file (LF6 review m2)", async () => {
  const dir = rig();
  dir.commit(`${FILE}/inner.json`, "{}");
  const d = await readPolicy(dir.port, dir.dir, dir.base(), FILE, FALLBACK);
  assert.ok("error" in d && d.error.includes(FILE), JSON.stringify(d));
  const link = rig();
  link.commit("target.json", "{}");
  mkdirSync(dirname(join(link.dir, FILE)), { recursive: true });
  symlinkSync("../target.json", join(link.dir, FILE));
  link.git(["add", "-A"]);
  link.git(["commit", "-q", "-m", "link"]);
  const l = await readPolicy(link.port, link.dir, link.base(), FILE, FALLBACK);
  assert.ok("error" in l, JSON.stringify(l));
});

test("CLS-2 the file is read at the commit that was resolved, not at the ref name (the target may move in between)", async () => {
  const r = rig();
  r.git(["checkout", "-q", "-b", "target"]);
  r.commit(FILE, JSON.stringify({ riskGlobs: ["a/**"] }));
  const moving = {
    ...r.port,
    async sha(repo: string, ref: string) {
      const resolved = await r.port.sha(repo, ref);
      r.commit(FILE, JSON.stringify({ riskGlobs: ["b/**"] }), "the target moves");
      return resolved;
    },
  };
  const got = await readPolicy(moving, r.dir, "target", FILE, FALLBACK);
  assert.ok("policy" in got);
  assert.deepEqual(got.policy.riskGlobs, ["a/**"], "the resolved commit's policy");
});

/** A runner that answers by git's subcommand; the base resolves to a fixed commit. */
const SHA = "a".repeat(40);
const ok = (out: string): GitOut => ({ exit: 0, out, err: "", timedOut: false });
const runner = (answers: Record<string, GitOut>): GitRun => async (args) => (args[0] === "rev-parse" ? ok(`${SHA}\n`) : answers[args[0]!]!);
const BLOB = "b".repeat(40);
const LS = ok(`100644 blob ${BLOB}\t${FILE}\0`);

test("CLS-2 a git failure is an error; only a proven absence falls back to the settings", async () => {
  const read = (answers: Record<string, GitOut>) => readPolicy(policyGit(runner(answers)), "/r", "main", FILE, FALLBACK);
  assert.deepEqual(await read({ "ls-tree": ok("") }), { policy: FALLBACK, source: "settings" }, "git lists nothing: absent");
  for (const [name, ls] of [
    ["timeout", { exit: 124, out: "", err: "", timedOut: true }], ["exit 128", { exit: 128, out: "", err: "fatal: bad object", timedOut: false }],
    ["no git", { exit: 127, out: "", err: "spawn git ENOENT", timedOut: false }],
  ] as [string, GitOut][]) {
    const got = await read({ "ls-tree": ls });
    assert.ok("error" in got, `${name}: ${JSON.stringify(got)}`);
  }
  // the entry is listed but cannot be read (the object vanished, a timeout)
  const lost = await read({ "ls-tree": LS, "cat-file": { exit: 128, out: "", err: "fatal: bad object", timedOut: false } });
  assert.ok("error" in lost, JSON.stringify(lost));
  const slow = await read({ "ls-tree": LS, "cat-file": { exit: 124, out: "", err: "", timedOut: true } });
  assert.ok("error" in slow && slow.error.includes("timed out"), JSON.stringify(slow));
  assert.deepEqual(await read({ "ls-tree": LS, "cat-file": ok(JSON.stringify({ componentDepth: 2 })) }), { policy: { ...FALLBACK, componentDepth: 2 }, source: "base" });
  // an unlisted kind or more than one entry is no regular file
  for (const out of [`040000 tree ${BLOB}\t${FILE}\0`, `120000 blob ${BLOB}\t${FILE}\0`, `160000 commit ${BLOB}\t${FILE}\0`, `${LS.out}${LS.out}`, "garbage\0"]) {
    const got = await read({ "ls-tree": ok(out), "cat-file": ok("{}") });
    assert.ok("error" in got, JSON.stringify([out, got]));
  }
});
