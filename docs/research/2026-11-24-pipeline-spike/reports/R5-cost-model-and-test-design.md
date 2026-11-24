# R5: Cost model, quality model, and the 1,000-generation test design

Research sub-agent report for the 2026-11-24 pipeline spike. No paid calls, no tests, no app edits.
Evidence tags: **verified** (code/contract/usage record), **derived** (arithmetic from verified inputs), **hypothesis** (needs a paid test).

## 0. Scope and method

Read: `app/src/lib/items/items.ts` (planItem 631-673, planGens 763-777, gridEstimate 210-232, padOf 432-438, itemRoute 119-178, itemSheetLayout 901-908, canSheet 892-898, paletteDistance 2423-2438, alignedIoU 2476-2490, GATES 2372-2383, itemQa 2534-3204), `app/src/lib/pixellab/routes.ts` (editFrameCap 249-250, EDIT_MIN_FRAMES 38, payload types 201-258), `app/src/lib/rig/clips.ts` (poseCallGens 232-236), `app/src/studio/costEstimate.ts` (DEFAULT_RETRIES 120, attempts 784-788, usdOf 830-831), `app/src/studio/movePricing.ts` (EST 24, estimate 44-64, moveEstimate 187-226), `app/src/lib/pixellab/plans.ts` (PLAN_PRICES 16-19), `docs/research/2026-11-16-generation-costs/README.md`, `docs/research/2026-11-23-item-move-route-cost.md`. The R1-R3 report folder did not exist when this was written (only `BRIEF.md` in the spike directory), so no cross-report reconciliation was possible; every number below is independent.
Not read: the OpenAPI JSON itself (route structs and their comments carry the fields and limits used here), the UI, and the spikes/ code.

Price basis: **$0.005/generation** = 50 USD / 10,000 generations at the published plan rate (`plans.ts:16-19`, generation-costs README:23-25). All USD below = gens x 0.005.

## 1. Cost model per accepted asset

### 1.1 Reference scenario

One item fitted to one 6-frame move on a 4-direction rig at 92 px. A 4-direction rig requests three views and mirrors west (`rig.ts:24` `mirrorOf`; generation-costs README:14-19), so "per direction" below means per generated view unless stated. Cell = 92x92; held items pad to 96 (`padOf`, `items.ts:426-438`).

### 1.2 Unit prices (verified)

| Call                                     | Frames per call                              | Gens per call                                      | Source                                                       |
| ---------------------------------------- | -------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `/edit-animation-v2`                     | 16 / 9 / 4 by longest side <=64 / <=80 / >80 | 10 <=128, 15 <=170, 25 >170 px                     | `routes.ts:249-250`, `items.ts:755-760`                      |
| `/edit-images-v2` (sheet)                | canvas-bound, 32-512 per side                | by **mean side**: 10 <=256, 15 <=336, 25 >336      | `items.ts:226-232`; usage records x31:39                     |
| `/inpaint-v3` (grid)                     | canvas-bound                                 | same mean-side rule; Tier 1 needs both sides <=256 | `items.ts:210-232`, `plans.ts:23`                            |
| `/animate-with-skeleton-v3`              | 3-15 keypoints (batched <=15)                | 2 (<=3 frames), 3 (<=12), 4 (15)                   | `clips.ts:219-236`                                           |
| joint measurement (`/estimate-skeleton`) | per output frame                             | 0.1 each                                           | `movePricing.ts:24`                                          |
| item pose measurement                    | none                                         | **0** — item poses reuse requested keypoints       | `run.ts:703-716` uses `cellKeypoints`, no `estimateSkeleton` |

Item frame caps are contractual and are the single biggest lever: a 92 px cell gets 4 frames per edit-animation-v2 call (`editFrameCap(92)=4`), a 64 px cell gets 16.

### 1.3 Route costs (6-frame move, 3 generated views, 92 px)

