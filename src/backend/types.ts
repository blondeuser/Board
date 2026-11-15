import type { Asset, Board, Category, Connection, Placement } from '../shared/types'

/** What the app needs from storage. Two implementations: browser/db.ts (IndexedDB, dev mode) and api.ts (Rust, desktop). */
export interface Backend {
  clearAll(): Promise<void>
  boards(): Promise<Board[]>
  saveBoards(b: Board[]): Promise<void>
  deleteBoard(id: string): Promise<void>
  assets(): Promise<Asset[]>
  saveAssets(a: Asset[]): Promise<void>
  addAsset(asset: Asset, blob: Blob, thumb: Blob): Promise<void>
  deleteAssets(ids: string[]): Promise<void>
  blob(id: string): Promise<Blob | undefined>
  thumb(id: string): Promise<Blob | undefined>
  saveThumb(id: string, blob: Blob): Promise<void>
  placements(): Promise<Placement[]>
  savePlacements(p: Placement[]): Promise<void>
  deletePlacements(ids: string[]): Promise<void>
  connections(): Promise<Connection[]>
  saveConnections(c: Connection[]): Promise<void>
  deleteConnections(ids: string[]): Promise<void>
  categories(): Promise<Category[]>
  saveCategories(c: Category[]): Promise<void>
  deleteCategory(id: string): Promise<void>
}
