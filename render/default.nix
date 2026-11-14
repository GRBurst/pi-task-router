# The pi package manifest (pi-economics spec D1, §4.1; adapted from pi-economics
# 3d0f2e1). The root `package.json`, what a pi user without Nix installs, is
# the output of this flake's module evaluated for one fixture, F_P, through the
# checks' Home Manager evaluation (user `u`); only `nix run .#render` writes it
# into the checkout, and the check `render-package` compares the committed file
# with `tree`.
#
# The manifest maps registry names, never store paths (no
# import-from-derivation). F_P is pi-setup's module and this flake's with the
# router and the actor it needs on; of the registry (`programs.pi.extensions`)
# only this flake's entry `task-router` is mapped, to
# `./packages/task-router/index.ts`, and a registry without it is an evaluation
# error. Every other entry belongs to pi-setup or a consumer (the actor is a
# prerequisite the user installs) and is not mapped.
{
  lib,
  pkgs,
  home-manager,
  homeModule,
  setupModule,
}: let
  hm = import ../checks/lib/hm-eval.nix {inherit lib pkgs home-manager homeModule setupModule;};

  # One constant; the tag is `v` + version.
  version = "0.2.0";

  fp = hm.eval {
    programs.piTaskRouter.enable = true;
    programs.pi.actorSubagents.enable = true;
  };

  # `rawModule` skips Home Manager's assertion check: the render does it.
  failed = map (a: a.message) (lib.filter (a: !a.assertion) fp.assertions);

  own = let
    names = lib.attrNames fp.programs.pi.extensions;
  in
    assert lib.assertMsg (lib.elem "task-router" names) "render: the registry (programs.pi.extensions) has no task-router entry"; ["task-router"];
  entry = n:
    if builtins.pathExists (../packages + "/${n}/index.ts")
    then "./packages/${n}/index.ts"
    else throw "render: no package path for ${n}";

  # What pi itself provides (pi's packages documentation): peers, never bundled.
  host = [
    "@earendil-works/pi-agent-core"
    "@earendil-works/pi-ai"
    "@earendil-works/pi-coding-agent"
    "@earendil-works/pi-tui"
    "typebox"
  ];

  manifest = {
    name = "pi-task-router";
    inherit version;
    private = true;
    type = "module";
    license = "MIT";
    keywords = ["pi-package"];
    description = "Routes the pi coding agent's subagent spawns by task card: model and effort per task, cheapest fit with a queue wait, attempts, an outcome log and a local mode.";
    peerDependencies = lib.genAttrs host (_: "*");
    pi.extensions = map entry own;
  };

  tree = assert lib.assertMsg (failed == []) "render: F_P fails its assertions: ${lib.concatStringsSep "; " failed}";
    pkgs.runCommand "pi-task-router-rendered" {nativeBuildInputs = [pkgs.jq pkgs.gnugrep];} ''
      mkdir $out
      jq -S . ${pkgs.writeText "package.json" (builtins.toJSON manifest)} >$out/package.json
      # Hygiene: no store path in a rendered file.
      if grep -qF /nix/store $out/package.json; then
        echo "render: a store path in package.json" >&2
        exit 1
      fi
    '';

  # `nix run .#render`, from the repository root: the only writer of package.json.
  app = pkgs.writeShellApplication {
    name = "pi-task-router-render";
    runtimeInputs = [pkgs.coreutils];
    text = ''
      if ! { [ -f render/default.nix ] && [ -f packages/task-router/index.ts ]; }; then
        echo "run from the pi-task-router repository root" >&2
        exit 2
      fi
      cp --no-preserve=mode ${tree}/package.json package.json
    '';
  };
in {inherit fp own manifest tree app version;}
