// Local-first plan LF1.T9 (spec §6 E0, MEAS-2, NR-1): a cloud-first session draws E0 at its start; in the `cloud-only` arm
// none of its spawns is placed on a `route: "local"` member and its `session` line says `localMembers: "off"`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T0_ALL, accepted, card, harness, provideSkills } from "./harness.ts";
import { seeded } from "./rand.ts";
import { defaults } from "../core/settings.ts";
import { profileFor } from "../core/profile.ts";
import type { Card, T2 } from "../core/types.ts";
import { assign } from "../core/strategy/arms.ts";
import { draw, pick } from "../core/strategy/draw.ts";

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

// LF2.T7 (spec §2.8, D61, D93): E0 is the registry's factor; its weights are [1 − s, s] of the session's snapshot, so its
// level is LF1.T9's draw and resume-stable. An eligible session's line names it in `arms`; any other session draws nothing.
test("E0 via registry", () => {
  for (const s of [0, 0.1, 0.5, 1]) {
    const snap = { seed: "task-router", cloudOnlyShare: s, factors: {} };
    for (let i = 0; i < 1000; i++) {
      const lf1 = s > 0 ? pick(["as-used", "cloud-only"], [1 - s, s], draw("task-router", "E0", `s-${i}`)) : "as-used";
      assert.equal(assign(snap, "E0", `s-${i}`), lf1, `share ${s}, s-${i}`);
    }
  }
  const start = (id: string, settings: Record<string, unknown>, entries: { type: string; data: unknown }[] = []) => {
    const h = harness({ settings: settings as never });
    h.f.entries.push(...entries);
    h.f.fire("session_start", { reason: entries.length ? "resume" : "startup" },
      { ...ctx(id), sessionManager: { getSessionId: () => id, getBranch: () => h.f.entries.map((e) => ({ type: "custom", customType: e.type, data: e.data })) } });
    return { h, session: h.lines().filter((l) => l.event === "session").map((l) => [l.localMembers, l.arms]) };
  };
  const share = (s: number) => ({ experiments: { cloudOnlyShare: s } });
  for (let i = 0; i < 20; i++) {
    const want = assign({ seed: "task-router", cloudOnlyShare: 0.5, factors: {} }, "E0", `s-${i}`);
    const first = start(`s-${i}`, share(0.5));
    assert.deepEqual(first.session, [[want === "cloud-only" ? "off" : "on", [`E0=${want}`]]]);
    // a resume with another share keeps the snapshot's draw
    assert.deepEqual(start(`s-${i}`, share(0), first.h.f.entries).session, first.session);
  }
  assert.deepEqual(start("s-zero", share(0)).session, [], "share 0: no draw, no session line");
  // D93: outside E0's eligibility the session line has neither localMembers nor an E0 arm
  assert.deepEqual(start("s-off", { ...share(1), routing: false }).session, [[undefined, undefined]]);
  // a session without an id, and a child, draw nothing: no snapshot either
  const none = harness({ settings: share(1) as never });
  none.f.fire("session_start", { reason: "startup" }, {});
  none.a.agents.push({ name: "c1", parent: "main", sessionId: "s-c1", model: "m", thinkingLevel: undefined, state: "running" });
  none.f.fire("session_start", { reason: "startup" }, ctx("s-c1"));
  assert.deepEqual([none.f.entries, none.lines()], [[], []]);
});

