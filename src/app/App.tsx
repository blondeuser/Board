import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBoardApp, type BoardApp } from './useBoardApp'
import { useLitImport } from './useLitImport'
import { LitImportDialog } from '../ui/LitImportDialog'
import { Canvas } from '../canvas/Canvas'
import { bentoLayout } from '../canvas/bento'
import { boundsOf, clampZoom, fitRect, screenToWorld, zoomAt } from '../canvas/viewport'
import { blobsFromTransfer } from '../items/importImage'
import { MenuBar } from '../ui/MenuBar'
import { Sidebar } from '../ui/Sidebar'
import { Inspector } from '../ui/Inspector'
import type { ShapeKind } from '../shared/types'
import { Library } from '../library/Library'
import { BentoIcon, DiamondIcon, EllipseIcon, FitIcon, LinkIcon, RectIcon, TriangleIcon, MinusIcon, NoteIcon, PlusIcon } from '../ui/icons'

function confirmDelete(app: BoardApp, assetIds: string[]) {
  const boards = new Set(app.allPlacements.filter((p) => assetIds.includes(p.assetId)).map((p) => p.boardId)).size
  const what = assetIds.length === 1 ? 'this image' : `${assetIds.length} images`
  if (confirm(`Delete ${what} from the library${boards ? ` and ${boards} board${boards > 1 ? 's' : ''}` : ''}? This cannot be undone.`)) app.deleteAssets(assetIds)
}

const SHAPE_TOOLS: [ShapeKind, string, () => React.JSX.Element][] = [
  ['rect', 'rectangle', RectIcon],
  ['ellipse', 'circle / ellipse', EllipseIcon],
  ['triangle', 'triangle', TriangleIcon],
  ['diamond', 'diamond', DiamondIcon],
]

