# The task-router (spec §2, §6): routes subagent spawns by task card through
# actor-subagents' spawn policy. Main session only: children do not route, and
# the router's policy, guards and outcome log belong to the orchestrator.
# (router extraction §7.1) `programs.piTaskRouter`, next to pi-setup's module:
# it registers into `programs.pi.extensions`, writes under `programs.pi.agentDir`
# and needs `programs.pi.actorSubagents`.
{
  config,
  lib,
  pkgs,
  ...
}: let
  p = config.programs.pi;
  cfg = config.programs.piTaskRouter;
in {
  options.programs.piTaskRouter = {
    enable = lib.mkEnableOption "the pi task-router extension (card-based routing of subagent spawns; requires programs.pi.actorSubagents)";
    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ../packages/task-router/package.nix {};
      defaultText = lib.literalExpression "pkgs.callPackage <pi-task-router>/packages/task-router/package.nix { }";
      description = "The extension (package.json, index.ts, core/); its tests run when it builds.";
    };
    # (M5.9)
    settings = lib.mkOption {
      type = lib.types.attrsOf (pkgs.formats.json {}).type;
      default = {};
      example = {
        models = {
          qwen-local.health = "http://localhost:11545";
          haiku.model = "";
        };
        queueMaxSec = 60;
      };
      description = ''
        Written to `<programs.pi.agentDir>/task-router/settings.json` when non-empty.
        Free-form (spec §6.2): every key has a default in the package's
        core/settings.ts, which owns the schema, so `{}` writes no file.
        `models` and `importanceTable` merge over the defaults:
        `models.<member>` field by field over the default member, and
        `model = ""` removes it; a table cell that is given replaces the
        default cell. `randomize` and `spotCheck` default to
        `enabled = false`. The rollback to the routing before the new
        defaults: `lib.importJSON` of the package's
        `test/fixtures/today-config.json` as the settings.
        `programs.pi.router.localHealthUrl`, when set, is
        `models.qwen-local.health`.
      '';
    };
    # (local mode L1.T7, design §2.1)
    localMode.enable = lib.mkEnableOption "local mode: a local model drives the main session (writes settings.mode = \"local\")";
  };

  config = lib.mkMerge [
    {
      # (local mode L1.T7) Outside the mkIf: this one fires when the router is off.
      assertions = [
        {
          assertion = !(cfg.localMode.enable && !cfg.enable);
          message = "pi-task-router: programs.piTaskRouter.localMode.enable requires programs.piTaskRouter.enable";
        }
      ];
      # (router extraction §7.1) The local model's health URL, as pi-setup's economics bridge
      # set it for the router inside pi-economics; a given health of the same member conflicts.
      # The mkIf wraps the whole value: on the leaf alone it would leave `models.qwen-local = {}`.
      programs.piTaskRouter.settings = lib.mkIf (p.router.localHealthUrl != null) {
        models.qwen-local.health = p.router.localHealthUrl;
      };
    }
    (lib.mkIf cfg.enable {
      # (M5.8) Main session only.
      programs.pi.extensions.task-router = {
        path = "${cfg.package}";
        # The source, not the package: probing a build output would be
        # import-from-derivation.
        checkPath = ../packages/task-router/index.ts;
        forChildren = false;
        description = "Routes subagent spawns by task card: abilities and levels per model, cheapest-fit selection with a queue wait, attempts and an outcome log (<agentDir>/task-router/outcomes/YYYY-MM.jsonl); registers the task_verdict tool.";
      };
      # (M5.9) Literal text (spec §4): checks read it with builtins.fromJSON.
      home.file."${p.agentDir}/task-router/settings.json" =
        lib.mkIf (cfg.settings != {}) {text = builtins.toJSON cfg.settings;};
      # (M5.10) A hard dependency (spec §4.1).
      assertions = [
        {
          assertion = p.actorSubagents.enable && (p.actorSubagents.package.passthru.spawnPolicyApi or 0) >= 1;
          message = "pi-task-router: programs.piTaskRouter requires programs.pi.actorSubagents with passthru.spawnPolicyApi >= 1 (the router registers through registerSpawnPolicy, and shell.ts swallows its absence: without the patched build the router does nothing)";
        }
        # (local mode L1.T7, design §2.1) A settings.mode other than "local" contradicts the switch.
        {
          assertion = !cfg.localMode.enable || (cfg.settings.mode or "local") == "local";
          message = "pi-task-router: programs.piTaskRouter.localMode.enable needs programs.piTaskRouter.settings.mode = \"local\" (found ${builtins.toJSON (cfg.settings.mode or null)})";
        }
        # (local mode L4.T15, design §3.0.4) The overseer spawns through the spawn-api patch's api.spawn.
        {
          assertion = !cfg.localMode.enable || (p.actorSubagents.package.passthru.spawnPolicyApi or 0) >= 2;
          message = "pi-task-router: programs.piTaskRouter.localMode requires programs.pi.actorSubagents with passthru.spawnPolicyApi >= 2 (the overseer spawns review agents through the API's spawn and childTools)";
        }
      ];
      # (local mode L1.T7, design §2.1) mkDefault: a user's settings.mode wins (and fails the assertion above); the file is
      # written even for settings = {}.
      programs.piTaskRouter.settings.mode = lib.mkIf cfg.localMode.enable (lib.mkDefault "local");
    })
  ];
}
