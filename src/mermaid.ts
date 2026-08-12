import {
  type Cls,
  diagramKind,
  type MermaidArt,
  render,
  sourceBox,
} from "grok-mermaid";
import {
  createPreparedMarkdown,
  type PreparedMarkdown,
  type SourceSpan,
} from "./source-map.js";

export type MermaidTheme = Partial<Record<Cls, (text: string) => string>>;

function styleSpan(
  span: { text: string; cls: Cls },
  theme: MermaidTheme,
): string {
  const styler = theme[span.cls] as ((text: string) => string) | undefined;
  if (styler) return styler(span.text);
  return span.text;
}

function renderThemedDiagram(art: MermaidArt, theme: MermaidTheme): string[] {
  return art.styled.map((row) =>
    row.map((span) => styleSpan(span, theme)).join(""),
  );
}

function formatWidthWarning(naturalWidth: number): string {
  return ` diagram needs ${naturalWidth} columns; increase width to view `;
}

function isOversized(art: MermaidArt, maxWidth: number): boolean {
  return maxWidth > 0 && art.width > maxWidth;
}

function processDiagram(
  diagram: string,
  sourceSpan: SourceSpan,
  maxWidth: number,
  theme: MermaidTheme,
): { lines: string[]; lineMap: Array<SourceSpan | null> } {
  const result: string[] = [];
  const lineMap: Array<SourceSpan | null> = [];

  const push = (line: string, span: SourceSpan | null) => {
    result.push(line);
    lineMap.push(span);
  };

  const art = render(diagram.trimEnd());
  if (art && !isOversized(art, maxWidth)) {
    for (const renderedLine of renderThemedDiagram(art, theme)) {
      push(renderedLine, sourceSpan);
    }
    return { lines: result, lineMap };
  }

  if (art) {
    push(formatWidthWarning(art.width), sourceSpan);
    return { lines: result, lineMap };
  }

  const framed = sourceBox(diagram, maxWidth > 0 ? maxWidth : undefined);

  for (const line of framed.plain) {
    push(line, sourceSpan);
  }

  return { lines: result, lineMap };
}

/**
 * Pre-process markdown content: replace mermaid fenced code blocks with
 * grok-mermaid Unicode box art. On render failure or oversize, keep a framed
 * source box and a short hint.
 */
export async function preprocessMermaid(
  content: string,
  maxWidth: number,
  theme?: MermaidTheme,
): Promise<string> {
  const document = await preprocessMermaidWithSourceMap(
    createPreparedMarkdown(content),
    maxWidth,
    theme,
  );
  return document.content;
}

export async function preprocessMermaidWithSourceMap(
  document: PreparedMarkdown,
  maxWidth: number,
  theme: MermaidTheme = {},
): Promise<PreparedMarkdown> {
  const lines = document.content.split(/\r?\n/);
  const result: string[] = [];
  const lineMap: Array<SourceSpan | null> = [];
  let transformed = false;

  const pushLines = (newLines: string[], newMap: Array<SourceSpan | null>) => {
    for (let i = 0; i < newLines.length; i++) {
      result.push(newLines[i] ?? "");
      lineMap.push(newMap[i] ?? null);
    }
  };

  const pushOriginal = (from: number, to: number) => {
    for (let sourceIndex = from; sourceIndex <= to; sourceIndex++) {
      const sourceLine = lines[sourceIndex];
      if (sourceLine === undefined) continue;
      result.push(sourceLine);
      lineMap.push(document.lineMap[sourceIndex] ?? null);
    }
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined || !/^```mermaid\s*$/.test(line)) {
      if (line !== undefined) pushOriginal(index, index);
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
      pushOriginal(index, index);
      continue;
    }

    const sourceSpan: SourceSpan = {
      startLine: document.lineMap[index]?.startLine ?? index + 1,
      endLine: document.lineMap[closingIndex]?.endLine ?? closingIndex + 1,
    };

    const diagram = lines.slice(index + 1, closingIndex).join("\n");
    if (diagramKind(diagram) === null) {
      pushOriginal(index, closingIndex);
      index = closingIndex;
      continue;
    }

    const { lines: renderedLines, lineMap: renderedMap } = processDiagram(
      diagram,
      sourceSpan,
      maxWidth,
      theme,
    );

    if (renderedLines.length > 0) transformed = true;
    pushLines(renderedLines, renderedMap);

    index = closingIndex;
  }

  return transformed ? { content: result.join("\n"), lineMap } : document;
}
