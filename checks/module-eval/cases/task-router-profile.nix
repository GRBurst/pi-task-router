# Local-first plan LF3.T9 (spec HM-1 a): `programs.piTaskRouter.profile`, an enum with the default
# cloud-first, sets settings.profile (mkDefault: a user's settings.profile wins). The default writes
# nothing, so the default render stays as it was.
{
  hm,
  expect,
}: let
  inherit (expect) eq throws evaluates;
  dir = ".pi/agent";
  eval = tr:
    hm.eval {
      programs.pi = {
        agentDir = dir;
        actorSubagents.enable = true;
      };
      programs.piTaskRouter = {enable = true;} // tr;
    };
  settingsOf = c: let
    f = c.home.file."${dir}/task-router/settings.json" or null;
  in
    if f == null
    then null
    else builtins.fromJSON f.text;
  xp = {localFirst.experimental = true;};
in {
  task-router-profile =
    eq "local-first" (settingsOf (eval {
      profile = "local-first";
      settings = xp;
    })) (xp // {profile = "local-first";})
    ++ eq "the default writes no file" (settingsOf (eval {})) null
    ++ eq "cloud-first given writes no file" (settingsOf (eval {profile = "cloud-first";})) null
    ++ eq "the option's default" (eval {}).programs.piTaskRouter.profile "cloud-first"
    ++ eq "a given settings.profile wins" (settingsOf (eval {
      profile = "local-first";
      settings.profile = "cloud-first";
    })) {profile = "cloud-first";}
    ++ throws "an unknown profile" (eval {profile = "local";}).programs.piTaskRouter.profile
    ++ evaluates "a known profile" (eval {profile = "local-first";}).programs.piTaskRouter.profile;
}
