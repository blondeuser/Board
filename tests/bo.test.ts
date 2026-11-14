import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { buildBo, type BoAsset, type BoContent } from '../src/storage/bo/write'
import { BoError, parseBo, planImport } from '../src/storage/bo/read'
import { sha256Hex } from '../src/storage/bo/hash'

const board = { id: 'b1', name: 'Lounge', createdAt: 1, view: { x: 0, y: 0, zoom: 1 } }
const asset = (id: string, hash: string, categoryIds: string[] = []): BoAsset => ({
  id, hash, ext: 'png', width: 10, height: 10, palette: [], colors: ['red'], categoryIds, createdAt: 1,
})
const content = (): BoContent => ({
  board,
  placements: [
    { id: 'p1', boardId: 'b1', assetId: 'a1', x: 0, y: 0, w: 10, h: 10, z: 1 },
    { id: 'p2', boardId: 'b1', assetId: 'a2', x: 20, y: 0, w: 10, h: 10, z: 2 },
    { id: 'p3', boardId: 'b1', kind: 'note', assetId: '', text: 'hi', x: 0, y: 20, w: 20, h: 20, z: 3 },
  ],
  assets: [asset('a1', 'h1', ['c1']), asset('a2', 'h2')],
  categories: [{ id: 'c1', name: 'Warm', color: '#f00' }],
  images: new Map([['h1', new Uint8Array([1, 2, 3])], ['h2', new Uint8Array([4, 5])]]),
})
let n = 0
const ids = () => `new${++n}`

describe('.bo round trip', () => {
  it('writes and reads back the same board, tags and image bytes', () => {
    const back = parseBo(buildBo(content(), '0.1.0'))
    expect(back.board).toEqual(board)
    expect(back.placements).toHaveLength(3)
    expect(back.assets.map((a) => a.hash)).toEqual(['h1', 'h2'])
    expect([...back.images.get('h1')!]).toEqual([1, 2, 3])
    expect(back.categories[0].name).toBe('Warm')
  })

  it('refuses a newer format, a foreign file and garbage', () => {
    const zip = (m: object) => zipSync({ 'manifest.json': strToU8(JSON.stringify(m)) })
    expect(() => parseBo(zip({ format: 'remstudio-board', formatVersion: 99 }))).toThrow(/newer/)
    expect(() => parseBo(zip({ format: 'other', formatVersion: 1 }))).toThrow(BoError)
    expect(() => parseBo(new Uint8Array([1, 2, 3]))).toThrow(BoError)
  })

  it('hashes with SHA-256', async () => {
    expect(await sha256Hex(new Uint8Array([]))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('planImport', () => {
  it('always creates a new board with new ids and keeps notes', () => {
    const plan = planImport(content(), { hashes: new Map(), categories: [] }, ids)
    expect(plan.board.id).not.toBe('b1')
    expect(plan.placements).toHaveLength(3)
    expect(plan.placements.every((p) => p.boardId === plan.board.id)).toBe(true)
    expect(plan.addAssets).toHaveLength(2)
    expect(plan.addCategories.map((c) => c.name)).toEqual(['Warm'])
    const first = plan.addAssets.find((x) => x.asset.hash === 'h1')!.asset
    expect(plan.placements.some((p) => p.assetId === first.id)).toBe(true)
    expect(first.categoryIds).toEqual([plan.addCategories[0].id])
  })

  it('reuses library images with the same hash and matches categories by name', () => {
    const plan = planImport(content(), { hashes: new Map([['h1', 'lib1']]), categories: [{ id: 'lc', name: 'warm', color: '#0f0' }] }, ids)
    expect(plan.addAssets.map((x) => x.asset.hash)).toEqual(['h2'])
    expect(plan.addCategories).toEqual([])
    expect(plan.mergeCategories).toEqual([{ assetId: 'lib1', categoryIds: ['lc'] }])
    expect(plan.placements.find((p) => p.assetId === 'lib1')).toBeTruthy()
  })
})
