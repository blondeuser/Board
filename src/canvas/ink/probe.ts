// Phase 0 of docs/PEN_INPUT.md: what does this machine's pen actually report? Pure summary of logged pointer samples
// (the Help > Pen test panel feeds it; the real ink code will reuse the same pen detection later).
export interface Sample {
  type: string // pointerType: 'pen' | 'mouse' | 'touch'
  pressure: number
  tiltX: number
  tiltY: number
  buttons: number
  /** ms (event.timeStamp) */
  t: number
  /** getCoalescedEvents().length for this event (0 = API missing) */
  coalesced: number
  /** true while the tip touches / a button is held */
  down: boolean
}

export interface PenSummary {
  events: number
  downEvents: number
  hoverEvents: number
  types: Record<string, number>
  pressureDistinct: number
  pressureMin: number
  pressureMax: number
  maxTilt: number
  eraserSeen: boolean // buttons & 32
  barrelSeen: boolean // buttons & 2 (lower barrel) or & 4 (upper barrel / middle)
  coalescedMax: number
  /** events per second while drawing (Wacom ~100-200, mouse ~60-125) */
  hz: number
  verdict: string
}

const round = (n: number) => Math.round(n * 1000) / 1000

export function summarize(samples: Sample[]): PenSummary {
  const down = samples.filter((s) => s.down)
  const types: Record<string, number> = {}
  samples.forEach((s) => (types[s.type] = (types[s.type] ?? 0) + 1))
  const pressures = new Set(down.map((s) => round(s.pressure)))
  const span = down.length > 1 ? down[down.length - 1].t - down[0].t : 0
  const has = (type: string) => down.some((s) => s.type === type)
  const varies = pressures.size > 8 // a mouse reports 0.5 only; real pressure gives many values

  let verdict: string
  if (!down.length) verdict = 'Draw on the pad with the pen to get a verdict.'
  else if (has('pen') && varies) verdict = 'Pen with real pressure. Phase 2 can use it as is.'
  else if (has('pen')) verdict = 'Pen detected but pressure is constant: turn on "Use Windows Ink" in Wacom Tablet Properties.'
  else if (varies) verdict = 'Reported as a mouse but pressure varies (WebKit style): usable as a pen by checking pressure.'
  else verdict = 'No pen seen: only mouse-like input with constant pressure (Windows Ink off, or no pen used).'

  return {
    events: samples.length,
    downEvents: down.length,
    hoverEvents: samples.length - down.length,
    types,
    pressureDistinct: pressures.size,
    pressureMin: down.length ? Math.min(...down.map((s) => s.pressure)) : 0,
    pressureMax: down.length ? Math.max(...down.map((s) => s.pressure)) : 0,
    maxTilt: Math.max(0, ...samples.map((s) => Math.max(Math.abs(s.tiltX), Math.abs(s.tiltY)))),
    eraserSeen: samples.some((s) => (s.buttons & 32) !== 0),
    barrelSeen: samples.some((s) => (s.buttons & 6) !== 0),
    coalescedMax: Math.max(0, ...samples.map((s) => s.coalesced)),
    hz: span > 0 ? Math.round(((down.length - 1) / span) * 1000) : 0,
    verdict,
  }
}
