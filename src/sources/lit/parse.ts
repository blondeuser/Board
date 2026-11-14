// Parsers for the LIT Lighting Design Awards winners pages (https://litawards.com/winners/).
// Pure string-in, data-out (no DOM), so they run in tests, the browser and later in Tauri alike.
// The site is plain server-rendered PHP; if its markup changes, update the fixtures in tests/fixtures/lit/ first.

export const LIT_WINNERS = 'https://litawards.com/winners/'

export interface LitEdition {
  /** Value the site expects in `?comp_name=`, e.g. "LIT Design Awards 2025". */
  value: string
  label: string
  year?: number
}

/** One winning project as listed on a winners page. */
export interface LitEntry {
  id: string
  url: string
  project: string
  company: string
  /** Award categories this project won, e.g. "Ambient Lighting", "Architectural Lighting Design of the Year". */
  categories: string[]
  /** Small preview image on the winners page. */
  cover?: string
}

export interface LitIndex {
  editions: LitEdition[]
  /** The edition this page shows (its `value`). */
  edition: string
  entries: LitEntry[]
  /** Every category on the page, in page order. */
  categories: string[]
}

/** A single winner page: credits and the full-size photo URLs. */
export interface LitProject {
  id: string
  url: string
  title: string
  categories: string[]
  /** Labelled text rows: "Lead Designers", "Photo Credits", "Project Location", "Entry Description", … */
  fields: Record<string, string>
  /** Labelled links: "Project Link", "Company Link". */
  links: Record<string, string>
  /** Full-size photos in page order (first = hero image). */
  images: string[]
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? m
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  })
}

/** HTML fragment to plain text: <br> becomes a newline, tags go, entities are decoded, whitespace is tidied. */
export function htmlText(html: string): string {
  return decodeEntities(html.replace(/<\/?br\s*\/?>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, ''))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')
const yearOf = (s: string) => {
  const m = /\b(20\d{2})\b/.exec(s)
  return m ? Number(m[1]) : undefined
}
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
const divText = (html: string, cls: string) => {
  const m = new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`, 'i').exec(html)
  return m ? htmlText(m[1]) : ''
}

/** Parse a winners page (`/winners/` or `/winners/?comp_name=…`). Projects listed in several categories become one entry. */
export function parseIndex(html: string): LitIndex {
  const clean = stripComments(html)

  const selStart = clean.indexOf('id="changeComp"')
  const selectHtml = selStart >= 0 ? clean.slice(selStart, clean.indexOf('</select>', selStart)) : clean
  let edition = ''
  const editions: LitEdition[] = []
  for (const m of selectHtml.matchAll(/<option\s+value=(['"])(.*?)\1([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const value = decodeEntities(m[2])
    const label = htmlText(m[4]) || value
    editions.push({ value, label, year: yearOf(label) ?? yearOf(value) })
    if (/\bselected\b/i.test(m[3])) edition = value
  }
  if (!edition && editions.length) edition = editions[0].value

  const byId = new Map<string, LitEntry>()
  const categories: string[] = []
  const addCategory = (entry: LitEntry, c: string) => {
    const name = c.trim()
    if (!name) return
    if (!entry.categories.includes(name)) entry.categories.push(name)
    if (!categories.includes(name)) categories.push(name)
  }
  const cell = /<div\s+class="grid-cell[^"]*"([^>]*)>\s*<a\s+href="(?:[^"]*\/)?winner\.php\?id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  for (const m of clean.matchAll(cell)) {
    const [, attrs, id, body] = m
    let entry = byId.get(id)
    if (!entry) {
      entry = {
        id,
        url: `${LIT_WINNERS}winner.php?id=${id}&mode=win`,
        project: divText(body, 'project-agency'),
        company: divText(body, 'project-title'),
        categories: [],
        cover: /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(body)?.[1],
      }
      byId.set(id, entry)
    }
    const section = /\bid="([^"]+)"/.exec(attrs)?.[1]
    const prize = divText(body, 'project-prize')
    if (section) {
      // Category sections: the cell id is the category; the prize line lists every category the project won.
      addCategory(entry, decodeEntities(section))
      prize.split(/\s+\/\s+/).forEach((c) => addCategory(entry!, c))
    } else if (prize) {
      // The top cards (no section id) are the "… of the Year" awards.
      addCategory(entry, `${titleCase(prize).replace(/\s+of the year$/i, '')} of the Year`)
    }
  }
  return { editions, edition, entries: [...byId.values()], categories }
}

/** Parse one winner page (`/winners/winner.php?id=…`). */
export function parseWinner(html: string, id: string): LitProject {
  const clean = stripComments(html)
  const fields: Record<string, string> = {}
  const links: Record<string, string> = {}
  for (const m of clean.matchAll(/<div class="winner-[a-z-]+">\s*<span class="break">([\s\S]*?)<\/span>([\s\S]*?)<\/div>/gi)) {
    const label = htmlText(m[1])
    const href = /<a\s[^>]*href="([^"]+)"/i.exec(m[2])?.[1]
    if (!label) continue
    if (href) links[label] = decodeEntities(href)
    else if (htmlText(m[2])) fields[label] = htmlText(m[2])
  }

  const prizes = fields['Prize(s)'] ?? ''
  const categories = prizes
    .split(/\n|\s+\/\s+/)
    .map((s) => s.replace(/^\s*(?:winners?|honou?rable mentions?)\s+in\s+/i, '').trim())
    .filter(Boolean)

  // Photos are the links in the thumbnail strip (S3 `/full/` URLs since 2019, `/submit/upload/` before).
  const thumbsAt = clean.indexOf('image-thumbs')
  const strip = thumbsAt >= 0 ? clean.slice(thumbsAt, clean.indexOf('<h1', thumbsAt) >>> 0) : ''
  const images: string[] = []
  for (const m of strip.matchAll(/<a\s+href="(https:\/\/[^"]+\.(?:jpe?g|png|webp|gif))"/gi)) {
    const url = decodeEntities(m[1])
    if (!images.includes(url)) images.push(url)
  }
  if (!images.length) {
    const hero = /class="winner-main-image"[\s\S]*?<img\s+src="([^"]+)"/i.exec(clean)?.[1]
    if (hero) images.push(decodeEntities(hero))
  }

  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(clean)?.[1]
  const title = (h1 && htmlText(h1)) || decodeEntities(/data-title="([^"]*)"/i.exec(clean)?.[1] ?? '')
  return { id, url: `${LIT_WINNERS}winner.php?id=${id}&mode=win`, title, categories, fields, links, images }
}
