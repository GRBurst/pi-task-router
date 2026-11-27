// Local-first plan LF3.T3 (spec §2.2, PRO-3, S34, D82): the session's routing profile lives in `task-router/profile` entries.
// Restored = the last entry's profile; none → the settings (`profile`, else the legacy `mode: "local"` → `local-mode`, else
// cloud-first). The first local-first session_start writes the settings' entry; an armed (local-first) session's lines
// carry `arms` (RND-6, the log's `armed()` port).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeGit } from "./fake-git.ts";
import { harness } from "./harness.ts";
import { seeded } from "./rand.ts";
import { PROFILE_TYPE, createRoutingProfile } from "../core/profile.ts";
import { parseSettings } from "../core/settings.ts";
import { cardSection, localSection } from "../core/prompt.ts";
import { activeSet } from "../core/local/mode.ts";
import { LF, treeRig } from "./tree-rig.ts";
import { MERGE_REASON } from "../core/local/gitcmd.ts";

const PROFILES = ["cloud-first", "local-first"] as const;
const SETTINGS: [Record<string, unknown>, string][] = [
  [{}, "cloud-first"], [{ mode: "local" }, "local-mode"], [{ profile: "cloud-first" }, "cloud-first"],
  [{ profile: "local-first", localFirst: { experimental: true } }, "local-first"], [{ profile: "local-first" }, "cloud-first"],
  [{ localFirst: { experimental: true } }, "cloud-first"], [{ profile: "cloud-first", localFirst: { experimental: true } }, "cloud-first"],
];
const GATE = "profile local-first is experimental before 0.5.0; set localFirst.experimental";
type Branch = { type: string; customType?: string; data?: unknown }[];

test("PRO-3", () => {
  const rnd = seeded(303);
  let restored = 0, gates = 0;
  for (let i = 0; i < 400; i++) {
    const [raw, fromSettings] = SETTINGS[rnd(SETTINGS.length)]!;
    const branch: Branch = [];
    let want = fromSettings, last: string | undefined;
    for (let n = rnd(7); n > 0; n--) {
      const k = rnd(6);
      if (k <= 2) { // a profile entry
        const p = PROFILES[rnd(2)]!;
        branch.push({ type: "custom", customType: PROFILE_TYPE, data: { v: 1, profile: p, by: rnd(2) ? "command" : "settings", at: "2026-10-02T12:00:00.000Z" } });
        want = last = p;
      } else if (k === 3) branch.push({ type: "custom", customType: PROFILE_TYPE, data: rnd(2) ? { v: 1, profile: "local-mode", by: "command" } : null }); // malformed: absent
      else if (k === 4) branch.push({ type: "custom", customType: "task-router/arms", data: { profile: "local-first" } });
      else branch.push({ type: "message" });
    }
    const settings = parseSettings(raw, "0.4.0").settings;
    // PRO-9 (review B): a stored local-first entry without `localFirst.experimental` is gated: the settings' profile stays, with the notice
    const gated = last === "local-first" && !settings.localFirst.experimental && fromSettings !== "local-mode";
    if (fromSettings === "local-mode" || gated) want = fromSettings; // the legacy local mode ignores entries (D59)
    if (want !== fromSettings) restored++;
    if (gated) gates++;
    const written: unknown[] = [], said: string[] = [];
    const store = createRoutingProfile(settings, (type, data) => written.push({ type, data }));
    store.restore(branch, (t) => said.push(t));
    assert.equal(store.current(), want, JSON.stringify({ raw, branch }));
    assert.deepEqual(written, [], "restore writes nothing");
    assert.deepEqual(said, gated ? [GATE] : [], JSON.stringify({ raw, branch }));
  }
  assert.ok(restored > 50, `entries decide in ${restored} of 400`);
  assert.ok(gates > 20, `the gate decides in ${gates} of 400`);
});

const XP = { profile: "local-first", localFirst: { experimental: true } };
/** One process of session `id` with `raw` settings on a branch holding `entries`. */
function start(id: string, raw: Record<string, unknown>, entries: { type: string; data: unknown }[] = []) {
  const h = harness({ extra: { settings: parseSettings({ experiments: { cloudOnlyShare: 0 }, ...raw }, "0.4.0").settings } as never });
  h.f.entries.push(...entries);
  const branch = () => h.f.entries.map((e) => ({ type: "custom", customType: e.type, data: e.data }));
  h.f.fire("session_start", { reason: entries.length ? "resume" : "startup" }, { sessionManager: { getSessionId: () => id, getBranch: branch } });
  return { h, written: h.f.entries.slice(entries.length).filter((e) => e.type === PROFILE_TYPE).map((e) => e.data) };
}

