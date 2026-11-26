// Profiles (spec §5.2.3): a card kind names a profile; skills are inlined into the brief.
// The session's routing profile (local-first spec §2.2, PRO-3, D82, S34) lives here too, beside the card-kind profiles.
import { BUILTIN_PROFILES } from "./settings.ts";
import type { RoutingProfile } from "./strategy/types.ts";
import type { Profile, Result, RouterSettings } from "./types.ts";

// The built-ins are defaults: they live in core/settings.ts (MP1) and are re-exported here.
export { BUILTIN_PROFILES };

const BASE: Profile = { tools: "all", skills: [], report: "default" };

/** Settings override a built-in field by field and may add kinds; unknown kind → err listing the known ones. */
export function profileFor(kind: string, s: RouterSettings): Result<Profile> {
  const over = s.profiles[kind] as Partial<Profile> | undefined;
  const builtin = BUILTIN_PROFILES[kind];
  if (!over && !builtin) {
    const known = [...new Set([...Object.keys(BUILTIN_PROFILES), ...Object.keys(s.profiles)])];
    return { ok: false, errors: [`unknown kind "${kind}"; known kinds: ${known.join(", ")}`] };
  }
  const p: Profile = { ...BASE, ...builtin, ...over };
  // An override of the ability brings that ability's table, not the built-in's (spec S1; review G2 m3).
  if (over?.ability !== undefined && over.ability !== builtin?.ability && over.table === undefined) delete p.table;
  return { ok: true, value: p };
}

export type SkillPort = {
  find(name: string): { filePath: string; baseDir: string } | undefined;
  read(path: string): string;
};

export function skillBlocks(names: string[], port: SkillPort): Result<string> {
  const found = names.map((n) => ({ n, s: port.find(n) }));
  const missing = found.filter((f) => !f.s).map((f) => `unknown skill "${f.n}"`);
  if (missing.length) return { ok: false, errors: missing };
  const blocks = found.map(({ n, s }) =>
    `<skill name="${n}" location="${s!.filePath}">\nReferences are relative to ${s!.baseDir}.\n\n${port.read(s!.filePath)}\n</skill>`);
  return { ok: true, value: blocks.join("\n\n") };
}

export const PROFILE_TYPE = "task-router/profile";
export type ProfileBy = "settings" | "command";
export type ProfileEntry = { v: 1; profile: RoutingProfile; by: ProfileBy; at: string };
/** The session's profile: a routing profile, or the legacy local mode (`mode: "local"` without `profile`, until RET-1). */
export type SessionProfile = RoutingProfile | "local-mode";

const fromSettings = (s: RouterSettings): SessionProfile => s.profile ?? (s.mode === "local" ? "local-mode" : "cloud-first");
const isEntry = (e: unknown): e is { data: ProfileEntry } => {
  const x = e as { customType?: unknown; data?: { profile?: unknown } } | null;
  return x?.customType === PROFILE_TYPE && (x.data?.profile === "cloud-first" || x.data?.profile === "local-first");
};

/** S34: `restore` takes the branch's last `task-router/profile` entry (a malformed one counts as absent), none → the settings;
 *  `set` switches and appends the entry. The legacy local mode has no switch (D59): `restore` ignores its entries there. */
export function createRoutingProfile(settings: RouterSettings, append: (type: string, data: unknown) => void, now = () => new Date()) {
  let cur: SessionProfile = fromSettings(settings);
  return {
    current: (): SessionProfile => cur,
    /** true iff an entry decided. */
    restore(branch: readonly unknown[]): boolean {
      const base = fromSettings(settings), last = base === "local-mode" ? undefined : branch.filter(isEntry).at(-1);
      cur = last?.data.profile ?? base;
      return last !== undefined;
    },
    set(p: RoutingProfile, by: ProfileBy): void {
      cur = p;
      append(PROFILE_TYPE, { v: 1, profile: p, by, at: now().toISOString() } satisfies ProfileEntry);
    },
  };
}

export const PROFILE_USAGE = "usage: /profile [cloud-first | local-first]";
export const LOCAL_MODE_REFUSAL = 'task-router: /profile is not available in local mode (mode: "local") before its retirement';
/** S34's `/profile` (PRO-2): none or the current profile → shows it; in the legacy local mode anything else → the refusal; a
 *  routing profile → the switch (`gate` may refuse local-first, PRO-9), then `switched` writes its line and redraws the status line; anything else → the usage. */
export const profileCommand = (store: ReturnType<typeof createRoutingProfile>,
  d: { gate(): string | undefined; switched(from: SessionProfile, to: RoutingProfile, ctx: any): void }) => (args: string, ctx: any): void => {
  const say = (t: string, level: "info" | "warning"): void => { ctx?.ui?.notify?.(t, level); };
  const to = String(args ?? "").trim(), from = store.current();
  if (to === "" || to === from) return say(`task-router profile: ${from}`, "info");
  if (from === "local-mode") return say(LOCAL_MODE_REFUSAL, "warning"); // D59: the legacy local mode keeps its install-time set
  if (to !== "cloud-first" && to !== "local-first") return say(PROFILE_USAGE, "warning");
  const refused = to === "local-first" ? d.gate() : undefined;
  if (refused !== undefined) return say(refused, "warning");
  store.set(to, "command");
  d.switched(from, to, ctx);
};

/** PRO-4 (X43): the user chose the main model. pi 1.4 tells an extension neither choice (`pi.getFlag` answers only its own
 *  flags), so this reads them as pi does: a model flag (`--model`, `--models`) on its command line, or a resumed session it
 *  restores a model for (a message on the branch, and a model change or an assistant message). */
export function userChoseModel(argv: readonly string[], branch: readonly unknown[]): boolean {
  if (argv.some((a) => a === "--model" || a === "--models")) return true;
  const es = branch as ({ type?: unknown; message?: { role?: unknown } } | null)[];
  return es.some((e) => e?.type === "message") && es.some((e) => e?.type === "model_change" || (e?.type === "message" && e.message?.role === "assistant"));
}

export type StartModel = { ref: string; model: unknown } | { notice: string };
/** PRO-4: the start member's model from the registry (total, as `forceinstall.ts`'s finder); unknown → the notice, and pi's
 *  default stays. */
export function startModel(ctx: any, settings: RouterSettings): StartModel {
  const member = settings.localFirst.startMember, ref = settings.models[member]?.model ?? "", cut = ref.indexOf("/");
  let model: unknown;
  try { model = cut > 0 ? ctx?.modelRegistry?.find?.(ref.slice(0, cut), ref.slice(cut + 1)) : undefined; } catch { model = undefined; }
  return model ? { ref, model } : { notice: `task-router: start model ${ref || "(none)"} of member "${member}" not found; the default model stays` };
}

/** Skills inlined into the brief: profile's then the card's, deduplicated, order kept (P-profile). */
export function skillNames(p: Profile, c: { skills?: string[] }): string[] {
  return [...new Set([...p.skills, ...(c.skills ?? [])])];
}
