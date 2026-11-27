// Local-first plan LF5.T5–T7 (spec SIZE-5, SIZE-6, §2.4, design §5.3): the size stages 80 % and 100 % of the session tier's
// budget. Each stage, once per node, gives one hint (S48's pinned texts, never a block) and one `crossing` line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crossingEvent, ENUMS_V2, EVENTS_V2, SCHEMA_VERSION } from "../core/outcome.ts";
import { seeded } from "./rand.ts";
import { textFree } from "./text-free.ts";

const NOW = new Date(Date.UTC(2026, 10, 2, 12, 0, 0));
const FIELDS = ["node", "stage", "lines", "budget", "estimate", "tier", "class", "depth", "kind", "turn", "call", "sinceStartMs"];

test("builder", () => {
  const line = crossingEvent({ now: NOW, node: "auth.form", stage: 80, lines: 130, budget: 150, estimate: 60, tier: "standard", class: "standard",
    depth: 1, kind: "code", turn: 4, call: 17, sinceStartMs: 90_000 });
  assert.deepEqual(line, { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "crossing", taskId: "auth.form", node: "auth.form", stage: 80,
    lines: 130, budget: 150, estimate: 60, tier: "standard", class: "standard", depth: 1, kind: "code", turn: 4, call: 17, sinceStartMs: 90_000 });
  assert.ok((EVENTS_V2 as readonly string[]).includes("crossing"));
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
