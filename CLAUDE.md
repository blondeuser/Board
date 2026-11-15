# Board

A local-first moodboard app for Windows and macOS: an infinite freeform canvas (like Apple Freeform / PureRef) over a searchable image library (like mymind) that auto-categorizes everything by colour, style and subject. For my own design work first; images never leave the machine.

Global rules: [[CLAUDE]] (vault root, outside this repo; may not be visible when Claude Code runs inside the repo). This file adds project rules and wins on conflict.

Project docs, one job each:

| File | Holds | Update when |
|---|---|---|
| `CLAUDE.md` (this file) | Rules for working on the code: workflow, commands, stack, architecture, conventions, verification | A convention or the architecture changes |
| `MEMORY.md` | Business logic: what it does and how, domain rules, product decisions | A rule or product decision changes |
| `PROGRESS.md` | Status, roadmap, backlog / known issues, dated log | After every finished task |
| `docs/BO_FORMAT.md` | The `.bo` board file spec | The file format changes (bump `formatVersion`) |
| `docs/LIGHTING_TAXONOMY.md` | Lighting-technique label set, prompts, eval method | Labels, prompts or thresholds change |
| `docs/SQLITE_SCHEMA.md` | Planned SQLite schema for the Tauri step | Before / during the storage migration |
| `docs/RUST_BACKEND.md` | Rust backend plan: what moves to Rust, layout, IPC rules, migration, steps | The backend design or a step changes |
| `docs/PEN_INPUT.md` | Wacom / pen drawing on the canvas: input, ink data model, rendering, phases | Pen or ink behaviour, stroke format or phases change |

Read a `docs/` file only when the task touches it.

## Working rules

- **Start of a session:** read `PROGRESS.md` (current phase, next tasks) and `MEMORY.md`.
- **End of a session (or after each finished task):** update `PROGRESS.md` (tick tasks, dated log entry with commit hash, "Last updated"); record new rules/decisions in `MEMORY.md`.
- If code and `MEMORY.md` disagree, find out which is right before changing either.
- Run tests and typecheck before every commit; commit in small steps.
- Stack is scaffolded (2026-11-14). Confirm with me before adding heavy dependencies (canvas engine, ML runtime). Tauri 2 + its http/dialog/fs plugins approved 2026-11-15 for the Windows demo installer; the opener plugin (system-browser links) was added with it, so tell me before adding any other plugin. Rust crates approved 2026-11-15 for the Rust backend (`docs/RUST_BACKEND.md`): `rusqlite` (bundled), `image`, `fast_image_resize`, `sha2`, `rayon`, `zip`, `serde`/`serde_json`, `ort`, `tokenizers`; ask before any other crate.

## Environment

- Develops on Windows 11 and a MacBook; no OS-specific code outside `src-tauri/`. Paths via Tauri/`path` APIs, never hard-coded separators.
- Node.js: see `_global/learnings` (vault, outside this repo) for PATH gotchas.
- Desktop build (Tauri) on Windows also needs Rust (rustup, MSVC toolchain) and Visual Studio C++ Build Tools ("Desktop development with C++"); WebView2 ships with Windows 11. macOS needs Xcode Command Line Tools.

## Commands

`npm run dev` (Vite, port 5173; also serves the `/__lit` proxy the LIT import needs), `npm test`, `npm run typecheck`, `npm run build`. Browser smoke test: with dev server running, `node scripts/smoke.mjs` (Playwright-core + Edge; `SHOT=path` saves a screenshot). Desktop (`src-tauri/` exists; Windows needs `%USERPROFILE%\.cargo\bin` on PATH, a fresh terminal after installing Rust): `npm run tauri dev` (opens the app window on the Vite dev server) and `npm run tauri build` (installer in `src-tauri/target/release/bundle/msi/` and `nsis/` on Windows). For building, checking and installing the Windows installer or preparing a demo PC, follow the `board-windows-build` skill (Claude account skill; first real build done 2026-11-15, NSIS + MSI both built, no WiX/VBSCRIPT problem; runtime checks pending).

## Releases and updates (desktop)

