export interface FlagSpec {
  name: string;
  short?: string;
  value?: string;
  description: string;
}

export interface ArgumentSpec {
  name: string;
  values: ReadonlyArray<readonly [string, string]>;
}

export interface CommandSpec {
  name: string;
  usage: string;
  summary: string;
  description: string;
  examples: ReadonlyArray<readonly [string, string]>;
  flags: readonly FlagSpec[];
  argument?: ArgumentSpec;
}

export interface DeprecatedFlag {
  name: string;
  value?: string;
  replacement: string;
}

export const SHELLS = ["bash", "zsh", "fish"] as const;

export type Shell = (typeof SHELLS)[number];

export const CONFIG_ACTIONS = ["init", "path"] as const;

export type ConfigAction = (typeof CONFIG_ACTIONS)[number];

const GLOBAL_FLAGS: readonly FlagSpec[] = [
  { name: "help", short: "h", description: "Show help" },
  { name: "version", short: "v", description: "Print the version" },
];

export const ROOT_COMMAND: CommandSpec = {
  name: "pmd",
  usage: "pmd [FILE | DIR | -] [flags]\n  pmd <command> [flags]",
  summary: "Render markdown in the terminal",
  description:
    "Opens a file in the pager, a directory in the file browser, or markdown from stdin.\nWhen stdout is not a terminal, prints plain text, or the file list for a directory.",
  examples: [
    ["pmd README.md", "Open a file in the pager"],
    ["pmd docs/ --depth 3", "Browse markdown files up to three levels deep"],
    ["git show HEAD:README.md | pmd", "Read markdown from stdin"],
    ["pmd README.md | grep -i install", "Print plain text when piped"],
  ],
  flags: [
    {
      name: "depth",
      short: "d",
      value: "n",
      description: "Directory browser recursion depth (default 1)",
    },
    {
      name: "line-numbers",
      short: "l",
      description: "Show line numbers in the pager",
    },
    {
      name: "width",
      short: "w",
      value: "n",
      description:
        "Wrap text at this width, 0 for the full width (default 100)",
    },
    { name: "light", description: "Use the light theme" },
    { name: "dark", description: "Use the dark theme" },
    ...GLOBAL_FLAGS,
  ],
};

export const COMPLETION_COMMAND: CommandSpec = {
  name: "completion",
  usage: "pmd completion <bash | zsh | fish>",
  summary: "Print a shell completion script",
  description:
    'Prints a completion script for the shell. See "Shell completion" in the README to install it.',
  examples: [
    ["source <(pmd completion zsh)", "Enable completion in the current zsh"],
    ["source <(pmd completion bash)", "Enable completion in the current bash"],
    [
      "pmd completion fish > ~/.config/fish/completions/pmd.fish",
      "Install fish completion",
    ],
  ],
  flags: GLOBAL_FLAGS,
  argument: {
    name: "shell",
    values: SHELLS.map(
      (shell) => [shell, `Completion script for ${shell}`] as const,
    ),
  },
};

export const CONFIG_COMMAND: CommandSpec = {
  name: "config",
  usage: "pmd config <init | path> [flags]",
  summary: "Create the config file or print its path",
  description:
    "init writes the default config to the global config directory.\npath prints the config file pmd reads from the current directory.",
  examples: [
    ["pmd config init", "Create ~/.config/pmd/config.json"],
    ["pmd config init --force", "Replace an existing config file"],
    ['$EDITOR "$(pmd config path)"', "Edit the active config file"],
  ],
  flags: [
    {
      name: "force",
      short: "f",
      description: "Overwrite an existing config file",
    },
    ...GLOBAL_FLAGS,
  ],
  argument: {
    name: "action",
    values: [
      ["init", "Create the default config file"],
      ["path", "Print the active config file path"],
    ],
  },
};

export const HELP_COMMAND: CommandSpec = {
  name: "help",
  usage: "pmd help [command | keys]",
  summary: "Show help for a command or the keyboard shortcuts",
  description:
    'Shows help for a command, or the pager and browser shortcuts with "keys".',
  examples: [
    ["pmd help completion", "Show help for the completion command"],
    ["pmd help keys", "List keyboard shortcuts"],
  ],
  flags: GLOBAL_FLAGS,
  argument: {
    name: "topic",
    values: [
      ["completion", "Shell completion"],
      ["config", "Config file"],
      ["help", "This help"],
      ["keys", "Keyboard shortcuts"],
    ],
  },
};

export const COMMANDS: readonly CommandSpec[] = [
  COMPLETION_COMMAND,
  CONFIG_COMMAND,
  HELP_COMMAND,
];

export const DEPRECATED_FLAGS: readonly DeprecatedFlag[] = [
  { name: "completion", value: "shell", replacement: "pmd completion <shell>" },
  { name: "init-config", replacement: "pmd config init" },
  { name: "config", replacement: "pmd config init" },
];

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((command) => command.name === name);
}

export function argumentValues(command: CommandSpec): string[] {
  return command.argument?.values.map(([value]) => value) ?? [];
}
