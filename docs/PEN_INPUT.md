# Pen input (Wacom) — freeform drawing plan

Status: **Phase 0 tool built 2026-11-15** (Help > Pen test; hardware results still to record in §1), the rest planned. Goal: draw and brainstorm on a board with a Wacom pen
(pressure-sensitive strokes, eraser end, highlighter), next to the images, notes and shapes that are already there.
Free layout only; Cards mode (bento) hides ink, like shapes.

## 1. What the platform gives us

Everything comes through the standard **Pointer Events** API; no Wacom SDK, no Rust plugin needed on Windows.

| Field | Use |
|---|---|
| `pointerType === 'pen'` | Tells pen from mouse/touch → pen draws, mouse keeps selecting |
| `pressure` (0–1) | Stroke width / opacity. Mouse reports a fixed 0.5 (0 when no button is down) |
| `tiltX`, `tiltY` | Later: marker angle, softer edge when the pen leans |
| `buttons & 32` | Eraser end of the pen (flip the pen to erase) |
| `buttons & 2` | Lower barrel button (arrives as a right click) |
| `pointermove` with `buttons === 0` | Pen hovering: show the brush cursor before touching |
| `getCoalescedEvents()` | All samples between frames (Wacom sends ~200 Hz, the screen 60 Hz): smooth fast curves |
| `getPredictedEvents()` | Optional: draw a few ms ahead to hide latency (Chromium) |

### Platform risks (check first, spike in Phase 0)

- **Windows / WebView2 (Chromium)**: works when the Wacom driver's **"Use Windows Ink"** is on (default). With Windows Ink
  off, Chromium does not read WinTab: the pen arrives as `mouse` with no pressure. App behaviour: if the first pen-ish
  stroke has constant pressure, show a one-time hint ("Turn on Windows Ink in Wacom Tablet Properties for pressure").
  Windows Ink also brings "press and hold = right click" and pen flicks: `touch-action: none` on the viewport and
  test that press-and-hold does not open our context menu mid-stroke.
- **macOS / Tauri = WKWebView (WebKit)**: Safari is known to report a Wacom pen as `pointerType: 'mouse'`. WebKit
  passes the NSEvent pressure through, so pressure may still be real. Plan: treat a "mouse" whose pressure varies
  between 0 and 1 (not 0 / 0.5 / 1) as a pen. If even that fails, Mac gets constant-width ink, or a small Tauri
  Rust plugin later that forwards NSEvent tablet data. Must be measured on the MacBook before promising Mac pressure.
- `getCoalescedEvents` / `getPredictedEvents` are missing in some WebKit versions: feature-check and fall back.
- Browser build in Edge = same as WebView2, so most work can be tested with `npm run dev`.

## 2. Interaction design

**Pen mode** (toolbar toggle, shortcut `P`; a Wacom ExpressKey can be mapped to it):

- **Pen draws, mouse edits.** While pen mode is on, `pointerType === 'pen'` always draws; the mouse keeps select/move/
  marquee/pan as today. Like Freeform / GoodNotes on iPad. No need to switch tools to move a photo.
- Option "Pen draws anywhere" (default **on**): the pen draws even when pen mode is off? → **Decide** (see Open questions).
- **Eraser end** → eraser automatically while flipped, back to the previous tool after.
- **Barrel button** → hold to pan (most natural on a tablet). Alternative: eyedropper. Configurable later.
- Pen tip on a card with pen mode **off** → behaves like the mouse (select/move), so a pen-only user can still work.
- Space + pen drag = pan, Ctrl/Cmd + pen drag up/down = zoom (matches PureRef/Photoshop habits).
- Touch (if a touch-enabled Wacom/Cintiq): ignored for drawing while the pen is near (palm rejection); two fingers pan/zoom.

**Tools** (small bottom bar, next to the existing shapes/link bar):

| Tool | Behaviour |
|---|---|
| Pen | Pressure → width (perfect-freehand), solid colour |
| Marker | Constant width, round, slightly translucent |
| Highlighter | Wide, `mix-blend-mode: multiply`, ~40% opacity; for marking up photos |
| Eraser | **Stroke eraser** first (touch a stroke → whole stroke goes). Partial (split) eraser later |
| Lasso | Pen-drawn loop selects strokes *and* cards inside it; then move/delete/recolour as usual |

- **Colours**: 6 swatches: ink (auto black in Concrete / white in Concrete Dark), + 5 fixed accents. Eyedropper from a
  photo is a lighting-designer win (pick the warm glow of a reference). Never hard-coded UI colours; ink colours are
  stored values like swatches.
