import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Dev/preview-only proxy for the LIT Awards importer (src/sources/lit/client.ts): litawards.com and its photo
 * bucket send no CORS headers, so the browser can't read them directly. Only these hosts are forwarded, GET only.
 * Replaced by the Tauri HTTP plugin in the desktop app.
 */
function litProxy(): Plugin {
  const allowed = (host: string) =>
    host === 'litawards.com' || host === 'www.litawards.com' || (host.startsWith('litthreec.') && host.endsWith('.amazonaws.com'))
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/__lit?')) return next()
    res.setHeader('x-lit-proxy', '1')
    let target: URL
    try {
      target = new URL(new URL(req.url, 'http://local').searchParams.get('url') ?? '')
    } catch {
      res.statusCode = 400
      return res.end('bad url')
    }
    if (req.method !== 'GET' || target.protocol !== 'https:' || !allowed(target.hostname)) {
      res.statusCode = 403
      return res.end('not allowed')
    }
    try {
      const r = await fetch(target, { headers: { 'user-agent': 'REMSTUDIO-Board/0.1 (personal reference library)' } })
      res.statusCode = r.status
      res.setHeader('content-type', r.headers.get('content-type') ?? 'application/octet-stream')
      res.end(new Uint8Array(await r.arrayBuffer()))
    } catch (e) {
      res.statusCode = 502
      res.end(String(e))
    }
  }
  return {
    name: 'lit-proxy',
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  }
}

export default defineConfig({
  plugins: [react(), litProxy()],
  test: { include: ['tests/**/*.test.ts'] },
})
