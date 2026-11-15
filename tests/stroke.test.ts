import { describe, expect, it } from 'vitest'
import { hitsStroke, outlinePath, pressureWidth, simplify, strokeBounds, toLocal } from '../src/canvas/ink/stroke'

const line = (n: number) => Array.from({ length: n }, (_, i) => [i * 2, 0, 0.5]).flat()

describe('ink stroke geometry', () => {
  it('width follows pressure', () => {
    expect(pressureWidth(10, 0)).toBeCloseTo(2)
    expect(pressureWidth(10, 1)).toBeCloseTo(10)
    expect(pressureWidth(10, 5)).toBeCloseTo(10) // clamped
  })

  it('simplify keeps the ends and drops collinear points', () => {
    const out = simplify(line(50), 0.5)
    expect(out).toEqual([0, 0, 0.5, 98, 0, 0.5])
  })

  it('simplify keeps a real corner and the pressure of kept samples', () => {
    const pts = [0, 0, 0.1, 10, 0, 0.2, 10, 10, 0.9]
    expect(simplify(pts, 0.5)).toEqual(pts)
  })

  it('bounds include half the widest line', () => {
    expect(strokeBounds([10, 20, 0.5, 30, 50, 1], 8)).toEqual({ x: 6, y: 16, w: 28, h: 38 })
  })

  it('toLocal moves the origin and rounds', () => {
    expect(toLocal([10.123, 20.456, 0.55555], 10, 20)).toEqual([0.12, 0.46, 0.56])
  })

  it('outline is a closed path; a single point is a dot; empty is empty', () => {
    expect(outlinePath([0, 0, 1, 20, 0, 1, 40, 10, 1], 6)).toMatch(/^M.*Z$/)
    expect(outlinePath([5, 5, 1], 6)).toMatch(/^M2 5a3 3/)
    expect(outlinePath([], 6)).toBe('')
  })

  it('outline of a straight horizontal line spans its width on both sides', () => {
    const d = outlinePath([0, 0, 1, 10, 0, 1], 4)
    const ys = [...d.matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]))
    expect(Math.min(...ys)).toBeCloseTo(-2)
    expect(Math.max(...ys)).toBeCloseTo(2)
  })

  it('hit test: on the line, near it, far from it', () => {
    const s = [0, 0, 1, 100, 0, 1]
    expect(hitsStroke(s, 6, 50, 2)).toBe(true)
    expect(hitsStroke(s, 6, 50, 4)).toBe(false)
    expect(hitsStroke(s, 6, 50, 4, 2)).toBe(true)
    expect(hitsStroke(s, 6, 150, 0)).toBe(false)
    expect(hitsStroke([5, 5, 1], 6, 6, 6)).toBe(true)
  })
})
