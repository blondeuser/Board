# Pinterest in REMind

Plan for browsing Pinterest inside the desktop app and dragging images onto a board. Planned 2026-11-15; nothing built yet. Status lives in `PROGRESS.md` §6, the decision in `MEMORY.md`.

## 1. Goal

- Open Pinterest inside REMind, signed in with my own account, so the results and feed are exactly what Pinterest shows me.
- Drag a pin from the Pinterest view onto a board: REMind downloads the **full-size original**, imports it like any other image (hash dedupe, thumbnail, palette, SigLIP tags, lighting labels later), places it where I dropped it, and keeps the pin link as its source.
- Later: a "Grab this board / these results" button for bulk import.
- Internal REMSTUDIO use only. Not for redistribution (see §8).

## 2. Options considered (research 2026-11-15)

| Option | Verdict |
|---|---|
| Official Pinterest API v5 search | No. `/search/pins` only searches the signed-in user's own pins; `/search/partner/pins` (all of Pinterest) is beta, not open to all apps, and returns only the top 10 pins |
| Official API: import my own boards (OAuth, `boards:read` + `pins:read`) | Works, but needs a Business account, a developer app, Trial approval and token storage. Judged too cumbersome for an internal tool; dropped |
| Paid scraper APIs (SerpApi, ScrapeCreators, Apify, ~$0.003/search) | Possible later for automatic bulk search. Scraping, against Pinterest's terms, breaks when the site changes. Not now |
| **Pinterest panel inside REMind + drag and drop** | **Chosen.** No API, no keys, no approval; I browse as myself; per-image import. Bulk later via "Grab this board" |

## 3. How it works

```
Pinterest view (own webview, no IPC)         REMind main window
  drag <img> from a pin  ── OS drag ──▶  Canvas onDrop (DataTransfer)
                                          └ sources/pinterest/parse.ts: pick image URL + pin page URL
                                          └ upgrade i.pinimg.com/236x/… → /originals/… (fallback /736x/)
                                          └ sources/net.ts fetchPublic (Tauri HTTP plugin, no CORS)
                                          └ backend import_image (Rust: hash, dedupe, thumb, palette)
                                          └ placement at drop point, source = { site: "Pinterest", url: pin page, imageUrl }
```

- `dragDropEnabled` is already `false` on the main window (`tauri.conf.json`), so HTML5 drops reach the page with their URL / HTML data, not only as files. Explorer/Finder file drops keep working through `dataTransfer.files`.
- The download reuses what exists: `fetchPublic()` (public hosts only, redirects checked) and the Rust `import_image` command. **No new crate, no new plugin** for steps 1-4.
- The Pinterest view gets **no capabilities**: `capabilities/default.json` lists only `main`, so Pinterest's own scripts can't call REMind commands.

## 4. Steps

Each step is small, testable and committed on its own. Ask before starting the next one.

### Step 0: spike (half a day)
- Open `https://www.pinterest.com` in a second Tauri window from a dev-only menu item.
- In the main window, log every drop: `dataTransfer.types`, `text/uri-list`, `text/html`, `text/plain`, `files`.
- Try: drag a pin image from the grid, from an open pin, from a board. Windows (WebView2) first, then the MacBook (WKWebView).
- Record the payloads in §9 and save 3-5 real `text/html` payloads to `tests/fixtures/pinterest/`.
- **Decide:** does a plain drag carry the image URL on both systems? If yes → steps 1-3 as written. If no (Pinterest blocks dragging, or one OS drops nothing) → fallback in §6.

### Step 1: Pinterest window
- Rust command `open_pinterest` in `lib.rs`: builds a `WebviewWindow` with label `pinterest`, `WebviewUrl::External("https://www.pinterest.com")`, title "Pinterest". If it is already open, focus it instead.
- Remembers its size and position (meta table: `meta_set("pinterestWindow", …)`), opens beside the main window by default.
- Menu: **File > Open Pinterest** (and a shortcut, e.g. Ctrl/Cmd+Shift+P). Desktop only; hidden in the browser dev mode (`isDesktop()`).
- Sign-in persists between runs (same WebView2 / WKWebView profile in the app-data folder).
- Check: sign in, close the app, reopen → still signed in.

### Step 2: drop a URL → import (all sites, not just Pinterest)
- New pure module `src/sources/pinterest/parse.ts`:
  - `imageFromTransfer({ uriList, html, plain })` → `{ imageUrl, pageUrl?, title? }`: prefers the `<img src>` / `srcset` largest entry in `text/html`, then `text/uri-list`, then `text/plain`; `pageUrl` from the surrounding `<a href="/pin/…">`; `title` from `alt`.
  - `pinimgCandidates(url)` → `["…/originals/…", "…/736x/…", url]` for `i.pinimg.com`; just `[url]` for other hosts.
