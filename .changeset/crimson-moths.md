---
"preview-markdown": patch
---

Fix off-by-one in directory scan depth: `--depth 1` (default) now includes files in direct subdirectories, `--depth 0` means top-level only.
