import {
  createPreparedMarkdown,
  type PreparedMarkdown,
  type SourceSpan,
} from "./source-map.js";

/**
 * Preprocess MDX content to make it renderable as Markdown.
 * Converts JSX components and JS expressions into fenced code blocks.
 */
export function preprocessMdx(content: string): string {
  return preprocessMdxWithSourceMap(createPreparedMarkdown(content)).content;
}

export function preprocessMdxWithSourceMap(
  document: PreparedMarkdown,
): PreparedMarkdown {
  const lines = document.content.split(/\r?\n/);
  const result: string[] = [];
  const lineMap: Array<SourceSpan | null> = [];
  let inJsxBlock = false;
  let jsxBuffer: Array<{ line: string; index: number }> = [];
  let braceDepth = 0;

  const push = (line: string, sourceIndex?: number) => {
    result.push(line);
    lineMap.push(
      sourceIndex === undefined
        ? null
        : (document.lineMap[sourceIndex] ?? null),
    );
  };

  const pushJsxBlock = () => {
    push("```jsx");
    for (const entry of jsxBuffer) {
      push(entry.line, entry.index);
    }
    push("```");
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();

    // Skip import/export statements - convert to code block
    if (trimmed.startsWith("import ") || trimmed.startsWith("export ")) {
      // Collect consecutive import/export lines
      const importExportLines: Array<{ line: string; index: number }> = [
        { line, index: i },
      ];
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine === undefined) break;
        const nextTrimmed = nextLine.trim();
        if (
          nextTrimmed.startsWith("import ") ||
          nextTrimmed.startsWith("export ") ||
          nextTrimmed === ""
        ) {
          i++;
          if (nextTrimmed !== "") {
            importExportLines.push({ line: nextLine, index: i });
          }
        } else {
          break;
        }
      }
      push("```jsx");
      for (const entry of importExportLines) {
        push(entry.line, entry.index);
      }
      push("```");
      push("");
      continue;
    }

    // Detect JSX block start (line starts with <Component)
    if (!inJsxBlock && /^<[A-Z]/.test(trimmed)) {
      inJsxBlock = true;
      jsxBuffer = [{ line, index: i }];
      braceDepth = countBraces(line);

      // Check if self-closing on same line
      if (
        trimmed.endsWith("/>") ||
        (trimmed.includes(">") && trimmed.endsWith(">"))
      ) {
        // Check if it's a complete tag (has closing)
        const tagMatch = trimmed.match(/^<([A-Z][a-zA-Z0-9]*)/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          if (trimmed.endsWith("/>") || trimmed.includes(`</${tagName}>`)) {
            pushJsxBlock();
            inJsxBlock = false;
            jsxBuffer = [];
            continue;
          }
        }
      }
      continue;
    }

    // Inside JSX block
    if (inJsxBlock) {
      jsxBuffer.push({ line, index: i });
      braceDepth += countBraces(line);

      // Check for closing tag
      if (/<\/[A-Z][a-zA-Z0-9]*>/.test(trimmed) && braceDepth <= 0) {
        pushJsxBlock();
        inJsxBlock = false;
        jsxBuffer = [];
      }
      continue;
    }

    // Regular line - pass through
    push(line, i);
  }

  // Flush any remaining JSX buffer
  if (jsxBuffer.length > 0) {
    pushJsxBlock();
  }

  return { content: result.join("\n"), lineMap };
}

function countBraces(line: string): number {
  let count = 0;
  for (const char of line) {
    if (char === "{") count++;
    else if (char === "}") count--;
  }
  return count;
}
