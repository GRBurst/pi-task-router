# Plan LF1–LF19: the local-first build

Status: draft for the plan review (the owner's loop, stage 4); no task started.
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
- **Mechanism** (new): `core/profile.ts`, `core/armstore.ts`, `core/quota.ts`, `core/facts.ts`;
  `core/local/`: `tree.ts`, `treestore.ts`, `split.ts`, `splittool.ts`, `package.ts`, `size.ts`,
  `sizehints.ts`, `overcap.ts`, `policyfile.ts`, `contacts.ts`, `ladderdrive.ts`, `corrective.ts`, `spot.ts`,
  `batch.ts`, `serving.ts`, `lqueue.ts`, `mqueue.ts`, `mqfix.ts`, `levelchecks.ts`, `fit.ts`, `thinking.ts`,
  `api3.ts`.
- **Edited**: `core/outcome.ts` (v2, new builders), `core/log.ts` (`arms`), `core/shell.ts`,
  `core/local/install.ts`, `merge.ts`, `overseer.ts`, `branchtool.ts`, `worktree.ts`, `gitcmd.ts`,
  `childtrips.ts`, `core/policy.ts`, `core/prompt.ts`, `core/settings.ts`, `core/types.ts`, `core/api.ts`,
  `modules/task-router.nix`, `docs/outcome-log.md`, `docs/task-router.md`, README and the version files at
  releases.
- Every local-first path keys on the session's profile (`profile.current()`), never on
  `isLocal(settings)`; the legacy `mode: "local"` keeps today's behaviour until LF19 retires it (D59, Q24).
- No new flake check: the new tests run in `task-router`; two module-eval cases; the iface checks follow
  pi-setup's API 3 (LF7). `router-golden` is never re-recorded.

## 3. Decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| D59 | Legacy local mode stays as built until LF19; local-first is the new profile beside it; LF19 aliases `mode: "local"` to local-first and rewrites the superseded local-mode cases (X37c) | the owner's sessions keep a working local mode while local-first is incomplete (no ladder before LF8, no merge queue before LF11); `test/local-*` stays a regression net | change local mode in place from LF3 on (every task would rewrite local-mode tests; a half-built local-first for months) — Q24 asks the owner |
| D60 | Strategy parts are pure functions in `core/strategy/`, composed once in `local-first.ts` into a `Strategy` (S31) that the mechanism gets in its deps; a source scan (NR-6) keeps the seam | design §5.9: a later strategy layer swaps parts without touching the mechanism | a strategy language now (out of scope, §5.9); parts read settings directly (no seam) |
| D61 | Draw `u = uint64(sha256(seed‖0‖id‖0‖unit))/2^64`; the experiments settings are snapshot in `task-router/arms` at the session's first `session_start` | reproducible per unit, independent across factors, stable across resume and settings edits | `Math.random` (not reproducible); the experiments package (owner decision 2026-11-16) |
| D62 | `arms: string[]` of `"id=level"` on every line of a local-first session (and of cloud-first ones in E0) | `OutcomeEvent` has no nested objects; one field for every factor; additive | a field per factor (schema churn per factor) |
| D63 | Factors ship disabled; the release that completes a stage turns its factors' code default on (§15.3); settings may disable or weight; concluding a factor = the owner sets one-hot weights, a later release moves the default | design §6: the build ships the framework and a first subset; few factors at once | settings-only enabling (the staging would live in the owner's config only) |
| D64 | `experiments.cloudOnlyShare` defaults to 0 | G7: cloud-first unchanged unless the owner starts E0 (suggested 0.1 for two weeks) | a non-zero default (changes cloud-first for every user) |
| D65 | The request node (level 0) is a branch off the main branch: `start_branch` with `estimate.kind = "plan"`; it merges into the main branch through today's gate; only that merge pushes | design §5.2 node = branch + worktree; partial work never reaches the main branch | root = the main branch (children's partial merges land on main) |
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

## 4. Where design and code disagree (verify before the task)

| # | Point | Resolution |
|---|---|---|
| X33 | Design §5.7 assumes the main's request can be held; pi 1.4 must await `before_provider_request` handlers before sending | LF10.T5 starts by reading pi's agent loop; not awaited → stop and report (R16) |
| X34 | "Uncached input" for llama.cpp: pi's openai-completions usage mapping (`input` = prompt − cached?) | read pi's provider before LF12.T8; D72 adjusts the sum |
| X35 | Quota header names (D73) are from knowledge, not from a captured response | fixtures use them; G13 (owner) captures one response; a mismatch is one constant |
| X36 | The budget field: `compat.thinkingTokenBudgetField` per model (K6.11), default `thinking_budget_tokens` (K6.12) | LF12.T4 reads it from the registry |
| X37 | Existing tests that change: (a) `flags`, `local-prompt`, `review-log`, `rule` stub `__piExperimentsApi_v1` — the stubs go, flag cases use settings (LF1.T1, owner decision); (b) `outcome.test.ts` `v: 1` literals and spawn `arm` (LF1.T2); (c) at LF19 the local-mode cases for the gate size refusal (`local-merge-refuse`, `local-merge-plan`), the `localSection` text (`local-prompt`), the session overseer budget and steer default (`local-overseer`, `local-overseer-shell`, `local-steer`), fixer rounds (`local-fixer`); (d) snapshot lists of `ROLES`/`REASONS`/`TRIPS` grow | each named in its task with the reason |
| X38 | Design §7.4 "children keep the `isChild` guards": the router is not loaded in children (D80) | the guards stay for the main's hooks; child-side gating goes through the actor |
| X39 | Gap 19 "fold through the folding extension's per-model settings or a hint" | a hint only; the router depends on no pi-economics component |
| X40 | "Queue persisted in the main's tree state" (§5.2) | a separate entry type `task-router/mqueue` in the main's session: same persistence, simpler replay |
| X41 | Classifier triggers "≥ 3 coupled files", "weakened tests", "multi-component config" have no definition | deterministic proxies in S38, settable in the policy file; the plan review may challenge them |
| X42 | `sizeOf` (`merge.ts:38`) measures commits only | the gate keeps it; hints add worktree and untracked lines (SIZE-2, LF5.T3) |

## 5. Gate (AGENTS.md rules)

| Rule | Result |
|---|---|
| Tests first; a new check seen red once | PASS — every task has RED; §11 lists a plant per new test file |
| Rendered-text matching rules | PASS — only the module-eval cases match text; they compare assertion lists (no `match`/`hasInfix`) |
| Assertion messages `pi-task-router:` + negative case | PASS — LF7.T3 adds one assertion with its case |
| No import-from-derivation | PASS — the module reads option values |
| Leak check | PASS — fixtures: user `u`, `http://localhost:8080`, `x.invalid`; no paths in log fields |
| Boundary names | PASS — members keep their neutral default names; no consumer extension is named |
| iface copies of the actor API | PASS — LF7.T1 updates the copy with the lock bump; no `tsconfig.json` |
| `flake.lock` only when needed | PASS — only LF7.T1 (pi-setup API 3) |
| Root `package.json` via `nix run .#render` | PASS — release tasks only |
| Runtime guard; nothing outside the guarded body; no flags/providers in it | PASS — `/profile`, `split`, the hooks register in the body; tools for a cloud-first default register at the first switch |
| Claim protocol frozen | PASS — untouched (NR-4) |
| Package checks (`PI_TIMING`) | PASS — no new extension |
| README checks | PASS — release tasks update the install line |
| Consumers outside (outcome log, `log-contract` exports) | PASS with a note — LF1's bump breaks pi-economics until PE-1; every commit touching them says so; exports only grow (LOG-4) |

Complexity tracking: D59 keeps two local paths alive until LF19 (need: a working local mode during the
build; the simpler alternative, an in-place change, is rejected in D59 and put to the owner as Q24).

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
| Shell integration | hooks, tools, command, lines | `test/harness.ts`, `fake-pi`, `fake-api` (extended for API 3 in LF7.T2) |
| Golden | cloud-first routing | `router-golden`, never re-recorded (NR-1) |
| Module | profile option, API 3 assertion | `module-eval` cases |
| Interface | the actor API copy | KG-I |
| Package | install paths | KG-P, unchanged (no new extension) |
| Live | — | N/A: design §5.7 forbids agent-run live tests; owner runbooks G11–G16 (§12) |
| Consumer | pi-economics reading v2 | its `log-contract` at its router bump (PE-1), not here |

## 10. Scenario coverage (REQ → task; the check is the spec's)

