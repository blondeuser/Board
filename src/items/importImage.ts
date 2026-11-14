import type { Asset } from '../shared/types'
import { newId } from '../shared/id'
import { extractPalette, colorFamilies } from '../categorize/color'
import { sha256Hex } from '../storage/bo/hash'

export interface ImportedImage {
  asset: Asset
  blob: Blob
  /** Display-size copy drawn on the canvas; the original stays untouched. */
  thumb: Blob
}

const THUMB_MAX = 1280

async function thumbnailOf(blob: Blob, bitmap: ImageBitmap): Promise<Blob> {
  const scale = THUMB_MAX / Math.max(bitmap.width, bitmap.height)
  if (scale >= 1) return blob
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return (await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85))) ?? blob
}

/** For images imported before thumbnails existed. */
export async function makeThumbnail(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    return await thumbnailOf(blob, bitmap)
  } finally {
    bitmap.close()
  }
}

/** Decode an image file, extract its palette and colour tags. Throws if it is not a decodable image. */
export async function importImage(blob: Blob): Promise<ImportedImage> {
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, 64 / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bitmap, 0, 0, w, h)
    const palette = extractPalette(ctx.getImageData(0, 0, w, h))
    return {
      blob,
      thumb: await thumbnailOf(blob, bitmap),
      asset: {
        id: newId(),
        width: bitmap.width,
        height: bitmap.height,
        palette,
        colors: colorFamilies(palette),
        categoryIds: [],
        hash: await sha256Hex(new Uint8Array(await blob.arrayBuffer())),
        createdAt: Date.now(),
      },
    }
  } finally {
    bitmap.close()
  }
}

/** Pull image blobs out of a paste/drop payload: files first, then an image URL (needs CORS to succeed). */
export async function blobsFromTransfer(dt: DataTransfer): Promise<Blob[]> {
  const files = [...dt.files].filter((f) => f.type.startsWith('image/'))
  if (files.length) return files
  const url = dt.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#'))?.trim() ?? dt.getData('text/plain').trim()
  if (!/^https?:\/\//i.test(url)) return []
  const res = await fetch(url)
  const blob = await res.blob()
  return blob.type.startsWith('image/') ? [blob] : []
}
