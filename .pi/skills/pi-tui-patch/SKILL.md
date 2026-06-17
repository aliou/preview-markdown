---
name: pi-tui-patch
description: Regenerate the pi-tui patch that styles fenced code blocks as indented blocks with a tinted background. Use when upgrading pi-tui or when the patch fails to apply.
---

# pi-tui Patch Regeneration

This project patches `@earendil-works/pi-tui` so fenced code blocks are rendered as indented blocks with a tinted background, while still keeping syntax highlighting.

## When to Use

- Updating `@earendil-works/pi-tui` to a new version
- Patch fails to apply after `bun install`
- Modifying the code block rendering style

## Current Patch Location

```
patches/@earendil-works%2Fpi-tui@<version>.patch
```

## What the Patch Does

Modifies `dist/components/markdown.js` to:

1. Add a `renderCodeBlock()` method that wraps each code line with `theme.codeBlock`.
2. Adds a small left indent and pads each code-block line to the full content width so the tinted background extends edge-to-edge.
3. Adds a half-height tinted padding line above and below the code lines for visual separation, using `theme.codeBlockPaddingTop`/`codeBlockPaddingBottom` if available and falling back to a full background line otherwise.
4. Replaces the backtick-style rendering in `renderToken()` case "code" with a call to `renderCodeBlock()`.
5. Suppresses blank `space` tokens immediately before or after a code block so the half-height padding sits flush against surrounding text.

The resulting output looks like a block of text with a different background, e.g.:

```
  const x = 1;
  console.log(x);
```

## Regeneration Steps

### 1. Update the dependency

```bash
bun remove @earendil-works/pi-tui
bun add @earendil-works/pi-tui@<new-version>
```

### 2. Update package.json patchedDependencies

Change the version in `patchedDependencies`:

```json
"patchedDependencies": {
  "@earendil-works/pi-tui@<new-version>": "patches/@earendil-works%2Fpi-tui@<new-version>.patch"
}
```

### 3. Delete the old patch file

```bash
rm patches/@earendil-works%2Fpi-tui@<old-version>.patch
```

### 4. Apply modifications to node_modules

Edit `node_modules/@earendil-works/pi-tui/dist/components/markdown.js`.

**Add the `renderCodeBlock` method after `getDefaultInlineStyleContext()`:**

```javascript
/**
 * Render a code block as an indented block with a tinted background.
 */
renderCodeBlock(code, lang, availableWidth) {
    const lines = [];
    const codeBlockStyle = this.theme.codeBlock;
    const indent = "  ";
    const codeWidth = Math.max(1, availableWidth - indent.length);
    const width = Math.max(0, availableWidth);
    const fallbackPadding = codeBlockStyle(" ".repeat(width));
    const topPadding = this.theme.codeBlockPaddingTop
        ? this.theme.codeBlockPaddingTop("▀".repeat(width))
        : fallbackPadding;
    const bottomPadding = this.theme.codeBlockPaddingBottom
        ? this.theme.codeBlockPaddingBottom("▄".repeat(width))
        : fallbackPadding;

    // Get highlighted or plain code lines.
    let codeLines;
    if (this.theme.highlightCode) {
        codeLines = this.theme.highlightCode(code, lang);
    } else {
        codeLines = code.split("\n");
    }

    lines.push(topPadding);
    for (const codeLine of codeLines) {
        const wrappedLines = wrapTextWithAnsi(codeLine, codeWidth);
        for (const wrappedLine of wrappedLines) {
            const visibleLen = visibleWidth(wrappedLine);
            const padding = " ".repeat(Math.max(0, availableWidth - indent.length - visibleLen));
            const content = indent + wrappedLine + padding;
            lines.push(codeBlockStyle(content));
        }
    }
    lines.push(bottomPadding);

    return lines;
}
```

**Replace the "code" case in `renderToken()`:**

Find (approximately):

```javascript
case "code": {
    lines.push(this.theme.codeBlockBorder(`\`\`\`${token.lang || ""}`));
    // ... backtick rendering ...
    lines.push(this.theme.codeBlockBorder("```"));
```

Replace with:

```javascript
case "code": {
    const codeBlockLines = this.renderCodeBlock(token.text, token.lang, width);
    lines.push(...codeBlockLines);
```

**Track the previous token type in the main render loop and pass it to `renderToken()`:**

Find:

```javascript
const renderedLines = [];
for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    const tokenLines = this.renderToken(token, contentWidth, nextToken?.type);
    for (const tokenLine of tokenLines) {
        renderedLines.push(tokenLine);
    }
}
```

Replace with:

```javascript
const renderedLines = [];
let prevTokenType;
for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    const tokenLines = this.renderToken(token, contentWidth, nextToken?.type, undefined, prevTokenType);
    for (const tokenLine of tokenLines) {
        renderedLines.push(tokenLine);
    }
    prevTokenType = token.type;
}
```

Update the `renderToken()` signature:

```javascript
renderToken(token, width, nextTokenType, styleContext, prevTokenType) {
```

**Suppress blank lines around code blocks in the `"space"` case:**

Find:

```javascript
case "space":
    // Space tokens represent blank lines in markdown
    lines.push("");
    break;
```

Replace with:

```javascript
case "space":
    // Space tokens represent blank lines in markdown.
    // Skip spacing directly around code blocks; the block supplies its own padding.
    if (prevTokenType === "code" || nextTokenType === "code") {
        break;
    }
    lines.push("");
    break;
```

### 5. Generate the new patch

```bash
bun patch --commit @earendil-works/pi-tui
```

If bun includes an unrelated `.bun-tag-*` file in the generated patch, remove that diff from `patches/@earendil-works%2Fpi-tui@<new-version>.patch` so only the `markdown.js` hunk remains.

### 6. Verify

```bash
bun install
bun run typecheck
bun run src/index.ts README.md
```

## Reference

The full patched `markdown.js` can be found by applying the current patch:

```bash
cat node_modules/@earendil-works/pi-tui/dist/components/markdown.js
```
