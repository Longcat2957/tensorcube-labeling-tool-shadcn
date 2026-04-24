# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Standalone cross-platform data labeling tool (Electron + Svelte 5 + TypeScript) for training-data annotation. Supports two labeling modes:

- **BB** (`labeling_type: 1`): axis-aligned bounding boxes, stored as `[xmin, ymin, xmax, ymax]`.
- **OBB** (`labeling_type: 2`): oriented bounding boxes, stored as `[cx, cy, w, h, angle]`.

All label coordinates are absolute pixel values (not normalized). Normalization and format conversion happen only at **Export** time.

Package manager is **pnpm**. Language is primarily Korean in UI strings, docstrings, and console logs — preserve the existing language when editing.

## Common commands

```bash
pnpm install           # install deps (runs electron-builder install-app-deps postinstall)
pnpm dev               # run app with HMR (electron-vite dev)
pnpm start             # preview a production build
pnpm typecheck         # typecheck:node + svelte-check — always run before declaring work done
pnpm lint              # eslint with cache
pnpm format            # prettier (includes prettier-plugin-svelte)
pnpm build             # typecheck + electron-vite build
pnpm build:linux       # build:win / build:mac also available
```

There is no test runner configured.

## Architecture

This is an **electron-vite** app split into three processes. Each has its own tsconfig and build pipeline — cross-process code must go through the IPC bridge, not direct imports.

```
src/
  main/           # Node/Electron main process
    index.ts            # BrowserWindow + registers 'workspace://' protocol for image loading
    ipc/                # ipcMain handlers: dialog, workspace, label
    services/           # Business logic: workspaceService, fileService, exportService/
    types/workspace.ts  # Main-process duplicate of shared types (keep in sync with src/shared/types.ts)
  preload/
    index.ts            # contextBridge exposes `window.api.{dialog,workspace,label,utils}`
    index.d.ts          # Renderer-visible API type surface
  shared/types.ts       # Type definitions shared across processes
  renderer/src/
    App.svelte          # Top-level: creates three managers and puts them in Context
    components/         # Layout components (Navigation, LeftSidebar, CanvasArea, RightSidebar, Footer, dialogs/)
    lib/
      stores/           # *.svelte.ts manager singletons (keyboardManager, workspaceManager, toolManager)
      canvas/           # Fabric.js canvas logic — see "Canvas" below
      components/ui/    # shadcn-svelte components (do not edit generated structure casually)
```

### IPC contract

The renderer never touches the filesystem directly. All workspace/label/export operations go via `window.api` (defined in `src/preload/index.ts`). Images are loaded via the custom `workspace://` protocol registered in `src/main/index.ts` — `window.api.utils.getWorkspaceImageUrl(absolutePath)` returns the `workspace://…` URL for use in `<img src>`.

When adding a new IPC channel: update `src/main/ipc/*Handler.ts`, expose it in `src/preload/index.ts`, add types to `src/preload/index.d.ts`, and (if data crosses the boundary) update `src/shared/types.ts`. `src/main/types/workspace.ts` currently duplicates some of these types — keep them aligned.

### Renderer state: Svelte 5 + Context API

Per `.clinerules/design.md`, state flows exclusively through the Context API:

- **Parent → descendant** state uses `setContext` in `App.svelte` + `getContext` in children. The three managers (`KEYBOARD_MANAGER_KEY`, `WORKSPACE_MANAGER_KEY`, `TOOL_MANAGER_KEY`) are registered here.
- **Sibling component → component** state uses `$props` / `$bindable`.

The manager files under `lib/stores/` are `.svelte.ts` — they use `$state` / `$derived` at module scope and export a `createXManager()` factory. The file extension enables Svelte compilation; don't rename to plain `.ts`.

**Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props`, `$bindable`). Do not introduce Svelte 4 patterns (`export let`, `$:`, stores-from-svelte/store). See `.clinerules/rune.md` for the full contract. When doing Svelte work, use the svelte MCP server for docs and autofixer.

### Canvas (Fabric.js)

`lib/canvas/` is decomposed so BB and OBB logic can share it:

- `core/canvasSetup.ts`, `core/imageLoader.ts` — Fabric init and image loading.
- `interaction/mouseHandlers.ts`, `interaction/zoomHandler.ts` — panning, zoom, drag-to-create.
- `labels/labelManager.ts`, `boxRenderer.ts`, `boxFactory.ts`, `boxUtils.ts`, `coordinates.ts` — box creation, rendering, and image-pixel ↔ canvas-coord transforms.
- `styles/boxStyles.ts` — class-color/stroke styling.

Labeling-type-specific behavior is switched on `workspaceConfig.labeling_type` (1=BB, 2=OBB). Keep the branching inside these modules; components should not encode type-specific canvas logic.

### Workspace on disk

A workspace is a directory with this layout (see `.clinerules/project.md`):

```
workspace_name/
  src/0000000001.jpg         # source images, always 9-digit zero-padded IDs
  label/0000000001_C.json    # _C = completed/reviewed
  label/0000000002_W.json    # _W = in-progress
  label/0000000003.json      # no suffix = untouched
  workspace.yaml             # metadata: labeling_type, classes, image_count, timestamps
```

The 9-digit filename rule is enforced on workspace creation (files are copied + renamed). Label files map 1:1 to source images by ID; workspace creation also pre-creates empty JSON files for every image.

### Export pipeline (`src/main/services/export/`)

`index.ts` orchestrates: read `workspace.yaml` → `collectExportItems()` (honoring `includeCompletedOnly`) → `shuffleArray()` + `assignSplits()` (train/val/test ratios) → dispatch to `formats/{yolo,yoloOBB,coco,dota}.ts`. Supports optional `resize` (uses `sharp`; label coords auto-rescale) and an `outOfBounds` policy (`clip | skip | none`) applied to annotations before format conversion. OBB → DOTA/YOLO-OBB conversion computes the 4 corner points from `[cx, cy, w, h, angle]` via trig.

## Keyboard shortcuts (design requirement)

The app is keyboard-first — every tool, mode switch, and navigation action has a shortcut exposed via `Tooltip`. Shortcut routing is centralized in `lib/stores/keyboardManager.svelte.ts` (`KEY_BINDINGS` → `KeyboardAction`); components subscribe to actions rather than binding to raw keys. When adding a feature that's reachable by button, also wire a shortcut through the keyboard manager.

Current bindings (partial): `A`/`D` prev/next image, `V` select, `B` box tool, `P` pan, `H` toggle labels, `C` center, `Ctrl+Z`/`Ctrl+Y` undo/redo, `Delete` delete selected, `Tab`/`Shift+Tab` cycle modes, `3`/`4` prev/next class, number keys select class.

## UI conventions

Per `.clinerules/design.md`, use **shadcn-svelte** components (in `lib/components/ui/`) over custom CSS. Layout is fixed: top Navigation, bottom Footer, middle = LeftSidebar (tools) + CanvasArea + RightSidebar (minimap, class selector, label layer list). Tailwind v4 via `@tailwindcss/vite`; class-merging uses `tailwind-merge` / `tailwind-variants` (see `$lib/utils.ts`).

## Path aliases

- `$lib` → `src/renderer/src/lib` (configured in both `electron.vite.config.ts` and `tsconfig.web.json`).
- Main/preload imports between files use **`.js` extensions on relative imports** (ESM output convention) — follow the existing pattern when adding new files there.
