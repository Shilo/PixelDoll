# Pipeline research spike: consistency, accuracy, quality, size and cost

2026-11-24. Branch `t3/pixellab-pipeline-research`. No app behavior changed; this is a research spike plus a pre-registered test plan.

Budget: 1,000 generations allocated to this spike. **180 used** (36 on two falsification probes, 144 on a paired sheet-vs-skeleton pilot); 820 remain. Local ledgers overstate this slightly because they count the estimate of refused calls; every refusal was free.

Read this with the six reports in [`reports/`](reports/) and the shared [brief](BRIEF.md). `reports/CHALLENGE.md` is an adversarial review of an earlier draft; this version adopts its corrections. Only PixelDoll's code/docs and PixelLab's public API contract are evidence.

## Answer

The pipeline is limited less by canvas size or call price than by **results that differ between separate calls**, by **review time**, and by **a weak cross-view gate**.

- The default skeleton route dresses one standing view, then poses it frame by frame. It is cheap: **19 gen** for a new item's first 3-view, 6-frame move and **9 gen** for each later move. It works well on the delivered layer: posed gear already fits the frozen base at 0.2-1.4 px per frame with a 0 px grip gap on all 129 stored held frames. Its cost is that the body pixels in each call's returned frames differ from the frozen base, so the body-kept gate can fail even when the worn layer fits.
- The all-view sheet is the only route that returns one image holding one design across many frames and views. It costs **+6 gen per attempt** on a 3-view 6-frame move (25 vs 19 first, 15 vs 9 later), not 4x less. Its saving applies only to the anchored route (15 vs 60), which is used when adding a move to a saved item. Its real cost is human review: no cross-view gate exists, so every cell must be looked at.
- The largest usability gap is **held and rigid items**, where no route is qualified. A local rigid transform (no generation call) is worth a prototype, but it does not beat the recorded 0 px grip gap today and would change occlusion and body-cut combinations; it is research, not a default.
- Higher resolution is not a free quality lever. A 36-gen paired test of "render at 184 px then downscale to 92" improved palette convergence but **raised edge spurs 2.9x**, shrank item area 4 %, and added cloth speckle. The useful version, a body created and kept at 128 px, is a separate untested experiment.

**Recommendation:** keep the skeleton route as the default. The first paired pilot (below) did not produce a visual win for the sheet: it removed the body-kept failures but lost exact palette and failed the hat's side-view shape. Priorities, in order: (1) cross-view gate, (2) held-item route, (3) a per-slot sheet policy only where skeleton review keeps failing, (4) hero resolution. Do not spend on resolution before the gate exists.

## Verified costs (corrections from the red-team applied)

All prices are generations; USD at the planning ratio of $0.005/gen used by the app for the published 10,000-generation plan is in parentheses and is an allowance equivalent, not a cash rate. "New item" includes the standing dress call; "later move" assumes the standing design is saved.

| Route, one item, one 6-frame move, 3 requested views at 92 px |             Calls |                                                  Gen | What it preserves                                            |
| ------------------------------------------------------------- | ----------------: | ---------------------------------------------------: | ------------------------------------------------------------ |
| skeleton pose, new item                                       |  1 dress + 3 pose |                                      **19** ($0.095) | frozen body; returned body pixels differ from the base       |
| skeleton pose, later move                                     |            3 pose |                                       **9** ($0.045) | same                                                         |
| skeleton pose, 8 directions (5 requested views)               |  2 dress + 5 pose |                                               **35** | same                                                         |
| anchored edit-animation-v2, later move                        |        2/view × 3 |                                       **60** ($0.30) | saved standing design                                        |
| all-view sheet, new item (3 views × 6 frames, 392×270)        | 1 dress + 1 sheet |                                      **25** ($0.125) | the real frames; one returned image for all frames and views |
| all-view sheet, later move                                    |           1 sheet |                                      **15** ($0.075) | same                                                         |
| all-view sheet, new item (4 views × 6 frames, 336×336)        | 1 dress + 1 sheet |                                               **25** | same, measured 8/8 in the prior study                        |
| all-view sheet, later move (4 views × 6 frames)               |           1 sheet |                                               **15** | same                                                         |
| inpaint-v3 packed grid (3 calls)                              |                 3 |                                               **45** | masked cells only                                            |
| transfer-outfit-v2 held items                                 |        2/view × 3 | **≈120** (3 frames per call above 80 px; unmeasured) | reference design                                             |

