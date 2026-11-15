// Desktop backend: the only file that calls the Rust commands (docs/RUST_BACKEND.md). Same shape as browser/db.ts.
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { Asset, Board, Category, Connection, Placement } from '../shared/types'
import type { Backend } from './types'

// Embeddings are Float32Array in the UI, plain number arrays in the JSON documents.
// shortcut: until step 3 moves analysis to Rust, embeddings cross IPC inside the asset JSON.
const toDoc = (a: Asset) => ({ ...a, embedding: a.embedding ? Array.from(a.embedding) : undefined })
const fromDoc = (a: Asset & { embedding?: number[] }): Asset => ({ ...a, embedding: a.embedding ? new Float32Array(a.embedding) : undefined })

const u32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
const extOf = (b: Blob) => (b.type.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'

async function addAsset(asset: Asset, blob: Blob, thumb: Blob) {
  const head = new TextEncoder().encode(JSON.stringify({ asset: toDoc(asset), ext: extOf(blob) }))
  const body = new Blob([u32(head.length), head, u32(thumb.size), thumb, blob])
  await invoke('add_asset', new Uint8Array(await body.arrayBuffer()))
}

async function file(id: string, which: 0 | 1): Promise<Blob | undefined> {
  const path = (await invoke<(string | null)[]>('asset_paths', { id }))[which]
  if (!path) return undefined
  const res = await fetch(convertFileSrc(path))
  return res.ok ? res.blob() : undefined
}

export interface Library {
  boards: Board[]
  assets: (Asset & { embedding?: number[] })[]
  placements: Placement[]
  connections: Connection[]
  categories: Category[]
}
export const loadAll = () => invoke<Library>('load_all')

const save = (cmd: string) => (items: object[]) => invoke<void>(cmd, { items })
const del = (cmd: string) => (ids: string[]) => invoke<void>(cmd, { ids })

export const api: Backend = {
  clearAll: () => invoke('clear_all'),
  boards: async () => (await loadAll()).boards,
  saveBoards: save('save_boards'),
  deleteBoard: (id) => invoke('delete_board', { id }),
  assets: async () => (await loadAll()).assets.map(fromDoc),
  saveAssets: (a) => save('save_assets')(a.map(toDoc)),
  addAsset,
  deleteAssets: del('delete_assets'),
  blob: (id) => file(id, 0),
  thumb: (id) => file(id, 1),
  saveThumb: async (id, blob) => {
    await invoke('save_thumb', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-asset-id': id } })
  },
  placements: async () => (await loadAll()).placements,
  savePlacements: save('save_placements'),
  deletePlacements: del('delete_placements'),
  connections: async () => (await loadAll()).connections,
  saveConnections: save('save_connections'),
  deleteConnections: del('delete_connections'),
  categories: async () => (await loadAll()).categories,
  saveCategories: save('save_categories'),
  deleteCategory: (id) => invoke('delete_category', { id }),
}
