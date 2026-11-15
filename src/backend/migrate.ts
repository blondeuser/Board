// One-time IndexedDB -> SQLite copy for installs that used 0.1.x (docs/RUST_BACKEND.md "Data migration").
// IndexedDB is kept as a safety net for RETIRE_AFTER_DAYS after a verified migration, then deleted (step 5).
// shortcut: no progress dialog; the first start of a big library just waits.
import { invoke } from '@tauri-apps/api/core'
import { api, loadAll } from './api'
import { db as idb } from './browser/db'

export const RETIRE_AFTER_DAYS = 30

/**
 * What to do with the old IndexedDB, given meta.idb_migrated: nothing yet, stamp the date (older installs stored '1'), or
 * delete it. Only a verified migration ever reaches here (the count check below sets the flag).
 */
export function retirement(flag: string, now: number): 'stamp' | 'wait' | 'delete' | 'done' {
  if (flag === 'cleaned') return 'done'
  const at = Number(flag)
  if (!Number.isFinite(at) || at < 1e12) return 'stamp' // '1' from 0.2.x/0.3.0: start the clock now
  return now - at > RETIRE_AFTER_DAYS * 86_400_000 ? 'delete' : 'wait'
}

export async function migrateFromIndexedDb(): Promise<void> {
  const flag = await invoke<string | null>('meta_get', { key: 'idb_migrated' })
  if (flag) {
    const todo = retirement(flag, Date.now())
    if (todo === 'stamp') await invoke('meta_set', { key: 'idb_migrated', value: String(Date.now()) })
    if (todo === 'delete') {
      indexedDB.deleteDatabase('board')
      await invoke('meta_set', { key: 'idb_migrated', value: 'cleaned' })
    }
    return
  }
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
  await invoke('meta_set', { key: 'idb_migrated', value: String(Date.now()) })
}
