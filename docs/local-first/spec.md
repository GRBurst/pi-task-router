# Local-first: specification

Status: spec for the local-first build of the task-router, from `docs/local-first/design.md` revision 6 (the
source of truth; *design* below). It turns the design's decided parts (§5, §7, §11, §12) into numbered,
testable requirements and fixes the contracts the design left to the builder (§8). The plan is
`docs/local-first/plan.md`; it maps every requirement to the task and the check that proves it.

Revision 2 (after the plan review): the contacts of plan review and integration review (CON-12–14), every
factor disabled by default (§2.8), E0 on by default, the experimental gate (PRO-9), the card kinds
(PRO-10), the full actor API 3 (§2.6, XR-3), the per-release consumer contract (§2.7), E17's shadow rate
(REV-11), package scope (TREE-14).

Conventions. `REQ-<area>-<n>` ids are stable; a later revision adds ids and never renumbers. Each requirement
has an acceptance criterion and the one check that executes it: `test/<file> › "<name>"` is a `node --test`
case of the `task-router` check (under `packages/task-router/`), a bare name is a flake check. Checks use
fakes only (`test/fake-pi.ts`, `test/fake-api.ts`, `test/fake-git.ts`, a fake `fetch`, a fake
`__quotaWait_v1`) and real git in temporary repositories (`test/git-repo.ts`); no check talks to a model
or to llama-server (design §5.7). "Local-first session" = a session whose current profile is `local-first`.
Paths are under `packages/task-router/` unless stated. Values are starting values; the factor levels are in
§2.8.

## 1. Scope

In: the two profiles and the switch; packages, nodes and the work tree on worktree branches; size tiers,
hints and crossings; risk classes and the reviewer choice (incl. the E17 arm); contact budgets, review
points, the escalation ladder, breakers, router-judged spot-checks and batching; the quota reader and
fallback; the local request queue; the merge queue; the per-request thinking budget, context values and model
facts; lean children; the router-owned randomizer for E0 and E2–E18; the outcome log v2.

Out (design §5.9, §6, §10): a strategy language; the follow-ups of §5.9; quota-wait itself (a consumed
contract, §2.5); pi-economics' analysis (a cross-repository contract, §2.7); pi-setup's actor (a
cross-repository contract, §2.6); server-side levers; live tests.

## 2. Contracts

### 2.1 Settings keys (`task-router/settings.json`; `core/types.ts`, `core/settings.ts`)

Unknown keys and invalid values go to the problem list (today's rule) and take the default.

| Key | Type | Default | Design |
|---|---|---|---|
| `profile` | `"cloud-first" \| "local-first"` (the routing profile, type `RoutingProfile`; not the card-kind `profiles` below) | `"cloud-first"` | §5.1; `local-first` needs `localFirst.experimental` before 0.5.0 (PRO-9) |
| `profiles.<kind>.localFirst` (exists: `profiles`, type `Profile`) | `{placement: "local" \| "cloud"}` | built-ins: `scout`, `lookup`, `mechanical`, `implement`, `debug-design` → `local`; `review`, `plan` → `cloud` | §5.1 executors (PRO-10); every other field of `Profile` unchanged |
| `localFirst.experimental` | boolean | `false` | before 0.5.0: required for local-first (PRO-9); always: allows local-first on an actor below API 3 as a degraded preview (XR-2) |
| `mode` (legacy) | `"default" \| "local"` | — | until the retirement (REQ NR-7, RET-1): `mode: "local"` without `profile` keeps the built local mode; `profile` wins when both are set. After it: read as `profile` (`"local"` → `local-first`) with the problem `mode is deprecated; use profile` |
| `localFirst.startMember` | member name (route `local`) | `"qwen-local"` | §5.1 |
| `localFirst.tiers` | `{small, standard, large}` lines | `{60, 150, 300}` | §5.3 |
| `localFirst.tree` | `{maxDepth, maxChildren, planLines}` | `{3, 5, 150}` | §5.2 |
| `localFirst.reviewers` | `{haiku, sonnet, opus, local}` member names | `{"haiku", "sonnet", "opus", "qwen-local"}` | §5.4 |
| `localFirst.spotCheckShare` | number in [0, 1] | `0.1` | §5.5 (not a factor) |
| `localFirst.context` | `{childSoftTokens, mainSoftTokens, mainFoldTokens, uncachedBreakerTokens}` | `{65536, 98304, 204800, 65536}` | §5.7 |
| `localFirst.breakers` | `{sameTest, diffApply, verify, turns}` | `{3, 2, 2, plans.taskTurns}` | §5.5 |
| `localFirst.localQueue` | `{enabled, affinitySec, mainHoldSec, hookTimeoutSec}` | `{true, 10, 600, 600}` | §5.7, §8; `mainHoldSec` bounds a main's hold when its hook has no abort signal; `hookTimeoutSec` → the actor's `hookTimeoutMs` (§2.6) |
| `localFirst.policyFile` | repository-relative path | `".pi/task-router-policy.json"` | §5.4; schema below |
| `localFirst.e17ShadowShare` | number in (0, 1] | 0.5 (owner, Q25, 2026-11-26) | §5.5, §6 E17 (REV-11) |
| `localFirst.quotaFallback` | `{maxCloud, q5hOpenEnded}` | `{2, 0.8}` | §5.6 |
| `localFirst.overCapBytes` | integer | `60000` | §5.3 |
| `experiments.seed` | string | `"task-router"` | §6, §8 |
| `experiments.cloudOnlyShare` | number in [0, 1] | `0.1` (E0 runs from the first release; 0 turns it off) | §6 E0 |
| `experiments.factors.<id>` | `{enabled?: boolean, weights?: number[]}` | every factor disabled, in every release | §6; the owner enables a factor after E0 and E1 have data |

The levels of each factor are fixed in the registry (§2.8); settings enable a factor and weight its levels,
never invent levels. The size-hint stages (80 %, 100 %) and the depth/fan-out caps' meaning are constants.

Policy file (`localFirst.policyFile`, read at the base commit, CLS-2): JSON `{inertGlobs?, testGlobs?,
ciGlobs?, riskGlobs?, configGlobs?, publicApiGlobs?, componentDepth?}`, each `*Globs` a string array of
anchored globs, `componentDepth` an integer ≥ 1 (default 1: a component = the first path segment). An
absent key takes the settings' value (`mergeGate.inertGlobs`, `riskGlobs`, `plans.publicApiGlobs`, built-in
test/CI/config globs); unknown keys or a parse error → every change classed elevated (`classBy: error`).

### 2.2 Session entries (`pi.appendEntry`; restored from `ctx.sessionManager.getBranch()` at `session_start`)

