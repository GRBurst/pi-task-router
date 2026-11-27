// R3A review M3: `dryPlan` is side-effect free by construction: it plans on a copy of the attempt map it is given and returns the copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T0_ALL, card } from "./harness.ts";
import { dryPlan } from "../core/pipeline.ts";
import { profileFor } from "../core/profile.ts";
import { defaults } from "../core/settings.ts";
import type { AttemptState } from "../core/attempts.ts";
import type { Card } from "../core/types.ts";

const settings = defaults();
const spawnIn = (taskId: string, c: Card) => ({
  taskId, card: c, verified: { t0: T0_ALL, forceT2: false, reasons: [], tokens: 0 } as any,
  profile: (profileFor(c.kind, settings) as any).value, importance: "normal" as const,
});

test("M3 dryPlan writes no attempt map it is given; it returns the map it planned on", () => {
  const given: AttemptState = new Map([["old", { member: "haiku", ranMember: "haiku", retries: 0 }]]);
  const before = JSON.stringify([...given]);
  const first = dryPlan({ settings, attempts: given }, spawnIn("a1", card()), []);
  assert.ok(first.plan.ok);
  assert.equal(JSON.stringify([...given]), before, "the caller's map is untouched");
  assert.deepEqual([...first.attempts.keys()], ["old", "a1"], "the returned map holds the dry plan's write");
  assert.notEqual(first.attempts.get("old"), given.get("old"), "its entries are copies");
  // a re-spawn on the returned map escalates from the first plan's member; on the caller's map it is an unknown lineage
  const again = dryPlan({ settings, attempts: first.attempts }, spawnIn("a2", { ...card(), attemptOf: "a1" }), []);
  assert.ok(again.plan.ok && again.plan.value.esc?.known === true);
  assert.deepEqual([...first.attempts.keys()], ["old", "a1"], "nor is the returned map written by the next plan");
  assert.deepEqual([...again.attempts.keys()], ["old", "a1", "a2"]);
});