// LF3.T5 (MEAS-2, deferred from LF1.T9): E0 is drawn at session_start only; a `/profile local-first` switch neither redraws
// nor drops the session's arm, and writes no second session line.
test("MEAS-2 profile switch", async () => {
  const cs = cards(40);
  const run = async (share: number, id: string, sw: boolean) => {
    // review m6: a placement override (scout: cloud) the comparison must follow
    const { h, c } = e0({ experiments: { cloudOnlyShare: share }, localFirst: { experimental: true }, profiles: { scout: { localFirst: { placement: "cloud" } } } }, id);
    if (sw) await h.f.commands.get("profile")!.handler("local-first", c);
    provideSkills(h, SKILLS);
    const models: string[] = [];
    for (const [i, k] of cs.entries()) {
      const r = await h.a.spawn({ name: `c${i}`, task: k });
      models.push("reject" in r ? "REJECT" : (r as { model: string }).model);
      h.clock.t += 61_000;
    }
    return { models, sessions: sessionLines(h).map((l) => l.localMembers), arms: h.f.entries.filter((e) => e.type === "task-router/arms").length,
      profile: h.router.profile.current(), settings: h.router.settings };
  };
  const off = await run(1, "s-off", true);
  assert.equal(off.profile, "local-first");
  assert.deepEqual([off.sessions, off.arms], [["off"], 1]);
  assert.deepEqual(off.models.filter((m) => LOCAL.includes(m)), [], "cloud-only stays cloud-only");
  const used = await run(0.1, "s-main", true), plain = await run(0.1, "s-main", false);
  assert.deepEqual([used.sessions, used.arms], [["on"], 1]);
  // as-used stays as-used: today's routing, but for the cards local-first places on its start member by their kind (PRO-10 b, LF4.T12)
  const local = (kind: string) => { const p = profileFor(kind, used.settings); return p.ok && p.value.localFirst?.placement === "local"; };
  const byKind = (k: Card) => !k.t2.length && local(k.kind);
  assert.deepEqual(used.models, plain.models.map((m, i) => (byKind(cs[i]!) ? LOCAL[0] : m)), "as-used stays as-used");
  assert.ok(cs.some(byKind) && cs.some((k) => !byKind(k)), "both placements exercised");
});

// ---- R3A.T3 (owner; spec MEAS-4): counterfactual logging on the routed spawn line ----
// `planned` = the member the as-used plan picked (before E0's filter and any health fallback), `localUp` = that member's `up`
// (health ∧ ¬blocked ∧ ¬capped, `memberState`) when it is a `route: "local"` member, `triggered` = planned is local and up.
const CF = ["planned", "localUp", "triggered"];
const cf = (l: Record<string, unknown> | undefined) => CF.map((k) => l?.[k]);
const as = (share: number, settings: Record<string, unknown> = {}) => e0({ experiments: { cloudOnlyShare: share }, ...settings });

test("MEAS-4 fields: the same three values in both arms, a down local server is the health fallback", async () => {
  for (const share of [0, 1]) {
    const arm = share === 0 ? "as used" : "cloud-only";
    const { h } = as(share);
    const up = await placed(h, "u1");
    accepted(up.r);
    assert.deepEqual(cf(up.line), ["qwen-local", true, true], `${arm}: planned local and up`);
    assert.equal(up.line?.workerMember === "qwen-local", share === 0, `${arm}: where it ran`);
    h.health.health = 0; // the local server is down: the next probe (after the cache's 30 s) says so
    h.clock.t += 61_000;
    const down = await placed(h, "d1");
    accepted(down.r);
    assert.deepEqual(cf(down.line), ["qwen-local", false, false], `${arm}: planned local, down`);
    assert.notEqual(down.line?.workerMember, "qwen-local", `${arm}: the health fallback ran it elsewhere`);
  }
  // a plan that picks a cloud member: `planned` names it, no `localUp`, `triggered` false
  for (const share of [0, 1]) {
    const hi = await placed(as(share).h, "c1", { task: card({ t2: ["security"] }) });
    assert.equal(hi.line?.triggered, false, `share ${share}`);
    assert.ok(!("localUp" in hi.line!), `share ${share}`);
    assert.ok(typeof hi.line?.planned === "string" && !LOCAL.includes(hi.line.planned), `share ${share}: ${hi.line?.planned}`);
    assert.equal(hi.line?.planned, hi.line?.workerMember, `share ${share}`);
  }
});

test("MEAS-4 a blocked or capped local member is not up", async () => {
  const { h } = as(0, { models: { "qwen-local": { dailyCap: 1 } } });
  assert.deepEqual(cf((await placed(h, "u1")).line), ["qwen-local", true, true]);
  h.a.emit({ type: "turn", name: "u1", ts: 2 }); // one request on the local member: today's cap reached
  h.clock.t += 61_000;
  assert.deepEqual(cf((await placed(h, "u2")).line), ["qwen-local", false, false]);
});

