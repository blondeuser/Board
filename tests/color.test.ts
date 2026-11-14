import { describe, expect, it } from 'vitest'
import { extractPalette, colorFamilies, familyOf } from '../src/categorize/color'
import { rgbToOklab } from '../src/categorize/color/convert'

const solid = (colors: number[][], px = 100) => {
  const data: number[] = []
  for (const c of colors) for (let i = 0; i < px; i++) data.push(c[0], c[1], c[2], 255)
  return { data, width: px * colors.length, height: 1 }
}
const fam = (r: number, g: number, b: number) => familyOf(rgbToOklab(r, g, b))

describe('familyOf', () => {
  it('names pure colours', () => {
    expect(fam(255, 0, 0)).toBe('red')
    expect(fam(0, 0, 255)).toBe('blue')
    expect(fam(0, 160, 0)).toBe('green')
    expect(fam(255, 230, 0)).toBe('yellow')
    expect(fam(255, 255, 255)).toBe('white')
    expect(fam(0, 0, 0)).toBe('black')
    expect(fam(128, 128, 128)).toBe('gray')
    expect(fam(120, 80, 40)).toBe('brown')
  })
})

describe('extractPalette', () => {
  it('finds two flat colours in proportion', () => {
    const p = extractPalette(solid([[255, 0, 0], [0, 0, 255]]), 5)
    expect(p).toHaveLength(2)
    expect(p[0].share).toBeCloseTo(0.5)
  })
  it('is deterministic and handles transparent input', () => {
    const img = solid([[10, 200, 30], [200, 10, 30], [30, 30, 200]])
    expect(extractPalette(img)).toEqual(extractPalette(img))
    expect(extractPalette({ data: [0, 0, 0, 0], width: 1, height: 1 })).toEqual([])
  })
})

describe('colorFamilies', () => {
  it('keeps dominant and significant families only', () => {
    const f = colorFamilies([
      { hex: '#ff0000', share: 0.6 },
      { hex: '#0000ff', share: 0.3 },
      { hex: '#00aa00', share: 0.1 },
    ])
    expect(f).toEqual(['red', 'blue'])
  })
})

import { familyShades } from '../src/categorize/color/palette'
describe('familyShades', () => {
  it('averages palette colours per family, weighted by share', () => {
    const m = familyShades([[{ hex: '#ff0000', share: 0.5 }], [{ hex: '#ff0000', share: 0.5 }, { hex: '#ffffff', share: 0.5 }]])
    expect(m.get('red')).toBe('#ff0000')
    expect(m.get('white')).toBe('#ffffff')
    expect(m.has('blue')).toBe(false)
  })
})
