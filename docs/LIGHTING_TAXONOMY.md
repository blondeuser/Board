# Lighting techniques — label set, prompts, eval

Background research and the first five techniques are in `MEMORY.md` ("Lighting techniques"). This file holds the working
label list, the zero-shot prompts and how labels are evaluated. **The final list is my decision**; aim for ~10-14 labels that
look visibly different in a photo.

## Candidate labels

`core` = the five from the research notes. Others are candidates to keep, merge or drop.

| id | Name | Set | Looks like in a photo | Zero-shot prompts (3-6 per label, averaged) |
|---|---|---|---|---|
| grazing | Grazing | core | Steep streaky light close to the wall, brightest at top; texture exaggerated | "a textured stone wall lit by grazing light", "light grazing down a brick wall showing texture", "strong raking light on a rough plaster wall" |
| wall_washing | Wall washing | core | Even soft light across a whole wall, few shadows | "a wall evenly washed with light", "uniform wall wash lighting in an interior", "a smoothly lit wall with no hotspots" |
| scallop | Scalloping | core | Repeating arcs of light and dark along a wall | "scallop light patterns on a wall from downlights", "repeating arcs of light on a wall" |
| accent | Spotlight / accent | core | Bright pool with a clear edge on one object, dark surround | "a spotlight on an artwork in a dark room", "accent lighting on a sculpture", "a bright pool of light on a table" |
| decorative | Decorative | core | The fixture itself is the feature | "decorative pendant lights over a table", "a chandelier in a lobby", "a sculptural light fixture" |
| cove_indirect | Cove / indirect | candidate | Hidden source, glow off a ceiling or recess | "indirect cove lighting glowing on a ceiling", "hidden LED strip in a ceiling recess" |
| linear | Linear / strip | candidate | Visible lines of light: slots, profiles, handrails, shelves | "linear LED light lines in a ceiling", "an illuminated handrail", "lit shelves with LED strips" |
| uplight | Uplight | candidate | Light from below up columns, trees, facades | "columns uplit at night", "a tree uplit from the ground" |
| backlit | Backlit | candidate | Glowing panel or object lit from behind | "a backlit translucent onyx wall", "a backlit glowing panel" |
| halo_edge | Halo / edge glow | candidate | Glow around the edge of a floating object, mirror, sign | "a halo backlight around a mirror", "a floating ceiling with edge glow" |
| facade | Facade / flood | candidate | Exterior building lit at night | "a building facade lit at night", "architectural floodlighting of a facade" |
| step_floor | Step / floor wash | candidate | Low-level light on stairs, paths, floors | "stair step lights", "low path lights washing the floor" |
| daylight | Daylight | candidate | Sun shafts, skylights, clerestory | "sunlight through a skylight", "daylight shafts in an atrium" |
| pattern | Pattern / gobo | candidate | Projected patterns, perforated-screen shadows | "patterned shadows from a perforated screen", "a gobo light pattern on a floor" |
| coloured | Coloured / RGB | candidate | Saturated coloured light | "colored RGB architectural lighting", "purple and blue accent lighting" |

Expected difficulty (before measuring): decorative, facade, daylight, coloured — likely easy. Accent, scallop, cove, linear — medium.
**Grazing vs wall washing — likely hard** (subtle; may need the brightness-gradient feature or a merged "wall light" label).

## Scoring

- Multi-label: each label scored on its own with SigLIP's sigmoid (`sigmoid(logit_scale · cos + logit_bias)`, values from the model),
  **not** softmax across labels. Per-label threshold tuned on the eval set.
- Prompt ensemble: embed every prompt of a label, average, re-normalise → one text vector per label.
- Extra features for the probe stage (cheap, from the 64px or thumbnail image): vertical brightness gradient on wall regions,
  evenness (std/mean of luminance in bright areas), bright-region edge sharpness/contrast, count of small very bright blobs (visible sources).

## Eval

- Data: `data/lighting-eval/<label>/` — 30-50 photos per label from my references; an image may sit in several folders (multi-label).
  Large image sets stay out of git (add to `.gitignore`); keep a `labels.csv` (file, labels) in the repo.
- `scripts/eval-lighting.mjs`: per label precision / recall / F1 at the tuned threshold, plus the top confused pairs.
- Stages: (1) zero-shot → (2) logistic-regression probe on stored SigLIP embeddings (+ features), 5-fold cross-validation.
- Ship rule: a label is shown to users only with precision ≥ ~0.8 on the eval set; weaker labels are merged or kept hidden.
- User corrections in the app (confirm / reject / add) are stored as `source: "user"`, always win over the model, and become new training rows.
