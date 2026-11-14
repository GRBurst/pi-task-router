# The router's module (`programs.piTaskRouter`); it sets options of pi-setup's
# `homeModules.default`, which the consumer imports next to it.
{
  imports = [./task-router.nix];
}
