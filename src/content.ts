import { MarkdownDocument } from "./document";
import { createGitStatusResolver, type GitStatusResolver } from "./git";
import { loadHighlighting } from "./highlighter";
import { preprocessMdxWithSourceMap } from "./mdx";
import { createPreparedMarkdown } from "./source-map";
import type { AppTheme } from "./theme";

export interface Content {
  document: MarkdownDocument;
  gitStatus: GitStatusResolver | undefined;
}

export async function loadContent(
  markdown: string,
  file: string | null,
  theme: AppTheme,
): Promise<Content> {
  const prepared = createPreparedMarkdown(markdown);
  const document = new MarkdownDocument(
    file?.endsWith(".mdx") ? preprocessMdxWithSourceMap(prepared) : prepared,
    theme.document,
  );
  await loadHighlighting(theme.textmate, document.codeLanguages);
  return {
    document,
    gitStatus: file ? createGitStatusResolver(file, markdown) : undefined,
  };
}
