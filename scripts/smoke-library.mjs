// Library view smoke test: images across boards, tagging, filter, add-to-board, remove-from-board keeps it, delete, library import.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('dialog', (d) => d.accept()) // confirm() on delete
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')

const drop = (selector, color, x = 600, y = 400) => page.evaluate(async ([selector, color, x, y]) => {
  const c = document.createElement('canvas'); c.width = 240; c.height = 160
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 240, 160)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'a.png', { type: 'image/png' }))
  document.querySelector(selector).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: x, clientY: y }))
}, [selector, color, x, y])
const count = (sel) => page.locator(sel).count()

await drop('.viewport', '#e02020', 500, 300); await page.waitForFunction(() => document.querySelectorAll('.item').length === 1)
await drop('.viewport', '#2060e0', 800, 300); await page.waitForFunction(() => document.querySelectorAll('.item').length === 2)
await page.getByTitle('New board').click()
await drop('.viewport', '#20a040', 600, 400); await page.waitForFunction(() => document.querySelectorAll('.item').length === 1)

await page.locator('.sidebar li', { hasText: 'Library' }).click()
await page.waitForSelector('.library')
await page.waitForFunction(() => document.querySelectorAll('.cell img').length === 3)
console.log('library cells:', await count('.cell'), '| sidebar count:', await page.locator('.sidebar li', { hasText: 'Library' }).locator('.muted').textContent())

// drop straight into the library: added to the library, placed on no board
await drop('.library', '#f0c020')
await page.waitForFunction(() => document.querySelectorAll('.cell').length === 4)
console.log('after library drop:', await count('.cell'), '| selected (new image):', await count('.cell.selected'))
console.log('inspector says:', await page.locator('.inspector .boards-line').textContent())

// add it to Board 1 from the inspector
await page.locator('select[aria-label="Add to board"]').selectOption({ label: 'Board 1' })
await page.waitForTimeout(200)
console.log('inspector after add:', await page.locator('.inspector .boards-line').textContent())

// filter by colour hides non-matching cells
await page.locator('.sidebar .swatch[title=blue]').click()
console.log('cells with blue filter:', await count('.cell'))
await page.locator('.sidebar .swatch[title=blue]').click()

// remove from board keeps it in the library
await page.locator('.sidebar li', { hasText: 'Board 2' }).click()
await page.locator('.item').first().click({ position: { x: 10, y: 10 } })
await page.keyboard.press('Delete')
await page.locator('.sidebar li', { hasText: 'Library' }).click()
await page.waitForSelector('.library')
console.log('cells after removing one from its board:', await count('.cell'))

// delete from library
await page.locator('.cell').first().click()
await page.keyboard.press('Delete')
await page.waitForFunction(() => document.querySelectorAll('.cell').length === 3)
console.log('cells after library delete:', await count('.cell'))
await page.reload(); await page.locator('.sidebar li', { hasText: 'Library' }).click()
await page.waitForSelector('.library')
console.log('after reload:', await count('.cell'))
console.log('errors:', errors)
await page.screenshot({ path: process.env.SHOT ?? 'smoke-library.png' })
await browser.close()
