import {
  type Component,
  type DefaultTextStyle,
  Markdown,
  type MarkdownTheme,
  sliceByColumn,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
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

function formatWidthWarning(naturalWidth: number, widthHint: string): string {
  return ` diagram clipped to terminal width; needs ${naturalWidth} columns; ${widthHint} `;
}

function formatWidthWarningLines(
  naturalWidth: number,
  maxWidth: number,
  widthHint: string,
): string[] {
  return wrapTextWithAnsi(
    formatWidthWarning(naturalWidth, widthHint),
    Math.max(1, maxWidth),
  );
}

function isOversized(art: MermaidArt, maxWidth: number): boolean {
  return maxWidth > 0 && art.width > maxWidth;
}

function clipRenderedDiagram(lines: string[], maxWidth: number): string[] {
  const width = Math.max(1, maxWidth);
  return lines.map((line) => sliceByColumn(line, 0, width, true));
}

function preformatMermaidSource(diagram: string): string {
  // Notion and other exporters often encode desired label line breaks as the
  // literal characters `\n`. grok-mermaid treats those as text, so normalize
  // them before rendering and let the renderer wrap labels into real rows.
  return diagram.replace(/\\r\\n|\\n|\\r/g, " ");
}

interface FenceLine {
  marker: string;
  markerChar: string;
  markerLength: number;
  rest: string;
}

interface ActiveFence {
  markerChar: string;
  markerLength: number;
}

function parseFenceLine(line: string): FenceLine | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;

  const marker = match[2] ?? "";
  return {
    marker,
    markerChar: marker[0] ?? "`",
    markerLength: marker.length,
    rest: match[3] ?? "",
  };
}

function isFenceClose(line: FenceLine, fence: ActiveFence): boolean {
  return (
    line.markerChar === fence.markerChar &&
    line.markerLength >= fence.markerLength &&
    /^\s*$/.test(line.rest)
  );
}

function isMermaidFenceOpen(line: string): ActiveFence | null {
  const fenceLine = parseFenceLine(line);
  if (
    !fenceLine ||
    fenceLine.markerChar !== "`" ||
    !line.startsWith(fenceLine.marker)
  ) {
    return null;
  }
  return /^mermaid\s*$/.test(fenceLine.rest)
    ? {
        markerChar: fenceLine.markerChar,
        markerLength: fenceLine.markerLength,
      }
    : null;
}

function processDiagram(
  diagram: string,
  sourceSpan: SourceSpan,
  maxWidth: number,
  theme: MermaidTheme,
  widthHint: string,
): { lines: string[]; lineMap: Array<SourceSpan | null> } {
  const result: string[] = [];
  const lineMap: Array<SourceSpan | null> = [];

  const push = (line: string, span: SourceSpan | null) => {
    result.push(line);
    lineMap.push(span);
  };

  const formattedDiagram = preformatMermaidSource(diagram.trimEnd());
  const art = render(formattedDiagram);
  if (art && !isOversized(art, maxWidth)) {
    for (const renderedLine of renderThemedDiagram(art, theme)) {
      push(renderedLine, sourceSpan);
    }
    return { lines: result, lineMap };
  }

  if (art) {
    for (const renderedLine of clipRenderedDiagram(
      renderThemedDiagram(art, theme),
      maxWidth,
    )) {
      push(renderedLine, sourceSpan);
    }
    for (const warningLine of formatWidthWarningLines(
      art.width,
      maxWidth,
      widthHint,
    )) {
      push(warningLine, sourceSpan);
    }
    return { lines: result, lineMap };
  }

  const framed = sourceBox(diagram, maxWidth > 0 ? maxWidth : undefined);

  for (const line of framed.plain) {
    push(line, sourceSpan);
  }

  return { lines: result, lineMap };
}

type SourceMappedRenderResult = {
  lines: string[];
  sourceSpans: Array<SourceSpan | null>;
};

interface SourceMappedComponent extends Component {
  renderWithSourceMap(
    width: number,
    fullWidth?: number,
  ): SourceMappedRenderResult;
}

interface MarkdownBlock {
  kind: "markdown";
  content: string;
  startLine: number;
}

interface MermaidBlock {
  kind: "mermaid";
  diagram: string;
  sourceSpan: SourceSpan;
}

type ContentBlock = MarkdownBlock | MermaidBlock;

