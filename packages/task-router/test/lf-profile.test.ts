// Local-first plan LF3.T3 (spec §2.2, PRO-3, S34, D82): the session's routing profile lives in `task-router/profile` entries.
// Restored = the last entry's profile; none → the settings (`profile`, else the legacy `mode: "local"` → `local-mode`, else
// cloud-first). The first local-first session_start writes the settings' entry; an armed (local-first) session's lines
// carry `arms` (RND-6, the log's `armed()` port).
import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness.ts";
import { seeded } from "./rand.ts";
import { PROFILE_TYPE, createRoutingProfile } from "../core/profile.ts";
import { parseSettings } from "../core/settings.ts";

const PROFILES = ["cloud-first", "local-first"] as const;
const SETTINGS: [Record<string, unknown>, string][] = [
  [{}, "cloud-first"], [{ mode: "local" }, "local-mode"], [{ profile: "cloud-first" }, "cloud-first"],
  [{ profile: "local-first", localFirst: { experimental: true } }, "local-first"], [{ profile: "local-first" }, "cloud-first"],
];
type Branch = { type: string; customType?: string; data?: unknown }[];

test("PRO-3", () => {
  const rnd = seeded(303);
  let restored = 0;
  for (let i = 0; i < 400; i++) {
    const [raw, fromSettings] = SETTINGS[rnd(SETTINGS.length)]!;
    const branch: Branch = [];
    let want = fromSettings;
    for (let n = rnd(7); n > 0; n--) {
      const k = rnd(6);
      if (k <= 2) { // a profile entry
        const p = PROFILES[rnd(2)]!;
        branch.push({ type: "custom", customType: PROFILE_TYPE, data: { v: 1, profile: p, by: rnd(2) ? "command" : "settings", at: "2026-10-02T12:00:00.000Z" } });
        want = p;
      } else if (k === 3) branch.push({ type: "custom", customType: PROFILE_TYPE, data: rnd(2) ? { v: 1, profile: "local-mode", by: "command" } : null }); // malformed: absent
      else if (k === 4) branch.push({ type: "custom", customType: "task-router/arms", data: { profile: "local-first" } });
      else branch.push({ type: "message" });
    }
    if (want !== fromSettings) restored++;
    const written: unknown[] = [];
    const store = createRoutingProfile(parseSettings(raw, "0.4.0").settings, (type, data) => written.push({ type, data }));
    store.restore(branch);
    assert.equal(store.current(), want, JSON.stringify({ raw, branch }));
    assert.deepEqual(written, [], "restore writes nothing");
  }
  assert.ok(restored > 50, `entries decide in ${restored} of 400`);
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
  // a resume with cloud-first settings keeps the entry's profile and writes nothing
  const resumed = start("s-lf", {}, first.h.f.entries);
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
function withUi(id: string, raw: Record<string, unknown>) {
  const h = harness({ extra: { settings: parseSettings({ experiments: { cloudOnlyShare: 0 }, ...raw }, "0.4.0").settings } as never });
  const notes: [string, string][] = [], status = new Map<string, string | undefined>();
  const c = {
    hasUI: true, ui: { notify: (t: string, l: string) => void notes.push([t, l]), setStatus: (k: string, v: string | undefined) => void status.set(k, v) },
    sessionManager: { getSessionId: () => id, getBranch: () => h.f.entries.map((e) => ({ type: "custom", customType: e.type, data: e.data })) },
  };
  h.f.fire("session_start", { reason: "startup" }, c);
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

// LF3.T5 (spec PRO-9 a, D81): before 0.5.0 `/profile local-first` needs `localFirst.experimental`; else the notice and no entry.
test("PRO-9", async () => {
  const s = withUi("s-p9", {});
  await s.run("local-first");
  assert.deepEqual(s.notes.at(-1), ["profile local-first is experimental before 0.5.0; set localFirst.experimental", "warning"]);
  assert.deepEqual([s.entries(), s.lines(), s.h.router.profile.current()], [[], [], "cloud-first"]);
});
