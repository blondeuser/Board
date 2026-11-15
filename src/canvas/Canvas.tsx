import { memo, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { DEFAULT_TEXT_FORMAT, TEXT_FONTS, type Connection, type Placement, type ShapeKind, type ViewState } from '../shared/types'
import { GRID, clampZoom, screenToWorld, snapDelta, zoomAt } from './viewport'
import { connectorPath } from './connector'
import { LinkIcon } from '../ui/icons'
import { openExternal } from '../shared/external'
import { hitsStroke, outlinePath, pressureWidth, simplify } from './ink/stroke'
import { BENTO_COLUMNS, BENTO_CELL, BENTO_GAP } from './bento'

const BENTO_PAD = 40
const BENTO_WIDTH = BENTO_COLUMNS * BENTO_CELL + (BENTO_COLUMNS - 1) * BENTO_GAP

/** Cards mode: fixed zoom (fits the grid to the width) and centred; only y can change, kept within the content. */
function bentoView(view: ViewState, placements: Placement[], size: { w: number; h: number }): ViewState {
  const zoom = Math.min(1, Math.max(0.2, (size.w - BENTO_PAD * 2) / BENTO_WIDTH))
  const bottom = Math.max(0, ...placements.map((p) => p.y + p.h)) * zoom
  const minY = Math.min(BENTO_PAD, size.h - bottom - BENTO_PAD)
  return { zoom, x: size.w / 2, y: Math.min(BENTO_PAD, Math.max(minY, view.y)) }
}

interface Props {
  viewportRef: RefObject<HTMLDivElement | null>
  view: ViewState
  placements: Placement[]
  /** Curved lines between cards; drawn in free layout only. */
  connections: Connection[]
  urls: Record<string, string>
  /** Page address per asset id, for images that came from a link or a site import (shows the link badge). */
  links: Record<string, string>
  selection: string[]
  /** Bento mode: cards are auto-placed, so moving/resizing is off. */
  locked: boolean
  editingId: string
  /** Shape being drawn: drag on the canvas to place it. */
  tool: ShapeKind | null
  onDraw: (r: { x: number; y: number; w: number; h: number }) => void
  /** Pen mode: the pen tip draws ink (mouse and touch keep editing). The pen's eraser end erases ink in any mode. */
  penMode: boolean
  pen: { color: string; size: number }
  /** A finished stroke: absolute world points [x, y, pressure, ...], line width in world units. */
  onInk: (stroke: { points: number[]; color: string; size: number }) => void
  onEraseInk: (ids: string[]) => void
  dimmed: (p: Placement) => boolean
  onStartEdit: (id: string) => void
  onEditNote: (id: string, text: string) => void
  onView: (v: ViewState) => void
  onSelect: (ids: string[]) => void
  onBringToFront: (ids: string[]) => void
  onTransient: (patches: Record<string, Partial<Placement>>) => void
  onCommit: (ids: string[]) => void
  onDropData: (dt: DataTransfer, clientX: number, clientY: number) => void
  /** Right click: screen position and the card under it, if any. */
  onContextMenu: (clientX: number, clientY: number, id: string | null) => void
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; view: ViewState; moved: boolean }
  | { kind: 'marquee'; sx: number; sy: number; base: string[]; moved: boolean; shift: boolean }
  | { kind: 'move'; sx: number; sy: number; origs: Map<string, Placement>; moved: boolean; clickedId: string; shift: boolean }
  | { kind: 'ink'; pts: number[]; last: { x: number; y: number; w: number } | null }
  | { kind: 'erase'; hit: Set<string> }
  | { kind: 'resize'; sx: number; sy: number; orig: Placement }
  | { kind: 'draw'; sx: number; sy: number; moved: boolean; shift: boolean; rect: { x: number; y: number; w: number; h: number } | null }

export function Canvas(props: Props) {
  const { viewportRef, placements, urls, selection } = props
  const [size, setSize] = useState({ w: 1000, h: 700 })
  const view = props.locked ? bentoView(props.view, placements, size) : props.view
  const live = useRef({ ...props, view })
  live.current = { ...props, view }
  const drag = useRef<Drag | null>(null)
  const space = useRef(false)
  const inkCanvas = useRef<HTMLCanvasElement>(null)
  const penAt = useRef(0) // last pen activity, to swallow the context menu a pen barrel/long-press raises
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    const el = viewportRef.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewportRef])

  // Wheel needs a non-passive listener to preventDefault. Ctrl/pinch or a notched mouse wheel zooms; trackpad scroll pans.
  useEffect(() => {
    const el = viewportRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { view: v, onView, locked } = live.current
      if (locked) {
        onView({ ...v, y: v.y - e.deltaY * (e.deltaMode === 1 ? 16 : 1) }) // vertical scroll only; clamped on render
        return
      }
      const rect = el.getBoundingClientRect()
      const mouseWheel = e.deltaX === 0 && (e.deltaMode === 1 || (Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50))
      if (e.ctrlKey || mouseWheel) {
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015) * (e.deltaMode === 1 ? 16 : 1))
        onView(zoomAt(v, e.clientX - rect.left, e.clientY - rect.top, clampZoom(v.zoom * factor)))
      } else {
        onView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewportRef])

  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement).matches?.('input, textarea')
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        space.current = true
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return
    const p = live.current
    const target = e.target as HTMLElement
    if (target.closest('textarea')) return // editing a note: let the text field handle it
    const badge = target.closest<HTMLElement>('[data-link]')
    if (badge) {
      void openExternal(badge.dataset.link!)
      return
    }
    const itemEl = target.closest<HTMLElement>('[data-pid]')
    const panning = e.button === 1 || space.current
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic pointer (smoke test): no capture */ }

    if (e.pointerType === 'pen') penAt.current = Date.now()
    if (e.pointerType === 'pen' && !panning && !p.locked) {
      if (e.buttons & 32 || e.button === 5) {
        drag.current = { kind: 'erase', hit: new Set() }
        eraseAt(e)
        return
      }
      if (p.penMode) {
        e.preventDefault()
        drag.current = { kind: 'ink', pts: [], last: null }
        inkTo(e, drag.current)
        return
      }
    }
    if (panning) {
      e.preventDefault()
      e.currentTarget.style.cursor = 'grabbing'
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: p.view, moved: false }
      return
    }
    if (p.tool && !p.locked) {
      drag.current = { kind: 'draw', sx: e.clientX, sy: e.clientY, moved: false, shift: e.shiftKey, rect: null }
      return
    }
    if (!itemEl) {
      // Empty space: drag draws a selection box (Shift adds to the current selection).
      drag.current = { kind: 'marquee', sx: e.clientX, sy: e.clientY, base: e.shiftKey ? p.selection : [], moved: false, shift: e.shiftKey }
      return
    }
    const id = itemEl.dataset.pid!
    const item = p.placements.find((x) => x.id === id)
    if (!item) return

    if (target.closest('[data-handle]') && !p.locked) {
      p.onSelect([id])
      p.onBringToFront([id])
      drag.current = { kind: 'resize', sx: e.clientX, sy: e.clientY, orig: item }
      return
    }

    const selected = p.selection.includes(id)
    let next = p.selection
    if (e.shiftKey) next = selected ? p.selection.filter((s) => s !== id) : [...p.selection, id]
    else if (!selected) next = [id]
    if (next !== p.selection) p.onSelect(next)
    if (!next.includes(id) || p.locked) return
    p.onBringToFront(next)
    drag.current = {
      kind: 'move', sx: e.clientX, sy: e.clientY, moved: false, clickedId: id, shift: e.shiftKey,
      origs: new Map(p.placements.filter((x) => next.includes(x.id)).map((x) => [x.id, x])),
    }
  }

  const worldOf = (e: { clientX: number; clientY: number }) => {
    const r = viewportRef.current!.getBoundingClientRect()
    return screenToWorld(live.current.view, e.clientX - r.left, e.clientY - r.top)
  }

  const eraseAt = (e: React.PointerEvent) => {
    const d = drag.current
    if (d?.kind !== 'erase') return
    const w = worldOf(e)
    const ids = live.current.placements
      .filter((i) => i.kind === 'ink' && i.ink && !d.hit.has(i.id) && hitsStroke(i.ink.points, i.ink.size, w.x - i.x, w.y - i.y, 4 / live.current.view.zoom))
      .map((i) => i.id)
    ids.forEach((id) => d.hit.add(id))
    if (ids.length) live.current.onEraseInk(ids)
  }

  // Live stroke: refs and a screen-space canvas only, no React state per sample (docs/PEN_INPUT.md).
  const inkTo = (e: React.PointerEvent, d: Extract<Drag, { kind: 'ink' }>) => {
    const p = live.current
    const cv = inkCanvas.current
    const ctx = cv?.getContext('2d')
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const w = worldOf(ev)
      const pr = ev.pressure > 0 ? ev.pressure : 0.5 // pressure 0 = no pressure reported
      d.pts.push(w.x, w.y, pr)
      if (!ctx) continue
      const r = viewportRef.current!.getBoundingClientRect()
      const px = ev.clientX - r.left
      const py = ev.clientY - r.top
      const width = pressureWidth(p.pen.size, pr) // already screen px
      ctx.lineCap = ctx.lineJoin = 'round'
      ctx.strokeStyle = ctx.fillStyle = p.pen.color === 'auto' ? getComputedStyle(viewportRef.current!).getPropertyValue('--text').trim() || '#222' : p.pen.color
      ctx.lineWidth = width
      ctx.beginPath()
      if (d.last) {
        ctx.moveTo(d.last.x, d.last.y)
        ctx.lineTo(px, py)
        ctx.stroke()
      } else {
        ctx.arc(px, py, width / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      d.last = { x: px, y: py, w: width }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const p = live.current
    if (d.kind === 'ink') return inkTo(e, d)
    if (d.kind === 'erase') return eraseAt(e)
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.kind === 'pan') {
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      p.onView({ ...d.view, x: p.locked ? d.view.x : d.view.x + dx, y: d.view.y + dy })
    } else if (d.kind === 'draw') {
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      if (!d.moved) return
      const r = e.currentTarget.getBoundingClientRect()
      const side = Math.max(Math.abs(dx), Math.abs(dy))
      const w = e.shiftKey ? side : Math.abs(dx) // Shift = square / circle
      const h = e.shiftKey ? side : Math.abs(dy)
      const x = (dx < 0 ? d.sx - w : d.sx) - r.left
      const y = (dy < 0 ? d.sy - h : d.sy) - r.top
      setBox({ x, y, w, h })
      const a = screenToWorld(p.view, x, y)
      d.rect = { x: a.x, y: a.y, w: w / p.view.zoom, h: h / p.view.zoom }
    } else if (d.kind === 'marquee') {
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      if (!d.moved) return
      const r = e.currentTarget.getBoundingClientRect()
      const x = Math.min(e.clientX, d.sx) - r.left
      const y = Math.min(e.clientY, d.sy) - r.top
      const w = Math.abs(dx)
      const h = Math.abs(dy)
      setBox({ x, y, w, h })
      const a = screenToWorld(p.view, x, y)
      const b = screenToWorld(p.view, x + w, y + h)
      const hit = p.placements.filter((i) => i.x < b.x && i.x + i.w > a.x && i.y < b.y && i.y + i.h > a.y).map((i) => i.id)
      const next = [...new Set([...d.base, ...hit])]
      if (next.length !== p.selection.length || next.some((id) => !p.selection.includes(id))) p.onSelect(next)
    } else if (d.kind === 'move') {
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      if (!d.moved) return
      const patch: Record<string, Partial<Placement>> = {}
      let wx = dx / p.view.zoom
      let wy = dy / p.view.zoom
      const lead = d.origs.get(d.clickedId)
      if (lead && !e.altKey) {
        // Snap the dragged card's corner to the grid; the rest of the selection moves by the same amount. Alt = free move.
        wx = snapDelta(lead.x, wx)
        wy = snapDelta(lead.y, wy)
      }
      d.origs.forEach((o, id) => (patch[id] = { x: o.x + wx, y: o.y + wy }))
      p.onTransient(patch)
    } else {
      const w = Math.max(24, d.orig.w + dx / p.view.zoom)
      // Images and notes keep their aspect; shapes resize freely.
      const h = d.orig.kind === 'shape' || d.orig.kind === 'text' ? Math.max(24, d.orig.h + dy / p.view.zoom) : (w * d.orig.h) / d.orig.w
      p.onTransient({ [d.orig.id]: { w, h } })
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const p = live.current
    if (d.kind === 'ink') {
      const cv = inkCanvas.current
      cv?.getContext('2d')?.clearRect(0, 0, cv.width, cv.height)
      if (e.type === 'pointerup' && d.pts.length) {
        const z = p.view.zoom
        p.onInk({ points: simplify(d.pts, 0.5 / z), color: p.pen.color, size: p.pen.size / z })
      }
    } else if (d.kind === 'erase') {
      // nothing to finish: strokes were removed as the pen passed over them
    } else if (d.kind === 'pan') {
      e.currentTarget.style.cursor = ''
    } else if (d.kind === 'draw') {
      setBox(null)
      if (d.rect && d.rect.w >= 8 && d.rect.h >= 8) p.onDraw(d.rect)
    } else if (d.kind === 'marquee') {
      setBox(null)
      if (!d.moved && !d.shift) p.onSelect([])
    } else if (d.kind === 'move') {
      if (d.moved) p.onCommit([...d.origs.keys()])
      else if (!d.shift && d.origs.size > 1) p.onSelect([d.clickedId]) // plain click inside a multi-selection
    } else {
      p.onCommit([d.orig.id])
    }
  }

  const inv = 1 / view.zoom
  const dots = GRID * view.zoom
  return (
    <div
      ref={viewportRef}
      className={'viewport' + (props.tool ? ' drawing' : '') + (props.penMode ? ' penning' : '')}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${dots}px ${dots}px`, '--dot': dots < 9 ? 0 : 1 } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        props.onDropData(e.dataTransfer, e.clientX, e.clientY)
      }}
      onDoubleClick={(e) => {
        // The canvas captures the pointer on press, so e.target is the viewport itself: find the card under the cursor instead.
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-pid]')
        const p = placements.find((x) => x.id === el?.dataset.pid)
        if (p?.kind === 'note' || p?.kind === 'text') props.onStartEdit(p.id)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        if (Date.now() - penAt.current < 1000) return
        props.onContextMenu(e.clientX, e.clientY, (e.target as HTMLElement).closest<HTMLElement>('[data-pid]')?.dataset.pid ?? null)
      }}
    >
      <div className={'world' + (props.locked ? ' bento' : '')} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, '--inv': inv } as CSSProperties}>
        {!props.locked && (
          <svg className="lines" width="1" height="1" aria-hidden>
            {props.connections.map((l) => {
              const a = placements.find((p) => p.id === l.from)
              const b = placements.find((p) => p.id === l.to)
              return a && b ? <path key={l.id} d={connectorPath(a, b)} /> : null
            })}
          </svg>
        )}
        {placements.map((p) => (
          <Item
            key={p.id}
            p={p}
            url={urls[p.assetId]}
            href={props.links[p.assetId]}
            selected={selection.includes(p.id)}
            dimmed={props.dimmed(p)}
            locked={props.locked}
            editing={props.editingId === p.id}
            onEditNote={props.onEditNote}
          />
        ))}
      </div>
      {props.penMode && <canvas ref={inkCanvas} className="ink-live" width={size.w} height={size.h} />}
      {box && <div className="marquee" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      {!placements.length && (
        <div className="empty">
          <p>Paste an image (Ctrl+V) or drop files here</p>
        </div>
      )}
    </div>
  )
}

const SHAPES: Record<ShapeKind, React.ReactNode> = {
  rect: <rect x="2" y="2" width="96" height="96" />,
  ellipse: <ellipse cx="50" cy="50" rx="48" ry="48" />,
  triangle: <polygon points="50,2 98,98 2,98" />,
  diamond: <polygon points="50,2 98,50 50,98 2,50" />,
}

interface ItemProps {
  p: Placement
  url?: string
  href?: string
  selected: boolean
  dimmed: boolean
  locked: boolean
  editing: boolean
  onEditNote: (id: string, text: string) => void
}

const Item = memo(function Item({ p, url, href, selected, dimmed, locked, editing, onEditNote }: ItemProps) {
  const note = p.kind === 'note'
  const shape = p.kind === 'shape'
  const ink = p.kind === 'ink' && p.ink
  const text = p.kind === 'text'
  const fmt = p.fmt ?? DEFAULT_TEXT_FORMAT
  return (
    <div
      className={'item' + (note ? ' note' : '') + (shape ? ' shape' : '') + (ink ? ' ink' : '') + (text ? ' text' : '') + (selected ? ' selected' : '') + (dimmed ? ' dimmed' : '') + (locked ? ' locked' : '')}
      data-pid={p.id}
      style={{ left: p.x, top: p.y, width: p.w, height: p.h, zIndex: p.z, ...(note ? { background: p.tint } : {}), ...(shape ? { '--tint': p.tint } : {}), ...(text ? { fontFamily: TEXT_FONTS[fmt.font]?.css, fontSize: fmt.size, fontWeight: fmt.bold ? 700 : 400, fontStyle: fmt.italic ? 'italic' : 'normal', textAlign: fmt.align, color: fmt.color === 'auto' ? 'var(--text)' : fmt.color } : {}) } as CSSProperties}
    >
      {ink ? (
        <svg width={p.w} height={p.h} aria-hidden>
          <path d={outlinePath(ink.points, ink.size)} style={{ fill: ink.color === 'auto' ? 'var(--text)' : ink.color }} />
        </svg>
      ) : shape ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" aria-hidden>{SHAPES[p.shape ?? 'rect']}</svg>
      ) : note || text ? (
        editing ? (
          <textarea
            autoFocus
            defaultValue={p.text}
            placeholder={text ? 'Type text' : 'Write a note'}
            onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
            onBlur={(e) => onEditNote(p.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.currentTarget.blur()
              e.stopPropagation()
            }}
          />
        ) : (
          <div className="note-text">{p.text || <span className="muted">{text ? 'Empty text' : 'Double-click to write'}</span>}</div>
        )
      ) : (
        url && <img src={url} alt="" draggable={false} />
      )}
      {href && (
        <span className="link-badge" data-link={href} title={`Open ${href}`}>
          <LinkIcon />
        </span>
      )}
      {selected && !locked && !ink && <span className="handle" data-handle />}
    </div>
  )
})
