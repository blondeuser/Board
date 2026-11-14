import { describe, expect, it } from 'vitest'
import { queryToPrompt, semanticMatches, similarity } from '../src/categorize/style/search'

describe('queryToPrompt', () => {
  it('turns a phrase into a CLIP-friendly prompt', () => {
    expect(queryToPrompt('the man')).toBe('a photo of man')
    expect(queryToPrompt('  A red car ')).toBe('a photo of red car')
    expect(queryToPrompt('minimal poster')).toBe('a photo of minimal poster')
  })
})

describe('semanticMatches', () => {
  const q = [1, 0, 0]
  const items = [
    { id: 'close', embedding: [0.08, 0.99, 0] },
    { id: 'best', embedding: [0.1, 0.99, 0] },
    { id: 'far', embedding: [0.03, 0.99, 0] },
    { id: 'none' },
  ]
  it('keeps the best hits and drops weak ones and items without an embedding', () => {
    expect([...semanticMatches(q, items).keys()].sort()).toEqual(['best', 'close'])
  })
  it('returns nothing when no image is close enough', () => {
    expect(semanticMatches(q, [{ id: 'a', embedding: [0.01, 0.99, 0] }]).size).toBe(0)
  })
  it('similarity is a dot product', () => expect(similarity([1, 2], [3, 4])).toBe(11))
})
