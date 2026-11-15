// Draws the .bo file icon: a sheet of paper (folded corner) with "</REM/>" in a dot-matrix face, in the spirit of Nothing's
// type. The real Nothing typeface is licensed and not in the repo, so the glyphs are 5x7 dot grids drawn here.
// Output: src-tauri/icons/bo-file.ico (16-256 px, PNG entries) and bo-file-256.png. Run: node scripts/make-bo-icon.mjs
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const G = { // 5 wide x 7 tall, '#' = dot
  '<': ['..#', '.#.', '#..', '#..', '#..', '.#.', '..#'].map((r) => r.padEnd(5, '.')),
  '>': ['#..', '.#.', '..#', '..#', '..#', '.#.', '#..'].map((r) => r.padEnd(5, '.')),
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
}
const text = '</REM/>'
const draw = (size) => {
  const s = size / 256
  const c = document.createElement('canvas'); c.width = c.height = size
  const g = c.getContext('2d'); g.scale(s, s)
  // paper: 176 x 232 at (40, 12), top-right corner folded
  const x0 = 40, y0 = 12, w = 176, h = 232, f = 52
  g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 10; g.shadowOffsetY = 4
  g.fillStyle = '#fbfaf6'
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + w - f, y0); g.lineTo(x0 + w, y0 + f); g.lineTo(x0 + w, y0 + h); g.lineTo(x0, y0 + h); g.closePath(); g.fill()
  g.shadowColor = 'transparent'
  g.strokeStyle = '#cfcdc6'; g.lineWidth = 2; g.stroke()
  g.fillStyle = '#e6e4dc'; g.strokeStyle = '#cfcdc6'
  g.beginPath(); g.moveTo(x0 + w - f, y0); g.lineTo(x0 + w - f, y0 + f); g.lineTo(x0 + w, y0 + f); g.closePath(); g.fill(); g.stroke()
  // text: 7 glyphs, 5x7 dots, 1-dot gap; fit the paper width
  const cols = text.length * 6 - 1
  const pitch = (w - 28) / cols, r = pitch * 0.44
  const tx = x0 + 14, ty = y0 + h / 2 - (7 * pitch) / 2 + 22
  ;[...text].forEach((ch, i) => G[ch].forEach((row, ry) => [...row].forEach((d, rx) => {
    if (d !== '#') return
    g.fillStyle = '#1b1b1b'
    g.beginPath(); g.arc(tx + (i * 6 + rx + 0.5) * pitch, ty + (ry + 0.5) * pitch, r, 0, Math.PI * 2); g.fill()
  })))
  // the one red dot (Nothing's accent), top-left of the sheet
  g.fillStyle = '#e8362d'; g.beginPath(); g.arc(x0 + 22, y0 + 24, 7, 0, Math.PI * 2); g.fill()
  return c.toDataURL('image/png')
}
const browser = await chromium.launch({ executablePath: process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage()
const sizes = [16, 24, 32, 48, 64, 128, 256]
const urls = await page.evaluate(new Function('sizes', `const G=${JSON.stringify(G)};const text=${JSON.stringify(text)};const draw=${draw.toString()};return sizes.map((n)=>draw(n))`), sizes)
await browser.close()
const bufs = urls.map((u) => Buffer.from(u.split(',')[1], 'base64'))
// ICO container with PNG entries
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4)
let off = 6 + 16 * sizes.length
const dir = sizes.map((n, i) => {
  const e = Buffer.alloc(16)
  e[0] = n === 256 ? 0 : n; e[1] = n === 256 ? 0 : n; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
  e.writeUInt32LE(bufs[i].length, 8); e.writeUInt32LE(off, 12); off += bufs[i].length
  return e
})
writeFileSync('src-tauri/icons/bo-file.ico', Buffer.concat([head, ...dir, ...bufs]))
writeFileSync('src-tauri/icons/bo-file-256.png', bufs[bufs.length - 1])
console.log('wrote src-tauri/icons/bo-file.ico + bo-file-256.png')
