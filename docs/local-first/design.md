# Local-first pi: design (revision 6, 2026-11-17)

Status: design, not a plan. It records what the owner decided (§11), places it
in the router as built (§7) and names what is left open (§9). The orchestrator's
calls, for the owner to check, are listed in §12. No implementation plan; the
builder writes one from §5–§8.

Labels: `[K n.m]` = row n.m of `docs/local-first/knowledge.md` (source and
confidence there); `[Dec]` = an owner decision (§11); **Own call** = the
author's call where the decisions are silent, open to change. Every number is
a starting value or an experiment level unless the text says it is fixed.
**(orchestrator's call)** = a minor call made by the orchestrator in r4 or r6 where
the owner's decisions are silent (all listed in §12); the owner may overrule
it. Older **Own call** marks stay the author's.

Terms. *Local model*: the model behind pi's `llama` provider (today
`llama/qwen3.8`, router member `qwen-local`). *Main*: the foreground pi
session. *Child*: an actor-subagents session the router places. *Package*: one
unit of work with its own branch, worktree and fresh local child. *Node*: a
package in the work tree (§5.2); a *leaf* implements, a *plan node* splits, an
*integration* is a node's merge of its children. *Contact*: one cloud agent
session started for local work; *bounded* (fixed payload, read-only, typed
verdict, few turns) or *open-ended* (explores with tools) [K 2.2–2.3].
*Cloud-only*: all work on cloud models, no local member (the cost and quality
baseline). *Cloud-first*: today's default mode.

## Changelog

- **r6 (2026-11-17)**: the owner's additions (§11 "r6 answers", items 24–30);
  open: none. Review fixes of the same day (orchestrator's calls, §12
  items 14–17).
  - Merge-back per level: no size check runs at merge; the deterministic
    checks do; the fit check is advisory and a miss opens a fix package
    (§5.2).
  - A merge queue serialises merges into one parent branch in the router's
    merge gate, one lock from rebase to fast-forward (§5.2, §7 gap 27).
  - qwen3.8 reviews small and inert-like packages as an arm (E17), in a fresh
    session, covered by the spot-check sample (§5.4, §5.5, §6).
  - From the single-repo research (`docs/research/originals/Local LLM
    Single-Repo Architecture.md`, key R-single in the knowledge base):
    children's soft context hint 64k with a 32k arm (§5.7, E14); lean local
    children as a factor (§5.7, E18, gap 28); follow-ups, not in scope now
    (§5.9).
  - A medium-effort child retries once at xhigh before the split (§5.2,
    §5.5).
  - §5.9 names the owner's development loop as the first workflow a
    strategy layer must express.
  - §11 items 5, 7 and 16 are marked superseded by r6 items 24–27.
- **r5 (2026-11-16)**: O13 closed: `cache-ram` went on 2026-11-13, and
  qwen3.8 has not run in pi with it yet, so E1's "before" side is every local
  request before that day and its "after" side starts with the next local
  session. Per-request `thinking_budget_tokens` verified for build
  b10964 (§5.7). Open: none.
