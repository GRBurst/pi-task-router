// Local-first plan LF1.T6, T7 (spec §2.4, LOG-1): a merge line names what a revert needs: the target's tip before the
// merge (`base`), the branch merged into (`target`), the repository (`repo` basename, `repoId` its root commit).
import { test } from "node:test";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { mergeEvent } from "../core/outcome.ts";
import { mergeRig } from "./merge-rig.ts";

const NOW = new Date(Date.UTC(2026, 9, 2, 12, 0, 0));
const SHA = "0123456789abcdef0123456789abcdef01234567";
const TIP = "fedcba9876543210fedcba9876543210fedcba98";

test("LOG-1 builder", () => {
  const head = { v: 2, ts: NOW.toISOString(), event: "merge", taskId: "lm/x", outcome: "merged", commit: SHA };
  const full = { base: TIP, target: "main", repoId: "0123456789ab", class: "S", tier: "sonnet", actualTier: "opus", node: "n1" };
  assert.deepEqual(mergeEvent({ now: NOW, branch: "lm/x", outcome: "merged", commit: SHA, repo: "/work/repo", ...full }),
    { ...head, repo: "repo", ...full });
  // optional: a line without them has none
  assert.deepEqual(mergeEvent({ now: NOW, branch: "lm/x", outcome: "merged", commit: SHA }), head);
});

test("LOG-1 git", async () => {
  const m = mergeRig({ settings: { mergeGate: { redRun: false } } });
  const lines: Record<string, unknown>[] = [];
  m.ports.log = (i) => { lines.push(mergeEvent({ ...i, now: NOW })); };
  let asked = 0; // the root commit is asked once per repository
  m.ports.git = { ...m.git, rootCommit: (repo) => { asked++; return m.git.rootCommit!(repo); } };
  const roots = m.r.git(["rev-list", "--max-parents=0", "HEAD"]).split("\n").sort();
  const fields = (l: Record<string, unknown> | undefined) => l && { base: l.base, target: l.target, repo: l.repo, repoId: l.repoId };
  for (const slug of ["x", "y"]) {
    const rec = await m.start(slug);
    m.r.commit(`${slug}.ts`, "x\n", slug, rec.worktree);
    const before = m.mainSha();
    const res = await m.merge();
    assert.equal(res.status, "merged", JSON.stringify(res));
    assert.notEqual(m.mainSha(), roots[0], "HEAD is not the root commit");
    assert.deepEqual(fields(lines.at(-1)), { base: before, target: "main", repo: basename(m.r.dir), repoId: roots[0]!.slice(0, 12) });
  }
  assert.equal(asked, 1);
});
