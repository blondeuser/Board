import type { PaletteColor } from '../../shared/types'
import { rgbToOklab, oklabToRgb, rgbToHex, type Lab } from './convert'
import { familyOf, type ColorFamily } from './families'

export interface PixelData {
  data: ArrayLike<number> // RGBA
  width: number
  height: number
}

const dist2 = (a: Lab, b: Lab): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/** k-means in OKLab with deterministic farthest-point init. Returns colours sorted by share. */
export function extractPalette(img: PixelData, k = 5): PaletteColor[] {
  const pts: Lab[] = []
  const step = Math.max(1, Math.floor((img.width * img.height) / 4096))
  for (let p = 0; p < img.width * img.height; p += step) {
    const i = p * 4
    if (img.data[i + 3] < 128) continue
    pts.push(rgbToOklab(img.data[i], img.data[i + 1], img.data[i + 2]))
  }
  if (!pts.length) return []

  const centers: Lab[] = [pts[0]]
  while (centers.length < Math.min(k, pts.length)) {
    let best = -1
    let bestD = -1
    pts.forEach((p, i) => {
      let d = Infinity
      for (const c of centers) d = Math.min(d, dist2(p, c))
      if (d > bestD) {
        bestD = d
        best = i
      }
    })
    if (bestD <= 1e-6) break // fewer distinct colours than k
    centers.push(pts[best])
  }

  const assign = new Array<number>(pts.length).fill(0)
  for (let iter = 0; iter < 12; iter++) {
    pts.forEach((p, i) => {
      let b = 0
      let bd = Infinity
      centers.forEach((c, ci) => {
        const d = dist2(p, c)
        if (d < bd) {
          bd = d
          b = ci
        }
      })
      assign[i] = b
    })
    const sums = centers.map(() => [0, 0, 0, 0])
    pts.forEach((p, i) => {
      const s = sums[assign[i]]
      s[0] += p[0]
      s[1] += p[1]
      s[2] += p[2]
      s[3]++
    })
    sums.forEach((s, ci) => {
      if (s[3]) centers[ci] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
    })
  }

  const counts = centers.map(() => 0)
  assign.forEach((a) => counts[a]++)
  return centers
    .map((c, i) => ({ c, n: counts[i] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map(({ c, n }) => ({ hex: rgbToHex(...oklabToRgb(c)), share: n / pts.length }))
}

function hexToLab(hex: string): Lab {
  const n = parseInt(hex.slice(1), 16)
  return rgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255)
}

/** Colour families covering at least `minShare` of the image (always includes the dominant one). */
export function colorFamilies(palette: PaletteColor[], minShare = 0.15): ColorFamily[] {
  const share = new Map<ColorFamily, number>()
  for (const p of palette) {
    const f = familyOf(hexToLab(p.hex))
    share.set(f, (share.get(f) ?? 0) + p.share)
  }
  const sorted = [...share.entries()].sort((a, b) => b[1] - a[1])
  return sorted.filter(([, s], i) => i === 0 || s >= minShare).map(([f]) => f)
}