test("PRO-3 shell: the first local-first session_start writes the settings' entry; a resume restores it", () => {
  const first = start("s-lf", XP);
  assert.equal(first.written.length, 1);
  assert.deepEqual({ ...(first.written[0] as object), at: "-" }, { v: 1, profile: "local-first", by: "settings", at: "-" });
  const session = first.h.lines().filter((l) => l.event === "session");
  assert.deepEqual(session.map((l) => [l.profile, l.localMembers, l.arms]), [["local-first", undefined, []]], "MEAS-1: no E0 draw in local-first, so no localMembers (spec §2.4: E0 only)");
  // a resume with cloud-first settings (the flag still on) keeps the entry's profile and writes nothing
  const resumed = start("s-lf", { localFirst: { experimental: true } }, first.h.f.entries);
  assert.deepEqual(resumed.written, []);
  assert.deepEqual(resumed.h.lines().filter((l) => l.event === "session").map((l) => l.profile), ["local-first"]);
  // cloud-first and legacy local mode write no entry
  assert.deepEqual(start("s-cf", {}).written, []);
  assert.deepEqual(start("s-lm", { mode: "local" }).written, []);
  // RND-6: the store arms the log; a cloud-first session's lines carry no arms
  for (const [raw, armed] of [[XP, true], [{}, false]] as const) {
    const { h } = start("s-arm", raw);
    h.f.commands.get("force")!.handler("qwen-local", { sessionManager: { getSessionId: () => "s-arm" } });
    const force = h.lines().filter((l) => l.event === "force");
    assert.deepEqual(force.map((l) => "arms" in l), [armed], JSON.stringify(force));
  }
});

/** A main session `id` with a UI: its notifications and the router's status line. */
function withUi(id: string, raw: Record<string, unknown>, stored: { type: string; data: unknown }[] = []) {
  const h = harness({ extra: { settings: parseSettings({ experiments: { cloudOnlyShare: 0 }, ...raw }, "0.4.0").settings } as never });
  h.f.entries.push(...stored);
  const notes: [string, string][] = [], status = new Map<string, string | undefined>();
  const c = {
    hasUI: true, ui: { notify: (t: string, l: string) => void notes.push([t, l]), setStatus: (k: string, v: string | undefined) => void status.set(k, v) },
    sessionManager: { getSessionId: () => id, getBranch: () => h.f.entries.map((e) => ({ type: "custom", customType: e.type, data: e.data })) },
  };
  h.f.fire("session_start", { reason: stored.length ? "resume" : "startup" }, c);
  const run = (args: string) => h.f.commands.get("profile")!.handler(args, c);
  const entries = () => h.f.entries.filter((e) => e.type === PROFILE_TYPE).map((e): Record<string, unknown> => ({ ...(e.data as object), at: "-" }));
  const lines = () => h.lines().filter((l) => l.event === "profile").map(({ ts: _, ...l }) => l);
  return { h, c, notes, status, run, entries, lines };
}

// LF3.T5 (spec §2.3, PRO-2, S34): `/profile` shows or switches the session's routing profile: one entry `by: "command"`, one
// `profile` line, the status line; an unknown name → the usage, nothing written.
test("PRO-2", async () => {
  const s = withUi("s-p2", { localFirst: { experimental: true } });
  assert.equal(s.status.get("task-router"), undefined, "cloud-first never touches the status line");
  await s.run("local-first");
  assert.deepEqual(s.entries(), [{ v: 1, profile: "local-first", by: "command", at: "-" }]);
  assert.deepEqual(s.lines(), [{ v: 2, event: "profile", taskId: "s-p2", from: "cloud-first", to: "local-first", by: "command", arms: [] }]);
  assert.equal(s.status.get("task-router"), "local-first");
  assert.equal(s.h.router.profile.current(), "local-first");
  // none → shows the profile; an unknown name → usage; the same profile → no second entry
  await s.run("");
  assert.deepEqual(s.notes.at(-1), ["task-router profile: local-first", "info"]);
  await s.run("bogus");
  assert.deepEqual(s.notes.at(-1), ["usage: /profile [cloud-first | local-first]", "warning"]);
  await s.run(" local-first ");
  assert.equal(s.entries().length, 1);
  // back to cloud-first: one more entry and line; the status line is cleared
  await s.run("cloud-first");
  assert.deepEqual(s.entries().map((e) => [e.profile, e.by]), [["local-first", "command"], ["cloud-first", "command"]]);
  assert.deepEqual(s.lines().map((l) => [l.from, l.to, "arms" in l]), [["cloud-first", "local-first", true], ["local-first", "cloud-first", false]]);
  assert.equal(s.status.get("task-router"), undefined);
  // the switch is restored on resume
  assert.equal(withUi("s-p2", {}).h.router.profile.current(), "cloud-first");
});

