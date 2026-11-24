# R2: Item pipeline audit

Read-only audit of the per-item layer pipeline: `app/src/lib/items/items.ts`, `app/src/lib/items/run.ts`, `app/src/lib/image/chroma.ts`, `app/src/lib/items/slots.ts`, `app/src/lib/pixellab/queue.ts`, `app/src/lib/rig/clips.ts`, `app/src/lib/pixellab/routes.ts`. No paid calls, tests, builds or edits. Numbers marked **V** (verified in code), **D** (derived arithmetic) or **H** (needs a paid test).

## 1. Scope and method

Read targeted ranges only (not whole files): the exported API surface of `items.ts` (grep, 80+ exports), `planItem` 631-673, `frozenGrid` 677-690, `posePlan` 705-740, `anchorChunks`/`editGens`/`planGens` 742-804, `itemSheet*` 875-935 and 995-1049, `padOf`/`heldSkel` 425-459, `gridFits`/`gridEstimate`/`meanSideGens` 180-259, `planCalls`/`planAnchoredMove` 1147-1199, `extractCell` 2061-2169, `GATES` 2372-2387, `itemQa` 2534-2702, `run.ts` `callRequest` 683-784 and `runItem` 951-1157, `chroma.ts` 1-70, `clips.ts` 219-240, `routes.ts` 250. Not read: `evaluateQa` 2618-2900 (clip gates), `queue.ts` scheduling details, the OpenAPI canvas-cap contract for `edit-images-v2` / `animate-with-skeleton-v3`.

## 2. Call graph and generation counts (per item)

**Route selection.** `planItem` splits on `spec.method` and `key`: non-skel or diff route → `planCalls` edit bins (`items.ts:652-657`); skel → dress calls then pose calls (`items.ts:663-672`). A pose call is reclassified `grid` when imported joints are suspicious and a packed grid fits (`items.ts:677-690`).

- **Dress:** `anchorChunks(restKey per requested direction, cap)` with `cap = editFrameCap(max(cell)+2*pad)` (`items.ts:659-667`); first call takes `cap` (or `cap-1` with a reference), later calls `cap-1` cells **plus cell 0 of call 1 as anchor** (`items.ts:742-751`, `run.ts:741-751`). Price `editGens` by longest side: ≤128 → 10, ≤170 → 15, else 25 gens (`items.ts:757-760`). V
- **Pose:** one call per clip-direction; `idle`+`walk` share a call if ≤15 frames (`items.ts:727-733`); otherwise `poseBatches` splits balanced batches ≤15 (`clips.ts:220-231`). Price `poseCallGens`: ≤3 frames 2, ≤12 → 3, 15 → 4 gens (`clips.ts:233`), **independent of canvas size**. V
- **Anchor (new move on an existing item):** `planAnchoredMove` → `planCalls(..., reserveAnchor=true)` → one edit call per direction-bin with the saved dressed standing frame as reference (`items.ts:1178-1199`). 10/15/25 gens per call. V
- **Grid fallback:** one `inpaint-v3` call per clip-direction over a packed `GRID_COLS=4` canvas `4·w × ceil((cells+refs)/4)·h`, 32-512 px (`items.ts:183-192`, `210-225`); price `meanSideGens` on the **mean** of the sides: ≤256 → 10, ≤336 → 15, else 25 (`items.ts:229-232`). V
- **Sheet (item-on-move):** one `edit-images-v2` call, `cols = frames+1`, `rows = views`, side ≤ 512 (`items.ts:879-908`), price `meanSideGens(w,h)` (`items.ts:907`). V

**Sequencing.** `runItem` awaits design call 0, validates every returned frame's size (`run.ts:1081-1088`), starts the other dress chunks in parallel, then poses, and **may start poses as soon as one dress chunk passes QA** (`run.ts:1027-1043`). A malformed design call buys nothing later and a re-roll drops all later calls (`run.ts:1120-1136`, `1079-1080`).

**Concrete counts, 64 px rig cell, 4 directions, idle(4)+walk(8), 2 items** — D:
dress 1 call ×10 = 10; idle 4 dirs ×3 = 12; walk 4 dirs ×3 = 12; total **34 gens/item**, 69 for two items. At 8 directions: 10 + 24 + 24 = 58 gens. Held item (pad 16 → 96 px canvas, `padOf` `items.ts:432-438`): dress cap drops to 4 (`routes.ts:250`), so 8 rest views cost `4 + ceil(4/3) = 3` calls ×10 = **30 gens** vs 10 unpadded — the B16 cliff (`items.ts:658`).

## 3. Size chain: body → cell → pad → atlas → 256

