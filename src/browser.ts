import * as fs from "node:fs";
import * as path from "node:path";
import type { Component } from "@mariozechner/pi-tui";
import { Key, matchesKey } from "@mariozechner/pi-tui";

const MD_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);

// Header lines rendered above the file list.
const HEADER_HEIGHT = 2;

// Lines rendered per list item: filename, metadata, blank separator.
const ITEM_HEIGHT = 3;

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

const MINI_HELP =
  "  enter open  •  j/k move  •  / filter  •  ? help  •  s cycle sort  •  r reverse sort  •  q quit";

// Two-column help displayed as a full-screen overlay.
const HELP_LINES = [
  "  j / ↓     move down          g / Home    go to top",
  "  k / ↑     move up            G / End     go to bottom",
  "  f / PgDn  page down          /           filter files",
  "  b / PgUp  page up            Esc         clear filter",
  "  Enter     open file          ?           close help",
  "  s           cycle sort         r           reverse sort",
];

function relativeTime(mtime: Date): string {
  const diff = Date.now() - mtime.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasValidCreationTime(createdAt: Date, updatedAt: Date): boolean {
  return createdAt.getTime() > 0 && createdAt.getTime() <= updatedAt.getTime();
}

export interface Entry {
  absolutePath: string;
  relativePath: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Recursively scan baseDir for markdown files up to maxDepth levels.
 * Depth 1 means only files directly in baseDir. Skips hidden entries,
 * .git, and uses realpath-based cycle detection for symlinked directories.
 * Returns entries sorted by relative path.
 */
export function scanDirectory(baseDir: string, maxDepth: number): Entry[] {
  const entries: Entry[] = [];
  // Track real paths of visited directories to prevent symlink cycles.
  const visitedRealPaths = new Set<string>();

  function recurse(dir: string, currentDepth: number): void {
    if (currentDepth > maxDepth) return;

    // Resolve the real path to detect cycles introduced by symlinks.
    let realDir: string;
    try {
      realDir = fs.realpathSync(dir);
    } catch {
      return;
    }
    if (visitedRealPaths.has(realDir)) return;
    visitedRealPaths.add(realDir);

    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      // Skip hidden files/dirs (including .git)
      if (item.name.startsWith(".")) continue;

      const fullPath = path.join(dir, item.name);

      // For symlinks, resolve via stat to get the target type.
      // Directories are followed (cycle guard above handles loops).
      // Files are included if they have a markdown extension.
      if (item.isSymbolicLink()) {
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue; // Broken symlink — skip.
        }
        if (stat.isDirectory()) {
          recurse(fullPath, currentDepth + 1);
        } else if (stat.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (MD_EXTENSIONS.has(ext)) {
            entries.push({
              absolutePath: fullPath,
              relativePath: path.relative(baseDir, fullPath),
              createdAt: stat.birthtime,
              updatedAt: stat.mtime,
            });
          }
        }
        continue;
      }

      if (item.isDirectory()) {
        recurse(fullPath, currentDepth + 1);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (MD_EXTENSIONS.has(ext)) {
          let createdAt = new Date(0);
          let updatedAt = new Date(0);
          try {
            const stat = fs.statSync(fullPath);
            createdAt = stat.birthtime;
            updatedAt = stat.mtime;
          } catch {
            // Leave timestamps as epoch on error.
          }
          entries.push({
            absolutePath: fullPath,
            relativePath: path.relative(baseDir, fullPath),
            createdAt,
            updatedAt,
          });
        }
      }
    }
  }

  recurse(baseDir, 0);
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
}

export interface BrowserColors {
  bgColor?: (text: string) => string;
  fgColor?: (text: string) => string;
  // Color used for the selected item's gutter marker and filename.
  accentColor?: (text: string) => string;
  // Color used for timestamps and mini help text.
  dimColor?: (text: string) => string;
  helpBgColor?: (text: string) => string;
  helpFgColor?: (text: string) => string;
  filterBgColor?: (text: string) => string;
  filterFgColor?: (text: string) => string;
}

export interface BrowserOptions extends BrowserColors {
  entries: Entry[];
  baseDir: string;
  onOpen: (entry: Entry) => void;
  onQuit: () => void;
  onColorSchemeChange?: (scheme: ColorScheme) => void;
}

