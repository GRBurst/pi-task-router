// Local-first plan LF2.T5 (spec §2.2, RND-5): a session's experiments settings are snapshot in `task-router/arms` at its
// first session_start; every later draw of the session (a resume, another process) uses the snapshot, whatever the
// settings or the code defaults say by then.
import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness.ts";
import { seeded } from "./rand.ts";
import { parseSettings } from "../core/settings.ts";
import { FACTORS, assign } from "../core/strategy/arms.ts";
import type { FactorId, FactorUnit } from "../core/strategy/arms.ts";
import { LF, treeRig } from "./tree-rig.ts";
import { createArmStore } from "../core/armstore.ts";
import { APPROVE, REVISE, finding } from "./merge-rig.ts";
import type { Verdict } from "../core/local/verdict.ts";

const LATER = "9.9.9"; // every factor available, whatever the release
const KINDS: FactorUnit[] = ["session", "review", "child", "request", "node", "package", "ladder"];
const IDS = (Object.keys(FACTORS) as FactorId[]).filter((id) => id !== "E0");
type Entry = { type: string; data: unknown };

/** One process of session `id`: a router with `raw` settings (and the given code defaults) starts on a branch holding `entries`. */
function start(id: string, raw: unknown, entries: Entry[] = [], factors?: unknown) {
  const h = harness({ extra: { settings: parseSettings(raw, LATER).settings, ...(factors ? { factors } : {}) } as never });
  h.f.entries.push(...entries);
  const branch = () => h.f.entries.map((e) => ({ type: "custom", customType: e.type, data: e.data }));
  h.f.fire("session_start", { reason: entries.length ? "resume" : "startup" }, { sessionManager: { getSessionId: () => id, getBranch: branch } });
  const draws = KINDS.map((k) => h.router.arms.armsFor(k, k === "session" ? id : `${k}-1`));
  return { h, draws, written: h.f.entries.slice(entries.length).filter((e) => e.type === "task-router/arms") };
}

/** Random experiments settings: a few factors enabled, some with random weights. */
const randomSettings = (rnd: (n: number) => number) => ({
  experiments: {
    seed: rnd(2) ? "task-router" : `seed-${rnd(9)}`,
    factors: Object.fromEntries(IDS.filter(() => rnd(3) === 0).map((id) => [id, {
      enabled: rnd(4) > 0, ...(rnd(2) ? { weights: FACTORS[id].levels.map(() => rnd(3)).map((w, i, a) => (a.some((x) => x > 0) ? w : i === 0 ? 1 : 0)) } : {}),
    }])),
  },
});

test("RND-5", () => {
  const rnd = seeded(205);
  let differs = 0;
  for (let i = 0; i < 50; i++) {
    const id = `s-${i}-${rnd(1000)}`, [a, b] = [randomSettings(rnd), randomSettings(rnd)];
    const first = start(id, a);
    assert.equal(first.written.length, 1, "the snapshot is written at the first session_start");
    const resumed = start(id, b, first.h.f.entries);
    assert.deepEqual(resumed.draws, first.draws, `${id}: the resumed draws are the first snapshot's`);
    assert.deepEqual(resumed.written, [], "written once");
    if (JSON.stringify(start(id, b).draws) !== JSON.stringify(first.draws)) differs++;
  }
  assert.ok(differs > 10, `the settings change the draws of a fresh session (${differs} of 50)`);
  // a changed code default: the snapshot holds the effective set (E2 enabled by the then registry stays enabled)
  const then = { ...FACTORS, E2: { ...FACTORS.E2, enabled: true } };
  const old = start("s-code", {}, [], then);
  assert.ok(old.draws[0]!.some((x) => x.startsWith("E2=")), JSON.stringify(old.draws));
  assert.deepEqual(start("s-code", {}, old.h.f.entries).draws, old.draws);
  assert.deepEqual(start("s-code", {}).draws[0], [], "today's registry: E2 disabled");
  // LF2 review minor 2: a session resumed across a release that moves E2's first level keeps its levels and its arms
  const raw = { experiments: { factors: { E2: { enabled: true, weights: [0, 1, 0] } } } };
  const moved = { ...FACTORS, E2: { ...FACTORS.E2, levels: ["small", "standard", "large"] } };
  const before = start("s-moved", raw, [], FACTORS);
  assert.deepEqual(before.draws[0], ["E2=small"]);
  const after = start("s-moved", raw, before.h.f.entries, moved);
  assert.deepEqual(after.draws, before.draws, "the resumed draws are the first session's, not the moved registry's");
  assert.deepEqual(after.written, []);
  // the entry (spec §2.2): v 1, the session, the effective settings of every factor, the router version, the session's draws
  const e = old.written[0]!.data as Record<string, any>;
  assert.deepEqual(Object.keys(e).sort(), ["arms", "experiments", "routerVersion", "sessionId", "v"]);
  assert.deepEqual([e.v, e.sessionId, typeof e.routerVersion, e.experiments.seed, e.experiments.cloudOnlyShare], [1, "s-code", "string", "task-router", 0.1]);
  assert.deepEqual(Object.keys(e.experiments.factors).sort(), Object.keys(FACTORS).sort());
  assert.deepEqual(e.experiments.factors.E2, { enabled: true, levels: ["standard", "small", "large"], weights: [1, 1, 1] });
  assert.deepEqual(e.arms, { E2: old.draws[0]![0]!.slice("E2=".length) });
  // legacy local mode draws nothing and keeps its entries (NR-7): no snapshot
  const lm = harness({ settings: { mode: "local" } as never, apiExt: true });
  lm.f.fire("session_start", { reason: "startup" }, { sessionManager: { getSessionId: () => "s-lm", getBranch: () => [] } });
  assert.deepEqual(lm.f.entries.filter((x) => x.type === "task-router/arms"), []);
});