- **Version:** bump it for every installer you hand out, in all three places together: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`. Patch (`0.1.1`) for fixes, minor (`0.2.0`) for features. The MSI refuses to install over the same version; the number also tells which build is on a PC.
- **Never change the identifier `com.remstudio.remind`** (`tauri.conf.json`). Windows and WebView2 key the install and the app data folder (`%LOCALAPPDATA%\com.remstudio.remind\`, holds the IndexedDB library) on it; a new identifier = a second app with an empty library.
- **Ship the NSIS `-setup.exe` only.** Running a newer one over an installed copy upgrades in place and keeps the library. Don't mix MSI and NSIS installs on one PC (two separate installs).
- **Stored data outlives the app:** every new version must open data written by older ones. Any change to stored data gets a numbered migration (see Architecture); never assume a fresh database.
- **Updates are manual for now:** send the new `-setup.exe`. Auto-update (Tauri updater plugin + GitHub Releases) is planned in `PROGRESS.md` §5. Its signing key must never be committed or lost: without it, installed copies can't update.

## Stack (proposed)

**Moving to a Rust backend (decided 2026-11-15, `docs/RUST_BACKEND.md`):** desktop only; storage, import, analysis, search and `.bo` move into `src-tauri/`, the UI stays React in the webview. Lines below describe the current TS code until each step lands; update them as it does.

- TypeScript, Vite, React.
- Canvas: custom DOM + CSS transform (`src/canvas/`); tldraw/Konva only if the 500-image perf check fails (see PROGRESS decisions).
- Pen / ink (planned, `docs/PEN_INPUT.md`): Pointer Events only (`pointerType`, `pressure`, `buttons`, coalesced events), no Wacom SDK. Pure stroke geometry in `src/canvas/ink/`; the stroke in progress draws on a screen-space `<canvas>` overlay (refs, no React state per sample), committed strokes are `Placement` kind `ink` rendered as SVG paths. Store raw points + pressure, never the outline. Outline library `perfect-freehand` is proposed, not approved yet.
- The image model (SigLIP, `src/categorize/style/model.ts`) runs in a Web Worker (`classify.worker.ts`) via `@huggingface/transformers`; it makes the type tags and the search embeddings. Model files (~210 MB) download from the Hugging Face hub on first use (images never leave the machine). After changing the model or search thresholds, run `node scripts/eval-search.mjs <photo folders>` (precision check on real photos) and `node scripts/smoke-search.mjs <folders>`; changing the model needs a new `EMBEDDING_MODEL` id so old embeddings are recomputed.
- State: one hook, `src/app/useBoardApp.ts` (plus `useLitImport.ts` for the LIT import, which uses its public functions only); storage currently IndexedDB (`src/storage/db.ts`), the only file that touches it. React StrictMode runs effects twice: keep updaters pure and guard one-time init.
- Desktop shell: Tauri 2 (small, same code on Windows + macOS); browser build stays runnable for fast iteration.
- Storage: SQLite (via Tauri SQL plugin) for metadata; originals + thumbnails as files on disk.
- Auto-categorize, all on-device: colour = k-means in OKLab; type/style/lighting/subject = SigLIP image embeddings via `transformers.js` / ONNX Runtime; search + grouping = vector similarity. Brute-force cosine over all embeddings in JS is fine up to ~20k images (768 floats each); add a vector index only if that gets slow.
- Zero-shot scoring: **single-choice** tag groups (Type) may use softmax over prompts; **multi-label** groups (Lighting) must use SigLIP's own sigmoid scoring (`logit_scale`, `logit_bias` from the model) so labels don't compete. Each label gets its own threshold, tuned on the eval set.
- Cloud: none. No server, no Vercel, no MongoDB, no cloud AI API in the current plan (see MEMORY decisions). An optional cloud feature must be opt-in, text-only by default, and isolated behind one module in `categorize/` so the provider can be swapped.
- Tests: Vitest; Playwright for canvas/visual checks.

## Architecture

```
src/
  app/          entry, routing, app shell, global state
  canvas/       infinite canvas: pan/zoom, selection, transforms, snapping, undo/redo
  items/        board item types (image, note, text, link, colour swatch) and their renderers
  library/      "all items" view: grid, search, filters, collections (mymind-style)
  categorize/
    color/      palette extraction, colour naming, colour-similarity search
    style/      embeddings, tag/style classification, clustering
  storage/      database, file store, import/export, migrations
  sources/      reference sites to import from (lit/ = LIT Awards winners): pure HTML parsers + a small fetch client; no UI, no DB
  ui/           shared components: toolbar, panels, tooltips (icon-only tools)
  shared/       types, utils, constants (no imports from other src/ folders)
tests/          unit + visual tests
scripts/        dev scripts (kept in repo, not %TEMP%)
public/         static assets
```

Desktop vs browser: code checks one helper (`isDesktop()`, Tauri present) and never sniffs the OS. In the desktop app, network calls in `sources/` use the Tauri HTTP plugin and file saves use the dialog + fs plugins (from `storage/`); the browser build keeps the dev proxies and browser downloads. Both builds must keep working: after step 1 of `docs/RUST_BACKEND.md` the browser build is a dev mode only (frozen TS backend in `src/backend/browser/`, chosen by `isDesktop()`, never in the desktop bundle); UI work may be done there, but storage/import/model work is checked in `npm run tauri dev`. Desktop capabilities (http scope blocks private/local addresses, dialog, fs write, opener) live in `src-tauri/capabilities/default.json`; the CSP is `null` for now (model hub, CDN, blob workers and wasm), tighten it before anything beyond a demo. Icons: `scripts/make-icon.mjs` draws `src-tauri/icon-source.png`, `npx tauri icon` makes the set.

Rules: `sources/` parsers are pure (HTML string in, data out, tested on saved pages in `tests/fixtures/`); their network calls go through one `get()` per source so the Tauri HTTP plugin can replace the dev-server proxy (`/__lit` in `vite.config.ts`, which forwards only the LIT hosts). `shared/` imports nothing from the app; `categorize/` is pure (image in, tags/palette/embedding out) and never touches the UI or DB; `storage/` is the only code that touches disk/DB. `.bo` read/write lives in `storage/bo/` and nowhere else.

- `src/app/useBoardApp.ts` is one large hook; before the Tauri/SQLite step, split it by domain (boards + placements, assets + tags, search, analysis queue) so each piece can move to the new storage on its own.
- Schema changes: every change to stored data gets a numbered migration (IndexedDB `VERSION` now, SQL migrations after Tauri). Never edit an old migration.

## Verification

Typecheck + unit tests for categorize/storage/sources logic (source parsers are tested on saved pages in `tests/fixtures/<site>/`; when a site's markup changes, re-save the pages first, then fix the parser); for canvas changes, run the app and check pan/zoom/drag/undo by hand (Playwright screenshots once the canvas exists).
