// Local-first plan LF1.T9 (spec §6 E0, MEAS-2, NR-1): a cloud-first session draws E0 at its start; in the `cloud-only` arm
// none of its spawns is placed on a `route: "local"` member and its `session` line says `localMembers: "off"`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T0_ALL, card, harness, provideSkills } from "./harness.ts";
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
