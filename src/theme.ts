import * as fs from "node:fs";
import * as path from "node:path";
import { colorToHex, mixColors, parseColor } from "@earendil-works/pi-tui";
import chalk from "chalk";
import type { ThemeRegistration } from "shiki";
import { z } from "zod";
import type { ColorScheme } from "./color-scheme";
import { type Config, configDirectory, themeNameFor } from "./config";
import type { DocumentStyles } from "./document";
import { FailedError } from "./failed-error";
import type { GitLineStatus } from "./git";
import { createCodeHighlighter } from "./highlighter";
import senzuDark from "./themes/senzu-dark.json";
import senzuLight from "./themes/senzu-light.json";

chalk.level = 3;

export type Style = (text: string) => string;

export type TextMateTheme = ThemeRegistration & {
  name: string;
  type: ColorScheme;
};

export interface UiStyles {
  text: Style;
  background: Style;
  accent: Style;
  dim: Style;
  bar: Style;
  panel: Style;
  panelBorder: Style;
  selected: Style;
  lineNumber: Style;
  match: Style;
  currentMatch: Style;
  git: Record<GitLineStatus, Style>;
}

export interface AppTheme {
  textmate: TextMateTheme;
  document: DocumentStyles;
  ui: UiStyles;
}

const DEFAULT_THEMES: Record<ColorScheme, TextMateTheme> = {
  dark: { ...senzuDark, type: "dark" },
  light: { ...senzuLight, type: "light" },
};

const BUNDLED_THEMES = new Map(
  Object.values(DEFAULT_THEMES).map((theme) => [theme.name, theme]),
);

const themeFileSchema = z.looseObject({
  name: z.string().optional(),
  type: z.enum(["dark", "light"]).optional(),
  colors: z.record(z.string(), z.string()).optional(),
  tokenColors: z.array(
    z.looseObject({
      scope: z.union([z.string(), z.array(z.string())]).optional(),
      settings: z.looseObject({
        foreground: z.string().optional(),
        fontStyle: z.string().optional(),
      }),
    }),
  ),
});

function themesDirectory(): string {
  return path.join(configDirectory(), "themes");
}

function readThemeFile(
  name: string,
  scheme: ColorScheme,
): TextMateTheme | null {
  const file = path.join(themesDirectory(), `${name}.json`);
  if (!fs.existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new FailedError(
      `cannot read theme ${file}: ${(error as Error).message}`,
    );
  }
  const result = themeFileSchema.safeParse(raw);
  if (!result.success) {
    throw new FailedError(
      `invalid theme ${file}:\n${z.prettifyError(result.error)}`,
    );
  }
  return { ...result.data, name, type: result.data.type ?? scheme };
}

function loadTextMateTheme(
  name: string,
  scheme: ColorScheme,
  warnings: string[],
): TextMateTheme {
  const theme = readThemeFile(name, scheme) ?? BUNDLED_THEMES.get(name);
  if (theme) return theme;
  const fallback = DEFAULT_THEMES[scheme];
  warnings.push(
    `theme "${name}" not found in ${themesDirectory()}, using ${fallback.name}`,
  );
  return fallback;
}

function scopeColor(
  theme: TextMateTheme,
  ...scopes: string[]
): string | undefined {
  for (const scope of scopes) {
    for (const token of theme.tokenColors ?? []) {
      const tokenScopes =
        typeof token.scope === "string" ? [token.scope] : (token.scope ?? []);
      const matches = tokenScopes.some(
        (s) => s === scope || s.startsWith(`${scope}.`),
      );
      if (matches && token.settings.foreground)
        return token.settings.foreground;
    }
  }
  return undefined;
}

function shade(hex: string, scheme: ColorScheme, amount: number): string {
  const target = parseColor(scheme === "dark" ? "#ffffff" : "#000000");
  return colorToHex(
    mixColors(parseColor(hex.slice(0, 7)), target, amount, "srgb"),
  );
}

