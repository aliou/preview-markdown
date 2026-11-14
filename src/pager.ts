import { stripVTControlCharacters } from "node:util";
import { type Component, Input, visibleWidth } from "@earendil-works/pi-tui";
import { extractAnsiCode } from "@earendil-works/pi-tui/dist/utils";
import type { RenderedDocument } from "./document";
import type { GitStatusResolver } from "./git";
import { wrapUrlsHyperlinks } from "./hyperlink";
import { type PmdKeybinding, pmdMatches } from "./keybindings";
import type { SourceSpan } from "./source-map";
import type { Style, UiStyles } from "./theme";
import type { ViewportController } from "./viewport";

export interface PagerContent extends Component {
  renderWithSourceMap(width: number, fullWidth: number): RenderedDocument;
}

export interface PagerActions {
  quit(): void;
  help(): void;
  tableOfContents(): void;
  edit(sourceLine: number): void;
  reload(): void;
  suspend(): void;
}

export interface PagerOptions {
  content: PagerContent;
  gitStatus: GitStatusResolver | undefined;
  viewport: ViewportController;
  styles: () => UiStyles;
  actions: PagerActions;
  showLineNumbers: boolean;
  wrapWidth: number;
}

export interface SearchStatus {
  current: number;
  total: number;
}

const LINE_NUMBER_WIDTH = 5;
const GIT_GUTTER_GLYPH = "▎";

function findMatches(line: string, query: string): Array<[number, number]> {
  const plain = stripVTControlCharacters(line).toLowerCase();
  const needle = query.toLowerCase();
  const positions: Array<[number, number]> = [];
  let from = plain.indexOf(needle);
  while (from !== -1) {
    positions.push([from, from + needle.length]);
    from = plain.indexOf(needle, from + needle.length);
  }
  return positions;
}

function highlightMatches(line: string, query: string, style: Style): string {
  const positions = findMatches(line, query);
  let result = "";
  let plainIndex = 0;
  let index = 0;
  let next = 0;
  while (index < line.length) {
    const sequence = extractAnsiCode(line, index);
    if (sequence) {
      result += sequence.code;
      index += sequence.length;
      continue;
    }
    const match = positions[next];
    if (match && plainIndex === match[0]) {
      let text = "";
      while (plainIndex < match[1] && index < line.length) {
        const skipped = extractAnsiCode(line, index);
        if (skipped) {
          index += skipped.length;
          continue;
        }
        text += line[index];
        index++;
        plainIndex++;
      }
      result += style(text);
      next++;
      continue;
    }
    result += line[index];
    index++;
    plainIndex++;
  }
  return result;
}

export class Pager implements Component {
  private content: PagerContent;
  private gitStatus: GitStatusResolver | undefined;
  private readonly viewport: ViewportController;
  private readonly styles: () => UiStyles;
  private readonly actions: PagerActions;
  private readonly showLineNumbers: boolean;
  private readonly wrapWidth: number;
  private lines: string[] = [];
  private spans: Array<SourceSpan | null> = [];
  private renderedWidth = -1;
  private fileChanged = false;
  private searchInput: Input | null = null;
  private query = "";
  private matches: number[] = [];
  private currentMatch = -1;

  constructor(options: PagerOptions) {
    this.content = options.content;
    this.gitStatus = options.gitStatus;
    this.viewport = options.viewport;
    this.styles = options.styles;
    this.actions = options.actions;
    this.showLineNumbers = options.showLineNumbers;
    this.wrapWidth = options.wrapWidth;
  }

  get capturesViewportInput(): boolean {
    return this.searchInput !== null;
  }

  setContent(
    content: PagerContent,
    gitStatus: GitStatusResolver | undefined,
  ): void {
    this.content = content;
    this.gitStatus = gitStatus;
    this.fileChanged = false;
    this.invalidate();
  }

  setFileChanged(): void {
    this.fileChanged = true;
  }

  invalidate(): void {
    this.content.invalidate();
    this.renderedWidth = -1;
  }

  private gutterWidth(): number {
    return (
      (this.gitStatus ? 1 : 0) + (this.showLineNumbers ? LINE_NUMBER_WIDTH : 0)
    );
  }

  private refresh(width: number): void {
    if (this.renderedWidth === width) return;
    const fullWidth = Math.max(1, width - this.gutterWidth());
    const wrapped =
      this.wrapWidth > 0 ? Math.min(this.wrapWidth, fullWidth) : fullWidth;
    const rendered = this.content.renderWithSourceMap(wrapped, fullWidth);
    this.lines = rendered.lines;
    this.spans = rendered.sourceSpans;
    this.renderedWidth = width;
    this.updateMatches();
  }

  render(width: number): string[] {
    this.refresh(width);
    const ui = this.styles();
    this.viewport.setContentLineCount(this.lines.length);
    const current = this.matches[this.currentMatch];
    const output = this.lines.map((line, index) => {
      const highlighted =
        this.query && this.matches.includes(index)
          ? highlightMatches(
              line,
              this.query,
              index === current ? ui.currentMatch : ui.match,
            )
          : line;
      return this.decorate(
        wrapUrlsHyperlinks(highlighted),
        this.spans[index] ?? null,
        index + 1,
        width,
        ui,
      );
    });
    while (output.length < this.viewport.viewportHeight) {
      output.push(this.decorate("", null, null, width, ui));
    }
    return output;
  }

