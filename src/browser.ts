import * as fs from "node:fs";
import * as path from "node:path";
import type { Component } from "@mariozechner/pi-tui";
import { Key, matchesKey } from "@mariozechner/pi-tui";

const MD_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);

const PAGE_UP_SEQUENCES = ["\x1b[5~", "\x1b[5;1~"];
const PAGE_DOWN_SEQUENCES = ["\x1b[6~", "\x1b[6;1~"];

function isPageUp(data: string): boolean {
  return PAGE_UP_SEQUENCES.includes(data);
}

function isPageDown(data: string): boolean {
  return PAGE_DOWN_SEQUENCES.includes(data);
}

// Color scheme change detection (mode 2031) - same sequences as pager.ts
const COLOR_SCHEME_DARK = "\x1b[?997;1n";
const COLOR_SCHEME_LIGHT = "\x1b[?997;2n";

export type ColorScheme = "light" | "dark";

const HELP_LINES = [
  "j/↓  move down          g/home  go to top",
  "k/↑  move up            G/end   go to bottom",
  "f/pgdn  page down       /       filter files",
  "b/pgup  page up         esc     clear filter",
  "enter   open file       ?       toggle help",
  "                        q/esc   quit",
];

export interface Entry {
  absolutePath: string;
  relativePath: string;
}

/**
 * Recursively scan baseDir for markdown files up to maxDepth levels.
 * Depth 1 means only files directly in baseDir. Skips hidden entries,
 * .git, and symlinked directories. Returns entries sorted by relative path.
 */
export function scanDirectory(baseDir: string, maxDepth: number): Entry[] {
  const entries: Entry[] = [];

  function recurse(dir: string, currentDepth: number): void {
    if (currentDepth > maxDepth) return;

    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      // Skip hidden files/dirs and .git
      if (item.name.startsWith(".")) continue;

      const fullPath = path.join(dir, item.name);

      if (item.isSymbolicLink()) {
        // Follow symlinks to files but skip symlinked directories
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) continue;
          const ext = path.extname(item.name).toLowerCase();
          if (MD_EXTENSIONS.has(ext)) {
            entries.push({
              absolutePath: fullPath,
              relativePath: path.relative(baseDir, fullPath),
            });
          }
        } catch {
          continue;
        }
        continue;
      }

      if (item.isDirectory()) {
        recurse(fullPath, currentDepth + 1);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (MD_EXTENSIONS.has(ext)) {
          entries.push({
            absolutePath: fullPath,
            relativePath: path.relative(baseDir, fullPath),
          });
        }
      }
    }
  }

  recurse(baseDir, 1);
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
}

export interface BrowserColors {
  bgColor?: (text: string) => string;
  fgColor?: (text: string) => string;
  selectedBgColor?: (text: string) => string;
  selectedFgColor?: (text: string) => string;
  dimColor?: (text: string) => string;
  helpBgColor?: (text: string) => string;
  helpFgColor?: (text: string) => string;
  filterBgColor?: (text: string) => string;
  filterFgColor?: (text: string) => string;
}

export interface BrowserOptions extends BrowserColors {
  entries: Entry[];
  onOpen: (entry: Entry) => void;
  onQuit: () => void;
  onColorSchemeChange?: (scheme: ColorScheme) => void;
}

export class Browser implements Component {
  private entries: Entry[];
  private filtered: Entry[];
  private cursor = 0;
  private scrollOffset = 0;
  private viewportHeight = 0;
  private filterQuery = "";
  private filterMode = false;
  private showingHelp = false;
  private onOpen: (entry: Entry) => void;
  private onQuit: () => void;
  private onColorSchemeChange?: (scheme: ColorScheme) => void;
  private bgColor: (text: string) => string;
  private fgColor: (text: string) => string;
  private selectedBgColor: (text: string) => string;
  private selectedFgColor: (text: string) => string;
  private dimColor: (text: string) => string;
  private helpBgColor: (text: string) => string;
  private helpFgColor: (text: string) => string;
  private filterBgColor: (text: string) => string;
  private filterFgColor: (text: string) => string;

  constructor(options: BrowserOptions) {
    this.entries = options.entries;
    this.filtered = [...options.entries];
    this.onOpen = options.onOpen;
    this.onQuit = options.onQuit;
    this.onColorSchemeChange = options.onColorSchemeChange;
    this.bgColor = options.bgColor ?? ((t) => t);
    this.fgColor = options.fgColor ?? ((t) => t);
    this.selectedBgColor = options.selectedBgColor ?? ((t) => t);
    this.selectedFgColor = options.selectedFgColor ?? ((t) => t);
    this.dimColor = options.dimColor ?? ((t) => t);
    this.helpBgColor = options.helpBgColor ?? ((t) => t);
    this.helpFgColor = options.helpFgColor ?? ((t) => t);
    this.filterBgColor = options.filterBgColor ?? ((t) => t);
    this.filterFgColor = options.filterFgColor ?? ((t) => t);
  }

