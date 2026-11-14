import * as fs from "node:fs";
import * as tty from "node:tty";
import {
  type Component,
  ProcessTerminal,
  ScrollView,
  Spacer,
  TuiAltScreen,
  VStack,
} from "@earendil-works/pi-tui";
import { Browser } from "./browser";
import { type ColorScheme, detectColorScheme } from "./color-scheme";
import { loadContent } from "./content";
import type { Heading } from "./document";
import { openInEditor } from "./editor";
import { BROWSER_HELP, installKeybindings, PAGER_HELP } from "./keybindings";
import { showHelp, showTableOfContents } from "./overlays";
import { Pager } from "./pager";
import type { Entry } from "./scan";
import { StatusBar } from "./status-bar";
import type { AppTheme, UiStyles } from "./theme";
import { ViewportController } from "./viewport";
import { watchFile } from "./watcher";

export type Target =
  | { kind: "file"; path: string }
  | { kind: "stdin"; markdown: string }
  | { kind: "directory"; path: string; entries: Entry[] };

export interface AppOptions {
  lineNumbers: boolean;
  width: number;
  colorScheme: ColorScheme | null;
  themes: Record<ColorScheme, AppTheme>;
}

interface PagerSession {
  pager: Pager;
  title: string;
  file: string | null;
  markdown: string;
  headings: Heading[];
  stopWatching: () => void;
}

class Switcher implements Component {
  private active: Component = new Spacer(0);

  get capturesViewportInput(): boolean {
    return this.active.capturesViewportInput ?? false;
  }

  show(component: Component): void {
    this.active = component;
  }

  invalidate(): void {
    this.active.invalidate();
  }

  render(width: number): string[] {
    return this.active.render(width);
  }

  handleInput(data: string): void {
    this.active.handleInput?.(data);
  }
}

function useTerminalForInput(): void {
  if (process.stdin.isTTY) return;
  const input = new tty.ReadStream(fs.openSync("/dev/tty", "r"));
  Object.defineProperty(process, "stdin", { value: input, configurable: true });
}

export async function runApp(
  target: Target,
  options: AppOptions,
): Promise<void> {
  useTerminalForInput();
  installKeybindings();

  const terminal = new ProcessTerminal();
  const tui = new TuiAltScreen(terminal, undefined, undefined, { mouse: true });
  const main = new Switcher();
  const status = new Switcher();
  const scrollView = new ScrollView(main, {
    primary: true,
    follow: "none",
    overscroll: "contain",
    scrollbar: "auto",
  });
  const viewport = new ViewportController(scrollView);
  tui.setLayoutRoot(
    new VStack([
      { component: scrollView, basis: 0, grow: 1, minSize: 1 },
      { component: status, basis: "auto", shrink: 0, minSize: 0 },
    ]),
  );
  tui.setFocus(main);
  tui.start();

  let scheme: ColorScheme = options.colorScheme ?? "dark";
  if (!options.colorScheme) scheme = await detectColorScheme(tui);
  const theme = (): AppTheme => options.themes[scheme];
  const styles = (): UiStyles => theme().ui;
  let session: PagerSession | null = null;
  let browser: Browser | null = null;
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const showView = (component: Component, footer: Component): void => {
    const footerHeight = footer instanceof StatusBar ? 1 : 0;
    viewport.setFallbackViewportHeight(terminal.rows - footerHeight);
    main.show(component);
    status.show(footer);
    viewport.reset();
    tui.requestRender(true);
  };

  const quit = (): void => {
    session?.stopWatching();
    tui.stop({ preserveScreen: true });
    finish();
  };

  const reportError = (action: string) => (error: Error) => {
    tui.flash(`cannot ${action}: ${error.message}`);
    tui.requestRender();
  };

  const reload = async (current: PagerSession): Promise<void> => {
    const markdown = current.file
      ? fs.readFileSync(current.file, "utf8")
      : current.markdown;
    const content = await loadContent(markdown, current.file, theme());
    current.markdown = markdown;
    current.headings = content.document.headings;
    current.pager.setContent(content.document, content.gitStatus);
    tui.requestRender(true);
  };

  const reloadSession = (current: PagerSession): void => {
    reload(current).catch(reportError("reload"));
  };

  const closePager = (): void => {
    session?.stopWatching();
    session = null;
    if (!browser) {
      quit();
      return;
    }
    showView(browser, new Spacer(0));
  };

  const openPager = async (
    markdown: string,
    file: string | null,
    title: string,
  ): Promise<void> => {
    const content = await loadContent(markdown, file, theme());
    const pager: Pager = new Pager({
      content: content.document,
      gitStatus: content.gitStatus,
      viewport,
      styles,
      showLineNumbers: options.lineNumbers,
      wrapWidth: options.width,
      actions: {
        quit: closePager,
        help: () => showHelp(tui, PAGER_HELP, styles),
        tableOfContents: () =>
          showTableOfContents(tui, current.headings, styles, (heading) => {
            pager.scrollToSourceLine(heading.line);
            tui.requestRender();
          }),
        edit: (line) => {
          if (!current.file) {
            tui.flash("stdin has no file to edit");
            return;
          }
          tui.stop({ preserveScreen: true });
          const problem = openInEditor(current.file, line);
          tui.start();
          if (problem) tui.flash(problem);
          reloadSession(current);
        },
        reload: () => reloadSession(current),
        suspend: () => {
          tui.stop({ preserveScreen: true });
          process.kill(process.pid, "SIGTSTP");
        },
      },
    });
    const current: PagerSession = {
      pager,
      title,
      file,
      markdown,
      headings: content.document.headings,
      stopWatching: file
        ? watchFile(file, () => {
            pager.setFileChanged();
            tui.requestRender();
          })
        : () => undefined,
    };
    session = current;
    showView(pager, new StatusBar(title, pager, styles));
  };

  tui.onTerminalColorSchemeChange((next) => {
    if (options.colorScheme || next === scheme) return;
    scheme = next;
    if (session) reloadSession(session);
    tui.requestRender(true);
  });

  process.on("SIGCONT", () => {
    tui.start();
    tui.requestRender(true);
  });

  switch (target.kind) {
    case "file":
      await openPager(
        fs.readFileSync(target.path, "utf8"),
        target.path,
        target.path,
      );
      break;
    case "stdin":
      await openPager(target.markdown, null, "stdin");
      break;
    case "directory": {
      const files = new Browser({
        entries: target.entries,
        baseDir: target.path,
        viewport,
        styles,
        actions: {
          open: (entry) => {
            fs.promises
              .readFile(entry.absolutePath, "utf8")
              .then((markdown) =>
                openPager(markdown, entry.absolutePath, entry.relativePath),
              )
              .catch(reportError("open file"));
          },
          quit,
          help: () => showHelp(tui, BROWSER_HELP, styles),
        },
      });
      browser = files;
      showView(files, new Spacer(0));
      break;
    }
  }

  await finished;
}
