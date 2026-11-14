import { parseArgs } from "node:util";
import type { ColorScheme } from "../color-scheme";
import {
  argumentValues,
  COMMANDS,
  COMPLETION_COMMAND,
  CONFIG_ACTIONS,
  CONFIG_COMMAND,
  type CommandSpec,
  type ConfigAction,
  DEPRECATED_FLAGS,
  findCommand,
  HELP_COMMAND,
  ROOT_COMMAND,
  SHELLS,
  type Shell,
} from "./spec";
import { closestMatch } from "./suggest";
import { UsageError } from "./usage-error";

export interface ViewOptions {
  source: string | null;
  depth: number;
  width: number;
  lineNumbers: boolean;
  colorScheme: ColorScheme | null;
}

export type Invocation =
  | { kind: "view"; options: ViewOptions }
  | { kind: "help"; topic: string | null }
  | { kind: "version" }
  | { kind: "completion"; shell: Shell }
  | { kind: "config"; action: ConfigAction; force: boolean };

export interface ParsedArgs {
  invocation: Invocation;
  warnings: string[];
}

type Tokens = NonNullable<ReturnType<typeof parseArgs>["tokens"]>;

type Values = ReturnType<typeof parseArgs>["values"];

interface FlagShape {
  name: string;
  short?: string;
  value?: string;
}

const ALL_FLAGS: readonly FlagShape[] = [
  ...ROOT_COMMAND.flags,
  ...COMMANDS.flatMap((command) => command.flags),
  ...DEPRECATED_FLAGS,
];

const PARSE_OPTIONS = Object.fromEntries(
  ALL_FLAGS.map((flag) => {
    const type = flag.value ? ("string" as const) : ("boolean" as const);
    return [flag.name, flag.short ? { type, short: flag.short } : { type }];
  }),
);

function didYouMean(
  input: string,
  candidates: readonly string[],
  format = (value: string) => value,
): string {
  const suggestion = closestMatch(input, candidates);
  return suggestion ? ` (did you mean "${format(suggestion)}"?)` : "";
}

function checkFlags(
  tokens: Tokens,
  allowed: readonly FlagShape[],
  topic: string | null,
): void {
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    const flag = allowed.find((candidate) => candidate.name === token.name);
    if (!flag) {
      const hint = didYouMean(
        token.name,
        allowed.map((candidate) => candidate.name),
        (name) => `--${name}`,
      );
      throw new UsageError(`unknown flag "${token.rawName}"${hint}`, topic);
    }
    if (flag.value && token.value === undefined) {
      throw new UsageError(`flag "${token.rawName}" needs a value`, topic);
    }
    if (!flag.value && token.value !== undefined) {
      throw new UsageError(
        `flag "${token.rawName}" does not take a value`,
        topic,
      );
    }
  }
}

function chooseArgument<T extends string>(
  command: CommandSpec,
  allowed: readonly T[],
  value: string | undefined,
): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match) return match;
  const name = command.argument?.name ?? "argument";
  const topic = command === HELP_COMMAND ? null : command.name;
  if (value === undefined) {
    throw new UsageError(
      `${command.name} needs a ${name}: ${allowed.join(", ")}`,
      topic,
    );
  }
  throw new UsageError(
    `unknown ${name} "${value}"${didYouMean(value, allowed)}; use ${allowed.join(", ")}`,
    topic,
  );
}

function chooseHelpTopic(value: string | undefined): string | null {
  return value === undefined
    ? null
    : chooseArgument(HELP_COMMAND, argumentValues(HELP_COMMAND), value);
}

function parseCount(
  values: Values,
  name: string,
  min: number,
  fallback: number,
): number {
  const raw = values[name];
  if (typeof raw !== "string") return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min) {
    throw new UsageError(
      `--${name} expects a whole number of at least ${min}, got "${raw}"`,
      null,
    );
  }
  return Number(raw);
}

function parseSubcommand(
  command: CommandSpec,
  positionals: string[],
  values: Values,
  tokens: Tokens,
): Invocation {
  checkFlags(tokens, command.flags, command.name);
  const extra = positionals[2];
  if (extra !== undefined)
    throw new UsageError(`unexpected argument "${extra}"`, command.name);

  switch (command) {
    case COMPLETION_COMMAND:
      return {
        kind: "completion",
        shell: chooseArgument(command, SHELLS, positionals[1]),
      };
    case CONFIG_COMMAND: {
      const action = chooseArgument(command, CONFIG_ACTIONS, positionals[1]);
      const force = values.force === true;
      if (force && action !== "init")
        throw new UsageError(
          `--force only applies to "pmd config init"`,
          "config",
        );
      return { kind: "config", action, force };
    }
    default:
      return { kind: "help", topic: chooseHelpTopic(positionals[1]) };
  }
}

function parseDeprecated(
  values: Values,
  warnings: string[],
): Invocation | null {
  const completion = values.completion;
  if (typeof completion === "string") {
    warnings.push(
      `--completion is deprecated, use "pmd completion ${completion}"`,
    );
    return {
      kind: "completion",
      shell: chooseArgument(COMPLETION_COMMAND, SHELLS, completion),
    };
  }
  const configFlag = ["init-config", "config"].find(
    (name) => values[name] === true,
  );
  if (!configFlag) return null;
  warnings.push(`--${configFlag} is deprecated, use "pmd config init"`);
  return { kind: "config", action: "init", force: true };
}

function parseView(
  positionals: string[],
  values: Values,
  tokens: Tokens,
  warnings: string[],
): Invocation {
  checkFlags(tokens, [...ROOT_COMMAND.flags, ...DEPRECATED_FLAGS], null);
  const deprecated = parseDeprecated(values, warnings);
  if (deprecated) return deprecated;
  if (positionals.length > 1) {
    throw new UsageError(
      `expected one file or directory, got ${positionals.length}`,
      null,
    );
  }
  if (values.light === true && values.dark === true) {
    throw new UsageError("--light and --dark cannot be combined", null);
  }
  return {
    kind: "view",
    options: {
      source: positionals[0] ?? null,
      depth: parseCount(values, "depth", 1, 1),
      width: parseCount(values, "width", 0, 100),
      lineNumbers: values["line-numbers"] === true,
      colorScheme:
        values.light === true ? "light" : values.dark === true ? "dark" : null,
    },
  };
}

function commandName(
  positionals: string[],
  tokens: Tokens,
): string | undefined {
  const first = tokens.find(
    (token) =>
      token.kind === "positional" || token.kind === "option-terminator",
  );
  return first?.kind === "positional" ? positionals[0] : undefined;
}

function helpTopic(
  command: CommandSpec | undefined,
  positionals: string[],
): string | null {
  if (!command) return null;
  return command === HELP_COMMAND
    ? chooseHelpTopic(positionals[1])
    : command.name;
}

export function parseInvocation(args: string[]): ParsedArgs {
  const { values, positionals, tokens } = parseArgs({
    args,
    options: PARSE_OPTIONS,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const warnings: string[] = [];
  const name = commandName(positionals, tokens);
  const command = name === undefined ? undefined : findCommand(name);

  if (values.help === true) {
    return {
      invocation: { kind: "help", topic: helpTopic(command, positionals) },
      warnings,
    };
  }
  if (values.version === true)
    return { invocation: { kind: "version" }, warnings };
  const invocation = command
    ? parseSubcommand(command, positionals, values, tokens)
    : parseView(positionals, values, tokens, warnings);
  return { invocation, warnings };
}
