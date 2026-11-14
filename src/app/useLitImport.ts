import { useCallback, useRef, useState } from 'react'
import type { BoardApp } from './useBoardApp'
import { LitError, loadPhoto, loadProject, loadWinners, mapLimit } from '../sources/lit/client'
import type { LitIndex } from '../sources/lit/parse'
import { litSource } from '../sources/lit/source'

/** Photos per project: 0 = all of them. */
export type PerProject = 0 | 1 | 3 | 6

export interface LitProgress {
  done: number
  total: number
  current: string
  imported: number
  /** Photos already in the library (same image URL), not downloaded again. */
  skipped: number
  failed: number
}

type Phase = 'closed' | 'loading' | 'ready' | 'running' | 'done' | 'error'

const PHOTO_CONCURRENCY = 3
const PAUSE_MS = 150 // between projects: be gentle with the LIT server

const loadPicked = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem('board.lit.categories') ?? '[]') as string[]
  } catch {
    return []
  }
}

/**
 * "File > Import from LIT Awards…": pick an edition and award categories, then download each winning project's
 * photos into the library with their credits (`Asset.source`). The normal pipeline then tags colour, type and
 * search embeddings. Lives in App (not the dialog) so an import keeps running when the dialog is hidden.
 */
export function useLitImport(app: BoardApp) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [visible, setVisible] = useState(false)
  const [index, setIndex] = useState<LitIndex | null>(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<string[]>(loadPicked)
  const [perProject, setPerProject] = useState<PerProject>(3)
  const [makeBoard, setMakeBoard] = useState(true)
  const [progress, setProgress] = useState<LitProgress>({ done: 0, total: 0, current: '', imported: 0, skipped: 0, failed: 0 })
  const abort = useRef<AbortController | null>(null)
  const live = useRef(app)
  live.current = app

  const load = useCallback(async (edition?: string) => {
    setPhase('loading')
    setError('')
    try {
      setIndex(await loadWinners(edition))
      setPhase('ready')
    } catch (e) {
      setError(e instanceof LitError ? e.message : 'Could not load the LIT winners page.')
      setPhase('error')
    }
  }, [])

  const open = useCallback(() => {
    setVisible(true)
    if (phase === 'running') return // re-show the running import
    if (index && phase !== 'error') setPhase('ready')
    else void load()
  }, [phase, index, load])

  const close = useCallback(() => {
    setVisible(false)
    if (phase !== 'running') setPhase('closed')
  }, [phase])

  const setCategories = useCallback((list: string[]) => {
    setPicked(list)
    try {
      localStorage.setItem('board.lit.categories', JSON.stringify(list))
    } catch {
      /* not remembered */
    }
  }, [])

  const chosen = index ? index.entries.filter((e) => e.categories.some((c) => picked.includes(c))) : []

  const start = useCallback(async () => {
    if (!index) return
    const entries = index.entries.filter((e) => e.categories.some((c) => picked.includes(c)))
    if (!entries.length) return
    const edition = index.editions.find((e) => e.value === index.edition)
    const ctrl = new AbortController()
    abort.current = ctrl
    setPhase('running')
    const p: LitProgress = { done: 0, total: entries.length, current: '', imported: 0, skipped: 0, failed: 0 }
    setProgress({ ...p })

    // Photos already in the library, by image URL: never downloaded twice, but still go on the new board.
    const known = new Map<string, string>()
    for (const a of Object.values(live.current.assets)) if (a.source?.imageUrl) known.set(a.source.imageUrl, a.id)
    const forBoard: string[] = []

    for (const entry of entries) {
      if (ctrl.signal.aborted) break
      p.current = entry.project
      setProgress({ ...p })
      try {
        const project = await loadProject(entry, ctrl.signal)
        const urls = perProject ? project.images.slice(0, perProject) : project.images
        const fresh = urls.filter((u) => !known.has(u))
        urls.forEach((u) => known.has(u) && forBoard.push(known.get(u)!))
        p.skipped += urls.length - fresh.length
        const photos = await mapLimit(fresh, PHOTO_CONCURRENCY, async (url) => {
          try {
            return { url, blob: await loadPhoto(url, ctrl.signal) }
          } catch (e) {
            if (ctrl.signal.aborted) throw e
            return null
          }
        })
        const got = photos.filter((x): x is { url: string; blob: Blob } => x !== null)
        const ids = await live.current.importBlobs(
          got.map((x) => x.blob),
          null,
          { quiet: true, sources: got.map((x) => litSource(edition, entry, project, x.url)) },
        )
        // Missing ids = photos that failed to download or decode. (Entries are unique projects, so a URL never repeats within a run.)
        p.imported += ids.length
        p.failed += fresh.length - ids.length
        forBoard.push(...ids)
      } catch {
        if (ctrl.signal.aborted) break
        p.failed += 1
      }
      p.done += 1
      setProgress({ ...p })
      await new Promise((r) => setTimeout(r, PAUSE_MS))
    }

    if (makeBoard && forBoard.length) {
      const cats = index.categories.filter((c) => picked.includes(c))
      const name = `${edition?.label ?? 'LIT Awards'} · ${cats.length === 1 ? cats[0] : `${cats.length} categories`}`
      live.current.addToBoard([...new Set(forBoard)], live.current.createBoard(name))
    }
    p.current = ''
    setProgress({ ...p })
    abort.current = null
    setPhase('done')
    if (!ctrl.signal.aborted) live.current.notify(`LIT import finished: ${p.imported} new photo${p.imported === 1 ? '' : 's'}`)
  }, [index, picked, perProject, makeBoard])

  const stop = useCallback(() => abort.current?.abort(), [])

  return {
    phase, visible, index, error, picked, perProject, makeBoard, progress, chosen,
    open, close, load, start, stop, setCategories, setPerProject, setMakeBoard,
  }
}

export type LitImport = ReturnType<typeof useLitImport>
