import { createRequire } from "node:module";

type MermaidModule = {
  renderMermaid: (input: string) => string;
  renderMermaidAscii: (input: string) => string;
};

let upstream: MermaidModule | null = null;

try {
  const require = createRequire(import.meta.url);
  const pkgName = "beautiful-mermaid";
  upstream = require(pkgName) as MermaidModule;
} catch {
  upstream = null;
}

export const renderMermaid = (input: string): string => {
  if (upstream?.renderMermaid) {
    return upstream.renderMermaid(input);
  }
  return input;
};

export const renderMermaidAscii = (input: string): string => {
  if (upstream?.renderMermaidAscii) {
    return upstream.renderMermaidAscii(input);
  }

  return ["```mermaid", input, "```"].join("\n");
};
