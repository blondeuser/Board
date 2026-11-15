# Board: Business logic

What the project does and the domain rules behind it. **Rules for working on the code** are in `CLAUDE.md`; **status** is in `PROGRESS.md`.

## Product

- A personal moodboard tool: drop in images (files, paste, drag from browser, screenshots), arrange them on an infinite canvas, and browse everything in a searchable library.
- Two views over the same items: **Canvas** (boards, freeform layout, like Freeform/PureRef) and **Library** (everything, auto-organised, like mymind).
- Auto-categorize runs automatically on import: colour palette, style, subject. User can always override tags.
- Local-first: no account, no upload; models run on the device.

## Product decisions

| Decision | Status |
|---|---|
| Local-first, on-device ML only (no cloud API for images) | Decided 2026-11-14 |
| **Desktop only, Rust backend:** storage (SQLite + files), import, image analysis, search and `.bo` run in Rust; the UI stays React in the Tauri webview. Only the desktop app is shipped; `npm run dev` in the browser stays as a local dev mode on the old TS backend (frozen, never shipped). The SigLIP model ships inside the installer (works offline). Plan: `docs/RUST_BACKEND.md` | Decided 2026-11-15 |
| Desktop app via Tauri, same codebase for Windows + macOS | Decided 2026-11-14 (Tauri over Electron: smaller app; the model already runs in the webview. Test the model on macOS WebKit early, its WASM/WebGPU behaviour differs from Edge) |
| First demo = Windows installer (Tauri 2, unsigned `.msi` / `-setup.exe`). Works without Node on the demo PC; LIT import and "add a link" fetch directly through the Tauri HTTP plugin; `.bo` saves through a native Save dialog. Library storage stays IndexedDB until the SQLite step, so a fresh install starts empty. Built 2026-11-15 (NSIS per-user + MSI, unsigned; icon = "ReM:ind" wordmark on white); runtime testing pending. "Add a link" in the desktop app only fetches public http(s) hosts (private/local addresses refused) | Decided 2026-11-15 |
| Releases: one Windows installer type (NSIS `-setup.exe`), version bumped for every build handed out, identifier `com.remstudio.remind` fixed forever. A new installer upgrades in place and keeps the library. Updates are manual (send the new installer) until the auto-updater exists; auto-update planned via the Tauri updater plugin with releases on GitHub (`blondeuser/Board`, public) | Decided 2026-11-15 |
| An item can live on many boards; boards reference items, not copies | Built 2026-11-14. Removing from a board or deleting a board keeps the image in the library; only deleting in the Library removes it everywhere |
| Auto tags never overwrite user-edited tags | Proposed |
| Canvas engine: custom DOM canvas for now | Decided 2026-11-14 for the first draft; revisit after the 500-image check |
| Tags: colour families (auto, editable) + user-made categories; filters fade non-matches rather than hide them | Built 2026-11-14 |
| Data model: `Asset` (image + tags) is separate from `Placement` (position on a board) | Built 2026-11-14 |
| The **library is the master copy**; a `.bo` file is an export/import of one board (layout + its images + their tags), for sharing and backup. Spec: `docs/BO_FORMAT.md` | Decided 2026-11-14 |
| `.bo` is my own format: a ZIP container with my own manifest and structure (like `.sketch` / `.docx`), identified by `"format": "remstudio-board"` + `formatVersion`. All read/write in one module, so it can become a custom binary later without touching the rest of the app | Decided 2026-11-14 |
| No server, Vercel or MongoDB | Decided 2026-11-14. Nothing in the app needs one. Vercel functions cap request bodies at 4.5 MB and can't host the ~210 MB model; MongoDB can't be embedded. Revisit only if I want accounts/sync/shared links (then: thin API + direct-to-storage uploads) |
| No Gemini / Claude / OpenAI API for now | Decided 2026-11-14. On-device SigLIP already does tags + plain-language search. Possible later, opt-in: an LLM to turn long queries into filters (text only), or captions for hard lighting cases (sends a thumbnail) |
| Lighting labels are multi-label and scored independently (sigmoid), never softmax against each other | Decided 2026-11-14 |
| Reference photos can be imported from public sites I use (first: LIT Awards winners). Each image keeps its source and credits; nothing is uploaded anywhere | Built 2026-11-14 (LIT) |
| Freeform mode supports **pen drawing (Wacom)**: pressure-sensitive ink strokes on boards for brainstorming and marking up photos. Pen draws, mouse keeps editing; eraser end erases. Each stroke is a board item (`Placement` kind `ink`), not a Library asset: never tagged, never searched. Plan + open questions in `docs/PEN_INPUT.md` | Proposed 2026-11-15 |
| Undo/redo comes before ink (drawing without undo is unusable) and covers every canvas edit, not just strokes | Proposed 2026-11-15 |
| Imported award categories are **source data**, not my custom categories: they show in the Award tab, the inspector and search, and never touch the sidebar category list | Decided 2026-11-14 |

