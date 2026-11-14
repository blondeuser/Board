import type { Rect } from '../shared/types'

export interface BentoInput {
  id: string
  /** Free-layout position (used only to keep reading order) and size (for aspect). */
  x: number
  y: number
  w: number
  h: number
  kind: 'image' | 'note'
  textLength?: number
}

export const BENTO_COLUMNS = 4
export const BENTO_CELL = 240
export const BENTO_GAP = 16

/** Column/row span for a card: wide images 2x1, tall 1x2, every 5th squarish image 2x2, notes 1x2 (tall). */
function spanOf(it: BentoInput, index: number): { c: number; r: number } {
  if (it.kind === 'note') return { c: 1, r: 2 } // notes are always tall
  const aspect = it.w / it.h
  if (aspect >= 1.5) return { c: 2, r: 1 }
  if (aspect <= 0.67) return { c: 1, r: 2 }
  return index % 5 === 0 ? { c: 2, r: 2 } : { c: 1, r: 1 }
}

/** Pack cards into a dense bento grid in reading order. Pure; the free layout is never modified. */
export function bentoLayout(items: BentoInput[], columns = BENTO_COLUMNS): Record<string, Rect> {
  const ordered = [...items].sort((a, b) => Math.round(a.y / 300) - Math.round(b.y / 300) || a.x - b.x)
  const used: boolean[][] = []
  const free = (r: number, c: number) => !used[r]?.[c]
  const out: Record<string, Rect> = {}
  const pitch = BENTO_CELL + BENTO_GAP
  const x0 = -(columns * BENTO_CELL + (columns - 1) * BENTO_GAP) / 2

  ordered.forEach((it, i) => {
    const span = spanOf(it, i)
    const cw = Math.min(span.c, columns)
    search: for (let r = 0; ; r++) {
      for (let c = 0; c + cw <= columns; c++) {
        let ok = true
        for (let dr = 0; dr < span.r && ok; dr++) for (let dc = 0; dc < cw; dc++) if (!free(r + dr, c + dc)) { ok = false; break }
        if (!ok) continue
        for (let dr = 0; dr < span.r; dr++) for (let dc = 0; dc < cw; dc++) (used[r + dr] ??= [])[c + dc] = true
        out[it.id] = {
          x: x0 + c * pitch,
          y: r * pitch,
          w: cw * BENTO_CELL + (cw - 1) * BENTO_GAP,
          h: span.r * BENTO_CELL + (span.r - 1) * BENTO_GAP,
        }
        break search
      }
    }
  })
  return out
}