| Route                               | Calls                    | Gens per call |       Gens per item-move |           USD | Retry unit                               | Notes                                               |
| ----------------------------------- | ------------------------ | ------------: | -----------------------: | ------------: | ---------------------------------------- | --------------------------------------------------- |
| **A. skel** (dress + skeleton pose) | 1 dress + 3 pose         |      10 + 3x3 | **19** (29 incl. design) | 0.095 (0.145) | 3 gens per clip-dir; 10 for the design   | `planItem` 663-672, `poseGensFor(6)=3`              |
| **B. anchor** (packed ea2)          | 6                        |            10 |                   **60** |         0.300 | 10 per 3-frame chunk                     | `planCalls` 1147-1175; matches x31:100 usage record |
| **C. item-on-move sheet**           | 1                        | 15 (measured) |                   **15** |         0.075 | 15 whole sheet, or 10 per view (salvage) | 56x90 cells, 392x270 (x31:39,54)                    |
| **D. inpaint-v3 grid**              | 3 (one per clip-dir)     |            25 |                   **75** |         0.375 | 25 per clip-dir                          | `gridEstimate(92,6,1,4)` = 368x184, mean 276        |
| **E. transfer-outfit-v2**           | 6 (3 frames/call)        |            10 |                   **60** |         0.300 | 10 per chunk                             | frames 15/8/3 (x31:43); price **unverified**        |
| body (context)                      | 1 create + 3 walk render |    3.25 + 3.6 |                **~14.4** |         0.072 | whole character                          | `estimate` 44-64, `moveEstimate` 213-226            |

Derived details worth stating:

- **Held dressing** on the 96 px padded cell: cap 4 views/call, so 10 / 20 / 30 gens for 3 / 5 / 8 generated views (generation-costs README:139; `anchorChunks` 742-751).
- **Sheet ceiling.** With the validated one-row-per-view layout (frames+1 cells per row, 4 px margins, content 0.62 W x 0.92 H + 8 px per x31:91), the width binds: 7 x (0.62W + 8) <= 512 gives **W <= 105 px** for 3 views x 6 frames on one sheet. At 128 px the row layout needs 6 columns, which breaks the row prompt, or two sheets (40 gens, x31:104). A wrapped 6x4 layout fits 128 px in one 25-gen sheet but is **untested**.
- **8 directions at 92 px**: 5 views x 7 cells = 35 cells of 56x90; 7 cols (392) x 5 rows (450) fits, mean side 421 -> **25 gens** (derived). At 128 px it does not fit one canvas.

### 1.4 Cost per _accepted_ item

Cost is dominated by retry granularity, not by per-call price. With per-call acceptance probability p, E[gens] = sum over required calls of price/p_call (a call is billed whether or not it passes QA, as observed in the ledger; the app itself re-rolls whole calls, `run.ts:857-861`).

Expected gens per accepted item-move at p = 0.9 (illustrative, not measured):

| Route                           | Formula            |  E[gens] |   USD |
| ------------------------------- | ------------------ | -------: | ----: |
| A skel                          | 10/0.9 + 3 x 3/0.9 |     21.1 | 0.106 |
| B anchor                        | 6 x 10/0.9         |     66.7 | 0.333 |
| C sheet                         | 15/0.9             |     16.7 | 0.083 |
| C sheet, per-view salvage p=0.7 | 15 + 3 x 10 x 0.3  | **24.0** | 0.120 |
| D grid                          | 3 x 25/0.9         |     83.3 | 0.417 |

Two consequences:

1. **A route whose retry unit is one view beats a cheaper-per-call route whose retry unit is the whole asset** once p < ~0.9. The sheet route wins only because a failed view costs 10, not 15.
2. **The app's own retry model is an assumption.** `costEstimate.ts:120-121` multiplies every line by `1 + retries` with `DEFAULT_RETRIES = 2` (3 attempts), which is a budget scenario, not a measured rate. No acceptance rate per route exists in the docs; x31 pass counts are 18/18 at 92 px sheets, 2/2 anchored, 1/4 raw skeleton — all with N too small to price a retry (`x31:26,127`).

## 2. Quality model

Which variables should move which output property, and how confident we can be.

