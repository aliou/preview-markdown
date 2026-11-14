import { sliceByColumn, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import {
  type Cls,
  diagramKind,
  type MermaidArt,
  render,
  sourceBox,
} from "grok-mermaid";

export type MermaidTheme = Partial<Record<Cls, (text: string) => string>>;

function styledRows(art: MermaidArt, theme: MermaidTheme): string[] {
  return art.styled.map((row) =>
    row.map((span) => theme[span.cls]?.(span.text) ?? span.text).join(""),
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