The sheet is not cheaper than the default skeleton route. It is cheaper than the anchored route, and it may win per **accepted** item-move if the skeleton route's review or re-roll rate is high. The pilot measured QA and palette, not acceptance yield or review minutes, so that remains the open question.

Contract facts that matter (`R1`, checked against `pixellab-openapi-v2.json`):

- `animate-with-skeleton-v3` accepts a first frame up to **256 px** and prices by **frame count only**: 2 gen up to 3 frames, 3 up to 12, 4 at 15. Canvas size is free on this route.
- `edit-images-v2` is the **only allowed route above 256 px**: inputs and output up to **512**. Price by mean side: 10 up to 256, 15 up to 336, 25 above. The image cap is size-dependent: 16 at ≤64 px, 9 at ≤80, **4 above 80**. A live 92 px request for 8 separate images was refused with "max is 4", free.
- `inpaint-v3` also accepts 512, but its packed-grid result failed 2 of 4 in the prior live study and its mask can leave changed body pixels in item pixels; keep it as a fallback, not a primary route.
- `target_palette` exists on `edit-animation-v2`, `transfer-outfit-v2` and the state/character routes, but **not on `edit-images-v2` or `inpaint-v3`**. It was already rejected by a paid A/B on `edit-animation-v2` (6/8 vs 8/8 controls, two new body-key failures). The field remains untested on `transfer-outfit-v2`.
- `create-character-v3` is capped at 256 px; our quote applies the area term to `body²` while the submitted canvas is `frame²`, so our estimate can be up to 2 gen low at body ≥96. That is a bug in our estimate (`movePricing.ts:56-59`), not a pipeline lever.

## What this spike falsified (36 gen, stored frames)

**Test 1: multi-image batching is not a cost win.** `edit-images-v2` with 8 separate 92 px frames was refused at no charge: "Too many frames: 8, max is 4". The multi-image cap is the same size-dependent 16/9/4 as `edit-animation-v2`, so one call of 4 separate images costs the same as one call of 4 animation frames. Only packing into **one canvas** saves. Files: [`spikes/api/x32/batch.mts`](../../../spikes/api/x32/batch.mts).

**Test 2: render at 2x, downscale to 1x is not free quality.** Two worn items × three views × six walk frames, seeded identically, at 92 px and at 184 px then majority-of-four downscale. The app's own extraction and `postProcess` ran on both arms.

| Metric (36 frame pairs)                       | native 92 |           184 → 92 |
| --------------------------------------------- | --------: | -----------------: |
| mean palette distance to the standing palette |      0.18 |           **0.04** |
| edge spurs (1 px)                             |        95 |            **278** |
| item area                                     | 16,698 px | 15,990 px (−4.2 %) |
| mean silhouette IoU native vs up              |      1.00 |              0.905 |

Visual inspection of the jeans arm shows: the 184 px results contain denim texture and fabric noise; the 92 px results have flat pixel-art shading. Downscaling keeps that noise as 1 px speckle, and the returned frames put skin pixels inside the leg band. Higher resolution did converge colors, but it made the silhouette and edges worse. Files: `res.mts`, `compare.mts`, montages `spikes/api/out/x32/res/cmp.*.png` (git-ignored).

Conclusion: do not use upscaling before generation as a blanket quality lever. A **body created and kept at 128 px** is a different experiment (Phase 2).

## Pilot result: sheet vs skeleton, paired (144 gen)

