// One-time IndexedDB -> SQLite copy for installs that used 0.1.x (docs/RUST_BACKEND.md "Data migration").
// IndexedDB is left untouched as a safety net. shortcut: no progress dialog; the first start of a big library just waits.
import { invoke } from '@tauri-apps/api/core'
import { api, loadAll } from './api'
import { db as idb } from './browser/db'

export async function migrateFromIndexedDb(): Promise<void> {
  if (await invoke<string | null>('meta_get', { key: 'idb_migrated' })) return
  const [boards, assets, placements, connections, categories] = await Promise.all([
    idb.boards(), idb.assets(), idb.placements(), idb.connections(), idb.categories(),
  ])
  for (const a of assets) {
    const blob = await idb.blob(a.id)
    if (!blob) continue // no file to show; the count check below then refuses to mark the migration done
    await api.addAsset(a, blob, (await idb.thumb(a.id)) ?? new Blob())
  }
  await api.saveBoards(boards)
  await api.saveCategories(categories)
  await api.savePlacements(placements)
  await api.saveConnections(connections)
  const now = await loadAll()
  const same =
    now.boards.length === boards.length && now.placements.length === placements.length &&
    now.connections.length === connections.length && now.categories.length === categories.length &&
    now.assets.length === assets.length
  if (!same) throw new Error('Library migration count mismatch; IndexedDB kept')
  await invoke('meta_set', { key: 'idb_migrated', value: '1' })
}
