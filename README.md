# preview-markdown

A terminal markdown pager with syntax highlighting, search, and vim-style navigation.

This project is an experiment in building a complete tool using AI coding agents with minimal manual code intervention.

## Features

- Directory browser: run `pmd` or `pmd <dir>` to browse and open markdown files
- Syntax highlighting for fenced code blocks with boxed borders and language labels
- Mermaid diagram support, rendered as Unicode box art
- MDX support, with JSX stripped before rendering
- Vim-style navigation (j/k, d/u, g/G, etc.)
- Search with `/` and navigate matches with `n`/`N`
- Edit file in `$EDITOR` with `e`, auto-reload on save
- File watching for external changes
- Light and dark mode (auto-detected or forced)
- Configurable line numbers, themes, and wrapping width

## Installation

### Homebrew

```bash
brew tap aliou/toolbox
brew install aliou/toolbox/pmd
```

### Manual

Download the binary for your platform from the [releases page](https://github.com/aliou/preview-markdown/releases):

- `pmd-darwin-arm64` - macOS Apple Silicon
- `pmd-linux-arm64` - Linux ARM64

Then install it somewhere in your `$PATH`:

```bash
# Example for macOS
curl -L https://github.com/aliou/preview-markdown/releases/latest/download/pmd-darwin-arm64 -o pmd
chmod +x pmd
sudo mv pmd /usr/local/bin/
```

### Nix

Add to your flake inputs:

```nix
{
  inputs.pmd.url = "github:aliou/preview-markdown";
}
```

Then either run directly:

```bash
nix run github:aliou/preview-markdown -- README.md
```

Or add to your system/home-manager packages:

```nix
# In your configuration
{ inputs, ... }:
{
  environment.systemPackages = [ inputs.pmd.packages.${system}.default ];
}
```

A home-manager module is also available:

```nix
{ inputs, ... }:
{
  imports = [ inputs.pmd.homeManagerModules.default ];
  programs.pmd.enable = true;
}
```

## Usage

```bash
pmd                     # Browse markdown files in current directory
pmd docs/               # Browse markdown files in docs/
pmd docs/ --depth 3     # Browse recursively up to 3 levels deep
pmd README.md           # Open a file directly in the pager
cat FILE.md | pmd       # Read from stdin
```

### Options

```
-d, --depth N      Directory browser recursion depth (default: 1, includes direct subdirectories)
-l, --line-numbers Show line numbers (pager only)
-w, --width N      Word-wrap at width (0 to disable)
    --light        Force light mode
    --dark         Force dark mode
```

### Browser navigation

Browsing supports `.md`, `.markdown`, and `.mdx` files.

| Key | Action |
|-----|--------|
| `j` / `Down` | Move down |
| `k` / `Up` | Move up |
| `f` / `PgDn` | Page down |
| `b` / `PgUp` | Page up |
| `g` / `Home` | Go to top |
| `G` / `End` | Go to bottom |
| `/` | Filter files by name |
| `Esc` | Clear filter |
| `s` / `S` | Cycle sort mode |
| `r` / `R` | Reverse sort order |
| `Enter` | Open selected file |
| `?` | Show help |
| `q` / `Esc` | Quit |

### Pager navigation

| Key | Action |
|-----|--------|
| `j` / `Down` | Scroll down |
| `k` / `Up` | Scroll up |
| `d` | Half page down |
| `u` | Half page up |
| `f` / `Space` / `PgDn` | Page down |
| `b` / `PgUp` | Page up |
| `g` / `Home` | Go to top |
| `G` / `End` | Go to bottom |
| `/` | Search |
| `n` / `N` | Next/previous match |
| `e` | Edit in $EDITOR |
| `r` / `R` | Reload file |
| `Ctrl+Z` | Suspend pmd |
| `?` | Show help |
| `q` / `Esc` | Quit (returns to browser if opened from one) |

### Shell Completions

```bash
pmd --completion bash > /etc/bash_completion.d/pmd
pmd --completion zsh > ~/.zsh/completions/_pmd
pmd --completion fish > ~/.config/fish/completions/pmd.fish
```

## Configuration

Create a config file with `pmd --init-config` or `pmd --config`, or manually at `~/.config/pmd/config.json`.

Local config is also supported via `.pmd.json` in the current directory and takes precedence over global config. See `.pmd.json` in this repo for an example.

When viewing a file in a Git worktree, pmd automatically shows a Git status gutter. It compares the working tree with `HEAD`; green marks additions, yellow modifications, red deletion boundaries, and blue moved lines.

## License

MIT
