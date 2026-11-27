# The outcome log (`task-router/outcomes/YYYY-MM.jsonl`)

What the router writes about the tasks it routes: where the log lives, every
event and field, how lines join and when the version moves. This repository
owns the schema. Readers outside it: pi-economics' `pi-analyse`,
`meter-report` and guards, through their copy of the contract (`core/contract.ts`
and the examples in token-meter's `LOGS.md`), which its `log-contract` check
proves against this router. Extracted from pi-economics'
`packages/token-meter/LOGS.md` (its `task-router/outcomes` section and the
local-mode examples) at `3d0f2e1`.

## File

`<agentDir>/task-router/outcomes/YYYY-MM.jsonl`: the agent dir is `~/.pi/agent`,
or `$PI_CODING_AGENT_DIR` (the Nix module: `programs.pi.agentDir`); one file
per UTC month. The router writes it in the main session only, one line per
routing event of a delegated task. Append-only JSON Lines (one object per
line, UTF-8, `\n`), no prompt or message text, strings clipped to 256
characters; timestamps are ISO-8601 UTC.

## Versions

Every line carries `v` (integer, 1 since 2026-10-03, 2 from task-router 0.3.0,
below); readers treat an absent `v` as 0 (the lines before). The rule:

- adding an optional field: no `v` bump (the notes †, ‡ and § below date each
  addition);
- renaming or removing a field, or changing its type or meaning: a `v` bump.

A bump changes the contract that pi-economics' readers copy; it reaches them
when pi-economics bumps its router input.

### Version 2 (decided 2026-11-16, from task-router 0.3.0)

The local-first redesign (`docs/local-first/spec.md` §2.4) bumps `v` once,
to 2: the router no longer reads pi-economics' experiments assignments
(`__piExperimentsApi_v1`) and randomizes its own levers, so `spawn.arm` is
removed; a child joins its parent by `parentSessionId`. Nothing else in a
cloud-first line changes. The other v2 additions are optional fields, new
events and new values, which need no further bump:

- the `session` event (below), one line per `session_start` of a main
  session (none from a child) in local mode, and in a cloud-first session
  while E0 runs (`experiments.cloudOnlyShare` above 0);
- the `merge` fields `base`, `target`, `repo` and `repoId`, which join a
  merge to a later revert;
- the field `arms` (string[], below), the levels of the router's own
  randomized factors that apply to a line: on every line of a local-first
  session (later releases), and in a cloud-first session on its `session`
  line only, E0's (`["E0=as-used"]` or `["E0=cloud-only"]`) while E0 is
  drawn;
- the exports a reader takes its lists from instead of copying them:
  `EVENTS_V2` (the events v2 added), `ENUMS_V2` (`"<event>.<field>"` → the
  field's values; only fields v2 added, the values of the v1 fields stay in
  `TRIPS`, `ROLES`, `REASONS`, `TRIGGERS` and `FALLBACKS`, `review.fallback`).
  Under `packages/task-router/core/`: `EVENTS_V2`, `ENUMS_V2` and `FALLBACKS`
  in `outcome.ts`; `TRIPS` in `local/tripwires.ts`, `ROLES` in
  `local/overseer.ts`, `REASONS` in `local/merge.ts`, `TRIGGERS` in
  `local/plan.ts`, `PLAN_TYPE` in `local/plans.ts`, `BRANCH_TYPE` in
  `local/branches.ts`; and `FACTORS`
  (`strategy/arms.ts`), the factor registry: each
  factor's id, unit, levels (the first is the default) and `from` release.
  They only grow. The levels and their order that apply to a session are those
  of the `FACTORS` of the router version named on its `session` line
  (`routerVersion`); the first level is that version's default. A session's
  own levels are in its snapshot, the session entry `task-router/arms` (the
  entry shape: `docs/task-router.md`, "The snapshot"), which a release that
  moves a first level does not change. E0's `weights` in `FACTORS` are unused
  placeholders: E0 is weighted `[1 − s, s]` by its share `s` (the snapshot's
  `cloudOnlyShare`), so a reader takes E0's weights from the share, not from
  `FACTORS`. E0 is not in the entry's `arms`; its arm is the `session` line's
  (`docs/task-router.md`, "The snapshot").

A reader keeps reading `v` ≤ 1 lines as before (with `arm`), and v2 lines
without it.

Consumer break (pi-economics, until its PE-1): `v: 2` on every line, spawn
lines without `arm` and the new `session` event fail a reader that expects
`v` 1, `arm` on a spawn and the v1 event set; a reader that rejects unknown
fields must also take the optional `arms` (on `session` lines from 0.3.0).

## Join keys

- **Task ↔ child session.** `spawn.sessionId` is the child's session id (the
  `sessionId` of the child's lines in pi-economics' meter log),
  `parentSessionId` the spawner's. Every other event joins the spawn by
  `taskId` (the subagent's name).
- **Arm.** `arm` on a `v` ≤ 1 spawn is a copy, at write time, of the parent
  session's arm in pi-economics' experiments assignments; v2 has no `arm`.
- **Session.** A `session` line's `taskId` is the main session's id; the
  session's spawns join it by their `parentSessionId`. Every `session_start`
  of a session writes a line (a resume or a reload repeats it, with the same
  `localMembers`, because the draw depends on the session id only): a reader
  keeps the first line per `taskId`. A session whose lines disagree on
  `localMembers` is left out of E0. Since the arm is drawn from the
  session's stored experiments settings (the session entry `task-router/arms`,
  from 0.3.0; its shape, with each factor's levels, is in `docs/task-router.md`,
  "The snapshot"), a settings change across a resume no longer changes it.