This is the test the red-team asked for, run on the existing 92 px rig: 3 worn items × 2 seeds, each unit a 4-direction, 3-view, 6-frame walk. Sheet arm: one 392×270 `edit-images-v2` sheet per item at 15 gen. Skeleton arm: the app's own `itemRoute.pose`, 3 gen per view. Both were extracted and scored with the app's `extractCell`, `postProcess`, `itemQa` and the same standing palettes. The sheet arm used cut-origin registration, palette snap and the view gate; the skeleton arm was scored posed.

| Item, seed | Sheet QA | Skeleton QA | Sheet palette | Skeleton palette | Sheet key-kept | Skeleton key-kept | Skeleton failures |
| ---------- | -------- | ----------- | ------------: | ---------------: | -------------: | ----------------: | ----------------- |
| jeans 7    | pass     | fail        |           4.1 |              1.1 |          0.993 |             0.938 | G2 ×2, G10        |
| jeans 11   | pass     | fail        |           4.3 |              1.7 |          0.998 |             0.874 | G2, G3            |
| hat 7      | pass     | fail        |           6.9 |              0.0 |          0.997 |             0.951 | G2, G10           |
| hat 11     | pass     | fail        |           8.2 |              0.0 |          0.992 |             0.970 | G2, G3            |
| hair 7     | pass     | fail        |           3.0 |              0.8 |          0.985 |             0.967 | G2 ×2, G3         |
| hair 11    | pass     | fail        |           4.3 |              0.8 |          0.987 |             0.946 | G2, G3, G10       |

What the numbers say:

- **Structural QA: sheet 6/6, skeleton 0/6.** The skeleton failures are body-kept and key-outside flags in the east view, the mechanism this spike predicted: each returned skeleton frame's body pixels differ from the frozen base (23-58 body px in the x31 east view). The sheet cannot fail those because every cell's reference is a submitted body frame.
- **Exact color: skeleton wins clearly.** Palette distance 0-1.7 versus 3.0-8.2, and exact-color share 0.99 versus 0.24-0.49. The skeleton reuses the accepted keyframe's palette; the sheet's returned colors differ.
- **Visual quality: not a win for the sheet.** Side by side on the delivered layers, the jeans are close (both acceptable, skeleton more exact); the hat's side view is wrong in **both** arms, with the sheet's brim narrower and the skeleton's changing shape; the hair is close. The sheet's own view gate flagged 6 hat east frames (H4), so it is not silently clean.
- **Cost: +6 gen per pair**, 15 versus 9, and the sheet is one long job rather than three short ones.

Verdict: **do not switch the default on this evidence.** The sheet is a legitimate per-item option for items that keep failing body-kept review, but it is not a broad quality upgrade. The residual problem is per-frame shape consistency in side views (wide brims, long hair), which neither route solves and which the cross-view gate must catch.

Files: `spikes/api/out/x31` (git-ignored), arms `eiv2-prod` and `skeleton-live`; evaluations `eval.s7.cut.snap.json` and `eval.s7.posed.json` and their `.eval.png` montages.

## The five mechanisms that actually cap quality

1. **Outputs from separate calls differ.** The same input frame submitted twice in one image differs in 6-94 px of shape (2-20 % of the item) and in about 70 % of exact colors. So more calls means more differing cells to check; fewer calls means fewer. This is the sheet's only real advantage.
2. **Returned body pixels differ between calls.** The item is extracted and composited on the frozen body, so global fit survives; the boundary (occlusion, rim, 1 px gap) is where the returned body differs. The accepted record measures 0.2-1.4 px misfit and a 0 px grip gap, so this is a polish problem, not a broken pipeline. Do not use the raw-output body-kept gate as a product-quality claim.
3. **The frame cap collapses at 81 px.** 16 frames per call at ≤64, 9 at ≤80, 4 above. Every extra call is another set of returned pixels that can differ from the others; above 80 px the anchored route multiplies both cost and drift. This is a contract cliff.
4. **Extraction is chroma residual.** Item = opaque pixels that are not the key. The body-kept gate tolerates a 3 % body-pixel change per call, and leaked body pixels become item pixels. The 1 px body rim and the key-tinted fringe are accepted limits. Absolute pixel rules (2 px speck, 4 px floor, 3 px cut) do not scale with canvas size.
5. **QA is per call and has no cross-view check.** A synthetic whole-view swap passed the app's QA for all four 92 px items. `dirGate` does not run on edit cells; the coverage-signature prototype false-alarmed on 9-26 % of real frames. Review is therefore the binding cost of the sheet route.

