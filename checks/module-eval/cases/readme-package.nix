# README's "Without Nix" section agrees with what the package ships (adapted
# from pi-economics 3d0f2e1): the install line carries the manifest's version
# as the tag; the actor has its prerequisites row with the pinned wording (a
# patched build via pi-setup's Nix module, upstream support pending, as the
# router's warning says; local mode needs the spawn API); the duplicate
# warning is quoted as the runtime guard prints it; the agent directory the
# router follows is named. Lines are compared whole or searched with
# `replaceStrings` (no regex over the README).
{
  lib,
  expect,
}: let
  readme = lib.splitString "\n" (builtins.readFile ../../../README.md);
  version = (builtins.fromJSON (builtins.readFile ../../../package.json)).version;
  has = infix: line: builtins.replaceStrings [infix] [""] line != line;
  withText = infix: lib.filter (has infix) readme;

  install = "pi install git:github.com/GRBurst/pi-task-router@v${version}";
  pinned = "Patched build via pi-setup's Nix module (`programs.pi.actorSubagents`); upstream support pending.";
  localNeeds = "local mode needs the actor's spawn API (the third patch)";
  row = lib.filter (l: lib.hasPrefix "| pi-actor-subagents |" l) readme;
in {
  readme-package =
    expect.eq "the install line, once" (lib.filter (l: l == install) readme) [install]
    ++ expect.holds "one prerequisites row for pi-actor-subagents" (lib.length row == 1)
    ++ lib.concatMap (r: expect.holds "the pi-actor-subagents row says: ${pinned}" (has pinned r) ++ expect.holds "the pi-actor-subagents row says: ${localNeeds}" (has localNeeds r)) row
    ++ expect.holds "the duplicate warning is quoted" (lib.length (withText "`pi-task-router: task-router is loaded") >= 1)
    ++ expect.holds "the agent directory the router follows is named" (lib.length (withText "`programs.pi.agentDir`") >= 1);
}
