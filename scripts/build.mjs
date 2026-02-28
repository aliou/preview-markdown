#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
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
const binaryName = getBinaryName();
const outPath = path.join("dist", binaryName);

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

console.log(`Building SEA binary: ${binaryName}`);
execSync("npx tsdown", {
  stdio: "inherit",
  env: {
    ...process.env,
    PMD_BINARY_NAME: binaryName,
  },
});

if (!existsSync(outPath)) {
  console.error("ERROR: SEA binary was not produced");
  console.error("dist/ contents:", readdirSync("dist"));
  process.exit(1);
}

console.log(`Built ${outPath}`);
