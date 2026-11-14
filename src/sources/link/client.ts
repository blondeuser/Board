// Network side of "add a link". Web pages send no CORS headers, so the browser build asks the dev-server proxy
// in vite.config.ts (`/__link?url=`), which reads the page, finds its preview image and returns the image bytes
// with the page title/site in headers. The Tauri step swaps this for the Tauri HTTP plugin plus `parseLink`.
import type { AssetSource } from '../../shared/types'
import { isDesktop } from '../../shared/desktop'
import { NetError, fetchPublic } from '../net'
import { parseLink } from './parse'

export class LinkError extends Error {}

export interface LinkResult {
  blob: Blob
  source: AssetSource
}

export const isWebUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim())

/** Desktop: read the page, find its preview image, fetch it (public hosts only, see sources/net.ts). */
async function loadLinkDirect(url: string, signal?: AbortSignal): Promise<LinkResult> {
  let page: Response
  try {
    page = await fetchPublic(url, 'text/html,application/xhtml+xml,image/*', signal)
  } catch (e) {
    if (signal?.aborted) throw e
    throw new LinkError(e instanceof NetError ? e.message : 'Could not reach the link. Check your connection.')
  }
  if (!page.ok) throw new LinkError(`The site answered ${page.status}.`)
  const MAX = 25_000_000
  const site = new URL(url).hostname.replace(/^www\./, '')
  if ((page.headers.get('content-type') ?? '').startsWith('image/')) {
    const blob = await page.blob()
    if (blob.size > MAX) throw new LinkError('The image is too large.')
    return { blob, source: { site, url: url.trim(), imageUrl: url.trim() } }
  }
  const meta = parseLink((await page.text()).slice(0, 600_000), page.url || url)
  if (!meta.image) throw new LinkError('That page has no preview image.')
  let img: Response
  try {
    img = await fetchPublic(meta.image, 'image/*', signal)
  } catch {
    throw new LinkError("Couldn't load the page's preview image.")
  }
  const blob = await img.blob()
  if (!img.ok || !blob.type.startsWith('image/')) throw new LinkError("Couldn't load the page's preview image.")
  if (blob.size > MAX) throw new LinkError('The preview image is too large.')
  return { blob, source: { site: meta.site ?? site, url: url.trim(), imageUrl: meta.image, title: meta.title } }
}

export async function loadLink(url: string, signal?: AbortSignal): Promise<LinkResult> {
  if (isDesktop()) return loadLinkDirect(url, signal)
  let res: Response
  try {
    res = await fetch('/__link?url=' + encodeURIComponent(url.trim()), { signal })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new LinkError('Could not reach the link. Check your connection.')
  }
  if (res.headers.get('x-link-proxy') !== '1') throw new LinkError('Adding links needs the dev server (npm run dev) for now; the desktop app will fetch directly.')
  if (!res.ok) throw new LinkError((await res.text()) || `The site answered ${res.status}`)
  const blob = await res.blob()
  const dec = (h: string) => {
    const v = res.headers.get(h)
    return v ? decodeURIComponent(v) : undefined
  }
  return {
    blob,
    source: {
      site: dec('x-link-site') ?? new URL(url).hostname.replace(/^www\./, ''),
      url: dec('x-link-page') ?? url.trim(),
      imageUrl: dec('x-link-image'),
      title: dec('x-link-title'),
    },
  }
}