  invalidate(): void {}

  setViewportHeight(height: number): void {
    this.viewportHeight = height;
  }

  updateColors(colors: BrowserColors): void {
    if (colors.bgColor !== undefined) this.bgColor = colors.bgColor;
    if (colors.fgColor !== undefined) this.fgColor = colors.fgColor;
    if (colors.selectedBgColor !== undefined)
      this.selectedBgColor = colors.selectedBgColor;
    if (colors.selectedFgColor !== undefined)
      this.selectedFgColor = colors.selectedFgColor;
    if (colors.dimColor !== undefined) this.dimColor = colors.dimColor;
    if (colors.helpBgColor !== undefined) this.helpBgColor = colors.helpBgColor;
    if (colors.helpFgColor !== undefined) this.helpFgColor = colors.helpFgColor;
    if (colors.filterBgColor !== undefined)
      this.filterBgColor = colors.filterBgColor;
    if (colors.filterFgColor !== undefined)
      this.filterFgColor = colors.filterFgColor;
  }

  getStatusInfo(): { selected: number; total: number; filter: string | null } {
    return {
      selected: this.filtered.length > 0 ? this.cursor + 1 : 0,
      total: this.filtered.length,
      filter: this.filterQuery.length > 0 ? this.filterQuery : null,
    };
  }

  private getHelpHeight(): number {
    return this.showingHelp ? HELP_LINES.length + 1 : 0;
  }

  private getFilterHeight(): number {
    return this.filterMode ? 1 : 0;
  }

  private getListHeight(): number {
    return Math.max(
      0,
      this.viewportHeight - this.getHelpHeight() - this.getFilterHeight(),
    );
  }

  private applyFilter(): void {
    if (this.filterQuery.length === 0) {
      this.filtered = [...this.entries];
    } else {
      const q = this.filterQuery.toLowerCase();
      this.filtered = this.entries.filter((e) =>
        e.relativePath.toLowerCase().includes(q),
      );
    }
    this.cursor = 0;
    this.scrollOffset = 0;
  }

