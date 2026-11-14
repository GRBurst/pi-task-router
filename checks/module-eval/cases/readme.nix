# README's Home Manager example is the fixture, line by line, and the fixture
# evaluates without a failed assertion of pi-setup or this flake (adapted from
# pi-economics 3d0f2e1).
{
  lib,
  hm,
  expect,
}: let
  readme = lib.splitString "\n" (builtins.readFile ../../../README.md);
  fixture = lib.splitString "\n" (builtins.readFile ../fixtures/readme-example.nix);
  marker = "<!-- checked: checks/module-eval/fixtures/readme-example.nix -->";
  at = lib.lists.findFirstIndex (l: l == marker) null readme;
  rest = lib.drop (at + 2) readme; # the marker, then the "```nix" fence
  end = lib.lists.findFirstIndex (l: l == "```") (lib.length rest) rest;
  block = lib.take end rest;
  cfg = hm.eval (import ../fixtures/readme-example.nix);
in {
  readme-example =
    expect.holds "README has the marker" (at != null)
    ++ lib.optionals (at != null) (expect.eq "README's nix block = fixture" block (lib.init fixture)) # the fixture ends with a newline
    ++ expect.eq "no failed assertion" (expect.failed "pi-task-router:" cfg ++ expect.failed "pi-setup:" cfg) [];
}
