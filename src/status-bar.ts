import {
  type Component,
  sliceByColumn,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { Pager } from "./pager";
import type { UiStyles } from "./theme";

export class StatusBar implements Component {
  private readonly title: string;
  private readonly pager: Pager;
  private readonly styles: () => UiStyles;

  constructor(title: string, pager: Pager, styles: () => UiStyles) {
    this.title = title;
    this.pager = pager;
    this.styles = styles;
  }

  invalidate(): void {}

  private searchLabel(): string {
    const search = this.pager.searchStatus();
    if (!search) return "";
    return search.total === 0
      ? " no matches "
      : ` ${search.current}/${search.total} `;
  }

  render(width: number): string[] {
    const right = `${this.searchLabel()} ${this.pager.scrollPercent()}%  ? help `;
    const room = Math.max(0, width - visibleWidth(right) - 1);
    const title =
      visibleWidth(this.title) <= room
        ? this.title
        : `…${sliceByColumn(this.title, visibleWidth(this.title) - room + 1, room - 1)}`;
    const left = ` ${title}`;
    const gap = " ".repeat(
      Math.max(0, width - visibleWidth(left) - visibleWidth(right)),
    );
    return [
      ...this.pager.footerLines(width),
      this.styles().bar(sliceByColumn(`${left}${gap}${right}`, 0, width)),
    ];
  }
}
