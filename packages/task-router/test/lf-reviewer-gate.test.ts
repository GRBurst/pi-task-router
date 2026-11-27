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

const text = (n: number, tag: string): string => Array.from({ length: n }, (_, k) => `export const ${tag}${k} = ${k};\n`).join("");

/** The node rig with one local-first node `feat` (after `onMain` is committed on main); `put(files)` commits `{path: lines or
 *  text}` on its branch. */
async function gate(settings: Record<string, unknown> = {}, onMain?: Record<string, number | string>) {
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
  const n = await x.node({ slug: "feat", estimate: { kind: "code", lines: 100 } });
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

test("REV-1 the policy at main's tip", async () => {
  // a policy file on main marks src/pay/** risky; a node's change there is elevated, classed by main's policy (CLS-2)
  const x = await gate();
  x.put({ ".pi/task-router-policy.json": JSON.stringify({ riskGlobs: ["src/pay/**"] }) }, x.r.dir);
  const n = await x.node({ slug: "pay", estimate: { kind: "code", lines: 10 } });
  x.put({ "src/pay/a.ts": 5 }, n.worktree);
  assert.equal((await x.merge({ branch: n.branch })).status, "merged");
  assert.deepEqual([x.reviews.at(-1)!.line!.class, x.reviews.at(-1)!.line!.classBy], ["elevated", ["risk"]]);
  // a node → parent merge reads main's tip too: the parent's branch rewrites the policy, its child is still classed by main's
  const p = await x.node({ slug: "par", estimate: { kind: "plan", lines: 0 } });
  x.put({ ".pi/task-router-policy.json": JSON.stringify({ riskGlobs: [] }) }, p.worktree);
  const c = await x.node({ parent: "par", slug: "kid", estimate: { kind: "code", lines: 10 } });
  x.put({ "src/pay/b.ts": 5 }, c.worktree);
  assert.equal((await x.merge({ branch: c.branch })).status, "merged");
  assert.deepEqual([x.lines.at(-1)!.target, x.reviews.at(-1)!.line!.class], [p.branch, "elevated"]);
});

test("REV-1 policy errors fail closed", async () => {
  // a malformed file at main's tip, an unresolvable base and a git failure: elevated, classBy ["error"] on review and merge
  const malformed = await gate({}, { ".pi/task-router-policy.json": "{ not json" });
  const fakes: Record<string, PolicyGit> = {
    base: { sha: async () => undefined, show: async () => ({ absent: true }) },
    git: { sha: async () => "0".repeat(40), show: async () => ({ error: "git ls-tree: fatal" }) },
  };
  for (const [name, x] of [["malformed", malformed], ...await Promise.all(Object.entries(fakes).map(async ([k, f]) => {
    const y = await gate();
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
