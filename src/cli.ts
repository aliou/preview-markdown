import { APP_NAME } from "./constants.js";

export interface CliOptions {
  help: boolean;
  version: boolean;
  initConfig: boolean;
  light: boolean;
  dark: boolean;
  noPager: boolean;
  lineNumbers: boolean;
  width: number;
  depth: number;
  completion: string | null;
  source: string | null;
}

const VERSION = "0.1.0";

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    version: false,
    initConfig: false,
    light: false,
    dark: false,
    noPager: false,
    lineNumbers: false,
    width: 100,
    depth: 1,
    completion: null,
    source: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "-v" || arg === "--version") {
      options.version = true;
    } else if (arg === "--init-config" || arg === "--config") {
      options.initConfig = true;
    } else if (arg === "--light") {
      options.light = true;
    } else if (arg === "--dark") {
      options.dark = true;
    } else if (arg === "-p" || arg === "--pager") {
      // Already default, but accept for compatibility
    } else if (arg === "-n" || arg === "--no-pager") {
      options.noPager = true;
    } else if (arg === "-l" || arg === "--line-numbers") {
      options.lineNumbers = true;
    } else if (arg === "-w" || arg === "--width") {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        options.width = parseInt(next, 10);
        i++;
      }
    } else if (arg?.startsWith("--width=")) {
      options.width = parseInt(arg.slice(8), 10);
    } else if (arg === "-d" || arg === "--depth") {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        const n = parseInt(next, 10);
        options.depth = Number.isNaN(n) || n < 1 ? 1 : n;
        i++;
      }
    } else if (arg?.startsWith("--depth=")) {
      const n = parseInt(arg.slice(8), 10);
      options.depth = Number.isNaN(n) || n < 1 ? 1 : n;
    } else if (arg === "--completion") {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        options.completion = next;
        i++;
      }
    } else if (arg?.startsWith("--completion=")) {
      options.completion = arg.slice(13);
    } else if (arg && !arg.startsWith("-")) {
      options.source = arg;
    }
  }

  return options;
}

export function printVersion(): void {
  console.log(`${APP_NAME} version ${VERSION}`);
}

export function printHelp(): void {
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

  console.log(`
  Render markdown on the CLI, with pizzazz!

${bold("Usage:")}
  ${APP_NAME} [SOURCE|DIR] [flags]
  ${APP_NAME} [command]

  With no arguments and a TTY, opens a directory browser at the current directory.
  With a file, renders it in the pager. With a directory, opens the browser there.

${bold("Available Commands:")}
  completion  Generate the autocompletion script for the specified shell
  config      Create the ${APP_NAME} config file

${bold("Flags:")}
  -h, --help            help for ${APP_NAME}
  -d, --depth uint      directory browser recursion depth ${dim("(default: 1, top-level only)")}
  -l, --line-numbers    show line numbers ${dim("(pager only)")}
  -n, --no-pager        display rendered markdown without pager ${dim("(files only, not directories)")}
      --light           force light mode
      --dark            force dark mode
  -v, --version         version for ${APP_NAME}
  -w, --width uint      word-wrap at width ${dim("(default: 100, 0 to disable)")}

${bold("Navigation (in browser):")}
  j, Down               Move down
  k, Up                 Move up
  f, PgDn               Page down
  b, PgUp               Page up
  g, Home               Go to top
  G, End                Go to bottom
  /                     Filter files
  Enter                 Open selected file
  ?                     Show keyboard shortcuts
  q, Esc, Ctrl+C        Quit

${bold("Navigation (in pager):")}
  j, Down               Scroll down
  k, Up                 Scroll up
  d                     Scroll down half page
  u                     Scroll up half page
  f, Space, PgDn        Scroll down one page
  b, PgUp               Scroll up one page
  g, Home               Go to top
  G, End                Go to bottom
  /                     Search in document
  n, N                  Next/previous search match
  e                     Edit file in $EDITOR
  ?                     Show keyboard shortcuts
  q, Esc, Ctrl+C        Quit (back to browser if opened from one)

Use "${APP_NAME} [command] --help" for more information about a command.
`);
}

