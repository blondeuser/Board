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

/** Bump when SPACE_LABELS or their prompts change: images analysed with an older version are analysed again. */
export const SPACES_VERSION = 1

/**
 * Finer tags for architecture and interior photos, scored only inside their own group (softmax over that group's
 * prompts) and only for images whose type includes the parent. Stored in `Asset.types` next to the main types.
 */
export const SPACE_LABELS = [
  { id: 'facade', name: 'Facade', parent: 'architecture', prompt: 'a photo of a building facade' },
  { id: 'landscape', name: 'Landscape design', parent: 'architecture', prompt: 'a landscaped garden or outdoor landscape design' },
  { id: 'courtyard', name: 'Courtyard', parent: 'architecture', prompt: 'a courtyard or plaza' },
  { id: 'rooftop', name: 'Rooftop', parent: 'architecture', prompt: 'a rooftop terrace' },
  { id: 'entrance', name: 'Entrance', parent: 'architecture', prompt: 'the entrance of a building' },
  { id: 'tower', name: 'Tower', parent: 'architecture', prompt: 'a skyscraper or tall tower' },
  { id: 'pavilion', name: 'Pavilion', parent: 'architecture', prompt: 'a small pavilion or outdoor structure' },
  { id: 'street', name: 'Street / urban', parent: 'architecture', prompt: 'a city street or urban view' },
  { id: 'pool', name: 'Pool', parent: 'architecture', prompt: 'a swimming pool' },
  { id: 'atrium', name: 'Atrium', parent: 'interior', prompt: 'a large atrium inside a building' },
  { id: 'high-ceiling', name: 'High ceiling', parent: 'interior', prompt: 'an interior with a very high ceiling' },
  { id: 'ceiling', name: 'Ceiling', parent: 'interior', prompt: 'a ceiling with lighting fixtures' },
  { id: 'reception', name: 'Reception / lobby', parent: 'interior', prompt: 'a reception desk or hotel lobby' },
  { id: 'corridor', name: 'Corridor', parent: 'interior', prompt: 'a corridor or hallway' },
  { id: 'staircase', name: 'Staircase', parent: 'interior', prompt: 'a staircase' },
  { id: 'bedroom', name: 'Bedroom', parent: 'interior', prompt: 'a bedroom' },
  { id: 'living-room', name: 'Living room', parent: 'interior', prompt: 'a living room' },
  { id: 'kitchen', name: 'Kitchen', parent: 'interior', prompt: 'a kitchen' },
  { id: 'dining', name: 'Dining room', parent: 'interior', prompt: 'a dining room' },
  { id: 'bathroom', name: 'Bathroom', parent: 'interior', prompt: 'a bathroom' },
  { id: 'office', name: 'Office', parent: 'interior', prompt: 'an office or workspace' },
  { id: 'restaurant', name: 'Restaurant / bar', parent: 'interior', prompt: 'a restaurant, cafe or bar interior' },
  { id: 'retail', name: 'Retail store', parent: 'interior', prompt: 'a retail shop interior' },
  { id: 'gallery', name: 'Gallery / museum', parent: 'interior', prompt: 'a museum or gallery space' },
] as const

/** Everything a card can be tagged with: the main types, then the finer space tags. */
export const ALL_TYPE_LABELS: readonly { id: string; name: string; prompt: string }[] = [...TYPE_LABELS, ...SPACE_LABELS]

export const typeName = (id: string): string => ALL_TYPE_LABELS.find((t) => t.id === id)?.name ?? id

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

/** Finer tags for the parents in `types`: the best-scoring ones of each parent's group (`detail` = softmax within each group). */
export function pickSpaces(types: readonly string[], detail: Scored[], min = 0.3, second = 0.3, max = 2): string[] {
  const out: string[] = []
  for (const parent of ['architecture', 'interior'] as const) {
    if (!types.includes(parent)) continue
    const group = detail
      .map((s) => ({ s, l: SPACE_LABELS.find((x) => x.prompt === s.label) }))
      .filter((x) => x.l?.parent === parent)
      .sort((a, b) => b.s.score - a.s.score)
    group.forEach(({ s, l }, i) => {
      if (i < max && s.score >= (i === 0 ? min : second)) out.push(l!.id)
    })
  }
  return out
}
