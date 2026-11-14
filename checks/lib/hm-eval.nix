# Home Manager evaluated as its modules/default.nix does (`rawModule`), without
# `moduleChecks`: that wrapper throws on the first failed assertion, and the
# negative cases must read config.assertions and their messages (pi-economics
# plan M0, D4). A Home Manager update that moves these two files fails here, at
# evaluation. Copied from pi-economics 3d0f2e1; the router's options live next
# to pi-setup's, so every evaluation imports pi-setup's module (`setupModule`).
{
  lib,
  pkgs,
  home-manager,
  homeModule,
  setupModule,
}: let
  hmLib = import "${home-manager}/modules/lib/stdlib-extended.nix" lib;
  hmModules = import "${home-manager}/modules/modules.nix" {
    inherit pkgs;
    lib = hmLib;
    check = true;
  };
  user = {
    home.username = "u";
    home.homeDirectory = "/home/u";
    home.stateVersion = "26.05";
  };
  evalWith = modules:
    hmLib.evalModules {
      modules = modules ++ [user] ++ hmModules;
      class = "homeManager";
      specialArgs.modulesPath = "${home-manager}/modules";
    };
in {
  # The config of a case module, with pi-setup's module and this flake's imported.
  eval = module: (evalWith [setupModule homeModule module]).config;
  # pi-setup's module alone: the baseline the router adds to.
  evalSetup = module: (evalWith [setupModule module]).config;
  # The option declarations, for checks on an option's type.
  options = module: (evalWith [setupModule homeModule module]).options;
}
