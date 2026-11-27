// Local-first plan LF5.T5–T7 (spec SIZE-5, SIZE-6, §2.4, design §5.3): the size stages 80 % and 100 % of the session tier's
// budget. Each stage, once per node, gives one hint (S48's pinned texts, never a block) and one `crossing` line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crossingEvent, ENUMS_V2, EVENTS_V2, SCHEMA_VERSION } from "../core/outcome.ts";
import { seeded } from "./rand.ts";
import { textFree } from "./text-free.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSizeStages, sizeBlock } from "../core/local/sizehints.ts";
import { LF, treeRig } from "./tree-rig.ts";
import { card, provideSkills } from "./harness.ts";

const NOW = new Date(Date.UTC(2026, 10, 2, 12, 0, 0));
const FIELDS = ["node", "stage", "lines", "budget", "estimate", "tier", "class", "depth", "kind", "turn", "call", "sinceStartMs"];

test("builder", () => {
  const line = crossingEvent({ now: NOW, node: "auth.form", stage: 80, lines: 130, budget: 150, estimate: 60, tier: "standard", class: "standard",
    depth: 1, kind: "code", turn: 4, call: 17, sinceStartMs: 90_000 });
  assert.deepEqual(line, { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "crossing", taskId: "auth.form", node: "auth.form", stage: 80,
    lines: 130, budget: 150, estimate: 60, tier: "standard", class: "standard", depth: 1, kind: "code", turn: 4, call: 17, sinceStartMs: 90_000 });
  assert.ok((EVENTS_V2 as readonly string[]).includes("crossing"));
  // review lf56 m5: the main session's id when known
  assert.equal(crossingEvent({ now: NOW, node: "a", stage: 80, lines: 1, budget: 1, estimate: 1, tier: "standard", class: "standard", depth: 0,
    kind: "code", turn: 0, call: 0, sinceStartMs: 0, sessionId: "s-main" } as never).sessionId, "s-main");
  assert.ok(!("sessionId" in line), "absent when unknown");
  // every field of spec §2.4, every enumerated one within its ENUMS_V2 list, no free text copied
  const rnd = seeded(505), one = <T>(xs: readonly T[]): T => xs[rnd(xs.length)]!;
  const enums = new Set(Object.values(ENUMS_V2).flat().map(String));
  for (let i = 0; i < 200; i++) {
    const l = crossingEvent({ now: NOW, node: `n${rnd(99)}.${one(["a", "b"])}`, stage: one([80, 100] as const), lines: rnd(5000), budget: one([60, 150, 300]),
      estimate: rnd(400), tier: one(["small", "standard", "large"] as const), class: one(["inert", "standard", "elevated"] as const), depth: rnd(4),
      kind: one(["code", "plan", "inert"] as const), turn: rnd(50), call: rnd(400), sinceStartMs: rnd(1e7),
      ...({ goal: "fix the auth bug in src/a.ts", note: "/work/repo/x" } as object) });
    assert.deepEqual(FIELDS.filter((f) => !(f in l)), [], JSON.stringify(l));
    for (const f of ["stage", "kind", "tier", "class"]) assert.ok(ENUMS_V2[`crossing.${f}`]!.includes(l[f] as string | number), `${f}: ${String(l[f])}`);
    assert.deepEqual(textFree(l, enums), [], JSON.stringify(l));
  }
});

/** The main session's active node `grow` (estimate 100 code lines, budget 150) in a real repository; `write(lines)` sets
 *  `lib/grow.ts` to that many lines and reports a write in the worktree, `next()` is the following result. */
