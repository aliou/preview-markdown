import {
  hyperlink,
  sliceByColumn,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
  diagramKind,
  type MermaidArt,
  type Role,
  render,
  type Span,
  sourceBox,
} from "lovely-mermaid";

export type MermaidTheme = Partial<Record<Role, (text: string) => string>>;

function styleSpan(span: Span, theme: MermaidTheme): string {
  const text = theme[span.role]?.(span.text) ?? span.text;
  return span.href ? hyperlink(text, span.href) : text;
}

function styledRows(art: MermaidArt, theme: MermaidTheme): string[] {
  return art.styled.map((row) =>
    row.map((span) => styleSpan(span, theme)).join(""),
  );
}

function normalizeEscapedNewlines(diagram: string): string {
  return diagram.replace(/\\r\\n|\\n|\\r/g, " ");
}

export function isMermaidDiagram(source: string): boolean {
  return diagramKind(source) !== null;
}

export function renderMermaid(
  source: string,
  maxWidth: number,
  theme: MermaidTheme,
): string[] {
  const art = render(normalizeEscapedNewlines(source.trimEnd()));
  if (!art) return sourceBox(source, maxWidth).plain;

  const rows = styledRows(art, theme);
  if (art.width <= maxWidth) return rows;

  const warning = ` diagram clipped to terminal width; needs ${art.width} columns; increase terminal width to view `;
  return [
    ...rows.map((row) => sliceByColumn(row, 0, maxWidth, true)),
    ...wrapTextWithAnsi(warning, maxWidth),
  ];
}
