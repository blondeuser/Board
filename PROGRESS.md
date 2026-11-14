# Board: Progress

Living status. **Update at the end of every work session.** Rules live in `CLAUDE.md`, business logic in `MEMORY.md`.

_Last updated: 2026-11-15 (v0.1.1: version bump, release rules)_

## Status

|                   |                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Current phase** | Browser build done (canvas, Library, meaning-search, `.bo`, LIT import, two Concrete themes). **Windows demo installer builds** (Tauri 2, 2026-11-15) but is not yet tested on a PC; next: test it, then verify LIT on the Mac, lighting-technique eval, SQLite step |
| **App**           | Runs with `npm run dev` (port 5173). Boards, infinite canvas, notes, bento mode, Library (Category / Type / Colour / Award / All tabs, stacks, semantic search), colour + type + custom-category tags, `.bo` save/open, menu bar, collapsible sidebar, File > Import from LIT Awards (needs the dev server), Mocha/Latte theme |
| **Tests**         | 59 Vitest tests (colour, viewport, bento, type picking, grouping, search, `.bo`, LIT + link parsers, `isPublicHost`) pass; typecheck clean. Playwright smoke scripts in `scripts/` |
| **Hosting**       | GitHub `blondeuser/Board` (public). Latest code commit `2c5a6ff` |

## Resume here (next session)

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
- [ ] Other reference sites behind the same `sources/<site>/` shape (parse + client + source), e.g. IALD, Darc awards, archdaily lighting tag

## Backlog and known issues

- Search by meaning is approximate: people queries return people ("the man" also returns some women), a query with no match can still return the nearest-looking image ("dragon" -> cat). Thresholds in `src/categorize/style/search.ts` (SEARCH_FLOOR/WINDOW), tuned on a small photo set only.
- Type detection is approximate (zero-shot): similar types blur (UI design vs screenshot, logo vs typography). Keeps up to 2 types above a confidence threshold; thresholds in `pickTypes`.
- `classify.worker.ts` scores types with softmax at a fixed scale of 100, not SigLIP's own `logit_scale`/`logit_bias` + sigmoid. Acceptable for single-choice Type; wrong for multi-label Lighting (labels would compete). Add a sigmoid path when lighting starts.
- Search thresholds (`SEARCH_FLOOR` 0.025, `SEARCH_WINDOW` 0.03) were tuned on 15 photos; re-tune with a bigger library.
- Model (~210 MB) and ONNX wasm load from huggingface.co / cdn.jsdelivr.net on first use: first run needs internet. Fixed by bundling in the Tauri step.
- Pasting/dropping an image URL only works if the host allows CORS; otherwise a message asks you to save the file and drop it.
- LIT import works only under `npm run dev` / `vite preview` (the `/__lit` proxy); a static build shows "needs the dev server". Fixed by the Tauri HTTP step.
- LIT parsers read the site's HTML with regexes: a redesign of litawards.com breaks them. Symptom: "No winners found" or projects with 0 photos. Fix: save fresh pages into `tests/fixtures/lit/`, adjust `parse.ts` until `tests/lit.test.ts` passes.
- LIT volume: a whole year is ~3,700 photos (~1-1.5 GB) in IndexedDB at "All"; browser storage quota may refuse it. Keep imports to a few categories until the files-on-disk storage of the Tauri step.
- LIT duplicates are detected by image URL only; the same photo re-uploaded under another URL (or also dropped in by hand) is kept twice. Could also check `Asset.hash` after download.
- Canvas shows a 1280px thumbnail (originals kept); zooming far in on a big photo looks soft. Idea: swap in the original above ~200% zoom.
- Reported lag when selecting ~12 photos: could not reproduce headless (150 fps, ~3ms/frame main-thread; `scripts/perf.mjs`). Thumbnails shipped as the likely fix (decoded size 48MB -> 5MB per 12MP photo). Needs confirming on the real machine; if it persists, ask for monitor/GPU + photo sizes and profile in Edge DevTools Performance.
- Not yet checked on macOS / Safari; only Edge via Playwright.
- Browser extension / mobile capture (later).
- Desktop app storage: until the SQLite step, the Tauri app keeps using IndexedDB inside WebView2 (its own app-data folder). It starts with an **empty library**: boards made in the browser build (`localhost:5173`) don't carry over; move them with `.bo` export/import.
- Mixed installers: an MSI install and an NSIS install of the same app can sit side by side as two apps. Ship NSIS only; if a PC has the 0.1.0 MSI, uninstall it first (keep app data).
- The NSIS uninstaller has a "delete application data" checkbox: ticking it wipes the library.
- Demo installer is unsigned: Windows SmartScreen warns on first run ("More info → Run anyway").

## Decisions

| Date | Decision | Why |
|---|---|---|
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