async function mainRig(settings: Record<string, unknown> = LF, estimate = { lines: 100, kind: "code" }) {
  const s = treeRig(settings);
  const r = await s.start({ slug: "grow", goal: "grow it", check: "true", estimate });
  const wt = (r.details as { worktree: string }).worktree;
  const calls: unknown[] = []; // every tool_call result: the guards never block on size
  let n = 0;
  const pair = (tool: string, input: Record<string, unknown>, act = () => {}) => {
    const id = `t${++n}`;
    calls.push(...s.h.f.fire("tool_call", { toolName: tool, toolCallId: id, input }, s.ctx));
    act(); // the tool runs between its call and its result
    const rs = s.h.f.fire("tool_result", { toolName: tool, toolCallId: id, input, content: [{ type: "text", text: `r${n}` }], isError: false }, s.ctx);
    return (rs.filter((x) => x !== undefined) as { content: { text: string }[] }[])[0];
  };
  const write = async (lines: number) => {
    pair("write", { path: join(wt, "lib", "grow.ts"), content: "x" }, () => {
      mkdirSync(join(wt, "lib"), { recursive: true });
      writeFileSync(join(wt, "lib", "grow.ts"), Array.from({ length: lines }, (_, i) => `export const x${i} = ${i};\n`).join(""));
    });
    await s.h.router.settled();
    return pair("ls", { path: wt })?.content.slice(1).map((c) => c.text) ?? [];
  };
  const crossings = () => s.h.lines().filter((l) => l.event === "crossing");
  return { s, wt, write, calls, crossings };
}

test("SIZE-5 main", async () => {
  const m = await mainRig();
  assert.deepEqual(await m.write(0), []);
  assert.deepEqual(await m.write(100), [], "below 80 % of 150");
  assert.deepEqual(await m.write(130), [sizeBlock(80, "Size: 130/150 changed lines (80 %). Finish or plan a split.")]);
  assert.deepEqual(await m.write(140), [], "once per stage");
  assert.deepEqual(await m.write(160), [sizeBlock(100, "Size: 160/150 changed lines (100 %). The reviewer is now opus; consider a split.")]);
  assert.deepEqual(await m.write(400), [], "once per stage");
  assert.deepEqual(m.calls.filter((x) => x !== undefined), [], "the guard never blocks");
  assert.deepEqual(m.s.h.lines().filter((l) => l.event === "hint" && l.trip === "over-size"), [], "the stages are crossing lines, not the legacy trip");
  // a jump over both stages at once: both hints, in stage order
  const j = await mainRig();
  assert.deepEqual(await j.write(200), [sizeBlock(80, "Size: 200/150 changed lines (80 %). Finish or plan a split."),
    sizeBlock(100, "Size: 200/150 changed lines (100 %). The reviewer is now opus; consider a split.")]);
});

test("SIZE-6", async () => {
  const m = await mainRig();
  for (const n of [0, 130, 160, 170]) await m.write(n);
  const c = m.crossings();
  assert.equal(c.length, 2);
  for (const l of c) assert.deepEqual(FIELDS.filter((f) => !(f in l)), [], JSON.stringify(l));
  assert.deepEqual(c.map((l) => [l.node, l.stage, l.lines, l.budget, l.estimate, l.tier, l.class, l.depth, l.kind]),
    [["grow", 80, 130, 150, 100, "standard", "standard", 0, "code"], ["grow", 100, 160, 150, 100, "standard", "standard", 0, "code"]]);
  assert.ok(c[0]!.call < c[1]!.call && c[0]!.sinceStartMs <= c[1]!.sinceStartMs, JSON.stringify(c));
  const enums = new Set(Object.values(ENUMS_V2).flat().map(String));
  for (const l of c) assert.deepEqual(textFree(l, enums), []);
  for (const l of c) assert.equal(l.sessionId, "s-main", "the main session's id (review lf56 m5)");
  // an inert estimate has no budget: no stage
  const i = await mainRig(LF, { lines: 10, kind: "inert" });
  assert.deepEqual(await i.write(900), []);
  assert.deepEqual(i.crossings(), []);
  // review lf56 m5: a plan estimate has no work stages either; its only crossing is a split above planLines (SIZE-10)
  const p = await mainRig(LF, { lines: 0, kind: "plan" });
  assert.deepEqual(await p.write(900), []);
  assert.deepEqual(p.crossings(), []);
});

