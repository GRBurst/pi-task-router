// Local-first plan LF6.T8–T13 (spec §3.6 REV-1, REV-3, REV-4, REV-9, REV-10; CLS-2; design §5.4): the local-first gate classes
// the change by the policy at the main branch's tip, picks the reviewer by the class and the diff's actual tier, and runs it.
// Real git (the node rig); the overseer rig for the member a ticket names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nodeRig } from "./node-rig.ts";
import { REVISE } from "./merge-rig.ts";
import { rig as overseerRig, VALID } from "./overseer-rig.ts";
import type { PolicyGit } from "../core/local/policyfile.ts";
import type { ReviewerChoice } from "../core/strategy/types.ts";

const text = (n: number, tag: string): string => Array.from({ length: n }, (_, k) => `export const ${tag}${k} = ${k};\n`).join("");

/** The node rig with one local-first node `feat` (after `onMain` is committed on main; its check `check`); `put(files)` commits
 *  `{path: lines or text}` on its branch. */
async function gate(settings: Record<string, unknown> = {}, onMain?: Record<string, number | string>, check = "true") {
  const x = nodeRig(settings);
  const put = (files: Record<string, number | string>, dir = n.worktree): void => {
    for (const [p, k] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), typeof k === "number" ? text(k, "v") : k);
    }
    x.r.git(["add", "-A"], dir);
    x.r.git(["commit", "-q", "-m", "work"], dir);
  };
  if (onMain) put(onMain, x.r.dir);
  const n = await x.node({ slug: "feat", check, estimate: { kind: "code", lines: 100 } });
  return { ...x, n, put, mergeIt: () => x.merge({ branch: n.branch }) };
}

test("REV-1", async () => {
  // the gate: class standard, 200 lines (tier large) → Opus, binding; the review and merge lines carry the class and tiers
  const x = await gate();
  x.put({ "src/a.ts": 200 });
  const r = await x.mergeIt();
  assert.equal(r.status, "merged", r.detail);
  const a = x.reviews[0]!;
  assert.deepEqual(a.choice, { reviewer: "opus", binding: true, fresh: true, orthogonal: false });
  assert.deepEqual(a.line, { class: "standard", classBy: [], tier: "standard", actualTier: "large", reviewer: "opus", binding: true });
  const m = x.lines.at(-1)!;
  assert.deepEqual([m.class, m.classBy, m.tier, m.actualTier, m.node], ["standard", [], "standard", "large", "feat"]);
  // the ticket names the member `localFirst.reviewers` maps the choice to, never the Opus budget's pick
  const o = overseerRig({ budget: { opusUsed: 15 } });
  o.h.router.settings.localFirst.reviewers.opus = "sonnet";
  o.on.each = async () => { await o.tool().execute(VALID); };
  const out = await o.run({ choice: { reviewer: "opus", binding: true, fresh: true, orthogonal: false } });
  assert.equal(out.ok, true);
  assert.equal(o.spawned()[1], "anthropic/claude-sonnet-5-5");
  const line = o.h.lines().find((l) => l.event === "review")!;
  assert.equal(line.fallback, undefined, "no budget fallback (CON-11)");
  // legacy local mode: no choice → pickMember (the budget spent → the fallback member, `budget`)
  const legacy = overseerRig({ budget: { opusUsed: 15 } });
  legacy.on.each = async () => { await legacy.tool().execute(VALID); };
  await legacy.run();
  assert.equal(legacy.h.lines().find((l) => l.event === "review")!.fallback, "budget");
});

test("SIZE-2 the gate's size drops the split files (D85)", async () => {
  // review lf56 M1: a 200-line split file of the router's plus 10 code lines is a small change: the tier, the reviewer and nLines
  const x = await gate();
  x.put({ "docs/plans/split/feat.json": 200, "src/a.ts": 10 });
  const r = await x.mergeIt();
  assert.equal(r.status, "merged", r.detail);
  assert.deepEqual([x.reviews[0]!.line!.actualTier, x.reviews[0]!.choice!.reviewer, x.reviews[0]!.overCap], ["small", "sonnet", undefined]);
  assert.deepEqual([x.lines.at(-1)!.actualTier, x.lines.at(-1)!.nLines, x.lines.at(-1)!.nFiles], ["small", 10, 1]);
  // the same file under another path counts
  const y = await gate();
  y.put({ "docs/other/feat.json": 200, "src/a.ts": 10 });
  assert.equal((await y.mergeIt()).status, "merged");
  assert.deepEqual([y.lines.at(-1)!.actualTier, y.lines.at(-1)!.nLines], ["large", 210]);
});

