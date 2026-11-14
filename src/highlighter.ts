import chalk, { type ChalkInstance } from "chalk";
import {
  type BundledLanguage,
  bundledLanguages,
  createHighlighter,
  type Highlighter,
  type ThemedToken,
} from "shiki";
import type { TextMateTheme } from "./theme";

const LANG_ALIASES: Record<string, string> = {
  ex: "elixir",
  exs: "elixir",
  htm: "html",
  hujson: "jsonc",
  patch: "diff",
};

let highlighter: Highlighter | undefined;

function resolveLanguage(lang: string): string {
  const lower = lang.toLowerCase();
  return LANG_ALIASES[lower] ?? lower;
}

function isBundledLanguage(lang: string): lang is BundledLanguage {
  return Object.hasOwn(bundledLanguages, lang);
}

export async function loadHighlighting(
  theme: TextMateTheme,
  langs: Iterable<string>,
): Promise<void> {
  highlighter ??= await createHighlighter({ themes: [], langs: [] });
  const shiki = highlighter;
  if (!shiki.getLoadedThemes().includes(theme.name))
    await shiki.loadTheme(theme);
  const loaded = new Set(shiki.getLoadedLanguages());
  const missing = new Set(
    [...langs]
      .map(resolveLanguage)
      .filter((lang) => isBundledLanguage(lang) && !loaded.has(lang)),
  );
  if (missing.size > 0)
    await shiki.loadLanguage(...[...missing].filter(isBundledLanguage));
}

const FONT_STYLES: ReadonlyArray<
  [number, (style: ChalkInstance) => ChalkInstance]
> = [
  [1, (style) => style.italic],
  [2, (style) => style.bold],
  [4, (style) => style.underline],
  [8, (style) => style.strikethrough],
];

function styleToken(token: ThemedToken): string {
  const flags = token.fontStyle ?? 0;
  const base = token.color ? chalk.hex(token.color.slice(0, 7)) : chalk;
  const style = FONT_STYLES.reduce(
    (current, [flag, apply]) => (flags & flag ? apply(current) : current),
    base,
  );
  return style(token.content);
}

export function createCodeHighlighter(
  themeName: string,
): (code: string, lang?: string) => string[] {
  return (code, lang) => {
    const resolved = lang ? resolveLanguage(lang) : "";
    if (
      !isBundledLanguage(resolved) ||
      !highlighter?.getLoadedLanguages().includes(resolved)
    ) {
      return code.split("\n");
    }
    const { tokens } = highlighter.codeToTokens(code, {
      lang: resolved,
      theme: themeName,
    });
    return tokens.map((line) => line.map(styleToken).join(""));
  };
}
