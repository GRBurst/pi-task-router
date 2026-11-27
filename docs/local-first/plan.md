# Plan LF1–LF19: the local-first build

Status: revision 3, re-reviewed; owner questions answered (Q25, Q26: 2026-11-26).
Scope: every requirement of `docs/local-first/spec.md` (REQ ids without the `REQ-` prefix below), from
`docs/local-first/design.md` revision 6 (*design*). Precondition: the router at 0.2.1 (branch
`local-first-design`, tip ccbfb8f); the cross-repository milestones of §15.2 for the tasks that name them.
Numbering continues the local-mode plans (`docs/local-mode/plan-L1-L3.md` = P13, `plan-L4-L8.md`): decisions
D59+, disagreements X33+, snippets S31+, questions Q24+, risks R13+, runbooks G11+. Task ids `LF<m>.T<n>`;
status `[ ] todo` → `[r] red seen` → `[g] green` → `[x] done`. One task = one scenario = one commit. Size:
≤ 2 production files plus the task's one test file, about 60 changed lines; a task that must touch a third
production file says why.

## 1. Motivation

Cost per accepted package at ≤ 0.1× cloud-only with acceptance ≥ 0.9× (design §2, decision 13): the local
main coordinates, fresh local children do sized packages on worktree branches of a work tree, and the cloud
is called only at budgeted contact points chosen by risk class and size, with the router randomizing its own
levers so pi-economics can draw per-factor trade-off curves. The built local mode (L1–L8) has the pieces at
one level and for the main only (design §7, 28 gaps); this plan closes the gaps without changing
cloud-first (G7).

## 2. Approach

Shape of the diff:

- **Strategy parts** (new `core/strategy/`, pure, no I/O; §5.9 seams, D60): `types.ts` (the `Strategy`
  interface, S31), `draw.ts`, `arms.ts` (`FACTORS`, S32), `tiers.ts`, `classify.ts`, `reviewer.ts`,
  `points.ts`, `ladder.ts`, `breakers.ts`, `quota-rule.ts`, `brief.ts`, and `local-first.ts`, the one
  composition the mechanism sees.
- **Mechanism** (new, except `core/profile.ts`, which is extended beside its card-kind exports, D82):
  `core/profile.ts`, `core/armstore.ts`, `core/quota.ts`, `core/facts.ts`;
  `core/local/`: `tree.ts`, `treestore.ts`, `split.ts`, `splittool.ts`, `package.ts`, `size.ts`,
  `sizehints.ts`, `overcap.ts`, `policyfile.ts`, `contacts.ts`, `ladderdrive.ts`, `corrective.ts`, `spot.ts`,
  `batch.ts`, `serving.ts`, `lqueue.ts`, `mqueue.ts`, `mqfix.ts`, `levelchecks.ts`, `fit.ts`, `thinking.ts`,
  `api3.ts`, `planreview.ts`, `integration.ts`.
- **Edited**: `core/outcome.ts` (v2, new builders), `core/log.ts` (`arms`), `core/shell.ts`,
  `core/local/install.ts`, `merge.ts`, `overseer.ts`, `branchtool.ts`, `worktree.ts`, `gitcmd.ts`,
  `childtrips.ts`, `core/policy.ts`, `core/prompt.ts`, `core/settings.ts`, `core/types.ts`, `core/api.ts`,
  `modules/task-router.nix`, `docs/outcome-log.md`, `docs/task-router.md`, README and the version files at
  releases.
- Every local-first path keys on the session's profile (`profile.current()`), never on
  `isLocal(settings)`; the legacy `mode: "local"` keeps today's behaviour until LF19 retires it (D59, Q24).
