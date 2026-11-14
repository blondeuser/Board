// Thumbnails: imported photo is shown at <=1280px, and a missing thumb (older data) is rebuilt on load. Needs the dev server.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } })
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 4000; c.height = 3000
  c.getContext('2d').fillRect(0, 0, 4000, 3000)
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'p.jpg', { type: 'image/jpeg' }))
  document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 600, clientY: 400 }))
})
await page.waitForSelector('.item img')
await page.waitForFunction(() => document.querySelector('.item img').naturalWidth > 0)
console.log('displayed size:', await page.locator('.item img').evaluate((i) => `${i.naturalWidth}x${i.naturalHeight}`))
await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('board'); r.onsuccess = () => { const t = r.result.transaction('thumbs', 'readwrite'); t.objectStore('thumbs').clear(); t.oncomplete = () => res() }
}))
await page.reload(); await page.waitForFunction(() => document.querySelector('.item img')?.naturalWidth > 0)
console.log('after thumb wiped + reload:', await page.locator('.item img').evaluate((i) => `${i.naturalWidth}x${i.naturalHeight}`))
await browser.close()
