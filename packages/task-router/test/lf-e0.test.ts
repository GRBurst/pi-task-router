// Local-first plan LF1.T9 (spec §6 E0, MEAS-2, NR-1): a cloud-first session draws E0 at its start; in the `cloud-only` arm
// none of its spawns is placed on a `route: "local"` member and its `session` line says `localMembers: "off"`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T0_ALL, accepted, card, harness, provideSkills } from "./harness.ts";
import { seeded } from "./rand.ts";
import { defaults } from "../core/settings.ts";
import type { Card, T2 } from "../core/types.ts";

const LOCAL = Object.values(defaults().models).filter((m) => m.route === "local").map((m) => m.model);
const KINDS = ["scout", "mechanical", "implement", "debug-design", "review", "plan"];
const T2S: T2[] = ["security", "concurrency", "repo-wide"];
const IMPS = ["high", "critical"] as const;
const SKILLS = ["tdd-implementation-planner", "systematic-debugging", "code-reviewer"];
const ctx = (id: string) => ({ sessionManager: { getSessionId: () => id }, model: { provider: "anthropic", id: "claude-opus-5-5" } });

const cards = (n: number): Card[] => {
  const rnd = seeded(909);
  return Array.from({ length: n }, () => {
    const c = card({
      kind: KINDS[rnd(KINDS.length)], t0: Object.fromEntries(Object.keys(T0_ALL).map((k) => [k, rnd(8) > 0])) as Card["t0"],
      t2: rnd(4) ? [] : [T2S[rnd(T2S.length)]], files: Array.from({ length: 1 + rnd(3) }, (_, i) => `src/f${i}.ts`),
    });
    if (!rnd(3)) c.importance = IMPS[rnd(2)];
    return c;
  });
};

/** One session (`share`, its id) placing `cs` in turn: the model each spawn runs on ("REJECT" for a refusal), and the session lines. */
async function session(share: number, id: string, cs: Card[]) {
  const h = harness({ settings: { experiments: { cloudOnlyShare: share } } as never });
  h.f.fire("session_start", { reason: "startup" }, ctx(id));
  provideSkills(h, SKILLS);
  const models: string[] = [];
  for (const [i, c] of cs.entries()) {
    const r = await h.a.spawn({ name: `c${i}`, task: c });
    models.push("reject" in r ? "REJECT" : (r as { model: string }).model);
    h.clock.t += 61_000; // the slot's reservation ends (PENDING_MS); nothing is listed, so each spawn finds its member free
  }
  return { models, sessions: h.lines().filter((l) => l.event === "session") };
}

test("MEAS-2", async () => {
  const cs = cards(120);
  const today = await session(0, "s-main", cs);
  assert.deepEqual(today.sessions, [], "share 0: no session line, no draw");
  assert.ok(today.models.some((m) => LOCAL.includes(m)), "the cards reach a local member as used");
  // share 1: every session draws cloud-only; no spawn on a local member, and none refused that today places.
  const off = await session(1, "s-off", cs);
  assert.deepEqual(off.sessions.map((l) => l.localMembers), ["off"]);
  assert.deepEqual(off.models.filter((m) => LOCAL.includes(m)), []);
  assert.deepEqual(off.models.map((m, i) => (m === "REJECT") === (today.models[i] === "REJECT")), cs.map(() => true));
  // NR-1: a session drawn as-used (draw("task-router", "E0", "s-main") ≈ 0.09 < 0.9) places every spawn as today.
  const used = await session(0.1, "s-main", cs);
  assert.deepEqual(used.sessions.map((l) => l.localMembers), ["on"]);
  assert.deepEqual(used.models, today.models);
});

// ---- LF1 review M1, M2: who is in E0 and what a force or an explicit model may do ----
const QWEN = "llama/qwen3.8";
const E0_OFF = "cloud-only session (E0): local members are off";
type H = ReturnType<typeof harness>;
const e0 = (settings: Record<string, unknown>, id = "s-main") => {
  const h = harness({ settings: { experiments: { cloudOnlyShare: 1 }, ...settings } as never });
  const c = {
    hasUI: true, modelRegistry: { find: (p: string, m: string) => (`${p}/${m}` === QWEN ? { provider: p, id: m } : undefined), getAvailable: () => [] },
    ui: { notify: () => undefined, setStatus: () => undefined }, model: { provider: "anthropic", id: "claude-opus-5-5" },
    sessionManager: { getSessionId: () => id, getBranch: () => h.f.entries.map((e) => ({ type: "custom", customType: e.type, data: e.data })) },
  };
  h.f.fire("session_start", { reason: "startup" }, c);
  return { h, c };
};
const sessionLines = (h: H) => h.lines().filter((l) => l.event === "session");
/** Spawn `name`, then the actor's spawn event; the policy's answer and the spawn line. */
async function placed(h: H, name: string, extra: Record<string, unknown> = {}) {
  const r = (await h.a.spawn({ name, task: card(), ...extra })) as any;
  if (!("reject" in r)) h.a.emit({ type: "spawn", name, by: "main", parent: "main", childSessionId: `s-${name}`, ts: 1 });
  return { r, line: h.lines().find((l) => l.event === "spawn" && l.taskId === name) };
}

