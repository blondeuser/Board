// Pen ink smoke: synthetic PEN events (CDP) on the board. Needs the dev server (URL=… to override).
// Checks: pen tip does nothing outside pen mode; in pen mode one stroke = one ink item; mouse still marquees;
// the eraser end removes the stroke; a stroke survives a reload. Real Wacom hardware still has to be tried by hand.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
const cdp = await page.context().newCDPSession(page)
const vb = await page.locator('.viewport').boundingBox()
const stroke = async (buttons, y0) => {
  const send = (type, i, extra = {}) => cdp.send('Input.dispatchMouseEvent', {
    type, x: vb.x + 300 + i * 6, y: vb.y + y0 + Math.sin(i / 5) * 40, button: type === 'mouseMoved' && !extra.buttons ? 'none' : 'left',
    buttons: 0, pointerType: 'pen', force: 0, ...extra,
  })
  await send('mouseMoved', 0)
  await send('mousePressed', 1, { buttons, force: 0.2, clickCount: 1 })
  for (let i = 2; i < 40; i++) await send('mouseMoved', i, { buttons, force: 0.1 + (i / 40) * 0.8 })
  await send('mouseReleased', 40, { force: 0 })
  await page.waitForTimeout(150)
}
const inks = () => page.locator('.item.ink').count()
const check = (name, ok) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) process.exitCode = 1 }

const start = await inks()
await stroke(1, 300)
check('pen tip outside pen mode draws nothing', (await inks()) === start)
await page.getByTitle(/^Pen: draw/).click()
await stroke(1, 300)
check('one stroke = one ink item', (await inks()) === start + 1)
await page.mouse.move(vb.x + 100, vb.y + 600); await page.mouse.down(); await page.mouse.move(vb.x + 200, vb.y + 700, { steps: 5 }); await page.mouse.up()
check('mouse drag does not draw', (await inks()) === start + 1)
await page.reload(); await page.waitForSelector('.viewport')
check('stroke survives reload', (await inks()) === start + 1)
// CDP cannot send pen buttons=32, so the eraser end is simulated with DOM PointerEvents (buttons 32, as Windows reports it).
await page.evaluate(({ x, y }) => {
  const vp = document.querySelector('.viewport')
  const ev = (type, i, buttons) => vp.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 77, pointerType: 'pen', clientX: x + i * 6, clientY: y + Math.sin(i / 5) * 40, button: type === 'pointerdown' ? 5 : 0, buttons, pressure: 0.5 }))
  ev('pointerdown', 1, 32)
  for (let i = 2; i < 40; i++) ev('pointermove', i, 32)
  ev('pointerup', 40, 0)
}, { x: vb.x + 300, y: vb.y + 300 })
await page.waitForTimeout(150)
check('eraser end removes the stroke', (await inks()) === start)
await page.screenshot({ path: process.env.SHOT ?? 'smoke-ink.png' })
console.log('errors:', errors)
if (errors.length) process.exitCode = 1
await browser.close()
