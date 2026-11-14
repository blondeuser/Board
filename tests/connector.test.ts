import { describe, expect, it } from 'vitest'
import { connectorPath } from '../src/canvas/connector'

describe('connectorPath', () => {
  const a = { x: 0, y: 0, w: 100, h: 100 }
  it('goes right edge to left edge for a card on the right', () => {
    expect(connectorPath(a, { x: 300, y: 0, w: 100, h: 100 })).toMatch(/^M100 50 C.* 300 50$/)
  })
  it('goes bottom edge to top edge for a card below', () => {
    expect(connectorPath(a, { x: 0, y: 300, w: 100, h: 100 })).toMatch(/^M50 100 C.* 50 300$/)
  })
  it('does not produce NaN for overlapping cards', () => {
    expect(connectorPath(a, a)).not.toMatch(/NaN/)
  })
})
