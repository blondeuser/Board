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

Read a `docs/` file only when the task touches it.

## Working rules

- **Start of a session:** read `PROGRESS.md` (current phase, next tasks) and `MEMORY.md`.
- **End of a session (or after each finished task):** update `PROGRESS.md` (tick tasks, dated log entry with commit hash, "Last updated"); record new rules/decisions in `MEMORY.md`.
- If code and `MEMORY.md` disagree, find out which is right before changing either.
- Run tests and typecheck before every commit; commit in small steps.
- Stack is scaffolded (2026-11-14). Confirm with me before adding heavy dependencies (canvas engine, ML runtime, Tauri).

## Environment

- Develops on Windows 11 and a MacBook; no OS-specific code outside `src-tauri/`. Paths via Tauri/`path` APIs, never hard-coded separators.
- Node.js: see `_global/learnings` (vault, outside this repo) for PATH gotchas.

## Commands

`npm run dev` (Vite, port 5173), `npm test`, `npm run typecheck`, `npm run build`. Browser smoke test: with dev server running, `node scripts/smoke.mjs` (Playwright-core + Edge; `SHOT=path` saves a screenshot). `npm run tauri dev` comes with the Tauri step.

## Stack (proposed)

- TypeScript, Vite, React.
- Canvas: custom DOM + CSS transform (`src/canvas/`); tldraw/Konva only if the 500-image perf check fails (see PROGRESS decisions).
- The image model (SigLIP, `src/categorize/style/model.ts`) runs in a Web Worker (`classify.worker.ts`) via `@huggingface/transformers`; it makes the type tags and the search embeddings. Model files (~210 MB) download from the Hugging Face hub on first use (images never leave the machine). After changing the model or search thresholds, run `node scripts/eval-search.mjs <photo folders>` (precision check on real photos) and `node scripts/smoke-search.mjs <folders>`; changing the model needs a new `EMBEDDING_MODEL` id so old embeddings are recomputed.
- State: one hook, `src/app/useBoardApp.ts`; storage currently IndexedDB (`src/storage/db.ts`), the only file that touches it. React StrictMode runs effects twice: keep updaters pure and guard one-time init.
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
  ui/           shared components: toolbar, panels, tooltips (icon-only tools)
  shared/       types, utils, constants (no imports from other src/ folders)
tests/          unit + visual tests
scripts/        dev scripts (kept in repo, not %TEMP%)
public/         static assets
```

Rules: `shared/` imports nothing from the app; `categorize/` is pure (image in, tags/palette/embedding out) and never touches the UI or DB; `storage/` is the only code that touches disk/DB. `.bo` read/write lives in `storage/bo/` and nowhere else.

- `src/app/useBoardApp.ts` is one large hook; before the Tauri/SQLite step, split it by domain (boards + placements, assets + tags, search, analysis queue) so each piece can move to the new storage on its own.
- Schema changes: every change to stored data gets a numbered migration (IndexedDB `VERSION` now, SQL migrations after Tauri). Never edit an old migration.

## Verification

Typecheck + unit tests for categorize/storage logic; for canvas changes, run the app and check pan/zoom/drag/undo by hand (Playwright screenshots once the canvas exists).