- **r4 (2026-11-13)**: the builder check's questions and open points O1–O12
  settled (§12 lists the orchestrator's calls, marked inline); the owner's
  answers added (§11 items 19–23): a node's agent only splits, the main starts
  the children; the split is mandatory only at package start; the local main
  drafts the top-level plan (Opus-writes is an arm, E16); the router reads quota
  headers itself. New: §5.9 (composable strategies as a future direction and a
  design constraint), passive measurement instead of live tests (§5.7), staging
  of the experiments (§6). Open: O13 only.
- **r3 (2026-11-13)**: every r2 question answered (§11); moved from
  pi-economics' working notes into the router (`docs/local-first/`). New:
  hierarchical divide and conquer on worktree branches (§5.2), size tiers
  with hints that never block (§5.3), reviewer = stronger of class and tier
  (§5.4), contact budgets per node kind (§5.5), quota by a separate waiter
  extension (§5.6), location-independent serving and the router's local queue
  (§5.7), thinking-budget factor, experiment register (§6), gap list against
  the built local mode (§7). Dropped: a host companion, server-side
  experiments, the `cache-ram` experiment (it is on), pi-retry, quota
  thresholds as the main mechanism, "−20 % q7d points" as the target.
- r2 (2026-11-13): grounded in the knowledge base; four contact points;
  package contract; questions in rounds.
- r1 (2026-11-13): first draft of the design space.

## 1. Intent

Run pi *local-driven* at the sweet spot of cost and quality: a local model
does the routine work in small, clearly bounded packages; cloud models are
paid only at chosen contact points (review, plan review, escalation,
spot-checks), and each contact point is an experiment arm, so the data decides
how many contacts the quality floor needs [Dec]. Latency is no goal: when the
owner needs speed, he switches the session to cloud-first [Dec].

## 2. Goals, non-goals, anti-goals

Goals:

- **G1 Cost.** At most 0.1× the cloud-only cost per accepted package, cost as
  the vector (quota points q5h/q7d, API-equivalent $ for cloud, EUR for local
  as active request time × a configurable rate per local provider, start
  0.13 EUR/h) [Dec].
- **G2 Quality floor.** Acceptance ≥ 0.9× cloud-only, and no revert of an
  accepted package within 7 days ("ambitious; improve quality later") [Dec].
- **G3 Guidance from the start.** The router hands the session its budgets at
  session start and the local agents work in small packages; the contract is
  structural (tool parameters, card fields, deterministic checks), since prose
  rules decay and advisory notes do not move small models [K 1.1, 1.2].
- **G4 Few contacts.** Every cloud contact is usually a cold prefill [K 2.1];
  contact points are experiment arms, and at equal quality the arm with fewer
  contacts wins [Dec].
- **G5 Deterministic mechanics.** Size, class, splits, breakers and reviewer
  choice are computed by the router from diffs and checks, never from the
  model's claim [K 3.1, 5.1].
- **G6 Measurable.** Every contact, size crossing, split, node, queue wait
  (local queue and merge queue), rebase conflict and arm is logged; per
  factor a trade-off curve and at the end a cost-vs-quality frontier, plus an optional single number at a configurable rate [Dec].
- **G7 Cloud-first unchanged.** Today's default mode stays byte-identical
  (`router-golden`, the section, the log lines; LM-design A5, G6).

Non-goals: latency; local-only or cloud-only *profiles* (two profiles only)
[Dec]; the router choosing or switching the main model after the user chose
one (a "virtual main" is a later experiment) [Dec]; experiments on the server
or coupling to the host that runs llama-server [Dec]; complexity measures
beyond changed lines, before our own experiment [Dec]; a learned classifier
(LM-design N2); a user-definable strategy language (a future direction, §5.9).
Agents never run live tests against the local server (§5.7).

Anti-goals (must not happen):

- size hints that block, or a size limit that refuses work mid-work or at the
  merge; the one size refusal is at package start and says how to split
  (§5.2, §5.3) [Dec];
- a local self-review or a local reviewer in front of the cloud [Dec; K 3.6,
  3.7]; the one exception is the E17 arm (§5.4): qwen3.8 reviews small and
  inert-like packages only, in a fresh session, instead of Sonnet or Haiku,
  never decides whether the cloud is called, falls back to the cloud
  reviewer when unavailable, and is covered by the spot-checks [Dec, r6];
- a spot-check whose verdict the reviewed parent judges [K 2.9];
- reading the model's self-assessed confidence (LM-design A1);
- switching the main model back after a user's in-session change [Dec];
- a router dependency on pi-economics (extensions never depend on it; it
  observes them) [Dec].

## 3. Constraints

| # | Constraint | Source |
|---|---|---|
| C1 | One local slot: `parallel = 1`, the whole 262144 context; `cache-ram` 16384 MiB on (very recent); serving is the owner's business, wherever it runs | [K 6.9] |
| C2 | Each cloud contact pays a cold write of 16–40k tokens (≈ $0.05–0.19); a bounded review costs a median $0.27, an open-ended review child $4.03, an implement child $8.00 | [K 2.1–2.3] |
| C3 | Opus *agent* contacts are the quota sink whoever is main; bursts, not weekly volume, cause 5h lockouts | [K 2.11, 2.12] |
| C4 | pi's `<agentDir>/models.json` is the only model list (it may move into Nix through pi-setup); model facts come from pi's registry | [Dec; K 6.10, 7.7] |
| C5 | Local mode L1–L8 is built and tested with fakes, never run on a real host; whether the local model follows the section, hints and refusals is unknown (G7) | [K 7.1] |
| C6 | Live quality arms need ~1000 packages per arm for review escapes; a shadow replay needs 129–243 defect-bearing changes | [K 3.9] |
| C7 | Every measured re-prefill/thrash number predates `cache-ram` | [K 2.8, 6.1] |
| C8 | Repository rules: tests first, default mode unchanged, the outcome log's versioning rule, the frozen claim protocol, no dependency on pi-economics (the `__piExperimentsApi_v1` read leaves) | `AGENTS.md`; [Dec] |

## 4. Approaches considered

| Approach | Outcome | Why |
|---|---|---|
| A. The local main does most work itself on branches (built: `localSection`) | replaced by B | one long local context, prompts to p99 261k [K 6.7]; research favours a fresh context per task [K 1.8] |
| B. Fresh local child per package, main coordinates | **decided** | [Dec]; slot cost handled by the router's local queue (§5.7) |
| C. Flat package list under one plan (built: `plan_request`, ≤5 tasks per milestone) | kept as the *flat* arm | the owner wants divide and conquer as needed; flat vs recursive is a factor [Dec] |
| D. Hierarchical divide and conquer on worktree branches | **decided** (§5.2) | [Dec] |
| E. One gate size cap that refuses (built: 150 lines / 6 files) | replaced by tiers + hints + reviewer escalation | the cap refused real work [K 1.6]; splitting multiplies the fixed review cost [K 1.7] |
| F. Review by risk class only, or by size only | replaced by the stronger of both | [Dec]; lines correlate with review recall, blast radius is the class's job |
| G. Local self-review / local reviewer in front of the cloud | rejected; qwen3.8 reviews small and inert-like packages only as the E17 arm | [Dec; K 3.6, 3.7]; r6 (§5.4) |
| H. Local drafts the plan, cloud audits | **decided** for the top-level plan (§5.2); Opus authors as an arm (E16) | [Dec]; anchoring and unverifiable checks [K 4.2] are what E16 tests |
| I. Quota thresholds in the router (q5h 80 %) | fallback only | the owner prefers waiting at exhaustion by a separate extension [Dec] |
| J. Server-side levers (`-np 2`, `--kv-unified`, `cache-ram` as an arm, host-declared serving) | rejected | location independence; `cache-ram` is already on [Dec; K 6.9] |
| K. A router-picked main ("virtual main") | later experiment | [Dec] |
| L. Deferred review queue, shadow price, automatic profile pick, -only profiles | dropped in r2 | [Dec] |

## 5. Decided design

### 5.1 Profiles and the switch

- Two router profiles, **local-first** and **cloud-first** (= today's default
  mode). The profile is per session: its default is a setting, it can be
  switched at any time in the session, and the switch is a session entry
  (restored on resume) and a log line [Dec].
- At `session_start` local-first sets the configured local start model only
  when the user has not chosen a model (command-line flag, a resumed
  session's model, `/model` before the start hook). pi-setup's default model
  is the fallback when pi starts. The router never changes the main model
  afterwards [Dec].
- **Own call:** a switch applies to spawns and merges from then on; running
  children and open nodes keep the profile they started with.

| Layer | cloud-first (today) | local-first |
|---|---|---|
| Main at start | the user's default | the configured local model, unless the user chose |
| Main's job | does the work, delegates by card | coordinates; one fresh local child per package [Dec] |
| Guidance | `task_cards` section | coordinator section with the session's budgets (§5.3) |
| Executors | card routing (local level-0 cheapest-fit) | local package children; `t2` cards still go to the cloud (an open-ended contact, counted in §5.5) |
| Review | importance-table legs; parent-spawned spot-checks | §5.4 binding reviews; router-judged spot-checks (§5.5) |
| Escalation | `attemptOf` one level up | §5.5 ladder |
| Quota | provider blocks after errors | §5.6 |
| Meter stratum | cloud | local (profile and main model at session start) |

### 5.2 Packages, nodes and the work tree

- **Package** = one task: goal, file whitelist, budget (§5.3), check (red
  first), forbidden actions; one branch in one worktree; run by a fresh local
  child; the main (or a plan node's agent) coordinates [Dec; K 1.3].
- **Node = git branch + worktree.** A child node branches off its parent's
  branch and merges back into it through the gate; the root's parent is the
  main branch [Dec].
- **Shape:** split as needed, at most 5 children per node, depth cap 3 at the
  start; depth and fan-out are logged; flat vs recursive is a factor (§6)
  [Dec]. The main's request is level 0 and the tree goes up to 3 node levels
  below it (milestone → task → subtask) (orchestrator's call).
- **Who starts the children.** A node's agent decides do-or-split. On a split
  it commits a split plan (its children's packages) to its branch and ends;
  the coordinating main reads the plan and starts the children. There are no
  nested sessions (one local slot), and the whole tree's state lives in the
  main's session [Dec].
- **Do or split** is the node agent's choice. A split is mandatory only at
  start: `start_branch` refuses when the stated size estimate exceeds the
  session's tier, and the refusal says how to split. After a breaker trip or a
  failed check, a split is the first escalation step (a child at medium effort
  first gets one retry at xhigh, a local step that a child already at xhigh
  skips [Dec, r6]), then the cloud ladder (§5.5); a node that cannot split any further (depth or fan-out cap) goes
  straight to the ladder. Crossings during the work stay hints plus the next
  tier's reviewer (§5.3) [Dec].
- **Budgets per work kind** [Dec]: a plan/spec node by its number of children
  (≤ 5) and its text length (~150 plan lines per node); an implementation leaf
  by changed code lines (its tier). The values are factors (§6).
- **Per level:** when children merge into their parent, **no size check runs
  at merge**: size only sets a leaf's budget and its reviewer (§5.3). The
  deterministic checks (the parent's check plus every merged child's check)
  run on the combined result. The local fit check is advisory: the parent's
  local agent compares the combined result with the parent's goal; it is no
  review verdict and blocks no merge (the deterministic checks stay the only
  merge gate). A miss creates one fix package on the parent node: a fresh
  local child on the parent's branch, through the normal gate. If that fails,
  the ladder of §5.5 is entered at its first step. "Split" applies only to an
  unmerged package, never to children that have already merged
  (orchestrator's call) [Dec].
- **Merge queue** [Dec]: merges into one parent branch are serialised in the
  router's merge gate (`core/local/merge.ts`). Per parent branch one lock is
  held from the rebase to the merge, in this order (orchestrator's call):
  acquire the lock → rebase the child onto the parent's current tip →
  deterministic checks → review (approval reuse stays keyed on commit and
  tree, so a tree changed by a rebase is re-reviewed) → fast-forward-only
  merge → release. The merged tree stays the reviewed tree (LD7). Contention
  is low, since the local slot already serialises the children's work. A
  rebase conflict or a red check releases the lock; a fresh local child then
  gets one bounded fix on the child's branch (no cloud contact). If that fails,
  the ladder is entered at its first step (§5.5: the xhigh retry for a medium
  child, then the split, then the cloud). Lock waits and re-reviews are
  logged (§5.8). The queue lives in the main's tree state, which is a session
  entry like the plan records, so it survives a fold or a resume; no extra
  process (persistence of the tree state is required of the builder, §8). It
  is not the local request queue (§5.7, spawn policy), which orders local
  model requests, not merges.
- **Budgets at session start:** the router writes the session's tier and plan
  budgets into the coordinator section and every package child's brief, and
  prefers smaller packages [Dec].
- **Top-level plan:** the local main drafts it and bounded cloud contacts
  review it (§5.5); Opus writing the plan is an experiment arm (E16) [Dec].

### 5.3 Size: tiers, hints, crossings

| Tier | Changed lines per package | Note |
|---|---|---|
| small | 60 | |
| standard | 150 | elevated packages never exceed it |
| large | 300 | |
| inert | unlimited | only for the inert class (§5.4) |

- The session's target tier is drawn at random (a factor, §6) [Dec].
- Lines are the measure because they correlate with review recall; blast
  radius is the risk class's job [Dec]. "Changed lines" is added + deleted
  from `git diff --numstat` against the base, untracked files counted, as
  `core/local/merge.ts` computes it today; the tiers carry no file limit
  (orchestrator's call).
- **Hints at 80 % and at 100 % of the budget, never a block** [Dec]. They come
  from the deterministic size monitor the router already has
  (`core/local/install.ts:365–380`, `core/local/tripwires.ts:170–181`) [K 1.10],
  extended to package children and to the two stages.
- **Crossing:** a package that crosses its budget escalates to the next tier's
  reviewer; above `large` an Opus review [Dec]. Every crossing is logged: when
  (turn, call, time), by how much, the estimate against the actual, the work
  kind, the tier, the class and the node's depth, to find root causes [Dec].
- **Start refusal** (§5.2): `start_branch` takes the package's stated size
  estimate and refuses when it exceeds the session's tier; the refusal says
  how to split. With the split tool's refusal of a `code` child above that budget, these are the only two places size blocks [Dec].
- **The reviewer follows the actual size, not the drawn tier**: the stronger
  of the class's reviewer and the reviewer of the tier the *actual* changed
  lines fall into (§5.4). The drawn tier only sets the budget and the hints;
  each crossing is logged against the drawn tier (orchestrator's call).
- The merge gate stops refusing on size (today `size` in
  `core/local/merge.ts:44, 341`). For a diff far above `large` (11-11: 1148
  lines of docs, a 13299-line CI migration [K 1.6]) the Opus reviewer gets the
  numstat, the check output and the hunks of the riskiest files, logged as an
  over-cap review; inert diffs pass without review (orchestrator's call).

### 5.4 Risk classes and the reviewer

Classes are computed from the diff, with the policy (globs) read from the base
branch, a mixed diff taking its highest file class, and errors failing closed
[K 3.1, 3.2]:

| Class | Rule |
|---|---|
| inert | every file a lockfile, generated, prose (not `AGENTS.md`, `CLAUDE.md`, `.pi/`, skills, prompts, plan files), whitespace/comment or a pure rename; at least one configured `extraChecks` entry passes (MGS §2.1) |
| standard | everything else |
| elevated | `riskGlobs` (auth, crypt, migrations, secrets), CI/infra, gate configuration, multi-component configuration, weakened tests, ≥ 3 coupled files, public API; the ">400 lines → elevated" rule is dropped [Dec] |

**Reviewer = the stronger of the class's and the actual-size tier's** [Dec;
§5.3]:

| Tier or class | Reviewer |
|---|---|
| inert | none; the 10 % spot-check sample audits it (§5.5) |
| small | Sonnet (binding) or qwen3.8 (E17); Haiku (advisory) or qwen3.8 (E17) when the package is inert-like: every file of inert class, or tests/docs only, and no code (orchestrator's call) |
| standard | Sonnet or Opus, randomized per review (§6) |
| large, and above `large` | Opus |
| elevated | Opus in a fresh session plus an orthogonal deterministic check (tests, static analysis, red run); never a second identical LLM [K 3.5] |

Order of strength: none < Haiku advisory < Sonnet < Sonnet|Opus (randomized)
< Opus < Opus + orthogonal check (qwen3.8 stands in for Sonnet or Haiku
only in the E17 arm, below). A review is bounded: the triad payload
(goal, check output with the red run, numstat and diff), read-only, a
verdict computed by the harness, a fresh session (built: LM-design §3.2;
[K 3.3, 3.8]). Cheap refusals run before any contact (main-dirty included)
[K 7.4]; a transient provider error is waited out or retried, never a closed
gate [K 5.8].

**qwen3.8 as reviewer, an arm (E17)** [Dec, r6]: for the two strata of
cheap packages the reviewer is drawn 50/50 inside each stratum:

- *small* (binding at the gate): qwen3.8 or Sonnet;
- *inert-like* (the Haiku-advisory case; advisory, gates nothing): qwen3.8 or
  Haiku. The inert class itself stays without a review in the audit sample.

Limits, which are the exception to the anti-goal of §2 and nothing more
(orchestrator's call):

- In the small stratum qwen's verdict is binding like Sonnet's: the arm trades
  Sonnet's binding review for qwen's, and the shadow review measures what
  that costs in escapes. Both reviewers get the bounded triad payload and a
  harness-computed verdict, in a fresh session, never the author's.
- qwen never reviews the standard tier or above, nor a package whose class
  demands a stronger reviewer, and never decides whether the cloud is called.
- qwen unavailable (slot timeout, server down): the unit falls back to
  Sonnet or Haiku, logged as a fallback and analysed as assigned
  (intention to treat).
- The spot-check sample (§5.5, 10 %) covers qwen-reviewed packages at the same
  rate in both arms; its shadow reviewer is cloud-side (Opus).
- An *escape* is a defect found by the shadow review, a later failing check,
  or a revert within 7 days, attributed to the reviewed package.
- Escapes are rare, so E17 is a long-running arm: report the escape rate per
  arm with a confidence interval; stop only for harm (an escape-rate bound set
  before the start), never for superiority; the owner decides from the data.
- A qwen review uses the single local slot (the local queue, §5.7), pays a
  cold prefill, costs time (EUR), not $, and is no cloud contact: it does not
  count against §5.5's contact budgets. Its queue wait is logged.

### 5.5 Contact points and their budget

Contact budget per node kind [Dec]:

| Node kind | Contacts |
|---|---|
| leaf (package) | its review (§5.4), at most 2 review rounds; a re-review sees the new diff only |
| plan node | a plan review, at the chosen review points (below) |
| integration | an integration review, at the chosen review points |
| escalation (any node) | at most 1 bounded corrective contact, then at most 1 open-ended agent contact, then stop and report to the user |
| spot-check | separate: a 10 % sample, bounded, judged by the router |

Every count above is a factor (§6); arms with fewer contacts are preferred at
equal quality [Dec].

**Review points** (each an arm, §6) [Dec]: the top-level plan (when it has more
than one child or is elevated); the integration of a node whose combined diff
exceeds 150 lines or is elevated; leaves per class and tier (§5.4); a plan
review at every level.

**Escalation ladder** [Dec]: breaker or failed check → for a child at medium
effort one retry at xhigh (local, before the split; skipped for a child at
xhigh) [Dec, r6] → a split first (§5.2) → one bounded corrective card (Sonnet for
standard, Opus for elevated: the cloud gets goal, check, last failures and the
focal diff and returns a root cause and a revised package card, which a fresh
local child runs) → hand-off one tier up (an open-ended agent contact) → stop
and report. An Opus steer into the local context is an experiment arm only.
Breakers, as starting values: 3 same-test failures, 2 failed diff
applications, 2 verification failures, the turn budget, the context breaker
(§5.7) [K 5.2]; thresholds are uncalibrated, every trip is logged [K 5.4].

**Spot-checks** [Dec]: bounded, router-judged contacts on (i) the inert audit
sample, (ii) local output no gate sees (scouts, summaries, ungated children),
(iii) a shadow second review of a gate-review sample, which includes the
qwen-reviewed packages of the E17 arm (§5.4); rate 0.1. They replace
today's parent-spawned review children, whose verdicts carried no information
[K 2.9]. They measure; they do not gate.

**Batching** [Dec]: consecutive small or inert packages are reviewed together
up to a cap (default the standard tier, 150 lines); elevated packages never.
Batching on/off and the cap are factors. Research rejects packing independent
diffs into one review prompt [K 3.6]; the factor tests it. Mechanism
(orchestrator's call): consecutive small or inert leaves merge into their
parent's branch with their checks only; the parent's accumulated diff of those
leaves is reviewed once, up to the cap, before the parent merges up.

Expected contacts per package, local-first, from measured contact costs
[K 2.1–2.5] (**own estimate**):

| Package | Contacts | ≈ $ |
|---|---|---|
| inert | 0; 10 % audit sample | ≈ 0.03 |
| small / standard | 1 bounded review, a second round in about 2 of 9 (11-11) | 0.15–0.4 (Sonnet less than Opus) |
| large / elevated | 1–2 bounded Opus + an orthogonal check | 0.3–0.6 |
| request of k packages, with a plan review | 1 plan contact + k packages (+ integrations by arm) | ≈ 0.3–2 + 0.35 k |
| breaker | + 1 bounded corrective; a second trip + 1 open-ended hand-off | + 0.3; + 1–8 |
| `t2` card | 1 open-ended worker + its review | 2–12 |

Reference: the same package cloud-only, an Opus child plus a review child, ≈
$12 median [K 2.2]. G1 (≤ 0.1×) holds while breakers stay rare and agent
contacts stay exceptions.

### 5.6 Quota

- The router keeps **no quota thresholds of its own as the main mechanism**
  [Dec]; it reads quota state itself from the rate-limit headers of provider
  responses [Dec]. A separate extension,
  *quota-wait* (own small repository, provided through pi-setup), notices an
  exhausted window, waits for its reset and resumes the waiting sessions,
  with one coordinator per process (one probe and timer per provider and
  window); it emits `quota-wait:*` events that pi-economics meters [Dec;
  K 2.13]. Design and plan of quota-wait come after this document; for the
  router's plan quota-wait is only a consumed contract (its events), not a
  deliverable (orchestrator's call).
- The events complement the headers [Dec]: the router listens to them (a
  waiting child is not stuck; no hand-off or parent alarm while it waits) and
  logs the waits it sees. Its absence is reported once and switches the
  fallback on (**own call**).
- **Fallback** without quota-wait [Dec]: at most 2 concurrent cloud contacts;
  above q5h 80 % no open-ended contacts except elevated reviews and `t2`
  cards; at exhaustion an elevated review waits and a standard one drops a
  tier.
- pi-retry is dropped: pi's native retry handles transient errors [Dec;
  K 2.14].

### 5.7 Local loop: thinking, context, serving

- **Thinking** [Dec]: the main at `xhigh`; package children `xhigh` vs
  `medium`, 50/50; within the medium arm a per-request thinking budget of
  16k / 32k / unbounded tokens. The budget caps the reasoning of one
  response, not the context [K 6.13]. pi 1.4 sends `thinkingBudgets` in the
  field `compat.thinkingTokenBudgetField` names (`thinking_budget_tokens` for
  llama.cpp) [K 6.11]; llama.cpp takes it from the body when no
  `--reasoning-budget` is set [K 6.12]. Verify on our build first, from its
  version and the llama.cpp docs and source, not by a live run (below). A
  child gets its own level because the router sets `thinking_budget_tokens` in
  the request payload per session, in `before_provider_request`, once the
  build is verified (orchestrator's call). LD1 stays (the main's effort is no
  importance source).
- **Context** [Dec; r6]: soft hint for local children at 64k, with a 32k arm
  (today 32k, noise on a 262k model [K 5.7]; the research puts a 27B model's
  effective working context at 25–30 % of the window, about 65–79k on 262k,
  with active working sets of 32–64k [K 6.14]); the coordinating main's
  hint stays at 96k and it folds only at package boundaries or at ≥ 200k (a
  fold rewrites the local prefix: minutes of prefill [K 6.2]); a breaker when
  one request carries ≥ 64k uncached input. All values are factors (E14).
- **Lean local children** [Dec, r6]: a child's brief and tool set are a
  factor (E18): *lean* = a minimal brief (build and test commands, the
  package contract, no repository tour) and about a dozen tools; *full* = the
  full brief and tool set. Rationale: repository context files raised cost by
  20–23 % and tool-selection precision falls with more tools [K 1.11].
  Nothing in the lean arm weakens the contract fields or the checks (G3).
- **Serving** [Dec]: pi's `models.json` is the only model list; the router
  reads context window, `maxTokens` (131072), reasoning and thinking levels
  from pi's registry instead of its member copy [K 6.10]; members keep the
  routing facts (abilities, cost, order, slots, health URL). Nothing depends
  on where llama-server runs; no server-side experiments.
- **Local queue** [Dec]: the router runs one local request stream at a time —
  the main's or one local child's — and queues the other local sessions, a qwen review (§5.4) included. It
  stays even with `cache-ram` on. The thrash evidence (394 of 407 large
  uncached main requests after another session's request [K 2.8]) is
  **pre-cache-ram**; it is re-measured, split before/after the change (E1,
  §6), and is not relied on until then.
- **Verification without live tests** (orchestrator's call; the owner may
  object): no agent runs smoke tests against the local server. The checks use
  fakes. Liveness and configuration come from llama-server's endpoints
  (`/health`, `/props` for the build and `n_ctx`, `/slots`). Support for the
  per-request `thinking_budget_tokens` is read from the build version and the
  llama.cpp docs and source. For build b10964 (b29c606) the source settles it,
  and two requests confirmed it (2026-11-16, server on at the owner's word): the
  server reads `reasoning_budget_tokens`, else `thinking_budget_tokens`, else
  its `--reasoning-budget` (default −1, unlimited)
  (`tools/server/server-common.cpp` 1388–1391). It applies only when the chat
  template yields a thinking end tag (the autoparser path, `common/chat.cpp`
  1341–1346; qwen3.8's `<think>` template does; specialised templates such as
  gpt-oss, Mistral or Kimi ignore the field silently). Router mode forwards the
  body unchanged to the model's server (`tools/server/server-models.cpp`
  1539–1575). On qwen3.8 a budget of 32 cut the reasoning from 534 to 106
  characters (438 to 264 completion tokens). A router check of the build
  therefore needs the template's end tag too, not only the version. The re-prefill cost with `cache-ram` 16384 is
  measured passively from the meter (llama-server's `timings` → `promptMs`,
  `genMs`, meter v2) during normal use. Only if the docs stay ambiguous: an
  owner-run scripted `curl` probe from a runbook (no agent, no session), never
  agent-initiated.

### 5.8 Measurement

- Cost: API-equivalent $ per cloud request (deterministic, attributable with
  concurrent sessions), EUR = active local request time × rate; quota (q5h,
  q7d) is the budget and a calibration check [Dec].
- Quality: router-recorded verdicts (gate reviews, spot-checks), check
  results, reverts within 7 days; never the parent's `task_verdict` alone
  [K 2.9]. The router cannot see a revert a week later: pi-economics' analyser
  computes it from the router's merge log, so every merge line carries sha,
  branch and repository (orchestrator's call).
- The router randomizes its own levers and records each unit's arm on its
  log lines; pi-economics analyses them as extension-owned levers and builds
  the curves [Dec].
- New log content (names left to the builder): merge (sha, branch,
  repository), contact (kind, shape, member,
  class, tier, round, duration), size crossing (§5.3), node (depth, fan-out,
  parent, kind, outcome), split (reason: estimate, breaker, failed check,
  choice), profile switch, local-queue wait, merge-queue lock wait, re-review and rebase
  conflict (parent, child, wait, outcome), quota wait, arm per factor.
  `docs/outcome-log.md` governs versions; pi-economics' consumer copy follows
  at its next router bump.

### 5.9 Future direction: composable routing strategies

Owner's FYI, **not in scope now**: routing strategies should later become
fully composable and user-definable, in the way pi-workflows composes
workflows [Dec]. This build ships two fixed profiles (§5.1). The constraint
on the builder is to keep the seams clean, so that a later strategy layer can
replace the parts without rewriting the tools: e.g. the profile, the size
tiers and hints, the class and reviewer choice, the contact points and their
budgets, the escalation ladder, the batching rule and the arm drawing each as
a separate function or table behind a narrow interface, not hard-wired in
tool handlers. Gap 24's wish for user-defined delegation rules (§7) belongs
to the same direction.

**First workflow** [Dec, r6]: the owner's development loop is the first
workflow such a strategy layer must express, configurable per stage: design
and architecture → the owner reviews a conceptual overview → spec → plan →
plan review by a subagent → implementation → final review. The seams above
(plan authors and reviews, review points, the reviewer choice) are where its
stages attach; no stage is built now.

**Follow-ups** (from the single-repo research, R-single; not in scope now,
each needs its own evaluation or data):

- A Tree-sitter code-graph tool for local children (codebase-memory-mcp
  style: a graph query instead of a repository tour), its own evaluation.
- The edit format: whole-file rewrite for short files, diff or search/replace
  for long ones; a question for pi's edit tool, not the router.
- A complexity measure beyond changed lines, deferred until our own data (as
  in §2).
- Short decision records (ADRs) for the "why" knowledge the code does not
  carry.
- Repository fine-tuning (RCL, LoRA): not for fast-changing repositories
  (the adapter is stale at each commit).

## 6. Experiment register

All arms are drawn by the router; quality and cost per *accepted package*
are the outcomes unless stated. **n** (own estimates; α 0.05 two-sided, power
0.8): acceptance 0.92 vs 0.83 (the 0.9× floor) ≈ 200 packages per arm (≈ 160
as a one-sided non-inferiority test); a 25 % cost difference ≈ 190–430 per
arm for a log-cost σ of 1–1.5 (σ comes from E0); reverts 3 % vs 6 % ≈ 750
per arm; review escapes ≈ 1000 per arm live, or a shadow replay of 129–243
defect-bearing changes [K 3.9]; the 10× cost target itself needs only tens.
Session-level units need a design effect for clustering (from E0). At our
volume (one busy day had 15 merge requests [K 7.3]) few factors can run at
once; the staging is in the note after the table (orchestrator's call).

| # | Factor | Levels | Unit | Outcomes | n |
|---|---|---|---|---|---|
| E0 | baseline, no factor | local-first and cloud-first as used; cloud-only reference = the bench plus a minority arm of cloud-first sessions with local members off (orchestrator's call) | — | all; σ and clustering for the n above | 2 weeks |
| E1 | re-measure local re-prefill | before vs after `cache-ram` (by date), with the router's queue on; passive, from the meter's `timings` in normal use (§5.7) | request | uncached tokens and prefill time after another session's request | a few hundred requests per side |
| E2 | target size tier | small / standard / large | session | cost, acceptance, reverts, crossings, review rounds | ≈ 200/arm (acceptance) |
| E3 | standard-class reviewer | Sonnet / Opus | review | cost; escapes by shadow replay and spot-checks | cost ≈ 190; escapes by replay |
| E4 | batching | off / on | session | cost per accepted package, rounds, escapes | ≈ 200/arm |
| E5 | batching cap | 150 (default) / other levels | session | as E4 | ≈ 200/arm |
| E6 | tree shape | flat (depth 1) / recursive (depth ≤ 3) | request | cost, acceptance, depth, fan-out, crossings | ≈ 200 requests/arm |
| E7 | top-level plan review | on / off (when >1 child or elevated) | request | cost, acceptance, amendments | ≈ 200/arm |
| E8 | integration review | on / off (diff > 150 or elevated) | node | cost, escapes, reverts | ≈ 750/arm (reverts) |
| E9 | plan review at every level | on / off | request | cost, acceptance | ≈ 200/arm |
| E10 | leaf review rounds | 1 / 2 | package | cost, acceptance | ≈ 200/arm |
| E11 | escalation contacts | corrective then hand-off (default) / corrective only / Opus steer | breaker trip | recoveries, cost per recovered package | per trip; tens to hundreds |
| E12 | child thinking | xhigh / medium | package child | cost (EUR), wall time, acceptance | ≈ 200/arm |
| E13 | medium-arm budget | 16k / 32k / unbounded | package child (medium arm) | as E12 | ≈ 200/level |
| E14 | context values | child soft hint 64k (default) / 32k; the main's hint 96k, fold 200k, breaker 64k, each against a second level | session | wall time, breaker trips, acceptance | ≈ 200/arm |
| E15 | plan budgets | children (≤ 5) and plan lines (~150) against other levels | session | splits, crossings, acceptance | ≈ 200/arm |
| E16 | top-level plan author | local main drafts + bounded cloud review (default) / Opus authors | request | cost, acceptance, amendments | ≈ 200/arm |
| E17 | reviewer of small and inert-like packages | two strata, 50/50 each: small, qwen3.8 / Sonnet (both binding); inert-like, qwen3.8 / Haiku (both advisory); qwen in a fresh session, fallback to the cloud reviewer, intention to treat (§5.4) | review | cost ($ and EUR), wall time with queue wait, rounds, fallbacks; escapes (shadow review at the same 10 % rate, a later failing check, a revert within 7 days) per arm with a confidence interval | long-running: escapes are rare; stop only for harm (a bound set before the start) |
| E18 | child brief and tools | full / lean (minimal brief, about a dozen tools; §5.7) | package child | cost (EUR), wall time, acceptance, tool-call count | ≈ 200/arm |

Not factors: the profile (the user's choice, a stratum), the spot-check rate
(the instrument), the size-hint stages (80 %/100 %), the quota fallback.

**Staging** (orchestrator's call): the build ships the randomizer framework
and a first subset; the other factors follow. First: E0 and E1 (measurements),
then the randomized levers in the order size tiers (E2, with the reviewer E3),
children's thinking (E12, E13), batching (E4, E5). The tree and review-point
factors (E6–E10) wait until the tree exists; flat vs recursive (E6) only then.
E11 and E14–E18 later.

## 7. What changes in the router (gap list against the built local mode)

Paths are under `packages/task-router/`.

| # | Area | Today | Local-first needs |
|---|---|---|---|
| 1 | Mode | one global `settings.mode` (`core/settings.ts:88`, `core/local/mode.ts` `isLocal`); no per-session mode (LM-lim) | per-session profile: default from settings, switch command, session entry, status line, log line |
| 2 | Main model | the router never sets the main (LM-design N1) | set the local start model at `session_start` unless the user chose |
| 3 | Section | `localSection` "do most of the work yourself" (`core/prompt.ts:67–77`) | coordinator section with the session's budgets, one child per package, do-or-split rule, tree limits |
| 4 | Who uses the local tools | `start_branch`, `request_merge`, `plan_request`, `amend_plan` and the hint engine serve the main only (`core/local/install.ts`, `isChild` guards at 272–444) | the main's tools drive nodes at any depth: `start_branch` takes the parent node and a size estimate (refused above the tier, with how to split), `request_merge` merges into the parent node; a node's agent only commits a split plan and ends, the main starts its children (§5.2); children keep the `isChild` guards [Dec] |
| 5 | Branch base and merge target | branches start at the main branch's tip (`core/local/worktree.ts:107–169`); merges go into `mergeGate.mainBranches` only (`core/local/merge.ts`); the git guard protects main branches (`core/local/gitcmd.ts`) | branch off the parent node's branch, merge into it through the gate; the guard also protects parent branches (**own call**) |
| 6 | Size monitor | main only, one stage (100 %), budget `sizeBudget` = `plans.splitLines`/`splitFiles` 100/3 (`core/local/tripwires.ts:170–181`, `core/local/install.ts:365–380`, text `core/local/hints.ts:14`) | tiers 60/150/300/inert, stages 80 % and 100 %, package children, the start refusal on the estimate, reviewer by actual size, crossing log |
| 7 | Gate size step | refuses `size` above 150 lines / 6 files (`core/local/merge.ts:44, 341`); the review input fails closed above 8 × (lines + files) (`core/local/merge.ts:117`) | no size refusal; reviewer by actual-size tier; for diffs far above `large` the numstat, check output and riskiest hunks (§5.3) |
| 8 | Risk class | none; `riskGlobs` only marks paths (`core/settings.ts:63`) | the inert/standard/elevated classifier (MGS §2.1, unbuilt) with base-branch policy |
| 9 | Reviewer choice | `overseer.member` Opus, fallback Sonnet (`core/local/overseer.ts:128–134`) | stronger of class and tier; standard randomized; Haiku advisory; orthogonal check for elevated; for small and inert-like packages the E17 arm: a qwen3.8 review in a fresh local session through the local queue, covered by the spot-check sample (§5.4) |
| 10 | Rounds | `rejectionsBeforeFixer` 2 → a Sonnet fixer, `fixerRounds` 1 → `blocked` (task-router.md, L6) | ≤ 2 rounds per leaf with diff-only re-review, then the escalation ladder (the fixer becomes its hand-off step) |
| 11 | Provider errors in reviews | any `error` event ends the attempt, a transient 429 fails closed (`core/local/overseer.ts:194`; LM-lim) | wait or retry; quota waits via quota-wait |
| 12 | Cheap refusals first | main-dirty only at the merge step (MGS §1) | main-dirty before the review [K 7.4] |
| 13 | Contact budget | 15 Opus overseer spawns and 3 steers per session branch (`overseer.budget`, `steerBudget`) | per-node budgets (§5.5); no session cap beyond the quota fallback |
| 14 | Escalation | persistent trip → Opus steer (on by default) or the fixed "spawn a debug-design card" (`core/local/hints.ts:22`, `core/local/steer.ts`) | breaker or failed check → (medium-effort child: one retry at xhigh, skipped at xhigh) → split → corrective card (a new bounded role) → hand-off → stop and report; steer as an arm |
| 15 | Child trips | `identical-call` and `alternation` only, from calls without results (`core/local/childtrips.ts`) | the full trip set and the breakers for package children (they need child tool results: actor API, pi-setup) |
| 16 | Spot-checks | the parent spawns a review card and judges it (`core/spotcheck.ts`) | bounded, router-judged tickets on the three samples (§5.5) |
| 17 | Batching | none | §5.5, as factors |
| 18 | Plans | one level: Opus authors a skeleton, ≤ 5 tasks per milestone, 900 s timeout (`core/local/planflow.ts`, `core/local/plan.ts`); records live in their session (LM-lim) | plan nodes with children/text budgets, local splitting, cloud plan reviews at the chosen points; the local main drafts the top-level plan (E16); the tree lives within one coordinating session, the main starting every node's children (§5.2) [Dec] |
| 19 | Context | `contextSoftTokens` 32000 (`core/settings.ts:95`); no fold policy; no uncached breaker | 64k hint for children (32k arm), 96k for the main; fold the main only at package boundaries or ≥ 200k (through the folding extension's per-model settings or a hint); the 64k uncached breaker |
| 20 | Thinking | `qwen-local` `efforts: ["xhigh"]` (`core/settings.ts:31`) | `medium` too; child effort and budget arms through the per-session payload hook (§5.7) |
| 21 | Model facts | members copy `contextWindow` etc. (`core/settings.ts:30–33`); the registry is read only for `/force` (`core/forceinstall.ts:22–29`) | read model facts from pi's registry |
| 22 | Local queue | `slots: 1` serialises local children; the main is not counted (LM-design N4, OQ19) | one local stream at a time, main included, and qwen reviews (E17); queue waits logged |
| 23 | Quota | provider blocks after errors (`core/failover.ts`); OpenRouter free cap (`core/freecap.ts`, likely dead [K 2.14]) | the router reads rate-limit headers itself; quota-wait events complement; the fallback rule (§5.6) |
| 24 | Randomization | `randomize` (level-up share, `core/randomize.ts`), spot-check share; arms read from `__piExperimentsApi_v1` (`core/shell.ts:56–83`) | one router-owned randomizer for E2–E18 with the arm on each line, staged (§6); the experiments read leaves; shipping defaults per profile and user-defined delegation rules are the owner's wish (backlog) |
| 25 | Logs | `hint`, `review`, `merge`, `plan`, `gatebypass`, `spawn` (`core/outcome.ts`, `docs/outcome-log.md`) | §5.8 content; pi-economics' `log-contract` and consumer copy follow |
| 26 | Cloud-first | default mode | unchanged; `router-golden` not re-recorded |
| 27 | Merge queue | the gate refuses `behind` when the target is not an ancestor of the branch and the agent rebases in its worktree; no queue per target branch, no router-driven rebase or recheck (`core/local/merge.ts:24, 35, 53, 324`; `behind` is relative to `main.sha`, retargeting is gap 5) | one lock per parent branch from rebase to fast-forward: acquire → rebase onto the parent's tip → deterministic checks → review (a rebased tree is re-reviewed; reuse keyed on commit and tree) → ff-only merge → release (LD7 holds); conflict or red check releases the lock, one bounded fix by a fresh local child, then the ladder from its first step; state persisted in the main's tree state; lock waits and re-reviews logged (§5.2, §5.8) |
| 28 | Child brief and tools | one brief and tool set for every local child | lean arm: minimal brief and about a dozen tools, as a factor (E18, §5.7) |

## 8. Left to the builder

- Names: settings keys, the switch command, tools, events and fields; the
  module options in `modules/task-router.nix` and their assertions (each with
  a negative case).
- Where the code lives (`core/local/` or a sibling) and how child sessions
  get the router's guards and trip results. Changes to pi-setup's patched
  actor API that this needs are cross-repository milestones of the plan, like
  the router extraction (orchestrator's call; the `iface-*` checks follow).
- The format of a split plan committed to a node's branch and how the router
  validates it; how an estimate states inert work (tier `inert` is unlimited);
  which rate-limit headers each provider gives and what the router does when
  they are absent.
- The queue mechanism (spawn policy, a pause of the main's next request, or
  both) and its interaction with `queueMaxSec`.
- The merge queue mechanism: how the gate serialises merges per parent branch
  (the lock and the queue persisted in the main's tree state, a session entry
  like the plan records, so they survive a fold or a resume), how a waiting
  child is held, and how the rebase and the bounded fix are driven; the
  semantics (lock scope, review after rebase, ff-only merge) are fixed in
  §5.2. Distinct from the local request queue above.
- The lean child's brief text and which dozen tools it gets.
- Where a package's size estimate comes from (a card or split field the agent
  fills; the router compares it with the actual).
- The fit-check brief, the corrective-card and spot-check payloads, the batch
  review's input.
- The randomizer (seeding, recording, how arms combine) and the staging of
  factors, per the staging in §6.
- Tests first, per `AGENTS.md`. Done means fakes in the checks (§5.7: no
  agent-run live tests); the manual runbooks of local mode (G1–G10 in
  `docs/local-mode/limitations.md`) are owner-run, before any live arm.

## 9. Open points

O1–O12 and the builder check's questions are settled in r4 (the owner's
answers in §11, the orchestrator's calls in §12; each is placed where it
applies). O13 is closed in r5: `cache-ram` went on 2026-11-13 (the owner),
and no local pi session has run with it yet, so E1 splits the meter by that
day (§6). r6 adds none: the merge queue's mechanism and the lean child's brief
are the builder's (§8). No point is open.

## 10. Components and owners

| Component | Owns | Repository |
|---|---|---|
| task-router | profiles, packages and the tree, size, classes, reviewers, contacts, breakers, the local queue, the randomizer, the outcome log | this one |
| actor-subagents (patched) | child sessions, the spawn-policy API the router builds on; the API changes the plan needs are cross-repository milestones | pi-setup |
| quota-wait | waiting at an exhausted quota window, its events; for this plan only the consumed contract | its own (via pi-setup) |
| pi's `models.json` | the model list (optionally written by pi-setup) | the user's agent dir |
| llama-server | serving, wherever it runs | the owner's host |
| pi-economics | measurement, cost units, curves, the bench, revert detection from the router's merge log | pi-economics |

## 11. Decisions (owner, 2026-11-13)

They answer r2's questions Q1–Q16 and the later rounds; the authoritative
record is kept with the author's configuration.

1. **Profiles:** two, local-first and cloud-first (as today); no -only
   variants yet; latency is no goal. Per-session router mode, default
   configurable, switchable at any time; sets the local start model at
   `session_start` only if the user has not chosen; pi-setup's default model
   as the fallback. The router never switches the main back; a router-picked
   main is a later experiment.
2. **Contact points** to compare: merge-gate cloud review (binding, small
   packages), cloud spot-checks, cloud plans/local executes, local escalates
   on failure. Not a local self-review tie-breaker. Every contact is usually
   a cold prefill: do not overdo them; different complexity is reviewed by
   different agents.
3. **Size tiers:** small 60 / standard 150 / large 300 / inert unlimited;
   elevated capped at standard; the tier randomized per session. Lines cap
   review load; blast radius is the class's job.
4. **Size mechanics:** hints at 80 % and 100 % only, never a block; a
   crossing escalates to the next tier's reviewer (beyond large: Opus); every
   crossing logged (when, how much, estimate vs actual, work kind). Fact: the
   router already has a deterministic size monitor (main session only).
5. **Reviewer** = the stronger of risk class and size tier: small Sonnet
   (Haiku advisory if inert-like), standard Sonnet vs Opus randomized, large
   Opus, elevated Opus in a fresh session plus an orthogonal check; the
   ">400 lines → elevated" rule dropped. *Superseded in r6 for small and
   inert-like packages: qwen3.8 as the reviewer in the E17 arm (item 26).*
6. **Execution:** a fresh local child per package, task and branch; the main
   coordinates; the router gives the budgets at session start and prefers
   smaller packages.
7. **Hierarchy:** divide and conquer as needed, ≤ 5 children per node, depth
   cap 3 at the start, depth and fan-out logged, flat vs recursive as an
   experiment; node = branch + worktree, children branch off the parent and
   merge back through the gate; a local fit check and the checks per level
   (*superseded in r6: no size check at merge, the fit check advisory with a
   fix package on a miss, a merge queue; items 24–25*); do-or-split by the local agent, mandatory split on size estimate > tier,
   breaker trip or failed check; deterministic size mechanics; budgets per
   work kind (plan/spec: children and text length, ~150 plan lines per node;
   implementation: changed code lines), values experimented.
8. **Review points:** top-level plan (> 1 child or elevated), integration of
   a node with combined diff > 150 or elevated, leaves per class/tier, a plan
   review at every level — all as experiment arms, fewer contacts preferred.
9. **Contacts per node:** leaf ≤ 2 review rounds; plan and integration
   reviews on their own nodes; escalation ≤ 1 bounded corrective + ≤ 1
   open-ended agent, then stop and report; spot-checks a separate 10 %
   sample; all values experiment factors.
10. **Escalation:** breaker → one bounded corrective card (Sonnet standard,
    Opus elevated) → hand-off one tier up → stop and report; an Opus steer
    only as an arm.
11. **Spot-checks:** bounded, router-judged, on the inert audit sample,
    ungated local output and a shadow sample of gate reviews; rate 0.1.
12. **Batching:** consecutive small/inert packages up to the 150-line cap for
    one review, elevated never; batching on/off and the cap are factors.
13. **Targets:** cost per accepted package ≤ 0.1× cloud-only (quota points,
    API-eq $, local EUR); acceptance ≥ 0.9× cloud-only and no revert within 7
    days; baseline cloud-only. No research on complexity measures beyond
    lines for now.
14. **Quota:** no thresholds; an own quota-wait extension (separate
    repository, via pi-setup) waits at exhaustion and emits events that
    pi-economics meters; fallback: concurrency cap 2, q5h 80 % rule,
    elevated waits, standard drops a tier. pi-retry is dropped.
15. **Thinking:** main xhigh; package children xhigh vs medium 50/50; the
    medium arm's per-request budget is a factor, 16k / 32k / unbounded
    (verify llama.cpp support on our build).
16. **Context:** soft hint 96k; fold the coordinating main only at package
    boundaries or ≥ 200k; breaker at ≥ 64k uncached per request; values
    experimented. *Superseded in r6 for local children: soft hint 64k with a
    32k arm (item 27); the main keeps 96k, its fold rule and the breaker.*
17. **Serving:** independent of where llama-server runs; pi's `models.json`
    is the only model list (Nix-managed optionally); the router reads model
    facts from pi's registry; `maxTokens` 131072; the router queues local
    sessions (one local request stream at a time); no server-side
    experiments. `cache-ram` is already on and very recent: the re-prefill
    numbers predate it and are re-measured.
18. **Costs:** experiments compare on API-equivalent $ (cloud) and EUR by
    active time (local, 0.13 EUR/h to start); quota is the budget plus a
    calibration check; result as per-factor trade-off curves and a final
    cost-vs-quality curve, optionally one number at a configurable rate. The
    router randomizes its own levers.

### r4 answers (owner, 2026-11-13)

19. **Node children:** a node's agent decides do-or-split; on a split it
    commits a split plan to its branch and ends, and the coordinating main
    starts the children. No nested sessions (single slot) (§5.2).
20. **Mandatory split:** binding only at start: `start_branch` refuses when the
    stated estimate exceeds the tier, and the refusal says how to split. After
    a breaker trip or a failed check, a split is the first escalation step,
    then the cloud ladder. Crossings during the work stay hints plus the next
    tier's reviewer (§5.2, §5.3, §5.5).
21. **Top-level plan:** the local main drafts it, bounded cloud contacts
    review it; Opus writing the plan is an experiment arm (E16) (§5.2).
22. **Quota source:** the router reads the rate-limit headers itself;
    quota-wait's events complement (§5.6).
23. **FYI, not now:** routing strategies should become composable and
    user-definable, like pi-workflows; a design constraint on the seams
    (§5.9).

### r6 answers (owner, 2026-11-17)

24. **Merge-back per level:** no size check runs at merge; size only sets a
    leaf's budget and reviewer. The deterministic checks (the parent's plus
    every merged child's) run on the combined result; the local fit check is
    advisory, and a miss enters the escalation (split first, then the cloud
    ladder) (§5.2; how a miss is handled: §12 item 16).
25. **Merge queue:** merges into one parent branch are serialised in the
    router's merge gate: rebase onto the parent's current tip, rerun the
    deterministic checks, merge; a conflict or red check sends the child back
    for one bounded fix, then the ladder. State in the main's tree state, no
    extra process; not the local request queue (§5.2, §5.7, §7 gap 27; the
    order of the steps: §12 item 14).
26. **qwen3.8 as reviewer:** for small and inert-like packages, qwen3.8 vs
    Sonnet 50/50 as an arm (E17); a fresh session, never the author's; the
    10 % spot-check sample covers qwen-reviewed packages; one local slot,
    time not $ (§5.4, §5.5; the arm's definition: §12 item 15).
27. **Children's context and brief** (from the single-repo research): the
    local children's soft hint 64k instead of 96k plus a 32k arm (E14); the
    main's fold rule and the 64k breaker stay; lean local children (minimal
    brief, about a dozen tools) as a factor (E18) (§5.7).
28. **Strategy layer:** the owner's development loop (design and architecture
    → conceptual overview reviewed by the owner → spec → plan → plan review
    by a subagent → implementation → final review) is the first workflow a
    strategy layer must express, configurable per stage (§5.9).
29. **Follow-ups, not in scope now:** a Tree-sitter code-graph tool for local
    children, the edit format, a complexity measure beyond lines, short
    decision records, repository fine-tuning (§5.9).
30. **Escalation retry:** a medium-effort child's first escalation step after
    a failed check or breaker is one retry at xhigh, a local step, before the
    split (owner approved 2026-11-17); a child already at xhigh skips it
    (§5.2, §5.5, §7 gap 14).

## 12. Orchestrator's calls (r4 and r6), for the owner to check

Minor calls made where the decisions were silent; each is marked inline. The
owner may overrule any of them.

1. The reviewer is chosen by the *actual* changed lines (the stronger of the
   class's reviewer and the actual-size tier's); the drawn tier only sets the
   budget and the hints; a crossing is logged against the drawn tier (§5.3,
   §5.4).
2. The plan includes pi-setup's actor API changes as cross-repository
   milestones, like the router extraction; quota-wait is only a consumed
   contract (§5.6, §8, §10).
3. The experiments are staged: the randomizer framework and a first subset
   (E0, E1, then E2/E3, E12/E13, E4/E5); the tree and review-point factors
   after the tree exists, E6 only then (§6).
4. Reverts within 7 days are computed by pi-economics' analyser from the
   router's merge log (sha, branch, repository per merge) (§5.8).
5. Done means fakes in the checks; no agent-run live tests. Liveness and
   configuration through llama-server's `/health`, `/props`, `/slots`; the
   `thinking_budget_tokens` support read from the build version and the
   docs/source; re-prefill cost measured passively from the meter's
   `timings`; an owner-run `curl` probe only if the docs stay ambiguous
   (§5.7, §6 E1, §8).
6. O1: changed lines = added + deleted, as `merge.ts` computes (§5.3).
7. O3: for a diff far above `large` the Opus reviewer gets the numstat, the
   check output and the riskiest hunks, logged as an over-cap review (§5.3).
8. O5: the cloud-only baseline = the bench plus a minority arm of cloud-first
   sessions with local members off (§6 E0).
9. O6: batching = consecutive small/inert leaves merge into their parent's
   branch with checks; one review of the accumulated parent diff, up to the
   cap (§5.5).
10. O7: the router sets `thinking_budget_tokens` in the request payload per
    session in `before_provider_request`, after verifying the build (§5.7).
11. O8: "inert-like" = every file of inert class, or tests/docs only, no code
    (§5.4).
12. O9: the request node is level 0, up to 3 levels below (§5.2).
13. O12: factor order — size tiers, children's thinking, batching (§6).
14. (r6) Merge queue order: one lock per parent branch from the rebase to
    the fast-forward (acquire → rebase → checks → review → ff-only merge →
    release), so the merged tree is the reviewed tree (LD7); a rebased tree is
    re-reviewed; a conflict or red check releases the lock and a fresh local
    child gets one bounded fix, then the ladder from its first step; the
    queue is persisted in the main's tree state (§5.2, §7 gap 27, §8).
15. (r6) E17 defined: two strata, 50/50 each (small: qwen3.8 vs Sonnet, both
    binding; inert-like: qwen3.8 vs Haiku, both advisory; the inert class
    stays unreviewed in the audit sample); qwen never reviews standard or
    above and never decides whether the cloud is called; unavailable →
    fallback to the cloud reviewer, intention to treat; shadow reviewer Opus
    at the same 10 % in both arms; escape = shadow-review defect, later
    failing check or revert within 7 days; long-running, escape rate per arm
    with a CI, stop only for harm (§5.4, §6).
16. (r6) The fit check blocks no merge; a miss creates one fix package on the
    parent node (a fresh local child on the parent's branch, the normal gate);
    if that fails, the ladder from its first step; "split" applies only to an
    unmerged package (§5.2).
17. (r6) The main's soft hint stays at 96k; 64k/32k is for children (§5.7).
