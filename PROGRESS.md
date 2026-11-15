# Board: Progress

Living status. **Update at the end of every work session.** Rules live in `CLAUDE.md`, business logic in `MEMORY.md`.

_Last updated: 2026-11-15 (v0.7.1: bug check + optimisations)_

## Status

|                   |                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Current phase** | Browser build done (canvas, Library, meaning-search, `.bo`, LIT import, two Concrete themes). **Windows demo installer builds** (Tauri 2, 2026-11-15) but is not yet tested on a PC; next: test it, then verify LIT on the Mac, lighting-technique eval, SQLite step |
| **App**           | Runs with `npm run dev` (port 5173). Boards, infinite canvas, notes, bento mode, Library (Category / Type / Colour / Award / All tabs, stacks, semantic search), colour + type + custom-category tags, `.bo` save/open, menu bar, collapsible sidebar, File > Import from LIT Awards (needs the dev server), Mocha/Latte theme |
| **Tests**         | 82 Vitest tests (colour, viewport, bento, type picking, grouping, search, `.bo`, LIT + link parsers, `isPublicHost`) pass; typecheck clean. Playwright smoke scripts in `scripts/` |
| **Hosting**       | GitHub `blondeuser/Board` (public). Latest code commit `2c5a6ff` |

## Resume here (next session)

**Built 2026-11-15: library location + cache + Settings** (`docs/STORAGE.md`, roadmap §3, phase 1). Edit → Settings… (Ctrl+,) → Storage: Change library (copy, verify, switch, restart), Delete old library, Change/Reset cache, Clear cache (rebuilds thumbnails), missing-library dialog. **Next: try it** with a real library (move C: → another drive, restart, check boards/search, unplug test, Clear cache), then decide on `windows-sys` + `libc` (drive type, free space), then version `0.6.0` and an installer.

**Planned 2026-11-15: Pinterest inside REMind** (`docs/PINTEREST.md`). **Built so far: the docked panel (step 5 done early, at my request)**: a toolbar Pinterest button and File > Pinterest Panel toggle a child webview inside the main window (resizable by dragging its left edge, × to close). **Next: step 0 spike** (drag a pin onto the board in `tauri dev`; the `[drop]` console log shows the payload; record it in `docs/PINTEREST.md` §9, Mac too), then steps 2-3 (URL drop → download → import). Ask before step 6 (bulk grab, remote capability).

**Rust backend progress (2026-11-15):** step 1 (SQLite + files + migration) and step 2 (import) are built and in 0.2.0; step 0 is only partly done (storage is behind `src/backend/`, `useBoardApp.ts` not split). Step 3 (bundled SigLIP, CPU) is in 0.3.0 too. **Next: install 0.3.0 over a real 0.1.x library and check the migration**, run `eval-search` against the Rust path, record timings (import, analysis/image, search), try DirectML, then step 4 (`.bo` in Rust).

**Decided 2026-11-15: Rust backend, desktop only.** Plan in `docs/RUST_BACKEND.md` (roadmap §8). Before the pen work or alongside it: step 0 (split `useBoardApp.ts` behind a `Backend` interface, update `docs/SQLITE_SCHEMA.md`, record baseline numbers), then step 1 (SQLite + files + IndexedDB migration, v0.2.0). Ship v0.1.1 first as planned below.

**Next stage (after the v0.1.1 build/test below): Wacom pen drawing in freeform mode.** Plan in `docs/PEN_INPUT.md`. Start with Phase 0 (spike: log pen pointer data on Windows with Windows Ink on/off, in Edge and the installed app, then on the MacBook in `npx tauri dev`), then Phase 1 undo/redo. Before coding Phase 2, answer the open questions in `docs/PEN_INPUT.md` §9 (pen mode vs always-draw, barrel button, approve `perfect-freehand`).

**Next build is v0.1.1** (version already bumped in `package.json`, `tauri.conf.json`, `Cargo.toml`): it carries the LIT import fix. `npm run tauri build`, then run `src-tauri/target/release/bundle/nsis/REMind_0.1.1_x64-setup.exe` over the installed 0.1.0 (upgrade in place; library should survive: check). Then test LIT import and paste-a-link. Use the NSIS installer only from now on.

**Installer built 2026-11-15** (`npx tauri build`, Rust 1.100 + VS 2022 Build Tools, ~2 min compile): `src-tauri/target/release/bundle/nsis/REMind_0.1.0_x64-setup.exe` (7.7 MB, per-user) and `msi/REMind_0.1.0_x64_en-US.msi` (8.9 MB); the built exe launches. **Not yet tested:** run it on a PC and check native Save dialog + fs write to the chosen path, LIT import, add-a-link (http scope), system-browser links, model download in WebView2, `confirm()`/`prompt()` in WebView2 (if dead, use dialog plugin `ask`/an in-app input), and the `http` capability URL patterns. `npx tauri dev` was not run. Icon is the "ReM:ind" wordmark on white (`scripts/make-icon.mjs` → `npx tauri icon src-tauri/icon-source.png`).

0. **Windows demo installer (Tauri 2), chosen 2026-11-15.** Goal: an `.msi` / `-setup.exe` I can install on a Windows PC without Node for the first demo. Steps:
   1. Prerequisites on the Windows PC: Rust (rustup, MSVC toolchain) + Visual Studio C++ Build Tools ("Desktop development with C++"). WebView2 is already on Windows 11.
   2. Add Tauri: `@tauri-apps/cli` (dev), `@tauri-apps/api`, `@tauri-apps/plugin-http`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`; `npm run tauri` script; `src-tauri/` (Cargo.toml, `tauri.conf.json` with devUrl `http://localhost:5173`, frontendDist `../dist`, identifier e.g. `com.remstudio.remind`, product name REMind; icons via `npx tauri icon <1024px png>`; capabilities for http/dialog/fs). Vite: `server.strictPort: true`, `clearScreen: false`.
   3. Network: in the desktop app, `get()` in `src/sources/lit/client.ts` and `loadLink()` in `src/sources/link/client.ts` use the Tauri HTTP plugin (direct fetch, `parseLink` on the client side); the browser build keeps the `/__lit` and `/__link` dev proxies. HTTP scope: LIT hosts + public http(s) only; refuse localhost/private addresses in code as the proxy does.
   4. `.bo` save: the `<a download>` in `useBoardApp.ts` becomes a native Save dialog + file write in the desktop app (helper in `src/storage/`). `.bo` open via `<input type=file>` should work as-is: check.
   5. `npm run tauri dev` → check canvas, Library, model load (Web Worker + ONNX wasm in WebView2), LIT import, link paste, `.bo` save/open. Then `npm run tauri build` → installer in `src-tauri/target/release/bundle/{msi,nsis}/`.
   6. Demo prep: install on the demo PC, open once with internet so the ~210 MB model downloads, import a few LIT categories / sample boards beforehand. The installer is unsigned: SmartScreen shows "More info → Run anyway".
   Full build/check/install checklist: `board-windows-build` skill (drafted 2026-11-15 before any real build; after the first successful build, fix any step that differed and drop its "drafted" note).
   Not in the demo build (later Tauri steps): SQLite + files on disk, bundled offline model, `.bo` file association, code signing, macOS build.
1. **Verify + commit the LIT import.** On the Mac: `npm test`, `npm run typecheck`, then `npm run dev` → File > Import from LIT Awards…, one small category, 1-3 photos per project. Check: progress, Stop/Hide, photos land in the Library with Source in the inspector, Award tab, search by company/location, re-run skips existing photos, new board option, `.bo` save keeps `source`. Then commit.
2. **Lighting eval (riskiest part).** Pick the final label list from `docs/LIGHTING_TAXONOMY.md` (~10-14). Collect 30-50 reference photos per label into `data/lighting-eval/<label>/` (not committed if large); LIT imports are a quick source (see the taxonomy doc). Write `scripts/eval-lighting.mjs`: zero-shot with **sigmoid** scores (see CLAUDE.md "Zero-shot scoring"), per-label precision/recall + confusion pairs. Then a logistic-regression probe on the stored embeddings, same report. Decide: ship as-is / merge confusing labels / keep as research. Record result in `MEMORY.md`.
3. **500-image canvas check** (`scripts/perf.mjs` with 500 real photos, pan/zoom/select). Keep custom canvas if smooth; else evaluate Konva (MIT). Not tldraw: needs a licence key in production.
4. **Split `useBoardApp.ts`** by domain (see CLAUDE.md; `useLitImport.ts` already lives apart), then **Tauri shell**: `models/` + ONNX wasm in bundled resources (offline), SQLite per `docs/SQLITE_SCHEMA.md`, image URL paste and the LIT client via Tauri HTTP (fixes CORS, drops the dev proxy). Test the model on macOS early.

## Roadmap

### 0. Scaffold ✅
- [x] Vite + React + TS + Vitest scaffolded (2026-11-14), canvas decision: custom DOM canvas (see Decisions)
- [x] Create GitHub repo (`blondeuser/Board`, 2026-11-14)
- [ ] Add it to `code-workspace/setup.sh`

