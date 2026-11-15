# Storage: library location, cache, Settings (plan, 2026-11-15)

Desktop only. Lets me move the heavy data (originals + database) to a drive I choose, keeps rebuildable data (thumbnails,
WebView cache) in a separate cache folder that can be cleared, and adds a Settings window to control both. Agreed in
chat 2026-11-15; **plan only, no code yet**.

## Why

Importing copies every image into the library. 2,000 photos at ~4 MB = ~8 GB of originals + ~0.5 GB of thumbnails,
today all in `%APPDATA%\com.remstudio.remind\` (Roaming, on C:). That doubles disk use on C:, and Roaming is the wrong
place for gigabytes (domain PCs with roaming profiles may sync it at sign-in/out).

## Decisions (2026-11-15)

| Question | Answer |
|---|---|
| What can move | **The whole library** (originals + `board.sqlite`), as one self-contained folder; the app points to it. Not originals-only |
| What is "cache" | Only rebuildable data: thumbnails, WebView2 cache. Never originals or the database |
| Cache location | Own setting, default `%LOCALAPPDATA%\com.remstudio.remind\cache\` (Windows), `~/Library/Caches/com.remstudio.remind/` (macOS) |
| Network drives / NAS | **Refused for the library** (SQLite over SMB can corrupt). Allowed for the cache with a warning (only slow; worst case thumbnails rebuild) |
| Where the menu lives | Edit → Settings… (`Ctrl+,` / `Cmd+,`), tab **Storage**. The app has no Edit menu yet; this adds it |
| Old folder after a move | Kept until I press *Delete old library*; never deleted automatically |
| Open / switch between several libraries | **Later.** Only "Locate library…" for a missing library is in scope |
| Shrink originals on import ("Max 4K / 2K") | **Later**, phase 3 below, same Storage tab |
| "Delete images not on any board" | Not planned: unplaced images are still searchable reference |

## Folder layout

```
<config>/settings.json                      fixed place, never moves (Windows: %APPDATA%\com.remstudio.remind\)
<libraryDir>/remind-library.json            marker: {"app":"REMind","libraryVersion":1,"id":"<uuid>","createdAt":...}
<libraryDir>/board.sqlite (+ -wal, -shm)
<libraryDir>/originals/<hash>.<ext>
<cacheDir>/thumbs/<hash>.webp
```

- Default `libraryDir` = today's folder (`%APPDATA%\com.remstudio.remind\`, i.e. `board.sqlite` and `library\originals\`
  stay where they are; existing installs don't move anything unless I choose to). The marker file is written there on
  first start of the new version.
- `settings.json`: `{ "settingsVersion": 1, "libraryDir": null | "<abs path>", "cacheDir": null | "<abs path>" }`.
  `null` = default. Written atomically (.tmp + rename). Unknown keys are kept.
- Thumbnails move out of `library\thumbs\` into `<cacheDir>\thumbs\` once, on the first start of the new version
  (rename when on the same volume, else copy + delete). `files.rs` looks in the new place, falls back to the old one until
  the move is done.

## Settings → Storage tab

```
Library
  M:\REMind Library                         8.1 GB · 2,031 images
  [Change…]  [Open folder]
  Old library still at C:\Users\…\com.remstudio.remind (8.1 GB)  [Delete old library]   ← only after a move

Cache
  C:\Users\…\AppData\Local\com.remstudio.remind\cache     480 MB thumbnails · 120 MB WebView
  [Change…]  [Reset to default]  [Open folder]
  [Clear cache]   ☐ also clear WebView cache (on next start)
