// Plain text smoke (needs the dev server): add text with the T key, type, format it in the inspector, reload.
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(process.env.URL ?? 'http://localhost:5173'); await page.waitForSelector('.viewport')
const check = (name, ok) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) process.exitCode = 1 }
const texts = () => page.locator('.item.text').count()
const start = await texts()
await page.mouse.move(600, 400)
await page.getByTitle('Add text (T)').click()
await page.keyboard.type('Hello board')
await page.keyboard.press('Escape') // blur = commit
await page.waitForTimeout(200)
check('text added', (await texts()) === start + 1)
const item = page.locator('.item.text').last()
await item.click()
await page.getByLabel('Font').selectOption('serif')
await page.getByLabel('Size').selectOption('64')
await page.getByTitle('Bold').click()
await page.getByTitle('Align center').click()
await page.getByTitle('#e5484d').click()
const css = await item.evaluate((e) => { const c = getComputedStyle(e); return [c.fontFamily, c.fontSize, c.fontWeight, c.textAlign, c.color].join('|') })
console.log(css)
check('format applied', /Georgia/.test(css) && css.includes('64px') && css.includes('|700|') && css.includes('center') && css.includes('rgb(229, 72, 77)'))
await page.reload(); await page.waitForSelector('.item.text')
check('survives reload', (await texts()) === start + 1 && /hello board/i.test(await page.locator('.item.text').last().innerText()))
// empty text is dropped
await page.getByTitle('Add text (T)').click(); await page.keyboard.press('Escape'); await page.waitForTimeout(200)
check('empty text is removed', (await texts()) === start + 1)
await page.locator('.item.text').last().click(); await page.keyboard.press('Delete'); await page.waitForTimeout(200)
check('delete removes it', (await texts()) === start)
console.log('errors:', errors); if (errors.length) process.exitCode = 1
await browser.close()