| Variable                            | Mechanism                                                                                                                                                                                          | Status                                                                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Output resolution (canvas px/frame) | More px per design feature; palette exactness rises (92 px snap-distance 2.2-5.3 vs 64 px 11.5-15.1)                                                                                               | **measured** (x31:72-87), small N, one character                                                                                                                                 |
| Input resolution, upscaled          | Contract allows 16-256 px inputs; upscaling adds no information, only input area                                                                                                                   | **physics**: nearest-neighbour upscale cannot create detail. Any gain would have to show up as better returned pixels from an upscaled submission; that is untested (hypothesis) |
| Frame count per call                | ea2 caps 16/9/4 by size; more frames per call at the same canvas means fewer px per frame                                                                                                          | **contract** (`routes.ts:249-250`)                                                                                                                                               |
| Cells can differ from each other    | The same input frame submitted twice in one image differs in 6-94 px of shape (2-20%) and ~70% of exact colors                                                                                     | **measured** (x31:85). Removes "one call returns one consistent set of cells" as an assumption                                                                                   |
| Reference cell fidelity             | Returned reference cells keep shape (0-12 px of 900-1,550) but are recolored on nearly every pixel                                                                                                 | **measured** (x31:136). Treat the returned reference only as a shape check; its colors are not the submitted colors.                                                             |
| Seed reuse                          | `seed` exists on every route (`routes.ts:112,156,205,220,256,275`); determinism is not stated                                                                                                      | **hypothesis**: same seed+input reproduces output. Sheet shift varied by seed (x31:136) so at least geometry is not seed-stable                                                  |
| Palette constraints                 | `target_palette` exists on `CharacterAnimation` (`routes.ts:112`) and `EditAnimationV2` (`routes.ts:256`) and **not** on `EditImagesV2` (`routes.ts:209-217`) or `InpaintV3` (`routes.ts:201-207`) | **contract**. Palette control is unavailable on the two cheap routes; only local snapping (`paletteDistance`, `items.ts:2423`) applies to all                                    |
| Cross-view consistency              | Three views returned from one call are not pixel-identical to each other; measured front/back swaps at 64 px (4/216 frames, 3/8 sheets) and none in 18 sheets at 92 px                             | **measured** at 64/92 (x31:11,149), **hypothesis** above 92                                                                                                                      |
| Gate coverage per route             | Edit cells have `posed=false`, so G11-G15 view checks never run; a synthetic whole-view swap passed QA for all four 92 px items                                                                    | **verified** (x31:130, `items.ts:2645-2646`)                                                                                                                                     |

The quality model to carry into experiments: **resolution buys palette fidelity and silhouette stability; frame count buys motion and costs px/frame; results can differ between calls, so consistency per view must be _measured_, not assumed; and a route with fewer applicable gates must be judged by a blind ranking, not by QA status.**

## 3. Experimental design inside 1,000 generations

Budget split: **850 spendable + 150 reserve (15%)**. Planned 697, unallocated contingency 153 (inside the 850). No experiment may use the reserve without a written reason in the ledger; the reserve covers re-rolls of calls that failed for environmental reasons (job error, not art) and one repeat of a pre-registered confirmatory arm.

Priority order = cheapest falsification first. Every unit is `item x seed x arm`; cells come from the same character and body frames so arms are paired.

