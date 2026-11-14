# pmd (preview-markdown)

Terminal markdown pager and directory browser, written in TypeScript for Node.js (version pinned in `.node-version`) and shipped as single executables built with tsdown's `exe` option (Node.js SEA). Users run released binaries through Homebrew and Nix, so the CLI surface (commands, flags, exit codes, piped output) is a public interface.

## Commands

- `pnpm start <args>` runs pmd from source with tsx.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` must pass before committing. Lefthook runs the formatter and type check on commit.
- `pnpm schema` regenerates `schema.json` from the zod config schema in `src/config.ts`; a test fails when they drift.
- `pnpm build` compiles the binary for the current platform into `dist/`. CI builds each release binary on its own platform (`.github/workflows/build.yml`).

## Conventions

- The CLI follows the designing-clis contract: `-h`/`--help` everywhere, `help <command>`, `--version`, `completion <shell>`, exit code 1 for failures and 2 for usage errors, errors on stderr prefixed with `pmd:`. Commands, flags, and completion scripts are generated from `src/cli/spec.ts`; change the spec, not the generated output.
- Removing or renaming a flag or command needs a deprecation path first, like the `--completion` and `--init-config` aliases in `src/cli/spec.ts`.
- Keyboard shortcuts are defined once in `src/keybindings.ts` and feed both the in-app help overlay and `pmd help keys`.
- Lint suppressions (`biome-ignore`) are not used; fix the code instead.
- Versioning uses changesets. Read the `release` skill before cutting a release.

## Documentation

- When changing how a document is turned into rendered lines, or how the app is wired, read and update `docs/architecture.md`.
- When changing commands, flags, completion, or configuration, update the README.
