# pi-task-router: rules for agents

The pi coding agent's task-router as a Home Manager module
(`programs.piTaskRouter`, next to pi-setup's `programs.pi`) and as a pi
package. Module contract: `docs/task-router.md`; the outcome log's schema:
`docs/outcome-log.md`. Markdown lives under `docs/`, except this file and
`README.md`.

Comments cite the design records and the milestone plans (`spec §n`, decisions
`D…`, tasks `T…`, `M…`, `L…`, plans by name). They were written while the
router was part of pi-economics and of the author's system configuration; the
citations are provenance, not required reading. This repository holds no
plans, except the two historical local-mode plans that came with
`docs/local-mode/`; the author keeps the others with their system
configuration.

## Commands

If a sandbox denies `~/.cache/nix`, point `XDG_CACHE_HOME` and
`XDG_DATA_HOME` at a writable cache directory before running `nix`.

The flake is read through git, so Nix sees only files in the index:
`git add` a new file before building.

Checks, one capped `nix build` each; never `nix flake check` without a memory cap:

    F=git+file://$PWD o=(--option eval-cache false) cap=$((20 * 1024 * 1024))
    names=$( (ulimit -v $cap && exec timeout -s KILL 300 nix eval --json "$F#checks.x86_64-linux" --apply builtins.attrNames "${o[@]}") ) &&
      names=$(jq -er '.[]' <<<"$names") || echo "LISTING FAILED"
    for c in $names; do
      (ulimit -v $cap && exec timeout -s KILL 900 nix build --no-link -L "$F#checks.x86_64-linux.$c" "${o[@]}") || echo "FAILED $c"
    done

Formatter: Alejandra. `nix build "$F#formatter.x86_64-linux" --no-link --print-out-paths`,
then `<out>/bin/alejandra <files>`.

Commits are unsigned: `git -c commit.gpgsign=false commit`, as `GRBurst` with
GitHub's noreply address (the repository's git config).

## Versions

One version: the constant `version` in `render/default.nix` (the tag is `v` + it). A release edits the constant, the
`"version"` line of `packages/task-router/package.json` (`render-package` fails until they equal it) and the README
install line (`readme-package` compares it with the root `package.json`), then `nix run .#render` writes the root
`package.json`. The Nix derivation name (`pi-task-router-<version>`) follows the package's manifest.

## Rules

- Tests first: every change starts with a failing check; a new check is seen red once.
- Checks match rendered text with `lib.hasPrefix`, `lib.hasSuffix`,
  `lib.splitString "\n"` or `builtins.replaceStrings [x] [""] t != t` (an infix
  test without a regex), never with `builtins.match` or `lib.hasInfix` on a
  large text (`hasInfix` is `builtins.match ".*x.*"`: a backtracking regex that
  can hang evaluation or overflow the stack; it is fine for a short string).
- Every assertion's message starts with `pi-task-router:` and has a negative
  case in `checks/module-eval/cases/`.
- No import-from-derivation: assertions probe source paths (`checkPath`),
  checks read option values.
- The leak check scans every tracked file, without exclusion: no e-mail
  addresses (any case), home paths of named users (`/home/<name>`, quoted or
  not), `git+ssh` URLs, private (RFC 1918) or Tailscale (CGNAT /10)
  addresses, LAN host URLs (`http://<one-label host>`, not `localhost`) or
  names under `.local`, `.lan`, `.home.arpa`, `.ts.net`; a worktree's `.git`
  file is skipped.
  Fixtures use the user `u` and hosts `localhost`, `*.invalid` or one letter.
- Name only the extension this repository ships and pi-setup's actor it
  builds on. A consumer's own (a provider login, a search tool) appear in
  docs, option texts and tests under neutral names (`auth-ext`, `search-ext`,
  `my-login`); the `boundary` check fails on the names of particular setups
  (its term list in `checks/boundary/`), outside `NOTICE`, `LICENSE` and the
  root `flake.lock` (pi-setup's own inputs appear there; it scans contents,
  binary ones too, and file and directory names, in the spellings `x-y`,
  `x_y`, `xy`).
- The router's copies of the actor's API types (`__subagentsApi_v1`, the spawn
  policy) are compared with pi-setup's patched actor-subagents by `iface.compare`
  checks in `checks/default.nix` (`iface-subagents-task-router`,
  `iface-policy-task-router`, `iface-subagents-runtime-guard`); the sources
  hold no `tsconfig.json`.
- `flake.lock` changes only when a task needs it.
- The root `package.json` (the pi package manifest) is written only by
  `nix run .#render` and compared by `render-package`; never edit it by hand.
  It has extensions only, no `bin` and no skills (`pi-package-manifest`).
- One runtime guard, `packages/task-router/core/runtime-guard.ts`. `index.ts`
  wraps its body in `guardSingleCopy`, which claims the component and runs the
  body at `session_start`, never at load (pi may load a copy and drop it from
  the final set; only a copy that starts competes). Register nothing outside
  the guarded body. The body must not register flags or providers (pi reads
  them before `session_start`); it is also never run in a host that does not
  bind extensions.
- The claim protocol is shared with pi-economics' components and frozen: the
  line `const CHANNEL = "pi-economics:claim:v1";` (pi-economics'
  `runtime-guard-copies` check reads it), the payload `{component, path,
  owner?}`, the component key `task-router` and the warn-once set
  `globalThis.__piEconomicsWarned_v1`. `test/runtime-guard.test.ts` speaks the
  protocol by hand; changing any of it is a change of both repositories.
- The package checks (`checks/pi-package/`) run pi 1.4 offline and find loaded
  extensions by its `PI_TIMING=1` factory lines (undocumented, pinned to the
  locked pi).
- README is checked by the module-eval cases `readme` (the Home Manager
  example evaluates without failed assertions) and `readme-package` (the
  install line = the manifest's version, the prerequisites row, the duplicate
  warning).

## Consumers outside this repository

This repository never imports or checks pi-economics. pi-economics reads it at
its router input, so a change of these breaks pi-economics at its next bump of
that input; say so in the commit message:

- the outcome log's schema, owned here: `docs/outcome-log.md` (its versioning
  rule); pi-economics keeps a consumer copy (`core/contract.ts`, the examples
  in its `LOGS.md`) and proves it by its `log-contract` check;
- `log-contract` imports `packages/task-router/test/harness.ts`,
  `test/fake-git.ts` and the exports `TRIPS` (`core/local/tripwires.ts`),
  `ROLES` (`core/local/overseer.ts`), `REASONS` (`core/local/merge.ts`),
  `TRIGGERS` (`core/local/plan.ts`), `PLAN_TYPE` (`core/local/plans.ts`) and
  `BRANCH_TYPE` (`core/local/branches.ts`);
- `iface-experiments-task-router` reads `core/shell.ts`'s `ExperimentsApi`.
  The `__piExperimentsApi_v1` read is optional (the router falls back to its
  own settings) and leaves with the pi-economics redesign;
- the claim protocol (Rules).

The author's system configuration replays the package's `test/`.