- **Sizes**: 3 presets (fine / medium / bold) + slider. Width is in **screen px at draw time**, converted to world units
  (`/ zoom`), so a stroke drawn zoomed out is bold in world space, and zoomed in you can write small annotations.
- **Brush cursor** while hovering: a circle the size of the current width.
- **Shift while drawing** = straight line (classic). Hold at the end of a stroke (~600 ms) → snap to line/arrow/circle
  ("shape recognition", Freeform-style) — later.

**Brainstorm extras (later, pick after using it):**

- **Arrow-tipped strokes** (draw a line → choose "arrow" in the inspector) for flow diagrams.
- **Handwriting stays ink**; OCR to make it searchable (Tesseract.js lazy model, see MEMORY OCR note) much later.
- **Light brush** (lighting-specific, a differentiator): soft glow brush with `screen`/additive blend + blur, to paint
  a wash, a grazing streak or a beam cone over a reference photo or a SketchUp screenshot. Turns the board into a
  quick lighting-concept sketch tool.
- **Attach ink to an image**: strokes drawn on a photo move/scale with it (a group); also "Export annotated image".
- **Sketch frame**: a blank paper card (kind `note`-like) to draw on, so sketches tile with photos in Cards mode.

## 3. Data model

Each stroke is a **Placement** with `kind: 'ink'` (like `note` and `shape`). It reuses everything that exists:
selection, move, resize, z-order, Arrange/Align, copy/paste, connections, Delete, `.bo`.

```ts
// src/shared/types.ts (planned)
interface InkStroke {
  tool: 'pen' | 'marker' | 'highlighter' | 'light'
  color: string          // hex
  size: number           // base width, world units
  opacity?: number
  /** Raw samples, relative to the placement's x/y, in world units at creation:
   *  flat [x0, y0, p0, x1, y1, p1, …]; p = pressure 0..1 (0.5 when unknown). */
  points: number[]
  /** Size of the box the points were recorded in; resize scales points by w/w0, h/h0. */
  w0: number
  h0: number
  simulatePressure?: boolean // true when the device gave no real pressure (mouse / Windows Ink off)
}
// Placement gains optional `ink?: InkStroke` (only for kind 'ink'). assetId = '' (no asset).
```

- Store the **raw input**, never the outline polygon: the outline is recomputed on render, so smoothing settings,
  colour and width can change later.
- On stroke end: Ramer–Douglas–Peucker simplify (tolerance ~0.5 screen px) and round to 2 decimals; a typical stroke
  stays < 2 KB.
- Bounding box = points' bounds + half width → `x, y, w, h` of the placement (marquee and hit tests keep working).
- Storage: new optional field → per CLAUDE.md, still add a numbered IndexedDB migration (no-op upgrade that records
  the version) so the SQLite migration later knows the shape. SQLite: same JSON in the placement row, or a
  `placement_ink` table (`docs/SQLITE_SCHEMA.md` to update when the storage step starts).
- `.bo`: ink placements live in `board.json`; an older app would not know `kind: 'ink'` → **bump `formatVersion` to 2**
  (older readers refuse with "made by a newer Board"). Ship the missing `connections.json` in the same bump.
- Ink is **not** an Asset: it never shows in the Library, search or tagging.

## 4. Rendering

Two layers, so drawing stays fast with 500 photos on the board:

1. **Live stroke**: a `<canvas>` overlay in **screen space** on top of the viewport,
   `getContext('2d', { desynchronized: true })` (low-latency in Chromium). Each `pointermove` pushes the coalesced
   samples, redraws the stroke's outline with perfect-freehand, no React state per sample (refs only).
2. **Committed strokes**: on `pointerup` the stroke becomes a placement and renders as an SVG `<path>` inside the
   existing `.world` transform: vector, stays crisp at any zoom, picks up selection/dim/z-index like other items.
   `Item` stays `memo`'d; the outline path string is memoised on `points + size`.

- Outline: **perfect-freehand** (`getStroke(points, { size, thinning, smoothing, streamline, simulatePressure })`),
  MIT, tiny, no dependencies, the library tldraw/Excalidraw use. **Needs approval** (CLAUDE.md dependency rule);
  fallback is writing our own (Catmull-Rom centre line + variable-width offset), ~150 lines.
- Pressure curve: `p' = p ^ gamma` (gamma setting 0.6–1.6, default 1) before perfect-freehand, so light hands still get
  thick lines.