## Size and coverage (eligible layouts only)

`canSheet` restricts the sheet to: 80-128 px rig cells, non-held slots, a saved standing design in every requested view, `canAnchor` (layers on the rig cell), and **cardinal or mirrored directions only**. An 8-direction rig with diagonals is not sheet-eligible today, and 160 px is not either (`ITEM_SHEET.maxCell = 128`). So the current maximum is **4 cardinal rows**, and the fourth row on the default rig is the mirrored east design, not a separately returned view.

Within one 512 px canvas, the price is flat 25 above the 336 mean edge; the cell size decides how many cells fit:

| Frame | Approx. crop cell | Cells in 512² | 4 cardinal views × frames |                 Price |
| ----: | ----------------: | ------------: | ------------------------: | --------------------: |
|    64 |             39×63 |           104 |                        25 |                    25 |
|    72 |             44×71 |            77 |                        18 |                    25 |
|    80 |             49×79 |            60 |                        14 |                    25 |
|    92 |             56×90 |            45 |                     10-11 |                    25 |
|   108 |            66×105 |            28 |                         6 |                    25 |
|   128 |            78×125 |            24 |                         5 |                    25 |
|    92 |             56×84 |            24 |                         5 | **15** (measured 8/8) |

Two corrections to the first draft: the 5-view column was not reachable through `canSheet`, and the real per-cell gain from 25/45 over the proven 15/24 is about 10-20 %, not 40-55 %. The 25-gen tier buys longer clips and more views, not a collapse in cost. The measured 15-gen 336×336 layout (4 views × 6 frames at a 56×84 cell) is the safe starting point.

## Directions

### A. All-view sheet (pilot, not default)

One `edit-images-v2` call per item per move, on the real body frames, at most 4 cardinal views, crop windows measured by `itemSheetWindows`, reference first in each row, cut-origin registration, existing extraction and QA, and a review before saving.

- Cost: 25 gen for a new 3-view 6-frame item, 15 for each later move; 25 for a 4-view 6-frame later move.
- Quality: one returned image holds the design; no second body to compare.
- Limits: exact predicate above; held items unsuitable (grip and orientation unstable); 64 px has silent front/back swaps; mirrored west row keeps its flip; no cross-view gate.
- Status: a pilot. The decision rule is a paired, delivered-layer comparison with a same-item skeleton control, blind, plus review minutes per accepted item-move. Not a default until that passes.

### B. Local rigid transform for held and rigid items (research)

Dress the item once per view, then transform the accepted layer per frame from the stored wrist, neck or shoulder keypoints: translate and rotate about the wrist for a weapon, about the neck for a helmet, about the shoulder for a shield. Marginal cost: 0 gen; shape and colors stay exact.

- Why it is not a shippable default: rotating a layer changes which body pixels it covers in every frame, so the over-body/behind-body split, the hand-over-grip treatment and the body-cut combinations must be recomputed per frame. Exported body cuts are capped at 256 combinations. The current pipeline already records a 0 px grip gap, so the accuracy case is unproven.
- Test: offline prototype that reports per-frame body-mask and combination count, edge/rim quality, and a blind grip/occlusion ranking on stored clips. No live comparison until that passes.

### C. Hero resolution (conditional)

Create and keep a body at 128 px, animate at the same size, and use a 128 px sheet (4 views × 5 frames at 25 gen). Do **not** upscale an existing 92 px keyframe and downscale it; that is the falsified test above. 160 px is outside `itemSheetLayout` and the layer plus pad can saturate the 256 px export cap.

- Cost: 25 gen per 24-cell sheet, plus creation (body 128 is ~3.25 gen; moves are frame-priced).
- Decision rule: only for a named hero character; 128 px must beat 92 px in a blind paired ranking with no new swaps.

