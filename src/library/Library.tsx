import { useMemo, useRef, useState } from 'react'
import type { BoardApp } from '../app/useBoardApp'
import type { Asset } from '../shared/types'
import { groupAssets, type GroupBy } from './group'
import { SearchIcon } from '../ui/icons'
import { ContextMenu, type MenuItem } from '../ui/ContextMenu'

const TABS: [GroupBy, string][] = [
  ['category', 'Category'],
  ['type', 'Type'],
  ['color', 'Colour'],
  ['source', 'Award'],
  ['none', 'All'],
]

const loadGroupBy = (): GroupBy => {
  try {
    const v = localStorage.getItem('board.groupBy')
    return v === 'none' || v === 'type' || v === 'color' || v === 'source' ? v : 'category'
  } catch {
    return 'category'
  }
}

/** "All images" view: every image across all boards, newest first, stacked into sections. Sidebar filters hide non-matches. */
export function Library({ app, onDropData, onDelete }: { app: BoardApp; onDropData: (dt: DataTransfer) => void; onDelete: (ids: string[]) => void }) {
  const { assets, urls, categories, librarySelection: selected, setLibrarySelection: setSelected } = app
  const [groupBy, setGroupBy] = useState<GroupBy>(loadGroupBy)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const shown = useMemo(
    () => Object.values(assets).filter((a) => app.matches(a.id)).sort((a, b) => b.createdAt - a.createdAt),
    [assets, app.matches], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const searching = app.query.trim().length > 0
  // While searching, results are one flat list, best match first.
  const ranked = useMemo(
    () => (searching ? [...shown].sort((a, b) => (app.semantic.get(b.id) ?? -1) - (app.semantic.get(a.id) ?? -1)) : shown),
    [shown, searching, app.semantic],
  )
  const groups = useMemo(() => groupAssets(ranked, searching ? 'none' : groupBy, categories), [ranked, groupBy, searching, categories])
  const total = Object.keys(assets).length

  const click = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (e.shiftKey || e.ctrlKey || e.metaKey) setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
    else setSelected([id])
  }
  const pickGroupBy = (v: GroupBy) => {
    setGroupBy(v)
    setOpenStack('')
    try {
      localStorage.setItem('board.groupBy', v)
    } catch {
      /* storage unavailable: the choice just won't be remembered */
    }
  }
  const [openStack, setOpenStack] = useState('')

  // ---- bulk select: drag a box on empty space (Shift adds to the selection); right-click for Export / Select all / Delete ----
  const root = useRef<HTMLDivElement>(null)
  const band = useRef<{ x: number; y: number; base: string[]; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const onBandDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, label, a, select')) return
    band.current = { x: e.clientX, y: e.clientY, base: e.shiftKey ? selected : [], moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onBandMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = band.current
    if (!b) return
    const w = Math.abs(e.clientX - b.x)
    const h = Math.abs(e.clientY - b.y)
    if (!b.moved && w + h < 6) return
    b.moved = true
    const x = Math.min(e.clientX, b.x)
    const y = Math.min(e.clientY, b.y)
    setBox({ x, y, w, h })
    const hit: string[] = []
    root.current?.querySelectorAll<HTMLElement>('[data-aid]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.left < x + w && r.right > x && r.top < y + h && r.bottom > y) hit.push(el.dataset.aid!)
    })
    const next = [...new Set([...b.base, ...hit])]
    if (next.length !== selected.length || next.some((id) => !selected.includes(id))) setSelected(next)
  }
  const onBandUp = () => {
    justDragged.current = !!band.current?.moved
    band.current = null
    setBox(null)
  }
  const ctxItems: (MenuItem | 'sep')[] = [
    { label: `Export as JPEG${selected.length > 1 ? `s (${selected.length})` : ''}`, disabled: !selected.length, run: () => void app.exportJpeg(selected) },
    'sep',
    { label: 'Select All', run: () => setSelected(ranked.map((a) => a.id)) },
    { label: 'Select None', disabled: !selected.length, run: () => setSelected([]) },
    'sep',
    { label: 'Delete…', keys: 'Del', disabled: !selected.length, run: () => onDelete(selected) },
  ]
  const selectGroup = (items: Asset[]) => setSelected(items.map((a) => a.id))

  return (
    <div
      className="library"
      ref={root}
      onPointerDown={onBandDown}
      onPointerMove={onBandMove}
      onPointerUp={onBandUp}
      onPointerCancel={onBandUp}
      onContextMenu={(e) => {
        e.preventDefault()
        const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-aid]')
        if (cell && !selected.includes(cell.dataset.aid!)) setSelected([cell.dataset.aid!])
        setCtx({ x: e.clientX, y: e.clientY })
      }}
      onClick={() => {
        if (justDragged.current) justDragged.current = false
        else setSelected([])
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDropData(e.dataTransfer)
      }}
    >
      <div className="library-top" onClick={(e) => e.stopPropagation()}>
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search your library, e.g. a man, red poster, kitchen"
            value={app.query}
            onChange={(e) => app.setQuery(e.target.value)}
            aria-label="Search library"
          />
        </label>
        <span className="muted count" data-pending={app.searchPending}>{app.searchPending ? 'Searching…' : shown.length === total ? `${total} images` : `${shown.length} of ${total}`}</span>
      </div>
      {!searching && <div className="tabs" role="tablist" aria-label="Group by" onClick={(e) => e.stopPropagation()}>
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={groupBy === id} className={groupBy === id ? 'on' : ''} onClick={() => pickGroupBy(id)}>
            {label}
          </button>
        ))}
      </div>}

      {!shown.length ? (
        <div className="empty static">
          <p>{total ? 'No images match the filters' : 'Paste or drop images to add them to the library'}</p>
        </div>
      ) : !searching && (groupBy === 'type' || groupBy === 'color' || groupBy === 'source') ? (
        <>
          <div className={'stacks' + (openStack ? ' has-open' : '')} onClick={(e) => e.stopPropagation()}>
            {groups.map((g) => (
              <button key={g.key} className={'stack-tile' + (openStack === g.key ? ' open' : '')} aria-expanded={openStack === g.key} onClick={() => setOpenStack(openStack === g.key ? '' : g.key)}>
                <span className="stack">
                  {g.items.slice(0, 4).map((a, i) => (
                    <span key={a.id} className="card" style={{ '--i': i } as React.CSSProperties}>
                      {urls[a.id] && <img src={urls[a.id]} alt="" draggable={false} />}
                    </span>
                  ))}
                </span>
                <span className="stack-title">
                  {g.color && <i className="dot" style={{ background: g.color }} />}
                  <strong>{g.name}</strong>
                  <span className="muted">{g.items.length}</span>
                </span>
              </button>
            ))}
          </div>
          {groups.filter((g) => g.key === openStack).map((g) => (
            <section key={g.key} className="group opened">
              <div className="group-head" onClick={(e) => e.stopPropagation()}>
                {g.color && <i className="dot" style={{ background: g.color }} />}
                <strong>{g.name}</strong>
                <span className="muted">{g.items.length}</span>
                <button className="link" onClick={() => selectGroup(g.items)}>Select all</button>
                <button className="link" onClick={() => setOpenStack('')}>Close</button>
              </div>
              <div className="grid">
                {g.items.map((a) => (
                  <button key={a.id} data-aid={a.id} className={'cell' + (selected.includes(a.id) ? ' selected' : '')} onClick={(e) => click(e, a.id)} aria-pressed={selected.includes(a.id)} style={{ aspectRatio: `${a.width} / ${a.height}` }}>
                    {urls[a.id] && <img src={urls[a.id]} alt="" draggable={false} loading="lazy" />}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="group">
            {groupBy !== 'none' && !searching && (
              <div className="group-head" onClick={(e) => e.stopPropagation()}>
                <button className="group-toggle" aria-expanded={!collapsed[g.key]} onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}>
                  <span className={'chev' + (collapsed[g.key] ? '' : ' open')}>›</span>
                  {g.color && <i className="dot" style={{ background: g.color }} />}
                  <strong>{g.name}</strong>
                  <span className="muted">{g.items.length}</span>
                </button>
                <button className="link" onClick={() => selectGroup(g.items)}>Select all</button>
              </div>
            )}
            {!collapsed[g.key] && (
              <div className="grid">
                {g.items.map((a) => (
                  <button
                    key={a.id}
                    data-aid={a.id}
                    className={'cell' + (selected.includes(a.id) ? ' selected' : '')}
                    onClick={(e) => click(e, a.id)}
                    aria-pressed={selected.includes(a.id)}
                    style={{ aspectRatio: `${a.width} / ${a.height}` }}
                  >
                    {urls[a.id] && <img src={urls[a.id]} alt="" draggable={false} loading="lazy" />}
                    <span className="strip">
                      {a.palette.slice(0, 5).map((c) => <i key={c.hex} style={{ background: c.hex, flexGrow: c.share }} />)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))
      )}
      {box && <div className="marquee fixed" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems} onClose={() => setCtx(null)} />}
    </div>
  )
}