| #      | Question it can falsify                                                              | Design (units)                                                                                                           |    Gens | Objective pass                                                                                                                              | Blind pass                                            | Stop rule                                         | Unlocks                                                                 |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------: | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| **T1** | "same seed + same input returns the same pixels" and "reference cells are preserved" | 2 sheets, 92 px, 3 views x 6 frames, resubmitted with the identical seed and input as existing x31 sheets                |  **30** | seed-to-seed `alignedIoU >= 0.95` on every cell and `paletteDistance <= 2` -> reproducible; anything else kills seed-based A/B control      | n/a                                                   | 2/2 units                                         | Whether later arms may be paired by seed or must be paired by item only |
| **T2** | "the sheet route can carry held items"                                               | 2 held items x 2 seeds x 2 routes (skeleton pose 3 gens x 1 call south 4-frame attack; anchored ea2 at 96 px, 1 call 10) |  **52** | grip distance <= 6 px in every frame (G8 rule, `items.ts:2956`) and frame-to-frame aligned IoU >= 0.75 (`GATES.heldIoU` is 0.3, far looser) | rank grip/orientation 2-of-2 per item                 | 2/2 units fail -> route closed for held           | Frees or blocks ~1/3 of the item catalog without spending on sheets     |
| **T3** | "API palette control closes the color gap"                                           | 1 item x 2 seeds x 2 arms (ea2 with vs without `target_palette`), south 6 frames, 2 calls each                           |  **80** | post-snap `paletteDistance` <= 5 (best 92 px sheet result, x31:75-79); exact-color share >= 0.9                                             | n/a                                                   | 2/2 seeds same direction                          | If it works, it is the only lever the sheet route lacks                 |
| **T4** | "8 frames beat 6 at the same price"                                                  | 3 items x 2 seeds, 92 px, 3 views x 8 frames = 25 gens/sheet                                                             | **150** | `maxAreaCV <= 0.15` (G5), seam alignedIoU >= min interior IoU - 0.05, `strayPx <= 2`/frame                                                  | forced-choice vs the 6-frame original, same item/seed | 6/6 units pass, else stop at 3                    | Sets the frame-count default independent of size                        |
| **T5** | "128 px is worth 40 gens" (row layout, 2 sheets)                                     | 2 items x 2 seeds, 3 views x 6 frames                                                                                    | **160** | per-cell `maxPaletteDist <= 8`, cross-view `paletteDistance <= 8`, `strayPx` no worse than 92 px                                            | rank 128 vs 92 (paired)                               | 2 consecutive failures -> stop                    | Decides whether the pilot's documented 80-128 px band should be raised  |
| **T6** | "the validated row prompt survives a wrapped 6x4 layout at 128 px"                   | 2 items x 2 seeds, 1 sheet of 25                                                                                         | **100** | same metrics as T5 plus zero front/back swaps by the coverage signature (x31:130 prototype)                                                 | rank against T5's 128 px row-layout sheets            | 2/2 wrapped sheets swap a view -> layout rejected | The only single-call route above 105 px                                 |
| **T7** | "the sheet route survives 5 generated views"                                         | new 8-direction 92 px body (~25 gens) + 2 items x 2 seeds x 25                                                           | **125** | as T5, plus `minKeyKept >= 0.97` (`GATES.keyKept`)                                                                                          | rank against 4-view data                              | body fails QA -> abort, count body only           | The 8-direction cost row is currently pure arithmetic (x31:22,172)      |

Totals: 30 + 52 + 80 + 150 + 160 + 100 + 125 = **697 planned**, 153 contingency, 150 reserve.

What this design does **not** buy: any per-slot policy, any claim above 128 px, any diagonal-view claim below 92 px, and any measured acceptance rate (N per arm is 2-6). It is a falsification pass, not a qualification.

### 3.1 Stopping rules that keep it honest

- Fixed maximum N per arm. No optional stopping on a p-value; early stop only on a _falsification_ rule stated in the table (all units fail the same objective gate).
- One re-roll per unit at most, and only for a job error. A re-roll for art quality is a _new unit_ and must be pre-registered as extra N, not silently added.
- A ladder stops at its first failing level; a level is not retried "to be sure".
- Never resend a paid request; write the `.sent` marker before the POST (x31:30 convention).
- Any arm whose objective gate passes but whose blind ranking loses is reported as **not adopted**, not as "mixed".

### 3.2 Ledger template (one JSONL line per paid call)

```
{"ts":"2026-11-24T12:00:00Z","exp":"T4","unit":"hair_s7_92_8f","item":"long_braided_hair","slot":"hair",
 "seed":7,"view":"south,east,north","endpoint":"/edit-images-v2","canvas":[392,270],"frames":8,
 "gens":25,"usage_source":"job.usage.generations","budget":"planned|contingency|reserve",
 "call":1,"retry_of":null,"state":"done|failed|refused",
 "metrics":{"maxPaletteDist":5.3,"crossViewPalette":6.1,"maxAreaCV":0.09,"seamIoU":0.83,
            "minInteriorIoU":0.79,"strayPx":1,"gripPx":null,"edgeSpurs":0,"flicker":0.06},
 "qa":"pass|warn|fail","blind":{"rater":"r1","choice":"A","pair":"T4_hair_s7"},"cum_gens":412}
```