1. **Body frame** `rig.cell` (square, app-chosen; 48→64 is the reference rig, `items.ts:2664`).
2. **Item cell** = `rig.cell + 2·pad`, pad = 0 except held-skel: `min(16, floor((256 − max(cell))/2))` (`items.ts:432-438`). At 64 → 96; at 128 → still 160 (cap 16) but clamped to 256.
3. **Layer canvas** = item cell, never resampled (`padImg` `items.ts:440-444`); keypoints renormalized to it (`padKeypoints` 447-459).
4. **Atlas** = the sheet layout only: `(frames+1)·cell.w × views·cell.h`, side ≤ 512 (`items.ts:901-907`). The grid atlas is separate: `4·cell.w` ≤ 512.
5. **Export cap** 256 px per layer (`BRIEF.md:30`, `docs/known-issues.md`). So a 128 cell leaves 128 px of pad headroom, and 256 is the hard ceiling for any cell.

Consequence (D): the only sanctioned canvas increase that does not change export is 64→128; anything above 128 saturates the 256 cap once pad is added.

## 4. Ranked mechanisms of inconsistency and inaccuracy

1. **Every call returns its own result; the design is carried only by text plus one anchor frame.** Later dress chunks and every pose/grid call see a single dressed cell 0 (`run.ts:741-751`, `items.ts:776`), not a palette, silhouette or scale constraint. n calls give n cells whose trim, thickness and hue can differ. Measured: 6-94 px of shape and ~70 % of exact colors differ between duplicate submissions (x31:85). **V**
2. **The frame cap collapse at 81 px multiplies the number of separately returned results.** `editFrameCap` = 16 (≤64), 9 (≤80), 4 (else) (`routes.ts:250`): one 8-view dress call at 64 px becomes 3 calls at 96/128 px. Same design, 3× the cells that can differ and 3× the gens. **V**
3. **Skeleton-v3 posing is not exact, and the repair is a ±1 px global shift.** `bestShift` re-registers posed frames, and residual shift fails G10 and forces a re-roll (`items.ts:2079-2084`, `2643`). At 64 px a 1 px error is 1.56% of the frame; at 128 it is 0.78% — resolution directly buys relative alignment accuracy. **V/D**
4. **Extraction is chroma residual, so changed body pixels become item pixels.** Item = non-key opaque px (`chroma.ts:1-2`), and G2 tolerates `keyKept ≥ 0.97` with up to 8 lost px (`items.ts:2373-2375`, `2386-2387`) **per call**. A 3 % body-pixel change is accepted per frame, so the visible seam differs frame to frame; `keyOutside` 0.02-0.05 (`2376-2377`) bounds leakage only coarsely. **V**
5. **Size starvation at 64 px.** Accessories, straps and blades are a handful of px; the 2 px speck/pinhole counters and the 4 px floor (`items.ts:1296-1297`, `2105-2106`) delete or merge thin parts, and G7 border contact fires whenever the item reaches the frame edge (`2677-2678`) — which the held pad exists to avoid. **V**
6. **The sheet route, the only tool that returns all views in one image, is locked out of exactly the moves that need it.** `cols·cell ≤ 512` means at 80 px ≤5 frames (5×80=400) and at 128 px ≤3 frames (4×128=512). An 8-frame walk at 4 views would need 9×80 = 720 px wide (>512) or 9×128 = 1152 (>512): **impossible today**, rejected at `items.ts:905`. **V/D**
7. **QA is per call, not across calls.** Clips are summarized independently (`items.ts:2560-2585`), gates are `areaCV 0.15`, `paletteDist 15`, `heldIoU 0.3` (`2378-2382`); design-vs-call drift within those bands passes, and clip warnings never authorize a retry (`2586`). **V**
8. **Pricing can under-quote the real grid canvas.** `planGens` defaults `gridCell = {64,64}` (`items.ts:763-765`); any caller that omits the cell prices a 96/128 cell grid at the 64-cell band (10 instead of 15/25 gens). **V — confirm callers before treating as a defect.**

## 5. Where a bigger canvas or atlas changes cost/quality (arithmetic)

**Dress, 8 views, per item (D from `items.ts:757-760` + `routes.ts:250`):**

| cell | canvas (pad)   | cap | calls | gens | px/gen    |
| ---- | -------------- | --- | ----- | ---- | --------- |
| 64   | 64             | 16  | 1     | 10   | 410       |
| 80   | 80             | 9   | 1     | 10   | 640       |
| 96   | 96/128 held    | 4   | 3     | 30   | 307 / 546 |
| 128  | 128            | 4   | 3     | 30   | 546       |
| 160  | 160            | 4   | 3     | 45   | 569       |
| 192  | 192 → 224 held | 4   | 3     | 75   | 492       |

128 px is the dress sweet spot: same 30 gens as 96 with 1.78× the pixels. 96 px is strictly dominated (3× the gens of 80 for 1.44× the pixels) and should not be a target. **D**

