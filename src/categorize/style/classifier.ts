import { pickTypes, type Scored } from './labels'

type Msg =
  | { type: 'progress'; progress: number }
  | { type: 'image'; id: string; embedding: Float32Array; scores: Scored[] }
  | { type: 'text'; id: string; embedding: Float32Array }
  | { type: 'error'; id: string; message: string }

export interface ImageAnalysis {
  /** Type ids (photo, screenshot, ...); empty = unsure. */
  types: string[]
  /** Unit-length CLIP embedding, used for search by meaning. */
  embedding: Float32Array
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
  return { types: pickTypes(m.scores), embedding: m.embedding }
}

/** Embed a search phrase into the same space as the images. */
export async function embedText(text: string): Promise<Float32Array> {
  const m = await ask({ kind: 'text', text })
  if (m.type !== 'text') throw new Error('unexpected reply')
  return m.embedding
}