test("MEAS-4 an explicit model and a force: planned is what the plan picked, a force logs the routed counterfactual", async () => {
  for (const share of [0, 1]) {
    const { h } = as(share);
    const pinned = await placed(h, "p1", { model: "anthropic/claude-sonnet-5-5" });
    assert.deepEqual(cf(pinned.line), ["sonnet", undefined, false], `share ${share}: an accepted explicit model is the plan's member`);
  }
  const { h, c } = as(1);
  await h.f.commands.get("force")!.handler("opus", c);
  const forced = await placed(h, "f1");
  assert.equal(forced.line?.forced, true);
  assert.deepEqual(cf(forced.line), ["qwen-local", true, false], "what routing would have chosen, as the routedModel says; a forced spawn is no arm's to claim");
});

test("MEAS-4 the randomized leg: the as-used plan's draw decides `planned` in both arms", async () => {
  for (const [u, want] of [[0, "sonnet"], [0.99, "qwen-local"]] as const) {
    for (const share of [0, 1]) {
      const h = harness({ settings: { experiments: { cloudOnlyShare: share }, randomize: { enabled: true, share: 0.5 } } as never, extra: { rng: () => u } });
      h.f.fire("session_start", { reason: "startup" }, ctx("s-main"));
      assert.equal((await placed(h, "r1")).line?.planned, want, `draw ${u}, share ${share}`);
    }
  }
});

test("MEAS-4 logging changes no routing: a cloud-only session routes, draws and escalates as a table without local members does", async () => {
  // cards at the bottom of the table draw (the randomizer); every fifth is a re-spawn of the one before
  const rnd = seeded(77);
  const cs = Array.from({ length: 80 }, (_, i): Card => {
    const c = card({ kind: ["mechanical", "implement", "scout", "lookup"][rnd(4)]!, files: [`src/f${i}.ts`], t2: rnd(6) ? [] : ["security"] });
    if (!rnd(4)) c.importance = IMPS[rnd(2)];
    return i % 5 === 4 ? { ...c, attemptOf: `c${i - 1}` } : c;
  });
  const run = async (settings: Record<string, unknown>) => {
    const next = seeded(4242), draws: number[] = [];
    const h = harness({ settings: { randomize: { enabled: true, share: 0.5 }, ...settings } as never,
      extra: { rng: () => { const u = next(1_000_000) / 1_000_000; draws.push(u); return u; } } });
    h.f.fire("session_start", { reason: "startup" }, ctx("s-main"));
    provideSkills(h, SKILLS);
    const out: unknown[] = [];
    for (const [i, c] of cs.entries()) {
      const r = (await h.a.spawn({ name: `c${i}`, task: c })) as Record<string, unknown>;
      out.push("reject" in r ? r.reject : [r.model, r.thinkingLevel, r.briefAppend]);
      if (!("reject" in r)) h.a.emit({ type: "spawn", name: `c${i}`, by: "main", parent: "main", childSessionId: `s-c${i}`, ts: i });
      h.clock.t += 61_000;
    }
    return { out, draws, h };
  };
  // the local member sits above every cloud member (write 2): the as-used plan picks it for every card, the cloud-only plan a cheaper
  // cloud member of a lower level, so a logging plan that touched the router's attempt state would escalate a re-spawn from the wrong level
  const cloudOnly = await run({ experiments: { cloudOnlyShare: 1 }, models: { "qwen-local": { abilities: { write: 2, read: 3 } } } });
  // the reference has no logging plan of its own: no local member, as used
  const reference = await run({ experiments: { cloudOnlyShare: 0 }, models: { "qwen-local": { model: "" } } });
  assert.ok(cloudOnly.draws.length > 10, "the randomizer drew");
  assert.deepEqual(cloudOnly.draws, reference.draws, "the logging plan consumed no draw of the router's stream");
  assert.deepEqual(cloudOnly.out, reference.out, "the same models, efforts and briefs");
  assert.ok(cloudOnly.out.filter((x) => Array.isArray(x)).length > 40, "most cards are placed");
  const spawnLines = (r: typeof cloudOnly) => r.h.lines().filter((l) => l.event === "spawn");
  assert.ok(spawnLines(cloudOnly).length > 40 && spawnLines(cloudOnly).every((l) => typeof l.planned === "string" && typeof l.triggered === "boolean"));
  assert.ok(spawnLines(cloudOnly).some((l) => l.triggered === true), "some spawns are triggered: the as-used plan picked the local member");
  assert.ok(spawnLines(reference).every((l) => l.triggered === false && !("localUp" in l)), "the reference has no local member to pick");
  assert.deepEqual(cloudOnly.h.lines().filter((l) => l.event === "escalate").map((l) => [l.taskId, l.toLevel]),
    reference.h.lines().filter((l) => l.event === "escalate").map((l) => [l.taskId, l.toLevel]), "the same escalations");
});

