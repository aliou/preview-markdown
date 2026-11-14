# preview-markdown

A terminal markdown pager with syntax highlighting, search, and vim-style navigation.

This project is an experiment in building a complete tool using AI coding agents with minimal manual code intervention.

## Features

- Directory browser: run `pmd` or `pmd <dir>` to browse and open markdown files
- Syntax highlighting for fenced code blocks, drawn as tinted blocks
- Mermaid diagram support, rendered as Unicode box art
- MDX support, with JSX shown as code
- Vim-style navigation (j/k, d/u, g/G, etc.) and a table of contents with `T`
- Search as you type with `/` and jump between matches with `n`/`N`
- Edit the file in `$EDITOR` at the current line with `e`, with a notice when the file changes on disk
- Git status gutter for files in a Git worktree
- Light and dark mode, detected from the terminal background or forced
- Plain text output when piped, so `pmd` works in scripts

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
pmd                     # Browse markdown files in the current directory
pmd docs/ --depth 3     # Browse up to three levels deep
pmd README.md           # Open a file in the pager
cat CHANGELOG.md | pmd  # Read from stdin (or: pmd -)
pmd README.md | less    # Print plain text when stdout is not a terminal
```

`pmd --help` lists the flags and commands, and `pmd help <command>` shows the details of one command. Press `?` inside pmd, or run `pmd help keys`, for the keyboard shortcuts.

pmd exits with 0 on success, 1 when something fails (for example a missing file), and 2 for a usage error such as an unknown flag.

### Shell completion

Load completion in the current shell:

```bash
source <(pmd completion zsh)   # zsh
source <(pmd completion bash)  # bash
pmd completion fish | source   # fish
```

Install it permanently:

```bash
pmd completion zsh > "${fpath[1]}/_pmd"
pmd completion bash > ~/.local/share/bash-completion/completions/pmd
pmd completion fish > ~/.config/fish/completions/pmd.fish
```

## Configuration

`pmd config init` writes the default config to `~/.config/pmd/config.json` (or `$XDG_CONFIG_HOME/pmd/config.json`). A `.pmd.json` in the current directory takes precedence over it; `pmd config path` prints the file pmd reads. The config is validated against `schema.json`, and `.pmd.json` in this repository is an example.

`theme` names a bundled theme (`senzu-dark`, `senzu-light`) or a TextMate theme file in `~/.config/pmd/themes/<name>.json`, either for both modes or as a `{ "dark": ..., "light": ... }` pair.

When viewing a file in a Git worktree, pmd shows a Git status gutter. It compares the working tree with `HEAD`; green marks additions, yellow modifications, red deletion boundaries, and blue moved lines.

## License

MIT
