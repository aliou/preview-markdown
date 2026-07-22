import {
  createPreparedMarkdown,
  type PreparedMarkdown,
  type SourceSpan,
} from "./source-map.js";
import { renderMermaidAscii } from "./vendor/beautiful-mermaid.js";

function rewriteStateDiagramStartEnd(diagram: string): string {
  const lines = diagram.split("\n");

  // Find first meaningful line to detect diagram type.
  const headerIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("%%");
  });

  if (headerIndex < 0) return diagram;

  const header = lines[headerIndex]?.trim().toLowerCase() ?? "";
  if (!/^statediagram(?:-v2)?$/.test(header)) {
    return diagram;
  }

  let startCount = 0;
  let endCount = 0;
  const aliases: string[] = [];

  const rewritten = lines.map((line) => {
    const startMatch = line.match(
      /^(\s*)\[\*\](\s*-->\s*)([\w-]+)(\s*:\s*.*)?$/,
    );
    if (startMatch) {
      startCount++;
      const id = `__pmd_start_${startCount}`;
      aliases.push(`state "● Start" as ${id}`);
      const indent = startMatch[1] ?? "";
      const arrow = startMatch[2] ?? " --> ";
      const target = startMatch[3] ?? "";
      const label = startMatch[4] ?? "";
      return `${indent}${id}${arrow}${target}${label}`;
    }

    const endMatch = line.match(/^(\s*)([\w-]+)(\s*-->\s*)\[\*\](\s*:\s*.*)?$/);
    if (endMatch) {
      endCount++;
      const id = `__pmd_end_${endCount}`;
      aliases.push(`state "◎ End" as ${id}`);
      const indent = endMatch[1] ?? "";
      const source = endMatch[2] ?? "";
      const arrow = endMatch[3] ?? " --> ";
      const label = endMatch[4] ?? "";
      return `${indent}${source}${arrow}${id}${label}`;
    }

    return line;
  });

  if (aliases.length === 0) return diagram;

  const before = rewritten.slice(0, headerIndex + 1);
  const after = rewritten.slice(headerIndex + 1);
  return [...before, ...aliases, ...after].join("\n");
}

/**
 * Pre-process markdown content: replace mermaid fenced code blocks with
 * ASCII-rendered output. On render failure, keep original fenced block.
 */
export async function preprocessMermaid(
  content: string,
  maxWidth: number,
): Promise<string> {
  const document = await preprocessMermaidWithSourceMap(
    createPreparedMarkdown(content),
    maxWidth,
  );
  return document.content;
}

export async function preprocessMermaidWithSourceMap(
  document: PreparedMarkdown,
  _maxWidth: number,
): Promise<PreparedMarkdown> {
  const lines = document.content.split(/\r?\n/);
  const result: string[] = [];
  const lineMap: Array<SourceSpan | null> = [];
  let transformed = false;

  const push = (line: string, sourceIndex?: number) => {
    result.push(line);
    lineMap.push(
      sourceIndex === undefined
        ? null
        : (document.lineMap[sourceIndex] ?? null),
    );
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined || !/^```mermaid\s*$/.test(line)) {
      if (line !== undefined) push(line, index);
      continue;
    }

    let closingIndex = -1;
    for (let candidate = index + 1; candidate < lines.length; candidate++) {
      if (/^```\s*$/.test(lines[candidate] ?? "")) {
        closingIndex = candidate;
        break;
      }
    }

    if (closingIndex === -1) {
      push(line, index);
      continue;
    }

    const diagram = lines.slice(index + 1, closingIndex).join("\n");
    try {
      const rewritten = rewriteStateDiagramStartEnd(diagram.trimEnd());
      const rendered = renderMermaidAscii(rewritten);
      for (const renderedLine of rendered.split("\n")) {
        push(renderedLine);
      }
      transformed = true;
    } catch {
      for (
        let sourceIndex = index;
        sourceIndex <= closingIndex;
        sourceIndex++
      ) {
        const sourceLine = lines[sourceIndex];
        if (sourceLine !== undefined) push(sourceLine, sourceIndex);
      }
    }

    index = closingIndex;
  }

  return transformed ? { content: result.join("\n"), lineMap } : document;
}
