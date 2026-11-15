import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_TEXT_FORMAT, type TextFormat, NOTE_GREYS, NOTE_H, NOTE_TINTS, NOTE_W, noteHeight, type Asset, type AssetSource, type Board, type Category, type Connection, type Placement, type ShapeKind, type ViewState } from '../shared/types'
import { newId } from '../shared/id'
import { db } from '../backend'
import { makeThumbnail } from '../items/importImage'
import { gridLayout } from '../canvas/viewport'
import { erasePoints, strokeBounds, toLocal } from '../canvas/ink/stroke'
import { alignPatches, reorderZ, type AlignMode, type OrderMode } from '../canvas/arrange'
import { analyseAsset, embedText, setModelProgressListener } from '../categorize/style/classifier'
import { queryToPrompt, semanticMatches } from '../categorize/style/search'
import { EMBEDDING_MODEL } from '../categorize/style/model'
import { saveFile } from '../storage/saveFile'
import { isDesktop } from '../shared/desktop'
import { zipSync, type Zippable } from 'fflate'
import { SPACES_VERSION, pickSpaces, typeName } from '../categorize/style/labels'
import { APP_VERSION, buildBo, type BoAsset } from '../storage/bo/write'
import { BoError, parseBo, planImport } from '../storage/bo/read'
import { extOf, mimeOf, sha256Hex } from '../storage/bo/hash'

export interface Filter {
  colors: string[]
  categories: string[]
  types: string[]
}

const CATEGORY_COLORS = ['#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#89b4fa', '#cba6f7', '#f5c2e7']
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'with', 'and', 'my', 'some', 'show', 'me', 'find', 'photo', 'photos', 'picture', 'pictures', 'image', 'images'])
const DEFAULT_VIEW: ViewState = { x: 0, y: 0, zoom: 1 }
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** Download (browser) or Save-dialog (desktop) a file; export errors are reported by the caller. */
const download = (blob: Blob, name: string) => saveFile(blob, name)

