import * as fs from "node:fs";

export interface FileWatcher {
  start(): void;
  stop(): void;
}

/**
 * Watch a file for changes and call the callback when it changes.
 * Uses Node.js fs.watch which works on most platforms.
 */
export function watchFile(filePath: string, onChange: () => void): FileWatcher {
  let watcher: fs.FSWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleChange = (eventType: string) => {
    // Only handle 'change' events, not 'rename'
    if (eventType !== "change") {
      return;
    }

    // Debounce to avoid multiple rapid callbacks
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onChange();
    }, 100);
  };

  return {
    start() {
      if (watcher) {
        return;
      }
      try {
        watcher = fs.watch(filePath, handleChange);
      } catch {
        // File might not exist or not be watchable
      }
    },
    stop() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
  };
}
