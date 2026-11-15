# REMind on macOS — port plan and build guide

Status: **planned, not built yet** (2026-11-15). Nothing in the code has changed for Mac so far.

## Scope

- Users: me and my colleague. Not public distribution.
- Machines: all Apple Silicon (my MacBook M3 Pro, colleague's Mac). Build `aarch64-apple-darwin` only — no universal (Intel) build.
- Signing: ad-hoc only (free). No Apple Developer account, no notarization for now.

## Why the port is small

The Rust backend (`src-tauri/src`) has no Windows-only code:

- Storage uses `app.path().app_data_dir()` → on Mac: `~/Library/Application Support/com.remstudio.remind/` (`board.sqlite` + `library/originals`, `library/thumbs`).
- Paths use `PathBuf`; `files.rs` is platform-neutral.
- SQLite is `rusqlite` with `bundled` — no system dependency.
- `ort` (ONNX Runtime) downloads a prebuilt runtime for `aarch64-apple-darwin`. SigLIP runs on CPU on Apple Silicon; CoreML is an optional later speed-up. `DirectML.dll` is Windows-only and is not needed on Mac.
- `icons/icon.icns` already exists.

## Plan

### 1. Config (`src-tauri/tauri.conf.json`)
- `bundle.targets`: add `"app"` and `"dmg"` next to `"nsis"`, `"msi"` (or use `"all"`).
- Add a macOS block:
  ```json
  "macOS": {
    "signingIdentity": "-",
    "minimumSystemVersion": "13.0"
  }
  ```
  `"-"` = ad-hoc signature. Apple Silicon refuses to run unsigned code, so this is required even for private use.

### 2. Bundle the SigLIP model (fixes Windows too)
- The model files in `src-tauri/resources/models/siglip-base-patch16-224/` (~210 MB) are **not** in `bundle.resources` yet, so the installed app would not have them on either platform.
- Add to `bundle`:
  ```json
  "resources": { "resources/models/": "models/" }
  ```
- Load from `app.path().resource_dir()?.join("models/siglip-base-patch16-224")` when `analyze` is wired into the commands. On Mac this resolves to `REMind.app/Contents/Resources/models/...`.

### 3. Frontend checks (WebKit, not Chromium)
On Mac the UI runs in WKWebView (Safari engine) instead of WebView2 (Chromium). Test:
- Keyboard shortcuts: use `e.metaKey` (Cmd) on Mac where Windows uses `e.ctrlKey`. Check every shortcut handler.
- Pen / trackpad input (see `PEN_INPUT.md`): pressure, pinch-zoom and two-finger pan behave differently in Safari.
- Drag and drop of images from Finder and from Safari/Chrome (`dragDropEnabled: false` → HTML5 drag-drop path).
- Canvas performance and any CSS that only works in Chromium.
- Optional later: a native macOS app menu (REMind / File / Edit / View) so Cmd+C, Cmd+V, Cmd+Q work as Mac users expect.

### 4. Build — on the MacBook M3 Pro

One-time setup:
```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Node 20+ (e.g. from nodejs.org or `brew install node`)
git clone https://github.com/blondeuser/Board.git
cd Board
npm install
```

Each build:
```bash
npm run tauri build
```
Output:
- `src-tauri/target/release/bundle/macos/REMind.app`
- `src-tauri/target/release/bundle/dmg/REMind_<version>_aarch64.dmg`

Dev mode while testing Mac fixes: `npm run tauri dev` (or `npm run dev` for browser-only UI work).

### 5. Install on a colleague's Mac (one time)

Because the app is ad-hoc signed and not notarized, macOS blocks the first launch ("REMind is damaged" or "cannot be verified").

1. Open the `.dmg`, drag **REMind** to **Applications**.
2. Either:
   - Terminal: `xattr -cr /Applications/REMind.app`, then open the app normally, **or**
   - Try to open the app once → System Settings → Privacy & Security → **Open Anyway**.
3. After that it opens normally. Repeat for each new version.

## Later (only if needed)
- Apple Developer account ($99/yr) → Developer ID signing + notarization → no Gatekeeper warning.
- GitHub Actions: build Windows and Mac installers automatically on each release.
- CoreML execution provider in `ort` for faster tagging.