### 1. Canvas ✅ first draft
- [x] Infinite pan/zoom (wheel/pinch zoom to cursor, Space+drag or middle-mouse to pan; drag empty space to box-select)
- [x] Paste from clipboard (Ctrl+V), drag & drop files / browser images, placed at cursor or view centre
- [x] Move, multi-select (Shift-click, Ctrl+A), resize (corner handle, keeps aspect), bring to front, Del removes
- [x] Zoom bar: ±, reset 100%, fit all
- [x] Marquee select: drag on empty space (Shift adds); pan is now Space+drag, middle-mouse, or trackpad scroll
- [x] Text note cards: toolbar button (top-left), double-click to edit, 5 tints in the inspector
- [x] Cards mode (bento): toolbar toggle auto-packs images + notes into a 4-column grid (wide 2x1, tall 1x2, some 2x2, long notes 2x1); non-destructive, free layout is kept; per-board; move/resize, zoom and horizontal pan are off, only vertical scroll (wheel, Space/middle-drag), zoom bar hidden
- [ ] Undo/redo, snapping, link/swatch items, reorder cards in bento mode, notes in library/search
- [ ] Check performance with 500 images (spike goal); consider tldraw/Konva only if the custom canvas struggles

### 2. Boards + tagging ✅ first draft
- [x] Left sidebar: create, switch, rename (double-click), delete boards; view (pan/zoom) remembered per board
- [x] Auto colour tags on import (k-means in OKLab → 12 families), editable per image
- [x] Custom categories: create/delete in sidebar, toggle on selected images in the inspector
- [x] Filter by colour / category (non-matches fade out on the canvas)
- [ ] Rename category, category colour picker, drag image onto a category
- [x] Library view: sidebar entry above the boards; grid of every image (newest first), click / Shift-click select, same tag panel, shows which boards an image is on, "Add to board", Delete removes it everywhere (with confirm); sidebar filters apply; paste/drop in the library adds images without placing them
- [x] Library sections: tabs at the top of the Library: Category (default) / Type / Colour / All; stacked sections with collapse and "Select all"; an image with several tags shows in each section; untagged ones go last (Uncategorized). Choice remembered
- [x] Library search: centred search bar; every word must match a type, category, colour or board name
- [x] mymind-inspired restyle: warm neutral background (dark mode too), borderless white surfaces with soft shadows, round pills/cards, sidebar without chrome, masonry library with natural aspect ratios, pill tabs, round resize handle
- [ ] Library: sort options, size slider, open an image large, drag from library onto a board

### 3. Storage
- [x] IndexedDB (browser build)
- [x] `Asset.hash` (SHA-256 of the original): computed on import, backfilled on `.bo` export/import. Still to do: skip duplicate imports of the same file
- [ ] SQLite + files on disk via Tauri (`docs/SQLITE_SCHEMA.md`); thumbnails; one-time IndexedDB → SQLite migration
- [x] `.bo` export: sidebar download button saves the open board as `<name>.bo` (browser download; no `.tmp` rename needed). Without thumbs/embeddings/preview for now — `docs/BO_FORMAT.md`
- [x] `.bo` import: sidebar upload button; dedupes by hash into the library, matches categories by name, always creates a new board. Embeddings are re-computed by the normal backfill
- [ ] `.bo` file association + icon on Windows and macOS (Tauri bundle config)
- [ ] Full-library backup/restore (later; same container idea)
- [~] **Storage location (phase 1 built 2026-11-15, untested on a real move; `docs/STORAGE.md`):** [ ] `settings.json` + library marker, [ ] thumbnails to a separate cache folder (one-time move), [ ] Edit menu + Settings → Storage tab with sizes, [ ] move library (local drives only; backup API + copy + re-hash verify + restart; old folder kept, *Delete old library*), [ ] move cache / reset, [ ] Clear cache + background thumbnail rebuild (+ WebView cache on next start), [ ] missing-library dialog (Retry / Locate… / default), [ ] lock file against two PCs; later: [ ] open/switch libraries, [ ] shrink originals (Max 4K/2K)

### 4. Auto-categorize
- [x] Colour palette extraction + colour families
- [x] Image type detection: on-device zero-shot on the SigLIP embedding (`Xenova/siglip-base-patch16-224`, q8, Web Worker) over 20 types (photo, screenshot, UI design, typography, ...); auto on import, backfills existing images; editable in the panel; Type filter in the sidebar
- [x] Search by meaning: each image gets a SigLIP embedding (stored on the asset, `embeddingModel` tells which model made it; old ones are recomputed automatically); the query is embedded the same way and matched by cosine similarity, in plain words ("the man", "red poster", "something to eat"). Results are one flat list, best first, plus tag-name matches
- [ ] Style labels (minimal, brutalist, vintage...) and auto-grouping / clusters from the embeddings
- [ ] Bundle model + ONNX wasm locally (now fetched from the Hugging Face hub / CDN on first use, ~210 MB, then cached) so it works offline
- [ ] Auto-grouping / clusters
- [ ] Lighting-technique detection as a new tag group beside Type and Colour. Research done 2026-11-14 (see `MEMORY.md`, label candidates + prompts in `docs/LIGHTING_TAXONOMY.md`). Steps: final label list -> reference photos -> zero-shot eval with **sigmoid** scoring -> (if weak) logistic-regression probe on stored SigLIP embeddings + brightness-gradient/evenness/contrast features -> add tag group only if precision is good
- [ ] Lighting corrections: confirm / reject / add a lighting label in the inspector; user labels stored separately from model labels and always win; they become training rows for the probe
- [ ] Warm / neutral / cool hint from the palette (see `MEMORY.md` Colour) + filter
- [ ] Vietnamese search: test SigLIP 2 (multilingual) if an ONNX build works in transformers.js; re-run `eval-search.mjs` before switching
- [ ] Extra abilities (e.g. OCR for text in images) as separate lazy-loaded models, each in its own `models/<id>/` folder

### 5. Desktop shell
- [ ] **Auto-update** (after the demo): Tauri updater plugin; signing key pair (`npx tauri signer generate`; private key + password kept outside the repo, backed up: losing it means installed copies can never update); public key in `tauri.conf.json`; `createUpdaterArtifacts`; releases on GitHub (`blondeuser/Board`) with the installer, its `.sig` and `latest.json`; app checks on start and asks "Update now?". Later: GitHub Action that builds + publishes on a version tag
- [ ] Code signing certificate (removes the SmartScreen warning; paid; only when sharing widely)
- [x] **Windows demo installer** built (2026-11-15): Tauri 2 shell, unsigned `.msi` / NSIS `-setup.exe`; still to test on a PC (see Resume here)
- [x] Tauri wrapper builds on Windows; [ ] macOS
- [x] LIT client through the Tauri HTTP plugin (replace `get()` in `src/sources/lit/client.ts`), so the import works without `npm run dev`
- [x] "Add a link" through the Tauri HTTP plugin (public hosts only) (replace the `/__link` proxy in `src/sources/link/client.ts`)
- [x] `.bo` save through a native Save dialog (Tauri dialog + fs plugins) instead of a browser download
- [x] App icon (REMind wordmark on white; placeholder-quality, replace with a real logo later)
- [ ] Code signing (later; the demo build is unsigned)

### 6. Reference sources
- [x] LIT Awards winners import (2026-11-14): edition + award-category picker (remembered), photos per project 1/3/6/All, optional new board, progress with Hide/Stop, skips photos already imported (by image URL); credits stored as `Asset.source`; searchable; Library "Award" tab; Source block in the inspector
- [ ] Verify on the Mac (see Resume here) and commit
- [ ] Unit test for `groupAssets(…, 'source')` and a UI smoke script (`scripts/smoke-lit.mjs`, with the proxy stubbed)
- [ ] Honourable mentions and student winners (`/winners/hmention.php`, `/winners/student.php`; same card markup, not parsed yet)
- [ ] Keep the entry description (it often names techniques: grazing, wall washer, uplight) for search and as weak lighting labels
- [ ] **Pinterest** (planned 2026-11-15, `docs/PINTEREST.md`): [ ] step 0 drag spike (Windows + Mac), [x] step 1 Pinterest view (built as the docked panel, toolbar button + File > Pinterest Panel; width not remembered, sign-in persistence unchecked), [ ] step 2 URL drop → download through `fetchPublic` → `import_image` (all sites; fixes the CORS backlog item), [ ] step 3 Pinterest source data, [ ] step 4 fast repeated drops; [x] step 5 docked panel (done early); later, ask first: [ ] step 6 "Grab this board"
- [ ] Other reference sites behind the same `sources/<site>/` shape (parse + client + source), e.g. IALD, Darc awards, archdaily lighting tag

