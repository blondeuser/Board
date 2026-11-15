import { isDesktop } from '../../shared/desktop'
import { pickTypes, SPACE_LABELS, TYPE_LABELS } from './labels'
import type { ImageAnalysis } from './browserClassifier'

export type { ImageAnalysis }

// Browser dev mode runs SigLIP in a Web Worker (browserClassifier.ts). The desktop build (`vite build --mode desktop`)
// folds __DESKTOP_BUILD__ to true, so this import, the worker and the WASM runtime never reach the installer.
const browser = __DESKTOP_BUILD__ ? null : () => import('./browserClassifier')

/** Percent of the one-time model download (0-100), called while the model loads (browser dev mode). */
export const setModelProgressListener = (fn: (percent: number) => void): void => {
  void browser?.().then((m) => m.setModelProgressListener(fn))
}

/** Embed a search phrase into the same space as the images (browser dev mode; the desktop app searches in Rust). */
export async function embedText(text: string): Promise<Float32Array> {
  if (!browser) throw new Error('Text embedding runs in Rust on desktop.')
  return (await browser()).embedText(text)
}

/**
 * Analyse a library image. Desktop: Rust embeds the stored file with the bundled model and keeps the vector (no image
 * bytes or embeddings cross IPC, so `blob` is not needed). Browser dev mode: the worker path on `blob`.
 */
export async function analyseAsset(id: string, blob?: Blob): Promise<ImageAnalysis> {
  if (browser && !isDesktop()) {
    if (!blob) throw new Error('No image data to analyse.')
    return (await browser()).analyseImage(blob)
  }
  const { analyzeAsset } = await import('../../backend/api')
  const r = await analyzeAsset(id, TYPE_LABELS.map((t) => t.prompt), SPACE_LABELS.map((l) => [l.prompt, l.parent]))
  return { types: pickTypes(r.scores), detail: r.detail }
}
