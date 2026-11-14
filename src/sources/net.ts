// Direct network access for the desktop app (Tauri HTTP plugin; no CORS). The browser build never uses this: it goes
// through the dev-server proxies in vite.config.ts. Rules that keep "add a link" from reaching your own machine/LAN:
// public http(s) hosts only, checked on every redirect hop. Known limit: a hostname that resolves to a private address
// (DNS rebinding) can't be seen from the webview; the http capability in src-tauri also denies the common private names.

export class NetError extends Error {}

/** True for hosts that look public. `host` as given by `new URL(...).hostname` (already normalised to dotted IPv4 / bracketed IPv6). */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h || h === 'localhost' || /\.(localhost|local|internal|lan|home|corp)$/.test(h) || !h.includes('.') && !h.includes(':')) return false
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return !(a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224)
  }
  if (h.includes(':')) return !(h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:') || h.startsWith('64:ff9b:'))
  return true
}

async function plainFetch(url: string, init: Record<string, unknown>): Promise<Response> {
  const { fetch } = await import('@tauri-apps/plugin-http')
  return fetch(url, init as RequestInit)
}

/** GET with manual redirects (max 4 hops); each hop must be http(s) on a public host. */
export async function fetchPublic(start: string, accept: string, signal?: AbortSignal): Promise<Response> {
  let url = new URL(start)
  for (let hop = 0; hop < 5; hop++) {
    if (!/^https?:$/.test(url.protocol) || !isPublicHost(url.hostname)) throw new NetError('That address is not a public web page.')
    const res = await plainFetch(url.href, {
      method: 'GET',
      redirect: 'manual',
      maxRedirections: 0,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; REMind/0.1 link preview)', accept },
      signal,
    })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url)
      continue
    }
    return res
  }
  throw new NetError('Too many redirects.')
}

/** GET a fixed allow-listed address (the LIT importer). */
export const fetchFrom = (url: string, signal?: AbortSignal): Promise<Response> =>
  plainFetch(url, { method: 'GET', headers: { 'user-agent': 'REMind/0.1 (personal reference library)' }, signal })
