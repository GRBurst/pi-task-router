// Local-first plan LF1.T6, T7 (spec §2.4, LOG-1): a merge line names what a revert needs: the target's tip before the
// merge (`base`), the branch merged into (`target`), the repository (`repo` basename, `repoId` its root commit).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeEvent } from "../core/outcome.ts";

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
