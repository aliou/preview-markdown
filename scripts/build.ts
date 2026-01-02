#!/usr/bin/env bun
import { $ } from "bun";

const targets = [
  { target: "bun-darwin-arm64", outfile: "dist/pmd-darwin-arm64" },
  { target: "bun-linux-arm64", outfile: "dist/pmd-linux-arm64" },
];

await $`rm -rf dist && mkdir -p dist`;

for (const { target, outfile } of targets) {
  console.log(`Building for ${target}...`);
  await $`bun build --compile --target=${target} --minify ./src/index.ts --outfile ${outfile}`;
  console.log(`Built ${outfile}`);
}

console.log("Build complete!");
