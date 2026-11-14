# Architecture

How pmd turns arguments into a rendered page. Read this before changing the CLI entry point, the document renderer, or the interactive app.

## Entry and dispatch

```text
src/index.ts
  → main(args)                          src/cli/main.ts
    → parseInvocation(args)             src/cli/parse.ts      node:util parseArgs + src/cli/spec.ts
      UsageError → stderr "pmd: …", exit 2
    → run(invocation)
      help        → renderHelp(topic)               src/cli/help.ts
      completion  → completionScript(shell)         src/cli/completion.ts
      config      → initConfig / activeConfigPath   src/config.ts
      view        → readTarget → loadConfig → loadThemes
        stdout is not a TTY → printTarget            plain text, or the file list for a directory
        stdout is a TTY     → runApp(target)         src/app.ts
    FailedError and other errors → stderr "pmd: …", exit 1
```

`src/cli/spec.ts` is the single description of commands, flags, and argument values. Parsing, help text, and the bash, zsh, and fish completion scripts are all derived from it.

## Rendering a document

```text
loadContent(markdown, file, theme)      src/content.ts
  → preprocessMdxWithSourceMap          src/mdx.ts           .mdx only, keeps a line map to the file
  → new MarkdownDocument(prepared)      src/document.ts
      Marked lexer → top-level blocks
        code     → drawn as a tinted block, highlighted by src/highlighter.ts (shiki)
        mermaid  → renderMermaid                     src/mermaid.ts (lovely-mermaid)
        other    → pi-tui Markdown, one per block, with reference definitions appended
        html comments → hidden
  → loadHighlighting(theme, document.codeLanguages)  loads only the grammars the document uses
  → createGitStatusResolver(file)       src/git.ts           git diff HEAD → per-line status
```

`MarkdownDocument.renderWithSourceMap(width, fullWidth)` returns each rendered line with the source line span it came from. The pager uses the spans for the Git gutter, for `e` (open the editor at the line on screen), and for jumping to a heading from the table of contents. Mermaid diagrams render against `fullWidth` so `--width` only limits prose.

## Interactive app

```text
runApp(target)                          src/app.ts
  TuiAltScreen
    VStack
      ScrollView(primary) → Switcher → Browser (src/browser.ts) | Pager (src/pager.ts)
      Switcher → StatusBar (src/status-bar.ts) | Spacer
    overlays → showHelp / showTableOfContents        src/overlays.ts (SelectList)
  detectColorScheme(tui)                src/color-scheme.ts  OSC 11 via queryTerminalColors
```

pmd binds its own keys (`src/keybindings.ts`) and unbinds pi-tui's `tui.altScreen.*` viewport keys, because pi-tui's built-in viewport search does not defer letter keys while its search box is focused. Search and filter prompts use pi-tui's `Input`, and the views set `capturesViewportInput` while a prompt is open. When markdown comes from stdin, the app reads keys from `/dev/tty`.
