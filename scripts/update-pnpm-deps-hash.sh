#!/usr/bin/env bash
set -euo pipefail

log=$(mktemp)
trap 'rm -f "$log" flake.nix.tmp' EXIT

if nix build .#pmd.pnpmDeps --no-link 2>"$log"; then
  echo "The pnpmDeps hash is up to date"
  exit 0
fi

hash=$(sed -n 's/^ *got: *\(sha256-[^ ]*\)$/\1/p' "$log")
if [ -z "$hash" ]; then
  cat "$log" >&2
  exit 1
fi

sed "/pnpmDeps = pkgs.fetchPnpmDeps/,/hash = /s|hash = \"[^\"]*\"|hash = \"$hash\"|" flake.nix >flake.nix.tmp
mv flake.nix.tmp flake.nix
echo "Updated the pnpmDeps hash to $hash"