- `blobsFromTransfer` in `src/items/importImage.ts`: in the desktop app, download through `fetchPublic` (try candidates in order, first one that returns an `image/*` wins) instead of `fetch` (fixes the CORS backlog item for every site).
- The drop goes to the existing import path (`import_image`), placed at the drop point; duplicates (same hash) return the existing image, still placed on this board.
- Show progress on the dropped spot (placeholder card) and a clear error if the download fails ("Couldn't download that image. Save it and drop the file instead.").
- Unit tests: `tests/pinterest.test.ts` on the saved fixtures (URL picking, `originals` rewrite, non-Pinterest hosts unchanged).

### Step 3: Pinterest source data
- `Asset.source = { site: "Pinterest", url: <pin page>, imageUrl: <downloaded URL>, title: <alt text> }`. No `categories` (keeps the Award tab clean; Pinterest shows under the Source block and in search).
- Skip-by-`imageUrl` like the LIT import, plus the content hash.
- Inspector: the existing Source block shows "Pinterest" with a link to the pin (opens in the system browser via opener).
- Library: link badge on Pinterest images (already exists for sourced images).

### Step 4: multi-select drag (if the spike shows it's possible)
- Pinterest has no multi-select drag; instead: drag several pins one after another quickly, each drop queued (no blocking dialog). Check that 10 fast drops all land, in order, without UI lag.

### Step 5 (later, separate approval): docked side panel
- Pinterest as a resizable panel inside the main window instead of a second window. Needs Tauri's multi-webview API (`tauri` feature `unstable`): **ask before enabling**. Only worth it if the second window feels clumsy in real use.

### Step 6 (later, separate approval): "Grab this board / these results"
- Button in the REMind toolbar while the Pinterest window shows a board or search page.
- An injected script in the Pinterest view scrolls the page and collects pin image URLs + pin links, then hands the list to REMind. Handing data back needs a **remote capability** that lets `https://*.pinterest.com` call exactly one narrow command (e.g. `pinterest_collected(list)`); nothing else. Security trade-off: Pinterest's page could call that command. **Ask before adding.**
- Import runs through the same queue as step 2, with progress, Stop, and a cap (e.g. 200 per run).
- Breaks if Pinterest changes its page markup; keep the collector in one file with a fixture test.

## 5. Files touched

| File | Change |
|---|---|
| `src-tauri/src/lib.rs` | `open_pinterest` command (step 1) |
| `src-tauri/capabilities/default.json` | none for steps 1-4 (Pinterest window stays without permissions); step 6 adds one remote-URL capability, after approval |
| `src/sources/pinterest/parse.ts` | new, pure: drop payload → image URL, pin link, title; pinimg size rewrite |
| `src/sources/pinterest/source.ts` | new: builds `AssetSource` for Pinterest |
| `src/items/importImage.ts` | URL drops download through `fetchPublic` in the desktop app |
| `src/ui/MenuBar.tsx` | File > Open Pinterest |
| `tests/pinterest.test.ts`, `tests/fixtures/pinterest/` | new |
| `docs/PINTEREST.md`, `PROGRESS.md`, `MEMORY.md` | kept up to date per step |

## 6. Fallback if plain drag doesn't work (decided after step 0)

Pinterest may mark images non-draggable or WKWebView may not pass the URL between windows. Then:
- **A. Copy image address + paste:** right-click a pin image in the Pinterest view → Copy image address → Ctrl/Cmd+V on the board. The paste handler already accepts URLs; step 2 makes the download work. Zero extra permissions.
- **B. "Add to REMind" button on hover** (injected script in the Pinterest view), which needs the same narrow remote capability as step 6. Ask first.

## 7. Risks

- Pinterest changes markup or drag behaviour → the parser is pure and fixture-tested; re-save fixtures and fix.
- `/originals/` sometimes returns 403/404 → candidate list falls back to `736x`.
- Pinterest may ask to sign in again or show bot checks inside the embedded view; it is a normal browser view, so this should behave like Edge/Safari.
- macOS drag between two WKWebView windows is untested: step 0 checks it on the M3 before more code.

## 8. Terms and use

Browsing and saving single images by hand is what Pinterest's own "Save" does; downloads stay on this machine, nothing is uploaded. Bulk collection (step 6) is automated collection, which Pinterest's terms don't allow without permission: acceptable for internal REMSTUDIO reference use only, not for a distributed product. Pinterest images keep their pin link so the original creator can be traced.

## 9. Spike results

_(fill in during step 0: OS, where dragged from, `dataTransfer.types`, sample payload, works yes/no)_
