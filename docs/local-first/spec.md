# Local-first: specification

Status: spec for the local-first build of the task-router, from `docs/local-first/design.md` revision 6 (the
source of truth; *design* below). It turns the design's decided parts (§5, §7, §11, §12) into numbered,
testable requirements and fixes the contracts the design left to the builder (§8). The plan is
`docs/local-first/plan.md`; it maps every requirement to the task and the check that proves it.

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
| `profile` | `"cloud-first" \| "local-first"` | `"cloud-first"` | §5.1 |
| `mode` (legacy) | `"default" \| "local"` | — | until the retirement (REQ NR-7, RET-1): `mode: "local"` without `profile` keeps the built local mode; `profile` wins when both are set. After it: read as `profile` (`"local"` → `local-first`) with the problem `mode is deprecated; use profile` |
| `localFirst.startMember` | member name (route `local`) | `"qwen-local"` | §5.1 |
| `localFirst.tiers` | `{small, standard, large}` lines | `{60, 150, 300}` | §5.3 |
| `localFirst.tree` | `{maxDepth, maxChildren, planLines}` | `{3, 5, 150}` | §5.2 |
| `localFirst.reviewers` | `{haiku, sonnet, opus, local}` member names | `{"haiku", "sonnet", "opus", "qwen-local"}` | §5.4 |
| `localFirst.spotCheckShare` | number in [0, 1] | `0.1` | §5.5 (not a factor) |
| `localFirst.context` | `{childSoftTokens, mainSoftTokens, mainFoldTokens, uncachedBreakerTokens}` | `{65536, 98304, 204800, 65536}` | §5.7 |
| `localFirst.breakers` | `{sameTest, diffApply, verify, turns}` | `{3, 2, 2, plans.taskTurns}` | §5.5 |
| `localFirst.localQueue` | `{enabled, affinitySec}` | `{true, 10}` | §5.7, §8 |
| `localFirst.policyFile` | repository-relative path | `".pi/task-router-policy.json"` | §5.4 |
| `localFirst.quotaFallback` | `{maxCloud, q5hOpenEnded}` | `{2, 0.8}` | §5.6 |
| `localFirst.overCapBytes` | integer | `60000` | §5.3 |
| `experiments.seed` | string | `"task-router"` | §6, §8 |
| `experiments.cloudOnlyShare` | number in [0, 1] | `0` | §6 E0 |
| `experiments.factors.<id>` | `{enabled?: boolean, weights?: number[]}` | per §2.8 stage | §6 |

The levels of each factor are fixed in the registry (§2.8); settings enable a factor and weight its levels,
never invent levels. The size-hint stages (80 %, 100 %) and the depth/fan-out caps' meaning are constants.

### 2.2 Session entries (`pi.appendEntry`; restored from `ctx.sessionManager.getBranch()` at `session_start`)