- One new flake check, `pi-hooks` (LF1.T0: pi's provider hooks on both transports, offline); the other new
  tests run in `task-router`; three module-eval cases; the iface checks follow pi-setup's API 3 (LF7).
  `router-golden` is never re-recorded.
- Revision 2 (the plan review, `APPROVE-WITH-FIXES`): the orchestrator's calls are D63, D64 (M1), D65 (M3),
  D81 (M1), D82 (M6), D83 (B1), D84 (M5), D86 (M2), D87 (M4) and the task changes they name; the planner's
  fixes of the minors are D59, D85, D88–D92, X41, X43–X46 and the inserted tasks (letter suffixes).

## 3. Decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| D59 | Legacy local mode stays untouched until LF19; local-first is the new profile beside it; LF19 aliases `mode: "local"` to local-first and rewrites the superseded local-mode cases (X37c); no task before LF19 changes local-mode behaviour (LF2.T6 and LF6.T12 included) (orchestrator's call; Q24 resolved, §18) | local mode is disabled in the author's setup (pi-economics `docs/scope.md`), so no owner session depends on it; the reasons are the code: `test/local-*` is the regression net for the gate, worktree and overseer code local-first extends; package users of the published `localMode.enable` keep a working path; no task pays a local-mode test rewrite | change local mode in place from LF3 on (every task rewrites local-mode tests; the shared gate code loses its net while it changes most) |
| D60 | Strategy parts are pure functions in `core/strategy/`, composed once in `local-first.ts` into a `Strategy` (S31) that the mechanism gets in its deps; a source scan (NR-6) keeps the seam | design §5.9: a later strategy layer swaps parts without touching the mechanism | a strategy language now (out of scope, §5.9); parts read settings directly (no seam) |
| D61 | Draw `u = ⌊H / 2^11⌋ / 2^53`, H = the first 64 bits of `sha256(seed‖0‖id‖0‖unit)` (the first 53 bits, exact in a double); the effective experiments settings are snapshot in `task-router/arms` at the session's first `session_start` | reproducible per unit, independent across factors, stable across resume, settings edits and code-default changes | `Math.random` (not reproducible); the experiments package (owner decision 2026-11-16); 64 bits (not exact as a double) |
| D62 | `arms: string[]` of `"id=level"` on every line of a local-first session; in a cloud-first session only on its `session` line (E0); a line joins its session by `sessionId`/`parentSessionId` | `OutcomeEvent` has no nested objects; one field for every factor; additive; cloud-first lines other than `session` stay as v1 (NR-2) | a field per factor (schema churn per factor); `arms` on every cloud-first line (changes every line for E0 alone) |
| D63 | Every factor ships disabled, at every release; the owner enables each in settings after E0 and E1 have data (§15.3's owner gate); concluding a factor = the owner sets one-hot weights; a later release may move its first level (orchestrator's call) | randomizing before a baseline exists pollutes the data; the owner sees E0/E1 first | r1: the release that completes a stage turns its factors on (no baseline, review M1) |
| D64 | `experiments.cloudOnlyShare` defaults to 0.1 from R1, settable to 0 (orchestrator's call; who is eligible: D93) | the cloud-only baseline accrues from day one; a session without a `route: "local"` member is unaffected (its cloud-only = as-used) | r1: 0 (E0 might never run before the levers randomize) |
| D65 | The request node (level 0) is a branch off the main branch: `start_branch` with `estimate.kind = "plan"`; it merges into the main branch through today's gate; only that merge pushes and records the main-ref; a node→parent merge fast-forwards the parent in its worktree and never pushes; `behind`, size, red run and review diff take the target's tip as base (LF4.T11a–f; orchestrator's call, M3) | design §5.2 node = branch + worktree; partial work never reaches the main branch | root = the main branch (children's partial merges land on main) |
| D66 | Split plan = canonical JSON `<plans.dir>/split/<node>.json` (spec §2.3), committed in the node's worktree by a path-limited commit (`git add <f>` + `git commit --only -m … -- <f>`; hooks run, a failing hook refuses the split with its output) | deterministic validation and diff; other changes in the worktree stay uncommitted; the worktree stays in sync with its branch | Markdown (prose parsing); plumbing + `update-ref` (moves a checked-out branch under its worktree's index, R20) |
| D67 | Only the main starts children (`start_branch({parent, child})`); a package child's only extra tool is `submit_split` (depth < cap) | design §11.19; no nested sessions | children spawning children |
| D68 | Size during the work: worktree diff plus untracked lines, measured on the actor's `turn` events (API v1), hints sent with `api.send` | size hints need no API 3 | waiting for child tool results (API 3) |
| D69 | Local queue at request level: the main's `before_provider_request` (awaited) and API 3 `beforeRequest` for children and qwen reviews; release at the request's end + `affinitySec`; spawn-level `slots`/`queueMaxSec` unchanged | design §5.7: one stream, main included; the affinity keeps a session's cache warm | spawn policy only (misses the main); pausing the main only (misses children) |
| D70 | Merge queue: an in-process async lock per target held inside `request_merge`'s execute; `task-router/mqueue` entries restore waiters; the router runs `git rebase` in the node's idle worktree; a conflict aborts the rebase and spawns a bounded local fix child (`cwd` = the worktree) | design §5.2/§12.14 semantics; no extra process | a daemon or file lock (design: state in the main's tree state) |
| D71 | Package children's effort is set by the placement (`PolicyResult.thinkingLevel`), not by adding `medium` to `qwen-local.efforts` | the default members table drives `router-golden` (NR-1) | editing the default member (golden drift for `medium` cards) |
| D72 | Breakers (S42): same-test = the same normalized check command fails 3× in a row; diff-apply = 2 consecutive failing `edit`/`write` on one path; verify = 2 red gate check runs of the node; turns = child turns ≥ limit; uncached = `input + cacheWrite` ≥ value | deterministic from tool results and usage (API 3) | parsing test names out of runner output (runner-specific) |
| D73 | Quota headers: Anthropic `anthropic-ratelimit-unified-{5h,7d}-{utilization,reset}`; other providers → unknown; the fallback depends only on quota-wait's absence | design §5.6; headers are a reader, not a gate | per-provider parsers for unused providers |
| D74 | One outcome-log bump, at LF1 (owner's decision); everything after is additive | `docs/outcome-log.md` rule | a bump per milestone |
| D75 | Names: `profile`, `localFirst.*`, `experiments.*`; tools `split`; child tools `submit_split`, `submit_fit`, `submit_correction`; command `/profile`; entries `task-router/{profile,arms,tree,mqueue}` | design §8 leaves names to the builder | — |
| D76 | Checks per level: `checksFor(node)` = the node's check ∪ every merged child's check (dedup by command), run on the rebased tree in the queue's checks step | design §11.24 | re-running every descendant's check (unbounded) |
| D77 | Fit check: one fresh local child after the node's last child merges; advisory; `miss` → tree op `fit` adds a `fix` child to the node's split and one message to the main | design §12.16 | a blocking fit check (superseded r6) |
| D78 | Corrective = a new overseer role `corrective` with `submit_correction`; the hand-off = today's fixer card one tier up | reuses the ticket machinery (`overseer.ts`) | a new contact path beside the overseer |
| D79 | Spot-check sampling is a deterministic draw per unit with `spotCheckShare`, not a factor (no `arms` entry) | design §6: the instrument, not a factor | a factor |
| D80 | The router is loaded only in the main; child facts come from the actor (API v1 events now, API 3 later) | `childtrips.ts` header; design §8 | loading the router into children (two copies compete for the claim) |
| D81 | Local-first is selectable only from R3, the release with the ladder (LF8), the local queue (LF10) and the merge queue (LF11); before it only with `localFirst.experimental: true` (default false; PRO-9); LF12.T10 lifts the gate (orchestrator's call) | without the ladder and the queues a failed check or a racing sibling has no defined path; preview data stays apart (`session.profile` + `routerVersion`) | r1: R2 ships local-first openly (review M1) |
| D82 | Extend, do not replace: `core/profile.ts` keeps `profileFor`, `skillBlocks`, `skillNames`, `BUILTIN_PROFILES` and gains `createRoutingProfile`, `PROFILE_TYPE`; the card-kind `Profile` and `profiles` keep shape and meaning and gain the optional `localFirst.placement` (PRO-10, S34b); the session-level type is `RoutingProfile`; the key `profile` (the design's word, `/profile`, the module option) answers an object value with a problem pointing to `profiles.<kind>`. Migration: none for existing settings (orchestrator's call) | a live module and a live key stay byte-compatible; one place for "profile" code | r1: a new `core/profile.ts` (overwrites the live module, review M6); renaming the concept (the design, the command and the option say profile) |
| D83 | Plan review and integration review are contacts (B1): plan review = bounded, payload = the split JSON + the node's goal and contract, verdict `approve \| amend`, an amendment replaces the unstarted part of the split (tree op `split`, recommitted, one `split` line `reason: review`); integration review = the S39 reviewer by the combined diff's actual size and class, as for leaves; over `large` → the O3 input (numstat, check output, riskiest hunks within `overCapBytes`); each counts one contact (`plan-review`, `integration`); no review point → the integration merges on checks only (TREE-8) (orchestrator's call) | design §5.5 decision 8: these are contact points with budgets; E7–E9 then change behaviour | r1: points decided, contacts not built; Opus on every integration (contradicts E8 and the budgets) |
| D84 | Actor API 3 is specified whole before PS-1 publishes (spec §2.6): `beforeRequest(payload, info)` with `info.requestId`, `info.signal`; Esc, kill, pause and shutdown abort the signal and drop the request; a hook pending > `hookTimeoutMs` lets the request proceed unchanged and emits a `hook` event; `requestId` pairs `beforeRequest`, `afterResponse` and `usage`; detected by `api.policyApi >= 3` (orchestrator's call) | API 3 is published once; a held child must not leak a pending promise or a queue entry | r1: `{name, model}` only (review M5) |
| D85 | `<plans.dir>/split/**` is router-owned: excluded from size (numstat pathspec), class, scope and the review diff; validated by the router (S37). Q26 (accepted by the owner): one commit removes the request's split files on the root branch inside its merge-queue turn, before the checks and the review, so the approval covers the merged tree | a plan node would be elevated by S38's config rule; a removal after the approval forces a re-review (MQ-2) | counting them; removing them after the review |
| D86 | Consumer contract per release: `ENUMS_V2` (`core/outcome.ts`, `{"<event>.<field>": values}`) beside `EVENTS_V2`; PE-n (§15.2) before every release that adds events, enum values or fields (orchestrator's call) | pi-economics' `contract.ts` validates closed sets (`event` `oneOf`, `fallback` literal); a release would fail its `log-contract` | r1: commit messages as the contract (review M2) |
| D87 | E17 measurement: while E17 is enabled, the shadow share in both E17 strata = `localFirst.e17ShadowShare` (default 0.5, equal per arm, owner Q25; other units keep `spotCheckShare`); batched reviews (E4) are never in E17; the harm rule is pre-registered in pi-economics (PA-4, spec §2.7); the switch is the owner's settings (orchestrator's call; δ 3/5 pp and the rate 0.5: owner, Q25) | a 0.1 shadow dilutes detection below any usable rule (review M4) | r1: a Wald 5 pp rule at 10 % (unsound) |
| D88 | API 3 is required for local-first: the module asserts it and the runtime refuses local-first below it (one notice, cloud-first), except under `localFirst.experimental` (a degraded preview, XR-2) | one rule for both install paths; no data from a half profile | r1: the module asserts while the runtime degrades (review m9) |
| D89 | Classifier proxies (X41): the policy file holds `{inertGlobs, testGlobs, ciGlobs, riskGlobs, configGlobs, publicApiGlobs, componentDepth}`; a component = the first `componentDepth` directories of a path (a root file's component is ""; default 1; a `packages/*` monorepo sets 2); every proxy that fired is logged (`classBy` on `merge` and `review`) | "settable in the policy file" made true; single-top-dir monorepos covered; misclassing is measurable | top-level directories only (never fires in `packages/…`) |
| D90 | Ungated local output (CON-8 ii) = children placed local by kind (PRO-10 b, `meta.ungated`), never package children; the artifact = the child's final report as delivered to the main (X44); the shadow reviewer gets the brief, the report and read-only tools | defines the unit and the payload | sampling package children (their gate already reviews them) |
| D91 | quota-wait contract (QW-1) is router-proposed: events on `pi.events` channel `quota-wait:v1` (design §5.6's `quota-wait:*`), detection and the current waits through `globalThis.__quotaWait_v1 = {version: 1, waits()}` | reconciles the design and the draft; the router needs no subscribe API | two subscription paths |
| D92 | `core/strategy/local-first.ts` (the composition) is a shared file: a lane adds its parts there only in one wiring task, serialised with the other lanes (§15.1) | parallel lanes do not collide on it | each part task edits it |
| D93 | Who is in E0 and what `localMembers` says (LF1 review M1, M2; orchestrator's call): (a) E0 is drawn only in a main session with an id (no child, no empty id) while routing is on (`routing` and the actor's spawn-policy API) and the member table has at least one enabled cloud member (`route` other than `local`); any other session writes its `session` line without `localMembers` and draws nothing; (b) a `/force` (command or settings) onto a local member in a cloud-only session is allowed, the owner's override: its spawn line carries `forced: true` and analysis excludes forced spawns; (c) `localMembers: off` = the router routed no spawn of the session to a local member (forced spawns excluded); (d) a cloud-only session that is asked for a local model by name, or whose plan only a local member could meet, is refused with the cause "cloud-only session (E0): local members are off" | an explicit `model`, a force and `routing: false` bypass the router's placement, so the arm cannot claim them; a table of local members only would lose every delegation in a drawn session (the default share is 0.1) | draw E0 whatever the table (a local-only table loses all delegation in 10 % of sessions); forbid a force in a cloud-only session (it removes the owner's override); keep "no spawn ran on a local member" (false for a force) |

## 4. Where design and code disagree (verify before the task)

| # | Point | Resolution |
|---|---|---|
| X33 | Design §5.7 assumes the main's request can be held; pi 1.4 must await `before_provider_request` handlers, and `extensions.md` says provider hooks run "only when that transport exposes the corresponding stage" | LF1.T0's `pi-hooks` check proves awaiting, payload rewrite and response headers on `openai-completions` and `anthropic-messages` before any task relies on them; a failure → stop and report (R16). Verified by LF1.T0 (pi 1.4.0, the locked nixpkgs): on both transports the hook is awaited (a 300 ms hold delays the request), its returned payload is sent, `after_provider_response` gets the status and the headers |
| X34 | "Uncached input" for llama.cpp: pi's openai-completions usage mapping (`input` = prompt − cached?) | read pi's provider before LF12.T8; D72 adjusts the sum |
| X35 | Quota header names (D73) are from knowledge, not from a captured response | fixtures use them; G13 (owner) captures one response; a mismatch is one constant |
| X36 | The budget field: `compat.thinkingTokenBudgetField` per model (K6.11), default `thinking_budget_tokens` (K6.12) | LF12.T4 reads it from the registry |
| X37 | Existing tests that change: (a) `flags`, `local-prompt`, `review-log`, `rule` stub `__piExperimentsApi_v1` — the stubs go, flag cases use settings (LF1.T1b, T1c, owner decision); (b) `outcome.test.ts` `v: 1` literals and spawn `arm` (LF1.T2); (c) at LF19 the local-mode cases for the gate size refusal (`local-merge-refuse`, `local-merge-plan`), the `localSection` text (`local-prompt`), the session overseer budget and steer default (`local-overseer`, `local-overseer-shell`, `local-steer`), fixer rounds (`local-fixer`); (d) snapshot lists of `ROLES`/`REASONS`/`TRIPS` grow; (e) `local-default`'s key inventory gains `experiments` (LF1.T4) and `localFirst` (LF3.T2); (f) `test/fake-api.ts` grows for API 3 (LF7.T2): consumer-visible, since `test/harness.ts` imports it and pi-economics' `log-contract` imports the harness — additive only, named in PE-3 (g) the harness' default settings pin `experiments.cloudOnlyShare: 0` (LF1.T4a); the default-mode cases that assert on whole line lists and fire `session_start` (`test/shell.test.ts:21, 56, 70`; `policy.test.ts:132, 287, 439`; `unrouted.test.ts:22–64`) keep their assertions; (h) `local-plan-guard` "AC-L2 plan": its expected `plan` line gains `sessionId: "s-main"` (LF6.T7, owner's decision PA Q1: the gate's lines carry the main session's id, an additive optional field on a legacy line too; recorded by review lf56 m8) | each named in its task with the reason |
| X38 | Design §7.4 "children keep the `isChild` guards": the router is not loaded in children (D80) | the guards stay for the main's hooks; child-side gating goes through the actor |
| X39 | Gap 19 "fold through the folding extension's per-model settings or a hint" | a hint only; the router depends on no pi-economics component |
| X40 | "Queue persisted in the main's tree state" (§5.2) | a separate entry type `task-router/mqueue` in the main's session: same persistence, simpler replay |
| X41 | Classifier triggers "≥ 3 coupled files", "weakened tests", "multi-component config" have no definition | deterministic proxies in S38; their globs and `componentDepth` are policy-file keys (D89); "weakened tests = deleted > added" misses weakening at equal counts, accepted as a stand-in; the proxy that fired is logged (`classBy`) |
| X42 | `sizeOf` (`merge.ts:38`) measures commits only | the gate keeps it; hints add worktree and untracked lines (SIZE-2, LF5.T3) |
| X43 | Design §5.1 "`/model` before the start hook" is unobservable: the router's body runs at `session_start` (`index.ts:11`, `guardSingleCopy`) | PRO-4 tests the model flag and the resumed session's model only; LF3.T6 reads how pi 1.4 exposes the flag (`pi.getFlag` or the startup model) first. LF3.T6 found no accessor: `userChoseModel` reads `process.argv` for the exact forms `--model <x>` and `--models <x>` (pi 1.4's `parseArgs` takes no `--model=x` and no `-m`) and the branch for a resumed model. Residual argv edges, accepted and unpinned (LF3 review F): (i) `--model` or `--models` as the last argument: pi ignores it, the router counts it as a choice; (ii) arguments after `--` are still read as flags; (iii) an SDK host (pi-web) passes its own `process.argv`, so the router may override a model the host chose; (iv) `/new` after a `/model` in the same process starts a new session whose `session_start` sets the start model again |
| X44 | CON-8 (ii)'s artifact: the router (main only, D80) must read a child's final report | LF8.T16 starts by reading how the actor delivers it into the main's session (entry type and fields); absent → the sample covers the brief and the actor's `AgentInfo` only, and R25 records it |
| X45 | Holding the main's request needs an abort path: `ctx.signal` inside `before_provider_request` | LF1.T0 (iv) checks it; absent → the main's hold is bounded by `localFirst.localQueue.mainHoldSec` (600) and then proceeds with one `lqueue` line `outcome: timeout`. LF1.T0 (iv): `ctx.signal` is an `AbortSignal` inside the hook on both transports (its abort on Esc is not exercised offline; G17) |
| X46 | QW-1 cites a quota-wait design that exists only as a draft in pi-economics' work area | the contract is router-proposed (D91); LF9.T4 tests against a fake; a published change is one task |

## 5. Gate (AGENTS.md rules)

| Rule | Result |
|---|---|
| Tests first; a new check seen red once | PASS — every task has RED; §11 lists a plant per new test file |
| Rendered-text matching rules | PASS — only the module-eval cases match text; they compare assertion lists (no `match`/`hasInfix`) |
| Assertion messages `pi-task-router:` + negative case | PASS — LF7.T3 adds one assertion with its case; LF19.T7a changes the `localMode.enable` assertion with its case |
| No import-from-derivation | PASS — the module reads option values |
| Leak check | PASS — fixtures: user `u`, `http://localhost:8080`, `x.invalid`; no paths in log fields |
| Boundary names | PASS — members keep their neutral default names; no consumer extension is named |
| iface copies of the actor API | PASS — LF7.T1 updates the copy with the lock bump; no `tsconfig.json` |
| `flake.lock` only when needed | PASS — only LF7.T1 (pi-setup API 3) |
| Root `package.json` via `nix run .#render` | PASS — release tasks only |
| Runtime guard; nothing outside the guarded body; no flags/providers in it | PASS — `/profile`, `split`, the hooks register in the body; tools for a cloud-first default register at the first switch |
| Claim protocol frozen | PASS — untouched (NR-4) |
| Package checks (`PI_TIMING`) | PASS — no new extension; the new `pi-hooks` check (LF1.T0) runs pi 1.4 offline with a probe extension and a `localhost` fake server, like `checks/pi-package/` |
| README checks | PASS — release tasks update the install line; LF19.T8 adds the `localMode.enable` migration note |
| Consumers outside (outcome log, `log-contract` exports) | PASS with a note — LF1's bump breaks pi-economics until PE-1; every release that adds events, enum values or fields has its PE-n (D86); exports only grow (LOG-4) |

Complexity tracking: D59 keeps two local paths alive until LF19 (need: the regression net for the shared gate
code and the published `localMode.enable` path; the simpler alternative, an in-place change, is rejected in
D59). D81 keeps an experimental gate until R3 (need: no open local-first without its failure paths; the
simpler alternative, shipping it open at R2, is rejected in D81).

## 6. Files to read first (listed, not read by the planner)

`AGENTS.md`; `docs/local-first/design.md` §5–§12; `docs/local-first/spec.md`; `docs/outcome-log.md`;
`docs/task-router.md`; `docs/local-mode/design.md` (LD7, N1, N4); `docs/local-mode/merge-gate-sizing.md`
§2.1; `docs/local-mode/limitations.md` (G1–G10); P13 §7. Code: `core/shell.ts`, `core/local/install.ts`,
`merge.ts`, `overseer.ts`, `branchtool.ts`, `worktree.ts`, `gitcmd.ts`, `childtrips.ts`, `tripwires.ts`,
`hints.ts`, `branches.ts`, `plans.ts`, `planflow.ts`, `steer.ts`, `core/policy.ts`, `core/api.ts`,
`core/outcome.ts`, `core/log.ts`, `core/settings.ts`, `core/types.ts`, `core/prompt.ts`,
`core/randomize.ts`, `core/spotcheck.ts`, `core/forceinstall.ts`; tests `test/harness.ts`, `fake-pi.ts`,
`fake-api.ts`, `fake-git.ts`, `git-repo.ts`, `merge-rig.ts`, `overseer-rig.ts`, `rand.ts`, `text-free.ts`;
`modules/task-router.nix`, `checks/module-eval/cases/task-router.nix`; pi 1.4 `docs/extensions.md` (hooks).

## 7. Commands

    F=git+file://$PWD o=(--option eval-cache false) cap=$((20 * 1024 * 1024))
    chk() { for c in "$@"; do (ulimit -v $cap && exec timeout -s KILL 900 nix build --no-link -L "$F#checks.x86_64-linux.$c" "${o[@]}") || echo "FAILED $c"; done; }
    # fast loop (no tsc locally; types only through chk typecheck-task-router)
    cd packages/task-router && HOME=$(mktemp -d) node --test --experimental-strip-types test/<file>.test.ts
    # milestone end: every check
    bash <loop-router.sh> <worktree> <log prefix>    # prints "DONE n checks, f failed"

Keep-green sets: **KG-R** `task-router typecheck-task-router router-golden`; **KG-I**
`iface-subagents-task-router iface-policy-task-router iface-subagents-runtime-guard`; **KG-M** `module-eval`;
**KG-S** `leak boundary`; **KG-P** `render-package pi-package-manifest home-files pi-install-smoke
pi-install-actor pi-install-local pi-install-duplicate nix-route-smoke readme`. Every task: KG-R; module
tasks KG-M; doc tasks KG-S; release tasks all (the loop).

## 8. Type-checking strategy

`typecheck-task-router` (strict tsc over `core/` and `test/`) after every GREEN. Expected rejections:
`Record<FactorId, …>` tables missing a factor; a `Strategy` missing a part; non-exhaustive `switch` over
`LadderStep`, `RiskClass`, `Tier`, `ContactKind`, `NodeKind` (`const _: never = x`); an event builder given a
field of another event (per-event input types); the API 3 copy differing from pi-setup's (KG-I).

## 9. Testing strategy per layer

| Layer | Covers | Needs |
|---|---|---|
| Strategy units | tiers, classifier, reviewer, points, ladder, breakers, quota rule, brief, draws | `node --test`, tables and properties with `test/rand.ts` (seeded) |
| Mechanism units | profile, arms and tree stores, split validation, queues, quota parser, serving, thinking payload | `fake-pi` entries, a fake clock, a fake `fetch`, a fake `__quotaWait_v1` |
| Git integration | split commit, parent branching, rebase, ff-only, numstat, policy at base, revert fields | `test/git-repo.ts` (real git, temp dirs) |
| Shell integration | hooks, tools, command, lines | `test/harness.ts`, `fake-pi`, `fake-api` (extended for API 3 in LF7.T2: `requestId`, an `AbortController` per held request, a timeout knob) |
| Transport | pi's provider hooks on both transports (X33, X45) | `pi-hooks` (LF1.T0): pi 1.4 offline, a `localhost` fake server |
| Golden | cloud-first routing | `router-golden`, never re-recorded (NR-1) |
| Module | profile option, API 3 assertion (with the experimental exception), the `localMode.enable` migration | `module-eval` cases |
| Interface | the actor API copy | KG-I |
| Package | install paths | KG-P, unchanged (no new extension) |
| Live | — | N/A: design §5.7 forbids agent-run live tests; owner runbooks G11–G16 (§12) |
| Consumer | pi-economics reading v2 | its `log-contract` against each release commit (PE-1…PE-6, `--override-input`), not here |

## 10. Scenario coverage (REQ → task; the check is the spec's)

| REQ | Task | REQ | Task | REQ | Task | REQ | Task |
|---|---|---|---|---|---|---|---|
| NR-1 | every task (KG-R) | NR-2 | LF1.T1a, T2 | NR-3 | LF1.T1 | NR-4 | every task |
| NR-5 | LF10.T2 | NR-6 | LF3.T1 | NR-7 | every task to LF18 | RET-1 | LF19.T1–T7 |
| MEAS-1 | LF1.T5 | MEAS-2 | LF1.T9, T9a, LF2.T7, LF3.T5 (the `/profile` switch) | RND-1 | LF2.T1 | RND-2 | LF1.T8 |
| RND-3 | LF2.T3 | RND-4 | LF2.T2 | RND-5 | LF2.T5 | RND-6 | LF2.T6 |
| RND-7 | LF18.T6 | RND-8 | LF1.T2 | PRO-1 | LF3.T2 | PRO-2 | LF3.T5 |
| PRO-3 | LF3.T3 | PRO-4 | LF3.T6 | PRO-5 | LF3.T6 | PRO-6 | LF4.T10 |
| PRO-7 | LF3.T7 | PRO-8 | LF3.T8 | HM-1 | LF3.T9, LF7.T3, LF19.T7a | TREE-1 | LF4.T7 |
| TREE-2 | LF4.T2 | TREE-3 | LF4.T1, T3 | TREE-4 | LF4.T4, T5 | TREE-5 | LF4.T8 |
| TREE-6 | LF4.T12 | TREE-7 | LF4.T11a–f | TREE-8 | LF11.T8, T8c | TREE-9 | LF11.T9 |
| TREE-10 | LF8.T5 | TREE-11 | LF4.T6 | TREE-12 | LF4.T9, LF18.T4 | TREE-13 | LF4.T13 |
| SIZE-1 | LF5.T1 | SIZE-2 | LF5.T3, T3a | SIZE-3 | LF5.T2, LF14.T1 | SIZE-4 | LF5.T4 |
| SIZE-5 | LF5.T6, T7 | SIZE-6 | LF5.T5, T6 | SIZE-7 | LF6.T5 | SIZE-8 | LF5.T9, T10, LF11.T8d |
| SIZE-9 | LF5.T11 | SIZE-10 | LF5.T8 | CLS-1 | LF6.T1, T1a | CLS-2 | LF6.T4 |
| CLS-3 | LF6.T2 | CLS-4 | LF6.T3 | REV-1 | LF6.T5, T8 | REV-2 | LF6.T6 |
| REV-3 | LF6.T10 | REV-4 | LF6.T9 | REV-5 | LF18.T5, LF16.T2 | REV-6 | LF18.T6 |
| REV-7 | LF18.T7 | REV-8 | LF6.T12 | REV-9 | LF6.T13, LF9.T8 | REV-10 | LF6.T11 |
| CON-1 | LF8.T3 | CON-2 | LF8.T2 | CON-3 | LF8.T4 | CON-4 | LF8.T5 |
| CON-5 | LF8.T6, T7 | CON-6 | LF8.T10 | CON-7 | LF8.T12 | CON-8 | LF8.T15, T16 |
| CON-9 | LF8.T17, T18 | CON-10 | LF8.T13 | CON-11 | LF8.T14 | Q-1 | LF9.T1, T3 |
| Q-2 | LF9.T4 | Q-3 | LF9.T5 | Q-4 | LF9.T6, T7 | LOC-1 | LF10.T1 |
| LOC-2 | LF12.T1 | LOC-3 | LF12.T2–T4 | LOC-4 | LF8.T9 | LOC-5 | LF12.T5–T8 |
| LOC-6 | LF10.T3, T5, T6 | LOC-7 | LF13.T1, T2 | LOC-8 | LF10.T2 | MQ-1 | LF11.T1, T5, T5a |
| MQ-2 | LF11.T4 | MQ-3 | LF11.T6 | MQ-4 | LF11.T2 | MQ-5 | LF11.T7 |
| LOG-1 | LF1.T6, T7 | LOG-2 | LF1.T3 (+ builders per milestone) | LOG-3 | LF1.T3 | LOG-4 | LF1.T3 (+ `ENUMS_V2`/`FALLBACKS` per builder) |
| XR-1 | LF7.T1 | XR-2 | LF7.T2, LF13.T2 | XR-3 | LF7.T2, LF10.T5, T6 | PRO-9 | LF3.T2, T5, T9, LF12.T10 |
| PRO-10 | LF3.T2a, LF4.T12 | TREE-14 | LF4.T12a | CON-12 | LF8.T4a–c | CON-13 | LF11.T8a, T8b, T8d |
| CON-14 | LF11.T8c | REV-11 | LF18.T5a | | | | |

Every REQ of spec §3 appears above; the factors' end-to-end tasks (LF14–LF18) cover RND-1/RND-4 for their
factors with `enabled` by settings.

## 11. Planted violations (one per new test file; tick when the red was seen)

| Check (test file) | Plant | Must FAIL | Seen |
|---|---|---|---|
| `lf-default` NR-3 | a comment-free `globalThis.__piExperimentsApi_v1` read left in `shell.ts` | the source scan | [x] |
| `outcome` RND-8 | `spawnEvent` keeps `arm` (after LF1.T1 no caller passes one, so NR-2 "cloud-first lines" cannot see it) | "RND-8 v2" | [x] |
| `lf-default` NR-2 | the shell writes a second `session` line at share 0.1 | "NR-2 the session line is the only new line" | [x] |
| `lf-outcome` | a builder copies `goal` text into a field | LOG-3 text-free | [x] |
| `lf-session-log` | write `session` in cloud-first with share 0 | MEAS-1 | [x] |
| `lf-merge-log` | `repoId` from `HEAD` instead of the root commit | LOG-1 | [x] |
| `lf-arms` RND-2 | `unit` dropped from the hash input | determinism-by-unit frequencies | [x] |
| `lf-arms` RND-3 | `id` dropped from the hash input | the joint-frequency property | [x] |
| `lf-arms-shell` RND-5 | draw from live settings instead of the snapshot | the resume property | [x] |
| `lf-e0` | cloud-only arm keeps `route: "local"` members | MEAS-2 | [x] |
| `lf-e0` | the force looks its member up in the cloud-only view | "MEAS-2 force" | [x] |
| `lf-e0` | E0 drawn with routing off, with no cloud member, or with the explicit local model's old refusal text | "MEAS-2 routing off", "MEAS-2 eligibility", "MEAS-2 refusals" | [x] |
| `lf-e0` (LF3.T5) | a `/profile` switch redraws or drops the `cloud-only` arm | "MEAS-2 profile switch" | [x] |
| `lf-arms` RND-2 | the hash shifts 10 bits, not 11 | "RND-2 known answers" | [x] |
| `lf-outcome` | the shell writes `localMembers: "other"` | LOG-4 | [x] |
| `lf-session-log` | the draw uses `Math.random` | "MEAS-1 resume" | [x] |
| `lf-seams` NR-6 | `core/local/merge.ts` imports `core/strategy/tiers.ts` | the import scan | [x] |
| `lf-settings` PRO-1 | `mode: "local"` overrides `profile` | PRO-1 | [x] |
| `lf-profile` | restore takes the first entry | PRO-3 | [x] |
| `lf-start-model` | `setModel` also on `model_select` | PRO-5 | [x] |
| `lf-prompt` | the section omits the tier budget | PRO-8/SIZE-9 | [x] |
| `lf-tree` | `maxDepth` compared with `<` instead of `≤` | TREE-2 | [x] |
| `lf-split` / `lf-split-git` | the commit takes every staged file (`commit -a`) | TREE-4 commit (a staged unrelated file stays uncommitted) | [x] |
| `lf-tree-git` | the base stays the main tip | TREE-1 | [x] |
| `lf-start-child` | a slug may start twice | TREE-5 | [x] |
| `lf-placement` | `cwd` = the main's cwd | TREE-6 | [x] |
| `lf-merge-target` | target = the main branch | TREE-7 | [x] |
| `lf-tree-log` | `split` line without `depth` | TREE-11 | [x] |
| `lf-top-plan` | the root split stored on the main branch | TREE-12 | [x] |
| `lf-tiers` | elevated not capped | SIZE-1 | [x] |
| `lf-tiers-git` | untracked files not counted | SIZE-2 | [x] |
| `lf-start-refusal` | inert estimates refused | SIZE-4 | [x] |
| `lf-size-hints` | the guard returns `{block: true}` at 100 % | SIZE-5 | [x] |
| `lf-overcap` | the riskiest hunk exceeds `overCapBytes` | SIZE-8 | [x] |
| `lf-classify` / `lf-classify-git` | the policy read from the branch tip | CLS-2 | [x] |
| `lf-reviewer` | `min` instead of `max` strength | REV-1 property | [x] |
| `lf-reviewer-gate` | the advisory verdict blocks | REV-4 | [x] |
| `lf-contacts` / `-shell` | the counter not persisted | CON-2 after resume | [ ] |
| `lf-ladder` | split offered after a child merged | TREE-10 | [ ] |
| `lf-breakers` | diff-apply counts non-consecutive failures | CON-5 | [ ] |
| `lf-corrective` | the payload carries the full transcript | CON-6 (payload shape) | [ ] |
| `lf-ladder-shell` | steer spawned with E11 ≠ steer | CON-10 | [ ] |
| `lf-spotcheck` | the spot verdict gates the merge | CON-8 | [ ] |
| `lf-batching` | an elevated leaf batched | CON-9 | [ ] |
| `lf-quota` / `-shell` | the notice repeats per session | Q-2 | [ ] |
| `lf-facts` | the member copy wins over the registry | LOC-1 | [ ] |
| `lf-serving` | a global `fetch` used | NR-5 | [ ] |
| `lf-lqueue` | the affinity extends to another session | LOC-6 (no two holders) | [ ] |
| `lf-mqueue` / `-git` / `-shell` | the lock released before the ff | MQ-1 interleaving property | [ ] |
| `lf-integration` | only the parent's check runs | TREE-8 | [ ] |
| `lf-fit` | a `miss` refuses the merge | TREE-9 | [ ] |
| `lf-thinking` | the field set without the build check | LOC-3 | [ ] |
| `lf-context` | the fold hint inside a package | LOC-5 | [ ] |
| `lf-lean` | the lean brief drops the forbidden list | LOC-7 property | [ ] |
| `lf-api3` | API 2 → a throw instead of the notice | XR-2 | [ ] |
| module-eval `task-router-local-first-needs-api-3` | the assertion removed | the negative case | [ ] |
| `pi-hooks` (LF1.T0) | the probe's hook returns at once and sets `x_probe` after a `setTimeout` | (i) awaited and (ii) rewritten fail on both transports | [x] |
| `lf-default` NR-2 v1 capture (LF1.T1a) | the fixture empty | the capture case | [x] |
| `lf-merge-target` TREE-7 base (LF4.T11b) | `behind` keeps `main.sha` | a child cut after main moved is refused `behind` | [x] |
| `lf-merge-target` TREE-7 no push (LF4.T11d) | the node→parent merge calls `pushPort` | the fake remote records a push | [x] |
| `lf-merge-target` TREE-14 (LF4.T12a) | the scope check only for `plan`-bound branches | a path outside the package's `files` merges | [x] |
| `lf-settings` PRO-9 (LF3.T2) | `experimental` ignored | local-first active without it before LF12.T10 | [x] |
| `lf-settings` PRO-10 (LF3.T2a) | `localFirst` added to the built-in `scout` without `placement` | the built-in table case; the snapshot property catches a changed `tools` | [x] |
| `lf-planreview` CON-12 | children start before the verdict | "ticket" (no child before the verdict) | [ ] |
| `lf-planreview` amend | the amendment replaces started children | the started-slug case and the TREE-3 property | [ ] |
| `lf-integration` CON-13 | the integration reviewer from the leaf's drawn tier, not the combined diff's actual size | the reviewer property | [ ] |
| `lf-integration` CON-14 | a ticket for every node merge | the "ticket iff `integrationReview`" property | [ ] |
| `lf-integration` over-cap | the full diff sent, no `overCap` | input ≤ `overCapBytes`, `overCap: true` | [ ] |
| `lf-spotcheck` REV-11 | the E17 shadow drawn with `spotCheckShare` | the 0.5 frequency per arm | [ ] |
| `lf-api3` XR-3 | the fake ignores `signal` | the aborted hold settles | [ ] |
| `lf-lqueue` XR-3 (LF10.T6) | an aborted waiter stays queued | the next waiter is granted at once | [ ] |
| `lf-outcome` ENUMS_V2 | a builder writes `kind: "other"` | the `∈ ENUMS_V2` assertion | [x] |
| `lf-arms-shell` stage n (LF14–LF18) | a factor drawn without its `enabled` setting | the "without the settings → no arm" case | [ ] |
| module-eval `localMode.enable` (LF19.T7a) | the option still sets `mode = "local"` | the expected HM-1 b list | [ ] |
| `lf-session-log` MEAS-3 (R3A.T1) | the shell writes the settings' share instead of the snapshot's | the resume case | [x] |
| `lf-split` TREE-15 (R3A.T2) | `splitNow` passes no contract | the `src/other.ts` refusal | [x] |
| `lf-e0` MEAS-4 (R3A.T3) | the cloud-only arm's logging plan shares the router's `attempts` (plant 1), or draws from its random stream (plant 2) | "MEAS-4 logging changes no routing" | [x] |

## 12. Coverage gap and manual runbooks (owner-run, before any live arm; G1–G10 first)

Not reached by the checks: a real llama-server, a real actor, real provider headers, real git hosts.

- **G11 thinking budget**: one local-first session with E12 forced `medium`, E13 `16k`; llama-server's log
  shows the request's `thinking_budget_tokens` and the reply's reasoning ends below it.
- **G12 local queue**: main on the local model plus one package child; llama-server's `/slots` never shows
  two processing tasks; the outcome log has `lqueue` lines.
- **G13 quota headers**: one cloud review; the router's `quota` line shows `source: headers` and a
  utilization; else fix D73's constant.
- **G14 a two-level tree**: one request split into two packages, one further split; `node`/`split`/`merge`
  lines form the tree; the main branch gets one ff merge.
- **G15 lean child**: E18 forced `lean`; the child's session shows no context files and ≤ 12 tools.
- **G16 merge queue**: two siblings request merges into one parent in one turn; one `rereview: true`.
- **G17 abort while held**: a local package child held in the local queue behind the main; Esc in the main,
  then `kill` of the held child: the held request never reaches llama-server (its `/slots` shows one task),
  the `lqueue` line says `aborted`, the next waiter proceeds; with `hookTimeoutSec` set to 30 a hold past it
  proceeds and logs `timeout`.
- **G18 the experimental preview (R2)**: `localFirst.experimental = true` on API 2: the notice once, local
  children placed, no `beforeRequest`; `session.profile = "local-first"` with `routerVersion` 0.4.x, so
  pi-economics keeps preview data apart. Its non-leaf merges (LF4.T11a–f) take the leaf review path; the integration contact and the combined-diff review arrive with LF8 and LF11 (R3).

## 13. Snippets

**S31 — `core/strategy/types.ts`**

```ts
export type RoutingProfile = "cloud-first" | "local-first";   // the card-kind `Profile` (core/types.ts) is another type (D82)
export type Tier = "small" | "standard" | "large" | "inert";
export type RiskClass = "inert" | "standard" | "elevated";
export type NodeKind = "leaf" | "plan" | "integration" | "fix";
export type ReviewerName = "haiku" | "sonnet" | "opus" | "qwen";
export type Arms = Readonly<Record<string, string>>;           // factorId → level (enabled factors only)
export interface ReviewerChoice { reviewer: ReviewerName | "none"; binding: boolean; fresh: true; orthogonal: boolean; stratum?: "small" | "inert-like" }
export interface Strategy {
  sessionTier(a: Arms): Exclude<Tier, "inert">;
  tierBudget(t: Tier, c: RiskClass): number;                   // Infinity for inert
  tierOfLines(lines: number): Exclude<Tier, "inert"> | "over";
  treeCaps(a: Arms): { maxDepth: number; maxChildren: number; planLines: number };
  classify(files: readonly FileFact[], p: Policy): { cls: RiskClass; inertLike: boolean; why: string[] };
  reviewer(i: { cls: RiskClass; actual: Tier | "over"; inertLike: boolean; review: Arms }): ReviewerChoice;
  points(n: NodeFacts, a: Arms): { planReview: boolean; integrationReview: boolean; rounds: number };
  ladder(s: LadderState, a: Arms): LadderStep;
  breaker(c: Counters, l: BreakerLimits): Trip | undefined;
  quota(q: QuotaView, ask: ContactAsk): QuotaDecision;
  child(a: Arms): { effort: "xhigh" | "medium"; budget?: number; brief: "full" | "lean" };
  context(a: Arms): { childSoft: number; mainSoft: number; mainFold: number; uncached: number };
}
```

**S32 — `core/strategy/draw.ts`, `arms.ts`**

```ts
export const draw = (seed: string, id: string, unit: string): number =>   // u ∈ [0, 1)
  Number(BigInt("0x" + sha256hex(`${seed}\0${id}\0${unit}`).slice(0, 16)) >> 11n) / 2 ** 53;
export const pick = <L extends string>(levels: readonly L[], w: readonly number[], u: number): L => {
  const s = w.reduce((a, b) => a + b, 0); let acc = 0;
  for (let i = 0; i < levels.length; i++) { acc += w[i] / s; if (u < acc) return levels[i]; }
  return levels[levels.length - 1];
};
export interface Factor { id: FactorId; unit: "session" | "review" | "child" | "request" | "node" | "package" | "ladder"; levels: readonly string[]; weights: readonly number[]; from: string; enabled: false }
export const FACTORS: Readonly<Record<FactorId, Factor>>;     // spec §2.8; `from` = the release completing its mechanism; never enabled by code (D63)
export const assign = (snap: ExperimentsSnapshot, id: FactorId, unit: string): string;  // disabled → levels[0]
```

`sha256hex` = `node:crypto` `createHash("sha256")` (pure: no I/O).

**S33 — arms on lines**: `createOutcomeLog(…, { arms: () => string[] })`; `append(ev, unitArms = [])` sets
`ev.arms = [...new Set([...sessionArms(), ...unitArms])].sort()` iff `armed()` (the session is local-first);
the `session` line always carries the session's arms (E0 in cloud-first); unit arms come from the builder's
caller (`assign` for E3, E12, E13, E17, …).
Until LF14 (unit arms, LF14.T1) the lines carry only session arms: the `session` line and, on a local-first session, every line (S33 with `unitArms` empty). A review-unit factor (E3, E17) has no arm on any line before LF14. Since LF14.T1 the gate's `review` lines carry the review's own arms (`log.review(i, unitArms)`, `RunArgs.arms`, `NodeDeps.reviewArms`); no other line has a unit arm yet.

**S34 — `core/profile.ts` (extended, D82)**: `createRoutingProfile(settings, append)` → `{ current(): RoutingProfile | "local-mode";
restore(branch: Entry[]): void; set(p, by): void }`; `restore` = last `task-router/profile` entry's
`profile`, none → `settings.profile ?? (settings.mode === "local" ? "local-mode" : "cloud-first")`.
`/profile` handler: no argument → `ctx.ui.notify(current)`; a valid name → `set`, one `profile` line,
`ensureLocalTools()` the first time, `pi.setActiveTools` per S34a. S34a: local-first tools =
`start_branch request_merge split plan_request amend_plan`; switching to cloud-first removes them from the
active set (they cannot be unregistered). `set("local-first")` refuses while the gate of D81 holds (PRO-9)
or the actor is below API 3 without `experimental` (D88).

**S34b — card kinds in local-first** (`Profile.localFirst?: {placement: "local" | "cloud"}`; built-ins):
`scout`, `lookup`, `mechanical`, `implement`, `debug-design` → `local`; `review`, `plan` → `cloud` (the
reviewer table and E16 decide those). A `package` card is placed by the tree (TREE-6) whatever its kind; a
`t2` card goes to the cloud whatever its kind.

**S35 — `core/local/tree.ts`**

```ts
export interface Node { id: string; parent?: string; depth: number; kind: NodeKind; branch: string; worktree: string;
  base: string; profile: Profile; estimate: Estimate; state: "active" | "split" | "merged" | "blocked" | "abandoned";
  split?: SplitPlan; started: string[]; merged: string[]; contacts: Record<ContactKind, number>; ladder: LadderStep[]; effort: "xhigh" | "medium" }
export type TreeOp =
  | { op: "add"; node: Node } | { op: "state"; node: string; state: Node["state"] }
  | { op: "split"; node: string; plan: SplitPlan } | { op: "contact"; node: string; kind: ContactKind }
  | { op: "ladder"; node: string; step: LadderStep } | { op: "fit"; node: string; child: SplitChild };
export const apply = (t: Tree, o: TreeOp): Tree;      // pure; unknown node → t unchanged + problem
export const replay = (ops: readonly TreeOp[]): Tree; // = ops.reduce(apply, empty)
export const canSplit = (t: Tree, id: string, n: number, caps: Caps): string | undefined; // reason or ok
```

Depth: the request node 0; `canSplit` refuses when `node.depth + 1 > caps.maxDepth` or `n > maxChildren`.

**S36 — `task-router/tree` entries**: one `TreeOp` per entry, `{v: 1, …op}`; restore =
`replay(entries.filter(type === TREE_TYPE).map(e => e.data))`.

**S37 — split validation** (`validateSplit(plan, node, caps) → string[]`, one reason per violation, in
order): `summary` non-empty ≤ 400; `1 ≤ children.length ≤ caps.maxChildren`; slugs match and are unique;
each `goal` ≤ 400; `files` 1–30, no `..`, not absolute; `estimate.lines` integer ≥ 0, `kind` valid; `check`
non-empty; the node is `active` and not yet split; `depth + 1 ≤ maxDepth`. Rendered line count > `planLines`
is not a violation: one `crossing` (kind `plan`).

**S38 — classifier** (per file; the change's class = max; any error → `elevated`):
elevated iff `riskGlobs` ∪ `ciGlobs` (default `.github/**`, `.gitlab-ci.yml`, `flake.nix`, `flake.lock`,
`**/Dockerfile`) ∪ gate config (`policyFile`, `.pi/**`, `**/task-router*.json`) ∪ `plans.publicApiGlobs`
match; or a test-glob file with `deleted > added` or deleted (weakened tests); or ≥ 3 changed code files in ≥ 2
top-level components (coupled, X41); or config files (`**/*.json`, `**/*.toml`, `**/*.yaml`, `**/*.yml`, `**/*.nix`: a glob is
anchored, so `**/` reaches below the root) in ≥ 2 components (multi-component config). inert iff MGS §2.1 (`inertGlobs`, its exclusions) and ≥ 1
`extraChecks` entry passes (CLS-3). inert-like iff every file inert, or every file in `testGlobs` ∪
`inertGlobs`. Policy (D89) = `{inertGlobs, testGlobs, ciGlobs, riskGlobs, configGlobs, publicApiGlobs,
componentDepth}` from `git show <base>:<policyFile>`, absent → settings (`componentDepth` 1); a parse error →
elevated. A component = the first `componentDepth` directories of a path (a root file's is ""). Built-in defaults, constants in
`core/local/policyfile.ts` behind `settingsPolicy(s)` (not settings keys; the policy file overrides them): `testGlobs`
`**/test/**`, `**/tests/**`, `**/__tests__/**`, `**/*.test.*`, `**/*_test.*`, `**/*.spec.*`; `ciGlobs` as above plus `.ci/**`;
`configGlobs` as above; `inertGlobs` = the setting `mergeGate.inertGlobs` (MGS §2.1's list). One kind per file: a config file
under a test glob is a test, not config; instruction and plan files are code for `coupled` (never inert, never inert-like).
Only a proven absence of the policy file falls back to the settings: an unresolvable base, a git failure, a directory or
symlink at the path → error (elevated); the file is read at the sha the base resolved to. The file list excludes
`<plans.dir>/split/**` (D85); an empty list → inert-like. Result `why: string[]` = every proxy that fired
(`risk`, `ci`, `gate-config`, `public-api`, `weakened-tests`, `coupled`, `multi-component-config`,
`policy-edit`, `error`), logged as `classBy`.

**S39 — reviewer** (`strength`: none 0 < haiku 1 = qwen-advisory < sonnet 2 = qwen-binding < opus 3):

| actual \ class | inert | standard | elevated |
|---|---|---|---|
| inert | none (inert) | sonnet binding (read as small: no model-declared exemption) | opus + orthogonal |
| small | none (inert) | sonnet binding (E17: qwen binding); inert-like: haiku advisory (E17: qwen advisory) | opus + orthogonal |
| standard | none (inert) | E3: opus \| sonnet | opus + orthogonal |
| large, over | none (inert) | opus (over: `overCap`) | opus + orthogonal |

LF6 review M1 (the cells were "small/inert = sonnet binding" and "—"): the class `inert` gets no review at any size
(design §5.3 "inert: unlimited, only for the inert class", REV-10), and a non-inert class with `actual = inert` is read as
`small`, never an exemption (MGS §2.1, design §5.4: errors fail closed). `reviewer` normalises both itself, so a caller
may pass `tierOfLines(n)` for every class. The advisory Haiku (E17 qwen) is the class `standard` at `small` with `inertLike`.

**S40 — ladder** (`core/strategy/ladder.ts`)

```ts
export type LadderStep = "retry-xhigh" | "split" | "corrective" | "handoff" | "steer" | "stop";
export interface LadderState { effort: "xhigh" | "medium"; taken: readonly LadderStep[]; mergedChildren: number; state: string; depth: number; maxDepth: number; quotaWait: boolean }
export const next = (s: LadderState, e11: "corrective-handoff" | "corrective" | "steer"): LadderStep | "wait" => {
  if (s.quotaWait) return "wait";                                       // Q-3
  const seq: LadderStep[] = [
    ...(s.effort === "medium" ? ["retry-xhigh" as const] : []),
    ...(s.mergedChildren === 0 && s.state === "active" && s.depth < s.maxDepth ? ["split" as const] : []),
    ...({ "corrective-handoff": ["corrective", "handoff"], corrective: ["corrective"], steer: ["steer"] } as const)[e11],
    "stop"];
  return seq.find((x) => !s.taken.includes(x)) ?? "stop";
};
```

**S41 — coordinator section** (pinned text; `{…}` filled): "You coordinate; local children do the work.
Tier budget this session: {tier} = {budget} changed lines per package (inert unlimited). Start every package
with start_branch and an estimate; above the budget, split it: at most {maxChildren} children per node, depth
at most {maxDepth} below the request, plans at most {planLines} lines. One fresh child per package; it either
does its package or submits a split and ends — you start the children of a split. Merge with request_merge;
the router chooses the reviewer and queues merges."

**S42 — breakers**: counters per child node from API 3 `tool_result` and `usage` events:
`sameTest` (key = check command with whitespace collapsed; reset on a passing run or a different key),
`diffApply` (key = path; reset on success), `verify` (gate red runs; reset never), `turns`, `uncached`
(per request). `breaker(c, l)` returns the first trip in that order.

**S43 — quota**: `parse(provider, headers) → {window, utilization (0–1), resetAt}[]`;
`QuotaView = {active: ActiveWait[], util: Map<window, number>, cloudInFlight: number, quotaWait: boolean}`;
rule (only when `!quotaWait`): `cloudInFlight ≥ maxCloud` → `queue`; `util(5h) ≥ q5hOpenEnded` and the ask is
open-ended and not (elevated review or `t2`) → `deny`; exhausted (`util ≥ 1`) → elevated review `wait`,
standard review `downgrade` (opus → sonnet); else `go`.

**S44 — local queue** (`lqueue.ts`): state `{holder?: {sid, lastEnd?}, waiters: FIFO}`;
`acquire(sid)`: free, or holder = sid → grant; else enqueue, resolve on hand-over. `end(sid)`: `lastEnd =
now`, arm a timer of `affinitySec`; `acquire` by the holder before it fires keeps the stream; on fire, or on
`kill`/`error` of the holder → hand over to the first waiter, writing `lqueue` with `waitedMs`.

**S45 — merge queue** (`mqueue.ts`): `Map<target, {holder?, waiters}>`; `acquire(target, node, signal)` →
`Promise<Release>`; abort → `leave`. In `request_merge` (local-first): acquire → `git rebase <target tip>` in
the node worktree (conflict → `rebase --abort`, release, `mqfix`) → (the root only, Q26: the
split-file removal commit, D85) → `checksFor(node)` (red → release, `mqfix`) → the review step by kind:
a leaf → approval for `{repo, branch, commit, tree}` or a new review (`rereview` iff the tree differs from the
last approved); a node with merged children → `points(n, arms).integrationReview` ? the integration contact
(S50) : checks only (TREE-8, CON-14) → `git merge --ff-only` on the target (LF4.T11d) → release; every step
writes the entry op.

**S49 — plan-review contact** (`core/local/planreview.ts`): when `points(n, arms).planReview` at a `split`
(the root: E7 and (> 1 child or elevated); any level: E9): a bounded ticket, role `plan-review` (exists in
`ROLES`), reviewer = Opus for an elevated node, else Sonnet; payload = the canonical split JSON, the node's
goal and contract, the caps; read-only tools; verdict via the harness: `{verdict: "approve" | "amend",
amend?: SplitPlan, reasons: string[]}`; `approve` → nothing; `amend` → `validateSplit` (invalid → one
re-ask, then the original plan stands and the `contact` line says `outcome: invalid`), the unstarted
children are replaced (started slugs keep theirs), recommitted (D66), tree op `split`, one `split` line
`reason: review`; the split's children start only after the verdict. One `contact` line (`kind:
plan-review`), counted per node.

**S50 — integration contact** (`core/local/integration.ts`): input = the combined diff `target..node tip`
(rebased), its actual tier (`tierOfLines`) and class (`classify` over its files); reviewer =
`reviewer({cls, actual, inertLike, review: arms})` as for a leaf (S39); `actual = over` → the O3 input
(numstat, the level checks' output, the riskiest hunks within `overCapBytes`) and `overCap: true`; binding
as the leaf table says; approval keyed `{repo, branch, commit, tree}` (MQ-2 reuse); one `contact` line
(`kind: integration`) counted on the node; a revise → the ladder at its first step for the node (no split:
TREE-10).

**S51 — API 3 holds, the router's side** (`lqueue.ts`, `api3.ts`): `beforeRequest(p, {requestId, signal,
…})` enqueues `requestId`; `signal.abort` (Esc, kill, pause, shutdown, the actor's timeout) → the waiter
leaves the queue (a holder releases at once, no affinity), one `lqueue` line `outcome: aborted | timeout`;
the hook's promise then resolves with the payload unchanged (the actor ignores it). The router sets
`hookTimeoutMs` = `localFirst.localQueue.hookTimeoutSec × 1000` (600 s) in the placement's
`PolicyResult`.

**S46 — thinking payload**: `withBudget(p, field, n) = {...p, [field]: n}` when `budgetSupported(props) =
build ≥ 10964 ∧ template has a thinking end tag`; `unbounded` → `p`.

**S47 — lean brief**: the package contract (goal, files, budget, check, forbidden), the build and test
commands from the split, and "do or split" (when allowed); tools `read edit write bash grep find ls` +
`submit_split` (when allowed) ≤ 12; `contextFiles: false`; full = today's brief + the same contract.

**S48 — size hint texts** (pinned): 80 %: "Size: {lines}/{budget} changed lines (80 %). Finish or plan a
split." 100 %: "Size: {lines}/{budget} changed lines (100 %). The reviewer is now {reviewer}; consider a
split." Never a block.

## 14. Tasks

Every task: read §6's files for its area first; RED → GREEN → CLEAN; KG-R green before the commit. "XR"
names a cross-repository dependency (§15.2). Paths under `packages/task-router/` unless stated; tests are
`test/<name>.test.ts`.

Defaults (plan-L4-L8's bullets, stated once): **Depends** = the previous task of its milestone; a task names
every other dependency, always a cross-milestone or an API-3 one (`Depends: … XR PS-1`). **Check** =
`task-router` (the spec names the case). **Keep green** = KG-R; + KG-M for `modules/` and `checks/module-eval/`;
+ KG-S for docs; + KG-I for `core/api.ts`; + the line under the milestone's heading. Tasks inserted by plan
revision 2 carry a letter suffix (`LF4.T11a`); ids never renumber; the text order is the dependency order. A
task whose GREEN is a test only (a characterization or a guard) says so and names its plant in §11.

### LF1 — E0 and E1 measurement (design §6 first stage, §5.8)

E1 needs no router lever: pi-economics splits the meter's `timings` by date and router version (PA-1); the
router adds `routerVersion` to `session` lines here and `lqueue` lines in LF10. Keep green: KG-P from LF1.T0.

#### LF1.T0 Provider hooks on both transports (X33, X45) `[x] done`
- Files: `checks/pi-hooks/default.nix` (new), `checks/pi-hooks/probe.mjs` (new: a probe extension and a fake HTTP server on `localhost`); third file `checks/default.nix` (one registration line).
- Why first: LF9.T3 (headers), LF10.T5 (the main held in the local queue) and PS-1's `beforeRequest` (the actor's mirror of pi's hook) rely on it.
- RED: the check runs pi 1.4 offline (`pi -p`, as `checks/pi-package/`) against the fake server twice, `openai-completions` (the llama transport) and `anthropic-messages` (base URL overridden); the probe's `before_provider_request` holds 300 ms and sets `x_probe: 1` in the payload; `after_provider_response` records `status` and the fixture header `anthropic-ratelimit-unified-5h-utilization`; assertions: (i) the server receives the request ≥ 200 ms after the hook started (awaited; the hook holds 300 ms, so the margin is 100 ms: LF1 review), (ii) the body has `x_probe: 1` (rewritten), (iii) the probe saw the status and the header, (iv) `ctx.signal` is an `AbortSignal` inside the hook. Seen red with the plant (§11).
- GREEN: none in the router (a verification check). A failed (i)–(iii) on a transport → stop and report (R16); X33 records the result for both transports.
- Keep green: KG-P.

#### LF1.T1a The v1 line fixture (NR-2 a) `[x] done`
- Files: `test/fixtures/v1-lines.jsonl` (new); test `lf-default` (new) "NR-2 v1 capture".
- RED: the case compares a default-settings harness session (fake clock; spawn, verdict, spotcheck, hint, review, merge) with the fixture → fails while the fixture is empty.
- GREEN: test only: the fixture is recorded at this commit, before any v2 change, and committed; the case passes. LF1.T2 compares against it.

#### LF1.T1b Flag cases through settings: `flags`, `local-prompt` (X37a) `[x] done`
- Files: tests `flags`, `local-prompt` only (no production change).
- Why: these cases stub `__piExperimentsApi_v1` to set a flag; the router falls back to settings today, so setting the flag through settings passes before and after LF1.T1. Cases that test the experiments read itself are deleted (reason: owner decision 2026-11-16, recorded with the author's configuration).
- RED: N/A (a refactor of tests); evidence: the same assertions pass before (stub) and after (settings).

#### LF1.T1c Flag cases through settings: `review-log`, `rule` (X37a) `[x] done`
- As LF1.T1b for `review-log` and `rule`.

#### LF1.T1 Drop the experiments read (NR-3) `[x] done`
- Files: `core/shell.ts`; test `lf-default` "NR-3 no experiments read".
- XR: PE-1 (pi-economics' `iface-experiments-task-router` reads `ExperimentsApi`); the commit says so.
- RED: "NR-3 no experiments read" scans `core/**/*.ts` for `__piExperimentsApi_v1|ExperimentsApi` → hits `shell.ts:56–83`.
- GREEN: `withFlags` returns the settings value; remove `ExperimentsApi`, `armOf` and the `arm` argument at the spawn line.

#### LF1.T2 Outcome log v2 (RND-8, NR-2 b) `[x] done`
- Files: `core/outcome.ts`; tests `lf-default` "NR-2 cloud-first lines", `outcome` (X37b literals).
- RED: LF1.T1a's session → every line = its fixture line with `v: 2` and without `arm` → fails on `v: 1`.
- GREEN: `SCHEMA_VERSION = 2`; drop `arm` from `spawnEvent`'s input type and output.

#### LF1.T3 `session` builder, `EVENTS_V2`, export snapshot (LOG-2, LOG-3, LOG-4) `[x] done`
- Files: `core/outcome.ts`; test `lf-outcome` (new).
- RED: `sessionEvent` missing; LOG-4 snapshot of the names and values of `TRIPS`, `ROLES`, `REASONS`, `TRIGGERS`, `PLAN_TYPE`, `BRANCH_TYPE` (literal, taken from today) must be a subset of the exports; `ENUMS_V2` holds `session.profile` and `session.localMembers` (§2.4) and `FALLBACKS = ["budget", "error"]` (today's `fallback`), both exported; LOG-3 runs `text-free` over the builder.
- GREEN: `sessionEvent({now, sessionId, profile, mainModel, startSet, localMembers, routerVersion})`; `export const EVENTS_V2 = ["session"] as const` (each later builder task appends its event); `export const ENUMS_V2` and `export const FALLBACKS = ["budget", "error"] as const` (LF6.T7 appends).

#### LF1.T4 Experiments settings (spec §2.1) `[x] done`
- Files: `core/types.ts`, `core/settings.ts`; test `lf-settings` (new) "experiments keys".
- RED: `experiments: {seed: "s", cloudOnlyShare: 0.2}` parsed; no key → `0.1` (D64); `cloudOnlyShare: 2` → one problem, default 0.1; `0` accepted.
- GREEN: `ExperimentsSettings {seed, cloudOnlyShare, factors}` (factors parsed in LF2.T4), defaults per §2.1.
- Keep green: `local-default` (the default-mode key inventory gains `experiments`; reason: D64, named in the commit).

#### LF1.T4a Default-mode tests pin the share to 0 (X37g) `[x] done`
- Files: `test/harness.ts` (one file, test-only; additive for pi-economics' harness import, PE-3).
- RED: with LF1.T4's default 0.1, the default-mode cases of X37(g) fail: `test/shell.test.ts:21, 56, 70`, `policy.test.ts:132, 287, 439`, `unrouted.test.ts:22–64` (each gets an extra first `session` line); seen red before the change.
- GREEN: the harness' default settings, and the settings those files build, set `experiments.cloudOnlyShare: 0`; the cases pass with their assertions unchanged. LF1.T5 and LF1.T9 set the share explicitly.
- Keep green: `local-default`.

#### LF1.T5 `session` line (MEAS-1) `[x] done`
- Files: `core/shell.ts`; test `lf-session-log` (new).
- RED: legacy local-mode harness session → one `session` line (`profile: "local-mode"`); cloud-first with share 0 → none; with the default share (0.1) → one, carrying `arms: ["E0=<level>"]` (LF2.T7; until then without `arms`).
- GREEN: write it in the `session_start` handler (inside the guarded body); `routerVersion` from the package manifest's version constant.

#### LF1.T6 Merge-line fields for reverts: builder (LOG-1) `[x] done`
- Files: `core/outcome.ts`; test `lf-merge-log` (new) "LOG-1 builder".
- RED: `mergeEvent({…, base, target, repoId})` drops the fields.
- GREEN: optional fields `base`, `target`, `repoId`, `class`, `tier`, `actualTier`, `node` (the last four filled from LF5/LF6).

#### LF1.T7 Merge-line fields for reverts: the gate fills them (LOG-1) `[x] done`
- Files: `core/local/merge.ts`, `core/local/gitcmd.ts` (a `rootCommit` port if the port set lacks one); test `lf-merge-log` "LOG-1 git".
- RED: a real-git merge (`git-repo.ts`, `merge-rig.ts`) → the line's `repoId` = first 12 hex of `git rev-list --max-parents=0 HEAD` (sorted, first), `base` = the target tip before, `target` = the branch merged into.
- GREEN: compute at step 9 (`advanceMain`); `repoId` cached per repository.

#### LF1.T8 The deterministic draw (RND-2) `[x] done`
- Files: `core/strategy/draw.ts` (new); test `lf-arms` (new) "RND-2".
- RED: import fails; then: equal draws for equal inputs (property, 1 000 random triples), `pick` frequencies over 20 000 units within ±2 % of weights (1:1, 1:1:1, 9:1).
- GREEN: S32 `draw`, `pick`.

#### LF1.T9 E0 cloud-only arm (MEAS-2) `[x] done, but one RED case moved to LF3.T5 (the `/profile` switch; `/profile` does not exist before LF3); the review fixes are LF1.T9a`
- Files: `core/policy.ts`, `core/shell.ts`; test `lf-e0` (new).
- RED: cloud-first session with share 1 → no spawn placed on a `route: "local"` member (property over random cards from `rand.ts`), `session.localMembers = "off"`; share 0 → no draw, routing = today; a `/profile local-first` switch keeps a cloud-only draw (no local member in that session, MEAS-2; moved to LF3.T5); `router-golden` green with the default share (E0 lives in the session, never in `planSpawn`'s defaults).
- GREEN: at `session_start`, `E0 = pick([as-used, cloud-only], [1-s, s], draw(seed, "E0", sessionId))`; the policy filters `route === "local"` members when `cloud-only`.
- Keep green: `router-golden` (NR-1).

#### LF1.T9a E0's eligibility, forces and refusals; review minors (LF1 review M1–M3, D93) `[x] done`
- Files: `core/shell.ts`, `core/policy.ts`, `core/table.ts`, `core/settings.ts`, `core/outcome.ts`; tests `lf-e0`, `lf-session-log`, `lf-settings`, `lf-default`, `lf-arms`, `lf-outcome`; `checks/pi-hooks`; the docs of LF1.T10.
- RED: a force onto a local member in a cloud-only session runs, its line says `forced` and the member (a pin); `routing: false`, no actor API, a table with no enabled cloud member, a child session and an empty session id draw nothing and write no `localMembers`; an explicit local model and a level only a local member reaches are refused naming "cloud-only session (E0): local members are off"; `experiments: null` (and a non-string `seed`, a non-object `factors`) is a settings problem, not a throw; NR-2 at the real share 0.1 (`[session, …v1 lines with v: 2]`); RND-2 known answers; LOG-4 as subsets over the lines the router writes.
- GREEN: the eligibility in `session_start`; `localMembers?` on `sessionEvent`; the refusal causes in `createPolicy`; the settings checks; the pi-hooks threshold (200 ms against a 300 ms hold).
- Docs: spec MEAS-1, MEAS-2, §2.4, §2.8; `docs/outcome-log.md` (`localMembers`, the forced exclusion, the dedup of session lines, `ENUMS_V2`'s scope, the v2 consumer break); `docs/task-router.md` (E0, the failure table).

#### LF1.T10 Docs: outcome log v2 `[x] done`
- Files: `docs/outcome-log.md`, `docs/task-router.md`.
- RED: N/A (docs); KG-S.
- GREEN: the v2 section (bump reason, `arm` retired, `session`, the merge fields), the `experiments` keys; dated notes per the versioning rule.

### LF2 — The randomizer framework (design §6, §8)

#### LF2.T1 Factor registry (RND-1) `[x] done`
- Files: `core/strategy/arms.ts` (new); test `lf-arms` "RND-1".
- RED: `FACTORS` deep-equals spec §2.8 (literal table: ids, units, levels, `from`; all `enabled: false`, D63).
- GREEN: S32 `Factor`, `FactorId` union, `FACTORS`.

#### LF2.T2 Assignment and the disabled default (RND-4) `[x] done`
- Files: `core/strategy/arms.ts`; test `lf-arms` "RND-4".
- RED: `assign(snap, "E2", u)` with E2 disabled → `"standard"` for all units; enabled with weights [0,1,0] → `"small"`.
- GREEN: `assign` per S32; weights from the snapshot, else the factor's.

#### LF2.T3 Independent factors (RND-3) `[x] done`
- Files: `core/strategy/arms.ts`; test `lf-arms` "RND-3".
- RED: written first against a plant (§11: `id` dropped from the hash) and seen failing; then the plant is removed.
- GREEN: none beyond T2 (the test guards the hash input); CLEAN: the plant gone.

#### LF2.T4 Factor settings (spec §2.1) `[x] done`
- Files: `core/settings.ts`, `core/types.ts`; test `lf-settings` "factor keys".
- RED: `experiments.factors.E2 = {enabled: true, weights: [1, 1, 1]}` parsed; an unknown id, a wrong weight count, a negative weight → one problem each; with an injected router version `0.3.0`, `E2.enabled` → the problem `experiments.factors.E2 is available from 0.4.0` and E2 stays disabled (spec §2.8; the version is a parameter, so the case survives releases).
- GREEN: validate against `FACTORS` (count = levels; `from` ≤ the router's version by a numeric triple compare).

#### LF2.T5 Arms snapshot entry (RND-5) `[x] done`
- Files: `core/armstore.ts` (new), `core/shell.ts`; test `lf-arms-shell` (new) "RND-5".
- RED: settings change between two `session_start`s of one session (`fake-pi` branch with the entry) → the draws equal the first snapshot's (property over 50 sessions); the same for a changed code default (the deps inject a `FACTORS` copy with E2 enabled) — the snapshot holds the effective set.
- GREEN: `createArmStore(append, factors = FACTORS)`: at `session_start` restore `task-router/arms` or write one holding, for every factor id, the effective `{enabled, weights}` (code default merged with settings) plus `seed` and `cloudOnlyShare`; `armsFor(unitKind, unit)`.

#### LF2.T6 Arms on lines (RND-6) `[x] done`
- Files: `core/log.ts`, `core/shell.ts`; test `lf-arms-shell` "RND-6".
- RED: with E2 enabled and the log's `armed()` port stubbed `true` (the profile store arrives in LF3; legacy local-mode sessions stay unarmed, NR-7), every line carries `arms` containing `"E2=…"`, sorted; `armed()` false → no `arms` key except on the `session` line (E0, NR-2).
- GREEN: S33; the shell wires `armed = () => false` until LF3.T3 replaces it.

#### LF2.T7 E0 through the registry `[x] done`
- Files: `core/shell.ts`; test `lf-e0` "E0 via registry".
- RED: E0's level from `assign(snap, "E0", sid)` equals LF1.T9's draw for 1 000 session ids; `arms` holds `E0=…` while share > 0 in an eligible session (D93).
- GREEN: replace the inline pick by `assign` (E0's weights = `[1-s, s]`).

#### LF2.T8 Docs `[x] done`
- Files: `docs/task-router.md`, `docs/outcome-log.md` (`arms`).
- GREEN: the randomizer (D61–D63), the snapshot, factor settings, E0's default share and how to set it to 0. Then PE-1 and release R1 (§15.3).

### LF3 — Seams and profiles (design §5.1, §5.9; gaps 1–3)

#### LF3.T1 The `Strategy` seam (NR-6) `[x] done`
- Files: `core/strategy/types.ts`, `core/strategy/local-first.ts` (new); test `lf-seams` (new).
- RED: the scan: `local-first.ts` exports `localFirst(settings): Strategy`; no file outside `core/strategy/` imports a strategy file other than `types.ts`, `local-first.ts`, `arms.ts` (the last for `FACTORS`/`assign` in `armstore.ts`); no file in `core/strategy/` imports outside it except `node:crypto` and `../types.ts`.
- GREEN: S31; `localFirst` returns stubs that throw `not yet` for parts later tasks fill (each part's task replaces its stub).

#### LF3.T2 Profile setting (PRO-1) `[x] done`
- Files: `core/types.ts`, `core/settings.ts`; test `lf-settings` "PRO-1".
- RED: `profile` parsed; invalid → problem + `cloud-first`; an object (a card-kind profile in the wrong key) → the problem `profile takes cloud-first | local-first; card-kind profiles go under profiles.<kind>`; `{profile: "cloud-first", mode: "local"}` → `cloud-first`; `{mode: "local"}` → legacy local mode, unchanged; PRO-9 a: `profile: "local-first"` without `localFirst.experimental: true` → the problem `profile local-first is experimental before 0.5.0; set localFirst.experimental` and `cloud-first`.
- GREEN: `profile?: RoutingProfile` (`core/types.ts`; the card-kind `Profile` keeps its name and shape); `localFirst` defaults (§2.1) as one nested object, `experimental: false`.

#### LF3.T2a Card kinds in local-first: `profiles.<kind>.localFirst` (PRO-10, M6) `[x] done`
- Files: `core/types.ts`, `core/settings.ts`; test `lf-settings` "PRO-10".
- Keep green: `brief`, `card`, `policy`, `prompt`, `requirement`, `route`, `settings`, `table`, `top` (every reader of `Profile`/`profiles`, unmodified).
- RED: `profiles.scout.localFirst = {placement: "cloud"}` parsed; `{placement: "x"}` → one problem; `BUILTIN_PROFILES.<kind>.localFirst` per S34b; property: for every built-in kind and random overrides without `localFirst`, `profileFor(kind, s)` minus `localFirst` deep-equals the value before this task (a snapshot taken in the RED commit).
- GREEN: `Profile.localFirst?: { placement: "local" | "cloud" }` (optional, so every existing literal type-checks); built-in values per S34b; validation accepts the field (`mapLegacyProfiles` passes it through). Migration: none; existing `profiles.<kind>` entries keep their meaning, the field is read only in a local-first session (LF4.T12).

#### LF3.T3 Profile store (PRO-3) `[x] done`
- Files: `core/profile.ts` (extended: new exports beside `profileFor`, `skillBlocks`, `skillNames` and the re-exported `BUILTIN_PROFILES`, which stay unchanged), `core/shell.ts` (the log's `armed()` port from LF2.T6 = `current() === "local-first"`); test `lf-profile` (new) "PRO-3".
- Keep green: the `Profile` readers listed under LF3.T2a.
- RED: property over random entry sequences: restored = the last entry's profile; none → settings.
- GREEN: S34 `createRoutingProfile`, `PROFILE_TYPE = "task-router/profile"`.

#### LF3.T4 `profile` builder (LOG-2) `[x] done`
- Files: `core/outcome.ts`; test `lf-outcome` "profile".
- RED: `profileEvent` missing (import fails); then its fields ≠ spec §2.4 and `text-free` over it.
- GREEN: `profileEvent({from, to, by})`; `EVENTS_V2` += `profile`; `ENUMS_V2["profile.by"]`.

#### LF3.T5 `/profile` (PRO-2) `[x] done`
- Files: `core/profile.ts`, `core/shell.ts`; test `lf-profile` "PRO-2".
- RED: `fake-pi` command call `local-first` (with `localFirst.experimental`) → one entry `by: "command"`, one `profile` line, status `local-first`; without it → the PRO-9 notice, no entry; `bogus` → usage text, no entry; none → the current profile.
- GREEN: `pi.registerCommand("profile", …)` in the guarded body; the status line from `profile.current()`.
- Also (MEAS-2, deferred from LF1.T9; test `lf-e0` "MEAS-2 profile switch"): RED: a session that drew `cloud-only` at its `session_start`, then `/profile local-first` (with `localFirst.experimental`) and a spawn → no spawn placed on a `route: "local"` member, no new draw and no second `session` line from the switch; a session drawn `as-used` stays as-used the same way. GREEN: the draw stays in the shell for the session; only `session_start` redraws.

#### LF3.T6 The local start model (PRO-4, PRO-5) `[x] done`
- Files: `core/profile.ts`, `core/shell.ts`; test `lf-start-model` (new).
- RED: three cases (no choice → `setModel(startMember's model)` and `setThinkingLevel("xhigh")` (LOC-2 main); a model flag → neither; a resumed session with a model → neither); PRO-5 property: random event sequences → ≤ 1 `setModel`, only inside `session_start`. The design's "`/model` before the start hook" is not observable (X43): no case.
- GREEN: `startModel(ctx, settings)`; the model via `ctx.modelRegistry.find` (as `forceinstall.ts:22–29`); not found → one notice, pi-setup's default stays; the thinking level is set only together with the start model.

#### LF3.T7 Per-session section and tools (PRO-7) `[x] done`
- Files: `core/shell.ts`, `core/local/install.ts`; test `lf-profile` "PRO-7".
- RED: cloud-first default → `/profile local-first` registers the local tools once and activates them; back to cloud-first → `setActiveTools` without them, section = `cardSection`; legacy local mode unchanged (`local-shell` green).
- GREEN: `ensureLocalTools()`; `before_agent_start` chooses the section by `profile.current()`; the hooks of `installLocal` gate on the session's profile (`"local-first"` or `"local-mode"`).
- Note: a third file (`core/local/mode.ts`) only if `componentOn` needs the profile; say so in the commit.

#### LF3.T8 Coordinator section (PRO-8) `[x] done`
- Files: `core/prompt.ts`; test `lf-prompt` (new) "PRO-8".
- RED: `coordinatorSection(b)` equals S41 with the values filled (the pinned text is the criterion).
- GREEN: S41; `before_agent_start` uses it for local-first (one line in `shell.ts`, allowed as the third file).

#### LF3.T9 Module option `profile` (HM-1 a) `[x] done`
- Files: `modules/task-router.nix`, `checks/module-eval/cases/task-router-profile.nix` (new).
- RED: the case sets `programs.piTaskRouter.profile = "local-first"` (and `settings.localFirst.experimental = true`, PRO-9) and expects `settings.profile = "local-first"` in the rendered settings → fails (no option).
- GREEN: `profile = lib.mkOption { type = lib.types.enum ["cloud-first" "local-first"]; default = "cloud-first"; }`; `settings.profile = lib.mkDefault cfg.profile` only when not the default (the default render unchanged: KG-M `readme`, `task-router`).

#### LF3.T10 Docs `[x] done`
- Files: `docs/task-router.md`, `README.md` (the routing profile vs the card-kind `profiles`, `profiles.<kind>.localFirst`, `/profile`, the module option, `localFirst.experimental` until R3).

### LF4 — Packages, nodes and the tree (design §5.2; gaps 4, 5, 18)

#### LF4.T1 Tree model and replay (TREE-3 a) `[x] done`
- Files: `core/local/tree.ts` (new); test `lf-tree` (new) "TREE-3 replay".
- RED: property: for random op sequences, `replay(ops)` = folding `apply`; an op on an unknown node leaves the tree unchanged with one problem.
- GREEN: S35 types, `apply`, `replay`.

#### LF4.T2 Caps (TREE-2) `[x] done`
- Files: `core/local/tree.ts`, `core/strategy/local-first.ts` (`treeCaps` from settings; E6/E15 later); test `lf-tree` "TREE-2".
- RED: depth 3 node split → reason names `maxDepth 3`; 6 children → reason names `maxChildren 5`; depth 2 with 5 → ok.
- GREEN: `canSplit` per S35.

#### LF4.T3 Tree entries (TREE-3 b) `[x] done`
- Files: `core/local/treestore.ts` (new), `core/shell.ts` (restore at `session_start`); test `lf-tree` "TREE-3 resume".
- RED: ops written through the store, a fold (entries kept, messages dropped) and a resume → the restored tree deep-equals the live one.
- GREEN: S36; `TREE_TYPE = "task-router/tree"` exported (log-contract may import it).

#### LF4.T4 Split validation (TREE-4 rules) `[x] done`
- Files: `core/local/split.ts` (new); test `lf-split` (new).
- RED: one case per S37 rule → exactly that reason; a valid plan → `[]`; the canonical rendering is byte-stable (sorted keys, 2 spaces, trailing newline).
- GREEN: `validateSplit`, `renderSplit`, `SplitPlan`/`SplitChild` types.

#### LF4.T5 Split commit (TREE-4 commit) `[x] done`
- Files: `core/local/split.ts`, `core/local/gitcmd.ts` (if a port is missing); test `lf-split-git` (new).
- RED: real git: worktree with an unrelated staged file → after `commitSplit`, HEAD's tree has `<plans.dir>/split/<node>.json` = the rendering, the unrelated file is still staged and uncommitted; a failing `pre-commit` hook → refusal with its output.
- GREEN: D66.

#### LF4.T6 `node` and `split` builders (TREE-11) `[x] done`
- Files: `core/outcome.ts`; test `lf-tree-log` (new) "builders".
- RED: `nodeEvent`/`splitEvent` missing (import fails); then each field set ≠ spec §2.4 and `text-free` over both.
- GREEN: `nodeEvent`, `splitEvent` per spec §2.4; `EVENTS_V2` += both; `ENUMS_V2` += `node.kind`, `node.outcome`, `split.reason`.
- decision (lf56-fix, review m10): `nodeLine(n, tier)` takes the session's drawn tier (`sessionTier(arms)`, as `crossing` and
  `merge` carry it); `inert` for an inert estimate. Test `lf-tree-log` "TREE-11 a node line's tier is the session's drawn tier".

#### LF4.T7 `start_branch` with a parent (TREE-1) `[x] done`
- Files: `core/local/worktree.ts`, `core/local/branchtool.ts`; test `lf-tree-git` (new).
- RED: real git: `start_branch({goal, estimate: {kind: "plan", lines: 0}})` → a level-0 node off the main tip; `start_branch({parent: root, …})` → its branch's base = the root's tip (not the main tip); `add` op and a `node` line written.
- GREEN: `startBranch(d, input, cwd, base?)`; the schema gains `parent`, `child`, `estimate` (spec §2.3), validated in local-first only (legacy schema unchanged: `local-schema` green).

#### LF4.T8 Start a child of a split (TREE-5) `[x] done`
- Files: `core/local/branchtool.ts`, `core/local/tree.ts`; test `lf-start-child` (new).
- RED: `{parent, child: slug}` takes goal/files/estimate/check from the split; parent not `split` / unknown slug / started slug → one refusal each.
- GREEN: lookup + `started` bookkeeping (tree op `add` with `parent`).

#### LF4.T9 The `split` tool (TREE-4, TREE-12 a) `[x] done`
- Files: `core/local/splittool.ts` (new), `core/local/install.ts`; test `lf-top-plan` (new) "TREE-12 local".
- RED: the main's `split({node: root, …})` validates, commits on the root's branch (not the main branch), writes op `split`, one `split` line (`reason: "choice"`), node state `split`.
- GREEN: tool registration in the local-first tool set (S34a).

#### LF4.T10 Nodes keep their profile (PRO-6) `[x] done`
- Files: `core/local/tree.ts`, `core/local/install.ts`; test `lf-profile` "PRO-6".
- RED: switch to cloud-first while a node is `active` → its `request_merge` still runs the local-first gate; a new `start_branch` after the switch is not offered (tools inactive).
- GREEN: `node.profile` stamped at `add`; mechanism reads it for that node's merges.

#### LF4.T11a The merge target (TREE-7 a) `[x] done`
- Files: `core/local/merge.ts`, `core/local/tree.ts`; test `lf-merge-target` (new) "TREE-7 target".
- RED: fake git: a child node's `request_merge` resolves `target` = the parent node's branch and tip; the root → the main branch; a nodeless (legacy) branch → the main branch, its facts unchanged (`local-merge-*` green).
- GREEN: `targetOf(node) = tree.parentBranch(node) ?? mainBranch`; `Facts` gains `target: {name, sha}` beside `main` (filled = `main` for nodeless branches).

#### LF4.T11b `behind` and size against the target (TREE-7 b) `[x] done`
- Files: `core/local/merge.ts`; test `lf-merge-target` "TREE-7 base".
- RED: real git: root cut from main; main gains a commit; a child cut from the root; the child's `request_merge` → not refused `behind` (today `merge.ts:324` tests `isAncestor(main.sha, commit)`), and the line's `nLines` = numstat(root tip, child tip), not numstat(main, child) (`:335`).
- GREEN: `:324` and `:335` take `target.sha`.

#### LF4.T11c Red run and review diff against the target (TREE-7 c) `[x] done`
- Files: `core/local/merge.ts`; test `lf-merge-target` "TREE-7 red-run base".
- RED: real git, the same shape as T11b: the red run's recorded base (fake runner) = the root tip (`:385`); the review input's diff = `target..commit` (`:395`), the review ticket's `base` (`:403`) and the `branches.put` record's `base` (`:412`) = the target tip.
- GREEN: all four (`:385`, `:395`, `:403`, `:412`) take `target.sha`.

#### LF4.T11d Advance the parent in its worktree, never push (TREE-7 d, D65) `[x] done`
- Files: `core/local/merge.ts`, `core/local/gitcmd.ts` (an `ffIn(worktree, commit)` port if missing); test `lf-merge-target` "TREE-7 no push".
- RED: real git with a fake remote and `mergeGate.push = true`: a node→parent merge fast-forwards the parent branch by `git -C <parent worktree> merge --ff-only` (its worktree stays in sync), and the remote records no push; a dirty parent worktree → refused `dirty`; the root→main merge pushes once, as today (`:233–253`).
- GREEN: advance branches on `target` being a main branch: main → today's step 9; else `ffIn(parent worktree)`, no push.

#### LF4.T11e The main-ref record only for main (TREE-7 e) `[x] done`
- Files: `core/local/merge.ts`; test `lf-merge-target` "TREE-7 main-ref".
- RED: a node→parent merge writes no `task-router/main-ref` entry; the root→main merge writes one (`:443`).
- GREEN: the entry under the main-target branch of T11d.

#### LF4.T11f The guard protects open parents (TREE-7 f) `[x] done`
- Files: `core/local/worktree.ts` (`writeGuard`); test `lf-merge-target` "TREE-7 guard".
- RED: a `git commit` in the parent's worktree by the main while the parent has open children → blocked; after the last child merged → allowed.
- GREEN: the guard's protected set = main branches ∪ branches of nodes with `started` − `merged` ≠ ∅.

#### LF4.T12 Package child placement (TREE-6) `[x] done`
- Files: `core/local/package.ts` (new), `core/policy.ts`; test `lf-placement` (new) "TREE-6".
- RED: a spawn card with `package: "<node>"` in a local-first session → `PolicyResult` with the local member, `cwd` = the node's worktree, `briefAppend` = the package contract, `meta.node`; a `t2` card with `package` → the cloud route and a `contact` of shape `open` (counted in LF8); PRO-10 b: a card without `package` whose kind's `localFirst.placement` is `local` → the start member, `meta.ungated = true` (a CON-8 (ii) unit); `cloud` → today's planning.
- GREEN: `placePackage(card, tree, strategy, arms)`; the card field `package` (validated: an `active` node); `placeByKind(card, profile)`.

#### LF4.T12a Package scope at the gate (TREE-14) `[x] done`
- Files: `core/local/merge.ts` (the scope refusal, `:344–350`, today for plan-bound branches only), `core/local/tree.ts` (`contractOf(node)`); test `lf-merge-target` "TREE-14".
- RED: a package node whose diff touches a path outside its split child's `files` → refused `scope` naming the path; a path matching `forbidden` → refused `scope`; inside → not refused; the router-owned `<plans.dir>/split/**` is never a scope violation.
- GREEN: package nodes are plan-bound: the scope check reads `contractOf(node)` as it reads a plan task's files today. `boundOf(…, main.sha, …)` (`:329`) is not consulted for package nodes, so `main.sha` there does not matter.

#### LF4.T12b A package child cannot push or reach a remote (R26) `[x] done`
- Files: `core/local/package.ts`; test `lf-placement` "R26".
- RED: a package child's `bash` call `git push …` or `git remote …` is refused by the spawn policy's `toolGuard` (`core/toolguard.ts`) with a reason naming the command; `git status`, `git add`, `git commit` in its worktree are allowed.
- GREEN: the package child's guard composes a pure `refusesRemote(cmd)` rule (`core/local/package.ts`); no rule exists today (`childguards.ts`, `toolguard.ts`, `worktree.ts`).

#### LF4.T13 `submit_split` and do-or-split (TREE-13) `[x] done`
- Files: `core/local/package.ts`; test `lf-placement` "TREE-13".
- RED: depth < cap → `childTools` has `submit_split` and the brief states the rule; at the cap → neither; calling it → validate, commit, op `split`, `terminate: true`, one message to the main naming the node.
- GREEN: the child tool's `execute` calls `validateSplit`/`commitSplit`.

#### LF4.T14 Docs `[x] done`
- Files: `docs/task-router.md` (nodes, the tree, split plans, the tools).

### LF5 — Size tiers and hints (design §5.3; gaps 6, 7)

#### LF5.T1 Tiers (SIZE-1) `[x] done`
- Files: `core/strategy/tiers.ts` (new), `core/strategy/local-first.ts`; test `lf-tiers` (new) "SIZE-1".
- RED: the table; property: `tierBudget(t, "elevated") ≤ 150` ∀t; `tierOfLines` monotone; inert = `Infinity`.
- GREEN: constants from settings (`localFirst.tiers`).

#### LF5.T2 Session tier (SIZE-3) `[x] done`
- Files: `core/strategy/local-first.ts`; test `lf-tiers` "SIZE-3".
- RED: arms `{E2: "large"}` → `large`; E2 absent → `standard`; property: ∀ levels of E2, `sessionTier(arms) =
  arms.E2 ?? "standard"`, never `inert`.
- GREEN: `sessionTier(arms: Arms): Tier` in the composition; no settings read.

#### LF5.T3 Changed lines during the work (SIZE-2) `[x] done`
- Files: `core/local/size.ts` (new), `core/local/gitcmd.ts` (port `diffNumstatWorktree`, `untrackedLines` if missing); test `lf-tiers-git` (new).
- RED: real git: 10 added committed + 5 modified uncommitted + an untracked 7-line file + an ignored file → 22 (+ deleted counted); the gate's `sizeOf` unchanged (`local-merge-*` green).
- GREEN: `workSize(git, wt, base)`.
- decision (lf56): no `gitcmd.ts` port: `Git.diffStat` (`core/local/git.ts`, D42) already is the worktree numstat plus the
  untracked lines; `workSize` sums it.

#### LF5.T3a Split files excluded from size (SIZE-2, D85) `[x] done`
- Files: `core/local/size.ts`; test `lf-tiers-git` "split files".
- RED: real git: a node commits a 120-line `<plans.dir>/split/<node>.json` and 10 code lines → `workSize` = 10;
  the same file under another path counts.
- GREEN: a `:(exclude)<plans.dir>/split/**` pathspec in both numstat calls and the untracked walk.
- decision (lf56): the numstat is filtered by `isSplitFile` (`core/local/split.ts`, D85's one definition) instead of a
  pathspec: the same lines, and no second spelling of the rule (`withoutSplits`, `core/local/size.ts`; the gate reuses it).
- review lf56 M1 (fixed): the local-first gate's size (`actualTier`, `overCap`, `merge.nLines`/`nFiles`) is
  `sizeOf(withoutSplits(st, plans.dir))` (`core/local/merge.ts`); test `lf-reviewer-gate` "SIZE-2 the gate's size drops the split files".

#### LF5.T4 Start refusal (SIZE-4) `[x] done`
- Files: `core/local/branchtool.ts`; test `lf-start-refusal` (new).
- RED: `estimate.lines = budget + 1` → refusal text names the budget, `maxChildren` and `split` (prefix assertions); `kind: "inert"` and `kind: "plan"` → not refused; property: no other tool result in the harness run contains the refusal prefix.
- GREEN: compare with `strategy.tierBudget(sessionTier, "standard")`.
- decision (lf56): `NodeDeps` gains `strategy` (the shell's composition) and `arms()` (the session's arms map); the refusal
  also applies to a split's package whose recorded estimate is above the budget (a third production file: `core/shell.ts` wires them).
- review lf56 M2 (fixed, owner: refuse at the split, keep the child refusal): `validateSplit(plan, node, caps, budget)` refuses a
  `code` child whose estimate is above `tierBudget(sessionTier, "standard")`, naming the child and the budget
  (`children[i].estimate: <slug>: …`); `splitNow` passes the session tier's budget. The child-start refusal stays as a backstop
  (a split recorded otherwise). Test `lf-split` "SIZE-4 split children above the budget".

#### LF5.T5 `crossing` builder (SIZE-6 a) `[x] done`
- Files: `core/outcome.ts`; test `lf-size-hints` (new) "builder".
- RED: `crossingEvent({...})` → a line with every spec §2.4 `crossing` field, `event ∈ EVENTS_V2`, every
  enumerated field's value ∈ its `ENUMS_V2` list (`stage`, `kind`, `tier`, `class`), no prompt text (`text-free`);
  fails first: no builder, `crossing ∉ EVENTS_V2`.
- GREEN: the builder; `EVENTS_V2` += `crossing`; `ENUMS_V2.crossing` = its enums.
- decision (lf56): `kind` is the work kind = the node's estimate kind `code | plan | inert` (design §5.3 "the work kind"; SIZE-10's
  `kind plan`), not the node kind; `estimate` its lines; `tier` ∈ S31 `Tier`; `class` ∈ `RiskClass`. Consumer-visible (PE-2):
  `crossing.stage` [80, 100], `crossing.kind`, `crossing.tier`, `crossing.class`.
- decision (lf56-fix, review m5): `kind: plan` has one meaning, a split above `planLines` (SIZE-10): a `plan` estimate gets no
  work stages (LF5.T6). `crossing`, `node` and `split` carry the optional `sessionId` (the main session's, as on the gate's lines,
  owner's decision PA Q1); a package child's crossing carries the main's id, whose router measures it.

#### LF5.T6 Main hints 80 %/100 % (SIZE-5 main, SIZE-6) `[x] done`
- Files: `core/local/sizehints.ts` (new), `core/local/install.ts`; test `lf-size-hints` "SIZE-5 main", "SIZE-6".
- RED: the main's active node grows 0 → 130 → 160 lines (budget 150) → one 80 % hint, one 100 % hint (S48 texts), two `crossing` lines with every field; the guard never blocks; legacy local mode keeps its one-stage monitor (`local-over-size` green).
- GREEN: `createSizeStages(budget)` → `observe(lines) → (80|100)[]`, once per stage per node.
- decision (lf56): a stage is reached at `lines ≥ stage % × budget`; `observe(lines, budget)` takes the budget per observation
  (`tierBudget(sessionTier, class)`: a class that turns elevated caps it); the class is the settings policy's of the worktree's files
  with `inertChecked: false` (never inert during the work; the gate classifies again at merge); an `inert` estimate has no stages
  (lf56-fix, review m5: nor a `plan` estimate);
  `sinceStartMs` counts from the node's first measurement. The main's hint is a `<router-hint size="80|100">` block on the next
  tool result (`sizeBlock`), not a trip: no `hint` line. Both stages fire at once when a write jumps over both.

#### LF5.T7 Package children's hints (SIZE-5 child) `[x] done`
- Files: `core/local/sizehints.ts`, `core/local/childtrips.ts`; test `lf-size-hints` "SIZE-5 child".
- RED: `fake-api` `turn` events of a package child + a `workSize` fake rising past 80 % and 100 % → two `api.send` hints, two `crossing` lines, no kill/pause.
- GREEN: D68.
- decision (lf56): the shell routes a `turn` of a child whose card has `package` to `installLocal`'s `packageTurn(child, node)`
  (`createChildSizes`, `core/local/sizehints.ts`: one read at a time per child, the same per-node stages as the main's, so a
  respawned package child gets no stage twice); the hint is `sizeBlock` sent with `api.send(child, text, "router")`; `turn` is the
  child's turns, `call` the calls its tripwire guard saw (`childTrips.calls`, 0 without the guard). Only while `hints` is on.

#### LF5.T8 Plan budgets (SIZE-10) `[x] done`
- Files: `core/local/split.ts`; test `lf-split` "SIZE-10".
- RED: a split rendering to 151 lines (`planLines` 150) → accepted + one `crossing` (kind `plan`); 6 children → refused (TREE-2's reason).
- decision (lf56): the crossing is logged by `splitNow` (`core/local/splittool.ts`, port `SplitDeps.crossing`; `split.ts` unchanged):
  stage 100, `lines` = the rendered lines, `budget` = `planLines`, kind `plan`, class `standard` (a split file never counts toward
  the class, D85), turn and call the main's (also for a child's `submit_split`); at exactly `planLines` none. The m7 check below
  is task R3A.T2.
- Review LF4 m7 (decided (owner, 2026-11-27): yes; implemented by R3A.T2, test `lf-split` "TREE-15"): a package node's split
  (`submit_split`) was not checked against the node's own contract, so a child whose `files` leave the contract's, or that drops
  its `forbidden`, was accepted and its work refused only at the node's merge (TREE-14). Now a split of `auth.form` (files
  `src/form/**`, forbidden `src/db/**`) with a child `src/other.ts` is refused naming the path, and the children inherit
  `forbidden`.

#### LF5.T9 No size refusal at the gate (SIZE-8 a) `[x] done`
- Files: `core/local/merge.ts`; test `lf-overcap` (new) "no size refusal".
- RED: property over sizes 0–5 000 lines and 1–40 files: a local-first `request_merge` never returns `reason: "size"`; legacy local mode still refuses (`local-merge-refuse` green).
- GREEN: skip `oversize` (`merge.ts:42`, `:341`) when the node's profile is local-first.
- decision (lf56): "local-first" at the gate = the merged branch is a node whose `profile` is `local-first` (`lf` in `pipeline`); a
  nodeless branch keeps the legacy gate. The property runs 11 sizes (5 edges, 6 seeded) on a real repository; `test/node-rig.ts`
  holds the node rig (moved from `lf-merge-target`).

#### LF5.T10 Over-cap review input (SIZE-8 b) `[x] done`
- Files: `core/local/overcap.ts` (new), `core/local/merge.ts`; test `lf-overcap` "SIZE-8".
- RED: a 900-line diff → review input = numstat + check output + hunks of the riskiest files (riskGlobs first, then by changed lines) with total ≤ `overCapBytes`; `review.overCap = true`; never the fail-closed `diffBudget` refusal (`merge.ts:117`) in local-first.
- GREEN: `overCapInput(stat, hunks, checkOut, bytes, risk)`.
- decision (lf56): over-cap = the actual tier `over` (`strategy.tierOfLines` of the gate's lines) or, in local-first, a diff the
  review's line budget would cut (a `large` diff of scattered hunks); the whole diff is then read and split per file (`fileHunks`).
  Whole file parts in risk order while they fit (a part that does not fit is skipped, smaller ones may follow); the riskiest part
  alone above the budget is shown cut, marked `… cut: the rest of <path> is not shown`; the input (goal, summary, red run, risky
  paths, invariants, then numstat, checks, hunks) is cut to `overCapBytes` in all. `RunArgs.overCap` → the review line's `overCap`
  (KEYS += `overCap`; LF6.T7 adds the other review fields).
- decision (lf56-fix, review m7; supersedes the cut-diff half above): over-cap ⇔ the actual tier `over`. Local-first budgets
  the review's diff from the numstat (`diffBudget({maxDiffLines: linesOf(st), maxDiffFiles: st.length})`, the split files
  included), never from `mergeGate.maxDiffLines`, so a `large` diff of scattered hunks is reviewed whole; a cut diff still turns
  over-cap as a backstop. Test `lf-overcap` "SIZE-8 never the diff budget's refusal".

#### LF5.T11 Budgets at the start (SIZE-9) `[x] done`
- Files: `core/prompt.ts`, `core/local/package.ts`; test `lf-prompt` "SIZE-9".
- RED: the section and a package brief contain the session tier's budget and the plan budgets (prefix/line assertions on the rendered lines).
- GREEN: one line `Budgets: package ≤ <b> changed lines; split ≤ <planLines> lines, ≤ <maxChildren> children.`
  rendered by `budgetLine(tier, s)` (`core/strategy/brief.ts`), used by both.
- decision (lf56): `budgetLine(tier, strategy, arms)` (the package budget `tierBudget(tier, "standard")`, the caps `treeCaps(arms)`),
  re-exported by `local-first.ts` (NR-6: the mechanism imports no other strategy file; `Strategy` keeps its parts). S41 stays as
  pinned; the section is S41, then the line on its own line (`coordinatorSection(b, budgets)`); the shell now takes the tier, budget
  and caps of S41 from the composition (`sessionTier(arms)`, as SIZE-3) instead of `standard` and the settings. The package brief
  has the line after `forbidden`.

#### LF5.T12 Docs `[x] done`
- Files: `docs/task-router.md` (tiers, hints, crossings, the start refusal, over-cap reviews).
- decision (lf56): `docs/outcome-log.md` gains the `crossing` row here (the event LF5 adds); the review fields follow in LF6.T14.

### LF6 — Classes and reviewers (design §5.4; gaps 8, 9, 11, 12)

#### LF6.T1 Classifier rules (CLS-1) `[x] done`
- Files: `core/strategy/classify.ts` (new), `core/strategy/local-first.ts`; test `lf-classify` (new).
- RED: one case per S38 rule; mixed changes → the highest; a thrown glob error → elevated; `why` lists every
  proxy that fired (`classBy`, D89), sorted; `componentDepth: 2` makes `packages/a/x.nix` +
  `packages/b/y.nix` multi-component, depth 1 does not.

#### LF6.T1a Split files are router-owned (CLS-1, D85) `[x] done`
- Files: `core/strategy/classify.ts`; test `lf-classify` "split files".
- RED: a change set of `<plans.dir>/split/n1.json` only → `inertLike`, not elevated by the `plans.dir` config
  rule; with one code file → the code file's class.
- GREEN: drop `<plans.dir>/split/**` from the list before the rules, by `ctx.isSplit` (the composition passes `isSplitFile(plansDir, path)`,
  `core/local/split.ts`: the one definition, a plain prefix; the classifier has none of its own; test "split files: one definition").

#### LF6.T2 Inert needs a check (CLS-3) `[x] done`
- Files: `core/strategy/classify.ts`; test `lf-classify` "CLS-3".
- RED: inert files without a configured passing `extraChecks` entry → standard.

#### LF6.T3 Inert-like (CLS-4) `[x] done`
- Files: `core/strategy/classify.ts`; test `lf-classify` "CLS-4".
- RED: tests + docs only → `inertLike`; one code file → not.

#### LF6.T4 Policy from the base (CLS-2) `[x] done`
- Files: `core/local/policyfile.ts` (new); test `lf-classify-git` (new).
- RED: real git: the branch edits `policyFile` to mark everything inert → classed elevated, by the base's policy; no file → settings; malformed → elevated.
- GREEN: `git show <base>:<policyFile>`.

#### LF6.T5 Reviewer table (REV-1, SIZE-7) `[x] done`
- Files: `core/strategy/reviewer.ts` (new), `core/strategy/local-first.ts`; test `lf-reviewer` (new).
- RED: S39 table cases; property REV-1 over random (class, actual, inertLike); SIZE-7: drawn tier small, actual 200 lines → opus.

#### LF6.T6 E3 for standard (REV-2) `[x] done`
- Files: `core/strategy/reviewer.ts`; test `lf-reviewer` "REV-2".
- RED: review arms `{E3: "sonnet"}` → sonnet; absent → opus.

#### LF6.T7 `review` and `merge` line fields `[x] done`
- Files: `core/outcome.ts`; test `lf-outcome` "review fields".
- RED: `reviewEvent` with the new fields → every spec §2.4 `review`/`merge` field; `role ∈ ROLES`,
  `fallback ∈ FALLBACKS`, `class`, `tier`, `actualTier`, `classBy` ∈ `ENUMS_V2`; fails first: no fields, no
  `FALLBACKS` export.
- GREEN: spec §2.4's `review` and `merge` fields; `ROLES` gains `spot`, `fit`, `corrective`, `integration`
  (X37d snapshot grows); exported `FALLBACKS = ["budget", "error", "local-unavailable", "transient"]` (D86;
  consumer-visible: PE-2).
- Owner's decision (PA Q1 = yes): an optional `sessionId` (the main session's id; absent when unknown) on the `review`, `merge`,
  `plan` and `gatebypass` lines, additive within v2 (`docs/outcome-log.md`, versioning rule); `installLocal` stamps it on the
  four lines it writes.
- decision (lf56): `ENUMS_V2` gains `review.class|tier|actualTier|reviewer|sample|classBy` and `merge.class|tier|actualTier|classBy`;
  `actualTier` = `small | standard | large | over` (`tierOfLines`), `tier` = the crossing tiers (`small | standard | large | inert`),
  `classBy` = the classifier's proxies plus `error` (a test reads them from `classify.ts`). `RunRole` = `Role` without the four new
  roles: `PROMPT` and `RunArgs.role` take it until a later stage adds their prompts. The `outcome-log.md` rows gain the fields now
  (◊ footnote), LF6.T14 adds the prose.
- review lf56 M3 (fixed, owner): `classBy` is a `string[]`; `ARRAY_FIELDS_V2 = ["review.classBy", "merge.classBy"]`
  (`core/outcome.ts`, append-only like `ENUMS_V2`) names the keys whose `ENUMS_V2` values apply per item; documented in
  `docs/outcome-log.md` and `AGENTS.md`; pi-economics reads it (PE-2). Test `lf-outcome` "review fields" checks every line by it.
- Gate-wiring obligations (lane (b) review of LF5.T1–T2, LF6.T1–T6; the tasks that wire `classify`, `readPolicy` and
  `reviewer` into the gate, LF6.T8–T12, honour them):
  1. `actual` for `reviewer` is `tierOfLines(n)` of the combined diff, for every class; never `"inert"` derived from the
     start estimate's `kind` (`reviewer` itself reads class `inert` as no review and a non-inert class's `"inert"` as small).
  2. `ctx = {glob: globMatch, plansDir: settings.plans.dir, isSplit: (p) => isSplitFile(settings.plans.dir, p), policyFile: settings.localFirst.policyFile, inertChecked}`;
     validate both paths as repository-relative, no `./`, no trailing `/` (else `policy-edit` and the split filter
     silently miss). `ClassifyContext` is in `core/strategy/types.ts`; the gate imports no strategy part (NR-6).
     decision (lf56-fix, review m8; D59): the settings normalise `./x`, `x/`, `x//y` (legacy accepted them) to the form git
     prints, in every profile and without a problem; only an absolute path, a `..` segment or nothing left (`""`, `.`) is
     reset to the default (test `lf-settings` "gate paths and tiers").
  3. `inertChecked` = at least one configured `mergeGate.extraChecks` entry, all passing (a failing one refuses `check`
     anyway): classify after the checks, or classify with "configured" and keep the refusal.
  4. `readPolicy` `{error}` (unresolvable base, git failure, directory/symlink at the path, malformed file) → the gate
     builds `{cls: "elevated", inertLike: false, why: ["error"]}` in one place; `classBy: ["error"]` is logged on `review`
     and `merge`; a gate test pins it for a malformed file, an unresolvable base and a git failure (CLS-2). The fallback
     policy is `settingsPolicy(settings)`; `PolicyGit` = `policyGit(run)` from the runner `createGit` is built on (`install.ts`
     keeps it), a fake in the gate's tests.
  5. Which base (owner's/orchestrator's decision): in node→parent merges (D65) the merge policy is read at the main
     branch's tip, not at the node's or the parent's: conservative, a policy change takes effect only once it is on main,
     so a policy edit committed on a parent branch outside a gate never governs its children. For a merge into main the
     base is main's tip.
  6. Settings: validate `localFirst.tiers` positive integers with small ≤ standard ≤ large (`tierOfLines` assumes it);
     `mergeGate.inertGlobs` is a string list (spec §2.1).

#### LF6.T8 The gate uses the choice (REV-1) `[x] done`
- Files: `core/local/overseer.ts`, `core/local/merge.ts`; test `lf-reviewer-gate` (new) "REV-1".
- RED: overseer rig: class standard, 200 lines → the ticket's member = `localFirst.reviewers.opus`; legacy local mode keeps `pickMember` (`local-overseer` green).
- GREEN: `pickMember` takes a `ReviewerChoice` in local-first.
- decision (lf56): `RunArgs` gains `choice` (the `ReviewerChoice`) and `line` (the review line's fields); `pickMember(s, role, b, choice)`
  maps it through `localFirst.reviewers` (`qwen` → `local`), effort = `overseer.effort` for `overseer.member`, `fallbackEffort` for
  `fallbackMember`, else the member's highest; a chosen reviewer is outside the Opus budget (CON-11), and attempt 2 keeps the chosen
  member (`fallback: error`), never a weaker one. The gate classes after the checks and the red run (obligation 3: `inertChecked` =
  ≥ 1 configured `extraChecks` entry), in `classOf` (`merge.ts`), the one fail-closed place (obligation 4): no reader, an unreadable
  policy → `{elevated, inertLike: false, why: ["error"]}`; the reader is `MergePorts.policy` (`policyGit` over install's runner,
  `LocalDeps.policyGit` a seam; the node rig reads the real repository, `lf-reviewer-gate` fakes the base and git failures). The
  review's arms are the session's (`arms()`) until a per-review draw exists. Obligations 2 and 6 are `validateLocal` rules
  (`lf-settings` "gate paths and tiers"). A `none` choice (inert) runs the legacy pick until LF6.T11.

#### LF6.T9 Advisory reviews (REV-4) `[x] done`
- Files: `core/local/merge.ts`; test `lf-reviewer-gate` "REV-4".
- RED: inert-like + haiku `revise` → merged; `review.binding = false`.
- decision (lf56): an advisory approval is recorded like a binding one (its review id on the merge, the approval key reused on
  a repeated request); a binding reviewer's revise keeps the legacy path (the test pins a small code change → Sonnet `revise`).
- decision (lf56-fix, review m6): the approval entry records the choice's `reviewer` and `binding`; local-first reuses it only when
  its `strength` (S39) is at least the current choice's (a legacy approval, without a reviewer, only where none is needed). Test
  `lf-reviewer-gate` "REV-4 an approval holds only for a reviewer at least as strong (review lf56 m6)".

#### LF6.T10 Elevated: Opus + orthogonal check (REV-3) `[x] done`
- Files: `core/local/merge.ts`; test `lf-reviewer-gate` "REV-3".
- RED: elevated with a red `extraChecks` entry and an Opus approve → refused `check`; both green → merged; no second LLM ticket.
- decision (lf56): the extra checks already refuse before any ticket (step 5), so the new rule is the red run's: "the orthogonal
  check (red run and `extraChecks`) passing" (REV-3) reads as both, where present, and at least one of them: an elevated change is
  refused `check` before any ticket when the red run shows the branch check vacuous (`passed` at the target) or when neither a red
  run nor a configured extra check ran. The detail names the class's proxies. Tests whose elevated changes had a vacuous `true`
  check (`lf-overcap` SIZE-8, `lf-reviewer-gate` REV-1) now give a real one. Reversible; reported to the owner.
- decision (lf56-fix): replaces the rule above (review lf56 m1, owner: design §5.4 lists the checks as alternatives): the
  orthogonal check is (≥ 1 configured `mergeGate.extraChecks` entry, all passed) OR (the red run `failed` at the target); without
  either an elevated change is refused `check` before any ticket. A red run that `passed` is no orthogonal check by itself; the
  review input keeps its "passed — the check may be vacuous" note. `lf-reviewer-gate` "REV-3": the `vac` case (vacuous branch
  check + a passing extra check) merges after one Opus review; a vacuous check without an extra check is refused.

#### LF6.T11 Inert merges (REV-10) `[x] done`
- Files: `core/local/merge.ts`; test `lf-reviewer-gate` "REV-10".
- RED: inert + passing extra check → merged without a ticket, `merge.class = "inert"`; no configured check → standard path (CLS-3).
- decision (lf56): an inert merge has no `reviewId` and records no approval (nothing was reviewed); the audit sample (§5.5) is a
  later stage's: LF8.T16 (CON-8 b; review lf56 m4, accepted).

#### LF6.T12 Cheap refusals first (REV-8) `[x] done`
- Files: `core/local/merge.ts`; test `lf-merge-target` "REV-8".
- RED: local-first: a dirty main checkout → refused `main-dirty` with zero tickets issued (overseer rig counts
  spawns); legacy local mode: unchanged order (`local-merge-*` green, NR-7).
- GREEN: in local-first only, probe main-dirty before step 8 (D59: the legacy gate is not changed).
- decision (lf56): the probe sits with the cheap refusals (after step 2 and the open-children check, before the checks), and
  covers the whole target as REV-8 says ("a dirty target or main"): a node→parent merge with a dirty parent worktree is refused
  `dirty` there too. Step 9 probes again (the checkout may change meanwhile).

#### LF6.T13 Transient errors retried (REV-9 a) `[x] done`
- Files: `core/local/overseer.ts`; test `lf-reviewer-gate` "REV-9 retry".
- RED: local-first, fake API: first attempt `error` with a 429/503/overloaded text → a second attempt after the
  backoff (fake clock), approve → merged; three transient errors → `fallback: "transient"` and the existing
  `error` outcome; the gate is not closed for a transient error on the first attempt (`overseer.ts:194`);
  legacy local mode keeps its behaviour (`local-overseer` green).
- GREEN: `isTransient(text)` + a retry loop of 3 with backoff 5 s/20 s behind the profile check.
- decision (lf56): the profile check is `RunArgs.retryTransient`, set by the gate for a local-first node; `isTransient` reads an
  `error` event's reason (429, 502, 503, 504, 529, overloaded, rate limit, too many requests, service or temporarily
  unavailable); a spawn refusal is not retried. At most two retries per run (`RETRY_MS` 5 s, 20 s) on the same member, each
  its own `review` line (`attempt` counts on, no `fallback`); once they ran out, the existing second attempt runs with
  `fallback: transient` and its failure is the existing `error` outcome. The quota-wait half of REV-9 stays with LF9.T8.
- review lf56 m3 (fixed): when the second attempt would rerun the same member (a chosen reviewer, local-first), the last retry
  ends the run: its line has `fallback: transient`, the run returns the existing `error` (three attempts, never a third retry).
  A second attempt on another member (no choice) keeps `fallback: transient`. Test `lf-reviewer-gate` "REV-9 retry".
- review lf56 nit (fixed): `attempt` = the step plus the retries so far, so a skipped step (a member without a model) keeps
  its number as before LF6.T13 (D59: legacy's fallback after a skipped first member is attempt 2). Test "REV-9 attempt numbers".
- review lf56 nit (fixed): `isTransient` also reads a dropped connection (`ECONNRESET`, `fetch failed`, `socket hang up`); an Esc
  ends a backoff at once (`pause` races the sleep with the signal). Test "REV-9 an Esc during a backoff".

#### LF6.T14 Docs `[x] done`
- Files: `docs/task-router.md` (classes, the policy file and its schema, reviewers), `docs/outcome-log.md`
  (fields, `FALLBACKS`). Then LF14 and release R2 (local-first still behind `experimental`, D81).

### LF7 — Actor API 3 (cross-repository: PS-1)

#### LF7.T1 Lock pi-setup at API 3; the router's copy (XR-1) `[ ] todo`
- Files: `flake.lock` (pi-setup input only), `core/api.ts`.
- Depends: XR PS-1 (published).
- RED: after `nix flake update pi-setup` (to the published PS-1 revision) `iface-subagents-task-router`/`iface-policy-task-router` fail (the copy lacks API 3).
- GREEN: copy spec §2.6's types (`RequestInfo` with `requestId`, `signal`; `hookTimeoutMs`; the `hook` event;
  `requestId` on `usage`, `afterResponse`, `tool_result`); KG-I green.

#### LF7.T2 Detection and degraded mode (XR-2) `[ ] todo`
- Files: `core/local/api3.ts` (new); test `lf-api3` (new); `test/fake-api.ts` gains `policyApi`, `tool_result`/`usage` emitters, calls of `beforeRequest`/`afterResponse` with a `requestId`, an `AbortController` per held call and a `hookTimeoutMs` knob. Consumer-visible: `test/harness.ts` imports it and pi-economics' `log-contract` imports the harness (X37f); additions only, existing exports unchanged; PE-3 replays it.
- RED: `policyApi` absent or `2` → local-first refused (XR-2, D88) unless `localFirst.experimental` → then one
  notice, spawns placed, no `beforeRequest` (the degraded preview); `3` → hooks returned with
  `hookTimeoutMs`; the fake aborts a held call → its promise settles, the fake proceeds with the payload
  unchanged.
- GREEN: `api3Of(api): {level: 1 | 2 | 3}` and `requireApi3(profile, s)`.

#### LF7.T3 Module assertion (HM-1 b) `[ ] todo`
- Files: `modules/task-router.nix`, `checks/module-eval/cases/task-router-local-first-needs-api-3.nix` (new).
- RED: the negative case (`settings.profile = "local-first"`, `spawnPolicyApi = 2`, no `localFirst.experimental`)
  expects exactly `["pi-task-router: profile local-first needs programs.pi.actorSubagents with
  passthru.spawnPolicyApi >= 3 (or settings.localFirst.experimental = true)"]` (spec HM-1 b) → fails (no
  assertion); a second case with `experimental = true` and API 2 evaluates without failed assertions.
- GREEN: the assertion; KG-M.

#### LF7.T4 Docs `[ ] todo`
- Files: `docs/task-router.md` (prerequisites), README prerequisites row (`readme-package` checks it).

### R3 owner additions (2026-11-27)

Three small additions the owner decided on 2026-11-27 (open-questions answer B5 and B10, and "Other improvements" item 1);
they ride on release R3 (0.5.0). Only T2 changes routing behaviour (a refusal at the split); T1 and T3 add optional
fields, so no schema bump (§2.4), and the new keys only grow the consumer contract (LOG-4; PE-3 reads them). Factors stay OFF.
Keep green: KG-R; KG-S for the docs.

#### R3A.T1 `cloudOnlyShare` on the `session` line (B5; spec §2.4, MEAS-3) `[x] done`
- Files: `core/outcome.ts` (`KEYS`, `SessionInput`, `sessionEvent`), `core/shell.ts` (the session line); tests `lf-session-log` "MEAS-1" (its cloud-first expectation grows the key) and "MEAS-3" (new), `lf-default` "NR-2 the session line…" (its expected line grows the key); `docs/outcome-log.md`.
- Why: without the share on the line a change of `experiments.cloudOnlyShare` is invisible in the data (router 0.4.0 lines do not carry it).
- RED: a cloud-first session that draws E0 (share 0.1, 0.5 or 1) writes `cloudOnlyShare` equal to the snapshot's share, a number; after a resume with another share the line carries the snapshot's (the draw's), not the settings'; no key on a session outside E0 (legacy local mode, routing off, no enabled cloud member; share 0 writes no line at all); fails first: the builder writes no such key.
- GREEN: `sessionEvent` takes `cloudOnlyShare?: number` (a `KEYS` entry; a number passes `finish`); the shell passes the snapshot's share when E0 was drawn. A number, so no `ENUMS_V2` entry.

#### R3A.T2 A split stays inside the node's contract (B10, review LF4 m7; spec TREE-15) `[x] done`
- Files: `core/local/split.ts` (`validateSplit` gains the node's contract; `insideGlobs`), `core/local/splittool.ts` (the contract in, `forbidden` inherited); test `lf-split` "TREE-15"; `docs/task-router.md` (the split tool).
- RED: the split of `auth.form` (contract files `src/form/**`, forbidden `src/db/**`) with a child whose `files` is `src/other.ts` → refused naming the path (`children[0].files: src/other.ts is outside the contract of auth.form (src/form/**)`), through `submit_split` and `split` alike, nothing committed or logged; a child inside (`src/form/a.ts`, `src/form/ui/**`) → accepted and its committed `forbidden` holds `src/db/**` (its own entries after it, no duplicate); a child file inside the node's `forbidden` is refused too; a node without a contract (a root, a node started without `child`) is not checked; fails first: the split is accepted.
- GREEN: `validateSplit(plan, node, caps, budget?, contract?)`: each `files` entry of a child must lie inside `contract.files` and outside `contract.forbidden`; a plain path is matched by the contract's globs, a glob entry by two probe paths with its wildcards filled (a conservative containment test: a doubtful glob is refused, TREE-14 at the merge stays the backstop); `splitNow` passes `contractOf(tree, node)` and prepends the contract's `forbidden` to each child's before the commit.
- decision (owner, 2026-11-27): replaces the m7 note of LF5.T8.

#### R3A.T3 Counterfactual logging on the `spawn` line (item 1 of "Other improvements"; spec MEAS-4) `[x] done`
- Files: `core/policy.ts` (the as-used plan for logging, `counterfactual`; `ChildBase.cf`), `core/pipeline.ts` (`dryPlan`), `core/outcome.ts` (`KEYS`, `Counterfactual`, `spawnEvent`), `core/shell.ts` (the spawn line); tests `lf-e0` "MEAS-4 …" (new, five), `outcome` "R3A.T3", `unrouted`, `lf-default` "NR-2 …" and `local-default` "default mode: outcome keys" (a default-mode spawn line grows the three keys, and only them); `docs/outcome-log.md`, `docs/task-router.md` (E0).
- Why: a possible per-spawn E0 (v2, pending owner OK) needs to know how often a spawn is *triggered* (the as-used plan picks a local member and it is up) and how often the local server is up. The same fields in both arms let the session-level analysis keep only sessions with at least one trigger. No routing changes.
- RED: every routed `spawn` line carries `planned` (the member the as-used plan picked, before the E0 filter or any health fallback), `localUp` (the planned member's `up` as the selection reads it, `memberState`: cached health probe, no `health` URL = up, ∧ ¬blocked ∧ ¬capped; only when it is a `route: "local"` member) and `triggered` (`true` iff planned is local and up, else `false`); a down probe or a reached `dailyCap`: `localUp: false`, `triggered: false`, the spawn placed as before; the cloud-only arm writes the same three values as the as-used arm for the same card and probe; an accepted explicit model is the plan's member, a force logs the routed counterfactual; the randomized leg decides `planned` in both arms (draw 0 → sonnet, 0.99 → qwen-local); a ticket child's and an unrouted spawn line carry none; fails first: no such keys. Pin (it cannot be red before the change; its plants are): a cloud-only session over 80 cards with re-spawns routes, draws (the router's random stream, call by call) and escalates exactly as an as-used session on a table without local members does, with the local member above every cloud member, so a logging plan on the router's attempt state escalates from the wrong level.
- GREEN: `createPolicy` takes the as-used plan's pick for the line: the as-used arm's own plan; the cloud-only arm's `dryPlan` (`planSpawn` on the full table, on a private attempt state kept for the session, replaying the real plan's random draws and a hash of the task id for any further call); `counterfactual` reads the `memberState` of the picked member (the selection's cached probe, so no new probe machinery; a cloud-only session probes the local server at most once per 30 s); the three values ride on the child's entry (`cf`) to its `spawn` line.
- decision (main, 2026-11-27): `planned` comes from the plan that would route (the as-used arm) or a side-effect-free dry plan (the cloud-only arm), never a second real plan; `localUp` is `memberState.up`. Plants (§11): the logging plan on the router's `attempts`, and on the router's random stream, each seen red.
- review fix H1 (R3A review, main's decision): `triggered` = ¬forced ∧ ¬explicit `model` ∧ planned is a `route: "local"` member ∧ up ∧ a cloud plan exists (the same plan on the table without the local members succeeds: the predicate of the E0 v2 delta), computed identically in both arms; the as-used arm plans once more on the cloud-only table for it (a private attempt state, the real plan's draws replayed), as the cloud-only arm already did on the full table. RED (`lf-e0` "MEAS-4 triggered: …", three): an explicit local model and a forced spawn are not triggered (`["qwen-local", true, true]` before, in the as-used arm and in a forced spawn of both); a card only a local member reaches is not triggered; over a card sequence on a table where the cloud members reach less, a spawn triggered as used is never one the cloud-only arm refuses, and a placed one has the same trigger in both arms ("card 3: triggered as used, refused in cloud-only").
- review fix L1: the counterfactual's probe is started at once and awaited after the child's entry is written and a `next:N` force consumed (`withCf` patches `cf` onto the entry before the policy returns), so no await sits between reading a force and using it. RED (`force-policy` "L1: …"): `/force other/model next:1` and two spawns at once: both ran forced (`["other/model", "other/model"]`).
- review fix L2: in a cloud-only session the logging lineage (`shadow`) of an attempt whose local member was down (`cf.localUp === false`) gets the real attempt's ran member, as the as-used selection falls back the same way; a re-spawn's counterfactual then escalates from there; other re-spawn counterfactuals stay a model, documented in the ¤ note of docs/outcome-log.md. RED (`lf-e0` "MEAS-4 a re-spawn after a health fallback …"): a read re-spawn after a fallback: `planned` 'haiku' in cloud-only, 'sonnet' as used.

### LF8 — Contact budgets, the ladder, breakers, spot-checks, batching (design §5.5; gaps 10, 13–17)

#### LF8.T1 `contact` and `ladder` builders (LOG-2) `[ ] todo`
- Files: `core/outcome.ts`; test `lf-outcome` "contact, ladder".
- RED: `contactEvent`/`ladderEvent` → every spec §2.4 field; `kind`, `shape`, `outcome`, `step` ∈ `ENUMS_V2`;
  `TRIPS` ⊇ spec §2.4's new `hint` trips; fails first: no builders.
- GREEN: both builders; `ENUMS_V2["ladder.step"]` = S40's `LadderStep` (`steer` in, no `fix`); `EVENTS_V2` += `contact`, `ladder`; `TRIPS` += the new trips (X37d snapshot grows;
  consumer-visible: PE-3).

#### LF8.T2 Contact counters (CON-2) `[ ] todo`
- Files: `core/local/contacts.ts` (new), `core/local/treestore.ts`; test `lf-contacts-shell` (new) "CON-2".
- RED: each contact kind increments `node.contacts[kind]` through a tree op and writes one `contact` line; after a resume the counts persist.
- GREEN: `createContacts(tree, log)` → `record(node, kind, shape, member, …)`.

#### LF8.T3 Leaf rounds, diff-only re-review (CON-1) `[ ] todo`
- Files: `core/local/merge.ts`, `core/local/overseer.ts`; test `lf-contacts` (new) "CON-1".
- RED: overseer rig: round 1 `revise`, the child commits, round 2 → the payload's diff = `last-reviewed..commit` only; after `points.rounds` (2) rejections → the ladder (not today's fixer).
- GREEN: the last reviewed commit per node (tree op `contact` carries it).

#### LF8.T4 Review points (CON-3) `[ ] todo`
- Files: `core/strategy/points.ts` (new), `core/strategy/local-first.ts`; test `lf-contacts` "CON-3".
- RED: the table: root with 1 child standard → no plan review; 2 children → plan review iff E7 on; integration with 151 lines or elevated → review iff E8 on; E9 on → plan review at every level; rounds = E10;
  with no arms (every factor disabled, D63) → each factor's default level (spec §2.8), i.e. the design's
  review points.
- GREEN: `points(node, arms): {planReview, integrationReview, rounds}`.

#### LF8.T4a Plan-review verdict (CON-12 a) `[ ] todo`
- Files: `core/local/planreview.ts` (new); test `lf-planreview` (new) "verdict".
- RED: `planReviewVerdict(raw, node)`: `approve` → `{ok, plan: null}`; `amend` with a valid `SplitPlan` →
  `{ok, plan}`; an invalid amendment (6 children, a slug outside the node's scope) → `{invalid, reasons}`;
  reviewer = Opus iff the node is elevated, else Sonnet (S49).
- GREEN: the pure part of S49; `validateSplit` reused.

#### LF8.T4b The plan-review ticket (CON-12 b) `[ ] todo`
- Files: `core/local/planreview.ts`, `core/local/splittool.ts` (call it after `split` and `submit_split`
  commit the plan); test `lf-planreview` "ticket".
- Depends: LF4.T9, LF4.T13, LF8.T2.
- RED: overseer rig: a root split with 2 children and no arms → one bounded ticket, role `plan-review`,
  payload = the canonical split JSON + the node's goal and contract + the caps (prefix assertions), read-only
  tools; no child starts before the verdict (`start_branch({parent, child})` is refused meanwhile, TREE-5: the split sets `pendingPlanReview` on the node, the verdict's op clears it); one `contact` line `kind: "plan-review"`, `node.contacts` +1;
  1 child standard → no ticket (CON-3).
- GREEN: `reviewSplit(node, plan, ports)` behind `points(n, arms).planReview`.

#### LF8.T4c Amendments applied (CON-12 c) `[ ] todo`
- Files: `core/local/planreview.ts`, `core/local/treestore.ts`; test `lf-planreview` "amend".
- RED: `amend` → the unstarted children replaced (a started child keeps its slug and branch), the split file
  recommitted path-limited (D66), tree op `split`, one `split` line `reason: "review"`; an invalid amendment →
  one re-ask, then the original plan stands, `contact.outcome = "invalid"`; property: ∀ verdicts, the
  tree's invariants (TREE-2, TREE-3) hold after the op.
- GREEN: `applyAmendment(tree, node, plan)` as a tree op.

#### LF8.T5 The ladder (CON-4, TREE-10) `[ ] todo`
- Files: `core/strategy/ladder.ts` (new), `core/strategy/local-first.ts`; test `lf-ladder` (new).
- RED: property over random failure sequences: each step at most once; `split` never after a merged child or in state `merged`; `retry-xhigh` iff medium; the E11 variants' sequences; `stop` last; `wait` while a quota wait is active.
- GREEN: S40.

#### LF8.T6 Breakers, pure (CON-5 a) `[ ] todo`
- Files: `core/strategy/breakers.ts` (new); test `lf-breakers` (new).
- RED: one case per breaker (S42) at limit − 1 (none) and limit (trip); reset rules.

#### LF8.T7 Breakers for package children (CON-5 b) `[ ] todo`
- Files: `core/local/childtrips.ts`, `core/local/contacts.ts`; test `lf-breakers` "CON-5 child".
- Depends: LF7.T2 (API 3 events in `fake-api`); XR PS-1.
- RED: `tool_result` events: three failing `npm test` runs → one `hint` line `trip: "same-test"` and the ladder entered; under API 2 → only today's trips (XR-2).

#### LF8.T8 The ladder driver `[ ] todo`
- Files: `core/local/ladderdrive.ts` (new), `core/local/install.ts`; test `lf-ladder-shell` (new) "driver".
- RED: a trip or a red gate check on a node → `strategy.ladder` consulted, op `ladder`, one `ladder` line; the step's action invoked through injected ports (fakes record them).
- Review LF4 m4 (recorded, not fixed in LF4): a crash between a split's commit and its tree op leaves the committed file and no
  op; a retry with the same plan fails "nothing to commit". The driver's split step (and `splittool.ts` `splitNow`) takes a
  node HEAD that already holds the same rendered file as the commit. RED: commit the file, drop the op, split again → `ok`.
- Review LF4 m9 (recorded, unverified risk): `submit_split` (like `submit_plan`) closes over the main instance's tree store
  and `pi.sendMessage`; a package child running across a `/reload` would apply its split to the old instance, and the new
  tree would see it only at the next `session_start`. Verify against pi's reload first (does the old instance's
  `appendEntry` still reach the session?); if so, resolve the store at call time (a `globalThis` handle of the live instance).
  RED: harness reload between a package spawn and its `submit_split` → the live tree has the node `split`.

#### LF8.T9 Retry at xhigh (LOC-4) `[ ] todo`
- Files: `core/local/ladderdrive.ts`, `core/local/package.ts`; test `lf-ladder` "LOC-4".
- RED: a medium child trips → a fresh child on the same package at `xhigh` (placement's `thinkingLevel`); an xhigh child trips → next step `split`.

#### LF8.T10 Corrective contact (CON-6) `[ ] todo`
- Files: `core/local/corrective.ts` (new), `core/local/overseer.ts` (`ROLES` += `corrective`; ticket with `submit_correction`); test `lf-corrective` (new).
- RED: payload = goal, check, the last failures (≤ 4 kB), the focal diff (≤ 8 kB); member Sonnet (standard) / Opus (elevated); `submit_correction` → a revised card, a fresh local child spawned with it.

#### LF8.T11 Hand-off step `[ ] todo`
- Files: `core/local/ladderdrive.ts`; test `lf-ladder-shell` "handoff".
- RED: after the corrective failed → one open-ended agent one tier up (today's `fixerCard` with the next member), `contact.shape = "open"`; a second failure → `stop`.

#### LF8.T12 Stop and report (CON-7) `[ ] todo`
- Files: `core/local/ladderdrive.ts`; test `lf-ladder-shell` "CON-7".
- RED: `stop` → node `blocked`, one message to the main (node, steps, last failure; prefix-asserted), no later contact for the node (property over further events).

#### LF8.T13 Steer only as an arm (CON-10) `[ ] todo`
- Files: `core/local/steer.ts`; test `lf-ladder-shell` "CON-10".
- RED: a local-first session with persistent trips → no steer spawn unless E11 = `steer`; legacy local mode unchanged (`local-steer` green).

#### LF8.T14 No session cap (CON-11) `[ ] todo`
- Files: `core/local/overseer.ts`; test `lf-contacts-shell` "CON-11".
- RED: 16 review tickets in a local-first session → all issued (no `fallback: "budget"`); legacy local mode keeps the cap.

#### LF8.T15 Spot-check sampling (CON-8 a) `[ ] todo`
- Files: `core/local/spot.ts` (new); test `lf-spotcheck` (new) "sample".
- RED: `spotDue(kind, unit, share)` deterministic (D79); frequencies over 20 000 units within ±2 % of `share` for each sample kind.

#### LF8.T16 Spot-check tickets (CON-8 b) `[ ] todo`
- Files: `core/local/spot.ts`, `core/local/merge.ts`; test `lf-spotcheck` "CON-8".
- RED: a sampled inert merge, a sampled ungated output and a sampled gate review → one bounded Opus ticket each after the merge, `review` line `role: "spot"`, `sample`, `of`; a `revise` never reverts or blocks; cloud-first keeps `core/spotcheck.ts` (`spotcheck` green).
- Review lf56 m4 (tracked here): REV-10's audit sample of inert merges is this task's. Since LF6.T11 an inert merge has no
  `reviewId` and records no approval, so inert merges are unaudited until this task lands (R2 ships them behind
  `localFirst.experimental` only).
- Ungated output (D90): a child placed local by its card kind (S34b; `meta.ungated = true`: scout, lookup,
  mechanical, implement, debug-design outside a package); the artifact sampled is its report as the main's
  session received it (the `[message from <child>]` entry; X44 verifies that shape first); a child that ends
  without a report is not sampled. The `review` line: `sample: inert | ungated | shadow` (spec §2.4), `of` =
  the merge's branch, the child's name or the shadowed review id.

#### LF8.T17 Batch selection (CON-9 a) `[ ] todo`
- Files: `core/local/batch.ts` (new); test `lf-batching` (new) "select".
- RED: consecutive small/inert merged leaves of one parent accumulate until the E5 cap; an elevated leaf is never batched and closes the batch.

#### LF8.T18 Batch merges and review (CON-9 b) `[ ] todo`
- Files: `core/local/batch.ts`, `core/local/merge.ts`; test `lf-batching` "CON-9".
- RED: E4 on: two small leaves merge into the parent with checks only (`review` absent, `merge` line `batch` pending); the parent's merge up triggers one review of the accumulated diff, `review.batch = [ids]`; E4 off → per-leaf reviews.

#### LF8.T19 Docs `[ ] todo`
- Files: `docs/task-router.md` (contacts, the ladder, breakers, spot-checks, batching), `docs/outcome-log.md`.

### LF9 — Quota (design §5.6; gaps 11, 23; consumes QW-1)

#### LF9.T1 Header parser (Q-1 a) `[ ] todo`
- Files: `core/quota.ts` (new); test `lf-quota` (new) "Q-1".
- RED: fixture headers (D73) → `{window, utilization, resetAt}`; unknown provider / missing headers → `[]`; malformed numbers → `[]`.

#### LF9.T2 `quota` builder `[ ] todo`
- Files: `core/outcome.ts`; test `lf-outcome` "quota".
- RED: `quotaEvent` → every spec §2.4 `quota` field; `kind`, `source`, `window` ∈ `ENUMS_V2`; `resetAt` an ISO
  string; fails first: no builder.
- GREEN: the builder; `EVENTS_V2` += `quota`.

#### LF9.T3 Reading the headers (Q-1 b) `[ ] todo`
- Files: `core/shell.ts`, `core/local/package.ts` (children's `afterResponse`); test `lf-quota-shell` (new) "Q-1".
- Depends: LF7.T2; XR PS-1 (children's `afterResponse`; under API 2 only the main's headers are read).
- RED: the main's `after_provider_response` and a child's `afterResponse` update the state; crossing 0.8 writes one `quota` line `kind: "threshold"`.

#### LF9.T4 quota-wait detection (Q-2) `[ ] todo`
- Files: `core/quota.ts`, `core/shell.ts`; test `lf-quota-shell` "Q-2".
- Depends: XR QW-1 only for the live path; the router side is built against its own proposal (D91).
- RED: a fake `globalThis.__quotaWait_v1 = {version: 1, waits()}` present at `session_start` → fallback off,
  `waits()` seeds the active set; `start`/`end` events on `pi.events` channel `quota-wait:v1` → `quota`
  lines (`source: "quota-wait"`); `version: 2` or absent → one notice per process (two sessions, one
  notice), fallback on.
- GREEN: the router-proposed contract (spec §2.5, D91) as types in `core/quota.ts`; QW-1 asks quota-wait to
  publish exactly it.

#### LF9.T5 Waiting is not stuck (Q-3) `[ ] todo`
- Files: `core/local/ladderdrive.ts`, `core/local/childtrips.ts`; test `lf-quota-shell` "Q-3".
- RED: an active wait for the child's session → a turn-budget overrun trips nothing, the ladder returns `wait`, no message to the main.

#### LF9.T6 Fallback rule (Q-4 a) `[ ] todo`
- Files: `core/strategy/quota-rule.ts` (new), `core/strategy/local-first.ts`; test `lf-quota` "Q-4".
- RED: S43's table (in-flight 2 → queue; q5h 0.85 + open-ended standard → deny; elevated review or `t2` → go; exhausted: elevated → wait, standard review → downgrade); `quotaWait` present → always go.

#### LF9.T7 Fallback in the contacts (Q-4 b) `[ ] todo`
- Files: `core/local/contacts.ts`, `core/local/overseer.ts`; test `lf-quota-shell` "Q-4".
- RED: three concurrent review tickets without quota-wait → the third waits until one ends; an exhausted window → a standard review on Sonnet (`fallback` recorded), the assigned arm kept on the line.

#### LF9.T8 Reviews wait out a quota-wait episode (REV-9 b) `[ ] todo`
- Files: `core/local/overseer.ts`; test `lf-reviewer-gate` "REV-9 wait".
- RED: a ticket's attempt errors while `__quotaWait_v1.waits()` lists the provider → the ticket waits for `end`, then retries; never `fallback: "error"` for it.

#### LF9.T9 Docs `[ ] todo`
- Files: `docs/task-router.md` (quota, the fallback, quota-wait as optional).

### LF10 — The local queue and model facts (design §5.7; gaps 21, 22)

#### LF10.T1 Model facts from the registry (LOC-1) `[ ] todo`
- Files: `core/facts.ts` (new); test `lf-facts` (new).
- RED: a fake registry with `qwen` (ctx 262144, maxTokens 131072, levels) → those values, not the member copy; the model missing → the member copy.

#### LF10.T2 Serving facts (LOC-8, NR-5) `[ ] todo`
- Files: `core/local/serving.ts` (new); test `lf-serving` (new).
- RED: injected fake `fetch` for `http://localhost:8080/{health,props,slots}` → `{live, build, templateEndTag, slots}`, one fetch per path per session; without an injected `fetch` → `unknown`, zero calls to `globalThis.fetch` (stubbed to throw).

#### LF10.T3 The queue, pure (LOC-6 a) `[ ] todo`
- Files: `core/local/lqueue.ts` (new); test `lf-lqueue` (new) "LOC-6".
- RED: property over random interleavings of `acquire`/`end`/timer/`kill` with a fake clock: never two holders; FIFO hand-over; the holder's re-acquire within `affinitySec` keeps the stream; `kill` of the holder hands over.
- GREEN: S44.

#### LF10.T4 `lqueue` builder `[ ] todo`
- Files: `core/outcome.ts`; test `lf-outcome` "lqueue".
- RED: `lqueueEvent` → every spec §2.4 `lqueue` field; `waiter`, `outcome` (`granted | aborted | timeout`)
  ∈ `ENUMS_V2`; `waitedMs` an integer; fails first: no builder.
- GREEN: the builder; `EVENTS_V2` += `lqueue`.

#### LF10.T5 The main in the queue (LOC-6 b) `[ ] todo`
- Files: `core/shell.ts`; test `lf-lqueue` "main".
- Depends: LF1.T0 (`pi-hooks` proved X33: pi awaits `before_provider_request` on the openai-completions
  transport) and X45 (whether the hook sees `ctx.signal`).
- RED: `fake-pi`: the main on the local model requests while a fake child holds the stream → its handler resolves only after the child's `end` + affinity; one `lqueue` line `waiter: "main"`; a cloud main never waits;
  Esc (`ctx.signal` aborted) while held → the waiter leaves, `outcome: "aborted"`; if X45 found no signal
  → the hold ends after `mainHoldSec` (600 s, fake clock) with `outcome: "timeout"` and the request proceeds.
- GREEN: S51 for the main.

#### LF10.T6 Children and qwen reviews in the queue (LOC-6 c) `[ ] todo`
- Files: `core/local/package.ts`, `core/local/overseer.ts` (local-member tickets); test `lf-lqueue` "children".
- Depends: LF7.T2; XR PS-1.
- RED: two local children's `beforeRequest`s → serialised; a qwen review ticket's request waits behind a child; `usage` with the same `requestId` ends a request; the fake aborts a held child (kill, pause) → it leaves the queue, the next waiter is granted at once, one `lqueue` line `outcome: "aborted"`; a hold past `hookTimeoutMs` → `outcome: "timeout"` (S51).
- GREEN: S51 for children and tickets.

#### LF10.T7 Docs `[ ] todo`
- Files: `docs/task-router.md` (the local queue, `affinitySec`, its relation to `slots`/`queueMaxSec`).

### LF11 — The merge queue and integration per level (design §5.2, §12.14, §12.16; gap 27)

#### LF11.T1 The lock, pure (MQ-1 a) `[ ] todo`
- Files: `core/local/mqueue.ts` (new); test `lf-mqueue` (new) "MQ-1".
- RED: property over random interleavings of acquire/release/abort across 3 targets: ≤ 1 holder per target; FIFO per target; an aborted waiter never becomes holder.

#### LF11.T2 Persisted waiters (MQ-4) `[ ] todo`
- Files: `core/local/mqueue.ts`, `core/shell.ts` (restore); test `lf-mqueue` "MQ-4".
- RED: entries replayed after a resume → the same waiters in order; a holder recorded without `release` → released at `session_start` (one `mqueue` line `outcome: "aborted"`).
- GREEN: `MQUEUE_TYPE = "task-router/mqueue"` exported.

#### LF11.T3 `mqueue` builder (MQ-5 a) `[ ] todo`
- Files: `core/outcome.ts`; test `lf-outcome` "mqueue".
- RED: `mqueueEvent` → every spec §2.4 `mqueue` field; `outcome` ∈ `ENUMS_V2`; `REASONS ⊇ ["conflict",
  "aborted-queue"]`; fails first: no builder.
- GREEN: the builder; `EVENTS_V2` += `mqueue`; `REASONS` += `conflict`, `aborted-queue` (X37d;
  consumer-visible: PE-3).

#### LF11.T4 Rebase and re-review (MQ-2) `[ ] todo`
- Files: `core/local/merge.ts`, `core/local/gitcmd.ts` (`rebase`, `rebaseAbort` ports); test `lf-mqueue-git` (new) "MQ-2".
- RED: real git: the parent moved after an approval → rebase → new tree → a second review (`rereview: true`); parent unchanged → the approval reused (no ticket).

#### LF11.T5 The queue in `request_merge` (MQ-1 b) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-mqueue-git` "MQ-1 ff".
- RED: real git: sibling A's `request_merge` holds the lock, its review blocked on a deferred the test owns;
  sibling B's `request_merge` is started and the test awaits B's `mqueue` entry `op: "enqueue"` (a barrier, no
  sleeps); the test resolves A's review → A merged, then B rebased and merged, both ff-only; the merged tree
  of each = its reviewed tree (fake overseer records the reviewed tree id); the order is asserted on the
  `mqueue` lines.
- GREEN: acquire → S45's steps → release in `requestMerge`, in local-first only.

#### LF11.T5a Split files leave the root before its review (D85; owner, Q26) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-mqueue-git` "split files".
- RED: real git: a root whose tree holds `<plans.dir>/split/root.json` and a child's split file → after the
  rebase step, one commit on the root branch removes `<plans.dir>/split/**`; the review diff and the approval
  key (`commit`, `tree`) are those after the removal (no re-review after the approval); the main branch's
  tree after the merge has no `split/` path; a node→parent merge keeps its split files.
- GREEN: `dropSplitFiles(worktree)` between the rebase and the checks, for a target that is a main branch.

#### LF11.T6 Conflict or red → a bounded local fix (MQ-3) `[ ] todo`
- Files: `core/local/mqfix.ts` (new), `core/local/merge.ts`; test `lf-mqueue` "MQ-3".
- RED: a conflicting rebase → `rebase --abort`, lock released (the next waiter proceeds), one fresh local child spawned with the fix card (`cwd` = the node's worktree), no cloud ticket; the fix's failure → the ladder's first step.

#### LF11.T7 Abort leaves the queue (MQ-5 b) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-mqueue-shell` (new).
- RED: an aborted `request_merge` (signal) while waiting → `mqueue` line `outcome: "left"`, the queue without it; each merge → one line with `waitMs`, `rereview`.

#### LF11.T8 Checks per level (TREE-8) `[ ] todo`
- Files: `core/local/levelchecks.ts` (new), `core/local/merge.ts`; test `lf-integration` (new).
- RED: a parent with two merged children → the queue's checks step runs the parent's and both children's checks (deduplicated) on the rebased tree; a red child check → the ladder; property: no merge refused for size.
- GREEN: D76.

#### LF11.T8a The integration's reviewer (CON-13 a) `[ ] todo`
- Files: `core/local/integration.ts` (new); test `lf-integration` "reviewer".
- RED: combined diff `target..tip` of 40 lines in `*.md` + tests → inert-like reviewer; 200 standard lines
  → the large tier's reviewer (Opus); one elevated file → elevated (Opus fresh + orthogonal check); property:
  `integrationReviewer(d) = reviewer({cls: classify(d.files), actual: tierOfLines(d.lines), inertLike, review:
  arms})` ∀ generated diffs (the leaf table, S39, S50).
- GREEN: `integrationReviewer(diff, policy, arms)`.

#### LF11.T8b The integration contact in the queue (CON-13 b) `[ ] todo`
- Files: `core/local/integration.ts`, `core/local/merge.ts` (S45's review step by kind); test
  `lf-integration` "contact".
- Depends: LF8.T2, LF8.T4.
- RED: real git + overseer rig: a node with two merged children, combined 160 lines, no arms → one ticket
  for the combined diff with the chosen reviewer, one `contact` line `kind: "integration"`,
  `node.contacts.integration` +1, `review.role = "integration"`; approve → ff into the parent; revise → the
  ladder's first step for the node, never `split` (TREE-10); an unchanged tree on a retry reuses the approval
  (MQ-2).
- GREEN: `points(n, arms).integrationReview` ? `integrate(node, ports)` : the next task's path.

#### LF11.T8c Checks only without a review point (CON-14, TREE-8) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-integration` "checks only".
- RED: a node with merged children, combined 90 lines standard, no arms → level checks green → merged with
  zero tickets, no `review` line, `merge.reviewId` absent; checks red → the ladder; property over (lines,
  class, E8): a ticket is issued iff `points(...).integrationReview`.
- GREEN: the `else` branch of S45's review step for nodes.

#### LF11.T8d Over-cap integrations (CON-13 c, SIZE-8) `[ ] todo`
- Files: `core/local/integration.ts`; test `lf-integration` "over-cap".
- RED: a combined diff of 900 lines → the review input = numstat + the level checks' output + the riskiest
  hunks within `overCapBytes` (design O3), `review.overCap = true`, the reviewer = the `over` row (Opus); the
  contact is counted (`node.contacts.integration` +1, one `contact` line); never the `diffBudget` refusal.
- GREEN: reuse `overCapInput` (LF5.T10) with the level checks' output.

#### LF11.T9 The fit check (TREE-9) `[ ] todo`
- Files: `core/local/fit.ts` (new), `core/local/install.ts`; test `lf-fit` (new).
- RED: the last child merges → one fresh local child with the fit brief and `submit_fit`; `miss` → op `fit` (a `fix` child added), one message to the main, the merge stands; `fit` → nothing; a failed fix package → the ladder's first step.

#### LF11.T10 Docs `[ ] todo`
- Files: `docs/task-router.md` (the merge queue, per-level checks, the fit check).

### LF12 — Thinking budget per request; context values (design §5.7; gaps 19, 20)

#### LF12.T1 Child effort (LOC-2) `[ ] todo`
- Files: `core/local/package.ts`, `core/strategy/local-first.ts` (`child`); test `lf-thinking` (new) "LOC-2".
- RED: child arms `{E12: "medium"}` → `thinkingLevel: "medium"`; absent → `xhigh`; the main stays at LF3.T6's
  `xhigh` (LOC-2: this task does not touch it); the default members table unchanged (D71; `router-golden`
  green).
- GREEN: `child(arms).thinkingLevel` in the placement's `PolicyResult`.

#### LF12.T2 Build verification (LOC-3 a) `[ ] todo`
- Files: `core/local/thinking.ts` (new); test `lf-thinking` "supported".
- RED: `/props` fixtures: build 10964 + end tag → true; 10963, no tag, or unknown → false.

#### LF12.T3 Payload rewrite (LOC-3 b) `[ ] todo`
- Files: `core/local/thinking.ts`; test `lf-thinking` "payload".
- RED: S46: `16k` → `thinking_budget_tokens: 16384` (field from the registry's compat, X36); `unbounded` → unchanged; unsupported → unchanged + one `budget-unsupported` note per session.

#### LF12.T4 Wiring into `beforeRequest` (LOC-3 c) `[ ] todo`
- Files: `core/local/package.ts`; test `lf-thinking` "LOC-3".
- Depends: LF10.T6; XR PS-1.
- RED: a medium child's every request (fake API 3) carries the field; the hook composes with the queue (LF10.T6): wait first, then rewrite; an aborted hold returns the payload unchanged (S51).
- GREEN: `beforeRequest = (p, info) => lq.hold(info).then(() => rewrite(p))`.

#### LF12.T5 Children's soft hint (LOC-5 a) `[ ] todo`
- Files: `core/local/childtrips.ts`; test `lf-context` (new) "child soft".
- RED: a package child's `contextTokens` (`AgentInfo`) passes E14c (64k) → one context hint; 32k under `E14c=32k`.

#### LF12.T6 The main's soft hint (LOC-5 b) `[ ] todo`
- Files: `core/local/install.ts`; test `lf-context` "main soft".
- RED: local-first main → hint at 96k (not `hints.contextSoftTokens` 32000, which legacy local mode keeps).

#### LF12.T7 The fold hint (LOC-5 c) `[ ] todo`
- Files: `core/local/install.ts`; test `lf-context` "fold".
- RED: the main above 96k inside a package (a node `active` with a running child) → no fold hint; at a package boundary (a merge just done) → one; ≥ E14f → one regardless (X39: a hint only).

#### LF12.T8 The uncached breaker (LOC-5 d) `[ ] todo`
- Files: `core/local/childtrips.ts`, `core/local/install.ts`; test `lf-context` "uncached".
- Depends: LF7.T2; XR PS-1 (children's `usage`); X34 first.
- RED: a child's `usage` with `input + cacheWrite ≥ 65536` → trip `uncached` (ladder); the main's `message_end` usage → a hint to the main (the main has no ladder).

#### LF12.T10 Local-first leaves the experimental gate (PRO-9 b, D81) `[ ] todo`
- Files: `core/settings.ts`, `core/profile.ts`; test `lf-settings` "PRO-9", `lf-profile` "PRO-9".
- Depends: LF8, LF10, LF11 complete (the ladder, the local queue, the merge queue).
- RED: `{profile: "local-first"}` without `experimental`, API 3 → local-first, no problem; API 2 → refused
  (D88, the XR-2 notice), cloud-first; LF3.T2's PRO-9 a case changes to this expectation (reason: D81, the
  gate ends at 0.5.0).
- GREEN: drop the experimental requirement; `experimental` keeps only its API-2 preview meaning.

#### LF12.T9 Docs `[ ] todo`
- Files: `docs/task-router.md` (thinking arms, the budget field, context values). Then LF15 and release R3.

### LF13 — Lean children (design §5.7, E18 mechanism; gap 28)

#### LF13.T1 Lean brief and tools (LOC-7 a) `[ ] todo`
- Files: `core/strategy/brief.ts` (new), `core/strategy/local-first.ts`; test `lf-lean` (new) "brief".
- RED: S47; property over random package contracts: the contract lines are in both `full` and `lean`; lean tools ≤ 12.

#### LF13.T2 Lean placement (LOC-7 b) `[ ] todo`
- Files: `core/local/package.ts`; test `lf-lean` "LOC-7".
- Depends: LF7.T2; XR PS-1.
- RED: `{E18: "lean"}` → `systemPrompt`, `tools`, `contextFiles: false` in the policy result; `full` → none of them; API 2 (the experimental preview) → `full` + the XR-2 notice.
- GREEN: spread `lean(brief)` into the placement's `PolicyResult` when `arms.E18 === "lean"`.

#### LF13.T3 Docs `[ ] todo`
- Files: `docs/task-router.md` (lean children).

### LF14 — Factors, stage 1: E2, E3 (after LF6)

LF14–LF18 never enable a factor in code (D63, orchestrator's call): each milestone proves its factors end to
end with `experiments.factors.<id>.enabled = true` in the test's settings, and the registry property
`∀ f ∈ FACTORS: f.enabled === false` (LF2.T1) stays green. The owner enables them after E0/E1 have data
(§15.3).

#### LF14.T1 E2 and E3 end to end `[x] done`
- Files: `core/local/install.ts` (the session's tier from the snapshot); test `lf-arms-shell` (new) "stage 1".
- Note (LF2 review): until this task, lines carry only session arms (S33, `unitArms` empty); E3's per-review arm and any unit arm reach the lines here.
- RED: a harness session with E2, E3 enabled by settings → E2 drawn once per session (on the `session` line and
  every local-first line), E3 per review (on its `review` line), the drawn levels change the tier and the
  reviewer; the same session without the settings → no `E2`/`E3` arms, defaults used.
- GREEN: wire `sessionTier(arms)` (LF5.T2) and `reviewer(...)` (LF6.T6) to the snapshot's arms.
- Review lf56 m9 (tracked here, not fixed in LF6): E3's per-review draw belongs to this task. Until it lands the gate passes
  `review: armsFor("session")` (`core/local/merge.ts`, the `reviewer` call), so REV-2 is inert even with E3 enabled and no
  `review` line carries E3; E3 ships OFF until then.
- Done (lf14). Tests: `lf-arms-shell` "stage 1" (a harness session over real git: E2 and E3 enabled by settings, a review through the shell's
  overseer; `test/tree-rig.ts` `treeRig` takes `{apiExt, extra}`), `lf-reviewer-gate` "REV-2 E3 per review". RED seen: the Sonnet-drawn review
  ran `anthropic/claude-opus-5-5` (m9), and a stray session `E3` arm decided the gate's reviewer. "stage 1: E3 is a draw of the review, never
  of the session" is a pin of `armsOf`'s unit kinds (RND-1, RND-4), red only by a plant (E3's registry unit made `session`), as E2's test is.
- decision (lf14): the E2 half needed no code. `armMap` (the snapshot's session arms, `core/shell.ts`) already feeds `sessionTier` at every
  reader (start refusal, node and merge lines, crossings, brief budgets) since LF5/LF6; `install.ts` did not change. The test pins it.
- decision (lf14): E3's draw is made by the gate once per review: `NodeDeps.reviewArms(unit)` (required, review lf14 L4: an unwired E3 is a typecheck error; the shell: `armsFor("review", "<sessionId>:<unit>")`),
  unit = `<node id>:<reviewed commit>` (a review without a node: the branch name for the node id). A re-review after a REVISE is a new
  commit, so a new review and a new draw; the same node's same commit asked again (a review-unavailable retry, an approval reuse) keeps its
  draw, so a retry never re-rolls its reviewer. The commit alone is not the unit (review lf14 H1): a node merges into its parent by
  fast-forward, so the parent's tip is its last child's reviewed commit, and the parent's own review (another diff, another approval key)
  would share the child's draw. The review id is not the unit: it is minted per attempt inside the overseer, after the reviewer is chosen.
  `reviewer(...)` reads the review's arms only (a session `E3` is ignored). Local and reversible: the key is one expression in
  `core/shell.ts` and one argument in `core/local/merge.ts`.
- decision (lf14): E3's arm is on every gate `review` line (each attempt of the review) whatever the review is, as RND-6 says (every line carries
  its unit's enabled factors); it decides the reviewer only for a standard-class review of an `actualTier: standard` change, so an analysis of E3
  filters on the line's `class` and `actualTier`. The review's `merge` line carries the session's arms only (its unit is the merge). A review
  that is not run (an inert class) has no line and no arm. The factor is not conditional like E13: its unit is the review itself.
- decision (lf14, review L2): the 100 % size hint names the reviewer the size gives, the same text in every arm (the worker never learns the
  draw: it needs the commit, which does not exist yet): `reviewer(...)` is asked under every level of E3 and the distinct reviewers are
  joined, so where E3 decides (a standard-class change of the standard tier) the text reads "opus or sonnet", elsewhere one reviewer
  ("opus", "sonnet"). True in both arms (and when E3 is off, where it is Opus); S48's template is unchanged. The hint's `arms` hold no E3.
- decision (lf14): a node that outlives a switch to cloud-first (PRO-6) still draws and obeys E3 at its gate, but its lines carry no arms (S33: `arms`
  iff the session is local-first now), session arms included. The unit is lost to the analysis, unbiased (whether a node outlives a switch
  does not depend on the review's draw). Pinned by `lf-arms-shell` "stage 1: a node open after a switch to
  cloud-first …" (review lf14 L1; the alternative, no E3 draw once the session is cloud-first, was planted and seen to fail it).

#### LF14.T2 Docs `[x] done`
- Files: `docs/task-router.md` (running factors: enabling, weights, the owner's gate). Then release R2.

### LF15 — Factors, stage 2: E12, E13 (after LF12)

#### LF15.T1 E12 and E13 end to end `[ ] todo`
- Files: `core/local/package.ts`; test `lf-arms-shell` "stage 2".
- RED: as LF14.T1 with E12, E13 enabled by settings; E13 drawn only for `E12=medium` children (unit = child),
  never on an xhigh child's lines.
- GREEN: `assign("E13", childId)` only inside the medium branch.

### LF16 — Factors, stage 3: E4, E5 (after LF8, LF11)

#### LF16.T1 The batch cap from E5 `[ ] todo`
- Files: `core/local/batch.ts`; test `lf-batching` "E5".
- RED: `{E5: "300"}` → the batch closes at 300 lines; default 150.

#### LF16.T2 E4 and E5 end to end `[ ] todo`
- Files: `core/local/batch.ts`; test `lf-arms-shell` "stage 3".
- RED: E4, E5 enabled by settings → E4 per session, E5 per session, both on the batch's `review` line; a batched
  leaf's `review` line has no `E17` arm (REV-5).
- GREEN: `batchCap(arms)` read from the snapshot. Then release R4 (with LF13, LF19).

### LF17 — Factors, stage 4: E6–E10 (after LF11)

#### LF17.T1 E6 flat `[ ] todo`
- Files: `core/strategy/local-first.ts` (`treeCaps`); test `lf-tree` "E6".
- RED: request arms `{E6: "flat"}` → `maxDepth 1`: a depth-1 node gets no `submit_split`; the ladder skips `split` at depth 1.

#### LF17.T2 E6–E10 end to end `[ ] todo`
- Files: `core/local/splittool.ts`; test `lf-arms-shell` "stage 4".
- RED: E6–E10 enabled by settings → E6 per request, E7/E9 per request, E8 per node, E10 per package, each on
  its unit's lines; the drawn `off` level of E7 removes the root's plan-review ticket (LF8.T4b) and of E8 the
  integration ticket (LF11.T8b) — the contacts exist since LF8/LF11.
- GREEN: the units' ids passed to `assign`. Then release R5.

### LF18 — Factors, stage 5: E11, E14–E18 (after LF9, LF10, LF13)

#### LF18.T1 E11 variants end to end `[ ] todo`
- Files: `core/local/ladderdrive.ts`; test `lf-ladder-shell` "E11".
- RED: per ladder entry, `E11=steer` → a steer contact instead of corrective/hand-off; `corrective` → stop after it.

#### LF18.T2 E14 levels `[ ] todo`
- Files: `core/strategy/local-first.ts` (`context`); test `lf-context` "E14".
- RED: each of E14c/m/f/b's second level changes exactly its value.

#### LF18.T3 E15 plan budgets `[ ] todo`
- Files: `core/strategy/local-first.ts` (`treeCaps`); test `lf-tree` "E15".
- RED: `{E15: "3x80"}` → `maxChildren 3`, `planLines 80`.

#### LF18.T4 E16 Opus authors the top-level plan (TREE-12 b) `[ ] todo`
- Files: `core/local/planflow.ts`, `core/local/splittool.ts`; test `lf-top-plan` "TREE-12 opus".
- RED: request arms `{E16: "opus"}` → the root's plan comes from a `plan_request` ticket and is stored as the root split (op `split`, `reason: "choice"`) with no plan review (S49 runs on the `split` path only); the main's `split` of the root is refused with the reason.

#### LF18.T5 E17 strata (REV-5) `[ ] todo`
- Files: `core/strategy/reviewer.ts`; test `lf-reviewer` "REV-5".
- RED: property: qwen only for (small, binding) and (inert-like, advisory); never standard+, never elevated, never for whether a cloud contact happens; a batched unit (E4) is never in E17: no `E17` draw, no `E17` arm.

#### LF18.T5a E17 shadow reviews (REV-11, D87) `[ ] todo`
- Files: `core/local/spot.ts`; test `lf-spotcheck` "REV-11".
- RED: with `localFirst.e17ShadowShare = 0.5`, a review in an E17 stratum is shadowed with probability 0.5 in both arms
  (frequencies over 20 000 units within ±2 % per arm and stratum); the shadow = a fresh Opus reviewer (CON-8, both arms),
  after the merge, `review.sample = "shadow"`, `of` = the shadowed review id, the arm of the
  shadowed review on the line; outside E17 the shadow rate stays `spotCheckShare`.
- GREEN: `shadowShare(unit) = inE17(unit) ? s.e17ShadowShare : s.spotCheckShare` in `spotDue`.

#### LF18.T6 qwen fallback, intention to treat (REV-6, RND-7) `[ ] todo`
- Files: `core/local/overseer.ts`; test `lf-reviewer-gate` "REV-6", "RND-7".
- RED: qwen ticket times out on the slot / serving says down → the stratum's cloud reviewer, `fallback: "local-unavailable"`, the line's arms keep `E17=qwen`.

#### LF18.T7 qwen's review is bounded (REV-7) `[ ] todo`
- Files: `core/local/overseer.ts`; test `lf-reviewer-gate` "REV-7".
- RED: the qwen ticket gets the triad payload, read-only tools, the harness verdict tool, a fresh session (never the author's), and its requests pass the local queue.

#### LF18.T8 Stage 5 end to end `[ ] todo`
- Files: `core/local/install.ts`; test `lf-arms-shell` "stage 5".
- RED: E11, E14c/m/f/b, E15, E16, E17, E18 enabled by settings → each drawn per its unit and on its lines; E17
  enabled with `localFirst.e17ShadowShare` outside (0, 1] → one settings problem
  `experiments.factors.E17 needs localFirst.e17ShadowShare in (0, 1]` and E17 stays at its default level.
- GREEN: the check in `validateLocal`'s local-first branch. Then release R6. E17 is enabled only by the owner
  (shadow share 0.5, δ 3/5 pp: Q25); the analysis rule is pi-economics' PA-4.

### LF19 — Retire legacy local mode (D59; after LF13; Q24)

Each task rewrites the named superseded local-mode cases to the local-first expectation; the reason in each
commit: "local mode retired (D59); superseded by REQ-…".

#### LF19.T1 `mode: "local"` aliases local-first (RET-1 a) `[ ] todo`
- Files: `core/settings.ts`, `core/profile.ts`; tests `lf-settings` "RET-1", `local-settings` (X37c).
- RED: `{mode: "local"}` → profile `local-first` + the problem `mode is deprecated; use profile`.

#### LF19.T2 The gate (RET-1 b) `[ ] todo`
- Files: `core/local/merge.ts`; tests `local-merge-refuse`, `local-merge-plan` (size cases → SIZE-8 expectations).

#### LF19.T3 The section (RET-1 c) `[ ] todo`
- Files: `core/prompt.ts`; test `local-prompt` (`localSection` cases → S41).

#### LF19.T4 Overseer budget and steer default (RET-1 d) `[ ] todo`
- Files: `core/local/overseer.ts`, `core/local/steer.ts`; tests `local-overseer`, `local-overseer-shell`, `local-steer` (→ CON-10, CON-11).

#### LF19.T5 Fixer → ladder (RET-1 e) `[ ] todo`
- Files: `core/local/merge.ts`, `core/local/ladderdrive.ts`; test `local-fixer` (→ CON-4 hand-off).

#### LF19.T6a No `isLocal` in the shell and the policy (RET-1 f) `[ ] todo`
- Files: `core/shell.ts`, `core/policy.ts`; test `lf-seams` "RET-1 no isLocal" (scan of the two files).
- RED: the scan finds `isLocal(` in both; `local-default` and `policy` green.
- GREEN: read `profile.current()` (the per-session store) instead; the install-time `model_select` and section
  choice become per-session (PRO-7 already covers local-first).
- Also (LF3 review, open decision 2): the scan of `isLocal(` misses the callers of `componentOn(settings, c)` that take its
  default `local = isLocal(s)`. Two are named here: `activeWorktree` in `core/shell.ts:139` (`componentOn(settings, "worktrees")`)
  and the routed child's hint trips in `core/policy.ts:208` (`componentOn(s, "hints")`, next to its `isLocal`). Both read
  `profile.current() !== "cloud-first"` as the `local` argument; the scan also flags a `componentOn(` or `activeSet(` call without
  its `local` argument in the two files.
- Until then (interim, LF3 review): a local-first session that has used `start_branch` (active since LF3.T7) spawns its
  children without the branch's worktree as their `cwd` (`activeWorktree` reads the settings, not the profile), and the
  delegation nudge (`core/shell.ts:343`, `!isLocal(settings)`) keeps telling the coordinator to use task cards, which contradicts
  S41's coordinator section.

#### LF19.T6b No `isLocal` in the local install and settings (RET-1 f) `[ ] todo`
- Files: `core/local/install.ts`, `core/local/settings.ts`; test `lf-seams` "RET-1 no isLocal" (+ the two files).
- RED/GREEN: as T6a; `validateLocal` runs for `profile: local-first`.

#### LF19.T6c `isLocal` removed (RET-1 f) `[ ] todo`
- Files: `core/local/mode.ts`; test `lf-seams` "RET-1 no isLocal" (scan: no `isLocal` in `core/`).
- RED: the export still exists; GREEN: delete it and `LOCAL_COMPONENTS`' `mode` reads; KG-R.

#### LF19.T7a Module `localMode.enable` (RET-1 g) `[ ] todo`
- Files: `modules/task-router.nix`, `checks/module-eval/cases/task-router.nix`.
- RED: `localMode.enable = true` → `settings.profile = "local-first"` (mkDefault) and the HM-1 b assertion
  applies: with `spawnPolicyApi = 2` the expected list is exactly HM-1 b's text; the old `>= 2` case changes
  with the reason "local mode retired (D59); superseded by HM-1 b".
- GREEN: the option sets `profile`; the `>= 2` assertion removed (HM-1 b covers it). A breaking module change:
  R4's commit message and the release note say so.

#### LF19.T8 Docs and the migration note `[ ] todo`
- Files: `docs/task-router.md`, `docs/local-mode/limitations.md` (a pointer to local-first; historical plans
  untouched); README: a migration note "`localMode.enable` now selects `profile = "local-first"` and needs
  the actor's API 3 (or `settings.localFirst.experimental = true`); `mode: "local"` is deprecated"
  (`readme` green).

## 15. Order, parallelism, cross-repository milestones, releases

### 15.1 Dependency graph

```
LF1 ─▶ LF2 ─▶ R1 (0.3.0: E0 from day one)
LF2 ─▶ LF3 ─┬─▶ LF4 ─┬─▶ LF5 (wiring) ─┬─▶ LF14 ─▶ R2 (0.4.0: local-first behind `experimental`)
            │        └─▶ LF6 (wiring) ─┘
            ├─▶ lane (b): LF5.T1–T2, LF6.T1–T6 (pure, new files), later LF8.T4–T6, LF8.T4a, LF9.T1, T6,
            │             LF10.T3, LF11.T1, LF11.T8a
            └─▶ LF7 (once PS-1 is published)
LF4–LF7 ─▶ LF8 ─┬─▶ LF11 ─┐
   LF8.T2 ─▶ LF9 ┤         ├─▶ LF12 (T10 lifts the gate) ─▶ LF15 ─▶ R3 (0.5.0: local-first selectable)
   LF7 ─▶ LF10 ──┴─────────┘
R3 ─▶ LF13, LF16 ─▶ LF19 ─▶ R4 (0.6.0: local mode retired)
R3 ─▶ LF17 ─▶ R5 (0.7.0)          (LF17 may run beside LF13/LF16; it ships after R4)
R4, R5 ─▶ LF18 ─▶ R6 (0.8.0)
```

Parallel lanes (disjoint files): (a) LF4; (b) the pure parts listed above — each task commits only its new
`core/strategy/*.ts` (or single new `core/local/*.ts`) file and its test; its one-line hunk in the hot file
`core/strategy/local-first.ts` (the composition) is applied by the integrator in task order (D92); (c) LF7
(`core/api.ts`, `fake-api.ts`, the module); (d) LF9 beside LF8; (e) LF10 beside LF11. Serialise every task
touching the hot files `core/shell.ts`, `core/local/install.ts`, `core/local/merge.ts`, `core/outcome.ts`,
`core/settings.ts`/`core/types.ts`, `core/strategy/local-first.ts` (one integrator merges them in task order;
`EVENTS_V2`, `ENUMS_V2`, `FALLBACKS` and `ROLES`/`REASONS`/`TRIPS` additions are append-only to keep rebases
trivial).

### 15.2 Cross-repository milestones (contracts only; their internals are planned in their repositories)

Contract tasks (PE-n, D86). Each is a pi-economics task done before router release Rn is tagged: it extends
pi-economics' consumer copy (`packages/token-meter/core/contract.ts`: the `event` list, the enumerated
fields) and its `log-contract` fixtures (one line per new event or value), and runs `log-contract` with
`--override-input pi-task-router git+file://<the Rn commit>`. From PE-1 on the consumer reads the lists from
the router's exports (`EVENTS_V2`, `ENUMS_V2`, `FALLBACKS`, `ROLES`, `REASONS`, `TRIPS`, `FACTORS`), so a
later value is a fixture, not a code change. All within outcome log v2: new events and enum values are
additions (the versioning rule of `docs/outcome-log.md`), and the exports only grow (LOG-4). pi-economics
reads and reports; it never routes, gates or switches a factor.

| Id | First router version | Adds to the consumer contract |
|---|---|---|
| PE-1 | 0.3.0 (R1) | `v: 2` beside `v ≤ 1`; spawn lines without `arm`; the `session` event; `arms: string[]` (`F=level`, F ∈ `FACTORS`, level ∈ its levels); `merge` fields `base`, `target`, `repo`, `repoId`; the lists read from the exports above; drop `iface-experiments-task-router` |
| PE-2 | 0.4.0 (R2) | events `profile`, `node`, `split` (`reason` `choice`), `crossing`; `review` fields (`class`, `tier`, `actualTier`, `reviewer`, `binding`, `overCap`, `rereview`, `of`, `sample`, `batch`, `classBy`); `merge` fields (`class`, `classBy`, `tier`, `actualTier`, `node`); `sessionId` (the main session's, absent when unknown) on `review`, `merge`, `plan`, `gatebypass`, `node`, `split` and `crossing`; `ARRAY_FIELDS_V2` (`review.classBy`, `merge.classBy`: string[] fields whose `ENUMS_V2` values apply per element); `ROLES` += `spot`, `fit`, `corrective`, `integration`; `FALLBACKS` (`local-unavailable`, `transient`); `session.profile` incl. `local-first`. Meanings (review lf56): `merge.reviewId` may name an advisory `revise` (`review.binding: false`) or be absent (an inert merge, a failed advisory review); `review.attempt` reaches 3 in local-first (two transient retries); a local-first `fallback` `error` or `transient` means the same chosen member ran again; `review.overCap` ⇔ `actualTier: over`; `crossing.class` is the settings policy's and never `inert`, `merge.class` the policy file's at main's tip; `crossing.kind: plan` is only a split above `planLines`; `node.tier` is the session's drawn tier (`inert` for an inert estimate); `FALLBACKS` `local-unavailable`, `review.sample`, `rereview`, `of` and `batch` are exported but not written yet; a gate `review` line (every attempt) carries the review's own `E3=<level>` in `arms`, with the session's, sorted (LF14.T1): E3 decides the reviewer only for a standard-class `actualTier: standard` review, so filter on `review.class` and `review.actualTier`; E3's unit is (`sessionId`, `branch`, `commit`) of the line, not the line: the attempts and re-requests of one commit are several `review` lines with one draw, so analysis counts units and clusters by node (`branch`) and session, and `merge.reviewId` / `merge.commit` join a unit to its merge (the line already has all three fields: nothing added); a `merge` line carries the session's arms only; no new export, event or field |
| PE-3 | 0.5.0 (R3) | events `contact`, `ladder`, `quota`, `lqueue`, `mqueue`; `split.reason` += `review`; `TRIPS` += spec §2.4's; `REASONS` += `conflict`, `aborted-queue`; the harness' `fake-api` additions (X37f) replayed by `log-contract` |
| PE-4 | 0.6.0 (R4) | `mode: "local"` lines now say `session.profile = "local-first"` (the old value `local-mode` stays valid for old lines) |
| PE-5 | 0.7.0 (R5) | no new event or value: fixtures with E6–E10 arms (a replay only) |
| PE-6 | 0.8.0 (R6) | `review.sample = "shadow"` with E17 arms; `fallback: "local-unavailable"` in use |

Analysis milestones in pi-economics (measure only; their own plans):

| Id | From | Reports |
|---|---|---|
| PA-1 | R1 | arms per factor (curves, the frontier); a factor only from sessions whose `session` snapshot lists it enabled; E0: σ, clustering, the cloud-only reference (`E0=cloud-only`, `session.localMembers = "off"`); E1: re-prefill split by 2026-11-13 and `routerVersion`, "after another session's request" from `lqueue` (R3); cross-tabulates E14f/E14m with pi-economics' own fold-reminder experiment (R24) |
| PA-2 | R1 | quality from router-recorded verdicts (`review` incl. `role: spot`, `merge`); reverts within 7 days from `merge` (`commit`, `base`, `branch`, `target`, `repo`, `repoId`) against the repository's history |
| PA-3 | R3 | waits: `lqueue`, `mqueue`, quota waits from quota-wait's meter lines and the router's `quota` lines |
| PA-4 | R6 | E17's pre-registered harm rule (spec §2.7): per stratum, on the shadow-reviewed subset only; units counted once their 7 days have passed; batched units excluded (REV-5); first look at 50 shadow-reviewed units per arm, then every 25 (50, 75, 100 …); Beta(1,1) priors; report "stop" when P(p_qwen − p_cloud > δ) > 0.9 (δ = 3 pp binding, 5 pp advisory: Q25), each stop beside the cloud arm's shadow-vs-gate disagreement as its baseline; reverts compared by Fisher's exact test, one qwen-arm revert flagged "pause for owner review"; run at each meter analysis (the owner's cadence, at least weekly while E17 is enabled) |

Other repositories:

| Id | Repository | Contract | Needed by |
|---|---|---|---|
| PS-1 | pi-setup (patched actor-subagents) | spec §2.6, published once (D84): `beforeRequest(payload, {name, model, requestId, signal})` awaited, payload in/out; a hook pending longer than `hookTimeoutMs` → the request proceeds with its payload and a `hook` event `outcome: "timeout"`; Esc, kill, pause and shutdown abort `signal`, the request does not wait for the hook; a throwing hook → proceed + `hook` event `outcome: "error"`; `afterResponse({name, requestId, status, headers})`; `contextFiles: false`, `systemPrompt`; events `tool_result`, `usage` (both with `requestId`), `hook`; `policyApi: 3` on the API object; `passthru.spawnPolicyApi = 3`; feature detection by `policyApi` (absent = 1 or 2 by the existing checks) | LF7.T1, then LF8.T7, LF9.T3, LF10.T6, LF12.T4, LF12.T8, LF13.T2 |
| QW-1 | quota-wait (via pi-setup) | router-proposed (D91; no quota-wait design exists yet): `pi.events` channel `quota-wait:v1` with `{type: "start" \| "end" \| "skip", waitId, sessionId, provider, model, window: "5h" \| "7d", resetAt, wakeAt?, outcome?, reason?}` and `globalThis.__quotaWait_v1 = {version: 1, waits(): ActiveWait[]}` | LF9.T4's live path only (tests use a fake; the router works without it, fallback on) |

### 15.3 Release points (AGENTS.md "Versions"; each: version constant, `packages/task-router/package.json`, README install line, `nix run .#render`, the full check loop, tag)

No release enables a factor (D63, orchestrator's call). "Available" = its mechanism ships and
`experiments.factors.<id>.enabled = true` in the owner's settings would run it.

| Release | Version | Contents | Becomes available | Precondition |
|---|---|---|---|---|
| R1 | 0.3.0 | LF1, LF2 | E0 runs from day one (`cloudOnlyShare` 0.1, D64; settable to 0); E1 passive; the factor framework | PE-1 |
| R2 | 0.4.0 | LF3–LF6, LF14 | local-first behind `localFirst.experimental` (D81); E2, E3 | PE-2; G1–G10 and G18 before any live experimental session |
| R3 | 0.5.0 | LF7–LF12, LF15 | local-first selectable (LF12.T10); E12, E13 | PS-1 published; PE-3; G11–G13, G16, G17 |
| R4 | 0.6.0 | LF13, LF16, LF19 | E4, E5; lean children (E18 from R6); legacy local mode retired (breaking module change: LF19.T7a, the README migration note) | PE-4; G14, G15 |
| R5 | 0.7.0 | LF17 | E6–E10 | PE-5 |
| R6 | 0.8.0 | LF18 | E11, E14–E18 (E17 also needs Q25 and `localFirst.e17ShadowShare`) | PE-6 (with PA-4 before E17 is enabled) |

The owner's gate for enabling any factor: E0 has run ≥ 2 weeks with a share > 0 and PA-1 has reported E0
and E1. Each release's commit message names the consumer changes (outcome log, exports, the harness) and
its PE-n.

## 16. Open questions (owner; only where the design is silent and a choice is costly to reverse)

None open: Q25 and Q26 are answered (§18).

## 17. Top risks

| # | Risk | Mitigation |
|---|---|---|
| R13 | Hot files (`shell.ts`, `install.ts`, `merge.ts`, `outcome.ts`, `strategy/local-first.ts`) collide across parallel lanes | §15.1 serialisation (D92); append-only registries |
| R14 | Each release's new events or values break pi-economics' closed `event` list | PE-n before every release, tested with `--override-input` against the release commit; the consumer reads the lists from the exports (D86) |
| R15 | PS-1 late: child breakers, the children's queue, the thinking budget and lean children wait | the experimental preview (XR-2); LF8's main-side parts, LF9, LF11 proceed; R3 waits for PS-1 |
| R16 | X33/X45: pi does not await `before_provider_request` on a transport, or gives it no signal | LF1.T0 (`pi-hooks`) finds out in R1; the alternative (the actor holds the main's request) is a PS-1 amendment before its publication; no signal → `mainHoldSec` |
| R17 | Local-queue deadlock or a stuck hold: a holder waiting on another local session, a killed child | release at the request's end + affinity; `signal` and `hookTimeoutMs` (D84, S51); LF10.T3 property; G17 |
| R18 | Experiment volume (≈ 15 merges a day): factors need months | every factor disabled until the owner enables it after E0/E1 (D63); few factors at once; session clustering from E0 |
| R19 | Classifier proxies (X41) misclass: elevated too often (cost) or too rarely (risk) | errors fail closed; the policy file per repository (D89) with `componentDepth`; `classBy` logged; spot-checks sample merges |
| R20 | Split commits disturb a worktree | D66's path-limited commit through the worktree; LF4.T5's staged-file case |
| R21 | Golden drift from default changes | local-first values under `localFirst.*`; D71; KG-R per task |
| R22 | Two local paths diverge (D59) | LF19 at R4; the legacy gate is not changed meanwhile (LF6.T12 local-first only) |
| R23 | E17 lets defects through binding small reviews | E17 shadows at `e17ShadowShare` (0.5) in both arms; PA-4's pre-registered rule; off until the owner enables it |
| R24 | Two randomizers on one mechanism: pi-economics' fold-reminder experiment and E14f/E14m (the main's fold point and hint) both vary per main session | PA-1 cross-tabulates them; the owner enables E14f/E14m only while the fold-reminder experiment is off (the router no longer reads pi-economics' assignments, NR-3) |
| R25 | X44: the child's report is not readable in the main's session as assumed | X44 is verified before LF8.T16; if not readable, sample (ii) is dropped with a notice and D90 is revisited |
| R26 | Package contract enforcement: the gate checks scope (TREE-14) but not forbidden actions that leave no diff (a push, a network call) | the child's tool set (whitelist) and the spawn policy's `toolGuard` refuse git push/remote commands in package children (LF4.T12b); anything else is caught only by review or spot-check |

## 18. Resolutions (parent)

| # | Resolution |
|---|---|
| Q24 | Answered by the orchestrator (revision 2): keep the built local mode untouched until LF19 (R4); LF2.T6 and LF6.T12 do not change it (D59). |
| Q25 | Owner, 2026-11-26: δ = 3 pp in the binding stratum (small) and 5 pp in the advisory one (inert-like); `localFirst.e17ShadowShare` = 0.5 (default), equal in both arms, the shadow = Opus (CON-8); other units keep `spotCheckShare` 0.1. E17 still ships off (D63). |
| Q26 | Owner, 2026-11-26: split plans do not reach the main branch; the router removes them in one commit on the root branch before its review (D85, LF11.T5a). |
| Review | Plan review `APPROVE-WITH-FIXES` (B1, M1–M6, minors 1–20) fixed in revision 2; the orchestrator's calls are marked in §3. |