function isSourceMappedComponent(
  component: Component,
): component is SourceMappedComponent {
  return (
    "renderWithSourceMap" in component &&
    typeof component.renderWithSourceMap === "function"
  );
}

function mapBlockSpan(
  block: MarkdownBlock,
  span: SourceSpan | null,
): SourceSpan | null {
  if (!span) return null;
  return {
    startLine: block.startLine + span.startLine - 1,
    endLine: block.startLine + span.endLine - 1,
  };
}

function parseMermaidBlocks(document: PreparedMarkdown): ContentBlock[] {
  const lines = document.content.split(/\r?\n/);
  const blocks: ContentBlock[] = [];
  let markdownStart = 0;
  let fence: ActiveFence | null = null;

  const pushMarkdown = (from: number, to: number) => {
    if (from > to) return;
    blocks.push({
      kind: "markdown",
      content: lines.slice(from, to + 1).join("\n"),
      startLine: from + 1,
    });
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) continue;

    const fenceLine = parseFenceLine(line);
    if (fenceLine) {
      if (fence) {
        if (isFenceClose(fenceLine, fence)) fence = null;
        continue;
      }

      const mermaidFence = isMermaidFenceOpen(line);
      if (!mermaidFence) {
        fence = {
          markerChar: fenceLine.markerChar,
          markerLength: fenceLine.markerLength,
        };
        continue;
      }
    }

    const mermaidFence = isMermaidFenceOpen(line);
    if (!mermaidFence) continue;

    let closingIndex = -1;
    for (let candidate = index + 1; candidate < lines.length; candidate++) {
      const closeLine = parseFenceLine(lines[candidate] ?? "");
      if (closeLine && isFenceClose(closeLine, mermaidFence)) {
        closingIndex = candidate;
        break;
      }
    }

    if (closingIndex === -1) continue;

    const diagram = lines.slice(index + 1, closingIndex).join("\n");
    if (diagramKind(diagram) === null) {
      index = closingIndex;
      continue;
    }

    pushMarkdown(markdownStart, index - 1);
    blocks.push({
      kind: "mermaid",
      diagram,
      sourceSpan: {
        startLine: index + 1,
        endLine: closingIndex + 1,
      },
    });
    markdownStart = closingIndex + 1;
    index = closingIndex;
  }

  pushMarkdown(markdownStart, lines.length - 1);
  return blocks;
}

function collectReferenceDefinitions(content: string): string {
  const lines = content.split(/\r?\n/);
  const definitions: string[] = [];
  let fence: ActiveFence | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";

    const fenceLine = parseFenceLine(line);
    if (fenceLine) {
      if (!fence) {
        fence = {
          markerChar: fenceLine.markerChar,
          markerLength: fenceLine.markerLength,
        };
        continue;
      }

      if (isFenceClose(fenceLine, fence)) {
        fence = null;
      }
      continue;
    }

    if (fence) continue;
    if (!/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S/.test(line)) continue;

    definitions.push(line);
    while (/^[ \t]{4,}\S/.test(lines[index + 1] ?? "")) {
      index++;
      definitions.push(lines[index] ?? "");
    }
  }

  return definitions.join("\n");
}

function withReferenceDefinitions(
  content: string,
  referenceDefinitions: string,
): string {
  if (content.trim() === "" || referenceDefinitions === "") return content;
  return `${content.replace(/\s+$/, "")}\n\n${referenceDefinitions}`;
}

class MermaidMarkdown implements SourceMappedComponent {
  private blocks: Array<
    (MarkdownBlock & { component: Component }) | MermaidBlock
  >;
  private mermaidTheme: MermaidTheme;
  private defaultTextStyle: DefaultTextStyle;
  private paddingY: number;

  constructor(
    document: PreparedMarkdown,
    markdownTheme: MarkdownTheme,
    defaultTextStyle: DefaultTextStyle,
    mermaidTheme: MermaidTheme,
    paddingX: number,
    paddingY = 1,
    renderLatex = false,
  ) {
    this.defaultTextStyle = defaultTextStyle;
    this.paddingY = paddingY;
    const referenceDefinitions = collectReferenceDefinitions(document.content);
    this.blocks = parseMermaidBlocks(document).map((block) => {
      if (block.kind === "mermaid") return block;

      return {
        ...block,
        component: new Markdown(
          withReferenceDefinitions(block.content, referenceDefinitions),
          paddingX,
          0,
          markdownTheme,
          defaultTextStyle,
          { renderLatex },
        ),
      };
    });
    this.mermaidTheme = mermaidTheme;
  }