test("REV-1 the policy at main's tip", async () => {
  // a policy file on main marks src/pay/** risky; a node's change there is elevated, classed by main's policy (CLS-2)
  const x = await gate();
  x.put({ ".pi/task-router-policy.json": JSON.stringify({ riskGlobs: ["src/pay/**"] }) }, x.r.dir);
  // (elevated: the branch checks are not vacuous, the orthogonal check of REV-3)
  const n = await x.node({ slug: "pay", check: "test -f src/pay/a.ts", estimate: { kind: "code", lines: 10 } });
  x.put({ "src/pay/a.ts": 5 }, n.worktree);
  assert.equal((await x.merge({ branch: n.branch })).status, "merged");
  assert.deepEqual([x.reviews.at(-1)!.line!.class, x.reviews.at(-1)!.line!.classBy], ["elevated", ["risk"]]);
  // a node → parent merge reads main's tip too: the parent's branch rewrites the policy, its child is still classed by main's
  const p = await x.node({ slug: "par", estimate: { kind: "plan", lines: 0 } });
  x.put({ ".pi/task-router-policy.json": JSON.stringify({ riskGlobs: [] }) }, p.worktree);
  const c = await x.node({ parent: "par", slug: "kid", check: "test -f src/pay/b.ts", estimate: { kind: "code", lines: 10 } });
  x.put({ "src/pay/b.ts": 5 }, c.worktree);
  assert.equal((await x.merge({ branch: c.branch })).status, "merged");
  assert.deepEqual([x.lines.at(-1)!.target, x.reviews.at(-1)!.line!.class], [p.branch, "elevated"]);
});

test("REV-1 policy errors fail closed", async () => {
  // a malformed file at main's tip, an unresolvable base and a git failure: elevated, classBy ["error"] on review and merge
  const real = "test -f src/a.ts"; // not vacuous: the orthogonal check of an elevated change (REV-3)
  const malformed = await gate({}, { ".pi/task-router-policy.json": "{ not json" }, real);
  const fakes: Record<string, PolicyGit> = {
    base: { sha: async () => undefined, show: async () => ({ absent: true }) },
    git: { sha: async () => "0".repeat(40), show: async () => ({ error: "git ls-tree: fatal" }) },
  };
  for (const [name, x] of [["malformed", malformed], ...await Promise.all(Object.entries(fakes).map(async ([k, f]) => {
    const y = await gate({}, undefined, real);
    y.ports.policy = f;
    return [k, y] as const;
  }))] as const) {
    x.put({ "src/a.ts": 5 });
    const r = await x.mergeIt();
    assert.equal(r.status, "merged", `${name}: ${r.detail}`);
    assert.deepEqual([x.reviews[0]!.line!.class, x.reviews[0]!.line!.classBy, x.reviews[0]!.choice!.reviewer], ["elevated", ["error"], "opus"], name);
    assert.deepEqual([x.lines.at(-1)!.class, x.lines.at(-1)!.classBy], ["elevated", ["error"]], name);
  }
});

test("REV-4", async () => {
  // inert-like (docs only, no extra check: class standard) and small → Haiku, advisory: its revise is logged, never blocks
  const x = await gate();
  x.put({ "docs/guide.md": 5 });
  x.verdicts.push(REVISE);
  const r = await x.mergeIt();
  assert.equal(r.status, "merged", r.detail);
  assert.equal(r.reviewId, "rv-1");
  assert.deepEqual(x.reviews[0]!.choice, { reviewer: "haiku", binding: false, fresh: true, orthogonal: false, stratum: "inert-like" });
  assert.deepEqual([x.reviews[0]!.line!.reviewer, x.reviews[0]!.line!.binding], ["haiku", false]);
  // a binding reviewer's revise still blocks: a small code change → Sonnet
  const y = await gate();
  y.put({ "src/a.ts": 5 });
  y.verdicts.push(REVISE);
  const b = await y.mergeIt();
  assert.equal(b.status, "revise", b.detail);
  assert.deepEqual([y.reviews[0]!.choice!.reviewer, y.reviews[0]!.choice!.binding], ["sonnet", true]);
});

