{
  description = "A Nix-flake-based Bun development environment";

  inputs.nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0.1";

  outputs =
    { self, ... }@inputs:
    let
      goVersion = 26;
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forEachSupportedSystem =
        f:
        inputs.nixpkgs.lib.genAttrs supportedSystems (
          system:
          f {
            inherit system;
            pkgs = import inputs.nixpkgs { inherit system; };
          }
        );

      # Shared package list for dev shell and chimp Docker image
      devPackages = pkgs: with pkgs; [
        cacert
        bun
        git
        curl
        gh
        natscli
        go
        gotools
        golangci-lint
        gitleaks
        kubernetes-helm
        redis
        kustomize
        opentofu
        go-task
        postgresql
      ];
    in
    {
      devShells = forEachSupportedSystem (
        { pkgs, system }:
        {
          default = pkgs.mkShellNoCC {
            packages = devPackages pkgs ++ [ self.formatter.${system} ];
          };
        }
      );

      packages = forEachSupportedSystem (
        { pkgs, ... }:
        {
          chimp-env = pkgs.buildEnv {
            name = "chimp-env";
            paths = devPackages pkgs;
            pathsToLink = [ "/bin" "/lib" "/share" "/etc" ];
          };
        }
      );

      formatter = forEachSupportedSystem ({ pkgs, ... }: pkgs.nixfmt);
    };
}
