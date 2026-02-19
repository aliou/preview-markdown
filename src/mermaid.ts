import { renderMermaidAscii } from "./vendor/beautiful-mermaid.js";

/**
 * Match fenced mermaid code blocks (``` mermaid ... ```).
 * Handles optional whitespace after "mermaid" and before the closing fence.
 */
const MERMAID_BLOCK_RE = /^```mermaid\s*\n([\s\S]*?)^```\s*$/gm;

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
  _maxWidth: number,
): Promise<string> {
  return content.replace(MERMAID_BLOCK_RE, (match, diagram: string) => {
    try {
      const rewritten = rewriteStateDiagramStartEnd(diagram.trimEnd());
      return renderMermaidAscii(rewritten);
    } catch {
      return match;
    }
  });
}
