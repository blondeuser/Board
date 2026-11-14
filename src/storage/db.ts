import type { Asset, Board, Category, Placement } from '../shared/types'

// IndexedDB for the browser build. Swapped for SQLite + files in the Tauri step (see PROGRESS).
const DB_NAME = 'board'
const VERSION = 2

type StoreName = 'boards' | 'assets' | 'placements' | 'categories' | 'blobs' | 'thumbs'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('boards')) {
        db.createObjectStore('boards', { keyPath: 'id' })
        db.createObjectStore('assets', { keyPath: 'id' })
        db.createObjectStore('categories', { keyPath: 'id' })
        db.createObjectStore('blobs') // key = asset id, value = original Blob
        db.createObjectStore('placements', { keyPath: 'id' }).createIndex('boardId', 'boardId')
      }
      if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs') // v2: key = asset id, value = display-size Blob
    }
    req.onsuccess = () => {
      // Let a newer version of the app (another tab) upgrade the database instead of being blocked by this tab.
      req.result.onversionchange = () => {
        req.result.close()
        dbPromise = null
      }
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => console.warn('Board: close other Board tabs so the database can update')
  })
  return dbPromise
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

async function tx<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await open()
  const t = db.transaction(stores, mode)
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
  const result = await fn(t)
  await done
  return result
}

const getAll = <T>(store: StoreName): Promise<T[]> =>
  tx([store], 'readonly', (t) => wrap(t.objectStore(store).getAll() as IDBRequest<T[]>))

const putAll = (store: Exclude<StoreName, 'blobs'>, values: object[]): Promise<void> =>
  tx([store], 'readwrite', (t) => {
    const s = t.objectStore(store)
    values.forEach((v) => s.put(v))
  })

export const db = {
  boards: () => getAll<Board>('boards'),
  saveBoards: (b: Board[]) => putAll('boards', b),
  deleteBoard: (id: string) =>
    tx(['boards', 'placements'], 'readwrite', async (t) => {
      t.objectStore('boards').delete(id)
      const keys = await wrap(t.objectStore('placements').index('boardId').getAllKeys(id))
      keys.forEach((k) => t.objectStore('placements').delete(k))
    }),

  assets: () => getAll<Asset>('assets'),
  saveAssets: (a: Asset[]) => putAll('assets', a),
  /** Adds an asset with its original file in one transaction. */
  addAsset: (asset: Asset, blob: Blob, thumb: Blob) =>
    tx(['assets', 'blobs', 'thumbs'], 'readwrite', (t) => {
      t.objectStore('assets').put(asset)
      t.objectStore('blobs').put(blob, asset.id)
      t.objectStore('thumbs').put(thumb, asset.id)
    }),
  deleteAssets: (ids: string[]) =>
    tx(['assets', 'blobs', 'thumbs'], 'readwrite', (t) =>
      ids.forEach((id) => {
        t.objectStore('assets').delete(id)
        t.objectStore('blobs').delete(id)
        t.objectStore('thumbs').delete(id)
      }),
    ),
  blob: (id: string) => tx(['blobs'], 'readonly', (t) => wrap(t.objectStore('blobs').get(id) as IDBRequest<Blob | undefined>)),

  thumb: (id: string) => tx(['thumbs'], 'readonly', (t) => wrap(t.objectStore('thumbs').get(id) as IDBRequest<Blob | undefined>)),
  saveThumb: (id: string, blob: Blob) => tx(['thumbs'], 'readwrite', (t) => t.objectStore('thumbs').put(blob, id)),

  placements: () => getAll<Placement>('placements'),
  savePlacements: (p: Placement[]) => putAll('placements', p),
  deletePlacements: (ids: string[]) =>
    tx(['placements'], 'readwrite', (t) => ids.forEach((id) => t.objectStore('placements').delete(id))),

  categories: () => getAll<Category>('categories'),
  saveCategories: (c: Category[]) => putAll('categories', c),
  deleteCategory: (id: string) => tx(['categories'], 'readwrite', (t) => t.objectStore('categories').delete(id)),
}