Roll-up per arm: units, gens billed, gens per accepted unit (`sum(gens)/count(accepted)`), pass rate with a Clopper-Pearson interval, and the blind preference counts.

## 4. Objective metrics computable offline

All of these run on stored frames only; none needs a paid call.

| Metric                          | Formula                                                                                                                                            | Threshold rationale                                                                                                                                                                   | Existing code                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cross-view palette distance** | `paletteDistance(colors(dir A standing), layers(dir B))`, pixel-weighted mean of max-channel RGB distance to the nearest reference color           | `GATES.paletteDist = 15` is a per-call review line, not cross-view; the 92 px measured spread after snap is 2.2-5.3, so **<= 8** is a defensible cross-view ceiling (hypothesis)      | `paletteDistance` `items.ts:2423`; **cross-view pairing is new** (existing calls compare a layer to its own direction, `items.ts:3154-3163`)                     |
| **Silhouette IoU**              | `alignedIoU(maskA, maskB, w)` after centroid alignment (translation-invariant)                                                                     | `GATES.heldIoU = 0.3` exists only for held shape jumps and is too loose for design identity; measured seed-to-seed IoU 0.80-0.85 (x31:87), so **>= 0.75** for "same design"           | `alignedIoU` `items.ts:2476-2490`; whole-sheet registration uses opaque-mask IoU +/-5 px, `sheetOffset` `items.ts:1025-1049`                                     |
| **Edge continuity**             | boundary px = mask px with <4 opaque 4-neighbours; spurs = boundary px with exactly 1 opaque 4-neighbour; also count boundary components and holes | Clean pixel art has no 1 px spurs; a ragged returned edge shows them. **<= 2 spur px per frame** (hypothesis, calibrate on the 18 passing 92 px sheets)                               | **new**; `interiorPx` (`items.ts:2593`) is the inverse idea and exists                                                                                           |
| **Seam jump**                   | for looping moves: `1 - alignedIoU(last, first)` and `paletteDistance` across the wrap                                                             | A seam must not be worse than the worst interior transition: **seam IoU >= min interior IoU - 0.05** (self-referential, no absolute constant needed)                                  | partially: held loops already test `checkTransition(frames.at(-1), frames[0], seam=true)` (`items.ts:3086`) and emit a warning; no numeric seam metric is stored |
| **Pixel drift vs anchor**       | distance of the item's centroid (or its attachment edge) to the expected body anchor, minus the same measured on the standing design               | The standing design is the ground truth for attachment; drift > 2 px at 92 px is visible                                                                                              | partially: `G10` misregistration (`shifted`, `items.ts:2643`), `bestShift` (`items.ts:1995-2040`), `G15` lost-detail colors (`items.ts:3597`)                    |
| **Grip / hand distance**        | min over item px of distance to the expected wrist keypoint, per frame                                                                             | 6 px is the existing G8 rule (`items.ts:2956`); the hand is 4-6 px at 92 px, so 6 px is the point where the item stops touching the hand                                              | `nearest()` `items.ts:2444`, G8 `items.ts:2926-2961`, `markHand` tolerance 2.2 px (`items.ts:510`)                                                               |
| **Stray-pixel count**           | item px outside the slot band, plus components smaller than 3 px                                                                                   | `strayPx` counts _removed_ pixels, not semantic artifacts (comment `items.ts:1300`); the observed passing-case baseline is 2 stray px under the feet (x31:137), so **<= 2 per frame** | `stray` `items.ts:1328-1336`, `qa.strayPx` `items.ts:3183`; band exists (`bandOf` `items.ts:1241`) but no stray-vs-band metric                                   |
| **Frame-to-frame flicker**      | after snapping to the standing palette, share of item px per consecutive pair whose mapped color differs, plus `1 - alignedIoU` per pair           | Do **not** use exact RGB: 70% of pixels change exact color between duplicate submissions of the same input (x31:85). Palette-mapped share **<= 10%** (hypothesis)                     | partially: `G5` area CV `items.ts:2764-2773,2870-2899`; `G9` shape jump `items.ts:2969-3104`; no color-flicker metric                                            |

