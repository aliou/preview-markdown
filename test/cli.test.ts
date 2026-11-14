import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import packageJson from "../package.json";
import { configSchemaJson } from "../src/config";

const ENTRY = path.join(import.meta.dir, "..", "src", "index.ts");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function tempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pmd-cli-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function pmd(
  args: string[],
  options: { cwd?: string; input?: string; env?: Record<string, string> } = {},
): Run {
  const cwd = options.cwd ?? tempDirectory();
  const result = spawnSync(process.execPath, ["run", ENTRY, ...args], {
    cwd,
    input: options.input ?? "",
    encoding: "utf8",
    env: {
      ...process.env,
      XDG_CONFIG_HOME: path.join(cwd, "config"),
      NO_COLOR: "1",
      ...options.env,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function hasShell(shell: string): boolean {
  return spawnSync(shell, ["-c", "true"]).status === 0;
}

describe("help and version", () => {
  test("help flag wins in any position and shows the command's help", () => {
    const root = pmd(["README.md", "--width", "nope", "-h"]);
    expect(root.status).toBe(0);
    expect(root.stdout).toStartWith(
      "Render markdown in the terminal.\n\nExamples:",
    );
    expect(root.stdout).toContain(
      "completion  Print a shell completion script",
    );

    for (const args of [
      ["config", "--help"],
      ["--help", "config"],
      ["help", "config"],
    ]) {
      const run = pmd(args);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("pmd config <init | path>");
    }
  });

  test("help keys lists the keyboard shortcuts", () => {
    const run = pmd(["help", "keys"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Table of contents");
    expect(run.stdout).toContain("Sort by name, created, or updated");
  });

  test("--version prints the package version", () => {
    for (const flag of ["--version", "-v"]) {
      const run = pmd([flag]);
      expect(run.status).toBe(0);
      expect(run.stdout).toBe(`pmd ${packageJson.version}\n`);
    }
  });
});

describe("errors", () => {
  test.each([
    [
      ["--wdith", "60"],
      'pmd: unknown flag "--wdith" (did you mean "--width"?)',
    ],
    [["confg"], 'pmd: unknown command "confg" (did you mean "config"?)'],
    [
      ["--width", "abc"],
      'pmd: --width expects a whole number of at least 0, got "abc"',
    ],
    [
      ["--depth", "0"],
      'pmd: --depth expects a whole number of at least 1, got "0"',
    ],
    [
      ["completion", "zhs"],
      'pmd: unknown shell "zhs" (did you mean "zsh"?); use bash, zsh, fish',
    ],
    [["completion"], "pmd: completion needs a shell: bash, zsh, fish"],
    [
      ["config", "path", "--force"],
      'pmd: --force only applies to "pmd config init"',
    ],
    [["a.md", "b.md"], "pmd: expected one file or directory, got 2"],
    [["--light", "--dark"], "pmd: --light and --dark cannot be combined"],
  ])("%j is a usage error", (args, message) => {
    const run = pmd(args);
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr.split("\n")[0]).toBe(message);
    expect(run.stderr).toContain("for usage.");
  });

  test("a missing file fails with exit 1 and suggests a nearby markdown file", () => {
    const cwd = tempDirectory();
    fs.writeFileSync(path.join(cwd, "README.md"), "# Hi\n");
    const run = pmd(["READMEE.md"], { cwd });
    expect(run.status).toBe(1);
    expect(run.stderr).toBe(
      'pmd: no such file or directory: READMEE.md (did you mean "README.md"?)\n',
    );
  });

  test("an invalid config file fails with the field that is wrong", () => {
    const cwd = tempDirectory();
    fs.writeFileSync(
      path.join(cwd, ".pmd.json"),
      JSON.stringify({ showLineNumbers: "yes" }),
    );
    fs.writeFileSync(path.join(cwd, "doc.md"), "# Hi\n");
    const run = pmd(["doc.md"], { cwd });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      `pmd: invalid config ${path.join(cwd, ".pmd.json")}`,
    );
    expect(run.stderr).toContain("showLineNumbers");
  });

  test("an unknown theme warns on stderr and still renders", () => {
    const cwd = tempDirectory();
    fs.writeFileSync(
      path.join(cwd, ".pmd.json"),
      JSON.stringify({ theme: "nope" }),
    );
    fs.writeFileSync(path.join(cwd, "doc.md"), "# Hi\n");
    const run = pmd(["doc.md"], { cwd });
    expect(run.status).toBe(0);
    expect(run.stderr).toContain('pmd: theme "nope" not found');
    expect(run.stdout).toContain("Hi");
  });
});

describe("output when stdout is not a terminal", () => {
  test("prints a file as plain text without escape codes or code fences", () => {
    const cwd = tempDirectory();
    fs.writeFileSync(
      path.join(cwd, "doc.md"),
      "# Title\n\nSome **bold** text.\n\n```ts\nconst a = 1;\n```\n",
    );
    const run = pmd(["doc.md"], { cwd });
    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain("\x1b");
    expect(run.stdout).not.toContain("```");
    expect(run.stdout).not.toContain("▀");
    expect(run.stdout).toContain("  Title\n\n  Some bold text.");
    expect(run.stdout).toContain("    const a = 1;");
  });

  test("reads markdown from stdin, piped or with -", () => {
    for (const args of [[], ["-"]]) {
      const run = pmd(args, { input: "# From stdin\n" });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("From stdin");
    }
  });

  test("lists the markdown files of a directory, one per line", () => {
    const cwd = tempDirectory();
    fs.mkdirSync(path.join(cwd, "docs", "deep", "deeper"), { recursive: true });
    for (const file of [
      "docs/a.md",
      "docs/b.txt",
      "docs/deep/c.mdx",
      "docs/deep/deeper/d.md",
    ]) {
      fs.writeFileSync(path.join(cwd, file), "# x\n");
    }
    expect(pmd(["docs"], { cwd }).stdout).toBe("a.md\ndeep/c.mdx\n");
    expect(pmd(["docs", "--depth", "2"], { cwd }).stdout).toBe(
      "a.md\ndeep/c.mdx\ndeep/deeper/d.md\n",
    );
  });
});

describe("completion", () => {
  test.each([
    ["bash", ["-n"]],
    ["zsh", ["-n"]],
    ["fish", ["-n"]],
  ])("%s script parses and covers commands and flags", (shell, check) => {
    const run = pmd(["completion", shell]);
    expect(run.status).toBe(0);
    for (const word of [
      "completion",
      "config",
      "help",
      "line-numbers",
      "depth",
    ]) {
      expect(run.stdout).toContain(word);
    }
    if (!hasShell(shell)) return;
    const parse = spawnSync(shell, check, {
      input: run.stdout,
      encoding: "utf8",
    });
    expect(parse.stderr).toBe("");
    expect(parse.status).toBe(0);
  });

  test("bash completes subcommands, their arguments, and markdown files only", () => {
    if (!hasShell("bash")) return;
    const cwd = tempDirectory();
    fs.mkdirSync(path.join(cwd, "docs"));
    fs.writeFileSync(path.join(cwd, "notes.md"), "");
    fs.writeFileSync(path.join(cwd, "other.txt"), "");
    const script = pmd(["completion", "bash"]).stdout;
    const complete = (words: string[]): string => {
      const line = words.map((word) => `"${word}"`).join(" ");
      const program = `${script}\nCOMP_WORDS=(${line}); COMP_CWORD=${words.length - 1}; _pmd; printf '%s\\n' "\${COMPREPLY[@]}"`;
      return spawnSync("bash", ["-c", program], { cwd, encoding: "utf8" })
        .stdout;
    };
    expect(complete(["pmd", ""]).split("\n").sort()).toEqual([
      "",
      "completion",
      "config",
      "docs",
      "help",
      "notes.md",
    ]);
    expect(complete(["pmd", "config", ""])).toStartWith("init\npath\n");
    expect(complete(["pmd", "completion", "f"])).toBe("fish\n");
  });

  test("the deprecated --completion flag still works and warns", () => {
    const run = pmd(["--completion", "zsh"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toStartWith("#compdef pmd");
    expect(run.stderr).toBe(
      'pmd: --completion is deprecated, use "pmd completion zsh"\n',
    );
  });
});

describe("config", () => {
  test("init creates the default config once and --force overwrites it", () => {
    const cwd = tempDirectory();
    const file = path.join(cwd, "config", "pmd", "config.json");

    const created = pmd(["config", "init"], { cwd });
    expect(created.status).toBe(0);
    expect(created.stderr).toBe(`Created ${file}\n`);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({
      showLineNumbers: false,
      theme: { dark: "senzu-dark", light: "senzu-light" },
    });

    fs.writeFileSync(file, "{}");
    const again = pmd(["config", "init"], { cwd });
    expect(again.status).toBe(1);
    expect(again.stderr).toBe(
      `pmd: ${file} already exists; pass --force to overwrite it\n`,
    );
    expect(pmd(["config", "init", "--force"], { cwd }).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toContain("senzu-dark");
  });

  test("path prints the local config when present, the global one otherwise", () => {
    const cwd = tempDirectory();
    expect(pmd(["config", "path"], { cwd }).stdout).toBe(
      `${path.join(cwd, "config", "pmd", "config.json")}\n`,
    );
    fs.writeFileSync(path.join(cwd, ".pmd.json"), "{}");
    expect(pmd(["config", "path"], { cwd }).stdout).toBe(
      `${path.join(cwd, ".pmd.json")}\n`,
    );
  });

  test("schema.json matches the config schema", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(import.meta.dir, "..", "schema.json"), "utf8"),
    );
    expect(committed).toEqual(configSchemaJson());
  });
});
