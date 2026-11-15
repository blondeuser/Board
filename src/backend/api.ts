// Desktop backend: the only file that calls the Rust commands (docs/RUST_BACKEND.md). Same shape as browser/db.ts.
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { Asset, AssetSource, Board, Category, Connection, Placement } from '../shared/types'
import { newId } from '../shared/id'
import type { Backend } from './types'

// Embeddings are Float32Array in the UI, plain number arrays in the JSON documents.
// shortcut: until step 3 moves analysis to Rust, embeddings cross IPC inside the asset JSON.
const toDoc = (a: Asset) => ({ ...a, embedding: a.embedding ? Array.from(a.embedding) : undefined })
const fromDoc = (a: Asset & { embedding?: number[] }): Asset => ({ ...a, embedding: a.embedding ? new Float32Array(a.embedding) : undefined })

const u32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
const extOf = (b: Blob) => (b.type.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'

async function addAsset(asset: Asset, blob: Blob, thumb: Blob) {
  const head = new TextEncoder().encode(JSON.stringify({ asset: toDoc(asset), ext: extOf(blob), thumbExt: extOf(thumb) }))
  const body = new Blob([u32(head.length), head, u32(thumb.size), thumb, blob])
  await invoke('add_asset', new Uint8Array(await body.arrayBuffer()))
}

async function importImage(blob: Blob, source?: AssetSource) {
  const head = new TextEncoder().encode(JSON.stringify({ id: newId(), createdAt: Date.now(), source }))
  const body = new Blob([u32(head.length), head, u32(0), blob])
  const { asset } = await invoke<{ asset: Asset & { embedding?: number[] } }>('import_image', new Uint8Array(await body.arrayBuffer()))
  return { asset: fromDoc(asset), thumb: (await file(asset.id, 1))! }
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
  importImage,
  deleteAssets: del('delete_assets'),
  blob: (id) => file(id, 0),
  thumb: (id) => file(id, 1),
  saveThumb: async (id, blob) => {
    await invoke('save_thumb', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-asset-id': id, 'x-thumb-ext': extOf(blob) } })
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

export interface Scored {
  label: string
  score: number
}

/** Rust embeds the stored image (vector stays in Rust) and returns zero-shot scores. `spaces` = [prompt, parent] pairs. */
export const analyzeAsset = (id: string, types: string[], spaces: [string, string][]) =>
  invoke<{ scores: Scored[]; detail: Scored[] }>('analyze_asset', { id, types, spaces })

/** Rust writes the board as a .bo straight to `path` (docs/BO_FORMAT.md). */
export const exportBo = (boardId: string, path: string) => busy('Exporting board', () => invoke<{ images: number }>('export_bo', { boardId, path, exportedAt: new Date().toISOString() }))

/** Rust opens a .bo as a new board (reusing images by hash); the UI then reloads the library. Errors are user-facing messages. */
export const importBoFile = (path: string) => busy('Opening board', () => invoke<{ boardId: string; name: string; newImages: number }>('import_bo', { path }))

/** A .bo dropped on the window (no file path in the webview): the bytes go to Rust, same import as importBoFile. */
export const importBoBytes = (bytes: Uint8Array) => busy('Opening board', () => invoke<{ boardId: string; name: string; newImages: number }>('import_bo_bytes', bytes))

/** Tells the status bar (ui/BoStatusBar.tsx) a long .bo job started / ended; Rust sends the 'bo-progress' events in between. */
async function busy<T>(label: string, job: () => Promise<T>): Promise<T> {
  window.dispatchEvent(new CustomEvent('bo-busy', { detail: label }))
  try { return await job() } finally { window.dispatchEvent(new CustomEvent('bo-busy', { detail: null })) }
}

/** Search by meaning in Rust: [asset id, score], best first. */
export const searchMeaning = (prompt: string) => invoke<[string, number][]>('search_meaning', { prompt })

// ---- Storage settings (docs/STORAGE.md): where the library and cache live ----
export type StorageInfo = {
  library: string; libraryBytes: number; images: number
  cache: string; thumbsBytes: number
  previous: [string, number] | null
  missing: string | null
}
export type StorageProgress = { phase: 'copy' | 'verify' | 'thumbs'; done: number; total: number }
export const storageInfo = () => invoke<StorageInfo>('storage_info')
/** Copies, verifies, switches and restarts the app. Rejects with a user-facing message. */
export const moveLibrary = (path: string) => invoke<void>('move_library', { path })
export const cancelMove = () => invoke<void>('cancel_move')
export const deleteOldLibrary = () => invoke<void>('delete_old_library')
/** null = default folder. Restarts the app. */
export const setCacheDir = (path: string | null) => invoke<void>('set_cache_dir', { path })
export const clearCache = () => invoke<number>('clear_cache')
export const locateLibrary = (path: string) => invoke<void>('locate_library', { path })
export const useDefaultLibrary = () => invoke<void>('use_default_library')
export async function onStorageProgress(fn: (p: StorageProgress) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  const offs = await Promise.all(['storage-progress', 'thumbs-progress'].map((n) => listen<StorageProgress>(n, (e) => fn(e.payload))))
  return () => offs.forEach((o) => o())
}
