#!/usr/bin/env bash
set -euo pipefail

# Update flake.nix with correct binary hashes after a release
# Usage: ./scripts/update-hashes.sh v0.0.1

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  VERSION="v$(jq -r '.version' package.json)"
fi

# Strip 'v' prefix if present for the version number
VERSION_NUM="${VERSION#v}"

echo "Updating hashes for version $VERSION..."

DARWIN_URL="https://github.com/aliou/md-tui/releases/download/${VERSION}/mdp-darwin-arm64"
LINUX_URL="https://github.com/aliou/md-tui/releases/download/${VERSION}/mdp-linux-arm64"

echo "Fetching darwin hash..."
DARWIN_HASH=$(nix-prefetch-url --type sha256 "$DARWIN_URL" 2>/dev/null)
DARWIN_SRI=$(nix hash to-sri --type sha256 "$DARWIN_HASH")
echo "  Darwin: $DARWIN_SRI"

echo "Fetching linux hash..."
LINUX_HASH=$(nix-prefetch-url --type sha256 "$LINUX_URL" 2>/dev/null)
LINUX_SRI=$(nix hash to-sri --type sha256 "$LINUX_HASH")
echo "  Linux: $LINUX_SRI"

echo "Updating flake.nix..."

# Update version
sed -i '' "s/version = \"[^\"]*\";/version = \"${VERSION_NUM}\";/" flake.nix

# Update darwin hash
sed -i '' "/\"aarch64-darwin\"/,/hash =/{s|hash = \"sha256-[^\"]*\"|hash = \"${DARWIN_SRI}\"|}" flake.nix

# Update linux hash  
sed -i '' "/\"aarch64-linux\"/,/hash =/{s|hash = \"sha256-[^\"]*\"|hash = \"${LINUX_SRI}\"|}" flake.nix

echo "Done! Verify changes with: git diff flake.nix"
