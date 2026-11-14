// Marquee-select + Space-pan smoke test. Needs the dev server running (npm.cmd run dev).
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } })
await page.goto('http://localhost:5173'); await page.waitForSelector('.viewport')
const drop = (x, y) => page.evaluate(async ([x, y]) => {
  const c = document.createElement('canvas'); c.width = 200; c.height = 120
  c.getContext('2d').fillRect(0, 0, 200, 120)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'a.png', { type: 'image/png' }))
  document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: x, clientY: y }))
}, [x, y])
await drop(500, 300); await page.waitForFunction(() => document.querySelectorAll('.item').length === 1)
await drop(900, 600); await page.waitForFunction(() => document.querySelectorAll('.item').length === 2)
await page.mouse.click(1000, 150) // clear
console.log('selected before:', await page.locator('.item.selected').count())
await page.mouse.move(300, 100); await page.mouse.down(); await page.mouse.move(1250, 750, { steps: 8 })
console.log('marquee visible:', await page.locator('.marquee').isVisible())
await page.mouse.up()
console.log('selected after drag all:', await page.locator('.item.selected').count(), 'marquee gone:', !(await page.locator('.marquee').count()))
await page.mouse.click(1000, 150)
await page.mouse.move(300, 100); await page.mouse.down(); await page.mouse.move(600, 380, { steps: 8 }); await page.mouse.up()
console.log('partial box selects:', await page.locator('.item.selected').count())
await page.mouse.move(300, 700); await page.keyboard.down('Space'); await page.mouse.down(); await page.mouse.move(400, 700, { steps: 3 }); await page.mouse.up(); await page.keyboard.up('Space')
console.log('space-pan keeps selection count:', await page.locator('.item.selected').count())
await browser.close()