### 7. Pen drawing (Wacom), planned 2026-11-15 — `docs/PEN_INPUT.md`
- [~] Phase 0 spike (tool built 2026-11-15, Help > Pen test; real-Wacom results pending): pointer log overlay; check `pointerType`/`pressure`/`tilt`/`buttons`/coalesced events with the Wacom on Windows (Windows Ink on and off; Edge + installed app) and macOS (WKWebView); record results in `docs/PEN_INPUT.md` §1
- [ ] Phase 1 undo/redo: command stack for all canvas edits, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y
- [ ] Phase 2 basic ink: pen mode toggle (`P`), pen tool with pressure, live canvas overlay + SVG commit, colours/sizes, stroke eraser + eraser end, select/move/delete strokes, `Placement` kind `ink` + IndexedDB migration, hidden in Cards mode
- [ ] Phase 3: `.bo` formatVersion 2 (ink + connections), board JPEG export draws ink, perf check 500 photos + 2,000 strokes
- [ ] Phase 4 brainstorm tools: marker, highlighter, lasso, Shift straight line, barrel-button pan, brush cursor, pressure-curve setting, "turn on Windows Ink" hint
- [ ] Phase 5 extras (pick after use): light brush, arrows, attach ink to an image + annotated export, shape recognition, tilt, partial eraser, sketch frames, macOS native pressure plugin if WKWebView has none

### 8. Rust backend (desktop only), planned 2026-11-15 — `docs/RUST_BACKEND.md`
- [~] Step 0 (storage interface done, hook split not): split `useBoardApp.ts` by domain behind a `Backend` interface; `docs/SQLITE_SCHEMA.md` matches `types.ts` (shapes, connections, `spacesVersion`); baseline numbers (start, import 100, analysis/image, search, drag 12)
- [x] Step 1 (v0.2.0, built; migration untested on a real library): `rusqlite` + migrations, file store, asset protocol for thumbs, `src/backend/api.ts` + `fake.ts`, today's TS backend moved to `src/backend/browser/` as the frozen browser dev mode, one-time IndexedDB → SQLite migration with count check (IndexedDB kept as safety net)
- [x] Step 2 (built 2026-11-15; `.bo`/drag-drop paths and timings pending): import pipeline in Rust (hash, dedupe, decode, thumb, palette; `rayon`); drop/paste/LIT/`.bo` share one entry point; `dragDropEnabled` on
- [~] Step 3 (built 2026-11-15, CPU only; parity 0.996+; GPU, timings and removing the worker pending): bundled SigLIP ONNX + `ort` (DirectML/CoreML, CPU fallback) + `tokenizers`; parity check vs transformers.js; analysis queue + search in Rust; remove worker + `@huggingface/transformers`
- [ ] Step 4: `.bo` read/write in Rust; opens TS-written `.bo` fixtures
- [ ] Step 5: remove IndexedDB code (after one safety release), tighten CSP
- [ ] Any time (TS): canvas drag/pan without per-move React state; batch analysis results so the app re-renders once per batch

## Backlog and known issues

- Search by meaning is approximate: people queries return people ("the man" also returns some women), a query with no match can still return the nearest-looking image ("dragon" -> cat). Thresholds in `src/categorize/style/search.ts` (SEARCH_FLOOR/WINDOW), tuned on a small photo set only.
- Type detection is approximate (zero-shot): similar types blur (UI design vs screenshot, logo vs typography). Keeps up to 2 types above a confidence threshold; thresholds in `pickTypes`.
- `classify.worker.ts` scores types with softmax at a fixed scale of 100, not SigLIP's own `logit_scale`/`logit_bias` + sigmoid. Acceptable for single-choice Type; wrong for multi-label Lighting (labels would compete). Add a sigmoid path when lighting starts.
- Search thresholds (`SEARCH_FLOOR` 0.025, `SEARCH_WINDOW` 0.03) were tuned on 15 photos; re-tune with a bigger library.
- Browser dev mode only: model (~210 MB) and ONNX wasm load from huggingface.co / cdn.jsdelivr.net on first use. The desktop app bundles the model (0.3.0).
- Pasting/dropping an image URL only works if the host allows CORS; otherwise a message asks you to save the file and drop it.
- LIT import works only under `npm run dev` / `vite preview` (the `/__lit` proxy); a static build shows "needs the dev server". Fixed by the Tauri HTTP step.
- LIT parsers read the site's HTML with regexes: a redesign of litawards.com breaks them. Symptom: "No winners found" or projects with 0 photos. Fix: save fresh pages into `tests/fixtures/lit/`, adjust `parse.ts` until `tests/lit.test.ts` passes.
- LIT volume: a whole year is ~3,700 photos (~1-1.5 GB) in IndexedDB at "All"; browser storage quota may refuse it. Keep imports to a few categories until the files-on-disk storage of the Tauri step.
- LIT duplicates are detected by image URL only; the same photo re-uploaded under another URL (or also dropped in by hand) is kept twice. Could also check `Asset.hash` after download.
- Canvas shows a 1280px thumbnail (originals kept); zooming far in on a big photo looks soft. Idea: swap in the original above ~200% zoom.
- Reported lag when selecting ~12 photos: could not reproduce headless (150 fps, ~3ms/frame main-thread; `scripts/perf.mjs`). Thumbnails shipped as the likely fix (decoded size 48MB -> 5MB per 12MP photo). Needs confirming on the real machine; if it persists, ask for monitor/GPU + photo sizes and profile in Edge DevTools Performance.
- Not yet checked on macOS / Safari; only Edge via Playwright.
- Browser extension / mobile capture (later).
- Pen pressure (from research, unverified on my hardware): Chromium/WebView2 reads Wacom pressure only with "Use Windows Ink" on (no WinTab support); Safari/WebKit on macOS reports a Wacom pen as `mouse`, so the Mac desktop app may get no pen detection and maybe no pressure. Phase 0 spike checks both.
- Desktop app storage: until the SQLite step, the Tauri app keeps using IndexedDB inside WebView2 (its own app-data folder). It starts with an **empty library**: boards made in the browser build (`localhost:5173`) don't carry over; move them with `.bo` export/import.
- Mixed installers: an MSI install and an NSIS install of the same app can sit side by side as two apps. Ship NSIS only; if a PC has the 0.1.0 MSI, uninstall it first (keep app data).
- The NSIS uninstaller has a "delete application data" checkbox: ticking it wipes the library (once the library can be moved, one on another drive survives, but `settings.json` is gone: the reinstalled app needs *Locate…*, `docs/STORAGE.md`).
- Demo installer is unsigned: Windows SmartScreen warns on first run ("More info → Run anyway").

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-11-15 | The whole library (originals + `board.sqlite`) can be moved to another **local** drive from Settings → Storage; thumbnails and WebView cache live in a separate, clearable cache folder; network drives refused for the library. Plan `docs/STORAGE.md` | Import copies every image (2,000 photos ≈ 8 GB) into Roaming on C:; "clear" can only safely mean rebuildable data, so the space saving comes from moving, not deleting. SQLite over SMB risks corruption |
| 2026-11-15 | Pinterest comes in through a Pinterest window inside REMind (signed in as me) with drag and drop onto the board; no official API, no paid scraper. Bulk "Grab this board" later, separate approval. Internal use only. Plan `docs/PINTEREST.md` | API search is closed (own pins only; partner search is beta, top 10); own-board import via API needs Business account + developer app + approval, too cumbersome; scrapers break and are against Pinterest's terms |
| 2026-11-15 | Backend moves to Rust (`src-tauri/`): SQLite + files, import, SigLIP via `ort`, search, `.bo`. UI stays React in the webview. Browser build not shipped but kept as a local dev mode (`npm run dev`, frozen TS backend, amended same day); model bundled in the installer; crates approved: rusqlite, image, fast_image_resize, sha2, rayon, zip, serde, ort, tokenizers. Plan `docs/RUST_BACKEND.md` | Speed on big libraries (LIT ~3,700 photos), native GPU inference, files on disk, offline first run. Replaces "browser build first" (2026-11-14) |
| 2026-11-15 | Pen drawing uses Pointer Events only (no Wacom SDK); strokes are `Placement` kind `ink` (raw points + pressure), live stroke on a canvas overlay, committed as SVG; undo/redo first. Proposed, open questions in `docs/PEN_INPUT.md` §9 | Reuses selection/z-order/copy/`.bo` for free; vector stays crisp at any zoom; Pointer Events work in WebView2 and the browser build |
| 2026-11-15 | Release rules: NSIS installer only, bump the version in `package.json` + `tauri.conf.json` + `Cargo.toml` for every build handed out, identifier never changes; manual updates until the Tauri updater + GitHub Releases | Upgrades in place keep the library; the MSI won't reinstall the same version; mixing MSI/NSIS gives two installs |
| 2026-11-15 | First demo ships as a Windows installer built with Tauri 2 (unsigned `.msi` / `-setup.exe`), ahead of the SQLite step; storage stays IndexedDB for the demo | Demo PC needs no Node; Tauri was already the chosen shell. SQLite, offline model and file association follow as separate steps |
| 2026-11-14 | Canvas is custom (DOM + CSS transform), not tldraw/Konva | Only needs images + pan/zoom/drag; no dependency, easy to swap later. Re-evaluate in the 500-image perf check |
| 2026-11-14 | Browser build first with IndexedDB; Tauri/SQLite later | Fast iteration; storage code is isolated in `src/storage/` |
| 2026-11-14 | Model files live as plain files (`models/<id>/`, bundled in Tauri resources or downloaded once to app-data); embeddings + tags live in SQLite. No MongoDB | MongoDB is a server DB and breaks local-first; model binaries don't belong in a database |
| 2026-11-14 | Search model is SigLIP base patch16-224 (q8) | Chosen by measurement on 15 photos; CLIP B/32 and B/16 were far worse on people queries |
| 2026-11-14 | Tauri, not Electron | Smaller; on-device model already runs in the webview; no Node backend needed |
| 2026-11-14 | No server / Vercel / MongoDB / cloud AI API | Nothing needs one; Vercel 4.5 MB body limit and no room for the model; keeps "images never leave the machine" |
| 2026-11-14 | `.bo` = ZIP container, export/import of one board; library stays the master copy | Simple, crash-safe, inspectable; one module so it can change later |
| 2026-11-14 | Lighting labels use sigmoid (independent) scoring | Effects combine in one image; softmax makes them compete |
| 2026-11-14 | Lighting eval before building lighting UI | Riskiest feature: zero-shot may not separate grazing/washing, scallop/accent |
| 2026-11-14 | LIT import parses the public winners pages (no API exists) through a dev-server proxy; no extra dependency (regex parsers, no jsdom/cheerio) | Site and photo bucket send no CORS headers; regex on server-rendered PHP is small, testable on saved pages and runs in Node, browser and Tauri |
| 2026-11-14 | Imported images carry `Asset.source` (link, title, categories, credit, details) instead of auto-creating custom categories | 68 award categories per year would flood the sidebar; source data stays searchable and groupable (Award tab) and keeps photographer credits |

