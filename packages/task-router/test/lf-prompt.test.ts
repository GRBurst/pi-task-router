// Local-first plan LF3.T8 (spec §2.2, PRO-8, S41): a local-first main gets the coordinator section, the pinned text with the
// session's tier budget, the tree caps and the plan budget filled in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { card, harness, provideSkills } from "./harness.ts";
import { treeRig } from "./tree-rig.ts";
import { budgetLine, localFirst } from "../core/strategy/local-first.ts";
import { coordinatorSection } from "../core/prompt.ts";
import { parseSettings } from "../core/settings.ts";

const S41 = (tier: string, budget: number, maxChildren: number, maxDepth: number, planLines: number): string =>
  "You coordinate; local children do the work. " +
  `Tier budget this session: ${tier} = ${budget} changed lines per package (inert unlimited). ` +
  `Start every package with start_branch and an estimate; above the budget, split it: at most ${maxChildren} children per node, ` +
  `depth at most ${maxDepth} below the request, plans at most ${planLines} lines. ` +
  "One fresh child per package; it either does its package or submits a split and ends — you start the children of a split. " +
  "Merge with request_merge; the router chooses the reviewer and queues merges.";

test("PRO-8", () => {
  assert.equal(coordinatorSection({ tier: "standard", budget: 150, maxChildren: 5, maxDepth: 3, planLines: 150 }), S41("standard", 150, 5, 3, 150));
  assert.equal(coordinatorSection({ tier: "large", budget: 300, maxChildren: 4, maxDepth: 2, planLines: 120 }), S41("large", 300, 4, 2, 120));
});

test("PRO-8 shell: the local-first main's section carries the session's budgets (standard while E2 is disabled, SIZE-3)", () => {
  const raw = { experiments: { cloudOnlyShare: 0 }, profile: "local-first",
    localFirst: { experimental: true, tiers: { small: 40, standard: 90, large: 200 }, tree: { maxDepth: 2, maxChildren: 4, planLines: 80 } } };
  const h = harness({ extra: { settings: parseSettings(raw, "0.4.0").settings } as never });
  const c = { sessionManager: { getSessionId: () => "s-p8", getBranch: () => [] } };
  h.f.fire("session_start", { reason: "startup" }, c);
  const sections: Record<string, string> = { task_cards: "-" };
  h.f.fire("before_agent_start", { systemPromptOptions: { sections, skills: [] } }, c);
  assert.equal(sections.task_cards!.split("\n")[0], S41("standard", 90, 4, 2, 80)); // then the SIZE-9 line
});

const BUDGETS = (b: number, planLines: number, maxChildren: number): string =>
  `Budgets: package ≤ ${b} changed lines; split ≤ ${planLines} lines, ≤ ${maxChildren} children.`;

test("SIZE-9", async () => {
  // the line
  const s = parseSettings({ localFirst: { tiers: { small: 40, standard: 90, large: 200 }, tree: { maxDepth: 2, maxChildren: 4, planLines: 80 } } }, "0.4.0").settings;
  assert.equal(budgetLine("standard", localFirst(s), {}), BUDGETS(90, 80, 4));
  assert.equal(budgetLine("large", localFirst(s), { E2: "large" }), BUDGETS(200, 80, 4));
  // the main's section: S41, then the line
  const raw = { experiments: { cloudOnlyShare: 0 }, profile: "local-first",
    localFirst: { experimental: true, tiers: { small: 40, standard: 90, large: 200 }, tree: { maxDepth: 2, maxChildren: 4, planLines: 80 } } };
  const h = harness({ extra: { settings: parseSettings(raw, "0.4.0").settings } as never });
  const c = { sessionManager: { getSessionId: () => "s-p9", getBranch: () => [] } };
  h.f.fire("session_start", { reason: "startup" }, c);
  const sections: Record<string, string> = { task_cards: "-" };
  h.f.fire("before_agent_start", { systemPromptOptions: { sections, skills: [] } }, c);
  assert.deepEqual(sections.task_cards!.split("\n"), [S41("standard", 90, 4, 2, 80), BUDGETS(90, 80, 4)]);
  // a package brief
  const t = treeRig();
  provideSkills(t.h, ["tdd-implementation-planner", "code-reviewer"]);
  await t.start({ slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } });
  assert.equal((await t.call("split", { summary: "one", children: [
    { slug: "form", goal: "build the form", files: ["src/form/**"], estimate: { lines: 60, kind: "code" }, check: "true" }] } as never)).isError, undefined);
  assert.equal((await t.start({ parent: "auth", child: "form" })).isError, undefined);
  const r = await t.h.a.spawn({ name: "p1", task: card({ kind: "implement", files: ["src/form/a.ts"], package: "auth.form" } as never) } as never) as { briefAppend?: string };
  assert.ok(r.briefAppend?.split("\n").includes(BUDGETS(150, 150, 5)), r.briefAppend);
});
