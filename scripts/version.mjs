#!/usr/bin/env node
/**
 * Custom version script that:
 * 1. Runs changeset version (bumps version, updates changelog)
 * 2. Builds SEA binary for current host
 * 3. Computes hash for the built binary
 * 4. Updates flake.nix version + matching platform hash
 */
import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

function assertNodeForSea() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 25 || (major === 25 && minor >= 5)) return;

  console.error(
    `Node SEA requires Node >= 25.5.0, current: v${process.versions.node}`,
  );
  process.exit(1);
}

function getBinaryName() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "pmd-darwin-arm64";
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return "pmd-linux-arm64";
  }
  return `pmd-${process.platform}-${process.arch}`;
}

assertNodeForSea();

execSync("npx changeset version", { stdio: "inherit" });

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;
console.log(`Version: ${version}`);

console.log("Building SEA binary...");
execSync("npm run build", { stdio: "inherit" });

const binaryName = getBinaryName();
const binaryPath = path.join("dist", binaryName);

console.log(`Computing hash for ${binaryName}...`);
const hash = execSync(`nix hash file --sri ${binaryPath}`, {
  encoding: "utf8",
}).trim();
console.log(`Hash: ${hash}`);

let flake = readFileSync("flake.nix", "utf8");
flake = flake.replace(/version = "[^"]*";/, `version = "${version}";`);

if (binaryName === "pmd-darwin-arm64") {
  flake = flake.replace(
    /hash = "sha256-[^"]*"; # darwin/,
    `hash = "${hash}"; # darwin`,
  );
} else if (binaryName === "pmd-linux-arm64") {
  flake = flake.replace(
    /hash = "sha256-[^"]*"; # linux/,
    `hash = "${hash}"; # linux`,
  );
} else {
  console.warn(`Skipping flake hash update for unsupported target: ${binaryName}`);
}

writeFileSync("flake.nix", flake);
console.log("Updated flake.nix");

rmSync("dist", { recursive: true, force: true });
console.log(`Ready to release v${version}`);