export function App() {
  const app = useBoardApp()
  const lit = useLitImport(app)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const live = useRef(app)
  live.current = app

  // Left sidebar: pinned, or hidden and slid out as an overlay while the mouse is at the left edge.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('board.sidebar') !== 'hidden' } catch { return true }
  })
  const [tool, setTool] = useState<ShapeKind | null>(null)
  useEffect(() => {
    if (!tool) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setTool(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [tool])
  const [peek, setPeek] = useState(false)
  const peekTimer = useRef<number>(0)
  const toggleSidebar = useCallback(() => {
    setPeek(false)
    setSidebarOpen((open) => {
      try { localStorage.setItem('board.sidebar', open ? 'hidden' : 'pinned') } catch { /* not remembered */ }
      return !open
    })
  }, [])
  const showPeek = () => { window.clearTimeout(peekTimer.current); setPeek(true) }
  const hidePeek = () => { window.clearTimeout(peekTimer.current); peekTimer.current = window.setTimeout(() => setPeek(false), 250) }

  const worldPointAt = useCallback((clientX?: number, clientY?: number) => {
    const rect = viewportRef.current!.getBoundingClientRect()
    const sx = clientX !== undefined ? clientX - rect.left : rect.width / 2
    const sy = clientY !== undefined ? clientY - rect.top : rect.height / 2
    return screenToWorld(live.current.board!.view, sx, sy)
  }, [])

  const ingest = useCallback(async (dt: DataTransfer, clientX?: number, clientY?: number) => {
    try {
      const blobs = await blobsFromTransfer(dt)
      // In the library there is no board to place on: the images are just added to the library.
      if (blobs.length) await live.current.importBlobs(blobs, live.current.screen === 'library' ? null : worldPointAt(clientX, clientY))
    } catch {
      live.current.notify("Couldn't load that image. Try saving it and dropping the file.")
    }
  }, [worldPointAt])

  // Paste from clipboard (screenshots, copied images, files). Lands at the cursor if it is over the canvas, else centre.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).matches?.('input, textarea') || !e.clipboardData || !live.current.board) return
      e.preventDefault()
      const p = pointer.current
      void ingest(e.clipboardData, p?.x, p?.y)
    }
    const onMove = (e: PointerEvent) => {
      const r = viewportRef.current?.getBoundingClientRect()
      const inside = r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      pointer.current = inside ? { x: e.clientX, y: e.clientY } : null
    }
    const onKey = (e: KeyboardEvent) => {
      const a = live.current
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault() // never the browser's "save page"
        if (a.screen === 'board') void (e.shiftKey ? a.saveBoardAs() : a.saveBoard())
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        toggleSidebar()
        return
      }
      if ((e.target as HTMLElement).matches?.('input, textarea, select') || (e.target as HTMLElement).closest?.('.modal')) return
      if (a.screen === 'library') {
        const sel = a.librarySelection
        if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) confirmDelete(a, sel)
        else if (e.key === 'Escape') a.setLibrarySelection([])
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault()
          a.setLibrarySelection(Object.keys(a.assets).filter((id) => a.matches(id)))
        }
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') a.removeFromBoard(a.selection)
      else if (e.key === 'Escape') a.setSelection([])
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        a.setSelection(a.boardPlacements.map((p) => p.id))
      }
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [ingest, toggleSidebar])

  const bento = app.board?.mode === 'bento'
  const { boardPlacements, assets } = app
  const bentoItems = useMemo(
    () => boardPlacements.filter((p) => p.kind !== 'shape').map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h, kind: p.kind === 'note' ? 'note' as const : 'image' as const, textLength: p.text?.length })),
    [boardPlacements],
  )
  const bentoRects = useMemo(() => (bento ? bentoLayout(bentoItems) : null), [bento, bentoItems])
  const shown = useMemo(
    () => (bentoRects ? boardPlacements.filter((p) => p.kind !== 'shape').map((p) => ({ ...p, ...bentoRects[p.id] })) : boardPlacements),
    [bentoRects, boardPlacements],
  )
  void assets

  if (!app.ready || !app.board) return <div className="boot" />
  const view = app.board.view

  const zoomBy = (f: number) => {
    const r = viewportRef.current!.getBoundingClientRect()
    app.setView(zoomAt(view, r.width / 2, r.height / 2, clampZoom(view.zoom * f)))
  }
  const fit = (list: { x: number; y: number; w: number; h: number }[] = shown) => {
    const r = viewportRef.current!.getBoundingClientRect()
    const b = boundsOf(list)
    app.setView(b ? fitRect(b, r.width, r.height) : { x: r.width / 2, y: r.height / 2, zoom: 1 })
  }
  const toggleBento = () => {
    const next = bento ? 'free' : 'bento'
    app.setMode(next)
    app.setSelection([])
    setTool(null)
    if (next === 'bento') app.setView({ ...view, y: 0 }) // grid zoom/centring is handled by the canvas; start at the top
    else fit(app.boardPlacements)
  }
  const selectedPlacements = app.boardPlacements.filter((p) => app.selection.includes(p.id))
  const linked = selectedPlacements.length === 2 && app.connections.some((c) => selectedPlacements.every((p) => p.id === c.from || p.id === c.to))
  const filtering = app.filter.colors.length + app.filter.categories.length + app.filter.types.length > 0

  return (
    <div className="app">
      <MenuBar app={app} sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} onLitImport={lit.open} />
      <LitImportDialog lit={lit} onShowLibrary={() => app.setScreen('library')} />
      <div className={'shell' + (sidebarOpen ? '' : ' collapsed')}>
      {!sidebarOpen && <div className="edge" onPointerEnter={showPeek} onPointerLeave={hidePeek} />}
      <div className={'side' + (!sidebarOpen && peek ? ' peek' : '')} onPointerEnter={showPeek} onPointerLeave={() => !sidebarOpen && hidePeek()}>
        <Sidebar app={app} />
      </div>
      <main>
        {app.screen === 'library' ? (
          <>
            <Library app={app} onDropData={(dt) => void ingest(dt)} />
            <Inspector
              app={app}
              library
              assetIds={app.librarySelection}
              count={app.librarySelection.length}
              removeTitle="Delete from library (Del)"
              onRemove={() => confirmDelete(app, app.librarySelection)}
            />
          </>
        ) : (
          <>
        <Canvas
          viewportRef={viewportRef}
          view={view}
          placements={shown}
          connections={app.connections}
          locked={bento}
          tool={tool}
          onDraw={(r) => { if (tool) app.addShape(tool, r); setTool(null) }}
          editingId={app.editingId}
          onStartEdit={app.setEditingId}
          onEditNote={app.editNote}
          urls={app.urls}
          selection={app.selection}
          dimmed={(p) => filtering && (p.kind === 'note' || p.kind === 'shape' || !app.matches(p.assetId))}
          onView={app.setView}
          onSelect={app.setSelection}
          onBringToFront={app.bringToFront}
          onTransient={app.patchPlacements}
          onCommit={app.commitPlacements}
          onDropData={(dt, x, y) => void ingest(dt, x, y)}
        />
        <div className="tools" onPointerDown={(e) => e.stopPropagation()}>
          <button className="icon" title="New note" disabled={bento} onClick={() => app.addNote(worldPointAt())}><NoteIcon /></button>
          <button className={'icon' + (bento ? ' on' : '')} title={bento ? 'Back to free layout' : 'Cards mode (bento grid)'} aria-pressed={bento} onClick={toggleBento}><BentoIcon /></button>
        </div>
        {!bento && <div className="drawbar" onPointerDown={(e) => e.stopPropagation()}>
          <button className={'icon' + (linked ? ' on' : '')} title={bento ? 'Links are only in free layout' : linked ? 'Remove the line between the 2 selected cards' : 'Draw a curved line between the 2 selected cards'} disabled={bento || selectedPlacements.length !== 2} onClick={() => app.toggleConnection(selectedPlacements[0].id, selectedPlacements[1].id)}><LinkIcon /></button>
          <hr />
          {SHAPE_TOOLS.map(([id, label, Icon]) => (
            <button key={id} className={'icon' + (tool === id ? ' on' : '')} title={`Draw a ${label}: drag on the canvas (Shift = equal sides, Esc cancels)`} aria-pressed={tool === id} onClick={() => setTool(tool === id ? null : id)}><Icon /></button>
          ))}
        </div>}
        <Inspector
          app={app}
          assetIds={[...new Set(selectedPlacements.filter((p) => p.assetId).map((p) => p.assetId))]}
          notes={selectedPlacements.filter((p) => p.kind === 'note')}
          shapes={selectedPlacements.filter((p) => p.kind === 'shape')}
          count={selectedPlacements.length}
          removeTitle="Remove from board (Del). The image stays in the library."
          onRemove={() => app.removeFromBoard(selectedPlacements.map((p) => p.id))}
        />
        {!bento && <div className="zoombar" onPointerDown={(e) => e.stopPropagation()}>
          <button className="icon" title="Zoom out" onClick={() => zoomBy(1 / 1.25)}><MinusIcon /></button>
          <button className="zoomval" title="Reset to 100%" onClick={() => zoomBy(1 / view.zoom)}>{Math.round(view.zoom * 100)}%</button>
          <button className="icon" title="Zoom in" onClick={() => zoomBy(1.25)}><PlusIcon /></button>
          <button className="icon" title="Fit all" onClick={() => fit()}><FitIcon /></button>
        </div>}
          </>
        )}
        {(app.tagging > 0 || app.modelProgress !== null || (lit.phase === 'running' && !lit.visible)) && (
          <button className="status" onClick={lit.phase === 'running' ? lit.open : undefined}>
            {[
              lit.phase === 'running' && !lit.visible ? `Importing LIT ${lit.progress.done}/${lit.progress.total}` : '',
              app.modelProgress !== null ? `Downloading image model ${Math.round(app.modelProgress)}%` : app.tagging > 0 ? `Analysing images (${app.tagging})` : '',
            ].filter(Boolean).join(' · ')}
          </button>
        )}
        {app.message && <div className="toast">{app.message}</div>}
      </main>
      </div>
    </div>
  )
}