## Log

### 2026-11-15 (v0.7.0: mouse draws as a pen, release build)
- Pen toolbar has a **Mouse draws** button (`mouseInk` in `App.tsx` / `Canvas.tsx`, `MouseIcon`): with pen mode on, the mouse and touch draw ink instead of editing items (left button only, steady pressure 0.8, the eraser button still wins). Off by default, not remembered between sessions. Typecheck clean; not checked with a real Wacom or touch screen. Version 0.7.0 in package.json, tauri.conf.json, Cargo.toml, write.ts.

### 2026-11-15 (v0.7.1: bug check, optimisations, release build)
- Code check of 0.7.0 (typecheck, 82 TS tests, 38 cargo tests, clippy: style warnings only). Fixed: `Files::find` tried a full folder listing per image lookup (O(n²) over a library; now tries the usual extensions first); Pinterest panel layout could still reserve the panel's width after closing (`layout(app, show_panel)`); the panel resize drag sent an IPC call per mouse move (now one per animation frame). Known, left: a DB write already waiting on the lock when a library move starts can land in the old library; `import_bo` reopens the zip once per image (slow on huge boards); erase is not undoable; the Mouse-draws toggle does not reset when the pen turns off. Version 0.7.1 in package.json, tauri.conf.json, Cargo.toml, write.ts.
- Built `REMind_0.7.1_x64-setup.exe` (NSIS, ship this one) and the MSI with `npm run tauri build`. Not installed or tried yet.

### 2026-11-15 (v0.7.0 release build)
- `npm run tauri build` (1.5 min compile): `REMind_0.7.0_x64-setup.exe` (170.7 MiB, NSIS; ship this one) and `REMind_0.7.0_x64_en-US.msi` (185 MiB). 82 TS tests pass. Not installed or tried yet: mouse-draws toggle, install over 0.6.0.

### 2026-11-15 (v0.6.0 release build)
- Version 0.6.0 in package.json, tauri.conf.json, Cargo.toml, write.ts (`c2a9aa7`). `npm run tauri build` (2 min compile): `REMind_0.6.0_x64-setup.exe` (170.7 MiB, NSIS; ship this one) and `REMind_0.6.0_x64_en-US.msi` (185 MiB). 82 TS tests + 41 cargo tests pass. Includes Pinterest panel, .bo progress pill, partial eraser, Settings > Storage. **Not tried:** installing over 0.5.0 and the first-start thumbnail move, a real library move to another drive, Pinterest drag spike.

### 2026-11-15 (library location, cache, Settings built)
- Rust: `settings.rs` (settings.json, atomic, unknown keys kept), `storage.rs` (resolve paths, marker `remind-library.json`, target checks, move = SQLite backup + hashed file copy + integrity/row-count verify + switch, delete old library, cache move, one-time thumbnail move, clear + rebuild thumbnails), `Files` now has separate originals and thumbs roots (+ legacy thumbs fallback), asset-protocol scope widened at start-up, `Db::backup_to/integrity_ok/row_counts`, `rusqlite` feature `backup`. A `moving` flag makes every DB call fail during a copy. Commands: `storage_info`, `move_library`, `cancel_move`, `delete_old_library`, `set_cache_dir`, `clear_cache`, `locate_library`, `use_default_library`; events `storage-progress`, `thumbs-progress`. UI: `Settings.tsx`, `LibraryMissing.tsx`, Edit menu. 4 new cargo tests (move + delete old, refused targets + cancel, missing library, thumbnails) and 1 settings test pass; typecheck clean; the app starts and writes the marker + cache folder. Not done: WebView-cache clear, drive-type/free-space checks, lock file, Delete-old confirm names the size only. Not tried with real images (the dev library was empty). Not committed.

