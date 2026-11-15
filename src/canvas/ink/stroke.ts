// Pure stroke geometry for pen ink (docs/PEN_INPUT.md §3-4). A stroke is a flat list [x0, y0, p0, x1, y1, p1, ...]:
// position in world units and pressure 0..1. The outline is always recomputed from these raw samples.
// shortcut: own variable-width outline instead of perfect-freehand (not approved); swap it in here if a nicer feel is wanted.
import type { Rect } from '../../shared/types'

/** Width at a pressure: light touch = 20% of the base size, full pressure = 100%. */
export const pressureWidth = (size: number, p: number): number => size * (0.2 + 0.8 * Math.min(1, Math.max(0, p)))

const r2 = (n: number) => Math.round(n * 100) / 100

/** Ramer-Douglas-Peucker on the x/y of the samples, keeping each kept sample's pressure. Ends are always kept. */
export function simplify(pts: number[], tolerance: number): number[] {
  const n = pts.length / 3
  if (n <= 2) return pts.slice()
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let far = -1
    let dmax = tolerance
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i * 3], pts[i * 3 + 1], pts[a * 3], pts[a * 3 + 1], pts[b * 3], pts[b * 3 + 1])
      if (d > dmax) {
        dmax = d
        far = i
      }
    }
    if (far >= 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])
  return out
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Box around the samples, grown by half the widest line so the whole stroke fits inside. */
export function strokeBounds(pts: number[], size: number): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < pts.length; i += 3) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i])
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1])
  }
  const h = size / 2
  return { x: x0 - h, y: y0 - h, w: x1 - x0 + size, h: y1 - y0 + size }
}

/** Same stroke with the origin moved to (ox, oy) and coordinates rounded to 2 decimals (typical stroke < 2 KB). */
export function toLocal(pts: number[], ox: number, oy: number): number[] {
  return pts.map((v, i) => (i % 3 === 0 ? r2(v - ox) : i % 3 === 1 ? r2(v - oy) : r2(v)))
}

/** SVG path (closed polygon with round caps) for a variable-width line through the samples. */
export function outlinePath(pts: number[], size: number): string {
  // Drop repeated positions: they have no direction.
  const p: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < pts.length; i += 3) {
    const last = p[p.length - 1]
    if (!last || Math.hypot(pts[i] - last.x, pts[i + 1] - last.y) > 0.01) p.push({ x: pts[i], y: pts[i + 1], r: pressureWidth(size, pts[i + 2]) / 2 })
    else last.r = Math.max(last.r, pressureWidth(size, pts[i + 2]) / 2)
  }
  if (!p.length) return ''
  const f = (n: number) => String(r2(n))
  if (p.length === 1) {
    const { x, y, r } = p[0]
    return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`
  }
  const left: string[] = []
  const right: string[] = []
  p.forEach((c, i) => {
    const a = p[Math.max(0, i - 1)]
    const b = p[Math.min(p.length - 1, i + 1)]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    left.push(`${f(c.x + nx * c.r)} ${f(c.y + ny * c.r)}`)
    right.push(`${f(c.x - nx * c.r)} ${f(c.y - ny * c.r)}`)
  })
  const end = p[p.length - 1]
  const start = p[0]
  return (
    `M${left.join('L')}` +
    `A${f(end.r)} ${f(end.r)} 0 0 1 ${right[right.length - 1]}` + // round cap at the end
    `L${right.slice(0, -1).reverse().join('L')}` +
    `A${f(start.r)} ${f(start.r)} 0 0 1 ${left[0]}Z` // round cap at the start
  )
}

/** True when (x, y) is within the line's half width (plus tolerance) of the stroke. Coordinates in the stroke's own space. */
export function hitsStroke(pts: number[], size: number, x: number, y: number, tolerance = 0): boolean {
  const reach = size / 2 + tolerance
  if (pts.length === 3) return Math.hypot(x - pts[0], y - pts[1]) <= reach
  for (let i = 0; i + 5 < pts.length; i += 3) {
    if (segDist(x, y, pts[i], pts[i + 1], pts[i + 3], pts[i + 4]) <= reach) return true
  }
  return false
}
