# `.bo` board file — formatVersion 1

`.bo` is Board's own file format: an export/import of **one board** — its layout, every image on it, and those images' tags —
so a board can be shared, archived or moved to another machine. The library stays the master copy (see `MEMORY.md`).

Inside, a `.bo` is a **ZIP container** with our own structure (the same approach as `.sketch`, `.docx`, `.3mf`).
Images are stored uncompressed (already compressed); JSON is deflated.

```
manifest.json            required, first entry — identifies the file
board.json               the Board + its Placements (images and notes)
assets.json              every Asset referenced by a placement (tags, palette, types, …), without embeddings
categories.json          the Categories used by those assets
images/<hash>.<ext>      original files, one per unique SHA-256
thumbs/<hash>.webp       1280px display copies (optional; rebuilt if missing)
embeddings.bin           optional: Float32 little-endian, one vector per asset in assets.json order
preview.webp             optional: snapshot of the board (file browsers, future Quick Look)
```

## manifest.json
```json
{
  "format": "remstudio-board",
  "formatVersion": 1,
  "appVersion": "0.1.0",
  "exportedAt": "2026-11-14T07:30:00Z",
  "boardId": "…",
  "name": "T2 lounge — warm cove refs",
  "embeddingModel": "siglip-base-patch16-224",
  "embeddingDim": 768,
  "counts": { "placements": 51, "assets": 40, "categories": 3 }
}
```
`embeddingModel` / `embeddingDim` are `null` when `embeddings.bin` is absent.

## board.json
The `Board` and its `Placement[]` exactly as in `src/shared/types.ts` (`id`, `name`, `createdAt`, `view`, `mode`;
placements with `kind`, `assetId`, `text`, `tint`, `x`, `y`, `w`, `h`, `z`). `boardId` on placements is implied.

## assets.json
`Asset[]` as in `src/shared/types.ts` minus `embedding` (including the optional `source` credits of imported photos, added 2026-11-14; readers that don't know it ignore it), plus:
- `hash` — SHA-256 of the original (hex). Also the image's file name in `images/`.
- `ext` — original file extension.
- `lighting` (once it exists) — `{ label, score?, source: "model" | "user", verdict?: "yes" | "no" }[]`.

## Writing
1. Collect the board's placements → asset ids → assets → categories.
2. Stream into `<name>.bo.tmp`; fsync; rename to `<name>.bo` (no half-written files after a crash).
3. Include `embeddings.bin` only for assets whose `embeddingModel` matches the current model.

## Reading
1. Check `format === "remstudio-board"`. Refuse a higher `formatVersion` with a clear message ("made by a newer Board"); migrate lower ones.
2. For each asset: if an asset with the same `hash` exists in the library, reuse it (merge tags: user tags kept, union of categories);
   otherwise add it with a **new** id. Keep a map old id → library id.
3. Categories: match by name (case-insensitive); create missing ones.
4. Create a **new** board (never overwrite an existing one) with remapped placement `assetId`s.
5. If `embeddingModel` ≠ current `EMBEDDING_MODEL`, ignore `embeddings.bin`; the normal backfill re-embeds.
6. Unknown fields are ignored; unknown lighting labels become plain categories.

## Code
All of this lives in `src/storage/bo/` (`write.ts`, `read.ts`, `migrate.ts`) and nothing else touches the ZIP.
If `.bo` ever needs to become a custom binary (privacy or lazy-loading huge boards), only this folder and `formatVersion` change.
ZIP library: pick a small, maintained one (e.g. `fflate`) — confirm before adding (CLAUDE.md dependency rule).
