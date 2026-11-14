import type { Rect, ViewState } from '../shared/types'

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 8

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const screenToWorld = (v: ViewState, sx: number, sy: number) => ({
  x: (sx - v.x) / v.zoom,
  y: (sy - v.y) / v.zoom,
})

/** Zoom keeping the world point under (sx, sy) fixed. */
export function zoomAt(v: ViewState, sx: number, sy: number, nextZoom: number): ViewState {
  const zoom = clampZoom(nextZoom)
  const k = zoom / v.zoom
  return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k }
}

/** View that fits `rect` (world units) inside a viewport of the given size. */
export function fitRect(rect: Rect, width: number, height: number, pad = 80): ViewState {
  const zoom = clampZoom(Math.min((width - pad * 2) / rect.w, (height - pad * 2) / rect.h, 1.5))
  return {
    zoom,
    x: width / 2 - (rect.x + rect.w / 2) * zoom,
    y: height / 2 - (rect.y + rect.h / 2) * zoom,
  }
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  const x1 = Math.min(...rects.map((r) => r.x))
  const y1 = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.w))
  const y2 = Math.max(...rects.map((r) => r.y + r.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/** Lay `sizes` out in a grid centred on (cx, cy); returns top-left positions. */
export function gridLayout(sizes: { w: number; h: number }[], cx: number, cy: number, gap = 24) {
  const cols = Math.ceil(Math.sqrt(sizes.length))
  const rows: { w: number; h: number }[][] = []
  sizes.forEach((s, i) => (rows[Math.floor(i / cols)] ??= []).push(s))
  const rowW = rows.map((r) => r.reduce((n, s) => n + s.w, 0) + gap * (r.length - 1))
  const rowH = rows.map((r) => Math.max(...r.map((s) => s.h)))
  const totalH = rowH.reduce((n, h) => n + h, 0) + gap * (rows.length - 1)
  const out: { x: number; y: number }[] = []
  let y = cy - totalH / 2
  rows.forEach((r, ri) => {
    let x = cx - rowW[ri] / 2
    r.forEach((s) => {
      out.push({ x, y })
      x += s.w + gap
    })
    y += rowH[ri] + gap
  })
  return out
}