```

- Sizes are computed in Rust in the background (walk the folders); the tab shows "…" until ready.
- Browser dev mode (`npm run dev`): the tab only says "Desktop app only".

## Moving the library (Change…)

Runs in Rust off the command thread, reports progress by events (≤ every 250 ms), can be cancelled until step 5.

1. **Pick:** native folder dialog (dialog plugin). Proposes `<chosen>\REMind Library`.
2. **Check, refuse with a clear message if any fails:**
   - local drive: Windows `GetDriveTypeW` = fixed or removable, not remote; UNC `\\server\…` refused. macOS: `statfs`
     filesystem not `smbfs` / `afpfs` / `nfs` / `webdav`.
   - not inside the current library or cache, and the current library not inside it.
   - empty or new folder. A folder holding a `remind-library.json` → "This is already a REMind library" (opening it is
     the later multi-library feature).
   - writable (write + delete a probe file).
   - free space ≥ library size + 10 %.
3. **Freeze:** UI shows a modal progress dialog; JS stops the analysis queue; Rust sets a `moving` flag so every write
   command returns "Library is being moved". Reads keep working.
4. **Copy:**
   - `board.sqlite` with SQLite's online backup API (`rusqlite` feature `backup`) into the new folder, never a raw file
     copy (a WAL database copied file-by-file can come out inconsistent).
   - `originals/` file by file, each written as `.tmp` + rename. Progress = files and bytes.
   - write `remind-library.json` (same `id` as the old one).
5. **Verify:** re-hash every copied original (file names are SHA-256 hashes, so a bad copy is caught); open the new
   database, `PRAGMA integrity_check` = ok, row counts equal to the old one. Any failure → delete the new folder, clear
   the flag, show the error; nothing changed.
6. **Switch:** write `settings.json` with the new `libraryDir`, record the old path in it (`previousLibraryDir`) for the
   *Delete old library* button, then `app.restart()`.
7. After restart the app opens the new library. *Delete old library* removes the old `board.sqlite*` and `originals\`
   (only the files the app owns; anything else in the folder is left alone) after a confirm that names the path and size.

Speed: C: → M: on the same PC is a plain copy, roughly disk speed (8 GB ≈ 1-3 min on SSDs) + hashing (~20-40 s).

## Moving the cache (Change… / Reset to default)

Same check list minus the network refusal (warning instead) and minus the marker file. Thumbnails are copied (or renamed
on the same volume), then `settings.json` is updated and the app restarts. If the copy fails, the cache simply starts
empty and thumbnails rebuild.

## Clear cache

- Deletes `<cacheDir>\thumbs\`, then `rebuild_thumbs` regenerates them from the originals in the background (rayon,
  progress in the status area). While a thumbnail is missing, the UI shows the original (`asset_paths` already returns
  `[original, thumb]` with `null` for a missing file).
- *Also clear WebView cache*: WebView2 locks its files while the app runs, so Rust writes a flag in `settings.json`; on
  the next start, **before the window is created**, it deletes only `EBWebView\Default\Cache`, `Code Cache` and
  `GPUCache`. IndexedDB (the 0.1.x safety-net copy) and Local Storage (theme, remembered choices) are never touched.
  (`clear_all_browsing_data()` is not used: it would wipe those too.)

## Start-up rules

1. Read `settings.json` (missing = defaults; unreadable = defaults + a warning, file kept as `settings.json.bad`).
2. Library folder exists and has a marker (or is the default folder) → open it.
3. **Library missing** (unplugged SSD, renamed folder, letter changed): do **not** create an empty library there. Show
   "Library not found at M:\REMind Library" with *Retry*, *Locate…* (pick a folder that has a `remind-library.json`) and
   *Use default library*. Same dialog when the marker's `libraryVersion` is newer than the app knows.
4. Cache folder missing or not writable → fall back to the default cache folder for this session, show a warning.
5. Widen the asset protocol scope at runtime to `<libraryDir>/originals` and `<cacheDir>/thumbs`
   (`app.asset_protocol_scope().allow_directory(..., true)`). `tauri.conf.json` keeps `$APPDATA/library/**` only as the
   default.
6. Apply a pending WebView-cache clear (see above), then create the window.

## Code plan

**Rust (`src-tauri/src/`)**
- `settings.rs`: load / save `settings.json` (atomic), defaults, `previousLibraryDir`, pending WebView clear flag.
- `storage.rs`: resolve library + cache paths at start-up, marker read/write, folder checks (local drive, empty,
  writable, free space, nesting), folder sizes, move library (backup API + copy + verify), move cache, delete old library,
  one-time thumbnail move.
- `files.rs`: `Files` gets two roots (`originals` under the library, `thumbs` under the cache); fallback lookup in the old
  `library\thumbs\` until moved.
- `lib.rs` setup: use `storage` to resolve paths instead of `app_data_dir()` directly; missing-library state; scope
  widening; `moving` flag checked by write commands.
- Commands: `storage_info`, `check_library_target`, `move_library`, `cancel_move`, `delete_old_library`,
  `set_cache_dir`, `clear_cache`, `rebuild_thumbs`, `locate_library`, `use_default_library`. Events: `storage://progress`,
  `thumbs://progress`.
- `Cargo.toml`: `rusqlite` feature `backup` (same crate, already approved). **Needs approval:** `windows-sys`
  (features `Win32_Storage_FileSystem`: `GetDriveTypeW`, `GetDiskFreeSpaceExW`) and `libc` (macOS `statfs`). Both small and
  already in the dependency tree through Tauri; without them there is no reliable network-drive or free-space check.

**JS**
- `src/backend/api.ts`: typed wrappers for the commands and events above; browser backend returns "desktop only".
- `src/ui/MenuBar.tsx`: new **Edit** menu (Settings… `Ctrl/Cmd+,`), keyboard shortcut in the app.
- `src/ui/Settings.tsx`: modal window with tabs (Storage first; room for General later), uses CSS tokens.
- `src/ui/LibraryMissing.tsx`: the start-up dialog.
- Progress dialog for the move (files, GB, Cancel), status line for thumbnail rebuild.

## Tests

- `cargo test`: move library in a temp folder (counts, hashes, integrity check); verify failure leaves no new folder;
  refuse non-empty / nested / existing-library targets; settings round-trip + unknown keys kept; missing library does
  not create a database; thumbnail one-time move + fallback; clear cache + rebuild produces the same file names.
- By hand (`npm run tauri dev`, then the installer): move C: → M: with ~200 images, restart, boards and search work;
  unplug a USB drive holding the library → missing dialog; clear cache → thumbnails come back; uninstall + reinstall with
  the library on M: → *Locate…* finds it.

## Phases

1. **Library location + cache folder + Clear cache** (this plan). Version `0.6.0` (storage layout change).
2. **Locate / open an existing library** fully (multi-library switching), when wanted.
3. **Shrink originals** setting "Store images at: Full / Max 4K / Max 2K" (applies to new imports; *Shrink existing
   images…* with a confirm; the source files on my disk are never touched). 2,000 photos: ~8 GB → ~2 GB at Max 4K.

## Risks

- **A move bug can lose a library:** copy-then-verify-then-switch, old folder kept, never delete automatically.
- **Uninstaller "delete application data" box:** wipes `settings.json` (and a library still in the default folder). A
  library elsewhere survives, but the reinstalled app won't know where it is → *Locate…* on first start must exist
  (start-up rule 3 covers it when `settings.json` points nowhere; a fresh empty default library should offer
  *Locate existing library…* once).
- **Drive letters change** (USB drives): the missing-library dialog handles it; never auto-create.
- **Two PCs on one library** (e.g. a shared external SSD) at the same time is not supported; a lock file
  (`<libraryDir>/.lock` with PC name + pid) is a cheap guard, added in phase 1.
