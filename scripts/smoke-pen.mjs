// Pen test panel smoke: sends synthetic PEN events (CDP Input.dispatchMouseEvent, pointerType 'pen' + force/tilt) at the
// Help > Pen test pad and checks the verdict. Needs the dev server. Real hardware still has to be tried by hand.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
await page.getByRole('button', { name: 'Help' }).click()
await page.getByRole('menuitem', { name: 'Pen test…' }).click()
const box = await page.locator('.pen-pad').boundingBox()
const cdp = await page.context().newCDPSession(page)
const send = (type, i, extra = {}) => cdp.send('Input.dispatchMouseEvent', {
  type, x: box.x + 40 + i * 6, y: box.y + 140 + Math.sin(i / 5) * 60, button: type === 'mouseMoved' && !extra.buttons ? 'none' : 'left',
  buttons: 0, pointerType: 'pen', force: 0, tiltX: 0, tiltY: 0, ...extra,
})
for (let i = 0; i < 6; i++) await send('mouseMoved', i) // hover
await send('mousePressed', 6, { buttons: 1, force: 0.1, clickCount: 1 })
for (let i = 7; i < 60; i++) await send('mouseMoved', i, { buttons: 1, force: 0.05 + (i / 60) * 0.9, tiltX: 20, tiltY: -10 })
await send('mouseReleased', 60, { force: 0 })
await page.waitForTimeout(200)
const text = await page.locator('.pen-test').innerText()
console.log(text.split('\n').filter(Boolean).slice(2).join('\n'))
await page.screenshot({ path: process.env.SHOT ?? 'smoke-pen.png' })
console.log('errors:', errors)
await browser.close()
