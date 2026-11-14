import * as fs from "node:fs";
import * as path from "node:path";
import { stripVTControlCharacters } from "node:util";
import packageJson from "../../package.json";
import { runApp, type Target } from "../app";
import { activeConfigPath, initConfig, loadConfig } from "../config";
import { loadContent } from "../content";
import { FailedError } from "../failed-error";
import { scanDirectory } from "../scan";
import { loadThemes } from "../theme";
import { completionScript } from "./completion";
import { renderHelp } from "./help";
import { type Invocation, parseInvocation, type ViewOptions } from "./parse";
import { COMMANDS } from "./spec";
import { closestMatch } from "./suggest";
import { UsageError } from "./usage-error";

const MARKDOWN_FILE = /\.(md|markdown|mdx)$/i;
const PIPED_WIDTH = 80;
const CODE_BLOCK_EDGE = /^\s*(▀+|▄+)\s*$/;

function printOut(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

function printError(message: string): void {
  process.stderr.write(`pmd: ${message}\n`);
}

function nearbyMarkdownFile(source: string): string | undefined {
  const directory = path.dirname(source);
  if (!fs.existsSync(directory)) return undefined;
  const files = fs
    .readdirSync(directory)
    .filter((name) => MARKDOWN_FILE.test(name));
  const match = closestMatch(path.basename(source), files);
  return match && path.join(directory, match);
}

function missingSource(source: string): Error {
  const command = closestMatch(
    source,
    COMMANDS.map((candidate) => candidate.name),
  );
  if (command)
    return new UsageError(
      `unknown command "${source}" (did you mean "${command}"?)`,
      null,
    );
  const file = nearbyMarkdownFile(source);
  const hint = file ? ` (did you mean "${file}"?)` : "";
  return new FailedError(`no such file or directory: ${source}${hint}`);
}

async function readTarget(options: ViewOptions): Promise<Target> {
  const { source } = options;
  if (source === "-" || (source === null && !process.stdin.isTTY)) {
    return { kind: "stdin", markdown: await Bun.stdin.text() };
  }
  const resolved = path.resolve(source ?? ".");
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat) throw missingSource(source ?? ".");
  if (stat.isDirectory()) {
    return {
      kind: "directory",
      path: resolved,
      entries: scanDirectory(resolved, options.depth),
    };
  }
  return { kind: "file", path: source ?? resolved };
}

async function printTarget(
  target: Target,
  options: ViewOptions,
  themes: ReturnType<typeof loadThemes>,
): Promise<void> {
  if (target.kind === "directory") {
    printOut(target.entries.map((entry) => entry.relativePath).join("\n"));
    return;
  }
  const markdown =
    target.kind === "file"
      ? fs.readFileSync(target.path, "utf8")
      : target.markdown;
  const content = await loadContent(
    markdown,
    target.kind === "file" ? target.path : null,
    themes.dark,
  );
  const lines = content.document.render(options.width || PIPED_WIDTH);
  const text = lines.map((line) =>
    stripVTControlCharacters(line).replace(CODE_BLOCK_EDGE, "").trimEnd(),
  );
  printOut(text.join("\n"));
}

async function view(options: ViewOptions): Promise<void> {
  const target = await readTarget(options);
  const config = loadConfig();
  const warnings: string[] = [];
  const themes = loadThemes(config, warnings);
  for (const warning of warnings) printError(warning);
  if (!process.stdout.isTTY) {
    await printTarget(target, options, themes);
    return;
  }
  await runApp(target, {
    lineNumbers: options.lineNumbers || config.showLineNumbers,
    width: options.width,
    colorScheme: options.colorScheme,
    themes,
  });
}

async function run(invocation: Invocation): Promise<void> {
  switch (invocation.kind) {
    case "help":
      printOut(renderHelp(invocation.topic));
      return;
    case "version":
      printOut(`pmd ${packageJson.version}`);
      return;
    case "completion":
      printOut(completionScript(invocation.shell));
      return;
    case "config":
      if (invocation.action === "path") {
        printOut(activeConfigPath());
        return;
      }
      process.stderr.write(`Created ${initConfig(invocation.force)}\n`);
      return;
    case "view":
      await view(invocation.options);
  }
}

export async function main(args: string[]): Promise<number> {
  try {
    const { invocation, warnings } = parseInvocation(args);
    for (const warning of warnings) printError(warning);
    await run(invocation);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      printError(error.message);
      process.stderr.write(
        `Run "pmd ${error.helpTopic ? `help ${error.helpTopic}` : "--help"}" for usage.\n`,
      );
      return 2;
    }
    printError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
