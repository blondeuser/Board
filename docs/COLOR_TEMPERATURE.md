# Colour temperature (apparent CCT) — plan

Status: **planned 2026-11-15, not built.** Desktop only (Rust, `src-tauri/src/analyze/`); the browser dev mode does not get it.
Replaces the planned warm / neutral / cool hint (`MEMORY.md` Colour).

## What it is

Each image gets an **apparent CCT**: how warm or cool the light *looks* in the photo, snapped to a landmark Kelvin value
and shown as "≈ 3000K (from photo)". It is an estimate from pixels, which carry camera white balance and grading, not a
measurement of the real fittings. I can always correct it.

## Landmarks and bin edges

Edges are midpoints in **mired** (1,000,000 / K), because equal Kelvin steps don't look equal (2700→3000 is a much bigger
visible jump than 5000→5300). Estimates **below 2200K or above 6000K go to Mixed** (decided 2026-11-15), so the end bins
only hold values near their landmark.

| Landmark | Range | Mired |
|---|---|---|
| 2200K | 2200 – 2424K | 412.5 – 454.5 |
| 2700K | 2424 – 2842K | 351.9 – 412.5 |
| 3000K | 2842 – 3231K | 309.5 – 351.9 |
| 3500K | 3231 – 3733K | 267.9 – 309.5 |
| 4000K | 3733 – 4444K | 225 – 267.9 |
| 5000K | 4444 – 5455K | 183.3 – 225 |
| 6000K | 5455 – 6000K | 166.7 – 183.3 |
| → Mixed | < 2200K (candle, amber) or > 6000K (overcast, blue hour, sky) | > 454.5 or < 166.7 |

Extra states:
- **Mixed:** the bright pixels form two clusters far apart (e.g. 2700K interior + blue-hour sky). The image keeps **one main
  landmark** (the cluster with more light) plus a `mixed` flag, and appears in the Library's "Mixed" section. The second
  cluster's estimate is stored but not used as a landmark tag. (Decided 2026-11-15.)
  Also Mixed: a single-cluster estimate outside 2200-6000K. It gets no landmark (`landmark: null`), keeps its `kelvin`,
  and the inspector shows e.g. "≈ 1900K (outside landmarks)". (Decided 2026-11-15.)
- **Coloured:** |Duv| above a threshold (RGB, green, magenta light). No landmark.
- **Unknown:** too few usable pixels or low confidence. No landmark.

## Estimation (pure function, image in → result out)

1. Input: the 1280px display copy already decoded for the palette (no extra decode).
2. Keep "light" pixels: high luminance (top ~10-20% of the image), low-to-moderate chroma; drop clipped pixels (any channel
   ≥ ~250) and very dark ones.
3. Linearise sRGB → XYZ (D65) → CIE 1960 uv / xy. Average chromaticity weighted by luminance.
4. CCT by Robertson's method (or Ohno 2013) on the uv point; Duv = signed distance from the Planckian locus.
   McCamy's formula only as a test cross-check (inaccurate far from 3000-6500K).
5. Mixed check: 2-means on the kept pixels' uv; if the two centres are more than ~a set mired gap apart and the smaller
   holds a meaningful share of light, flag `mixed`.
6. Confidence from pixel count, spread of the kept chromaticities and |Duv|.

All thresholds (luminance cut, chroma cut, Duv limit, mixed gap/share, minimum confidence) are constants in one place and
tuned on the eval set.

## Stored data (per asset)

```
cct: {
  kelvin: number,          // estimate of the main cluster
  duv: number,
  confidence: number,      // 0..1
  landmark: 2200|2700|3000|3500|4000|5000|6000|null,
  state: "ok"|"mixed"|"coloured"|"unknown",
  second_kelvin?: number,  // only when mixed
  source: "auto"|"user",
  algo: number             // CCT_ALGO_VERSION
}
```

- New numbered SQL migration (columns on the asset row or a small `asset_cct` table; decide when coding against
  `docs/SQLITE_SCHEMA.md`). Old libraries get `NULL` and are backfilled by the analysis queue.
- `source: "user"` always wins and is never recomputed. Bumping `CCT_ALGO_VERSION` recomputes `auto` rows only.
- `.bo`: include `cct` in the asset entry (optional field; bump `formatVersion` only if `docs/BO_FORMAT.md` needs it).

## UI

- Library: new **Temperature** tab. Sections in landmark order 2200 → 6000, then Mixed, Coloured, Unknown. Each section
  header has a small swatch: the landmark's white converted K → sRGB.
- Sort by K (continuous) inside a section or in the All view.
- Search: tags "2200K"…"6000K", "mixed"; words "warm" (≤ 3000K, incl. Mixed below 2200K), "neutral" (3500-4000K), "cool" (≥ 5000K, incl. Mixed above 6000K) match too.
- Inspector: "≈ 3000K (from photo)", a dropdown of landmarks + Mixed/Coloured/Unknown to correct it; a corrected value
  shows "(set by you)".

## Eval

- Hand-label ~100 photos into landmarks (incl. some mixed and coloured) → `data/cct-eval/labels.csv`.
- Report: exact-bin accuracy, within-one-bin accuracy, mixed/coloured precision. Target before shipping: within-one-bin
  ≥ ~0.85.
- LIT entry texts that name a CCT ("3000K") are a weak hint only, never ground truth.
- Unit tests in Rust: synthetic images filled with known blackbody whites (2200-6500K) → correct landmark; clipped-white
  image → unknown; half 2700K / half 6000K → mixed with main = larger half; 1800K and 8000K fills → mixed, no landmark; saturated RGB → coloured.

## Build steps (after go-ahead)

1. `analyze/cct.rs`: conversion + Robertson + Duv + mixed check, with unit tests.
2. Migration + storage of `cct`; run it in the import/analysis pipeline after the palette; backfill queue.
3. IPC: return `cct` with assets; command to set a user value.
4. UI: Temperature tab, swatches, sort, search words, inspector dropdown.
5. Eval script + threshold tuning; record results in `MEMORY.md`.
6. Version bump (minor) in the three places; release build.
