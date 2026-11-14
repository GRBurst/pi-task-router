# Cases for modules/task-router.nix (spec §4, §4.1, §5.1, §6.2; router extraction §7.1): the router's
# options are programs.piTaskRouter, it registers into pi-setup's registry (programs.pi.extensions),
# writes under programs.pi.agentDir and needs programs.pi.actorSubagents. pi stays off
# (programs.pi.enable): linking the registry is pi-setup's, the router's contract is the entry.
{
  lib,
  hm,
  self,
  pi-setup,
  expect,
}: let
  inherit (expect) eq holds failed;
  pr = cfg: cfg.programs.piTaskRouter;
  dirs = [".pi/agent" "custom/agent"];
  # tr: piTaskRouter options, null = not enabled; more: other programs.pi options.
  eval = dir: tr: more:
    hm.eval {
      programs.pi = {agentDir = dir;} // more;
      programs.piTaskRouter = lib.optionalAttrs (tr != null) ({enable = true;} // tr);
    };
  # pi-setup's module alone, with the same programs.pi options: the baseline.
  setupOnly = dir: more: hm.evalSetup {programs.pi = {agentDir = dir;} // more;};
  withActor = {actorSubagents.enable = true;};
  sorted = lib.sort lib.lessThan;
  targets = cfg: map (f: f.target) (lib.attrValues cfg.home.file);
  fileAt = target: cfg: lib.findFirst (f: f.target == target) null (lib.attrValues cfg.home.file);
  json = x:
    if x == null
    then null
    else builtins.fromJSON x.text;
  settingsAt = dir: cfg: json (fileAt "${dir}/task-router/settings.json" cfg);
  message = "pi-task-router: programs.piTaskRouter requires programs.pi.actorSubagents with passthru.spawnPolicyApi >= 1 (the router registers through registerSpawnPolicy, and shell.ts swallows its absence: without the patched build the router does nothing)";
  msgEnable = "pi-task-router: programs.piTaskRouter.localMode.enable requires programs.piTaskRouter.enable";
  description = "Routes subagent spawns by task card: abilities and levels per model, cheapest-fit selection with a queue wait, attempts and an outcome log (<agentDir>/task-router/outcomes/YYYY-MM.jsonl); registers the task_verdict tool.";
in {
  # (M5.8) Off by default: no registry entry, no file.
  task-router-off = let
    c = eval ".pi/agent" null {};
  in
    holds "no registry entry" (!c.programs.pi.extensions ? task-router)
    ++ eq "home.file targets" (sorted (targets c)) (sorted (targets (setupOnly ".pi/agent" {})));

  # (M5.8) On, with the actor: one registry entry (main session only, the flake's package, the
  # source's index.ts as checkPath), no settings file, nothing else changed.
  task-router-defaults = lib.concatMap (dir: let
    c = eval dir {} withActor;
    e = c.programs.pi.extensions.task-router;
    base = setupOnly dir withActor;
  in
    eq "registry entry (${dir})" {inherit (e) path input forChildren;} {
      path = "${(pr c).package}";
      input = null;
      forChildren = false;
    }
    ++ holds "checkPath is the source's index.ts (${dir})" (lib.hasSuffix "/packages/task-router/index.ts" (toString e.checkPath))
    ++ holds "checkPath exists (${dir})" (builtins.pathExists e.checkPath)
    ++ eq "registry names (${dir})" (lib.attrNames c.programs.pi.extensions) (sorted (lib.attrNames base.programs.pi.extensions ++ ["task-router"]))
    ++ eq "home.file targets (${dir})" (sorted (targets c)) (sorted (targets base))
    ++ eq "drvPath (${dir})" (pr c).package.drvPath self.packages.x86_64-linux.task-router.drvPath
    ++ eq "failed assertions (${dir})" (failed "" c) []
    ++ eq "warnings (${dir})" c.warnings base.warnings)
  dirs;

  # (M5.9) settings: written as given under programs.pi.agentDir; {} writes nothing.
  task-router-settings = lib.concatMap (dir: let
    s = {queueMaxSec = 60;};
  in
    eq "settings file (${dir})" (settingsAt dir (eval dir {settings = s;} withActor)) s
    ++ eq "no file for {} (${dir})" (fileAt "${dir}/task-router/settings.json" (eval dir {} withActor)) null)
  dirs;

  # (F5.2) Models are configured through the settings (spec §6.2): the file holds them as
  # written; the package's settings test reads the same fixture.
  task-router-models = let
    x = lib.importJSON ../../../packages/task-router/test/fixtures/models-example.json;
  in
    eq "settings file" (settingsAt ".pi/agent" (eval ".pi/agent" {settings = x;} withActor)) x;

  # (T5.10) The registry text agents read.
  task-router-description =
    eq "registry description" (eval ".pi/agent" {} withActor).programs.pi.extensions.task-router.description description;

  # (M5.10) The hard dependency (spec §4.1), both halves.
  task-router-requires-actor-subagents =
    eq "assertions" (failed "pi-task-router:" (eval ".pi/agent" {} {})) [message];
  task-router-requires-spawn-policy-api = eq "assertions" (failed "pi-task-router:" (eval ".pi/agent" {} {
    actorSubagents = {
      enable = true;
      # A package without passthru.spawnPolicyApi (the router's own).
      package = self.packages.x86_64-linux.task-router;
    };
  })) [message];

  # (M5.14) The author's combination: the router with the host's settings next to the actor and
  # one extension for children (stand-in values). The router stays out of the children's list.
  task-router-host-like = let
    host = {
      models = {
        qwen-local = {
          model = "llama/qwen3.8";
          health = "http://local.invalid:11545";
        };
        qwen-cloud.model = "";
      };
      randomize = {
        enabled = true;
        share = 0.2;
      };
      spotCheck = {
        enabled = true;
        share = 0.1;
      };
    };
    child = {
      ext-a = {
        path = ../fixtures/ext-a;
        forChildren = true;
        description = "A child extension.";
      };
    };
    c = eval ".pi/agent" {settings = host;} (withActor // {extensions = child;});
    base = setupOnly ".pi/agent" (withActor // {extensions = child;});
  in
    eq "children" (map baseNameOf c.programs.pi.actorSubagents.childExtensions) ["ext-a"]
    ++ eq "task-router/settings.json" (settingsAt ".pi/agent" c) host
    ++ eq "failed assertions" (failed "" c) []
    ++ eq "warnings" c.warnings base.warnings;

  # (router extraction §7.1) pi-setup's local model health URL becomes the local member's health
  # (what pi-setup's economics bridge did for the router inside pi-economics); merged with the
  # given settings; null leaves the settings alone; the router off writes nothing.
  task-router-local-health = let
    url = "http://localhost:11545";
    given = {
      models.qwen-local.model = "llama/qwen3.8";
      queueMaxSec = 30;
    };
  in
    eq "settings file" (settingsAt ".pi/agent" (eval ".pi/agent" {} (withActor // {router.localHealthUrl = url;}))) {
      models.qwen-local.health = url;
    }
    ++ eq "merged with settings" (settingsAt ".pi/agent" (eval ".pi/agent" {settings = given;} (withActor // {router.localHealthUrl = url;}))) {
      models.qwen-local = {
        model = "llama/qwen3.8";
        health = url;
      };
      queueMaxSec = 30;
    }
    ++ eq "null: no file" (settingsAt ".pi/agent" (eval ".pi/agent" {} (withActor // {router.localHealthUrl = null;}))) null
    ++ eq "router off: no file" (settingsAt ".pi/agent" (eval ".pi/agent" null (withActor // {router.localHealthUrl = url;}))) null;

  # (local mode L1.T7, design §2.1, AC-R5) localMode.enable writes settings.mode = "local"
  # (mkDefault: merged with other settings, a file even for settings = {}); three assertions,
  # each with its negative case.
  task-router-local-mode = lib.concatMap (dir:
    eq "settings file (${dir})" (settingsAt dir (eval dir {localMode.enable = true;} withActor)) {mode = "local";}
    ++ eq "merged with settings (${dir})" (settingsAt dir (eval dir {
        localMode.enable = true;
        settings = {queueMaxSec = 60;};
      }
      withActor)) {
      mode = "local";
      queueMaxSec = 60;
    }
    ++ eq "failed assertions (${dir})" (failed "" (eval dir {localMode.enable = true;} withActor)) [])
  dirs;
  task-router-local-mode-requires-enable =
    eq "assertions"
    (failed "pi-task-router:" (hm.eval {
      programs.pi = withActor;
      programs.piTaskRouter.localMode.enable = true;
    }))
    [msgEnable];
  task-router-local-mode-needs-mode =
    eq "assertions"
    (failed "pi-task-router:" (eval ".pi/agent" {
        localMode.enable = true;
        settings.mode = "default";
      }
      withActor))
    [''pi-task-router: programs.piTaskRouter.localMode.enable needs programs.piTaskRouter.settings.mode = "local" (found "default")''];
  # (local mode L4.T15, design §3.0.4, AC-R5) The overseer needs the spawn-api patch
  # (spawnPolicyApi 2); an actor at 1 fails it.
  task-router-local-mode-needs-spawn-api =
    eq "assertions"
    (failed "pi-task-router:" (eval ".pi/agent" {localMode.enable = true;} {
      actorSubagents = {
        enable = true;
        package = pi-setup.packages.x86_64-linux.actor-subagents.overrideAttrs (o: {passthru = (o.passthru or {}) // {spawnPolicyApi = 1;};});
      };
    }))
    ["pi-task-router: programs.piTaskRouter.localMode requires programs.pi.actorSubagents with passthru.spawnPolicyApi >= 2 (the overseer spawns review agents through the API's spawn and childTools)"];
}
