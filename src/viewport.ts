import type { ScrollView } from "@earendil-works/pi-tui";

export interface ScrollInfo {
  current: number;
  total: number;
  percent: number;
}

export class ViewportController {
  private lineCount = 0;
  private fallbackViewportHeight = 0;

  constructor(private readonly scrollView: ScrollView) {}

  setContentLineCount(lineCount: number): void {
    this.lineCount = Math.max(0, lineCount);
  }

  get scrollTop(): number {
    return this.scrollView.scrollTop;
  }

  get viewportHeight(): number {
    return this.scrollView.viewportHeight || this.fallbackViewportHeight;
  }

  setFallbackViewportHeight(height: number): void {
    this.fallbackViewportHeight = Math.max(0, Math.floor(height));
  }

  scrollBy(lines: number): void {
    this.scrollView.scrollBy(lines);
  }

  scrollPage(direction: 1 | -1): void {
    const pageSize = Math.max(1, this.viewportHeight - 2);
    this.scrollBy(direction * pageSize);
  }

  scrollHalfPage(direction: 1 | -1): void {
    const pageSize = Math.max(1, Math.floor(this.viewportHeight / 2));
    this.scrollBy(direction * pageSize);
  }

  scrollToTop(): void {
    this.scrollView.scrollToStart();
  }

  scrollToBottom(): void {
    this.scrollView.scrollToEnd();
  }

  scrollToLine(line: number): void {
    this.scrollView.scrollTo(Math.max(0, line));
  }

  ensureLineVisible(line: number): void {
    this.ensureRangeVisible(line, line);
  }

  ensureRangeVisible(
    firstLine: number,
    lastLine: number,
    topMargin = 0,
    bottomMargin = 0,
  ): void {
    const viewportHeight = this.viewportHeight;
    if (viewportHeight <= 0) return;

    const scrollTop = this.scrollView.scrollTop;
    const visibleTop = scrollTop + topMargin;
    const visibleBottom = scrollTop + viewportHeight - 1 - bottomMargin;

    if (firstLine < visibleTop) {
      this.scrollView.scrollTo(firstLine - topMargin);
    } else if (lastLine > visibleBottom) {
      this.scrollView.scrollTo(lastLine - viewportHeight + 1 + bottomMargin);
    }
  }

  reset(): void {
    this.scrollView.scrollToStart();
  }

  getScrollInfo(): ScrollInfo {
    const total = this.lineCount;
    const viewportHeight = this.viewportHeight;
    const maxScroll = Math.max(1, total - viewportHeight);
    const percent =
      total <= viewportHeight
        ? 100
        : Math.round((this.scrollView.scrollTop / maxScroll) * 100);

    return {
      current: this.scrollView.scrollTop + 1,
      total,
      percent,
    };
  }
}
