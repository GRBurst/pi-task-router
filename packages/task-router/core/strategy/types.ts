// The strategy seam (local-first design §5.9, D60, plan S31): the mechanism reaches the strategy parts only through
// `Strategy`, composed once in `local-first.ts` (NR-6). A later strategy layer swaps parts without touching the mechanism.
// Types only. The facts a part reads are defined here; each part's task refines its own (`Policy` D89, S40, S42, S43).
/** The session-level routing profile; the card-kind `Profile` (`core/types.ts`) is another type (D82). */
export type RoutingProfile = "cloud-first" | "local-first";
export type Tier = "small" | "standard" | "large" | "inert";
export type RiskClass = "inert" | "standard" | "elevated";
export type NodeKind = "leaf" | "plan" | "integration" | "fix";
export type ReviewerName = "haiku" | "sonnet" | "opus" | "qwen";
/** factorId → level (enabled factors only). */
export type Arms = Readonly<Record<string, string>>;
export interface ReviewerChoice { reviewer: ReviewerName | "none"; binding: boolean; fresh: true; orthogonal: boolean; stratum?: "small" | "inert-like" }
export type ContactKind = "review" | "plan-review" | "integration" | "corrective" | "handoff" | "spot" | "fit";

/** A changed file of a diff (numstat). */
export interface FileFact { path: string; added: number; deleted: number }
/** The classifier's proxies (D89, S38): the policy file at the base commit, else the settings. */
export interface Policy { inertGlobs: string[]; testGlobs: string[]; ciGlobs: string[]; riskGlobs: string[]; configGlobs: string[]; publicApiGlobs: string[]; componentDepth: number }
/** What a node's contact points read (S49, S50). */
export interface NodeFacts { depth: number; kind: NodeKind; children: number; cls: RiskClass }
export type LadderStep = "retry-xhigh" | "split" | "corrective" | "handoff" | "steer" | "stop";
export interface LadderState { effort: "xhigh" | "medium"; taken: readonly LadderStep[]; mergedChildren: number; state: string; depth: number; maxDepth: number; quotaWait: boolean }
/** A child node's breaker counters (S42) and their limits. */
export interface Counters { sameTest: number; diffApply: number; verify: number; turns: number; uncached: number }
export type BreakerLimits = Counters;
export type Trip = "same-test" | "diff-apply" | "verify" | "turns" | "uncached";
export type QuotaWindow = "5h" | "7d";
export interface ActiveWait { provider: string; window: QuotaWindow; resetAt: string }
export interface QuotaView { active: ActiveWait[]; util: ReadonlyMap<QuotaWindow, number>; cloudInFlight: number; quotaWait: boolean }
export interface ContactAsk { kind: ContactKind; open: boolean; cls: RiskClass; t2: boolean }
export type QuotaDecision = "go" | "queue" | "deny" | "wait" | "downgrade";

export interface Strategy {
  sessionTier(a: Arms): Exclude<Tier, "inert">;
  /** Infinity for inert. */
  tierBudget(t: Tier, c: RiskClass): number;
  tierOfLines(lines: number): Exclude<Tier, "inert"> | "over";
  treeCaps(a: Arms): { maxDepth: number; maxChildren: number; planLines: number };
  classify(files: readonly FileFact[], p: Policy): { cls: RiskClass; inertLike: boolean; why: string[] };
  reviewer(i: { cls: RiskClass; actual: Tier | "over"; inertLike: boolean; review: Arms }): ReviewerChoice;
  points(n: NodeFacts, a: Arms): { planReview: boolean; integrationReview: boolean; rounds: number };
  ladder(s: LadderState, a: Arms): LadderStep | "wait";
  breaker(c: Counters, l: BreakerLimits): Trip | undefined;
  quota(q: QuotaView, ask: ContactAsk): QuotaDecision;
  child(a: Arms): { effort: "xhigh" | "medium"; budget?: number; brief: "full" | "lean" };
  context(a: Arms): { childSoft: number; mainSoft: number; mainFold: number; uncached: number };
}
