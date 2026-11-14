import { describe, expect, it } from 'vitest'
import { alignPatches, reorderZ } from '../src/canvas/arrange'

const items = [{ id: 'a', z: 1 }, { id: 'b', z: 2 }, { id: 'c', z: 3 }, { id: 'd', z: 4 }]

describe('reorderZ', () => {
  it('sends to back and brings to front, keeping the rest in order', () => {
    expect(reorderZ(items, new Set(['c']), 'back')).toEqual({ c: 1, a: 2, b: 3 })
    expect(reorderZ(items, new Set(['a']), 'front')).toEqual({ b: 1, c: 2, d: 3, a: 4 })
  })
  it('moves one step and stops at the ends', () => {
    expect(reorderZ(items, new Set(['b']), 'forward')).toEqual({ c: 2, b: 3 })
    expect(reorderZ(items, new Set(['b']), 'backward')).toEqual({ b: 1, a: 2 })
    expect(reorderZ(items, new Set(['d']), 'front')).toEqual({})
    expect(reorderZ(items, new Set(['a']), 'backward')).toEqual({})
  })
  it('moves a multi-selection together', () => {
    expect(reorderZ(items, new Set(['a', 'b']), 'forward')).toEqual({ c: 1, a: 2, b: 3 })
  })
})

describe('alignPatches', () => {
  const r = [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 50, y: 20, w: 20, h: 40 }, { id: 'c', x: 200, y: 5, w: 10, h: 10 }]
  it('aligns to the edges and centres of the selection', () => {
    expect(alignPatches(r, 'left')).toEqual({ a: { x: 0 }, b: { x: 0 }, c: { x: 0 } })
    expect(alignPatches(r, 'right')).toEqual({ a: { x: 200 }, b: { x: 190 }, c: { x: 200 } })
    expect(alignPatches(r, 'vmiddle').b).toEqual({ y: 10 })
  })
  it('spreads evenly with equal gaps, outer cards fixed', () => {
    expect(alignPatches(r, 'hdist')).toEqual({ a: { x: 0 }, b: { x: 95 }, c: { x: 200 } })
  })
  it('needs two cards', () => {
    expect(alignPatches([r[0]], 'left')).toEqual({})
  })
})
