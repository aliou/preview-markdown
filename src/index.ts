#!/usr/bin/env bun
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type Component,
  Markdown,
  ProcessTerminal,
  Spacer,
  TUI,
  visibleWidth,
} from "@mariozechner/pi-tui";
import chalk from "chalk";
import { Browser, type Entry, scanDirectory } from "./browser.js";
import { parseArgs, printCompletion, printHelp, printVersion } from "./cli.js";
import { type ColorScheme, detectColorScheme } from "./color-scheme.js";
import { getThemeName, loadConfig, saveDefaultConfig } from "./config.js";
import { openInEditor } from "./editor.js";
import { createHighlightCodeFn, initSyntaxHighlighter } from "./highlighter.js";
import { preprocessMdx } from "./mdx.js";
import { preprocessMermaid } from "./mermaid.js";
import { Pager } from "./pager.js";
import {
  buildDefaultTextStyle,
  buildMarkdownTheme,
  resolveTheme,
} from "./theme.js";
import { watchFile } from "./watcher.js";

// Alternate screen buffer sequences
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";

// Mode 2031: color scheme change notifications
const ENABLE_COLOR_SCHEME_REPORTING = "\x1b[?2031h";
const DISABLE_COLOR_SCHEME_REPORTING = "\x1b[?2031l";

// Markdown content padding for a balanced reading layout
const CONTENT_PADDING_X = 2;

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

// Delegates render/input/invalidate to whichever component is currently active.
class Switcher implements Component {
  private active: Component | null = null;

  setActive(c: Component): void {
    this.active = c;
  }

  getActive(): Component | null {
    return this.active;
  }

  invalidate(): void {
    this.active?.invalidate();
  }

  render(width: number): string[] {
    return this.active?.render(width) ?? [];
  }

  handleInput(data: string): void {
    this.active?.handleInput?.(data);
  }
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

    const percentStr = ` ${scrollInfo.percent}% `;
    const searchStr = searchInfo
      ? ` [${searchInfo.current}/${searchInfo.total}] `
      : "";
    const helpStr = this.pager.isShowingHelp() ? " ? Close " : " ? Help ";

    const percentWidth = visibleWidth(percentStr);
    const searchWidth = visibleWidth(searchStr);
    const helpWidth = visibleWidth(helpStr);

    const minLeftMargin = 1;
    let availableForFilename =
      width - minLeftMargin - percentWidth - searchWidth - helpWidth;
    let showHelp = true;

    if (availableForFilename < 1) {
      availableForFilename = width - minLeftMargin - percentWidth - searchWidth;
      showHelp = false;
    }

    let displayFilename = this.filename;
    const filenameWidth = visibleWidth(displayFilename);
    if (filenameWidth > availableForFilename) {
      const ellipsis = "\u2026";
      const ellipsisWidth = visibleWidth(ellipsis);
      const targetWidth = availableForFilename - ellipsisWidth;
      if (targetWidth > 0) {
        let truncated = displayFilename;
        while (visibleWidth(truncated) > targetWidth && truncated.length > 0) {
          truncated = truncated.slice(1);
        }
        displayFilename = ellipsis + truncated;
      } else {
        displayFilename = "";
      }
    }

    const left = ` ${displayFilename}`;
    let right = searchStr + percentStr;
    if (showHelp) {
      right += helpStr;
    }

    const leftWidth = visibleWidth(left);
    const rightWidth = visibleWidth(right);
    const padding = Math.max(0, width - leftWidth - rightWidth);
    const line = left + " ".repeat(padding) + right;

    return [this.bgColor(this.fgColor(line))];
  }
}

