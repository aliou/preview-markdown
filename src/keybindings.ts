import {
  getKeybindings,
  type KeybindingDefinitions,
} from "@earendil-works/pi-tui";

declare module "@earendil-works/pi-tui" {
  interface Keybindings {
    "pmd.common.quit": true;
    "pmd.common.toggleHelp": true;
    "pmd.common.up": true;
    "pmd.common.down": true;
    "pmd.common.top": true;
    "pmd.common.bottom": true;
    "pmd.common.pageUp": true;
    "pmd.common.pageDown": true;
    "pmd.common.cancel": true;
    "pmd.common.confirm": true;
    "pmd.common.backspace": true;
    "pmd.browser.filter": true;
    "pmd.browser.open": true;
    "pmd.browser.cycleSort": true;
    "pmd.browser.reverseSort": true;
    "pmd.pager.search": true;
    "pmd.pager.nextMatch": true;
    "pmd.pager.prevMatch": true;
    "pmd.pager.edit": true;
    "pmd.pager.reload": true;
    "pmd.pager.suspend": true;
    "pmd.pager.halfPageUp": true;
    "pmd.pager.halfPageDown": true;
    "pmd.pager.toggleToc": true;
  }
}

export const PMD_KEYBINDINGS = {
  "pmd.common.quit": {
    defaultKeys: ["q", "shift+q", "escape", "ctrl+c"],
    description: "Quit current view",
  },
  "pmd.common.toggleHelp": {
    defaultKeys: "?",
    description: "Toggle help",
  },
  "pmd.common.up": {
    defaultKeys: ["up", "k"],
    description: "Move up",
  },
  "pmd.common.down": {
    defaultKeys: ["down", "j"],
    description: "Move down",
  },
  "pmd.common.top": {
    defaultKeys: ["home", "g"],
    description: "Go to top",
  },
  "pmd.common.bottom": {
    defaultKeys: ["end", "shift+g"],
    description: "Go to bottom",
  },
  "pmd.common.pageUp": {
    defaultKeys: ["pageUp", "b", "shift+b"],
    description: "Page up",
  },
  "pmd.common.pageDown": {
    defaultKeys: ["pageDown", "f", "shift+f", "space"],
    description: "Page down",
  },
  "pmd.common.cancel": {
    defaultKeys: ["escape", "ctrl+c"],
    description: "Cancel input",
  },
  "pmd.common.confirm": {
    defaultKeys: "enter",
    description: "Confirm input",
  },
  "pmd.common.backspace": {
    defaultKeys: "backspace",
    description: "Delete previous character",
  },
  "pmd.browser.filter": {
    defaultKeys: "/",
    description: "Filter files",
  },
  "pmd.browser.open": {
    defaultKeys: "enter",
    description: "Open selected file",
  },
  "pmd.browser.cycleSort": {
    defaultKeys: ["s", "shift+s"],
    description: "Cycle browser sort mode",
  },
  "pmd.browser.reverseSort": {
    defaultKeys: ["r", "shift+r"],
    description: "Reverse browser sort order",
  },
  "pmd.pager.search": {
    defaultKeys: "/",
    description: "Search in document",
  },
  "pmd.pager.nextMatch": {
    defaultKeys: "n",
    description: "Next search match",
  },
  "pmd.pager.prevMatch": {
    defaultKeys: "shift+n",
    description: "Previous search match",
  },
  "pmd.pager.edit": {
    defaultKeys: "e",
    description: "Edit in $EDITOR",
  },
  "pmd.pager.reload": {
    defaultKeys: ["r", "shift+r"],
    description: "Reload file",
  },
  "pmd.pager.suspend": {
    defaultKeys: "ctrl+z",
    description: "Suspend pmd",
  },
  "pmd.pager.halfPageUp": {
    defaultKeys: ["u", "shift+u"],
    description: "Half page up",
  },
  "pmd.pager.halfPageDown": {
    defaultKeys: ["d", "shift+d"],
    description: "Half page down",
  },
  "pmd.pager.toggleToc": {
    defaultKeys: "shift+t",
    description: "Toggle table of contents",
  },
} as const satisfies KeybindingDefinitions;

export function pmdMatches(
  data: string,
  keybinding: keyof typeof PMD_KEYBINDINGS,
): boolean {
  return getKeybindings().matches(data, keybinding);
}
