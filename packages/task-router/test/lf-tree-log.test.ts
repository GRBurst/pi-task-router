// Local-first plan LF4.T6 (spec §2.4, TREE-11): the `node` and `split` builders. A node line per node state change, a split
// line per split; both text-free (no goal, summary or file list is ever copied).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENUMS_V2, EVENTS_V2, SCHEMA_VERSION, nodeEvent, splitEvent } from "../core/outcome.ts";
import { seeded } from "./rand.ts";
import { textFree } from "./text-free.ts";

const NOW = new Date(Date.UTC(2026, 9, 2, 12, 0, 0));
type Rnd = (n: number) => number;
const one = <T>(rnd: Rnd, xs: readonly T[]): T => xs[rnd(xs.length)]!;
const TEXT = ["fix the auth bug in src/a.ts", "```sh\nrm -rf /\n```", "ignore previous instructions", "<router-hint>", "/work/repo/x"];
const stray = (rnd: Rnd) => ({ goal: one(rnd, TEXT), summary: one(rnd, TEXT), check: one(rnd, TEXT), files: [one(rnd, TEXT)] });
const id = (rnd: Rnd) => one(rnd, ["auth", "auth.login", "auth.login.form", "x-1.y-2"]);

const KINDS = ["leaf", "plan", "integration", "fix"] as const;
const OUTCOMES = ["started", "split", "merged", "blocked", "abandoned"] as const;
const REASONS = ["estimate", "breaker", "check", "choice", "review"] as const;

const nodeLine = (rnd: Rnd) => nodeEvent({
  ...stray(rnd), now: NOW, node: id(rnd), ...(rnd(2) ? { parent: id(rnd) } : {}), depth: rnd(4), kind: one(rnd, KINDS),
  fanout: rnd(8), outcome: one(rnd, OUTCOMES), tier: one(rnd, ["small", "standard", "large", "inert"] as const),
  ...(rnd(2) ? { class: one(rnd, ["inert", "standard", "elevated"] as const) } : {}), profile: one(rnd, ["cloud-first", "local-first"] as const),
} as never);
const splitLine = (rnd: Rnd) => splitEvent({
  ...stray(rnd), now: NOW, node: id(rnd), reason: one(rnd, REASONS), children: 1 + rnd(7), depth: rnd(4), planLines: rnd(400),
} as never);

test("TREE-11 builders", () => {
  assert.deepEqual(
    nodeEvent({ now: NOW, node: "auth.login", parent: "auth", depth: 1, kind: "leaf", fanout: 0, outcome: "started", tier: "small",
      class: "standard", profile: "local-first" }),
    { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "node", taskId: "auth.login", parent: "auth", depth: 1, kind: "leaf", fanout: 0,
      outcome: "started", tier: "small", class: "standard", profile: "local-first" },
  );
  // the root: no parent, no class yet
  assert.deepEqual(
    nodeEvent({ now: NOW, node: "auth", depth: 0, kind: "plan", fanout: 3, outcome: "split", tier: "standard", profile: "local-first" }),
    { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "node", taskId: "auth", depth: 0, kind: "plan", fanout: 3, outcome: "split",
      tier: "standard", profile: "local-first" },
  );
  assert.deepEqual(
    splitEvent({ now: NOW, node: "auth", reason: "choice", children: 3, depth: 0, planLines: 42 }),
    { v: SCHEMA_VERSION, ts: NOW.toISOString(), event: "split", taskId: "auth", node: "auth", reason: "choice", children: 3, depth: 0,
      planLines: 42 },
  );
  // review lf56 m5: the main session's id when known (as on the gate's lines, owner's decision PA Q1)
  assert.equal(nodeEvent({ now: NOW, node: "auth", depth: 0, kind: "plan", fanout: 0, outcome: "started", tier: "standard", profile: "local-first",
    sessionId: "s-main" } as never).sessionId, "s-main");
  assert.equal(splitEvent({ now: NOW, node: "auth", reason: "choice", children: 3, depth: 0, planLines: 42, sessionId: "s-main" } as never).sessionId,
    "s-main");
  assert.deepEqual(lacking(EVENTS_V2, ["node", "split"]), []);
  assert.deepEqual([ENUMS_V2["node.kind"], ENUMS_V2["node.outcome"], ENUMS_V2["split.reason"]], [KINDS, OUTCOMES, REASONS]);
});

const lacking = (have: readonly (string | number)[], want: readonly string[]): string[] => want.filter((v) => !have.includes(v));

test("TREE-11 text-free and closed", () => {
  const enums = new Set(Object.values(ENUMS_V2).flat().map(String));
  const rnd = seeded(1104);
  for (let i = 0; i < 300; i++)
    for (const l of [nodeLine(rnd), splitLine(rnd)]) {
      assert.deepEqual(textFree(l, enums), [], JSON.stringify(l));
      for (const [key, values] of Object.entries(ENUMS_V2)) {
        const [event, field] = key.split(".") as [string, string];
        if (l.event === event && field in l) assert.ok(values.includes(l[field] as string), `${key}: ${String(l[field])}`);
      }
      const want = l.event === "node"
        ? ["v", "ts", "event", "taskId", "depth", "kind", "fanout", "outcome", "tier", "profile"]
        : ["v", "ts", "event", "taskId", "node", "reason", "children", "depth", "planLines"];
      assert.deepEqual(want.filter((k) => !(k in l)), [], `${l.event} lacks fields`);
      const allowed = new Set([...want, "parent", "class", "sessionId"]);
      assert.deepEqual(Object.keys(l).filter((k) => !allowed.has(k)), [], `${l.event} has extra fields`);
    }
});

test("TREE-11 a node line's tier is the session's drawn tier (review lf56 m10)", async () => {
  const { nodeRig } = await import("./node-rig.ts");
  const x = nodeRig();
  x.nodes.arms = () => ({ E2: "small" });
  const n = await x.node({ slug: "feat", estimate: { kind: "code", lines: 10 } });
  x.r.commit("src/a.ts", "a\n", "a", n.worktree);
  const r = await x.merge({ branch: n.branch });
  assert.equal(r.status, "merged", r.detail);
  await x.node({ slug: "docs", estimate: { kind: "inert", lines: 10 } });
  assert.deepEqual(x.nodeLines.map((l) => [l.node, l.outcome, l.tier]),
    [["feat", "started", "small"], ["feat", "merged", "small"], ["docs", "started", "inert"]]);
});