export class Browser implements Component {
  private entries: Entry[];
  private baseDir: string;
  private filtered: Entry[];
  private cursor = 0;
  private scrollOffset = 0; // In items, not lines.
  private viewportHeight = 0;
  private filterQuery = "";
  private filterMode = false;
  private showingHelp = false;
  private sortKey: "path" | "created" | "updated" = "path";
  private sortDirection: "asc" | "desc" = "asc";
  private onOpen: (entry: Entry) => void;
  private onQuit: () => void;
  private onColorSchemeChange?: (scheme: ColorScheme) => void;
  private bgColor: (text: string) => string;
  private fgColor: (text: string) => string;
  private accentColor: (text: string) => string;
  private dimColor: (text: string) => string;
  private helpBgColor: (text: string) => string;
  private helpFgColor: (text: string) => string;
  private filterBgColor: (text: string) => string;
  private filterFgColor: (text: string) => string;

  constructor(options: BrowserOptions) {
    this.entries = options.entries;
    this.baseDir = options.baseDir;
    this.filtered = [...options.entries];
    this.onOpen = options.onOpen;
    this.onQuit = options.onQuit;
    this.onColorSchemeChange = options.onColorSchemeChange;
    this.bgColor = options.bgColor ?? ((t) => t);
    this.fgColor = options.fgColor ?? ((t) => t);
    this.accentColor = options.accentColor ?? ((t) => t);
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
    if (colors.accentColor !== undefined) this.accentColor = colors.accentColor;
    if (colors.dimColor !== undefined) this.dimColor = colors.dimColor;
    if (colors.helpBgColor !== undefined) this.helpBgColor = colors.helpBgColor;
    if (colors.helpFgColor !== undefined) this.helpFgColor = colors.helpFgColor;
    if (colors.filterBgColor !== undefined)
      this.filterBgColor = colors.filterBgColor;
    if (colors.filterFgColor !== undefined)
      this.filterFgColor = colors.filterFgColor;
  }

  // Lines available for list content. Top header and bottom help/filter lines
  // are reserved. When help overlay is shown it takes the full viewport.
  private getListHeight(): number {
    if (this.showingHelp) return 0;
    return Math.max(0, this.viewportHeight - HEADER_HEIGHT - 1);
  }

  // How many 3-line items fit in the current list area.
  private getVisibleItemCount(): number {
    return Math.floor(this.getListHeight() / ITEM_HEIGHT);
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

  private applySort(): void {
    const comparator = (a: Entry, b: Entry): number => {
      let comparison = 0;
      switch (this.sortKey) {
        case "path":
          comparison = a.relativePath.localeCompare(b.relativePath);
          break;
        case "created":
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case "updated":
          comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
          break;
      }
      return this.sortDirection === "asc" ? comparison : -comparison;
    };
    this.entries.sort(comparator);
    this.applyFilter();
  }

  private ensureCursorVisible(): void {
    const visible = this.getVisibleItemCount();
    if (visible <= 0) return;
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    } else if (this.cursor >= this.scrollOffset + visible) {
      this.scrollOffset = this.cursor - visible + 1;
    }
    const maxScroll = Math.max(0, this.filtered.length - visible);
    this.scrollOffset = Math.min(Math.max(0, this.scrollOffset), maxScroll);
  }

  // Render a single 3-line item: gutter+bullet+name, timestamp, blank.
  private renderItem(
    entry: Entry,
    isSelected: boolean,
    width: number,
  ): string[] {
    const gutter = isSelected ? "│ " : "  ";
    const bullet = "\u2022 "; // •
    const prefix = gutter + bullet; // 4 chars

    // Line 1: filename, truncated if needed.
    const nameAvail = Math.max(0, width - prefix.length);
    let name = entry.relativePath;
    if (name.length > nameAvail) {
      name = `${name.slice(0, nameAvail - 1)}\u2026`;
    }
    const nameLine =
      prefix + name + " ".repeat(Math.max(0, nameAvail - name.length));

    // Line 2: created + updated metadata, indented to align with filename.
    const timeIndent = "    "; // same width as prefix
    const created = hasValidCreationTime(entry.createdAt, entry.updatedAt)
      ? formatDate(entry.createdAt)
      : "unknown";
    const updated = `${formatDate(entry.updatedAt)} (${relativeTime(entry.updatedAt)})`;
    const meta = `${timeIndent}c ${created}  •  u ${updated}`;
    const timeLine =
      meta.length < width
        ? meta + " ".repeat(width - meta.length)
        : `${meta.slice(0, Math.max(0, width - 1))}…`;

    // Line 3: blank separator.
    const blankLine = " ".repeat(width);

    const bg = this.bgColor;
    if (isSelected) {
      return [
        bg(this.accentColor(nameLine)),
        bg(this.dimColor(timeLine)),
        bg(blankLine),
      ];
    }
    return [
      bg(this.fgColor(nameLine)),
      bg(this.dimColor(timeLine)),
      bg(blankLine),
    ];
  }

