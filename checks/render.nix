# The committed package.json against the render (pi-economics spec D1, AC2;
# copied from pi-economics 3d0f2e1): `diff -u` names a differing and a missing
# file alike. Also packages/task-router/package.json carries the root version
# constant (render/default.nix): a release edits the constant and the
# component manifest follows, and the Nix derivation name
# (pi-task-router-<version>) follows the manifest.
{
  lib,
  pkgs,
  self,
  render,
}: let
  components =
    lib.filter (n: builtins.pathExists (../packages + "/${n}/package.json"))
    (lib.attrNames (builtins.readDir ../packages));
  versions = pkgs.writeText "component-versions" (lib.concatMapStrings (n: "${n} ${(lib.importJSON (../packages + "/${n}/package.json")).version}\n") components);
in
  pkgs.runCommand "render-package" {nativeBuildInputs = [pkgs.diffutils];} ''
    diff -u ${render.tree}/package.json ${self}/package.json || {
      echo "render-package: package.json differs from the Nix output; run nix run .#render" >&2
      exit 1
    }
    status=0
    while read -r name version; do
      if [ "$version" != "${render.version}" ]; then
        echo "render-package: packages/$name/package.json has version $version; the root constant (render/default.nix) is ${render.version}" >&2
        status=1
      fi
    done <${versions}
    [ "$status" = 0 ] || exit 1
    touch $out
  ''