## Look and feel

- Layout inspired by mymind: calm and content-first, borderless surfaces with soft shadows, generous rounding, icon-only tools with tooltips, few helper texts.
- Two themes: **Concrete** (flat grey, default) and **Concrete Dark** (blue-slate), switched with the sun/moon button at the bottom of the sidebar (`data-theme` on `<html>`, remembered in localStorage; the old Catppuccin Latte/Mocha were removed 2026-11-15). New UI must use the CSS tokens at the top of `src/app/styles.css`, never hard-coded colours. Colour-family swatches keep their real colours on purpose.

## Domain rules

- **Item types:** image, note, text, link, colour swatch. Only images are auto-categorized in v1. Notes (text cards) exist since 2026-11-14; they have a tint but no tags, and fade out whenever a filter is active.
- **Ink (planned, `docs/PEN_INPUT.md`):** a stroke stores its raw samples (x, y, pressure) plus tool, colour, base width; the drawn outline is always recomputed, so smoothing/width can change later. Width is chosen in screen px and saved in world units (zoomed out = bold, zoomed in = fine annotations). Free layout only; Cards mode hides ink like shapes. Devices without real pressure (mouse, Wacom with Windows Ink off, possibly Safari/WKWebView on macOS) get simulated pressure, flagged on the stroke. Lighting angle: a later "light brush" (soft additive glow) to sketch washes, grazing and beams over reference photos.
- **Cards mode (bento):** a per-board view mode, not a rewrite of positions. Items are packed in reading order of their free-layout positions into 4 columns; images are cropped to fill their card. Turning it off restores the free layout exactly. Cards mode is scroll-only: no zoom, no horizontal pan, no free positioning.
- **Colour:** extract 5 dominant colours per image (k-means in a perceptual space), store as hex + share; map to ~12 named colour families for filtering; "find similar colours" = distance in Lab/OKLCH.
- **Warm / neutral / cool (planned):** a hint from the weighted hue of the bright palette colours. It measures the photo's white balance, not the real lighting CCT (a 3000K render with neutral white balance reads "neutral"), so it is a filter aid, never shown as a Kelvin value.
- **Library grouping:** sections by category (default), type, colour or award (the `source.categories` of imported photos; images without a source go in "Not imported"); a multi-tagged image appears in every one of its sections, untagged images in a last section. Grouping is display only; it never changes tags.
- **Search (built 2026-11-14):** the library search box accepts plain language. Each image has a unit-length SigLIP embedding of its 1280px thumbnail; the query ("a photo of <words>") is embedded the same way and images are kept when their cosine similarity is above a floor and close to the best hit. Tag names (type, category, colour, board) and source text (site, project title, award categories, company, designers, location, edition) also match as whole words. While searching, results are one flat list ordered by relevance. Embeddings are tagged with the model that made them and recomputed if the model changes.
- **Image type (built 2026-11-14):** each image gets up to 2 of 20 fixed types from zero-shot matching of its embedding against type prompts, only when `types` is undefined; once set (auto or by me) it is never overwritten. Empty list = model unsure.
- **Style/subject (planned):** labels from zero-shot prompts on the same SigLIP embedding over a fixed vocabulary (e.g. minimal, brutalist, vintage), editable by me; auto-grouping by embedding clustering.
- **Search language:** the current model (SigLIP base) understands English only. Vietnamese queries need a multilingual model (SigLIP 2) — check an ONNX build exists for transformers.js first; switching means a new `EMBEDDING_MODEL` and re-embedding.
- **Search filters (planned):** plain filters (colour, tag, board, date, lighting, warm/cool) combine with meaning-search.
- **Import from LIT Awards (built 2026-11-14):** File > Import from LIT Awards… reads litawards.com/winners for one edition (2017-2025), lets me tick award categories (remembered) and photos per project (1/3/6/All, default 3), then downloads each winning project's full-size photos into the library. Each photo keeps an `Asset.source`: page link, project title, award categories, photographer credit, company/designers/architect/location/edition. Source text is searchable; the Library "Award" tab groups by award category; the inspector shows the credits with a link back. Photos already in the library (same image URL) are not downloaded again but still go on the optional new board. One project at a time, 3 photos in parallel, short pause between projects. Colour/type/search tagging runs as for any import; lighting-technique tags come with the lighting eval. The photos are LIT's/photographers' copyright: personal reference only, credits always kept. In the browser build this needs `npm run dev` (proxy); the desktop app will fetch directly.
- **.bo files:** see `docs/BO_FORMAT.md`. Importing a `.bo` dedupes images by content hash into the library, so assets need a `hash` (SHA-256 of the original) — not stored yet.
- Original files are never modified; thumbnails are derived and rebuildable.
- **Moving to the Rust backend must keep every existing library:** the one-time IndexedDB → SQLite migration counts rows before marking itself done, and IndexedDB stays untouched for at least one release.
- **Model storage:** model files are plain files on disk (bundled or downloaded once), never in a database; vectors and tags go in the metadata DB. Each embedding records its `embeddingModel`, so a new model recomputes only stale items. Today the browser fetches the model from huggingface.co and ONNX runtime from cdn.jsdelivr.net, then caches it; with the Rust backend the model is bundled in the installer (see `docs/RUST_BACKEND.md`).

