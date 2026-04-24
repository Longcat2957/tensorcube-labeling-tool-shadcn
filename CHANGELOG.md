# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — First release candidate

Initial release candidate covering BB / OBB labeling, export pipeline, and workspace management.

### Added

- Workspace creation with 9-digit image renaming and empty label JSON pre-generation
- BB (axis-aligned) and OBB (oriented) labeling modes on Fabric.js canvas
- Parallel image copy + `sharp` dimension probe on workspace creation (concurrency=8)
- Workspace-level Undo / Redo (per-image stacks, preserved across navigation, cap 50)
- Multi-select (Shift-click), Copy / Paste (`Ctrl+C` / `Ctrl+V`), batch delete
- Autosave with 500 ms debounce, `Ctrl+S` to flush, Save indicator in Footer
- Export formats: YOLO, YOLO-OBB, COCO, DOTA — with resize, train/val/test split, out-of-bounds policy (clip / skip / none), and preflight summary
- Class bulk reassignment and orphan handling via `classOps`
- Three-mode workspace (Edit / Check / Preview) with Dashboard in Preview
- Minimap drag-pan, virtualized image list sidebar, label layer list with bidirectional canvas sync
- Label opacity slider + `H` toggle, dark mode toggle, recent workspaces menu
- Window size / position / maximized state persistence
- Keyboard shortcuts centralized in `keyboardManager` with Tooltip hints on every button
- Shift (square) / Alt (center-anchored) drag modifiers while creating boxes
- Vitest unit tests (41 cases) covering export utils, OBB polygon math, class ops, draw modifiers
- GitHub Actions CI (typecheck · lint · test) on Linux

### Fixed

- `assignSplits` previously lost items when min-guarantee inflated counts past total; rewritten to keep sum exactly equal to total and honor min-guarantee

### Infrastructure

- `tsconfig.web.json` `strict: true`
- Single source of truth for IPC types in `src/shared/types.ts`
- Prettier applied repository-wide; ESLint warnings brought to 0
- electron-builder configured to publish to GitHub Releases
- Release workflow (`.github/workflows/release.yml`) builds Linux / Windows / macOS on `v*` tag push

[Unreleased]: https://github.com/Longcat2957/tensorcube-labeling-tool-shadcn/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Longcat2957/tensorcube-labeling-tool-shadcn/releases/tag/v0.1.0