### 2026-11-15 (plan: library location, cache, Settings)
- Asked where the app stores data: library + DB in `%APPDATA%\com.remstudio.remind\` (`board.sqlite`, `library\originals`, `library\thumbs`), WebView2 data in `%LOCALAPPDATA%\com.remstudio.remind\`. Planned Edit → Settings → Storage: movable library (local drives only, copy + verify + switch), separate cache folder for thumbnails with Clear cache, missing-library dialog; open/switch libraries and shrink-originals later. Plan in `docs/STORAGE.md`. Docs only, no code.

### 2026-11-15 (Pinterest docked panel, .bo progress bar, partial eraser)
- **Pinterest panel:** replaced the separate window with a child webview docked on the right of the main window (`toggle_pinterest` in `lib.rs`, Tauri feature `unstable` enabled; approved by asking for the panel). It must be an `async` command: a sync one built the webview on the main thread and froze the app on Windows. `set_pinterest_width` resizes it (240-1600 logical px, max half the window), the main window's Resized event re-lays it out, and `pinterest-open` events drive `src/ui/PinterestHandle.tsx` (drag handle on the right edge, × close button) and the toolbar Pinterest button (`PinterestButton`, tools group in `App.tsx`, desktop only). The view still has no capabilities. Width resets to 480 on restart.
- **.bo progress bar:** `export_bo` / `import_bo` emit `bo-progress` {done,total} per image (export: images written; import: images decoded, before anything is written); `exportBo`/`importBoFile` in `src/backend/api.ts` raise a `bo-busy` window event; `src/ui/BoStatusBar.tsx` shows a floating pill bottom right (`.bo-progress` in `styles.css`, sliding bar while there is no count). Until the first image is processed it has no count (library scan).
- **Pen eraser:** toolbar eraser button in pen mode (any pointer erases) and the stylus eraser end now **cut** strokes instead of deleting them whole: `erasePoints` (`src/canvas/ink/stroke.ts`, resamples long segments, returns the surviving pieces) and `eraseInk(x, y, r)` in `useBoardApp.ts` (radius = pen size, min 6 px on screen; each piece becomes its own ink placement, keeps colour/size/z). New test in `tests/stroke.test.ts`; 82 TS tests pass, typecheck clean. Not checked: with a real Wacom, a very fast sweep can skip a thin stroke (no path between samples), no eraser cursor ring, erase is not undoable (no undo yet).
- Spike logger: dev builds log every drop's payload to the console as `[drop]` (`src/app/main.tsx`) for the step 0 spike. Earlier note (superseded by the panel): rust `open_pinterest` window and File > Open Pinterest (desktop only). Dev builds log every drop's payload to the console as `[drop]` (`src/app/main.tsx`) for the step 0 spike. Compiles (cargo check, typecheck). Not yet tried: whether a pin drag carries the image URL. Not done: remembering window size/position, shortcut, sign-in persistence check.

### 2026-11-15 (plan: Pinterest)
- Researched getting Pinterest images into REMind. Official API can't search all of Pinterest (partner search is beta, top 10 only); own-board import via OAuth judged too cumbersome. Chose a Pinterest window inside the app + drag and drop, bulk grab later. Plan in `docs/PINTEREST.md` (steps 0-6, fallbacks, risks). Docs only, no code.

### 2026-11-15 (v0.5.0 release build)
- Version 0.5.0 in package.json, tauri.conf.json, Cargo.toml, write.ts. Built `REMind_0.5.0_x64-setup.exe` (170.70 MiB, NSIS) and the MSI; ship the NSIS only. Includes About credit, View/Board/Colour/Tags menus, tag borders, per-day Library with note cards. 81 TS tests pass. Not installed or tried on a second PC yet.

### 2026-11-15 (Library: notes, text and link badges)
- **Check result:** the Library listed only images; notes and text boxes (placements on boards) never appeared, and images imported from a web page showed no link indicator. **Now (revised: no separate section):** notes and text boxes are cards **in the same grid as the images**, sorted by date with them (All tab: DD/MM/YY sections; Tag/Type/Colour/Award tabs: they sit in the "No tag" / "No type" / "No colour" sections). New notes and text get a `createdAt` (new optional Placement field); older ones use their board's date. Note cards show the note colour (or the text in its own font and weight) and the board name; clicking opens the board with the item selected; they are not selectable/deletable from the Library. Hidden while searching or filtering (they have no tags). Images from a link or site import get the **link badge** (top-left, opens the page) in the Library grid like on the canvas. Browser-checked with a note + a text box (cards show, click opens the board and selects it); the link badge is typed and compiled but **not seen on screen** (needs an image with a source URL). Not done: search over note text, note preview tiles in the Type/Colour/Award stacks, Library select/delete for notes. Not committed.

### 2026-11-15 (Library date sections per day)
- Library All tab: one section per **day**, labelled **DD/MM/YY** (was one per month, MM/YY), newest first. Test updated (4 group tests pass), typecheck clean. Not looked at in the window. Not committed.

### 2026-11-15 (Colour as a menu)
- The sidebar Colour swatches moved into a **Colour** menu (between Type and Tags): the 12 families with their real library shade as a dot and a check mark, a count badge in the title, and **Clear All Filters** at the bottom (it was the sidebar "Clear" link; it clears colour, type and tag filters). Sidebar now only has Library, Boards and the theme toggle (pinned to the bottom). Browser-checked: filter on/off and the badge; typecheck clean. `scripts/smoke.mjs` already fails on a stale "New category" title (not from this change). Not committed.

### 2026-11-15 (tag borders)
- Images with tags get a **border in their tag colours** (up to 3 rings, first tag innermost) on the board and in the Library. A switch turns it on/off: **View > Tag Borders** or the tag button next to Cards mode (default on, remembered per viewer in localStorage). Pure helper `src/library/ring.ts` (3 tests); on the canvas the ring keeps a constant on-screen width at any zoom. Browser-checked: ring present with a tag, back to normal when switched off. 81 tests, typecheck clean. **Not done:** a tag-filter highlight (filters still fade non-matches); the ring is under the blue selection outline while a card is selected; not tried in the Tauri window. Not committed.

### 2026-11-15 (menus: View, Board, Tags)
- **View** menu: Freeform / Card / Library view (check mark on the current one). New **Board** menu: switch boards, New Board. **Categories renamed to Tags** in the UI (menu, inspector, library "Tag" grouping, "No tag" section, delete prompt); stored names unchanged, LIT award categories keep their name. Typecheck clean, 78 tests; browser-checked View and Board menus. Not committed.

### 2026-11-15 (About credit)
- Help > About REMind now shows "Created by REMSTUDIO © 2026" plus links to rem-design.co and Instagram @rem_thecreator (open in the system browser). Typecheck clean; not in an installer yet (0.4.0 was built before this).

### 2026-11-15 (v0.4.0 release build)
- Version **0.4.0** in package.json, tauri.conf.json, Cargo.toml (and the .bo writer's appVersion). Built `REMind_0.4.0_x64-setup.exe` (170.65 MiB, NSIS) with pen ink, text, Rust .bo, tighter CSP, .bo icon hook. Checked before building: typecheck, 78 TS tests, 33 Rust tests. **Installer not installed/tried yet** (Explorer icon, double-click open, upgrade over 0.3.0).

### 2026-11-15 (Rust backend: step 5 clean-up, .bo paper icon)
- **CSP tightened** (`tauri.conf.json`): self + the asset/ipc protocols, no model hub, CDN, wasm or blob workers; `devCsp` adds the Vite server. Checked on the **release exe**: 25 s of use plus `smoke-bo.mjs` (drop import, export, import) gave 0 console errors.
- **Old IndexedDB retired:** `migrate.ts` stamps the migration date; 30 days after a verified migration (`RETIRE_AFTER_DAYS`) it deletes the old `board` IndexedDB and records `cleaned`. Older installs that stored `1` get their clock started on first run of this version. 4 tests (`tests/migrate.test.ts`). Until then the safety net stays.
- **.bo file icon:** `scripts/make-bo-icon.mjs` draws a paper sheet (folded corner, one red dot) with `</REM/>` as 5x7 dot-matrix glyphs, in the style of Nothing's type. **It is not the real Nothing typeface** (licensed, not in the repo); say if you have the font file and I redraw it with that. Output `src-tauri/icons/bo-file.ico` (16-256 px), shipped as a bundle resource; `src-tauri/windows/hooks.nsh` (NSIS post-install hook) registers `.bo` as "REMind board" with that icon and an open command. Double-clicking a .bo starts the app (or runs it) with the path as argument; `take_launch_file` hands it to the UI, which opens it as a new board.
- **Not checked:** the installer was built (170.7 MB, hook compiled, icon staged at `iconso-file.ico`) but **not installed**, so the Explorer icon and double-click open are untested; a second double-click while the app is open starts a second window (no single-instance plugin). Windows may cache old icons until Explorer restarts. Not committed.

### 2026-11-15 (Rust backend: step 4, .bo in Rust)
- `src-tauri/src/bo.rs` (`zip` 2, deflate only): write, read, validate and the import plan (hash dedupe, categories by name, new board + ids), a port of `storage/bo/{write,read}.ts` with the same messages. Commands `export_bo` (streams originals from disk into a temp file, then renames; no image bytes through the UI) and `import_bo` (everything decoded before anything is written; fills in missing hashes on older library images; images get Rust thumbnails + palette only if new). Desktop **File > Save / Save As / Open** use them (native dialogs, path remembered per board); the browser dev mode keeps the fflate path. formatVersion is 2 when the board has ink **or text** (TS writer changed to match), else 1.
- Tests: 10 Rust unit tests (round trip, version rule, refusals, missing image, plan cases, ids) incl. one that reads a file written by the real TS writer (`src-tauri/tests/fixtures/ts-written.bo`, made by `npx vite-node scripts/make-bo-fixture.ts`); `cargo test` 33 pass, typecheck, 74 TS tests. `scripts/smoke-bo.mjs` (desktop, CDP): scratch board with note + text + ink + one image, export, delete the image, import: copy has all 4 kinds, ink points and text format intact, image restored with a thumbnail; cleans up after itself.
- **Not done / not checked:** drag-dropping a .bo onto the window, Windows file-association, opening a .bo whose images are AVIF/HEIC (Rust import rejects them like the drop import does), connections in `.bo` (still planned), large boards (hundreds of MB) not timed, the installed release build not tried. Not committed.

### 2026-11-15 (plain text items with formatting)
- New `Placement` kind `text` (`fmt: TextFormat`: font, size, colour, bold, italic, align; fonts are system stacks in `TEXT_FONTS`). Add with the **T** button in the bottom bar (before the note button) or the `T` key; double-click edits; an empty text box is deleted on blur. Selecting text shows Font / Size / B / I / alignment / colour in the inspector and applies to the whole selection. The next new text reuses the last used format. Borderless box that wraps at its width; free resize. Excluded from Cards mode and search dimming; kept by `.bo` import (written like notes; no format bump). `scripts/smoke-text.mjs` passes (add, format, reload, empty removed, delete). Typecheck clean, 74 tests. **Not done:** mixed formatting inside one text (format is per box), custom/bundled fonts, auto-height (box height is fixed; text overflows visibly), `.bo` docs mention of `fmt`, JPEG export of text. Not committed.

### 2026-11-15 (pen drawing, phase 2: basic ink)
- **Pen button** (bottom bar, after the note button; key `P`) turns pen mode on: the pen tip draws pressure-sensitive strokes, mouse/touch keep editing. 6 ink colours (first = theme text colour) and 3 line sizes appear next to it (kept in localStorage). The pen's **eraser end** removes strokes in any mode. Strokes are `Placement` kind `ink` (`InkStroke`: raw points x,y,pressure relative to the box; simplified on commit; outline recomputed as an SVG path, so no Rust or IndexedDB schema change). Live stroke draws on a screen-space canvas with coalesced events and refs only. Ink is click-selectable/movable/deletable, ignored by Cards (bento) mode and by search dimming, and the pen's long-press context menu is swallowed. Own outline code in `src/canvas/ink/stroke.ts` (no `perfect-freehand`).
- `.bo`: ink boards are written as formatVersion 2 (others stay 1); reader accepts up to 2 and keeps ink. Tests: 8 stroke + 1 `.bo` (74 total), typecheck clean. `scripts/smoke-ink.mjs` (browser): pen outside pen mode draws nothing, one stroke = one item, mouse still does not draw, survives reload, eraser end removes it (eraser simulated with DOM PointerEvents since CDP cannot send buttons=32).
- **Not done / not checked:** real Wacom (user to try in `tauri dev`), `tauri dev` smoke, undo/redo (phase 1: erased strokes cannot be brought back yet), board JPEG export does not include ink yet, connections still not in `.bo`, resize of ink is off, copy/paste of ink unchecked. Not committed.

### 2026-11-15 (pen drawing, phase 0: Pen test panel)
- **Help > Pen test…** (`src/ui/PenTest.tsx`, pure summary in `src/canvas/ink/probe.ts`, 6 tests): a pad that logs pointer type, pressure (distinct values), tilt, eraser end (`buttons & 32`), barrel button, hover, coalesced/predicted event support, samples per second and long-press context-menu events, with a plain-language verdict (real pressure / Windows Ink off / WebKit-style mouse with varying pressure / no pen) and a Copy results button. `scripts/smoke-pen.mjs` drives it with synthetic CDP pen events (pressure 0.10-0.94 read back, tilt, hover split, no errors). **Not done:** nothing run with the real Wacom yet. To do: Help > Pen test on Windows in the installed app (Windows Ink on, then off in Wacom Tablet Properties), then on the MacBook in `npx tauri dev`; paste each Copy results into `docs/PEN_INPUT.md` §1. Then Phase 1 (undo/redo). Typecheck clean, 65 tests. Not committed.

### 2026-11-15 (Rust backend: optimisation pass, measured)
- Numbers (release build, this PC: RTX 3090; `cargo test --release bench -- --ignored --nocapture` and `bench_import`): **analysis q8 on CPU 44-49 ms/image** (about 22 images/s; a 3,700-photo LIT year in ~3 min); model load 1.1 s warm, 4.7 s cold. **Import of a 12 MP JPEG: 232 ms before, 112 ms after** (palette now taken from the 1280px display copy instead of the full image; thumbnail resize through `fast_image_resize`, SIMD; decode is now 77 ms of the 112; sha256 2 ms). JS fires imports in parallel and each runs in its own blocking task, so several cores are used already.
- **DirectML tried and rejected for now:** the q8 model crashes the process (access violation) with DirectML; the fp16 model works and runs at **9.2 ms/image on the 3090 (5x faster)** but is 330 MB (vs 210), and is slower on CPU (56 ms), and the system `DirectML.dll` is too old, so the app would have to ship its own copy (a crash on any PC where that goes wrong). 45 ms/image on CPU is fast enough, so GPU stays off. Revisit if libraries reach tens of thousands of images; then ship fp16 + `DirectML.dll` beside the exe with a CPU fallback and a new `EMBEDDING_MODEL` id. `fast_image_resize` crate added (approved).
- Remaining ideas, not done: batch several images per model call (little gain on CPU), `lto = "fat"` + `codegen-units = 1` in the release profile, moving the UI-side lag fixes (drag/pan React state, per-result re-render). `cargo test` 23 pass. Not committed; not rebuilt as an installer.

### 2026-11-15 (Rust backend: step 3, bundled SigLIP in Rust, v0.3.0)
- `src-tauri/src/analyze/{mod,search}.rs`: `ort` 2.0.0-rc.15 (CPU, ONNX Runtime linked statically) runs the bundled q8 SigLIP vision + text models; `tokenizers` **0.22** (the 1.0 rc has a different API) with padding to 64 using pad id 1 (`</s>`, SigLIP's pad, not `[PAD]`). Image preprocessing = plain 2x2 bilinear sampling at pixel centres, no pre-filter (what the browser canvas did in the old pipeline; the q8 model reacts to the resize: CatmullRom gave cosine 0.98, bilinear 0.996). **Parity vs the TS pipeline (browser worker): image cosine 0.996-0.998 on 7 images, text 0.999+** (gate was > 0.99). `scripts/make-siglip-fixtures.mjs` makes the reference from the real app (needs the dev server); fixtures in `tests/fixtures/siglip/` (OpenCV sample photos + icon).
- Embeddings live in a new `embeddings` table (migration 2) and an in-memory index in Rust; they are stripped from the asset JSON (old libraries / the browser backend that send `embedding` get them moved automatically). New commands `analyze_asset` (embeds the stored thumbnail, stores the vector, returns type/space scores; the vector never crosses IPC) and `search_meaning` (query embed + floor/window match in Rust). UI: `classifier.analyseAsset` and the `useBoardApp` search effect use them on desktop (`isDesktop()`); browser dev mode keeps the worker path.
- Model files are not in git (`scripts/fetch-model.mjs` downloads ~210 MB into `src-tauri/resources/models/`, gitignored); `bundle.resources` ships them. **Release build: NSIS 170 MB, MSI 184 MB (version 0.3.0).** Checked: `cargo test` 23 pass (incl. parity), typecheck, 59 tests; `tauri dev` and the **release exe**: drop 6 photos, types detected, plain-language search correct (fruit, butterfly, monkey, a man, a plant, starry night sky; "dragon" still returns the nearest images, a known weakness), no console errors; model load ~1.5 s on the first search.
- **Not done / not checked:** DirectML/CoreML (CPU only, no timing numbers vs the old WASM path yet), an `eval-search` precision run on the Rust path, `.bo` image import and LIT through the new analysis (they share `autoTag`, unverified), transformers.js + worker not removed (browser dev mode needs them), a PC without Windows' DirectML.dll (ort puts it beside the exe but the installer does not bundle it), installing over a real 0.1.x/0.2.0 library.

### 2026-11-15 (v0.2.0 build, Help > About)
- Version 0.1.1 → 0.2.0 in `package.json`, `tauri.conf.json`, `Cargo.toml` (storage moved to SQLite). `npm run tauri build` OK (release, ~2 min): `src-tauri/target/release/bundle/nsis/REMind_0.2.0_x64-setup.exe` (8.85 MB) + MSI (10.35 MB; ship NSIS only). New **Help > About REMind** dialog shows the version (from `package.json` via `vite.config.ts` `define`, `src/shared/version.ts`) and the build date. Checked: typecheck, 59 tests, `cargo test` 16, About dialog in the browser build, `tauri dev` import/dedupe/persist via `scripts/smoke-desktop.mjs` (start the app with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`). **Not yet checked:** installing 0.2.0 over a real 0.1.x library (IndexedDB → SQLite migration), the installed app itself, LIT import/paste/`.bo` on the desktop. Back up `%LOCALAPPDATA%com.remstudio.remind` before the first upgrade.

