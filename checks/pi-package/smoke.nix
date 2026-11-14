# The repository installs as a pi package and starts (pi-economics AC1;
# adapted from pi-economics 3d0f2e1): `pi install ./pkg` offline into a fresh
# agent directory, and `pi -p x` loads every manifest extension up to the
# missing model key; alone, the router warns once that the actor's API is
# missing.
{installed}:
installed {
  name = "pi-install-smoke";
  after = ''
    while IFS= read -r p; do
      loaded "$PWD/pkg/''${p#./}" || fail "the extension $p did not load"
    done < <(jq -r '.pi.extensions[]' pkg/package.json)
    # without the actor's API the router says so, once (spec D5, §4.2)
    [ "$(grep -cF 'task-router: needs pi-actor-subagents' run.all)" = 1 ] || fail "not exactly one task-router warning"
  '';
}
