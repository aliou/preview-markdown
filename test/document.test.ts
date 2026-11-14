import { describe, expect, test } from "bun:test";
import { type DocumentStyles, MarkdownDocument } from "../src/document";
import { preprocessMdxWithSourceMap } from "../src/mdx";
import { createPreparedMarkdown, type SourceSpan } from "../src/source-map";

const plain = (text: string) => text;

const styles: DocumentStyles = {
  markdown: {
    heading: plain,
    link: plain,
    linkUrl: plain,
    code: plain,
    codeBlock: plain,
    codeBlockBorder: plain,
    quote: plain,
    quoteBorder: plain,
    hr: plain,
    listBullet: plain,
    bold: plain,
    italic: plain,
    strikethrough: plain,
    underline: plain,
  },
  text: { color: plain },
  codeBlock: plain,
  codeBlockPadding: plain,
  mermaid: {},
};

function documentOf(lines: string[]): MarkdownDocument {
  return new MarkdownDocument(createPreparedMarkdown(lines.join("\n")), styles);
}

function renderText(
  document: MarkdownDocument,
  width = 80,
  fullWidth = width,
): string {
  return document.renderWithSourceMap(width, fullWidth).lines.join("\n");
}

function spanOf(
  document: MarkdownDocument,
  text: string,
  width = 80,
): SourceSpan | null | undefined {
  const { lines, sourceSpans } = document.renderWithSourceMap(width);
  return sourceSpans[lines.findIndex((line) => line.includes(text))];
}

const flowchart = [
  "```mermaid",
  "flowchart LR",
  "  A[Start] --> B[Done]",
  "```",
];

describe("MarkdownDocument source map", () => {
  test("maps every rendered line, including wrapped and code lines, to its source line", () => {
    const document = documentOf([
      "# Heading",
      "",
      "A paragraph that is long enough to wrap when the pager is narrow.",
      "",
      "```ts",
      "const first = 1;",
      "const second = 2;",
      "```",
      "Tail",
    ]);
    const { lines, sourceSpans } = document.renderWithSourceMap(30);

    expect(sourceSpans).toHaveLength(lines.length);
    expect(spanOf(document, "Heading", 30)).toEqual({
      startLine: 1,
      endLine: 1,
    });
    const paragraphSpans = lines
      .map((line, index) =>
        /paragraph|wrap|narrow/.test(line) ? sourceSpans[index] : undefined,
      )
      .filter((span) => span !== undefined);
    expect(paragraphSpans.length).toBeGreaterThan(1);
    for (const span of paragraphSpans)
      expect(span).toEqual({ startLine: 3, endLine: 3 });
    expect(spanOf(document, "const second", 30)).toEqual({
      startLine: 7,
      endLine: 7,
    });
    expect(spanOf(document, "Tail", 30)).toEqual({ startLine: 9, endLine: 9 });
    expect(
      sourceSpans[lines.findIndex((line) => line.includes("▀"))],
    ).toBeNull();
  });

  test("maps MDX lines back to the file on disk", () => {
    const source = [
      'import { Button } from "./Button"',
      "",
      "# Title",
      "",
      "Body",
    ].join("\n");
    const document = new MarkdownDocument(
      preprocessMdxWithSourceMap(createPreparedMarkdown(source)),
      styles,
    );

    expect(spanOf(document, "Body")).toEqual({ startLine: 5, endLine: 5 });
    expect(document.headings).toEqual([{ level: 1, title: "Title", line: 3 }]);
  });

  test("lists headings with their source lines and skips # lines inside code", () => {
    const document = documentOf([
      "# One",
      "",
      "```sh",
      "# not a heading",
      "```",
      "",
      "### Three",
    ]);

    expect(document.headings).toEqual([
      { level: 1, title: "One", line: 1 },
      { level: 3, title: "Three", line: 7 },
    ]);
  });
});

describe("MarkdownDocument rendering", () => {
  test("draws code blocks as tinted blocks without fence markers", () => {
    const rendered = renderText(
      documentOf(["Before", "", "```ts", "const a = 1;", "```", "", "After"]),
    );

    expect(rendered).not.toContain("```");
    expect(rendered).toContain("    const a = 1;");
    expect(rendered).toMatch(/Before\s*\n\s*▀+/);
    expect(rendered).toMatch(/▄+\s*\n\s*After/);
  });

  test("hides HTML comments along with the blank line after them", () => {
    const rendered = renderText(
      documentOf(["Before", "", "<!-- hidden -->", "", "After"]),
    );

    expect(rendered).not.toContain("hidden");
    expect(rendered).toMatch(/Before\s*\n\s*\n\s*After/);
  });

  test("renders Mermaid diagrams as box art", () => {
    const rendered = renderText(documentOf(["# Diagram", "", ...flowchart]));

    expect(rendered).not.toContain("```mermaid");
    expect(rendered).toContain("Start");
    expect(rendered).toContain("┌");
  });

  test("renders Mermaid against the full pager width, not the wrap width", () => {
    const document = documentOf([
      "```mermaid",
      "flowchart LR",
      "  A[Request received from client] --> B[Run authentication and authorization]",
      "  B --> C[Return a very detailed response payload]",
      "```",
    ]);

    const narrow = renderText(document, 24, 24);
    expect(narrow).toContain("diagram clipped");
    expect(narrow.split("\n").every((line) => line.length <= 24)).toBe(true);
    expect(renderText(document, 24, 200)).not.toContain("diagram clipped");
  });

  test("normalizes escaped newlines in Mermaid labels", () => {
    const rendered = renderText(
      documentOf([
        "```mermaid",
        "flowchart TD",
        String.raw`  A["first\nsecond"] --> B[Done]`,
        "```",
      ]),
    );

    expect(rendered).not.toContain(String.raw`\n`);
    expect(rendered).toContain("first");
  });

  test("resolves reference links defined after a Mermaid block", () => {
    const rendered = renderText(
      documentOf([
        "See [the docs][docs].",
        "",
        ...flowchart,
        "",
        "[docs]: https://example.com/docs",
      ]),
    );

    expect(rendered).toContain("the docs");
    expect(rendered).not.toContain("[the docs][docs]");
  });

  test("does not read reference definitions from inside fenced code", () => {
    const rendered = renderText(
      documentOf([
        "See [the docs][docs].",
        "",
        "```text",
        "[docs]: https://example.com/docs",
        "```",
      ]),
    );

    expect(rendered).toContain("[the docs][docs]");
  });

  test("leaves Mermaid-looking fences inside other fences as code", () => {
    const rendered = renderText(documentOf(["~~~text", ...flowchart, "~~~"]));

    expect(rendered).toContain("```mermaid");
    expect(rendered).not.toContain("┌");
  });

  test("accepts longer fence closers for Mermaid blocks", () => {
    const rendered = renderText(
      documentOf([
        "```mermaid",
        "flowchart LR",
        "  A[Start] --> B[Done]",
        "````",
      ]),
    );

    expect(rendered).toContain("Start");
    expect(rendered).toContain("┌");
  });

  test("keeps Mermaid fences nested in list items as code", () => {
    const rendered = renderText(
      documentOf(["- item", ...flowchart.map((line) => `  ${line}`)]),
    );

    expect(rendered).toContain("item");
    expect(rendered).toContain("flowchart LR");
    expect(rendered).not.toContain("┌");
  });
});
