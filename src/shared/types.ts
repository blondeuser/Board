export interface ViewState {
  x: number
  y: number
  zoom: number
}

export interface Board {
  id: string
  name: string
  createdAt: number
  view: ViewState
  /** 'free' = positions as placed; 'bento' = auto-aligned card grid (non-destructive). Default free. */
  mode?: 'free' | 'bento'
}

export interface PaletteColor {
  hex: string
  share: number
}

/** A library item: the image itself plus its tags. Boards reference assets via Placements. */
export interface Asset {
  id: string
  width: number
  height: number
  palette: PaletteColor[]
  /** Colour family names (see categorize/color/families). Auto-filled on import, editable. */
  colors: string[]
  categoryIds: string[]
  /** Image kinds (photo, screenshot, ...; see categorize/style/labels). Undefined = not detected yet. */
  types?: string[]
  /** Version of the finer space tags (facade, atrium, ...) last detected; older or missing = detect again (see SPACES_VERSION). */
  spacesVersion?: number
  /** CLIP image embedding (unit length) for search by meaning. Undefined = not computed yet. */
  embedding?: Float32Array
  /** Which model made `embedding` (see categorize/style/model). Embeddings from another model are recomputed. */
  embeddingModel?: string
  /** SHA-256 (hex) of the original file; identifies the image across libraries (.bo dedupe). Missing on older images, filled when needed. */
  hash?: string
  /** Where the image was imported from (e.g. a LIT Awards winner page). Missing for pasted/dropped files. */
  source?: AssetSource
  createdAt: number
}

/** Origin of an imported image, kept for credits, linking back and search. */
export interface AssetSource {
  /** Site name shown in the app, e.g. "LIT Awards". */
  site: string
  /** Page the image belongs to (opened by the inspector link). */
  url: string
  /** The image file's own URL; used to skip photos already in the library. */
  imageUrl?: string
  /** Project / page title. */
  title?: string
  /** The site's own categories (award categories for LIT); searchable and groupable in the Library. */
  categories?: string[]
  /** Photographer credit. */
  credit?: string
  /** Other labelled credits in display order (company, designers, location, edition, …); searchable. */
  details?: Record<string, string>
}

/** Note colours: muted greys only (light to dark). Shapes keep NOTE_TINTS. */
export const NOTE_GREYS = ['#dcdcd8', '#cfcfcb', '#c2c2be', '#e8e8e5', '#b5b5b1'] as const
/** Notes are always tall 3:4 cards (width:height). */
export const NOTE_W = 240
export const NOTE_H = 320
export const noteHeight = (w: number): number => Math.round((w * 4) / 3)

export const NOTE_TINTS = ['#f9e2af', '#f5c2e7', '#a6e3a1', '#89dceb', '#cba6f7'] as const

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'diamond'

/** One pen stroke (docs/PEN_INPUT.md). points = flat [x, y, pressure, ...] in world units relative to the placement; the outline is recomputed. */
export interface InkStroke {
  tool: 'pen'
  /** 'auto' follows the theme text colour. */
  color: string
  /** Line width at full pressure, world units. */
  size: number
  points: number[]
}

/** Look of a plain text item (`kind: 'text'`). */
export interface TextFormat {
  /** Key into TEXT_FONTS. */
  font: string
  /** World units (px at 100% zoom). */
  size: number
  /** 'auto' follows the theme text colour. */
  color: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
}
export const TEXT_FONTS: Record<string, { name: string; css: string }> = {
  sans: { name: 'Sans', css: 'system-ui, "Segoe UI", sans-serif' },
  serif: { name: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  mono: { name: 'Mono', css: 'Consolas, "Courier New", monospace' },
  hand: { name: 'Handwritten', css: '"Segoe Print", "Bradley Hand", cursive' },
}
export const TEXT_SIZES = [12, 16, 20, 28, 40, 64, 96] as const
export const TEXT_COLORS = ['auto', '#e5484d', '#f08a24', '#46a758', '#3e63dd', '#e93d82'] as const
export const DEFAULT_TEXT_FORMAT: TextFormat = { font: 'sans', size: 28, color: 'auto', bold: false, italic: false, align: 'left' }

/** An image (references an Asset), a text note card or a drawn shape on a board's canvas. `kind` missing = image. */
export interface Placement {
  id: string
  boardId: string
  kind?: 'image' | 'note' | 'shape' | 'ink' | 'text'
  /** When a note or text box was made (shown in the Library's date sections); older ones fall back to their board's date. */
  createdAt?: number
  /** Look of a text item, for `kind: 'text'` (the words are in `text`; w/h is its box, text wraps at w). */
  fmt?: TextFormat
  /** Pen stroke, for `kind: 'ink'`. x/y/w/h is its bounding box; points are relative to x/y. */
  ink?: InkStroke
  /** Which geometry, for `kind: 'shape'` (colour is `tint`). */
  shape?: ShapeKind
  /** Empty for notes and shapes. */
  assetId: string
  text?: string
  tint?: string
  x: number
  y: number
  w: number
  h: number
  z: number
}

/** A curved line linking two cards on a free-layout board. */
export interface Connection {
  id: string
  boardId: string
  /** Placement ids (not assets: the same image can sit twice on a board). */
  from: string
  to: string
}

export interface Category {
  id: string
  name: string
  color: string
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
