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
  /** CLIP image embedding (unit length) for search by meaning. Undefined = not computed yet. */
  embedding?: Float32Array
  /** Which model made `embedding` (see categorize/style/model). Embeddings from another model are recomputed. */
  embeddingModel?: string
  createdAt: number
}

export const NOTE_TINTS = ['#f9e2af', '#f5c2e7', '#a6e3a1', '#89dceb', '#cba6f7'] as const

/** An image (references an Asset) or a text note card on a board's canvas. `kind` missing = image. */
export interface Placement {
  id: string
  boardId: string
  kind?: 'image' | 'note'
  /** Empty for notes. */
  assetId: string
  text?: string
  tint?: string
  x: number
  y: number
  w: number
  h: number
  z: number
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
