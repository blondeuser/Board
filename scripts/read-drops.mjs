// Prints the [drop] console lines from the running desktop app (start it with --remote-debugging-port=9222).
import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
for (const ctx of browser.contexts()) {
  for (const page of ctx.pages()) {
    console.log('page:', page.url())
    const cdp = await ctx.newCDPSession(page)
    cdp.on('Runtime.consoleAPICalled', (m) => {
      const t = m.args.map((a) => a.value ?? a.description).join(' ')
      if (t.startsWith('[drop]')) console.log(t)
    })
    await cdp.send('Runtime.enable') // replays buffered console calls
  }
}
await new Promise((r) => setTimeout(r, Number(process.env.WAIT ?? 1500)))
await browser.close()
