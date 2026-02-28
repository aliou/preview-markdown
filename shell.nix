# For users without flakes, this provides a basic shell.
# For git hooks, use: nix develop
{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_24
  ];
}
