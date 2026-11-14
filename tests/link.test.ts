import { describe, expect, it } from 'vitest'
import { parseLink } from '../src/sources/link/parse'

describe('parseLink', () => {
  it('reads Open Graph tags and resolves a relative image', () => {
    const html = `<head><title>Ignored</title><meta property="og:title" content="A &amp; B"><meta content="/img/x.jpg" property="og:image"><meta property="og:site_name" content="Studio"></head>`
    expect(parseLink(html, 'https://example.com/p/1')).toEqual({ title: 'A & B', site: 'Studio', image: 'https://example.com/img/x.jpg' })
  })
  it('falls back to <title>, twitter:image and the host', () => {
    const html = `<title>\n Hello  world </title><meta name="twitter:image" content="https://cdn.example.com/a.png">`
    expect(parseLink(html, 'https://www.example.com/')).toEqual({ title: 'Hello world', site: 'example.com', image: 'https://cdn.example.com/a.png' })
  })
  it('returns no image when the page has none', () => {
    expect(parseLink('<p>hi</p>', 'https://a.b/').image).toBeUndefined()
  })
})