async function buildContentComponent(
  content: string,
  markdownTheme: ReturnType<typeof buildMarkdownTheme>,
  defaultTextStyle: ReturnType<typeof buildDefaultTextStyle>,
  maxMermaidWidth: number,
): Promise<Component> {
  const preprocessed = await preprocessMermaid(content, maxMermaidWidth);
  return new Markdown(
    preprocessed,
    CONTENT_PADDING_X,
    1,
    markdownTheme,
    defaultTextStyle,
  );
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

  // Determine mode
  type AppMode = "browser" | "viewer" | "stdin";
  let mode: AppMode;
  let baseDir = "";

  const sourcePath = options.source;

  if (sourcePath) {
    if (!fs.existsSync(sourcePath)) {
      console.error(`Error: Not found: ${sourcePath}`);
      process.exit(1);
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(sourcePath);
    } catch {
      console.error(`Error: Cannot access: ${sourcePath}`);
      process.exit(1);
    }
    if (stat.isDirectory()) {
      mode = "browser";
      baseDir = path.resolve(sourcePath);
    } else {
      mode = "viewer";
    }
  } else if (!process.stdin.isTTY) {
    mode = "stdin";
  } else {
    // No args, TTY: open browser at cwd
    mode = "browser";
    baseDir = process.cwd();
  }

  // Read content for viewer/stdin modes
  let content = "";
  let filename = "";
  const filePath = mode === "viewer" ? sourcePath : null;

  if (mode === "viewer" && filePath) {
    content = fs.readFileSync(filePath, "utf8");
    if (filePath.endsWith(".mdx")) content = preprocessMdx(content);
    filename = filePath;
  } else if (mode === "stdin") {
    content = await readStdin();
    filename = "stdin";
  }

  // Load config and detect color scheme
  const config = loadConfig();

  let currentColorScheme: ColorScheme;
  if (options.light) {
    currentColorScheme = "light";
  } else if (options.dark) {
    currentColorScheme = "dark";
  } else {
    currentColorScheme = await detectColorScheme();
  }

  let currentTheme = resolveTheme(
    getThemeName(config, currentColorScheme === "dark"),
    currentColorScheme === "dark",
  );

  // Initialize syntax highlighter
  await initSyntaxHighlighter(currentTheme.textmate);

  // Theme components — mutable so color scheme changes can update them
  let highlightCode = createHighlightCodeFn(currentTheme.name);
  let markdownTheme = buildMarkdownTheme(currentTheme.colors, highlightCode);
  let defaultTextStyle = buildDefaultTextStyle(currentTheme.colors);

  // Create terminal and TUI
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // Two switchers: one for the main content area, one for the status bar.
  // Swapping active components in each switcher is how we transition between
  // browser mode and viewer mode without restarting the TUI.
  const mainSwitcher = new Switcher();
  const statusSwitcher = new Switcher();

  tui.addChild(mainSwitcher);
  tui.addChild(statusSwitcher);
  tui.setFocus(mainSwitcher);

  const getMermaidMaxWidth = (): number => {
    const targetWidth =
      options.width > 0
        ? Math.min(options.width, terminal.columns)
        : terminal.columns;
    return Math.max(20, targetWidth - CONTENT_PADDING_X * 2);
  };

  const showLineNumbers = options.lineNumbers || config.showLineNumbers;

  // --- Color factories (rebuilt on theme change) ---

  const buildBrowserColors = () => ({
    bgColor: chalk.bgHex(currentTheme.colors.background),
    fgColor: chalk.hex(currentTheme.colors.foreground),
    accentColor: chalk.hex(currentTheme.colors.link),
    dimColor: chalk.hex(currentTheme.colors.lineNumber),
    helpBgColor: chalk.bgHex(currentTheme.colors.helpBg),
    helpFgColor: chalk.hex(currentTheme.colors.helpFg),
    filterBgColor: chalk.bgHex(currentTheme.colors.statusBarBg),
    filterFgColor: chalk.hex(currentTheme.colors.statusBarFg),
  });

  const buildPagerColors = () => ({
    bgColor: chalk.bgHex(currentTheme.colors.background),
    fgColor: chalk.hex(currentTheme.colors.foreground),
    helpBgColor: chalk.bgHex(currentTheme.colors.helpBg),
    helpFgColor: chalk.hex(currentTheme.colors.helpFg),
    searchBgColor: chalk.bgHex(currentTheme.colors.statusBarBg),
    searchFgColor: chalk.hex(currentTheme.colors.statusBarFg),
    lineNumberColor: chalk.hex(currentTheme.colors.lineNumber),
  });

  const buildStatusBarColors = () => ({
    bgColor: chalk.bgHex(currentTheme.colors.statusBarBg),
    fgColor: chalk.hex(currentTheme.colors.statusBarFg),
  });

  // --- Mutable state for the currently active pager session ---
  let activePager: Pager | null = null;
  let activeStatusBar: StatusBar | null = null;
  let activeFilePath: string | null = null;
  let activeFileWatcher: ReturnType<typeof watchFile> | null = null;

  // Browser uses header-only chrome, no bottom status bar.
  const emptyStatus = new Spacer(0);

  // --- Browser components (null in viewer/stdin mode) ---
  let browser: Browser | null = null;

  // --- Color scheme change handler ---
  // Called by both Browser and Pager when they detect a terminal color change.
  const handleColorSchemeChange = async (newScheme: ColorScheme) => {
    if (newScheme === currentColorScheme) return;

    currentColorScheme = newScheme;
    const isDark = newScheme === "dark";
    currentTheme = resolveTheme(getThemeName(config, isDark), isDark);
    await initSyntaxHighlighter(currentTheme.textmate);

    highlightCode = createHighlightCodeFn(currentTheme.name);
    markdownTheme = buildMarkdownTheme(currentTheme.colors, highlightCode);
    defaultTextStyle = buildDefaultTextStyle(currentTheme.colors);

    // Update browser colors
    if (browser) {
      browser.updateColors(buildBrowserColors());
    }

    // Update active pager colors (only if pager is currently shown)
    if (activePager && mainSwitcher.getActive() === activePager) {
      if (activeFilePath) {
        try {
          let newContent = fs.readFileSync(activeFilePath, "utf8");
          if (activeFilePath.endsWith(".mdx"))
            newContent = preprocessMdx(newContent);
          const newComponent = await buildContentComponent(
            newContent,
            markdownTheme,
            defaultTextStyle,
            getMermaidMaxWidth(),
          );
          activePager.setContent(newComponent);
        } catch {
          // File temporarily unavailable
        }
      }
      activePager.updateColors(buildPagerColors());
      if (activeStatusBar) {
        const sc = buildStatusBarColors();
        activeStatusBar.updateColors(sc.bgColor, sc.fgColor);
      }
    }

    tui.requestRender(true);
  };

  // --- Pager creation helper ---
  // fromBrowser: true  -> q goes back to browser
  // fromBrowser: false -> q quits the process
  function buildPager(
    pagerContent: Component,
    pagerFilePath: string | null,
    pagerFilename: string,
    fromBrowser: boolean,
  ): { pager: Pager; statusBar: StatusBar } {
    let pager: Pager;

    pager = new Pager({
      content: pagerContent,
      onExit: () => {
        activeFileWatcher?.stop();
        activeFileWatcher = null;

        if (fromBrowser && browser) {
          // Return to directory browser
          mainSwitcher.setActive(browser);
          statusSwitcher.setActive(emptyStatus);
          tui.requestRender(true);
        } else {
          tui.stop();
          exitAlternateScreen();
          process.exit(0);
        }
      },
      onReload: () => {
        if (!pagerFilePath) return;
        void (async () => {
          try {
            let newContent = fs.readFileSync(pagerFilePath, "utf8");
            if (pagerFilePath.endsWith(".mdx"))
              newContent = preprocessMdx(newContent);
            const newComponent = await buildContentComponent(
              newContent,
              markdownTheme,
              defaultTextStyle,
              getMermaidMaxWidth(),
            );
            pager.setContent(newComponent);
            pager.setFileChanged(false);
            tui.requestRender(true);
          } catch {
            // File temporarily unavailable during save
          }
        })();
      },
      onEdit: (lineNumber) => {
        if (!pagerFilePath) return;
        exitAlternateScreen();
        tui.stop();
        openInEditor(pagerFilePath, lineNumber);
        void (async () => {
          try {
            let newContent = fs.readFileSync(pagerFilePath, "utf8");
            if (pagerFilePath.endsWith(".mdx"))
              newContent = preprocessMdx(newContent);
            const newComponent = await buildContentComponent(
              newContent,
              markdownTheme,
              defaultTextStyle,
              getMermaidMaxWidth(),
            );
            pager.setContent(newComponent);
          } catch {
            // Ignore read errors after edit
          }
          enterAlternateScreen();
          tui.start();
        })();
      },
      onSuspend: () => {
        exitAlternateScreen();
        tui.stop();
        process.kill(process.pid, "SIGTSTP");
      },
      onColorSchemeChange: handleColorSchemeChange,
      showLineNumbers,
      wrapWidth: options.width,
      ...buildPagerColors(),
    });

    const sc = buildStatusBarColors();
    const statusBar = new StatusBar(
      pagerFilename,
      pager,
      sc.bgColor,
      sc.fgColor,
    );

    return { pager, statusBar };
  }

  // --- Open a file from the browser ---
  function openFileFromBrowser(entry: Entry): void {
    void (async () => {
      let fileContent: string;
      try {
        fileContent = fs.readFileSync(entry.absolutePath, "utf8");
      } catch {
        return; // Can't read file — stay in browser
      }

      if (entry.absolutePath.endsWith(".mdx"))
        fileContent = preprocessMdx(fileContent);

      const contentComponent = await buildContentComponent(
        fileContent,
        markdownTheme,
        defaultTextStyle,
        getMermaidMaxWidth(),
      );
      const { pager, statusBar } = buildPager(
        contentComponent,
        entry.absolutePath,
        entry.relativePath,
        true,
      );

      activePager = pager;
      activeStatusBar = statusBar;
      activeFilePath = entry.absolutePath;

      activeFileWatcher = watchFile(entry.absolutePath, () => {
        pager.setFileChanged(true);
        tui.requestRender(true);
      });
      activeFileWatcher.start();

      mainSwitcher.setActive(pager);
      statusSwitcher.setActive(statusBar);
      pager.setViewportHeight(getMainViewportHeight());
      tui.requestRender(true);
    })();
  }

  // --- Initial mode setup ---

  if (mode === "browser") {
    const entries = scanDirectory(baseDir, options.depth);
    browser = new Browser({
      entries,
      baseDir,
      onOpen: openFileFromBrowser,
      onQuit: () => {
        tui.stop();
        exitAlternateScreen();
        process.exit(0);
      },
      onColorSchemeChange: handleColorSchemeChange,
      ...buildBrowserColors(),
    });

    mainSwitcher.setActive(browser);
    statusSwitcher.setActive(emptyStatus);
    browser.setViewportHeight(getMainViewportHeight());
  } else {
    // viewer or stdin
    const contentComponent = await buildContentComponent(
      content,
      markdownTheme,
      defaultTextStyle,
      getMermaidMaxWidth(),
    );
    const { pager, statusBar } = buildPager(
      contentComponent,
      filePath,
      filename,
      false,
    );

    activePager = pager;
    activeStatusBar = statusBar;
    activeFilePath = filePath;

    if (filePath) {
      activeFileWatcher = watchFile(filePath, () => {
        pager.setFileChanged(true);
        tui.requestRender(true);
      });
    }

    mainSwitcher.setActive(pager);
    statusSwitcher.setActive(statusBar);
    pager.setViewportHeight(getMainViewportHeight());
  }

  // --- TUI lifecycle wrappers ---

  function getStatusLineCount(): number {
    return statusSwitcher.getActive() === emptyStatus ? 0 : 1;
  }

  function getMainViewportHeight(): number {
    return Math.max(0, terminal.rows - getStatusLineCount());
  }

  // Sets viewport height on whichever component is currently the main content.
  function setActiveViewportHeight(h: number): void {
    const active = mainSwitcher.getActive();
    if (active instanceof Browser) {
      active.setViewportHeight(h);
    } else if (active instanceof Pager) {
      active.setViewportHeight(h);
    }
  }

  const originalStart = tui.start.bind(tui);
  tui.start = () => {
    enterAlternateScreen();
    originalStart();
    setActiveViewportHeight(getMainViewportHeight());
  };

  const originalRequestRender = tui.requestRender.bind(tui);
  tui.requestRender = (force?: boolean) => {
    setActiveViewportHeight(getMainViewportHeight());
    originalRequestRender(force);
  };

  // Resume after Ctrl-Z suspend
  process.on("SIGCONT", () => {
    const active = mainSwitcher.getActive();
    if (active instanceof Pager) active.invalidate();
    tui.start();
    tui.requestRender(true);
  });

  // Start file watcher for initial viewer/stdin modes
  activeFileWatcher?.start();

  tui.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