### 2026-11-15 (Rust backend: step 2, import in Rust)
- `src-tauri/src/{import,color}.rs`: `import_image` command (raw body in, asset JSON out): SHA-256, dedupe by hash (an existing image is returned instead of a copy), EXIF-aware decode via `image`, 1280px thumbnail (JPEG, PNG only with real transparency; small files are their own thumbnail), OKLab k-means palette + colour families ported from TS. Thumbs are `thumbs/<id>.<ext>`. `Backend.importImage`; `useBoardApp.importBlobs` uses it (browser mode keeps the TS path). Crates `image`, `sha2` added (approved); `rayon`/`fast_image_resize` skipped (JS imports in parallel; CatmullRom resize first, switch if timing says so). `cargo test` 16 pass. **Untested:** palette parity vs TS on real photos, no timing numbers; drag-drop paths and `.bo` import still use the old route.

### 2026-11-15 (Rust backend: storage core + UI wiring, steps 0-1)
- `src-tauri/src/{db,files,lib}.rs`: rusqlite (bundled), `user_version` migrations, JSON-document tables for boards/assets/placements/connections/categories (same delete rules as `db.ts`), originals/thumbs on disk with atomic writes, thin commands; `cargo test` covers db + files. Crates `rusqlite`, `serde_json`.
- `src/backend/{types,index,api,migrate}.ts`: `db` is chosen by `isDesktop()` (Rust `api.ts` with the one-time IndexedDB → SQLite copy + count check; browser keeps `browser/db.ts`, moved from `storage/db.ts`). Asset protocol enabled for `$APPDATA/library/**`. Deviates from `docs/SQLITE_SCHEMA.md` (JSON `data` columns; embeddings stay in the asset JSON until step 3; note added to the doc). Step 0 only partly done: `useBoardApp.ts` not split.

### 2026-11-15 (plan: Rust backend)
- Reviewed the code for performance. Rust helps for model inference (WASM → native ONNX Runtime + GPU) and import/storage on disk; not for k-means, hashing or search maths. Found two TS-side causes of lag: drag/pan set React state on every pointer move; each analysis result re-renders the whole app. Decided: Rust backend, desktop only, model bundled, crates approved; then amended: `npm run dev` in the browser stays as a dev mode on the frozen TS backend. New `docs/RUST_BACKEND.md`; roadmap §8, decision, `MEMORY.md`, `CLAUDE.md` updated. No code changed; not committed.

