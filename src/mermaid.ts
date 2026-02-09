import { renderMermaidAscii } from "beautiful-mermaid";

/**
 * Match fenced mermaid code blocks (``` mermaid ... ```).
 * Handles optional whitespace after "mermaid" and before the closing fence.
 */
const MERMAID_BLOCK_RE = /^```mermaid\s*\n([\s\S]*?)^```\s*$/gm;

/**
 * Pre-process markdown content: replace mermaid fenced code blocks with
 * their ASCII-rendered output. On render failure, the original fenced block
 * is kept so it displays as a normal syntax-highlighted code block.
 */
export function preprocessMermaid(content: string): string {
  return content.replace(MERMAID_BLOCK_RE, (_match, diagram: string) => {
    try {
      const ascii = renderMermaidAscii(diagram.trimEnd());
      return ascii;
    } catch {
      // Unsupported diagram type or parse error - keep raw source.
      return _match;
    }
  });
}