### D. Motion density

Skeleton posing stays 3 gen from 4 to 12 frames, so an 8-frame clip can become 12 for +0.4 gen/view of measurement. The sheet has no frame-count price, only the cell budget: at 92 px a 25-gen sheet holds 10-11 frames × 4 views; at 80 px, 14 frames. Use 12-frame clips for skeleton-posed items; use 10-11 frames for sheet items at 92. Avoid 16+, which forces a second sheet or two pose batches.

## Test plan (pre-registered, 820 gen remaining)

Budget: **674 planned + 100 reserve**, 46 unallocated for a follow-up the results justify. Every arm is paired **by item**, not by seed: generation is not bit-repeatable, so a seed is not a pairing key. Log reviewed cells and minutes per unit; that is the cost the sheet must beat.

### Phase 0 — done (36)

Multi-image cap (free refusal) and 2x-then-downscale (36). Both closed.

### Phase 1 — sheet vs skeleton (done: 144; remaining: 202)

The 3-view pilot above is complete. It did not earn a default change. The remaining tests are narrow:

| #    | Question                                             | Design                                                      | Gen | Primary pass                                             |
| ---- | ---------------------------------------------------- | ----------------------------------------------------------- | --: | -------------------------------------------------------- |
| P1.2 | Does a one-sided item survive the mirrored west row? | 1 eyepatch/pauldron/quiver item × 2 seeds × 2 arms          |  88 | west row keeps the correct side or is flagged            |
| P1.3 | Does per-view salvage recover a failed view?         | re-roll failed views from the pilot at 10 each, contingency |  40 | a failed view recovers; passing views unchanged          |
| P1.4 | Does the result hold at 4 cardinal views?            | 2 items × 1 seed × 1 paired unit (skeleton 12 + sheet 25)   |  74 | no new swaps; palette and review minutes as in the pilot |

If P1.2 or P1.4 regress, the sheet stays a narrow per-item option, not a route policy.

### Phase 2 — size, resolution and held (340)

| #    | Question                                | Design                                                          |  Gen | Primary pass                                                                                                         |
| ---- | --------------------------------------- | --------------------------------------------------------------- | ---: | -------------------------------------------------------------------------------------------------------------------- |
| P2.1 | 80 px: 14 frames × 4 views in one sheet | 2 items × 2 seeds                                               |  100 | palette ≤10; no swaps; blind preference vs 92 px                                                                     |
| P2.2 | 128 px hero body kept at 128            | one 128 body (~15) + 2 items × 2 seeds, 4 views × 5 frames      |  115 | blind preference vs 92 px with no new swaps                                                                          |
| P2.3 | transfer-outfit-v2 for held items       | 1 held item × 3 views × 6 frames, 2 calls/view, hard cap        |  120 | grip distance ≤6 px and no hand swap across views; price record recorded                                             |
| P2.4 | local rigid warp                        | offline prototype only; one live anchor only if it clears G8/G9 | 0-20 | shape IoU against the body silhouette and attachment, not against a drifted result; body-variant count does not rise |

### Phase 3 — gate (132)

A cross-view gate is a **precondition** for adopting the sheet anywhere, not a parallel nice-to-have. Build a corpus of real and injected failures: stored 64 px single-frame front/back swaps, plus 4 passing 92 px sheets with synthetic whole-row and single-frame swaps. Test (a) the returned reference cell against the submitted one (whole-row detector) and (b) a silhouette/coverage signature per cell (single-frame). Report precision and recall separately on both corpora; a detector that only catches whole-row swaps does not authorize auto-save.

### Reserve (100)

One confirmatory repeat of whichever phase decides the default, plus job-error re-rolls.

## Challenges to the team reports

`reports/CHALLENGE.md` is the adversarial review. The findings that changed this draft:

