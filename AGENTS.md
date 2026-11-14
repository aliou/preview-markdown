# pmd (preview-markdown)

Terminal markdown pager and directory browser, written in TypeScript for Bun and shipped as single binaries built with `bun build --compile`. Users run released binaries through Homebrew and Nix, so the CLI surface (commands, flags, exit codes, piped output) is a public interface.

## Commands

- `bun run src/index.ts <args>` runs pmd from source.
- `bun run lint`, `bun run typecheck`, and `bun test` must pass before committing. Lefthook runs the formatter and type check on commit.
- `bun run schema` regenerates `schema.json` from the zod config schema in `src/config.ts`; a test fails when they drift.
- `bun run build` compiles the release binaries into `dist/`.

## Conventions

- The CLI follows the designing-clis contract: `-h`/`--help` everywhere, `help <command>`, `--version`, `completion <shell>`, exit code 1 for failures and 2 for usage errors, errors on stderr prefixed with `pmd:`. Commands, flags, and completion scripts are generated from `src/cli/spec.ts`; change the spec, not the generated output.
- Removing or renaming a flag or command needs a deprecation path first, like the `--completion` and `--init-config` aliases in `src/cli/spec.ts`.
- Keyboard shortcuts are defined once in `src/keybindings.ts` and feed both the in-app help overlay and `pmd help keys`.
- Lint suppressions (`biome-ignore`) are not used; fix the code instead.
- Versioning uses changesets. Read the `release` skill before cutting a release.

## Documentation

- When changing how a document is turned into rendered lines, or how the app is wired, read and update `docs/architecture.md`.
- When changing commands, flags, completion, or configuration, update the README.
