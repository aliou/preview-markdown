import { stripVTControlCharacters } from "node:util";
import {
  type Component,
  type DefaultTextStyle,
  Markdown,
  type MarkdownTheme,
  Marked,
  type Token,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { isMermaidDiagram, type MermaidTheme, renderMermaid } from "./mermaid";
import {
  mapPreparedSpan,
  type PreparedMarkdown,
  type SourceSpan,
} from "./source-map";

export interface DocumentStyles {
  markdown: MarkdownTheme;
  text: DefaultTextStyle;
  codeBlock: (text: string) => string;
  codeBlockPadding: (text: string) => string;
  mermaid: MermaidTheme;
}

export interface Heading {
  level: number;
  title: string;
  line: number;
}

export interface RenderedDocument {
  lines: string[];
  sourceSpans: Array<SourceSpan | null>;
}

type Block =
  | { kind: "markdown"; type: string; span: SourceSpan; component: Markdown }
  | {
      kind: "code";
      span: SourceSpan;
      lang: string | undefined;
      text: string;
      firstLine: number;
    }
  | { kind: "mermaid"; span: SourceSpan; diagram: string }
  | { kind: "space"; span: SourceSpan };

const PADDING_X = 2;
const PADDING_Y = 1;
const CODE_INDENT = "  ";
const HTML_COMMENT = /^\s*<!--[\s\S]*?-->\s*$/;
const GAPLESS_TYPES = new Set(["html", "text", "def", "space"]);

function countNewlines(text: string): number {
  return text.split("\n").length - 1;
}

function tokenSpan(startLine: number, raw: string): SourceSpan {
  const trailing = raw.length - raw.replace(/\n+$/, "").length;
  return {
    startLine,
    endLine: Math.max(startLine, startLine + countNewlines(raw) - trailing),
  };
}

function isHtmlComment(token: Token | undefined): boolean {
  return token?.type === "html" && HTML_COMMENT.test(token.raw);
}

function blockType(block: Block | undefined): string | undefined {
  if (!block) return undefined;
  return block.kind === "markdown" ? block.type : block.kind;
}

function gapAfter(block: Block, next: Block | undefined): boolean {
  const type = blockType(block);
  const nextType = blockType(next);
  if (!type || !nextType || nextType === "space" || nextType === "code")
    return false;
  if (type === "code" || GAPLESS_TYPES.has(type)) return false;
  return !(type === "paragraph" && nextType === "list");
}

function isBlankLine(line: string): boolean {
  return stripVTControlCharacters(line).trim() === "";
}

function isTableBorder(line: string): boolean {
  return /^[┌├└]/.test(stripVTControlCharacters(line).trimStart());
}

export class MarkdownDocument implements Component {
  readonly headings: Heading[];
  readonly codeLanguages: string[];
  private readonly blocks: Block[];
  private readonly prepared: PreparedMarkdown;
  private readonly styles: DocumentStyles;

  constructor(prepared: PreparedMarkdown, styles: DocumentStyles) {
    this.prepared = prepared;
    this.styles = styles;
    const marked = new Marked();
    const tokens = marked.lexer(prepared.content);
    const definitions = tokens
      .filter((token) => token.type === "def")
      .map((token) => token.raw.trim())
      .join("\n");
    this.blocks = this.buildBlocks(tokens, definitions);
    this.headings = this.buildHeadings(tokens);
    this.codeLanguages = [];
    marked.walkTokens(tokens, (token) => {
      if (token.type === "code" && token.lang)
        this.codeLanguages.push(token.lang);
    });
  }

  private buildBlocks(tokens: Token[], definitions: string): Block[] {
    const blocks: Block[] = [];
    let line = 1;
    let skipSpace = false;

    for (const token of tokens) {
      const span = tokenSpan(line, token.raw);
      line += countNewlines(token.raw);

      if (isHtmlComment(token)) {
        skipSpace = true;
        continue;
      }
      if (token.type === "space" && skipSpace) {
        skipSpace = false;
        continue;
      }
      skipSpace = false;
      blocks.push(this.buildBlock(token, span, definitions));
    }
    return blocks;
  }

  private buildBlock(
    token: Token,
    span: SourceSpan,
    definitions: string,
  ): Block {
    if (token.type === "space") return { kind: "space", span };
    if (token.type === "code") {
      const lang = token.lang || undefined;
      if (
        lang === "mermaid" &&
        token.codeBlockStyle !== "indented" &&
        isMermaidDiagram(token.text)
      ) {
        return { kind: "mermaid", span, diagram: token.text };
      }
      const firstLine =
        token.codeBlockStyle === "indented"
          ? span.startLine
          : span.startLine + 1;
      return { kind: "code", span, lang, text: token.text, firstLine };
    }
    const source =
      definitions && token.type !== "def"
        ? `${token.raw.trimEnd()}\n\n${definitions}`
        : token.raw;
    return {
      kind: "markdown",
      type: token.type,
      span,
      component: new Markdown(
        source,
        PADDING_X,
        0,
        this.styles.markdown,
        this.styles.text,
        {
          renderLatex: false,
        },
      ),
    };
  }

  private buildHeadings(tokens: Token[]): Heading[] {
    const headings: Heading[] = [];
    let line = 1;
    for (const token of tokens) {
      if (token.type === "heading") {
        const sourceLine = mapPreparedSpan(this.prepared, {
          startLine: line,
          endLine: line,
        })?.startLine;
        headings.push({
          level: token.depth,
          title: token.text.trim(),
          line: sourceLine ?? line,
        });
      }
      line += countNewlines(token.raw);
    }
    return headings;
  }

  invalidate(): void {
    for (const block of this.blocks) {
      if (block.kind === "markdown") block.component.invalidate();
    }
  }

  render(width: number): string[] {
    return this.renderWithSourceMap(width).lines;
  }

  renderWithSourceMap(width: number, fullWidth = width): RenderedDocument {
    const lines: string[] = [];
    const sourceSpans: Array<SourceSpan | null> = [];
    const push = (line: string, span: SourceSpan | null): void => {
      lines.push(line);
      sourceSpans.push(span);
    };
    const blank = this.blankLine(width);

    for (let index = 0; index < this.blocks.length; index++) {
      const block = this.blocks[index];
      if (!block) continue;
      const previous = this.blocks[index - 1];
      const next = this.blocks[index + 1];

      switch (block.kind) {
        case "space":
          if (previous?.kind !== "code" && next?.kind !== "code")
            push(blank, block.span);
          break;
        case "code":
          for (const [line, sourceLine] of this.renderCode(block, width)) {
            push(
              line,
              sourceLine === null
                ? null
                : { startLine: sourceLine, endLine: sourceLine },
            );
          }
          break;
        case "mermaid":
          for (const line of renderMermaid(
            block.diagram,
            Math.max(1, fullWidth),
            this.styles.mermaid,
          )) {
            push(line, block.span);
          }
          break;
        case "markdown":
          for (const line of block.component.render(width)) {
            const unmapped =
              isBlankLine(line) ||
              (block.type === "table" && isTableBorder(line));
            push(line, unmapped ? null : block.span);
          }
          break;
      }
      if (gapAfter(block, next)) push(blank, null);
    }

    if (lines.length > 0) {
      for (let i = 0; i < PADDING_Y; i++) {
        lines.unshift(blank);
        sourceSpans.unshift(null);
        push(blank, null);
      }
    }

    return {
      lines,
      sourceSpans: sourceSpans.map((span) =>
        mapPreparedSpan(this.prepared, span),
      ),
    };
  }

  private blankLine(width: number): string {
    const spaces = " ".repeat(Math.max(0, width));
    return this.styles.text.bgColor ? this.styles.text.bgColor(spaces) : spaces;
  }

  private renderCode(
    block: Extract<Block, { kind: "code" }>,
    width: number,
  ): Array<[string, number | null]> {
    const contentWidth = Math.max(1, width - PADDING_X * 2);
    const codeWidth = Math.max(1, contentWidth - CODE_INDENT.length);
    const margin = (line: string): string => {
      const pad = " ".repeat(PADDING_X);
      const style = this.styles.text.bgColor ?? ((text: string) => text);
      return `${style(pad)}${line}${style(pad)}`;
    };
    const highlighted =
      this.styles.markdown.highlightCode?.(block.text, block.lang) ??
      block.text.split("\n");
    const rows: Array<[string, number | null]> = [
      [margin(this.styles.codeBlockPadding("▀".repeat(contentWidth))), null],
    ];
    highlighted.forEach((codeLine, offset) => {
      for (const wrapped of wrapTextWithAnsi(codeLine, codeWidth)) {
        const fill = " ".repeat(Math.max(0, codeWidth - visibleWidth(wrapped)));
        rows.push([
          margin(this.styles.codeBlock(`${CODE_INDENT}${wrapped}${fill}`)),
          block.firstLine + offset,
        ]);
      }
    });
    rows.push([
      margin(this.styles.codeBlockPadding("▄".repeat(contentWidth))),
      null,
    ]);
    return rows;
  }
}
