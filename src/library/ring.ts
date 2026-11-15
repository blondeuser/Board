// Tag borders: an image with user tags gets a ring in each tag's colour (up to 3, innermost = first tag).
import type { Asset, Category } from '../shared/types'

/** `unit` scales the ring: 'var(--inv)' on the canvas (constant on-screen width at any zoom), '1' elsewhere. */
export function tagRing(asset: Asset | undefined, categories: Category[], unit: string): string {
  const colors = (asset?.categoryIds ?? []).flatMap((id) => categories.find((c) => c.id === id)?.color ?? []).slice(0, 3)
  return colors.map((c, i) => `0 0 0 calc(${5 * (i + 1)}px * ${unit}) ${c}`).join(', ')
}
