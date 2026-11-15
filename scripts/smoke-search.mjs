// Search by meaning, end to end in the real UI: drop photos, wait for on-device analysis, type plain-language queries.
// Usage: node scripts/smoke-search.mjs <folder> [<folder> ...]  (.jpg photos named after their subject). Needs the dev server.
// Photos with the same pixel size as an earlier one are skipped (results are matched back to files by size).
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const dirs = process.argv.slice(2)
if (!dirs.length) throw new Error('pass at least one photo folder')
const files = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => /\.jpe?g$/i.test(f)).sort().map((f) => path.join(d, f)))
// CDP=http://127.0.0.1:9222 drives the running desktop app instead of Edge (see scripts/smoke-desktop.mjs)
const browser = process.env.CDP ? await chromium.connectOverCDP(process.env.CDP) : await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = process.env.CDP ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
if (!process.env.CDP) await page.goto(process.env.URL ?? 'http://localhost:5173')
await page.waitForSelector('.viewport')

const nameOf = {}
for (const f of files) {
  const b64 = fs.readFileSync(f).toString('base64')
  const size = await page.evaluate(async ([b64, name, i]) => {
    const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'image/jpeg' })
    const bm = await createImageBitmap(file)
    const d = `${bm.width}x${bm.height}`; bm.close()
    return d
  }, [b64, path.basename(f), 0])
  if (nameOf[size]) continue
  nameOf[size] = path.basename(f).replace(/\.\w+$/, '')
  const i = Object.keys(nameOf).length - 1
  await page.evaluate(async ([b64, name, i]) => {
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'image/jpeg' }))
    document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 300 + (i % 4) * 250, clientY: 200 + Math.floor(i / 4) * 220 }))
  }, [b64, path.basename(f), i])
  await page.waitForFunction((k) => document.querySelectorAll('.item').length === k, i + 1)
}
console.log('photos:', Object.values(nameOf).join(', '))
console.log('waiting for model download + analysis (first run downloads ~210 MB)...')
await page.locator('.sidebar li', { hasText: 'Library' }).click(); await page.waitForSelector('.library')
await page.waitForTimeout(2000)
await page.waitForFunction(() => !document.querySelector('.status'), null, { timeout: 540000, polling: 1000 })
await page.waitForTimeout(1500)

const ask = async (q) => {
  await page.locator('.search input').fill(q)
  await page.waitForTimeout(500) // debounce
  await page.waitForFunction(() => document.querySelector('.count')?.dataset.pending !== 'true', null, { timeout: 60000 })
  await page.waitForTimeout(300)
  const found = await page.locator('.cell img').evaluateAll((imgs) => imgs.map((i) => `${i.naturalWidth}x${i.naturalHeight}`))
  return found.map((d) => nameOf[d] ?? d)
}
for (const q of process.env.QUERIES?.split('|') ?? ['the man', 'a man', 'a woman', 'cat', 'dog', 'mountain', 'building', 'flower', 'portrait', 'dragon', '']) {
  console.log(JSON.stringify(q).padEnd(12), '->', (await ask(q)).join(', ') || '(nothing)')
}
await page.locator('.search input').fill('the man'); await page.waitForTimeout(500)
await page.waitForFunction(() => document.querySelector('.count')?.dataset.pending !== 'true', null, { timeout: 60000 })
await page.screenshot({ path: process.env.SHOT ?? 'smoke-search.png' })
console.log('errors:', errors)
await browser.close()
