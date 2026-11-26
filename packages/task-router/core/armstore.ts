// The session's experiments snapshot (local-first spec §2.2, RND-5, D61): the effective experiments settings, written
// once as `task-router/arms` at the session's first session_start and restored at every later one, so a resume, a
// settings edit or a release that changes a code default (or moves a factor's first level) never changes a draw of the
// session. Each factor carries its levels as well as its weights: the weights are positional.
import { FACTORS, armsOf, assign, effective } from "./strategy/arms.ts";
import type { ExperimentsSnapshot, FactorId, FactorUnit, Registry } from "./strategy/arms.ts";
import type { ExperimentsSettings } from "./types.ts";

export const ARMS_TYPE = "task-router/arms";
/** The entry's payload: the snapshot, the router that took it and the session's own draws (`{[factorId]: level}`, E0 aside:
 *  the shell draws E0 only in an eligible session, D93, and its arm is the session line's). */
export type ArmsEntry = { v: 1; sessionId: string; experiments: ExperimentsSnapshot; routerVersion: string; arms: Record<string, string> };

const isObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === "object" && !Array.isArray(v);
const isWeights = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every((w) => typeof w === "number" && w >= 0 && w < Infinity) && v.some((w) => w > 0);
/** A restorable snapshot: every field of the entry's shape present and well-formed (a malformed one counts as absent). */
const restorable = (x: unknown): x is ExperimentsSnapshot => {
  if (!isObj(x) || typeof x.seed !== "string" || typeof x.cloudOnlyShare !== "number" || !(x.cloudOnlyShare >= 0 && x.cloudOnlyShare <= 1)) return false;
  if (!isObj(x.factors)) return false;
  return Object.values(x.factors).every((f) => isObj(f) && typeof f.enabled === "boolean" && Array.isArray(f.levels) && f.levels.length > 0
    && f.levels.every((l: unknown) => typeof l === "string") && isWeights(f.weights, f.levels.length));
};
/** This session's entry on the branch (a forked session's copy of another session's entry is not its own). */
const ownEntry = (branch: readonly unknown[], sessionId: string): ArmsEntry | undefined =>
  branch.map((e) => (isObj(e) && e.customType === ARMS_TYPE ? e.data : undefined)).find((d): d is ArmsEntry =>
    isObj(d) && d.sessionId === sessionId && restorable(d.experiments));

export function createArmStore(append: (type: string, data: unknown) => void, factors: Registry = FACTORS) {
  let snap: ExperimentsSnapshot | undefined;
  return {
    /** At every session_start: restore the session's snapshot, or take it from the settings and the registry (once).
     *  No session id (a child, or none: D93) → no snapshot, nothing drawn. */
    start(sessionId: string | undefined, branch: readonly unknown[], settings: ExperimentsSettings, routerVersion: string): void {
      snap = sessionId ? ownEntry(branch, sessionId)?.experiments : undefined;
      if (snap || !sessionId) return;
      const ids = Object.keys(factors) as FactorId[];
      const x: ExperimentsSnapshot = { seed: settings.seed, cloudOnlyShare: settings.cloudOnlyShare, factors: Object.fromEntries(ids.map((id) => {
        const e = effective(settings, id, factors);
        return [id, { enabled: e.enabled, levels: [...factors[id].levels], weights: [...e.weights] }];
      })) };
      snap = x;
      // the session's factor draws; E0's is the session line's (drawn only in an eligible session, D93)
      const own = ids.filter((id) => id !== "E0" && factors[id].unit === "session" && x.factors[id]!.enabled).map((id) => [id, assign(x, id, sessionId, factors)]);
      append(ARMS_TYPE, { v: 1, sessionId, experiments: x, routerVersion, arms: Object.fromEntries(own) } satisfies ArmsEntry);
    },
    /** The session's snapshot; undefined before its session_start. */
    snapshot: (): ExperimentsSnapshot | undefined => snap,
    /** A unit's arms (`id=level` of its kind's enabled factors, sorted); none before the session_start. */
    armsFor: (kind: FactorUnit, unit: string): string[] => (snap ? armsOf(snap, kind, unit, factors) : []),
  };
}
