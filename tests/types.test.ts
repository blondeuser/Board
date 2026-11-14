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
