// Frame-time check: 12 large photos, select all, drag the group, zoom. Needs the dev server running.
import { chromium } from 'playwright-core'
const N = Number(process.env.N ?? 12)
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } })
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
for (let i = 0; i < N; i++) {
  await page.evaluate(async (i) => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000
    const g = c.getContext('2d')
    for (let k = 0; k < 400; k++) { g.fillStyle = `hsl(${(i * 40 + k * 7) % 360} 70% ${20 + (k % 60)}%)`; g.fillRect(Math.random() * 4000, Math.random() * 3000, 600, 400) }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'p.jpg', { type: 'image/jpeg' }))
    document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: 500 + (i % 4) * 140, clientY: 300 + Math.floor(i / 4) * 120 }))
  }, i)
  await page.waitForFunction((k) => document.querySelectorAll('.item').length === k, i + 1, { timeout: 60000 })
}
await page.waitForFunction(() => [...document.querySelectorAll('.item img')].every((i) => i.complete && i.naturalWidth))
await page.getByTitle('Fit all').click(); await page.waitForTimeout(500)
const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable')
const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
let m0 = await metric()
await page.evaluate(() => {
  window.__frames = []; let last = performance.now()
  const tick = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
const stats = async (label) => {
  const f = await page.evaluate(() => { const a = window.__frames.slice(2); window.__frames = []; return a })
  f.sort((a, b) => a - b)
  const m1 = await metric()
  const ms = (k) => Math.round((m1[k] - m0[k]) * 1000)
  const heap = Math.round(m1.JSHeapUsedSize / 1e6)
  const extra = `| script ${ms('ScriptDuration')}ms layout ${ms('LayoutDuration')}ms style ${ms('RecalcStyleDuration')}ms task ${ms('TaskDuration')}ms heap ${heap}MB`
  m0 = m1
  console.log(label.padEnd(22), 'avg fps', Math.round(1000 / (f.reduce((s, x) => s + x, 0) / f.length)), '| worst frame', Math.round(f.at(-1)), 'ms | p95', Math.round(f[Math.floor(f.length * 0.95)]), 'ms', extra)
}
await page.waitForTimeout(300); await stats('idle')
await page.mouse.move(250, 60); await page.mouse.down(); await page.mouse.move(1350, 800, { steps: 40 }); await stats('marquee select all')
await page.mouse.up()
const b = await page.locator('.item').first().boundingBox()
await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down(); await page.mouse.move(b.x + 220, b.y + 120, { steps: 60 }); await stats('drag 12 selected')
await page.mouse.up()
await page.mouse.move(700, 400); for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, i < 10 ? -100 : 100); await page.waitForTimeout(16) } ; await stats('wheel zoom')
await browser.close()
