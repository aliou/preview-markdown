import * as fs from "node:fs";

const POLL_INTERVAL_MS = 300;

export function watchFile(file: string, onChange: () => void): () => void {
  const listener = (current: fs.Stats, previous: fs.Stats): void => {
    if (current.mtimeMs !== previous.mtimeMs) onChange();
  };
  fs.watchFile(file, { interval: POLL_INTERVAL_MS }, listener);
  return () => fs.unwatchFile(file, listener);
}
