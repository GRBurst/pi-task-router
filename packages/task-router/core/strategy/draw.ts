// The router's own randomization (local-first spec §6, D61, plan S32): a unit's level of a factor is a pure function of
// the experiments seed, the factor's id and the unit (a session id, a child's name, …), so a replay draws the same arms
// and no state is kept. Pure: no I/O.
import { createHash } from "node:crypto";

const sha256hex = (s: string): string => createHash("sha256").update(s).digest("hex");

/** u ∈ [0, 1): the first 53 bits of sha256(seed ‖ 0 ‖ id ‖ 0 ‖ unit), big-endian, over 2^53 (exact in a number). */
export const draw = (seed: string, id: string, unit: string): number =>
  Number(BigInt("0x" + sha256hex(`${seed}\0${id}\0${unit}`).slice(0, 16)) >> 11n) / 2 ** 53;

/** The level whose share of the weights' cumulative sum first exceeds `u`; the last level if rounding leaves `u` above. */
export const pick = <L extends string>(levels: readonly L[], w: readonly number[], u: number): L => {
  const s = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < levels.length; i++) { acc += w[i]! / s; if (u < acc) return levels[i]!; }
  return levels[levels.length - 1]!;
};