// LF3 review B (PRO-9 a): a stored local-first entry does not outlive the flag: without `localFirst.experimental` the session falls back
// to the settings' profile (cloud-first here) with the gate's notice: no start model, no local tools, no entry written.
test("PRO-9 restore: a stored local-first entry without the flag falls back to the settings", () => {
  const entries = [{ type: PROFILE_TYPE, data: { v: 1, profile: "local-first", by: "settings", at: "2026-10-02T12:00:00.000Z" } }];
  const s = withUi("s-p9r", {}, entries);
  assert.deepEqual(s.notes, [["profile local-first is experimental before 0.5.0; set localFirst.experimental", "warning"]]);
  assert.deepEqual([s.h.router.profile.current(), s.h.f.tools.has("start_branch"), s.h.f.entries.slice(entries.length).filter((e) => e.type === PROFILE_TYPE).length], ["cloud-first", false, 0]);
  const on = withUi("s-p9r", { localFirst: { experimental: true } }, entries);
  assert.deepEqual([on.notes.filter(([t]) => t.includes("experimental")), on.h.router.profile.current()], [[], "local-first"], "with the flag the entry stands");
});

// LF3 review A (D59, Q24): the legacy local mode (`mode: "local"` without `profile`) has no switch before its retirement: `/profile`
// shows it and refuses every switch with a notice; a stored profile entry (an older session's) does not leave it either.
test("PRO-2 legacy local mode: /profile refuses a switch", async () => {
  for (const raw of [{ mode: "local" }, { mode: "local", localFirst: { experimental: true } }]) {
    const s = withUi("s-p2l", raw);
    const sets = s.h.f.activeSets.length;
    for (const to of ["cloud-first", "local-first"]) {
      const n = s.notes.length;
      await s.run(to);
      assert.deepEqual(s.notes.slice(n), [['task-router: /profile is not available in local mode (mode: "local") before its retirement', "warning"]], to);
    }
    await s.run("");
    assert.deepEqual(s.notes.at(-1), ["task-router profile: local-mode", "info"]);
    assert.deepEqual([s.entries(), s.lines(), s.h.router.profile.current(), s.h.f.activeSets.length - sets], [[], [], "local-mode", 0], JSON.stringify(raw));
  }
});

test("PRO-3 legacy local mode: a stored profile entry is ignored", () => {
  const at = "2026-10-02T12:00:00.000Z";
  for (const profile of PROFILES) {
    const entries = [{ type: PROFILE_TYPE, data: { v: 1, profile, by: "command", at } }];
    const lm = start("s-lm-e", { mode: "local" }, entries);
    assert.deepEqual([lm.h.router.profile.current(), lm.written], ["local-mode", []], profile);
    assert.deepEqual(lm.h.lines().filter((l) => l.event === "session").map((l) => [l.profile, l.localMembers, "arms" in l]), [["local-mode", "on", false]], profile);
    assert.equal(lm.h.f.entries.filter((e) => e.type === "task-router/arms").length, 0, "legacy local mode draws no arms");
  }
});

// LF3.T5 (spec PRO-9 a, D81): before 0.5.0 `/profile local-first` needs `localFirst.experimental`; else the notice and no entry.
test("PRO-9", async () => {
  const s = withUi("s-p9", {});
  await s.run("local-first");
  assert.deepEqual(s.notes.at(-1), ["profile local-first is experimental before 0.5.0; set localFirst.experimental", "warning"]);
  assert.deepEqual([s.entries(), s.lines(), s.h.router.profile.current()], [[], [], "cloud-first"]);
});

