import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  extractSegments,
  sliceByColumn,
  sliceWithWidth,
} from "@earendil-works/pi-tui/dist/utils.js";
import { pmdMatches } from "./keybindings.js";

// Strip ANSI escape codes for text searching
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

// Help text displayed as a two-column layout at bottom of viewport
const HELP_LINES = [
  "k/↑ up                 g/home  go to top",
  "j/↓ down               G/end   go to bottom",
  "b/pgup  page up        /       search",
  "f/pgdn  page down      n/N     next/prev match",
  "u  ½ page up           r       reload file",
  "d  ½ page down         e       edit in $EDITOR",
  "T                      table of contents",
  "                       ?       toggle help",
  "                       q/esc   quit",
];

export interface TocEntry {
  level: number;
  title: string;
  line: number;
}

// Line number column width (4 digits + 1 space)
const LINE_NUMBER_WIDTH = 5;

export interface PagerOptions {
  content: Component;
  onExit: () => void;
  onEdit?: (lineNumber: number) => void;
  onReload?: () => void;
  onSuspend?: () => void;
  showLineNumbers?: boolean;
  wrapWidth?: number;
  bgColor?: (text: string) => string;
  fgColor?: (text: string) => string;
  helpBgColor?: (text: string) => string;
  helpFgColor?: (text: string) => string;
  searchBgColor?: (text: string) => string;
  searchFgColor?: (text: string) => string;
  lineNumberColor?: (text: string) => string;
  matchColor?: (text: string) => string;
  currentMatchColor?: (text: string) => string;
  tocEntries?: TocEntry[];
}

export class Pager implements Component {
  private content: Component;
  private onExit: () => void;
  private onEdit?: (lineNumber: number) => void;
  private onReload?: () => void;
  private onSuspend?: () => void;
  private fileChanged = false;
  private showLineNumbers: boolean;
  private wrapWidth: number;
  private scrollOffset = 0;
  private cachedLines: string[] = [];
  private cachedWidth = 0;
  private viewportHeight = 0;
  private showingHelp = false;
  private showingToc = false;
  private tocEntries: TocEntry[] = [];
  private tocIndex = 0;
  private bgColor: (text: string) => string;
  private fgColor: (text: string) => string;
  private helpBgColor: (text: string) => string;
  private helpFgColor: (text: string) => string;
  private searchBgColor: (text: string) => string;
  private searchFgColor: (text: string) => string;
  private lineNumberColor: (text: string) => string;
  private matchColor: (text: string) => string;
  private currentMatchColor: (text: string) => string;

  // Search state
  private searchMode = false;
  private searchQuery = "";
  private searchMatches: number[] = [];
  private currentMatchIndex = -1;

  constructor(options: PagerOptions) {
    this.content = options.content;
    this.onExit = options.onExit;
    this.onEdit = options.onEdit;
    this.onReload = options.onReload;
    this.onSuspend = options.onSuspend;
    this.showLineNumbers = options.showLineNumbers ?? false;
    this.wrapWidth = options.wrapWidth ?? 0;
    this.bgColor = options.bgColor ?? ((t) => t);
    this.fgColor = options.fgColor ?? ((t) => t);
    this.helpBgColor = options.helpBgColor ?? ((t) => t);
    this.helpFgColor = options.helpFgColor ?? ((t) => t);
    this.searchBgColor = options.searchBgColor ?? ((t) => t);
    this.searchFgColor = options.searchFgColor ?? ((t) => t);
    this.lineNumberColor = options.lineNumberColor ?? ((t) => t);
    this.matchColor = options.matchColor ?? ((t) => t);
    this.currentMatchColor = options.currentMatchColor ?? ((t) => t);
    this.tocEntries = options.tocEntries ?? [];
  }

  setContent(content: Component, tocEntries?: TocEntry[]): void {
    if (tocEntries) {
      this.tocEntries = tocEntries;
      this.tocIndex = Math.min(
        this.tocIndex,
        Math.max(0, tocEntries.length - 1),
      );
    }
    this.content = content;
    this.invalidate();
  }

