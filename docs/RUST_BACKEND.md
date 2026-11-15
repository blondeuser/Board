# Rust backend (plan, 2026-11-15)

Board ships as a **desktop-only** app: the window (React UI, canvas, library grid, panels) stays web code in the Tauri
webview (WebView2 on Windows, WKWebView on macOS); everything behind it (storage, files, import, image analysis, search,
`.bo`) moves to Rust in `src-tauri/`. A **browser dev mode** (`npm run dev` at `localhost:5173`) stays for fast UI work;
it is never shipped.

Why: speed on big libraries (a LIT year is ~3,700 photos), native GPU inference, real files on disk instead of blobs in
IndexedDB, and an offline first run.

## Decisions (2026-11-15)

| Question | Answer |
|---|---|
| Browser build | **Not shipped, kept as a local dev mode** (amended 2026-11-15). `npm run dev` in Edge runs the UI on the current TS backend (IndexedDB + worker), frozen: bug fixes only, no new backend features, no parity promise. Users only get the desktop app |
| Model files | **Bundled in the installer** (Tauri resources). Works offline from the first launch; installer grows to ~230-250 MB |
| Crates approved | `rusqlite` (feature `bundled`), `image`, `fast_image_resize`, `sha2`, `rayon`, `zip`, `serde` / `serde_json`, `ort`, `tokenizers`. Anything else: ask first |
| UI framework | Stays React in the webview. A Rust UI (egui, Slint, Iced) would mean rewriting every screen; not planned |
| LIT import + link previews | Stay in TypeScript (tested parsers, network-bound, not CPU-bound). They hand finished image bytes to Rust's import |

## What runs where

| Part | Now (TS) | After (Rust) |
|---|---|---|
| Storage | IndexedDB, `src/storage/db.ts` | SQLite (`rusqlite`, WAL), schema in `docs/SQLITE_SCHEMA.md`; originals + thumbnails as files |
| Import | decode, thumbnail, palette, hash on the UI thread (`items/importImage.ts`) | file path or bytes in → `sha2` hash → dedupe → decode (`image`) → 1280px WebP thumb (`fast_image_resize`) → OKLab k-means palette → files + rows. Parallel over `rayon`. Image bytes never come back to JS |
| Display | `URL.createObjectURL` of IndexedDB blobs | `convertFileSrc(thumbPath)` through Tauri's asset protocol (scope = the library folder only) |
| Analysis | SigLIP in a Web Worker, WASM, one image at a time | `ort` (ONNX Runtime) with DirectML (Windows) / CoreML (macOS), CPU fallback. One background queue thread; results written to SQLite and sent to the UI in batches |
| Search | cosine over all embeddings in JS | embeddings kept in memory in Rust (`Vec<f32>`, loaded at start, updated on analysis); query text embedded with `tokenizers` + the text model; same floor/window rule |
| `.bo` | fflate in JS (`storage/bo/`) | `zip` crate, streaming straight from/to disk; same `formatVersion 1` layout (`docs/BO_FORMAT.md`) |
| Colour families, swatches | TS | `families.ts` / `familyShades` stay in TS for the UI; the palette itself is computed in Rust |

## Rust layout (`src-tauri/src/`)

```
lib.rs            builder: plugins, state, command registration, start-up (open DB, run migrations, load search index)
commands/         thin #[tauri::command] wrappers only: parse args, call core, map errors to strings
db/               connection, numbered migrations (001_init.sql ...), one module per table group (boards, assets, placements, ...)
files.rs          library paths (originals/<hash>.<ext>, thumbs/<hash>.webp), atomic writes (.tmp + rename)
import/           pipeline: hash, decode, thumb, palette (port of categorize/color), dedupe
analyze/          model session, preprocessing, tokenizer, queue thread, type/space scoring (port of labels + pickTypes)
search.rs         in-memory index + cosine + floor/window
bo/               read.rs / write.rs (port of storage/bo)
migrate_idb.rs    receives the old IndexedDB library from the webview (step 1)
```