  invalidate(): void {
    for (const block of this.blocks) {
      if (block.kind === "markdown") block.component.invalidate();
    }
  }

  render(width: number): string[] {
    return this.renderWithSourceMap(width).lines;
  }

  renderWithSourceMap(
    width: number,
    fullWidth = width,
  ): SourceMappedRenderResult {
    const lines: string[] = [];
    const sourceSpans: Array<SourceSpan | null> = [];
    const mermaidWidth = Math.max(1, fullWidth);

    for (const block of this.blocks) {
      if (block.kind === "mermaid") {
        const rendered = processDiagram(
          block.diagram,
          block.sourceSpan,
          mermaidWidth,
          this.mermaidTheme,
          "increase terminal width to view",
        );
        lines.push(...rendered.lines);
        sourceSpans.push(...rendered.lineMap);
        continue;
      }

      if (isSourceMappedComponent(block.component)) {
        const rendered = block.component.renderWithSourceMap(width);
        lines.push(...rendered.lines);
        sourceSpans.push(
          ...rendered.sourceSpans.map((span) => mapBlockSpan(block, span)),
        );
      } else {
        const renderedLines = block.component.render(width);
        lines.push(...renderedLines);
        sourceSpans.push(...new Array(renderedLines.length).fill(null));
      }
    }

    if (lines.length > 0 && this.paddingY > 0) {
      const emptyLine = this.defaultTextStyle.bgColor
        ? this.defaultTextStyle.bgColor(" ".repeat(width))
        : " ".repeat(width);
      const paddingLines = new Array(this.paddingY).fill(emptyLine);
      lines.unshift(...paddingLines);
      lines.push(...paddingLines);
      sourceSpans.unshift(...new Array(this.paddingY).fill(null));
      sourceSpans.push(...new Array(this.paddingY).fill(null));
    }

    return { lines, sourceSpans };
  }
}

export function createMermaidMarkdownComponent(
  document: PreparedMarkdown,
  markdownTheme: MarkdownTheme,
  defaultTextStyle: DefaultTextStyle,
  mermaidTheme: MermaidTheme = {},
  paddingX = 2,
): Component {
  return new MermaidMarkdown(
    document,
    markdownTheme,
    defaultTextStyle,
    mermaidTheme,
    paddingX,
  );
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
  widthHint = "increase terminal width or --width to view",
): Promise<string> {
  const document = await preprocessMermaidWithSourceMap(
    createPreparedMarkdown(content),
    maxWidth,
    theme,
    widthHint,
  );
  return document.content;
}

export async function preprocessMermaidWithSourceMap(
  document: PreparedMarkdown,
  maxWidth: number,
  theme: MermaidTheme = {},
  widthHint = "increase terminal width or --width to view",
): Promise<PreparedMarkdown> {
  const lines = document.content.split(/\r?\n/);
  const result: string[] = [];
  const lineMap: Array<SourceSpan | null> = [];
  let transformed = false;
  let fence: ActiveFence | null = null;

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
    if (line === undefined) continue;

    const fenceLine = parseFenceLine(line);
    if (fenceLine) {
      if (fence) {
        if (isFenceClose(fenceLine, fence)) fence = null;
        pushOriginal(index, index);
        continue;
      }

      const mermaidFence = isMermaidFenceOpen(line);
      if (!mermaidFence) {
        fence = {
          markerChar: fenceLine.markerChar,
          markerLength: fenceLine.markerLength,
        };
        pushOriginal(index, index);
        continue;
      }
    }

    const mermaidFence = isMermaidFenceOpen(line);
    if (!mermaidFence) {
      if (line !== undefined) pushOriginal(index, index);
      continue;
    }

    let closingIndex = -1;
    for (let candidate = index + 1; candidate < lines.length; candidate++) {
      const closeLine = parseFenceLine(lines[candidate] ?? "");
      if (closeLine && isFenceClose(closeLine, mermaidFence)) {
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
      widthHint,
    );

    if (renderedLines.length > 0) transformed = true;
    pushLines(renderedLines, renderedMap);

    index = closingIndex;
  }

  return transformed ? { content: result.join("\n"), lineMap } : document;
}