export function generateBashCompletion(): string {
  return `# ${APP_NAME} bash completion
# Add this to your .bashrc or .bash_profile:
#   source <(${APP_NAME} --completion bash)

_${APP_NAME}_completions() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    opts="-h --help -v --version -l --line-numbers -n --no-pager --light --dark -w --width -d --depth --completion --init-config"

    case "\${prev}" in
        --completion)
            COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
            return 0
            ;;
        -w|--width|-d|--depth)
            return 0
            ;;
    esac

    if [[ "\${cur}" == -* ]]; then
        COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
        return 0
    fi

    # Complete markdown files and directories
    local IFS=$'\\n'
    local files=( $(compgen -f -- "\${cur}") )
    local dirs=( $(compgen -d -- "\${cur}") )

    COMPREPLY=()
    for f in "\${files[@]}"; do
        COMPREPLY+=( "$f" )
    done
    for d in "\${dirs[@]}"; do
        COMPREPLY+=( "$d/" )
    done
    return 0
}

complete -o filenames -F _${APP_NAME}_completions ${APP_NAME}
`;
}

export function generateZshCompletion(): string {
  return `#compdef ${APP_NAME}
# ${APP_NAME} zsh completion
# Add this to your .zshrc:
#   source <(${APP_NAME} --completion zsh)
# Or save to a file in your $fpath

_${APP_NAME}() {
    _arguments -s \\
        '-h[Show help message]' \\
        '--help[Show help message]' \\
        '-v[Show version]' \\
        '--version[Show version]' \\
        '-l[Show line numbers]' \\
        '--line-numbers[Show line numbers]' \\
        '-n[Display without pager]' \\
        '--no-pager[Display without pager]' \\
        '--light[Force light mode]' \\
        '--dark[Force dark mode]' \\
        '-w[Word-wrap at width]:width:' \\
        '--width[Word-wrap at width]:width:' \\
        '-d[Browser recursion depth]:depth:' \\
        '--depth[Browser recursion depth]:depth:' \\
        '--completion[Generate completion script]:shell:(bash zsh fish)' \\
        '--init-config[Create default config file]' \\
        '*:markdown file or directory:_files -g "*(/) *.md *.markdown *.mdx"'
}

# Register the completion function
compdef _${APP_NAME} ${APP_NAME}
`;
}

export function generateFishCompletion(): string {
  return `# ${APP_NAME} fish completion
# Add this to your fish config:
#   ${APP_NAME} --completion fish | source
# Or save to ~/.config/fish/completions/${APP_NAME}.fish

complete -c ${APP_NAME} -s h -l help -d 'Show help message'
complete -c ${APP_NAME} -s v -l version -d 'Show version'
complete -c ${APP_NAME} -s l -l line-numbers -d 'Show line numbers'
complete -c ${APP_NAME} -s n -l no-pager -d 'Display without pager'
complete -c ${APP_NAME} -l light -d 'Force light mode'
complete -c ${APP_NAME} -l dark -d 'Force dark mode'
complete -c ${APP_NAME} -s w -l width -d 'Word-wrap at width' -x
complete -c ${APP_NAME} -s d -l depth -d 'Browser recursion depth' -x
complete -c ${APP_NAME} -l completion -d 'Generate completion script' -xa 'bash zsh fish'
complete -c ${APP_NAME} -l init-config -d 'Create default config file'
complete -c ${APP_NAME} -f -a '(__fish_complete_suffix .md .markdown .mdx)'
`;
}

export function printCompletion(shell: string): boolean {
  switch (shell.toLowerCase()) {
    case "bash":
      console.log(generateBashCompletion());
      return true;
    case "zsh":
      console.log(generateZshCompletion());
      return true;
    case "fish":
      console.log(generateFishCompletion());
      return true;
    default:
      console.error(`Unknown shell: ${shell}`);
      console.error("Supported shells: bash, zsh, fish");
      return false;
  }
}