  setTocEntries(tocEntries: TocEntry[]): void {
    this.tocEntries = tocEntries;
    this.tocIndex = Math.min(this.tocIndex, Math.max(0, tocEntries.length - 1));
  }

  setViewportHeight(height: number): void {
    this.viewportHeight = height;
  }

  setFileChanged(changed: boolean): void {
    this.fileChanged = changed;
  }

  updateColors(colors: {
    bgColor?: (text: string) => string;
    fgColor?: (text: string) => string;
    helpBgColor?: (text: string) => string;
    helpFgColor?: (text: string) => string;
    searchBgColor?: (text: string) => string;
    searchFgColor?: (text: string) => string;
    lineNumberColor?: (text: string) => string;
    matchColor?: (text: string) => string;
    currentMatchColor?: (text: string) => string;
  }): void {
    if (colors.bgColor) this.bgColor = colors.bgColor;
    if (colors.fgColor) this.fgColor = colors.fgColor;
    if (colors.helpBgColor) this.helpBgColor = colors.helpBgColor;
    if (colors.helpFgColor) this.helpFgColor = colors.helpFgColor;
    if (colors.searchBgColor) this.searchBgColor = colors.searchBgColor;
    if (colors.searchFgColor) this.searchFgColor = colors.searchFgColor;
    if (colors.lineNumberColor) this.lineNumberColor = colors.lineNumberColor;
    if (colors.matchColor) this.matchColor = colors.matchColor;
    if (colors.currentMatchColor)
      this.currentMatchColor = colors.currentMatchColor;
  }

  invalidate(): void {
    this.content.invalidate();
    this.cachedLines = [];
    this.cachedWidth = 0;
  }

  private getHelpHeight(): number {
    // Help panel height: lines + 1 for top border/padding
    return this.showingHelp ? HELP_LINES.length + 1 : 0;
  }

  private getSearchHeight(): number {
    // Search input takes 1 line when active
    return this.searchMode ? 1 : 0;
  }

  private getNotificationHeight(): number {
    return this.fileChanged ? 1 : 0;
  }

  private getContentHeight(): number {
    return (
      this.viewportHeight -
      this.getHelpHeight() -
      this.getSearchHeight() -
      this.getNotificationHeight()
    );
  }

  private getContentWidth(width: number): number {
    const availableWidth = this.showLineNumbers
      ? width - LINE_NUMBER_WIDTH
      : width;
    // Use wrapWidth if set and smaller than available width
    if (this.wrapWidth > 0 && this.wrapWidth < availableWidth) {
      return this.wrapWidth;
    }
    return availableWidth;
  }

  render(width: number): string[] {
    const contentWidth = this.getContentWidth(width);

    // Re-render content if width changed
    if (this.cachedWidth !== contentWidth || this.cachedLines.length === 0) {
      this.cachedLines = this.content.render(contentWidth);
      this.cachedWidth = contentWidth;
    }

    const totalLines = this.cachedLines.length;
    const contentHeight = this.getContentHeight();

    // Clamp scroll offset
    const maxScroll = Math.max(0, totalLines - contentHeight);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

    // Get visible content slice
    const start = this.scrollOffset;
    const end = Math.min(start + contentHeight, totalLines);
    const sliced = this.cachedLines.slice(start, end);

    // Add line numbers if enabled, always extending line bg to viewport width
    const visible: string[] = [];
    for (let i = 0; i < sliced.length; i++) {
      const lineNum = start + i + 1; // 1-based line numbers
      let line = sliced[i] ?? "";

      // Highlight search matches within this line
      if (this.searchMatches.length > 0 && this.searchQuery) {
        const lineIndex = start + i;
        if (this.searchMatches.includes(lineIndex)) {
          const isCurrent =
            this.searchMatches[this.currentMatchIndex] === lineIndex;
          line = this.highlightSearchTerms(line, isCurrent);
        }
      }

      const rendered = this.showLineNumbers
        ? `${this.lineNumberColor(lineNum.toString().padStart(4, " "))} ${line}`
        : line;

      const pad = Math.max(0, width - visibleWidth(rendered));
      visible.push(
        pad > 0 ? `${rendered}${this.bgColor(" ".repeat(pad))}` : rendered,
      );
    }

    // Pad content to fill its area (with background)
    const emptyLine = this.showLineNumbers
      ? `${this.lineNumberColor("    ")} ${this.bgColor(" ".repeat(contentWidth))}`
      : this.bgColor(" ".repeat(width));
    while (visible.length < contentHeight) {
      visible.push(emptyLine);
    }

    // Append file changed notification if needed
    if (this.fileChanged) {
      visible.push(this.renderNotification(width));
    }

    // Append search input if in search mode
    if (this.searchMode) {
      visible.push(this.renderSearchInput(width));
    }

    // Append help panel if showing
    if (this.showingHelp) {
      visible.push(...this.renderHelp(width));
    }

    if (this.showingToc) {
      return this.renderTocOverlay(visible, width);
    }

    return visible;
  }

