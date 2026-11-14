# What the router module renders resolves to what pi and the router read
# (pi-economics spec §4, §4.1; the router part of pi-economics 3d0f2e1's
# check). module-eval only evaluates; this check builds the rendered sources,
# for the default and another agentDir: the registry entry is the package pi
# loads, and the settings file is accepted by the router's own reader
# (core/settings.ts, loadSettingsReport), with the values the fixture set.
{
  lib,
  pkgs,
  hm,
}: let
  dirs = [".pi/agent" "custom/agent"];
  case = dir: let
    c = hm.eval {
      programs.pi.agentDir = dir;
      programs.pi.actorSubagents.enable = true;
      programs.piTaskRouter = {
        enable = true;
        localMode.enable = true;
        settings.queueMaxSec = 60;
      };
    };
    tr = c.programs.pi.extensions.task-router.path;
    settings = c.home.file."${dir}/task-router/settings.json".source;
  in ''
    echo "== ${dir}"
    # the extension pi loads
    for f in package.json index.ts core/shell.ts; do
      [ -f "${tr}/$f" ] || { echo "FAIL ${dir}: task-router lacks $f" >&2; exit 1; }
    done
    # the settings file, read by the router itself: no problem, the fixture's values
    node --experimental-strip-types --no-warnings --input-type=module -e "
      import { loadSettingsReport } from '${tr}/core/settings.ts';
      const r = loadSettingsReport(process.argv[1]);
      if (r.problems.length > 0) { console.error(r.problems.join('\n')); process.exit(1); }
      if (r.settings.mode !== 'local' || r.settings.queueMaxSec !== 60) { console.error(JSON.stringify({ mode: r.settings.mode, queueMaxSec: r.settings.queueMaxSec })); process.exit(1); }
    " ${settings} || { echo "FAIL ${dir}: the router rejects or misreads its settings.json" >&2; exit 1; }
    echo "ok ${dir}"
  '';
in
  pkgs.runCommand "home-files" {nativeBuildInputs = [pkgs.nodejs];} ''
    set -euo pipefail
    ${lib.concatMapStrings case dirs}
    touch $out
  ''
