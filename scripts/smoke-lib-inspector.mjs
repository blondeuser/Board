// A Library card's caption/badge/colour strip must not paint over the inspector (browser dev mode; npm run dev first).
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } })
await page.goto(process.env.URL ?? 'http://localhost:5173')
await page.waitForSelector('.viewport')
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 200; c.height = 120
  const g = c.getContext('2d'); g.fillStyle = '#e02020'; g.fillRect(0, 0, 200, 120)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'red.png', { type: 'image/png' }))
  document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 700, clientY: 400 }))
})
await page.waitForSelector('.item')
await page.locator('.sidebar li', { hasText: 'Library' }).click()
await page.waitForSelector('.cell')
await page.locator('.cell').first().click()
await page.waitForSelector('.inspector')
// Stretch the card under the inspector and give it a caption, then see what is on top at the inspector's centre.
const top = await page.evaluate(() => {
  const cell = document.querySelector('.cell')
  cell.style.cssText += ';position:absolute;left:0;top:0;width:100%;height:600px;margin:0'
  cell.insertAdjacentHTML('beforeend', '<span class="link-title" style="top:0;bottom:0;pointer-events:auto">A long page title</span>')
  const r = document.querySelector('.inspector').getBoundingClientRect()
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + 20)
  return el?.closest('.inspector') ? 'inspector on top' : 'COVERED by ' + el?.className
})
console.log(top)
await browser.close()
