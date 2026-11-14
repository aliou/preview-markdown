import * as fs from "node:fs";
import * as path from "node:path";

const MD_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);

export interface Entry {
  absolutePath: string;
  relativePath: string;
  createdAt: Date;
  updatedAt: Date;
}

export function scanDirectory(baseDir: string, maxDepth: number): Entry[] {
  const entries: Entry[] = [];
  const visitedRealPaths = new Set<string>();

  function recurse(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let items: fs.Dirent[];
    try {
      const realDir = fs.realpathSync(dir);
      if (visitedRealPaths.has(realDir)) return;
      visitedRealPaths.add(realDir);
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      const fullPath = path.join(dir, item.name);
      const stat = fs.statSync(fullPath, { throwIfNoEntry: false });
      if (!stat) continue;
      if (stat.isDirectory()) {
        recurse(fullPath, depth + 1);
      } else if (
        stat.isFile() &&
        MD_EXTENSIONS.has(path.extname(item.name).toLowerCase())
      ) {
        entries.push({
          absolutePath: fullPath,
          relativePath: path.relative(baseDir, fullPath),
          createdAt: stat.birthtime,
          updatedAt: stat.mtime,
        });
      }
    }
  }

  recurse(baseDir, 0);
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
}
