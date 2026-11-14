import {
  type Component,
  type OverlayHandle,
  type SelectItem,
  SelectList,
  sliceByColumn,
  type TuiAltScreen,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { Heading } from "./document";
import { type HelpSection, keyLabel, pmdMatches } from "./keybindings";
import type { UiStyles } from "./theme";

type Styles = () => UiStyles;

class Panel implements Component {
  private readonly title: string;
  private readonly body: Component;
  private readonly styles: Styles;
  private readonly onKey: (data: string) => void;

  constructor(
    title: string,
    body: Component,
    styles: Styles,
    onKey: (data: string) => void,
  ) {
    this.title = title;
    this.body = body;
    this.styles = styles;
    this.onKey = onKey;
  }

  invalidate(): void {
    this.body.invalidate();
  }

  render(width: number): string[] {
    const { panel, panelBorder } = this.styles();
    const inner = Math.max(1, width - 2);
    const title = ` ${this.title} `;
    const top = `┌${title}${"─".repeat(Math.max(0, inner - visibleWidth(title)))}┐`;
    const rows = this.body.render(inner - 2).map((line) => {
      const fitted = sliceByColumn(line, 0, inner - 2, true);
      const fill = " ".repeat(Math.max(0, inner - 2 - visibleWidth(fitted)));
      return `${panelBorder("│")}${panel(` ${fitted}${fill} `)}${panelBorder("│")}`;
    });
    return [panelBorder(top), ...rows, panelBorder(`└${"─".repeat(inner)}┘`)];
  }

  handleInput(data: string): void {
    this.onKey(data);
  }
}

class HelpBody implements Component {
  private readonly section: HelpSection;
  private readonly styles: Styles;

  constructor(section: HelpSection, styles: Styles) {
    this.section = section;
    this.styles = styles;
  }

  invalidate(): void {}

  render(): string[] {
    const { dim, panel } = this.styles();
    const rows = this.section.bindings.map(
      (help) => [keyLabel(help), help.description] as const,
    );
    const keyWidth = Math.max(...rows.map(([keys]) => visibleWidth(keys)));
    return [
      ...rows.map(
        ([keys, description]) =>
          `${panel(keys.padEnd(keyWidth))}  ${dim(description)}`,
      ),
      "",
      dim("Press any key to close"),
    ];
  }
}

const OVERLAY_OPTIONS = {
  width: "70%",
  minWidth: 44,
  maxHeight: "90%",
} as const;

export function showHelp(
  tui: TuiAltScreen,
  section: HelpSection,
  styles: Styles,
): void {
  let handle: OverlayHandle | undefined;
  const panel = new Panel(
    `${section.title} shortcuts`,
    new HelpBody(section, styles),
    styles,
    () => {
      handle?.hide();
      tui.requestRender();
    },
  );
  handle = tui.showOverlay(panel, OVERLAY_OPTIONS);
}

export function showTableOfContents(
  tui: TuiAltScreen,
  headings: readonly Heading[],
  styles: Styles,
  onSelect: (heading: Heading) => void,
): void {
  const ui = styles();
  const items: SelectItem[] = headings.map((heading, index) => ({
    value: String(index),
    label: `${"  ".repeat(heading.level - 1)}${heading.title}`,
  }));
  const list = new SelectList(items, Math.max(3, tui.terminal.rows - 8), {
    selectedPrefix: ui.accent,
    selectedText: ui.selected,
    description: ui.dim,
    scrollInfo: ui.dim,
    noMatch: ui.dim,
  });
  let handle: OverlayHandle | undefined;
  const close = (): void => {
    handle?.hide();
    tui.requestRender();
  };
  list.onCancel = close;
  list.onSelect = (item) => {
    close();
    const heading = headings[Number(item.value)];
    if (heading) onSelect(heading);
  };
  const body: Component =
    headings.length > 0
      ? list
      : { invalidate() {}, render: () => [ui.dim("No headings")] };
  const panel = new Panel("Table of contents", body, styles, (data) => {
    if (pmdMatches(data, "pmd.quit") || pmdMatches(data, "pmd.pager.toc")) {
      close();
      return;
    }
    list.handleInput(data);
    tui.requestRender();
  });
  handle = tui.showOverlay(panel, OVERLAY_OPTIONS);
}
