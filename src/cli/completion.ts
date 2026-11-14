import {
  COMMANDS,
  type CommandSpec,
  type FlagSpec,
  ROOT_COMMAND,
  type Shell,
} from "./spec";

const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdx"];

function quote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

function flagWords(flags: readonly FlagSpec[]): string {
  return flags
    .flatMap((flag) => [
      ...(flag.short ? [`-${flag.short}`] : []),
      `--${flag.name}`,
    ])
    .join(" ");
}

function valueFlags(flags: readonly FlagSpec[]): string {
  return flags
    .filter((flag) => flag.value)
    .flatMap((flag) => [
      ...(flag.short ? [`-${flag.short}`] : []),
      `--${flag.name}`,
    ])
    .join("|");
}

function argumentWords(command: CommandSpec): string {
  return command.argument?.values.map(([value]) => value).join(" ") ?? "";
}

function bash(): string {
  const commandCases = COMMANDS.map(
    (command) =>
      `    ${command.name}) COMPREPLY=($(compgen -W ${quote(`${argumentWords(command)} ${flagWords(command.flags)}`)} -- "$cur")); return ;;`,
  ).join("\n");
  return `# bash completion for pmd
# Load it in the current shell with: source <(pmd completion bash)

_pmd() {
  local cur="\${COMP_WORDS[COMP_CWORD]}" prev="\${COMP_WORDS[COMP_CWORD-1]}" command="" i
  for ((i = 1; i < COMP_CWORD; i++)); do
    case "\${COMP_WORDS[i]}" in
      ${COMMANDS.map((command) => command.name).join("|")}) command="\${COMP_WORDS[i]}"; break ;;
    esac
  done
  case "$command" in
${commandCases}
  esac
  case "$prev" in
    ${valueFlags(ROOT_COMMAND.flags)}) return ;;
  esac
  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W ${quote(flagWords(ROOT_COMMAND.flags))} -- "$cur"))
    return
  fi
  COMPREPLY=()
  if ((COMP_CWORD == 1)); then
    COMPREPLY=($(compgen -W ${quote(COMMANDS.map((command) => command.name).join(" "))} -- "$cur"))
  fi
  local IFS=$'\\n'
  COMPREPLY+=($(compgen -d -- "$cur") $(compgen -f -- "$cur" | grep -E '\\.(${MARKDOWN_EXTENSIONS.join("|")})$'))
}

complete -o filenames -F _pmd pmd
`;
}

function zshEscape(text: string): string {
  return text.replace(/([[\]:'\\])/g, "\\$1");
}

function zshFlag(flag: FlagSpec, indent: string): string {
  const names = flag.short
    ? `{-${flag.short},--${flag.name}}`
    : `--${flag.name}`;
  const exclusive =
    flag.name === "help" || flag.name === "version"
      ? "'(- *)'"
      : flag.short
        ? `'(-${flag.short} --${flag.name})'`
        : "";
  const value = flag.value ? `:${flag.value}:` : "";
  return `${indent}${exclusive}${names}'[${zshEscape(flag.description)}]${value}'`;
}

function zshValues(command: CommandSpec): string {
  const values = command.argument?.values.map(
    ([value, description]) =>
      `${value}\\:${zshEscape(description).replaceAll(" ", "\\ ")}`,
  );
  return `'1:${command.argument?.name}:((${values?.join(" ") ?? ""}))'`;
}

function zsh(): string {
  const commands = COMMANDS.map(
    (command) =>
      `${command.name}\\:${zshEscape(command.summary).replaceAll(" ", "\\ ")}`,
  ).join(" ");
  const commandCases = COMMANDS.map(
    (command) =>
      `        ${command.name})\n          _arguments -s \\\n${command.flags.map((flag) => `${zshFlag(flag, "            ")} \\`).join("\n")}\n            ${zshValues(command)}\n          ;;`,
  ).join("\n");
  return `#compdef pmd
# zsh completion for pmd
# Load it in the current shell with: source <(pmd completion zsh)
# Or save it as _pmd in a directory on your $fpath.

_pmd() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  _arguments -s -C \\
${ROOT_COMMAND.flags.map((flag) => `${zshFlag(flag, "    ")} \\`).join("\n")}
    '1: :->first' \\
    '*:: :->rest' && return
  case $state in
    first)
      _alternative \\
        'commands:command:((${commands}))' \\
        'files:markdown file or directory:_files -g "*.(${MARKDOWN_EXTENSIONS.join("|")})(-.)"'
      ;;
    rest)
      case $line[1] in
${commandCases}
      esac
      ;;
  esac
}

if [[ $zsh_eval_context[-1] == loadautofunc ]]; then
  _pmd "$@"
else
  compdef _pmd pmd
fi
`;
}

function fishFlag(flag: FlagSpec, condition: string): string {
  const short = flag.short ? ` -s ${flag.short}` : "";
  const value = flag.value ? " -x" : "";
  return `complete -c pmd -n ${quote(condition)}${short} -l ${flag.name}${value} -d ${quote(flag.description)}`;
}

function fish(): string {
  const names = COMMANDS.map((command) => command.name).join(" ");
  const root = `not __fish_seen_subcommand_from ${names}`;
  const lines = [
    "# fish completion for pmd",
    "# Install it with: pmd completion fish > ~/.config/fish/completions/pmd.fish",
    "",
    "complete -c pmd -f",
    ...COMMANDS.map(
      (command) =>
        `complete -c pmd -n ${quote(`__fish_use_subcommand`)} -a ${command.name} -d ${quote(command.summary)}`,
    ),
    `complete -c pmd -n ${quote(root)} -a ${quote(`(__fish_complete_path (commandline -ct) | string match -r '^.*(?:/|\\.(?:${MARKDOWN_EXTENSIONS.join("|")}))(?:\\t.*)?$')`)}`,
    ...ROOT_COMMAND.flags.map((flag) => fishFlag(flag, root)),
  ];
  for (const command of COMMANDS) {
    const condition = `__fish_seen_subcommand_from ${command.name}`;
    for (const [value, description] of command.argument?.values ?? []) {
      lines.push(
        `complete -c pmd -n ${quote(condition)} -a ${value} -d ${quote(description)}`,
      );
    }
    lines.push(...command.flags.map((flag) => fishFlag(flag, condition)));
  }
  return `${lines.join("\n")}\n`;
}

export function completionScript(shell: Shell): string {
  switch (shell) {
    case "bash":
      return bash();
    case "zsh":
      return zsh();
    case "fish":
      return fish();
  }
}
