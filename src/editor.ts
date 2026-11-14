import { spawnSync } from "node:child_process";
import * as path from "node:path";

function lineArguments(program: string, file: string, line: number): string[] {
  switch (path.basename(program)) {
    case "vi":
    case "vim":
    case "nvim":
    case "nano":
    case "emacs":
    case "emacsclient":
    case "kak":
    case "micro":
      return [`+${line}`, file];
    case "code":
    case "code-insiders":
    case "cursor":
      return ["--wait", "--goto", `${file}:${line}`];
    case "subl":
    case "hx":
    case "zed":
      return [`${file}:${line}`];
    default:
      return [file];
  }
}

export function openInEditor(file: string, line: number): string | null {
  const command = process.env.VISUAL || process.env.EDITOR || "vi";
  const [program = "vi", ...args] = command.trim().split(/\s+/);
  const result = spawnSync(
    program,
    [...args, ...lineArguments(program, file, line)],
    { stdio: "inherit" },
  );
  if (result.error)
    return `cannot run editor "${program}": ${result.error.message}; set $EDITOR`;
  return result.status === 0
    ? null
    : `editor "${program}" exited with status ${result.status}`;
}