Rules: `commands/` holds no logic; core modules don't know about Tauri (plain functions, testable with `cargo test`).
SQL only in `db/`. Paths only from `files.rs` (Tauri path API for the app-data root, never hard-coded separators).

## JS side

- `src/backend/api.ts`: the **only** file that calls `invoke()` or listens to backend events. Typed functions
  (`listBoards()`, `savePlacements()`, `importFiles(paths)`, `search(q)`, ...). Replaces `src/storage/db.ts`.
- `src/backend/browser/`: the **browser dev backend**, i.e. today's TS code (IndexedDB `db.ts`, `importImage.ts`, the
  SigLIP worker) moved behind the same interface. Chosen at start-up by `isDesktop()`; loaded with a dynamic `import()` so
  none of it (nor transformers.js) ends up in the desktop bundle. Frozen: it gets bug fixes, not new features. A feature
  that only exists in Rust shows a small "desktop only" note in the browser.
- `src/backend/fake.ts`: in-memory implementation for Vitest (no IndexedDB, no model).
- `useBoardApp.ts` must be split by domain first (step 0) so each piece can switch to `api.ts` on its own.
- Kept for browser dev mode only (moved under `src/backend/browser/`): IndexedDB storage, TS import, the SigLIP worker and
  `@huggingface/transformers`, the `/__lit` and `/__link` dev proxies. The desktop app uses none of them except the
  one-time IndexedDB reader for the migration.
- Drag and drop: turn on Tauri's `dragDropEnabled` to get real file paths; paste (Ctrl+V) still gives a Blob in JS, sent to
  Rust as a raw binary IPC body (not JSON/base64).

## IPC rules

- Never send image bytes to the UI; send paths (asset protocol) instead.
- Never send embeddings to the UI; search runs in Rust.
- Batch: placement saves, tag edits and analysis results go as lists, not one call per item. Analysis progress events at
  most every ~250 ms.
- Long work (import, analysis, `.bo` read/write) runs off the command thread and reports through events; commands return quickly.

## Model (step 3)

**Built 2026-11-15 (CPU).** Facts learnt: `ort` is 2.0.0-rc.15 (`Session::builder(&Environment)`, one environment per process, ONNX Runtime linked statically, `DirectML.dll` copied beside the exe but not bundled yet); `tokenizers` must be 0.22 (1.0.0-rc.4 is a different API); model files come from `scripts/fetch-model.mjs`; parity fixtures from `scripts/make-siglip-fixtures.mjs`; resize must be bilinear point sampling to match the browser pipeline. GPU (DirectML/CoreML), timings and removing the TS worker are still open.

- Bundle SigLIP base patch16-224 as ONNX (vision + text) + `tokenizer.json` in `src-tauri/resources/models/<id>/`,
  plus the ONNX Runtime (and DirectML) libraries. Load with `ort`; pick DirectML/CoreML, fall back to CPU.
- **Parity check before switching:** preprocessing must match the transformers.js processor (resize 224, rescale,
  normalise mean 0.5 / std 0.5). On the fixture photos, native and current embeddings must agree (cosine > 0.99) and
  `eval-search` precision must not drop. Precision choice (fp16/fp32 vs the current q8) is made by that measurement.
- Any change in model file or precision → new `EMBEDDING_MODEL` id, so stored embeddings are recomputed in the background.
- Lighting (later) gets the sigmoid path with SigLIP's `logit_scale` / `logit_bias` (see `CLAUDE.md`), now in Rust.

## Data migration (step 1, must not lose a library)

The installed 0.1.x keeps its library in IndexedDB inside WebView2's data folder (`%LOCALAPPDATA%\com.remstudio.remind\`).
The identifier never changes, so the new version sees the same IndexedDB.

1. On start, JS asks Rust for `meta.idb_migrated`. If not set and IndexedDB has data, show a progress dialog.
2. JS reads IndexedDB store by store; for each asset it sends the asset JSON + original bytes + thumb bytes to
   `migrate_put_asset` (Rust writes files and rows, computes a missing `hash`). Boards, placements, connections and
   categories go in batches.
