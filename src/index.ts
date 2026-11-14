#!/usr/bin/env bun
import * as fs from "node:fs";
import * as path from "node:path";
import { runApp, type Target } from "./app";
import { parseArgs, printCompletion, printHelp, printVersion } from "./cli";
import { initConfig, loadConfig } from "./config";
import { scanDirectory } from "./scan";
import { loadThemes } from "./theme";

async function readTarget(
  source: string | null,
  depth: number,
): Promise<Target> {
  if (source === null && !process.stdin.isTTY) {
    return { kind: "stdin", markdown: await Bun.stdin.text() };
  }
  const resolved = path.resolve(source ?? ".");
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat) throw new Error(`Not found: ${source}`);
  if (stat.isDirectory()) {
    return {
      kind: "directory",
      path: resolved,
      entries: scanDirectory(resolved, depth),
    };
  }
  return { kind: "file", path: source ?? resolved };
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  if (options.version) {
    printVersion();
    return 0;
  }
  if (options.completion) return printCompletion(options.completion) ? 0 : 1;
  if (options.initConfig) {
    console.log(`Config file created at: ${initConfig(false)}`);
    return 0;
  }

  const target = await readTarget(options.source, options.depth);
  const config = loadConfig();
  const warnings: string[] = [];
  const themes = loadThemes(config, warnings);
  for (const warning of warnings) console.error(warning);
  let colorScheme: "light" | "dark" | null = null;
  if (options.light) colorScheme = "light";
  if (options.dark) colorScheme = "dark";
  await runApp(target, {
    lineNumbers: options.lineNumbers || config.showLineNumbers,
    width: options.width,
    colorScheme,
    themes,
  });
  return 0;
}

const exitCode = await main().catch((error: Error) => {
  console.error(`Error: ${error.message}`);
  return 1;
});
process.exit(exitCode);