  private renderSearchInput(width: number): string {
    const prompt = "/";
    const query = this.searchQuery;
    const cursor = "█";
    const content = `${prompt}${query}${cursor}`;
    const padding = " ".repeat(Math.max(0, width - content.length));
    return this.searchBgColor(this.searchFgColor(content + padding));
  }

  private renderNotification(width: number): string {
    const message = " File changed. Press r to reload.";
    const padding = " ".repeat(Math.max(0, width - message.length));
    return this.helpBgColor(this.helpFgColor(message + padding));
  }

  private renderHelp(width: number): string[] {
    const lines: string[] = [];

    // Empty line as separator/top padding
    const helpEmptyLine = this.helpBgColor(" ".repeat(width));
    lines.push(helpEmptyLine);

    // Render each help line, left-aligned with padding
    for (const line of HELP_LINES) {
      const paddedLine = `  ${line}${" ".repeat(Math.max(0, width - line.length - 2))}`;
      lines.push(this.helpBgColor(this.helpFgColor(paddedLine)));
    }

    return lines;
  }

  private renderTocOverlay(base: string[], width: number): string[] {
    const overlayWidth = Math.max(
      1,
      Math.min(width, Math.max(40, Math.floor(width * 0.7))),
    );
    const overlayHeight = Math.min(
      Math.max(6, this.tocEntries.length + 4),
      Math.max(3, this.viewportHeight - 4),
    );
    const left = Math.max(0, Math.floor((width - overlayWidth) / 2));
    const top = Math.max(
      0,
      Math.floor((this.viewportHeight - overlayHeight) / 2),
    );
    const lines = this.buildTocBox(overlayWidth, overlayHeight);
    const output = [...base];

    for (let i = 0; i < lines.length; i++) {
      const target = top + i;
      if (target >= output.length) break;
      output[target] = this.compositeLineAt(
        output[target] ?? "",
        lines[i] ?? "",
        left,
        overlayWidth,
        width,
      );
    }

    return output;
  }

  private compositeLineAt(
    baseLine: string,
    overlayLine: string,
    startCol: number,
    overlayWidth: number,
    totalWidth: number,
  ): string {
    const afterStart = startCol + overlayWidth;
    const base = extractSegments(
      baseLine,
      startCol,
      afterStart,
      totalWidth - afterStart,
      true,
    );
    const overlay = sliceWithWidth(overlayLine, 0, overlayWidth, true);
    const reset = "\x1b[0m\x1b]8;;\x07";
    const beforePad = Math.max(0, startCol - base.beforeWidth);
    const overlayPad = Math.max(0, overlayWidth - overlay.width);
    const actualBeforeWidth = Math.max(startCol, base.beforeWidth);
    const actualOverlayWidth = Math.max(overlayWidth, overlay.width);
    const afterTarget = Math.max(
      0,
      totalWidth - actualBeforeWidth - actualOverlayWidth,
    );
    const afterPad = Math.max(0, afterTarget - base.afterWidth);
    const result =
      base.before +
      " ".repeat(beforePad) +
      reset +
      overlay.text +
      " ".repeat(overlayPad) +
      reset +
      base.after +
      " ".repeat(afterPad);

    return visibleWidth(result) <= totalWidth
      ? result
      : sliceByColumn(result, 0, totalWidth, true);
  }

