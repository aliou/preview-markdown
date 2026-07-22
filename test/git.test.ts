import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";
import { createGitStatusResolver } from "../src/git.js";
import { Pager } from "../src/pager.js";
import { createPreparedMarkdown } from "../src/source-map.js";

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

    const resolver = createGitStatusResolver(
      filePath,
      current,
      createPreparedMarkdown(current),
    );

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
    const resolver = createGitStatusResolver(
      filePath,
      content,
      createPreparedMarkdown(content),
    );

    expect(statusAt(resolver, 1)).toBe("added");
    expect(statusAt(resolver, 2)).toBe("added");
  });
});

describe("Markdown source maps", () => {
  test("keeps rendered lines and source spans aligned", () => {
    const identity = (text: string) => text;
    const theme: MarkdownTheme = {
      heading: identity,
      link: identity,
      linkUrl: identity,
      code: identity,
      codeBlock: identity,
      codeBlockBorder: identity,
      quote: identity,
      quoteBorder: identity,
      hr: identity,
      listBullet: identity,
      bold: identity,
      italic: identity,
      strikethrough: identity,
      underline: identity,
    };
    const markdown = new Markdown(
      "# Heading\n\nA paragraph that will wrap when the viewport is narrow enough.\n",
      0,
      0,
      theme,
    );

    const result = markdown.renderWithSourceMap(20);

    expect(result.lines).toEqual(markdown.render(20));
    expect(result.sourceSpans).toHaveLength(result.lines.length);
    expect(result.sourceSpans.some((span) => span?.startLine === 1)).toBe(true);
    expect(result.sourceSpans.some((span) => span?.startLine === 3)).toBe(true);
  });
});

describe("Git gutter", () => {
  test("reserves one column and paints only the gutter cell", () => {
    let receivedWidth = 0;
    const content = {
      invalidate() {},
      render(width: number) {
        receivedWidth = width;
        return ["content"];
      },
      renderWithSourceMap(width: number) {
        receivedWidth = width;
        return {
          lines: ["content"],
          sourceSpans: [{ startLine: 1, endLine: 1 }],
        };
      },
    };
    const pager = new Pager({
      content,
      onExit() {},
      gitStatusForSpan: () => "added",
      bgColor: (text) => text,
      gitAddedColor: (text) => `[green:${text}]`,
    });
    pager.setViewportHeight(1);

    expect(pager.render(10)[0]).toStartWith("[green:▎]content");
    expect(receivedWidth).toBe(9);
  });

  test("does not reserve a column without Git data", () => {
    let receivedWidth = 0;
    const content = {
      invalidate() {},
      render(width: number) {
        receivedWidth = width;
        return ["content"];
      },
    };
    const pager = new Pager({
      content,
      onExit() {},
      bgColor: (text) => text,
    });
    pager.setViewportHeight(1);

    pager.render(10);
    expect(receivedWidth).toBe(10);
  });
});
