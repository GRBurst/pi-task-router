// Local-first plan LF3.T6 (spec §2.2, PRO-4, PRO-5, LOC-2's main): a local-first main session's start sets the start
// member's model, with xhigh, unless the user chose one: a model flag on pi's command line, or a resumed session pi restores a
// model for. pi 1.4 tells an extension neither (X43: `pi.getFlag` answers only an extension's own flags), so the router reads
// the command line and the branch as pi does. Afterwards the router never sets the model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness.ts";
import { seeded } from "./rand.ts";
import { parseSettings } from "../core/settings.ts";

const XP = { profile: "local-first", localFirst: { experimental: true } };
const START = { provider: "llama", id: "qwen3.8" }; // the default `qwen-local` member's model
type Entry = Record<string, unknown>;
/** pi writes a model change into every new session before session_start (pi 1.4 `createAgentSession`). */
const NEW: Entry[] = [{ type: "model_change", provider: "anthropic", modelId: "claude-sonnet" }];
const RESUMED: Entry[] = [...NEW, { type: "message", message: { role: "user" } },
  { type: "message", message: { role: "assistant", provider: "anthropic", model: "claude-sonnet" } }];

/** One process of session `id`: `raw` settings, pi's command line `argv`, a registry that knows `known`. */
function proc(raw: Record<string, unknown>, o: { argv?: string[]; known?: boolean; id?: string } = {}) {
  const h = harness({ extra: { settings: parseSettings({ experiments: { cloudOnlyShare: 0 }, ...raw }, "0.4.0").settings,
    argv: o.argv ?? ["node", "pi"] } as never });
  const set: unknown[] = [], notes: string[] = [];
  (h.f.pi as Record<string, unknown>).setModel = async (m: unknown) => { set.push(m); return true; };
  const ctx = (branch: Entry[]) => ({
    hasUI: true, model: { provider: "anthropic", id: "claude-sonnet" },
    ui: { notify: (t: string) => notes.push(t), setStatus: () => {} },
    modelRegistry: { find: (p: string, id: string) => (o.known !== false && p === START.provider && id === START.id ? { ...START } : undefined) },
    sessionManager: { getSessionId: () => o.id ?? "s-1", getBranch: () => branch },
  });
  const begin = (reason: string, branch: Entry[]) => Promise.all(h.f.fire("session_start", { reason }, ctx(branch)));
  const session = () => h.lines().filter((l) => l.event === "session");
  return { h, set, notes, ctx, begin, session };
}

test("PRO-4 none: no model flag, a new session → the start member's model and xhigh", async () => {
  const p = proc(XP);
  await p.begin("startup", NEW);
  assert.deepEqual(p.set, [START]);
  assert.deepEqual(p.h.f.thinking.sets, ["xhigh"]);
  assert.deepEqual(p.notes, []);
  assert.deepEqual(p.session().map((l) => [l.profile, l.mainModel, l.startSet]), [["local-first", "llama/qwen3.8", true]]);
});

test("PRO-4 flag: --model or --models on pi's command line → neither", async () => {
  for (const flag of ["--model", "--models"]) {
    const p = proc(XP, { argv: ["node", "pi", flag, "sonnet"] });
    await p.begin("startup", NEW);
    assert.deepEqual(p.set, [], flag);
    assert.deepEqual(p.h.f.thinking.sets, [], flag);
    assert.deepEqual(p.session().map((l) => [l.mainModel, l.startSet]), [["anthropic/claude-sonnet", false]], flag);
  }
});

test("PRO-4 resumed: a resumed session with a model → neither", async () => {
  const p = proc(XP);
  await p.begin("resume", RESUMED);
  assert.deepEqual(p.set, []);
  assert.deepEqual(p.h.f.thinking.sets, []);
  assert.deepEqual(p.session().map((l) => l.startSet), [false]);
});

test("PRO-4 none, unknown model: one notice, the default model stays", async () => {
  const p = proc(XP, { known: false });
  await p.begin("startup", NEW);
  assert.deepEqual(p.set, []);
  assert.deepEqual(p.h.f.thinking.sets, []);
  assert.equal(p.notes.length, 1);
  assert.ok(p.notes[0]!.startsWith("task-router: start model llama/qwen3.8"), p.notes[0]);
  assert.deepEqual(p.session().map((l) => [l.mainModel, l.startSet]), [["anthropic/claude-sonnet", false]]);
});

const SETTINGS = [XP, XP, {}, { mode: "local" }, { profile: "local-first" }];
const EVENTS = ["model_select", "turn_start", "turn_end", "switch", "spawn", "before_agent_start", "reload", "message_end"] as const;

test("PRO-5", async () => {
  const rnd = seeded(305);
  let starts = 0;
  for (let i = 0; i < 150; i++) {
    const raw = SETTINGS[rnd(SETTINGS.length)]!;
    const flag = rnd(4) === 0, resumed = rnd(4) === 0;
    const p = proc(raw, { argv: flag ? ["node", "pi", "--model", "x"] : ["node", "pi"], id: `s-${i}` });
    let phase = "none";
    const calls: string[] = [];
    const real = (p.h.f.pi as Record<string, any>).setModel;
    (p.h.f.pi as Record<string, unknown>).setModel = (m: unknown) => { calls.push(phase); return real(m); };
    const branch = resumed ? RESUMED : NEW;
    const fire = async (name: string, e: unknown) => { phase = name; await Promise.all(p.h.f.fire(name, e, p.ctx(branch))); phase = "none"; };
    await fire("session_start", { reason: resumed ? "resume" : "startup" });
    for (let n = 1 + rnd(12); n > 0; n--) {
      const k = EVENTS[rnd(EVENTS.length)]!;
      if (k === "switch") await p.h.f.commands.get("profile")!.handler(rnd(2) ? "local-first" : "cloud-first", p.ctx(branch));
      else if (k === "spawn") await Promise.resolve(p.h.a.spawn({ name: `c${n}`, task: "do a thing" })).catch(() => undefined);
      else if (k === "reload") await fire("session_start", { reason: "reload" });
      else if (k === "model_select") await fire(k, { model: { provider: "anthropic", id: "claude-opus" }, source: "set" });
      else await fire(k, { systemPromptOptions: {} });
    }
    const want = raw === XP && !flag && !resumed ? 1 : 0;
    starts += want;
    assert.deepEqual(calls, want ? ["session_start"] : [], JSON.stringify({ raw, flag, resumed }));
    assert.ok(p.h.f.thinking.sets.filter((l) => l === "xhigh").length <= want, JSON.stringify(p.h.f.thinking.sets));
  }
  assert.ok(starts > 15, `the start model was set in ${starts} of 150`);
});
