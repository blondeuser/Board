// Reference embeddings from the app's own TS pipeline (browser canvas resize + transformers.js q8, the worker the app
// ships today) for the Rust parity test (src-tauri/src/analyze). Needs the dev server: npm run dev.
// Usage: node scripts/make-siglip-fixtures.mjs   -> tests/fixtures/siglip/reference.json
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const dir = 'tests/fixtures/siglip'
const files = fs.readdirSync(dir).filter((f) => /\.(jpg|png)$/.test(f))
const texts = ['a photo of a cat', 'a photograph', 'a photo of a building facade', 'a photo of the man']
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage()
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
page.setDefaultTimeout(600000)
const out = await page.evaluate(async ([files, texts, b64]) => {
  const { analyseImage, embedText } = await import('/src/categorize/style/classifier.ts')
  const r = { images: {}, texts: {} }
  for (const f of files) {
    const bytes = Uint8Array.from(atob(b64[f]), (c) => c.charCodeAt(0))
    r.images[f] = Array.from((await analyseImage(new Blob([bytes], { type: f.endsWith('png') ? 'image/png' : 'image/jpeg' }))).embedding)
  }
  for (const t of texts) r.texts[t] = Array.from(await embedText(t))
  return r
}, [files, texts, Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dir, f)).toString('base64')]))])
fs.writeFileSync(path.join(dir, 'reference.json'), JSON.stringify(out))
console.log('wrote', Object.keys(out.images), Object.keys(out.texts))
await browser.close()
