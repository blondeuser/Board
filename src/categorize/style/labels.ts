/** Fixed vocabulary for "what kind of image is this". Each prompt is a full sentence for CLIP zero-shot matching. */
export const TYPE_LABELS = [
  { id: 'photo', name: 'Photo', prompt: 'a photograph' },
  { id: 'illustration', name: 'Illustration', prompt: 'a digital illustration' },
  { id: 'painting', name: 'Painting', prompt: 'a painting or artwork' },
  { id: '3d', name: '3D render', prompt: 'a 3D render' },
  { id: 'screenshot', name: 'Screenshot', prompt: 'a screenshot of a website or app' },
  { id: 'ui', name: 'UI design', prompt: 'a user interface design mockup' },
  { id: 'poster', name: 'Poster', prompt: 'a graphic design poster' },
  { id: 'typography', name: 'Typography', prompt: 'typography, text and lettering' },
  { id: 'logo', name: 'Logo', prompt: 'a logo or brand mark' },
  { id: 'icon', name: 'Icon', prompt: 'a simple icon or pictogram' },
  { id: 'pattern', name: 'Pattern', prompt: 'a pattern or texture' },
  { id: 'architecture', name: 'Architecture', prompt: 'a photo of a building or architecture' },
  { id: 'interior', name: 'Interior', prompt: 'a photo of an interior room' },
  { id: 'fashion', name: 'Fashion', prompt: 'a fashion photo of clothing' },
  { id: 'product', name: 'Product', prompt: 'a product photo' },
  { id: 'food', name: 'Food', prompt: 'a photo of food' },
  { id: 'nature', name: 'Nature', prompt: 'a nature or landscape photo' },
  { id: 'portrait', name: 'Portrait', prompt: 'a portrait of a person' },
  { id: 'diagram', name: 'Diagram', prompt: 'a diagram, chart or infographic' },
  { id: 'comic', name: 'Comic', prompt: 'a comic or anime drawing' },
] as const

export type TypeId = (typeof TYPE_LABELS)[number]['id']

export const typeName = (id: string): string => TYPE_LABELS.find((t) => t.id === id)?.name ?? id

export interface Scored {
  label: string // a prompt from TYPE_LABELS
  score: number // softmax probability
}

/** Keep the best label if it is clearly ahead, plus a close runner-up. Returns type ids; empty = unsure. */
export function pickTypes(scores: Scored[], min = 0.25, second = 0.3, max = 2): string[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score)
  const out: string[] = []
  for (const s of sorted) {
    const id = TYPE_LABELS.find((t) => t.prompt === s.label)?.id
    if (!id || out.length >= max) continue
    if (out.length === 0 ? s.score >= min : s.score >= second) out.push(id)
    else break
  }
  return out
}
