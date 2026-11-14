import type { Lab } from './convert'
import { oklabToLch } from './convert'

/** The 12 named colour families used for filtering and tagging. Hex values are UI chip colours. */
export const COLOR_FAMILIES = [
  { name: 'red', hex: '#e5484d' },
  { name: 'orange', hex: '#f08a24' },
  { name: 'yellow', hex: '#f5d90a' },
  { name: 'green', hex: '#46a758' },
  { name: 'teal', hex: '#12a594' },
  { name: 'blue', hex: '#3e63dd' },
  { name: 'purple', hex: '#8e4ec6' },
  { name: 'pink', hex: '#e93d82' },
  { name: 'brown', hex: '#8d6b4f' },
  { name: 'white', hex: '#f4f4f2' },
  { name: 'gray', hex: '#8b8d98' },
  { name: 'black', hex: '#18181b' },
] as const

export type ColorFamily = (typeof COLOR_FAMILIES)[number]['name']

export function familyOf(lab: Lab): ColorFamily {
  const { l, c, h } = oklabToLch(lab)
  if (c < 0.035 || l < 0.18 || l > 0.96) {
    if (l < 0.28) return 'black'
    if (l > 0.9) return 'white'
    return 'gray'
  }
  if (h >= 40 && h < 100 && l < 0.6) return 'brown'
  if (h >= 340 || h < 10) return 'pink'
  if (h < 40) return l > 0.8 ? 'pink' : 'red'
  if (h < 75) return 'orange'
  if (h < 115) return 'yellow'
  if (h < 170) return 'green'
  if (h < 220) return 'teal'
  if (h < 280) return 'blue'
  if (h < 335) return 'purple'
  return 'pink'
}
