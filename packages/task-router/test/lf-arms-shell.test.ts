// Local-first plan LF2.T5 (spec §2.2, RND-5): a session's experiments settings are snapshot in `task-router/arms` at its
// first session_start; every later draw of the session (a resume, another process) uses the snapshot, whatever the
// settings or the code defaults say by then.
import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness.ts";
import { seeded } from "./rand.ts";
import { parseSettings } from "../core/settings.ts";
import { FACTORS } from "../core/strategy/arms.ts";
import type { FactorId, FactorUnit } from "../core/strategy/arms.ts";

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
  // the entry (spec §2.2): v 1, the session, the effective settings of every factor, the router version, the session's draws
  const e = old.written[0]!.data as Record<string, any>;
  assert.deepEqual(Object.keys(e).sort(), ["arms", "experiments", "routerVersion", "sessionId", "v"]);
  assert.deepEqual([e.v, e.sessionId, typeof e.routerVersion, e.experiments.seed, e.experiments.cloudOnlyShare], [1, "s-code", "string", "task-router", 0.1]);
  assert.deepEqual(Object.keys(e.experiments.factors).sort(), Object.keys(FACTORS).sort());
  assert.deepEqual(e.experiments.factors.E2, { enabled: true, weights: [1, 1, 1] });
  assert.deepEqual(e.arms, { E2: old.draws[0]![0]!.slice("E2=".length) });
  // legacy local mode draws nothing and keeps its entries (NR-7): no snapshot
  const lm = harness({ settings: { mode: "local" } as never, apiExt: true });
  lm.f.fire("session_start", { reason: "startup" }, { sessionManager: { getSessionId: () => "s-lm", getBranch: () => [] } });
  assert.deepEqual(lm.f.entries.filter((x) => x.type === "task-router/arms"), []);
});