| Type | Payload (`v: 1` in every payload) | Written | Restored as |
|---|---|---|---|
| `task-router/profile` | `{profile, by: "settings" \| "command", at}` | at the first local-first `session_start` and at each `/profile` switch | the last entry; none → settings |
| `task-router/arms` | `{sessionId, experiments: <snapshot of the effective experiments settings: seed, cloudOnlyShare, and for every factor of the registry its effective enabled flag and weights, defaults included>, routerVersion, arms: {[factorId]: level}}` | once, at the first `session_start` of the session | the snapshot; every later draw of the session uses it, also after an upgrade that changes a default (§2.8) |
| `task-router/tree` | `{op, node, …}`, `op ∈ add \| state \| split \| contact \| ladder \| fit` (S36 in the plan) | one per tree change | replay of all ops = the live tree |
| `task-router/mqueue` | `{target, child, op: "enqueue" \| "acquire" \| "release" \| "leave", at}` | one per queue change | the waiters per target in order; a lock held by a dead process is released at `session_start` |
| `task-router/branch` (exists) | gains `node?`, `parent?` | as today | as today |

### 2.3 Tools, child tools, command

| Name | Who | Input | Result / effect |
|---|---|---|---|
| `start_branch` (exists) | main | today's fields + `parent?: string` (node id), `child?: string` (a slug of the parent's recorded split), `estimate?: {lines: integer ≥ 0, kind: "code" \| "plan" \| "inert"}` (required in a local-first session unless `child` is given) | a node: branch off the parent node's branch tip (no parent → the main branch, as today), worktree; or a refusal (§3 REQ-SIZE-4, REQ-TREE-5) |
| `request_merge` (exists) | main | unchanged | merges the node into its parent node's branch through the merge queue (REQ-MQ-*) |
| `split` | main, local-first | `{node?: string, summary: string, children: SplitChild[]}`; `node` absent = the root (the top-level plan) | validated, committed on the node's branch, node state `split` |
| `submit_split` | package child (child tool) | as `split` without `node` | as `split` for the child's node; ends the child (`terminate: true`) |
| `submit_fit` | fit-check child | `{verdict: "fit" \| "miss", reasons: string[] (≤ 5, ≤ 200 chars)}` | records the advisory fit result; ends the child |
| `submit_correction` | corrective contact (overseer role) | `{rootCause: string, card: SplitChild}` | a revised package for a fresh local child |
| `/profile [cloud-first \| local-first]` | user | none → shows the profile | switch (REQ-PRO-2) |

`SplitChild = {slug: /^[a-z0-9-]{1,40}$/, goal: string ≤ 400, files: string[] (1–30 globs), estimate: {lines,
kind}, check: string, forbidden?: string[] (globs the package must not touch)}`. A split plan file:
`<plans.dir>/split/<node>.json`, canonical JSON (sorted keys, two-space indent, trailing newline) of
`{v: 1, node, summary, children}`. Split files are router-owned: they never count toward size (SIZE-2), class
(CLS-1) or scope (TREE-14), and the root's rebased branch drops them in one commit before its review
(MQ-1; owner, Q26, 2026-11-26).

