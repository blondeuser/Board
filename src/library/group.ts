import type { Asset, Category } from '../shared/types'
import { COLOR_FAMILIES } from '../categorize/color'
import { ALL_TYPE_LABELS } from '../categorize/style/labels'

/** 'date' = one section per day (DD/MM/YY) of the import date, newest first; the Library uses it for the All tab. */
export type GroupBy = 'none' | 'date' | 'category' | 'type' | 'color' | 'source'

export interface Group {
  key: string
  name: string
  /** Dot colour shown next to the name. */
  color?: string
  items: Asset[]
}

/** Split assets into stacked sections. An image with several tags appears in each of its sections; untagged ones go last. */
export function groupAssets(assets: Asset[], by: GroupBy, categories: Category[]): Group[] {
  if (by === 'none') return [{ key: 'all', name: 'All', items: assets }]
  if (by === 'date') {
    const days = new Map<string, Group>()
    for (const a of [...assets].sort((x, y) => y.createdAt - x.createdAt)) {
      const d = new Date(a.createdAt)
      const p2 = (n: number) => String(n).padStart(2, '0')
      const key = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
      const g = days.get(key) ?? { key, name: `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${p2(d.getFullYear() % 100)}`, items: [] }
      g.items.push(a)
      days.set(key, g)
    }
    return [...days.values()]
  }

  const sourceCats = by === 'source' ? [...new Set(assets.flatMap((a) => a.source?.categories ?? []))].sort((x, y) => x.localeCompare(y)) : []
  const defs: { key: string; name: string; color?: string; has: (a: Asset) => boolean }[] =
    by === 'source'
      ? sourceCats.map((c) => ({ key: `src:${c}`, name: c, has: (a) => !!a.source?.categories?.includes(c) }))
      : by === 'category'
      ? categories.map((c) => ({ key: c.id, name: c.name, color: c.color, has: (a) => a.categoryIds.includes(c.id) }))
      : by === 'type'
        ? ALL_TYPE_LABELS.map((t) => ({ key: t.id, name: t.name, has: (a) => !!a.types?.includes(t.id) }))
        : COLOR_FAMILIES.map((c) => ({ key: c.name, name: c.name[0].toUpperCase() + c.name.slice(1), color: c.hex, has: (a) => a.colors.includes(c.name) }))

  const groups: Group[] = defs
    .map((d) => ({ key: d.key, name: d.name, color: d.color, items: assets.filter(d.has) }))
    .filter((g) => g.items.length)

  const placed = new Set(groups.flatMap((g) => g.items.map((a) => a.id)))
  const rest = assets.filter((a) => !placed.has(a.id))
  if (rest.length) {
    const name = by === 'category' ? 'No tag' : by === 'type' ? 'No type' : by === 'source' ? 'Not imported' : 'No colour'
    groups.push({ key: 'rest', name, items: rest })
  }
  return groups
}
