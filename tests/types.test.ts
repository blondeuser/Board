import { describe, expect, it } from 'vitest'
import { pickTypes, TYPE_LABELS } from '../src/categorize/style/labels'

const p = (id: string) => TYPE_LABELS.find((t) => t.id === id)!.prompt

describe('pickTypes', () => {
  it('keeps a clear winner and a close runner-up', () => {
    expect(pickTypes([{ label: p('photo'), score: 0.5 }, { label: p('nature'), score: 0.3 }, { label: p('food'), score: 0.2 }])).toEqual(['photo', 'nature'])
  })
  it('returns only the winner when the runner-up is weak', () => {
    expect(pickTypes([{ label: p('screenshot'), score: 0.8 }, { label: p('ui'), score: 0.05 }])).toEqual(['screenshot'])
  })
  it('returns nothing when unsure', () => {
    expect(pickTypes([{ label: p('photo'), score: 0.1 }, { label: p('logo'), score: 0.09 }])).toEqual([])
  })
  it('ignores unknown labels and has unique ids', () => {
    expect(pickTypes([{ label: 'nope', score: 0.9 }])).toEqual([])
    expect(new Set(TYPE_LABELS.map((t) => t.id)).size).toBe(TYPE_LABELS.length)
  })
})

import { pickSpaces, SPACE_LABELS } from '../src/categorize/style/labels'

const sp = (id: string) => SPACE_LABELS.find((t) => t.id === id)!.prompt

describe('pickSpaces', () => {
  const detail = [
    { label: sp('facade'), score: 0.7 },
    { label: sp('courtyard'), score: 0.2 },
    { label: sp('atrium'), score: 0.5 },
    { label: sp('high-ceiling'), score: 0.4 },
    { label: sp('bedroom'), score: 0.1 },
  ]
  it('only uses the groups whose parent type is present', () => {
    expect(pickSpaces(['architecture'], detail)).toEqual(['facade'])
    expect(pickSpaces(['interior'], detail)).toEqual(['atrium', 'high-ceiling'])
    expect(pickSpaces(['photo'], detail)).toEqual([])
  })
  it('has unique ids that do not clash with the main types', () => {
    const ids = [...SPACE_LABELS.map((t) => t.id), ...TYPE_LABELS.map((t) => t.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })
})