test("SIZE-5 stages", () => {
  const st = createSizeStages();
  assert.deepEqual([119, 120, 149, 150, 151, 900].map((n) => st.observe(n, 150)), [[], [80], [], [100], [], []]);
  assert.deepEqual(createSizeStages().observe(5000, Infinity), [], "inert: no budget");
});

test("SIZE-5 child", async () => {
  const s = treeRig();
  provideSkills(s.h, ["tdd-implementation-planner", "code-reviewer"]);
  await s.start({ slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } });
  assert.equal((await s.call("split", { summary: "one package", children: [
    { slug: "form", goal: "build the login form", files: ["lib/form/**"], estimate: { lines: 60, kind: "code" }, check: "true" }] } as never)).isError, undefined);
  const wt = (await s.start({ parent: "auth", child: "form" })).details.worktree as string;
  const spawn = async (name: string, task: unknown) => { // the policy places it, the actor lists it and announces its spawn
    const p = await s.h.a.spawn({ name, task } as never);
    assert.ok(!("reject" in p), JSON.stringify(p));
    s.h.a.agents.push({ name, parent: "main", sessionId: `s-${name}`, model: p.model, thinkingLevel: p.thinkingLevel, state: "idle" } as never);
    s.h.a.emit({ type: "spawn", name, by: "main", parent: "main", childSessionId: `s-${name}`, ts: 0 });
  };
  await spawn("p1", card({ kind: "implement", files: ["lib/form/a.ts"], package: "auth.form" } as never));
  await spawn("other", card({ kind: "implement", files: ["x.ts"] } as never)); // no package: not measured
  const sent0 = s.h.a.sent.length;
  const turn = async (lines: number, name = "p1") => {
    mkdirSync(join(wt, "lib", "form"), { recursive: true });
    writeFileSync(join(wt, "lib", "form", "a.ts"), Array.from({ length: lines }, (_, i) => `export const y${i} = ${i};\n`).join(""));
    s.h.a.emit({ type: "turn", name, ts: 0 });
    await s.h.router.settled();
    return s.h.a.sent.slice(sent0).filter((m) => m.to === name).map((m) => [m.text, m.from]);
  };
  assert.deepEqual(await turn(0), []);
  assert.deepEqual(await turn(130, "other"), [], "a child without a package is not measured");
  const h80 = sizeBlock(80, "Size: 130/150 changed lines (80 %). Finish or plan a split.");
  assert.deepEqual(await turn(130), [[h80, "router"]]);
  assert.deepEqual(await turn(140), [[h80, "router"]], "once per stage");
  const h100 = sizeBlock(100, "Size: 160/150 changed lines (100 %). The reviewer is now opus; consider a split.");
  assert.deepEqual(await turn(160), [[h80, "router"], [h100, "router"]]);
  assert.deepEqual(await turn(500), [[h80, "router"], [h100, "router"]], "once per stage");
  assert.deepEqual(s.h.a.killed, [], "no kill");
  assert.deepEqual(s.h.a.sent.slice(sent0).filter((m) => m.to !== "p1"), [], "nothing else: no parent notice, no pause");
  const c = s.h.lines().filter((l) => l.event === "crossing");
  assert.deepEqual(c.map((l) => [l.node, l.stage, l.lines, l.budget, l.estimate, l.tier, l.class, l.depth, l.kind, l.turn]),
    [["auth.form", 80, 130, 150, 60, "standard", "standard", 1, "code", 2], ["auth.form", 100, 160, 150, 60, "standard", "standard", 1, "code", 4]]);
  for (const l of c) assert.deepEqual(FIELDS.filter((f) => !(f in l)), [], JSON.stringify(l));
  for (const l of c) assert.equal(l.sessionId, "s-main", "the main session's id, the measuring router's (review lf56 m5)");
});
