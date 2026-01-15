#!/usr/bin/env bun
import * as fs from "node:fs";
import {
  type Component,
  Markdown,
  ProcessTerminal,
  TUI,
  visibleWidth,
} from "@mariozechner/pi-tui";
import chalk from "chalk";
import { parseArgs, printCompletion, printHelp, printVersion } from "./cli.js";
import { type ColorScheme, detectColorScheme } from "./color-scheme.js";
import { getThemeName, loadConfig, saveDefaultConfig } from "./config.js";
import { openInEditor } from "./editor.js";
import { createHighlightCodeFn, initSyntaxHighlighter } from "./highlighter.js";
import { preprocessMdx } from "./mdx.js";
import { Pager } from "./pager.js";
import {
  buildDefaultTextStyle,
  buildMarkdownTheme,
  type ResolvedTheme,
  resolveTheme,
} from "./theme.js";
import { watchFile } from "./watcher.js";

// Alternate screen buffer sequences
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";

// Mode 2031: color scheme change notifications
const ENABLE_COLOR_SCHEME_REPORTING = "\x1b[?2031h";
const DISABLE_COLOR_SCHEME_REPORTING = "\x1b[?2031l";

function enterAlternateScreen(): void {
  process.stdout.write(ENTER_ALT_SCREEN);
  process.stdout.write(ENABLE_COLOR_SCHEME_REPORTING);
}