  private ensureCursorVisible(): void {
    const listHeight = this.getListHeight();
    if (listHeight <= 0) return;
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    } else if (this.cursor >= this.scrollOffset + listHeight) {
      this.scrollOffset = this.cursor - listHeight + 1;
    }
    const maxScroll = Math.max(0, this.filtered.length - listHeight);
    this.scrollOffset = Math.min(Math.max(0, this.scrollOffset), maxScroll);
  }

  render(width: number): string[] {
    const listHeight = this.getListHeight();
    const lines: string[] = [];

    if (this.filtered.length === 0) {
      const msg =
        this.filterQuery.length > 0
          ? "No files match your filter."
          : "No markdown files found.";
      const emptyLine = this.bgColor(" ".repeat(width));
      for (let i = 0; i < listHeight; i++) {
        if (i === Math.floor(listHeight / 2)) {
          const padded = `  ${msg}${" ".repeat(Math.max(0, width - msg.length - 2))}`;
          lines.push(this.bgColor(this.dimColor(padded)));
        } else {
          lines.push(emptyLine);
        }
      }
    } else {
      this.ensureCursorVisible();
      const start = this.scrollOffset;
      const end = Math.min(start + listHeight, this.filtered.length);

      for (let i = start; i < end; i++) {
        const entry = this.filtered[i];
        if (!entry) continue;
        const isSelected = i === this.cursor;
        const text = `  ${entry.relativePath}`;
        const padding = " ".repeat(Math.max(0, width - text.length));
        const line = text + padding;
        if (isSelected) {
          lines.push(this.selectedBgColor(this.selectedFgColor(line)));
        } else {
          lines.push(this.bgColor(this.fgColor(line)));
        }
      }

      // Pad remaining list area with background
      const emptyLine = this.bgColor(" ".repeat(width));
      while (lines.length < listHeight) {
        lines.push(emptyLine);
      }
    }

    // Filter input line
    if (this.filterMode) {
      const content = `/${this.filterQuery}█`;
      const padding = " ".repeat(Math.max(0, width - content.length));
      lines.push(this.filterBgColor(this.filterFgColor(content + padding)));
    }

    // Help overlay at bottom
    if (this.showingHelp) {
      lines.push(this.helpBgColor(" ".repeat(width)));
      for (const helpLine of HELP_LINES) {
        const padded = `  ${helpLine}${" ".repeat(Math.max(0, width - helpLine.length - 2))}`;
        lines.push(this.helpBgColor(this.helpFgColor(padded)));
      }
    }

    return lines;
  }

  handleInput(data: string): void {
    // Color scheme change notifications
    if (data === COLOR_SCHEME_DARK || data.includes(COLOR_SCHEME_DARK)) {
      this.onColorSchemeChange?.("dark");
      return;
    }
    if (data === COLOR_SCHEME_LIGHT || data.includes(COLOR_SCHEME_LIGHT)) {
      this.onColorSchemeChange?.("light");
      return;
    }

    if (this.filterMode) {
      this.handleFilterInput(data);
      return;
    }

    // Toggle help
    if (data === "?") {
      this.showingHelp = !this.showingHelp;
      return;
    }

    // Any key closes help first
    if (this.showingHelp) {
      this.showingHelp = false;
      return;
    }

    // Quit
    if (
      matchesKey(data, Key.ctrl("c")) ||
      data === "q" ||
      data === "Q" ||
      matchesKey(data, Key.escape)
    ) {
      this.onQuit();
      return;
    }

    // Enter filter mode
    if (data === "/") {
      this.filterMode = true;
      this.filterQuery = "";
      this.applyFilter();
      return;
    }

    // Open selected entry
    if (matchesKey(data, Key.enter)) {
      if (this.filtered.length > 0) {
        const entry = this.filtered[this.cursor];
        if (entry) this.onOpen(entry);
      }
      return;
    }

    const listHeight = this.getListHeight();
    const pageSize = Math.max(1, listHeight - 1);
    const max = Math.max(0, this.filtered.length - 1);

    if (matchesKey(data, Key.up) || data === "k") {
      this.cursor = Math.max(0, this.cursor - 1);
      return;
    }

    if (matchesKey(data, Key.down) || data === "j") {
      this.cursor = Math.min(max, this.cursor + 1);
      return;
    }

    if (matchesKey(data, Key.home) || data === "g") {
      this.cursor = 0;
      this.scrollOffset = 0;
      return;
    }

    if (matchesKey(data, Key.end) || data === "G") {
      this.cursor = max;
      return;
    }

    if (isPageUp(data) || data === "b" || data === "B") {
      this.cursor = Math.max(0, this.cursor - pageSize);
      return;
    }

    if (isPageDown(data) || data === "f" || data === "F" || data === " ") {
      this.cursor = Math.min(max, this.cursor + pageSize);
      return;
    }
  }

  private handleFilterInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.filterMode = false;
      this.filterQuery = "";
      this.applyFilter();
      return;
    }

    if (matchesKey(data, Key.enter)) {
      this.filterMode = false;
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      this.filterQuery = this.filterQuery.slice(0, -1);
      this.applyFilter();
      return;
    }

    if (data.length === 1 && data >= " ") {
      this.filterQuery += data;
      this.applyFilter();
      return;
    }
  }
}

export class BrowserStatusBar implements Component {
  private browser: Browser;
  private baseDir: string;
  private bgColor: (text: string) => string;
  private fgColor: (text: string) => string;

  constructor(
    browser: Browser,
    baseDir: string,
    bgColor: (text: string) => string,
    fgColor: (text: string) => string,
  ) {
    this.browser = browser;
    this.baseDir = baseDir;
    this.bgColor = bgColor;
    this.fgColor = fgColor;
  }

  updateColors(
    bgColor: (text: string) => string,
    fgColor: (text: string) => string,
  ): void {
    this.bgColor = bgColor;
    this.fgColor = fgColor;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const info = this.browser.getStatusInfo();

    const helpStr = " ? Help ";
    const countStr = ` ${info.selected}/${info.total} `;
    const filterStr = info.filter ? ` [/${info.filter}] ` : "";
    const right = filterStr + countStr + helpStr;

    // Show home-shortened path for readability
    const home = process.env.HOME ?? "";
    const displayBase =
      home && this.baseDir.startsWith(home)
        ? `~${this.baseDir.slice(home.length)}`
        : this.baseDir;
    const dirLabel = ` ${displayBase}`;

    const available = width - right.length;
    let displayDir = dirLabel;
    if (displayDir.length > available) {
      // Truncate from start, prepend ellipsis
      let truncated = displayDir;
      while (truncated.length > available - 1 && truncated.length > 0) {
        truncated = truncated.slice(1);
      }
      displayDir = `\u2026${truncated}`;
    }

    const padding = Math.max(0, width - displayDir.length - right.length);
    const line = displayDir + " ".repeat(padding) + right;
    return [this.bgColor(this.fgColor(line))];
  }
}
