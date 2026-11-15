import { describe, expect, it } from 'vitest'
import { tagRing } from '../src/library/ring'
import type { Asset, Category } from '../src/shared/types'

const cats: Category[] = [{ id: 'a', name: 'A', color: '#f00' }, { id: 'b', name: 'B', color: '#0f0' }, { id: 'c', name: 'C', color: '#00f' }, { id: 'd', name: 'D', color: '#ff0' }]
const asset = (categoryIds: string[]) => ({ categoryIds }) as Asset

describe('tagRing', () => {
  it('is empty without tags or asset', () => {
    expect(tagRing(asset([]), cats, '1')).toBe('')
    expect(tagRing(undefined, cats, '1')).toBe('')
  })
  it('one ring per tag colour, widening outwards, at most 3', () => {
    expect(tagRing(asset(['a']), cats, '1')).toBe('0 0 0 calc(5px * 1) #f00')
    expect(tagRing(asset(['a', 'b', 'c', 'd']), cats, 'var(--inv)').split('), ').length).toBe(1)
    expect(tagRing(asset(['a', 'b', 'c', 'd']), cats, '1').split(', 0 0').length).toBe(3)
  })
  it('skips unknown tags', () => expect(tagRing(asset(['zzz', 'b']), cats, '1')).toBe('0 0 0 calc(5px * 1) #0f0'))
})
