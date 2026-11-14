# Every check of the flake. Build them one at a time, capped (pi-economics'
# AGENTS.md, "Commands"); never `nix flake check` without a memory cap. The
# infrastructure (leak, boundary, npm, typecheck, iface) is copied from
# pi-economics 3d0f2e1.
{
  self,
  pkgs,
  lib,
  home-manager,
  pi-setup,
  render,
}: let
  leakLib = import ./leak {inherit lib pkgs;};
  boundaryLib = import ./boundary {inherit lib pkgs;};
  npm = import ./npm {inherit lib pkgs;};
  typecheck = import ./typecheck {
    inherit lib pkgs;
    inherit (npm) nodeModules;
  };
  iface = import ./iface {inherit lib pkgs typecheck;};
  # The package checks' prelude (checks/pi-package).
  pkgPi = import ./pi-package/lib.nix {inherit pkgs lib self;};
  hm = import ./lib/hm-eval.nix {
    inherit lib pkgs home-manager;
    homeModule = self.homeModules.default;
    setupModule = pi-setup.homeModules.default;
  };
  # The patched actor-subagents, pi-setup's (`programs.pi.actorSubagents.package`'s default).
  actorSubagents = pi-setup.packages.${pkgs.stdenv.hostPlatform.system}.actor-subagents;
  # (M2.2) The patched source without upstream's tsconfig.json: tsc refuses
  # files named on its command line next to one (TS5112), and the type check's
  # flags are ours. package.json keeps the files ESM ("type": "module").
  actorSubagentsTs = pkgs.runCommand "actor-subagents-ts" {} ''
    mkdir $out
    cp -r ${actorSubagents}/extensions ${actorSubagents}/package.json $out/
  '';
  # (M4.5) The provider of the globalThis API __subagentsApi_v1 (spec §5.3).
  subagentsProvider = {
    src = actorSubagentsTs;
    file = "extensions/actor-subagents/api.ts";
    type = "SubagentsApiV1";
  };
in {
  leak = leakLib.check ../.;
  leak-selftest = leakLib.selftest;
  boundary = boundaryLib.check ../.;
  boundary-selftest = boundaryLib.selftest;
  npm-deps = npm.check;
  typecheck-harness = typecheck.selftest;
  iface-harness = iface.selftest;
  module-eval = import ./module-eval {inherit lib pkgs hm self pi-setup;};
  # The committed package.json against the render (render/default.nix).
  render-package = import ./render.nix {inherit lib pkgs self render;};
  # The manifest's laws, each named.
  pi-package-manifest = import ./pi-package/manifest.nix {
    inherit pkgs lib self;
    inherit (render) own;
  };
  # pi install of the repository, offline: the router alone warns once about the actor.
  pi-install-smoke = import ./pi-package/smoke.nix {inherit (pkgPi) installed;};
  # The npm step of the git route is a no-op offline.
  pi-git-route = import ./pi-package/git-route.nix {inherit pkgs self;};
  # The package next to pi-setup's patched actor: no warning, task_verdict.
  pi-install-actor = import ./pi-package/actor.nix {
    inherit (pkgPi) installed;
    actor = actorSubagents;
  };
  # (local mode L4.T17, design §3.0.4) Local mode next to the patched actor: the spawn API is found, the local tools.
  pi-install-local = import ./pi-package/local.nix {
    inherit (pkgPi) installed;
    actor = actorSubagents;
  };
  # The package next to the Nix link: the duplicate says so once.
  pi-install-duplicate = import ./pi-package/duplicate.nix {
    inherit lib pkgs self;
    inherit (pkgPi) installed;
    inherit (render) own;
  };
  # The package in two scopes of one project: exactly one copy is bound.
  pi-install-scope-replaced = import ./pi-package/two-scopes.nix {
    inherit lib;
    inherit (pkgPi) installed;
    inherit (render) own;
    variant = "replaced";
  };
  pi-install-scope-both = import ./pi-package/two-scopes.nix {
    inherit lib;
    inherit (pkgPi) installed;
    inherit (render) own;
    variant = "both";
  };
  # The Nix route under real pi: the router's agent directory, pi -p offline.
  nix-route-smoke = import ./pi-package/nix-route.nix {inherit lib pkgs hm;};
  # The rendered home files: the registry path and the settings file the router reads.
  home-files = import ./home-files {inherit lib pkgs hm;};
  # (M5.1) The task-router tests run when it builds (spec §8.1, "Package tests").
  task-router = self.packages.${pkgs.stdenv.hostPlatform.system}.task-router;
  # (M5.4) The decisions of R', recorded once (spec §6.3).
  router-golden = pkgs.callPackage ./router-golden {};
  # (M5.5)
  typecheck-task-router = typecheck.typecheck {
    name = "task-router";
    src = ../packages/task-router;
  };
  # (M5.6) The router's copy of __subagentsApi_v1 (spec §5.3, §8.1).
  iface-subagents-task-router = iface.compare {
    name = "subagents-task-router";
    provider = subagentsProvider;
    consumer = {
      src = ../packages/task-router;
      file = "core/api.ts";
      type = "SubagentsApiV1";
    };
  };
  # (L4.T4) The other direction: the router's PolicyResult must fit the patched actor's
  # (childTools, cwd, an async toolGuard; spawn-api patch).
  iface-policy-task-router = iface.compare {
    name = "policy-task-router";
    provider = {
      src = ../packages/task-router;
      file = "core/api.ts";
      type = "PolicyResult";
    };
    consumer = subagentsProvider // {type = "PolicyResult";};
  };
  # (T2.1) The router's runtime check of __subagentsApi_v1 (core/runtime-guard.ts).
  iface-subagents-runtime-guard = iface.compare {
    name = "subagents-runtime-guard";
    provider = subagentsProvider;
    consumer = {
      src = ../packages/task-router;
      file = "core/runtime-guard.ts";
      type = "SubagentsApiShape";
    };
  };
}
