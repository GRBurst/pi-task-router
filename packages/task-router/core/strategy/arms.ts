// The router's factor registry (local-first spec §2.8, D61–D63, plan S32): each factor's unit, its levels (the default
// first) and the release whose mechanism first runs it. Every factor ships disabled (D63); the owner enables one in
// settings (`experiments.factors.<id>`). E0 is switched by `experiments.cloudOnlyShare`, not by `enabled`. Pure: no I/O.
import type { ExperimentsSettings } from "../types.ts";
import { draw, pick } from "./draw.ts";

export type FactorId =
  | "E0" | "E2" | "E3" | "E12" | "E13" | "E4" | "E5" | "E6" | "E7" | "E8" | "E9" | "E10" | "E11"
  | "E14c" | "E14m" | "E14f" | "E14b" | "E15" | "E16" | "E17" | "E18";
/** What one draw is for: its unit's id is the draw's `unit` (a session id, a node id, a review's session id + node + reviewed
 *  commit, …). A review's unit is not its review id: that is minted per attempt, after the reviewer is chosen (plan decision lf14). */
export type FactorUnit = "session" | "review" | "child" | "request" | "node" | "package" | "ladder";
export interface Factor {
  id: FactorId; unit: FactorUnit; levels: readonly string[]; weights: readonly number[];
  /** The first release whose mechanism runs the factor; enabling it in an earlier one is a settings problem. */
  from: string;
  /** Never enabled by code (D63). */
  enabled: false;
}

/** A registry: today's `FACTORS`, or another release's code defaults (a snapshot keeps those it was taken with, RND-5). */
export type Registry = Readonly<Record<FactorId, Omit<Factor, "enabled"> & { enabled: boolean }>>;

/** Equal weights unless given. */
const factor = (id: FactorId, unit: FactorUnit, levels: readonly string[], from: string, weights?: readonly number[]): Factor =>
  ({ id, unit, levels, weights: weights ?? levels.map(() => 1), from, enabled: false });

export const FACTORS: Readonly<Record<FactorId, Factor>> = {
  // E0's weights come from `cloudOnlyShare` ([1 − s, s], `effective`); these [0.9, 0.1] are unused placeholders (they mirror
  // the default share 0.1, D64). A reader of FACTORS takes E0's weights from the share, never from here (docs/outcome-log.md).
  E0: factor("E0", "session", ["as-used", "cloud-only"], "0.3.0", [0.9, 0.1]),
  E2: factor("E2", "session", ["standard", "small", "large"], "0.4.0"),
  E3: factor("E3", "review", ["opus", "sonnet"], "0.4.0"),
  E12: factor("E12", "child", ["xhigh", "medium"], "0.5.0"),
  E13: factor("E13", "child", ["unbounded", "16k", "32k"], "0.5.0"),
  E4: factor("E4", "session", ["off", "on"], "0.6.0"),
  E5: factor("E5", "session", ["150", "300"], "0.6.0"),
  E6: factor("E6", "request", ["recursive", "flat"], "0.7.0"),
  E7: factor("E7", "request", ["on", "off"], "0.7.0"),
  E8: factor("E8", "node", ["on", "off"], "0.7.0"),
  E9: factor("E9", "request", ["on", "off"], "0.7.0"),
  E10: factor("E10", "package", ["2", "1"], "0.7.0"),
  E11: factor("E11", "ladder", ["corrective-handoff", "corrective", "steer"], "0.8.0"),
  E14c: factor("E14c", "session", ["64k", "32k"], "0.8.0"),
  E14m: factor("E14m", "session", ["96k", "64k"], "0.8.0"),
  E14f: factor("E14f", "session", ["200k", "150k"], "0.8.0"),
  E14b: factor("E14b", "session", ["64k", "32k"], "0.8.0"),
  E15: factor("E15", "session", ["5x150", "3x80"], "0.8.0"),
  E16: factor("E16", "request", ["local", "opus"], "0.8.0"),
  E17: factor("E17", "review", ["cloud", "qwen"], "0.8.0"),
  E18: factor("E18", "child", ["full", "lean"], "0.8.0"),
};

/** A snapshot's factor (spec §2.2): its effective switch, the levels the session took (the first is its default) and its
 *  weights. Settings have no levels; an absent `levels` reads the registry's (the release that draws). */
export type SnapshotFactor = { enabled?: boolean; levels?: readonly string[]; weights?: readonly number[] };
/** What a draw reads: the session's snapshot (spec §2.2) or settings of the same shape. */
export type ExperimentsSnapshot = Omit<ExperimentsSettings, "factors"> & { factors: Record<string, SnapshotFactor> };

/** A factor's effective switch and weights: the snapshot's, else the registry's; E0's from its share s: on while s > 0,
 *  weights [1 − s, s] (spec §2.8). */
export const effective = (x: ExperimentsSnapshot, id: FactorId, reg: Registry = FACTORS): { enabled: boolean; weights: readonly number[] } =>
  id === "E0" ? { enabled: x.cloudOnlyShare > 0, weights: [1 - x.cloudOnlyShare, x.cloudOnlyShare] }
  : { enabled: x.factors[id]?.enabled ?? reg[id].enabled, weights: x.factors[id]?.weights ?? reg[id].weights };

/** A factor's levels as the snapshot took them, else the registry's (RND-5: a moved first level does not move a session's arms). */
const levelsOf = (x: ExperimentsSnapshot, id: FactorId, reg: Registry): readonly string[] => x.factors[id]?.levels ?? reg[id].levels;

/** A unit's level of a factor (D61): drawn while the factor is enabled, else its default (the first level, RND-4). */
export const assign = (x: ExperimentsSnapshot, id: FactorId, unit: string, reg: Registry = FACTORS): string => {
  const levels = levelsOf(x, id, reg), e = effective(x, id, reg);
  return e.enabled ? pick(levels, e.weights, draw(x.seed, id, unit)) : levels[0]!;
};

/** A unit's arms (spec §2.4 `arms`): `id=level` of every enabled factor of its kind, sorted; a disabled factor is absent.
 *  E0 is not among them: only an eligible cloud-first session draws it (D93), and the shell adds its arm. */
export const armsOf = (x: ExperimentsSnapshot, kind: FactorUnit, unit: string, reg: Registry = FACTORS): string[] =>
  Object.values(reg).filter((f) => f.id !== "E0" && f.unit === kind && effective(x, f.id, reg).enabled).map((f) => `${f.id}=${assign(x, f.id, unit, reg)}`).sort();