test("MEAS-2 force: a force onto a local member in a cloud-only session is the owner's override; its spawn line says forced", async () => {
  // as used, no force: the card lands on the local member (so the force below is no accident of the routing)
  const used = e0({ experiments: { cloudOnlyShare: 0 } });
  assert.equal((await placed(used.h, "u1")).r.model, QWEN);
  for (const how of ["command", "settings"]) {
    const { h, c } = e0(how === "settings" ? { force: { model: "qwen-local", thinkingLevel: "" } } : {});
    assert.deepEqual(sessionLines(h).map((l) => l.localMembers), ["off"], how);
    if (how === "command") {
      // unforced, the cloud-only session keeps the card off the local member
      assert.notEqual((await placed(h, "n1")).r.model, QWEN);
      await h.f.commands.get("force")!.handler("qwen-local", c);
    }
    const f = await placed(h, "f1");
    accepted(f.r);
    assert.equal(f.r.model, QWEN, how);
    assert.equal(f.line?.forced, true, how);
    assert.equal(f.line?.workerModel, QWEN, how);
    assert.equal(f.line?.workerMember, "qwen-local", `${how}: the force finds its member in the full table`);
  }
});

test("MEAS-2 routing off: no draw, the session line has no localMembers; an explicit local model runs", async () => {
  const { h } = e0({ routing: false });
  assert.deepEqual(sessionLines(h).map((l) => [l.profile, "localMembers" in l]), [["cloud-first", false]]);
  assert.equal(((await h.a.spawn({ name: "x1", model: QWEN } as never)) as any).model, QWEN);
});

test("MEAS-2 eligibility: a table with no enabled cloud member draws no E0 and routes as used", async () => {
  const local = { models: { haiku: { model: "" }, sonnet: { model: "" }, opus: { model: "" } } };
  const { h } = e0(local);
  assert.deepEqual(sessionLines(h).map((l) => [l.profile, "localMembers" in l]), [["cloud-first", false]]);
  const p = await placed(h, "l1");
  accepted(p.r);
  assert.equal(p.r.model, QWEN);
  // one enabled cloud member makes the session eligible (and it draws cloud-only at share 1)
  const one = e0({ models: { ...local.models, haiku: { model: "anthropic/claude-haiku-5-5" } } });
  assert.deepEqual(sessionLines(one.h).map((l) => l.localMembers), ["off"]);
  // the free cloud slot (route "cloud", blank by default) counts once it has a model
  const free = e0({ models: { ...local.models, "qwen-cloud": { model: "openrouter/qwen/x:free" } } });
  assert.deepEqual(sessionLines(free.h).map((l) => l.localMembers), ["off"]);
});

test("MEAS-2 refusals name the cause: an explicit local model, and a level only a local member reaches", async () => {
  const { h } = e0({});
  const r = (await h.a.spawn({ name: "x1", task: card(), model: QWEN })) as { reject: string };
  assert.ok(r.reject.includes(E0_OFF), r.reject);
  assert.ok(!r.reject.includes("not an enabled member"), r.reject);
  // as used, the same request is accepted
  accepted(await e0({ experiments: { cloudOnlyShare: 0 } }).h.a.spawn({ name: "x1", task: card(), model: QWEN }));
  // a local member above every cloud member: the plan's own refusal names E0
  const top = { models: { "qwen-local": { abilities: { write: 2, read: 3 } }, sonnet: { model: "" }, opus: { model: "" } } };
  const hi = card({ importance: "critical" });
  accepted(await e0({ ...top, experiments: { cloudOnlyShare: 0 } }).h.a.spawn({ name: "x1", task: hi }));
  const rej = (await e0(top).h.a.spawn({ name: "x1", task: hi })) as { reject: string };
  assert.ok(rej.reject.startsWith("no enabled member reaches write level"), rej.reject);
  assert.ok(rej.reject.includes(E0_OFF), rej.reject);
  assert.ok(!rej.reject.includes("blank or missing"), rej.reject);
});