3. Rust counts rows against the counts JS sent; only then sets `meta.idb_migrated`.
4. IndexedDB is **left in place** for at least one more version as a safety net; deleted in a later release.
5. Embeddings carry over when their `embeddingModel` matches; otherwise they are recomputed.

Test with a copy of a real library (export the WebView2 folder first) before any installer goes out.

## Steps

Each step ends with `cargo test`, `npm test`, `npm run typecheck`, `npm run tauri dev` by hand, and a version bump if an
installer is handed out (`0.2.0` for step 1: storage change).

0. **Prepare (TS only).** Split `useBoardApp.ts` by domain (boards + placements, assets + tags, search, analysis queue)
   behind a `Backend` interface; current IndexedDB code becomes one implementation. Update `docs/SQLITE_SCHEMA.md` to
   match `src/shared/types.ts` (shapes, connections, `spacesVersion`). Record baseline numbers (below).
1. **SQLite + file store + IndexedDB migration.** `db/`, `files.rs`, commands for boards/assets/placements/connections/
   categories, asset protocol for thumbnails, `api.ts` + `browser/` + `fake.ts`, migration flow. From here the browser
   is dev mode only.
2. **Import pipeline in Rust.** Drop/paste/LIT/`.bo` all end in one `import` entry point; parallel; duplicate check by hash.
3. **Analysis + search in Rust.** Bundled model, `ort`, parity check, queue, search index; remove the worker and transformers.js.
4. **`.bo` in Rust.** Port read/write; must open `.bo` files written by the TS version (keep one as a test fixture).
5. **Clean-up.** Delete the old IndexedDB library from desktop installs (after the safety-net release), tighten the
   desktop CSP (no more model hub / CDN / wasm). The browser dev backend stays.

Independent of the steps, any time: the canvas fixes found 2026-11-15 (drag/pan update React state on every pointer
move; each analysis result re-renders the whole app). These are UI-side and stay in TS.

## Measure (before step 1, again after steps 2 and 3)

| Metric | How |
|---|---|
| App start to first board drawn | stopwatch / `performance.now()` log, library of ~1,000 photos |
| Import 100 photos (12 MP JPEG) | time until all thumbnails are shown |
| Analysis time per image | average over 100 images, GPU and CPU |
| Search time | query to results, 1,000 and 5,000 images |
| Drag 12 selected photos | Edge DevTools / WebView2 DevTools Performance, frame time |

Write the numbers in `PROGRESS.md`; a step that doesn't improve its number is questioned before the next one.

## Risks

- **Installer size:** ~230-250 MB with the model. Fine for manual installs; the planned auto-updater would download the
  whole installer per update. Revisit (separate model download) when the updater is built.
- **ONNX Runtime packaging:** `ort` needs the ONNX Runtime + DirectML DLLs next to the exe (Windows) and the dylib in the
  app bundle (macOS). Check in the first step-3 build that the NSIS installer carries them.
- **Model parity:** a preprocessing mismatch silently worsens search; the parity check guards it.
- **Migration bugs** lose people's libraries: the count check + keeping IndexedDB guard it.
- **Dev mode drifts from the app:** the frozen browser backend will slowly differ from Rust (search ranking, analysis
  speed, new fields). Anything storage-, import- or model-related is checked in `npm run tauri dev` before it counts as
  done; the browser is for UI work. Playwright smoke scripts keep running against the browser mode.

## Which dev loop to use

| Work | Run | Reload |
|---|---|---|
| UI, canvas, styling, library layout | `npm run dev` → Edge at `localhost:5173` (DevTools, Playwright) | instant HMR |
| UI against the real backend | `npm run tauri dev` (same Vite server inside the app window; right-click → Inspect for DevTools) | instant HMR for TS; a Rust change rebuilds the backend (seconds, incremental) and restarts the window |
| Backend logic | `cargo test` in `src-tauri/` (core modules have no Tauri dependency) | seconds |
- **Compile verification:** Rust changes must be built on a machine with the toolchain (Windows PC or MacBook) after
  every step; a chat that can't run `cargo` can't check them.
