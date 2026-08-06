#!/usr/bin/env bun
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type Component,
  KeybindingsManager,
  Markdown,
  ProcessTerminal,
  ScrollView,
  Spacer,
  setKeybindings,
  TUI_KEYBINDINGS,
  TuiAltScreen,
  VStack,
  visibleWidth,
} from "@earendil-works/pi-tui";
import chalk from "chalk";
import { Browser, type Entry, scanDirectory } from "./browser.js";
import { parseArgs, printCompletion, printHelp, printVersion } from "./cli.js";
import { type ColorScheme, detectColorScheme } from "./color-scheme.js";
import { getThemeName, loadConfig, saveDefaultConfig } from "./config.js";
import { openInEditor } from "./editor.js";
import { createGitStatusResolver, type GitStatusResolver } from "./git.js";
import { createHighlightCodeFn, initSyntaxHighlighter } from "./highlighter.js";
import { PMD_KEYBINDINGS } from "./keybindings.js";
import { preprocessMdxWithSourceMap } from "./mdx.js";
import { preprocessMermaidWithSourceMap } from "./mermaid.js";
import { Pager, type TocEntry } from "./pager.js";
import { createPreparedMarkdown } from "./source-map.js";
import {
  buildDefaultTextStyle,
  buildMarkdownTheme,
  resolveTheme,
} from "./theme.js";
import { ViewportController } from "./viewport.js";
import { watchFile } from "./watcher.js";

// Markdown content padding for a balanced reading layout
const CONTENT_PADDING_X = 2;

setKeybindings(
  new KeybindingsManager(
    {
      ...TUI_KEYBINDINGS,
      ...PMD_KEYBINDINGS,
    },
    {
      "tui.altScreen.pageUp": [],
      "tui.altScreen.pageDown": [],
      "tui.altScreen.previousPrompt": [],
      "tui.altScreen.nextPrompt": [],
      "tui.altScreen.top": [],
      "tui.altScreen.bottom": [],
    },
  ),
);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function extractTocEntries(content: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let inFence = false;

  content.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;

    const marker = match[1];
    const title = match[2];
    if (!marker || !title) return;

    entries.push({
      level: marker.length,
      title: title.trim(),
      line: index + 1,
    });
  });

  return entries;
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
    const lines = this.pager.getFooterLines(width);

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

    lines.push(this.bgColor(this.fgColor(line)));
    return lines;
  }
}

async function buildContentComponent(
  content: string,
  markdownTheme: ReturnType<typeof buildMarkdownTheme>,
  defaultTextStyle: ReturnType<typeof buildDefaultTextStyle>,
): Promise<Component> {
  return new Markdown(
    content,
    CONTENT_PADDING_X,
    1,
    markdownTheme,
    defaultTextStyle,
    { renderLatex: false },
  );
}

interface Document {
  component: Component;
  tocEntries: TocEntry[];
  gitStatusForSpan?: GitStatusResolver;
}

