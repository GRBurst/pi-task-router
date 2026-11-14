{
  description = "pi-task-router: routes the pi coding agent's subagent spawns by task card, as a Home Manager module";

  inputs = {
    # Locked to the revisions the router was developed against (pi-economics'
    # lock at the extraction); a consumer makes them follow its own inputs.
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    # Checks only: the module-evaluation cases evaluate Home Manager.
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # The pi module: the extension registry the router registers into
    # (`programs.pi.extensions`), the agent dir, the local model's health URL
    # and the patched actor-subagents (`programs.pi.actorSubagents`) the router
    # needs. Checks only: `homeModules.default` does not import it, the
    # consumer imports both.
    pi-setup = {
      url = "github:GRBurst/pi-setup";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.home-manager.follows = "home-manager";
    };
  };

  outputs = {
    self,
    nixpkgs,
    home-manager,
    pi-setup,
  }: let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages.${system};
    inherit (nixpkgs) lib;
    # The pi package manifest, rendered from the module (render/default.nix).
    renderOf = pkgs:
      import ./render {
        inherit pkgs lib home-manager;
        homeModule = self.homeModules.default;
        setupModule = pi-setup.homeModules.default;
      };
  in {
    # The module `programs.piTaskRouter`; it sets options of pi-setup's
    # `homeModules.default`, which the consumer imports next to it.
    homeModules.default = {
      key = "pi-task-router#homeModules.default";
      imports = [./modules];
    };

    # The module's `package` default builds the same derivation from the
    # consumer's pkgs.
    packages.${system}.task-router = pkgs.callPackage ./packages/task-router/package.nix {};

    formatter.${system} = pkgs.alejandra;

    # The render tree, to build and inspect on its own.
    legacyPackages.${system}.render-tree = (renderOf pkgs).tree;

    # `nix run .#render` writes package.json into the checkout.
    apps.${system}.render = {
      type = "app";
      program = lib.getExe (renderOf pkgs).app;
      meta.description = "Write the rendered pi package manifest (package.json) into the checkout";
    };

    checks.${system} = import ./checks {
      inherit self pkgs lib home-manager pi-setup;
      render = renderOf pkgs;
    };
  };
}