**Pose is free in gens up to 15 frames (`clips.ts:233`)** — a 128 px pose canvas costs the same 3 gens as 64 px (H: only if `animate-with-skeleton-v3` accepts ≥128 px frames; verify in `pixellab-openapi-v2.json`). That makes "dress at 64, pose at 128" the single best cost-free resolution lever. **D/H**

**Grid (8 frames + 1 ref, 4 cols) — `items.ts:229-232`:** 64 → 256×192 mean 224 → **10**; 96 → 384×288 mean 336 → **15** (exactly on the band edge); 128 → 512×384 mean 448 → **25**, and 128 is the last cell that fits 512 at all (4×128 = 512); with any pad the grid route disappears (`gridFits` `items.ts:191`). So grid resolution is hard-capped at 128 and costs 2.5× at the cap. **D**

**Atlas:** extending `ITEM_SHEET.side` 512 → 1024 would admit an 8-frame, 4-view sheet at 80 px = 720×320 (mean 520 → 25 gens) — **the same 25 gens the 3-frame 128 px sheet costs today**. Longer moves therefore become sheet-able at zero marginal gens, only a quality/size risk. At 96 px: 9×96 = 864×384, mean 624 → 25 gens, still one call. **D/H**

## 6. Candidate pipeline variants (testable)

| #   | Variant                                                                         | Mechanism                                                                           | Effect                     | Cost delta                                   | Test                                                   |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| V1  | **128 px dress cell for non-held items**                                        | 1.78× linear detail, cap-4 cost same as 96; halves relative 1 px registration error | quality, accuracy          | 10 → 30 gens/item (D)                        | 6 items × 4 dirs at 64 vs 128; score G2/G7/seam px     |
| V2  | **Pose at 128 px on a 64 px dress**                                             | pose gens are size-blind; only the keyframe is upscaled                             | accuracy, consistency free | 0                                            | same rig, 2 moves, 4 dirs, A/B seam and G10            |
| V3  | **Atlas 1024 for 6-8 frame moves**                                              | sheet returns all design and frame cells in one image                               | consistency                | 25 gens/move (same as today's 3-frame sheet) | walk 8f × 4 views at 80 and 96; check swap/face errors |
| V4  | **Per-direction dress call at 128** (cap 4, 1 call/dir)                         | removes cross-direction drift inside a call; each direction gets its own anchor     | consistency                | 4 dirs ×10 = 40 vs 30 (D)                    | 2 items, 4 dirs, compare palette distance across dirs  |
| V5  | **Grid at 96 for action clips** instead of 2 pose batches                       | one inpaint result, no skeleton-posing error                                        | consistency, accuracy      | 15 vs 6-8 gens                               | slash/cast, 6 frames, 4 dirs                           |
| V6  | **Two-anchor design lock** (pass front+back dressed frames to every later call) | text+1 frame → 2 real views                                                         | consistency                | 0 gens, +1 input frame (cap −1)              | 4-view item, measure G6 max palette distance           |
| V7  | **Raise `editFrameCap` policy at 96/128 by splitting per direction only**       | 3 calls → 4-8 calls, worse: reject                                                  | —                          | +10-50                                       | negative control, do not run unless V1 shows seams     |

## 7. What must not change

- **Chroma keys, their order and the mannequin ramp** (`chroma.ts:5-12`): chosen by about 1,650 paid gens; `docs/research/2026-11-09-paperdoll-video-review/chroma-key.md`.
- **The 512 px grid/sheet caps and `editGens`/`meanSideGens` bands** are usage-calibrated; a variant must re-measure, not re-derive (`items.ts:193-198`, `226-232`).
- **The 97% key-kept floor and 8 px loss allowance** (`items.ts:2373-2375`): lowering them admits changed body pixels as item.
- **The 256 px layer export cap** and 256 body-cut combinations (`BRIEF.md:30`).
- **Sheet eligibility rules** (80-128 px, cardinal views only, no diagonals; `items.ts:887-898`): only that combination was tested.

## 8. Open questions

1. Does `animate-with-skeleton-v3` accept a 128-256 px frame? If yes, V2 is free quality. (Check `pixellab-openapi-v2.json`.)
2. Does `edit-images-v2` accept a 1024 px side? V3 depends on it.
3. Do any `planGens` callers omit `gridCell`, and if so do users see 10 gens for a 15/25-gen grid? (`items.ts:763`)
4. Can the per-frame seam be measured as a first-class gate (body-frame delta at the layer boundary) instead of G2/G3 proxies?
5. At 128 px, does the 4 px floor and 2 px speck rule need rescaling? They are absolute pixel constants (`items.ts:1296-1297`).
6. Is `poseEarly` (`run.ts:1027-1043`) measurably worse than "evaluate all dress chunks first" for multi-chunk (held) items?