### 2026-11-15 (plan: Wacom pen drawing)
- Brainstormed pen input for freeform mode; full plan in new `docs/PEN_INPUT.md` (platform facts + risks, interaction, data model, rendering, code layout, phases 0-5, tests, open questions). Roadmap §7, decision, known issue added; `MEMORY.md` product decision + ink domain rule; `docs/BO_FORMAT.md` notes formatVersion 2; `CLAUDE.md` docs table + stack line. No code changed; not committed.

### 2026-11-15 (v0.1.1: version bump, release rules)
- Version 0.1.0 → 0.1.1 in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` for the build carrying the LIT import fix. Release/upgrade rules written to `CLAUDE.md` ("Releases and updates"), decision in `MEMORY.md`, auto-update + code signing tasks in roadmap §5, upgrade pitfalls in known issues. Fixed a garbled `%USERPROFILE%\.cargo\bin` path in `CLAUDE.md`. Not built yet; not committed.

### 2026-11-15 (fix: LIT import failed in the installed app)
- Symptom: File > Import from LIT Awards in the installed app showed "Could not reach the LIT Awards site" at once. Cause: `src-tauri/capabilities/default.json` had `http://[::1]*` in the http deny list, which is not a valid URL pattern, so the plugin rejected every request. The other deny entries (`http://10.*`, `http://localhost*`) parsed but matched nothing (dotted IPs need a regex group; host patterns need `:*` for any port).
- Fix: deny list rewritten with patterns checked against the plugin's own `urlpattern` 0.6 parsing (localhost, 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, 0/8, any IPv6 literal); LIT pages, the S3 photo bucket and public sites stay allowed. `src/sources/lit/client.ts` now appends the plugin's reason to the error, so the next failure says why.
- Typecheck clean, 56 tests pass. **Needs a rebuild (`npm run tauri build`) and a re-check in the installed app; not committed.**
- Rule: after editing a capability scope, test the patterns; a single bad entry silently breaks the whole plugin.

### 2026-11-15 (first installer build)
- Installed Rust + VS Build Tools; `npx tauri build` succeeded first try: NSIS 7.7 MB + MSI 8.9 MB. Built exe starts (window title "REMind"). Icon redrawn as the "ReM:ind" wordmark on a white square; removed unused Android/iOS icon folders. Untested at runtime: dialog/fs scope, http capability patterns, WebView2 `confirm`/`prompt`.
- Added the `opener` plugin (open links in the system browser), beyond the approved http/dialog/fs list.

### 2026-11-15 (themes, desktop shell scaffold, `2c5a6ff`)
- Themes cut to two: Concrete (default) and Concrete Dark; Latte/Mocha removed. Fixed invisible text in the board rename box. Progressive blur on the side panel's top/bottom edges. All-tab MM/YY date landmarks; colour picker moved to the bottom of the sidebar.
- Tauri 2 shell scaffolded in `src-tauri/` (http, dialog, fs, opener plugins; opener added beyond the approved list), desktop code paths (`shared/desktop.ts`, `sources/net.ts`, `storage/saveFile.ts`, `shared/external.ts`), icon = "ReM:ind" wordmark on white (`scripts/make-icon.mjs`). Nothing Rust-side compiled yet: Rust + VS C++ Build Tools not installed. Next: install them, `npx tauri dev`, then `npx tauri build`.

### 2026-11-15 (plan: Windows demo installer)
- Chose to build the first demo as a Windows installer with Tauri 2 (over running `vite preview` + Edge "Install as app", which needs Node on the demo PC). Plan written in "Resume here" step 0; roadmap §5 split into tasks; decision and known issues recorded. Tauri approved (CLAUDE.md asked to confirm before adding it). No code changed yet. Baseline before the Tauri work: 56 tests pass, typecheck clean.
- Drafted the `board-windows-build` skill (prerequisites, pre-build checks, build outputs, common failures, demo-PC prep, doc updates after a build) and pointed `CLAUDE.md` and step 0 to it. Existing repo skills to use along the way: `tauri-setup`, `tauri-scaffold`, `tauri-config`, `tauri-app-http-client`, `tauri-app-dialog`, `tauri-app-file-system`, `tauri-security`, `tauri-build` (thin checklists; check exact config against the Tauri v2 docs).

### 2026-11-14 (REMind: serif UI, notes, stacks)
- **Renamed the app REMind** (tab title; wordmark "ReM:ind" in the menu bar, "ReM:" italic). Whole UI now uses Instrument Serif (`@fontsource/instrument-serif`, bundled, OFL) with small sizes bumped, no fake bold; menu bar is 52px tall with 22px type.
- **Notes:** double-click to edit works again (the canvas pointer capture hid the card from `dblclick`; now looks up the card under the cursor). Big uppercase serif text sized by card width; always tall 3:4 cards in five muted greys (`NOTE_GREYS`, `noteHeight`); old notes are normalised once on load; bento notes are 1x2. Notes inside a `.bo` are not normalised on open.
- **Right-click submenus (Arrange/Align):** fixed clipping (my scroll rule), the 31px offset from the Concrete theme, going off the bottom, and closing on diagonal moves (hover delay in `ContextMenu`).
- **Library stacks** redesigned as a tidy deck (front card, others peek up-right, name + count under a hairline); the open stack is highlighted and the rest dimmed.
- Tests 55 pass, typecheck clean. Checked in Playwright screenshots (Concrete, some Mocha/Latte); Concrete Dark and Latte not checked for the stacks and menu bar.

### 2026-11-14 (themes, space tags, menus, bulk export)
- **Concrete / Concrete Dark themes** (flat sage-grey and blue-slate, square boxes, hairline edges, black/light hover; title bars on Inspector and dialogs, mono group labels, crop marks on the empty board; after typesafe.ai). Concrete is the default; the sidebar button cycles Concrete → Concrete Dark → Latte → Mocha.
- **Finer type tags** for architecture and interior photos (facade, atrium, high ceiling, bedroom, reception, corridor, …; `SPACE_LABELS` in `categorize/style/labels.ts`): one softmax per parent group in the worker, `pickSpaces`, `Asset.spacesVersion` so existing images are re-analysed once (bump `SPACES_VERSION` when labels change). **Accuracy not measured on real photos yet**; thresholds (0.3, max 2) are guesses. Softmax inside a group, not sigmoid; revisit if labels hide each other.
- Link icon on cards that came from a web address (opens the page). Sidebar colour swatches show the library's real colour per family (`familyShades`). Type and Categories moved from the sidebar into the menu bar (ticks, stay open, × deletes a category). Library: drag-box bulk select, right-click menu (Export as JPEG, Select all/none, Delete); board right-click gets Export as JPEG.
- Tests: 55 pass, typecheck clean. UI checked with Playwright screenshots on the empty board, one selected image and the Library with 4 test images; Type menu with real types, Latte/Mocha and the dialogs were not re-checked. Committed in the same session.

### 2026-11-14 (grid snap + link thumbnails)
- Dragging cards snaps the dragged card's corner to the 24-unit grid (`snapDelta`/`GRID` in `canvas/viewport.ts`; Alt = free; resize and shapes don't snap). Pasting or dropping a web address now adds the page's preview image (og:image / twitter:image / apple-touch-icon) as an image card with `source` = site, page URL, title, so the Inspector links back: `src/sources/link/{parse,client}.ts`, dev-server proxy `/__link` in `vite.config.ts` (http(s) only, refuses non-public addresses incl. via redirects; replaced by the Tauri HTTP plugin later). Image addresses go through the same path. Tests: 52 pass, typecheck clean; proxy checked with curl (apple.com ok, localhost/LAN refused, page without image gives a message); **not tried in the browser UI yet**. No menu item yet (paste/drop only). Not committed.

