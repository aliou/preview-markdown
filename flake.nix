{
  description = "pmd - Terminal markdown pager with syntax highlighting";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    let
      version = "0.11.0";

      # Binary hashes for releases - update these after each release
      # Run: nix-prefetch-url --type sha256 <url>
      # Then: nix hash to-sri --type sha256 <hash>
      binaries = {
        "aarch64-darwin" = {
          url = "https://github.com/aliou/preview-markdown/releases/download/v${version}/pmd-darwin-arm64";
          hash = "sha256-dpDt7TmoyiEyoYZwlOZEbt+E/7604ZmPgXm5O4dUFsY="; # darwin
        };
        "aarch64-linux" = {
          url = "https://github.com/aliou/preview-markdown/releases/download/v${version}/pmd-linux-arm64";
          hash = "sha256-jnyyrG4MP4f+oTSC8rkyv+CNmgLeWxbh2+xRYkfOMBs="; # linux-arm64
        };
        "x86_64-linux" = {
          url = "https://github.com/aliou/preview-markdown/releases/download/v${version}/pmd-linux-x64";
          hash = "sha256-4avQB1cOLIV/pl4Bguv73r9WiudAHX/9G1B3/q6aCQU="; # linux-x64
        };
      };

      # Build from source for development
      buildFromSource = pkgs: pkgs.stdenv.mkDerivation {
        pname = "pmd";
        inherit version;

        src = ./.;

        nativeBuildInputs = [ pkgs.bun pkgs.makeWrapper ];

        buildPhase = ''
          export HOME=$(mktemp -d)
          bun install --frozen-lockfile
        '';

        installPhase = ''
          mkdir -p $out/lib/pmd
          cp -r node_modules $out/lib/pmd/
          cp -r src $out/lib/pmd/
          cp package.json $out/lib/pmd/

          mkdir -p $out/bin
          cat > $out/bin/pmd << 'EOF'
          #!/usr/bin/env bash
          exec ${pkgs.bun}/bin/bun run "$out/lib/pmd/src/index.ts" "$@"
          EOF
          chmod +x $out/bin/pmd

          substituteInPlace $out/bin/pmd --replace '$out' "$out"
        '';

        meta = with pkgs.lib; {
          description = "Terminal markdown pager with syntax highlighting";
          homepage = "https://github.com/aliou/preview-markdown";
          license = licenses.mit;
          platforms = platforms.all;
          mainProgram = "pmd";
        };
      };

      # Fetch prebuilt binary from release
      fetchBinary = pkgs: system:
        let
          binary = binaries.${system} or (throw "Unsupported system: ${system}");
        in
        pkgs.stdenv.mkDerivation {
          pname = "pmd";
          inherit version;

          src = pkgs.fetchurl {
            url = binary.url;
            hash = binary.hash;
          };

          dontUnpack = true;

          installPhase = ''
            mkdir -p $out/bin
            cp $src $out/bin/pmd
            chmod +x $out/bin/pmd
          '';

          meta = with pkgs.lib; {
            description = "Terminal markdown pager with syntax highlighting";
            homepage = "https://github.com/aliou/preview-markdown";
            license = licenses.mit;
            platforms = [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ];
            mainProgram = "pmd";
          };
        };
    in
    flake-utils.lib.eachSystem [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ] (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        pmd = buildFromSource pkgs;

        installLefthook = ''
          if [ -d .git ] && command -v lefthook >/dev/null 2>&1; then
            lefthook install -f >/dev/null
          fi
        '';
      in
      {
        checks = { };

        packages = {
          default = pmd;
          pmd = pmd;
          pmd-binary = fetchBinary pkgs system;
        };

        apps.default = {
          type = "app";
          program = "${pmd}/bin/pmd";
        };

        devShells.default = pkgs.mkShell {
          shellHook = installLefthook;
          buildInputs = [ pkgs.bun pkgs.lefthook ];
        };
      }
    ) // {
      # Home Manager module
      homeManagerModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.programs.pmd;
        in
        {
          options.programs.pmd = {
            enable = lib.mkEnableOption "pmd markdown pager";

            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.system}.default;
              description = "The pmd package to use";
            };

            showLineNumbers = lib.mkOption {
              type = lib.types.bool;
              default = false;
              description = "Show line numbers in the pager";
            };

            darkTheme = lib.mkOption {
              type = lib.types.str;
              default = "senzu-dark";
              description = "Theme name for dark mode (bundled: senzu-dark, senzu-light; or a user theme in ~/.config/pmd/themes/)";
            };

            lightTheme = lib.mkOption {
              type = lib.types.str;
              default = "senzu-light";
              description = "Theme name for light mode (bundled: senzu-dark, senzu-light; or a user theme in ~/.config/pmd/themes/)";
            };
          };

          config = lib.mkIf cfg.enable {
            home.packages = [ cfg.package ];

            xdg.configFile."pmd/config.json".text = builtins.toJSON {
              showLineNumbers = cfg.showLineNumbers;
              theme = {
                dark = cfg.darkTheme;
                light = cfg.lightTheme;
              };
            };
          };
        };

      homeManagerModule = self.homeManagerModules.default;
    };
}
