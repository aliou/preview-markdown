/**
 * Preprocess MDX content to make it renderable as Markdown.
 * Converts JSX components and JS expressions into fenced code blocks.
 */
export function preprocessMdx(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inJsxBlock = false;
  let jsxBuffer: string[] = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();

    // Skip import/export statements - convert to code block
    if (trimmed.startsWith("import ") || trimmed.startsWith("export ")) {
      // Collect consecutive import/export lines
      const importExportLines: string[] = [line];
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
            importExportLines.push(nextLine);
          }
        } else {
          break;
        }
      }
      result.push("```jsx");
      result.push(...importExportLines);
      result.push("```");
      result.push("");
      continue;
    }

    // Detect JSX block start (line starts with <Component)
    if (!inJsxBlock && /^<[A-Z]/.test(trimmed)) {
      inJsxBlock = true;
      jsxBuffer = [line];
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
            result.push("```jsx");
            result.push(...jsxBuffer);
            result.push("```");
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
      jsxBuffer.push(line);
      braceDepth += countBraces(line);

      // Check for closing tag
      if (/<\/[A-Z][a-zA-Z0-9]*>/.test(trimmed) && braceDepth <= 0) {
        result.push("```jsx");
        result.push(...jsxBuffer);
        result.push("```");
        inJsxBlock = false;
        jsxBuffer = [];
      }
      continue;
    }

    // Regular line - pass through
    result.push(line);
  }

  // Flush any remaining JSX buffer
  if (jsxBuffer.length > 0) {
    result.push("```jsx");
    result.push(...jsxBuffer);
    result.push("```");
  }

  return result.join("\n");
}

function countBraces(line: string): number {
  let count = 0;
  for (const char of line) {
    if (char === "{") count++;
    else if (char === "}") count--;
  }
  return count;
}
