import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { parseLink } from './src/sources/link/parse'

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

/** True for loopback, private, link-local and other non-public addresses (IPv4 + IPv6). */
const privateIp = (ip: string) =>
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) ||
  /^(::1?$|f[cd]|fe[89ab]|::ffff:)/i.test(ip)

/** GET with manual redirects (max 4); every hop must be http(s) on a public address, so the proxy can't reach your LAN. */
async function publicGet(start: URL, accept: string): Promise<Response> {
  let url = start
  for (let hop = 0; hop < 5; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error('only http(s) links')
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
    if (!addrs.length || addrs.some(privateIp)) throw new Error('that address is not public')
    const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; Board/0.1 link preview)', accept }, signal: AbortSignal.timeout(15_000) })
    const loc = r.headers.get('location')
    if (r.status >= 300 && r.status < 400 && loc) {
      url = new URL(loc, url)
      continue
    }
    return r
  }
  throw new Error('too many redirects')
}

/**
 * Dev/preview-only proxy for "add a link" (src/sources/link/client.ts): reads the page, picks its preview image
 * (og:image etc.) and returns the image bytes; title/site/page/image URL travel in x-link-* headers.
 */
function linkProxy(): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/__link?')) return next()
    res.setHeader('x-link-proxy', '1')
    const fail = (code: number, msg: string) => {
      res.statusCode = code
      res.setHeader('content-type', 'text/plain')
      res.end(msg)
    }
    let page: URL
    try {
      page = new URL(new URL(req.url, 'http://local').searchParams.get('url') ?? '')
    } catch {
      return fail(400, 'That does not look like a web address.')
    }
    if (req.method !== 'GET') return fail(405, 'GET only')
    try {
      const pr = await publicGet(page, 'text/html,application/xhtml+xml,image/*')
      if (!pr.ok) return fail(502, `The site answered ${pr.status}.`)
      let imageUrl = page.href
      let imgRes = pr
      let meta: ReturnType<typeof parseLink> = { site: page.hostname.replace(/^www\./, '') }
      if (!(pr.headers.get('content-type') ?? '').startsWith('image/')) {
        meta = parseLink((await pr.text()).slice(0, 600_000), pr.url || page.href)
        if (!meta.image) return fail(422, 'That page has no preview image.')
        imageUrl = meta.image
        imgRes = await publicGet(new URL(meta.image), 'image/*')
      }
      const type = imgRes.headers.get('content-type') ?? ''
      if (!imgRes.ok || !type.startsWith('image/')) return fail(422, "Couldn't load the page's preview image.")
      const bytes = new Uint8Array(await imgRes.arrayBuffer())
      if (bytes.length > 25_000_000) return fail(413, 'The preview image is too large.')
      res.setHeader('content-type', type)
      res.setHeader('x-link-page', encodeURIComponent(page.href))
      res.setHeader('x-link-image', encodeURIComponent(imageUrl))
      if (meta.title) res.setHeader('x-link-title', encodeURIComponent(meta.title))
      if (meta.site) res.setHeader('x-link-site', encodeURIComponent(meta.site))
      res.end(bytes)
    } catch (e) {
      fail(502, e instanceof Error ? e.message : String(e))
    }
  }
  return {
    name: 'link-proxy',
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  }
}

export default defineConfig({
  plugins: [react(), litProxy(), linkProxy()],
  test: { include: ['tests/**/*.test.ts'] },
})
