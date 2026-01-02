import { spawnSync } from "node:child_process";

/**
 * Open a file in the user's preferred editor.
 * Uses $VISUAL, $EDITOR, or falls back to common editors.
 */
export function openInEditor(filePath: string, lineNumber: number): boolean {
  const editor = process.env.VISUAL || process.env.EDITOR || findEditor();

  if (!editor) {
    return false;
  }

  // Build command with line number support for common editors
  const args = buildEditorArgs(editor, filePath, lineNumber);

  try {
    const result = spawnSync(editor, args, {
      stdio: "inherit",
      shell: false,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function findEditor(): string | null {
  // Try common editors in order of preference
  const editors = ["vim", "nvim", "nano", "vi"];

  for (const editor of editors) {
    try {
      const result = spawnSync("which", [editor], { stdio: "pipe" });
      if (result.status === 0) {
        return editor;
      }
    } catch {}
  }

  return null;
}

function buildEditorArgs(
  editor: string,
  filePath: string,
  lineNumber: number,
): string[] {
  const editorName = editor.split("/").pop() || editor;

  // Handle different editors' line number syntax
  switch (editorName) {
    case "vim":
    case "nvim":
    case "vi":
      return [`+${lineNumber}`, filePath];

    case "nano":
      return [`+${lineNumber}`, filePath];

    case "emacs":
    case "emacsclient":
      return [`+${lineNumber}`, filePath];

    case "code":
    case "code-insiders":
      // VS Code uses -g file:line format and --wait to block
      return ["-g", `${filePath}:${lineNumber}`, "--wait"];

    case "subl":
    case "sublime":
      return [`${filePath}:${lineNumber}`];

    case "atom":
      return [`${filePath}:${lineNumber}`];

    case "hx":
    case "helix":
      return [`${filePath}:${lineNumber}`];

    default:
      // Default: just pass the file, no line number
      return [filePath];
  }
}
