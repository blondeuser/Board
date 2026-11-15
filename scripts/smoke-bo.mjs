// Rust .bo smoke (desktop): drives the running Tauri window over CDP. Makes a scratch board (note, text, ink and one image
// from the library if any), exports it with export_bo, opens it again with import_bo, checks the copy, and deletes both
// boards. Start the app first: WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 npm run tauri dev
// Env: BO_PATH = where to write the .bo (default: next to the repo's smoke pngs).
import { chromium } from 'playwright-core'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const path = process.env.BO_PATH ?? join(tmpdir(), 'remind-smoke.bo')
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts()[0].pages()[0]
await page.waitForSelector('.viewport', { timeout: 60000 })
// Make a throwaway image (drop a generated PNG) so the image path is covered; it is deleted again at the end.
const before = new Set((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('load_all'))).assets.map((a) => a.id))
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 400; c.height = 300
  const g = c.getContext('2d'); g.fillStyle = '#2040e0'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#e0c020'; g.fillRect(50, 50, 120, 90)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'smoke-bo.png', { type: 'image/png' }))
  document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 500, clientY: 300 }))
})
await page.waitForTimeout(3000)
const check = (name, ok) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) process.exitCode = 1 }
const out = await page.evaluate(async ({ path, before }) => {
  const call = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args)
  const id = () => crypto.randomUUID()
  const lib0 = await call('load_all')
  const board = { id: id(), name: 'bo-smoke', createdAt: Date.now(), view: { x: 0, y: 0, zoom: 1 } }
  const base = { boardId: board.id, assetId: '', x: 0, y: 0, w: 100, h: 100 }
  const ps = [
    { ...base, id: id(), kind: 'note', text: 'hi', tint: '#dcdcd8', z: 1 },
    { ...base, id: id(), kind: 'text', text: 'Hello', fmt: { font: 'serif', size: 28, color: 'auto', bold: true, italic: false, align: 'left' }, z: 2 },
    { ...base, id: id(), kind: 'ink', z: 3, ink: { tool: 'pen', color: 'auto', size: 4, points: [0, 0, 1, 10, 10, 0.5] } },
  ]
  const asset = lib0.assets.find((a) => !before.includes(a.id))
  if (asset) ps.push({ ...base, id: id(), assetId: asset.id, z: 4 })
  await call('save_boards', { items: [board] })
  await call('save_placements', { items: ps })
  let result = { hadImage: !!asset }
  try {
    result.exported = await call('export_bo', { boardId: board.id, path, exportedAt: new Date().toISOString() })
    await call('delete_assets', { ids: [asset.id] }) // gone from the library: import must bring it back from the .bo
    result.imported = await call('import_bo', { path })
    const lib1 = await call('load_all')
    const copy = lib1.placements.filter((p) => p.boardId === result.imported.boardId)
    result.copyKinds = copy.map((p) => p.kind ?? 'image').sort()
    result.inkPoints = copy.find((p) => p.kind === 'ink')?.ink.points.length
    result.textFmt = copy.find((p) => p.kind === 'text')?.fmt.font
    const img = copy.find((p) => p.assetId)
    result.copyImageAsset = !!img && lib1.assets.some((a) => a.id === img.assetId && a.hash)
    result.newAssetIds = lib1.assets.filter((a) => !before.includes(a.id)).map((a) => a.id)
    result.thumb = img ? (await call('asset_paths', { id: img.assetId }))[1] : null
    await call('delete_board', { id: result.imported.boardId })
  } catch (e) {
    result.error = String(e)
  }
  await call('delete_board', { id: board.id })
  await call('delete_assets', { ids: (await call('load_all')).assets.filter((a) => !before.includes(a.id)).map((a) => a.id) }) // clean up the throwaway image
  return result
}, { path, before: [...before] })
console.log(out)
check('no error', !out.error)
check('copy has the same kinds', JSON.stringify(out.copyKinds) === JSON.stringify(out.hadImage ? ['image', 'ink', 'note', 'text'] : ['ink', 'note', 'text']))
check('ink points and text format survive', out.inkPoints === 6 && out.textFmt === 'serif')
check('image comes back from the .bo with a thumbnail', out.hadImage && out.imported?.newImages === 1 && out.copyImageAsset && !!out.thumb)
await browser.close()
