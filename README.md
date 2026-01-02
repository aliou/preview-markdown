# preview-markdown

A terminal markdown pager with syntax highlighting, search, and vim-style navigation.

This project is an experiment in building a complete tool using AI coding agents with minimal manual code intervention.

## Features

- Syntax highlighting for code blocks with language labels
- Vim-style navigation (j/k, d/u, g/G, etc.)
- Search with `/` and navigate matches with `n`/`N`
- Edit file in `$EDITOR` with `e`, auto-reload on save
- File watching for external changes
- Light and dark mode (auto-detected or forced)
- Pager mode or direct output (`--no-pager`)

## Installation

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
pmd README.md           # Open in pager
pmd --no-pager FILE.md  # Print to stdout
cat FILE.md | pmd       # Read from stdin
```

### Options

```
-n, --no-pager     Display rendered markdown without pager
-l, --line-numbers Show line numbers
-w, --width N      Word-wrap at width (0 to disable)
    --light        Force light mode
    --dark         Force dark mode
```

### Navigation

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
| `?` | Show help |
| `q` / `Esc` | Quit |

### Shell Completions

```bash
pmd completion bash > /etc/bash_completion.d/pmd
pmd completion zsh > ~/.zsh/completions/_pmd
pmd completion fish > ~/.config/fish/completions/pmd.fish
```

## Configuration

Create a config file with `pmd config` or manually at `~/.config/pmd/config.json`.

See `.pmd.json` in this repo for an example.

## License

MIT
