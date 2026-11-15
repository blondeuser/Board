import { isDesktop } from '../../shared/desktop'
import { pickTypes, SPACE_LABELS, TYPE_LABELS, type Scored } from './labels'

type Msg =
  | { type: 'progress'; progress: number }
  | { type: 'image'; id: string; embedding: Float32Array; scores: Scored[]; detail: Scored[] }
  | { type: 'text'; id: string; embedding: Float32Array }
  | { type: 'error'; id: string; message: string }

export interface ImageAnalysis {
  /** Type ids (photo, screenshot, ...); empty = unsure. */
  types: string[]
  /** Unit-length embedding for search by meaning. Missing on desktop: the vector stays in Rust (see analyseAsset). */
  embedding?: Float32Array
  /** Space-tag scores within each parent group; turn into tags with `pickSpaces(types, detail)`. */
  detail: Scored[]
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<string, { resolve: (m: Msg) => void; reject: (e: Error) => void }>()
let onProgress: (percent: number) => void = () => {}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./classify.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<Msg>) => {
    const m = e.data
    if (m.type === 'progress') return onProgress(m.progress)
    const p = pending.get(m.id)
    pending.delete(m.id)
    if (m.type === 'error') p?.reject(new Error(m.message))
    else p?.resolve(m)
  }
  return worker
}

function ask(payload: { kind: 'image'; blob: Blob } | { kind: 'text'; text: string }): Promise<Msg> {
  const id = String(++seq)
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ ...payload, id })
  })
}

/** Percent of the one-time model download (0-100), called while the model loads. */
export const setModelProgressListener = (fn: (percent: number) => void) => (onProgress = fn)

/** Analyse an image on-device (CLIP in a worker): its type tags and its search embedding. */
export async function analyseImage(blob: Blob): Promise<ImageAnalysis> {
  const m = await ask({ kind: 'image', blob })
  if (m.type !== 'image') throw new Error('unexpected reply')
  return { types: pickTypes(m.scores), embedding: m.embedding, detail: m.detail }
}

/** Embed a search phrase into the same space as the images. */
export async function embedText(text: string): Promise<Float32Array> {
  const m = await ask({ kind: 'text', text })
  if (m.type !== 'text') throw new Error('unexpected reply')
  return m.embedding
}

/**
 * Analyse a library image. Desktop: Rust embeds the stored file with the bundled model and keeps the vector (no image
 * bytes or embeddings cross IPC). Browser dev mode: the old worker path on `blob`.
 */
export async function analyseAsset(id: string, blob: Blob): Promise<ImageAnalysis> {
  if (!isDesktop()) return analyseImage(blob)
  const { analyzeAsset } = await import('../../backend/api')
  const r = await analyzeAsset(id, TYPE_LABELS.map((t) => t.prompt), SPACE_LABELS.map((l) => [l.prompt, l.parent]))
  return { types: pickTypes(r.scores), detail: r.detail }
}