- **The first cost table was wrong.** Skeleton is 19/9 gen, the 392×270 sheet is 15, and inpaint is 45, not 75. The sheet costs +6 per attempt, not 4x less.
- **The 5-view layout is not shippable.** `canSheet` allows cardinal or mirrored directions only; 8-direction rigs with diagonals fail, and the fourth row is mirrored, not independent.
- **The first draft re-proposed rejected defaults.** R4 rejects painting gear on real frames as the default and code-placed rigid head layers; the accepted fit data (0.2-1.4 px, 0 px grip) undercuts the body-drift motive. The sheet is now a pilot with a control arm.
- **R1's `target_palette` bullet is misleading but its own text is careful.** The schema has no `target_palette` on `EditImagesV2Request`; R1 already says "not typed". The field is present on `transfer-outfit-v2`, so it is a valid question for the held test, not for the sheet.
- **R2's 1024 px sheet is invalid.** The contract caps `edit-images-v2` at 512. Filling the 512 canvas with crop windows is the real win.
- **R2's "96 px is dominated by 128 px" is true only for dress calls.** On a sheet, 128 px holds fewer cells, so it trades coverage for detail at the same 25 gen.
- **R5's T1 (seed reproducibility) is already answered.** Generation is not bit-repeatable; do not spend 30 gen re-proving it. R5's held-item test also used skeleton posing, which cannot be the control for held items.
- **R3's "pose at 128 is free quality" is only free in gens.** The 2x test shows the downscale adds edge noise; test a body kept at 128, not an upscaled keyframe.

## What not to do

- Do not re-test `target_palette` on `edit-animation-v2`, global palette snapping, Pixen, inpaint-v3 as the sheet route, or 64 px sheets as a default. Each has a paid rejection with a clear mechanism.
- Do not raise resolution by upscaling an existing keyframe. The 36-gen test is the falsification.
- Do not treat the 15-vs-60 comparison as the default saving. It compares the sheet with the anchored route, which is only used for adding a move to a saved item.
- Do not adopt the sheet without the skeleton control and review minutes. A QA pass is not acceptance; a synthetic swap passed QA.
- Do not widen `canSheet` to diagonals or 8 directions before the cardinal case passes.

## Open questions

1. Is the sheet better **per delivered layer** than skeleton, at equal review effort? (P1.1)
2. Does 80 px buy longer clips without reintroducing swaps? (P2.1)
3. Does a body created and kept at 128 px fit items better per generation? (P2.2)
4. Which held-item route is cheapest and accurate: transfer-outfit, local rigid warp, or a 3-keyframe sheet plus interpolation? (P2.3/P2.4)
5. Can a gate catch single-frame swaps, not only whole-row swaps? (Phase 3)
6. Does the 512 canvas bill by mean side at 504×450, or does the 25 band move? One usage record settles it; the quote uses 25 conservatively.

## Reproduce

From the repo root, with a PixelLab token configured as described in [`docs/handoff/agent-dev-token-handling.md`](../../handoff/agent-dev-token-handling.md):

```sh
cd spikes/api/x32
node --experimental-transform-types --no-warnings batch.mts 8 <item> <seed> <direction>
node --experimental-transform-types --no-warnings res.mts <items> <seed> <directions>
node --experimental-transform-types --no-warnings compare.mts <items> <seed> <directions>
```

Outputs and ledgers stay in `spikes/api/out/x32` (git-ignored). The `.sent` marker is written before every POST; a call is never resent. The harness reuses the x31/c25 paid-call guard, so a cap breach refuses before sending.

## Files

- `BRIEF.md` — shared brief for the six agents.
- `reports/R1-api-and-pricing.md` — route, cap and price table.
- `reports/R2-item-pipeline.md` — item call graph, size chain, ranked mechanisms.
- `reports/R3-body-rig-moves.md` — body, rig, moves, keypoints, creation quotes.
- `reports/R4-docs-history.md` — what was tried, rejected and accepted, with evidence.
- `reports/R5-cost-model-and-test-design.md` — cost model, metrics, statistics, first test matrix.
- `reports/CHALLENGE.md` — adversarial review of the first draft.
- `spikes/api/x32/` — the two live probes and the offline comparison.
