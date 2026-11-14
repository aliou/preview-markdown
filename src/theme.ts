import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import chalk from "chalk";
import type { ThemeRegistration } from "shiki";
import { APP_NAME } from "./constants";
import type { DocumentStyles } from "./document";

// Bundled themes (imported as JSON)
import senzuDark from "./themes/senzu-dark.json";
import senzuLight from "./themes/senzu-light.json";

export type TextMateTheme = ThemeRegistration & { name: string };

/**
 * Resolved colors for markdown rendering
 */
export interface MarkdownColors {
  background: string;
  foreground: string;
  heading: string;
  link: string;
  linkUrl: string;
  comment: string;
  code: string;
  codeBlockBackground: string;
  codeBlockBorder: string;
  quote: string;
  quoteBorder: string;
  hr: string;
  listBullet: string;
  lineNumber: string;
  // Status bar colors
  statusBarBg: string;
  statusBarFg: string;
  // Help overlay colors
  helpBg: string;
  helpFg: string;
  // Search match highlighting colors
  searchMatch: string;
  searchCurrentMatch: string;
  // Git gutter colors
  gitAdded: string;
  gitModified: string;
  gitDeleted: string;
  gitMoved: string;
}

/**
 * Complete resolved theme with both raw TextMate and derived colors
 */
export interface ResolvedTheme {
  name: string;
  isDark: boolean;
  textmate: TextMateTheme;
  colors: MarkdownColors;
}

// Bundled themes registry
const BUNDLED_THEMES: Record<string, TextMateTheme> = {
  "senzu-dark": { ...senzuDark, type: "dark" },
  "senzu-light": { ...senzuLight, type: "light" },
};

const DEFAULT_DARK_THEME = "senzu-dark";
const DEFAULT_LIGHT_THEME = "senzu-light";

/**
 * Get the themes directory path
 */
function getThemesDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const configBase = xdgConfig || path.join(os.homedir(), ".config");
  return path.join(configBase, APP_NAME, "themes");
}

/**
 * Try to load a theme from the user's themes directory
 */
