---
name: pi-tui-patch
description: Regenerate the pi-tui patch for boxed code blocks when updating the @mariozechner/pi-tui dependency. Use when upgrading pi-tui or when the patch fails to apply.
---

# pi-tui Patch Regeneration

This project patches `@mariozechner/pi-tui` to render code blocks with box borders instead of backtick markers.

## When to Use

- Updating `@mariozechner/pi-tui` to a new version
- Patch fails to apply after `bun install`
- Modifying the boxed code block feature

## Current Patch Location

```
patches/@mariozechner%2Fpi-tui@<version>.patch
```

## What the Patch Does

Modifies `dist/components/markdown.js` to:

1. Add `BOX_CHARS` constant for box drawing characters
2. Add `renderCodeBlock()` method that renders code with borders:
   ```
   ╭─ javascript ──────────╮
   │ const x = 1;          │
   ╰───────────────────────╯
   ```
3. Replace backtick-style rendering in `renderToken()` case "code"
4. Replace backtick-style rendering in `renderListItem()` for code blocks in lists

## Regeneration Steps

### 1. Update the dependency

```bash
bun remove @mariozechner/pi-tui
bun add @mariozechner/pi-tui@<new-version>
```

### 2. Update package.json patchedDependencies

Change the version in `patchedDependencies`:

```json
"patchedDependencies": {
  "@mariozechner/pi-tui@<new-version>": "patches/@mariozechner%2Fpi-tui@<new-version>.patch"
}
```

### 3. Delete the old patch file

```bash
rm patches/@mariozechner%2Fpi-tui@<old-version>.patch
```

### 4. Apply modifications to node_modules

Edit `node_modules/@mariozechner/pi-tui/dist/components/markdown.js`:

**Add after the imports:**

```javascript
// Box drawing characters for code blocks
const BOX_CHARS = {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
};
```

**Add the `renderCodeBlock` method after `getDefaultStylePrefix()`:**

```javascript
/**
 * Render a code block with a box border and language label.
 */
renderCodeBlock(code, lang, availableWidth) {
    const lines = [];
    const borderStyle = this.theme.codeBlockBorder;
    
    // Get highlighted or plain code lines
    let codeLines;
    if (this.theme.highlightCode) {
        codeLines = this.theme.highlightCode(code, lang);
    } else {
        codeLines = code.split("\n").map(line => this.theme.codeBlock(line));
    }
    
    // Calculate the maximum line width (visible characters only)
    let maxLineWidth = 0;
    for (const line of codeLines) {
        const lineWidth = visibleWidth(line);
        if (lineWidth > maxLineWidth) {
            maxLineWidth = lineWidth;
        }
    }
    
    // Box inner width: max of (longest line + padding, lang label + padding)
    const langLabel = lang || "";
    const minWidthForLabel = langLabel.length + 4;
    const innerWidth = Math.max(maxLineWidth + 2, minWidthForLabel);
    
    // Build top border with language label
    let topBorder;
    if (langLabel) {
        const labelPart = `${BOX_CHARS.horizontal} ${langLabel} `;
        const remainingWidth = innerWidth - labelPart.length;
        topBorder = BOX_CHARS.topLeft + labelPart + BOX_CHARS.horizontal.repeat(Math.max(0, remainingWidth)) + BOX_CHARS.topRight;
    } else {
        topBorder = BOX_CHARS.topLeft + BOX_CHARS.horizontal.repeat(innerWidth) + BOX_CHARS.topRight;
    }
    lines.push(borderStyle(topBorder));
    
    // Render each code line with side borders
    for (const codeLine of codeLines) {
        const lineWidth = visibleWidth(codeLine);
        const padding = " ".repeat(Math.max(0, innerWidth - lineWidth - 1));
        const line = borderStyle(BOX_CHARS.vertical) + " " + codeLine + padding + borderStyle(BOX_CHARS.vertical);
        lines.push(line);
    }
    
    // Build bottom border
    const bottomBorder = BOX_CHARS.bottomLeft + BOX_CHARS.horizontal.repeat(innerWidth) + BOX_CHARS.bottomRight;
    lines.push(borderStyle(bottomBorder));
    
    return lines;
}
```

**Replace the "code" case in `renderToken()`:**

Find:
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

**Replace code block handling in `renderListItem()`:**

Find the `else if (token.type === "code")` block and replace with:
```javascript
else if (token.type === "code") {
    // Code block in list item - use boxed rendering
    const codeBlockLines = this.renderCodeBlock(token.text, token.lang, 80);
    lines.push(...codeBlockLines);
}
```

### 5. Generate the new patch

```bash
bun patch --commit @mariozechner/pi-tui
```

### 6. Verify

```bash
bun run typecheck
bun run src/index.ts README.md
```

## Reference

The full patched `markdown.js` can be found by applying the current patch and examining the result:

```bash
cat node_modules/@mariozechner/pi-tui/dist/components/markdown.js
```
