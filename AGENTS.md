# pmd (preview-markdown)

Terminal markdown pager with syntax highlighting, written in TypeScript and built with Bun. Distributed as a single binary via Bun's single-executable-application (SEA) compiler.

## What it does

`pmd` renders markdown files in the terminal with syntax-highlighted code blocks, Mermaid diagram support (rendered as ASCII), vim-style navigation, search, and a directory browser for exploring folders of markdown files.

## Architecture

The app has two main modes, managed by a `Switcher` component that delegates rendering to whichever is active:

- **Browser** (`src/browser.ts`): TUI file picker that scans a directory for `.md`/`.markdown`/`.mdx` files. Supports filtering, sorting, and recursive depth.
- **Pager** (`src/pager.ts`): Scrollable viewer for a single markdown file. Handles search, line numbers, file watching, and opening `$EDITOR`.

Both are built on top of `@earendil-works/pi-tui`, which provides the TUI framework and markdown rendering component. The project patches `pi-tui` to render code blocks with box-drawing borders instead of backtick markers, with wrapping inside the box (see `patches/` and the `pi-tui-patch` skill).

### Key modules

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point. CLI parsing, mode selection, TUI setup, color scheme change handling |
| `src/browser.ts` | Directory browser component |
| `src/pager.ts` | Scrollable pager component |
| `src/cli.ts` | Argument parsing and shell completion generation |
| `src/keybindings.ts` | Centralized pmd keybinding definitions |
| `src/theme.ts` | Theme resolution. Bundled Senzu themes + user-provided TextMate themes |
| `src/highlighter.ts` | Shiki-based syntax highlighting for code blocks |
| `src/mermaid.ts` | Mermaid diagram preprocessing (renders diagrams to ASCII) |
| `src/mdx.ts` | MDX preprocessing (strips JSX so the markdown renderer can handle it) |
| `src/color-scheme.ts` | Terminal light/dark mode detection |
| `src/editor.ts` | Opens the file in `$EDITOR` |
| `src/watcher.ts` | File change watching for live reload |
| `src/config.ts` | User config loading from `~/.config/pmd/config.json` |

### Build and distribution

- `bun run build` compiles platform-specific binaries to `dist/` (currently darwin-arm64 and linux-arm64).
- The project uses a Nix flake (`flake.nix`) for reproducible builds and provides a home-manager module.
- Releases are automated via changesets and GitHub Actions (see the `release` skill for details).

### Dependencies

- `@earendil-works/pi-tui` -- TUI framework and markdown rendering (patched)
- `shiki` -- syntax highlighting engine
- `chalk` -- terminal colors
- `beautiful-mermaid` -- Mermaid-to-ASCII rendering

## Development

```bash
# Run directly
bun run src/index.ts README.md

# Lint and typecheck
bun run lint
bun run typecheck

# Install git hooks (also done by nix develop)
lefthook install -f

# Build binaries
bun run build
```

## Conventions

- The project uses Biome for linting and formatting.
- Git hooks are managed by Lefthook (`lefthook.yml`). The dev shell installs the hook automatically.
- Versioning uses changesets. See the `release` skill for the full release workflow.
- When upgrading `@earendil-works/pi-tui`, follow the `pi-tui-patch` skill to regenerate the patch.
