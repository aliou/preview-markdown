import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  mapPreparedSpan,
  type PreparedMarkdown,
  type SourceSpan,
  sourceLineCount,
} from "./source-map.js";

export type GitLineStatus = "added" | "modified" | "deleted" | "moved";

export type GitStatusResolver = (
  span: SourceSpan | null,
) => GitLineStatus | null;

interface GitLineMap {
  statuses: Map<number, GitLineStatus>;
  deletionBoundaries: Set<number>;
}

interface DiffLine {
  line: number;
  text: string;
}

interface DiffHunk {
  oldStart: number;
  newStart: number;
  added: DiffLine[];
  removed: DiffLine[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function createGitStatusResolver(
  filePath: string,
  originalContent: string,
  document: PreparedMarkdown,
): GitStatusResolver | undefined {
  const lineMap = getGitLineMap(filePath, originalContent);
  if (!lineMap) return undefined;

  return (span) => {
    const originalSpan = mapPreparedSpan(document, span);
    if (!originalSpan) return null;

    let resolved: GitLineStatus | null = null;
    for (
      let line = originalSpan.startLine;
      line <= originalSpan.endLine;
      line++
    ) {
      if (lineMap.deletionBoundaries.has(line)) {
        return "deleted";
      }

      const status = lineMap.statuses.get(line);
      if (status && statusPriority(status) > statusPriority(resolved)) {
        resolved = status;
      }
    }

    return resolved;
  };
}

function getGitLineMap(
  filePath: string,
  originalContent: string,
): GitLineMap | undefined {
  let absolutePath: string;
  try {
    absolutePath = fs.realpathSync(filePath);
  } catch {
    absolutePath = path.resolve(filePath);
  }
  const fileDir = path.dirname(absolutePath);
  const rootResult = runGit(fileDir, ["rev-parse", "--show-toplevel"]);
  if (!rootResult || rootResult.status !== 0) return undefined;

  const root = rootResult.stdout.trim();
  if (!root) return undefined;

  const relativePath = path.relative(root, absolutePath);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }

  const lineCount = sourceLineCount(originalContent);
  const tracked = runGit(root, [
    "ls-files",
    "--error-unmatch",
    "--",
    relativePath,
  ]);
  if (!tracked || tracked.status !== 0) {
    const ignored = runGit(root, ["check-ignore", "-q", "--", relativePath]);
    if (ignored?.status === 0) return undefined;

    return createAllAddedMap(lineCount);
  }

  const head = runGit(root, ["rev-parse", "--verify", "HEAD"]);
  if (!head || head.status !== 0) {
    return createAllAddedMap(lineCount);
  }

  const diff = runGit(root, [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--find-renames",
    "--unified=0",
    "HEAD",
    "--",
    relativePath,
  ]);
  if (!diff || diff.status !== 0) return undefined;

  return parseGitDiff(diff.stdout, lineCount);
}

function createAllAddedMap(lineCount: number): GitLineMap {
  const statuses = new Map<number, GitLineStatus>();
  for (let line = 1; line <= lineCount; line++) {
    statuses.set(line, "added");
  }

  return { statuses, deletionBoundaries: new Set() };
}

function parseGitDiff(diff: string, lineCount: number): GitLineMap {
  const statuses = new Map<number, GitLineStatus>();
  const deletionBoundaries = new Set<number>();
  const added: DiffLine[] = [];
  const removed: DiffLine[] = [];
  let hunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  const finishHunk = () => {
    if (!hunk) return;

    const replacement = hunk.added.length > 0 && hunk.removed.length > 0;
    for (const line of hunk.added) {
      statuses.set(line.line, replacement ? "modified" : "added");
      added.push(line);
    }

    if (hunk.removed.length > 0 && hunk.added.length === 0) {
      deletionBoundaries.add(deletionBoundary(hunk.newStart, lineCount));
    }
    removed.push(...hunk.removed);
    hunk = null;
  };

  for (const line of diff.split("\n")) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      finishHunk();
      const oldStart = Number.parseInt(header[1] ?? "0", 10);
      const newStart = Number.parseInt(header[2] ?? "0", 10);
      hunk = { oldStart, newStart, added: [], removed: [] };
      oldLine = oldStart;
      newLine = newStart;
      continue;
    }

    if (!hunk || line.startsWith("\\ No newline at end of file")) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      hunk.added.push({ line: newLine, text: line.slice(1) });
      newLine++;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      hunk.removed.push({ line: oldLine, text: line.slice(1) });
      oldLine++;
      continue;
    }

    if (line.startsWith(" ")) {
      oldLine++;
      newLine++;
    }
  }
  finishHunk();

  markMovedDestinations(statuses, added, removed);
  return { statuses, deletionBoundaries };
}

function deletionBoundary(newStart: number, lineCount: number): number {
  if (lineCount === 0) return 1;
  return Math.max(1, Math.min(newStart + 1, lineCount));
}

function markMovedDestinations(
  statuses: Map<number, GitLineStatus>,
  added: DiffLine[],
  removed: DiffLine[],
): void {
  const removedByText = new Map<string, number>();
  for (const line of removed) {
    const text = normalizedMoveText(line.text);
    if (!isMeaningfulMove(text)) continue;
    removedByText.set(text, (removedByText.get(text) ?? 0) + 1);
  }

  for (const line of added) {
    if (statuses.get(line.line) === "modified") continue;

    const text = normalizedMoveText(line.text);
    const remaining = removedByText.get(text) ?? 0;
    if (!isMeaningfulMove(text) || remaining === 0) continue;

    statuses.set(line.line, "moved");
    removedByText.set(text, remaining - 1);
  }
}

function normalizedMoveText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isMeaningfulMove(text: string): boolean {
  return text.length >= 20;
}

function statusPriority(status: GitLineStatus | null): number {
  switch (status) {
    case "deleted":
      return 4;
    case "moved":
      return 3;
    case "modified":
      return 2;
    case "added":
      return 1;
    default:
      return 0;
  }
}

function runGit(
  cwd: string,
  args: string[],
): { status: number | null; stdout: string } | undefined {
  try {
    const result = spawnSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const stdout = result.stdout ?? "";
    return { status: result.status, stdout };
  } catch {
    return undefined;
  }
}