### 2026-11-14 (bug pass)
- Typecheck + 38 tests pass on the Mac. Fixed: Del/Backspace while a `<select>` (e.g. Inspector "+ Type") was focused removed the selected cards from the board; board-delete confirm wrongly said images are deleted (they stay in the Library). Committed in a97360e.
- Added File > Clear Everything… (confirm, then `db.clearAll()` + reload): wipes boards, images, thumbnails, notes, categories. Keeps the downloaded image model. Typecheck + tests pass; not yet clicked through in the browser.
- Free layout: select exactly 2 cards, click the link button (toolbar, top-left) to draw a curved line; click again to remove. `Connection` type, IndexedDB v3 store `connections`, `src/canvas/connector.ts` (+3 tests), lines drawn under the cards and follow drags; removing a card or board drops its lines. **Not in `.bo` yet** (lines are lost on save/open; needs a format change, see `docs/BO_FORMAT.md`). Typecheck + 41 tests pass; not yet checked in the browser. Committed in a97360e.
- Free layout: bottom bar (above the zoom bar) now holds the link button plus shape tools (rectangle, circle/ellipse, triangle, diamond): pick a tool, drag on the canvas (Shift = equal sides, Esc cancels). Shapes are `Placement` kind `shape` (move, free resize, colour in the inspector, can be linked; saved in `.bo`; hidden in cards mode). Typecheck + 42 tests pass; not yet checked in the browser. Committed in a97360e.
- Right-click menu on the board (`src/ui/ContextMenu.tsx`): Cut / Copy / Paste / Delete (also Cmd/Ctrl+C, X, V; pasting images copied outside the app still works), Arrange (bring to front / forward, send backward / to back, so pictures can sit above or below shapes), Align (left, centre, right, top, middle, bottom; distribute horizontally / vertically for 3+). Pure logic in `src/canvas/arrange.ts` (+6 tests). Copies keep the lines between copied cards. Free layout only for Arrange/Align. Checked in Chrome with Playwright (draw 3 shapes, align left, copy/paste, context paste, send to back, no page errors); 48 tests + typecheck pass. Committed in 17859ba.

### 2026-11-14 (JPEG export)
- Select images (board or Library) and export the originals as JPEG: download button in the Inspector, or File > Export Selected as JPEG…. One image gives `image.jpg`, several give `images.zip` (`exportJpeg` in `useBoardApp`; quality 0.92, transparent areas become white). Checked in Chrome (zip of 2, single via menu, valid JPEG); typecheck passes. Committed in a97360e.

### 2026-11-14 (LIT Awards import)
- File > Import from LIT Awards…: pick edition + award categories + photos per project, downloads winners' photos into the library with credits (`Asset.source`), optional new board. `src/sources/lit/{parse,client,source}.ts`, `src/app/useLitImport.ts`, `src/ui/LitImportDialog.tsx`; dev-server proxy `/__lit` in `vite.config.ts` (site and photo bucket send no CORS headers). Search includes source credits; Library tab "Award" groups by award category; inspector shows Source. `importBlobs` gained `opts.sources/quiet` and returns ids; `createBoard(name)`.
- Parsers checked against live pages: 2025 (334 projects, 68 categories, ~11 photos each), 2019 (102), 2017 (152, older photo URLs). New `tests/lit.test.ts` + fixtures in `tests/fixtures/lit/`. Parser assertions passed under plain Node; **`npm test`, `npm run typecheck` and a real import in the browser not run yet** (Mac-only binaries in node_modules). Committed in a97360e.

### 2026-11-14 (collapsible sidebar)
- Left sidebar can be hidden: toggle button in the menu bar, View > Hide/Show Sidebar, Cmd/Ctrl+\\. Hidden = auto-hide: moving the mouse to the left edge slides it over the canvas, it hides ~250 ms after the mouse leaves. Choice remembered (`board.sidebar` in localStorage). Layout: `.app > .menubar + .shell`, sidebar in `.side`; `App.tsx` holds the state. Checked in Chrome (collapse, edge hover, hide, reload, shortcut); typecheck + 27 tests pass. Committed in a97360e.

### 2026-11-14 (menu bar)
- macOS-style menu bar on top (`src/ui/MenuBar.tsx`): Board | File > New Board, Open…, Save (Cmd/Ctrl+S), Save As… (Shift+Cmd/Ctrl+S). Save writes to the file picked earlier for that board (File System Access API, Chromium); Save As always asks; browsers without the picker download instead. Remembered file is lost on reload. `exportBoard` became `saveBoard`/`saveBoardAs` in `useBoardApp`. Checked in Chrome with a stubbed picker (menu, Save As, Cmd+S); typecheck + 27 tests pass. Committed in a97360e.

### 2026-11-14 (.bo export/import)
- Save a board as `.bo` (ZIP with all original image files) and open one again: `src/storage/bo/{write,read,hash}.ts`, buttons in the sidebar Boards header, `exportBoard`/`importBo` in `useBoardApp`. Added dependency `fflate` (named in the spec). `Asset.hash` added. 5 new tests (27 total). Typecheck + tests pass; **not tried in a browser yet**. Commit `628b436`.

### 2026-11-14 (docs merge with Claude planning session)
- Merged a separate planning session into the docs: decisions (Tauri, no cloud, `.bo` format, sigmoid for lighting), extended lighting label candidates, mymind market notes, warm/cool caveat, Vietnamese-search note. New `docs/BO_FORMAT.md`, `docs/LIGHTING_TAXONOMY.md`, `docs/SQLITE_SCHEMA.md`. Fixed stale lines (CLIP → SigLIP, duplicate Search rule, repo status). Resume-here reordered: lighting eval → canvas check → split hook + Tauri → `.bo`. No code changed.

### 2026-11-14 (research: model storage + lighting)
- Answered where the model is fetched/stored (huggingface.co + cdn.jsdelivr.net, then browser Cache Storage; images never leave the PC) and how to extend models (see Decisions). Researched lighting design techniques and feasibility of auto-detecting them; notes in `MEMORY.md`. No code changed. Dev server still running on 5173 (background task).

### 2026-11-14 (search by meaning)
- Library search now understands meaning: SigLIP image + text embeddings in the worker (`src/categorize/style/{model,search,classifier,classify.worker}.ts`), `embedding`/`embeddingModel` on `Asset`, `searchPending` flag, whole-word tag matching with stop words. Model picked by measurement (`scripts/eval-search.mjs`, 15 photos, 9 queries): CLIP B/32 returned ~37 wrong results for 15 right ones (people queries were near-random), B/16 ~32, SigLIP 7 wrong / 13 right. Download is ~210 MB once. Also fixed: the analysis status pill was missing in the Library. Committed in a97360e.

### 2026-11-14 (Catppuccin)
- Library search bar made bigger (66px tall, up to 760px wide, 19px text) and borderless: filled pill, no shadow or outline, lightens on focus.
- Theme tokens are now Catppuccin Mocha (dark, default) and Latte (light) with a sidebar toggle (`src/ui/ThemeToggle.tsx`); note tints and new category colours use the Catppuccin pastels; category chips pick readable text colour (`src/shared/contrast.ts`). Committed in a97360e.

### 2026-11-14 (mymind look)
- Restyled the whole UI (`src/app/styles.css` rewritten) and added library text search (`query` in `useBoardApp`, `matches`). Library cards now show natural aspect ratios in a masonry. Committed in a97360e.

### 2026-11-14 (library groups)
- Type and Colour tabs show each group as a fanned stack of up to 4 photos with the title and count under it; click a stack to open its grid below (Select all / Close). Category and All keep titled sections.
- Group-by is now a visible tab bar (the dropdown was hidden behind the side panel). Type tab: one titled section per type with its cards stacked under it.
- Library stacked into sections by category/type/colour (`src/library/group.ts`, 3 tests; `scripts/smoke-groups.mjs`). Committed in a97360e.

### 2026-11-14 (library)
- Library view (`src/library/Library.tsx`); `Inspector` now takes explicit props so both views share it. Behaviour change: removing an image from a board or deleting a board no longer deletes the image; only Library delete does. `scripts/smoke-library.mjs`. Committed in a97360e.

### 2026-11-14 (type detection)
- Added `@huggingface/transformers`. `src/categorize/style/` (labels + `pickTypes`, worker, client), `Asset.types` (undefined = not detected yet), Type filter + inspector chips, status pill. 4 new tests (15 total); `scripts/smoke-types.mjs` (app screenshot -> Screenshot/UI design, lettering -> Typography/Logo). Committed in a97360e.

### 2026-11-14 (perf: thumbnails)
- IndexedDB v2 adds a `thumbs` store; import makes a 1280px WebP thumbnail, older images get one lazily on first load. `scripts/perf.mjs`, `scripts/smoke-thumbs.mjs`. Committed in a97360e.

### 2026-11-14 (bento scroll-only)
- Cards mode is now vertical-scroll only: fixed zoom fitted to width, centred, y clamped to content. `scripts/smoke-bento-scroll.mjs`. Committed in a97360e.

### 2026-11-14 (notes + bento)
- Note cards and bento cards mode (`src/canvas/bento.ts`, 4 new tests; `scripts/smoke-notes.mjs`). Placement gained optional `kind`/`text`/`tint`, Board gained optional `mode` (no migration needed). Committed in a97360e.

### 2026-11-14 (later)
- Marquee select (drag empty space). Pan moved to Space+drag / middle-mouse / scroll. `scripts/smoke-marquee.mjs` added. Committed in a97360e.

### 2026-11-14
- First draft: scaffold (Vite, React 19, TS, Vitest), custom infinite canvas, paste/drop import, boards sidebar, colour auto-tags + custom categories, filters, IndexedDB persistence. Typecheck, tests and Edge smoke test pass. Committed in a97360e.
- Fixed during testing: StrictMode double-run created two first boards / duplicate category.

### 2026-11-13
- Project created: docs, folder structure, proposed stack.