| Type | Payload (`v: 1` in every payload) | Written | Restored as |
|---|---|---|---|
| `task-router/profile` | `{profile, by: "settings" \| "command", at}` | at the first local-first `session_start` and at each `/profile` switch | the last entry; none → settings |
| `task-router/arms` | `{sessionId, experiments: <snapshot of the experiments settings>, arms: {[factorId]: level}}` | once, at the first `session_start` of the session | the snapshot; every later draw of the session uses it (§2.8) |
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
kind}, check: string, forbidden?: string[]}`. A split plan file: `<plans.dir>/split/<node>.json`, canonical
JSON (sorted keys, two-space indent, trailing newline) of `{v: 1, node, summary, children}`.

### 2.4 Outcome log v2 (`docs/outcome-log.md` governs)

One bump to `v: 2` (owner's decision 2026-11-16, recorded with the author's configuration): the router stops
reading `__piExperimentsApi_v1` and retires `spawn.arm` (a child joins its parent by `parentSessionId`). Every
line written after the bump carries `v: 2`; nothing else in a cloud-first line changes (G7). The other
additions below are optional fields and new events, so they need no further bump.

| Event | New or changed fields (v2) |
|---|---|
| every line of a local-first session | `arms: string[]` — the enabled factors' levels of the line's unit and its session, `"<id>=<level>"`, sorted |
| `spawn` | `arm` removed |
| `session` (new) | `taskId = sessionId`; `profile: cloud-first \| local-first \| local-mode` (`local-mode` = the legacy `mode: "local"` until its retirement), `mainModel`, `startSet: boolean`, `localMembers: "on" \| "off"`, `routerVersion` |
| `profile` (new) | `from`, `to`, `by: "settings" \| "command"` |
| `node` (new) | `taskId = node`; `parent`, `depth`, `kind: leaf \| plan \| integration \| fix`, `fanout`, `outcome: started \| split \| merged \| blocked \| abandoned`, `tier`, `class?`, `profile` |
| `split` (new) | `node`, `reason: estimate \| breaker \| check \| choice`, `children`, `depth`, `planLines` |
| `crossing` (new) | `node`, `stage: 80 \| 100`, `lines`, `budget`, `estimate`, `tier`, `class`, `depth`, `kind`, `turn`, `call`, `sinceStartMs` |
| `contact` (new) | `node`, `kind: review \| plan-review \| integration \| corrective \| handoff \| spot \| fit`, `shape: bounded \| open`, `member`, `model`, `class`, `tier`, `round`, `durationMs`, `reviewId?` |
| `ladder` (new) | `node`, `step: retry-xhigh \| split \| corrective \| handoff \| stop \| fix`, `reason: breaker \| check \| fit \| conflict`, `trip?`, `outcome` |
| `lqueue` (new) | `waiter: main \| child \| review`, `holder: main \| child \| review`, `waitedMs` |
| `mqueue` (new) | `target`, `branch`, `waitMs`, `outcome: merged \| conflict \| red \| aborted \| left`, `rereview` |
| `quota` (new) | `provider`, `window: 5h \| 7d`, `source: headers \| quota-wait`, `kind: start \| end \| skip \| threshold \| fallback`, `utilization?`, `waitedMs?` |
| `review` | `class`, `tier`, `actualTier`, `reviewer: haiku \| sonnet \| opus \| qwen`, `binding`, `overCap`, `rereview`, `of?` (the shadowed review id), `sample?: inert \| ungated \| shadow`, `batch?: string[]`; `role` gains `spot`, `fit`, `corrective`, `integration`; `fallback` gains `local-unavailable`, `transient` |
| `merge` | `base` (target tip before), `target`, `repo` (basename), `repoId` (the repository's root-commit sha, 12 hex), `class`, `tier`, `actualTier`, `node`; `commit` = the merged tip; `reason` gains `conflict`, `aborted-queue` |
| `hint` | `trip` gains `same-test`, `diff-apply`, `verify`, `turns`, `uncached`, `size-80`, `size-100` |

The exports `log-contract` imports (`TRIPS`, `ROLES`, `REASONS`, `TRIGGERS`, `PLAN_TYPE`, `BRANCH_TYPE`, and
`test/harness.ts`, `test/fake-git.ts`) stay, grow only by new values, and gain `FACTORS`
(`core/strategy/arms.ts`), `EVENTS_V2` (`core/outcome.ts`), `TREE_TYPE`, `MQUEUE_TYPE`. Strings stay clipped
at 256 and text-free (no prompt text, no paths; `repo` is a basename).

### 2.5 Consumed contracts: pi 1.4 hooks and quota-wait

- pi 1.4: `before_provider_request` (the main's payload; awaited, so it can hold a request),
  `after_provider_response` (`status`, `headers`), `message_end` (usage), `agent_settled`, `model_select`,
  `session_start`, `pi.registerCommand`, `pi.appendEntry`, `pi.setActiveTools`, the model registry
  (`ctx.modelRegistry.find`). Facts the builder verifies first are listed in the plan (X33–X36).
- quota-wait (its design §6; consumed only): `globalThis.__quotaWait_v1 = {version: 1, waits(): ActiveWait[],
  subscribe(fn): () => void}` with `QuotaWaitEvent = start | end | skip` (`waitId`, `sessionId`, `provider`,
  `model`, `window`, `resetAt`, `wakeAt`, `outcome`, `reason`). The router keeps a type copy
  (`core/quota.ts`); its presence at `session_start` switches the fallback off.

### 2.6 Cross-repository: pi-setup's actor API (spawn policy API 3)

The router is not loaded in child sessions; it sees them only through the actor. Local-first needs, additive
to API v1 (`version` stays 1, `spawnPolicyApi` 2 → 3):

```ts
interface PolicyResultV3 extends PolicyResult {
  beforeRequest?(payload: unknown, info: { name: string; model: string }): Promise<unknown>; // awaited; returns the payload
  afterResponse?(info: { name: string; status: number; headers: Record<string, string> }): void;
  contextFiles?: false;                       // the child session loads no AGENTS.md/CLAUDE.md context files
  systemPrompt?: string;                      // replaces the spawner's system prompt (lean children, E18)
}
interface SubagentsApiV1 { /* as today */ policyApi?: number }   // 3; absent = 2 or older
type ApiEventV3 = ApiEvent
  | { type: "tool_result"; name: string; toolName: string; isError: boolean; command?: string; path?: string }
  | { type: "usage"; name: string; input: number; cacheRead: number; cacheWrite: number; output: number };
