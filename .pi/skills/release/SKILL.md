---
name: release
description: Create a new release using changesets and CI automation. Use when ready to publish a new version.
---

# Release Process

This project uses [changesets](https://github.com/changesets/changesets) for versioning and automated CI for releases.

## Overview

1. Create a changeset describing the changes
2. Push to main
3. CI creates a Release PR
4. Merge the Release PR to trigger the release

## Step-by-Step

### 1. Create a changeset

```bash
nix-shell --run "bun run changeset"
```

This prompts for:
- **Version bump type**: patch (bug fixes), minor (new features), major (breaking changes)
- **Summary**: Description of changes for the CHANGELOG

A markdown file is created in `.changeset/` (e.g., `.changeset/funny-dogs-dance.md`).

### 2. Commit and push

```bash
git add .changeset/*.md
git commit -m "chore: add changeset for <feature>"
git push origin main
```

### 3. CI creates Release PR

The `version.yml` workflow:
- Detects changeset files in `.changeset/`
- Runs `bun run version` which:
  - Bumps version in `package.json`
  - Updates `CHANGELOG.md`
  - Deletes the changeset files
- Creates a PR (e.g., `release/v0.2.0`)

### 4. Merge the Release PR

When merged, CI:
- Builds binaries (`dist/pmd-darwin-arm64`, `dist/pmd-linux-arm64`)
- Computes and updates flake.nix hashes
- Creates git tag (e.g., `v0.2.0`)
- Creates GitHub release with binaries attached

## Version Bump Guidelines

| Type | When to use | Example |
|------|-------------|---------|
| **patch** | Bug fixes, minor tweaks | `0.1.0` -> `0.1.1` |
| **minor** | New features, non-breaking | `0.1.0` -> `0.2.0` |
| **major** | Breaking changes | `0.1.0` -> `1.0.0` |

## Manual Release (if needed)

To force a release for the current version without changesets:

1. Go to Actions > Version workflow
2. Click "Run workflow"
3. Check "Force create release for current version"

## Files Involved

- `.changeset/config.json` - Changeset configuration
- `.github/workflows/version.yml` - Release automation
- `scripts/version.ts` - Version script run by CI
- `CHANGELOG.md` - Auto-updated changelog

## Troubleshooting

### Release PR not created
- Ensure changeset files exist in `.changeset/` (not just README.md)
- Check the "Version" workflow run in GitHub Actions

### Tag already exists
- CI skips if tag exists (unless force_release is used)
- Bump version again with a new changeset

### Build fails
- Check that `bun run build` works locally
- Verify nix is available in CI (uses `cachix/install-nix-action`)