function buildTheme(textmate: TextMateTheme): AppTheme {
  const scheme = textmate.type;
  const dark = scheme === "dark";
  const color = (key: string, fallback: string): string =>
    textmate.colors?.[key] || fallback;
  const background = color("editor.background", dark ? "#151515" : "#f5e6d3");
  const foreground = color("editor.foreground", dark ? "#e8e8d3" : "#252525");
  const heading =
    scopeColor(textmate, "markup.heading", "entity.name.tag") ??
    (dark ? "#8fbfdc" : "#3c5971");
  const link =
    scopeColor(
      textmate,
      "markup.underline.link",
      "markup.heading",
      "entity.name.tag",
    ) ?? heading;
  const comment =
    scopeColor(textmate, "comment") ?? (dark ? "#888888" : "#909090");
  const code =
    scopeColor(textmate, "markup.inline.raw", "string") ??
    (dark ? "#99ad6a" : "#4a6335");
  const quote =
    scopeColor(textmate, "string", "markup.quote") ??
    (dark ? "#99ad6a" : "#4a6335");
  const keyword =
    scopeColor(textmate, "keyword", "keyword.control") ??
    (dark ? "#c6b6ee" : "#655683");
  const barBackground = shade(background, scheme, dark ? 0.1 : 0.05);
  const panelBackground = shade(background, scheme, dark ? 0.05 : 0.02);
  const codeBackground = shade(background, scheme, dark ? 0.06 : 0.04);
  const highlight = (bg: string): Style => chalk.bold.bgHex(bg).hex("#0a0a0a");

  return {
    textmate,
    document: {
      markdown: {
        heading: chalk.hex(heading),
        link: chalk.hex(link),
        linkUrl: chalk.hex(comment),
        code: chalk.hex(code),
        codeBlock: chalk.hex(foreground).bgHex(codeBackground),
        codeBlockBorder: chalk.hex(comment),
        quote: chalk.hex(quote),
        quoteBorder: chalk.hex(comment),
        hr: chalk.hex(comment),
        listBullet: chalk.hex(keyword),
        bold: chalk.bold,
        italic: chalk.italic,
        strikethrough: chalk.strikethrough,
        underline: chalk.underline,
        highlightCode: createCodeHighlighter(textmate.name),
      },
      text: { color: chalk.hex(foreground), bgColor: chalk.bgHex(background) },
      codeBlock: chalk.hex(foreground).bgHex(codeBackground),
      codeBlockPadding: chalk.bgHex(codeBackground).hex(background),
      mermaid: {
        border: chalk.hex(comment),
        text: chalk.hex(foreground),
        edge: chalk.hex(link),
        edgeLabel: chalk.hex(comment),
        title: chalk.bold.hex(heading),
      },
    },
    ui: {
      text: chalk.hex(foreground),
      background: chalk.bgHex(background),
      accent: chalk.hex(link),
      dim: chalk.hex(comment),
      bar: chalk.bgHex(barBackground).hex(foreground),
      panel: chalk.bgHex(panelBackground).hex(foreground),
      panelBorder: chalk.bgHex(panelBackground).hex(comment),
      selected: highlight(dark ? "#d2691e" : "#cc5500"),
      lineNumber: chalk.hex(comment),
      match: highlight(dark ? "#b8860b" : "#c8a000"),
      currentMatch: highlight(dark ? "#d2691e" : "#cc5500"),
      git: {
        added: chalk.bgHex(background).hex(dark ? "#238636" : "#2da44e"),
        modified: chalk.bgHex(background).hex(dark ? "#9e6a03" : "#bf8700"),
        deleted: chalk.bgHex(background).hex(dark ? "#da3633" : "#cf222e"),
        moved: chalk.bgHex(background).hex(dark ? "#1f6feb" : "#0969da"),
      },
    },
  };
}

export function loadThemes(
  config: Config,
  warnings: string[],
): Record<ColorScheme, AppTheme> {
  return {
    dark: buildTheme(
      loadTextMateTheme(themeNameFor(config, "dark"), "dark", warnings),
    ),
    light: buildTheme(
      loadTextMateTheme(themeNameFor(config, "light"), "light", warnings),
    ),
  };
}
