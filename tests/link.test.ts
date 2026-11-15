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

import { sniffImageType } from '../src/sources/link/client'
describe('sniffImageType', () => {
  it('knows images by their first bytes and refuses HTML', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png')
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp')
    expect(sniffImageType(new TextEncoder().encode('<!doctype html>'))).toBe('')
  })
})

import { youtubeId } from '../src/sources/link/parse'
describe('youtubeId', () => {
  it('finds the id in the usual address shapes', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?si=x')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined()
  })
})

import { titleFromUrl } from '../src/sources/link/parse'
describe('titleFromUrl', () => {
  it('makes a readable title from the last path segment, else the site', () => {
    expect(titleFromUrl('https://www.example.com/blog/the-basilica-cistern-in-istanbul/')).toBe('The basilica cistern in istanbul')
    expect(titleFromUrl('https://www.example.com/')).toBe('example.com')
    expect(titleFromUrl('https://example.com/photos/12345.jpg')).toBe('example.com')
  })
})
