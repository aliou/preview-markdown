import { describe, expect, test } from "bun:test";
import { preprocessMermaidWithSourceMap } from "../src/mermaid.js";
import { createPreparedMarkdown } from "../src/source-map.js";

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
    );

    expect(document.content).toContain("diagram needs");
    expect(document.content).toContain("increase width to view");
    expect(document.content).not.toContain("flowchart LR");
  });
});