  private buildTocBox(width: number, height: number): string[] {
    const lines: string[] = [];
    const innerWidth = Math.max(1, width - 2);
    const title = " Table of contents ";
    lines.push(
      this.searchBgColor(
        this.searchFgColor(`┌${title.padEnd(innerWidth, "─")}┐`),
      ),
    );

    if (this.tocEntries.length === 0) {
      lines.push(
        this.bgColor(
          this.fgColor(`│${" No headings".padEnd(innerWidth, " ")}│`),
        ),
      );
    } else {
      const listHeight = height - 3;
      const start = Math.max(
        0,
        Math.min(
          this.tocIndex - Math.floor(listHeight / 2),
          this.tocEntries.length - listHeight,
        ),
      );
      const end = Math.min(this.tocEntries.length, start + listHeight);

      for (let i = start; i < end; i++) {
        const entry = this.tocEntries[i];
        if (!entry) continue;
        const isSelected = i === this.tocIndex;
        const prefix = isSelected ? "›" : " ";
        const indent = "  ".repeat(Math.max(0, entry.level - 1));
        const title = `${prefix} ${indent}${entry.title}`;
        const body =
          visibleWidth(title) > innerWidth
            ? `${sliceByColumn(title, 0, Math.max(0, innerWidth - 1), true)}…`
            : `${title}${" ".repeat(Math.max(0, innerWidth - visibleWidth(title)))}`;
        const coloredBody = isSelected
          ? this.currentMatchColor(body)
          : this.bgColor(this.fgColor(body));
        lines.push(
          `${this.searchBgColor(this.searchFgColor("│"))}${coloredBody}${this.searchBgColor(this.searchFgColor("│"))}`,
        );
      }
    }

    const empty = this.bgColor(this.fgColor(`│${" ".repeat(innerWidth)}│`));
    while (lines.length < height - 1) lines.push(empty);
    lines.push(
      this.searchBgColor(this.searchFgColor(`└${"─".repeat(innerWidth)}┘`)),
    );
    return lines;
  }

  handleInput(data: string): void {
    // Handle search mode input separately
    if (this.searchMode) {
      this.handleSearchInput(data);
      return;
    }

    if (this.showingToc) {
      this.handleTocInput(data);
      return;
    }

    // Handle suspend
    if (pmdMatches(data, "pmd.pager.suspend")) {
      if (this.onSuspend) {
        this.onSuspend();
      }
      return;
    }

    // Toggle TOC
    if (pmdMatches(data, "pmd.pager.toggleToc")) {
      this.showingToc = true;
      this.showingHelp = false;
      return;
    }

    // Toggle help
    if (pmdMatches(data, "pmd.common.toggleHelp")) {
      this.showingHelp = !this.showingHelp;
      return;
    }

    // If showing help, any other key closes it
    if (this.showingHelp) {
      this.showingHelp = false;
      return;
    }

    const totalLines = this.cachedLines.length;
    const contentHeight = this.getContentHeight();
    const maxScroll = Math.max(0, totalLines - contentHeight);
    const pageSize = Math.max(1, contentHeight - 2);

    // Enter search mode
    if (pmdMatches(data, "pmd.pager.search")) {
      this.searchMode = true;
      this.searchQuery = "";
      return;
    }

    // Navigate to next match
    if (pmdMatches(data, "pmd.pager.nextMatch")) {
      this.goToNextMatch();
      return;
    }

    // Navigate to previous match
    if (pmdMatches(data, "pmd.pager.prevMatch")) {
      this.goToPrevMatch();
      return;
    }

    // Edit in $EDITOR
    if (pmdMatches(data, "pmd.pager.edit")) {
      if (this.onEdit) {
        // Calculate current line number (1-based)
        const lineNumber = this.scrollOffset + 1;
        this.onEdit(lineNumber);
      }
      return;
    }

    // Reload file
    if (pmdMatches(data, "pmd.pager.reload")) {
      if (this.onReload) {
        this.onReload();
      }
      return;
    }

    if (pmdMatches(data, "pmd.common.quit")) {
      this.onExit();
      return;
    }

    if (pmdMatches(data, "pmd.common.up")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      return;
    }

    if (pmdMatches(data, "pmd.common.down")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
      return;
    }

    // Page Up
    if (pmdMatches(data, "pmd.common.pageUp")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - pageSize);
      return;
    }

