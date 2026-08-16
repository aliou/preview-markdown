import { describe, expect, test } from "bun:test";
import {
  createMermaidMarkdownComponent,
  preprocessMermaidWithSourceMap,
} from "../src/mermaid.js";
import { createPreparedMarkdown } from "../src/source-map.js";

const plainMarkdownTheme = {
  heading: (text: string) => text,
  link: (text: string) => text,
  linkUrl: (text: string) => text,
  code: (text: string) => text,
  codeBlock: (text: string) => text,
  codeBlockBorder: (text: string) => text,
  quote: (text: string) => text,
  quoteBorder: (text: string) => text,
  hr: (text: string) => text,
  listBullet: (text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  strikethrough: (text: string) => text,
  underline: (text: string) => text,
};

const plainDefaultStyle = { color: (text: string) => text };

function renderWithSourceMap(
  component: ReturnType<typeof createMermaidMarkdownComponent>,
  width: number,
  fullWidth: number,
) {
  if (
    !("renderWithSourceMap" in component) ||
    typeof component.renderWithSourceMap !== "function"
  ) {
    throw new Error("expected source-mapped component");
  }

  return component.renderWithSourceMap(width, fullWidth) as {
    lines: string[];
  };
}

describe("Mermaid preprocessing", () => {
  test("renders supported diagrams with grok-mermaid", async () => {
    const document = await preprocessMermaidWithSourceMap(
      createPreparedMarkdown(
        [
          "# Diagram",
          "",
          "```mermaid",
          "flowchart LR",
          "  A[Start] --> B[Done]",
          "```",
        ].join("\n"),
      ),
      120,
    );

    expect(document.content).not.toContain("```mermaid");
    expect(document.content).toContain("Start");
    expect(document.content).toContain("Done");
    expect(document.content).toContain("┌");
    expect(document.lineMap).toHaveLength(
      document.content.split(/\r?\n/).length,
    );
  });

  test("shows a width hint for diagrams that exceed the available width", async () => {
    const document = await preprocessMermaidWithSourceMap(
      createPreparedMarkdown(
        [
          "```mermaid",
          "flowchart LR",
          "  A[Request received from client] --> B[Run authentication and authorization]",
          "  B --> C[Return a very detailed response payload]",
          "```",
        ].join("\n"),
      ),
      24,
      {},
      "increase test width to view",
    );

    expect(document.content).toContain("diagram clipped");
    expect(document.content).toContain("┌");
    expect(document.content.replace(/\s+/g, " ")).toContain(
      "increase test width to view",
    );
    expect(document.content).not.toContain("flowchart LR");
    expect(
      document.content.split("\n").every((line) => line.length <= 24),
    ).toBe(true);
  });

  test("normalizes escaped newlines in Mermaid labels", async () => {
    const document = await preprocessMermaidWithSourceMap(
      createPreparedMarkdown(
        [
          "```mermaid",
          "flowchart TD",
          String.raw`  A["loadSkills: uploadedDocuments\n(exists only when readable)"] --> B[Done]`,
          "```",
        ].join("\n"),
      ),
      120,
    );

    expect(document.content).not.toContain(String.raw`\n`);
    expect(document.content).toContain("uploadedDocuments");
    expect(document.content).toContain("exists only when");
  });

  test("renders Mermaid against the full pager width, not the markdown wrap width", () => {
    const component = createMermaidMarkdownComponent(
      createPreparedMarkdown(
        [
          "# Narrow text",
          "",
          "```mermaid",
          "flowchart LR",
          "  A[Request received from client] --> B[Run authentication and authorization]",
          "  B --> C[Return a very detailed response payload]",
          "```",
        ].join("\n"),
      ),
      plainMarkdownTheme,
      plainDefaultStyle,
    );

    const narrow = renderWithSourceMap(component, 24, 24).lines.join("\n");
    const wide = renderWithSourceMap(component, 24, 160).lines.join("\n");

    expect(narrow).toContain("diagram clipped");
    expect(wide).not.toContain("diagram clipped");
    expect(wide).toContain("Request received");
  });

  test("keeps reference links across Mermaid blocks", () => {
    const component = createMermaidMarkdownComponent(
      createPreparedMarkdown(
        [
          "See [the docs][docs].",
          "",
          "```mermaid",
          "flowchart LR",
          "  A[Start] --> B[Done]",
          "```",
          "",
          "[docs]: https://example.com/docs",
        ].join("\n"),
      ),
      plainMarkdownTheme,
      plainDefaultStyle,
    );

    const rendered = renderWithSourceMap(component, 80, 80).lines.join("\n");

    expect(rendered).toContain("the docs");
    expect(rendered).not.toContain("[the docs][docs]");
  });

  test("ignores reference-looking lines inside fenced code", () => {
    const component = createMermaidMarkdownComponent(
      createPreparedMarkdown(
        [
          "See [the docs][docs].",
          "",
          "```mermaid",
          "flowchart LR",
          "  A[Start] --> B[Done]",
          "```",
          "",
          "```text",
          "```not-a-closing-fence",
          "[docs]: https://example.com/docs",
          "```",
        ].join("\n"),
      ),
      plainMarkdownTheme,
      plainDefaultStyle,
    );

    const rendered = renderWithSourceMap(component, 80, 80).lines.join("\n");

    expect(rendered).toContain("[the docs][docs]");
  });

  test("ignores Mermaid-looking fences inside fenced code", () => {
    const component = createMermaidMarkdownComponent(
      createPreparedMarkdown(
        [
          "~~~text",
          "```mermaid",
          "flowchart LR",
          "  A[Start] --> B[Done]",
          "```",
          "~~~",
        ].join("\n"),
      ),
      plainMarkdownTheme,
      plainDefaultStyle,
    );

    const rendered = renderWithSourceMap(component, 80, 80).lines.join("\n");

    expect(rendered).toContain("```mermaid");
    expect(rendered).toContain("flowchart LR");
  });

  test("legacy preprocessor ignores Mermaid-looking fences inside fenced code", async () => {
    const document = await preprocessMermaidWithSourceMap(
      createPreparedMarkdown(
        [
          "~~~text",
          "```mermaid",
          "flowchart LR",
          "  A[Start] --> B[Done]",
          "```",
          "~~~",
        ].join("\n"),
      ),
      80,
    );

    expect(document.content).toContain("```mermaid");
    expect(document.content).toContain("flowchart LR");
  });

  test("accepts longer Markdown fence closers for Mermaid blocks", () => {
    const component = createMermaidMarkdownComponent(
      createPreparedMarkdown(
        ["```mermaid", "flowchart LR", "  A[Start] --> B[Done]", "````"].join(
          "\n",
        ),
      ),
      plainMarkdownTheme,
      plainDefaultStyle,
    );

    const rendered = renderWithSourceMap(component, 80, 80).lines.join("\n");

    expect(rendered).toContain("Start");
    expect(rendered).not.toContain("```mermaid");
  });

  test("does not treat indented code as an open fence", () => {
    const component = createMermaidMarkdownComponent(
      createPreparedMarkdown(
        [
          "    ```text",
          "",
          "```mermaid",
          "flowchart LR",
          "  A[Start] --> B[Done]",
          "```",
        ].join("\n"),
      ),
      plainMarkdownTheme,
      plainDefaultStyle,
    );

    const rendered = renderWithSourceMap(component, 80, 80).lines.join("\n");

    expect(rendered).toContain("Start");
    expect(rendered).not.toContain("```mermaid");
  });

  test("does not extract indented Mermaid fences from list items", () => {
    const component = createMermaidMarkdownComponent(
      createPreparedMarkdown(
        [
          "- item",
          "  ```mermaid",
          "  flowchart LR",
          "    A[Start] --> B[Done]",
          "  ```",
        ].join("\n"),
      ),
      plainMarkdownTheme,
      plainDefaultStyle,
    );

    const rendered = renderWithSourceMap(component, 80, 80).lines.join("\n");

    expect(rendered).toContain("item");
    expect(rendered).toContain("flowchart LR");
    expect(rendered).not.toContain("┌");
  });
});