| REQ | Task | REQ | Task | REQ | Task | REQ | Task |
|---|---|---|---|---|---|---|---|
| NR-1 | every task (KG-R) | NR-2 | LF1.T2 | NR-3 | LF1.T1 | NR-4 | every task |
| NR-5 | LF10.T2 | NR-6 | LF3.T1 | NR-7 | every task to LF18 | RET-1 | LF19.T1–T7 |
| MEAS-1 | LF1.T5 | MEAS-2 | LF1.T9, LF2.T7 | RND-1 | LF2.T1 | RND-2 | LF1.T8 |
| RND-3 | LF2.T3 | RND-4 | LF2.T2 | RND-5 | LF2.T5 | RND-6 | LF2.T6 |
| RND-7 | LF18.T6 | RND-8 | LF1.T2 | PRO-1 | LF3.T2 | PRO-2 | LF3.T5 |
| PRO-3 | LF3.T3 | PRO-4 | LF3.T6 | PRO-5 | LF3.T6 | PRO-6 | LF4.T10 |
| PRO-7 | LF3.T7 | PRO-8 | LF3.T8 | HM-1 | LF3.T9, LF7.T3 | TREE-1 | LF4.T7 |
| TREE-2 | LF4.T2 | TREE-3 | LF4.T1, T3 | TREE-4 | LF4.T4, T5 | TREE-5 | LF4.T8 |
| TREE-6 | LF4.T12 | TREE-7 | LF4.T11 | TREE-8 | LF11.T8 | TREE-9 | LF11.T9 |
| TREE-10 | LF8.T5 | TREE-11 | LF4.T6 | TREE-12 | LF4.T9, LF18.T4 | TREE-13 | LF4.T13 |
| SIZE-1 | LF5.T1 | SIZE-2 | LF5.T3 | SIZE-3 | LF5.T2 | SIZE-4 | LF5.T4 |
| SIZE-5 | LF5.T6, T7 | SIZE-6 | LF5.T6 | SIZE-7 | LF6.T5 | SIZE-8 | LF5.T9, T10 |
| SIZE-9 | LF5.T11 | SIZE-10 | LF5.T8 | CLS-1 | LF6.T1 | CLS-2 | LF6.T4 |
| CLS-3 | LF6.T2 | CLS-4 | LF6.T3 | REV-1 | LF6.T5, T8 | REV-2 | LF6.T6 |
| REV-3 | LF6.T10 | REV-4 | LF6.T9 | REV-5 | LF18.T5 | REV-6 | LF18.T6 |
| REV-7 | LF18.T7 | REV-8 | LF6.T12 | REV-9 | LF6.T13, LF9.T8 | REV-10 | LF6.T11 |
| CON-1 | LF8.T3 | CON-2 | LF8.T2 | CON-3 | LF8.T4 | CON-4 | LF8.T5 |
| CON-5 | LF8.T6, T7 | CON-6 | LF8.T10 | CON-7 | LF8.T12 | CON-8 | LF8.T15, T16 |
| CON-9 | LF8.T17, T18 | CON-10 | LF8.T13 | CON-11 | LF8.T14 | Q-1 | LF9.T1, T3 |
| Q-2 | LF9.T4 | Q-3 | LF9.T5 | Q-4 | LF9.T6, T7 | LOC-1 | LF10.T1 |
| LOC-2 | LF12.T1 | LOC-3 | LF12.T2–T4 | LOC-4 | LF8.T9 | LOC-5 | LF12.T5–T8 |
| LOC-6 | LF10.T3, T5, T6 | LOC-7 | LF13.T1, T2 | LOC-8 | LF10.T2 | MQ-1 | LF11.T1, T5 |
| MQ-2 | LF11.T4 | MQ-3 | LF11.T6 | MQ-4 | LF11.T2 | MQ-5 | LF11.T7 |
| LOG-1 | LF1.T6, T7 | LOG-2 | LF1.T3 (+ builders per milestone) | LOG-3 | LF1.T3 | LOG-4 | LF1.T3 |
| XR-1 | LF7.T1 | XR-2 | LF7.T2 | | | | |

## 11. Planted violations (one per new test file; tick when the red was seen)

| Check (test file) | Plant | Must FAIL | Seen |
|---|---|---|---|
| `lf-default` NR-3 | a comment-free `globalThis.__piExperimentsApi_v1` read left in `shell.ts` | the source scan | [ ] |
| `lf-default` NR-2 | `spawnEvent` keeps `arm` | "NR-2 cloud-first lines" | [ ] |
| `lf-outcome` | a builder copies `goal` text into a field | LOG-3 text-free | [ ] |
| `lf-session-log` | write `session` in cloud-first with share 0 | MEAS-1 | [ ] |
| `lf-merge-log` | `repoId` from `HEAD` instead of the root commit | LOG-1 | [ ] |
| `lf-arms` RND-2 | `unit` dropped from the hash input | determinism-by-unit frequencies | [ ] |
| `lf-arms` RND-3 | `id` dropped from the hash input | the joint-frequency property | [ ] |
| `lf-arms-shell` RND-5 | draw from live settings instead of the snapshot | the resume property | [ ] |
| `lf-e0` | cloud-only arm keeps `route: "local"` members | MEAS-2 | [ ] |
| `lf-seams` NR-6 | `core/local/merge.ts` imports `core/strategy/tiers.ts` | the import scan | [ ] |
| `lf-settings` PRO-1 | `mode: "local"` overrides `profile` | PRO-1 | [ ] |
| `lf-profile` | restore takes the first entry | PRO-3 | [ ] |
| `lf-start-model` | `setModel` also on `model_select` | PRO-5 | [ ] |
| `lf-prompt` | the section omits the tier budget | PRO-8/SIZE-9 | [ ] |
| `lf-tree` | `maxDepth` compared with `<` instead of `≤` | TREE-2 | [ ] |
| `lf-split` / `lf-split-git` | the commit takes every staged file (`commit -a`) | TREE-4 commit (a staged unrelated file stays uncommitted) | [ ] |
| `lf-tree-git` | the base stays the main tip | TREE-1 | [ ] |
| `lf-start-child` | a slug may start twice | TREE-5 | [ ] |
| `lf-placement` | `cwd` = the main's cwd | TREE-6 | [ ] |
| `lf-merge-target` | target = the main branch | TREE-7 | [ ] |
| `lf-tree-log` | `split` line without `depth` | TREE-11 | [ ] |
| `lf-top-plan` | the root split stored on the main branch | TREE-12 | [ ] |
| `lf-tiers` | elevated not capped | SIZE-1 | [ ] |
| `lf-tiers-git` | untracked files not counted | SIZE-2 | [ ] |
| `lf-start-refusal` | inert estimates refused | SIZE-4 | [ ] |
| `lf-size-hints` | the guard returns `{block: true}` at 100 % | SIZE-5 | [ ] |
| `lf-overcap` | the riskiest hunk exceeds `overCapBytes` | SIZE-8 | [ ] |
| `lf-classify` / `lf-classify-git` | the policy read from the branch tip | CLS-2 | [ ] |
| `lf-reviewer` | `min` instead of `max` strength | REV-1 property | [ ] |
| `lf-reviewer-gate` | the advisory verdict blocks | REV-4 | [ ] |
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

## 13. Snippets

**S31 — `core/strategy/types.ts`**

```ts
export type Profile = "cloud-first" | "local-first";
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
export interface Factor { id: FactorId; unit: "session" | "review" | "child" | "request" | "node" | "package" | "ladder"; levels: readonly string[]; weights: readonly number[]; stage: number; enabled: boolean }
export const FACTORS: Readonly<Record<FactorId, Factor>>;     // spec §2.8; enabled=false until its stage ships (D63)
export const assign = (snap: ExperimentsSnapshot, id: FactorId, unit: string): string;  // disabled → levels[0]
```

`sha256hex` = `node:crypto` `createHash("sha256")` (pure: no I/O).

**S33 — arms on lines**: `createOutcomeLog(…, { arms: () => string[] })`; `append(ev, unitArms = [])` sets
`ev.arms = [...new Set([...sessionArms(), ...unitArms])].sort()` iff the session is local-first or in E0;
unit arms come from the builder's caller (`assign` for E3, E12, E13, E17, …).