    // Page Down
    if (pmdMatches(data, "pmd.common.pageDown")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + pageSize);
      return;
    }

    // Home / go to top
    if (pmdMatches(data, "pmd.common.top")) {
      this.scrollOffset = 0;
      return;
    }

    // End / go to bottom
    if (pmdMatches(data, "pmd.common.bottom")) {
      this.scrollOffset = maxScroll;
      return;
    }

    // Half page up
    if (pmdMatches(data, "pmd.pager.halfPageUp")) {
      this.scrollOffset = Math.max(
        0,
        this.scrollOffset - Math.floor(pageSize / 2),
      );
      return;
    }

    // Half page down
    if (pmdMatches(data, "pmd.pager.halfPageDown")) {
      this.scrollOffset = Math.min(
        maxScroll,
        this.scrollOffset + Math.floor(pageSize / 2),
      );
      return;
    }
  }

  private handleTocInput(data: string): void {
    if (
      pmdMatches(data, "pmd.common.cancel") ||
      pmdMatches(data, "pmd.common.quit") ||
      pmdMatches(data, "pmd.pager.toggleToc")
    ) {
      this.showingToc = false;
      return;
    }

    if (this.tocEntries.length === 0) return;

    if (pmdMatches(data, "pmd.common.up")) {
      this.tocIndex = Math.max(0, this.tocIndex - 1);
      return;
    }

    if (pmdMatches(data, "pmd.common.down")) {
      this.tocIndex = Math.min(this.tocEntries.length - 1, this.tocIndex + 1);
      return;
    }

    if (pmdMatches(data, "pmd.common.top")) {
      this.tocIndex = 0;
      return;
    }

    if (pmdMatches(data, "pmd.common.bottom")) {
      this.tocIndex = this.tocEntries.length - 1;
      return;
    }

    if (pmdMatches(data, "pmd.common.confirm")) {
      const entry = this.tocEntries[this.tocIndex];
      if (entry) {
        this.scrollOffset = Math.max(0, entry.line - 1);
      }
      this.showingToc = false;
    }
  }

  private handleSearchInput(data: string): void {
    // Cancel search
    if (pmdMatches(data, "pmd.common.cancel")) {
      this.searchMode = false;
      this.searchQuery = "";
      this.searchMatches = [];
      this.currentMatchIndex = -1;
      return;
    }

    // Confirm search
    if (pmdMatches(data, "pmd.common.confirm")) {
      this.searchMode = false;
      if (this.searchQuery.length > 0) {
        this.performSearch();
        this.goToNextMatch();
      }
      return;
    }

    // Backspace
    if (pmdMatches(data, "pmd.common.backspace")) {
      this.searchQuery = this.searchQuery.slice(0, -1);
      return;
    }

    // Add printable characters to query
    if (data.length === 1 && data >= " ") {
      this.searchQuery += data;
      return;
    }
  }

  private performSearch(): void {
    this.searchMatches = [];
    this.currentMatchIndex = -1;

    if (this.searchQuery.length === 0) {
      return;
    }

    const queryLower = this.searchQuery.toLowerCase();
    for (let i = 0; i < this.cachedLines.length; i++) {
      const line = this.cachedLines[i];
      if (line === undefined) continue;
      const lineText = stripAnsi(line).toLowerCase();
      if (lineText.includes(queryLower)) {
        this.searchMatches.push(i);
      }
    }
  }

  private goToNextMatch(): void {
    if (this.searchMatches.length === 0) {
      return;
    }

    this.currentMatchIndex =
      (this.currentMatchIndex + 1) % this.searchMatches.length;
    this.scrollToMatch();
  }

  private goToPrevMatch(): void {
    if (this.searchMatches.length === 0) {
      return;
    }

    this.currentMatchIndex =
      (this.currentMatchIndex - 1 + this.searchMatches.length) %
      this.searchMatches.length;
    this.scrollToMatch();
  }

  private scrollToMatch(): void {
    if (this.currentMatchIndex < 0 || this.searchMatches.length === 0) {
      return;
    }

    const matchLine = this.searchMatches[this.currentMatchIndex];
    if (matchLine === undefined) {
      return;
    }

    const contentHeight = this.getContentHeight();

    // Scroll so the match is roughly in the middle of the viewport
    const targetOffset = Math.max(0, matchLine - Math.floor(contentHeight / 2));
    const maxScroll = Math.max(0, this.cachedLines.length - contentHeight);
    this.scrollOffset = Math.min(targetOffset, maxScroll);
  }

  private highlightSearchTerms(line: string, isCurrent: boolean): string {
    if (!this.searchQuery) return line;
    const queryLower = this.searchQuery.toLowerCase();
    const plain = stripAnsi(line);
    const plainLower = plain.toLowerCase();

    // Find all match positions in plain text
    const positions: Array<{ start: number; end: number }> = [];
    let pos = 0;
    while (pos < plainLower.length) {
      const idx = plainLower.indexOf(queryLower, pos);
      if (idx === -1) break;
      positions.push({ start: idx, end: idx + queryLower.length });
      pos = idx + queryLower.length;
    }
    if (positions.length === 0) return line;

    const highlightFn = isCurrent ? this.currentMatchColor : this.matchColor;

    let result = "";
    let plainIdx = 0;
    let lineIdx = 0;
    let posPtr = 0;

    while (lineIdx < line.length) {
      // Pass through ANSI escape sequences unchanged
      const ansiMatch = /^\x1b\[[0-9;]*m/.exec(line.slice(lineIdx));
      if (ansiMatch) {
        result += ansiMatch[0];
        lineIdx += ansiMatch[0].length;
        continue;
      }

      // At the start of a match: collect plain characters for this span,
      // discarding any ANSI codes that fall inside it (the highlight replaces them).
      const matchPosition = positions[posPtr];
      if (matchPosition && plainIdx === matchPosition.start) {
        const matchEnd = matchPosition.end;
        let matchStr = "";
        while (plainIdx < matchEnd && lineIdx < line.length) {
          const a = /^\x1b\[[0-9;]*m/.exec(line.slice(lineIdx));
          if (a) {
            lineIdx += a[0].length;
            continue;
          }
          matchStr += line[lineIdx];
          lineIdx++;
          plainIdx++;
        }
        result += highlightFn(matchStr);
        posPtr++;
        continue;
      }

      // Regular character
      result += line[lineIdx];
      lineIdx++;
      plainIdx++;
    }

    return result;
  }

  getScrollInfo(): { current: number; total: number; percent: number } {
    const totalLines = this.cachedLines.length;
    const contentHeight = this.getContentHeight();
    const maxScroll = Math.max(1, totalLines - contentHeight);
    const percent =
      totalLines <= contentHeight
        ? 100
        : Math.round((this.scrollOffset / maxScroll) * 100);
    return {
      current: this.scrollOffset + 1,
      total: totalLines,
      percent,
    };
  }

  isShowingHelp(): boolean {
    return this.showingHelp;
  }

  isSearching(): boolean {
    return this.searchMode;
  }

  getSearchInfo(): { query: string; current: number; total: number } | null {
    if (this.searchMatches.length === 0) {
      return null;
    }
    return {
      query: this.searchQuery,
      current: this.currentMatchIndex + 1,
      total: this.searchMatches.length,
    };
  }
}