Plan-review verdict (the overseer's verdict tool, role `plan-review`, CON-12): `{verdict: "approve" |
"amend", amend?: {summary, children: SplitChild[]}, reasons: string[] (≤ 5, ≤ 200 chars)}`.

### 2.4 Outcome log v2 (`docs/outcome-log.md` governs)

One bump to `v: 2` (owner's decision 2026-11-16, recorded with the author's configuration): the router stops
reading `__piExperimentsApi_v1` and retires `spawn.arm` (a child joins its parent by `parentSessionId`). Every
line written after the bump carries `v: 2`; nothing else in a cloud-first line changes (G7), except the
`session` line while E0 runs (MEAS-1). The other additions below are optional fields, new events and new
enumerated values, so they need no further bump. A consumer reads the event list and every enumerated
field's values from the exports (`EVENTS_V2`, `ENUMS_V2`, `FALLBACKS`, …); each release that adds any of them
has its consumer-contract task in pi-economics (§2.7).

| Event | New or changed fields (v2) |
|---|---|
| every line of a local-first session | `arms: string[]` — the enabled factors' levels of the line's unit and its session, `"<id>=<level>"`, sorted; in a cloud-first session only the `session` line carries `arms` (E0) |
| `spawn` | `arm` removed |
| `session` (new) | `taskId = sessionId`; `profile: cloud-first \| local-first \| local-mode` (`local-mode` = the legacy `mode: "local"` until its retirement), `mainModel`, `startSet: boolean`, `localMembers: "on" \| "off"`, `routerVersion` |
| `profile` (new) | `from`, `to`, `by: "settings" \| "command"` |
| `node` (new) | `taskId = node`; `parent`, `depth`, `kind: leaf \| plan \| integration \| fix`, `fanout`, `outcome: started \| split \| merged \| blocked \| abandoned`, `tier`, `class?`, `profile` |
| `split` (new) | `node`, `reason: estimate \| breaker \| check \| choice \| review` (`review` = a plan-review amendment), `children`, `depth`, `planLines` |
| `crossing` (new) | `node`, `stage: 80 \| 100`, `lines`, `budget`, `estimate`, `tier`, `class`, `depth`, `kind`, `turn`, `call`, `sinceStartMs` |
| `contact` (new) | `node`, `kind: review \| plan-review \| integration \| corrective \| handoff \| spot \| fit`, `shape: bounded \| open`, `member`, `model`, `class`, `tier`, `round`, `durationMs`, `reviewId?`, `outcome: approve \| revise \| amend \| invalid \| timeout \| error \| done` |
| `ladder` (new) | `node`, `step: retry-xhigh \| split \| corrective \| handoff \| steer \| stop` (S40's `LadderStep`), `reason: breaker \| check \| fit \| conflict`, `trip?`, `outcome` |
| `lqueue` (new) | `waiter: main \| child \| review`, `holder: main \| child \| review`, `waitedMs`, `outcome: granted \| aborted \| timeout` |
| `mqueue` (new) | `target`, `branch`, `waitMs`, `outcome: merged \| conflict \| red \| aborted \| left`, `rereview` |
| `quota` (new) | `provider`, `window: 5h \| 7d`, `source: headers \| quota-wait`, `kind: start \| end \| skip \| threshold \| fallback`, `utilization?`, `waitedMs?` |
| `review` | `class`, `tier`, `actualTier`, `reviewer: haiku \| sonnet \| opus \| qwen`, `binding`, `overCap`, `rereview`, `of?` (the merge's branch, the child's name or the shadowed review id), `sample?: inert \| ungated \| shadow`, `batch?: string[]`, `classBy?: string[]`; `role` gains `spot`, `fit`, `corrective`, `integration`; `fallback` gains `local-unavailable`, `transient` |
| `merge` | `base` (target tip before), `target`, `repo` (basename), `repoId` (the repository's root-commit sha, 12 hex), `class`, `classBy?`, `tier`, `actualTier`, `node`; `commit` = the merged tip; `reason` gains `conflict`, `aborted-queue` |
| `hint` | `trip` gains `same-test`, `diff-apply`, `verify`, `turns`, `uncached` (the size stages 80 %, 100 % are `crossing` lines, not trips) |

The exports `log-contract` imports (`TRIPS`, `ROLES`, `REASONS`, `TRIGGERS`, `PLAN_TYPE`, `BRANCH_TYPE`, and
`test/harness.ts`, `test/fake-git.ts`) stay, grow only by new values, and gain `FACTORS`
(`core/strategy/arms.ts`), `EVENTS_V2`, `ENUMS_V2` (`{"<event>.<field>": readonly (string | number)[]}`)
and `FALLBACKS` (`core/outcome.ts`), `TREE_TYPE`, `MQUEUE_TYPE`. `test/fake-api.ts` is consumer-visible too
(the harness imports it): it only grows. Strings stay clipped at 256 and text-free (no prompt text, no
paths; `repo` is a basename).

### 2.5 Consumed contracts: pi 1.4 hooks and quota-wait

- pi 1.4: `before_provider_request` (the main's payload; awaited, so it can hold a request; `ctx.signal`
  aborts on Esc — both verified by the `pi-hooks` check on the openai-completions and anthropic-messages
  transports, plan X33, X45),
  `after_provider_response` (`status`, `headers`), `message_end` (usage), `agent_settled`, `model_select`,
  `session_start`, `pi.registerCommand`, `pi.appendEntry`, `pi.setActiveTools`, the model registry
  (`ctx.modelRegistry.find`). Facts the builder verifies first are listed in the plan (X33–X36).
- quota-wait (router-proposed, plan D91 and QW-1: no quota-wait design exists yet; design §5.6 names its
  `quota-wait:*` events): events on `pi.events` channel `quota-wait:v1` with `QuotaWaitEvent = {type: "start"
  | "end" | "skip", waitId, sessionId, provider, model, window: "5h" | "7d", resetAt, wakeAt?, outcome?,
  reason?}`, and `globalThis.__quotaWait_v1 = {version: 1, waits(): ActiveWait[]}` (the active waits, for a
  session that starts during one). The router keeps the type (`core/quota.ts`); `__quotaWait_v1.version ===
  1` at `session_start` switches the fallback off. Until quota-wait publishes exactly this, the router runs
  its fallback.

### 2.6 Cross-repository: pi-setup's actor API (spawn policy API 3)

The router is not loaded in child sessions; it sees them only through the actor. Local-first needs, additive
to API v1 (`version` stays 1, `spawnPolicyApi` 2 → 3):

```ts
interface RequestInfo {
  name: string; model: string;
  requestId: string;                          // unique per provider request of the child
  signal: AbortSignal;                        // aborts on Esc, kill, pause, shutdown, or the actor's timeout
}
interface PolicyResultV3 extends PolicyResult {
  beforeRequest?(payload: unknown, info: RequestInfo): Promise<unknown>; // awaited; returns the payload
  hookTimeoutMs?: number;                     // default 600 000
  afterResponse?(info: { name: string; requestId: string; status: number; headers: Record<string, string> }): void;
  contextFiles?: false;                       // the child session loads no AGENTS.md/CLAUDE.md context files
  systemPrompt?: string;                      // replaces the spawner's system prompt (lean children, E18)
}
interface SubagentsApiV1 { /* as today */ policyApi?: number }   // 3; absent = 2 or older
type ApiEventV3 = ApiEvent
  | { type: "tool_result"; name: string; requestId: string; toolName: string; isError: boolean; command?: string; path?: string }
  | { type: "usage"; name: string; requestId: string; input: number; cacheRead: number; cacheWrite: number; output: number }
  | { type: "hook"; name: string; requestId: string; outcome: "timeout" | "error" | "aborted"; waitedMs: number };
