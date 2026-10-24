# M2 test report: rig freeze (B2, 2026-10-20)

Scope: architecture §14 M2. Page `#/m2`. Tested live in the Claude built-in browser against the Vite dev server (port 5173),
with the real base made in M1 (character `98a5de5d`, idle + walk × south/east/north, from the browser's IndexedDB ledger) and
the S1 frames (`spikes/api/out/e2_anim/{idle,walk}_{south,east}_*.png`, plus the 92 px `d4walk_*` frames as a negative test).

## What was built

| Area | Files |
|---|---|
| Rig contract types (manifest-spec `Rig`), cell keys, playlists (walk 100 ms / idle 150 ms), per-cell SHA-256 of RGBA, `baseHash` = sha256 over cell hashes in (anim, dir, cell) order, `validateRig` | `app/src/lib/rig/rig.ts` |
| Normalize: canvas-center crop/pad to the cell, never rescale; reports opaque px cut by the crop (= crop failure) and semi-alpha px; binary alpha ≥ 128; opaque bbox; feet line; pivot `x = w/2`, `y` = bottom edge of the lowest opaque row | `app/src/lib/rig/normalize.ts` |
| Direction plans: 4-dir (S, E, N + W⇐E), 8-dir (5 + 3 mirrored), "all generated"; `flipH` | `app/src/lib/rig/mirror.ts` |
| Skeleton: parse `estimate-skeleton` keypoints (normalized 0–1 → px), anchors head (mean of nose/eyes/ears), neck, hand_r/l (`RIGHT/LEFT ARM`), hip (mean of hips), foot_r/l (`RIGHT/LEFT LEG`); patch tracking (integer translation ±4 px around the keypoint seed, premultiplied RGBA SAD, head patch 13×13, others 9×9) | `app/src/lib/rig/skeleton.ts` |
| Build: sources → normalized + mirrored cells, pivot from `idle/south/0`, QA (crop failure, frame-count mismatch, missing frame = errors; feet drift > 1 px, headroom < 6 px, semi-alpha, missing directions, empty cells = warnings); anchor tracks (keyframe = `idle/<dir>/0`, mirrored dirs flip the source track) | `app/src/lib/rig/freeze.ts` |
| UI: load M1 animations or import PNGs (`<anim>_<dir>_<i>.png`, or a grid sheet with anim / row dirs / cell size), dir mode, dirs × anims grid, synchronized playback column, overlays (pivot, keypoints, anchors, bbox), QA list, head-tracking table, skeletons via the queue, Freeze (IndexedDB), open frozen rigs (re-verifies hashes), debug zip | `app/src/ui/M2.svelte`, route in `App.svelte` |
| Self-tests: `rig`, `rig/normalize`, `rig/mirror`, `rig/skeleton`, `rig/freeze` (node + browser) | `app/src/lib/selftests.ts` |

Storage: `projects/rig-<baseHash[0:12]>` = `{id, savedAt, manifest (pixeldoll/1, base item with layer cells by hash, provenance from the
M1 ledger), skeletons (cell key → keypoints, mirrored cells flipped), rigQa {warnings, pivotFrom, tracks}}`. Cell PNGs go to
`blobs` keyed by the **RGBA** sha256 hex (architecture §7), not by PNG bytes. Debug zip = `rig.json` (that record + errors) +
`cells/<anim>_<dir>_<i>.png`.

## Results

| # | Test | Result |
|---|---|---|
| 1 | `npm run check`, `npm run build`, `npm run selftest`, `#/selftest` | pass (0 errors / warnings; all self-tests incl. the 5 rig modules) |
| 2 | Load M1 base from the ledger | idle (4) + walk (8) × south/east/north → 4-dir rig with west⇐east, **48 cells, all 64×64**, pivot (32, 59) from idle/south/0 |
| 3 | Skeletons for all generated M1 cells (36) via the queue at concurrency 8 | 36/36 ok, **3.6 gens** (0.1 each). One 429 in the burst, backed off and retried by the queue. Calls took ~27 s each at 8 concurrent (server queueing); at concurrency 3 median 2.9 s (1.4–24 s) |
| 4 | Skeleton cache | after reload / HMR, "load M1" reuses the `m2-skel` ledger results (0 cells to estimate, 0 requests) |
| 5 | Mirrored west | every west cell == pixel flip of the east cell (0 px differ, checked in-page); visually correct (`img/m2_3_walk_west_mirror.jpg`) |
| 6 | Pivot | one pivot for the rig; feet line per cell vs pivot: idle 0 px; walk drift **south 2, east 4, north 2, west 4 px** (stride foot lands lower) → QA warnings |
| 7 | Headroom | M1 base ≥ 6 px everywhere (no warning); S1 frames **5 px** → warnings on idle/* and walk/south |
| 8 | Head anchor tracking (M1 rig) | tracked vs keypoint anchor ≤ **1 px** in every anim/dir; tracked offset vs an independent silhouette reference (head top row + center of the top 8 rows) ≤ **1.0 px**; frame-to-frame step ≤ 1 px. Walk/south track `31,16 31,16 30,16 30,16 30,16 31,17 31,16 32,16` |
| 9 | Head anchor tracking (S1 rig, 24 cells, 2.4 gens) | vs keypoints ≤ 1 px; vs silhouette ≤ 1.0 px (south), 0.2–0.4 px (east/west); max step 1 px |
| 10 | Freeze | `rig-403de7c16482`, baseHash `sha256:403de7c16482f4a8c60cd97b3d81349ae104b7a6ed621c762251363772049ab8`; every cell PNG round-trip re-hashed before storing |
| 11 | Persistence | full page reload (memory key gone) → "open" decodes all 48 blobs, recomputes cell hashes + baseHash → "stored rig verified"; anchors and QA identical (`img/m2_4_reload_verified.jpg`) |
| 12 | Debug zip | `base-rig-debug.zip`, 49 files (rig.json + 48 PNGs, all 64×64), 184 KB; rig.json has `anchors` for all 7 ids incl. mirrored west, 48 skeletons, 7 provenance entries (v3 base + 6 animation jobs) — unzipped in-page with `lib/store/zip.ts` |
| 13 | S1 frames import (24 files, south + east) | 36 cells, pivot (32, 63), west⇐east, warning "north not available"; frozen as `rig-edcde1d20cbc` |
| 14 | Grid-sheet import | 8×2 sheet (walk south/east) + idle files → **same baseHash** as the per-file import (`edcde1d2…`) |
| 15 | Crop failure | `d4walk` 92×92 frames → 64: 16 errors ("cuts 6–37 opaque px"), headroom 0, Freeze disabled |
| 16 | Frame-count mismatch | walk south 8 / east 7 → error, Freeze disabled |
| 17 | Dir modes | 8-dir on S+E source → west⇐east only + warning listing 5 missing dirs; "all" → south, east |
| 18 | Semi-alpha | 0 semi-transparent px in all M1 and S1 frames (PixelLab output is already binary alpha) |

Screenshots: `img/m2_1_s1_import.jpg`, `img/m2_2_walk_anchors.jpg` (M1 walk with anchors), `img/m2_3_walk_west_mirror.jpg`,
`img/m2_4_reload_verified.jpg`, `img/m2_5_s1_idle_keypoints.jpg` (S1 idle with keypoints + anchors).

## Bugs found and fixed

1. **Canvas PNG encode crawls in a throttled tab**: with the browser pane hidden, `OffscreenCanvas.convertToBlob` took ~200 ms per
   64 px cell (rAF at 2 fps), so the zip of 48 cells took > 60 s. M2 now uses the pure encoder `image/pngraw.ts` (B3):
   zip in 113 ms.
2. A thrown action left the UI stuck in "busy"; all M2 actions now run through `safe()` (error → message, busy always clears),
   and the status line is shown even before a rig is built.
3. Anchor boxes were 1 cell-pixel wide and invisible at zoom 2; now a 3×3 box around the anchor pixel.

## Costs

Skeletons only: 36 × 0.1 (M1 base) + 24 × 0.1 (S1 frames) = **6.0 gens**. No other generations; the M1 base was reused.
Note: architecture §3.1/§12 say estimate-skeleton is "~0 gens"; it is **0.1 gen per call** (≈ 3.6 gens per 36-cell rig).

## Known gaps

- Slot rects (architecture §4, listed under M2 "must prove") are not drawn: they belong to `image/slots.ts` for M3; keypoints
  and anchors are stored in the rig record for it.
- Canvas-center alignment only: a larger canvas whose character is off-center fails the crop instead of being shifted to fit.
- Mirrored directions keep keypoint labels (hand_r on west = flipped east hand_r), i.e. handedness flips with the pixels (§2).
- Playlist ms are defaults, not editable in the UI. No delete for stored rigs.
- Patch-tracking SAD residuals are high on walk (65–124 per px) because templates redraw the whole body each frame; the
  translation is still right (≤ 1 px vs keypoints and silhouette), but SAD is not a usable confidence score.
- During testing a native click on the zip link happened once in the pane (a test-intercept mishap), which may have saved
  `base-rig-debug.zip` to the browser's download folder.
