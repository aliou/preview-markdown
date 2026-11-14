---
"preview-markdown": minor
---

Rework the command line and the interactive views.

- Add `pmd help [command|keys]`, `pmd completion <bash|zsh|fish>`, and `pmd config <init|path>`. `--completion`, `--init-config`, and `--config` still work but print a deprecation warning.
- Reject unknown flags and invalid values with exit code 2, a `pmd:` error on stderr, and a did-you-mean suggestion. Runtime failures exit 1.
- Print plain text when stdout is not a terminal, and the list of files for a directory. Read markdown from stdin with `-`.
- `--version` prints the real version.
- Generate zsh and fish completion with descriptions for commands, flags, and values, and complete only markdown files.
- Search highlights matches as you type and shows the match count. The browser filter is fuzzy. Help and the table of contents (`T`) open as overlays.
- Hide HTML comments, highlight jsx, tsx, jsonc, mdx, terraform, and just with their own grammars, and render bold and italic tokens in code blocks.
- Report invalid config files with the offending field, and warn when a configured theme does not exist.
- Release binaries are Node.js 26 single executables built with tsdown instead of Bun binaries.