Two calibration rules: (a) run every metric on the already-passing 18 sheets at 92 px and the 8 at 64 px before spending anything, and set thresholds at the passing population's 95th percentile; (b) keep raw values in the ledger, never only pass/fail, so a later report can re-threshold without new generations.

## 5. Statistical honesty

What N seeds and k raters can and cannot support.

- **Proportions.** Clopper-Pearson 95% upper bound on the failure rate is 1 - 0.05^(1/N): N=4 -> 52%, N=8 -> 31%, N=18 -> 15%, N=30 -> 9.5%. The existing "18/18 sheets pass" therefore only rules out a failure rate above ~15%, which is compatible with the 64 px 3/8 failure rate. Any "route is safe" claim needs N >= 30 per arm or an explicit "<= 15% failure" claim.
- **Paired binary (preferred).** Same item, same seed, two routes: McNemar/exact sign test on discordant pairs. 6/6 discordant in one direction gives two-sided p = 0.031; 5/6 gives p = 0.22, i.e. no conclusion. So a claim of "route C beats route B" requires **at least 6 pairs, never fewer**, and ideally 8-10.
- **Paired continuous.** Report median paired difference and its sign count, with a bootstrap interval over units; do not run a t-test on 4-6 units. Report per-item results next to the pooled result, because with 2-3 items the item effect is not separated from the route effect.
- **Variance components.** Unit = item x seed. Seeds are not independent of the item, so N seeds on 2 items is not 2N independent observations of "the route". Never pool across items without showing per-item values.
- **k raters.** With k=3 and 8 stimuli, use forced choice per pair and a binomial test on preference counts (7/8 -> p = 0.035, 6/8 -> p = 0.29). Report raw agreement and every disagreement; do not report Fleiss kappa on a nearly unanimous set (it degenerates toward 0/undefined with a skewed margin). Raters must see routes anonymized and order-randomized, and must be told the item and slot but not the route.
- **Multiplicity.** Seven experiments at alpha = 0.05 uncorrected gives ~30% family-wise error. Pre-register **one primary metric per experiment** (T4 primary = seam IoU; T5/T6 primary = cross-view palette distance; T2 primary = grip distance) and treat the rest as descriptive. The adoption decision is the confirmatory test, not the best-looking secondary metric.
- **QA is not acceptance.** Two 64 px sheets passed QA with back-view frames and a synthetic view swap passed for all four 92 px items (x31:26,130). Objective metrics plus a blind ranking are the acceptance criteria; a QA pass is necessary but not sufficient, and gate count per route must be stated with every result.
- **Seed pairing is a hypothesis until T1 passes.** If T1 shows non-reproducibility, later arms must be paired by item x seed and analyzed as paired-by-item only.

## 6. What this model says to change in the plan

1. **Price the retry unit, not the call.** Every future cost claim should state `gens per accepted unit = sum(price/p)` and the retry granularity; that is what separates the 15-gen sheet (24 gens accepted at p=0.7 with per-view salvage) from the 19-gen skeleton route (21 gens accepted, but a 3-gen pose failure is cheap while a 10-gen design failure invalidates all poses).
2. **The sheet route's one-call advantage ends at ~105 px** for the validated row layout (derived). T6 is the only cheap way to know whether to raise it, and no result above 128 px can be claimed without a new layout.
3. **Palette control exists only where the cheap routes are not.** `target_palette` is on ea2/character animations, not on edit-images-v2/inpaint-v3; T3 is the only route to test it, and local snapping is the only cross-route mechanism.
4. **Do not budget from `DEFAULT_RETRIES = 2`.** It is a UI scenario (`costEstimate.ts:120-121`), not a measured acceptance rate; the spike should return a measured p per route, or state that it has none.