- **Arms.** `arms` lists `"<id>=<level>"`, sorted, of the factors enabled
  for the line's session and unit; an absent factor ran at its default (the
  first level of the session's `routerVersion` in `FACTORS`, see above) or was
  not enabled. A factor counts for a session
  only while it is listed; the session's `session` line carries the session's
  arms.

## Events

Common: `v` (int), `ts` (ISO), `event`, `taskId` (subagent name; `""` on `force` lines, which belong to the session,
not to a task, and on a `merge` refused before any branch was known or whose `branch` argument is no branch name; `"main"` or the child's name on `hint` lines; the review id
on `review` lines; the node id on `node` and `split` lines; the branch on `merge` lines; the main branch on `gatebypass` lines; the plan's slug on `plan` lines; the session id on `session` and `profile` lines) — all required.

| event | fields (required **bold**) | meaning |
| --- | --- | --- |
| `spawn` | **`kind`**, **`workerTier`** (`qwen` \| `haiku` \| `T1` \| `T2` \| …), **`workerEffort`**, `reviewTier`, `reviewEffort`, `cardHash`, `base`, `importance`, `reasons` (string[]), `arm`* (`v` ≤ 1), **`sessionId`** (child), **`parentSessionId`**, `attemptOf`, `assigned`† (`router` \| `random`), `routeBase`† (tier), `unresolved`† (`true`), `reviewOf`†, `ability`†, `level`† (int ≥ 0), `draft`† (`true`), `workerLevel`†, `reviewLevel`† (int ≥ 0), `workerMember`†, `workerModel`†, `startEffort`†, `waitMs`† (≥ 0), `forced`‡ (`true`), `forceSource`‡ (`command` \| `settings`), `routedModel`‡, `routedEffort`‡, `ticket`§ (`merge` \| `plan-author` \| `plan-review` \| `delta` \| `steer` \| `fixer`) | a routed (or unrouted) spawn; with `ticket`, the router's own child (§) |
| `session` | **`profile`** (`cloud-first` \| `local-first` \| `local-mode`), **`mainModel`**, **`startSet`** (bool), **`localMembers`** (`on` \| `off`), **`routerVersion`**, `arms`∥ | v2: a main session started; `taskId` is its session id; `local-mode` = `mode: "local"`; `mainModel` is `provider/id` (`""` when unknown); `localMembers` is E0's arm: `off` = the router routed no spawn of the session to a `route: "local"` member (a forced spawn is excluded: it may run on one, and its `spawn` line has `forced`), `on` = it may; it is absent when the session is outside E0 (routing off, no enabled cloud member in the member table, a local-first session); the legacy `local-mode` line says `on`; `routerVersion` is the package's version; `startSet` (from 0.4.0) = the router set the session's main model at this start (local-first's start model, `docs/task-router.md` "Routing profiles"), and `mainModel` is that model |
| `profile` | **`from`** (`cloud-first` \| `local-first` \| `local-mode`), **`to`** (`cloud-first` \| `local-first`), **`by`** (`settings` \| `command`), `arms`∥ | v2, from 0.4.0: the session's routing profile switched; `taskId` is its session id; `/profile` writes it with `by: "command"` (the profile a session starts with is on its `session` line; `settings` is enumerated, no line carries it yet) |
| `node` | `parent`, **`depth`** (int ≥ 0), **`kind`** (`leaf` \| `plan` \| `integration` \| `fix`), **`fanout`** (int ≥ 0), **`outcome`** (`started` \| `split` \| `merged` \| `blocked` \| `abandoned`), **`tier`**, `class`, **`profile`**, `arms`∥ | v2, local-first preview: a node of the work tree (`docs/task-router.md` "The work tree") started, split or merged; `taskId` is the node id, `parent` its parent's (absent on the request node); `fanout` the children of its split; `tier` is `inert` for an inert estimate, else `standard` until the size tiers arrive |
| `split` | **`node`**, **`reason`** (`estimate` \| `breaker` \| `check` \| `choice` \| `review`), **`children`**, **`depth`**, **`planLines`** (int ≥ 0), `arms`∥ | v2, local-first preview: a node's split plan was committed (`split` by the main or `submit_split` by a package child: `choice`); `taskId` and `node` are the split node; `planLines` the rendered plan's lines; no plan text is logged |
| `crossing` | **`node`**, **`stage`** (`80` \| `100`), **`lines`**, **`budget`**, **`estimate`** (int ≥ 0), **`tier`** (`small` \| `standard` \| `large` \| `inert`), **`class`** (`inert` \| `standard` \| `elevated`), **`depth`** (int ≥ 0), **`kind`** (`code` \| `plan` \| `inert`), **`turn`**, **`call`**, **`sinceStartMs`** (int ≥ 0), `arms`∥ | v2, local-first: a node reached a size stage (`docs/task-router.md` "Size"): 80 % or 100 % of the session tier's budget during the work, once per stage and node, or a split above `planLines` (stage `100`, `kind: plan`, `budget` = `planLines`); `taskId` and `node` are the node; `lines` its changed lines (a split's: its rendered lines), `estimate` the node's estimated lines, `kind` its estimate's kind, `tier` the session's drawn tier; `turn` and `call` count the measuring session's turns and tool calls, `sinceStartMs` the time since the node was first measured |
| `reroute` | **`from`**, **`to`**, `reason`, `fromModel`†, `toModel`† | provider fallback (rate limit, outage) |
| `check` | **`exit`**, `durationMs` | the card's check ran after the child reported |
| `corrective` | — | one corrective message to the child |
| `escalate` | **`from`**, **`to`**, `attemptOf`, `fromModel`†, `toModel`†, `ability`†, `fromLevel`†, `toLevel`† (int ≥ 0) | re-spawn one level above the failed attempt (the higher of its planned and ran member's levels on `ability`) |
| `verdict` | **`verdict`** (`accepted` \| `partial` \| `rejected` \| `unjudged`), `note`, `reviewOf`† | the parent's judgement; `unjudged` when killed without one |
| `spotcheck` | `requested` (`true`) | an accepted verdict was drawn for a spot-check review (`spotCheck.share`); the parent was told to spawn a `review` card with `reviewOf` |
| `force` | **`action`** (`set` \| `clear` \| `used` \| `expired` \| `rejected`), **`source`** (`command` \| `settings`), `model`, `effort`, `reason` (`unknown-model` \| `usage`) | the force override (task-router local mode): `/force` set, cleared or rejected; a forced spawn used it; a `next:N` force ran out; `taskId` is `""` |
| `hint` | **`trip`** (`identical-call` \| `no-change-writes` \| `alternation` \| `repeated-error` \| `churn` \| `check-failing` \| `over-size` \| `risky-path` \| `context-soft` \| `context-stall` \| `outside-worktree`), **`stage`** (`hint` \| `steer` \| `parent`), `count` (int ≥ 0), `sessionId` | a tripwire fired (task-router local mode; `outside-worktree` = the write guard blocked an `edit`/`write` in the main checkout while a worktree was active): `hint` = a `<router-hint>` went into the tool result (main) or a message (child); `steer` = the main session got the escalation; `parent` = a stuck child's parent was told; `count` = the trip's detections since the last progress; `taskId` is `"main"` or the child's name; the hint's text is never logged |
| `review` | **`role`** (`merge` \| `plan-author` \| `plan-review` \| `delta` \| `steer`), **`member`**, **`model`**, **`outcome`** (`approve` \| `revise` \| `invalid` \| `timeout` \| `error`), `attempt` (int ≥ 1), `durationMs` (int ≥ 0), `fallback` (`budget` \| `error`), `findings`, `blocking` (int ≥ 0), `inconsistent` (bool), `commit` (sha), `branch` | one overseer attempt (task-router local mode, §): `taskId` is the review id; `outcome` is the verdict's approval (`approve` when no finding is blocking) or how the attempt failed (an aborted attempt is an `error`); `fallback` = the attempt ran on the fallback member because the Opus budget was spent (`budget`) or attempt 1 failed (`error`); `findings`/`blocking` count the verdict's findings, `inconsistent` marks a `verdict` field that disagrees with them; no verdict text is logged |
| `merge` | **`outcome`** (`merged` \| `refused` \| `revise` \| `fixer` \| `failed`), `reason` (`main-branch` \| `dirty` \| `behind` \| `fixer-running` \| `abandoned` \| `blocked` \| `size` \| `scope` \| `check` \| `main-dirty` \| `plan-changed` \| `no-worktree` \| `review-unavailable` \| `aborted` \| `git`), `commit` (sha), `nLines`, `nFiles` (int ≥ 0), `reviewId`, `pushed` (bool), `base`¶, `target`¶, `repo`¶, `repoId`¶ | one `request_merge` call (task-router local mode, the merge gate): `taskId` is the branch; `outcome` is the call's status (`failed` = status `error`, with `reason` `review-unavailable`, `aborted` or `git`); `reason` is the fixed refusal or error code, never its text; `nLines`/`nFiles` the diff's size once it was read; `reviewId` the approving or rejecting review; `pushed` only when the merge gate pushes |
| `plan` | **`action`** (`skeleton` \| `approve` \| `trigger` \| `amend` \| `reject`), `trigger` (`non-whitelisted` \| `interface-break` \| `regression` \| `over-budget` \| `remediation-failed`), `nTasks` (int ≥ 1), `reviewId`, `full` (bool) | a plan of task-router local mode: `taskId` is the plan's slug; `skeleton` = the plan author's skeleton was accepted (by `plan_request`, or a milestone rewritten after rejected amendments), `approve` = `plan_request` committed the plan on main, `trigger` = a replan trigger opened (`trigger` its code), `amend` = an amendment was committed, `reject` = an amendment's review rejected it; `nTasks` counts the skeleton's tasks, `reviewId` is the plan author's run or the amendment's review, `full` marks a plan-review of the whole plan (else a delta review); no plan text is logged |
| `gatebypass` | **`from`**, **`to`** (shas), `repo` | a main branch moved outside the merge gate (task-router local mode; detected after a main-session `bash` result or a child's turn): `taskId` is the main branch, `repo` the repository's directory name (never a path); who moved it is unknown |

\* `arm` is required on a `v` ≤ 1 spawn whose parent session (or its root) has an assignment; v2 removed it.

∥ Optional, added with v2 (2026-11-26, from 0.3.0): `arms` (string[] of `"<id>=<level>"`, sorted; ids and levels from
`FACTORS`). In a cloud-first session only its `session` line has it, `["E0=as-used"]` or `["E0=cloud-only"]`, and only
while E0 is drawn (it agrees with `localMembers`: `cloud-only` = `off`); a `session` line without `localMembers` has no
`arms`. A local-first session (later releases) will carry it on every line, `[]` included. Legacy local mode never does.
The levels of `arms` are the session's own, from its snapshot (`task-router/arms`, `docs/task-router.md`, "The snapshot"), not
the `FACTORS` of a later release.

¶ Optional, added with v2 (2026-11-26, from 0.3.0) on a `merged` line: `base` the target branch's tip before the merge, `target`
the branch merged into, `repo` the repository's directory name (never a path), `repoId` the first 12 hex of its root
commit (`git rev-list --max-parents=0 HEAD`, sorted, the first), stable across clones and renames. A revert is found by
`repoId` and `commit`. `class`, `tier`, `actualTier` and `node` are reserved there for later local-first stages.

† Optional, added 2026-10-04 (no `v` bump). `assigned`/`routeBase` (T5.21): who chose the worker tier
(`random` = task-level randomization sent a Qwen route to T1) and the worker tier the router computed; absent on
unrouted spawns. `unresolved` (T5.20): a relative card file's directory was missing under the task's cwd (card `cwd`,
else the parent's), so `bounded` was lowered without evidence the task is unbounded — exclude these spawns from
t0-verification statistics. `reviewOf` (T5.22): on a spot-check review child's spawn and verdict, the reviewed
task's `taskId`; agreement = that task's `accepted` vs this verdict.

† Also optional, added 2026-10-17 with the router's members and levels (no `v` bump); absent on unrouted
spawns and on older lines. On `spawn`: `ability` and `level` are the card's requirement (after the floor or a
profile's pin), `draft` marks a draft requirement, `workerLevel`/`reviewLevel` are the plan's legs on that
ability's scale; `workerMember`, `workerModel` and `startEffort` are the member, model and effort the child
**started on** (an accepted explicit model or effort included), `waitMs` the time it waited for a slot.
`workerTier` and **`workerEffort` keep their meaning: the planned worker leg** (after randomization and
escalation); `startEffort` is the effort the child started at. They differ for a fallback member (a write-0 plan
whose Qwen is busy logs `workerTier: qwen`, `workerEffort: xhigh`, and e.g. `workerMember: sonnet`,
`startEffort: high`) and for an accepted explicit effort. The randomized comparison keeps reading `assigned`
(intention to treat); the model a task ran on is `workerModel`, updated by its last `reroute.toModel`. On
`reroute` and `escalate`: `fromModel`/`toModel`, the models on both routes; `escalate` adds the re-spawn's
`ability` and `fromLevel`/`toLevel`. `escalate.from` is the route the failed attempt ran on last (after its
reroutes). It is `"?"` on older lines, and on a re-spawn whose failed task the router does not know (its attempt state
is in memory: a restart, a hand-off, a mistyped `attemptOf`); `fromModel` and `fromLevel` are absent when the attempt is unknown.
`fromLevel` is the level the escalation starts from: the higher of the failed attempt's planned and ran member's levels
on `ability` (D7), so it exceeds the level of `from`/`fromModel` when the planned member rates higher on `ability`
(a write-0 plan that fell back to Sonnet logs `from: "T1"`, `fromLevel: 1`).
`pi-analyse` counts an escalation in its failed task's row (card kind × `workerTier`).

‡ Optional, added with task-router's force override (local mode L2, no `v` bump); present only on a forced spawn.
`forced` is `true`, `forceSource` says whether `/force` or the settings `force` applied, and `routedModel`/`routedEffort`
are what routing would have chosen (the planned worker leg). `workerModel`/`startEffort` are the forced model and effort;
a forced model outside the router's members has no `workerMember`. A force is the owner's override of the placement, also in an
E0 cloud-only session (`session.localMembers` `off`), where it may name a local member: an analysis of E0 leaves `forced`
spawns out. A `force` line has no task, and a `hint` line's
`taskId` may be `"main"`: `pi-analyse` counts only the task events (`reroute`, `check`, `corrective`, `escalate`,
`verdict`, `spotcheck`) as "task events without a spawn".

§ Optional, added with task-router's overseer (local mode L4, no `v` bump). The router spawns its own children (an
overseer: `kind: "overseer"`; a fixer: `kind: "implement"`) with a ticket instead of a card: their `spawn` line has
`ticket` (the role), the member's `workerTier`, `workerEffort`, `workerMember`, `workerModel`, no `cardHash` and no
verdict (a kill logs no `unjudged`). Each overseer attempt adds a `review` line; a `review` is no task event, and the
overseer's session is a child named by its ticket `spawn` line.

## Examples: local mode

One line per event that local mode added, as `v: 1` lines (before 0.3.0; pi-economics keeps the same lines in its `LOGS.md`, and its `test/logs-examples.test.ts` runs each through its contract): a
`/force` set by the command, a hint to the main session, a ticket `spawn` of a merge overseer and its `review`, the
rejected `request_merge`, a main branch moved outside the gate, and a plan approved by `plan_request`.

```jsonl
{"v":1,"ts":"2026-11-02T09:00:00.000Z","event":"force","taskId":"","action":"set","source":"command","model":"anthropic/claude-sonnet-5-5","effort":"high"}
{"v":1,"ts":"2026-11-02T09:01:00.000Z","event":"hint","taskId":"main","trip":"identical-call","stage":"hint","count":3,"sessionId":"s-main"}
{"v":1,"ts":"2026-11-02T09:02:00.000Z","event":"spawn","taskId":"ovs-merge-1","kind":"overseer","ticket":"merge","workerTier":"T2","workerEffort":"high","workerMember":"opus","workerModel":"anthropic/claude-opus-5-5","sessionId":"s-ovs-merge-1","parentSessionId":"s-main"}
{"v":1,"ts":"2026-11-02T09:05:00.000Z","event":"review","taskId":"rv-1a2b3c4d","role":"merge","member":"opus","model":"anthropic/claude-opus-5-5","outcome":"revise","attempt":1,"durationMs":180000,"findings":2,"blocking":1,"commit":"0123abc","branch":"lm/parser"}
{"v":1,"ts":"2026-11-02T09:05:01.000Z","event":"merge","taskId":"lm/parser","outcome":"revise","commit":"0123abc","nLines":42,"nFiles":2,"reviewId":"rv-1a2b3c4d"}
{"v":1,"ts":"2026-11-02T09:10:00.000Z","event":"gatebypass","taskId":"main","from":"0123abc","to":"4567def","repo":"app"}
{"v":1,"ts":"2026-11-02T09:20:00.000Z","event":"plan","taskId":"parser","action":"approve","nTasks":4,"reviewId":"rv-5e6f7a8b"}
```

## Examples: version 2

A cloud-first session drawn into E0's cloud-only arm, one outside E0 (routing
off: no `localMembers`, no `arms`), and a merge with the fields a revert needs.

```jsonl
{"v":2,"ts":"2026-11-30T09:00:00.000Z","event":"session","taskId":"s-main","profile":"cloud-first","mainModel":"anthropic/claude-opus-5-5","startSet":false,"localMembers":"off","routerVersion":"0.3.0","arms":["E0=cloud-only"]}
{"v":2,"ts":"2026-11-30T09:10:00.000Z","event":"session","taskId":"s-plain","profile":"cloud-first","mainModel":"anthropic/claude-opus-5-5","startSet":false,"routerVersion":"0.3.0"}
{"v":2,"ts":"2026-11-30T09:30:00.000Z","event":"merge","taskId":"lm/parser","base":"0123abc","outcome":"merged","commit":"89abcde","nLines":42,"nFiles":2,"reviewId":"rv-9a8b7c6d","repo":"app","target":"main","repoId":"a1b2c3d4e5f6"}
```
