---
"preview-markdown": patch
---

Fix status bar crash when terminal width is narrow

- Truncate filename from beginning to prevent width overflow (keeps file name visible)
- Hide help text when not enough space
- Percentage is always displayed
- Remove leftover debug log
