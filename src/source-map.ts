export interface SourceSpan {
  startLine: number;
  endLine: number;
}

export interface PreparedMarkdown {
  content: string;
  /** Maps each 1-based rendered-source line back to the on-disk file. */
  lineMap: Array<SourceSpan | null>;
}

export function createPreparedMarkdown(content: string): PreparedMarkdown {
  const lineMap = splitLines(content).map((_, index) => ({
    startLine: index + 1,
    endLine: index + 1,
  }));

  return { content, lineMap };
}

export function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

export function sourceLineCount(content: string): number {
  if (content.length === 0) return 0;

  const lines = splitLines(content);
  return /\r?\n$/.test(content) ? lines.length - 1 : lines.length;
}

export function mapPreparedSpan(
  document: PreparedMarkdown,
  span: SourceSpan | null,
): SourceSpan | null {
  if (!span) return null;

  let startLine: number | null = null;
  let endLine: number | null = null;
  const start = Math.max(1, span.startLine);
  const end = Math.min(document.lineMap.length, span.endLine);

  for (let line = start; line <= end; line++) {
    const mapped = document.lineMap[line - 1];
    if (!mapped) continue;

    startLine =
      startLine === null
        ? mapped.startLine
        : Math.min(startLine, mapped.startLine);
    endLine =
      endLine === null ? mapped.endLine : Math.max(endLine, mapped.endLine);
  }

  return startLine === null || endLine === null ? null : { startLine, endLine };
}
