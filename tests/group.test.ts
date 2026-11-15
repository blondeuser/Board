import { describe, expect, it } from 'vitest'
import { groupAssets } from '../src/library/group'
import type { Asset, Category } from '../src/shared/types'

const asset = (id: string, categoryIds: string[] = [], types?: string[]): Asset => ({
  id, width: 1, height: 1, palette: [], colors: [], categoryIds, types, createdAt: 0,
})
const cats: Category[] = [{ id: 'c1', name: 'Posters', color: '#f00' }, { id: 'c2', name: 'Interiors', color: '#0f0' }, { id: 'c3', name: 'Empty', color: '#00f' }]

describe('groupAssets', () => {
  const assets = [asset('a', ['c1']), asset('b', ['c1', 'c2']), asset('c'), asset('d', ['c2'])]

  it('stacks by category in category order, with an No tag section last', () => {
    const g = groupAssets(assets, 'category', cats)
    expect(g.map((x) => x.name)).toEqual(['Posters', 'Interiors', 'No tag'])
    expect(g[0].items.map((a) => a.id)).toEqual(['a', 'b'])
    expect(g[1].items.map((a) => a.id)).toEqual(['b', 'd'])
    expect(g[2].items.map((a) => a.id)).toEqual(['c'])
  })
  it('skips empty categories and omits No tag when everything is tagged', () => {
    const g = groupAssets([asset('a', ['c1'])], 'category', cats)
    expect(g.map((x) => x.name)).toEqual(['Posters'])
  })
  it('groups by type and none', () => {
    expect(groupAssets([asset('a', [], ['photo']), asset('b', [], [])], 'type', []).map((x) => x.name)).toEqual(['Photo', 'No type'])
    expect(groupAssets(assets, 'none', cats)).toHaveLength(1)
  })
})

import { groupAssets as groupByDate } from '../src/library/group'
describe('date groups', () => {
  it('makes one DD/MM/YY section per day, newest first', () => {
    const at = (id: string, y: number, m: number, d: number) => ({ id, createdAt: new Date(y, m - 1, d).getTime() }) as never
    const g = groupByDate([at('a', 2026, 9, 3), at('b', 2026, 11, 14), at('c', 2026, 11, 2), at('d', 2025, 12, 31), at('e', 2026, 11, 14)], 'date', [])
    expect(g.map((x) => x.name)).toEqual(['14/11/26', '02/11/26', '03/09/26', '31/12/25'])
    expect(g[0].items.map((i) => i.id).sort()).toEqual(['b', 'e'])
  })
})