test("REV-4 an advisory review that fails never blocks (review lf56 m2)", async () => {
  // Haiku could not run (timeout, invalid, error): the inert-like change merges without a review id and records no approval
  const x = await gate();
  x.put({ "docs/guide.md": 5 });
  x.verdicts.push("fail");
  const r = await x.mergeIt();
  assert.deepEqual([r.status, r.reviewId, x.reviews[0]!.choice!.binding], ["merged", undefined, false], r.detail);
  assert.deepEqual([x.lines.at(-1)!.outcome, x.lines.at(-1)!.reviewId], ["merged", undefined]);
  // a binding reviewer that fails still leaves review-unavailable
  const y = await gate();
  y.put({ "src/a.ts": 5 });
  y.verdicts.push("fail");
  const b = await y.mergeIt();
  assert.deepEqual([b.status, b.reason], ["error", "review-unavailable"], b.detail);
});

test("REV-3", async () => {
  // elevated (riskGlobs `**/auth/**`): Opus in a fresh session plus the orthogonal check, the red run and the extra checks
  const real = "test -f src/auth/a.ts"; // fails at the target, passes on the branch: not vacuous
  // a red extra check → refused `check`, no ticket (the scripted Opus approve is never asked)
  const red = await gate({ mergeGate: { extraChecks: ["exit 3"] } });
  const n1 = await red.node({ slug: "a1", check: real, estimate: { kind: "code", lines: 10 } });
  red.put({ "src/auth/a.ts": 5 }, n1.worktree);
  const r1 = await red.merge({ branch: n1.branch });
  assert.deepEqual([r1.status, r1.reason, red.reviews.length], ["refused", "check", 0], r1.detail);
  // decision (lf56-fix, review m1): orthogonal = (≥ 1 configured extra check, all passed) OR (the red run failed). A vacuous branch
  // check (it passes at the target too) beside a passing extra check merges after the Opus review, which reads the red run's note
  const vac = await gate({ mergeGate: { extraChecks: ["true"] } });
  const n2 = await vac.node({ slug: "a2", check: "true", estimate: { kind: "code", lines: 10 } });
  vac.put({ "src/auth/a.ts": 5 }, n2.worktree);
  const r2 = await vac.merge({ branch: n2.branch });
  assert.deepEqual([r2.status, vac.reviews.length, vac.reviews[0]?.choice?.reviewer], ["merged", 1, "opus"], r2.detail);
  assert.ok((vac.reviews[0]!.input as string).split("\n").includes("Red run at base: passed — the check may be vacuous"));
  // a vacuous branch check and no extra check: no orthogonal check → refused `check`, no ticket
  const bare = await gate();
  const n5 = await bare.node({ slug: "a5", check: "true", estimate: { kind: "code", lines: 10 } });
  bare.put({ "src/auth/a.ts": 5 }, n5.worktree);
  const r5 = await bare.merge({ branch: n5.branch });
  assert.deepEqual([r5.status, r5.reason, bare.reviews.length], ["refused", "check", 0], r5.detail);
  // no red run (redRun off) and no extra check: no orthogonal check at all → refused
  const none = await gate({ mergeGate: { redRun: false } });
  const n3 = await none.node({ slug: "a3", check: real, estimate: { kind: "code", lines: 10 } });
  none.put({ "src/auth/a.ts": 5 }, n3.worktree);
  const r3 = await none.merge({ branch: n3.branch });
  assert.deepEqual([r3.status, r3.reason, none.reviews.length], ["refused", "check", 0], r3.detail);
  // both green → merged after one Opus ticket, never a second LLM
  const ok = await gate({ mergeGate: { extraChecks: ["true"] } });
  const n4 = await ok.node({ slug: "a4", check: real, estimate: { kind: "code", lines: 10 } });
  ok.put({ "src/auth/a.ts": 5 }, n4.worktree);
  const r4 = await ok.merge({ branch: n4.branch });
  assert.equal(r4.status, "merged", r4.detail);
  assert.equal(ok.reviews.length, 1);
  assert.deepEqual(ok.reviews[0]!.choice, { reviewer: "opus", binding: true, fresh: true, orthogonal: true });
  assert.deepEqual(ok.lines.at(-1)!.classBy, ["risk"]);
});

test("REV-10", async () => {
  // inert (docs only) with a configured extra check that passes → merged without a ticket, `merge.class = inert`
  const x = await gate({ mergeGate: { extraChecks: ["true"] } });
  x.put({ "docs/guide.md": 5, "NOTICE": 2 });
  const r = await x.mergeIt();
  assert.equal(r.status, "merged", r.detail);
  assert.equal(x.reviews.length, 0);
  assert.equal(r.reviewId, undefined);
  assert.deepEqual([x.lines.at(-1)!.class, x.lines.at(-1)!.classBy], ["inert", []]);
  // no configured extra check: not inert (CLS-3), the standard path (inert-like, small: Haiku advisory)
  const y = await gate();
  y.put({ "docs/guide.md": 5 });
  assert.equal((await y.mergeIt()).status, "merged");
  assert.equal(y.reviews.length, 1);
  assert.deepEqual([y.lines.at(-1)!.class, y.reviews[0]!.choice!.reviewer], ["standard", "haiku"]);
});

