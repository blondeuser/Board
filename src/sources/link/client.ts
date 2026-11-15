// Network side of "add a link". Web pages send no CORS headers, so the browser build asks the dev-server proxy
// in vite.config.ts (`/__link?url=`), which reads the page, finds its preview image and returns the image bytes
// with the page title/site in headers. The Tauri step swaps this for the Tauri HTTP plugin plus `parseLink`.
import type { AssetSource } from '../../shared/types'
import { isDesktop } from '../../shared/desktop'
import { NetError, fetchPublic } from '../net'
import { parseLink, titleFromUrl, youtubeId } from './parse'

export class LinkError extends Error {}

export interface LinkResult {
  blob: Blob
  source: AssetSource
}

/** Image type from the first bytes (some CDNs send images as application/octet-stream), or '' when it is not a format we import. */
export function sniffImageType(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return ''
}

/** The response body as an image blob: trusts the bytes over the Content-Type header. Null when it is not an image. */
async function imageBlob(res: Response): Promise<Blob | null> {
  const bytes = new Uint8Array(await res.arrayBuffer())
  const type = sniffImageType(bytes) || ((res.headers.get('content-type') ?? '').split(';')[0].trim().startsWith('image/') ? res.headers.get('content-type')!.split(';')[0].trim() : '')
  return type ? new Blob([bytes], { type }) : null
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
    const blob = await imageBlob(page)
    if (!blob) throw new LinkError('That address is not an image this app can read.')
    if (blob.size > MAX) throw new LinkError('The image is too large.')
    return { blob, source: { site, url: url.trim(), imageUrl: url.trim(), title: titleFromUrl(url) } }
  }
  const meta = parseLink((await page.text()).slice(0, 600_000), page.url || url)
  const yt = youtubeId(url)
  if (!meta.image && yt) meta.image = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`
  // YouTube pages give apps no title tag either: its oEmbed endpoint does.
  if (!meta.title && yt) meta.title = await youtubeTitle(url, signal)
  if (!meta.image) throw new LinkError('That page has no preview image.')
  let img: Response
  try {
    // Many image hosts refuse a request that does not say which page it comes from.
    img = await fetchPublic(meta.image, 'image/*', signal, page.url || url)
  } catch (e) {
    if (signal?.aborted) throw e
    throw new LinkError(`Couldn't load the page's preview image (${e instanceof NetError ? e.message : 'network error'}).`)
  }
  if (!img.ok) throw new LinkError(`Couldn't load the page's preview image (the site answered ${img.status}).`)
  const blob = await imageBlob(img)
  if (!blob) throw new LinkError("The page's preview image is not a format this app can read (JPEG, PNG, WebP, GIF, BMP).")
  if (blob.size > MAX) throw new LinkError('The preview image is too large.')
  return { blob, source: { site: meta.site ?? site, url: url.trim(), imageUrl: meta.image, title: meta.title || titleFromUrl(url) } }
}

async function youtubeTitle(url: string, signal?: AbortSignal): Promise<string | undefined> {
  try {
    const r = await fetchPublic('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), 'application/json', signal)
    return r.ok ? ((await r.json()) as { title?: string }).title : undefined
  } catch { return undefined }
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
