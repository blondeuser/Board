// Offline quality check for search by meaning. Drops every .jpg/.jpeg in the given folders into a throwaway profile,
// waits for analysis, then scores plain-language queries against hand-labelled expectations.
// Usage: node scripts/eval-search.mjs <folder> [<folder> ...]   (needs the dev server; files named like the labels below)
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dirs = process.argv.slice(2)
const files = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => /\.jpe?g$/i.test(f)).sort().map((f) => path.join(d, f)))
const names = files.map((f) => path.basename(f).replace(/\.\w+$/, ''))

// query -> names (substring match on file name) that should be returned
const EXPECT = {
  'the man': ['man', 'Armstrong', 'Berners'],
  'a woman': ['woman', 'Curie', 'Hamilton'],
  cat: ['cat'],
  dog: ['dog', 'Retriever'],
  mountain: ['mountain'],
  'something to eat': ['food'],
  building: ['Eiffel', 'Taj'],
  flower: ['Sunflower'],
  dragon: [], // nothing matches: should return little or nothing
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'board-eval-'))
const ctx = await chromium.launchPersistentContext(profile, { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', viewport: { width: 1400, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
for (const [i, f] of files.entries()) {
  const b64 = fs.readFileSync(f).toString('base64')
  await page.evaluate(async ([b64, name, i]) => {
    const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'image/jpeg' })
    const dt = new DataTransfer(); dt.items.add(file)
    document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 300 + (i % 4) * 250, clientY: 200 + Math.floor(i / 4) * 220 }))
  }, [b64, names[i], i])
  await page.waitForFunction((k) => document.querySelectorAll('.item').length === k, i + 1)
}
console.log(`dropped ${files.length}; waiting for model + analysis...`)
await page.waitForTimeout(2000)
await page.waitForFunction(() => !document.querySelector('.status'), null, { timeout: 540000, polling: 1000 })
await page.waitForTimeout(1500)

const result = await page.evaluate(async ([queries, names]) => {
  const { embedText } = await import('/src/categorize/style/classifier.ts')
  const { queryToPrompt, semanticMatches, similarity } = await import('/src/categorize/style/search.ts')
  const assets = (await new Promise((res) => { const r = indexedDB.open('board'); r.onsuccess = () => { const q = r.result.transaction('assets').objectStore('assets').getAll(); q.onsuccess = () => res(q.result) } }))
    .sort((a, b) => a.createdAt - b.createdAt)
  const out = {}
  for (const q of queries) {
    const v = await embedText(queryToPrompt(q))
    const scored = assets.map((a, i) => ({ name: names[i], s: similarity(v, a.embedding) })).sort((a, b) => b.s - a.s)
    const kept = [...semanticMatches(v, assets.map((a, i) => ({ id: names[i], embedding: a.embedding }))).keys()]
    out[q] = { types: assets.map((a, i) => names[i] + '=' + (a.types ?? []).join('+')).join(' '), top: scored.slice(0, 5).map((x) => `${x.name}:${x.s.toFixed(3)}`), kept }
  }
  return out
}, [Object.keys(EXPECT), names])

let hits = 0, wrong = 0, missed = 0
for (const [q, want] of Object.entries(EXPECT)) {
  const { top, kept } = result[q]
  const isWanted = (n) => want.some((w) => n.includes(w))
  const gotRight = kept.filter(isWanted).length, gotWrong = kept.filter((n) => !isWanted(n)).length
  const total = names.filter(isWanted).length
  hits += gotRight; wrong += gotWrong; missed += total - gotRight
  console.log(JSON.stringify(q).padEnd(20), `kept ${kept.length}: right ${gotRight}/${total}, wrong ${gotWrong}`, '| kept =', kept.join(', ') || '-')
  console.log(' '.repeat(20), 'top5:', top.join('  '))
}
console.log('types:', Object.values(result)[0].types)
console.log(`TOTAL right ${hits}, wrong ${wrong}, missed ${missed}`)
await ctx.close()
fs.rmSync(profile, { recursive: true, force: true })
