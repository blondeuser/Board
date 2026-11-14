/** Cosine similarity of two unit-length vectors. */
export const similarity = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** CLIP matches the text "a photo of <query>" best when the query is a plain noun phrase, so strip fillers. */
export function queryToPrompt(query: string): string {
  const q = query.trim().toLowerCase().replace(/^(show me|find|the|a|an|some)\s+/g, '').replace(/^(the|a|an)\s+/, '')
  return `a photo of ${q || query.trim()}`
}

// Tuned for SigLIP embeddings, where cosine similarities are small (a clear match is ~0.05-0.1, a non-match ~0).
export const SEARCH_FLOOR = 0.025
export const SEARCH_WINDOW = 0.03

export interface Embedded {
  id: string
  embedding?: ArrayLike<number>
}

/**
 * Score every embedded item against the query and keep the ones that plausibly match:
 * above an absolute floor (so a query nothing matches returns nothing) and close to the best hit.
 */
export function semanticMatches(query: ArrayLike<number>, items: Embedded[], floor = SEARCH_FLOOR, window = SEARCH_WINDOW): Map<string, number> {
  const scored = items.flatMap((it) => (it.embedding ? [[it.id, similarity(query, it.embedding)] as const] : []))
  const best = Math.max(-1, ...scored.map(([, s]) => s))
  const cut = Math.max(floor, best - window)
  return new Map(scored.filter(([, s]) => s >= cut))
}
