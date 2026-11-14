// Image-type detection (on-device CLIP). First run downloads the model, so allow a few minutes. Needs the dev server.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')

// Image 1: a screenshot of the app itself. Image 2: big black lettering on white.
const shot = (await page.screenshot()).toString('base64')
await page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const dt = new DataTransfer(); dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' }))
  document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 500, clientY: 300 }))
}, shot)
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 900; c.height = 600
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 600)
  g.fillStyle = '#000'; g.font = 'bold 220px Georgia'; g.fillText('Aa Bb', 80, 330); g.font = '48px Georgia'; g.fillText('Typeface specimen', 90, 460)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'type.png', { type: 'image/png' }))
  document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 900, clientY: 300 }))
})
await page.waitForFunction(() => document.querySelectorAll('.item').length === 2)
console.log('waiting for model + detection (first run downloads ~210 MB)...')
await page.waitForFunction(() => !document.querySelector('.status') && document.querySelectorAll('.sidebar .chip.plain').length > 0, null, { timeout: 280000, polling: 1000 })
console.log('types in sidebar:', await page.locator('.sidebar .chip.plain').allTextContents())
const pids = await page.locator('.item').evaluateAll((els) => els.map((e) => e.dataset.pid)) // DOM order changes when an item is raised
for (const [i, pid] of pids.entries()) {
  await page.mouse.click(1250, 700) // clear selection
  await page.locator(`[data-pid="${pid}"]`).click({ position: { x: 10, y: 10 } })
  console.log(`item ${i} types:`, await page.locator('.inspector .chip.plain').allTextContents())
}
console.log('errors:', errors)
await browser.close()
