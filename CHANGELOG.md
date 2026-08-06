# preview-markdown

## 0.13.0

### Minor Changes

- 522bf78: Migrate fullscreen rendering to `@earendil-works/pi-tui` 0.84.0 with `TuiAltScreen`, `ScrollView`, and fixed status chrome.

### Patch Changes

- 0f14b64: Add syntax highlighting for more fenced code block languages, including `diff`.

## 0.12.0

### Minor Changes

- b505789: Upgrade `@earendil-works/pi-tui` to 0.83.0 and regenerate the markdown-renderer patch.

## 0.11.0

### Minor Changes

- 46db944: Wrap URLs in OSC 8 hyperlinks so they are clickable in compatible terminals, including bare URLs and the URL shown in `text (url)` link fallbacks.

## 0.10.0

### Minor Changes

- 0f37f55: Add an automatic Git status gutter to Markdown previews.

### Patch Changes

- bf07d9f: Allow the `$schema` key in pmd configuration files.

## 0.9.0

### Minor Changes

- 3ad550d: Replace the bundled Jellybeans themes with Senzu (regular dark and light variants). Default dark/light themes are now `senzu-dark` and `senzu-light`. The home-manager module options `dark`/`light` (raw color palettes) are replaced by `darkTheme`/`lightTheme` theme-name strings.

## 0.8.0

### Minor Changes

- bccd835: Render block-level HTML comments as tinted comment blocks with dim text, keeping the `<!--` and `-->` markers.

## 0.7.0

### Minor Changes

- 24395b3: Render fenced code blocks as indented blocks with a tinted background instead of boxed borders, and add half-height padding rows above and below each block.

## 0.6.1

### Patch Changes

- efb77a6: Add x86_64 Linux release binaries and expose the CLI through the flake packages.

## 0.6.0

### Minor Changes

- 868f943: Centralize pmd keybindings so browser and pager shortcuts use shared definitions.

### Patch Changes

- 66d5f71: Preload the Nix grammar so fenced Nix code blocks are syntax highlighted.
- b13f7b8: Restore the terminal screen correctly after returning from the editor.
- 66d5f71: Wrap long lines inside boxed code blocks so borders stay aligned.

## 0.5.0

### Minor Changes

- f1c689b: Add folder sorting by name, created, and updated dates. Press 's' to cycle sort key (name, created, updated) and 'r' to toggle ascending/descending. Current sort displayed in header.
- 7d2e3ef: Highlight search matches inline in the pager. All matching lines show the matched text with an amber background; the currently-focused match uses a brighter orange background to distinguish it.

## 0.4.1

### Patch Changes

- 17ba1e9: Fix off-by-one in directory scan depth: `--depth 1` (default) now includes files in direct subdirectories, `--depth 0` means top-level only.

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