- Hit testing (eraser, click-select): distance from point to each segment ≤ half width + tolerance; check bounding
  boxes first.
- Board JPEG export: draw ink into the export canvas with the same outline function (Path2D from the SVG path).
- Perf check: add ink to `scripts/perf.mjs` (500 photos + 2,000 strokes); if SVG gets slow, rasterise strokes per
  tile into cached bitmaps when not selected.

## 5. Code layout

```
src/canvas/ink/
  types.ts       re-export of InkStroke helpers (types themselves in shared/types.ts)
  input.ts       pointer → samples: pen detection, coalesced events, pressure fallback, eraser/barrel buttons (pure functions)
  stroke.ts      outline (perfect-freehand wrapper), simplify (RDP), bounds, scale on resize (pure, unit-tested)
  hit.ts         point-to-stroke distance, lasso polygon contains (pure, unit-tested)
  LiveInk.tsx    the screen-space canvas overlay for the stroke in progress
src/items/       ink item renderer (SVG path), next to the other item renderers
src/ui/          InkToolbar (tool, colour, size), brush cursor
```

`Canvas.tsx` gains a `Drag` kind `'ink'` and `'erase'`; the pen branch goes before the existing pan/tool/marquee checks
in `onPointerDown`. Pen settings (tool, colour, size, gamma, "pen draws anywhere") live in localStorage like the theme;
they are UI preferences, not board data.

## 6. Undo / redo

The canvas has no undo yet (roadmap §1). Drawing without undo is unusable, so **undo/redo comes first** (Phase 1):
a command stack in `useBoardApp` (add / remove / patch placements, with before/after snapshots), Ctrl/Cmd+Z,
Shift+Ctrl/Cmd+Z / Ctrl+Y, covering all existing edits, not just ink. Per board, in memory, cleared on reload.

## 7. Phases

| Phase | Scope | Done when |
|---|---|---|
| 0. Spike | Debug page/overlay logging `pointerType`, `pressure`, `tilt`, `buttons`, coalesced count. Test Wacom on Windows (Ink on / off), in Edge + the installed app, and on the MacBook (Tauri dev) | Know where pressure works; risks in §1 confirmed or removed |
| 1. Undo/redo | Command stack for all canvas edits | Undo works for move/resize/delete/paste/shapes/notes |
| 2. Basic ink (**built 2026-11-15**, browser smoke only; real pen + undo + JPEG export open) | Pen mode, pen tool (pressure), live canvas + SVG commit, colours/sizes, stroke eraser incl. eraser end, select/move/delete strokes, IndexedDB migration | Draw a page of notes over photos smoothly; reload keeps it |
| 3. Save + export | `.bo` formatVersion 2 (ink + connections), board JPEG export includes ink, perf check with 2k strokes | Round-trip a `.bo` with ink; old app refuses it cleanly |
| 4. Brainstorm tools | Marker, highlighter, lasso, Shift straight line, barrel-button pan, brush cursor, pressure curve setting, Windows Ink hint | Feels like a sketch app, not a demo |
| 5. Extras | Light brush, arrows, attach-to-image + annotated export, shape recognition, tilt, partial eraser, sketch frames in bento, Mac native pressure plugin if needed | Picked one by one after using phase 4 |

## 8. Tests

- Unit (Vitest): `stroke.ts` (simplify keeps ends, bounds incl. width, resize scaling), `hit.ts` (eraser hits / misses,
  lasso), `input.ts` (pressure fallback, eraser detection from `buttons`), `.bo` v2 read/write + refusal of v2 by v1 logic.
- Playwright: CDP `Input.dispatchMouseEvent` supports `pointerType: 'pen'`, `force` and `tiltX/Y`, so a smoke script
  (`scripts/smoke-ink.mjs`) can draw a pressure stroke, erase it, undo, and screenshot.
- By hand with the real Wacom (CLAUDE.md canvas rule): latency feel, eraser flip, barrel button, Windows Ink on/off,
  and on macOS.

## 9. Open questions (for me to decide)

1. Does the pen draw **only in pen mode**, or always (mouse = edit, pen = draw, no mode)? Always-draw is faster for
   brainstorming but means the pen can't move photos unless a modifier/barrel button is used.
2. Barrel button: pan, eyedropper, or right-click menu?
3. Approve **perfect-freehand** as a dependency, or write our own outline?
4. Ink colours: free colour picker, or a fixed small palette only?
5. Should strokes drawn over a photo attach to it automatically?