**S34 — `core/profile.ts`**: `createProfile(settings, append)` → `{ current(): Profile | "local-mode";
restore(branch: Entry[]): void; set(p, by): void }`; `restore` = last `task-router/profile` entry's
`profile`, none → `settings.profile ?? (settings.mode === "local" ? "local-mode" : "cloud-first")`.
`/profile` handler: no argument → `ctx.ui.notify(current)`; a valid name → `set`, one `profile` line,
`ensureLocalTools()` the first time, `pi.setActiveTools` per S34a. S34a: local-first tools =
`start_branch request_merge split plan_request amend_plan`; switching to cloud-first removes them from the
active set (they cannot be unregistered).

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
top-level components (coupled, X41); or config files (`*.json`, `*.toml`, `*.yaml`, `*.yml`, `*.nix`) in ≥ 2
components (multi-component config). inert iff MGS §2.1 (`inertGlobs`, its exclusions) and ≥ 1
`extraChecks` entry passes (CLS-3). inert-like iff every file inert, or every file in `testGlobs` ∪
`inertGlobs`. Policy = `{inertGlobs, testGlobs, ciGlobs, riskGlobs}` from `git show <base>:<policyFile>`,
absent → settings; a parse error → elevated.

**S39 — reviewer** (`strength`: none 0 < haiku 1 = qwen-advisory < sonnet 2 = qwen-binding < opus 3):

| actual \ class | inert | standard | elevated |
|---|---|---|---|
| inert / inert-like | none (inert) / haiku advisory (E17: qwen advisory) | — | opus + orthogonal |
| small | sonnet binding (E17: qwen binding) | sonnet | opus + orthogonal |
| standard | — | E3: opus \| sonnet | opus + orthogonal |
| large, over | — | opus (over: `overCap`) | opus + orthogonal |

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
the node worktree (conflict → `rebase --abort`, release, `mqfix`) → `checksFor(node)` (red → release,
`mqfix`) → approval for `{repo, branch, commit, tree}` or a new review (`rereview` iff the tree differs from
the last approved) → `git merge --ff-only` on the target → release; every step writes the entry op.

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

### LF1 — E0 and E1 measurement (design §6 first stage, §5.8)

E1 needs no router lever: pi-economics splits the meter's `timings` by date and router version (PE-2); the
router adds `routerVersion` to `session` lines here and `lqueue` lines in LF10.

