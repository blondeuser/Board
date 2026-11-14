import type { Rect } from '../shared/types'

/** SVG path for a curved line between two cards: leaves the facing edges and bends with the dominant direction. */
export function connectorPath(a: Rect, b: Rect): string {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const dx = bc.x - ac.x
  const dy = bc.y - ac.y
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const sx = Math.sign(dx) || 1
  const sy = Math.sign(dy) || 1
  const p = horizontal
    ? { x1: ac.x + (sx * a.w) / 2, y1: ac.y, x2: bc.x - (sx * b.w) / 2, y2: bc.y }
    : { x1: ac.x, y1: ac.y + (sy * a.h) / 2, x2: bc.x, y2: bc.y - (sy * b.h) / 2 }
  const k = Math.max(40, (horizontal ? Math.abs(p.x2 - p.x1) : Math.abs(p.y2 - p.y1)) / 2)
  const c1 = horizontal ? { x: p.x1 + sx * k, y: p.y1 } : { x: p.x1, y: p.y1 + sy * k }
  const c2 = horizontal ? { x: p.x2 - sx * k, y: p.y2 } : { x: p.x2, y: p.y2 - sy * k }
  return `M${p.x1} ${p.y1} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p.x2} ${p.y2}`
}
