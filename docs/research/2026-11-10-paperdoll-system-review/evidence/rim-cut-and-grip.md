# Rim cut qualification (offline)

Date: 2026-11-10. Offline only: no PixelLab call, no edits to app/src, app/test or the board. Scripts in this folder import
production code read-only; run from this folder with `node --experimental-transform-types --no-warnings <script>`.

## 0. Pre-registration (written before any measurement)

### Rule under test ("rim cut")

For one cell of a worn item (slot class `worn`: feet, legs, torso_inner, waist, torso_outer, shoulders, arms, back; never
`held`, `rigid` or `base`), with base frame B, the item's final mask M (after postProcess), the PixelLab output O aligned to
the cell, and the existing round 3 cut K. Let V = base px visible in the composite (B alpha > 0, not in K, not in M). Let
"open" mean a pixel outside V and M (transparent in the composite) or off the canvas. A base pixel p is hidden when all hold:

1. p is in V and O alpha(p) < 128 (the model drew no figure there).
2. Some 4-neighbor of p is in M (touches the item).
3. Some 4-neighbor of p is open (p lies on the visible silhouette: a 1 px outline or sliver).
4. For every 4-direction d with p + d in M, p - d is not in V (nothing of the body continues beyond p, opposite the item).
5. Every 4-neighbor of p that is in V is itself on the silhouette (has an open 4-neighbor): p never borders body interior,
   so it cannot notch a limb, a hand, the face or a body part that continues past the item.

Hidden px join `Item.baseCut` for that cell (union with K), so compose, Studio and the `<base>~<item>` export bake treat them
exactly like today's cuts: hidden only while the item is worn, unioned across worn items. Applies to rest keyframes too unless
measurement shows rest frames gain nothing or get worse (decided in section 3).

### Pass rule (all must hold)

- P1: frames with >= 3 rim px (rimlib.mts definition: visible base px, 8-touching the item, O alpha < 128) drop by at least
  half for posed torso_outer, feet and back on the frozen bench.
- P2: zero notches on limbs, hands or face, judged on 6x before/after sheets of every changed frame of the worst clips.
- P3: held items (main_hand, off_hand), helmets and hair: zero px changed.
- P4: no visible flicker added: 4x before/after animated GIFs (ffmpeg) of the worst 6 clips; plus a numeric proxy: per clip,
  frame-to-frame changes of the composite's bottom row and width must not increase.
- P5: two or more worn items cutting at once compose through production `composeCell` to the union, the export bake
  (`withTuckVariants`) matches compose, and unequipping an item restores every px it cut.

## 1. Prototype and files (all in this folder)

- `rimcut.mts`: `rimCut(cell, slot)` implements rules 1 to 5 verbatim (v1, the pre-registered rule). `RIM_V=2` adds a
  stricter, post hoc variant (every visible 4-neighbor must also be outline-dark); it only lowered the effect and is not proposed.
- Cuts are unioned with the cell's existing round 3 `cut` and measured on the shipped composite (`recompose`) with the
  reviewer's `../challenge2/rimlib.mts` `seam`, so "rim px" has the review's definition (visible base px 8-touching the item
  where the model drew nothing).
- `measure.mts` -> `measure.json` (v1; `measure-v1.json` copy, `measure-v2.json`); `summarize.mts` -> `summary-v1.txt`, `summary-v2.txt`.
- `crops.mts` -> `crops/<case>.png`: 8x crops (24x24 px around the cut) of every changed frame, before | after | cut px magenta.
- `sheets.mts` -> `sheets/<case>.png` (6x full frames of every changed frame) and `gif/*.gif` (4x, before left, after right,
  8 fps, ffmpeg) for the worst 6 clips; `gif/strip-*.png` filmstrips.
- `probe.mts <case> <key>`: text map of a cut's neighborhood. `diag.mts <slot>`: why remaining rim px were not cut.
- `multi.mts`: P5 through production `composeCell` and `withTuckVariants`. `grip.mts` -> `grip.json`: task 3.

## 2. Results (bench: 568 posed frames, 59 rest keyframes; trials: 304 matched frames)

### Bench by slot

