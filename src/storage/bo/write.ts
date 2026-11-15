import { strToU8, zipSync, type Zippable } from 'fflate'
import type { Asset, Board, Category, Placement } from '../../shared/types'

export const BO_FORMAT = 'remstudio-board'
/** Highest formatVersion this app can read. Files without ink or text are still written as 1 so older apps open them. */
export const BO_VERSION = 2
export const APP_VERSION = '0.7.1' // keep in step with package.json

/** An asset as stored in `assets.json`: no embedding (rebuilt on import), plus the hash and extension of its original file. */
export type BoAsset = Omit<Asset, 'embedding' | 'embeddingModel'> & { hash: string; ext: string }

export interface BoContent {
  board: Board
  placements: Placement[]
  assets: BoAsset[]
  categories: Category[]
  /** Original files by SHA-256 hash; assets with the same hash share one file. */
  images: Map<string, Uint8Array>
}

export interface BoManifest {
  format: typeof BO_FORMAT
  formatVersion: number
  appVersion: string
  exportedAt: string
  boardId: string
  name: string
  embeddingModel: null
  embeddingDim: null
  counts: { placements: number; assets: number; categories: number }
}

/** Build the `.bo` ZIP (spec: docs/BO_FORMAT.md). Images are stored uncompressed, JSON is deflated. */
export function buildBo(c: BoContent, appVersion: string, now = new Date()): Uint8Array {
  const manifest: BoManifest = {
    format: BO_FORMAT,
    formatVersion: c.placements.some((p) => p.kind === 'ink' || p.kind === 'text') ? 2 : 1,
    appVersion,
    exportedAt: now.toISOString(),
    boardId: c.board.id,
    name: c.board.name,
    embeddingModel: null,
    embeddingDim: null,
    counts: { placements: c.placements.length, assets: c.assets.length, categories: c.categories.length },
  }
  const json = (v: unknown): [Uint8Array, { level: 6 }] => [strToU8(JSON.stringify(v)), { level: 6 }]
  const files: Zippable = {
    'manifest.json': json(manifest), // first entry
    'board.json': json({ board: c.board, placements: c.placements }),
    'assets.json': json(c.assets),
    'categories.json': json(c.categories),
  }
  const ext = new Map(c.assets.map((a) => [a.hash, a.ext]))
  for (const [hash, bytes] of c.images) files[`images/${hash}.${ext.get(hash) ?? 'img'}`] = [bytes, { level: 0 }]
  return zipSync(files)
}