// LF2.T6 (spec §2.4, RND-6, S33): every line of an armed (local-first) session carries `arms`, the sorted `id=level` of its
// session's enabled factors; an unarmed session's lines carry none, its session line aside. The profile store (LF3.T3)
// arms a local-first session; until then the case stubs the port.
async function armedSession(armed: boolean) {
  const h = harness({ extra: { settings: parseSettings({ experiments: { factors: { E2: { enabled: true }, E4: { enabled: true } } } }, LATER).settings,
    armed: () => armed } as never });
  h.f.fire("session_start", { reason: "startup" }, { sessionManager: { getSessionId: () => "s-armed", getBranch: () => [] } });
  for (const name of ["q1", "q2"]) {
    await h.a.spawn({ name, task: { kind: "implement", files: ["src/a.ts"], check: "npm test", acceptance: ["ok"], t2: [],
      t0: { bounded: true, specified: true, verifiable: true, lowRisk: true, small: true, linear: true } } });
    h.a.emit({ type: "spawn", name, by: "main", parent: "main", childSessionId: `s-${name}`, ts: 1 });
  }
  await h.f.callTool("task_verdict", { name: "q1", verdict: "accepted" });
  h.a.emit({ type: "kill", name: "q2", ts: 2 }); // unjudged
  return { lines: h.lines(), snap: h.router.arms.snapshot() };
}

test("RND-6", async () => {
  const on = await armedSession(true);
  assert.deepEqual(on.lines.map((l) => l.event).sort(), ["session", "spawn", "spawn", "verdict", "verdict"]);
  const snap = on.snap!;
  for (const l of on.lines) {
    assert.deepEqual(l.arms.filter((a: string) => !a.startsWith("E0=")), [`E2=${assign(snap, "E2", "s-armed")}`, `E4=${assign(snap, "E4", "s-armed")}`].sort(), JSON.stringify(l));
    assert.deepEqual(l.arms, [...l.arms].sort());
  }
  const off = await armedSession(false);
  assert.deepEqual(off.lines.map((l) => l.event).sort(), ["session", "spawn", "spawn", "verdict", "verdict"]);
  assert.deepEqual(off.lines.filter((l) => l.event !== "session" && "arms" in l), [], "unarmed: only the session line may carry arms (E0)");
});

// LF14.T1 (spec §2.8, SIZE-3, REV-2, RND-6; review lf56 m9): E2 and E3 end to end in a local-first session. E2 is drawn once per
// session (on the session line and every local-first line) and is the session's tier; E3 is drawn per review, on that review's
// lines only, and is the reviewer of a standard-class standard-tier change. Without the settings: no arm, the defaults.
const code = (n: number): string => Array.from({ length: n }, (_, k) => `export const v${k} = ${k};\n`).join("");
const MODEL = { opus: "anthropic/claude-opus-5-5", sonnet: "anthropic/claude-sonnet-5-5" };

