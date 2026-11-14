import { describe, expect, test } from "bun:test";
import { ScrollView, Spacer } from "@earendil-works/pi-tui";
import type { GitStatusResolver } from "../src/git";
import { installKeybindings } from "../src/keybindings";
import { Pager, type PagerContent } from "../src/pager";
import type { SourceSpan } from "../src/source-map";
import type { UiStyles } from "../src/theme";
import { ViewportController } from "../src/viewport";

const plain = (text: string) => text;
const tag = (name: string) => (text: string) => `[${name}:${text}]`;

const styles: UiStyles = {
  text: plain,
  background: plain,
  accent: plain,
  dim: plain,
  bar: plain,
  panel: plain,
  panelBorder: plain,
  selected: plain,
  lineNumber: plain,
  match: tag("match"),
  currentMatch: tag("current"),
  git: {
    added: tag("added"),
    modified: tag("modified"),
    deleted: tag("deleted"),
    moved: tag("moved"),
  },
};

const noop = () => undefined;

function contentOf(lines: string[], widths: number[] = []): PagerContent {
  return {
    invalidate: noop,
    render: () => lines,
    renderWithSourceMap(width: number) {
      widths.push(width);
      return {
        lines,
        sourceSpans: lines.map(
          (_, index): SourceSpan => ({
            startLine: index + 1,
            endLine: index + 1,
          }),
        ),
      };
    },
  };
}

function pagerFor(content: PagerContent, gitStatus?: GitStatusResolver): Pager {
  installKeybindings();
  const viewport = new ViewportController(new ScrollView(new Spacer(0)));
  viewport.setFallbackViewportHeight(1);
  return new Pager({
    content,
    gitStatus,
    viewport,
    styles: () => styles,
    actions: {
      quit: noop,
      help: noop,
      tableOfContents: noop,
      edit: noop,
      reload: noop,
      suspend: noop,
    },
    showLineNumbers: false,
    wrapWidth: 0,
  });
}

function type(pager: Pager, keys: string): void {
  for (const key of keys) pager.handleInput(key);
}

describe("Pager git gutter", () => {
  test("reserves one column and paints only the gutter cell", () => {
    const widths: number[] = [];
    const pager = pagerFor(contentOf(["content"], widths), () => "added");

    expect(pager.render(10)[0]).toStartWith("[added:▎]content");
    expect(widths).toEqual([9]);
  });

  test("does not reserve a column without Git data", () => {
    const widths: number[] = [];
    pagerFor(contentOf(["content"], widths)).render(10);

    expect(widths).toEqual([10]);
  });
});

describe("Pager search", () => {
  test("highlights matches as you type and counts them, ignoring case and styling", () => {
    const pager = pagerFor(
      contentOf(["alpha \x1b[1mBeta\x1b[22m", "gamma", "beta again"]),
    );
    pager.render(40);
    type(pager, "/bet");

    expect(pager.searchStatus()).toEqual({ current: 1, total: 2 });
    const [first, , third] = pager.render(40);
    expect(first).toContain("[current:Bet]");
    expect(third).toContain("[match:bet]");
  });

  test("keeps the query after Enter and steps through matches with n and N", () => {
    const pager = pagerFor(contentOf(["one", "two", "one more", "one last"]));
    pager.render(40);
    type(pager, "/one\r");

    expect(pager.capturesViewportInput).toBe(false);
    type(pager, "n");
    expect(pager.searchStatus()).toEqual({ current: 2, total: 3 });
    type(pager, "NN");
    expect(pager.searchStatus()).toEqual({ current: 3, total: 3 });
  });

  test("Escape clears the search", () => {
    const pager = pagerFor(contentOf(["one"]));
    pager.render(40);
    type(pager, "/one\x1b");

    expect(pager.searchStatus()).toBeNull();
    expect(pager.render(40)[0]).not.toContain("[current:");
  });

  test("reports no matches for an unknown query", () => {
    const pager = pagerFor(contentOf(["one"]));
    pager.render(40);
    type(pager, "/zzz");

    expect(pager.searchStatus()).toEqual({ current: 0, total: 0 });
  });
});
