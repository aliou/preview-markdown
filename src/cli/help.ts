import { styleText } from "node:util";
import { BROWSER_HELP, keyLabel, PAGER_HELP } from "../keybindings";
import {
  COMMANDS,
  type CommandSpec,
  type FlagSpec,
  findCommand,
  ROOT_COMMAND,
} from "./spec";

function bold(text: string): string {
  return styleText("bold", text, { stream: process.stdout });
}

function dim(text: string): string {
  return styleText("dim", text, { stream: process.stdout });
}

function table(rows: ReadonlyArray<readonly [string, string]>): string[] {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${dim(right)}`);
}

function flagLabel(flag: FlagSpec): string {
  const short = flag.short ? `-${flag.short}, ` : "    ";
  const value = flag.value ? ` <${flag.value}>` : "";
  return `${short}--${flag.name}${value}`;
}

function section(title: string, lines: string[]): string[] {
  return [bold(`${title}:`), ...lines, ""];
}

function commandHelp(command: CommandSpec): string {
  const isRoot = command === ROOT_COMMAND;
  const lines = [
    `${command.summary}.`,
    "",
    ...section("Examples", table(command.examples)),
    ...section("Usage", [
      `  ${command.usage}`,
      "",
      ...command.description.split("\n").map((line) => `  ${line}`),
    ]),
  ];
  if (isRoot)
    lines.push(
      ...section("Commands", table(COMMANDS.map((c) => [c.name, c.summary]))),
    );
  if (command.argument) {
    const title = `${command.argument.name.charAt(0).toUpperCase()}${command.argument.name.slice(1)}s`;
    lines.push(...section(title, table(command.argument.values)));
  }
  lines.push(
    ...section(
      "Flags",
      table(command.flags.map((flag) => [flagLabel(flag), flag.description])),
    ),
  );
  lines.push(
    isRoot
      ? 'Run "pmd help <command>" for more about a command, or "pmd help keys" for keyboard shortcuts.'
      : 'Run "pmd --help" for viewer flags.',
  );
  return lines.join("\n");
}

function keysHelp(): string {
  const lines = [
    "Keyboard shortcuts. Press ? in pmd to show them on screen.",
    "",
  ];
  for (const help of [PAGER_HELP, BROWSER_HELP]) {
    lines.push(
      ...section(
        help.title,
        table(
          help.bindings.map((binding) => [
            keyLabel(binding),
            binding.description,
          ]),
        ),
      ),
    );
  }
  return lines.join("\n").trimEnd();
}

export function renderHelp(topic: string | null): string {
  if (topic === "keys") return keysHelp();
  return commandHelp((topic && findCommand(topic)) || ROOT_COMMAND);
}
