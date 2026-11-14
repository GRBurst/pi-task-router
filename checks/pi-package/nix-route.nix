# The Nix route under real pi (pi-economics AC15; adapted from pi-economics
# 3d0f2e1): the agent directory Home Manager renders for the router (the
# patched actor on, a settings file), each `home.file` under it linked as Home
# Manager links it, then `pi -p x` offline with the probe (./probe.ts). Every
# extension loads (pi prints each extension's factory under PI_TIMING=1; a
# factory that throws prints none), no load error, no duplicate or
# missing-actor warning, and the router's tool task_verdict exists.
#
# programs.pi stays off in this repository's checks (no ai-sandbox fixture),
# so pi-setup neither links the registry nor adds the actor's entry: this
# check links both as pi-setup does with programs.pi.enable,
# <agentDir>/extensions/<name> → the entry's path.
{
  lib,
  pkgs,
  hm,
}: let
  dir = ".pi/agent";
  c = hm.eval {
    programs.pi.agentDir = dir;
    programs.pi.actorSubagents.enable = true;
    programs.piTaskRouter = {
      enable = true;
      settings.queueMaxSec = 60;
    };
  };
  failed = map (a: a.message) (lib.filter (a: !a.assertion) c.assertions);
  p = c.programs.pi;
  registry =
    lib.mapAttrs (_: e: e.path) p.extensions
    // {actor-subagents = "${p.actorSubagents.package}/extensions/actor-subagents";};
  files = lib.filter (f: lib.hasPrefix "${dir}/" f.target) (lib.attrValues c.home.file);
  links =
    lib.concatMapStrings (f: ''
      mkdir -p "$HOME/$(dirname ${lib.escapeShellArg f.target})"
      ln -s ${f.source} "$HOME/"${lib.escapeShellArg f.target}
    '')
    files
    + ''
      mkdir -p "$PI_CODING_AGENT_DIR/extensions"
    ''
    + lib.concatStrings (lib.mapAttrsToList (n: path: ''
        ln -s ${path} "$PI_CODING_AGENT_DIR/extensions/"${lib.escapeShellArg n}
      '')
      registry);
  names = lib.attrNames registry;
in
  assert lib.assertMsg (failed == []) "nix-route-smoke: the fixture fails its assertions: ${lib.concatStringsSep "; " failed}";
    pkgs.runCommand "nix-route-smoke" {nativeBuildInputs = [pkgs.pi-coding-agent pkgs.jq pkgs.coreutils pkgs.gnugrep];} ''
      export HOME=$PWD/home PI_CODING_AGENT_DIR=$PWD/home/${dir} PI_OFFLINE=1 PI_TIMING=1 PROBE_OUT=$PWD/probe.json
      ${links}
      fail() {
        echo "nix-route-smoke: $*" >&2
        cat run.all >&2
        exit 1
      }
      [ -e "$PI_CODING_AGENT_DIR/task-router/settings.json" ] || fail "no task-router/settings.json under the Nix route"
      rc=0
      pi -p x --no-session -e ${./probe.ts} </dev/null >run.out 2>run.err || rc=$?
      cat run.out run.err >run.all
      grep -qF 'No API key found' run.all || fail "pi did not reach the model call"
      [ "$rc" = 1 ] || fail "pi -p exited $rc, expected 1"
      # `! grep` is exempt from errexit: use `if`
      if grep -qF 'Failed to load extension' run.all; then fail "an extension failed to load"; fi
      # an install runs at session_start (runtime-guard.ts): its throw prints `Extension error (<path>): ...`, not a load error
      if grep -qF 'Extension error' run.all; then fail "an extension's install threw"; fi
      grep -qF "Startup Timings: extensions" run.all || fail "pi printed no PI_TIMING block: the factory-line marker is pi 1.4's (did pkgs.pi-coding-agent move?)"
      if grep -qF 'loaded twice' run.all; then fail "the router is loaded twice"; fi
      if grep -qF 'needs pi-actor-subagents' run.all; then fail "a component misses the actor's API"; fi
      for n in ${lib.escapeShellArgs names}; do
        grep -F "$PI_CODING_AGENT_DIR/extensions/$n/" run.all | grep -qF ' factory: ' || fail "the extension $n did not load"
      done
      [ -f probe.json ] || fail "the probe wrote nothing"
      jq -e '.tools | index("task_verdict") != null' probe.json >/dev/null || fail "no task_verdict among the tools: $(cat probe.json)"
      jq -e '.active | index("task_verdict") != null' probe.json >/dev/null || fail "task_verdict is registered but not active: $(cat probe.json)"
      echo "loaded: ${toString names}"
      touch $out
    ''
