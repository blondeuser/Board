// Calls loadLink() inside the running desktop app (remote-debugging port 9222) for each URL and prints what happens.
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 npm run tauri dev
//   node scripts/probe-link.mjs <url> [<url> ...]
import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('localhost:5173')) ?? browser.contexts()[0].pages()[0]
for (const url of process.argv.slice(2)) {
  const r = await page.evaluate(async (u) => {
    try {
      const { loadLink } = await import('/src/sources/link/client.ts')
      const { blob, source } = await loadLink(u)
      return `OK ${blob.type} ${blob.size} bytes, image ${source.imageUrl}`
    } catch (e) { return `FAIL ${e?.constructor?.name}: ${e?.message ?? e}` }
  }, url)
  console.log(url, '->', r)
}
await browser.close()
