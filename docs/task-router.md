# `programs.piTaskRouter` (`modules/task-router.nix`)

The module contract: every option, its default and its effect, the routing
profiles, local mode and the scout gate. Extracted from pi-economics' `docs/pi-economics.md`
(section `taskRouter`) at `3d0f2e1`; the options moved from
`programs.piEconomics.taskRouter` to `programs.piTaskRouter`, the actor from
`programs.piEconomics.actorSubagents` to pi-setup's
`programs.pi.actorSubagents`, and the agent dir is pi-setup's
`programs.pi.agentDir`. The outcome log's schema: `docs/outcome-log.md`.

The task-router, as it stands after the router redesign's Group 7 (close-out).
The new defaults are Group 5's (R5, after the RF1–RF5 follow-ups; pi-economics' pre-publication history);
Groups 1–2 came from the author's system configuration at commit `566fd0d`,
"R'"; Groups 3–7 were made in pi-economics. Group 6 (the scout gate) changed no default. It routes subagent spawns by task
card through actor-subagents' spawn policy: the card gives a required ability
and level (abilities and levels per member), the importance table gives the
legs (worker, and a review where the cell has one), and a leg runs on the
cheapest free member among its candidates (cost order, slots, health probes,
daily caps, a provider's block; a busy cheapest pool is waited for up to
`queueMaxSec`, then the next member). There is no Qwen chain: under the
defaults the local Qwen comes first and Haiku after it; the free-cloud slot
(`models.qwen-cloud`) is empty, and a settings file that names its model makes
it an ordinary member after local. A provider error moves a child to a free
member of its leg on another provider. The pick or the move reserves the slot
at once (60 s, and while pi lists the child running), so concurrent spawns and
moves never share one; an explicit `model` runs on its member alone (it waits
`queueMaxSec`, then the spawn is rejected) and fails over only at or above it.
A re-spawn (`attemptOf`) goes one level above the member the failed task ran
on. Spawns, moves, escalations and verdicts go to the outcome log
(`<agentDir>/task-router/outcomes/YYYY-MM.jsonl`); the router registers the
`task_verdict` tool. Main session only: children do not route.

| Option | Default | Effect |
|---|---|---|
| `enable` | `false` | entry `task-router` of pi-setup's registry `programs.pi.extensions` (pi-setup links `<agentDir>/extensions/task-router` → the package; `forChildren = false`); asserts `programs.pi.actorSubagents` (below) |
| `package` | the flake's `packages/task-router` | the extension (`package.json`, `index.ts`, `core/`); its tests run when it builds |
| `settings` | `{}` | written to `<agentDir>/task-router/settings.json` when non-empty (`<agentDir>` = `programs.pi.agentDir`); free-form, the schema and defaults are `packages/task-router/core/settings.ts` (`models` and `importanceTable` merge over the defaults: `models.<member>` field by field, `model = ""` removes the member; a given table cell replaces the default cell); the rollback to the routing before the new defaults is `lib.importJSON` of `packages/task-router/test/fixtures/today-config.json`; pi-setup's `programs.pi.router.localHealthUrl`, when set, is `models.qwen-local.health` |
| `profile` | `"cloud-first"` | the routing profile a session starts with ("Routing profiles", below): `"local-first"` defines `settings.profile = lib.mkDefault "local-first"` (a `settings.profile` given in `settings` wins); the default writes nothing; before 0.5.0 local-first needs `settings.localFirst.experimental = true` |
| `localMode.enable` | `false` | local mode (below): defines `settings.mode = lib.mkDefault "local"`, so the settings file is written even for `settings = {}`; asserts `enable` (`pi-task-router: programs.piTaskRouter.localMode.enable requires programs.piTaskRouter.enable`) and that a given `settings.mode` is `"local"` (`pi-task-router: programs.piTaskRouter.localMode.enable needs programs.piTaskRouter.settings.mode = "local" (found …)`) |

Models are configured through `settings.models`, as in the option's example:

```nix
programs.piTaskRouter.settings = {
  models = {
    qwen-local.health = "http://localhost:11545"; # where the local server answers
    haiku.model = ""; # no Haiku: write 0 falls back to Sonnet
  };
  queueMaxSec = 60;
};
```

`packages/task-router/test/fixtures/models-example.json` (every member written
out) is read by the package's settings test and by the `module-eval` case
`task-router-models`.

## Routing profiles

A session runs under one routing profile (local-first plan LF3; the design:
`docs/local-first/design.md` §5.1). `cloud-first` is the routing by task card
this document describes, and the default. `local-first` makes the main session
a coordinator whose local children do the work, one fresh child per package;
its mechanism arrives over the next releases, so it is a preview: before 0.5.0
it needs `"localFirst": {"experimental": true}`. Without it the settings check
reports `profile local-first is experimental before 0.5.0; set
localFirst.experimental` and drops the key, and `/profile local-first` answers
with the same notice.

**Two kinds of profile.** The routing profile is the settings key `profile`
(singular, `"cloud-first"` or `"local-first"`). The card-kind profiles are
`profiles.<kind>` (plural, keyed by a card kind: its tools, skills and report),
unchanged. An object under `profile` is reported (`profile takes cloud-first |
local-first; card-kind profiles go under profiles.<kind>`) and dropped. A
card kind's place in a local-first session is
`profiles.<kind>.localFirst = {placement: "local" | "cloud"}`: the built-in
`scout`, `lookup`, `mechanical`, `implement` and `debug-design` are `local`,
`review` and `plan` `cloud`; another value is reported
(`profiles.<kind>.localFirst: must be {placement: "local" | "cloud"};
dropped`). Cloud-first ignores it.

**Profile and local mode.** A valid `profile` wins over the legacy `mode:
"local"` (local mode below): the session is cloud-first or local-first. Without
`profile`, `mode: "local"` is the session profile `local-mode` (outcome lines
and `/profile` name it so); local mode is unchanged: `/profile` shows it and
refuses a switch (`task-router: /profile is not available in local mode (mode:
"local") before its retirement`), and a stored profile entry does not leave it.

**Per session.** The settings give the profile a session starts with; the
session entry `task-router/profile` (`{v: 1, profile, by: "settings" |
"command", at}`) keeps a switch, and every `session_start` restores the last
one (none: the settings; a stored local-first entry the gate above refuses
counts as none, with its notice). The first local-first start records the
settings' choice. `/profile` shows the session's profile; `/profile cloud-first` or
`/profile local-first` switches it from then on: one entry, one `profile` line
(`from`, `to`, `by`, `docs/outcome-log.md`) and the status line
(`local-first`; cloud-first leaves it alone). A switch keeps the session's E0
arm. Under local-first:

- *The main model.* At the start of a local-first main session the router sets
  the model of the member `localFirst.startMember` (default `qwen-local`) with
  thinking `xhigh`, unless the user chose one: `--model` or `--models` on pi's
  command line, or a resumed session pi restores a model for. A reload sets
  nothing; a model the registry does not know leaves pi's default with one
  notice. The router never sets the main model again.
- *The section.* The main gets the coordinator section instead of the task
  cards: the session's tier budget (`standard` = `localFirst.tiers.standard`
  changed lines per package), the tree caps (`localFirst.tree`) and the
  do-or-split rule.
- *Tools and hooks.* The local components whose switch is `auto`
  (`worktrees`, `mergeGate`, `plans`, `hints`) are on, as in local mode:
  `start_branch`, `request_merge`, `split`, `plan_request` and `amend_plan` register at
  the session's first local-first moment (a cloud-first session has none).
  Back in cloud-first they leave the active tool set (pi cannot unregister a
  tool), the hooks of those components stand still and the card section
  returns.

### The work tree (local-first)

A local-first request is a tree of nodes (local-first plan LF4; the design:
`docs/local-first/design.md` §5.2). Each node is a branch with its own
worktree; a node either does its work or is split into packages, each a child
node. Splitting replaces the size limit: a package small enough to do in one
child's session is done there, anything larger is split first.

- *Nodes.* In a local-first session `start_branch` takes an `estimate`
  (`{lines, kind: "code" | "plan" | "inert"}`, the changed lines expected).
  Without `parent` it starts the request node, cut from the main branch's tip
  as today. With `parent` (a node id) it cuts the new node from the parent
  node's branch tip; the node id is `<parent>.<slug>` and the branch
  `<branchPrefix><id>`, at most `localFirst.tree.maxDepth` levels below the
  request. A node keeps the profile it started in: after a switch to
  cloud-first, while a local-first node is open, `request_merge` still runs
  the local-first gate and the git guard stays on; new nodes cannot start.
  The tree lives in the session as entries
  `task-router/tree` (one op per change: `add`, `state`, `split`, …); a
  reload replays them. The outcome log gets a `node` line per node change and a
  `split` line per split (`docs/outcome-log.md`).
