// Cards mode must scroll vertically only (no zoom, no horizontal pan). Needs the dev server running.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 700 } })
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
for (let i = 0; i < 12; i++) {
  await page.evaluate(async (i) => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 150
    const g = c.getContext('2d'); g.fillStyle = `hsl(${i * 30} 70% 50%)`; g.fillRect(0, 0, 200, 150)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'a.png', { type: 'image/png' }))
    document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 300 + i * 60, clientY: 300 + i * 40 }))
  }, i)
  await page.waitForFunction((k) => document.querySelectorAll('.item').length === k, i + 1)
}
await page.getByTitle('Cards mode (bento grid)').click(); await page.waitForTimeout(400)
const pos = () => page.locator('.world').evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).toJSON())
const a = await pos()
await page.mouse.move(700, 350)
await page.mouse.wheel(0, 300); await page.waitForTimeout(100)
const b = await pos()
await page.mouse.wheel(300, 0); await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); await page.waitForTimeout(100)
const c = await pos()
console.log('scrolled down by', Math.round(a.f - b.f), '| after horiz + ctrl-wheel: x same', a.e === c.e, 'zoom same', a.a === c.a)
await page.mouse.wheel(0, 99999); await page.waitForTimeout(100)
const end = await pos(); const bottom = await page.locator('.item').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)))
console.log('bottom of content at end of scroll:', Math.round(bottom), 'of viewport', 700)
await page.mouse.wheel(0, -99999); await page.waitForTimeout(100)
console.log('top y after scrolling up:', Math.round((await pos()).f))
console.log('zoombar hidden:', (await page.locator('.zoombar').count()) === 0)
await browser.close()