/** A local-first session with an actor that answers each review with the next scripted verdict (default: approve). */
function stage1(factors: Record<string, unknown>) {
  const raw = { ...LF, experiments: { cloudOnlyShare: 0, factors } };
  const s = treeRig(raw, undefined, { apiExt: true, extra: { settings: parseSettings(raw, LATER).settings } });
  const verdicts: Verdict[] = [];
  let answered = 0;
  s.h.hooks.onSleep = () => {
    if (s.h.a.apiSpawns.length <= answered) return;
    const sp = s.h.a.apiSpawns[answered++]!;
    const submit = (sp.policy as { childTools?: { execute(v: unknown): unknown }[] } | undefined)?.childTools?.[0];
    if (sp.result.ok && submit) void submit.execute(verdicts.shift() ?? APPROVE);
  };
  /** A node of `n` code lines (slug `slug`), merged once (a REVISE leaves it open: another commit and `merge` again). */
  const node = async (slug: string, n: number, estimate = n) => {
    const started = await s.start({ slug, goal: `do ${slug}`, check: "true", estimate: { kind: "code", lines: estimate } });
    assert.equal(started.isError, undefined, started.content[0]!.text);
    s.r.commit(`src/${slug}.ts`, code(n), slug, started.details.worktree);
    return { worktree: started.details.worktree as string, branch: started.details.branch as string, node: started };
  };
  const merge = async (branch: string) => (await s.call("request_merge", { branch })).details;
  const lines = (event: string) => s.h.lines().filter((l) => l.event === event);
  return { ...s, verdicts, node, merge, lines, models: () => s.h.a.apiSpawns.map((x) => (x.policy as { model?: string } | undefined)?.model) };
}

test("stage 1", async () => {
  const both = (e2: number[], e3: number[]) => ({ E2: { enabled: true, weights: e2 }, E3: { enabled: true, weights: e3 } });
  // E2 small, E3 sonnet: the drawn tier is small and the drawn reviewer of the standard-tier change is Sonnet
  const a = stage1(both([0, 1, 0], [0, 1]));
  const refused = await a.start({ slug: "too-big", goal: "x", check: "true", estimate: { kind: "code", lines: 100 } });
  assert.match(refused.content[0]!.text, /above the package budget of 60 changed lines \(tier small\)/, "E2 small: the package budget is the small tier's");
  const f = await a.node("feat", 100, 50);
  assert.equal((await a.merge(f.branch)).status, "merged");
  assert.deepEqual(a.models(), [MODEL.sonnet]);
  const [review] = a.lines("review") as Record<string, any>[];
  assert.deepEqual([review!.tier, review!.actualTier, review!.reviewer, review!.binding], ["small", "standard", "sonnet", true]);
  assert.deepEqual(review!.arms, ["E2=small", "E3=sonnet"], "E2 (the session's) and E3 (this review's) on the review line");
  // E2 once per session: the session line and every other line of the local-first session; E3 only on a review's own lines
  assert.deepEqual((a.lines("session")[0] as Record<string, any>).arms, ["E2=small"]);
  const events = new Set(a.h.lines().map((l) => l.event));
  for (const e of ["session", "node", "review", "merge"]) assert.ok(events.has(e), e);
  for (const l of a.h.lines()) assert.deepEqual(l.arms, l.event === "review" ? ["E2=small", "E3=sonnet"] : ["E2=small"], JSON.stringify(l));
  assert.deepEqual(a.lines("node").map((l) => l.tier), a.lines("node").map(() => "small"));
  assert.equal((a.lines("merge")[0] as Record<string, any>).tier, "small");
  // E3 per review: each review's draw is its own (a REVISE, a new commit, a new review); the unit is the review's node and commit
  const b = stage1(both([0, 0, 1], [1, 1]));
  const g = await b.node("feat", 100);
  b.verdicts.push({ ...REVISE, findings: [finding("F1", true, "src/feat.ts:1")] });
  assert.equal((await b.merge(g.branch)).status, "revise");
  b.r.commit("src/more.ts", code(3), "more", g.worktree);
  assert.equal((await b.merge(g.branch)).status, "merged");
  const snap = b.h.router.arms.snapshot()!;
  const rs = b.lines("review") as Record<string, any>[];
  assert.equal(rs.length, 2);
  assert.notEqual(rs[0]!.commit, rs[1]!.commit);
  for (const r of rs) {
    const level = assign(snap, "E3", `s-main:feat:${r.commit}`);
    assert.deepEqual([r.arms, r.reviewer, r.tier], [["E2=large", `E3=${level}`], level, "large"], JSON.stringify(r));
  }
  // the draw is the review's, whatever the review is: a large change asks for Opus whatever E3 says; its line still names its draw
  const e = stage1(both([1, 0, 0], [0, 1]));
  const big = await e.node("big", 200, 100);
  assert.equal((await e.merge(big.branch)).status, "merged");
  assert.deepEqual([(e.lines("review")[0] as Record<string, any>).reviewer, (e.lines("review")[0] as Record<string, any>).arms], ["opus", ["E2=standard", "E3=sonnet"]]);
  // without the settings: no E2/E3 arm anywhere, the defaults (tier standard, Opus for the standard tier)
  const off = stage1({});
  const h = await off.node("feat", 100);
  assert.equal((await off.merge(h.branch)).status, "merged");
  assert.deepEqual(off.models(), [MODEL.opus]);
  const r0 = off.lines("review")[0] as Record<string, any>;
  assert.deepEqual([r0.tier, r0.reviewer, r0.arms], ["standard", "opus", []]);
  for (const l of off.h.lines()) assert.deepEqual(l.arms ?? [], [], JSON.stringify(l));
});

