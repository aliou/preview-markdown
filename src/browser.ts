import * as os from "node:os";
import {
  type Component,
  fuzzyMatch,
  Input,
  matchesKey,
  sliceByColumn,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { type PmdKeybinding, pmdMatches } from "./keybindings";
import type { Entry } from "./scan";
import type { UiStyles } from "./theme";
import type { ViewportController } from "./viewport";

export interface BrowserActions {
  open(entry: Entry): void;
  quit(): void;
  help(): void;
}

export interface BrowserOptions {
  entries: Entry[];
  baseDir: string;
  viewport: ViewportController;
  styles: () => UiStyles;
  actions: BrowserActions;
}

type SortKey = "name" | "created" | "updated";

const SORT_KEYS: readonly SortKey[] = ["name", "created", "updated"];
const HEADER_HEIGHT = 2;
const FOOTER_HEIGHT = 1;
const ITEM_HEIGHT = 3;
const MINI_HELP =
  "  enter open  •  j/k move  •  / filter  •  s sort  •  r reverse  •  ? help  •  q quit";
const RELATIVE_TIME = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const TIME_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

function relativeTime(date: Date): string {
  const seconds = (date.getTime() - Date.now()) / 1000;
  const unit = TIME_UNITS.find(([, size]) => Math.abs(seconds) >= size);
  return unit
    ? RELATIVE_TIME.format(Math.round(seconds / unit[1]), unit[0])
    : "just now";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("sv-SE");
}

function padToWidth(text: string, width: number): string {
  if (visibleWidth(text) <= width)
    return text.padEnd(width + text.length - visibleWidth(text));
  return `${sliceByColumn(text, 0, Math.max(0, width - 1), true)}…`;
}

function compare(a: Entry, b: Entry, key: SortKey): number {
  switch (key) {
    case "name":
      return a.relativePath.localeCompare(b.relativePath);
    case "created":
      return a.createdAt.getTime() - b.createdAt.getTime();
    case "updated":
      return a.updatedAt.getTime() - b.updatedAt.getTime();
  }
}

export class Browser implements Component {
  private readonly entries: Entry[];
  private readonly baseDir: string;
  private readonly viewport: ViewportController;
  private readonly styles: () => UiStyles;
  private readonly actions: BrowserActions;
  private visible: Entry[];
  private cursor = 0;
  private filter = "";
  private filterInput: Input | null = null;
  private sortKey: SortKey = "name";
  private descending = false;

  constructor(options: BrowserOptions) {
    this.entries = options.entries;
    this.baseDir = options.baseDir;
    this.viewport = options.viewport;
    this.styles = options.styles;
    this.actions = options.actions;
    this.visible = [...options.entries];
  }

  get capturesViewportInput(): boolean {
    return this.filterInput !== null;
  }

  invalidate(): void {}

  private refreshVisible(): void {
    const filtered = this.filter
      ? this.entries.filter(
          (entry) => fuzzyMatch(this.filter, entry.relativePath).matches,
        )
      : [...this.entries];
    const direction = this.descending ? -1 : 1;
    this.visible = filtered.sort(
      (a, b) => direction * compare(a, b, this.sortKey),
    );
    this.cursor = 0;
    this.viewport.reset();
  }

  private renderItem(
    entry: Entry,
    selected: boolean,
    width: number,
    ui: UiStyles,
  ): string[] {
    const name = padToWidth(
      `${selected ? "│ " : "  "}• ${entry.relativePath}`,
      width,
    );
    const created =
      entry.createdAt.getTime() > 0 && entry.createdAt <= entry.updatedAt
        ? formatDate(entry.createdAt)
        : "unknown";
    const meta = padToWidth(
      `    c ${created}  •  u ${formatDate(entry.updatedAt)} (${relativeTime(entry.updatedAt)})`,
      width,
    );
    return [
      ui.background(selected ? ui.accent(name) : ui.text(name)),
      ui.background(ui.dim(meta)),
      ui.background(" ".repeat(width)),
    ];
  }

  private renderHeader(width: number, ui: UiStyles): string[] {
    const home = os.homedir();
    const base = this.baseDir.startsWith(home)
      ? `~${this.baseDir.slice(home.length)}`
      : this.baseDir;
    const filter = this.filter ? ` • /${this.filter}` : "";
    const sort = ` • ${this.sortKey}${this.descending ? "▼" : "▲"}`;
    const count = ` ${this.visible.length > 0 ? this.cursor + 1 : 0}/${this.visible.length} docs `;
    const left = padToWidth(
      ` ${base}${filter}${sort}`,
      Math.max(0, width - count.length),
    );
    return [
      ui.background(ui.text(`${left}${count}`)),
      ui.background(ui.dim("─".repeat(width))),
    ];
  }

  private renderFooter(width: number, ui: UiStyles): string {
    if (this.filterInput)
      return ui.bar(this.filterInput.render(width)[0] ?? "");
    return ui.background(ui.dim(padToWidth(MINI_HELP, width)));
  }

  render(width: number): string[] {
    const ui = this.styles();
    const height = this.viewport.viewportHeight;
    const blank = ui.background(" ".repeat(width));
    const lines = [...this.renderHeader(width, ui)];

    if (this.visible.length === 0) {
      const message = this.filter
        ? "No files match your filter."
        : "No markdown files found.";
      const middle = Math.floor((height - HEADER_HEIGHT - FOOTER_HEIGHT) / 2);
      for (let row = 0; row < middle; row++) lines.push(blank);
      lines.push(ui.background(ui.dim(padToWidth(`  ${message}`, width))));
    } else {
      this.visible.forEach((entry, index) => {
        lines.push(...this.renderItem(entry, index === this.cursor, width, ui));
      });
      const first = HEADER_HEIGHT + this.cursor * ITEM_HEIGHT;
      this.viewport.ensureRangeVisible(
        first,
        first + ITEM_HEIGHT - 1,
        HEADER_HEIGHT,
        FOOTER_HEIGHT,
      );
    }
    lines.push(blank);

    const top = this.viewport.scrollTop;
    while (lines.length < top + height) lines.push(blank);
    const header = this.renderHeader(width, ui);
    header.forEach((line, offset) => {
      lines[top + offset] = line;
    });
    if (height > 0) lines[top + height - 1] = this.renderFooter(width, ui);
    this.viewport.setContentLineCount(lines.length);
    return lines;
  }

  handleInput(data: string): void {
    if (this.filterInput) {
      this.filterInput.handleInput(data);
      const value = this.filterInput?.getValue();
      if (value !== undefined && value !== this.filter) {
        this.filter = value;
        this.refreshVisible();
      }
      return;
    }
    const page = Math.max(
      1,
      Math.floor(
        (this.viewport.viewportHeight - HEADER_HEIGHT - FOOTER_HEIGHT) /
          ITEM_HEIGHT,
      ) - 1,
    );
    const last = Math.max(0, this.visible.length - 1);
    const moves: Array<[PmdKeybinding, () => number]> = [
      ["pmd.up", () => this.cursor - 1],
      ["pmd.down", () => this.cursor + 1],
      ["pmd.pageUp", () => this.cursor - page],
      ["pmd.pageDown", () => this.cursor + page],
      ["pmd.top", () => 0],
      ["pmd.bottom", () => last],
    ];
    const move = moves.find(([id]) => pmdMatches(data, id));
    if (move) {
      this.cursor = Math.max(0, Math.min(last, move[1]()));
      return;
    }
    this.handleCommand(data);
  }

  private handleCommand(data: string): void {
    if (pmdMatches(data, "pmd.help")) {
      this.actions.help();
    } else if (pmdMatches(data, "pmd.browser.filter")) {
      this.startFilter();
    } else if (pmdMatches(data, "pmd.browser.cycleSort")) {
      this.sortKey =
        SORT_KEYS[(SORT_KEYS.indexOf(this.sortKey) + 1) % SORT_KEYS.length] ??
        "name";
      this.refreshVisible();
    } else if (pmdMatches(data, "pmd.browser.reverseSort")) {
      this.descending = !this.descending;
      this.refreshVisible();
    } else if (pmdMatches(data, "pmd.browser.open")) {
      const entry = this.visible[this.cursor];
      if (entry) this.actions.open(entry);
    } else if (pmdMatches(data, "pmd.quit")) {
      this.quitOrClearFilter(data);
    }
  }

  private quitOrClearFilter(data: string): void {
    if (this.filter && matchesKey(data, "escape")) {
      this.filter = "";
      this.refreshVisible();
      return;
    }
    this.actions.quit();
  }

  private startFilter(): void {
    const input = new Input({ prompt: "/" });
    input.setValue(this.filter);
    input.focused = true;
    input.onSubmit = () => {
      this.filterInput = null;
    };
    input.onEscape = () => {
      this.filterInput = null;
      this.filter = "";
      this.refreshVisible();
    };
    this.filterInput = input;
  }
}