// LF3.T7 (spec §2.2, PRO-7, S34a): the section, the local tools and the local hooks follow the session's profile. A cloud-first
// default registers the tools at its first switch to local-first (once); back in cloud-first they leave the active set (pi
// cannot unregister a tool) and the hooks of the local install stand still. The legacy local mode keeps its install-time set.
const LOCAL_TOOLS = ["amend_plan", "plan_request", "request_merge", "start_branch"];
function rig7(id: string, raw: Record<string, unknown>, stored: { type: string; data: unknown }[] = []) {
  const g = fakeGit({ repos: [{ root: "/r/x" }] });
  const h = harness({ extra: { settings: parseSettings({ experiments: { cloudOnlyShare: 0 }, ...raw }, "0.4.0").settings, git: g.git } as never });
  h.f.entries.push(...stored);
  const c = { hasUI: true, cwd: "/r/x", ui: { notify: () => {}, setStatus: () => {} },
    sessionManager: { getSessionId: () => id, getBranch: () => h.f.entries.map((e) => ({ type: "custom", customType: e.type, data: e.data })) } };
  h.f.fire("session_start", { reason: "startup" }, c);
  const run = (args: string) => h.f.commands.get("profile")!.handler(args, c);
  const tools = () => LOCAL_TOOLS.filter((t) => h.f.tools.has(t)), active = () => LOCAL_TOOLS.filter((t) => h.f.active.has(t));
  const section = (): unknown => {
    const sections: Record<string, string> = { task_cards: "-" };
    h.f.fire("before_agent_start", { systemPromptOptions: { sections, skills: [] } }, c);
    return sections.task_cards;
  };
  /** The main git guard's blocks of a commit on main (a hook of the local install). */
  const blocks = async () => (await Promise.all(h.f.fire("tool_call", { toolName: "bash", toolCallId: `t${Math.random()}`, input: { command: "git commit -qm x" } }, c)))
    .filter((x) => x !== undefined).length;
  return { h, g, c, run, tools, active, section, blocks };
}

test("PRO-7", async () => {
  const s = rig7("s-p7", { localFirst: { experimental: true } });
  const cards = cardSection(s.h.router.settings, s.h.router.settings.delegation.rule === "on");
  assert.deepEqual([s.tools(), s.section(), await s.blocks()], [[], cards, 0], "cloud-first: no local tools, the card section");
  await s.run("local-first");
  assert.deepEqual([s.tools(), s.active(), await s.blocks()], [LOCAL_TOOLS, LOCAL_TOOLS, 1], "the first switch registers and activates");
  assert.notEqual(s.section(), cards);
  const hooks = s.h.f.hookNames();
  await s.run("cloud-first");
  assert.deepEqual([s.tools(), s.active(), s.section(), await s.blocks()], [LOCAL_TOOLS, [], cards, 0], "back: inactive, the card section");
  assert.ok(s.h.f.activeSets.length > 0, "through setActiveTools");
  await s.run("local-first");
  assert.deepEqual([s.active(), await s.blocks()], [LOCAL_TOOLS, 1]);
  assert.deepEqual(s.h.f.registered.filter((n) => LOCAL_TOOLS.includes(n)).sort(), LOCAL_TOOLS, "registered once");
  assert.deepEqual(s.h.f.hookNames(), hooks, "hooks registered once");
});

test("PRO-7 legacy local mode: the install-time tools and section, no setActiveTools", async () => {
  const s = rig7("s-p7l", { mode: "local" });
  assert.deepEqual([s.tools(), s.active(), s.h.f.activeSets], [LOCAL_TOOLS, LOCAL_TOOLS, []]);
  assert.equal(s.section(), localSection(s.h.router.settings, activeSet(s.h.router.settings)));
  assert.equal(await s.blocks(), 1);
});