  private renderHeader(width: number): string[] {
    const total = this.filtered.length;
    const selected = total > 0 ? this.cursor + 1 : 0;

    const home = process.env.HOME ?? "";
    const displayBase =
      home && this.baseDir.startsWith(home)
        ? `~${this.baseDir.slice(home.length)}`
        : this.baseDir;

    const filterLabel =
      this.filterQuery.length > 0 ? ` • /${this.filterQuery}` : "";
    const sortLabel = this.getSortLabel();
    const left = ` ${displayBase}${filterLabel}${sortLabel}`;
    const right = ` ${selected}/${total} docs `;

    const available = Math.max(0, width - right.length);
    const leftTruncated =
      left.length > available
        ? `${left.slice(0, Math.max(0, available - 1))}…`
        : left;
    const padding = Math.max(0, width - leftTruncated.length - right.length);
    const firstLine = leftTruncated + " ".repeat(padding) + right;

    const divider = "─".repeat(Math.max(0, width));

    return [
      this.bgColor(this.fgColor(firstLine)),
      this.bgColor(this.dimColor(divider)),
    ];
  }

  private getSortLabel(): string {
    let keyLabel = "";
    switch (this.sortKey) {
      case "path":
        keyLabel = "name";
        break;
      case "created":
        keyLabel = "created";
        break;
      case "updated":
        keyLabel = "updated";
        break;
    }
    const arrow = this.sortDirection === "asc" ? "▲" : "▼";
    return ` • ${keyLabel}${arrow}`;
  }

  private renderMiniHelp(width: number): string {
    const text = MINI_HELP;
    const padded =
      text.length < width
        ? text + " ".repeat(width - text.length)
        : text.slice(0, width);
    return this.bgColor(this.dimColor(padded));
  }

  private renderFilterInput(width: number): string {
    const content = `/${this.filterQuery}\u2588`; // █ cursor
    const padding = " ".repeat(Math.max(0, width - content.length));
    return this.filterBgColor(this.filterFgColor(content + padding));
  }

  private renderHelpOverlay(width: number): string[] {
    const lines: string[] = [];
    const bg = this.helpBgColor;
    const fg = this.helpFgColor;
    const emptyLine = bg(" ".repeat(width));

    // Two blank lines at the top as padding.
    lines.push(emptyLine);
    lines.push(emptyLine);

    for (const line of HELP_LINES) {
      const padded = line + " ".repeat(Math.max(0, width - line.length));
      lines.push(bg(fg(padded)));
    }

    // Fill remaining viewport.
    while (lines.length < this.viewportHeight) {
      lines.push(emptyLine);
    }

    return lines;
  }

  render(width: number): string[] {
    if (this.showingHelp) {
      return this.renderHelpOverlay(width);
    }

    const listHeight = this.getListHeight();
    const visibleCount = this.getVisibleItemCount();
    const lines: string[] = [];
    const emptyLine = this.bgColor(" ".repeat(width));

    lines.push(...this.renderHeader(width));

    if (this.filtered.length === 0) {
      const msg =
        this.filterQuery.length > 0
          ? "No files match your filter."
          : "No markdown files found.";
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
      const end = Math.min(start + visibleCount, this.filtered.length);

      for (let i = start; i < end; i++) {
        const entry = this.filtered[i];
        if (!entry) continue;
        lines.push(...this.renderItem(entry, i === this.cursor, width));
      }

      // Pad remaining list area.
      while (lines.length < HEADER_HEIGHT + listHeight) {
        lines.push(emptyLine);
      }
    }

    // Bottom line: filter input or mini help.
    if (this.filterMode) {
      lines.push(this.renderFilterInput(width));
    } else {
      lines.push(this.renderMiniHelp(width));
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

    // Toggle help overlay.
    if (data === "?") {
      this.showingHelp = !this.showingHelp;
      return;
    }

    // Any key closes the help overlay.
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

    // Enter filter mode.
    if (data === "/") {
      this.filterMode = true;
      this.filterQuery = "";
      this.applyFilter();
      return;
    }

    // Cycle sort key
    if (data === "s" || data === "S") {
      if (!this.filterMode && !this.showingHelp) {
        if (this.sortKey === "path") {
          this.sortKey = "created";
        } else if (this.sortKey === "created") {
          this.sortKey = "updated";
        } else {
          this.sortKey = "path";
        }
        this.applySort();
      }
      return;
    }

    // Toggle sort direction
    if (data === "r" || data === "R") {
      if (!this.filterMode && !this.showingHelp) {
        this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
        this.applySort();
      }
      return;
    }

    // Open selected entry.
    if (matchesKey(data, Key.enter)) {
      if (this.filtered.length > 0) {
        const entry = this.filtered[this.cursor];
        if (entry) this.onOpen(entry);
      }
      return;
    }

    const pageSize = Math.max(1, this.getVisibleItemCount() - 1);
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
