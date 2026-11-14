import { describe, expect, it } from 'vitest'
import { fitRect, gridLayout, screenToWorld, zoomAt } from '../src/canvas/viewport'

describe('viewport', () => {
  it('zoomAt keeps the point under the cursor fixed', () => {
    const v = { x: 30, y: -20, zoom: 1 }
    const before = screenToWorld(v, 200, 150)
    const after = screenToWorld(zoomAt(v, 200, 150, 2.5), 200, 150)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })
  it('fitRect centres the rect', () => {
    const v = fitRect({ x: 100, y: 100, w: 400, h: 200 }, 1000, 800, 0)
    expect(screenToWorld(v, 500, 400).x).toBeCloseTo(300)
    expect(screenToWorld(v, 500, 400).y).toBeCloseTo(200)
  })
  it('gridLayout centres items', () => {
    const p = gridLayout([{ w: 100, h: 100 }], 0, 0)
    expect(p).toEqual([{ x: -50, y: -50 }])
  })
})

import { snapDelta } from '../src/canvas/viewport'
describe('snapDelta', () => {
  it('lands the corner on the grid', () => {
    expect(10 + snapDelta(10, 30)).toBe(48)
    expect(0 + snapDelta(0, 11)).toBe(0)
    expect(-5 + snapDelta(-5, -10)).toBe(-24)
  })
})
