// Smoke test: drives the dev server in Edge. Usage: npm run dev (other terminal), then node scripts/smoke.mjs
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(process.env.URL ?? 'http://localhost:5173')
await page.waitForSelector('.viewport')

// Build a red/blue PNG in-page and drop it as a file.
const drop = (name, color) =>
  page.evaluate(async ([name, color]) => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 120
    const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 200, 120)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], name, { type: 'image/png' }))
    document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 700, clientY: 400 }))
  }, [name, color])
const paste = () =>
  page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 100; c.height = 100
    const g = c.getContext('2d'); g.fillStyle = '#0a3ee0'; g.fillRect(0, 0, 100, 100)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'clip.png', { type: 'image/png' }))
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })

await drop('red.png', '#e02020')
await page.waitForSelector('.item img')
await paste()
await page.waitForFunction(() => document.querySelectorAll('.item').length === 2)
console.log('items after drop+paste:', await page.locator('.item').count())

// drag the first item by 100px
const first = page.locator('.item').first()
const b0 = await first.boundingBox()
await page.mouse.move(b0.x + 20, b0.y + 20); await page.mouse.down(); await page.mouse.move(b0.x + 120, b0.y + 20, { steps: 5 }); await page.mouse.up()
const b1 = await first.boundingBox()
console.log('dragged dx:', Math.round(b1.x - b0.x))

// wheel zoom
await page.mouse.move(650, 400); await page.mouse.wheel(0, -200)
console.log('zoom label:', await page.locator('.zoomval').textContent())
// pan empty space
await page.mouse.move(300, 700); await page.mouse.down(); await page.mouse.move(400, 650, { steps: 4 }); await page.mouse.up()

// colour tags + category
await page.locator('.item').nth(1).click({ position: { x: 20, y: 20 } })
console.log('inspector visible:', await page.locator('.inspector').isVisible())
await page.getByTitle('New category').click(); await page.keyboard.type('Poster'); await page.keyboard.press('Enter')
await page.locator('.inspector .chip', { hasText: 'Poster' }).click()
console.log('colour tags on selected:', await page.locator('.inspector .swatch.on').evaluateAll((e) => e.map((x) => x.title)))
await page.locator('.sidebar .swatch[title=blue]').click()
console.log('dimmed after filter blue:', await page.locator('.item.dimmed').count())
await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT ?? 'smoke.png' })

// persistence
await page.reload(); await page.waitForSelector('.item img')
console.log('items after reload:', await page.locator('.item').count(), 'categories:', await page.locator('.sidebar li .name', { hasText: 'Poster' }).count())
// add board
await page.getByTitle('New board').click()
console.log('boards:', await page.locator('.sidebar section', { has: page.getByRole('heading', { name: 'Boards' }) }).locator('li').count(), 'items on new board:', await page.locator('.item').count())
console.log('errors:', errors)
await browser.close()
