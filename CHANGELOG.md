# preview-markdown

## 0.4.0

### Minor Changes

- 1e9cfa5: Add directory browser mode. Running `pmd` or `pmd <dir>` opens a TUI file browser with keyboard navigation, live filtering, relative timestamps, and seamless transition into the pager when a file is selected.
- 2b479a4: Polish browsing and reading UX: update `@mariozechner/pi-tui` to latest, refresh code block rendering with full-width separators and subtle background, improve browser header/metadata (including created + updated dates), remove redundant browser status bar, and keep Mermaid rendering as ASCII-only output.

## 0.3.0

### Minor Changes

- 8a56124: Render mermaid code blocks as ASCII diagrams using beautiful-mermaid. Supports flowcharts, sequence, class, ER, and state diagrams. Falls back to raw source on unsupported types.

## 0.2.0

### Minor Changes

- 8d257fe: Accept any file type, add reload notification, support MDX

  - Remove .md/.markdown extension restriction - now accepts any file
  - Replace auto-reload with notification bar ("File changed. Press r to reload.")
  - Add MDX support - JSX components and imports rendered as code blocks

### Patch Changes

- e3e631a: Fix status bar crash when terminal width is narrow

  - Truncate filename from beginning to prevent width overflow (keeps file name visible)
  - Hide help text when not enough space
  - Percentage is always displayed
  - Remove leftover debug log

## 0.1.0

Initial release.
