import { describe, expect, it } from 'vitest'
import { summarize, type Sample } from '../src/canvas/ink/probe'

const s = (o: Partial<Sample>): Sample => ({ type: 'pen', pressure: 0.5, tiltX: 0, tiltY: 0, buttons: 1, t: 0, coalesced: 1, down: true, ...o })
const stroke = (n: number, make: (i: number) => Partial<Sample>) => Array.from({ length: n }, (_, i) => s({ t: i * 5, ...make(i) }))

describe('summarize (pen probe)', () => {
  it('real pen pressure', () => {
    const r = summarize(stroke(40, (i) => ({ pressure: i / 40 })))
    expect(r.verdict).toMatch(/real pressure/i)
    expect(r.hz).toBe(200)
    expect(r.pressureMax).toBeGreaterThan(0.9)
  })
  it('pen with constant pressure points at Windows Ink', () => {
    expect(summarize(stroke(20, () => ({ pressure: 0.5 }))).verdict).toMatch(/Windows Ink/)
  })
  it('mouse', () => {
    expect(summarize(stroke(20, () => ({ type: 'mouse' }))).verdict).toMatch(/No pen/)
  })
  it('mouse-typed events with varying pressure count as a pen (WebKit)', () => {
    expect(summarize(stroke(40, (i) => ({ type: 'mouse', pressure: i / 40 }))).verdict).toMatch(/WebKit/)
  })
  it('eraser and barrel buttons, hover split', () => {
    const r = summarize([s({ buttons: 32 }), s({ buttons: 2 }), s({ down: false, buttons: 0, pressure: 0 })])
    expect(r).toMatchObject({ eraserSeen: true, barrelSeen: true, hoverEvents: 1, downEvents: 2 })
  })
  it('nothing yet', () => {
    expect(summarize([]).verdict).toMatch(/Draw on the pad/)
  })
})
