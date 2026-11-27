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
import { isTransient } from "../core/local/overseer.ts";
import type { PolicyGit } from "../core/local/policyfile.ts";
import type { ReviewerChoice } from "../core/strategy/types.ts";
import { APPROVAL_TYPE, createApprovals } from "../core/local/merge.ts";

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

test("REV-4 an approval holds only for a reviewer at least as strong (review lf56 m6)", async () => {
  // the very commit approved by an advisory Haiku (e.g. before a failure at step 9, or before main's policy made it stronger): a
  // small code change asks for Sonnet, binding, so it is reviewed again; the approval keeps its reviewer
  const keyOf = (x: Awaited<ReturnType<typeof gate>>) => {
    const commit = x.r.git(["rev-parse", x.n.branch]);
    return { repo: x.store.all().find((r) => r.branch === x.n.branch)!.repo, branch: x.n.branch, commit,
      tree: x.r.git(["rev-parse", `${commit}^{tree}`]) };
  };
  const x = await gate();
  x.put({ "src/a.ts": 5 });
  x.approvals.add(keyOf(x), "rv-haiku", { reviewer: "haiku", binding: false });
  const r = await x.mergeIt();
  assert.deepEqual([r.status, r.reviewId, x.reviews.length], ["merged", "rv-1", 1], r.detail);
  const stored = x.entries.filter((e) => e.type === APPROVAL_TYPE).at(-1)!.data;
  assert.deepEqual([stored.reviewId, stored.reviewer, stored.binding], ["rv-1", "sonnet", true]);
  // an Opus approval holds for the Sonnet choice: no second review
  const y = await gate();
  y.put({ "src/a.ts": 5 });
  const k = keyOf(y);
  y.approvals.add(k, "rv-opus", { reviewer: "opus", binding: true });
  const b = await y.mergeIt();
  assert.deepEqual([b.status, b.reviewId, y.reviews.length], ["merged", "rv-opus", 0], b.detail);
  // a restart keeps the reviewer; an approval without one (the legacy gate's) holds only where no strength is asked
  const a = createApprovals(() => undefined);
  a.rebuild([{ customType: APPROVAL_TYPE, data: { ...k, reviewId: "rv-h", reviewer: "haiku", binding: false } }]);
  const find = a.find;
  assert.deepEqual([find(k, 2), find(k, 1), find(k)], [undefined, "rv-h", "rv-h"]);
  a.rebuild([{ customType: APPROVAL_TYPE, data: { ...k, reviewId: "rv-l" } }]);
  assert.deepEqual([find(k, 1), find(k, 0), find(k)], [undefined, "rv-l", "rv-l"]);
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
  // three transient errors → backoffs 5 s and 20 s; the second attempt would rerun the same chosen member, so the last retry ends
  // the run (review lf56 m3: never a third retry): its line has `fallback: transient`, the run the existing `error` outcome
  const o = retryRig();
  const seen = new Set<number>();
  o.on.each = async () => { const n = o.h.a.apiSpawns.length; if (!seen.has(n)) { seen.add(n); o.fail("429 rate limit")(n); } };
  const out = await o.run({ choice: o.choice, retryTransient: true });
  assert.deepEqual(out, { ok: false, outcome: "error" });
  assert.deepEqual(o.sleeps, [5000, 20000]);
  assert.deepEqual(o.reviews(), [[1, "opus", "error", null], [2, "opus", "error", null], [3, "opus", "error", "transient"]]);
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

test("REV-9 attempt numbers count the steps, then the retries (review lf56 nit)", async () => {
  // legacy local mode: a first member without a model is skipped; the fallback's line is attempt 2, as before LF6.T13
  const o = retryRig();
  o.h.router.settings.models[o.h.router.settings.overseer.member]!.model = "";
  o.on.each = async () => { await o.tool().execute(VALID); };
  assert.equal((await o.run()).ok, true);
  assert.deepEqual(o.reviews(), [[2, "sonnet", "approve", "error"]]);
});

test("REV-9 an Esc during a backoff ends the run at once; network errors are transient (review lf56 nit)", async () => {
  const o = retryRig(), ac = new AbortController(), poll = o.d.sleep;
  // the backoff never ends by itself: only the abort can end the run
  o.d.sleep = async (ms) => { if (ms === 2000) return poll(ms); ac.abort(); await new Promise(() => undefined); };
  let failed = false;
  o.on.each = async () => { if (!failed) { failed = true; o.fail("read ECONNRESET")(1); } };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const out = await Promise.race([o.run({ choice: o.choice, retryTransient: true, signal: ac.signal }),
    new Promise((r) => { timer = setTimeout(() => r("hung"), 3000); })]).finally(() => clearTimeout(timer));
  assert.deepEqual(out, { ok: false, outcome: "aborted" });
  for (const reason of ["read ECONNRESET", "TypeError: fetch failed", "socket hang up"]) assert.equal(isTransient(reason), true, reason);
});

// LF14.T1 (REV-2; review lf56 m9): the gate draws E3 per review, through the node deps' `reviewArms(unit)` (the unit is the reviewed
// commit: a REVISE and a new commit is a new review), never from the session's arms. The review's arms go to its lines (`arms`).
test("REV-2 E3 per review", async () => {
  const x = await gate();
  const asked: string[] = [];
  const levels = ["sonnet", "opus"];
  x.nodes.reviewArms = (unit) => [`E3=${levels[asked.push(unit) - 1]}`];
  x.nodes.arms = () => ({ E3: "sonnet" }); // a stray session arm: E3 has none, the gate never reads it
  x.put({ "src/a.ts": 100 });
  x.verdicts.push(REVISE);
  assert.equal((await x.mergeIt()).status, "revise");
  x.put({ "src/b.ts": 1 });
  assert.equal((await x.mergeIt()).status, "merged");
  assert.deepEqual(x.reviews.map((r) => [r.choice!.reviewer, r.arms]), [["sonnet", ["E3=sonnet"]], ["opus", ["E3=opus"]]]);
  assert.deepEqual(asked, x.reviews.map((r) => `feat:${r.commit}`), "one draw per review, keyed by its node and its commit");
  assert.equal(new Set(asked).size, 2);
  // the draw is made once for a review: its second attempt (the same commit) never asks again
  const y = await gate();
  const units: string[] = [];
  y.nodes.reviewArms = (unit) => { units.push(unit); return ["E3=sonnet"]; };
  y.put({ "src/a.ts": 100 });
  y.verdicts.push("fail", "fail");
  assert.equal((await y.mergeIt()).status, "error");
  assert.equal((await y.mergeIt()).status, "error");
  assert.equal(units.length, 2);
  assert.equal(units[0], units[1], "the same commit is the same review: the same unit, so the same draw");
  // no port (the rigs' default, a session without E3): the default level, no arms
  const z = await gate();
  z.put({ "src/a.ts": 100 });
  assert.equal((await z.mergeIt()).status, "merged");
  assert.deepEqual([z.reviews[0]!.choice!.reviewer, z.reviews[0]!.arms], ["opus", undefined]);
});

// LF14 review H1: a node merges into its parent by fast-forward, so the parent's tip is its last child's reviewed commit; the
// parent's own review (another diff, another approval key) must not share the child's draw: the unit is the node and the commit.
test("REV-2 E3 unit: a child's review and its parent's, at the same commit, are two draws", async () => {
  const x = nodeRig();
  const units: string[] = [];
  x.nodes.reviewArms = (unit) => { units.push(unit); return [`E3=${units.length === 1 ? "opus" : "sonnet"}`]; };
  const root = await x.node({ slug: "auth", estimate: { kind: "plan", lines: 0 } });
  x.r.commit("docs/auth.md", "one\ntwo\nthree\n", "plan", root.worktree);
  const child = await x.node({ parent: "auth", slug: "form", estimate: { kind: "code", lines: 2 } });
  x.r.commit("form.ts", "a\nb\n", "form", child.worktree);
  assert.equal((await x.merge({ branch: child.branch })).status, "merged");
  assert.equal((await x.merge({ branch: root.branch })).status, "merged");
  const [a, b] = x.reviews;
  assert.equal(a!.commit, b!.commit, "the fast-forward made the parent's tip the child's reviewed commit");
  assert.deepEqual(units, [`auth.form:${a!.commit}`, `auth:${a!.commit}`]);
  assert.deepEqual(x.reviews.map((r) => r.arms), [["E3=opus"], ["E3=sonnet"]], "each review has its own draw");
});
