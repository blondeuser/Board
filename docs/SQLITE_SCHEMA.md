# Planned SQLite schema (Tauri step)

Replaces IndexedDB (`src/storage/db.ts`) when Board moves into Tauri. Mirrors `src/shared/types.ts`; adds what the roadmap needs
(content hash, lighting labels, import sources, migrations). Originals and thumbnails are **files** in the app-data folder, not blobs in the DB:

```
<appData>/library/originals/<hash>.<ext>
<appData>/library/thumbs/<hash>.webp
<appData>/models/<model-id>/...          bundled or downloaded once
<appData>/board.sqlite
```

## Migration 001
```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);            -- schema_version, embedding_model

CREATE TABLE boards (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL,
  view_x REAL, view_y REAL, view_zoom REAL,
  mode TEXT CHECK (mode IN ('free','bento')) DEFAULT 'free'
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,                                     -- sha256 of original
  ext TEXT NOT NULL, width INTEGER, height INTEGER,
  types TEXT,                                                    -- JSON array; NULL = not detected yet
  embedding BLOB,                                                -- Float32 little-endian; NULL = not computed
  embedding_model TEXT,
  temperature TEXT CHECK (temperature IN ('warm','neutral','cool')),
  created_at INTEGER NOT NULL
);

CREATE TABLE palettes (
  asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
  idx INTEGER, hex TEXT NOT NULL, share REAL NOT NULL,
  PRIMARY KEY (asset_id, idx)
);

CREATE TABLE asset_colors (                                      -- colour families
  asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE, family TEXT,
  PRIMARY KEY (asset_id, family)
);

CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL);
CREATE TABLE asset_categories (
  asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, category_id)
);

CREATE TABLE placements (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  kind TEXT CHECK (kind IN ('image','note')) DEFAULT 'image',
  asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,         -- NULL for notes
  text TEXT, tint TEXT,
  x REAL, y REAL, w REAL, h REAL, z INTEGER
);
CREATE INDEX placements_board ON placements(board_id);

CREATE TABLE asset_sources (                                     -- Asset.source: where an imported image came from
  asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  site TEXT NOT NULL,                                            -- 'LIT Awards'
  url TEXT NOT NULL,                                             -- project page
  image_url TEXT,                                                -- the photo's own URL (skip re-imports)
  title TEXT, credit TEXT,
  details TEXT                                                   -- JSON object, display order kept
);
CREATE INDEX asset_sources_image_url ON asset_sources(image_url);
CREATE TABLE asset_source_categories (                           -- award categories (Library "Award" tab)
  asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  PRIMARY KEY (asset_id, category)
);

CREATE TABLE lighting_labels (
  asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                                           -- id from docs/LIGHTING_TAXONOMY.md
  source TEXT NOT NULL CHECK (source IN ('model','user')),
  score REAL,                                                    -- model only
  verdict TEXT CHECK (verdict IN ('yes','no')),                  -- user confirm / reject
  model_version TEXT,
  PRIMARY KEY (asset_id, label, source)
);
```

## Notes
- Search stays brute-force cosine in JS over embeddings loaded at start (fine to ~20k images). If it gets slow, try `sqlite-vec`
  (check it loads through the Tauri SQL plugin first).
- One-time import from IndexedDB on first Tauri launch: read every store, compute `hash` for each original, write files + rows (including `source` → `asset_sources` + `asset_source_categories`), mark done in `meta`.
- Source text is searched like tags; if search over it gets slow, add an FTS5 table over title, categories and details.
- Delete rules match today's behaviour: deleting a board deletes its placements only; deleting an asset (Library) removes its placements everywhere.