- *Split plans.* `split({node?, summary, children})` splits a node; without
  `node` it splits the root of the active node (the top-level plan). A plan has
  1 to `localFirst.tree.maxChildren` children, each `{slug, goal, files (1–30
  globs), estimate, check, forbidden?}` (`forbidden`: globs the package must
  not touch). The router validates it (a slug whose node branch git refuses,
  such as `lock` for `<node>.lock`, is refused; `start_branch` refuses such a
  branch name too), commits it as canonical JSON at
  `<plans.dir>/split/<node>.json` on the node's branch (never on the main
  branch) and marks the node `split`. Only an active node splits, once; splits
  run one at a time, so of a concurrent `split` and `submit_split` of a node
  one is refused. These split files are the router's
  own: they never count as a scope violation. `start_branch({parent, child:
  slug})` starts one package of the recorded split, its goal, files, estimate
  and check taken from the plan; each slug starts once. `start_branch({parent,
  slug})` with a slug of that split is the same package: it starts or
  re-activates it, with the goal, check and estimate from the plan.
- *Package children.* A spawn card with `package: "<node id>"` (an active node
  started from a split) runs on `localFirst.startMember` at `xhigh`, in the
  node's worktree, and its brief carries the package contract: goal, files,
  budget (the estimate), check and forbidden globs. A card with `t2` triggers
  is routed to the cloud instead, still in the worktree under the contract and
  marked an open-ended contact. Below the depth cap the child also gets the
  tool `submit_split` and the do-or-split rule: it does its package, or it
  submits a split of it (`split`'s input without `node`, for its own node)
  and ends; the router tells the main, which starts the new children. Only
  the main starts children. A package child's shell runs only local git
  subcommands, an allow-list (`LOCAL_GIT` in
  `packages/task-router/core/local/package.ts`: `status`, `diff`, `log`,
  `show`, `add`, `commit`, `restore`, `checkout`, `switch`, `branch`,
  `reset`, `stash`, `mv`, `rm`, `grep`, `merge`, `rebase`, … and the read
  commands such as `rev-parse`, `ls-files`, `merge-base`, `cat-file`,
  `blame`). The router refuses every other git subcommand (`push`, `fetch`,
  `pull`, `remote`, `clone`, `ls-remote`, `archive`, `send-email`,
  `submodule`, `subtree`, `lfs`, `config`, `worktree`, a user alias, an
  external `git-x`), a `-c` other than `user.name`, `user.email`,
  `commit.gpgsign` and `color.*`, `--exec-path`, `rebase --exec`,
  `grep -O`, a computed command or git subcommand (`git $(…)`,
  `… | xargs git`), git where it cannot read it, and the remote tools `gh`,
  `glab`, `hub`, `ssh`, `scp`, `sftp` and `rsync`. This is a command filter,
  not a boundary: a script or program the child writes and runs
  (`bash ./push.sh`, `make push`, a test that shells out) and other network
  tools (`curl`) are not read by it. The boundary is the sandbox the children
  run in and that they hold no credentials for a remote; review and
  spot-checks catch the rest. A card without `package` goes to the start member when its
  kind's placement is `local` (its output is not gated), else it is routed as
  in cloud-first, and so is every `t2` card. Cloud-first ignores `package`.
- *Merges.* `request_merge` merges a node into its parent node's branch, the
  request node into the main branch. `behind`, the size, the red run and the
  review diff are taken against the parent's tip (`behind` tells the node to
  rebase onto its parent's branch). The parent moves by a
  fast-forward in its own worktree (a dirty one refuses `dirty`); only the
  request node's merge into main pushes (`mergeGate.push`) and records the
  main tip. A package node's merge is refused `scope`, naming the path, when it
  changes a file outside its contract's `files` or one matching `forbidden`.
  A node with a started child not merged yet is refused `blocked`, naming the
  open children: partial work never reaches its parent or the main branch.
  While a node has started children that are not merged yet, its branch is
  protected like the main branch: the git guard blocks committing or merging
  into it directly, in the main session and in children.

### Size: tiers, hints and crossings (local-first)

A local-first package is sized in changed lines (local-first plan LF5; the
design: `docs/local-first/design.md` §5.3): added plus deleted lines of the
node's worktree against its base, untracked files counted, the router's
split files (`<plans.dir>/split/**`) never.

- *Tiers.* `localFirst.tiers` gives the budgets `small` (60), `standard`
  (150) and `large` (300); the class `inert` has none. The session's tier is
  `standard` until the E2 factor draws it. An elevated package's budget is
  never above `standard`'s.
- *Budgets at the start.* The main's section and every package brief carry one
  line: `Budgets: package ≤ <b> changed lines; split ≤ <planLines> lines,
  ≤ <maxChildren> children.`
- *Start refusal.* `start_branch` refuses a `code` estimate above the session
  tier's budget; the text names the budget, `maxChildren` and how to split.
  `plan` and `inert` estimates are never refused. A split refuses a `code`
  child above that budget, naming the child and the budget, so a recorded
  package always starts. These two are the only places size blocks.
- *Hints at 80 % and 100 %.* While `hints` is on, the main's active node is
  measured after each write in its worktree and a package child's node on each
  of the child's turns. Each stage fires once per node: `Size: <n>/<b> changed
  lines (80 %). Finish or plan a split.` and `Size: <n>/<b> changed lines
  (100 %). The reviewer is now <reviewer>; consider a split.` The main gets it
  as a `<router-hint size="80|100">` block on its next tool result, a child as
  a message from the router. A hint never blocks, kills or pauses. (The legacy
  local mode keeps its one-stage `over-size` hint.)
- *Crossings.* Each stage writes one `crossing` line: the node, the stage, the
  lines against the budget, the estimate, the tier, the class, the depth, the
  work kind, and when (turn, call, time since the node was first measured). A
  split whose rendered plan is longer than `localFirst.tree.planLines` is
  accepted and logged as a `crossing` of kind `plan`; one with more than
  `maxChildren` children is refused.
- *At the gate.* The local-first `request_merge` never refuses on size: the
  reviewer follows the actual lines. A diff above `large`, or one longer than
  the review's line budget, is an over-cap review: the reviewer reads the
  numstat, the checks' output and the hunks of the riskiest files (risk rules
  first, then the most changed lines) within `localFirst.overCapBytes` (60000)
  bytes in all; the riskiest file is cut when it alone does not fit. Its
  `review` line says `overCap: true`. The legacy gate still refuses `size`.

### Classes and reviewers (local-first)

The local-first merge gate classes the change and picks its reviewer from
the class and the diff's actual size (local-first plan LF6; the design:
`docs/local-first/design.md` §5.4). The legacy gate keeps its Opus budget
and fallback member.

- *Classes.* A change is `inert`, `standard` or `elevated`; a mixed change
  takes its highest file's class. It is `elevated` when a proxy fires: a
  `riskGlobs` match (`risk`), CI or infrastructure (`ci`), the policy file
  itself (`policy-edit`), the gate's own configuration (`.pi/**`,
  `**/task-router*.json`: `gate-config`), a public API (`public-api`), a
  test file with more lines deleted than added (`weakened-tests`), three or
  more code files across two or more components (`coupled`), config files in
  two or more components (`multi-component-config`). It is `inert` only
  when every file matches `inertGlobs` and `mergeGate.extraChecks` holds at
  least one check, all of them passing; agent instructions (`AGENTS.md`,
  `CLAUDE.md`, `.pi/`, `skills/`, `prompts/`) and plans are never inert.
  Everything else is `standard`. Split files (`<plans.dir>/split/**`)
  never count. Any error classes the change `elevated` (`classBy: error`).
- *The policy file.* `localFirst.policyFile` (default
  `.pi/task-router-policy.json`, a repository-relative path) is read at the
  tip of the main branch, never from the branch under review, so a branch
  cannot grade itself; a node merged into its parent reads it there too. It is
  a JSON object with the optional keys `inertGlobs`, `testGlobs`, `ciGlobs`,
  `riskGlobs`, `configGlobs`, `publicApiGlobs` (lists of globs) and
  `componentDepth` (an integer ≥ 1, the directories that name a component);
  a key it omits keeps the settings' value. Without the file the gate uses the
  settings (`mergeGate.inertGlobs`, `riskGlobs`, `plans.publicApiGlobs`,
  built-in test, CI and config globs, `componentDepth` 1). A malformed file,
  an unknown key, a base that does not resolve or a failing git is an error,
  so the change is `elevated`.
- *Reviewers.* The stronger of what the class and the actual tier ask for:
  `inert` merges without a review once its checks passed; `elevated` gets
  Opus plus an orthogonal check, a configured `mergeGate.extraChecks` entry
  (all of them passed) or a red run that failed at the target: without
  either the gate refuses (`check`) before any review. A red run that passed
  there too is no orthogonal check by itself; the reviewer reads its "the
  check may be vacuous" note. A `small` diff gets Sonnet (Haiku, advisory, when
  it holds only tests and inert files); `standard` gets Opus or Sonnet as
  the E3 factor draws it (Opus while E3 is off); `large` and above get Opus.
  `localFirst.reviewers` names the member for each (`haiku`, `sonnet`,
  `opus`, `local`); a chosen reviewer does not spend the Opus budget, and
  its second attempt keeps the member. An advisory verdict never blocks, nor
  does an advisory review that fails (the merge then has no review id).
- *Order.* Cheap refusals come first: a dirty target checkout (`main-dirty`
  for the main branch, `dirty` for a parent node) is refused before any
  check or review.
- *Transient errors.* A review attempt ended by a transient provider error
  (429, 503, an overload, a rate limit) is retried on the same member after
  5 s, then 20 s; when both retries fail too, the review ends there (the last
  retry's line has `fallback: transient`) with the gate's usual
  `review-unavailable`.
- *Lines.* The `review` and `merge` lines carry `class`, `classBy`,
  `tier`, `actualTier` (and `reviewer`, `binding` on a review, `node` on
  a merge); see `docs/outcome-log.md`.

## Local mode

The milestones L1–L7 below, then a reference (switch, settings, tools, session
entries, events, failure modes) after the plans. The local-first design that
builds on it (revision 4, not built): `docs/local-first/design.md`.

**Local mode (milestone L1).** For a main session driven by a local model
(Qwen). The settings key `mode` is `"default"` (the default) or `"local"`;
`localMode.enable` sets it. There is no auto-detection: a Claude main with
`mode = "local"` runs in local mode too. The settings declare the local
components `hints`, `worktrees`, `mergeGate` and `plans`, each with
`enabled = "auto" | "on" | "off"` (default `"auto"`: on in local mode, off in
default mode), the `overseer` that serves them (no switch of its own), and `force` (below); L1 validates them (a bad value is reported and its
default kept); `hints` works since L3, the overseer since L4, `worktrees` since L5, `mergeGate` since L6 and `plans` since L7 (below). The keys, their defaults and
the messages are in `packages/task-router/core/settings.ts` and
`packages/task-router/core/local/settings.ts`. In local mode:

- Importance: the main session's effort is no importance source (a main at
  `xhigh`, the local member's only effort, would make every child `high`); the
  card's `importance`, the parent's importance and `pathRules` still count. The
  routing table, the members and the selection are unchanged, so level-0 work
  goes to the local member at cost 0 and the rest to Claude.
- The prompt section `task_cards` of the main session is the shorter
  `## Local mode` section (`localSection`, `packages/task-router/core/prompt.ts`:
  do most of the work yourself, spawn only for more ability, end the turn after
  a spawn; the card schema and one example). The orchestrator rule is off, even
  when `delegation.rule` is `"on"`. Children still get no section.
- The delegation nudge is off; hints (below) replace it.
- The status line `task-router` reads `local`, or `local (main: <model>)` when
  the main model is no local member's (set at `session_start` and on
  `model_select`), and adds `hint <trip>` after a hint until the next progress.

With `mode = "default"` and every component `"auto"`, the router registers the
same tools and hooks as before plus the `/force` command, the section is
byte-identical, outcome lines carry no new key while no force is active, and
`router-golden` is unchanged (`test/local-default.test.ts` pins the inventory).

**Force override (milestone L2).** The user, never the main model, can fix the
model (and effort) of routed spawns, in either mode:

    /force <model> [effort] [next[:N] | session]
    /force off
    /force

`<model>` is a member name (its `model`) or `provider/id`, resolved through pi's
model registry, so models outside the table and effort `max` are accepted; an
unknown model is refused with the first ten available ones, and the previous
force stays. Without `effort` the routed effort is kept. The scope defaults to
`session`; `next` is one spawn, `next:N` N spawns, then the force expires.
`/force off` clears it, `/force` alone shows it. The command force is kept as a
session entry (`task-router/force`), so a resumed session or a reload finds it.
The settings key `force = { model; thinkingLevel; }` (`model = ""`, the
default, is no force) forces every session; it is resolved once at
`session_start`, and an unknown model is a reported problem with the force
inactive. A command force takes precedence over the settings force while it
lasts. While a force is active, every routed spawn (one with a task card) is
planned as usual, without the spawner's `model` and `thinkingLevel`, then runs
on the forced model: a member through its
slot, as an explicit `model` does, without failover to another member; a
non-member at once, with no slot accounting. A forced spawn its member cannot
take is rejected as an explicit `model` is, but the text names the force and
how to end it instead of "leave `model` unset": ``force <model> (/force):
<cause>; `/force off` clears it`` (with a settings force underneath: ``…
`/force off` clears it, and the settings force <model> (settings `force.model`)
then applies``), or for the settings force ``force <model>
(settings `force.model`): <cause>; an empty `force.model` in the task-router
settings clears it, `/force <model>` overrides it for this session`` (`/force
off` does not end a settings force). Overseer reviews are not forced
(they use `overseer.*`), and with `routing = false` nothing is forced; `/force`
says both. The status line `task-router` shows `force <model> [effort]
[(<N> left)]`, after `local` in local mode. Logs: a `force` outcome line
(`taskId: ""`, `action` `set`, `clear`, `used`, `expired` or `rejected`,
`source` `command` or `settings`, optional `model`, `effort`, `reason`), and a
forced `spawn` carries `forced: true`, `forceSource` and the routed
counterfactual `routedModel`, `routedEffort` (`docs/outcome-log.md`).
The code: `packages/task-router/core/force.ts`, `core/forceinstall.ts` and the
force branch of `core/policy.ts`.

**Hints (milestone L3).** With hints on (`hints.enabled = "auto"` in local
mode, or `"on"` in either mode) the router watches the main session's tool
calls (`tool_call`, `tool_result`, `turn_end`) and keeps a ring of the last
`4 × identicalCalls + 8` calls: the tool, a hash of its input, and for `edit` and
`write` the file's hash before and after. Pure detectors fire these trips (the
`hints` settings, defaults in brackets):

- `identical-call`: the same call `identicalCalls` (3) times with no tree change
  in between;
- `no-change-writes`: the last `noChangeWrites` (4) edits or writes left their
  file unchanged;
- `alternation`: two calls alternate `alternations` (2) times with no tree
  change;
- `repeated-error`: `repeatedErrors` (2) failures in a row of one tool whose
  error texts (lowercased, digits masked) have a character-trigram Jaccard
  similarity ≥ `errorSimilarity` (0.92);
- `churn`: one path written `churnEdits` (3) times within `churnTurns` (4) turns;
- `risky-path`: a write to a path that matches `riskGlobs` or a `critical`
  `pathRules` glob, once per path;
- `context-soft`: the context crosses `contextSoftTokens` (32000) tokens; it
  fires again only after the context has dropped below;
- `context-stall`: the context is at or above `contextPercent` (85) % for
  `stallTurns` (25) turns without a tree change;
- `check-failing` (with a worktree, below): the active branch's check command
  (a bash call whose whitespace-normalised command equals it; a non-zero exit is
  an error result in pi 1.4) failed `checkFailures` (2) times in a row; other
  calls between the runs do not reset the count, a passing run does and is
  progress (counted within the ring: failures that left it are forgotten);
- `over-size` (with a worktree, below): after a successful `edit` or `write`
  inside the active worktree, its diff against the branch's base (committed,
  staged and unstaged changes, plus untracked files: their lines are counted
  through the file system, binary or over 4 MB as 0) has more than the
  branch's size budget: a task branch's, and a branch without a plan's (the
  early split nudge, below its merge gate), `plans.splitLines` (100) changed
  lines (added plus deleted) or `plans.splitFiles` (3) files; a milestone
  branch's `plans.milestoneLines` and `mergeGate.maxDiffFiles`; each never
  above the merge gate's; the hint names that budget. The diff is a git process (5 s; a timeout or a
  failure means no trip), so it runs after the call, one at a time, and the
  hint goes into the next result;
- `outside-worktree`: the write guard (below) blocked a write. It is logged, not
  delivered as a hint (the block's reason is the message).

A tree change (an `edit` or `write` that changed its file's hash) is progress;
a file that cannot be hashed does not count. The tool result of the
call that tripped gets one more text block,
`<router-hint trip="<trip>" n="<count>"><fixed text></router-hint>`; a trip found
at `turn_end` goes into the next result. The same trip then stays quiet for
`cooldownCalls` (5) calls, but every detection counts: the `1 + persistTrips`-th
(third) one without progress carries a fixed escalation instead ("Spawn a
debug-design card for it; the router will route it to Sonnet or above."),
unless the steer overseer (below) takes it.
Children (local mode only): the router sees a routed child's calls, without
results, through the spawn policy's `toolGuard`, composed in front of a
profile's file guard, and checks `identical-call` and `alternation`. The child
gets the hint as a message from `router`; when the trip persists, its parent
gets one notice per trip (`[router] <child> looks stuck (<trip> ×<n>); consider
killing it and respawning with attemptOf`). A hint never blocks a call; a hook
that fails is reported once (`task-router: hint engine: …`) and leaves the
result unchanged. Logs: a `hint` outcome line (`taskId` `"main"` or the child's
name, `trip`, `stage` `hint`, `steer` or `parent`, optional `count` and
`sessionId`; no text). The code: `packages/task-router/core/local/tripwires.ts`
(detectors), `core/local/hints.ts` (texts, cooldown, persistence),
`core/local/install.ts` (the main session), `core/local/childtrips.ts` and
`composeGuards` in `core/toolguard.ts` (children). In the main session, calls
that an extension makes from inside a tool (`ctx.executeTool`, events with `parentToolCallId`)
are not the model's and are skipped.

**Overseer (milestone L4).** The router spawns its own review agents through
the actor's spawn API (`spawnPolicyApi` 2): quiet, spawned by `main`, named
`ovs-<role>-<n>`, with a one-use ticket in the task card instead of a card.
The spawn policy takes the ticket before anything else: the agent runs on
`overseer.member` at `overseer.effort` (`opus`, `high`) with the read-only
`overseer.tools` (`read`, `grep`, `find`, `ls`; `bash`, `edit` or `write` there is
reported, `overseer.tools: <tool> can write; default kept`) plus one submit
tool, and a guard refuses every other tool. Its cwd is the repository's main
checkout (the main session's cwd), never the worktree under review: pi loads
`AGENTS.md` and project settings from the cwd, so the brief names the worktree
by its absolute path instead, and a run with a cwd inside it is refused (LD14).
Ticket spawns are not forced and
not routed, but they count like routed children: each turn of an overseer or
of the fixer counts toward its member's `dailyCap`, and it holds a slot of its
member while pending (60 s) or listed running. The policy refuses a ticket
spawn, without waiting, on a member that is blocked after a provider error
(`<member> is blocked until <time>`), at its `dailyCap`, down or busy by its
health probe (`is down (its health check fails)`, `has no free slot (its
server is busy)`; only a member with `health`) or without a free slot, the
same checks a routed spawn passes (local mode L8; a fixer under a force skips
them, as a forced spawn does): a review attempt then does not start (the
second one runs on the fallback member); with neither member left the merge
review fails closed (`error` `review-unavailable`, the detail names each
member's cause) and the merge is refused, and a fixer does not start
(`revise`). The agent reports through the submit tool only: a verdict
(`summary`, `verdict`, `findings` with id, category, target, criterion,
blocking) checked against its JSON schema and the rules (no code fence, unique
ids, every target in the diff or plan under review); an invalid one goes back with the
reasons, at most `resubmits` (2) times. An agent that goes idle without
submitting is reminded once, then the attempt fails; `timeoutSec` (900) bounds
an attempt, without the time its submissions are checked (a submission made
in time is judged); a failed attempt (timeout, error, invalid) is retried once on
`fallbackMember` at `fallbackEffort` (`sonnet`, `xhigh`), except a steer
review. The agent is killed after each attempt. The router runs an overseer only while
its own spawn policy is registered, and only that policy may take the ticket: an
agent it did not route is killed at once, with a warning, and the attempt is an
`error` that is neither charged nor retried. A ticket no policy took is closed
when its spawn fails. A submitted verdict is kept as a session entry
(`task-router/review`). Budget (per session branch, session entries
`task-router/budget`): each spawn on `overseer.member` counts against `budget`
(15), a steer review also against `steerBudget` (3); with the budget spent a
review runs on the fallback member and a steer review is skipped. A pick of
`overseer.member` holds its unit from the pick on, so reviews running at the
same time cannot overrun the budget. These three counts (`budget`, `steerBudget`,
`resubmits`) and `mergeGate.fixerRounds` may be 0 (Opus never used, no steering,
no resubmits, no fixer); every other count is positive. The status
line adds `opus <n> left` once three or fewer are left. Steer (`hints.steer = "on"`):
when a trip persists (above), the router spawns a steer review instead of the
escalation, with the trip and the last 12 calls (tool, target, result; no file
contents), one at a time, and sends its summary and findings to the main
session as a steer message (`task-router/steer`); without the spawn API or with
the steer budget spent the escalation goes into the result as before, and when
the review fails the escalation is sent as that steer message instead. In local mode without the spawn API the router warns once at
`session_start`: "task-router: local mode needs actor-subagents with
spawnPolicyApi ≥ 2; merges are refused and plans are unavailable". Logs: one
`review` outcome line per attempt (`taskId` the review id, `role`, `member`,
`model`, `outcome` `approve`, `revise`, `invalid`, `timeout` or `error`,
`attempt`, `durationMs`, optional `fallback`, `findings`, `blocking`,
`inconsistent`, `commit`, `branch`; no verdict text), and the agent's `spawn`
line carries `ticket` and opens no verdict slot (`docs/outcome-log.md`).
The code: `packages/task-router/core/local/overseer.ts` (tickets, the run,
the prompts), `core/local/schema.ts`, `core/local/verdict.ts`,
`core/local/steer.ts`.

**Worktrees (milestone L5).** With `worktrees` on (local mode, or `worktrees.enabled
= "on"`) the main session makes its code changes on branches in git worktrees.
The tool `start_branch` takes `slug` (`[a-z0-9-]{1,40}`, without `--`: the worktree
directory joins a plan unit's parts with it), `goal` and `check` (each
at most 300 characters, both required), optionally `repo` (an absolute path in the
repository; default: the session's cwd) and `plan` (a plan unit, below; without
plans `plans are not active`; give a slug or a plan, not both). It validates everything
first (a failure changes nothing), then makes the branch `<worktrees.branchPrefix><slug>` (`lm/`)
at the tip of the first existing branch in `mergeGate.mainBranches` in the worktree
`<worktrees.root>/<branch with / as -->` (`../{repo}.worktrees`; `{repo}` is the repository's
directory name, a relative root resolves against the repository root), and returns
`{branch, worktree, base, check}` as text and as `details` (`base` is the commit
the branch was made at); an error comes back as an error result with git's stderr
tail (a branch that git could not add is not left behind). The same slug again
re-activates the branch (a branch that is `merged`, `fixer` or `blocked` is refused;
one whose worktree disappeared is `abandoned`, and starting it again fails because
the branch exists). The newest started branch whose state is `active` is the
*active worktree*; the section line of the prompt says "Code changes happen on
branches: start_branch, then edit and commit in its worktree (absolute paths)."
While one is active:

- an `edit` or `write` whose resolved path is inside the main checkout (the
  worktree that has a main branch checked out) and in no linked worktree is
  blocked: "write in the worktree <dir>; use absolute paths under it" (bash is not
  parsed); one `hint` line per block (`trip` `outside-worktree`, `count` the blocks
  since the last write that passed). The guard reads facts that `start_branch`
  and `session_start` refresh, and answers at once;
- a card without `cwd` gets the worktree as its `cwd`, and the child session
  starts there (`PolicyResult.cwd`); a card's own `cwd` is the child's directory
  too (local mode only: default mode leaves both as they were), the verify gate
  runs the check there, and a `read-only+files` child's relative paths resolve
  under it;
- the steer overseer (above) gets the branch's goal and check and the focal diff
  (at most 80 lines, then `… <n> more lines`; untracked files as `untracked file
  <path> (<n> lines)`) after the call lines, reads the worktree by its absolute path
  (its own cwd stays the main checkout, LD14), and its findings must name a path a
  record wrote or the diff changed.

Branches are session entries (`task-router/branch`, one per change) and are rebuilt
at `session_start`, where a branch whose worktree is no longer registered or is
prunable becomes `abandoned` (one entry; `start_branch` waits for this).
`cleanupBranch` (`git worktree remove`, then `git branch -d`) is what a merge calls;
a failure is the hint `cleanup failed: <git's tail>` and changes nothing else. Git
runs through `packages/task-router/core/local/git.ts` (an argv runner with a
process-group timeout, and the port); the tests run real git in temporary
repositories (`git` is a `nativeCheckInputs` of the package). The code:
`core/local/worktree.ts` (names, `startBranch`, the guard, cleanup),
`core/local/branches.ts` (the store), `core/local/branchtool.ts` (the tool).

**Merge gate (milestone L6).** With `mergeGate` on (local mode, or
`mergeGate.enabled = "on"`) a branch reaches a main branch (the first of
`mergeGate.mainBranches` that exists, `main`, `master`) only through the tool
`request_merge`, registered for the main session. It takes `branch` (default:
the active worktree's branch) and `summary` (at most 500 characters, for the
reviewer) and answers with the text `status: <status> (<reason>)`, the detail
and one line per finding, plus `details` `{status, reason?, detail, commit?,
reviewId?, findings?, pushed?}`; only `status: "error"` and invalid input are
error results. The section line of the prompt names it ("…, then
request_merge. You cannot merge, push or commit to a main branch; the router
blocks it."). The pipeline runs the cheap and deterministic steps first and
Opus last (`packages/task-router/core/local/merge.ts`):

1. resolve the repository, the branch, its worktree, the main branch and
   `commit` (the worktree's `HEAD`);
2. refuse: `main-branch` (the branch is a main branch), `abandoned`, `blocked`,
   `fixer-running`, `dirty` (the worktree has uncommitted changes), `behind`
   (main is not an ancestor: rebase onto it in the worktree); `no-worktree`
   when no branch is given and none is active, or the branch has no worktree;
3. size: the diff `main...commit` over `maxDiffLines` (150) changed lines or
   `maxDiffFiles` (6) files is refused with `size` ("split the branch"), no
   review;
4. checks: the branch's check, then `extraChecks` (`[]`), in the worktree
   (`checkTimeoutSec`); the first failure is refused with `check` and the
   output's tail (40 lines, 4 kB);
5. red run (`redRun`, on): the branch's check at the base in a detached
   temporary worktree (removed afterwards); a check that passes there is
   marked for the reviewer ("passed — the check may be vacuous"), it refuses
   nothing;
6. approval reuse: an approval (`task-router/approval`) holds for exactly
   `(repo, branch, commit, tree)`; a new commit needs a new review;
7. review: the `merge` overseer (above) in the main checkout, the worktree by
   its absolute path; its input is the goal, the summary, the check runs, the
   red run, risky paths and the numstat and the whole diff. A file name with a
   control character, a double quote or a backslash is shown C-quoted, as git
   quotes it (it cannot forge a line of the input); the scope check reads the
   raw paths. The diff is never
   cut: its budget is 8 × (`maxDiffLines` + `maxDiffFiles`) lines, enough for
   any diff the size step lets through with git's 3 context lines; a longer
   one, or none while the numstat shows changes, fails the review closed
   (`error`). An overseer that cannot run (no spawn API, both attempts failed) is
   `error` `review-unavailable`; an abort of the tool call (Esc) kills it and any running check or red run, `error`
   `aborted`. A rejection counts (`rejections`) and answers `revise` with the
   findings;
8. merge, fast-forward only: when the main branch is checked out in a
   worktree, `git merge --ff-only` there (that checkout must be clean, else
   `main-dirty`), otherwise `git update-ref` with the old value; a `HEAD` that
   moved since the approval is reviewed again once. With `push` (off), `git
   push <remote> <main>` (`origin`; a failed push is reported in the detail,
   the merge stands). Then the main tip is recorded (`task-router/main-ref`),
   the branch becomes `merged` and, with `worktrees.removeAfterMerge`, its
   worktree and branch are removed. Git failures are `error` `git`.

The refusal codes are `main-branch`, `dirty`, `behind`, `fixer-running`,
`abandoned`, `blocked`, `size`, `scope`, `check`, `main-dirty`,
`plan-changed`, `no-worktree`, `review-unavailable`, `aborted` and `git`
(`scope` and `plan-changed` belong to plans, below).

Fixer: at `rejectionsBeforeFixer` (2) rejections the router spawns a fixer
itself (a ticket, `fixerMember` at `fixerEffort`: `sonnet`, `high`; under a
force, the forced model) in the worktree, with the blocking findings as its
acceptance and the git guard composed in; the branch is `fixer`, main-session
writes into it are blocked and `request_merge` answers `fixer-running` until
the fixer reports to main (the router then kills it) or dies. A fixer round
rejected again with `fixerRounds` (1) used up makes the branch `blocked`:
abandon it and start a smaller one. `fixerRounds: 0` spawns no fixer (every
rejection answers `revise`).

Git guard: a `bash` or `powershell` call of the main session, of a routed
child or of the fixer that would write a main branch is blocked with "merging
into <main> goes through request_merge": `push` to a main branch (refspec,
`--all`, `--mirror`, `--delete`, or no refspec on a main branch), `merge`,
`pull`, `rebase`, `cherry-pick`, `revert`, `am`, `commit` or `reset` on a
main branch, `branch -f|-M|-m|-D|-d <main>`, `checkout -B`, `switch -C`,
`update-ref refs/heads/<main>`, and `filter-branch`. The classifier
(`core/local/gitcmd.ts`) splits the command (operators, `$(…)`, `bash -c`),
follows a literal `cd` and `git -C`, and asks git for the directory's branch
(2 s). A current-branch subcommand in a directory it cannot tell is blocked
("cannot tell the branch; run git with a literal -C <worktree>"); a command it
cannot parse is blocked only when it contains `git` ("router could not
classify this git command; split it"); everything else, git on other branches
included, passes.

Bypass detection: after every main-session `bash` result and every child's
turn the router reads the main tip of each known repository (the session
cwd's and every one with a branch record) and compares it with the recorded
one; the first sight of a repository is recorded silently. A tip that moved
outside the gate gives a `gatebypass` line, the warning `task-router: main
moved outside the gate (<repo> <main> <from>→<to>)` and a new record at once,
and a `<router-hint trip="gatebypass">` block in the next main tool result.
Nothing is reverted, and `user_bash` is not watched (the wording is neutral:
the router cannot tell who moved it).

Logs: one `merge` line per `request_merge` call (`taskId` the branch, `""` when none is known or the argument is no branch name,
`outcome` `merged`, `refused`, `revise`, `fixer` or `failed` (status
`error`), optional `reason` (the code), `commit`, `nLines`, `nFiles`,
`reviewId`, `pushed`) and the `gatebypass` line (`taskId` the main branch,
`from`, `to`, optional `repo`: the directory name), no free text
(`docs/outcome-log.md`). The code: `core/local/merge.ts` (the
pipeline, approvals, the fixer's brief, bypass detection, the tool),
`core/local/gitcmd.ts` and `core/local/childguards.ts` (the guard),
`core/local/install.ts` (the wiring).

**Plans (milestone L7).** With `plans` on (local mode, or `plans.enabled =
"on"`) a request that needs more than one branch is planned first. Plans need
`worktrees` and `mergeGate`: `"on"` without both is reported (`plans: needs
worktrees and mergeGate; off`) and switched off, `"auto"` stays inactive. The
main session gets two tools, `plan_request` and `amend_plan`, and the section
line "A request that needs more than one branch starts with plan_request.
Follow the plan file, tick only your task's checkbox, and change the plan only
with amend_plan." Both answer like `request_merge` (`status: <status>
(<reason>)`, the detail, one line per finding, and the result as `details`);
only `status: "error"` and invalid input are error results.

`plan_request` takes `slug` (`[a-z0-9-]{1,40}`), `request` (a digest of the
user's request, at most 2000 characters), `acceptance` (1–10 lines), `files`
(1–20 paths) and `symbols` (at most 40), for the repository of the session's
cwd (`packages/task-router/core/local/planflow.ts`):

1. ground: every file must exist and every symbol must occur as a word in one
   of them (`git grep -w`); the slug must be new (no plan record, no file
   `<plans.dir>/<slug>.md`, `docs/plans`); the main checkout must be clean.
   Failures are `refused` (`grounding`, listing every miss, `slug`,
   `main-dirty`), before any agent runs;
2. author: the `plan-author` overseer (above) gets the request, the acceptance,
   the grounding, the first 400 paths of `git ls-files` and the limits, and
   submits a skeleton through `submit_plan`: invariants and milestones (`M<n>`,
   goal, acceptance, `branch` `task` or `milestone`, `dependsOn`, at most
   `milestoneTasks` (5) tasks), each task (`M<n>.T<m>`) with goal, `files`,
   `create`, `forbidden`, `check` and `dependsOn`. The router validates it
   (JSON schema, unique ids, dependencies on earlier ids and no cycle, files
   that exist, `create` paths that do not but whose directory does, none of
   them under `plans.dir` (a plan file changes only through `amend_plan`), at most
   `splitFiles` (3) paths per task and `maxDiffFiles` (6) per milestone
   branch, never above the merge gate's files, a non-empty check; the author
   is told these and the lines a branch merges, the same budgets the merge
   enforces) and runs each task's
   check at the main tip in a detached temporary worktree: a check that
   cannot run (exit 126 or 127), that the git guard (above) blocks (it is not
   run), or that passes there (vacuous) goes back as a `check` finding; a
   worktree git cannot make fails the plan with `git` (as in `amend_plan`;
   never a pass). Each check has its own `checkTimeoutSec` (900 s); one
   round's red runs together have `plans.redRunSec` (3600 s): a check cut
   short by it, or not started, is a `check` finding as well. The author is
   told both.
   Rejections count against `plans.rounds` (2), per overseer
   attempt (the fallback author starts afresh); after them a
   skeleton that is still invalid is `refused` `invalid`, a check that still
   cannot run `broken-check`, and a vacuous one is accepted with
   `vacuousCheck: true` (the merge reviewer is told);
3. commit: the plan file `<plans.dir>/<slug>.md` (a heading, the request, the
   invariants, per milestone its tasks as checkboxes `- [ ] M1.T1: <goal>`
   with files, forbidden, check and dependencies, then the canonical skeleton
   as JSON in a `<details>` block) is committed onto the main tip with git
   plumbing (`plan(<slug>): approved <reviewId>`, a temporary index; the main
   checkout's index is not touched) and the main branch advanced as a merge
   does (fast-forward in the main checkout, else `update-ref`; `push`; the
   main tip recorded, so no `gatebypass`). The plan record
   (`task-router/plan`: slug, repository, file, skeleton hash, the approving
   review, the triggers) is kept as a session entry;
4. answer: `approved` with the path and the first unit that can start, as
   `start_branch {"plan": {"slug": "<slug>", "id": "M1.T1"}}`.

`start_branch` with `plan: {slug, id}` (instead of `slug`, `goal` and `check`)
starts a plan unit: a task of a milestone whose `branch` is `task`, or a whole
milestone whose `branch` is `milestone`. It refuses a plan that has no record in
the repository, a plan file that is not on the main branch or whose skeleton
(on the main tip or in the main checkout) no longer has the approved hash, an
unknown id, the wrong unit kind, a unit merged already and one whose
dependencies are not merged (`<id> depends on <a>, not merged yet`). The branch
is `lm/<slug>/<id>`, its goal and check come from the plan (a milestone's checks
joined with `&&`), and the result adds `files`: the task's whitelist (`files`
and `create`).

Plan-bound branches have guards and their own merge rules:

- plan guard: an `edit` or `write` of a plan file (in the main checkout or any
  of the repository's worktrees), by the main session, a routed child or the
  fixer, passes only when it changes nothing but checkboxes from `- [ ]` to
  `- [x]`; else it is blocked with "change the plan with amend_plan";
- whitelist guard: a write inside a plan-bound worktree to a path outside its
  task's `files` and `create` (and the plan file) is blocked with "<path> is
  outside the task's files; finish within them or call amend_plan (trigger
  <id> is open)" and opens a `non-whitelisted` trigger;
- turns: a main-session turn with a call whose path is in the active
  plan-bound worktree (or a bash command that names it) counts; more than
  `taskTurns` (12) open `over-budget` once (counted per session, not kept
  across a reload; once that trigger is closed the branch counts afresh);
- `request_merge`: the plan file at the branch's commit must still hold the
  approved skeleton (`plan-changed`); the size leaves out tick-only plan
  lines and is bounded by `splitLines` (100) and `splitFiles` (3) for a task
  branch, `milestoneLines` (250) for a milestone branch, never above the
  gate's own limits (`size`, opens `over-budget`); a changed file outside
  the whitelist, or a plan change that is not a tick of the branch's own
  tasks, is `scope` (opens `non-whitelisted`); then the unit's checks,
  `extraChecks` and, with `regression` `milestone` (the default) or `plan`,
  the checks of the merged tasks of the milestone or the plan (a failure
  there is `check` and opens `regression`; `off` runs none). Every check
  from the plan passes the git guard first, as the branch check does. There
  is no red run (the reviewer reads `passed` for a check the author left
  vacuous, else `failed`), and the reviewer gets the unit's goal and the
  invariants plus the tasks' `forbidden`. A fixer round rejected again
  blocks the branch, opens `remediation-failed` and says "restructure the
  task with amend_plan". A branch without a plan that changes an approved
  plan's file is refused `plan-changed`.

Triggers (`non-whitelisted`, `interface-break`, `regression`, `over-budget`,
`remediation-failed`) are kept in the plan record with ids `t1`, `t2`, …; the
same open trigger for the same task is not opened twice. `amend_plan` takes
`slug`, `trigger` (`{id}` of an open trigger, or `{id: "new", kind:
"interface-break", evidenceCommand}`), `changes` (1–8 of `add` a task after
`after` or as a new milestone, `replace` the task `id`, `remove` a task or
milestone) and `reason`. It refuses: no plan record (`no-plan`), a plan file
on the main tip that does not hold the approved skeleton (`plan-changed`), a
dirty main checkout (`main-dirty`, before any check or review runs), no
open trigger ("no replan trigger is open; finish the task as planned") or an
unknown one (`trigger`), a new trigger whose evidence command the git guard blocks, that exits 0,
cannot run (126, 127) or times out
in the active worktree or else the main checkout (`evidence`; one that fails otherwise opens the `interface-break`
trigger), a change to a checked task (ticked on main or merged: `checked`),
an amended skeleton that is invalid (`invalid`) and amended checks that
cannot run or that the git guard blocks (`broken-check`). Then a review: the whole plan (`plan-review`) for
an `interface-break`, a changed task with a path in `publicApiGlobs` (`[]`),
or a milestone added or removed; else the `delta` review (the trigger and its
evidence, the old and the proposed tasks, the dependants). An amended check
that exits 0 on the main tip is marked `vacuousCheck`; both reviews get a
"Vacuous checks:" line and the answer names it. Approved: the plan
file is rendered again, keeping the ticks of unchanged tasks, committed
(`plan(<slug>): amended <reviewId>`) and main advanced as above, the record
gets the new hash, the trigger is closed and live branches of changed tasks
take their new goal, check and whitelist. A `blocked` branch whose unit the
amendment changed, or whose `remediation-failed` trigger it answers, starts
over (`active`, its counts at 0; the answer names the `start_branch` that
resumes it; the reviewer is told "Approving unblocks <branch>"); one whose unit
it removed is `abandoned`. Until then
`start_branch` of the blocked unit names `amend_plan` and the open trigger.
Rejected: `rejected` with the
findings; after `rounds` rejections for one trigger the plan author rewrites
the trigger's milestone (only it; checked tasks unchanged), and the rewrite
is applied without review.

Known limit: a plan's record (`task-router/plan`), like a branch record,
lives only in the session that made it; nothing rebuilds it from the plan
file on main. In another session `start_branch {plan}` and `amend_plan`
answer "no approved plan <slug> … in this session: <file> on main was
approved in another session (plan records stay in the session that made
them); continue the plan there, or plan_request a new slug", and
`plan_request` refuses the slug the same way. Adopting the file at
`session_start` would trust any parseable plan file on main as approved and
still lack the merged units, which the branch records hold.

Logs: one `plan` line per plan event (`taskId` the slug, `action` `skeleton`
(an authored skeleton), `approve`, `trigger` (a new trigger), `amend` or
`reject`, optional `trigger` (the kind), `nTasks`, `reviewId`, `full`), no
free text (`docs/outcome-log.md`). The code: `core/local/plan.ts`
(the skeleton, its schema and rules, the file's rendering and parsing, the
tick rule), `core/local/plans.ts` (the store), `core/local/planflow.ts`
(`plan_request`, `amend_plan`), `core/local/plantools.ts` (the tools),
`core/local/planguard.ts` (the guards), plan-bound parts of
`core/local/worktree.ts` and `core/local/merge.ts`.

**Reference (milestone L8).** What the paragraphs above introduce, in one
place.

*Switch and components.* `mode` (`"default"` or `"local"`) switches local mode;
`localMode.enable` sets it. `hints`, `worktrees`, `mergeGate` and `plans` each
have `enabled` (`"auto"`: on in local mode only; `"on"`; `"off"`). The overseer
has no switch: it serves what needs it (steer reviews, the merge review, the
fixer, the plans). `force` works in both modes. The *active set* (`activeSet`,
`packages/task-router/core/local/mode.ts`) decides the tools and the section
lines: `worktrees` and `mergeGate` by their switches (the merge gate does not
need worktrees), `plans` only while both are active too.

| Active | Tools | Line of the `## Local mode` section |
|---|---|---|
| `worktrees` and `mergeGate` | `start_branch`, `request_merge` | "Code changes happen on branches: start_branch, then edit and commit in its worktree (absolute paths), then request_merge. You cannot merge, push or commit to a main branch; the router blocks it." |
| `worktrees` only | `start_branch` | "Code changes happen on branches: start_branch, then edit and commit in its worktree (absolute paths)." |
| `mergeGate` only | `request_merge` | "Merge into a main branch only with request_merge. You cannot merge, push or commit to a main branch; the router blocks it." |
| `plans` | `plan_request`, `amend_plan` | "A request that needs more than one branch starts with plan_request. Follow the plan file, tick only your task's checkbox, and change the plan only with amend_plan." (after the branch line) |

`/force` is registered in both modes, `task_verdict` as before; the overseer's
submit tools (`submit_verdict`, `submit_plan`) are child tools of its agents
only.

*Settings* (`<agentDir>/task-router/settings.json`, design §3.0.1; the
defaults are `defaults()` in `packages/task-router/core/settings.ts`, the rules
`packages/task-router/core/local/settings.ts`). A bad value is reported once at
`session_start` as `<path>: <why>; default kept`. Counts are positive integers,
but `overseer.budget`, `overseer.steerBudget`, `overseer.resubmits` and
`mergeGate.fixerRounds` may be 0; member references and their efforts are
checked only while a local component can run.

| Key | Default | Unit, values | Effect |
|---|---|---|---|
| `mode` | `"default"` | `"default"`, `"local"` | local mode (L1) |
| `hints.enabled` | `"auto"` | `"auto"`, `"on"`, `"off"` | the hint engine (L3) |
| `hints.identicalCalls` | 3 | calls | `identical-call` |
| `hints.noChangeWrites` | 4 | writes | `no-change-writes` |
| `hints.alternations` | 2 | alternations | `alternation` |
| `hints.repeatedErrors` | 2 | failures in a row | `repeated-error` |
| `hints.errorSimilarity` | 0.92 | trigram Jaccard, (0, 1] | `repeated-error` |
| `hints.churnEdits` | 3 | writes of one path | `churn` |
| `hints.churnTurns` | 4 | turns | `churn` |
| `hints.checkFailures` | 2 | failed check runs in a row | `check-failing` |
| `hints.contextPercent` | 85 | % of the context window, (0, 100] | `context-stall` |
| `hints.stallTurns` | 25 | turns | `context-stall` |
| `hints.contextSoftTokens` | 32000 | tokens | `context-soft` |
| `hints.cooldownCalls` | 5 | calls | quiet time of one trip |
| `hints.persistTrips` | 2 | detections after the first | escalation or steer review |
| `hints.steer` | `"on"` | `"on"`, `"off"` | steer reviews instead of the escalation |
| `overseer.member` | `"opus"` | an enabled member | the reviews' member |
| `overseer.effort` | `"high"` | an effort of that member | |
| `overseer.fallbackMember` | `"sonnet"` | an enabled member | a failed or over-budget attempt |
| `overseer.fallbackEffort` | `"xhigh"` | an effort of that member | |
| `overseer.budget` | 15 | spawns on `overseer.member` per session branch, ≥ 0 | then the fallback member |
| `overseer.steerBudget` | 3 | steer reviews per session branch, ≥ 0 | then the escalation |
| `overseer.timeoutSec` | 900 | seconds per attempt | |
| `overseer.resubmits` | 2 | invalid submissions sent back, ≥ 0 | |
| `overseer.tools` | `["read", "grep", "find", "ls"]` | pi tools, none of `bash`, `edit`, `write` | plus the submit tool |
| `worktrees.enabled` | `"auto"` | `"auto"`, `"on"`, `"off"` | `start_branch` (L5) |
| `worktrees.root` | `"../{repo}.worktrees"` | path; `{repo}` = the repository's directory name, relative to the repository root | where worktrees go |
| `worktrees.branchPrefix` | `"lm/"` | string | branch names |
| `worktrees.removeAfterMerge` | `true` | bool | cleanup after a merge |
| `mergeGate.enabled` | `"auto"` | `"auto"`, `"on"`, `"off"` | `request_merge`, the git guard (L6) |
| `mergeGate.mainBranches` | `["main", "master"]` | branch names, non-empty | the first that exists is main |
| `mergeGate.maxDiffLines` | 150 | changed lines | `size` |
| `mergeGate.maxDiffFiles` | 6 | files | `size` |
| `mergeGate.extraChecks` | `[]` | commands | run after the branch check |
| `mergeGate.redRun` | `true` | bool | the check at the base |
| `mergeGate.rejectionsBeforeFixer` | 2 | rejections | the fixer starts |
| `mergeGate.fixerMember` | `"sonnet"` | an enabled member | |
| `mergeGate.fixerEffort` | `"high"` | an effort of that member | |
| `mergeGate.fixerRounds` | 1 | fixer rounds, ≥ 0 (0: no fixer) | then `blocked` |
| `mergeGate.push` | `false` | bool | push main after a merge |
| `mergeGate.remote` | `"origin"` | remote name | |
| `plans.enabled` | `"auto"` | `"auto"`, `"on"`, `"off"` | `plan_request`, `amend_plan` (L7; needs both above) |
| `plans.dir` | `"docs/plans"` | path relative to the repository root | plan files |
| `plans.taskFiles` | 2 | files | the plan author's target per task |
| `plans.taskLines` | 60 | changed lines | the plan author's target per task |
| `plans.splitFiles` | 3 | files | `over-size` trip (task branches and branches without a plan), paths per task, a task branch's merge |
| `plans.splitLines` | 100 | changed lines | `over-size` trip (task branches and branches without a plan), a task branch's merge |
| `plans.milestoneTasks` | 5 | tasks | per milestone |
| `plans.milestoneLines` | 250 | changed lines | a milestone branch's merge |
| `plans.taskTurns` | 12 | main-session turns | `over-budget` |
| `plans.rounds` | 2 | rejections | author rounds; amendments per trigger before the rewrite |
| `plans.redRunSec` | 3600 | seconds | the cap of one round's red runs together (each check has `checkTimeoutSec`) |
| `plans.regression` | `"milestone"` | `"milestone"`, `"plan"`, `"off"` | checks of merged tasks at a merge |
| `plans.publicApiGlobs` | `[]` | globs | a change there needs the whole-plan review |
| `force.model` | `""` | a member or `provider/id`; `""` = no force | the settings force (L2) |
| `force.thinkingLevel` | `""` | `""` or an effort | |

The router's shared `checkTimeoutSec` (900, seconds) bounds each check the
merge gate and the plans run, and `riskGlobs` marks risky paths for the
`risky-path` trip and the merge reviewer.

*Session entries* (`pi.appendEntry`, rebuilt at `session_start` from the
session branch; never in the model's context):

| customType | data |
|---|---|
| `task-router/force` | `{model, thinkingLevel?, scope: "session" \| "next", remaining?, source: "command"}` or `{cleared: true}` |
| `task-router/budget` | `{opusUsed, steerUsed}`, one per change |
| `task-router/review` | `{reviewId, role, member, commit?, verdict, approved?, ts}`, one per submitted verdict or skeleton |
| `task-router/branch` | `{repo, branch, worktree, base, state, rejections, fixerRuns, fixer?, goal?, check?, plan?: {slug, id}, files?, handmade?}`, one per change (`keep: true` on an update in place); `state` `active`, `merged`, `abandoned`, `fixer` or `blocked` |
| `task-router/approval` | `{repo, branch, commit, tree, reviewId}` |
| `task-router/main-ref` | `{repo, branch, sha}`, the last main tip the router knows |
| `task-router/plan` | `{slug, repo, file, skeletonHash, approvedBy, triggers: [{id, kind, task?, open, rejected?}]}` |
| `task-router/arms` | `{v: 1, sessionId, experiments: {seed, cloudOnlyShare, factors: {<id>: {enabled, levels, weights}}}, routerVersion, arms: {<id>: level}}`, once per main session, in default mode too (Experiments, below); `arms` holds the session's draws of its enabled factors, E0 aside (E0's is on the `session` line) |

A steer review's result reaches the main session as a displayed message of
type `task-router/steer`.

*Events* (the outcome log, text-free; `docs/outcome-log.md` has the
keys and one example line each): `force`, `hint`, `review`, `merge`,
`gatebypass` and `plan`; a forced `spawn` adds `forced`, `forceSource`,
`routedModel` and `routedEffort`, a ticket `spawn` adds `ticket` and opens no
verdict slot.

*Result codes* (`status: <status> (<reason>)`; only `error` is an error result):

| Tool | Status | Reasons |
|---|---|---|
| `request_merge` | `merged`, `refused`, `revise`, `fixer`, `error` | `main-branch`, `dirty`, `behind`, `fixer-running`, `abandoned`, `blocked`, `size`, `scope`, `check`, `main-dirty`, `plan-changed`, `no-worktree`, `review-unavailable`, `aborted`, `git` |
| `plan_request` | `approved`, `refused`, `error` | `grounding`, `slug`, `main-dirty`, `invalid`, `broken-check`, `author-unavailable`, `aborted`, `git` |
| `amend_plan` | `approved`, `rejected`, `refused`, `error` | `no-plan`, `plan-changed`, `trigger`, `evidence`, `checked`, `invalid`, `broken-check`, `main-dirty`, `review-unavailable`, `author-unavailable`, `aborted`, `git` |

*Failure modes.*

| Situation | What happens |
|---|---|
| a setting is invalid | reported once at `session_start` (`<path>: <why>; default kept`); `plans = "on"` without both `worktrees` and `mergeGate` is `plans: needs worktrees and mergeGate; off` |
| `force.model` cannot be resolved | reported at `session_start`; the settings force stays inactive |
| a forced spawn cannot run | rejected; the text names the force and how to end it (above) |
| an explicit `model` naming a local member, or a card whose level only a local member reaches, in an E0 cloud-only session | rejected with the cause: `model <m> is not available: cloud-only session (E0): local members are off`, or `no enabled member reaches <ability> level <n> (cloud-only session (E0): local members are off)`; not the settings' "not an enabled member" or "blank or missing" (a force is not refused: it is the owner's override) |
| no spawn API (`spawnPolicyApi` < 2) in local mode | one warning at `session_start` ("task-router: local mode needs actor-subagents with spawnPolicyApi ≥ 2; merges are refused and plans are unavailable"); `request_merge` fails closed (`review-unavailable`), `plan_request` answers `author-unavailable`, steer falls back to the escalation; the git guard still blocks |
| an overseer's member and its fallback are blocked, capped, down or full | the review does not run: `request_merge` and `amend_plan` answer `error` `review-unavailable`, `plan_request` `author-unavailable` (the detail names each cause); a fixer does not start (`revise`) |
| an agent the router's policy did not place takes a ticket | killed with a warning; the attempt is an `error`, neither charged nor retried |
| a branch's worktree is gone | the branch becomes `abandoned` at `session_start` |
| a plan made in another session | its record is not here (known limit): `start_branch {plan}` and `amend_plan` refuse with "… was approved in another session …; continue the plan there, or plan_request a new slug", `plan_request` refuses its slug |
| git cannot make a red run's worktree | `plan_request` and `amend_plan` answer `error` `git` ("git failed: the red run of <id> has no worktree: …"); the check never counts as passed |
| a fixer did not survive a restart | its branch is `active` again ("the fixer … of … did not survive the restart"); a restored fixer is killed ("killed the restored fixer …: a restored agent runs without the router's git guard") |
| the actor restores routed children after a restart | in local mode, with routing and the router's policy on, the main session kills each child its policy did not place this session, at `session_start` or when the actor announces it, with the warning "task-router: killed the restored subagent(s) …: the actor restores a routed child without the router's tool guard and cwd; branches and worktrees stay"; not at a reload (its children kept their guards; a child still being spawned then is kept too), never in a child session (its copy cannot register a policy while main's is: the actor accepts one), and default mode keeps them (L8) |
| main moved outside the gate | `gatebypass` line, a warning and a `<router-hint trip="gatebypass">`; nothing is reverted |
| a hook of the hint engine fails | reported once (`task-router: hint engine: …`); the tool result is unchanged |

## Experiments (the router's randomizer)

The router randomizes its own levers and reads no experiments package
(since 2026-11-26, local-first plan LF1; before, pi-economics' experiments arm
could set `routing`, `verifyGate`, `autoEscalate`, `freshOnCold` and
`delegationRule`, logged as `spawn.arm`; outcome log v2 retired both,
`docs/outcome-log.md`). Its keys in `settings.json`:

| Key | Default | Unit, values | Effect |
|---|---|---|---|
| `experiments.seed` | `"task-router"` | string | the draws' seed |
| `experiments.cloudOnlyShare` | 0.1 | share of cloud-first sessions, [0, 1] | E0's cloud-only arm; 0 turns E0 off |
| `experiments.factors.<id>` | none: every factor off | `{enabled?: boolean, weights?: number[]}` | switches a factor of the registry on and weights its levels |

**Factors.** The registry `FACTORS` (`packages/task-router/core/strategy/arms.ts`)
fixes each factor's id, its unit (what one draw is for: a session, a review,
a package child, a request, a node, a package, a ladder entry), its levels
(the first is the default) and `from`, the first release whose mechanism runs
it. Every factor ships off, in every release: no release turns one on in
code. The owner turns a factor on in settings once E0 and E1 have data
(at least two weeks of E0), for example
`"experiments": {"factors": {"E2": {"enabled": true, "weights": [2, 1, 1]}}}`;
without `weights` the levels are drawn with equal weights, and one-hot
weights (`[0, 1, 0]`) conclude a factor at a level. Settings never invent
levels. Each of these is a problem at `session_start` and keeps the default:
an unknown id; E0 (it runs by `cloudOnlyShare`); a value that is no object;
`enabled` that is no boolean; `weights` that are not one non-negative number
per level, or all 0; an unknown key; and `enabled` before the factor's
release (`experiments.factors.E2 is available from 0.4.0`; the factor stays
off). Until local-first (later releases) no factor has a mechanism.

**The draw** (D61). A unit's level of a factor is
`pick(levels, weights, u)` with `u` the first 53 bits of
`sha256(seed ‖ 0 ‖ id ‖ 0 ‖ unit)` over 2^53
(`packages/task-router/core/strategy/draw.ts`): the same seed, factor and
unit always give the same level, and two factors drawn for one unit are
independent. A factor that is off gives its first level and no arm.

**The snapshot.** At the first `session_start` of a main session the router
stores the effective experiments settings in the session entry
`task-router/arms`: the seed, `cloudOnlyShare`, and for every factor of the
registry its effective `enabled`, its `levels` (the level order the session
took, the first its default) and its `weights` (code defaults included),
with the router's version and the session's own draws. Every later draw of
the session reads it, so a resume, a reload, a settings edit or an upgrade
that changes a default, or moves a factor's first level, never changes an arm
of a running session: the weights are positional, so a draw needs the levels
they were stored with. A restore checks the whole shape (a malformed entry is
no snapshot, and the session takes a new one). E0 is not in `arms`: the shell
draws E0 only in an eligible session (D93: a child, an empty id, routing off
or no cloud member draws none), after the snapshot is written, so E0's arm is
the `session` line's `arms`. A child session, a session without an id and
legacy local mode take none (they draw nothing).

**Arms on lines.** A local-first session (later releases) will carry `arms`,
the sorted `id=level` of its enabled factors, on every outcome line; a
cloud-first session carries `arms` on its `session` line only, and only
E0's (`["E0=as-used"]` or `["E0=cloud-only"]`) while E0 is drawn
(`docs/outcome-log.md`).

**E0, the cloud-only reference.** At a cloud-first `session_start`, while
the snapshot's `cloudOnlyShare` is above 0, the router draws the session's
arm through the registry from the seed and the session id: `cloud-only`
with probability `cloudOnlyShare`, else `as-used`. The share defaults to 0.1
from the first release, so a default install writes a `session` line per
session and routes one session in ten to cloud members only; set
`"experiments": {"cloudOnlyShare": 0}` to turn E0 off for new sessions (no
draw, no `session` line, routing as before). A session resumed from before
keeps the share of its snapshot ("The snapshot"): it stays cloud-only or
as-used, and keeps writing its `session` line, whatever the settings say. In a `cloud-only` session
the router routes no spawn to a `route: "local"` member: the plan, the
selection and the failover see those members as blank (`model = ""`). A
force is the owner's override and keeps its member (`/force` or the settings
force may name a local one: its `spawn` line has `forced: true`, and an
analysis of E0 leaves forced spawns out). An explicit `model` that names a
local member is refused ("cloud-only session (E0): local members are off"),
and so is a card whose level only a local member reaches. An `as-used`
session routes as before. Either way the session writes a `session` line
(`localMembers` `"off"` or `"on"`, `arms` `["E0=cloud-only"]` or
`["E0=as-used"]`); with the share at 0 nothing is drawn and no `session`
line is written.

A session is in E0 only when it is a main session with an id, routing is on
(`routing`, and the actor's spawn-policy API is there) and the member table
has at least one enabled cloud member (a `route` other than `local`; a
table of local members only has no cloud-only arm). Any other session draws
nothing and writes its `session` line without `localMembers` and `arms`; a child
session that loads the router writes none. Local mode is not part of E0: it
writes its `session` line with `profile: "local-mode"` and never draws.

## Scout gate, dependencies and checks

**Scout gate (Group 6, 2026-10-28).** Haiku at medium scored 0.646 against
Sonnet high's 0.917 (threshold 0.825, H6.4; two runs per task and arm), so
`lookup` keeps its floor: `profiles.lookup.minLevel` stays 2
(`packages/task-router/core/settings.ts`), and `scout` and `review` stay at read 2.
The Qwen arm did not run, which cannot change the outcome. Beyond the gate,
Haiku at xhigh scored 0.917 (about 0.3x Sonnet high's list cost, 3.4x its wall
time); using it needs a member of its own and is a host decision. Caveats: six
tasks, two judges with κ 0.29. Scores and the record: the router plan
`router-g3-g7`, Execution Record, Group 6 (kept with the author's system
configuration).

Hard dependency: the router needs pi-setup's `programs.pi.actorSubagents`
with `passthru.spawnPolicyApi >= 1` (the router registers through
`registerSpawnPolicy`, and its shell swallows the absence of the API, so
without the patched build it would do nothing); an assertion says so
(`pi-task-router: programs.piTaskRouter requires programs.pi.actorSubagents
with passthru.spawnPolicyApi >= 1 …`). Local mode needs `spawnPolicyApi >= 2`
(the overseer spawns through the API's `spawn` and `childTools`): with
`localMode.enable` a third assertion says so (`pi-task-router:
programs.piTaskRouter.localMode requires programs.pi.actorSubagents with
passthru.spawnPolicyApi >= 2 …`). Without Nix (`pi install`), a missing
actor is reported once at `session_start` ("task-router: needs
pi-actor-subagents with the spawn-policy API (__subagentsApi_v1), which is
not loaded; task-router routing is off …"): no `task_verdict`, no
`task_cards`, no nudge; the effort guard and fresh-on-cold stay on.

The settings file has readers outside this repository: pi-economics'
`pi-analyse` and its bench, whose `router` base follows the router's
settings. `packages/task-router/core/settings.ts` owns the schema.

**Golden test.** `checks/router-golden/golden.txt` records every decision of
`planSpawn` over the router's own golden grid (`test/golden/grid.ts`: 146,880
plan cases, 470,016 explicit-model cases) and of `resolveLeg` over the
selection's 96 states (`select` lines, picks named by member), under three
settings: the defaults (`defaults`), a fixture with every member's model set
and the free-cloud slot empty (`empty-slot`), and the rollback fixture
`test/fixtures/today-config.json` (`today`, the routing before the new
defaults, with the free cloud configured: the only recorded witness of that
code). `generate.ts <router dir>` prints it; the check `router-golden`
runs it on `packages/task-router`, diffs against the file (comment lines aside)
and asserts P2 as an invariance over the `empty-slot` and `defaults` lines:
with the free-cloud slot empty, no selection picks it and the cloud's state
(its running count, open, capped or blocked) changes no decision; a wait for
the local slot is allowed. After a deliberate
change of a decision, a group of the redesign re-records the file by hand
(`node --experimental-strip-types checks/router-golden/generate.ts packages/task-router`,
header `# R' = <source>, <date>`) and puts the diff of old and new file in its
record. The redesign's Groups 3–7 are closed; Group 6 re-recorded nothing.

**Log contract.** pi-economics' check `log-contract` runs the real code path
of every log writer (its token-meter, cache-lifecycle and experiments, and this
router at its router input) into one agent dir and requires `pi-analyse
--check` to pass and every report section to have data; the merge gate runs
there on this package's fake git (`test/fake-git.ts`: one merged and one
refused request, one bypass), since the check has no git. `AGENTS.md` lists
what it imports from this repository.

Checks of the router's behaviour: `task-router` (the package's tests),
`typecheck-task-router`, `iface-subagents-task-router`,
`iface-policy-task-router`, `iface-subagents-runtime-guard`, `router-golden`,
`module-eval`, `home-files`, `nix-route-smoke`, `pi-install-smoke`,
`pi-install-actor`, `pi-install-local`, `pi-install-duplicate`,
`pi-install-scope-replaced`, `pi-install-scope-both`, `pi-git-route`. In
pi-economics: `log-contract` (its `iface-experiments-task-router` read the
router's `ExperimentsApi`, which outcome log v2 removed; it leaves with
pi-economics' v2 contract).
