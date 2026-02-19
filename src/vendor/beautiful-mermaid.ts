import {
  renderMermaid as upstreamRenderMermaid,
  renderMermaidAscii as upstreamRenderMermaidAscii,
} from "beautiful-mermaid";

// Local vendored surface. Keep app imports pointed here so we can fully
// vendor/replace implementation later without touching call sites.
export const renderMermaid = upstreamRenderMermaid;
export const renderMermaidAscii = upstreamRenderMermaidAscii;
