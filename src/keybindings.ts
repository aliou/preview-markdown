import {
  getKeybindings,
  type KeybindingDefinitions,
  KeybindingsManager,
  type KeyId,
  setKeybindings,
  TUI_KEYBINDINGS,
} from "@earendil-works/pi-tui";

declare module "@earendil-works/pi-tui" {
  interface Keybindings {
    "pmd.quit": true;
    "pmd.help": true;
    "pmd.up": true;
    "pmd.down": true;
    "pmd.halfPageUp": true;
    "pmd.halfPageDown": true;
    "pmd.pageUp": true;
    "pmd.pageDown": true;
    "pmd.top": true;
    "pmd.bottom": true;
    "pmd.browser.filter": true;
    "pmd.browser.open": true;
    "pmd.browser.cycleSort": true;
    "pmd.browser.reverseSort": true;
    "pmd.pager.search": true;
    "pmd.pager.nextMatch": true;
    "pmd.pager.previousMatch": true;
    "pmd.pager.toc": true;
    "pmd.pager.edit": true;
    "pmd.pager.reload": true;
    "pmd.pager.suspend": true;
  }
}

export type PmdKeybinding = keyof typeof PMD_KEYBINDINGS;

export interface HelpBinding {
  keys: readonly KeyId[];
  description: string;
}

export interface HelpSection {
  title: string;
  bindings: readonly HelpBinding[];
}

export const PMD_KEYBINDINGS = {
  "pmd.quit": {
    defaultKeys: ["q", "shift+q", "escape", "ctrl+c"],
    description: "Quit, or go back to the browser",
  },
  "pmd.help": { defaultKeys: "?", description: "Show keyboard shortcuts" },
  "pmd.up": { defaultKeys: ["k", "up"], description: "Move up" },
  "pmd.down": { defaultKeys: ["j", "down"], description: "Move down" },
  "pmd.halfPageUp": {
    defaultKeys: ["u", "shift+u"],
    description: "Half page up",
  },
  "pmd.halfPageDown": {
    defaultKeys: ["d", "shift+d"],
    description: "Half page down",
  },
  "pmd.pageUp": {
    defaultKeys: ["b", "pageUp", "shift+b"],
    description: "Page up",
  },
  "pmd.pageDown": {
    defaultKeys: ["f", "space", "pageDown", "shift+f"],
    description: "Page down",
  },
  "pmd.top": { defaultKeys: ["g", "home"], description: "Go to top" },
  "pmd.bottom": {
    defaultKeys: ["shift+g", "end"],
    description: "Go to bottom",
  },
  "pmd.browser.filter": { defaultKeys: "/", description: "Filter files" },
  "pmd.browser.open": {
    defaultKeys: "enter",
    description: "Open selected file",
  },
  "pmd.browser.cycleSort": {
    defaultKeys: ["s", "shift+s"],
    description: "Sort by name, created, or updated",
  },
  "pmd.browser.reverseSort": {
    defaultKeys: ["r", "shift+r"],
    description: "Reverse sort order",
  },
  "pmd.pager.search": { defaultKeys: "/", description: "Search as you type" },
  "pmd.pager.nextMatch": { defaultKeys: "n", description: "Next match" },
  "pmd.pager.previousMatch": {
    defaultKeys: "shift+n",
    description: "Previous match",
  },
  "pmd.pager.toc": { defaultKeys: "shift+t", description: "Table of contents" },
  "pmd.pager.edit": {
    defaultKeys: "e",
    description: "Edit in $EDITOR at this line",
  },
  "pmd.pager.reload": {
    defaultKeys: ["r", "shift+r"],
    description: "Reload file",
  },
  "pmd.pager.suspend": { defaultKeys: "ctrl+z", description: "Suspend pmd" },
} as const satisfies KeybindingDefinitions;

const VIEWPORT_BINDINGS = Object.keys(TUI_KEYBINDINGS).filter((id) =>
  id.startsWith("tui.altScreen."),
);

export function installKeybindings(): void {
  setKeybindings(
    new KeybindingsManager(
      { ...TUI_KEYBINDINGS, ...PMD_KEYBINDINGS },
      {
        ...Object.fromEntries(VIEWPORT_BINDINGS.map((id) => [id, []])),
        "tui.select.up": ["up", "k"],
        "tui.select.down": ["down", "j"],
      },
    ),
  );
}

export function pmdMatches(data: string, keybinding: PmdKeybinding): boolean {
  return getKeybindings().matches(data, keybinding);
}

function binding(
  id: PmdKeybinding,
  description: string = PMD_KEYBINDINGS[id].description,
): HelpBinding {
  const keys: KeyId | readonly KeyId[] = PMD_KEYBINDINGS[id].defaultKeys;
  return { keys: typeof keys === "string" ? [keys] : keys, description };
}

export const PAGER_HELP: HelpSection = {
  title: "Pager",
  bindings: [
    binding("pmd.down", "Scroll down"),
    binding("pmd.up", "Scroll up"),
    binding("pmd.halfPageDown"),
    binding("pmd.halfPageUp"),
    binding("pmd.pageDown"),
    binding("pmd.pageUp"),
    binding("pmd.top"),
    binding("pmd.bottom"),
    binding("pmd.pager.search"),
    binding("pmd.pager.nextMatch"),
    binding("pmd.pager.previousMatch"),
    binding("pmd.pager.toc"),
    binding("pmd.pager.edit"),
    binding("pmd.pager.reload"),
    binding("pmd.pager.suspend"),
    binding("pmd.help"),
    binding("pmd.quit"),
  ],
};

export const BROWSER_HELP: HelpSection = {
  title: "Browser",
  bindings: [
    binding("pmd.down"),
    binding("pmd.up"),
    binding("pmd.pageDown"),
    binding("pmd.pageUp"),
    binding("pmd.top"),
    binding("pmd.bottom"),
    binding("pmd.browser.filter"),
    binding("pmd.browser.cycleSort"),
    binding("pmd.browser.reverseSort"),
    binding("pmd.browser.open"),
    binding("pmd.help"),
    binding("pmd.quit", "Quit"),
  ],
};

const KEY_NAMES: Record<string, string> = {
  up: "↑",
  down: "↓",
  pageUp: "PgUp",
  pageDown: "PgDn",
  home: "Home",
  end: "End",
  escape: "Esc",
  enter: "Enter",
  space: "Space",
};

function formatKey(key: KeyId): string {
  const parts = key.split("+");
  const base = parts.pop() ?? key;
  if (parts.length === 0) return KEY_NAMES[base] ?? base;
  if (parts.length === 1 && parts[0] === "shift" && base.length === 1)
    return base.toUpperCase();
  const modifiers = parts
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}+`)
    .join("");
  return `${modifiers}${KEY_NAMES[base] ?? base.toUpperCase()}`;
}

export function keyLabel(help: HelpBinding): string {
  const shown = help.keys.filter((key) => {
    const base = key.startsWith("shift+")
      ? key.slice("shift+".length)
      : undefined;
    return !(
      base &&
      base.length === 1 &&
      help.keys.some((candidate) => candidate === base)
    );
  });
  return shown.map(formatKey).join(" ");
}
