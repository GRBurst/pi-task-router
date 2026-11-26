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
  assert.deepEqual(session.map((l) => [l.profile, l.localMembers, l.arms]), [["local-first", "on", []]], "MEAS-1: no E0 draw in local-first");
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
function rig7(id: string, raw: Record<string, unknown>) {
  const g = fakeGit({ repos: [{ root: "/r/x" }] });
  const h = harness({ extra: { settings: parseSettings({ experiments: { cloudOnlyShare: 0 }, ...raw }, "0.4.0").settings, git: g.git } as never });
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
  return { h, run, tools, active, section, blocks };
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