function loadThemeFromFile(themeName: string): TextMateTheme | null {
  const themesDir = getThemesDir();
  const themePath = path.join(themesDir, `${themeName}.json`);

  try {
    if (fs.existsSync(themePath)) {
      const content = fs.readFileSync(themePath, "utf8");
      return JSON.parse(content) as TextMateTheme;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Load a theme by name (checks user themes first, then bundled)
 */
export function loadTheme(themeName: string): TextMateTheme | null {
  // Try user themes first
  const userTheme = loadThemeFromFile(themeName);
  if (userTheme) {
    return userTheme;
  }

  // Try bundled themes
  const bundled = BUNDLED_THEMES[themeName];
  if (bundled) {
    return bundled;
  }

  return null;
}

/**
 * Get the default theme for a color scheme
 */
export function getDefaultTheme(isDark: boolean): TextMateTheme {
  const name = isDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
  // These are guaranteed to exist since we define them
  return BUNDLED_THEMES[name] as TextMateTheme;
}

/**
 * Find a color by scope in tokenColors
 */
function findColorByScope(
  theme: TextMateTheme,
  ...scopes: string[]
): string | null {
  for (const scope of scopes) {
    for (const token of theme.tokenColors ?? []) {
      const tokenScopes = Array.isArray(token.scope)
        ? token.scope
        : token.scope
          ? [token.scope]
          : [];

      for (const s of tokenScopes) {
        if (s === scope || s.startsWith(`${scope}.`)) {
          if (token.settings.foreground) {
            return token.settings.foreground;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Derive markdown colors from a TextMate theme
 */
export function deriveMarkdownColors(theme: TextMateTheme): MarkdownColors {
  const isDark = theme.type === "dark";

  // Base colors
  const background =
    theme.colors?.["editor.background"] || (isDark ? "#151515" : "#f5e6d3");
  const foreground =
    theme.colors?.["editor.foreground"] || (isDark ? "#e8e8d3" : "#252525");

  // Find colors from token scopes with fallbacks
  const heading =
    findColorByScope(theme, "markup.heading", "entity.name.tag") ||
    (isDark ? "#8fbfdc" : "#3c5971");

  const link =
    findColorByScope(
      theme,
      "markup.underline.link",
      "markup.heading",
      "entity.name.tag",
    ) || heading;

  const comment =
    findColorByScope(theme, "comment") || (isDark ? "#888888" : "#909090");

  const code =
    findColorByScope(theme, "markup.inline.raw", "string") ||
    (isDark ? "#99ad6a" : "#4a6335");

  const quote =
    findColorByScope(theme, "string", "markup.quote") ||
    (isDark ? "#99ad6a" : "#4a6335");

  const keyword =
    findColorByScope(theme, "keyword", "keyword.control") ||
    (isDark ? "#c6b6ee" : "#655683");

  // Derive UI colors from base colors
  const statusBarBg = isDark
    ? lighten(background, 0.1)
    : darken(background, 0.05);
  const helpBg = isDark ? lighten(background, 0.05) : darken(background, 0.02);
  const codeBlockBackground = isDark
    ? lighten(background, 0.06)
    : darken(background, 0.04);

  // Search match highlighting colors
  const searchMatch = isDark ? "#b8860b" : "#c8a000";
  const searchCurrentMatch = isDark ? "#d2691e" : "#cc5500";
  const gitAdded = isDark ? "#238636" : "#2da44e";
  const gitModified = isDark ? "#9e6a03" : "#bf8700";
  const gitDeleted = isDark ? "#da3633" : "#cf222e";
  const gitMoved = isDark ? "#1f6feb" : "#0969da";

  return {
    background,
    foreground,
    heading,
    link,
    linkUrl: comment,
    comment,
    code,
    codeBlockBackground,
    codeBlockBorder: comment,
    quote,
    quoteBorder: comment,
    hr: comment,
    listBullet: keyword,
    lineNumber: comment,
    statusBarBg,
    statusBarFg: foreground,
    helpBg,
    helpFg: comment,
    searchMatch,
    searchCurrentMatch,
    gitAdded,
    gitModified,
    gitDeleted,
    gitMoved,
  };
}

/**
 * Lighten a hex color
 */
function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount));
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount));
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount));

  return rgbToHex(r, g, b);
}

/**
 * Darken a hex color
 */
function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.max(0, Math.round(rgb.r * (1 - amount)));
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)));
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)));

  return rgbToHex(r, g, b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result?.[1] || !result[2] || !result[3]) {
    return null;
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Resolve a theme by name, falling back to defaults
 */
export function resolveTheme(
  themeName: string | undefined,
  isDark: boolean,
): ResolvedTheme {
  let theme: TextMateTheme;
  let name: string;

  if (themeName) {
    const loaded = loadTheme(themeName);
    if (loaded) {
      theme = loaded;
      name = themeName;
    } else {
      // Theme not found, fall back to default
      theme = getDefaultTheme(isDark);
      name = isDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
    }
  } else {
    theme = getDefaultTheme(isDark);
    name = isDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
  }

  return {
    name,
    isDark,
    textmate: theme,
    colors: deriveMarkdownColors(theme),
  };
}

export function buildDocumentStyles(
  colors: MarkdownColors,
  highlightCode: (code: string, lang?: string) => string[],
): DocumentStyles {
  return {
    markdown: {
      heading: chalk.hex(colors.heading),
      link: chalk.hex(colors.link),
      linkUrl: chalk.hex(colors.linkUrl),
      code: chalk.hex(colors.code),
      codeBlock: chalk.hex(colors.foreground).bgHex(colors.codeBlockBackground),
      codeBlockBorder: chalk.hex(colors.codeBlockBorder),
      quote: chalk.hex(colors.quote),
      quoteBorder: chalk.hex(colors.quoteBorder),
      hr: chalk.hex(colors.hr),
      listBullet: chalk.hex(colors.listBullet),
      bold: chalk.bold,
      italic: chalk.italic,
      strikethrough: chalk.strikethrough,
      underline: chalk.underline,
      highlightCode,
    },
    text: {
      color: chalk.hex(colors.foreground),
      bgColor: chalk.bgHex(colors.background),
    },
    codeBlock: chalk.hex(colors.foreground).bgHex(colors.codeBlockBackground),
    codeBlockPadding: chalk
      .bgHex(colors.codeBlockBackground)
      .hex(colors.background),
    mermaid: {
      border: chalk.hex(colors.codeBlockBorder),
      text: chalk.hex(colors.foreground),
      edge: chalk.hex(colors.link),
      edgeLabel: chalk.hex(colors.comment),
      title: chalk.bold.hex(colors.heading),
    },
  };
}
