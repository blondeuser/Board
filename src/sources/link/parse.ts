// Pure: a web page's HTML in, its preview (title, site name, preview image URL) out. No network, no DOM.

export interface LinkPreview {
  title?: string
  site?: string
  /** Absolute URL of the preview image (og:image / twitter:image / first icon fallback). */
  image?: string
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()

/** Attributes of every <meta ...> tag, keyed lower-case. */
function metaTags(html: string): Record<string, string>[] {
  const out: Record<string, string>[] = []
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {}
    for (const a of m[0].matchAll(/([a-z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? '')
    out.push(attrs)
  }
  return out
}

export function parseLink(html: string, pageUrl: string): LinkPreview {
  const metas = metaTags(html)
  const meta = (...keys: string[]) => {
    for (const k of keys) {
      const hit = metas.find((t) => (t.property ?? t.name)?.toLowerCase() === k && t.content)
      if (hit) return hit.content
    }
  }
  const absolute = (u?: string) => {
    if (!u) return undefined
    try {
      return new URL(u, pageUrl).href
    } catch {
      return undefined
    }
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const icon = /<link\b[^>]*rel\s*=\s*["'][^"']*apple-touch-icon[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]
  return {
    title: meta('og:title', 'twitter:title') ?? (titleTag ? decode(titleTag.replace(/\s+/g, ' ')) : undefined),
    site: meta('og:site_name') ?? safeHost(pageUrl),
    image: absolute(meta('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src') ?? icon),
  }
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}
