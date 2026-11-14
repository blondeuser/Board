// Network side of the LIT importer. litawards.com and its photo bucket send no CORS headers, so the browser
// build goes through the dev-server proxy in vite.config.ts (`/__lit?url=`). The Tauri step swaps `get` for the
// Tauri HTTP plugin; nothing else changes.
import { isDesktop } from '../../shared/desktop'
import { fetchFrom } from '../net'
import { LIT_WINNERS, parseIndex, parseWinner, type LitEntry, type LitIndex, type LitProject } from './parse'

export class LitError extends Error {}

/** Hosts the importer may read (same list as the dev proxy in vite.config.ts). */
const litAllowed = (host: string) =>
  host === 'litawards.com' || host === 'www.litawards.com' || (host.startsWith('litthreec.') && host.endsWith('.amazonaws.com'))

const PROXY = '/__lit?url='
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

async function get(url: string, signal?: AbortSignal): Promise<Response> {
  if (isDesktop()) {
    // Desktop app: fetch directly through the Tauri HTTP plugin (no CORS, no dev server).
    const u = new URL(url)
    if (u.protocol !== 'https:' || !litAllowed(u.hostname)) throw new LitError('That address is not on the LIT Awards site.')
    let r: Response
    try {
      r = await fetchFrom(url, signal)
    } catch (e) {
      if (signal?.aborted) throw e
      // Keep the plugin's reason (scope error, TLS, DNS…): "check your connection" alone hid a broken capability once.
      const why = e instanceof Error ? e.message : String(e)
      throw new LitError(`Could not reach the LIT Awards site. Check your connection.${why ? ` (${why})` : ''}`)
    }
    if (!r.ok) throw new LitError(`LIT Awards answered ${r.status} for ${url}`)
    return r
  }
  let res: Response
  try {
    res = await fetch(PROXY + encodeURIComponent(url), { signal })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new LitError('Could not reach the LIT Awards site. Check your connection.')
  }
  if (res.headers.get('x-lit-proxy') !== '1') {
    throw new LitError('Importing from LIT Awards needs the dev server (npm run dev) for now; the desktop app will fetch directly.')
  }
  if (!res.ok) throw new LitError(`LIT Awards answered ${res.status} for ${url}`)
  return res
}

export const winnersUrl = (edition?: string) => (edition ? `${LIT_WINNERS}?comp_name=${encodeURIComponent(edition)}` : LIT_WINNERS)

export async function loadWinners(edition?: string, signal?: AbortSignal): Promise<LitIndex> {
  const index = parseIndex(await (await get(winnersUrl(edition), signal)).text())
  if (!index.entries.length) throw new LitError('No winners found on that page. The LIT site layout may have changed.')
  return index
}

export async function loadProject(entry: LitEntry, signal?: AbortSignal): Promise<LitProject> {
  return parseWinner(await (await get(entry.url, signal)).text(), entry.id)
}

export async function loadPhoto(url: string, signal?: AbortSignal): Promise<Blob> {
  const blob = await (await get(url, signal)).blob()
  if (blob.type.startsWith('image/')) return blob
  // S3 sometimes labels photos as binary: trust the file extension instead.
  const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? ''
  if (!MIME[ext]) throw new LitError('Not an image')
  return new Blob([blob], { type: MIME[ext] })
}

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
