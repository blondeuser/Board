import { describe, expect, it } from 'vitest'
import { groupAssets } from '../src/library/group'
import type { Asset, Category } from '../src/shared/types'

const asset = (id: string, categoryIds: string[] = [], types?: string[]): Asset => ({
  id, width: 1, height: 1, palette: [], colors: [], categoryIds, types, createdAt: 0,
})
const cats: Category[] = [{ id: 'c1', name: 'Posters', color: '#f00' }, { id: 'c2', name: 'Interiors', color: '#0f0' }, { id: 'c3', name: 'Empty', color: '#00f' }]

describe('groupAssets', () => {
  const assets = [asset('a', ['c1']), asset('b', ['c1', 'c2']), asset('c'), asset('d', ['c2'])]

  it('stacks by category in category order, with an Uncategorized section last', () => {
    const g = groupAssets(assets, 'category', cats)
    expect(g.map((x) => x.name)).toEqual(['Posters', 'Interiors', 'Uncategorized'])
    expect(g[0].items.map((a) => a.id)).toEqual(['a', 'b'])
    expect(g[1].items.map((a) => a.id)).toEqual(['b', 'd'])
    expect(g[2].items.map((a) => a.id)).toEqual(['c'])
  })
  it('skips empty categories and omits Uncategorized when everything is tagged', () => {
    const g = groupAssets([asset('a', ['c1'])], 'category', cats)
    expect(g.map((x) => x.name)).toEqual(['Posters'])
  })
  it('groups by type and none', () => {
    expect(groupAssets([asset('a', [], ['photo']), asset('b', [], [])], 'type', []).map((x) => x.name)).toEqual(['Photo', 'No type'])
    expect(groupAssets(assets, 'none', cats)).toHaveLength(1)
  })
})
