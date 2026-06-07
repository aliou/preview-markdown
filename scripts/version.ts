#!/usr/bin/env bun
/**
 * Custom version script that:
 * 1. Runs changeset version (bumps version, updates changelog)
 * 2. Builds binaries
 * 3. Computes hashes
 * 4. Updates flake.nix
 */
import { $ } from "bun";

// Run changeset version
await $`bunx changeset version`;

// Get new version
const pkg = await Bun.file("package.json").json();
const version = pkg.version;
console.log(`Version: ${version}`);

// Build binaries
console.log("Building binaries...");
await $`bun run build`;

// Compute hashes
console.log("Computing hashes...");
const darwinHash = (
  await $`nix hash file --sri dist/pmd-darwin-arm64`.text()
).trim();
const linuxArmHash = (
  await $`nix hash file --sri dist/pmd-linux-arm64`.text()
).trim();
const linuxX64Hash = (
  await $`nix hash file --sri dist/pmd-linux-x64`.text()
).trim();

console.log(`Darwin hash: ${darwinHash}`);
console.log(`Linux ARM64 hash: ${linuxArmHash}`);
console.log(`Linux x64 hash: ${linuxX64Hash}`);

// Update flake.nix
let flake = await Bun.file("flake.nix").text();

// Update version
flake = flake.replace(/version = "[^"]*";/, `version = "${version}";`);

// Update darwin hash
flake = flake.replace(
  /("aarch64-darwin"[\s\S]*?hash = )"sha256-[^"]*"/,
  `$1"${darwinHash}"`,
);

// Update linux hashes
flake = flake.replace(
  /("aarch64-linux"[\s\S]*?hash = )"sha256-[^"]*"/,
  `$1"${linuxArmHash}"`,
);
flake = flake.replace(
  /("x86_64-linux"[\s\S]*?hash = )"sha256-[^"]*"/,
  `$1"${linuxX64Hash}"`,
);

await Bun.write("flake.nix", flake);
console.log("Updated flake.nix");

// Clean up dist (don't commit binaries)
await $`rm -rf dist`;

console.log(`Ready to release v${version}`);
