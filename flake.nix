{
  description = "pmd - Terminal markdown pager with syntax highlighting";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    git-hooks = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, git-hooks }:
    let
      version = "0.4.0";

      # Binary hashes for releases - update these after each release
      # Run: nix-prefetch-url --type sha256 <url>
      # Then: nix hash to-sri --type sha256 <hash>
      binaries = {
        "aarch64-darwin" = {
          url = "https://github.com/aliou/preview-markdown/releases/download/v${version}/pmd-darwin-arm64";
          hash = "sha256-hnb089xYLOKt3I9pSAlMg+xV1WZy33FHORKdYv2jArM="; # darwin
        };
        "aarch64-linux" = {
          url = "https://github.com/aliou/preview-markdown/releases/download/v${version}/pmd-linux-arm64";
          hash = "sha256-Y3h5zZVBs05BbY7GJWDPGXymhZT6sdvPpb0qNi+D6rQ="; # linux
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
            platforms = [ "aarch64-darwin" "aarch64-linux" ];
            mainProgram = "pmd";
          };
        };
    in
    flake-utils.lib.eachSystem [ "aarch64-darwin" "aarch64-linux" ] (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        pmd = buildFromSource pkgs;

        pre-commit-check = git-hooks.lib.${system}.run {
          src = ./.;
          hooks = {
            biome-format = {
              enable = true;
              name = "biome format";
              entry = "${pkgs.bun}/bin/bun run format";
              files = "\\.(ts|json)$";
              pass_filenames = false;
            };
            typecheck = {
              enable = true;
              name = "typecheck";
              entry = "${pkgs.bun}/bin/bun run typecheck";
              files = "\\.ts$";
              pass_filenames = false;
            };
          };
        };
      in
      {
        checks = {
          pre-commit-check = pre-commit-check;
        };

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
          inherit (pre-commit-check) shellHook;
          buildInputs = [ pkgs.bun ];
        };
      }
    ) // {
      # Home Manager module
      homeManagerModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.programs.pmd;

          themeType = lib.types.submodule {
            options = {
              heading = lib.mkOption {
                type = lib.types.str;
                description = "Color for headings";
              };
              link = lib.mkOption {
                type = lib.types.str;
                description = "Color for link text";
              };
              linkUrl = lib.mkOption {
                type = lib.types.str;
                description = "Color for link URLs";
              };
              code = lib.mkOption {
                type = lib.types.str;
                description = "Color for inline code";
              };
              codeBlock = lib.mkOption {
                type = lib.types.str;
                description = "Color for code block content";
              };
              codeBlockBorder = lib.mkOption {
                type = lib.types.str;
                description = "Color for code block delimiters";
              };
              quote = lib.mkOption {
                type = lib.types.str;
                description = "Color for blockquote text";
              };
              quoteBorder = lib.mkOption {
                type = lib.types.str;
                description = "Color for blockquote border";
              };
              hr = lib.mkOption {
                type = lib.types.str;
                description = "Color for horizontal rules";
              };
              listBullet = lib.mkOption {
                type = lib.types.str;
                description = "Color for list bullets/numbers";
              };
              bold = lib.mkOption {
                type = lib.types.bool;
                default = true;
                description = "Enable bold formatting";
              };
              italic = lib.mkOption {
                type = lib.types.bool;
                default = true;
                description = "Enable italic formatting";
              };
              strikethrough = lib.mkOption {
                type = lib.types.bool;
                default = true;
                description = "Enable strikethrough formatting";
              };
              underline = lib.mkOption {
                type = lib.types.bool;
                default = true;
                description = "Enable underline formatting";
              };
              textColor = lib.mkOption {
                type = lib.types.str;
                description = "Default text color";
              };
              bgColor = lib.mkOption {
                type = lib.types.str;
                default = "";
                description = "Background color (empty for transparent)";
              };
            };
          };

          # Jellybeans Dark palette
          defaultDarkTheme = {
            heading = "#8fbfdc";
            link = "#8fbfdc";
            linkUrl = "#888888";
            code = "#fad07a";
            codeBlock = "#e8e8d3";
            codeBlockBorder = "#888888";
            quote = "#99ad6a";
            quoteBorder = "#888888";
            hr = "#606060";
            listBullet = "#c6b6ee";
            bold = true;
            italic = true;
            strikethrough = true;
            underline = true;
            textColor = "#e8e8d3";
            bgColor = "#151515";
          };

          # Jellybeans Muted Light palette
          defaultLightTheme = {
            heading = "#3c5971";
            link = "#3c5971";
            linkUrl = "#909090";
            code = "#a07542";
            codeBlock = "#2d2c2a";
            codeBlockBorder = "#909090";
            quote = "#4a6335";
            quoteBorder = "#909090";
            hr = "#909090";
            listBullet = "#655683";
            bold = true;
            italic = true;
            strikethrough = true;
            underline = true;
            textColor = "#2d2c2a";
            bgColor = "#f7f3eb";
          };
        in
        {
          options.programs.pmd = {
            enable = lib.mkEnableOption "pmd markdown pager";

            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.system}.default;
              description = "The pmd package to use";
            };

            dark = lib.mkOption {
              type = themeType;
              default = defaultDarkTheme;
              description = "Dark theme configuration (Jellybeans palette)";
            };

            light = lib.mkOption {
              type = themeType;
              default = defaultLightTheme;
              description = "Light theme configuration (Jellybeans Muted Light palette)";
            };
          };

          config = lib.mkIf cfg.enable {
            home.packages = [ cfg.package ];

            xdg.configFile."pmd/config.json".text = builtins.toJSON {
              dark = cfg.dark;
              light = cfg.light;
            };
          };
        };

      homeManagerModule = self.homeManagerModules.default;
    };
}
