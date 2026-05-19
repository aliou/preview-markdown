# For users without flakes, this provides a basic shell.
# Git hooks are managed by lefthook.
{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  buildInputs = with pkgs; [
    bun
    lefthook
  ];

  shellHook = ''
    if [ -d .git ] && command -v lefthook >/dev/null 2>&1; then
      lefthook install -f >/dev/null
    fi
  '';
}