test("stage 1: E3 is a draw of the review, never of the session", () => {
  const raw = { ...LF, experiments: { cloudOnlyShare: 0, factors: { E3: { enabled: true } } } };
  const s = treeRig(raw, undefined, { extra: { settings: parseSettings(raw, LATER).settings } });
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) for (const a of s.h.router.arms.armsFor("review", `s-main:c${i}`)) seen.add(a);
  assert.deepEqual([...seen].sort(), ["E3=opus", "E3=sonnet"], "both levels over 40 reviews");
  assert.deepEqual(s.h.router.arms.armsFor("session", "s-main"), [], "no session arm: E3's unit is the review");
});

// LF14 review H1: a node merges into its parent by fast-forward, so the parent's tip is the child's reviewed commit: the two
// reviews are two units (the node id and the commit), each with its own draw, whatever the seed.
test("stage 1: a child's review and its parent's are two draws", async () => {
  const raw = { ...LF, experiments: { cloudOnlyShare: 0, seed: "tree", factors: { E3: { enabled: true } } } };
  const s = treeRig(raw, undefined, { apiExt: true, extra: { settings: parseSettings(raw, LATER).settings } });
  let answered = 0;
  s.h.hooks.onSleep = () => {
    if (s.h.a.apiSpawns.length <= answered) return;
    const sp = s.h.a.apiSpawns[answered++]!;
    const submit = (sp.policy as { childTools?: { execute(v: unknown): unknown }[] } | undefined)?.childTools?.[0];
    if (sp.result.ok && submit) void submit.execute(APPROVE);
  };
  const root = await s.start({ slug: "auth", goal: "plan", check: "true", estimate: { kind: "plan", lines: 0 } });
  s.r.commit("docs/auth.md", "one\ntwo\n", "plan", root.details.worktree);
  const child = await s.start({ parent: "auth", slug: "form", goal: "form", check: "true", estimate: { kind: "code", lines: 5 } });
  assert.equal(child.isError, undefined, child.content[0]!.text);
  s.r.commit("src/form.ts", code(5), "form", child.details.worktree);
  for (const b of [child, root]) assert.equal((await s.call("request_merge", { branch: b.details.branch })).details.status, "merged");
  const snap = s.h.router.arms.snapshot()!;
  const [rc, rp] = s.h.lines().filter((l) => l.event === "review") as Record<string, any>[];
  assert.equal(rc!.commit, rp!.commit, "the parent's tip is the child's reviewed commit");
  assert.deepEqual([rc!.arms, rp!.arms], [[`E3=${assign(snap, "E3", `s-main:auth.form:${rc!.commit}`)}`], [`E3=${assign(snap, "E3", `s-main:auth:${rp!.commit}`)}`]]);
  // independent draws: over seeds the pair (child, parent) takes all four combinations (one shared unit would give two)
  const pairs = new Set<string>();
  for (let i = 0; i < 64; i++) {
    const st = createArmStore(() => undefined);
    st.start("s-main", [], parseSettings({ experiments: { seed: `seed-${i}`, factors: { E3: { enabled: true } } } }, LATER).settings.experiments, LATER);
    pairs.add([st.armsFor("review", `s-main:auth.form:${rc!.commit}`), st.armsFor("review", `s-main:auth:${rp!.commit}`)].join("|"));
  }
  assert.equal(pairs.size, 4);
});
