# Whole-direction alignment — 2026-10-23

## Decision and scope

Optional local operation: character menu → Align directions → Before/Aligned → Create aligned copy. One integer vertical offset per direction, linked mirror groups, applied to every animation. No per-animation toggles: transitions and shared equipment references must use one coordinate system. The original character is the unprocessed alternative. This does not alter pose geometry or flatten stride/jump motion.

All stored layer cells (including null cells, unequipped and oversized layers), dressed references, standing views, requested/measured poses, skeletons and anchor tracks stay coherent. Dimensions, pivots, palettes, immutable shared-design snapshots and paid provenance are preserved. Base/target hashes and local QA are refreshed without upgrading stale item qualification. Managed/text future poses receive accumulated offsets once; authored poses already use local coordinates. Re-registration resets the mapping. ZIP export/import retains it.

Clipping guards inspect all artwork and rig coordinates before saving. In-flight work and stale source records block publication. Saving revalidates the reviewed offsets and writes a new identity without changing the original. No API requests are used by alignment.

## Verification

- Full unit suite: **296/296 passed**, including 22 transformation/safety cases and four actual Add move/setup orchestration cases using mocked transport. Managed and text request JSON shifts once; authored requests do not double-shift; setup clears the old mapping. No service calls.
- TypeScript/Svelte check: **0 errors, 0 warnings**. Production build and secret guard passed; Vite reports its existing large-chunk advisory.
- Offline Playwright: real UI copy/save/reload, byte-level pixel and skeleton checks, real ZIP export/read-back, linked mirror selection, 390/320 px geometry, stale-source rejection and clipping in unequipped oversized equipment. External PixelLab routes are blocked and asserted unused.
- Codex browser: imported the previously saved L04 ZIP into the keyless production preview. Compared idle/walk and desktop/390 px layouts; suggested NE +3, N +5, NW +3 px matched the prior grounding analysis. Created an aligned local copy. No new generation or enhancement requests.
- Reproduced a minor empty-selection problem before fixing: deselecting all corrections showed a red error and removed the preview. Empty selection now keeps the original preview, disables saving and shows no error; covered by the responsive browser case.

Local screenshots (outside Git): `C:/Users/shilo/.codex/visualizations/2026/10/22/01a163bf-8348-7e41-a13c-418a806554d2/live-creator-2026-10-23/alignment-preview-desktop.png` and `alignment-preview-mobile.png`.

## Review follow-up

Initial architecture/design challengers and independently authored transformation tests agreed on global animation coordinates, mirror linking, strict clipping and transparent fill. Per-animation toggles and opaque chroma padding were challenged and rejected based on the actual alpha/rig contracts. A further independent review follows the feature commit; validated findings and targeted retests are recorded below.
