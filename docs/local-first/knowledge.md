# Local-first: what we already know (synthesis, 2026-11-13)

Input to `docs/local-first/design.md` (`[K n.m]` there is row n.m here). Every
row: claim, source, confidence, implication. ⚡ = research and our own data (or
two sources) disagree.

History: written as pi-economics' working note `local-first-knowledge.md`
(2026-11-13) and moved here with design revision 3. References are
repository-relative. New in this copy: rows 1.10, 2.13–2.14, 6.9–6.13 and 7.7;
updated: 2.8 and 6.1 (measured before llama-server's `cache-ram`), 6.3, 6.4
and §9 (the owner's serving facts, the quota-waiter scout, pi 1.4's budget
field, llama.cpp's per-request budget); r4 changed rows 2.13 and 6.12 and §9 (router reads quota headers; budget support verified from the build, not live).

## 0. Sources, weights, method

Weight order: our measurements [M] and the audit [A] > our findings [F] >
repository docs [D] > research reports [R] (directional; numbers unreliable,
some invented: `research/README.md` §Known problems, F-plan §4).

| Key | File |
|---|---|
| F-plan / F-route | `docs/research/findings-plan-authorship.md`, `docs/research/findings-routing-orchestration-oversight.md` |
| R1 / R2 / R3 | `docs/research/two-tier-agent-planning-architecture.md`, `docs/research/agentic-plan-and-code-sizing.md`, `docs/research/frontier-model-plan-review-protocol.md` |
| R-orch / R-over / R-route | `docs/research/local-model-coding-orchestration-research.md`, `docs/research/strong-model-oversight-for-agents.md`, `docs/research/llm-routing-for-coding-agents.md` |
| R-loop / R-merge | `docs/research/coding-agent-loop-harness-research.md`, `docs/research/autonomous-merge-pipeline-size-limits.md` |
| R-econ / R-acre / R-risk / R-var | batch 4, prompts 9, 11, 10, 12: `docs/research/llm-code-review-economics.md`, `docs/research/autonomous-code-review-economics.md`, `docs/research/code-review-risk-classification.md`, `docs/research/llm-code-review-structural-variants.md` † |
| R-harness / R-loops / R-team | batch 4: `docs/research/local-agent-harness-architecture.md`, `docs/research/local-llm-agent-loops.md`, `docs/research/qwen-multi-agent-benchmark.md` † |
| LM-design / LM-lim / MGS | `docs/local-mode/design.md`, `docs/local-mode/limitations.md`, `docs/local-mode/merge-gate-sizing.md` |
| PL13 / PL48 / TR / OL | `docs/local-mode/plan-L1-L3.md`, `docs/local-mode/plan-L4-L8.md`, `docs/task-router.md`, `docs/outcome-log.md` |
| TODO | the author's router backlog (kept outside this repository) |
| MA / A | pi-economics `docs/meter-analysis-2026-11-12.md`; the audit of that analysis (the author's working notes, in no repository) |
| Dec | the owner's decisions of 2026-11-12/13 (kept with the author's configuration); those local-first rests on are recorded in `design.md` §11 |
| QW | the quota-waiter scout (the author's working notes, 2026-11-13): a public rate-limit-retry extension (MIT) read against pi 1.4 |
| SRV | the owner's llama-server preset file (2026-11-13, "not 100% up to date") and pi's `<agentDir>/models.json` |
| PI | pi 1.4's own docs: `docs/models-configuration.md`, `docs/settings.md`, `docs/extensions.md` |
| LC | llama.cpp `tools/server/server-common.cpp` at 0fcb376 (lines 1107–1119), quoted in ggml-org/llama.cpp discussion #21445 |

† Batch 4 is cleaned on branch `research-cleanup` (421e87a) and reaches
`main` with it; until then these paths do not exist on this branch. Sections
(§) follow the reports' headings.

[M] method: `node` over `<agentDir>/meter/2026-1{0,1}.jsonl` (v1; `kind:"turn"`,
`status:200`), sessions joined to router outcome `spawn` events by `sessionId`
(class = `ticket` role, `reviewOf` → spot-check, else card `kind`). "First
request" = first successful request of a child session. $ = API-equivalent.
Confidence: **H** measured/arithmetic/verified source; **M** consistent across
sources or our data with small n; **L** one report, vendor/blog, or numbers
that look invented.

## 1. Task guidance and package sizing for local agents

| # | Claim | Source | Conf | Implication |
|---|---|---|---|---|
| 1.1 | Guidance works only when structural: rules in AGENTS.md-type text decay within 3–5 turns; advisory notes do not move small models; adherence comes from plan structure (bounded tasks, `forbidden_actions`, check command), not authorship | R-loops §Deterministic Runtime Interception; R-loop §Behavioral Adherence; R-over §Governance; F-plan §1 (R1) | M | Put the package contract into the card/plan fields and enforce it in the harness; prose alone will not hold |
| 1.2 | Our local section has no sizing guidance; size reaches Qwen only via the over-size hint (100 lines/3 files) and refusal texts after the fact | PL13 S4, PL48 S25; TR §Hints | H | The owner's "clear guidance from the start" is unmet today; first fix |
| 1.3 | Starting sizes: task 1–2 files, ≤60 net LOC, split >100 LOC/>3 files, ≤8 turns (cap 10–12), ctx ≤16k target/≤32k cap; milestone 3–5 tasks, ≤250 LOC, 2–4 files | F-plan §3; R2 §Task Granularity; built as `plans` defaults LM-design §3.0.1 | M (direction) / L (numbers) | Keep as starting values; tune by class (§3) |
| 1.4 | Executor success falls with files and lines (SWE-Bench Mobile 18%→2% from 1–2 to 7+ files; single-file <5-line 48% vs multi-file <20%) | R2 §Task Granularity; R-merge §1 | M | Small packages help the executor as well as the reviewer |
| 1.5 | ⚡ Our pilot: Qwen xhigh passed 13–14-file *mechanical* changes and failed long-horizon cross-module work (peak ≥200k ctx); the limiter was horizon, not file count. Research: "4+ files → escalate", "effective ctx ~32k" | TR `t0Limits` (T0.3 pilot); vs R-orch §Horizon Limits | M (n small) | Size by work kind: breadth is fine for mechanical edits; coupled logic stays small; cap turns/context, not only files |
| 1.6 | ⚡ One size cap blocked real work on 11-11: docs 1148 lines/8 files, CI migration 13299/136, plan milestone 291/2 refused for size; research recommends *tighter* caps (120/3) | Outcome log 11-11 [M]; A #33; MGS §1; R-merge §6 | H (events) | Cap by class: inert bulk must not hit the code cap (MGS §2.1) |
| 1.7 | Each merge pays a fixed cost F (checks, red run, cold review prefill); total = n·F + v·W, so splitting strictly raises total review cost (2×150 = 1.92×, 6×50 = 5.62× nominal) while raising recall per review | MGS §1; R-econ §1–2 | H (arithmetic) / L (recall gain for Opus) | Risk-conditional granularity: low-risk batch up to the cap, high-risk split to ~50 LOC (R-econ §5; TODO) |
| 1.8 | Fresh executor session per task, reading only its plan section; external memory (`PLAN.md`, `TASK_STATE.md`); multi-turn conversations lose ~39% | R2 §Filesystem State; R-loops §State Persistence; R-acre §1 (Laban et al.) | M | Package = fresh local child or fresh branch context, not one long main conversation |
| 1.9 | Local autonomy limit ~20–30 min per run; package tiers T1 (1 file, <16k) local, T2 (2–4 coupled files) validate per file, T3 (cross-cutting >64k) cloud decomposes | R-loops §Practical Autonomy Limit, §Work Package table | L | Time/turn budget per package as a breaker input |
| 1.10 | The router already measures size deterministically: after each successful `edit`/`write` inside the active worktree, `git diff --numstat` against the branch's base (committed, staged, unstaged, untracked; 5 s timeout, a failure = no trip) → `over-size` hint at 100 % of the branch's budget. Main session only; children get `identical-call`/`alternation` trips only | `packages/task-router/core/local/install.ts:365–380`, `core/local/tripwires.ts:170–181` (`sizeBudget`, `overSize`), `core/local/hints.ts:14`, `core/local/childtrips.ts`; Dec (fact) | H | The size sidecar the owner asked for exists; extend it (80 % stage, tiers, children, crossing log) rather than build a new one |

## 2. Contact points and their cost

Contact = one cloud agent session started for a local package (Dec: merge-gate
review, spot-check, cloud plan, escalation). Owner premise: each contact is a
cold-cache prefill, so do not overdo them (Dec, round 1).

| # | Claim | Source | Conf | Implication |
|---|---|---|---|---|
| 2.1 | First request of a cloud child reuses no cache: median `cacheRead` 0 (sometimes a shared 5.7k prefix); `cacheWrite` median 24k Opus (p90 39k), 19k Sonnet, 16k Haiku; first-request $ median 0.13 Opus, 0.05 Sonnet, 0.002 Haiku (Oct–Nov, n = 489/239/48) | [M] | H | The owner's premise holds: every contact pays a 16–40k-token cold write, ≈ $0.05–0.19 |
| 2.2 | For *open-ended agent* contacts that floor is small: Opus implement median 140 requests/$8.00, review child 56/$4.03, spot-check review 69/$4.58, plan child 71/$5.92, Sonnet review 38/$1.02; first request = 1–6% of the session | [M] | H | What makes a contact expensive is that the cloud agent explores, not the cold prefill |
| 2.3 | For *bounded* contacts it dominates: Opus merge overseer median 7 requests/$0.27, first request 33%; plan-review 4/$0.17, 62% (n = 9, 1) | [M]; A #28 (mean $0.29, 12–126 s) | M (n=9) | Bounded reviews are ~15× cheaper than review children (MA: $3.27–3.98 per accepted review child); here the contact count matters |
| 2.4 | ⚡ Research: fixed cost = 73–96% of a 150-line review (6.5k fixed prompt, 8 tok/LOC). Ours: the cold first request is 33% of a merge review; the rest is the overseer reading with tools | R-econ §1, R-var premise; vs [M] | M | Fixed cost dominates in both, but a bounded payload (triad + no tool reads) is the larger lever than fewer contacts |
| 2.5 | In quota, cache writes weigh ~1.3–1.65× their $, reads ~0.5–0.7×; 1 q5h point ≈ $1.05, 1 q7d point ≈ $10 | A §3 | M (collinear fit) | Bounded contact ≈ 0.3–0.4 q5h points; Opus agent contact ≈ 2–8 (read-heavy, so below its $); cold prefills cost more quota than $ suggests |
| 2.6 | Cache rules: write 1.25× (5-min TTL) / read 0.1×; min prefix 1024 (2048 Haiku); TTL refreshes on reads; Opus break-even 1.26 calls; ephemeral review sessions with a byte-stable static prefix beat a persistent reviewer | R-econ §4; R-acre §5 | M | A stable reviewer prefix (cache_control, TODO) saves only on bursts <5 min apart; low priority |
| 2.7 | Cold resume premium ≈ $0.81 per re-cold event (gap p50 45 min) | A #6 | H | A contact that resumes an idle cloud session after >5 min costs the same as a new one: prefer new bounded contacts to long-lived cloud sessions |
| 2.8 | Cloud contacts do not touch the local slot; local children do: 394 of 407 local main requests with >20k uncached input follow another session's request (53.5M of 54.5M tokens); local child first request ≈ 10.7k uncached. **Pre-cache-ram**: measured before llama-server got `cache-ram` (a very recent change, 6.9) | [M] (re-checked); SRV | H (for the old server) / unknown (now) | Two budgets: cloud contacts cost quota; local children cost the main a re-prefill (minutes) — until re-measured after the change (§9) |
| 2.9 | Spot-checks as built give zero information: 55/55 review verdicts accepted, the parent judges its own review child; only 21 of 55 drawn; an Opus spot-check review costs median $4.58 | A #26 (B7); [M] | H | Redesign spot-checks before using them as a contact point |
| 2.10 | Vendor results: one read-only terminal advisor review lifts an open worker 59→66%; adding a *planning* advisor call doubled cost without gain | R-orch §Empirical Studies (Fireworks); F-route | L | Terminal review is the contact with the best evidence; extra contacts need their own evidence |
| 2.11 | Opus is the quota sink regardless of main: Opus 63–96% of child requests; main $ 266→63/week while the child share rose to 88%. Mains mixing local and cloud: by majority-local definition 15 mains (Oct–Nov) had 40 Opus children/$140; by any-local-request 19 mains had 176/$840 | A §4; [M] | H (direction) | Local-first saves only if Opus *agent* contacts become bounded contacts; the draft's 57/$255 figure is definition-dependent |
| 2.12 | 5h lockouts (~16) happened at q7d as low as 14%: burst parallelism, not weekly volume, drives them; every completed 7d window still ended at 90–99% | A §3 | H | Quota-aware routing needs a concurrency cap on cloud contacts, not only thresholds |
| 2.13 | A public rate-limit-retry extension waits until the quota resets after a rate-limit failure (reset time from the subscription usage endpoint, not from headers or error text) and resumes through pi's native retry or `agent_before_settle`; it works on pi 1.4, but every session probes and waits on its own (N sessions = N probes and N retries at the reset), it writes no meter lines, does not resume after a process exit and is silent outside the TUI. The exact text of a 5h-exhausted error is unconfirmed: the meter keeps only `errorClass` | QW | H (code read) / unknown (error text) | The owner's quota-wait extension (own repository, provided through pi-setup) takes this mechanism with one coordinator per process and metered events; the router reads the rate-limit headers itself (Dec, r4) and quota-wait's events complement them; it keeps no quota thresholds as the main mechanism |
| 2.14 | pi-retry is dropped (owner): it served a free cloud Qwen tier that no longer exists; pi's native retry handles transient errors. The router's `core/freecap.ts` (an OpenRouter free-tier daily cap) is then likely dead; LM-lim's "a transient 429 that pi-retry would recover" becomes pi's native retry | Dec; `packages/task-router/core/freecap.ts`; LM-lim §Open defects | H | No pi-retry conflict for quota-wait; freecap goes to the router backlog |

## 3. Risk/complexity-tiered review (who reviews what)

| # | Claim | Source | Conf | Implication |
|---|---|---|---|---|
| 3.1 | Classify deterministically from the diff (paths, `--numstat`, added lines, files, dirs, entropy, intent fix/revert); rules beat learned models below ~500 labels/class (LApredict beat DeepJIT/CC2Vec) | R-risk §2–3 | M (peer-reviewed for defect prediction, not LLM review) | Router-side classifier, no model call |
| 3.2 | Inert = lockfiles, generated, pure prose (not gate config), whitespace/comment, pure rename → no LLM review; config is NOT inert (70–85% misconfigs are parameter errors); `AGENTS.md`, `.pi/`, skills, plan files not inert; weakened tests elevate | R-risk §4–5; MGS §2.1 (`inertGlobs`, ≥1 `extraChecks` required); TODO | M | Inert class with hedges: globs pinned to base branch, fail closed, 5–10% audit sample to standard |
| 3.3 | Standard = one diff-scoped single pass, logic not style, triad input (spec + check output + diff); one reviewer suffices (Google) | R-risk §5; R2 §Goal-Conditioned Review; R-acre §6 | M | One bounded contact per standard package |
| 3.4 | ⚡ Reviewer tier for standard: R-merge §4 Haiku ≤50 lines advisory / Sonnet 50–120 blocking / Opus high blast radius; R-acre §6 Opus medium single pass; Haiku F1 0.365 ≥ Sonnet 0.343 (Sonnet over-conservative), cheap tier fine when grounded with static tools. Ours: only Opus has reviewed merges | R-merge §4; R-acre §6; R-econ §2; R-var §2; [D] LM-design §3.2 | L | Open question for an experiment, not a belief: Sonnet vs Opus on standard |
| 3.5 | Elevated = auth, crypto, billing, concurrency, migrations, infra/CI, gate config, multi-component config, weakened tests, >400 lines (>200 on critical paths), ≥3 coupled files → Opus, 1–2 passes, plus an ORTHOGONAL second check (tests/SAST/red run/human), never two identical LLMs (correlated blind spots) | R-risk §5; R-acre §6; R-var §2 | M | Elevated = the only class with >1 review contact |
| 3.6 | Rejected structures: batching independent diffs into one review; 3-call role panels on standard (3× cost, union FPs 50–80%); intra-branch sub-checkpoints (2.5–2.9× cost, stall the slot); adversarial test generation on standard (80.5% FP); local reviewer in front of Opus (break-even escalation ~5%, false LGTMs hide the hardest defects) | R-var §1–4, §6; R-acre §6; TODO | M | Matches Dec (no local self-review tie-breaker); drop these options |
| 3.7 | No evidence that multi-turn local Qwen review beats single-pass Opus; local gains need new external evidence (tools), not dialogue; a 3-turn local review eats 22–78% of executor throughput on one slot | R-acre §1, §4 | M | Local agents run checks/lints pre-merge (deterministic), not reviews |
| 3.8 | Reviews must run in a fresh session (models fail to disclose prefilled mistakes 67%); suppress style; findings cite failing lines/tests | R-var §3; R2; R-over §Failure Modes | M | Built: overseer killed after each attempt (TR §Overseer) |
| 3.9 | Measuring review quality live is infeasible at our volume: ~1059 PRs/arm for a 3 pp escape difference; a shadow replay needs 129–243 defect-bearing PRs (McNemar) | R-acre §6; TODO (shadow A/B on the merge log) | M | Compare reviewer tiers by shadow replay and the bench; live arms measure cost |
| 3.10 | Executor complexity is a separate axis: router `t2` triggers (security, concurrency, migration-destructive, repo-wide, interface-change, unknown-root-cause, open-design) route the *work* up; importance table adds review legs (level 0 high = Qwen worker + Sonnet review) | TR; settings `importanceTable`, `t2Keywords`; LM-design §2.2 (LD1) | H | Tiering = executor tier by card × reviewer tier by diff class |

## 4. Plan authorship (who plans)

| # | Claim | Source | Conf | Implication |
|---|---|---|---|---|
| 4.1 | R1: Opus writes, Qwen executes; R3 assumes Qwen drafts, Opus audits; our inference: hybrid — Qwen grounding by deterministic tools, Opus authors the skeleton (milestones, tasks, file whitelist, forbidden actions, checks), Qwen fills detail, amendments get Opus delta review | F-plan §2 | M (no source tests it directly) | Built that way: L7 plan-author skeleton, no re-review, red runs, delta reviews (LM-design §3.5) |
| 4.2 | Reviewers are weakest at check verifiability (11/12 rubber-stamped a check aimed at the wrong module) → Opus writes the checks; red run proves a check fails before | F-plan §2, §4 #4; R3 §Frontier Reliability | M | Keep red runs and `checkCounterexample` |
| 4.3 | Weak-planner inversion hurts (AgentCARD, partially supported); "weak plan degrades executor" (COPE) not supported; 36% figure not in source | F-plan §4 #1, #3 | L | Do not build on the inversion numbers |
| 4.4 | ⚡ Vendor evidence splits: Opus planner + cheap executor 58.4→69.7% (Blackbox) vs planning advisor doubled cost without gain (Fireworks) | F-plan §4 #2; R-orch §Empirical | L | Plan contact only where the request spans >1 branch (as built) |
| 4.5 | 11-11: 4 plan-author runs, 2 timed out at 901 s; skeletons of 7 and 23 tasks; 3 `over-budget` triggers; Opus plan-author median 28 requests/$2.09 (n=3); plan children median 71/$5.92 | A #33; outcome log; [M] | M | A plan contact is an agent contact (~$2): bound its input, its time, and its task count |
| 4.6 | Replan only on deterministic triggers (non-whitelisted file, interface break, regression, over budget, remediation failed); delta review, full re-review only for public API/schema | F-plan §3; R2 §Replanning | M | Built (`amend_plan`, LM-design §3.5) |

## 5. Escalation and breakers

| # | Claim | Source | Conf | Implication |
|---|---|---|---|---|
| 5.1 | Escalation signals, best first: deterministic verifier > state churn > learned monitor > logprobs > self-consistency; self-assessed confidence has negative utility | R-orch §Escalation Signals; F-route | M | Breakers read checks and diffs, never the model's claim |
| 5.2 | Breakers: 3 consecutive same-test failures → cloud bundle (logs, diff, context) for root cause + corrective plan; 2 failed diff applications → cheap cloud model; 2 consecutive verification failures; repro stall 8 turns; cross-cutting scope bypasses local planning | R-loops §Escalation Circuit Breakers; R-orch §Recommendations; TODO | M | Adopt as starting values |
| 5.3 | Ladder: one structured notice → hard tool block → handoff in a *fresh* context (cloud) or `git reset` + truncate; handoff in clean context beats critique injected into polluted local context | R-loop §Session Dynamics, §Escalation Dynamics | M | Escalation = new bounded contact with a card, never transcript (R-orch §Delegation Interfaces) |
| 5.4 | Thresholds are uncalibrated practitioner heuristics (OpenHands raised its condensation threshold 3→10 after false positives) | R-loop §Empirical Gap | H (that they are uncalibrated) | Log every trip and its outcome; tune |
| 5.5 | Escalation tiers: Haiku syntax/compiler fixes, Sonnet default, Opus multi-file/architecture or after Sonnet fails (<5–10% of calls) | R-orch §Recommendations | L | ⚡ ours: Opus 63–96% of child requests (A §4) |
| 5.6 | Built: hints (identical 3, no-change 4, ABAB 2, repeated error 2, churn 3/4, check failing 2, context-soft 32k, stall 25) → persistent trip → Opus steer (budget 3) or fixed "spawn a debug-design card"; children only identical/alternation; `attemptOf` one level above the executed member; fixer Sonnet after 2 rejections | LM-design §3.0.1, §3.1, §3.4; TR | H (built) / unknown (effect, OQ10, G7) | Whether Qwen acts on hints is unmeasured |
| 5.7 | 11-11 hints: 10 trips — 6 context-soft, 2 identical-call, 1 churn, 1 outside-worktree | outcome log [M] | H | ⚡ context-soft at 32k fires routinely on a 262k model (vs R-orch "~32k effective"): noise until raised |
| 5.8 | Overseer fails closed on any error event (also a transient 429); `timeoutSec` starts after spawn resolves | LM-lim §Open defects | H | A cloud hiccup blocks a local merge: fix before contact experiments |

## 6. Local loop harness (thinking, context, append-only)

| # | Claim | Source | Conf | Implication |
|---|---|---|---|---|
| 6.1 | Prefill is the bottleneck: 100k uncached ≈ 1.5–3 min on a consumer GPU; ours 660–1240 tok/s (pre-cache-ram) | R-loops §Prompt Prefill Dynamics; draft [M] | H | Keep the local prefix cached; budget re-prefills |
| 6.2 | Prompt must stay append-only and byte-invariant (no timestamps, stable tool JSON, no mid-session summaries); delay compaction to ~200k on 262k models | R-loops §Prompt Prefill, §Delayed Compaction | M | ⚡ infinite-context folds rewrite the prompt: cheap on cloud (reads at 0.1×), minutes on local; local main needs its own fold policy |
| 6.3 | Qwen defaults to xhigh without a reasoning param: up to 6× tokens, 7× wall vs medium, thinking up to 89% of output; role efforts (medium/low for edits/commits) + server budget 6000–7500 | R-loops §Low-Level Tuning; TODO | L–M | ⚡ R-merge §1: xhigh scored higher than medium on SWE-bench Pro/DeepSWE (vendor vs third-party harness); our `qwen-local` allows only `[xhigh]`; we have no own data → experiment. The owner judges 6000–7500 too low for a 262k model: medium-arm budget levels 16k / 32k / unbounded (Dec; 6.11–6.13) |
| 6.4 | `maxTokens` 8192 + thinking truncates tool calls that are reported complete; raise to 32768 | R-loops §Memory; TODO | M | Done differently: the catalog has `maxTokens` 131072 (6.10) |
| 6.5 | Prompt bloat >10k hurts a 27B; pi's system prompt is <1k with 4 tools; our local child starts at ≈10.7k uncached | R-loops §Tool Protocol; R-harness §In-Harness; [M] | M | Keep card + section short; spill artifacts >10 KB to files |
| 6.6 | Deterministic outer state machine + inner model loop; termination by external verification, never the model's claim; completion locked behind tests | R-harness §Structural Foundations, §Deterministic Verification; R-loops | M | Merge gate = completion gate (built) |
| 6.7 | Local errors: 144 of 2840 llama requests failed (5.1%); prompts p50 74k, p90 167k, p99 261k | [M] | H | Long local mains run near the window: fresh children/branches per package |
| 6.8 | A 5-agent local Qwen team beat a single frontier call on 10 problems only with 15.3M output tokens, median 40 min/problem | R-team | L | Local multi-pass buys quality with time, not at equal compute |
| 6.9 | Serving: one llama-server, `parallel = 1` (one slot, the whole 262144 context), `cache-ram = 16384` (MiB of host RAM for the prompt caches of inactive sessions; a very recent change), flash attention, 8 pinned threads; sampling temp 1.0, top-p 0.95, top-k 20; default chat-template kwargs `enable_thinking` true, `reasoning_effort` high, `preserve_thinking` true; presets Q5_K_M with KV in RAM (~34–40 tok/s expected) and Q4_K_XL with KV in VRAM (~45–50 tok/s expected); no `--reasoning-budget` | SRV | H (config) / L (speeds) | A cache-ram experiment is moot (it is on); the thrash numbers (2.8, 6.1) predate it; serving stays location-independent (no server-side experiments) |
| 6.10 | pi's `<agentDir>/models.json` is the model list: provider `llama` (`openai-completions`, timeout 300000 ms); `qwen3.8` with `contextWindow` 262144, `maxTokens` 131072, `reasoning`, `thinkingLevelMap` low/medium/xhigh (minimal, high, max unmapped), compat `chat-template` kwargs (`enable_thinking` ← thinking.enabled, `preserve_thinking` true, `reasoning_effort` ← thinking.effort); also `qwen3.8-fast` (65536/32768) and a small model. The router keeps its own copy of such facts: member `qwen-local` with `contextWindow` 262144, `efforts` `["xhigh"]`, `slots` 1, `health` | SRV; `packages/task-router/core/settings.ts:30–33` | H | The router reads model facts from pi's registry (Dec); its member efforts (xhigh only) disagree with the catalog (low/medium/xhigh) |
| 6.11 | pi 1.4 caps reasoning per request: the setting `thinkingBudgets` (tokens for minimal, low, medium, high; one global value per level) is sent in the top-level field the model's `compat.thinkingTokenBudgetField` names (`thinking_budget_tokens` = llama.cpp; off by default); chat-template kwargs may use `$var` `thinking.budget`; an extension can rewrite the serialized payload in `before_provider_request`. xhigh has no budget entry | PI | H | A medium arm with one budget level per agent dir is expressible; several levels at once need a per-session value (setting or payload hook): the mechanism is open |
| 6.12 | llama.cpp takes `thinking_budget_tokens` from the request body only when the server has no `--reasoning-budget` (−1) and the chat template has a thinking end tag | LC; SRV (no flag set) | M (source read; our build unverified) | Verify on our build before the medium arm runs: from its version and the llama.cpp docs and source, not by a live run (design §5.7) |
| 6.13 | With `preserve_thinking` true, earlier reasoning stays in the context: a thinking budget caps the reasoning of one response, not the context (262k with infinite-context) | SRV; Dec | H | The budget is a per-response quality/time lever, not a context lever |

## 7. Local mode L1–L8 and the 11-11 run

| # | Claim | Source | Conf | Implication |
|---|---|---|---|---|
| 7.1 | Built and tested with fakes: switch, local routing, `/force`, hints, overseer (merge, plan-author, plan-review, delta, steer), worktrees, merge gate + fixer, plans; 1055 router tests, 51 flake checks; runbooks never run on a real host | PL48 L8.T5; LM-lim | H | Reuse, do not rebuild; G7 (real model behaviour) is the gap |
| 7.2 | One global `settings.mode` for the whole agent dir; no per-session mode; components `auto|on|off` can be enabled in default mode | LM-lim; TR §Local mode | H | Profiles need a per-session mode (Dec: runtime switch) |
| 7.3 | 11-11: 15 merge events — 5 merged (6–71 lines), 3 refused size (291/1148/13299), 2 refused check, 2 main-dirty, 2 revise, 1 fixer; 9 Opus merge reviews mean $0.29; 4 plan-author (2 timeouts), 1 plan-review; 2 `gatebypass` | A #28, #33; outcome log | H | Gate works mechanically; sizes and plan-author time are the friction |
| 7.4 | A 46 s cold Opus review ran on a branch that a free main-dirty check then refused | MGS §1 | H | Run every cheap refusal before the review contact |
| 7.5 | The 11-11 main mixed 222 Opus and 229 qwen requests (in-session switching) | [M] | H | Not a clean local-main test; G7 still open |
| 7.6 | Local tier quality: pure-local 13/18 accepted (72%, Wilson 49–88%) vs ran-Claude 36/39 (92%); qwen route vs T1 P≈0.12; only 5.5% of tasks started on local | A #23–24 | M (n=18) | Quality floor unproven; review contacts are what holds it |
| 7.7 | The router already resolves models through pi's registry, for `/force` (`modelRegistry.find`, `getAvailable`) | `packages/task-router/core/forceinstall.ts:22–29` | H | The read path for model facts exists |

## 8. Where research and our data disagree (summary)

1. Size caps: research tighter (120/3) — our work hit the 150/6 cap on inert bulk (1.6).
2. Horizon vs files: research "4+ files escalate" — pilot passed 13–14 mechanical files (1.5).
3. Review fixed cost: research 73–96% — measured cold first request 33% of a bounded review; agent contacts 1–6% (2.4, 2.2).
4. Escalation mix: research Opus <5–10% — ours 63–96% of child requests (5.5).
5. Thinking: medium+budget (R-loops) vs xhigh scores higher (R-merge); no own data (6.3).
6. Effective context ~32k (R-orch) vs failures only at ≥200k (pilot); 32k hint is noise (5.7).
7. Plan contact: Opus planning helps (R1, Blackbox) vs adds cost without gain (Fireworks) (4.4).

## 9. What nobody knows yet (blocks decisions; needs our data)

- Whether Qwen follows the section, hints, refusal texts (G7, OQ10).
- Defect escape rate per review class and reviewer tier (no study measures it: R-econ §6, R-risk §4).
- Accepted-correct rate of local packages by size (n=18 today) and the cost per accepted package by split granularity (MGS §2.3).
- Local wall time per package (meter v2 timings, M8).
- The re-prefill cost of alternating sessions with `cache-ram` on: every
  thrash number we have (2.8, 6.1) predates it; re-measure, split before/after
  the change.
- Whether our llama.cpp build honours `thinking_budget_tokens` (6.12); read from the build version, docs and source (design §5.7).
- The exact error text of an exhausted 5h window (2.13).
