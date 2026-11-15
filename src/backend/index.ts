import { isDesktop } from '../shared/desktop'
import type { Backend } from './types'

// Desktop = Rust (api.ts, after the one-time IndexedDB copy); browser = IndexedDB dev mode. Dynamic imports keep each
// side out of the other's bundle. Every call waits for the chosen backend.
let chosen: Promise<Backend> | null = null
const pick = (): Promise<Backend> =>
  (chosen ??= isDesktop()
    ? Promise.all([import('./api'), import('./migrate')]).then(async ([{ api }, { migrateFromIndexedDb }]) => {
        await migrateFromIndexedDb()
        return api
      })
    : import('./browser/db').then((m) => m.db))

const methods = [
  'clearAll', 'boards', 'saveBoards', 'deleteBoard', 'assets', 'saveAssets', 'addAsset', 'importImage', 'deleteAssets', 'blob', 'thumb',
  'saveThumb', 'placements', 'savePlacements', 'deletePlacements', 'connections', 'saveConnections', 'deleteConnections',
  'categories', 'saveCategories', 'deleteCategory',
] as const

export const db = Object.fromEntries(
  methods.map((m) => [m, (...args: unknown[]) => pick().then((b) => (b[m] as (...a: unknown[]) => unknown)(...args))]),
) as unknown as Backend
