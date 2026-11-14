// Notes + bento mode smoke test. Needs the dev server running (npm.cmd run dev). SHOT=path saves a screenshot.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
const drop = (x, y, w, h, color) => page.evaluate(async ([x, y, w, h, color]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'a.png', { type: 'image/png' }))
  document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: x, clientY: y }))
}, [x, y, w, h, color])
let n = 0
for (const [x, y, w, h, c] of [[500, 300, 300, 100, '#e02020'], [800, 300, 100, 300, '#2060e0'], [600, 600, 200, 200, '#20a040']]) {
  await drop(x, y, w, h, c); await page.waitForFunction((k) => document.querySelectorAll('.item').length === k, ++n)
}
await page.getByTitle('New note').click()
await page.keyboard.type('Remember: warm palette, grainy photos')
await page.mouse.click(1100, 700) // blur commits
console.log('note text:', await page.locator('.item.note .note-text').textContent())
await page.getByTitle('Cards mode (bento grid)').click()
await page.waitForTimeout(500)
console.log('bento active:', await page.locator('.world.bento').count(), 'items:', await page.locator('.item').count())
const boxes = await page.locator('.item').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
const overlaps = boxes.some((a, i) => boxes.some((b, j) => j > i && a.x < b.right - 1 && b.x < a.right - 1 && a.y < b.bottom - 1 && b.y < a.bottom - 1))
console.log('overlaps in bento:', overlaps)
await page.screenshot({ path: process.env.SHOT ?? 'smoke-notes.png' })
await page.reload(); await page.waitForSelector('.item')
console.log('bento persisted:', await page.locator('.world.bento').count(), 'note kept:', await page.locator('.item.note').count())
await page.getByTitle('Back to free layout').click()
console.log('free again:', (await page.locator('.world.bento').count()) === 0)
console.log('errors:', errors)
await browser.close()