## Lighting techniques (research 2026-11-14)

My field is lighting design (see also [[REMLUX/MEMORY]]), so Board should eventually tag reference photos by lighting technique. From now on, conversations about Board's app logic include lighting-design context. Sources were vendor/design blogs, not standards: distances and angles are rough guides, and there is no agreed category list, so the label set is my decision.

| Technique | Light does | Looks like in a photo |
|---|---|---|
| Grazing | Fixture very close to wall (< ~12 in), narrow beam (~15-30°) | Steep streaky light, brightest at top, fading down; exaggerates texture (stone, brick, plaster) |
| Wall washing | Fixture farther out (~1/3 wall height), wide beam (~45°) | Even soft film across the wall, few shadows, smooth gradient; suits smooth finishes |
| Scalloping | Beams aimed/spaced so they do not blend (also a washing mistake when too close) | Repeating arcs of light and dark along the wall |
| Spotlight / accent | Focused directional beam on one object | Bright pool with a clear edge against a much darker surround (high contrast) |
| Decorative | The fixture itself is a visible design object (pendant, chandelier) | Visible light sources and fixtures |

- More candidate techniques to choose from (cove/indirect, linear/strip, uplight, backlit, halo/edge, facade flood, step/floor, daylight, pattern/gobo, coloured RGB) are in `docs/LIGHTING_TAXONOMY.md`. Final list: ~10-14 labels that look visibly different; merge any pair the model keeps confusing.
- Techniques are often combined (e.g. washing + indirect light), so one image can carry several labels. Unlike Type, lighting labels are scored independently (sigmoid), not as a competition.
- **Detection feasibility:** no public dataset of lighting technique on interior photos exists (closest: TU Wien light/mood proposal; CLIP-based architectural-style classifiers), so we build our own labelled set from my references. Plan: zero-shot SigLIP prompts first (should work for spotlight pools, scallops, visible pendants; washing vs grazing will be weak), then a small classifier on the stored SigLIP embeddings (~30-50 photos per technique) plus simple image features (vertical brightness gradient, evenness, bright-region contrast). Add as a tag group only if precision is good.

## Market notes (2026-11-14)

- mymind (the reference app) uses cloud AI: its subprocessor list names OpenAI for analysing saved public content, and it added Claude Sonnet 4.5 for note summaries/tags (Oct 2025); media processing runs on its own service. It tags objects, reads text in images (OCR) and extracts palettes.
- Reviewers say mymind's tagging is good for general visual content but weak for niche, domain-specific subjects. Lighting technique is exactly that niche: it is Board's differentiator, so lighting tags must be measurably good before they ship.
- OCR, if wanted: Tesseract.js on-device (free, offline), as a lazy-loaded model.

## Reference numbers

- _To fill: target import speed (images/sec), thumbnail size, max library size to stay smooth._
