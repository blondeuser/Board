import { strFromU8, unzipSync } from 'fflate'
import type { Asset, Board, Category, Placement } from '../../shared/types'
import { BO_FORMAT, BO_VERSION, type BoAsset, type BoContent, type BoManifest } from './write'

export class BoError extends Error {}

/** Read and validate a `.bo`. Throws `BoError` with a message fit to show to the user. */
export function parseBo(bytes: Uint8Array): BoContent {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new BoError('This is not a valid .bo file.')
  }
  const text = (name: string): unknown => {
    const f = files[name]
    if (!f) throw new BoError(`This .bo file is damaged (missing ${name}).`)
    try {
      return JSON.parse(strFromU8(f))
    } catch {
      throw new BoError(`This .bo file is damaged (${name} is unreadable).`)
    }
  }
  const manifest = text('manifest.json') as Partial<BoManifest>
  if (manifest.format !== BO_FORMAT) throw new BoError('This is not a Board file.')
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > BO_VERSION) {
    throw new BoError('This file was made by a newer version of Board. Update Board to open it.')
  }
  // formatVersion < BO_VERSION: migrate here once a second version exists.

  const { board, placements } = text('board.json') as { board: Board; placements: Placement[] }
  const assets = text('assets.json') as BoAsset[]
  const categories = text('categories.json') as Category[]
  if (!board?.id || !Array.isArray(placements) || !Array.isArray(assets) || !Array.isArray(categories)) {
    throw new BoError('This .bo file is damaged.')
  }

  const images = new Map<string, Uint8Array>()
  for (const a of assets) {
    if (images.has(a.hash)) continue
    const f = files[`images/${a.hash}.${a.ext}`]
    if (!f) throw new BoError('This .bo file is damaged (an image file is missing).')
    images.set(a.hash, f)
  }
  return { board, placements, assets, categories, images }
}

export interface ImportPlan {
  board: Board
  placements: Placement[]
  /** Images not yet in the library; they get new ids. */
  addAssets: { asset: Asset; ext: string }[]
  addCategories: Category[]
  /** Images already in the library (same hash): the file's categories are added to them, nothing else changes. */
  mergeCategories: { assetId: string; categoryIds: string[] }[]
}

/**
 * Decide what importing a `.bo` changes (spec "Reading"): reuse library images with the same hash, match categories by name,
 * always make a new board with fresh ids. Pure: nothing is written here.
 */
export function planImport(
  c: BoContent,
  library: { hashes: Map<string, string>; categories: Category[] },
  newId: () => string,
): ImportPlan {
  // Categories: match by name (case-insensitive), create the missing ones.
  const catByName = new Map(library.categories.map((x) => [x.name.toLowerCase(), x.id]))
  const catMap = new Map<string, string>()
  const addCategories: Category[] = []
  for (const cat of c.categories) {
    let id = catByName.get(cat.name.toLowerCase())
    if (!id) {
      id = newId()
      addCategories.push({ id, name: cat.name, color: cat.color })
      catByName.set(cat.name.toLowerCase(), id)
    }
    catMap.set(cat.id, id)
  }
  const mapCats = (ids: string[]) => [...new Set(ids.flatMap((i) => (catMap.has(i) ? [catMap.get(i)!] : [])))]

  // Assets: same hash = same library image. Duplicate hashes inside the file collapse to one.
  const assetMap = new Map<string, string>()
  const byHash = new Map<string, string>()
  const addAssets: ImportPlan['addAssets'] = []
  const mergeCategories: ImportPlan['mergeCategories'] = []
  for (const a of c.assets) {
    const existing = library.hashes.get(a.hash) ?? byHash.get(a.hash)
    if (existing) {
      assetMap.set(a.id, existing)
      if (library.hashes.has(a.hash)) mergeCategories.push({ assetId: existing, categoryIds: mapCats(a.categoryIds) })
      continue
    }
    const id = newId()
    assetMap.set(a.id, id)
    byHash.set(a.hash, id)
    const { ext, ...rest } = a
    addAssets.push({ asset: { ...rest, id, categoryIds: mapCats(a.categoryIds) }, ext })
  }

  const board: Board = { ...c.board, id: newId(), createdAt: Date.now() }
  const placements: Placement[] = c.placements.flatMap((p) => {
    if (p.kind === 'note' || p.kind === 'shape' || p.kind === 'ink' || p.kind === 'text') return [{ ...p, id: newId(), boardId: board.id }]
    const assetId = assetMap.get(p.assetId)
    return assetId ? [{ ...p, id: newId(), boardId: board.id, assetId }] : []
  })
  return { board, placements, addAssets, addCategories, mergeCategories }
}