#### LF1.T1 Drop the experiments read (NR-3) `[ ] todo`
- Files: `core/shell.ts`; test `lf-default` (new); X37a cases in `flags`, `local-prompt`, `review-log`, `rule`.
- XR: PE-1 (pi-economics' `iface-experiments-task-router` reads `ExperimentsApi`); the commit says so.
- RED: "NR-3 no experiments read" scans `core/**/*.ts` for `__piExperimentsApi_v1|ExperimentsApi` → hits `shell.ts:56–83`.
- GREEN: `withFlags` returns the settings value; remove `ExperimentsApi`, `armOf` and the `arm` argument at the spawn line; X37a cases set the flag through settings (reason: owner decision 2026-11-16).

#### LF1.T2 Outcome log v2 (RND-8, NR-2) `[ ] todo`
- Files: `core/outcome.ts`; tests `lf-default` "NR-2 cloud-first lines", `outcome` (X37b literals).
- RED: a default-settings harness session (spawn, verdict, spotcheck, hint) → every line `v === 2`, no `arm` key → fails on `v: 1`.
- GREEN: `SCHEMA_VERSION = 2`; drop `arm` from `spawnEvent`'s input type and output.

#### LF1.T3 `session` builder, `EVENTS_V2`, export snapshot (LOG-2, LOG-3, LOG-4) `[ ] todo`
- Files: `core/outcome.ts`; test `lf-outcome` (new).
- RED: `sessionEvent` missing; LOG-4 snapshot of the names and values of `TRIPS`, `ROLES`, `REASONS`, `TRIGGERS`, `PLAN_TYPE`, `BRANCH_TYPE` (literal, taken from today) must be a subset of the exports; LOG-3 runs `text-free` over the builder.
- GREEN: `sessionEvent({now, sessionId, profile, mainModel, startSet, localMembers, routerVersion})`; `export const EVENTS_V2 = ["session"] as const` (each later builder task appends its event).

#### LF1.T4 Experiments settings (spec §2.1) `[ ] todo`
- Files: `core/types.ts`, `core/settings.ts`; test `lf-settings` (new) "experiments keys".
- RED: `experiments: {seed: "s", cloudOnlyShare: 0.2}` parsed; `cloudOnlyShare: 2` → one problem, default 0.
- GREEN: `ExperimentsSettings {seed, cloudOnlyShare, factors}` (factors parsed in LF2.T4), defaults per §2.1.

#### LF1.T5 `session` line (MEAS-1) `[ ] todo`
- Files: `core/shell.ts`; test `lf-session-log` (new).
- RED: legacy local-mode harness session → one `session` line (`profile: "local-mode"`); cloud-first with share 0 → none; with share 0.5 → one.
- GREEN: write it in the `session_start` handler (inside the guarded body); `routerVersion` from the package manifest's version constant.

#### LF1.T6 Merge-line fields for reverts: builder (LOG-1) `[ ] todo`
- Files: `core/outcome.ts`; test `lf-merge-log` (new) "LOG-1 builder".
- RED: `mergeEvent({…, base, target, repoId})` drops the fields.
- GREEN: optional fields `base`, `target`, `repoId`, `class`, `tier`, `actualTier`, `node` (the last four filled from LF5/LF6).

#### LF1.T7 Merge-line fields for reverts: the gate fills them (LOG-1) `[ ] todo`
- Files: `core/local/merge.ts`, `core/local/gitcmd.ts` (a `rootCommit` port if the port set lacks one); test `lf-merge-log` "LOG-1 git".
- RED: a real-git merge (`git-repo.ts`, `merge-rig.ts`) → the line's `repoId` = first 12 hex of `git rev-list --max-parents=0 HEAD` (sorted, first), `base` = the target tip before, `target` = the branch merged into.
- GREEN: compute at step 9 (`advanceMain`); `repoId` cached per repository.

#### LF1.T8 The deterministic draw (RND-2) `[ ] todo`
- Files: `core/strategy/draw.ts` (new); test `lf-arms` (new) "RND-2".
- RED: import fails; then: equal draws for equal inputs (property, 1 000 random triples), `pick` frequencies over 20 000 units within ±2 % of weights (1:1, 1:1:1, 9:1).
- GREEN: S32 `draw`, `pick`.

#### LF1.T9 E0 cloud-only arm (MEAS-2) `[ ] todo`
- Files: `core/policy.ts`, `core/shell.ts`; test `lf-e0` (new).
- RED: cloud-first session with share 1 → no spawn placed on a `route: "local"` member (property over random cards from `rand.ts`), `session.localMembers = "off"`; share 0 → no draw, routing = today.
- GREEN: at `session_start`, `E0 = pick([as-used, cloud-only], [1-s, s], draw(seed, "E0", sessionId))`; the policy filters `route === "local"` members when `cloud-only`.

#### LF1.T10 Docs: outcome log v2 `[ ] todo`
- Files: `docs/outcome-log.md`, `docs/task-router.md`.
- RED: N/A (docs); KG-S.
- GREEN: the v2 section (bump reason, `arm` retired, `session`, the merge fields), the `experiments` keys; dated notes per the versioning rule.

### LF2 — The randomizer framework (design §6, §8)

#### LF2.T1 Factor registry (RND-1) `[ ] todo`
- Files: `core/strategy/arms.ts` (new); test `lf-arms` "RND-1".
- RED: `FACTORS` deep-equals spec §2.8 (literal table: ids, units, levels, stages; all `enabled: false`).
- GREEN: S32 `Factor`, `FactorId` union, `FACTORS`.

#### LF2.T2 Assignment and the disabled default (RND-4) `[ ] todo`
- Files: `core/strategy/arms.ts`; test `lf-arms` "RND-4".
- RED: `assign(snap, "E2", u)` with E2 disabled → `"standard"` for all units; enabled with weights [0,1,0] → `"small"`.
- GREEN: `assign` per S32; weights from the snapshot, else the factor's.

#### LF2.T3 Independent factors (RND-3) `[ ] todo`
- Files: `core/strategy/arms.ts`; test `lf-arms` "RND-3".
- RED: written first against a plant (§11: `id` dropped from the hash) and seen failing; then the plant is removed.
- GREEN: none beyond T2 (the test guards the hash input); CLEAN: the plant gone.

#### LF2.T4 Factor settings (spec §2.1) `[ ] todo`
- Files: `core/settings.ts`, `core/types.ts`; test `lf-settings` "factor keys".
- RED: `experiments.factors.E2 = {enabled: true, weights: [1, 1, 1]}` parsed; an unknown id, a wrong weight count, a negative weight → one problem each.
- GREEN: validate against `FACTORS` (count = levels).

#### LF2.T5 Arms snapshot entry (RND-5) `[ ] todo`
- Files: `core/armstore.ts` (new), `core/shell.ts`; test `lf-arms-shell` (new) "RND-5".
- RED: settings change between two `session_start`s of one session (`fake-pi` branch with the entry) → the draws equal the first snapshot's (property over 50 sessions).
- GREEN: `createArmStore(append)`: at `session_start` restore `task-router/arms` or write one; `armsFor(unitKind, unit)`.

#### LF2.T6 Arms on lines (RND-6) `[ ] todo`
- Files: `core/log.ts`, `core/shell.ts`; test `lf-arms-shell` "RND-6".
- RED: with E2 enabled, every line of a legacy local-mode harness session carries `arms` containing `"E2=…"`, sorted; a cloud-first session without E0 has no `arms` key (NR-2).
- GREEN: S33.

#### LF2.T7 E0 through the registry `[ ] todo`
- Files: `core/shell.ts`; test `lf-e0` "E0 via registry".
- RED: E0's level from `assign(snap, "E0", sid)` equals LF1.T9's draw for 1 000 session ids; `arms` holds `E0=…` while share > 0.
- GREEN: replace the inline pick by `assign` (E0's weights = `[1-s, s]`).

#### LF2.T8 Docs `[ ] todo`
- Files: `docs/task-router.md`, `docs/outcome-log.md` (`arms`).
- GREEN: the randomizer (D61–D63), the snapshot, factor settings. Then release R1 (§15.3).

### LF3 — Seams and profiles (design §5.1, §5.9; gaps 1–3)

#### LF3.T1 The `Strategy` seam (NR-6) `[ ] todo`
- Files: `core/strategy/types.ts`, `core/strategy/local-first.ts` (new); test `lf-seams` (new).
- RED: the scan: `local-first.ts` exports `localFirst(settings): Strategy`; no file outside `core/strategy/` imports a strategy file other than `types.ts`, `local-first.ts`, `arms.ts` (the last for `FACTORS`/`assign` in `armstore.ts`); no file in `core/strategy/` imports outside it except `node:crypto` and `../types.ts`.
- GREEN: S31; `localFirst` returns stubs that throw `not yet` for parts later tasks fill (each part's task replaces its stub).

#### LF3.T2 Profile setting (PRO-1) `[ ] todo`
- Files: `core/types.ts`, `core/settings.ts`; test `lf-settings` "PRO-1".
- RED: `profile` parsed; invalid → problem + `cloud-first`; `{profile: "cloud-first", mode: "local"}` → `cloud-first`; `{mode: "local"}` → legacy local mode, unchanged.
- GREEN: `profile?: Profile`; `localFirst` defaults (§2.1) as one nested object.

#### LF3.T3 Profile store (PRO-3) `[ ] todo`
- Files: `core/profile.ts` (new); test `lf-profile` (new) "PRO-3".
- RED: property over random entry sequences: restored = the last entry's profile; none → settings.
- GREEN: S34 `createProfile`, `PROFILE_TYPE = "task-router/profile"`.

#### LF3.T4 `profile` builder (LOG-2) `[ ] todo`
- Files: `core/outcome.ts`; test `lf-outcome` "profile".
- GREEN: `profileEvent({from, to, by})`; `EVENTS_V2` += `profile`.

#### LF3.T5 `/profile` (PRO-2) `[ ] todo`
- Files: `core/profile.ts`, `core/shell.ts`; test `lf-profile` "PRO-2".
- RED: `fake-pi` command call `local-first` → one entry `by: "command"`, one `profile` line, status `local-first`; `bogus` → usage text, no entry; none → the current profile.
- GREEN: `pi.registerCommand("profile", …)` in the guarded body; the status line from `profile.current()`.

#### LF3.T6 The local start model (PRO-4, PRO-5) `[ ] todo`
- Files: `core/profile.ts`, `core/shell.ts`; test `lf-start-model` (new).
- RED: four cases (no choice → `setModel(startMember's model)`; model flag; resumed session with a model; `model_select` before `session_start` → no call); PRO-5 property: random event sequences → ≤ 1 `setModel`, only inside `session_start`.
- GREEN: `startModel(ctx, settings)`; the model via `ctx.modelRegistry.find` (as `forceinstall.ts:22–29`); not found → one notice, pi-setup's default stays.

#### LF3.T7 Per-session section and tools (PRO-7) `[ ] todo`
- Files: `core/shell.ts`, `core/local/install.ts`; test `lf-profile` "PRO-7".
- RED: cloud-first default → `/profile local-first` registers the local tools once and activates them; back to cloud-first → `setActiveTools` without them, section = `cardSection`; legacy local mode unchanged (`local-shell` green).
- GREEN: `ensureLocalTools()`; `before_agent_start` chooses the section by `profile.current()`; the hooks of `installLocal` gate on the session's profile (`"local-first"` or `"local-mode"`).
- Note: a third file (`core/local/mode.ts`) only if `componentOn` needs the profile; say so in the commit.

#### LF3.T8 Coordinator section (PRO-8) `[ ] todo`
- Files: `core/prompt.ts`; test `lf-prompt` (new) "PRO-8".
- RED: `coordinatorSection(b)` equals S41 with the values filled (the pinned text is the criterion).
- GREEN: S41; `before_agent_start` uses it for local-first (one line in `shell.ts`, allowed as the third file).

#### LF3.T9 Module option `profile` (HM-1 a) `[ ] todo`
- Files: `modules/task-router.nix`, `checks/module-eval/cases/task-router-profile.nix` (new).
- RED: the case sets `programs.piTaskRouter.profile = "local-first"` and expects `settings.profile = "local-first"` in the rendered settings → fails (no option).
- GREEN: `profile = lib.mkOption { type = lib.types.enum ["cloud-first" "local-first"]; default = "cloud-first"; }`; `settings.profile = lib.mkDefault cfg.profile` only when not the default (the default render unchanged: KG-M `readme`, `task-router`).

#### LF3.T10 Docs `[ ] todo`
- Files: `docs/task-router.md`, `README.md` (the profile, `/profile`, the module option).

### LF4 — Packages, nodes and the tree (design §5.2; gaps 4, 5, 18)

#### LF4.T1 Tree model and replay (TREE-3 a) `[ ] todo`
- Files: `core/local/tree.ts` (new); test `lf-tree` (new) "TREE-3 replay".
- RED: property: for random op sequences, `replay(ops)` = folding `apply`; an op on an unknown node leaves the tree unchanged with one problem.
- GREEN: S35 types, `apply`, `replay`.

#### LF4.T2 Caps (TREE-2) `[ ] todo`
- Files: `core/local/tree.ts`, `core/strategy/local-first.ts` (`treeCaps` from settings; E6/E15 later); test `lf-tree` "TREE-2".
- RED: depth 3 node split → reason names `maxDepth 3`; 6 children → reason names `maxChildren 5`; depth 2 with 5 → ok.
- GREEN: `canSplit` per S35.

#### LF4.T3 Tree entries (TREE-3 b) `[ ] todo`
- Files: `core/local/treestore.ts` (new), `core/shell.ts` (restore at `session_start`); test `lf-tree` "TREE-3 resume".
- RED: ops written through the store, a fold (entries kept, messages dropped) and a resume → the restored tree deep-equals the live one.
- GREEN: S36; `TREE_TYPE = "task-router/tree"` exported (log-contract may import it).

#### LF4.T4 Split validation (TREE-4 rules) `[ ] todo`
- Files: `core/local/split.ts` (new); test `lf-split` (new).
- RED: one case per S37 rule → exactly that reason; a valid plan → `[]`; the canonical rendering is byte-stable (sorted keys, 2 spaces, trailing newline).
- GREEN: `validateSplit`, `renderSplit`, `SplitPlan`/`SplitChild` types.

#### LF4.T5 Split commit (TREE-4 commit) `[ ] todo`
- Files: `core/local/split.ts`, `core/local/gitcmd.ts` (if a port is missing); test `lf-split-git` (new).
- RED: real git: worktree with an unrelated staged file → after `commitSplit`, HEAD's tree has `<plans.dir>/split/<node>.json` = the rendering, the unrelated file is still staged and uncommitted; a failing `pre-commit` hook → refusal with its output.
- GREEN: D66.

#### LF4.T6 `node` and `split` builders (TREE-11) `[ ] todo`
- Files: `core/outcome.ts`; test `lf-tree-log` (new) "builders".
- GREEN: `nodeEvent`, `splitEvent` per spec §2.4; `EVENTS_V2` += both; `text-free` passes.

#### LF4.T7 `start_branch` with a parent (TREE-1) `[ ] todo`
- Files: `core/local/worktree.ts`, `core/local/branchtool.ts`; test `lf-tree-git` (new).
- RED: real git: `start_branch({goal, estimate: {kind: "plan", lines: 0}})` → a level-0 node off the main tip; `start_branch({parent: root, …})` → its branch's base = the root's tip (not the main tip); `add` op and a `node` line written.
- GREEN: `startBranch(d, input, cwd, base?)`; the schema gains `parent`, `child`, `estimate` (spec §2.3), validated in local-first only (legacy schema unchanged: `local-schema` green).

#### LF4.T8 Start a child of a split (TREE-5) `[ ] todo`
- Files: `core/local/branchtool.ts`, `core/local/tree.ts`; test `lf-start-child` (new).
- RED: `{parent, child: slug}` takes goal/files/estimate/check from the split; parent not `split` / unknown slug / started slug → one refusal each.
- GREEN: lookup + `started` bookkeeping (tree op `add` with `parent`).

#### LF4.T9 The `split` tool (TREE-4, TREE-12 a) `[ ] todo`
- Files: `core/local/splittool.ts` (new), `core/local/install.ts`; test `lf-top-plan` (new) "TREE-12 local".
- RED: the main's `split({node: root, …})` validates, commits on the root's branch (not the main branch), writes op `split`, one `split` line (`reason: "choice"`), node state `split`.
- GREEN: tool registration in the local-first tool set (S34a).

#### LF4.T10 Nodes keep their profile (PRO-6) `[ ] todo`
- Files: `core/local/tree.ts`, `core/local/install.ts`; test `lf-profile` "PRO-6".
- RED: switch to cloud-first while a node is `active` → its `request_merge` still runs the local-first gate; a new `start_branch` after the switch is not offered (tools inactive).
- GREEN: `node.profile` stamped at `add`; mechanism reads it for that node's merges.

#### LF4.T11 Merge into the parent; the guard protects parents (TREE-7) `[ ] todo`
- Files: `core/local/merge.ts`, `core/local/gitcmd.ts`; test `lf-merge-target` (new) "TREE-7".
- RED: real git: a child node's `request_merge` fast-forwards the parent node's branch, not the main branch; a `git commit` in the parent's worktree by the main while the parent has open children → blocked by the guard.
- GREEN: target = `tree.parentBranch(node) ?? mainBranch`; the guard's protected set = main branches ∪ branches of nodes with `started` − `merged` ≠ ∅.

#### LF4.T12 Package child placement (TREE-6) `[ ] todo`
- Files: `core/local/package.ts` (new), `core/policy.ts`; test `lf-placement` (new) "TREE-6".
- RED: a spawn card with `package: "<node>"` in a local-first session → `PolicyResult` with the local member, `cwd` = the node's worktree, `briefAppend` = the package contract, `meta.node`; a `t2` card with `package` → the cloud route and a `contact` of shape `open` (counted in LF8).
- GREEN: `placePackage(card, tree, strategy, arms)`; the card field `package` (validated: an `active` node).

#### LF4.T13 `submit_split` and do-or-split (TREE-13) `[ ] todo`
- Files: `core/local/package.ts`; test `lf-placement` "TREE-13".
- RED: depth < cap → `childTools` has `submit_split` and the brief states the rule; at the cap → neither; calling it → validate, commit, op `split`, `terminate: true`, one message to the main naming the node.
- GREEN: the child tool's `execute` calls `validateSplit`/`commitSplit`.

#### LF4.T14 Docs `[ ] todo`
- Files: `docs/task-router.md` (nodes, the tree, split plans, the tools).

### LF5 — Size tiers and hints (design §5.3; gaps 6, 7)

#### LF5.T1 Tiers (SIZE-1) `[ ] todo`
- Files: `core/strategy/tiers.ts` (new), `core/strategy/local-first.ts`; test `lf-tiers` (new) "SIZE-1".
- RED: the table; property: `tierBudget(t, "elevated") ≤ 150` ∀t; `tierOfLines` monotone; inert = `Infinity`.
- GREEN: constants from settings (`localFirst.tiers`).

#### LF5.T2 Session tier (SIZE-3) `[ ] todo`
- Files: `core/strategy/local-first.ts`; test `lf-tiers` "SIZE-3".
- RED: arms `{E2: "large"}` → `large`; E2 absent → `standard`.

#### LF5.T3 Changed lines during the work (SIZE-2) `[ ] todo`
- Files: `core/local/size.ts` (new), `core/local/gitcmd.ts` (port `diffNumstatWorktree`, `untrackedLines` if missing); test `lf-tiers-git` (new).
- RED: real git: 10 added committed + 5 modified uncommitted + an untracked 7-line file + an ignored file → 22 (+ deleted counted); the gate's `sizeOf` unchanged (`local-merge-*` green).
- GREEN: `workSize(git, wt, base)`.

#### LF5.T4 Start refusal (SIZE-4) `[ ] todo`
- Files: `core/local/branchtool.ts`; test `lf-start-refusal` (new).
- RED: `estimate.lines = budget + 1` → refusal text names the budget, `maxChildren` and `split` (prefix assertions); `kind: "inert"` and `kind: "plan"` → not refused; property: no other tool result in the harness run contains the refusal prefix.
- GREEN: compare with `strategy.tierBudget(sessionTier, "standard")`.

#### LF5.T5 `crossing` builder (SIZE-6 a) `[ ] todo`
- Files: `core/outcome.ts`; test `lf-size-hints` (new) "builder". `EVENTS_V2` += `crossing`.

#### LF5.T6 Main hints 80 %/100 % (SIZE-5 main, SIZE-6) `[ ] todo`
- Files: `core/local/sizehints.ts` (new), `core/local/install.ts`; test `lf-size-hints` "SIZE-5 main", "SIZE-6".
- RED: the main's active node grows 0 → 130 → 160 lines (budget 150) → one 80 % hint, one 100 % hint (S48 texts), two `crossing` lines with every field; the guard never blocks; legacy local mode keeps its one-stage monitor (`local-over-size` green).
- GREEN: `createSizeStages(budget)` → `observe(lines) → (80|100)[]`, once per stage per node.

#### LF5.T7 Package children's hints (SIZE-5 child) `[ ] todo`
- Files: `core/local/sizehints.ts`, `core/local/childtrips.ts`; test `lf-size-hints` "SIZE-5 child".
- RED: `fake-api` `turn` events of a package child + a `workSize` fake rising past 80 % and 100 % → two `api.send` hints, two `crossing` lines, no kill/pause.
- GREEN: D68.

#### LF5.T8 Plan budgets (SIZE-10) `[ ] todo`
- Files: `core/local/split.ts`; test `lf-split` "SIZE-10".
- RED: a split rendering to 151 lines (`planLines` 150) → accepted + one `crossing` (kind `plan`); 6 children → refused (TREE-2's reason).

#### LF5.T9 No size refusal at the gate (SIZE-8 a) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-overcap` (new) "no size refusal".
- RED: property over sizes 0–5 000 lines and 1–40 files: a local-first `request_merge` never returns `reason: "size"`; legacy local mode still refuses (`local-merge-refuse` green).
- GREEN: skip `oversize` (`merge.ts:42`, `:341`) when the node's profile is local-first.

#### LF5.T10 Over-cap review input (SIZE-8 b) `[ ] todo`
- Files: `core/local/overcap.ts` (new), `core/local/merge.ts`; test `lf-overcap` "SIZE-8".
- RED: a 900-line diff → review input = numstat + check output + hunks of the riskiest files (riskGlobs first, then by changed lines) with total ≤ `overCapBytes`; `review.overCap = true`; never the fail-closed `diffBudget` refusal (`merge.ts:117`) in local-first.
- GREEN: `overCapInput(stat, hunks, checkOut, bytes, risk)`.

#### LF5.T11 Budgets at the start (SIZE-9) `[ ] todo`
- Files: `core/prompt.ts`, `core/local/package.ts`; test `lf-prompt` "SIZE-9".
- RED: the section and a package brief contain the session tier's budget and the plan budgets (prefix/line assertions on the rendered lines).

#### LF5.T12 Docs `[ ] todo`
- Files: `docs/task-router.md` (tiers, hints, crossings, the start refusal, over-cap reviews).

### LF6 — Classes and reviewers (design §5.4; gaps 8, 9, 11, 12)

#### LF6.T1 Classifier rules (CLS-1) `[ ] todo`
- Files: `core/strategy/classify.ts` (new), `core/strategy/local-first.ts`; test `lf-classify` (new).
- RED: one case per S38 rule; mixed changes → the highest; a thrown glob error → elevated.

#### LF6.T2 Inert needs a check (CLS-3) `[ ] todo`
- Files: `core/strategy/classify.ts`; test `lf-classify` "CLS-3".
- RED: inert files without a configured passing `extraChecks` entry → standard.

#### LF6.T3 Inert-like (CLS-4) `[ ] todo`
- Files: `core/strategy/classify.ts`; test `lf-classify` "CLS-4".
- RED: tests + docs only → `inertLike`; one code file → not.

#### LF6.T4 Policy from the base (CLS-2) `[ ] todo`
- Files: `core/local/policyfile.ts` (new); test `lf-classify-git` (new).
- RED: real git: the branch edits `policyFile` to mark everything inert → classed elevated, by the base's policy; no file → settings; malformed → elevated.
- GREEN: `git show <base>:<policyFile>`.

#### LF6.T5 Reviewer table (REV-1, SIZE-7) `[ ] todo`
- Files: `core/strategy/reviewer.ts` (new), `core/strategy/local-first.ts`; test `lf-reviewer` (new).
- RED: S39 table cases; property REV-1 over random (class, actual, inertLike); SIZE-7: drawn tier small, actual 200 lines → opus.

#### LF6.T6 E3 for standard (REV-2) `[ ] todo`
- Files: `core/strategy/reviewer.ts`; test `lf-reviewer` "REV-2".
- RED: review arms `{E3: "sonnet"}` → sonnet; absent → opus.

#### LF6.T7 `review` and `merge` line fields `[ ] todo`
- Files: `core/outcome.ts`; test `lf-outcome` "review fields".
- GREEN: spec §2.4's `review` fields; `ROLES` gains `spot`, `fit`, `corrective`, `integration` (X37d snapshot grows); `fallback` gains `local-unavailable`, `transient`.

#### LF6.T8 The gate uses the choice (REV-1) `[ ] todo`
- Files: `core/local/overseer.ts`, `core/local/merge.ts`; test `lf-reviewer-gate` (new) "REV-1".
- RED: overseer rig: class standard, 200 lines → the ticket's member = `localFirst.reviewers.opus`; legacy local mode keeps `pickMember` (`local-overseer` green).
- GREEN: `pickMember` takes a `ReviewerChoice` in local-first.

#### LF6.T9 Advisory reviews (REV-4) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-reviewer-gate` "REV-4".
- RED: inert-like + haiku `revise` → merged; `review.binding = false`.

#### LF6.T10 Elevated: Opus + orthogonal check (REV-3) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-reviewer-gate` "REV-3".
- RED: elevated with a red `extraChecks` entry and an Opus approve → refused `check`; both green → merged; no second LLM ticket.

#### LF6.T11 Inert merges (REV-10) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-reviewer-gate` "REV-10".
- RED: inert + passing extra check → merged without a ticket, `merge.class = "inert"`; no configured check → standard path (CLS-3).

#### LF6.T12 Cheap refusals first (REV-8) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-merge-target` "REV-8".
- RED: a dirty main checkout → refused `main-dirty` with zero tickets issued (overseer rig counts spawns).
- GREEN: move the main-dirty probe before step 8 in both profiles (a fix: no existing case asserts the old order — verify; if one does, it changes here with this reason).

#### LF6.T13 Transient errors retried (REV-9 a) `[ ] todo`
- Files: `core/local/overseer.ts`; test `lf-reviewer-gate` "REV-9 retry".
- RED: fake API: first attempt `error` with a 429/503/overloaded text → a second attempt after the backoff (fake clock), approve → merged; three transient errors → `fallback: "transient"` and the existing `error` outcome; the gate is not closed for a transient error on the first attempt (`overseer.ts:194`).

#### LF6.T14 Docs `[ ] todo`
- Files: `docs/task-router.md` (classes, the policy file, reviewers), `docs/outcome-log.md` (fields). Then LF14 and release R2.

### LF7 — Actor API 3 (cross-repository: PS-1)

#### LF7.T1 Lock pi-setup at API 3; the router's copy (XR-1) `[ ] todo`
- Files: `flake.lock` (pi-setup input only), `core/api.ts`.
- RED: after `nix flake update pi-setup` (to the published PS-1 revision) `iface-subagents-task-router`/`iface-policy-task-router` fail (the copy lacks API 3).
- GREEN: copy spec §2.6's types; KG-I green.

#### LF7.T2 Detection and degraded mode (XR-2) `[ ] todo`
- Files: `core/local/api3.ts` (new); test `lf-api3` (new); `test/fake-api.ts` gains `policyApi`, `tool_result`/`usage` emitters and calls of `beforeRequest`/`afterResponse` (a test helper, not imported by pi-economics).
- RED: `policyApi` absent → one notice, spawns still placed, no `beforeRequest`; `3` → hooks returned.

#### LF7.T3 Module assertion (HM-1 b) `[ ] todo`
- Files: `modules/task-router.nix`, `checks/module-eval/cases/task-router-local-first-needs-api-3.nix` (new).
- RED: the negative case (profile local-first, `spawnPolicyApi = 2`) expects `["pi-task-router: profile local-first needs programs.pi.actorSubagents with passthru.spawnPolicyApi >= 3 …"]` → fails (no assertion).
- GREEN: the assertion; KG-M.

#### LF7.T4 Docs `[ ] todo`
- Files: `docs/task-router.md` (prerequisites), README prerequisites row (`readme-package` checks it).

### LF8 — Contact budgets, the ladder, breakers, spot-checks, batching (design §5.5; gaps 10, 13–17)

#### LF8.T1 `contact` and `ladder` builders (LOG-2) `[ ] todo`
- Files: `core/outcome.ts`; test `lf-outcome` "contact, ladder". `EVENTS_V2` += both; `TRIPS` gains spec §2.4's `hint` trips (X37d).

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
- RED: the table: root with 1 child standard → no plan review; 2 children → plan review iff E7 on; integration with 151 lines or elevated → review iff E8 on; E9 on → plan review at every level; rounds = E10.

#### LF8.T5 The ladder (CON-4, TREE-10) `[ ] todo`
- Files: `core/strategy/ladder.ts` (new), `core/strategy/local-first.ts`; test `lf-ladder` (new).
- RED: property over random failure sequences: each step at most once; `split` never after a merged child or in state `merged`; `retry-xhigh` iff medium; the E11 variants' sequences; `stop` last; `wait` while a quota wait is active.
- GREEN: S40.

#### LF8.T6 Breakers, pure (CON-5 a) `[ ] todo`
- Files: `core/strategy/breakers.ts` (new); test `lf-breakers` (new).
- RED: one case per breaker (S42) at limit − 1 (none) and limit (trip); reset rules.

#### LF8.T7 Breakers for package children (CON-5 b) `[ ] todo`
- Files: `core/local/childtrips.ts`, `core/local/contacts.ts`; test `lf-breakers` "CON-5 child".
- Depends: LF7.T2 (API 3 events in `fake-api`).
- RED: `tool_result` events: three failing `npm test` runs → one `hint` line `trip: "same-test"` and the ladder entered; under API 2 → only today's trips (XR-2).

#### LF8.T8 The ladder driver `[ ] todo`
- Files: `core/local/ladderdrive.ts` (new), `core/local/install.ts`; test `lf-ladder-shell` (new) "driver".
- RED: a trip or a red gate check on a node → `strategy.ladder` consulted, op `ladder`, one `ladder` line; the step's action invoked through injected ports (fakes record them).

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
- Files: `core/outcome.ts`; test `lf-outcome` "quota". `EVENTS_V2` += `quota`.

#### LF9.T3 Reading the headers (Q-1 b) `[ ] todo`
- Files: `core/shell.ts`, `core/local/package.ts` (children's `afterResponse`); test `lf-quota-shell` (new) "Q-1".
- RED: the main's `after_provider_response` and a child's `afterResponse` update the state; crossing 0.8 writes one `quota` line `kind: "threshold"`.

#### LF9.T4 quota-wait detection (Q-2) `[ ] todo`
- Files: `core/quota.ts`, `core/shell.ts`; test `lf-quota-shell` "Q-2".
- RED: fake `__quotaWait_v1` present → subscribed, fallback off, its `start`/`end` → `quota` lines (`source: "quota-wait"`); absent → one notice per process (two sessions, one notice), fallback on.
- GREEN: the type copy of quota-wait's contract (spec §2.5) in `core/quota.ts`.

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
- Files: `core/outcome.ts`; test `lf-outcome` "lqueue". `EVENTS_V2` += `lqueue`.

#### LF10.T5 The main in the queue (LOC-6 b) `[ ] todo`
- Files: `core/shell.ts`; test `lf-lqueue` "main".
- First: X33 (pi awaits `before_provider_request`); not awaited → stop and report.
- RED: `fake-pi`: the main on the local model requests while a fake child holds the stream → its handler resolves only after the child's `end` + affinity; one `lqueue` line `waiter: "main"`; a cloud main never waits.

#### LF10.T6 Children and qwen reviews in the queue (LOC-6 c) `[ ] todo`
- Files: `core/local/package.ts`, `core/local/overseer.ts` (local-member tickets); test `lf-lqueue` "children".
- Depends: LF7.T2.
- RED: two local children's `beforeRequest`s → serialised; a qwen review ticket's request waits behind a child; `usage` ends a request.

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
- Files: `core/outcome.ts`; test `lf-outcome` "mqueue". `EVENTS_V2` += `mqueue`; `REASONS` += `conflict`, `aborted-queue` (X37d).

#### LF11.T4 Rebase and re-review (MQ-2) `[ ] todo`
- Files: `core/local/merge.ts`, `core/local/gitcmd.ts` (`rebase`, `rebaseAbort` ports); test `lf-mqueue-git` (new) "MQ-2".
- RED: real git: the parent moved after an approval → rebase → new tree → a second review (`rereview: true`); parent unchanged → the approval reused (no ticket).

#### LF11.T5 The queue in `request_merge` (MQ-1 b) `[ ] todo`
- Files: `core/local/merge.ts`; test `lf-mqueue-git` "MQ-1 ff".
- RED: real git: two siblings' `request_merge` started together → both merged ff-only, in order, the second rebased; the merged tree of each = its reviewed tree (fake overseer records the reviewed tree id).

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

#### LF11.T9 The fit check (TREE-9) `[ ] todo`
- Files: `core/local/fit.ts` (new), `core/local/install.ts`; test `lf-fit` (new).
- RED: the last child merges → one fresh local child with the fit brief and `submit_fit`; `miss` → op `fit` (a `fix` child added), one message to the main, the merge stands; `fit` → nothing; a failed fix package → the ladder's first step.

#### LF11.T10 Docs `[ ] todo`
- Files: `docs/task-router.md` (the merge queue, per-level checks, the fit check).

### LF12 — Thinking budget per request; context values (design §5.7; gaps 19, 20)

#### LF12.T1 Child effort (LOC-2) `[ ] todo`
- Files: `core/local/package.ts`, `core/strategy/local-first.ts` (`child`); test `lf-thinking` (new) "LOC-2".
- RED: child arms `{E12: "medium"}` → `thinkingLevel: "medium"`; absent → `xhigh`; the main's level untouched; the default members table unchanged (D71; `router-golden` green).

#### LF12.T2 Build verification (LOC-3 a) `[ ] todo`
- Files: `core/local/thinking.ts` (new); test `lf-thinking` "supported".
- RED: `/props` fixtures: build 10964 + end tag → true; 10963, no tag, or unknown → false.

#### LF12.T3 Payload rewrite (LOC-3 b) `[ ] todo`
- Files: `core/local/thinking.ts`; test `lf-thinking` "payload".
- RED: S46: `16k` → `thinking_budget_tokens: 16384` (field from the registry's compat, X36); `unbounded` → unchanged; unsupported → unchanged + one `budget-unsupported` note per session.

#### LF12.T4 Wiring into `beforeRequest` (LOC-3 c) `[ ] todo`
- Files: `core/local/package.ts`; test `lf-thinking` "LOC-3".
- RED: a medium child's every request (fake API 3) carries the field; the hook composes with the queue (LF10.T6): wait first, then rewrite.

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
- First: X34.
- RED: a child's `usage` with `input + cacheWrite ≥ 65536` → trip `uncached` (ladder); the main's `message_end` usage → a hint to the main (the main has no ladder).

#### LF12.T9 Docs `[ ] todo`
- Files: `docs/task-router.md` (thinking arms, the budget field, context values). Then LF15 and release R3.

### LF13 — Lean children (design §5.7, E18 mechanism; gap 28)

#### LF13.T1 Lean brief and tools (LOC-7 a) `[ ] todo`
- Files: `core/strategy/brief.ts` (new), `core/strategy/local-first.ts`; test `lf-lean` (new) "brief".
- RED: S47; property over random package contracts: the contract lines are in both `full` and `lean`; lean tools ≤ 12.

#### LF13.T2 Lean placement (LOC-7 b) `[ ] todo`
- Files: `core/local/package.ts`; test `lf-lean` "LOC-7".
- RED: `{E18: "lean"}` → `systemPrompt`, `tools`, `contextFiles: false` in the policy result; `full` → none of them; API 2 → `full` + the XR-2 notice.

#### LF13.T3 Docs `[ ] todo`
- Files: `docs/task-router.md` (lean children).

### LF14 — Factors, stage 1: E2, E3 (after LF6)

#### LF14.T1 Enable E2 and E3 `[ ] todo`
- Files: `core/strategy/arms.ts`; test `lf-arms` "stage 1" (RND-1's literal table updated: E2, E3 `enabled: true`; the reason: D63).
- RED: the updated table fails until the flags flip; a harness session draws E2 per session and E3 per review, both on the lines.

#### LF14.T2 Docs `[ ] todo`
- Files: `docs/task-router.md` (running factors, how to disable or weight them). Then release R2.

### LF15 — Factors, stage 2: E12, E13 (after LF12)

#### LF15.T1 Enable E12 and E13 `[ ] todo`
- Files: `core/strategy/arms.ts`; test `lf-arms` "stage 2". As LF14.T1; E13 drawn only for `E12=medium` children (unit = child).

### LF16 — Factors, stage 3: E4, E5 (after LF8, LF11)

#### LF16.T1 The batch cap from E5 `[ ] todo`
- Files: `core/local/batch.ts`; test `lf-batching` "E5".
- RED: `{E5: "300"}` → the batch closes at 300 lines; default 150.

#### LF16.T2 Enable E4 and E5 `[ ] todo`
- Files: `core/strategy/arms.ts`; test `lf-arms` "stage 3". Then release R4 (with LF13, LF19).

### LF17 — Factors, stage 4: E6–E10 (after LF11)

#### LF17.T1 E6 flat `[ ] todo`
- Files: `core/strategy/local-first.ts` (`treeCaps`); test `lf-tree` "E6".
- RED: request arms `{E6: "flat"}` → `maxDepth 1`: a depth-1 node gets no `submit_split`; the ladder skips `split` at depth 1.

#### LF17.T2 Enable E6–E10 `[ ] todo`
- Files: `core/strategy/arms.ts`; test `lf-arms` "stage 4" (E7–E10 are already read by `points`, LF8.T4). Then release R5.

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
- RED: request arms `{E16: "opus"}` → the root's plan comes from a `plan_request` ticket and is stored as the root split (op `split`, `reason: "choice"`); the main's `split` of the root is refused with the reason.

#### LF18.T5 E17 strata (REV-5) `[ ] todo`
- Files: `core/strategy/reviewer.ts`; test `lf-reviewer` "REV-5".
- RED: property: qwen only for (small, binding) and (inert-like, advisory); never standard+, never elevated, never for whether a cloud contact happens.

#### LF18.T6 qwen fallback, intention to treat (REV-6, RND-7) `[ ] todo`
- Files: `core/local/overseer.ts`; test `lf-reviewer-gate` "REV-6", "RND-7".
- RED: qwen ticket times out on the slot / serving says down → the stratum's cloud reviewer, `fallback: "local-unavailable"`, the line's arms keep `E17=qwen`.

#### LF18.T7 qwen's review is bounded (REV-7) `[ ] todo`
- Files: `core/local/overseer.ts`; test `lf-reviewer-gate` "REV-7".
- RED: the qwen ticket gets the triad payload, read-only tools, the harness verdict tool, a fresh session (never the author's), and its requests pass the local queue.

#### LF18.T8 Enable stage 5 `[ ] todo`
- Files: `core/strategy/arms.ts`; test `lf-arms` "stage 5". E17 stays disabled until the owner sets the harm bound (Q25); the others on. Then release R6.

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

#### LF19.T6 No `isLocal` (RET-1 f) `[ ] todo`
- Files: `core/local/mode.ts`, `core/shell.ts`; test `lf-seams` "RET-1 no isLocal" (scan: no `isLocal(` in `core/`).

#### LF19.T7 Module `localMode.enable` (RET-1 g) `[ ] todo`
- Files: `modules/task-router.nix`, `checks/module-eval/cases/task-router.nix`.
- RED: `localMode.enable = true` → `settings.profile = "local-first"` and the API 3 assertion applies.

#### LF19.T8 Docs `[ ] todo`
- Files: `docs/task-router.md`, `docs/local-mode/limitations.md` (a pointer to local-first; historical plans untouched).

## 15. Order, parallelism, cross-repository milestones, releases

### 15.1 Dependency graph

```
LF1 ─▶ LF2 ─▶ LF3 ─┬─▶ LF4 ──┬──▶ LF5(wiring) ─┬─▶ LF14 ──▶ R2
                   │            └──▶ LF6(wiring) ─┘
                   ├─▶ LF5.T1–T2, LF6.T1–T6 (core/strategy only; parallel with LF4)
                   └─▶ LF7 (once PS-1 is published; parallel with LF4–LF6)
LF4–LF7 ─▶ LF8 ─┬─▶ LF11 ─┬─▶ LF16, LF17 ─▶ R5
          LF9 ──┤ (LF9.T7 after LF8.T2)
 LF7 ─▶ LF10 ──┴─▶ LF12 ─▶ LF15 ─▶ R3
                   LF12.T1 ─▶ LF13 ─▶ LF19 ─▶ R4
 LF9, LF10, LF13 ─▶ LF18 ─▶ R6
```

Parallel lanes (disjoint files): (a) LF4; (b) the pure parts LF5.T1–T2, LF6.T1–T6, later LF8.T4–T6,
LF9.T1, T6, LF10.T3, LF11.T1 (all under `core/strategy/` or a new single file); (c) LF7 (`core/api.ts`,
`fake-api.ts`, the module); (d) LF9 beside LF8; (e) LF10 beside LF11. Serialise every task touching the
hot files `core/shell.ts`, `core/local/install.ts`, `core/local/merge.ts`, `core/outcome.ts`,
`core/settings.ts`/`core/types.ts`, `core/strategy/local-first.ts` (one integrator merges them in task order;
`EVENTS_V2` and `ROLES`/`REASONS`/`TRIPS` additions are append-only to keep rebases trivial).

### 15.2 Cross-repository milestones (contracts only; their internals are planned in their repositories)

| Id | Repository | Contract | Needed by |
|---|---|---|---|
| PE-1 | pi-economics | consumer copy reads `v: 2` and `v ≤ 1`; no spawn `arm`; drops `iface-experiments-task-router`; `log-contract` imports `FACTORS`, `EVENTS_V2`, `TREE_TYPE`, `MQUEUE_TYPE` once they exist; tested against the R1 commit with `--override-input pi-task-router` before R1 is tagged | R1 |
| PE-2 | pi-economics | arms per factor from `arms` (curves per factor, the frontier); E0: σ, clustering, the cloud-only reference by `session.localMembers = "off"` and `E0=cloud-only`; E1: re-prefill split by 2026-11-13 and `routerVersion`, "after another session's request" from `lqueue` (R3) | R1 (E0, E1 by date), R2 on |
| PE-3 | pi-economics | quality from router-recorded verdicts (`review` incl. `role: spot`, `merge`); reverts within 7 days from `merge` (`commit`, `base`, `branch`, `target`, `repo`, `repoId`) against the repository's history | R1 |
| PE-4 | pi-economics | waits: `lqueue` and `mqueue` lines; quota waits from quota-wait's own meter lines and the router's `quota` lines | R3 |
| PE-5 | pi-economics | E17 escape rate per arm with a CI (shadow `review role: spot` with `of`, a later failing check, a revert); the harm rule of Q25 reported | R6 |
| PS-1 | pi-setup (patched actor-subagents) | spec §2.6: `beforeRequest` (awaited, payload in/out, failure-tolerant), `afterResponse`, `contextFiles: false`, `systemPrompt`, events `tool_result`, `usage`; `policyApi: 3`; `passthru.spawnPolicyApi = 3`; published before LF7.T1 | LF7, then LF8.T7, LF10.T6, LF12.T4, LF13.T2 |
| QW-1 | quota-wait (via pi-setup) | spec §2.5 (consumed only; the router works without it, fallback on) | LF9.T4 (tests use a fake) |

### 15.3 Release points (AGENTS.md "Versions"; each: version constant, `packages/task-router/package.json`, README install line, `nix run .#render`, the full check loop, tag)

| Release | Version | Contents | Stage turned on (D63) | Precondition |
|---|---|---|---|---|
| R1 | 0.3.0 | LF1, LF2 | stage 0: E0 available (share 0, owner sets), E1 passive | PE-1 ready |
| R2 | 0.4.0 | LF3–LF6, LF14 | stage 1: E2, E3 | G1–G10 owner-run before the first live arm |
| R3 | 0.5.0 | LF7–LF12, LF15 | stage 2: E12, E13 | PS-1 published; G11–G13, G16 |
| R4 | 0.6.0 | LF13, LF16, LF19 | stage 3: E4, E5; local mode retired | G14, G15 |
| R5 | 0.7.0 | LF17 | stage 4: E6–E10 | — |
| R6 | 0.8.0 | LF18 | stage 5: E11, E14–E16, E18 (E17 after Q25) | PE-5 for E17 |

Each release's commit message names the consumer changes (outcome log, exports) for pi-economics.

## 16. Open questions (owner; only where the design is silent and a choice is costly to reverse)

| # | Question | Recommendation |
|---|---|---|
| Q24 | Keep the built local mode (`mode: "local"`) unchanged until LF19 (R4), or turn it into local-first piece by piece from R2 on? | Keep it until LF19 (D59): the owner's local sessions keep the fixer, the steer and the size refusal until local-first has its ladder (LF8) and merge queue (LF11); the price is two local paths for three releases. |
| Q25 | E17's harm bound (design §6: "a bound set before the start"): what stops the qwen-reviewer arm? | Per stratum, after ≥ 100 reviews per arm: stop when the qwen arm's escape rate exceeds the cloud arm's by ≥ 5 percentage points with the 95 % CI of the difference above 0, or at once on a qwen-reviewed escape that is reverted from the main branch. pi-economics reports it (PE-5); the router's switch is `experiments.factors.E17.enabled`. |
| Q26 | Split plans are committed to node branches (§11.19) and so reach the main branch with the request's merge. Keep them in the main branch's tree? | No: the router removes the request's `<plans.dir>/split/` files in one commit on the root branch before its merge into the main branch; the plans stay in the branch history and the `split` lines. (If accepted, one task joins LF11; if rejected, nothing changes.) |

## 17. Top risks

| # | Risk | Mitigation |
|---|---|---|
| R13 | Hot files (`shell.ts`, `install.ts`, `merge.ts`, `outcome.ts`) collide across parallel lanes | §15.1 serialisation; append-only registries |
| R14 | R1's v2 bump breaks pi-economics at its next router bump | PE-1 tested against the R1 commit before the tag; commit messages say so |
| R15 | PS-1 late: child breakers, the children's queue, the thinking budget and lean children wait | XR-2 degraded mode; LF8's main-side parts, LF9, LF11 proceed |
| R16 | X33: pi does not await `before_provider_request` | LF10.T5 checks first and stops; the alternative (the actor holds the main's request) is a PS-1 amendment |
| R17 | Local-queue deadlock: a holder waiting on another local session | release at the request's end + affinity; no session holds while it awaits a tool; LF10.T3 property |
| R18 | Experiment volume (≈ 15 merges a day): factors need months | staging (D63), session clustering from E0; few factors at once |
| R19 | Classifier proxies (X41) misclass: elevated too often (cost) or too rarely (risk) | errors fail closed; the policy file is per repository; spot-checks sample merges |
| R20 | Split commits disturb a worktree | D66's path-limited commit through the worktree; LF4.T5's staged-file case |
| R21 | Golden drift from default changes | local-first values under `localFirst.*`; D71; KG-R per task |
| R22 | Two local paths diverge (D59) | LF19 at R4; fixes to shared code land once |
| R23 | E17 lets defects through binding small reviews | spot-check shadow at 10 %; Q25 before enabling |

## 18. Resolutions (parent)

_Empty until the plan review and the owner answer §16._
