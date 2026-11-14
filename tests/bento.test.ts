import { describe, expect, it } from 'vitest'
import { bentoLayout, type BentoInput } from '../src/canvas/bento'

const img = (id: string, w: number, h: number, x = 0, y = 0): BentoInput => ({ id, x, y, w, h, kind: 'image' })
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('bentoLayout', () => {
  const items: BentoInput[] = [
    img('a', 100, 100, 0, 0), img('b', 300, 100, 200, 0), img('c', 100, 300, 600, 0),
    img('d', 200, 180, 0, 400), { id: 'n1', x: 300, y: 400, w: 240, h: 160, kind: 'note', textLength: 10 },
    { id: 'n2', x: 600, y: 400, w: 240, h: 160, kind: 'note', textLength: 300 }, img('e', 100, 100, 0, 800),
  ]
  const out = bentoLayout(items)

  it('places every item without overlap', () => {
    const rects = Object.values(out)
    expect(rects).toHaveLength(items.length)
    rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)))
  })
  it('stays inside 4 columns and is centred on x=0', () => {
    const rects = Object.values(out)
    expect(Math.min(...rects.map((r) => r.x))).toBe(-504)
    expect(Math.max(...rects.map((r) => r.x + r.w))).toBeLessThanOrEqual(504)
  })
  it('gives wide images 2x1 and tall images 1x2', () => {
    expect(out.b.w).toBeGreaterThan(out.b.h)
    expect(out.c.h).toBeGreaterThan(out.c.w)
  })
  it('is deterministic', () => expect(bentoLayout(items)).toEqual(out))
})
