import type { Rect } from '../shared/types'

export type OrderMode = 'front' | 'forward' | 'backward' | 'back'
export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom' | 'hdist' | 'vdist'

/** New z for every card whose stacking changes when `selected` moves in the given direction. Stacking is normalised to 1..n. */
export function reorderZ(items: { id: string; z: number }[], selected: Set<string>, mode: OrderMode): Record<string, number> {
  const order = [...items].sort((a, b) => a.z - b.z).map((i) => i.id)
  const sel = (id: string) => selected.has(id)
  let next = order
  if (mode === 'front') next = [...order.filter((i) => !sel(i)), ...order.filter(sel)]
  else if (mode === 'back') next = [...order.filter(sel), ...order.filter((i) => !sel(i))]
  else {
    next = [...order]
    if (mode === 'forward') {
      for (let i = next.length - 2; i >= 0; i--) if (sel(next[i]) && !sel(next[i + 1])) [next[i], next[i + 1]] = [next[i + 1], next[i]]
    } else {
      for (let i = 1; i < next.length; i++) if (sel(next[i]) && !sel(next[i - 1])) [next[i], next[i - 1]] = [next[i - 1], next[i]]
    }
  }
  const z = new Map(items.map((i) => [i.id, i.z]))
  return Object.fromEntries(next.flatMap((id, i) => (z.get(id) === i + 1 ? [] : [[id, i + 1]])))
}

/** New x / y for cards aligned to each other (or spread evenly, for 'hdist' / 'vdist': the outer two stay put). */
export function alignPatches(rects: (Rect & { id: string })[], mode: AlignMode): Record<string, { x?: number; y?: number }> {
  if (rects.length < 2) return {}
  const left = Math.min(...rects.map((r) => r.x))
  const right = Math.max(...rects.map((r) => r.x + r.w))
  const top = Math.min(...rects.map((r) => r.y))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  const out: Record<string, { x?: number; y?: number }> = {}
  if (mode === 'hdist' || mode === 'vdist') {
    const h = mode === 'hdist'
    const sorted = [...rects].sort((a, b) => (h ? a.x - b.x : a.y - b.y))
    const size = (r: Rect) => (h ? r.w : r.h)
    const gap = ((h ? right - left : bottom - top) - sorted.reduce((n, r) => n + size(r), 0)) / (sorted.length - 1)
    let pos = h ? left : top
    for (const r of sorted) {
      out[r.id] = h ? { x: pos } : { y: pos }
      pos += size(r) + gap
    }
    return out
  }
  for (const r of rects) {
    out[r.id] =
      mode === 'left' ? { x: left }
      : mode === 'right' ? { x: right - r.w }
      : mode === 'hcenter' ? { x: (left + right) / 2 - r.w / 2 }
      : mode === 'top' ? { y: top }
      : mode === 'bottom' ? { y: bottom - r.h }
      : { y: (top + bottom) / 2 - r.h / 2 }
  }
  return out
}