function exitAlternateScreen(): void {
  process.stdout.write(DISABLE_COLOR_SCHEME_REPORTING);
  process.stdout.write(EXIT_ALT_SCREEN);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

class StatusBar implements Component {
  private filename: string;
  private pager: Pager;
  private bgColor: (text: string) => string;
  private fgColor: (text: string) => string;

  constructor(
    filename: string,
    pager: Pager,
    bgColor: (text: string) => string,
    fgColor: (text: string) => string,
  ) {
    this.filename = filename;
    this.pager = pager;
    this.bgColor = bgColor;
    this.fgColor = fgColor;
  }

  updateColors(
    bgColor: (text: string) => string,
    fgColor: (text: string) => string,
  ): void {
    this.bgColor = bgColor;
    this.fgColor = fgColor;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const scrollInfo = this.pager.getScrollInfo();
    const searchInfo = this.pager.getSearchInfo();

    // Build components with priority: percent > search > filename > help
    const percentStr = ` ${scrollInfo.percent}% `;
    const searchStr = searchInfo
      ? ` [${searchInfo.current}/${searchInfo.total}] `
      : "";
    const helpStr = this.pager.isShowingHelp() ? " ? Close " : " ? Help ";

    // Calculate fixed widths
    const percentWidth = visibleWidth(percentStr);
    const searchWidth = visibleWidth(searchStr);
    const helpWidth = visibleWidth(helpStr);

    // Space available for filename (with 1 char left margin)
    // Priority: always show percent, then search, then filename, then help
    const minLeftMargin = 1;

    // Try with help text
    let availableForFilename =
      width - minLeftMargin - percentWidth - searchWidth - helpWidth;
    let showHelp = true;

    // If not enough space, hide help text
    if (availableForFilename < 1) {
      availableForFilename = width - minLeftMargin - percentWidth - searchWidth;
      showHelp = false;
    }

    // Truncate filename from beginning if needed (keep file name visible)
    let displayFilename = this.filename;
    const filenameWidth = visibleWidth(displayFilename);
    if (filenameWidth > availableForFilename) {
      // Truncate from start, prepend ellipsis
      const ellipsis = "…";
      const ellipsisWidth = visibleWidth(ellipsis);
      const targetWidth = availableForFilename - ellipsisWidth;
      if (targetWidth > 0) {
        // Remove characters from start until it fits
        let truncated = displayFilename;
        while (visibleWidth(truncated) > targetWidth && truncated.length > 0) {
          truncated = truncated.slice(1);
        }
        displayFilename = ellipsis + truncated;
      } else {
        // Not enough space even for ellipsis, show nothing
        displayFilename = "";
      }
    }

    // Build left and right parts
    const left = ` ${displayFilename}`;
    let right = searchStr + percentStr;
    if (showHelp) {
      right += helpStr;
    }

    // Calculate padding and build final line
    const leftWidth = visibleWidth(left);
    const rightWidth = visibleWidth(right);
    const padding = Math.max(0, width - leftWidth - rightWidth);
    const line = left + " ".repeat(padding) + right;

    return [this.bgColor(this.fgColor(line))];
  }
}

async function renderWithoutPager(
  content: string,
  theme: ResolvedTheme,
  wrapWidth: number,
): Promise<void> {
  // Init highlighter with theme
  await initSyntaxHighlighter(theme.textmate);

  const highlightCode = createHighlightCodeFn(theme.name);
  const markdownTheme = buildMarkdownTheme(theme.colors, highlightCode);
  const defaultTextStyle = buildDefaultTextStyle(theme.colors);

  const markdown = new Markdown(content, 1, 0, markdownTheme, defaultTextStyle);
  const terminalWidth = process.stdout.columns || 80;
  // Use wrapWidth if set (>0), otherwise use terminal width
  const width =
    wrapWidth > 0 ? Math.min(wrapWidth, terminalWidth) : terminalWidth;
  const lines = markdown.render(width);

  for (const line of lines) {
    console.log(line);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // Handle simple commands first
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    printVersion();
    process.exit(0);
  }

  if (options.completion) {
    const success = printCompletion(options.completion);
    process.exit(success ? 0 : 1);
  }

  if (options.initConfig) {
    const configPath = saveDefaultConfig();
    console.log(`Config file created at: ${configPath}`);
    process.exit(0);
  }

  let content: string;
  let filename: string;
  const filePath = options.file;

  // Check file path first (takes precedence over piped stdin)
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    content = fs.readFileSync(filePath, "utf8");
    // Preprocess MDX files
    if (filePath.endsWith(".mdx")) {
      content = preprocessMdx(content);
    }
    filename = filePath;
  } else if (!process.stdin.isTTY) {
    // Reading from piped stdin
    content = await readStdin();
    filename = "stdin";
  } else {
    printHelp();
    process.exit(1);
  }

  // Load config
  const config = loadConfig();

  // Detect color scheme
  let currentColorScheme: ColorScheme;
  if (options.light) {
    currentColorScheme = "light";
  } else if (options.dark) {
    currentColorScheme = "dark";
  } else {
    currentColorScheme = await detectColorScheme();
  }

  // Resolve initial theme
  let currentTheme = resolveTheme(
    getThemeName(config, currentColorScheme === "dark"),
    currentColorScheme === "dark",
  );

  // No-pager mode: just output and exit
  if (options.noPager) {
    await renderWithoutPager(content, currentTheme, options.width);
    process.exit(0);
  }

  // Initialize syntax highlighter with theme
  await initSyntaxHighlighter(currentTheme.textmate);

  // Build theme components (mutable for color scheme changes)
  let highlightCode = createHighlightCodeFn(currentTheme.name);
  let markdownTheme = buildMarkdownTheme(currentTheme.colors, highlightCode);
  let defaultTextStyle = buildDefaultTextStyle(currentTheme.colors);

  // Create markdown component
  let markdown = new Markdown(content, 1, 1, markdownTheme, defaultTextStyle);

  // Create terminal and TUI
  const terminal = new ProcessTerminal();

  // TUI (declared early for use in callbacks)
  const tui = new TUI(terminal);

  // Line numbers: CLI flag overrides config
  const showLineNumbers = options.lineNumbers || config.showLineNumbers;

  // Forward declarations for pager and statusBar
  let pager: Pager;
  let statusBar: StatusBar;

  // Helper to rebuild content with current theme
  const rebuildContent = () => {
    highlightCode = createHighlightCodeFn(currentTheme.name);
    markdownTheme = buildMarkdownTheme(currentTheme.colors, highlightCode);
    defaultTextStyle = buildDefaultTextStyle(currentTheme.colors);

    const currentContent = filePath
      ? fs.readFileSync(filePath, "utf8")
      : content;
    markdown = new Markdown(
      currentContent,
      1,
      1,
      markdownTheme,
      defaultTextStyle,
    );
    pager.setContent(markdown);

    // Update pager colors
    pager.updateColors({
      bgColor: chalk.bgHex(currentTheme.colors.background),
      fgColor: chalk.hex(currentTheme.colors.foreground),
      helpBgColor: chalk.bgHex(currentTheme.colors.helpBg),
      helpFgColor: chalk.hex(currentTheme.colors.helpFg),
      searchBgColor: chalk.bgHex(currentTheme.colors.statusBarBg),
      searchFgColor: chalk.hex(currentTheme.colors.statusBarFg),
      lineNumberColor: chalk.hex(currentTheme.colors.lineNumber),
    });

    // Update status bar colors
    statusBar.updateColors(
      chalk.bgHex(currentTheme.colors.statusBarBg),
      chalk.hex(currentTheme.colors.statusBarFg),
    );
  };

  // Handle color scheme change from terminal
  const handleColorSchemeChange = async (newScheme: ColorScheme) => {
    if (newScheme === currentColorScheme) return;

    currentColorScheme = newScheme;
    const isDark = newScheme === "dark";
    currentTheme = resolveTheme(getThemeName(config, isDark), isDark);

    // Load the new theme into highlighter
    await initSyntaxHighlighter(currentTheme.textmate);

    // Rebuild everything with new theme
    rebuildContent();
    tui.requestRender(true);
  };

  // Helper to reload content after editing or file change
  const reloadContent = () => {
    if (filePath) {
      try {
        let newContent = fs.readFileSync(filePath, "utf8");
        // Preprocess MDX files
        if (filePath.endsWith(".mdx")) {
          newContent = preprocessMdx(newContent);
        }
        const newMarkdown = new Markdown(
          newContent,
          1,
          1,
          markdownTheme,
          defaultTextStyle,
        );
        pager.setContent(newMarkdown);
        tui.requestRender(true);
      } catch {
        // File might be temporarily unavailable during save
      }
    }
  };

  // File watcher for change notification
  const fileWatcher = filePath
    ? watchFile(filePath, () => {
        pager.setFileChanged(true);
        tui.requestRender(true);
      })
    : null;

  pager = new Pager({
    content: markdown,
    onExit: () => {
      fileWatcher?.stop();
      tui.stop();
      exitAlternateScreen();
      process.exit(0);
    },
    onReload: () => {
      reloadContent();
      pager.setFileChanged(false);
    },
    onEdit: (lineNumber) => {
      // Only edit if we have a file path (not stdin)
      if (!filePath) {
        return;
      }

      // Exit alt screen, stop TUI, open editor, reload, restart, re-enter alt screen
      exitAlternateScreen();
      tui.stop();
      openInEditor(filePath, lineNumber);
      reloadContent();
      enterAlternateScreen();
      tui.start();
    },
    onSuspend: () => {
      // Exit alt screen and stop TUI before suspending
      exitAlternateScreen();
      tui.stop();
      // Send SIGTSTP to self to actually suspend
      process.kill(process.pid, "SIGTSTP");
    },
    onColorSchemeChange: handleColorSchemeChange,
    showLineNumbers,
    wrapWidth: options.width,
    bgColor: chalk.bgHex(currentTheme.colors.background),
    fgColor: chalk.hex(currentTheme.colors.foreground),
    helpBgColor: chalk.bgHex(currentTheme.colors.helpBg),
    helpFgColor: chalk.hex(currentTheme.colors.helpFg),
    searchBgColor: chalk.bgHex(currentTheme.colors.statusBarBg),
    searchFgColor: chalk.hex(currentTheme.colors.statusBarFg),
    lineNumberColor: chalk.hex(currentTheme.colors.lineNumber),
  });

  // Status bar
  statusBar = new StatusBar(
    filename,
    pager,
    chalk.bgHex(currentTheme.colors.statusBarBg),
    chalk.hex(currentTheme.colors.statusBarFg),
  );

  // Override start to use alternate screen buffer
  const originalStart = tui.start.bind(tui);
  tui.start = () => {
    enterAlternateScreen();
    originalStart();
    pager.setViewportHeight(terminal.rows - 1);
  };

  tui.addChild(pager);
  tui.addChild(statusBar);
  tui.setFocus(pager);

  // Handle resize
  const originalRequestRender = tui.requestRender.bind(tui);
  tui.requestRender = (force?: boolean) => {
    pager.setViewportHeight(terminal.rows - 1);
    originalRequestRender(force);
  };

  // Handle SIGCONT (resume after Ctrl-Z suspend)
  process.on("SIGCONT", () => {
    // Invalidate cache, restart TUI (which enters alt screen), force render
    pager.invalidate();
    tui.start(); // This enters alt screen and sets viewport height
    tui.requestRender(true);
  });

  // Start file watcher
  fileWatcher?.start();

  tui.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
