// Is the desktop app's main webview alive? Lists webviews and evaluates 1+1 in the first page.
import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
for (const page of browser.contexts().flatMap((c) => c.pages())) {
  const r = await Promise.race([page.evaluate(() => `${document.title} ${innerWidth}x${innerHeight} root=${document.getElementById('root')?.children.length}`), new Promise((r) => setTimeout(() => r('NO RESPONSE'), 5000))])
  console.log(page.url(), '->', r)
}
await browser.close()
