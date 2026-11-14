// Draws the app icon (1024x1024 PNG) used by `npx tauri icon`: the wordmark "ReM:ind" (as in the menu bar) on a white square.
import { chromium } from 'playwright-core'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const f = (n) => pathToFileURL(path.resolve(`node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-${n}.woff2`)).href
const html = `<style>
@font-face { font-family: IS; font-style: normal; src: url('${f('normal')}'); }
@font-face { font-family: IS; font-style: italic; src: url('${f('italic')}'); }
html, body { margin: 0; }
.i { width: 1024px; height: 1024px; background: #fefefe; display: grid; place-items: center; }
.i span { font: 400 270px/1 IS, serif; color: #1e1e1e; white-space: nowrap; padding-bottom: 28px; }
</style><div class="i"><span id="t"><i>ReM:</i>ind</span></div>`

const browser = await chromium.launch({ executablePath: process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
// scale the text to ~82% of the square's width
await page.evaluate(() => { const t = document.getElementById('t'); const w = t.getBoundingClientRect().width; t.style.fontSize = (270 * 840 / w) + 'px' })
await page.screenshot({ path: 'src-tauri/icon-source.png', clip: { x: 0, y: 0, width: 1024, height: 1024 } })
await browser.close()
console.log('wrote src-tauri/icon-source.png')