async function buildDocument(
  content: string,
  filePath: string | null,
  markdownTheme: ReturnType<typeof buildMarkdownTheme>,
  defaultTextStyle: ReturnType<typeof buildDefaultTextStyle>,
  maxMermaidWidth: number,
): Promise<Document> {
  let prepared = createPreparedMarkdown(content);
  if (filePath?.endsWith(".mdx")) {
    prepared = preprocessMdxWithSourceMap(prepared);
  }
  prepared = await preprocessMermaidWithSourceMap(prepared, maxMermaidWidth);

  return {
    component: await buildContentComponent(
      prepared.content,
      markdownTheme,
      defaultTextStyle,
    ),
    tocEntries: extractTocEntries(prepared.content),
    gitStatusForSpan: filePath
      ? createGitStatusResolver(filePath, content, prepared)
      : undefined,
  };
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
  const tui = new TuiAltScreen(terminal, undefined, undefined, { mouse: true });

  // Two switchers: one for the main content area, one for the status bar.
  // Swapping active components in each switcher is how we transition between
  // browser mode and viewer mode without restarting the TUI.
  const mainSwitcher = new Switcher();
  const statusSwitcher = new Switcher();
  const mainScroll = new ScrollView(mainSwitcher, {
    primary: true,
    follow: "none",
    overscroll: "contain",
    scrollbar: "auto",
  });
  const viewport = new ViewportController(mainScroll);
  const root = new VStack([
    {
      component: mainScroll,
      basis: 0,
      grow: 1,
      minSize: 1,
    },
    {
      component: statusSwitcher,
      basis: "auto",
      shrink: 0,
      minSize: 0,
    },
  ]);

  tui.setLayoutRoot(root);
  tui.setFocus(mainSwitcher);
  tui.setTerminalColorSchemeNotifications(true);

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
    matchColor: chalk.bold
      .bgHex(currentTheme.colors.searchMatch)
      .hex("#0a0a0a"),
    currentMatchColor: chalk.bold
      .bgHex(currentTheme.colors.searchCurrentMatch)
      .hex("#0a0a0a"),
    gitAddedColor: chalk.hex(currentTheme.colors.gitAdded),
    gitModifiedColor: chalk.hex(currentTheme.colors.gitModified),
    gitDeletedColor: chalk.hex(currentTheme.colors.gitDeleted),
    gitMovedColor: chalk.hex(currentTheme.colors.gitMoved),
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
          const newContent = fs.readFileSync(activeFilePath, "utf8");
          const document = await buildDocument(
            newContent,
            activeFilePath,
            markdownTheme,
            defaultTextStyle,
            getMermaidMaxWidth(),
          );
          activePager.setContent(document.component, document.tocEntries);
          activePager.setGitStatusResolver(document.gitStatusForSpan);
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

  tui.onTerminalColorSchemeChange((scheme) => {
    void handleColorSchemeChange(scheme);
  });

  // --- Pager creation helper ---
  // fromBrowser: true  -> q goes back to browser
  // fromBrowser: false -> q quits the process
  function buildPager(
    document: Document,
    pagerFilePath: string | null,
    pagerFilename: string,
    fromBrowser: boolean,
  ): { pager: Pager; statusBar: StatusBar } {
    let pager: Pager;

    pager = new Pager({
      content: document.component,
      viewport,
      onExit: () => {
        activeFileWatcher?.stop();
        activeFileWatcher = null;

        if (fromBrowser && browser) {
          // Return to directory browser
          viewport.setFallbackViewportHeight(terminal.rows);
          mainSwitcher.setActive(browser);
          statusSwitcher.setActive(emptyStatus);
          viewport.reset();
          tui.requestRender(true);
        } else {
          tui.stop({ preserveScreen: true });
          process.exit(0);
        }
      },
      onReload: () => {
        if (!pagerFilePath) return;
        void (async () => {
          try {
            const newContent = fs.readFileSync(pagerFilePath, "utf8");
            const nextDocument = await buildDocument(
              newContent,
              pagerFilePath,
              markdownTheme,
              defaultTextStyle,
              getMermaidMaxWidth(),
            );
            pager.setContent(nextDocument.component, nextDocument.tocEntries);
            pager.setGitStatusResolver(nextDocument.gitStatusForSpan);
            pager.setFileChanged(false);
            tui.requestRender(true);
          } catch {
            // File temporarily unavailable during save
          }
        })();
      },
      onEdit: (lineNumber) => {
        if (!pagerFilePath) return;
        tui.stop({ preserveScreen: true });
        openInEditor(pagerFilePath, lineNumber);
        void (async () => {
          try {
            const newContent = fs.readFileSync(pagerFilePath, "utf8");
            const nextDocument = await buildDocument(
              newContent,
              pagerFilePath,
              markdownTheme,
              defaultTextStyle,
              getMermaidMaxWidth(),
            );
            pager.setContent(nextDocument.component, nextDocument.tocEntries);
            pager.setGitStatusResolver(nextDocument.gitStatusForSpan);
          } catch {
            // Ignore read errors after edit
          }
          tui.start();
          tui.requestRender(true);
        })();
      },
      onSuspend: () => {
        tui.stop({ preserveScreen: true });
        process.kill(process.pid, "SIGTSTP");
      },
      showLineNumbers,
      gitStatusForSpan: document.gitStatusForSpan,
      wrapWidth: options.width,
      tocEntries: document.tocEntries,
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

      const document = await buildDocument(
        fileContent,
        entry.absolutePath,
        markdownTheme,
        defaultTextStyle,
        getMermaidMaxWidth(),
      );
      const { pager, statusBar } = buildPager(
        document,
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

      viewport.setFallbackViewportHeight(Math.max(1, terminal.rows - 1));
      mainSwitcher.setActive(pager);
      statusSwitcher.setActive(statusBar);
      viewport.reset();
      tui.requestRender(true);
    })();
  }

  // --- Initial mode setup ---

  if (mode === "browser") {
    viewport.setFallbackViewportHeight(terminal.rows);
    const entries = scanDirectory(baseDir, options.depth);
    browser = new Browser({
      entries,
      viewport,
      baseDir,
      onOpen: openFileFromBrowser,
      onQuit: () => {
        tui.stop({ preserveScreen: true });
        process.exit(0);
      },
      ...buildBrowserColors(),
    });

    mainSwitcher.setActive(browser);
    statusSwitcher.setActive(emptyStatus);
    viewport.reset();
  } else {
    viewport.setFallbackViewportHeight(Math.max(1, terminal.rows - 1));
    // viewer or stdin
    const document = await buildDocument(
      content,
      filePath,
      markdownTheme,
      defaultTextStyle,
      getMermaidMaxWidth(),
    );
    const { pager, statusBar } = buildPager(
      document,
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
    viewport.reset();
  }

  // Resume after Ctrl-Z suspend
  process.on("SIGCONT", () => {
    const active = mainSwitcher.getActive();
    if (active instanceof Pager) active.invalidate();
    tui.start();
    tui.requestRender(true);
  });

  process.stdout.on("resize", () => {
    const timer = setTimeout(() => tui.requestRender(true), 0);
    timer.unref();
  });

  // Start file watcher for initial viewer/stdin modes
  activeFileWatcher?.start();

  tui.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
