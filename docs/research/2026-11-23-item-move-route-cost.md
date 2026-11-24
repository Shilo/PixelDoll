# Cheaper route for drawing an existing item on an existing move

November 23, 2026. Live research on the production PixelLab API (`api.pixellab.ai`, Tier 3 account), owner-approved budget of 1,000 generations, 674 spent. No app code changed. Two DeepSeek reviews (a desk review mid-run and an adversarial review of the first findings) are answered point by point in [Review round 1](#review-round-1) and [Review round 2](#review-round-2).

## Answer

Draw the move on **`/edit-images-v2` sheets that hold the move's real frames as chroma-keyed crop windows, one view per row with that view's dressed standing reference first**, register the returned sheet once, then extract and check with the app's existing code.

- **Cost:** 15 generations per item for a 6-frame walk in 3 views at 92 px, against 60 for the anchored route today (4x) and 30 for one sheet per view (2x). Receipts in [Billing](#billing).
- **Quality at 92 px:** 18 sheets (6 items, 10 independent item-and-seed inputs; every worn slot tested: hair, head, legs, feet, torso outer) passed the app's QA and visual inspection, with 4 px crop margins in the production-style layout. The anchored control passed too; after the app's palette snap, palette distance is 5.3 vs 5.2 (jeans) and 3.2 vs 2.2 (braid).
- **Quality at 64 px is not good enough yet:** on the fixture's frame-counted layout, 3 of 8 sheets drew 1-2 south frames as a back view (4 of 216 frames). The app's QA caught only one of the three, because it runs no view checks on edit cells (see point 4).
- **Not suitable:** held weapons (grip and orientation unstable).

**Verdict: adopt as an opt-in pilot, not the default.** Scope it to worn, non-held items on 4-direction rigs at 80-128 px, with the row layout above, per-view salvage and a visible review before saving (as Redraw already does), and keep the anchored route as the fallback. I agree with DeepSeek's pilot framing; I disagree with its 64-96 px lower bound and with routing capes, back items and torso outerwear to per-view sheets by default (evidence in Review round 2).

## Method

### Inputs

- **92 px:** the owner's backup (`user-backup.zip`, extracted outside the repository), character `rig-4be2c254-...`, `walk` with 6 frames in south, east and north, plus the stored mirrored west frames for one 4-view probe. Items: `long_braided_hair` (hair, fg and bg layers), `cal_a_jeans` (legs), `chapeu_de_palha` (head), `short_2` (hair), `bota_militar` (feet), `plate_carrier` (torso outer). References are the items' saved `dressed` chroma keyframes, exactly what the anchored route sends as frame 1.
- **64 px:** the backup's 64 px and 128 px characters have only a one-cell standing clip, so the demo fixture [`app/public/fixtures/s2`](../../app/public/fixtures/s2/) was used: `walk` (8 frames, 3 views) and `cross-punch` (6 frames, south only). Its items have no dressed keyframes, so each reference was rebuilt the way the app builds one: the chroma copy of walk frame 0 with the item's own frame-0 layers composited (bg under, fg over), so walk frame 0 is not a target. Items: `hair_brown`, `vest_leather`, `cape_red` (back), `helmet_steel`, and `sword_steel` (held) as a probe. The fixture stores no joints or rest views, so slot bands fall back to the whole cell and several view checks cannot run there.
- **No diagonal view, 8-direction rig or frame of 128 px or more was available**, so those rows are computed, not measured.

### Scoring (identical for every arm)

[`spikes/api/x31/eval.mts`](../../spikes/api/x31/eval.mts) cuts each returned cell back to its rig-cell position and runs the app's own code from [`items.ts`](../../app/src/lib/items/items.ts): `extractCell` on the real body frame (chroma key `green`), `postProcess` against the extracted standing layers, and `itemQa` with the standing palettes. `pass`/`warn`/`fail` and gate names (G2 body kept, G3 key outside, G4 item missing, G5 area CV, G6 palette distance, G10 misregistered) are the app's. Switches added for review round 2: `REG=cut` (registration by moving each cell's cut origin, ±5 px), `SNAP=1` (the app's `standingDyeMatcher`), `GATE=1` (the app's `dirGate` view checks applied to edit cells), `SWAP=a:b` (synthetic whole-view swap), `TRUTH=1` (IoU with the fixture's own accepted layers), and a reference-cell edit report. QA is a floor, not proof: the stored skeleton jeans pass it while showing bare leg, and two 64 px sheets passed it with back-view frames. Every result below was also inspected visually.

### Billing

Every cost is from `usage.generations` in the completed job (`spikes/api/out/x31/ledger.jsonl`: 80 calls, 1 refused at no charge, **674 generations billed**). The ledger refuses a call that could pass the cap, writes a `.sent` marker before every POST and never resends. The shared account's balance fell 932 over the same period; the other 258 match no request in this ledger, so another session was spending on the same account.

## Desk research

From [`pixellab-openapi-v2.json`](pixellab/pixellab-openapi-v2.json), [`pixellab-plans.md`](../pixellab-plans.md), the app's receipt-calibrated estimators and this round's receipts.

| Candidate | Input limit | Billing (receipts) | Reference image | Keeps body pixels | Frames per call |
|---|---|---|---|---|---|
| `/edit-animation-v2` (anchored, today) | frames 16-256 px, 2-16 frames | 10 per call up to 128 px (12 receipts, all 10) | frame 1 of the call | chroma extraction; body never reused | 16 / 9 / 4 by **longest** side (<=64 / <=80 / >80). A 56x84 crop with 7 frames was refused: HTTP 400, "56x84 supports at most 4 frames" (no charge). |
| `/edit-images-v2`, one sheet | one image, 32-512 px per side | by **mean side** (or square root of area; receipts cannot yet separate them). Billed: 224x180 = 10 (x3), 308x312 = 15 (x9), 336x336 = 15 (x10), 392x252 = 15, 392x270 = 15 (x3), **392x284 (mean 338) = 15**, 392x360 = 25, 448x420 = 25 (x2). Quote with the app's 336 edge, which never under-quotes. | inside the sheet | chroma extraction; body never reused | whatever fits 512 px |
| `/inpaint-v3`, packed grid | 32-512 px; Tier 2 above 256 per side | mean side, as `gridEstimate` (336x336 = 15, x4). No 1-2 gen price exists: the "1" in `pixellab-plans.md` is the minimum tier. | protected cells | mask protects outside | as edit-images-v2 |
| `/edit-image-pixen` | source <=256 per side, sides multiple of 4, prompt <=500 chars | 1 per call (23 receipts) | inside the image | no | 2x2 at 92 px |
| `/edit-image-pro-flash` | custom 32-256 px | free quotes: 5 (64), 6 (128-184), 9 (256) | one reference | no | as Pixen |
| `/transfer-outfit-v2` | 32-256 px | not measured | `reference_image` | no | 15 / 8 / 3: one fewer than edit-animation-v2 |
| skeleton (`/animate-with-skeleton-v3`) | as today | 3 per 6-frame view (12 receipts) | dressed keyframe | yes, but on a separate body | n/a |

Not tested: `/inpaint-image-pro-flash` preserves unmasked pixels exactly but is outside the allowed model list.

## Experiments

Images in `spikes/api/out/x31/<arm>/` (git-ignored). Each call keeps `<item>.s<seed>.<n>.plan.json` (exact request with images elided, full prompt), the submitted `sheet.png`/`mask.png`/`in<i>.png`, the returned `<n>.<i>.png` and its receipt `<n>.json`. `<item>.s<seed><variant>.eval.png` shows the standing design and every frame recomposed on the real body (3x for viewing only).

| Arm | Route and layout | Sheets / calls | Billed | Result |
|---|---|---:|---:|---|
| `eiv2-prod` | **production-style:** 7x3 cells of 56x90 (392x270), 4 px margins, row = [reference, 6 frames] per view | 3 (feet, torso outer, hat) | 45 | 3/3 pass, no edge contact, clean on inspection (boot shafts shorter than the standing design) |
| `eiv2-prod-4v` | same with a 4th row: the stored west frames and the mirrored east design (392x360) | 1 (torso outer) | 25 | pass, clean in all 4 views |
| `eiv2-prod-pad14` | the 7x3 layout padded to 392x284 (billing probe, mean side 338) | 1 (short hair) | 15 | pass; billed 15 |
| `eiv2-view` | one 4x2 sheet per view (224x180), same windows | 3 (torso outer) | 30 | pass; slightly tighter than the all-view sheet (area CV 0.019 vs 0.039) |
| `eiv2-all` | first round: 6x4 cells of 56x84 (336x336), one view per row, references in the last row, 1-2 px margins | 8 (4 items x seeds 7, 11) | 120 | 8/8 pass with registration (4/8 without); clean on inspection |
| `eiv2-all-c7` | same frames as 7x3, frames counted | 1 | 15 | pass |
| `eiv2-dense` | every frame twice: 39 cells, 448x420 | 2 | 50 | 2/2 pass |
| `s2-eiv2-all` | 64 px fixture, 7x6 cells of 44x52 (308x312), frames counted across rows, 12 blank cells (cross-punch exists only facing south) | 8 worn + 1 sword | 135 | QA: 7/8 worn pass (2 warn). Inspection: 3/8 have back-view south frames (hair seed 7 frame 7, caught by G5; hair seed 11 frame 7 and helmet seed 7 frames 6-7, passed QA). Sword fails. |
| `anchored` | production edit-animation-v2, 92 px, 2 calls per view | 12 | 120 | 2/2 pass |
| `inpaint-all` | inpaint-v3 on the `eiv2-all` sheet, references protected | 4 | 60 | 2/4 (hat never drawn; braid misregistered and body redrawn) |
| `pixen-*` | Pixen, 3 layouts and prompts | 23 | 23 | 0/5 (invented figures, turned views, unchanged targets) |
| `skeleton-live` | the app's `itemRoute.pose` request, raw outputs | 12 | 36 | 1/4 as the app scores today; G2 body mismatch in the east view |
| `ea2-trim` | edit-animation-v2 on 56x84 crops, 7 frames | 1 | 0 | refused (HTTP 400) |

Key images: `eiv2-prod/plate_carrier.s7.cut.eval.png`, `eiv2-prod-4v/plate_carrier.s7.cut.eval.png`, `eiv2-prod/bota_militar.s7.cut.eval.png`, `eiv2-all/cal_a_jeans.s7.eval.png` vs `anchored/cal_a_jeans.s7.reg.eval.png`, the 64 px swaps in `s2-zoom.png` (helmet seed 7 south 5-7, hair seed 11 south 6-7, hair seed 7 south 7) against the fixture's own front views in `s2-zoom2.png`, and the stored skeleton issue in `skeleton-stored/cal_a_jeans.s7.eval.png`.

### Measured detail at 92 px

| Item | Route | Billed | min body kept | max palette dist (after snap) | max area CV | within 12 of standing palette |
|---|---|---:|---:|---:|---:|---:|
| jeans | anchored | 60 | 0.991 | 6.5 (5.2) | 0.170 | 0.978 |
| jeans | sheet s7 / s11 | 15 / 15 | 0.997 / 0.987 | 6.5 (5.3) / 6.2 | 0.165 / 0.174 | 0.949 / 0.997 |
| braid | anchored | 60 | 0.992 | 3.1 (2.2) | 0.121 | 0.998 |
| braid | sheet s7 / s11 | 15 / 15 | 0.994 / 0.994 | 4.5 (3.2) / 5.4 | 0.083 / 0.090 | 1.000 / 0.998 |
| hat | sheet s7 / s11 / prod | 15 each | 0.995 / 0.995 / 0.997 | 6.5 (4.2) / 6.3 / 6.1 | 0.014 / 0.023 / 0.005 | 0.997 / 0.964 / n/a |
| short hair | sheet s7 / s11 / prod | 15 each | 0.996 / 0.996 / 0.990 | 5.2 (3.7) / 6.8 / 6.5 | 0.010 / 0.031 / 0.022 | 0.998 / 0.990 / n/a |
| boots | prod | 15 | 0.995 | 5.9 | 0.174 | n/a |
| plate carrier | prod / 4 views / per view | 15 / 25 / 30 | 0.995 / 0.995 / 0.999 | 6.3 / 8.1 / 5.7 | 0.039 / 0.065 / 0.019 | n/a |
| all four | skeleton (raw, app scoring) | 9 each | 0.937-0.986 | 0-1 | 0.012-0.137 | 0.997-1.000 |

- **Fit:** the item is drawn on the real frames and laid back over them; there is no separate body to drift from. Jeans off-body pixels per frame stay below the standing design's own count in every view (east 1-11 vs 21; the stored skeleton jeans had 48-73).
- **Consistency:** the same input frame drawn twice in one sheet differs in shape by 6-94 px (2-20 % of the item) and in exact color on about 70 % of item pixels.
- **Colors:** neither redraw route returns exact palette colors (exact share 0 for both). The app's snap brings both to the same level at 92 px. At 64 px palette distance was 10.9-17.1 before the snap and 11.5-15.1 after: small cells hold color less well.
- **Fixture truth (64 px):** IoU with the fixture's own accepted layers is about the same as the sheet route's seed-to-seed IoU for hair (0.80 vs 0.85) and vest (0.84 vs 0.83), lower for the cape (0.68 vs 0.77), and 0.42 for the helmet on seed 7 (vs 0.83 on seed 11): the comparison exposed the back-view helmet frames that QA passed.

## Cost per item per move

Generated views: 3 for 4 directions (west mirrors east), 5 for 8. Cells are crop windows with 4 px margins: 0.62 W x 0.92 H plus 8 px, capped at the frame (the widest measured content was 0.50-0.61 W and 0.81-0.89 H). Price by mean side with the 336 edge. Generated by [`costs.mts`](../../spikes/api/x31/costs.mts); full grid in `spikes/api/out/x31/costs.md`.

| Frame | Views (drawn) | Frames | Anchored today | All-view sheet | Per-view sheets | Skeleton (drifts) |
|---:|---|---:|---:|---:|---:|---:|
| 32 | 4 (3) | 8 | 30 | 10 | 30 | 9 |
| 32 | 8 (5) | 8 | 50 | 10 | 50 | 15 |
| 64 | 4 (3) | 6 | 30 | 15 | 30 | 9 |
| 64 | 4 (3) | 8 | 30 | 15 | 30 | 9 |
| 64 | 8 (5) | 8 | 50 | 25 | 50 | 15 |
| 92 | 4 (3) | 6 | 60 (receipt) | 25 (15 measured) | 30 (receipt) | 9 (receipt) |
| 92 | 4 (3) | 8 | 90 | 25 | 30 | 9 |
| 92 | 8 (5) | 8 | 150 | 40 | 50 | 15 |
| 128 | 4 (3) | 8 | 90 | 40 | 45 | 9 |
| 128 | 8 (5) | 8 | 150 | 65 | 75 | 15 |
| 192 | 4 (3) | 8 | 225 | 105 | 105 | 9 |
| 256 | 4 (3) | 8 | 225 | 150 | 150 | 9 |
| 256 | 8 (5) | 8 | 375 | 250 | 250 | 15 |

On the measured rigs (actual windows): 92 px with 56x90 cells costs 15 for 3 views x 6 frames (receipt), 25 for 3 x 8 or 5 x 8, and 30 / 50 per-view; 64 px with 47x58 cells costs 15 for 3 x 8 and 25 for 5 x 8. Per-view sheets never cost less than 10 each, so below about 80 px they cost the same as anchored and only the all-view sheet saves money.

Formula: cells per view = frames + 1 (its reference); group whole views per sheet; pick the column count that minimizes the price of `cols x cw` by `ceil(cells / cols) x ch` (each side <= 512), price 10 / 15 / 25 for a mean side <= 256 / <= 336 / larger; take the cheapest grouping. A view that does not fit one sheet is split with its reference repeated.

## Review round 1

DeepSeek's desk review (mid-run).

1. **Inpaint price.** Agreed and confirmed (15 at 336x336, 4 receipts).
2. **Ranking.** The one-sheet edit-images-v2 mode is now measured. Native multi-frame shifts were real but uniform per sheet (all cells moved together), fixed by one registration. Inpaint measured third (2/4). Pixen rejected on evidence (0/5); Pro Flash not run live.
3. **E0: is the skeleton drift a translation?** Mostly not. Registering the raw posed outputs on the real body over ±4 px cleared the 1 px G10 flags, but 3 of 4 items still failed G2 in the east view (23-58 body pixels differ): the separately animated body differs in shape. Widening `bestShift` does not fix the skeleton issue. Data: `e0.json`, `skeleton-live/eval.s7.posed*.json`.
4. **Per-slot policy.** Not supported for worn slots (the skeleton route failed the hat and braid as well as the jeans). Supported for held items, which the sheet route fails.
5. **Pass rate.** See round 2 for the corrected count.

## Review round 2

DeepSeek's adversarial review of the first findings, point by point. Every 0-generation check it asked for was run; the paid set cost 115 generations.

1. **Counting. Agree.** The first count mixed variants with independent inputs. Corrected, with the production-style sheets added: at 92 px, 18 sheets (3 of them one per-view set) over 6 items and 4 layouts, none failing QA or inspection; by DeepSeek's rule (item x seed, layout variants folded) that is 10 independent inputs, all clean. At 64 px, 8 worn sheets: 7 pass QA (2 warn), but only 5 are clean on inspection.
2. **Per-view price. Agree.** At 92 px one view fits 224x180 with 4 px margins and billed 10 (3 receipts), so per-view costs 30 for 3 views and the all-view sheet is 2x cheaper, not 3x. Below about 80 px a per-view sheet still costs 10, the same as anchored per view.
3. **Billing rule. Agree on the edge and the mislabel.** The dense sheet was 448x420, not 504x420. The cost model now uses the app's 336 edge. The probe at 392x284 (mean side 338) billed 15, so the 336 edge never under-quotes; it cannot separate mean side from square root of area (334 there).
4. **View checks do not run on edit cells. Agree, and it matters.** `dirGate` skips cells where `posed` is false, so G11-G15 and H4 never run on these frames. A synthetic whole-view swap (south frames carrying the north design, and east carrying north) passed the app's QA for all four 92 px items. Applying the existing `dirGate` to edit cells is not a fix: it missed the braid and jeans swaps and false-failed all 18 frames of the unswapped hat. A prototype coverage-signature gate ([`viewgate.mts`](../../spikes/api/x31/viewgate.mts)) false-alarmed on 9-26 % of real frames and caught 35-77 % of synthetic swaps. It did flag the real 64 px back-view frames, but it is not shippable. A reliable cross-view gate is unsolved; until then the route needs human review before saving, which is why it is a pilot. I retract the first doc's claim that the existing facing review applies.
5. **Coupled failures. Agree that one call carries every view; the salvage data already exists.** `itemQa` returns per-move-and-view verdicts: on the failed 64 px hair sheet only `walk/south` failed and the other 5 move-views passed. The app can publish passing views and re-roll the failed view on one per-view sheet (10). That needs code: `animateAnchoredItem` decides failures per call today, not per view.
6. **Crop margin. Fixed and tested.** Five production-style sheets with 4 px margins (56x90 cells): 0 edge contacts (the first round had 22 of 450 frames touching, at 1-2 px margins), and the 3-view layout still billed 15 as 392x270 (one view per row, reference first), not 25.
7. **Blank 64 px cells. Agree.** 12 of 42 cells were empty (cross-punch exists only facing south), so that layout is not production-like. A production layout of the same 30 cells prices the same (15). All three back-view swaps happened in this frame-counted layout; whether the row layout prevents them at 64 px is untested.
8. **Fixture truth. Done.** Results above; the truth comparison caught the helmet swap QA missed.
9. **Palette snap. Done.** At 92 px it brings the sheet route to the anchored control's level (jeans 5.3 vs 5.2, braid 3.2 vs 2.2). At 64 px it helps little (vest 17.1 to 15.1, helmet 13.0 to 11.8).
10. **Registration. Partly agree.** Cut-origin registration over ±5 px gives the same shifts and the same results as translating, without dropping edge pixels; use it. The shift is not deterministic per input (64 px hair: (1,-1) on seed 7, (1,-2) on seed 11); the first doc was wrong there. Reference cells: the model changes their shape by only 0-12 px of 900-1,550 opaque pixels but shifts the color of almost every pixel, so the whole sheet is re-rendered; the references are not redesigned.
11. **No stencil. Partly agree.** A redrawn mannequin appears as lost key pixels (G2) and key outside the body (G3); body kept never fell below 0.949 on a passing sheet. Stray item pixels away from the slot are not bounded the way Redraw's stencil bounds them (two stray pixels under the feet on short hair seed 7). Reuse the Redraw stencil; not tested here.
12. **Budget. Agree.** 674 billed in total; this round's paid set was 115.

**On its proposed scope:**
- **Worn, non-held, 4 directions: agree.**
- **Lower bound 64 px: disagree.** 64 px is where the only silent failures occurred, so the pilot should start at 80 px.
- **8 directions on per-view sheets: agree, as a default until tested.** No diagonal frames exist to test the all-view sheet; it would cost 40-50 at 92 px either way.
- **Capes, back items and torso outerwear on per-view sheets: disagree for torso outerwear.** The plate carrier was clean on the all-view sheet in 3 and in 4 views. Capes and back items were tested only at 64 px (cape: passed QA, clean, but lowest truth IoU), so per-view for those is a reasonable caution.
- **Anchored as fallback and held items unchanged: agree.**

## Failure modes

- **Front/back swap on single frames** (64 px: 4 of 216 frames on 3 of 8 sheets; 92 px: none in 18 sheets). Mostly invisible to the app's QA; needs a view gate or review.
- **Whole-sheet offset** (12 of 27 worn sheets, 1-3 px, varies by seed). Register before cutting.
- **Coupled views:** one call carries every view; salvage per view.
- **Color drift at small cells** (64 px palette distance up to 17.1).
- **Content outside the crop window:** 4 px margins removed edge contact here; fall back to full frames when the margins do not fit.
- **Design drift within the gates:** boot shafts shorter than the standing design in the walk frames.
- **Held items:** grip and orientation unstable.
- **Pricing:** bands are inferred from receipts; quote with the 336 edge.

## Recommended pilot design

1. A new move route beside `animateAnchoredItem` in [`run.ts`](../../app/src/lib/items/run.ts): per view, a crop window (union of the move's body frames and the dressed reference, 4 px margins, fixed for the view, never rescaled); one row per view, `[reference, frames...]`; views grouped into the cheapest sheets by the formula above (reuse `packGrid`/`cutGrid` and a picker like `repairGridLayout`), `/edit-images-v2` `edit_with_text` with `no_background: true` and the row prompt in [`arms.mts`](../../spikes/api/x31/arms.mts) (`eiv2-prod`).
2. Cut-origin registration of each returned sheet (±5 px, opaque-mask IoU against the submitted sheet), recorded in provenance.
3. `extractCell` (edit cells), the Redraw stencil, `postProcess`, `itemQa` and `standingDyeMatcher`, as `animateAnchoredItem` does.
4. Per-view verdicts from `itemQa` clips: publish passing views, offer a per-view re-roll (one sheet, usually 10) for the rest.
5. A review step before saving, like Redraw's comparison, until a cross-view gate exists. Extending G14/H4 to edit cells as-is does not work (point 4).
6. Quote with `planGens`-style pricing by mean side and the 336 edge. PixelDoll already requires Tier 1 for edit-images-v2.
7. Scope: worn, non-held items, 4-direction rigs, 80-128 px frames, opt-in per move (alongside the existing anchored/skeleton choice); anchored as the fallback; held items unchanged.

## Uncertainty

- 18 sheets at 92 px on one character; the anchored control is one seed for two items. No frame above 92 px was tested.
- The 64 px evidence uses a fixture with rebuilt references, no joints, blank cells and a frame-counted layout; it shows the risk, not the row layout's behavior at 64 px.
- No 8-direction or diagonal view, no cape or back item at 92 px.
- Swap detection was done by eye on every sheet. Small single-frame swaps at 92 px could still have been missed.

## Reproduce

From `spikes/api/x31` (keys resolve server-side through `../c25/y_env.mts`; outputs in `spikes/api/out/x31`):

```sh
node --experimental-transform-types --no-warnings probe.mts live                       # free: balance, Pro Flash quotes, extents
DRY=1 node --experimental-transform-types --no-warnings arms.mts eiv2-prod plate_carrier # build inputs only
node --experimental-transform-types --no-warnings arms.mts eiv2-prod plate_carrier 7     # paid; never resends a sent call
REG=cut SNAP=1 GATE=1 node --experimental-transform-types --no-warnings eval.mts eiv2-prod 7
SWAP=south:north REG=cut node --experimental-transform-types --no-warnings eval.mts eiv2-all 7
X31_SRC=s2 REG=cut TRUTH=1 node --experimental-transform-types --no-warnings eval.mts eiv2-all 7
node --experimental-transform-types --no-warnings viewgate.mts 0.1                      # prototype view gate
node --experimental-transform-types --no-warnings e0.mts                                # E0 offline analysis
node --experimental-transform-types --no-warnings costs.mts                             # cost table
```
