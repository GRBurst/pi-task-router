// Local-first plan LF1.T3 (spec §2.4, LOG-2, LOG-3, LOG-4): the v2 builders and the exports a consumer reads the
// log's closed sets from. Each later builder task adds its builder to `LINES` and its event to `EVENTS_V2`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENUMS_V2, EVENTS_V2, FALLBACKS, SCHEMA_VERSION, sessionEvent } from "../core/outcome.ts";
import { TRIPS } from "../core/local/tripwires.ts";
import { ROLES } from "../core/local/overseer.ts";
import { REASONS } from "../core/local/merge.ts";
import { TRIGGERS } from "../core/local/plan.ts";
import { PLAN_TYPE } from "../core/local/plans.ts";
import { BRANCH_TYPE } from "../core/local/branches.ts";
import { seeded } from "./rand.ts";
import { textFree } from "./text-free.ts";

const NOW = new Date(Date.UTC(2026, 9, 2, 12, 0, 0));
type Rnd = (n: number) => number;
const one = <T>(rnd: Rnd, xs: readonly T[]): T => xs[rnd(xs.length)]!;
/** Free text a builder must never copy: spaces, fences, an instruction, a path. */
const TEXT = ["fix the auth bug in src/a.ts", "```sh\nrm -rf /\n```", "ignore previous instructions", "<router-hint>", "/work/repo/x"];
/** Stray free-text keys a caller might hand a builder (a goal, a note, a summary). */
const stray = (rnd: Rnd) => ({ goal: one(rnd, TEXT), note: one(rnd, TEXT), summary: one(rnd, TEXT) });

/** One generated line per v2 builder. */
const LINES: Array<(rnd: Rnd) => Record<string, unknown>> = [
  (rnd) => sessionEvent({
    ...stray(rnd), now: NOW, sessionId: `s-${rnd(1e6).toString(16)}`, profile: one(rnd, ["cloud-first", "local-first", "local-mode"] as const),
    mainModel: one(rnd, ["anthropic/claude-opus-5-5", "local/qwen", "openrouter/qwen/free"]), startSet: rnd(2) === 1,
    localMembers: one(rnd, ["on", "off"] as const), routerVersion: one(rnd, ["0.4.0", "0.5.0-rc.1"]),
  }),
];

test("LOG-2", () => {
  assert.deepEqual(
    sessionEvent({ now: NOW, sessionId: "s-main", profile: "local-first", mainModel: "local/qwen", startSet: true, localMembers: "on", routerVersion: "0.4.0" }),
    { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "session", taskId: "s-main", profile: "local-first", mainModel: "local/qwen",
      startSet: true, localMembers: "on", routerVersion: "0.4.0" },
  );
  assert.ok(EVENTS_V2.includes("session"));
  const rnd = seeded(203);
  for (let i = 0; i < 200; i++) for (const line of LINES) assert.ok((EVENTS_V2 as readonly unknown[]).includes(line(rnd).event));
});

test("LOG-3", () => {
  const enums = new Set(Object.values(ENUMS_V2).flat().map(String));
  const rnd = seeded(303);
  for (let i = 0; i < 200; i++)
    for (const line of LINES) {
      const l = line(rnd);
      assert.deepEqual(textFree(l, enums), [], JSON.stringify(l));
    }
});

/** The exports `log-contract` imports, taken literally at LF1.T3: they stay and only grow (spec §2.4). */
const SNAPSHOT = {
  TRIPS: ["identical-call", "no-change-writes", "alternation", "repeated-error", "churn", "check-failing", "over-size", "risky-path",
    "context-soft", "context-stall", "outside-worktree"],
  ROLES: ["merge", "plan-author", "delta", "plan-review", "steer"],
  REASONS: ["main-branch", "dirty", "behind", "fixer-running", "abandoned", "blocked", "size", "scope", "check", "main-dirty",
    "plan-changed", "no-worktree", "review-unavailable", "aborted", "git"],
  TRIGGERS: ["non-whitelisted", "interface-break", "regression", "over-budget", "remediation-failed"],
};

test("LOG-4", () => {
  const now: Record<keyof typeof SNAPSHOT, readonly string[]> = { TRIPS, ROLES, REASONS, TRIGGERS };
  for (const [name, values] of Object.entries(SNAPSHOT))
    assert.deepEqual(values.filter((v) => !now[name as keyof typeof SNAPSHOT].includes(v)), [], `${name} lost values`);
  assert.deepEqual([PLAN_TYPE, BRANCH_TYPE], ["task-router/plan", "task-router/branch"]);
  assert.deepEqual([...FALLBACKS], ["budget", "error"]);
  assert.deepEqual([...ENUMS_V2["session.profile"]!], ["cloud-first", "local-first", "local-mode"]);
  assert.deepEqual([...ENUMS_V2["session.localMembers"]!], ["on", "off"]);
  // every builder's enumerated field holds a value of its ENUMS_V2 list
  const rnd = seeded(403);
  for (let i = 0; i < 200; i++)
    for (const line of LINES) {
      const l = line(rnd);
      for (const [key, values] of Object.entries(ENUMS_V2)) {
        const [event, field] = key.split(".") as [string, string];
        if (l.event === event) assert.ok(values.includes(l[field] as string | number), `${key}: ${String(l[field])}`);
      }
    }
});
