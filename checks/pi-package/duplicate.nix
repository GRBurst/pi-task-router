# The duplicate guard (pi-economics AC7, plan T4.1; adapted from pi-economics
# 3d0f2e1): the package installed AND the router linked into
# <agentDir>/extensions/<c> as the Nix route links it (the built package: a
# different path, the same component). The first copy pi starts wins; the
# other stays inert and says so once.
{
  lib,
  pkgs,
  installed,
  self,
  own,
}:
installed {
  name = "pi-install-duplicate";
  before = ''
    mkdir -p "$PI_CODING_AGENT_DIR/extensions"
    ${lib.concatMapStrings (c: ''
        ln -s ${self.packages.${pkgs.stdenv.hostPlatform.system}.${c}} "$PI_CODING_AGENT_DIR/extensions/${c}"
      '')
      own}
  '';
  after = ''
    for c in ${lib.escapeShellArgs own}; do
      [ "$(grep -cF "pi-task-router: $c is loaded twice" run.all)" = 1 ] || fail "$c: not exactly one 'loaded twice' line"
    done
    # the winner is bound, not only a loser that said so: its actor warning (one per process) prints from a bound copy alone
    [ "$(grep -cF "task-router: needs pi-actor-subagents" run.all)" = 1 ] \
      || fail "task-router: not exactly one bound copy (its actor warning appears $(grep -cF "task-router: needs pi-actor-subagents" run.all) times)"
    if grep -qF 'conflicts with' run.all; then fail "pi reports a tool or flag conflict between the copies"; fi
  '';
}
