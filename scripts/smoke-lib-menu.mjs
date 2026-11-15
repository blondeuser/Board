// Right-click an image in the Library: the menu must offer "Add to board" (browser dev mode; npm run dev first).
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
await page.locator('.cell').first().click({ button: 'right' })
await page.waitForTimeout(300)
const items = await page.locator('[role=menu] [role=menuitem], .ctx-list *, .menu-list *').allTextContents().catch(() => [])
console.log('menu text:', JSON.stringify(await page.locator('[role=menu]').first().innerText().catch((e) => 'NO MENU ' + e.message)))
await page.screenshot({ path: process.env.SHOT ?? 'smoke-lib-menu.png' })
await browser.close()