// LF3 review E (PRO-7): a tool a cloud-first session registered because its own component is "on" (worktrees, mergeGate) reads the
// plan store and the merge gate's state when it is called, not as they were at its registration: after a switch to local-first
// plans and the gate are active, and `start_branch` and `request_merge` use them.
test("PRO-7 start_branch and request_merge read the plan store and the gate state live", async () => {
  const FILE = "docs/plans/p.md", PLAN = { slug: "p", repo: "/r/x", file: FILE, skeletonHash: "h", approvedBy: "u", triggers: [] };
  const reason = async (s: ReturnType<typeof rig7>, params: unknown) => (await s.h.f.callTool("start_branch", params, s.c) as { content: { text: string }[] }).content[0]!.text;
  // plans: active only in local-first, so a plan-bound start_branch is "not active" before the switch and goes on after it
  const a = rig7("s-e1", { worktrees: { enabled: "on" }, mergeGate: { enabled: "on" }, localFirst: { experimental: true } }, [{ type: "task-router/plan", data: PLAN }]);
  assert.deepEqual(a.tools(), ["request_merge", "start_branch"], "cloud-first, the two components on: their tools only");
  assert.equal(await reason(a, { plan: { slug: "p", id: "M1.T1" } }), "plans are not active");
  await a.run("local-first");
  assert.notEqual(await reason(a, { plan: { slug: "p", id: "M1.T1" } }), "plans are not active", "the plan store is read at the call");
  // request_merge: a branch without a plan that changes an approved plan's file is refused plan-changed (plans active)
  const started = JSON.parse(await reason(a, { slug: "tidy", goal: "tidy up", check: "true", estimate: { kind: "code", lines: 1 } })) as { worktree: string };
  a.g.commit(started.worktree, [{ path: FILE, added: 1, deleted: 0 }]);
  const merged = await a.h.f.callTool("request_merge", {}, a.c) as { details: { status: string; reason?: string } };
  assert.deepEqual([merged.details.status, merged.details.reason], ["refused", "plan-changed"]);
  // the gate: start_branch takes the main tip's baseline after it started a branch while the gate is on, so a move of main after
  // it is a bypass at the next bash result
  const b = rig7("s-e2", { worktrees: { enabled: "on" }, localFirst: { experimental: true } });
  assert.deepEqual(b.tools(), ["start_branch"]);
  await b.run("local-first");
  await reason(b, { slug: "tidy", goal: "tidy up", check: "true", estimate: { kind: "code", lines: 1 } });
  b.g.repos.get("/r/x")!.refs.set("main", "b".repeat(40));
  await Promise.all(b.h.f.fire("tool_call", { toolName: "bash", toolCallId: "t1", input: { command: "true" } }, b.c));
  b.h.f.fire("tool_result", { toolName: "bash", toolCallId: "t1", input: { command: "true" }, content: [{ type: "text", text: "ok" }], isError: false }, b.c);
  await b.h.router.settled();
  assert.deepEqual(b.h.lines().filter((l) => l.event === "gatebypass").map((l) => [l.from, l.to]), [["a".repeat(40), "b".repeat(40)]]);
});

// LF4.T10 (PRO-6): a node keeps the profile it started in. After a switch to cloud-first no new node starts (start_branch and
// split leave the active set), but an open local-first node's request_merge stays and runs the local-first gate: here plans are
// active, so a change of an approved plan's file is refused plan-changed (a cloud-first gate has no plans). Real git.
test("PRO-6", async () => {
  const FILE = "docs/plans/p.md";
  const s = treeRig(LF, (dir) => [{ type: "task-router/plan", data: { slug: "p", repo: dir, file: FILE, skeletonHash: "h", approvedBy: "u", triggers: [] } }]);
  const node = await s.start({ slug: "tidy", goal: "tidy up", check: "true", estimate: { kind: "code", lines: 5 } });
  s.r.commit(FILE, "x\n", "touch the plan", node.details.worktree);
  await s.h.f.commands.get("profile")!.handler("cloud-first", s.ctx);
  assert.equal(s.h.router.profile.current(), "cloud-first");
  assert.deepEqual(["start_branch", "split", "request_merge"].map((t) => s.h.f.active.has(t)), [false, false, true]);
  assert.equal(s.h.router.tree.tree().nodes.tidy!.profile, "local-first");
  const m = await s.call("request_merge", {});
  assert.deepEqual([m.details.status, m.details.reason], ["refused", "plan-changed"]);
});

// Review m1 (PRO-6): after a switch to cloud-first the main's git guard follows the same predicate as request_merge: an open
// local-first node keeps it, so an open parent (and the main branch) stays protected until the last such node closes.
test("PRO-6 guard", async () => {
  const s = treeRig();
  const blocks = async (cwd: string) => (await Promise.all(s.h.f.fire("tool_call", { toolName: "bash", toolCallId: `t${Math.random()}`,
    input: { command: "git commit -qm x" } }, { ...s.ctx, cwd }))).filter((x) => x !== undefined).map((x) => (x as { reason: string }).reason);
  const root = (await s.start({ slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } })).details;
  assert.equal(s.h.router.tree.apply({ op: "split", node: "auth", plan: { summary: "one", children: [
    { slug: "form", goal: "the form", files: ["form.ts"], estimate: { lines: 2, kind: "code" }, check: "true" }] } }), undefined);
  assert.equal((await s.start({ parent: "auth", child: "form" })).isError, undefined);
  await s.h.f.commands.get("profile")!.handler("cloud-first", s.ctx);
  assert.equal(s.h.router.profile.current(), "cloud-first");
  assert.deepEqual(await blocks(root.worktree), [MERGE_REASON("lm/auth")]);
  assert.deepEqual(await blocks(s.r.dir), [MERGE_REASON("main")]);
  // no open local-first node left: cloud-first's own gate (off), the guard with it
  for (const id of ["auth.form", "auth"]) assert.equal(s.h.router.tree.apply({ op: "state", node: id, state: "merged" }), undefined);
  assert.deepEqual(await blocks(s.r.dir), []);
});
