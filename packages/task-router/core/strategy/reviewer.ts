// The reviewer table (local-first spec REV-1, SIZE-7, design §5.4, plan S39): the stronger of the class's reviewer and the
// actual-size tier's. Strength: none 0 < haiku 1 < sonnet 2 < opus 3. The tier is the ACTUAL changed lines' tier
// (`tierOfLines`), never the session's drawn one. The inert cells are normalised here, not left to the caller (LF6 review M1):
// the class `inert` gets no review at any size (design §5.3, REV-10: S39's small/inert cell is corrected), and a non-inert class
// never reads the actual tier `inert`, which would be a model-declared exemption (MGS §2.1): it is read as small. Pure: no I/O.
import type { Arms, ReviewerChoice, ReviewerName, RiskClass, Tier } from "./types.ts";

type Part = { reviewer: ReviewerName | "none"; binding: boolean; stratum?: "small" | "inert-like" };
const STRENGTH: Record<ReviewerName | "none", number> = { none: 0, haiku: 1, qwen: 1, sonnet: 2, opus: 3 };
const NONE: Part = { reviewer: "none", binding: false };
const OPUS: Part = { reviewer: "opus", binding: true };

/** The reviewer the class asks for: elevated needs Opus; every other class asks for nothing by itself. */
const byClass = (cls: RiskClass): Part => (cls === "elevated" ? OPUS : NONE);

/** The reviewer the actual size asks for. Small: Sonnet binding, or Haiku advisory for an inert-like standard-class change;
 *  standard: the E3 level of the review's arms. */
const byTier = (actual: Tier | "over", advisory: boolean, review: Arms): Part => {
  switch (actual) {
    case "inert": return NONE;
    case "small": return advisory ? { reviewer: "haiku", binding: false, stratum: "inert-like" } : { reviewer: "sonnet", binding: true, stratum: "small" };
    // REV-2: the standard tier is randomized per review (E3, default Opus)
    case "standard": return review.E3 === "sonnet" ? { reviewer: "sonnet", binding: true } : OPUS;
    case "large": case "over": return OPUS;
    default: { const _: never = actual; return _; }
  }
};

export function reviewer(i: { cls: RiskClass; actual: Tier | "over"; inertLike: boolean; review: Arms }): ReviewerChoice {
  const actual = i.cls === "inert" ? "inert" : i.actual === "inert" ? "small" : i.actual;
  const c = byClass(i.cls), t = byTier(actual, i.inertLike && i.cls === "standard", i.review);
  const pick = STRENGTH[c.reviewer] >= STRENGTH[t.reviewer] ? c : t;
  return { reviewer: pick.reviewer, binding: pick.binding, fresh: true, orthogonal: i.cls === "elevated", ...(pick.stratum ? { stratum: pick.stratum } : {}) };
}
