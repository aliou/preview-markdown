import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

execFileSync("pnpm", ["changeset", "version"], { stdio: "inherit" });

const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
const flake = fs.readFileSync("flake.nix", "utf8");
fs.writeFileSync(
  "flake.nix",
  flake.replace(/version = "[^"]*";/, `version = "${version}";`),
);
console.log(`Ready to release v${version}`);
