// Desktop smoke test: drives the running Tauri window over WebView2's remote-debugging port.
// Start the app first:  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 npm run tauri dev
import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts()[0].pages()[0]
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.waitForSelector('.viewport', { timeout: 60000 })
console.log('desktop:', await page.evaluate(() => !!window.__TAURI_INTERNALS__))
const before = await page.locator('.item').count()
const drop = (color, x) => page.evaluate(async ([color, x]) => {
  const c = document.createElement('canvas'); c.width = 3000; c.height = 2000
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 3000, 2000)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'a.png', { type: 'image/png' }))
  document.querySelector('.viewport').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, clientX: x, clientY: 300 }))
}, [color, x])
await drop('#e02020', 500); await drop('#e02020', 800) // same content twice: dedupe
await page.waitForTimeout(3000)
console.log('items on board:', (await page.locator('.item').count()) - before)
await page.locator('.sidebar li', { hasText: 'Library' }).click()
await page.waitForSelector('.library')
await page.waitForTimeout(1000)
console.log('library cells (dedupe => 1 new):', await page.locator('.cell').count())
console.log('img src:', await page.locator('.cell img').first().getAttribute('src'))
await page.reload(); await page.waitForSelector('.viewport'); await page.waitForTimeout(2000)
await page.locator('.sidebar li', { hasText: 'Library' }).click()
await page.waitForTimeout(1000)
console.log('after reload, cells:', await page.locator('.cell').count(), '| img loaded:',
  await page.evaluate(() => [...document.querySelectorAll('.cell img')].every((i) => i.naturalWidth > 0)))
console.log('errors:', errors)
await browser.close()