// R3A review M1: after `/profile local-first` a local-kind card is placed on the start member in both arms; `planned` is that member in both.
test("MEAS-4 after /profile local-first: planned is the placement's start member in both arms", async () => {
  const seen: unknown[][] = [];
  for (const share of [0, 1]) {
    const { h, c } = as(share, { localFirst: { experimental: true } });
    await h.f.commands.get("profile")!.handler("local-first", c);
    provideSkills(h, SKILLS);
    // a critical card: the table's own plan picks a cloud member, the placement still the start member
    const p = await placed(h, "m1", { task: card({ importance: "critical" }) });
    accepted(p.r);
    assert.equal(p.line?.workerMember === "qwen-local", share === 0, `share ${share}: where it ran`);
    seen.push(cf(p.line));
  }
  assert.deepEqual(seen, [["qwen-local", true, true], ["qwen-local", true, true]]);
});

// R3A review H1: `triggered` = ¬forced ∧ ¬explicit model ∧ planned is local ∧ up ∧ a cloud plan exists (the E0 v2 delta's predicate): the
// spawns it counts are the ones both arms place by the router's own choice, so the filter is the same in both arms.
test("MEAS-4 triggered: an explicit local model and a force are not the arm's to claim", async () => {
  // as used, an explicit local model runs on its member; in a cloud-only session it is refused (E0_OFF) and leaves no line
  const { h } = as(0);
  const explicit = await placed(h, "e1", { model: QWEN });
  accepted(explicit.r);
  assert.deepEqual(cf(explicit.line), ["qwen-local", true, false], "as used: explicit local model");
  const off = await placed(as(1).h, "e1", { model: QWEN });
  assert.ok("reject" in off.r && off.line === undefined, "cloud-only: refused, no line");
  // a force (the command or the settings), in both arms
  for (const share of [0, 1]) {
    const f = as(share, { force: { model: "qwen-local", thinkingLevel: "" } });
    const line = (await placed(f.h, "f1")).line;
    assert.equal(line?.forced, true, `share ${share}`);
    assert.deepEqual(cf(line), ["qwen-local", true, false], `share ${share}: forced`);
  }
});

test("MEAS-4 triggered: a card only a local member reaches (no cloud plan) is not triggered", async () => {
  // the local member sits above every cloud member; the cloud-only arm refuses the card, as used places it on the local member
  const top = { models: { "qwen-local": { abilities: { write: 2, read: 3 } }, sonnet: { model: "" }, opus: { model: "" } } };
  const hi = card({ importance: "critical" });
  const used = await placed(as(0, top).h, "t1", { task: hi });
  accepted(used.r);
  assert.deepEqual(cf(used.line), ["qwen-local", true, false], "as used: no cloud plan, so no trigger");
  assert.ok("reject" in (await placed(as(1, top).h, "t1", { task: hi })).r, "cloud-only: refused");
});