| Slot | n | rim px/frame before | after | frames >= 3 before | after | cut px/frame (dark share) | changed frames |
|---|---|---|---|---|---|---|---|
| torso_outer posed | 88 | 1.77 | 1.24 | 26 (30 %) | **18 (20 %)** | 0.53 (87 %) | 21 |
| feet posed | 48 | 1.81 | 0.77 | 16 (33 %) | **3 (6 %)** | 1.04 (98 %) | 22 |
| back posed | 112 | 1.32 | 0.61 | 23 (21 %) | **7 (6 %)** | 0.71 (98 %) | 33 |
| torso_outer rest | 11 | 0.36 | 0.36 | 1 | 1 | 0 | 0 |
| feet rest | 3 | 1.33 | 0.33 | 1 | 0 | 1.00 | 1 |
| back rest | 11 | 1.36 | 0.18 | 2 | 0 | 1.18 | 3 |
| head, hair, main_hand, off_hand (posed + rest) | 370 | unchanged | unchanged | 16 | 16 | 0 | **0** |

v2 (post hoc, stricter): torso 26 -> 21, feet 16 -> 3, back 23 -> 8. Not better on any class.

### Bench by case and view (posed)

| Case view | n | rim/frame before | after | >= 3 before | after |
|---|---|---|---|---|---|
| a-boots south / east / north | 16 each | 0.38 / 3.56 / 1.50 | 0.31 / 1.25 / 0.75 | 0 / 13 / 3 | 0 / 2 / 1 |
| a-cape south / east / north | 16 each | 0.25 / 0.06 / 0.44 | 0.25 / 0.06 / 0.13 | 0 / 0 / 1 | 0 / 0 / 0 |
| a-chest south / east / north | 16 each | 0.50 / 0.94 / 1.31 | 0.50 / 0.31 / 1.19 | 0 / 2 / 5 | 0 / 1 / 4 |
| b-cloak S / SE / E / NE / N | 8 each | 2.88 / 1.25 / 0.88 / 2.38 / 4.75 | 1.00 / 0.63 / 0.88 / 1.38 / 1.00 | 4 / 1 / 1 / 2 / 8 | 1 / 0 / 1 / 1 / 1 |
| b-tunic S / SE / E / NE / N | 8 each | 3.50 / 4.88 / 0.63 / 1.63 / 3.38 | 3.25 / 2.13 / 0.38 / 1.00 / 2.88 | 5 / 6 / 1 / 2 / 5 | 5 / 4 / 0 / 0 / 4 |
| n-cloak128 south / east / north | 8 each | 1.25 / 1.25 / 2.38 | 0.50 / 1.25 / 1.00 | 1 / 2 / 3 | 0 / 2 / 1 |

### Matched trials (raw conditioning; 16 frames per row)

| Case arm view | rim/frame before | after | >= 3 before | after |
|---|---|---|---|---|
| a-cape pose east | 1.13 | 0.88 | 4 | 0 |
| a-cape edit, transfer (east, south) | 0.06 to 0.13 | unchanged | 0 | 0 |
| a-chest edit east / transfer east | 0.69 / 1.13 | 0.19 / 0.25 | 1 / 3 | 0 / 0 |
| a-chest edit, transfer south | 0.00 | 0.00 | 0 | 0 |
| b-cloak edit south / transfer south | 1.63 / 1.13 | 0.00 / 0.25 | 0 / 2 | 0 / 1 |
| b-cloak pose east; edit, transfer east | 0.44; 0.00 | 0.44; 0.00 | 0 | 0 |
| b-tunic edit east / transfer east | 0.63 / 0.81 | 0.13 / 0.25 | 1 / 1 | 0 / 0 |
| b-tunic edit south / transfer south | 0.69 / 2.56 | 0.56 / 2.19 | 0 / 2 | 0 / 2 |
| b-greathelm pose east (head) | 0.13 | 0.13 | 0 | 0 |

### Why torso rim stays

Remaining rim px on posed torso frames, first failing condition: body beyond (rule 4: arm or shirt continues past the px)
52; borders body interior (rule 5) 20; not on the silhouette (2 px slivers) 20; diagonal-only touch 17. These are mostly an
arm's outline or a 2 px shirt sliver beside the garment. Hiding them would cut a limb outline, which the rule forbids by
design, so most torso rim is not something a safe subtractive cut can fix.

## 3. Verdict against the pre-registered rule

