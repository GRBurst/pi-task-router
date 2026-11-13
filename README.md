# pi-task-router

Routes the [pi](https://github.com/earendil-works/pi) coding agent's subagent
spawns by task card. A spawn names the ability and level it needs; the router
runs it on the cheapest member that has them (a local model, a free-cloud
model, Haiku, Sonnet, …), waits a bounded time for a busy pool, moves a child
off a failing provider, escalates a re-spawn one level, and logs spawns, moves
and verdicts to an outcome log. `/force` fixes the model for the next spawns.
Local mode serves a main session that runs on a local model: hints, an Opus
overseer, worktree branches, a merge gate and plans.

A Home Manager module (`programs.piTaskRouter`) and a pi package. Extracted
from [pi-economics](https://github.com/GRBurst/pi-economics) at `3d0f2e1`,
with its history.

Every option, its default and its effect, local mode and the scout gate:
[`docs/task-router.md`](docs/task-router.md). The outcome log's format:
[`docs/outcome-log.md`](docs/outcome-log.md). The local-first design (not built):
[`docs/local-first/design.md`](docs/local-first/design.md).

## Use

The module sets options of [pi-setup](https://github.com/GRBurst/pi-setup)'s
module (`programs.pi`): it registers the extension in pi-setup's registry
(`programs.pi.extensions`) and routes through pi-setup's patched
pi-actor-subagents (`programs.pi.actorSubagents`). Add both flakes as inputs
and let them follow your `nixpkgs` and `home-manager`:

```nix
inputs = {
  nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  home-manager = {
    url = "github:nix-community/home-manager";
    inputs.nixpkgs.follows = "nixpkgs";
  };
  pi-setup = {
    url = "github:GRBurst/pi-setup";
    inputs.nixpkgs.follows = "nixpkgs";
    inputs.home-manager.follows = "home-manager";
  };
  pi-task-router = {
    url = "github:GRBurst/pi-task-router";
    inputs.nixpkgs.follows = "nixpkgs";
    inputs.home-manager.follows = "home-manager";
    inputs.pi-setup.follows = "pi-setup";
  };
};
```

Import `inputs.pi-setup.homeModules.default` and
`inputs.pi-task-router.homeModules.default` in your Home Manager configuration
(this flake's module does not import pi-setup's), keep pi-setup's
`programs.pi.enable` on (it links the registry into `<agentDir>/extensions`)
and enable the router:

<!-- checked: checks/module-eval/fixtures/readme-example.nix -->
```nix
{
  # pi-setup's patched subagent runner: the router routes through its
  # spawn-policy API.
  programs.pi.actorSubagents.enable = true;
  programs.piTaskRouter = {
    enable = true;
    # Optional: a local model server, with a pi provider named `llama` in
    # your models.json. Without one answering on `health`, the router
    # routes on to the next member.
    settings.models."qwen-local" = {
      model = "llama/qwen3.8";
      health = "http://localhost:11545";
    };
  };
}
```

The router needs the patched actor (an assertion says so; local mode needs its
spawn API as well). It follows pi-setup's agent directory,
`programs.pi.agentDir` (`.pi/agent` by default): the settings file is
`<agentDir>/task-router/settings.json`, the outcome log
`<agentDir>/task-router/outcomes/YYYY-MM.jsonl`. pi-economics'
`programs.piEconomics.agentDir` is not forwarded to it: keep the two equal.

## Without Nix

The repository is also a pi package with one extension, the router:

```sh
pi install git:github.com/GRBurst/pi-task-router@v0.2.1
```

Its settings are `~/.pi/agent/task-router/settings.json` (keys and defaults:
`packages/task-router/core/settings.ts`); without the file the defaults hold.

### Prerequisites

| Package | Used by | Without it |
|---|---|---|
| pi-actor-subagents | required by `task-router` (spawn-policy API) | the router warns once and routes nothing (no `task_verdict`, no task cards, no nudge; its effort guard stays on). The router's local mode needs the actor's spawn API (the third patch): with an actor that lacks it, local mode warns once, refuses every merge and offers no plans. Patched build via pi-setup's Nix module (`programs.pi.actorSubagents`); upstream support pending. |

### Together with the Nix module or pi-economics

When two copies of the router are loaded, the first one pi starts runs and the
other stays inert. This holds for the package next to the Nix module, for the
package in two scopes, and for the router a pi-economics 0.1.x package or Nix
input still carries (both claim the same component); a copy that pi loads and
then leaves out (a user-scope package that a project entry replaces) takes no
part. The inert copy says so once at start
(`pi-task-router: task-router is loaded twice`, or the `pi-economics:` text of
an older copy). Keep one: `pi remove <source>`, or switch it off in Nix.

## Requirements

Home Manager on Linux (the checks run on `x86_64-linux`) and the pi coding
agent: the package checks install and start it under pi 1.4 offline
(`checks/pi-package`), the extension declares `>=1.0.0`. Nothing is installed
globally: the module links the extension into `<agentDir>/extensions` through
pi-setup's registry.

## Development

`AGENTS.md` has the commands: one capped `nix build` per check, never
`nix flake check` without a memory cap, Alejandra for formatting. Every change
starts with a failing check.

Comments cite the design records and the milestone plans (`spec §n`, decisions
`D…`, tasks `T…`, `M…`, `L…`, plans by name). They were written while the
router was part of pi-economics and of the author's system configuration; the
plans are kept there, except the local-mode plans in `docs/local-mode/`. The
citations are provenance, not required reading.

## Licence

MIT, see [`LICENSE`](LICENSE).