test("MEAS-4 triggered: over a card sequence the arms agree, and a spawn triggered as used is placed in cloud-only", async () => {
  // a table in which the cloud members reach less than the local one, so some cards have no cloud plan
  const settings = { models: { "qwen-local": { abilities: { write: 2, read: 3 } }, sonnet: { model: "" }, opus: { model: "" } } };
  const run = async (share: number) => {
    const { h } = as(share, settings);
    provideSkills(h, SKILLS);
    const out: { refused: boolean; triggered?: unknown }[] = [];
    for (const [i, c] of cards(60).entries()) {
      const p = await placed(h, `c${i}`, { task: c });
      out.push({ refused: "reject" in p.r, triggered: p.line?.triggered });
      h.clock.t += 61_000;
    }
    return out;
  };
  const used = await run(0), off = await run(1);
  for (const [i, u] of used.entries()) {
    if (u.triggered === true) assert.equal(off[i]!.refused, false, `card ${i}: triggered as used, refused in cloud-only`);
    if (!off[i]!.refused) assert.equal(off[i]!.triggered, u.triggered, `card ${i}: the same trigger in both arms`);
  }
  assert.ok(used.some((x) => x.triggered === true) && used.some((x) => x.triggered === false), "both outcomes occur as used");
  assert.ok(off.some((x) => x.refused) && off.some((x) => !x.refused), "the cloud-only arm refuses some cards, places others");
});

// R3A review L4: a cloud-only spawn whose as-used plan fails (here an explicit cloud model below the as-used plan's level) still has `triggered`
test("MEAS-4 an as-used plan that fails in a cloud-only session: triggered false, no planned", async () => {
  const top = { models: { "qwen-local": { abilities: { write: 2, read: 3 } } } };
  const HAIKU = "anthropic/claude-haiku-5-5";
  // as used the explicit model is below the plan's level: refused. In cloud-only the cloud plan (no local member) accepts it.
  assert.ok("reject" in (await placed(as(0, top).h, "p1", { model: HAIKU })).r, "as used: refused");
  const p = await placed(as(1, top).h, "p1", { model: HAIKU });
  accepted(p.r);
  assert.equal(p.line?.triggered, false);
  assert.ok(!("planned" in p.line!) && !("localUp" in p.line!), "nothing is known of the as-used pick");
});

// R3A review L2: a re-spawn after the local member was down: the as-used plan escalates from where the attempt ran (the fallback), so the
// cloud-only session's logging plan does too, and `planned` is the same in both arms
test("MEAS-4 a re-spawn after a health fallback: planned is the same in both arms", async () => {
  const planned: unknown[][] = [];
  for (const share of [0, 1]) {
    const { h } = as(share, { profiles: { rd: { ability: "read", tools: "read-only", skills: [], report: "answer" } } }); // read: qwen 0, haiku 1, sonnet 2
    h.health.health = 0; // the local server is down: the first spawn falls back to a cloud member
    const t1 = await placed(h, "t1", { task: card({ kind: "rd" }) });
    accepted(t1.r);
    assert.deepEqual(cf(t1.line), ["qwen-local", false, false]);
    h.clock.t += 61_000;
    const t2 = await placed(h, "t2", { task: card({ kind: "rd", attemptOf: "t1" }) });
    accepted(t2.r);
    planned.push([t1.line?.workerMember, cf(t2.line)]);
  }
  assert.equal(planned[0]![0], planned[1]![0], "the same fallback ran the first attempt");
  assert.deepEqual(planned[1], planned[0], "the same counterfactual for the re-spawn");
});

// R3A review M4 (a pin: it cannot be red before the change; its plant is a refuse path that writes a spawn line): a spawn refused at the
// selection writes no spawn line, its counterfactual with it, even when it was triggered; the trigger counts omit such spawns.
test("MEAS-4 a triggered spawn refused at the selection writes no spawn line", async () => {
  const capped = { models: { haiku: { dailyCap: 0 }, sonnet: { dailyCap: 0 }, opus: { dailyCap: 0 } } }; // no cloud member can take it
  const used = await placed(as(0, capped).h, "r1");
  accepted(used.r);
  assert.deepEqual(cf(used.line), ["qwen-local", true, true], "as used: placed on the local member, triggered");
  const off = await placed(as(1, capped).h, "r1");
  assert.ok("reject" in off.r && /no member for this leg/.test((off.r as { reject: string }).reject), JSON.stringify(off.r));
  assert.equal(off.line, undefined, "cloud-only: refused at the selection, no spawn line");
});
