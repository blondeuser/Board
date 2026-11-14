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
| Local-first, on-device ML only (no cloud API for images) | Proposed |
| Desktop app via Tauri, same codebase for Windows + macOS | Proposed |
| An item can live on many boards; boards reference items, not copies | Built 2026-11-14. Removing from a board or deleting a board keeps the image in the library; only deleting in the Library removes it everywhere |
| Auto tags never overwrite user-edited tags | Proposed |
| Canvas engine: custom DOM canvas for now | Decided 2026-11-14 for the first draft; revisit after the 500-image check |
| Tags: colour families (auto, editable) + user-made categories; filters fade non-matches rather than hide them | Built 2026-11-14 |
| Data model: `Asset` (image + tags) is separate from `Placement` (position on a board) | Built 2026-11-14 |

## Look and feel

- Layout inspired by mymind: calm and content-first, borderless surfaces with soft shadows, generous rounding, icon-only tools with tooltips, few helper texts.
- Colours are Catppuccin: **Mocha** (dark, default) and **Latte** (light), switched with the sun/moon button at the bottom of the sidebar (`data-theme` on `<html>`, remembered in localStorage). Accent is mauve. New UI must use the CSS tokens at the top of `src/app/styles.css`, never hard-coded colours. Colour-family swatches keep their real colours on purpose.

## Domain rules

- **Item types:** image, note, text, link, colour swatch. Only images are auto-categorized in v1. Notes (text cards) exist since 2026-11-14; they have a tint but no tags, and fade out whenever a filter is active.
- **Cards mode (bento):** a per-board view mode, not a rewrite of positions. Items are packed in reading order of their free-layout positions into 4 columns; images are cropped to fill their card. Turning it off restores the free layout exactly. Cards mode is scroll-only: no zoom, no horizontal pan, no free positioning.
- **Colour:** extract 5 dominant colours per image (k-means in a perceptual space), store as hex + share; map to ~12 named colour families for filtering; "find similar colours" = distance in Lab/OKLCH.
- **Library grouping:** sections by category (default), type or colour; a multi-tagged image appears in every one of its sections, untagged images in a last section. Grouping is display only; it never changes tags.
- **Search (built 2026-11-14):** the library search box accepts plain language. Each image has a unit-length SigLIP embedding of its 1280px thumbnail; the query ("a photo of <words>") is embedded the same way and images are kept when their cosine similarity is above a floor and close to the best hit. Tag names (type, category, colour, board) also match as whole words. While searching, results are one flat list ordered by relevance. Embeddings are tagged with the model that made them and recomputed if the model changes.
- **Image type (built 2026-11-14):** each image gets up to 2 of 20 fixed types from zero-shot matching of its embedding against type prompts, only when `types` is undefined; once set (auto or by me) it is never overwritten. Empty list = model unsure.
- **Style/subject:** CLIP-style embedding per image; labels come from zero-shot prompts over a fixed vocabulary (e.g. minimal, brutalist, vintage, 3D render, photography, illustration, typography, interior, fashion), editable by me; auto-grouping by embedding clustering.
- **Search:** text query is embedded and matched against image embeddings (semantic), plus plain filters (colour, tag, board, date).
- Original files are never modified; thumbnails are derived and rebuildable.
- **Model storage:** model files are plain files on disk (bundled or downloaded once), never in a database; vectors and tags go in the metadata DB. Each embedding records its `embeddingModel`, so a new model recomputes only stale items. Today the browser fetches the model from huggingface.co and ONNX runtime from cdn.jsdelivr.net, then caches it (see `PROGRESS.md` Decisions).

## Lighting techniques (research 2026-11-14)

My field is lighting design (see also [[REMLUX/MEMORY]]), so Board should eventually tag reference photos by lighting technique. From now on, conversations about Board's app logic include lighting-design context. Sources were vendor/design blogs, not standards: distances and angles are rough guides, and there is no agreed category list, so the label set is my decision.

| Technique | Light does | Looks like in a photo |
|---|---|---|
| Grazing | Fixture very close to wall (< ~12 in), narrow beam (~15-30°) | Steep streaky light, brightest at top, fading down; exaggerates texture (stone, brick, plaster) |
| Wall washing | Fixture farther out (~1/3 wall height), wide beam (~45°) | Even soft film across the wall, few shadows, smooth gradient; suits smooth finishes |
| Scalloping | Beams aimed/spaced so they do not blend (also a washing mistake when too close) | Repeating arcs of light and dark along the wall |
| Spotlight / accent | Focused directional beam on one object | Bright pool with a clear edge against a much darker surround (high contrast) |
| Decorative | The fixture itself is a visible design object (pendant, chandelier) | Visible light sources and fixtures |

- Techniques are often combined (e.g. washing + indirect light), so one image can carry several labels (matches the existing up-to-2 type pick).
- **Detection feasibility:** no public dataset of lighting technique on interior photos exists (closest: TU Wien light/mood proposal; CLIP-based architectural-style classifiers), so we build our own labelled set from my references. Plan: zero-shot SigLIP prompts first (should work for spotlight pools, scallops, visible pendants; washing vs grazing will be weak), then a small classifier on the stored SigLIP embeddings (~30-50 photos per technique) plus simple image features (vertical brightness gradient, evenness, bright-region contrast). Add as a tag group only if precision is good.

## Reference numbers

- _To fill: target import speed (images/sec), thumbnail size, max library size to stay smooth._
