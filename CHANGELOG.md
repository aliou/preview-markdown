# preview-markdown

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