| Criterion | Result | Verdict |
|---|---|---|
| P1 frames >= 3 rim px halve | feet 16 -> 3 (-81 %), back 23 -> 7 (-70 %), **torso 26 -> 18 (-31 %)** | **FAIL (torso)** |
| P2 no notches | all 80 changed bench frames reviewed on 8x crops and 6x sheets: 0 notches on limbs, hands or face. Two suspicious tiles (a-chest walk/east/5 shoulder, n-cloak128 walk/south/5 beside the arm) were probed per pixel: the item draws its own 1 px dark outline and the cut px is the base outline 1 px outside it, so the edge becomes single and the limb is untouched | pass |
| P3 held, helmets, hair unchanged | 370 cells, 0 px changed | pass |
| P4 no flicker added | 71 posed clips: bottom-row changes 156 -> 156, width changes 420 -> 420, frame-to-frame rim change 536 -> 438 (less edge flicker). GIFs checked as filmstrips, not played in motion | pass on proxy and stills; motion viewing left to a human |
| P5 multi-item, unequip | a-chest + a-boots + a-cape on body A, 48 frames, 67 cut px: union hidden (0 failures), unequip restores (0), bake equals compose (0), no interior exposed, no overlap | pass |

Rest frames: apply too. They gain (back 2 -> 0, feet 1 -> 0 frames >= 3; n-cloak128 north rest 10 -> 2 rim px) and never
lose, and a rim on rest only would show as a thickness change when idle switches to walk.

**Overall: FAIL as pre-registered (P1 torso).** It passes every criterion for feet and back.

### Export cost (found while checking P5, decisive for adoption)

Today only items with `baseCut` (hoods, great helms) or slots that clip `body` make base variants. Export bakes one
`<base>~<items>` sheet set per combination: product over slots of (items + 1), minus 1, capped at `MAX_BODY_CUT_VARIANTS` =
256 (app/src/lib/compose/compose.ts:113-137 and :253). With a rim cut nearly every worn item gets a `baseCut`: 3 tops, 3 boots,
3 capes -> 63 base variants (0 today); 6 / 6 / 5 -> 293, so export throws. Even limited to feet and back, 6 boots + 6 capes
need 48 full base sheet sets. That cost is out of proportion to 0.5 to 1 px per frame.

## 4. Production change (not recommended now)

Only if the owner accepts feet and back despite the torso fail and the export cost, and decides the variant cap first:

- app/src/lib/items/items.ts near :1644 (`cutIndices`): add `rimCut(c, slot)` with rules 1 to 5, slot class `worn`
  (restricted to feet and back).
- items.ts:3089 in the item builder, on final cells after postProcess: `cut = union(c.cut, rimCut(c, slot)); if (cut) baseCut[a][d][i] = cutIndices(cut)`.
  Leave `dressedKeys`' keyframe cut (run.ts:321-336) alone so `cutAllow` and the head-band rule (D22) stay as they are.
- No compose or export code change: `cutAt`, `cutBase`, `withTuckVariants` already handle it; export validation (generic.ts:16) accepts sorted indices.
- Tests: items.ts selfTest synthetic cells (a 1 px outline run outside the item is cut; an arm beside the item, body beyond,
  is not; a px bordering body interior is not; held and rigid slots return nothing). compose.ts selfTest already covers union,
  unequip and bake. Regenerate docs/testing/bench.md (Cut px column changes); `npm run check`, `npm test`, e2e `studio`.

## 5. Task 3: grip float on stored held clips

Stored data: bench a-sword96 and a-axe96 (main_hand, walk and slash) and a-bow96 (off_hand, walk), body A, views south,
east and north, 129 frames including rest keyframes. The 2026-11-02 weapon outputs (`spikes/api/out/weapon-aware-2026-11-02/`
and siblings) are not present locally (ignored, never committed), so no west, diagonal or 8-direction held data exists offline.

Metric: Chebyshev gap between the item and the nearest base px within 3 px of the requested wrist keypoint (RIGHT ARM or
LEFT ARM; 0 = touching or overlapping), plus the item's distance to the wrist point.

| Item | frames S / E / N | gap 0 | gap >= 1 | wrist to item mean / max px, S; E; N |
|---|---|---|---|---|
| sword | 17 / 17 / 17 | all | 0 | 1.6 / 1.9; 2.1 / 2.5; 1.6 / 2.4 |
| axe | 17 / 17 / 17 | all | 0 | 1.4 / 2.6; 1.9 / 2.5; 1.9 / 2.9 |
| bow (off hand) | 9 / 9 / 9 | all | 0 | 1.4 / 2.1; 2.3 / 2.5; 1.8 / 2.3 |

No stored held frame floats: every item touches the hand region and lies within 2.9 px of the wrist point. West is the mirror
of east in these rigs and inherits east's numbers; diagonals and generated west are unmeasured. The stored data gives no
reason for a carrier test; "Validate weapon actions" should first produce 8-direction held clips with the current route and
rerun `grip.mts` on them. Limit: the 3 px hand disk includes forearm px, so a weapon lying along the forearm also reads as gripped.
