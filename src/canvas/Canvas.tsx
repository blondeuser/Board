import { memo, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { Placement, ViewState } from '../shared/types'
import { clampZoom, screenToWorld, zoomAt } from './viewport'
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
  urls: Record<string, string>
  selection: string[]
  /** Bento mode: cards are auto-placed, so moving/resizing is off. */
  locked: boolean
  editingId: string
  dimmed: (p: Placement) => boolean
  onStartEdit: (id: string) => void
  onEditNote: (id: string, text: string) => void
  onView: (v: ViewState) => void
  onSelect: (ids: string[]) => void
  onBringToFront: (ids: string[]) => void
  onTransient: (patches: Record<string, Partial<Placement>>) => void
  onCommit: (ids: string[]) => void
  onDropData: (dt: DataTransfer, clientX: number, clientY: number) => void
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; view: ViewState; moved: boolean }
  | { kind: 'marquee'; sx: number; sy: number; base: string[]; moved: boolean; shift: boolean }
  | { kind: 'move'; sx: number; sy: number; origs: Map<string, Placement>; moved: boolean; clickedId: string; shift: boolean }
  | { kind: 'resize'; sx: number; sy: number; orig: Placement }

export function Canvas(props: Props) {
  const { viewportRef, placements, urls, selection } = props
  const [size, setSize] = useState({ w: 1000, h: 700 })
  const view = props.locked ? bentoView(props.view, placements, size) : props.view
  const live = useRef({ ...props, view })
  live.current = { ...props, view }
  const drag = useRef<Drag | null>(null)
  const space = useRef(false)
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
    const itemEl = target.closest<HTMLElement>('[data-pid]')
    const panning = e.button === 1 || space.current
    e.currentTarget.setPointerCapture(e.pointerId)

    if (panning) {
      e.preventDefault()
      e.currentTarget.style.cursor = 'grabbing'
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: p.view, moved: false }
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

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const p = live.current
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.kind === 'pan') {
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      p.onView({ ...d.view, x: p.locked ? d.view.x : d.view.x + dx, y: d.view.y + dy })
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
      d.origs.forEach((o, id) => (patch[id] = { x: o.x + dx / p.view.zoom, y: o.y + dy / p.view.zoom }))
      p.onTransient(patch)
    } else {
      const w = Math.max(24, d.orig.w + dx / p.view.zoom)
      p.onTransient({ [d.orig.id]: { w, h: (w * d.orig.h) / d.orig.w } })
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const p = live.current
    if (d.kind === 'pan') {
      e.currentTarget.style.cursor = ''
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
  const dots = 24 * view.zoom
  return (
    <div
      ref={viewportRef}
      className="viewport"
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
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pid]')
        const p = placements.find((x) => x.id === el?.dataset.pid)
        if (p?.kind === 'note') props.onStartEdit(p.id)
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={'world' + (props.locked ? ' bento' : '')} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, '--inv': inv } as CSSProperties}>
        {placements.map((p) => (
          <Item
            key={p.id}
            p={p}
            url={urls[p.assetId]}
            selected={selection.includes(p.id)}
            dimmed={props.dimmed(p)}
            locked={props.locked}
            editing={props.editingId === p.id}
            onEditNote={props.onEditNote}
          />
        ))}
      </div>
      {box && <div className="marquee" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      {!placements.length && (
        <div className="empty">
          <p>Paste an image (Ctrl+V) or drop files here</p>
        </div>
      )}
    </div>
  )
}

interface ItemProps {
  p: Placement
  url?: string
  selected: boolean
  dimmed: boolean
  locked: boolean
  editing: boolean
  onEditNote: (id: string, text: string) => void
}

const Item = memo(function Item({ p, url, selected, dimmed, locked, editing, onEditNote }: ItemProps) {
  const note = p.kind === 'note'
  return (
    <div
      className={'item' + (note ? ' note' : '') + (selected ? ' selected' : '') + (dimmed ? ' dimmed' : '') + (locked ? ' locked' : '')}
      data-pid={p.id}
      style={{ left: p.x, top: p.y, width: p.w, height: p.h, zIndex: p.z, ...(note ? { background: p.tint } : {}) }}
    >
      {note ? (
        editing ? (
          <textarea
            autoFocus
            defaultValue={p.text}
            placeholder="Write a note"
            onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
            onBlur={(e) => onEditNote(p.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') e.currentTarget.blur()
              e.stopPropagation()
            }}
          />
        ) : (
          <div className="note-text">{p.text || <span className="muted">Double-click to write</span>}</div>
        )
      ) : (
        url && <img src={url} alt="" draggable={false} />
      )}
      {selected && !locked && <span className="handle" data-handle />}
    </div>
  )
})