```

Semantics (published once, so complete now):

- `beforeRequest` carries both the thinking budget (it rewrites the payload) and the local queue (it may
  wait). The actor awaits it before sending.
- Abort: Esc, `kill`, `pause` and shutdown abort `signal`; the actor does not wait for the hook's promise,
  the request is not sent (it is the aborted turn's request), and one `hook` event `outcome: "aborted"` is
  emitted. The router's waiter leaves its queue on `signal` (XR-3).
- Timeout: a hook pending longer than `hookTimeoutMs` → `signal` aborts with reason `timeout`, the request
  proceeds with the payload as it was, one `hook` event `outcome: "timeout"`.
- Error: a rejected or throwing hook → the request proceeds with the payload unchanged, one `hook` event
  `outcome: "error"`.
- `afterResponse`, `usage` and `tool_result` carry the `requestId` of the request they belong to.
- Versioning: `policyApi: 3` on the API object and `passthru.spawnPolicyApi = 3` on the actor package;
  feature detection reads `policyApi` (absent = 1 or 2, told apart by today's checks); `version` stays 1.

The router's copy lives in `core/api.ts`; `iface-subagents-task-router` and `iface-policy-task-router`
compare it with the locked pi-setup. Local-first needs API 3: the module asserts it (HM-1 b) and the runtime
refuses local-first below it (XR-2), both except under `localFirst.experimental` (a degraded preview).

### 2.7 Cross-repository: pi-economics (observes; the router never depends on it)

pi-economics reads the outcome log v2 (§2.4) and the meter; it measures and reports, and never routes,
gates or switches a factor. It needs, from its own repository:

- Consumer contract per release (plan §15.2, PE-1…PE-6): before each router release that adds events,
  fields or enumerated values (fallbacks included), its consumer copy (`core/contract.ts`) and its
  `log-contract` fixtures are extended and tested against the release commit (`--override-input`). From
  PE-1 the copy reads the lists from the router's exports, accepts `v: 2` and `v ≤ 1`, and drops
  `iface-experiments-task-router`.
- Analysis (PA-1…PA-4): arms per factor as extension-owned levers (curves per factor, the frontier), a
  factor only from sessions whose `session` snapshot lists it enabled; quality from router-recorded verdicts
  (`review`, `merge`, spot `review` lines) and reverts within 7 days computed from `merge` lines (`commit`,
  `base`, `branch`, `target`, `repo`, `repoId`) against the repository's history; local-queue (`lqueue`),
  merge-queue (`mqueue`) and quota waits (quota-wait's own meter lines; the router's `quota` lines); E0 (σ,
  clustering, the cloud-only reference by `session.localMembers = "off"`) and E1 (re-prefill before/after
  2026-11-13 from the meter's `timings`, stratified by router version).
- E17's pre-registered harm rule (PA-4), fixed before E17 is enabled: per stratum (small binding;
  inert-like advisory), on the shadow-reviewed subset only (REV-11); a unit counts once its 7 days have
  passed; batched units are never in E17 (REV-5). Escape = a defect the shadow review finds that the unit's
  review did not flag (binding stratum: approved; advisory stratum: not flagged by the advisory verdict).
  First look at 50 shadow-reviewed units per arm, then every 25 (50, 75, 100 …); Beta(1,1) priors; the report says "stop"
  when P(p_qwen − p_cloud > δ) > 0.9, with δ = 3 pp in the binding stratum and 5 pp in the advisory one
  (owner, Q25, 2026-11-26). Reverts are compared between arms by Fisher's exact test; one revert of a qwen-arm unit is flagged
  "pause for owner review", it does not stop the arm. Run at each meter analysis, at least weekly while E17
  is enabled. The switch stays the owner's `experiments.factors.E17.enabled`.

### 2.8 Factor registry (`core/strategy/arms.ts`, `FACTORS`)

The first level is the default (used when the factor is disabled or a session predates it). Draws are
deterministic: `level = pick(levels, weights, u)`, `u = (the first 53 bits of sha256(seed ‖ 0 ‖ id ‖ 0 ‖
unit), big-endian) / 2^53` (exact in a JavaScript number), with the session's experiments snapshot (§2.2).
Every factor is disabled by default in every release; no release enables one in code. The owner enables a
factor in settings once E0 and E1 have data (plan §15.3). `From` = the first release whose mechanism runs the
factor; enabling it earlier is a settings problem and keeps the default. E0 is not switched by `enabled`: it
runs while `cloudOnlyShare > 0` (default 0.1).

| Id | Unit (its id) | Levels (default first) | From |
|---|---|---|---|
| E0 | session (sessionId), cloud-first only | `as-used`, `cloud-only` (weight = `cloudOnlyShare`) | 0.3.0 |
| E2 | session | `standard`, `small`, `large` | 0.4.0 |
| E3 | review (review id), standard tier | `opus`, `sonnet` | 0.4.0 |
| E12 | package child (node id + attempt) | `xhigh`, `medium` | 0.5.0 |
| E13 | package child, medium arm | `unbounded`, `16k`, `32k` | 0.5.0 |
| E4 | session | `off`, `on` | 0.6.0 |
| E5 | session | `150`, `300` | 0.6.0 |
| E6 | request (root node id) | `recursive`, `flat` | 0.7.0 |
| E7 | request | `on`, `off` | 0.7.0 |
| E8 | node | `on`, `off` | 0.7.0 |
| E9 | request | `on`, `off` | 0.7.0 |
| E10 | package (node id) | `2`, `1` | 0.7.0 |
| E11 | ladder entry (node id + entry count) | `corrective-handoff`, `corrective`, `steer` | 0.8.0 |
| E14c | session | `64k`, `32k` (children's soft hint) | 0.8.0 |
| E14m | session | `96k`, `64k` (main's soft hint) | 0.8.0 |
| E14f | session | `200k`, `150k` (main's fold point) | 0.8.0 |
| E14b | session | `64k`, `32k` (uncached breaker) | 0.8.0 |
| E15 | session | `5x150`, `3x80` (children × plan lines) | 0.8.0 |
| E16 | request | `local`, `opus` | 0.8.0 |
| E17 | review, two strata (small; inert-like); never a batched unit | `cloud`, `qwen` | 0.8.0; shadow share `localFirst.e17ShadowShare` (REV-11, default 0.5), δ 3/5 pp (Q25) |
| E18 | package child | `full`, `lean` | 0.8.0 |

The defaults (every factor disabled) give the design's starting behaviour: e.g. E7, E8, E9 at `on` are the
design's review points (CON-3), E10 `2` its leaf rounds.

## 3. Requirements

### 3.1 Non-regression and boundaries (NR)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| NR-1 | Cloud-first stays as built (G7), outside E0's cloud-only arm | default settings: `checks/router-golden/golden.txt` unchanged and green (it reads `planSpawn`/`resolveLeg`, no session draw); the default-mode inventory and key tests pass, changed only as plan X37 lists; a session drawn `E0=as-used` places every spawn as before | `router-golden`; `test/local-default.test.ts` (all); `test/lf-e0.test.ts › "MEAS-2"` |
| NR-2 | Cloud-first log lines change only in `v` | the v1 lines of a default-settings fixture session are captured before the bump (`test/fixtures/v1-lines.jsonl`); after it, for every event, the v2 line = the v1 line with `v: 2` and without `arm`; the `session` line (MEAS-1) is the only new line | `test/lf-default.test.ts › "NR-2 v1 capture"`, `"NR-2 cloud-first lines"` |
| NR-3 | No dependency on pi-economics | no source reads `__piExperimentsApi_v1`; `withFlags` reads settings only | `test/lf-default.test.ts › "NR-3 no experiments read"` (source scan) |
| NR-4 | Claim protocol frozen | `test/runtime-guard.test.ts` unmodified and green | `task-router` |
| NR-5 | No live network | every `/health`, `/props`, `/slots` read goes through the injected `fetch`; without it the router reads nothing | `test/lf-serving.test.ts › "NR-5 no fetch without injection"` |
| NR-7 | Legacy local mode unchanged during the build | every `test/local-*.test.ts` stays green, unmodified, until RET-1 (except the cases named in plan X37) | `task-router` |
| RET-1 | Retirement | `mode: "local"` = `profile: "local-first"` plus the deprecation problem; no code path keys on `isLocal(settings)`; the superseded local-mode cases are rewritten as listed in the plan | `test/lf-settings.test.ts › "RET-1"`; source scan `test/lf-seams.test.ts › "RET-1 no isLocal"` |
| NR-6 | Strategy seams (§5.9) | no file outside `core/strategy/` imports a strategy file other than `types.ts`, `local-first.ts` and `arms.ts` (the registry and `assign`); files in `core/strategy/` import nothing outside it but `node:crypto` and `../types.ts`; every strategy part is a pure function reached through `Strategy` | `test/lf-seams.test.ts › "NR-6 imports"` (source scan) |

### 3.2 Measurement (MEAS) and randomizer (RND)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| MEAS-1 | `session` line at every local-first (and legacy local-mode) `session_start`, and at every cloud-first one while `cloudOnlyShare > 0` | fields of §2.4; no `session` line in a cloud-first session with `cloudOnlyShare = 0` (G7) | `test/lf-session-log.test.ts › "MEAS-1"` |
| MEAS-2 | E0 cloud-only reference | `E0=cloud-only` → no spawn of that session is placed on a `route: "local"` member (property over random cards) and `localMembers = "off"`; share 0 → no draw; a `/profile local-first` switch keeps a `cloud-only` draw (no local member in that session) | `test/lf-e0.test.ts › "MEAS-2"` |
| RND-1 | Registry = §2.8 | `FACTORS` deep-equals the table (literal); `Record<FactorId, …>` tables type-check | `test/lf-arms.test.ts › "RND-1"`; `typecheck-task-router` |
| RND-2 | Deterministic draw | ∀ seed, id, unit: `draw` twice → equal; frequencies over 20 000 units within ±2 % of the weights | `test/lf-arms.test.ts › "RND-2"` |
| RND-3 | Independent factors | joint frequencies of two factors over 20 000 units within ±2 % of the product of the marginals | `test/lf-arms.test.ts › "RND-3"` |
| RND-4 | Disabled factor | level = default; absent from `arms` | `test/lf-arms.test.ts › "RND-4"` |
| RND-5 | Resume-stable | the `task-router/arms` snapshot is written once; after a settings change and a resume every draw equals the pre-resume draw (property) | `test/lf-arms-shell.test.ts › "RND-5"` |
| RND-6 | Arms on lines | every line of a local-first session carries `arms` = sorted `id=level` of its unit's and its session's enabled factors | `test/lf-arms-shell.test.ts › "RND-6"` |
| RND-7 | Intention to treat | a unit's recorded level is the assigned one, also after a fallback (E17) or a skipped step | `test/lf-reviewer-gate.test.ts › "RND-7"` |
| RND-8 | v2 bump | `SCHEMA_VERSION = 2`; `spawn` has no `arm` | `test/outcome.test.ts › "RND-8 v2"` |

### 3.3 Profiles (PRO) and module (HM)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| PRO-1 | Profile setting | `profile` parsed (invalid → problem, default); both `profile` and `mode` set → `profile` wins; `mode: "local"` alone → legacy local mode (until RET-1) | `test/lf-settings.test.ts › "PRO-1"` |
| PRO-2 | Switch | `/profile local-first` appends one `task-router/profile` entry (`by: "command"`), writes one `profile` line, the status line shows `local-first`; an unknown name → usage text, no entry | `test/lf-profile.test.ts › "PRO-2"` |
| PRO-3 | Restore | property over entry sequences: the restored profile = the last entry's, none → settings | `test/lf-profile.test.ts › "PRO-3"` |
| PRO-4 | Start model | local-first `session_start` sets the `startMember`'s model iff the user did not choose (no model flag, not a resumed session with a model); three cases tested: none, flag, resumed. A `/model` before the start hook is not observable (the router registers at `session_start`, plan X43) | `test/lf-start-model.test.ts › "PRO-4 <case>"` |
| PRO-5 | Never switches back | property over random event sequences (`model_select`, turns, switches, spawns): `setModel` ≤ 1 call, only inside `session_start` | `test/lf-start-model.test.ts › "PRO-5"` |
| PRO-6 | Switch scope | after a switch, new spawns and merges follow the new profile; an open node and a running child keep `node.profile` | `test/lf-profile.test.ts › "PRO-6"` |
| PRO-7 | Back to cloud-first | the section = `cardSection`; local-first tools are not active (`setActiveTools`); the first switch to local-first registers them | `test/lf-profile.test.ts › "PRO-7"` |
| PRO-8 | Coordinator section | local-first main: the section text (pinned, S41) names the session tier budget, plan budgets, one child per package, the do-or-split rule and the tree caps | `test/lf-prompt.test.ts › "PRO-8"` |
| PRO-9 | Experimental gate (staged) | (a) before 0.5.0: `profile: local-first` from the settings, `/profile` or the module without `localFirst.experimental: true` → the problem (or notice) `profile local-first is experimental before 0.5.0; set localFirst.experimental` and cloud-first; (b) from 0.5.0 (the ladder, the local queue and the merge queue exist): no gate, API 3 required (XR-2) | `test/lf-settings.test.ts › "PRO-9"`; `test/lf-profile.test.ts › "PRO-9"` |
| PRO-10 | Card kinds in local-first | `profiles.<kind>.localFirst.placement` parsed (built-ins §2.1; invalid → problem); every other `Profile` field and every reader unchanged (property: `profileFor` minus `localFirst` = before); in a local-first session a card that is not a package and not `t2` goes to the local member iff its kind's placement is `local`, with `meta.ungated = true`; `cloud` → cloud-first routing | `test/lf-settings.test.ts › "PRO-10"`; `test/lf-placement.test.ts › "PRO-10 b"` |
| HM-1 | Module | (a) option `programs.piTaskRouter.profile` (enum, default `cloud-first`) sets `settings.profile` (mkDefault); (b) the assertion, exactly `pi-task-router: profile local-first needs programs.pi.actorSubagents with passthru.spawnPolicyApi >= 3 (or settings.localFirst.experimental = true)`, when the profile is local-first, the actor's API < 3 and `experimental` is not set; a negative case and an experimental case; (c) from the retirement, `localMode.enable` sets `profile = "local-first"` and (b) applies | `module-eval` › `task-router-profile`, `task-router-local-first-needs-api-3`, `task-router` |

### 3.4 Packages, nodes and the tree (TREE)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| TREE-1 | Node = branch + worktree | `start_branch({parent})` branches off the parent node's tip; no parent → the main branch (today); real git | `test/lf-tree-git.test.ts › "TREE-1"` |
| TREE-2 | Caps | a split that would put a node below `maxDepth` (levels 1…3 under the request's level 0) or give a node > `maxChildren` children → refused with the cap named | `test/lf-tree.test.ts › "TREE-2"` |
| TREE-3 | Persisted tree | property: replay(ops written) deep-equals the live tree, across a fold and a resume | `test/lf-tree.test.ts › "TREE-3"` |
| TREE-4 | Split plan | `split`/`submit_split` validate §2.3 (one reason per violation), commit the canonical file on the node's branch by a path-limited commit in its worktree (other changes stay uncommitted), set the node `split`; `submit_split` ends the child | `test/lf-split.test.ts › "TREE-4 <rule>"`; `test/lf-split-git.test.ts › "TREE-4 commit"` |
| TREE-5 | Start from a split | `start_branch({parent, child})` takes goal, files, estimate and check from the split; refused when the parent is not `split`, the slug is unknown or already started, or while the parent's plan review is pending (CON-12) | `test/lf-start-child.test.ts › "TREE-5"` |
| TREE-6 | Package child placement | a card with `package: <node>` in a local-first session → the local member, `cwd` = the node's worktree, the brief = the package contract (goal, files, budget, check, forbidden), `meta.node`; a `t2` card still goes to the cloud and counts as an open-ended contact | `test/lf-placement.test.ts › "TREE-6"` |
| TREE-7 | Merge into the parent | (a) `request_merge` targets the parent node's branch; (b) `behind` and the size are computed against the target's tip; (c) the red run and the review diff use the target's tip as base; (d) a node→parent merge fast-forwards the parent in its worktree and never pushes; only the root→main merge pushes (as today); (e) the main-ref record is written only for the main branch; (f) the git guard blocks a child's and the main's direct writes to an open parent branch | `test/lf-merge-target.test.ts › "TREE-7 <a–f>"` (real git, a fake remote) |
| TREE-8 | Checks per level, no size | an integration runs the parent's check and every merged child's check on the combined tree; red → the ladder; no merge is refused for size (property over sizes); the review step is the integration contact at a review point (CON-13), else checks only (CON-14) | `test/lf-integration.test.ts › "TREE-8"`, `"checks only"` |
| TREE-9 | Advisory fit check | after the last child merges, one fresh local child gets the fit brief; `miss` → exactly one fix package (kind `fix`) on the parent node; the fit result never blocks a merge; a failed fix → the ladder at its first step | `test/lf-fit.test.ts › "TREE-9"` |
| TREE-10 | Split only unmerged | the ladder's split step is never offered for a node with a merged child or in state `merged` (property) | `test/lf-ladder.test.ts › "TREE-10"` |
| TREE-11 | Node and split lines | each node state change writes one `node` line; each split one `split` line (§2.4), text-free | `test/lf-tree-log.test.ts › "TREE-11"` |
| TREE-12 | Top-level plan | E16=`local`: the main's `split` of the root is the top-level plan; E16=`opus`: `plan_request` authors it and the router stores it as the root split without a plan review (S49 runs on the `split` path only) | `test/lf-top-plan.test.ts › "TREE-12"` |
| TREE-13 | Do or split | the package brief states the do-or-split rule; `submit_split` is offered only while the node's depth < `maxDepth` | `test/lf-placement.test.ts › "TREE-13"` |
| TREE-14 | Package scope | a package node is plan-bound: its merge is refused `scope` (naming the path) for a changed path outside its split child's `files` or matching its `forbidden`; split files are exempt | `test/lf-merge-target.test.ts › "TREE-14"` |

### 3.5 Size (SIZE)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| SIZE-1 | Tiers | `budget(tier, class)`: small 60, standard 150, large 300, inert ∞; elevated capped at standard (property) | `test/lf-tiers.test.ts › "SIZE-1"` |
| SIZE-2 | Changed lines | at the gate: added + deleted of `numstat(base, commit)` (as `merge.ts` `sizeOf` today); during the work (hints): `git diff --numstat <base>` of the worktree plus the line count of untracked, not ignored files; `<plans.dir>/split/**` never counts | `test/lf-tiers-git.test.ts › "SIZE-2"` |
| SIZE-3 | Session tier | = the E2 level; `standard` while E2 is disabled | `test/lf-tiers.test.ts › "SIZE-3"` |
| SIZE-4 | Start refusal | `estimate.lines > budget` → refused, the text names the budget, `maxChildren` and `split`; kind `inert` → not refused; property: no other tool result is a size refusal | `test/lf-start-refusal.test.ts › "SIZE-4"` |
| SIZE-5 | Hints 80 %/100 % | for the main's active node and every package child: one hint per stage per node, never a block (the guard returns `undefined`) | `test/lf-size-hints.test.ts › "SIZE-5 main"`, `"SIZE-5 child"` |
| SIZE-6 | Crossing line | each stage writes one `crossing` line with §2.4's fields | `test/lf-size-hints.test.ts › "SIZE-6"` |
| SIZE-7 | Reviewer by actual size | reviewer = stronger of the class's and the actual-lines tier's; a crossing is logged against the drawn tier | `test/lf-reviewer.test.ts › "SIZE-7"` |
| SIZE-8 | No size refusal at the gate | local-first `request_merge` never refuses `size`; above `large` the review input is the numstat, the check output and the riskiest files' hunks within `overCapBytes`; `review.overCap = true` | `test/lf-overcap.test.ts › "SIZE-8"` |
| SIZE-9 | Budgets at start | the section and every package brief state the session's tier budget and the plan budgets | `test/lf-prompt.test.ts › "SIZE-9"` |
| SIZE-10 | Plan budgets | a split with > `planLines` rendered lines is accepted with a `crossing` (kind `plan`); a split with > `maxChildren` children is refused (TREE-2) | `test/lf-split.test.ts › "SIZE-10"` |

### 3.6 Classes (CLS) and reviewers (REV)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| CLS-1 | Classifier | the design §5.4 table and MGS §2.1 (S38) with the policy file of §2.1: highest file class wins; an error → elevated; split files are dropped first; `classBy` = every proxy that fired, on the `review` and `merge` lines | `test/lf-classify.test.ts › "CLS-1 <rule>"`, `"split files"` |
| CLS-2 | Policy from the base | globs from `policyFile` at the base commit (absent → settings); a branch that edits the policy file is elevated and is classed by the base's policy | `test/lf-classify-git.test.ts › "CLS-2"` |
| CLS-3 | Inert needs a check | inert requires ≥ 1 configured `extraChecks` entry that passes; else standard | `test/lf-classify.test.ts › "CLS-3"` |
| CLS-4 | Inert-like | every file inert-class, or tests/docs only and no code | `test/lf-classify.test.ts › "CLS-4"` |
| REV-1 | Stronger of class and tier | property: `strength(reviewerFor(c, t)) = max(strength(classReviewer(c)), strength(tierReviewer(t)))` | `test/lf-reviewer.test.ts › "REV-1"` |
| REV-2 | Standard randomized | standard tier → the E3 level (per review) | `test/lf-reviewer.test.ts › "REV-2"` |
| REV-3 | Elevated | Opus in a fresh session plus the orthogonal check (red run and `extraChecks`) passing; never a second LLM | `test/lf-reviewer-gate.test.ts › "REV-3"` |
| REV-4 | Advisory | Haiku (or qwen in E17) on inert-like: verdict logged, `binding = false`, never blocks | `test/lf-reviewer-gate.test.ts › "REV-4"` |
| REV-5 | E17 limits | qwen only in the small and inert-like strata, 50/50 per review when enabled; never standard or above, never elevated; never decides whether the cloud is called; a batched unit (E4) is never in E17 | `test/lf-reviewer.test.ts › "REV-5"` (property) |
| REV-6 | qwen fallback | qwen unavailable (slot timeout, health down) → the stratum's cloud reviewer, `fallback: "local-unavailable"`, the arm kept | `test/lf-reviewer-gate.test.ts › "REV-6"` |
| REV-7 | Bounded review | every reviewer (qwen too) gets the triad payload, read-only tools, a harness verdict, a fresh session | `test/lf-reviewer-gate.test.ts › "REV-7"` |
| REV-8 | Cheap refusals first | a dirty target or main refuses before any contact (no ticket issued) | `test/lf-merge-target.test.ts › "REV-8"` |
| REV-9 | Transient errors | a review attempt failing with a transient provider error is retried (≤ 2, backoff) or waits out an active quota-wait episode; never a closed gate for that reason | `test/lf-reviewer-gate.test.ts › "REV-9"` |
| REV-10 | Inert | no review; merged after the extra checks; in the audit sample | `test/lf-reviewer-gate.test.ts › "REV-10"` |
| REV-11 | E17 shadow rate | while E17 is enabled, a review in either E17 stratum is shadowed with probability `e17ShadowShare`, equal in both arms (±2 % over 20 000 units per arm); the shadow = Opus (CON-8), fresh, in both arms, after the merge, `sample: shadow`, `of` = the review id, the shadowed arm on the line; E17 enabled without `e17ShadowShare` → a settings problem, E17 at its default | `test/lf-spotcheck.test.ts › "REV-11"`; `test/lf-arms-shell.test.ts › "stage 5"` |

### 3.7 Contacts, ladder, spot-checks, batching (CON)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| CON-1 | Leaf rounds | ≤ E10 rounds (default 2); a re-review gets only the diff since the last reviewed commit | `test/lf-contacts.test.ts › "CON-1"` |
| CON-2 | Counted contacts | every contact increments its node's counter (persisted) and writes one `contact` line | `test/lf-contacts-shell.test.ts › "CON-2"` |
| CON-3 | Review points | top-level plan review iff E7 on and (> 1 child or elevated); integration review iff E8 on and (combined diff > 150 or elevated); plan review at every level iff E9 on | `test/lf-contacts.test.ts › "CON-3"` (table) |
| CON-4 | Ladder | breaker or failed check: (medium child → one retry at xhigh) → split (unmerged, caps allow) → one bounded corrective (Sonnet standard, Opus elevated) → one open-ended hand-off one tier up → stop; each step ≤ once per node; E11 variants | `test/lf-ladder.test.ts › "CON-4"` (property over failure sequences) |
| CON-5 | Breakers | package children: same-test failures 3, failed diff applications 2, verification failures 2, the turn budget, uncached input ≥ the breaker value; each trip logged (`hint`) and enters the ladder | `test/lf-breakers.test.ts › "CON-5 <breaker>"` |
| CON-6 | Corrective | payload = goal, check, last failures, focal diff; result via `submit_correction`; a fresh local child runs the revised package | `test/lf-corrective.test.ts › "CON-6"` |
| CON-7 | Stop and report | node `blocked`; one message to the main naming the node, the steps taken and the last failure; no further contact for the node | `test/lf-ladder-shell.test.ts › "CON-7"` |
| CON-8 | Spot-checks | router-judged, bounded, sample `spotCheckShare` by a deterministic draw per unit over (i) inert merges, (ii) ungated local output (the report, as the main's session received it, of a child placed local by its kind, PRO-10), (iii) gate reviews incl. qwen's (E17: REV-11); shadow reviewer Opus; `review` line `role: spot`, `of`, `sample`; never gates; cloud-first keeps today's spot-check | `test/lf-spotcheck.test.ts › "CON-8"` |
| CON-9 | Batching | E4 on: consecutive small/inert leaves merge into the parent with checks only; one review of their accumulated diff ≤ E5 cap before the parent merges up; elevated never batched; where that batch review covers a child's diff, the integration contact (S50) does not review that diff again at the merge-up (CON-9 wins; the combined tree still gets its contact when due) | `test/lf-batching.test.ts › "CON-9"` |
| CON-10 | Steer only as an arm | a local-first session spawns no steer overseer unless E11 = `steer` | `test/lf-ladder-shell.test.ts › "CON-10"` |
| CON-11 | No session cap | `overseer.budget`/`steerBudget` do not apply to local-first contacts | `test/lf-contacts-shell.test.ts › "CON-11"` |
| CON-12 | Plan-review contact | at a plan-review point (CON-3), after `split`/`submit_split` commits a plan: one bounded ticket (role `plan-review`; Opus for an elevated node, else Sonnet; payload = the split JSON, the node's goal and contract, the caps; read-only tools); no child starts before the verdict; `amend` → the unstarted children replaced as one tree op, the file recommitted, one `split` line `reason: review`; an invalid amendment → one re-ask, then the plan stands (`contact.outcome = invalid`); one counted `contact` line | `test/lf-planreview.test.ts › "verdict"`, `"ticket"`, `"amend"` |
| CON-13 | Integration contact | at an integration-review point (CON-3): one bounded review of the combined diff (target..tip, rebased); the reviewer by the combined diff's actual tier and class, as for a leaf (REV-1); over-cap → the SIZE-8 input (numstat, level-check output, riskiest hunks) with `overCap`; approval keyed by commit and tree (MQ-2); revise → the ladder (no split); one counted `contact` line `kind: integration` | `test/lf-integration.test.ts › "reviewer"`, `"contact"`, `"over-cap"` |
| CON-14 | Checks only | a node merge without a review point merges after the level checks with no ticket (property: a ticket iff the integration-review point holds) | `test/lf-integration.test.ts › "checks only"` |

### 3.8 Quota (Q)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| Q-1 | Header reader | parse Anthropic unified 5h/7d utilization and reset headers from the main's `after_provider_response` and children's `afterResponse`; others → unknown; state per provider and window | `test/lf-quota.test.ts › "Q-1"` (fixture headers) |
| Q-2 | quota-wait detection | `__quotaWait_v1.version === 1` at `session_start` → subscribe, fallback off; absent → one notice per process, fallback on | `test/lf-quota-shell.test.ts › "Q-2"` |
| Q-3 | Waiting is not stuck | a session with an active wait trips no breaker, gets no hand-off and no parent alarm; `start`/`end` events seen → `quota` lines | `test/lf-quota-shell.test.ts › "Q-3"` |
| Q-4 | Fallback | without quota-wait: ≤ `maxCloud` concurrent cloud contacts; q5h ≥ `q5hOpenEnded` → no open-ended contact except elevated reviews and `t2` cards; exhausted → an elevated review waits, a standard review drops a tier (Opus → Sonnet) | `test/lf-quota.test.ts › "Q-4"` |

### 3.9 Local loop (LOC)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| LOC-1 | Model facts | context window, `maxTokens`, reasoning and thinking levels come from pi's registry; a member's copy is the fallback only when the registry lacks the model | `test/lf-facts.test.ts › "LOC-1"` |
| LOC-2 | Thinking arms | main `xhigh`, set once with the start model at `session_start` (PRO-4's condition), never changed afterwards; package child effort = E12 (the placement sets `thinkingLevel` itself; the default members table is unchanged, NR-1); within `medium` the budget = E13 | `test/lf-thinking.test.ts › "LOC-2"` |
| LOC-3 | Per-request budget | a medium child's every request payload carries the model's `thinkingTokenBudgetField` (default `thinking_budget_tokens`) = the E13 budget iff the build is verified (`/props` build ≥ 10964 and the chat template has a thinking end tag); else no field and one `budget-unsupported` note; `unbounded` → no field | `test/lf-thinking.test.ts › "LOC-3"` |
| LOC-4 | xhigh retry | a medium child's first ladder step = a fresh child at `xhigh` on the same package; an `xhigh` child skips it | `test/lf-ladder.test.ts › "LOC-4"` |
| LOC-5 | Context values | children's soft hint = E14c, the main's = E14m; the main's fold hint only at a package boundary or ≥ E14f; the uncached breaker at ≥ E14b uncached input per request (main: `message_end` usage; children: `usage` events) | `test/lf-context.test.ts › "LOC-5 <value>"` |
| LOC-6 | Local queue | at most one local session holds the stream (the main on a local model, local children, qwen reviews); a request waits while another holds it; the holder keeps it while it requests again within `affinitySec`; waiters FIFO; each wait > 0 → one `lqueue` line; spawn-level waits keep `queueMaxSec`; a waiter whose `signal` aborts leaves at once (`outcome: aborted`, a holder releases without affinity); a hold past `hookTimeoutSec` (children, tickets) or `mainHoldSec` (the main without a signal) ends with `outcome: timeout` and the request proceeds | `test/lf-lqueue.test.ts › "LOC-6"` (property: no two holders) |
| LOC-7 | Lean children | E18 `lean`: the minimal brief (build and test commands, the package contract), ≤ 12 tools, `contextFiles: false`; `full` = today; the package contract lines are in both (property) | `test/lf-lean.test.ts › "LOC-7"` |
| LOC-8 | Serving facts | liveness and build from `/health`, `/props`, `/slots` through the injected `fetch`, cached per session | `test/lf-serving.test.ts › "LOC-8"` |

### 3.10 Merge queue (MQ)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| MQ-1 | One lock per target | order acquire → rebase onto the target tip → checks → review → ff-only merge → release; property over interleavings: no two holders per target; the merged tree = the reviewed tree | `test/lf-mqueue.test.ts › "MQ-1"`; `test/lf-mqueue-git.test.ts › "MQ-1 ff"` |
| MQ-2 | Re-review | a rebase that changes the tree → a new review (`rereview: true`); unchanged commit and tree → the approval is reused | `test/lf-mqueue-git.test.ts › "MQ-2"` |
| MQ-3 | Conflict or red | releases the lock; one bounded fix by a fresh local child on the child's branch (no cloud contact); its failure → the ladder at its first step | `test/lf-mqueue.test.ts › "MQ-3"` |
| MQ-4 | Persisted | waiters restored in order after a resume; a lock held at shutdown is released at `session_start` | `test/lf-mqueue.test.ts › "MQ-4"` |
| MQ-5 | Logged and abortable | each merge writes one `mqueue` line (`waitMs`, `outcome`, `rereview`); an aborted `request_merge` leaves the queue (`left`) | `test/lf-mqueue-shell.test.ts › "MQ-5"` |

### 3.11 Logs (LOG) and cross-repository (XR)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| LOG-1 | Merge lines for reverts | §2.4's merge fields; `repoId` = the root commit's sha (12 hex) | `test/lf-merge-log.test.ts › "LOG-1"` |
| LOG-2 | New events | builders for §2.4's new events; `EVENTS_V2` lists them | `test/lf-outcome.test.ts › "LOG-2"` |
| LOG-3 | Text-free | property via `test/text-free.ts` over every new builder | `test/lf-outcome.test.ts › "LOG-3"` |
| LOG-4 | Consumer exports | the exports `log-contract` imports exist and only grow (snapshot of names and values); `ENUMS_V2` and `FALLBACKS` exported; every builder's enumerated field ∈ its `ENUMS_V2` list (property) | `test/lf-outcome.test.ts › "LOG-4"` |
| XR-1 | Actor API 3 copy | the router's `PolicyResult`/`ApiEvent` copies match pi-setup's | `iface-subagents-task-router`, `iface-policy-task-router` |
| XR-2 | Below API 3 | an actor below API 3: local-first refused (one notice, the session stays cloud-first) unless `localFirst.experimental`, which gives the degraded preview: no child gating, budgets, breakers from results or `contextFiles`; one notice; spawns still work | `test/lf-api3.test.ts › "XR-2"` |
| XR-3 | Holds end | under API 3 a held request ends on its `signal` (aborted) or after `hookTimeoutMs` (timeout) per §2.6; the router's queue frees the slot at once and logs it | `test/lf-api3.test.ts › "XR-3"`; `test/lf-lqueue.test.ts › "XR-3"` |

## 4. Traceability (design → REQ)

§5.1 → PRO-*, HM-1, MEAS-1 · §5.2 → TREE-*, MQ-*, CON-12–14 · §5.3 → SIZE-* · §5.4 → CLS-*, REV-* · §5.5 → CON-*, REV-11 · §5.6
→ Q-* · §5.7 → LOC-*, NR-5 · §5.8 → LOG-*, RND-6, RND-8 · §5.9 → NR-6 · §6 → RND-*, MEAS-2, §2.8 · §7 gaps 1–2 →
PRO; 3–5, 18 → TREE; 6–7 → SIZE; 8–9, 12 → CLS, REV; 10, 13–17 → CON; 11, 23 → Q, REV-9; 19–22 → LOC; 24 → RND;
25 → LOG; 26 → NR; 27 → MQ; 28 → LOC-7 · G7 → NR-1, NR-2 · actor API 3 → XR-1–3 · the plan review
(revision 2) → PRO-9, PRO-10, TREE-14, CON-12–14, REV-11, XR-3.