export function useBoardApp() {
  const [ready, setReady] = useState(false)
  const [boards, setBoards] = useState<Board[]>([])
  const [activeId, setActiveId] = useState('')
  const [assets, setAssets] = useState<Record<string, Asset>>({})
  const [placements, setPlacements] = useState<Placement[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [selection, setSelection] = useState<string[]>([])
  const [filter, setFilter] = useState<Filter>({ colors: [], categories: [], types: [] })
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState('')
  const [screen, setScreen] = useState<'board' | 'library'>('board')
  const [librarySelection, setLibrarySelection] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [tagging, setTagging] = useState(0)
  const [modelProgress, setModelProgress] = useState<number | null>(null)

  // Latest state for callbacks that fire after renders (drag end, debounced saves).
  const latest = useRef({ boards, placements, assets, activeId, categories, connections })
  latest.current = { boards, placements, assets, activeId, categories, connections }
  const started = useRef(false)
  const tried = useRef(new Set<string>())
  const warned = useRef(false)
  const requested = useRef(new Set<string>())
  const viewTimer = useRef<number>(0)
  const messageTimer = useRef<number>(0)

  const notify = useCallback((text: string) => {
    setMessage(text)
    window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(''), 4000)
  }, [])

  // ---- load ----
  useEffect(() => {
    if (started.current) return // StrictMode runs effects twice; don't seed two first boards
    started.current = true
    void (async () => {
      let [b, a, p, c, lines] = await Promise.all([db.boards(), db.assets(), db.placements(), db.categories(), db.connections()])
      if (!b.length) {
        const first: Board = { id: newId(), name: 'Board 1', createdAt: Date.now(), view: DEFAULT_VIEW }
        await db.saveBoards([first])
        b = [first]
      }
      b.sort((x, y) => x.createdAt - y.createdAt)
      setBoards(b)
      setActiveId(localStorage.getItem('board.active') && b.some((x) => x.id === localStorage.getItem('board.active')) ? localStorage.getItem('board.active')! : b[0].id)
      setAssets(Object.fromEntries(a.map((x) => [x.id, x])))
      // Notes are always tall 3:4 cards in muted greys: bring older notes in line once.
      const fixed: Placement[] = []
      let ni = 0
      p = p.map((x) => {
        if (x.kind !== 'note') return x
        const grey = (NOTE_GREYS as readonly string[]).includes(x.tint ?? '') ? x.tint : NOTE_GREYS[ni++ % NOTE_GREYS.length]
        const h = noteHeight(x.w)
        if (grey === x.tint && h === x.h) return x
        const y = { ...x, tint: grey, h }
        fixed.push(y)
        return y
      })
      if (fixed.length) void db.savePlacements(fixed)
      setPlacements(p)
      setCategories(c)
      setConnections(lines)
      setReady(true)
      void navigator.storage?.persist?.()
    })()
  }, [])

  const board = boards.find((b) => b.id === activeId)
  const boardPlacements = useMemo(
    () => placements.filter((p) => p.boardId === activeId).sort((a, b) => a.z - b.z),
    [placements, activeId],
  )

  // ---- image URLs, loaded lazily for the active board ----
  // Loaded URLs are applied once per animation frame: one state update per image would re-render everything N times.
  const urlBatch = useRef<Record<string, string>>({})
  const urlFlush = useRef(0)
  const queueUrl = useCallback((id: string, url: string) => {
    urlBatch.current[id] = url
    if (urlFlush.current) return
    urlFlush.current = requestAnimationFrame(() => {
      urlFlush.current = 0
      const batch = urlBatch.current
      urlBatch.current = {}
      setUrls((u) => ({ ...u, ...batch }))
    })
  }, [])
  useEffect(() => {
    const wanted = screen === 'library' ? Object.keys(assets) : boardPlacements.map((p) => p.assetId)
    for (const assetId of wanted) {
      if (!assetId || urls[assetId] || requested.current.has(assetId)) continue
      requested.current.add(assetId)
      void (async () => {
        // Desktop: the <img> loads the thumbnail file itself (asset protocol); no fetch, no Blob in JS memory.
        const direct = await db.thumbUrl?.(assetId)
        if (direct) return queueUrl(assetId, direct)
        let thumb = await db.thumb(assetId)
        if (!thumb) {
          // Imported before thumbnails existed: build one once and keep it.
          const original = await db.blob(assetId)
          if (!original) return
          thumb = await makeThumbnail(original)
          void db.saveThumb(assetId, thumb)
        }
        queueUrl(assetId, URL.createObjectURL(thumb!))
      })()
    }
  }, [boardPlacements, urls, screen, assets, queueUrl])

  // ---- boards ----
  const selectBoard = useCallback((id: string) => {
    setScreen('board')
    setActiveId(id)
    setSelection([])
    localStorage.setItem('board.active', id)
  }, [])

  /** Make an empty board and return its id (does not open it). */
  const createBoard = useCallback((name: string) => {
    const b: Board = { id: newId(), name, createdAt: Date.now(), view: DEFAULT_VIEW }
    latest.current.boards = [...latest.current.boards, b] // callers may add images before the next render
    setBoards((list) => [...list, b])
    void db.saveBoards([b])
    return b.id
  }, [])

  const addBoard = useCallback(() => {
    selectBoard(createBoard(`Board ${latest.current.boards.length + 1}`))
  }, [selectBoard, createBoard])

  const renameBoard = useCallback((id: string, name: string) => {
    const clean = name.trim()
    if (!clean) return
    const next = latest.current.boards.map((b) => (b.id === id ? { ...b, name: clean } : b))
    setBoards(next)
    void db.saveBoards(next.filter((b) => b.id === id))
  }, [])

  /** Remove the lines attached to these cards (their card was removed from the board or deleted). */
  const dropConnections = useCallback((placementIds: string[]) => {
    const gone = new Set(placementIds)
    const dead = latest.current.connections.filter((c) => gone.has(c.from) || gone.has(c.to)).map((c) => c.id)
    if (!dead.length) return
    setConnections((l) => l.filter((c) => !dead.includes(c.id)))
    void db.deleteConnections(dead)
  }, [])

  /** Library delete: removes the images from every board and from disk. Board removal never calls this. */
  const deleteAssets = useCallback((assetIds: string[]) => {
    const gone = new Set(assetIds)
    if (!gone.size) return
    const onBoards = latest.current.placements.filter((p) => gone.has(p.assetId)).map((p) => p.id)
    setPlacements((ps) => ps.filter((p) => !gone.has(p.assetId)))
    dropConnections(onBoards)
    setAssets((a) => Object.fromEntries(Object.entries(a).filter(([id]) => !gone.has(id))))
    setUrls((u) => {
      assetIds.forEach((id) => u[id] && URL.revokeObjectURL(u[id]))
      return Object.fromEntries(Object.entries(u).filter(([id]) => !gone.has(id)))
    })
    assetIds.forEach((id) => requested.current.delete(id))
    setLibrarySelection([])
    setSelection([])
    void db.deletePlacements(onBoards)
    void db.deleteAssets(assetIds)
  }, [dropConnections])

  const addToBoard = useCallback((assetIds: string[], boardId: string) => {
    const { placements: ps, assets: all } = latest.current
    const there = new Set(ps.filter((p) => p.boardId === boardId).map((p) => p.assetId))
    const fresh = assetIds.filter((id) => all[id] && !there.has(id))
    if (!fresh.length) return notify('Already on that board')
    const onBoard = ps.filter((p) => p.boardId === boardId)
    const bottom = Math.max(0, ...onBoard.map((p) => p.y + p.h))
    const sizes = fresh.map((id) => {
      const s = Math.min(1, 320 / Math.max(all[id].width, all[id].height))
      return { w: Math.round(all[id].width * s), h: Math.round(all[id].height * s) }
    })
    const cy = onBoard.length ? bottom + 160 + 60 : 0 // below existing content
    const pos = gridLayout(sizes, 0, cy)
    let z = Math.max(0, ...onBoard.map((p) => p.z))
    const created: Placement[] = fresh.map((id, i) => ({
      id: newId(), boardId, assetId: id, x: pos[i].x, y: pos[i].y, w: sizes[i].w, h: sizes[i].h, z: ++z,
    }))
    setPlacements((p) => [...p, ...created])
    void db.savePlacements(created)
    notify(`Added ${fresh.length} to ${latest.current.boards.find((b) => b.id === boardId)?.name ?? 'board'}`)
  }, [notify])

  const removeBoard = useCallback(
    (id: string) => {
      const { boards: bs, placements: ps } = latest.current
      if (bs.length <= 1) return
      const remaining = ps.filter((p) => p.boardId !== id)
      const next = bs.filter((b) => b.id !== id)
      setBoards(next)
      setPlacements(remaining)
      setConnections((l) => l.filter((c) => c.boardId !== id))
      void db.deleteBoard(id)
      if (latest.current.activeId === id) selectBoard(next[0].id)
    },
    [selectBoard],
  )

  const setView = useCallback((view: ViewState) => {
    const id = latest.current.activeId
    setBoards((list) => list.map((b) => (b.id === id ? { ...b, view } : b)))
    window.clearTimeout(viewTimer.current)
    viewTimer.current = window.setTimeout(() => {
      const b = latest.current.boards.find((x) => x.id === id)
      if (b) void db.saveBoards([b])
    }, 400)
  }, [])

  // ---- placements ----
  /**
   * Add images to the library and, when `center` is given, to the open board around that point.
   * `opts.sources[i]` is stored on the image made from `blobs[i]`; `opts.quiet` (bulk imports) skips the
   * toast and leaves the selection alone. Returns the new asset ids.
   */
  const importBlobs = useCallback(
    async (blobs: Blob[], center: { x: number; y: number } | null, opts: { sources?: (AssetSource | undefined)[]; quiet?: boolean } = {}): Promise<string[]> => {
      const boardId = latest.current.activeId
      const done = await Promise.allSettled(blobs.map((b, i) => db.importImage(b, opts.sources?.[i])))
      const ok = done.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      if (ok.length < blobs.length && !opts.quiet) notify(`${blobs.length - ok.length} file(s) could not be read as images`)
      if (!ok.length) return []
      const sizes = ok.map(({ asset }) => {
        const s = Math.min(1, 320 / Math.max(asset.width, asset.height))
        return { w: Math.round(asset.width * s), h: Math.round(asset.height * s) }
      })
      const pos = gridLayout(sizes, center?.x ?? 0, center?.y ?? 0)
      let z = Math.max(0, ...latest.current.placements.filter((p) => p.boardId === boardId).map((p) => p.z))
      const created: Placement[] = center
        ? ok.map(({ asset }, i) => ({
            id: newId(), boardId, assetId: asset.id, x: pos[i].x, y: pos[i].y, w: sizes[i].w, h: sizes[i].h, z: ++z,
          }))
        : []
      if (created.length) await db.savePlacements(created)
      const added = Object.fromEntries(ok.map(({ asset }) => [asset.id, asset]))
      latest.current.assets = { ...latest.current.assets, ...added } // addToBoard right after an import must see them
      setAssets((a) => ({ ...a, ...added }))
      setUrls((u) => ({ ...u, ...Object.fromEntries(ok.map(({ asset, thumb }) => [asset.id, URL.createObjectURL(thumb)])) }))
      setPlacements((p) => [...p, ...created])
      if (created.length) setSelection(created.map((p) => p.id))
      else if (!opts.quiet) setLibrarySelection(ok.map(({ asset }) => asset.id))
      return ok.map(({ asset }) => asset.id)
    },
    [notify],
  )

  /** Draw a curved line between two cards, or remove it if they are already linked. */
  const toggleConnection = useCallback((a: string, b: string) => {
    const { connections: list, activeId: boardId } = latest.current
    const existing = list.find((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a))
    if (existing) {
      setConnections((l) => l.filter((c) => c.id !== existing.id))
      void db.deleteConnections([existing.id])
      return
    }
    const line: Connection = { id: newId(), boardId, from: a, to: b }
    setConnections((l) => [...l, line])
    void db.saveConnections([line])
  }, [])

  const patchPlacements = useCallback((patches: Record<string, Partial<Placement>>) => {
    setPlacements((list) => list.map((p) => (patches[p.id] ? { ...p, ...patches[p.id] } : p)))
  }, [])

  const commitPlacements = useCallback((ids: string[]) => {
    void db.savePlacements(latest.current.placements.filter((p) => ids.includes(p.id)))
  }, [])

  const addNote = useCallback((center: { x: number; y: number }) => {
    const { placements: ps, activeId: boardId } = latest.current
    const z = Math.max(0, ...ps.filter((p) => p.boardId === boardId).map((p) => p.z)) + 1
    const n = ps.filter((p) => p.boardId === boardId && p.kind === 'note').length
    const note: Placement = {
      id: newId(), boardId, kind: 'note', createdAt: Date.now(), assetId: '', text: '', tint: NOTE_GREYS[n % NOTE_GREYS.length],
      x: center.x - NOTE_W / 2, y: center.y - NOTE_H / 2, w: NOTE_W, h: NOTE_H, z,
    }
    setPlacements((p) => [...p, note])
    void db.savePlacements([note])
    setSelection([note.id])
    setEditingId(note.id)
  }, [])

  /** Plain text: a borderless box at `center`, opened for typing. The last used format is kept for the next one. */
  const addText = useCallback((center: { x: number; y: number }) => {
    const { placements: ps, activeId: boardId } = latest.current
    const z = Math.max(0, ...ps.filter((p) => p.boardId === boardId).map((p) => p.z)) + 1
    const fmt = [...ps].reverse().find((p) => p.kind === 'text')?.fmt ?? DEFAULT_TEXT_FORMAT
    const t: Placement = { id: newId(), boardId, kind: 'text', createdAt: Date.now(), assetId: '', text: '', fmt, x: center.x - 160, y: center.y - fmt.size, w: 320, h: Math.round(fmt.size * 1.5), z }
    setPlacements((p) => [...p, t])
    void db.savePlacements([t])
    setSelection([t.id])
    setEditingId(t.id)
  }, [])

  const setTextFormat = useCallback((ids: string[], patch: Partial<TextFormat>) => {
    const patches: Record<string, Partial<Placement>> = {}
    latest.current.placements.forEach((p) => {
      if (ids.includes(p.id) && p.kind === 'text') patches[p.id] = { fmt: { ...(p.fmt ?? DEFAULT_TEXT_FORMAT), ...patch } }
    })
    patchPlacements(patches)
    setTimeout(() => commitPlacements(ids), 0)
  }, [patchPlacements, commitPlacements])

  /** Add a shape covering `r` (world units) on the open board, on top, and select it. */
  const addShape = useCallback((shape: ShapeKind, r: { x: number; y: number; w: number; h: number }) => {
    const { placements: ps, activeId: boardId } = latest.current
    const z = Math.max(0, ...ps.filter((p) => p.boardId === boardId).map((p) => p.z)) + 1
    const s: Placement = { id: newId(), boardId, kind: 'shape', shape, assetId: '', tint: NOTE_TINTS[0], ...r, z }
    setPlacements((p) => [...p, s])
    void db.savePlacements([s])
    setSelection([s.id])
  }, [])

  const addInk = useCallback((st: { points: number[]; color: string; size: number }) => {
    const { placements: ps, activeId: boardId } = latest.current
    const z = Math.max(0, ...ps.filter((p) => p.boardId === boardId).map((p) => p.z)) + 1
    const b = strokeBounds(st.points, st.size)
    const ink: Placement = {
      id: newId(), boardId, kind: 'ink', assetId: '', x: b.x, y: b.y, w: b.w, h: b.h, z,
      ink: { tool: 'pen', color: st.color, size: st.size, points: toLocal(st.points, b.x, b.y) },
    }
    setPlacements((p) => [...p, ink])
    void db.savePlacements([ink])
  }, [])

  /** Pen eraser: removes strokes only (no selection or connection changes). */
  const eraseInk = useCallback((x: number, y: number, r: number) => {
    const { placements: ps, activeId } = latest.current
    const removed: string[] = []
    const added: Placement[] = []
    for (const p of ps) {
      if (p.kind !== 'ink' || !p.ink || p.boardId !== activeId) continue
      if (x < p.x - r || x > p.x + p.w + r || y < p.y - r || y > p.y + p.h + r) continue
      const pieces = erasePoints(p.ink.points, p.ink.size, x - p.x, y - p.y, r)
      if (!pieces) continue
      removed.push(p.id)
      for (const piece of pieces) {
        const world = toLocal(piece, -p.x, -p.y)
        const b = strokeBounds(world, p.ink.size)
        added.push({ ...p, id: newId(), x: b.x, y: b.y, w: b.w, h: b.h, ink: { ...p.ink, points: toLocal(world, b.x, b.y) } })
      }
    }
    if (!removed.length) return
    // pointer events can outrun React's render: keep the ref current so the next call cuts the new pieces, not the old stroke
    latest.current.placements = [...ps.filter((p) => !removed.includes(p.id)), ...added]
    setPlacements((cur) => [...cur.filter((p) => !removed.includes(p.id)), ...added])
    setSelection((s) => s.filter((id) => !removed.includes(id)))
    void db.deletePlacements(removed)
    if (added.length) void db.savePlacements(added)
  }, [])

  const editNote = useCallback((id: string, text: string) => {
    setEditingId('')
    const cur = latest.current.placements.find((p) => p.id === id)
    if (cur?.kind === 'text' && !text.trim()) {
      // an empty text box is not worth keeping
      setPlacements((ps) => ps.filter((p) => p.id !== id))
      setSelection((s) => s.filter((x) => x !== id))
      void db.deletePlacements([id])
      return
    }
    if (!cur || cur.text === text) return
    patchPlacements({ [id]: { text } })
    setTimeout(() => commitPlacements([id]), 0)
  }, [patchPlacements, commitPlacements])

  const setTint = useCallback((ids: string[], tint: string) => {
    patchPlacements(Object.fromEntries(ids.map((id) => [id, { tint }])))
    setTimeout(() => commitPlacements(ids), 0)
  }, [patchPlacements, commitPlacements])

  const setMode = useCallback((mode: 'free' | 'bento') => {
    const id = latest.current.activeId
    const next = latest.current.boards.map((b) => (b.id === id ? { ...b, mode } : b))
    setBoards(next)
    setEditingId('')
    void db.saveBoards(next.filter((b) => b.id === id))
  }, [])

  const bringToFront = useCallback((ids: string[]) => {
    const { placements: ps, activeId: boardId } = latest.current
    const top = Math.max(0, ...ps.filter((p) => p.boardId === boardId).map((p) => p.z))
    if (ps.filter((p) => ids.includes(p.id)).every((p) => p.z === top)) return
    let z = top
    const patch = Object.fromEntries(ids.map((id) => [id, { z: ++z }]))
    patchPlacements(patch)
    setTimeout(() => commitPlacements(ids), 0)
  }, [patchPlacements, commitPlacements])

  /** Stacking: which cards sit above or below others (images vs. shapes alike). */
  const arrange = useCallback((ids: string[], mode: OrderMode) => {
    const { placements: ps, activeId: boardId } = latest.current
    const patch = reorderZ(ps.filter((p) => p.boardId === boardId), new Set(ids), mode)
    const changed = Object.keys(patch)
    if (!changed.length) return
    patchPlacements(Object.fromEntries(changed.map((id) => [id, { z: patch[id] }])))
    setTimeout(() => commitPlacements(changed), 0)
  }, [patchPlacements, commitPlacements])

  const align = useCallback((ids: string[], mode: AlignMode) => {
    const rects = latest.current.placements.filter((p) => ids.includes(p.id))
    const patch = alignPatches(rects, mode)
    const changed = Object.keys(patch)
    if (!changed.length) return
    patchPlacements(patch)
    setTimeout(() => commitPlacements(changed), 0)
  }, [patchPlacements, commitPlacements])

  // ---- copy / cut / paste of cards (in-app clipboard: the same images, notes and shapes, with the lines between them) ----
  const clip = useRef<{ items: Placement[]; lines: Connection[] } | null>(null)
  const pasteCount = useRef(0)
  const [hasClipboard, setHasClipboard] = useState(false)

  const copyCards = useCallback((ids: string[]) => {
    const { placements: ps, connections: lines } = latest.current
    const items = ps.filter((p) => ids.includes(p.id))
    if (!items.length) return
    clip.current = { items, lines: lines.filter((c) => ids.includes(c.from) && ids.includes(c.to)) }
    pasteCount.current = 0
    setHasClipboard(true)
    notify(`Copied ${items.length} card${items.length === 1 ? '' : 's'}`)
  }, [notify])

  /** Paste the copied cards onto the open board, centred on `at` (world units), each paste nudged so copies don't hide each other. */
  const pasteCards = useCallback((at: { x: number; y: number }) => {
    const c = clip.current
    if (!c) return
    const { placements: ps, assets: all, activeId: boardId } = latest.current
    const items = c.items.filter((p) => !p.assetId || all[p.assetId]) // an image deleted from the library can't come back
    if (!items.length) return notify('Those images are no longer in the library')
    const x1 = Math.min(...items.map((p) => p.x)), y1 = Math.min(...items.map((p) => p.y))
    const x2 = Math.max(...items.map((p) => p.x + p.w)), y2 = Math.max(...items.map((p) => p.y + p.h))
    const nudge = 24 * pasteCount.current++
    const dx = at.x - (x1 + x2) / 2 + nudge, dy = at.y - (y1 + y2) / 2 + nudge
    let z = Math.max(0, ...ps.filter((p) => p.boardId === boardId).map((p) => p.z))
    const ids = new Map(items.map((p) => [p.id, newId()]))
    const created: Placement[] = [...items].sort((a, b) => a.z - b.z).map((p) => ({ ...p, id: ids.get(p.id)!, boardId, x: p.x + dx, y: p.y + dy, z: ++z }))
    const lines: Connection[] = c.lines.flatMap((l) => (ids.has(l.from) && ids.has(l.to) ? [{ id: newId(), boardId, from: ids.get(l.from)!, to: ids.get(l.to)! }] : []))
    setPlacements((p) => [...p, ...created])
    setConnections((l) => [...l, ...lines])
    void db.savePlacements(created)
    if (lines.length) void db.saveConnections(lines)
    setSelection(created.map((p) => p.id))
  }, [notify])

  const removeFromBoard = useCallback(
    (ids: string[]) => {
      if (!ids.length) return
      setPlacements((ps) => ps.filter((p) => !ids.includes(p.id))) // the images stay in the library
      dropConnections(ids)
      setSelection([])
      void db.deletePlacements(ids)
    },
    [dropConnections],
  )

  /** Wipe the whole local library and start over (the page reloads into an empty Board 1). */
  const clearAll = useCallback(async () => {
    window.clearTimeout(viewTimer.current) // a pending view save would write the old board back
    try {
      await db.clearAll()
      localStorage.removeItem('board.active')
    } catch {
      return notify('Could not clear the library.')
    }
    window.location.reload()
  }, [notify])

  /** Cut = copy, then take off the board (the images stay in the library). */
  const cutCards = useCallback((ids: string[]) => {
    copyCards(ids)
    removeFromBoard(ids)
  }, [copyCards, removeFromBoard])

  // ---- tagging ----
  const updateAssets = useCallback((assetIds: string[], fn: (a: Asset) => Asset) => {
    const next = { ...latest.current.assets }
    const changed: Asset[] = []
    assetIds.forEach((id) => {
      if (next[id]) changed.push((next[id] = fn(next[id])))
    })
    latest.current.assets = next // several results can land before the next render
    setAssets(next)
    void db.saveAssets(changed)
  }, [])

  const toggleTag = useCallback(
    (assetIds: string[], kind: 'colors' | 'categoryIds' | 'types', value: string) => {
      const list = (a: Asset) => a[kind] ?? []
      const all = assetIds.every((id) => latest.current.assets[id] && list(latest.current.assets[id]).includes(value))
      updateAssets(assetIds, (a) => ({
        ...a,
        [kind]: all ? list(a).filter((v) => v !== value) : list(a).includes(value) ? list(a) : [...list(a), value],
      }))
    },
    [updateAssets],
  )

  // ---- .bo files (docs/BO_FORMAT.md) ----
  /** Pack the open board into `.bo` bytes: layout, notes, tags, categories and the original image files. */
  const packBoard = useCallback(async () => {
    const { boards: bs, placements: ps, assets: all, categories: cats, activeId: id } = latest.current
    const b = bs.find((x) => x.id === id)
    if (!b) return null
    const onBoard = ps.filter((p) => p.boardId === id)
    const images = new Map<string, Uint8Array>()
    const assets: BoAsset[] = []
    for (const assetId of new Set(onBoard.map((p) => p.assetId).filter(Boolean))) {
      const a = all[assetId]
      const blob = await db.blob(assetId)
      if (!a || !blob) throw new Error('missing image')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const hash = a.hash ?? (await sha256Hex(bytes))
      if (!a.hash) updateAssets([assetId], (x) => ({ ...x, hash }))
      images.set(hash, bytes)
      const { embedding: _e, embeddingModel: _m, ...rest } = a
      assets.push({ ...rest, hash, ext: extOf(blob.type) })
    }
    const used = new Set(assets.flatMap((a) => a.categoryIds))
    const bytes = buildBo({ board: b, placements: onBoard, assets, categories: cats.filter((c) => used.has(c.id)), images }, APP_VERSION)
    return { board: b, bytes, count: assets.length }
  }, [updateAssets])

  // File > Save remembers where each board was saved (browsers that allow it); lost on reload.
  const fileHandles = useRef(new Map<string, FileSystemFileHandle>())
  const filePaths = useRef(new Map<string, string>()) // desktop: board id -> path last saved to

  const saveBoardFile = useCallback(async (asNew: boolean) => {
    try {
      if (isDesktop()) {
        // Rust writes the .bo itself (no image bytes through the UI). File > Save reuses the path chosen earlier.
        const b = latest.current.boards.find((x) => x.id === latest.current.activeId)
        if (!b) return
        let path = asNew ? undefined : filePaths.current.get(b.id)
        if (!path) {
          const { save } = await import('@tauri-apps/plugin-dialog')
          const name = `${b.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'board'}.bo`
          path = (await save({ defaultPath: name, filters: [{ name: 'Board file', extensions: ['bo'] }] })) ?? undefined
          if (!path) return // dialog cancelled
        }
        const { exportBo } = await import('../backend/api')
        const { images } = await exportBo(b.id, path)
        filePaths.current.set(b.id, path)
        notify(`Saved ${path.split(/[\\/]/).pop()} (${images} image${images === 1 ? '' : 's'})`)
        return
      }
      const packed = await packBoard()
      if (!packed) return
      const { board: b, bytes, count } = packed
      const name = `${b.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'board'}.bo`
      const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker
      let handle = asNew ? undefined : fileHandles.current.get(b.id)
      if (!handle && picker) {
        handle = await picker({ suggestedName: name, types: [{ description: 'Board file', accept: { 'application/octet-stream': ['.bo'] } }] })
        fileHandles.current.set(b.id, handle)
      }
      if (handle) {
        const w = await handle.createWritable()
        await w.write(bytes as BlobPart)
        await w.close()
        notify(`Saved ${handle.name} (${count} image${count === 1 ? '' : 's'})`)
      } else {
        // No file-picker support (Firefox/Safari): download instead.
        await download(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), name)
        notify(`Saved ${name} to Downloads`)
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return // picker cancelled
      notify('Could not save the board.')
    }
  }, [notify, packBoard])
  const saveBoard = useCallback(() => saveBoardFile(false), [saveBoardFile])
  const saveBoardAs = useCallback(() => saveBoardFile(true), [saveBoardFile])

  /** Export the originals of the given images as JPEG: one file, or a zip when there are several. */
  const exportJpeg = useCallback(async (assetIds: string[]) => {
    const files: Zippable = {}
    let single: Blob | null = null
    let failed = 0
    for (const id of new Set(assetIds)) {
      try {
        const bitmap = await createImageBitmap((await db.blob(id))!)
        const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height })
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fff' // JPEG has no transparency: PNG/WebP cut-outs get a white background
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(bitmap, 0, 0)
        bitmap.close()
        const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
        if (!jpg) throw new Error('encode failed')
        single = jpg
        files[`image-${Object.keys(files).length + 1}.jpg`] = [new Uint8Array(await jpg.arrayBuffer()), { level: 0 }]
      } catch {
        failed++
      }
    }
    const done = Object.keys(files).length
    let saved: { name: string } | null = { name: '' }
    try {
      if (done === 1 && single) saved = await download(single, 'image.jpg')
      else if (done) saved = await download(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), 'images.zip')
    } catch {
      notify('Could not save the export.')
      return
    }
    if (!saved) return // save dialog cancelled
    notify(done ? `Exported ${done} JPEG${done === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}` : 'Could not export those images.')
  }, [notify])

  /** Open a `.bo` as a new board. Images already in the library (same hash) are reused, never duplicated. */
  const importBo = useCallback(async (file: File) => {
    try {
      const content = parseBo(new Uint8Array(await file.arrayBuffer()))
      // Hash of every library image, filling in the missing ones (older images) as we go.
      const hashes = new Map<string, string>()
      const backfill: Record<string, string> = {}
      for (const a of Object.values(latest.current.assets)) {
        let h = a.hash
        if (!h) {
          const blob = await db.blob(a.id)
          if (!blob) continue
          h = backfill[a.id] = await sha256Hex(new Uint8Array(await blob.arrayBuffer()))
        }
        hashes.set(h, a.id)
      }
      const plan = planImport(content, { hashes, categories: latest.current.categories }, newId)
      // Decode everything first so a bad image fails the import before anything is written.
      const ready = await Promise.all(
        plan.addAssets.map(async ({ asset, ext }) => {
          const blob = new Blob([content.images.get(asset.hash!)! as BlobPart], { type: mimeOf(ext) })
          return { asset, blob, thumb: await makeThumbnail(blob) }
        }),
      )
      await Promise.all(ready.map(({ asset, blob, thumb }) => db.addAsset(asset, blob, thumb)))
      if (plan.addCategories.length) await db.saveCategories(plan.addCategories)
      await db.saveBoards([plan.board])
      await db.savePlacements(plan.placements)
      const cur = latest.current.assets
      const merged = Object.fromEntries(plan.mergeCategories.flatMap(({ assetId, categoryIds }) => (cur[assetId] ? [[assetId, categoryIds]] : [])))
      updateAssets([...Object.keys(merged), ...Object.keys(backfill)], (a) => ({
        ...a,
        hash: a.hash ?? backfill[a.id],
        categoryIds: [...new Set([...a.categoryIds, ...(merged[a.id] ?? [])])],
      }))
      setCategories((l) => [...l, ...plan.addCategories])
      setAssets((a) => ({ ...a, ...Object.fromEntries(ready.map(({ asset }) => [asset.id, asset])) }))
      latest.current.assets = { ...latest.current.assets, ...Object.fromEntries(ready.map(({ asset }) => [asset.id, asset])) }
      setUrls((u) => ({ ...u, ...Object.fromEntries(ready.map(({ asset, thumb }) => [asset.id, URL.createObjectURL(thumb)])) }))
      setPlacements((p) => [...p, ...plan.placements])
      setBoards((l) => [...l, plan.board])
      selectBoard(plan.board.id)
      notify(`Opened "${plan.board.name}" (${plan.addAssets.length} new image${plan.addAssets.length === 1 ? '' : 's'})`)
    } catch (e) {
      notify(e instanceof BoError ? e.message : 'Could not open that file.')
    }
  }, [notify, updateAssets, selectBoard])

  /** Desktop: pick a .bo and let Rust open it as a new board, then reload the library state. */
  const openBo = useCallback(async (known?: string | File) => {
    try {
      const path = known ?? (await (await import('@tauri-apps/plugin-dialog')).open({ multiple: false, filters: [{ name: 'Board file', extensions: ['bo'] }] }))
      if (typeof path !== 'string' && !(path instanceof File)) return
      const { importBoFile, importBoBytes, loadAll } = await import('../backend/api')
      const done = typeof path === 'string' ? await importBoFile(path) : await importBoBytes(new Uint8Array(await path.arrayBuffer()))
      const lib = await loadAll()
      const map = Object.fromEntries(lib.assets.map((a) => [a.id, { ...a, embedding: undefined } as Asset]))
      latest.current.assets = map
      setAssets(map)
      setCategories(lib.categories)
      setPlacements(lib.placements)
      setBoards([...lib.boards].sort((x, y) => x.createdAt - y.createdAt))
      selectBoard(done.boardId)
      notify(`Opened "${done.name}" (${done.newImages} new image${done.newImages === 1 ? '' : 's'})`)
    } catch (e) {
      notify(typeof e === 'string' && e ? e : 'Could not open that file.')
    }
  }, [notify, selectBoard])

  // Started by double-clicking a .bo in Explorer: open it once the library is loaded.
  useEffect(() => {
    if (!ready || !isDesktop()) return
    void import('@tauri-apps/api/core').then(({ invoke }) => invoke<string | null>('take_launch_file')).then((p) => { if (p) void openBo(p) })
  }, [ready, openBo])

  // macOS: a .bo opened from Finder / the Dock while the app is already running (Rust emits 'open-bo' and keeps the path).
  useEffect(() => {
    if (!ready || !isDesktop()) return
    let off: (() => void) | undefined
    let gone = false
    void Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/core')]).then(([{ listen }, { invoke }]) =>
      listen('open-bo', () => void invoke<string | null>('take_launch_file').then((p) => { if (p) void openBo(p) })).then((u) => {
        gone ? u() : (off = u)
        // The event may have fired before this listener existed (cold start from Finder): pick up the stored path now.
        if (!gone) void invoke<string | null>('take_launch_file').then((p) => { if (p) void openBo(p) })
      }),
    )
    return () => { gone = true; off?.() }
  }, [ready, openBo])

  // ---- auto type detection (on-device CLIP, runs in a worker) ----
  const autoTag = useCallback(
    (assetIds: string[]) => {
      const todo = assetIds.filter((id) => !tried.current.has(id))
      todo.forEach((id) => tried.current.add(id))
      setTagging((n) => n + todo.length)
      void (async () => {
        for (const id of todo) {
          try {
            // Desktop: Rust reads the file itself, so the image never has to be loaded into JS.
            const blob = isDesktop() ? undefined : ((await db.thumb(id)) ?? (await db.blob(id)))
            if (!blob && !isDesktop()) continue
            const { types, embedding, detail } = await analyseAsset(id, blob)
            // Never overwrite types the user already edited while we were working; only add space tags next to them.
            updateAssets([id], (a) => {
              const base = a.types ?? types
              const spaces = pickSpaces(base, detail).filter((t) => !base.includes(t))
              return { ...a, ...(embedding ? { embedding } : {}), embeddingModel: EMBEDDING_MODEL, spacesVersion: SPACES_VERSION, types: [...base, ...spaces] }
            })
          } catch {
            if (!warned.current) {
              warned.current = true
              notify('Could not detect image types. The model downloads once; check your connection and reload.')
            }
          } finally {
            setTagging((n) => n - 1)
          }
        }
      })()
    },
    [updateAssets, notify],
  )

  useEffect(() => {
    setModelProgressListener((p) => setModelProgress(p >= 99.9 ? null : p))
  }, [])

  useEffect(() => {
    if (!ready) return
    const todo = Object.values(assets).filter((a) => a.embeddingModel !== EMBEDDING_MODEL || a.spacesVersion !== SPACES_VERSION).map((a) => a.id)
    if (todo.length) autoTag(todo)
  }, [ready, assets, autoTag])

  const addCategory = useCallback((name: string) => {
    const clean = name.trim()
    const list = latest.current.categories
    if (!clean || list.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return
    const c: Category = { id: newId(), name: clean, color: CATEGORY_COLORS[list.length % CATEGORY_COLORS.length] }
    setCategories([...list, c])
    void db.saveCategories([c])
  }, [])

  const removeCategory = useCallback(
    (id: string) => {
      setCategories((list) => list.filter((c) => c.id !== id))
      setFilter((f) => ({ ...f, categories: f.categories.filter((c) => c !== id) }))
      void db.deleteCategory(id)
      const tagged = Object.values(latest.current.assets).filter((a) => a.categoryIds.includes(id))
      updateAssets(tagged.map((a) => a.id), (a) => ({ ...a, categoryIds: a.categoryIds.filter((c) => c !== id) }))
    },
    [updateAssets],
  )

  // ---- filter ----
  const toggleFilter = useCallback((kind: keyof Filter, value: string) => {
    setFilter((f) => ({ ...f, [kind]: toggle(f[kind], value) }))
  }, [])
  const clearFilter = useCallback(() => setFilter({ colors: [], categories: [], types: [] }), [])

  // Text search (library only): every word must appear in the image's type, category, colour, board names or source credits.
  const boardNamesByAsset = useMemo(() => {
    const names = new Map(boards.map((b) => [b.id, b.name]))
    const out = new Map<string, string[]>()
    for (const p of placements) if (p.assetId) (out.get(p.assetId) ?? out.set(p.assetId, []).get(p.assetId)!).push(names.get(p.boardId) ?? '')
    return out
  }, [placements, boards])

  // Search by meaning: embed the query and compare with every image's embedding (desktop: all of it happens in Rust).
  const [queryVec, setQueryVec] = useState<{ q: string; v: Float32Array } | null>(null)
  const [searchFailed, setSearchFailed] = useState(false)
  const [desktopHits, setDesktopHits] = useState<Map<string, number>>(new Map())
  // Desktop: results change as images finish analysis, so searching again when the count of analysed images changes.
  const analysedCount = useMemo(() => (isDesktop() ? Object.values(assets).filter((a) => a.embeddingModel === EMBEDDING_MODEL).length : 0), [assets])
  const searchWarned = useRef(false)
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setQueryVec(null)
      return
    }
    let stale = false
    const t = window.setTimeout(() => {
      const run = isDesktop()
        ? import('../backend/api').then(({ searchMeaning }) => searchMeaning(queryToPrompt(q))).then((hits) => {
            if (!stale) setDesktopHits(new Map(hits))
            return new Float32Array(0) // the vector stays in Rust; the hits above are the result
          })
        : embedText(queryToPrompt(q))
      run
        .then((v) => {
          if (stale) return
          setSearchFailed(false)
          setQueryVec({ q, v })
        })
        .catch(() => {
          if (stale) return
          setSearchFailed(true)
          if (!searchWarned.current) {
            searchWarned.current = true
            notify('Search by meaning needs the image model (downloads once). Matching tag names only for now.')
          }
        })
    }, 300)
    return () => {
      stale = true
      window.clearTimeout(t)
    }
  }, [query, notify, analysedCount])

  const semantic = useMemo(
    () => (isDesktop() ? (queryVec ? desktopHits : new Map<string, number>()) : queryVec ? semanticMatches(queryVec.v, Object.values(assets).map((a) => ({ id: a.id, embedding: a.embeddingModel === EMBEDDING_MODEL ? a.embedding : undefined }))) : new Map<string, number>()),
    [queryVec, assets, desktopHits],
  )

  /** True while the meaning-search for the current text is still being computed (the list shows the previous result meanwhile). */
  const searchPending = query.trim() !== '' && !searchFailed && queryVec?.q !== query.trim()

  const matches = useCallback(
    (assetId: string) => {
      const a = assets[assetId]
      if (!a) return true
      const colorOk = !filter.colors.length || filter.colors.some((c) => a.colors.includes(c))
      const catOk = !filter.categories.length || filter.categories.some((c) => a.categoryIds.includes(c))
      const typeOk = !filter.types.length || filter.types.some((t) => a.types?.includes(t))
      if (!(colorOk && catOk && typeOk)) return false
      const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w))
      if (screen !== 'library' || !words.length) return true
      const hay = [
        ...(a.types ?? []).map(typeName),
        ...a.categoryIds.map((id) => categories.find((c) => c.id === id)?.name ?? ''),
        ...a.colors,
        ...(boardNamesByAsset.get(a.id) ?? []),
        ...(a.source ? [a.source.site, a.source.title ?? '', sourceAddressWords(a.source.url), ...(a.source.categories ?? []), ...Object.values(a.source.details ?? {})] : []),
      ].join(' ').toLowerCase().split(/[^\p{L}\p{N}]+/u)
      // A tag-name hit (a word starting with what you typed) or a meaning hit both count.
      return words.every((w) => hay.some((h) => h.startsWith(w))) || semantic.has(a.id)
    },
    [assets, filter, query, screen, categories, boardNamesByAsset, semantic],
  )

  return {
    allPlacements: placements, connections, toggleConnection,
    arrange, align, copyCards, cutCards, pasteCards, hasClipboard,
    query, setQuery, semantic, searchPending,
    screen, setScreen, librarySelection, setLibrarySelection, deleteAssets, addToBoard,
    tagging, modelProgress, editingId, setEditingId, addNote, addText, setTextFormat, addShape, addInk, eraseInk, editNote, setTint, setMode,
    ready, boards, board, activeId, assets, urls, categories, selection, filter, message,
    boardPlacements,
    setSelection, selectBoard, addBoard, createBoard, renameBoard, removeBoard, setView,
    saveBoard, saveBoardAs, importBo, openBo, exportJpeg, clearAll,
    importBlobs, patchPlacements, commitPlacements, bringToFront, removeFromBoard,
    toggleTag, addCategory, removeCategory, toggleFilter, clearFilter, matches, notify,
  }
}

/** Words of a source address (site name and path), so links without a title are still found by their address. */
const sourceAddressWords = (url: string): string => {
  try {
    const u = new URL(url)
    return u.hostname + ' ' + decodeURIComponent(u.pathname)
  } catch { return '' }
}

export type BoardApp = ReturnType<typeof useBoardApp>