/** The overseer rig on a chosen Opus review; `sleeps` records every sleep but the 2 s polls (the backoffs). */
function retryRig() {
  const o = overseerRig();
  const sleeps: number[] = [], poll = o.d.sleep;
  o.d.sleep = async (ms) => { if (ms !== 2000) sleeps.push(ms); await poll(ms); };
  const choice: ReviewerChoice = { reviewer: "opus", binding: true, fresh: true, orthogonal: false };
  const reviews = () => o.h.lines().filter((l) => l.event === "review").map((l) => [l.attempt, l.member, l.outcome, l.fallback ?? null]);
  /** The i-th spawn (1-based) fails with `reason` once it runs. */
  const fail = (reason: string) => (i: number) => o.h.a.emit({ type: "error", name: `ovs-merge-${i}`, reason, ts: 0 });
  return { ...o, sleeps, choice, reviews, fail };
}

test("REV-9 retry", async () => {
  // local-first: a transient error (429/503/overloaded) on the first attempt → a second attempt after 5 s, approve → ok;
  // never the closed gate
  for (const reason of ["429 Too Many Requests", "503 Service Unavailable", "Overloaded"]) {
    const o = retryRig();
    let failed = 0;
    o.on.each = async () => {
      const n = o.h.a.apiSpawns.length;
      if (n === 1 && !failed++) o.fail(reason)(1);
      if (n === 2) await o.tool().execute(VALID);
    };
    const out = await o.run({ choice: o.choice, retryTransient: true });
    assert.equal(out.ok, true, reason);
    assert.deepEqual(o.sleeps, [5000], reason);
    assert.deepEqual(o.reviews(), [[1, "opus", "error", null], [2, "opus", "approve", null]], reason);
  }
  // three transient errors → backoffs 5 s and 20 s, then the existing fallback attempt with `fallback: transient`; its error is
  // the run's existing `error` outcome (the gate's review-unavailable)
  const o = retryRig();
  const seen = new Set<number>();
  o.on.each = async () => { const n = o.h.a.apiSpawns.length; if (!seen.has(n)) { seen.add(n); o.fail("429 rate limit")(n); } };
  const out = await o.run({ choice: o.choice, retryTransient: true });
  assert.deepEqual(out, { ok: false, outcome: "error" });
  assert.deepEqual(o.sleeps, [5000, 20000]);
  assert.deepEqual(o.reviews(), [[1, "opus", "error", null], [2, "opus", "error", null], [3, "opus", "error", null],
    [4, "opus", "error", "transient"]]);
  // a non-transient error is not retried: the existing second attempt at once
  const p = retryRig();
  p.on.each = async () => { const n = p.h.a.apiSpawns.length; if (n === 1 && !seen.has(-1)) { seen.add(-1); p.fail("boom")(1); } if (n === 2) await p.tool().execute(VALID); };
  assert.equal((await p.run({ choice: p.choice, retryTransient: true })).ok, true);
  assert.deepEqual(p.sleeps, []);
  assert.deepEqual(p.reviews(), [[1, "opus", "error", null], [2, "opus", "approve", "error"]]);
  // legacy local mode: a transient error fails the attempt; the fallback member at once (`local-overseer`)
  const l = retryRig();
  l.on.each = async () => { const n = l.h.a.apiSpawns.length; if (n === 1 && !seen.has(-2)) { seen.add(-2); l.fail("429 Too Many Requests")(1); } if (n === 2) await l.tool().execute(VALID); };
  assert.equal((await l.run()).ok, true);
  assert.deepEqual(l.sleeps, []);
  assert.deepEqual(l.reviews(), [[1, "opus", "error", null], [2, "sonnet", "approve", "error"]]);
});

test("REV-9 retry: the local-first gate asks for the retries; legacy does not", async () => {
  const x = await gate();
  x.put({ "src/a.ts": 20 });
  assert.equal((await x.mergeIt()).status, "merged");
  assert.equal(x.reviews[0]!.retryTransient, true);
  // legacy local mode (a branch without a node)
  const b = await x.start("legacy");
  x.r.commit("legacy.ts", "a\n", "legacy", b.worktree);
  assert.equal((await x.merge({ branch: b.branch })).status, "merged");
  assert.equal(x.reviews.length, 2);
  assert.equal(x.reviews[1]!.retryTransient, undefined);
});
