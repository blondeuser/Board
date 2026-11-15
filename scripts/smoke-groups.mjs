// Library grouped by category: sections stack, collapse, and follow tag changes. Needs the dev server.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
const drop = (color, x, y) => page.evaluate(async ([color, x, y]) => {
  const c = document.createElement('canvas'); c.width = 240; c.height = 160
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 240, 160)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'a.png', { type: 'image/png' }))
  document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: x, clientY: y }))
}, [color, x, y])
for (const [i, c] of ['#e02020', '#2060e0', '#20a040', '#f0c020'].entries()) {
  await drop(c, 450 + (i % 2) * 420, 220 + Math.floor(i / 2) * 330); await page.waitForFunction((k) => document.querySelectorAll('.item').length === k, i + 1)
}
// two categories
for (const name of ['Posters', 'Interiors']) {
  await page.getByTitle('New category').click(); await page.keyboard.type(name); await page.keyboard.press('Enter')
}
const pids = await page.locator('.item').evaluateAll((els) => els.map((e) => e.dataset.pid))
const tag = async (pid, cat) => {
  await page.mouse.click(1250, 760)
  await page.locator(`[data-pid="${pid}"]`).click({ position: { x: 8, y: 8 } })
  await page.locator('.inspector .chip', { hasText: cat }).click()
}
await tag(pids[0], 'Posters'); await tag(pids[1], 'Posters'); await tag(pids[1], 'Interiors'); await tag(pids[2], 'Interiors')
await page.locator('.sidebar li', { hasText: 'Library' }).click()
await page.waitForFunction(() => document.querySelectorAll('.cell img').length >= 4)
const heads = () => page.locator('.group-toggle').evaluateAll((els) => els.map((e) => e.textContent.replace('›', '').trim()))
console.log('sections:', await heads())
console.log('cells (one image is in 2 sections):', await page.locator('.cell').count())
await page.locator('.group-toggle', { hasText: 'Posters' }).click()
console.log('cells after collapsing Posters:', await page.locator('.cell').count())
await page.locator('.group-head', { hasText: 'No tag' }).getByText('Select all').click()
console.log('select all in No tag ->', await page.locator('.inspector strong').textContent())
await page.locator('.group-toggle', { hasText: 'Posters' }).click(); await page.waitForTimeout(100); await page.locator('.group-toggle', { hasText: 'Posters' }).click(); await page.waitForTimeout(100); await page.screenshot({ path: process.env.SHOT ?? 'smoke-groups.png' })
// Type tab: sections titled by type, cards stacked under each title
const setType = async (i, label) => {
  await page.locator('.cell').nth(i).click()
  await page.locator('select[aria-label="Add type"]').selectOption({ label })
}
await page.locator('.group-toggle', { hasText: 'Posters' }).click() // expand again
await page.getByRole('tab', { name: 'All' }).click()
await setType(0, 'Photo'); await setType(1, 'Photo'); await setType(2, 'Screenshot')
await page.getByRole('tab', { name: 'Type' }).click()
console.log('type stacks (title under each):', await page.locator('.stack-title').allTextContents(), '| cards in Photo stack:', await page.locator('.stack-tile', { hasText: 'Photo' }).locator('.card').count())
await page.locator('.stack-tile', { hasText: 'Photo' }).click()
console.log('opened Photo ->', await page.locator('.group.opened .cell').count(), 'cards')
await page.screenshot({ path: process.env.SHOT2 ?? 'smoke-groups-type.png' })
await page.getByRole('tab', { name: 'Colour' }).click()
console.log('colour stacks:', await page.locator('.stack-title').allTextContents())
await page.screenshot({ path: process.env.SHOT3 ?? 'smoke-groups-colour.png' })
await page.getByRole('tab', { name: 'All' }).click()
console.log('group none -> sections:', await page.locator('.group-toggle').count(), 'cells:', await page.locator('.cell').count())
console.log('errors:', errors)
await browser.close()
