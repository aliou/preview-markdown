import chalk from "chalk";
import {
  type BundledLanguage,
  bundledLanguages,
  createHighlighter,
  type Highlighter,
  type ThemeRegistration,
} from "shiki";
import type { TextMateTheme } from "./theme.js";

// Force chalk to always output colors (even when not TTY)
chalk.level = 3;

// Singleton highlighter instance
let highlighter: Highlighter | null = null;

// Currently loaded themes
const loadedThemes: Set<string> = new Set();

// Language aliases for common extensions
const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
  py: "python",
  rb: "ruby",
  rs: "rust",
  md: "markdown",
  jsx: "javascript",
  tsx: "typescript",
};

function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase();
  return LANG_ALIASES[lower] || lower;
}

// Common languages to pre-load for performance
const COMMON_LANGS: BundledLanguage[] = [
  "javascript",
  "typescript",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "bash",
  "json",
  "yaml",
  "html",
  "css",
  "markdown",
  "sql",
  "ruby",
  "php",
  "swift",
  "kotlin",
];

/**
 * Initialize the syntax highlighter with a theme.
 */
export async function initSyntaxHighlighter(
  theme: TextMateTheme,
): Promise<void> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: [theme as unknown as ThemeRegistration],
      langs: COMMON_LANGS,
    });
    loadedThemes.add(theme.name);
  } else if (!loadedThemes.has(theme.name)) {
    // Load additional theme into existing highlighter
    await highlighter.loadTheme(theme as unknown as ThemeRegistration);
    loadedThemes.add(theme.name);
  }
}

/**
 * Check if a language is supported by Shiki.
 */
function isLanguageSupported(lang: string): boolean {
  return lang in bundledLanguages;
}

/**
 * Load a language dynamically if not already loaded.
 */
async function ensureLanguageLoaded(lang: string): Promise<boolean> {
  if (!highlighter) return false;

  const loadedLangs = highlighter.getLoadedLanguages();
  if (loadedLangs.includes(lang as BundledLanguage)) {
    return true;
  }

  if (isLanguageSupported(lang)) {
    try {
      await highlighter.loadLanguage(lang as BundledLanguage);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Highlight code and return ANSI-colored lines.
 */
export function highlightCode(
  code: string,
  lang: string | undefined,
  themeName: string,
): string[] {
  if (!highlighter) {
    // Fallback if highlighter not initialized
    return code.split("\n");
  }

  const normalizedLang = lang ? normalizeLang(lang) : undefined;

  // Check if language is loaded, if not try to use plain text
  const loadedLangs = highlighter.getLoadedLanguages();
  const langToUse =
    normalizedLang && loadedLangs.includes(normalizedLang as BundledLanguage)
      ? (normalizedLang as BundledLanguage)
      : ("text" as BundledLanguage);

  try {
    // Get tokens from Shiki
    const { tokens } = highlighter.codeToTokens(code, {
      lang: langToUse,
      theme: themeName,
    });

    // Render tokens to ANSI
    const lines: string[] = [];

    for (const lineTokens of tokens) {
      let line = "";
      for (const token of lineTokens) {
        const color = token.color;
        if (color) {
          line += chalk.hex(color)(token.content);
        } else {
          line += token.content;
        }
      }
      lines.push(line);
    }

    return lines;
  } catch {
    // Fallback to plain text
    return code.split("\n");
  }
}

/**
 * Highlight code asynchronously, loading the language if needed.
 */
export async function highlightCodeAsync(
  code: string,
  lang: string | undefined,
  themeName: string,
): Promise<string[]> {
  const normalizedLang = lang ? normalizeLang(lang) : undefined;

  // Try to load the language if not already loaded
  if (normalizedLang) {
    await ensureLanguageLoaded(normalizedLang);
  }

  return highlightCode(code, lang, themeName);
}

/**
 * Create a highlightCode function for use with Markdown theme.
 */
export function createHighlightCodeFn(
  themeName: string,
): (code: string, lang?: string) => string[] {
  return (code: string, lang?: string) => highlightCode(code, lang, themeName);
}