  private decorate(
    line: string,
    span: SourceSpan | null,
    number: number | null,
    width: number,
    ui: UiStyles,
  ): string {
    let prefix = "";
    if (this.gitStatus) {
      const status = this.gitStatus(span);
      prefix += status ? ui.git[status](GIT_GUTTER_GLYPH) : ui.background(" ");
    }
    if (this.showLineNumbers) {
      prefix += ui.background(
        ui.lineNumber(
          `${number === null ? "" : number}`.padStart(LINE_NUMBER_WIDTH - 1),
        ),
      );
      prefix += ui.background(" ");
    }
    const body = `${prefix}${line}`;
    const fill = width - visibleWidth(body);
    return fill > 0 ? `${body}${ui.background(" ".repeat(fill))}` : body;
  }

  footerLines(width: number): string[] {
    const ui = this.styles();
    const lines: string[] = [];
    if (this.fileChanged) {
      const notice = " File changed on disk. Press r to reload.";
      lines.push(ui.panel(notice.padEnd(width)));
    }
    if (this.searchInput) {
      lines.push(ui.bar(this.searchInput.render(width)[0] ?? ""));
    }
    return lines;
  }

  scrollPercent(): number {
    return this.viewport.scrollPercent();
  }

  searchStatus(): SearchStatus | null {
    if (!this.query) return null;
    return { current: this.currentMatch + 1, total: this.matches.length };
  }

  scrollToSourceLine(sourceLine: number): void {
    const exact = this.spans.findIndex(
      (span) =>
        span && sourceLine >= span.startLine && sourceLine <= span.endLine,
    );
    const after = this.spans.findIndex(
      (span) => span && span.startLine >= sourceLine,
    );
    this.viewport.scrollToLine(Math.max(0, exact !== -1 ? exact : after));
  }

  handleInput(data: string): void {
    if (this.searchInput) {
      this.handleSearchInput(this.searchInput, data);
      return;
    }
    const action = this.actionFor(data);
    action?.();
  }

  private actionFor(data: string): (() => void) | undefined {
    const viewport = this.viewport;
    const bindings: Array<[PmdKeybinding, () => void]> = [
      ["pmd.pager.suspend", () => this.actions.suspend()],
      ["pmd.pager.toc", () => this.actions.tableOfContents()],
      ["pmd.help", () => this.actions.help()],
      ["pmd.pager.search", () => this.startSearch()],
      ["pmd.pager.nextMatch", () => this.stepMatch(1)],
      ["pmd.pager.previousMatch", () => this.stepMatch(-1)],
      ["pmd.pager.edit", () => this.actions.edit(this.sourceLineAtTop())],
      ["pmd.pager.reload", () => this.actions.reload()],
      ["pmd.quit", () => this.actions.quit()],
      ["pmd.up", () => viewport.scrollBy(-1)],
      ["pmd.down", () => viewport.scrollBy(1)],
      ["pmd.pageUp", () => viewport.scrollPage(-1)],
      ["pmd.pageDown", () => viewport.scrollPage(1)],
      ["pmd.halfPageUp", () => viewport.scrollHalfPage(-1)],
      ["pmd.halfPageDown", () => viewport.scrollHalfPage(1)],
      ["pmd.top", () => viewport.scrollToTop()],
      ["pmd.bottom", () => viewport.scrollToBottom()],
    ];
    return bindings.find(([id]) => pmdMatches(data, id))?.[1];
  }

  private sourceLineAtTop(): number {
    const top = this.viewport.scrollTop;
    const span = this.spans.slice(top).find((candidate) => candidate !== null);
    return span?.startLine ?? top + 1;
  }

  private startSearch(): void {
    const input = new Input({ prompt: "/" });
    input.focused = true;
    input.onSubmit = () => this.closeSearch();
    input.onEscape = () => {
      this.query = "";
      this.updateMatches();
      this.closeSearch();
    };
    this.searchInput = input;
  }

  private closeSearch(): void {
    this.searchInput = null;
  }

  private handleSearchInput(input: Input, data: string): void {
    input.handleInput(data);
    if (this.searchInput !== input) return;
    const query = input.getValue();
    if (query === this.query) return;
    this.query = query;
    this.updateMatches();
    const top = this.viewport.scrollTop;
    const first = this.matches.findIndex((line) => line >= top);
    this.currentMatch = this.matches.length === 0 ? -1 : Math.max(0, first);
    this.revealMatch();
  }

  private updateMatches(): void {
    this.matches = this.query
      ? this.lines.flatMap((line, index) =>
          findMatches(line, this.query).length > 0 ? [index] : [],
        )
      : [];
    this.currentMatch = Math.min(this.currentMatch, this.matches.length - 1);
  }

  private stepMatch(direction: 1 | -1): void {
    if (this.matches.length === 0) return;
    this.currentMatch =
      (this.currentMatch + direction + this.matches.length) %
      this.matches.length;
    this.revealMatch();
  }

  private revealMatch(): void {
    const line = this.matches[this.currentMatch];
    if (line === undefined) return;
    this.viewport.scrollToLine(
      Math.max(0, line - Math.floor(this.viewport.viewportHeight / 2)),
    );
  }
}
