import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NOTE_TINTS, type Asset, type Board, type Category, type Placement, type ViewState } from '../shared/types'
import { newId } from '../shared/id'
import { db } from '../storage/db'
import { importImage, makeThumbnail } from '../items/importImage'
import { gridLayout } from '../canvas/viewport'
import { analyseImage, embedText, setModelProgressListener } from '../categorize/style/classifier'
import { queryToPrompt, semanticMatches } from '../categorize/style/search'
import { EMBEDDING_MODEL } from '../categorize/style/model'
import { typeName } from '../categorize/style/labels'
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

export function useBoardApp() {
  const [ready, setReady] = useState(false)
  const [boards, setBoards] = useState<Board[]>([])
  const [activeId, setActiveId] = useState('')
  const [assets, setAssets] = useState<Record<string, Asset>>({})
  const [placements, setPlacements] = useState<Placement[]>([])
  const [categories, setCategories] = useState<Category[]>([])
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
  const latest = useRef({ boards, placements, assets, activeId, categories })
  latest.current = { boards, placements, assets, activeId, categories }
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
      let [b, a, p, c] = await Promise.all([db.boards(), db.assets(), db.placements(), db.categories()])
      if (!b.length) {
        const first: Board = { id: newId(), name: 'Board 1', createdAt: Date.now(), view: DEFAULT_VIEW }
        await db.saveBoards([first])
        b = [first]
      }
      b.sort((x, y) => x.createdAt - y.createdAt)
      setBoards(b)
      setActiveId(localStorage.getItem('board.active') && b.some((x) => x.id === localStorage.getItem('board.active')) ? localStorage.getItem('board.active')! : b[0].id)
      setAssets(Object.fromEntries(a.map((x) => [x.id, x])))
      setPlacements(p)
      setCategories(c)
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
  useEffect(() => {
    const wanted = screen === 'library' ? Object.keys(assets) : boardPlacements.map((p) => p.assetId)
    for (const assetId of wanted) {
      if (!assetId || urls[assetId] || requested.current.has(assetId)) continue
      requested.current.add(assetId)
      void (async () => {
        let thumb = await db.thumb(assetId)
        if (!thumb) {
          // Imported before thumbnails existed: build one once and keep it.
          const original = await db.blob(assetId)
          if (!original) return
          thumb = await makeThumbnail(original)
          void db.saveThumb(assetId, thumb)
        }
        setUrls((u) => ({ ...u, [assetId]: URL.createObjectURL(thumb!) }))
      })()
    }
  }, [boardPlacements, urls, screen, assets])

  // ---- boards ----
  const selectBoard = useCallback((id: string) => {
    setScreen('board')
    setActiveId(id)
    setSelection([])
    localStorage.setItem('board.active', id)
  }, [])

  const addBoard = useCallback(() => {
    const n = latest.current.boards.length + 1
    const b: Board = { id: newId(), name: `Board ${n}`, createdAt: Date.now(), view: DEFAULT_VIEW }
    setBoards((list) => [...list, b])
    void db.saveBoards([b])
    selectBoard(b.id)
  }, [selectBoard])

  const renameBoard = useCallback((id: string, name: string) => {
    const clean = name.trim()
    if (!clean) return
    const next = latest.current.boards.map((b) => (b.id === id ? { ...b, name: clean } : b))
    setBoards(next)
    void db.saveBoards(next.filter((b) => b.id === id))
  }, [])

  /** Library delete: removes the images from every board and from disk. Board removal never calls this. */
  const deleteAssets = useCallback((assetIds: string[]) => {
    const gone = new Set(assetIds)
    if (!gone.size) return
    const onBoards = latest.current.placements.filter((p) => gone.has(p.assetId)).map((p) => p.id)
    setPlacements((ps) => ps.filter((p) => !gone.has(p.assetId)))
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
  }, [])

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
  const importBlobs = useCallback(
    async (blobs: Blob[], center: { x: number; y: number } | null) => {
      // center = null: library-only import (no board involved)
      const boardId = latest.current.activeId
      const done = await Promise.allSettled(blobs.map(importImage))
      const ok = done.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      if (ok.length < blobs.length) notify(`${blobs.length - ok.length} file(s) could not be read as images`)
      if (!ok.length) return
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
      await Promise.all(ok.map(({ asset, blob, thumb }) => db.addAsset(asset, blob, thumb)))
      if (created.length) await db.savePlacements(created)
      setAssets((a) => ({ ...a, ...Object.fromEntries(ok.map(({ asset }) => [asset.id, asset])) }))
      setUrls((u) => ({ ...u, ...Object.fromEntries(ok.map(({ asset, thumb }) => [asset.id, URL.createObjectURL(thumb)])) }))
      setPlacements((p) => [...p, ...created])
      if (created.length) setSelection(created.map((p) => p.id))
      else setLibrarySelection(ok.map(({ asset }) => asset.id))
    },
    [notify],
  )

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
      id: newId(), boardId, kind: 'note', assetId: '', text: '', tint: NOTE_TINTS[n % NOTE_TINTS.length],
      x: center.x - 120, y: center.y - 80, w: 240, h: 160, z,
    }
    setPlacements((p) => [...p, note])
    void db.savePlacements([note])
    setSelection([note.id])
    setEditingId(note.id)
  }, [])

  const editNote = useCallback((id: string, text: string) => {
    setEditingId('')
    const cur = latest.current.placements.find((p) => p.id === id)
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

  const removeFromBoard = useCallback(
    (ids: string[]) => {
      if (!ids.length) return
      setPlacements((ps) => ps.filter((p) => !ids.includes(p.id))) // the images stay in the library
      setSelection([])
      void db.deletePlacements(ids)
    },
    [],
  )

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

  const saveBoardFile = useCallback(async (asNew: boolean) => {
    try {
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
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
        Object.assign(document.createElement('a'), { href: url, download: name }).click()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
        notify(`Saved ${name} to Downloads`)
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return // picker cancelled
      notify('Could not save the board.')
    }
  }, [notify, packBoard])
  const saveBoard = useCallback(() => saveBoardFile(false), [saveBoardFile])
  const saveBoardAs = useCallback(() => saveBoardFile(true), [saveBoardFile])

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

  // ---- auto type detection (on-device CLIP, runs in a worker) ----
  const autoTag = useCallback(
    (assetIds: string[]) => {
      const todo = assetIds.filter((id) => !tried.current.has(id))
      todo.forEach((id) => tried.current.add(id))
      setTagging((n) => n + todo.length)
      void (async () => {
        for (const id of todo) {
          try {
            const blob = (await db.thumb(id)) ?? (await db.blob(id))
            if (!blob) continue
            const { types, embedding } = await analyseImage(blob)
            // Never overwrite types the user already edited while we were working.
            updateAssets([id], (a) => ({ ...a, embedding, embeddingModel: EMBEDDING_MODEL, types: a.types === undefined ? types : a.types }))
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
    const todo = Object.values(assets).filter((a) => a.embeddingModel !== EMBEDDING_MODEL).map((a) => a.id)
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

  // Text search (library only): every word must appear in the image's type, category, colour or board names.
  const boardNamesByAsset = useMemo(() => {
    const names = new Map(boards.map((b) => [b.id, b.name]))
    const out = new Map<string, string[]>()
    for (const p of placements) if (p.assetId) (out.get(p.assetId) ?? out.set(p.assetId, []).get(p.assetId)!).push(names.get(p.boardId) ?? '')
    return out
  }, [placements, boards])

  // Search by meaning: embed the query with CLIP and compare with every image's embedding.
  const [queryVec, setQueryVec] = useState<{ q: string; v: Float32Array } | null>(null)
  const [searchFailed, setSearchFailed] = useState(false)
  const searchWarned = useRef(false)
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setQueryVec(null)
      return
    }
    let stale = false
    const t = window.setTimeout(() => {
      embedText(queryToPrompt(q))
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
  }, [query, notify])

  const semantic = useMemo(
    () => (queryVec ? semanticMatches(queryVec.v, Object.values(assets).map((a) => ({ id: a.id, embedding: a.embeddingModel === EMBEDDING_MODEL ? a.embedding : undefined }))) : new Map<string, number>()),
    [queryVec, assets],
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
      ].join(' ').toLowerCase().split(/[^\p{L}\p{N}]+/u)
      // A tag-name hit (a word starting with what you typed) or a meaning hit both count.
      return words.every((w) => hay.some((h) => h.startsWith(w))) || semantic.has(a.id)
    },
    [assets, filter, query, screen, categories, boardNamesByAsset, semantic],
  )

  return {
    allPlacements: placements,
    query, setQuery, semantic, searchPending,
    screen, setScreen, librarySelection, setLibrarySelection, deleteAssets, addToBoard,
    tagging, modelProgress, editingId, setEditingId, addNote, editNote, setTint, setMode,
    ready, boards, board, activeId, assets, urls, categories, selection, filter, message,
    boardPlacements,
    setSelection, selectBoard, addBoard, renameBoard, removeBoard, setView,
    saveBoard, saveBoardAs, importBo,
    importBlobs, patchPlacements, commitPlacements, bringToFront, removeFromBoard,
    toggleTag, addCategory, removeCategory, toggleFilter, clearFilter, matches, notify,
  }
}

export type BoardApp = ReturnType<typeof useBoardApp>
