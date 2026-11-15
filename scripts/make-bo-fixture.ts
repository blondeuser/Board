// Writes src-tauri/tests/fixtures/ts-written.bo with the real TS writer (src/storage/bo/write.ts), so the Rust reader is
// tested against what the TS side produces. Run: npx vite-node scripts/make-bo-fixture.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildBo } from '../src/storage/bo/write'

// 1x1 red PNG
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const bytes = buildBo(
  {
    board: { id: 'b1', name: 'Fixture', createdAt: 1, view: { x: 0, y: 0, zoom: 1 } },
    placements: [
      { id: 'p1', boardId: 'b1', assetId: 'a1', x: 0, y: 0, w: 100, h: 100, z: 1 },
      { id: 'p2', boardId: 'b1', kind: 'note', assetId: '', text: 'hi', x: 0, y: 120, w: 240, h: 320, z: 2 },
      { id: 'p3', boardId: 'b1', kind: 'ink', assetId: '', x: 10, y: 10, w: 20, h: 20, z: 3, ink: { tool: 'pen', color: 'auto', size: 4, points: [0, 0, 1, 10, 10, 0.5] } },
    ],
    assets: [{ id: 'a1', hash: 'hash-red', ext: 'png', width: 1, height: 1, palette: [{ hex: '#ff0000', share: 1 }], colors: ['red'], categoryIds: ['c1'], createdAt: 1 }],
    categories: [{ id: 'c1', name: 'Warm', color: '#f00' }],
    images: new Map([['hash-red', png]]),
  },
  '0.4.0',
  new Date('2026-11-15T00:00:00Z'),
)
mkdirSync('src-tauri/tests/fixtures', { recursive: true })
writeFileSync('src-tauri/tests/fixtures/ts-written.bo', bytes)
console.log('wrote', bytes.length, 'bytes')