```

`beforeRequest` carries both the thinking budget (it rewrites the payload) and the local queue (it may wait).
A rejected or throwing hook leaves the payload unchanged (the actor logs once). The router's copy lives in
`core/api.ts`; `iface-subagents-task-router` and `iface-policy-task-router` compare it with the locked
pi-setup; the module asserts `spawnPolicyApi >= 3` when the profile default is local-first (REQ-HM-1).

### 2.7 Cross-repository: pi-economics (observes; the router never depends on it)

pi-economics reads the outcome log v2 (§2.4) and the meter. It needs, from its own repository: a consumer
copy accepting `v: 2` (and `v ≤ 1` for old lines), dropping `iface-experiments-task-router`; arms per factor
as extension-owned levers (curves per factor, the frontier); quality from router-recorded verdicts
(`review`, `merge`, spot `review` lines) and reverts within 7 days computed from `merge` lines (`commit`,
`base`, `branch`, `target`, `repo`, `repoId`) against the repository's history; local-queue (`lqueue`),
merge-queue (`mqueue`) and quota waits (quota-wait's own meter lines; the router's `quota` lines); E0 (σ,
clustering, the cloud-only reference by `session.localMembers = "off"`) and E1 (re-prefill before/after
2026-11-13 from the meter's `timings`, stratified by router version).

### 2.8 Factor registry (`core/strategy/arms.ts`, `FACTORS`)

The first level is the default (used when the factor is disabled or a session predates it). Draws are
deterministic: `level = pick(levels, weights, u)`, `u = uint64(sha256(seed ‖ 0 ‖ id ‖ 0 ‖ unit)) / 2^64`,
with the session's experiments snapshot (§2.2). Stage = the release in which the factor's default becomes
`enabled` (plan §15).

| Id | Unit (its id) | Levels (default first) | Stage |
|---|---|---|---|
| E0 | session (sessionId), cloud-first only | `as-used`, `cloud-only` (weight = `cloudOnlyShare`) | 0 (share 0 = off) |
| E2 | session | `standard`, `small`, `large` | 1 |
| E3 | review (review id), standard tier | `opus`, `sonnet` | 1 |
| E12 | package child (node id + attempt) | `xhigh`, `medium` | 2 |
| E13 | package child, medium arm | `unbounded`, `16k`, `32k` | 2 |
| E4 | session | `off`, `on` | 3 |
| E5 | session | `150`, `300` | 3 |
| E6 | request (root node id) | `recursive`, `flat` | 4 |
| E7 | request | `on`, `off` | 4 |
| E8 | node | `on`, `off` | 4 |
| E9 | request | `on`, `off` | 4 |
| E10 | package (node id) | `2`, `1` | 4 |
| E11 | ladder entry (node id + entry count) | `corrective-handoff`, `corrective`, `steer` | 5 |
| E14c | session | `64k`, `32k` (children's soft hint) | 5 |
| E14m | session | `96k`, `64k` (main's soft hint) | 5 |
| E14f | session | `200k`, `150k` (main's fold point) | 5 |
| E14b | session | `64k`, `32k` (uncached breaker) | 5 |
| E15 | session | `5x150`, `3x80` (children × plan lines) | 5 |
| E16 | request | `local`, `opus` | 5 |
| E17 | review, two strata (small; inert-like) | `cloud`, `qwen` | 5, after the owner sets the harm bound |
| E18 | package child | `full`, `lean` | 5 |

## 3. Requirements

### 3.1 Non-regression and boundaries (NR)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| NR-1 | Cloud-first stays as built (G7) | default settings: `checks/router-golden/golden.txt` unchanged and green; the default-mode inventory and key tests pass unmodified | `router-golden`; `test/local-default.test.ts` (all) |
| NR-2 | Cloud-first log lines change only in `v` | for every event a cloud-first fixture session writes, the v2 line = the v1 line with `v: 2` and without `arm` | `test/lf-default.test.ts › "NR-2 cloud-first lines"` |
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
| MEAS-2 | E0 cloud-only reference | `E0=cloud-only` → no spawn of that session is placed on a `route: "local"` member (property over random cards) and `localMembers = "off"`; share 0 → no draw | `test/lf-e0.test.ts › "MEAS-2"` |
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
| PRO-4 | Start model | local-first `session_start` sets the `startMember`'s model iff the user did not choose (no model flag, not a resumed session with a model, no `model_select` before `session_start`); the four cases tested | `test/lf-start-model.test.ts › "PRO-4 <case>"` |
| PRO-5 | Never switches back | property over random event sequences (`model_select`, turns, switches, spawns): `setModel` ≤ 1 call, only inside `session_start` | `test/lf-start-model.test.ts › "PRO-5"` |
| PRO-6 | Switch scope | after a switch, new spawns and merges follow the new profile; an open node and a running child keep `node.profile` | `test/lf-profile.test.ts › "PRO-6"` |
| PRO-7 | Back to cloud-first | the section = `cardSection`; local-first tools are not active (`setActiveTools`); the first switch to local-first registers them | `test/lf-profile.test.ts › "PRO-7"` |
| PRO-8 | Coordinator section | local-first main: the section text (pinned, S41) names the session tier budget, plan budgets, one child per package, the do-or-split rule and the tree caps | `test/lf-prompt.test.ts › "PRO-8"` |
| HM-1 | Module | option `programs.piTaskRouter.profile` (enum, default `cloud-first`) sets `settings.profile` (mkDefault); assertion `pi-task-router: profile local-first needs spawnPolicyApi >= 3` with a negative case | `module-eval` › `task-router-profile`, `task-router-local-first-needs-api-3` |

### 3.4 Packages, nodes and the tree (TREE)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| TREE-1 | Node = branch + worktree | `start_branch({parent})` branches off the parent node's tip; no parent → the main branch (today); real git | `test/lf-tree-git.test.ts › "TREE-1"` |
| TREE-2 | Caps | a split that would put a node below `maxDepth` (levels 1…3 under the request's level 0) or give a node > `maxChildren` children → refused with the cap named | `test/lf-tree.test.ts › "TREE-2"` |
| TREE-3 | Persisted tree | property: replay(ops written) deep-equals the live tree, across a fold and a resume | `test/lf-tree.test.ts › "TREE-3"` |
| TREE-4 | Split plan | `split`/`submit_split` validate §2.3 (one reason per violation), commit the canonical file on the node's branch by a path-limited commit in its worktree (other changes stay uncommitted), set the node `split`; `submit_split` ends the child | `test/lf-split.test.ts › "TREE-4 <rule>"`; `test/lf-split-git.test.ts › "TREE-4 commit"` |
| TREE-5 | Start from a split | `start_branch({parent, child})` takes goal, files, estimate and check from the split; refused when the parent is not `split`, the slug is unknown or already started | `test/lf-start-child.test.ts › "TREE-5"` |
| TREE-6 | Package child placement | a card with `package: <node>` in a local-first session → the local member, `cwd` = the node's worktree, the brief = the package contract (goal, files, budget, check, forbidden), `meta.node`; a `t2` card still goes to the cloud and counts as an open-ended contact | `test/lf-placement.test.ts › "TREE-6"` |
| TREE-7 | Merge into the parent | `request_merge` targets the parent node's branch; the git guard blocks a child's and the main's direct writes to an open parent branch | `test/lf-merge-target.test.ts › "TREE-7"` |
| TREE-8 | Checks per level, no size | an integration runs the parent's check and every merged child's check on the combined tree; red → the ladder; no merge is refused for size (property over sizes) | `test/lf-integration.test.ts › "TREE-8"` |
| TREE-9 | Advisory fit check | after the last child merges, one fresh local child gets the fit brief; `miss` → exactly one fix package (kind `fix`) on the parent node; the fit result never blocks a merge; a failed fix → the ladder at its first step | `test/lf-fit.test.ts › "TREE-9"` |
| TREE-10 | Split only unmerged | the ladder's split step is never offered for a node with a merged child or in state `merged` (property) | `test/lf-ladder.test.ts › "TREE-10"` |
| TREE-11 | Node and split lines | each node state change writes one `node` line; each split one `split` line (§2.4), text-free | `test/lf-tree-log.test.ts › "TREE-11"` |
| TREE-12 | Top-level plan | E16=`local`: the main's `split` of the root is the top-level plan; E16=`opus`: `plan_request` authors it and the router stores it as the root split | `test/lf-top-plan.test.ts › "TREE-12"` |
| TREE-13 | Do or split | the package brief states the do-or-split rule; `submit_split` is offered only while the node's depth < `maxDepth` | `test/lf-placement.test.ts › "TREE-13"` |

### 3.5 Size (SIZE)

| REQ | Requirement | Acceptance | Check |
|---|---|---|---|
| SIZE-1 | Tiers | `budget(tier, class)`: small 60, standard 150, large 300, inert ∞; elevated capped at standard (property) | `test/lf-tiers.test.ts › "SIZE-1"` |
| SIZE-2 | Changed lines | at the gate: added + deleted of `numstat(base, commit)` (as `merge.ts` `sizeOf` today); during the work (hints): `git diff --numstat <base>` of the worktree plus the line count of untracked, not ignored files | `test/lf-tiers-git.test.ts › "SIZE-2"` |
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
| CLS-1 | Classifier | the design §5.4 table and MGS §2.1 (S38): highest file class wins; an error → elevated | `test/lf-classify.test.ts › "CLS-1 <rule>"` |
| CLS-2 | Policy from the base | globs from `policyFile` at the base commit (absent → settings); a branch that edits the policy file is elevated and is classed by the base's policy | `test/lf-classify-git.test.ts › "CLS-2"` |
| CLS-3 | Inert needs a check | inert requires ≥ 1 configured `extraChecks` entry that passes; else standard | `test/lf-classify.test.ts › "CLS-3"` |
| CLS-4 | Inert-like | every file inert-class, or tests/docs only and no code | `test/lf-classify.test.ts › "CLS-4"` |
| REV-1 | Stronger of class and tier | property: `strength(reviewerFor(c, t)) = max(strength(classReviewer(c)), strength(tierReviewer(t)))` | `test/lf-reviewer.test.ts › "REV-1"` |
| REV-2 | Standard randomized | standard tier → the E3 level (per review) | `test/lf-reviewer.test.ts › "REV-2"` |
| REV-3 | Elevated | Opus in a fresh session plus the orthogonal check (red run and `extraChecks`) passing; never a second LLM | `test/lf-reviewer-gate.test.ts › "REV-3"` |
| REV-4 | Advisory | Haiku (or qwen in E17) on inert-like: verdict logged, `binding = false`, never blocks | `test/lf-reviewer-gate.test.ts › "REV-4"` |
| REV-5 | E17 limits | qwen only in the small and inert-like strata, 50/50 per review when enabled; never standard or above, never elevated; never decides whether the cloud is called | `test/lf-reviewer.test.ts › "REV-5"` (property) |
| REV-6 | qwen fallback | qwen unavailable (slot timeout, health down) → the stratum's cloud reviewer, `fallback: "local-unavailable"`, the arm kept | `test/lf-reviewer-gate.test.ts › "REV-6"` |
| REV-7 | Bounded review | every reviewer (qwen too) gets the triad payload, read-only tools, a harness verdict, a fresh session | `test/lf-reviewer-gate.test.ts › "REV-7"` |
| REV-8 | Cheap refusals first | a dirty target or main refuses before any contact (no ticket issued) | `test/lf-merge-target.test.ts › "REV-8"` |
| REV-9 | Transient errors | a review attempt failing with a transient provider error is retried (≤ 2, backoff) or waits out an active quota-wait episode; never a closed gate for that reason | `test/lf-reviewer-gate.test.ts › "REV-9"` |
| REV-10 | Inert | no review; merged after the extra checks; in the audit sample | `test/lf-reviewer-gate.test.ts › "REV-10"` |

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
| CON-8 | Spot-checks | router-judged, bounded, sample `spotCheckShare` by a deterministic draw per unit over (i) inert merges, (ii) ungated local output, (iii) gate reviews incl. qwen's; shadow reviewer Opus; `review` line `role: spot`, `of`, `sample`; never gates; cloud-first keeps today's spot-check | `test/lf-spotcheck.test.ts › "CON-8"` |
| CON-9 | Batching | E4 on: consecutive small/inert leaves merge into the parent with checks only; one review of their accumulated diff ≤ E5 cap before the parent merges up; elevated never batched | `test/lf-batching.test.ts › "CON-9"` |
| CON-10 | Steer only as an arm | a local-first session spawns no steer overseer unless E11 = `steer` | `test/lf-ladder-shell.test.ts › "CON-10"` |
| CON-11 | No session cap | `overseer.budget`/`steerBudget` do not apply to local-first contacts | `test/lf-contacts-shell.test.ts › "CON-11"` |

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
| LOC-2 | Thinking arms | main `xhigh`; package child effort = E12 (the placement sets `thinkingLevel` itself; the default members table is unchanged, NR-1); within `medium` the budget = E13 | `test/lf-thinking.test.ts › "LOC-2"` |
| LOC-3 | Per-request budget | a medium child's every request payload carries the model's `thinkingTokenBudgetField` (default `thinking_budget_tokens`) = the E13 budget iff the build is verified (`/props` build ≥ 10964 and the chat template has a thinking end tag); else no field and one `budget-unsupported` note; `unbounded` → no field | `test/lf-thinking.test.ts › "LOC-3"` |
| LOC-4 | xhigh retry | a medium child's first ladder step = a fresh child at `xhigh` on the same package; an `xhigh` child skips it | `test/lf-ladder.test.ts › "LOC-4"` |
| LOC-5 | Context values | children's soft hint = E14c, the main's = E14m; the main's fold hint only at a package boundary or ≥ E14f; the uncached breaker at ≥ E14b uncached input per request (main: `message_end` usage; children: `usage` events) | `test/lf-context.test.ts › "LOC-5 <value>"` |
| LOC-6 | Local queue | at most one local session holds the stream (the main on a local model, local children, qwen reviews); a request waits while another holds it; the holder keeps it while it requests again within `affinitySec`; waiters FIFO; each wait > 0 → one `lqueue` line; spawn-level waits keep `queueMaxSec` | `test/lf-lqueue.test.ts › "LOC-6"` (property: no two holders) |
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
| LOG-4 | Consumer exports | the exports `log-contract` imports exist and only grow (snapshot of names and values) | `test/lf-outcome.test.ts › "LOG-4"` |
| XR-1 | Actor API 3 copy | the router's `PolicyResult`/`ApiEvent` copies match pi-setup's | `iface-subagents-task-router`, `iface-policy-task-router` |
| XR-2 | Degraded without API 3 | an actor at API 2: no child gating, budgets, breakers from results or `contextFiles`; one notice; spawns still work | `test/lf-api3.test.ts › "XR-2"` |

## 4. Traceability (design → REQ)

§5.1 → PRO-*, HM-1, MEAS-1 · §5.2 → TREE-*, MQ-* · §5.3 → SIZE-* · §5.4 → CLS-*, REV-* · §5.5 → CON-* · §5.6
→ Q-* · §5.7 → LOC-*, NR-5 · §5.8 → LOG-*, RND-6, RND-8 · §5.9 → NR-6 · §6 → RND-*, MEAS-2, §2.8 · §7 gaps 1–2 →
PRO; 3–5, 18 → TREE; 6–7 → SIZE; 8–9, 12 → CLS, REV; 10, 13–17 → CON; 11, 23 → Q, REV-9; 19–22 → LOC; 24 → RND;
25 → LOG; 26 → NR; 27 → MQ; 28 → LOC-7 · G7 → NR-1, NR-2.
