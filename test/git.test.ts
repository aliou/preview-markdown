import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createGitStatusResolver } from "../src/git";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createRepository(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pmd-git-test-"));
  temporaryDirectories.push(directory);
  runGit(directory, ["init", "-q"]);
  runGit(directory, ["config", "user.email", "test@example.com"]);
  runGit(directory, ["config", "user.name", "Test User"]);
  return directory;
}

function runGit(directory: string, args: string[]): void {
  const result = spawnSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
}

function statusAt(
  resolver: ReturnType<typeof createGitStatusResolver>,
  line: number,
) {
  return resolver?.({ startLine: line, endLine: line }) ?? null;
}

describe("Git gutter status resolver", () => {
  test("classifies additions, modifications, deletion boundaries, and moves", () => {
    const directory = createRepository();
    const filePath = path.join(directory, "example.md");
    fs.writeFileSync(
      filePath,
      [
        "first",
        "deleted line",
        "keep one",
        "changed old",
        "keep two",
        "this is a sufficiently long line that will move elsewhere",
        "last",
        "",
      ].join("\n"),
    );
    runGit(directory, ["add", "example.md"]);
    runGit(directory, ["commit", "-qm", "initial"]);

    const current = [
      "first",
      "keep one",
      "changed new",
      "keep two",
      "last",
      "this is a sufficiently long line that will move elsewhere",
      "added line",
      "",
    ].join("\n");
    fs.writeFileSync(filePath, current);

    const resolver = createGitStatusResolver(filePath, current);

    expect(statusAt(resolver, 2)).toBe("deleted");
    expect(statusAt(resolver, 3)).toBe("modified");
    expect(statusAt(resolver, 6)).toBe("moved");
    expect(statusAt(resolver, 7)).toBe("added");
  });

  test("marks an untracked file as added", () => {
    const directory = createRepository();
    fs.writeFileSync(path.join(directory, "tracked.md"), "tracked\n");
    runGit(directory, ["add", "tracked.md"]);
    runGit(directory, ["commit", "-qm", "initial"]);

    const filePath = path.join(directory, "new.md");
    const content = "first\nsecond\n";
    fs.writeFileSync(filePath, content);
    const resolver = createGitStatusResolver(filePath, content);

    expect(statusAt(resolver, 1)).toBe("added");
    expect(statusAt(resolver, 2)).toBe("added");
  });
});
