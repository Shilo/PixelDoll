# Adversarial review of `compare/comparison.md`

Date: 2026-11-10. Offline only, no PixelLab call, no edits to app/src, app/test or the board. Scripts in this folder import
production code read-only; run with `node --experimental-transform-types --no-warnings <script>`:

- `rimlib.mts`, `rim-bench.mts` -> `rim.json`: seam metrics on the **shipped composite** (`recompose`: base minus `cut`, item over), 568 posed bench frames, 59 rest keyframes, 304 matched trial frames.
- `rim-cut.mts`: what-if for a subtractive posed rim cut.
- `rim-sheet.mts` -> `worst-rim.png`, `tunic-se.png`, `tunic-se-zoom.png` (1x, 4x, 4x with seam marks: red = base outline peeking past gear, yellow = base color peeking, cyan = 1 px gap).

## 1. Independent findings (before reading the comparison)

### 1.1 The headline metric measures pixels that never ship

`fitlib.mts` `friend` = (model key body XOR real base) **outside dilate(item, 1)**. The model's key body is discarded by
extraction; only the item layer ships over the frozen base. So the 21.6 to 36.0 px per frame (and the third party's 19.5 px)
quantify how far the throwaway mannequin drifts, not how the item sits on the base. Both the third party's diagnosis and the
comparison's rebuttal lean on this number. The metrics that touch shipped pixels are `jut`, `holeBare` and `floatPx`, and
`floatPx` ignores exactly the 1 px band (`!bare1`), which is the band that matters in pixel art.

### 1.2 What the "rim" actually is

On the shipped composite I counted base pixels that touch the item (8-neighborhood), are visible, and lie where the model drew
nothing (outside its own figure). Visually (`tunic-se-zoom.png`, `worst-rim.png`) these are:

- mostly the **base's dark outline running 1 px outside the item's own outline** (a doubled, 2 px thick edge), in vertical runs
  of 2 to 6 px, typically on the back edge of a tunic and the shin edge of boots;
- occasionally a **sliver of the base's grey shirt or skin** past the garment edge (yellow);
- not an item outline doubled by itself and not an arm-shaped notch (posed `holeBare` equals the rest control).

1 px gaps (cyan) are present at the same rate on rest keyframes and on edit/transfer arms (tunic south: rest 19, walk 12.6;
trial edit 15.5, transfer 14.6): they are garment geometry (armpits, hem), not posing.

| Class | Posed rim px/frame (dark + color) | Rest (painted on real) | Posed frames >= 3 px | Rest >= 3 px | Max |
| --- | --- | --- | --- | --- | --- |
| torso_outer (a-chest, b-tunic) | **1.51 + 0.26** | 0.09 + 0.27 | **30 %** | 9 % | 11 |
| feet (a-boots) | 1.77 + 0.04 | 1.33 | 33 % | 33 % | 9 |
| back (capes) | 1.21 + 0.11 | 1.36 | 21 % | 18 % | 8 |
| off_hand (bow) | 1.25 + 0.04 | 1.00 | 13 % | 0 % | 5 |
| main_hand (sword, axe) | 0.51 + 0.19 | 0.33 | 8 % | 0 % | 9 |
| head (helmets, hoods) | 0.45 + 0.11 | 0.27 | 3 % | 0 % | 11 |
| hair | 0.06 | 0 | 0 % | 0 % | 2 |

Worst views: b-tunic walk south-east (4.3 + 0.6 per frame, max 11), b-tunic walk south and north (3.3), a-boots walk north
and east (about 3). Matched trials: a-cape east re-posed 1.1 vs 0.1 for edit and transfer; b-cloak east 0.4 vs 0.0.

Visibility: at 1x a dark pixel beside a dark outline is nearly invisible in a still. In motion it is a **frame-to-frame
flicker of edge thickness** on torso garments (57 % of posed torso frames have >= 1 px, against 9 % at rest), which a pixel
artist would notice on a south-east walk; the color slivers (about 0.3 px per frame) are the visible part. Low severity,
real, and concentrated in torso garments, not uniform.

### 1.3 Painting on real frames vs re-posing

- Caps (openapi): transfer-outfit-v2 15 frames <= 64 px, **8 at 65-80 px, 3 above 80 px**; edit-animation-v2 16 / 9 / 4
  (one slot is the reference in PixelDoll's anchored use). Pro editor tools bill per grid (10/15/25 gens by size);
  animate-with-skeleton-v3 bills 2 / 3 / 4 gens for 3 / 8 / 15 frames regardless of canvas.
- Measured cost on the matched east-cape pairs: $0.32 edit vs $0.075 plus 3 subscription gens for posing (about 4x). For held
  items on the 112 px padded canvas (3 frames per transfer call) the gap is 10x or more.
- Color: posing keeps the approved palette (mean frame distance 0.12-0.18) vs 7.8-9.0 for edit/transfer **before** the
  standing-dye matcher; nobody measured the gap after the matcher, so "worse design lock" is likely true but overstated.
- Failures (2026-11-06, 60 calls): transfer 2 of 16 clips failed gates (G2/G3), edit 0 of 16 raw (1 shared-ramp edit failed,
  1 palette warning); skeleton pose 12 of 12 passed.
- Hybrid (re-pose, then paid repair of misfit frames): not worth it for a 1 px rim (a repair call at 80 px costs 10+ gens for
  at most 8 frames and repaints the item, adding the color noise posing avoids). The per-clip inpaint-v3 fallback already
  covers real gate failures. A free subtractive fix covers most of the rim (section 3).

## 2. Verdicts

| Idea | Comparison | Mine | Evidence |
| --- | --- | --- | --- |
| Paint on real frames | Reject as default | **Agree on the decision, disagree on the proof.** The decisive argument is cost (4x to 10x) and gate failures, not fit. "No misfit beyond a 1 px rim" is right, but the rim is concentrated: torso garments get 5x the rest-control rim and 30 % of frames >= 3 px. The comparison had no torso pose arm and pooled across classes, where greathelm ear cuts and capes dominate. | 1.2 table; `fitlib.mts` `friend`, `floatPx` |
| Selective color lock | Reject | **Agree, medium confidence.** Skeleton pose palette distance 0.12 is strong evidence; but "off-palette 0 %" does not rule out shade swaps inside the palette, and the 33.6 % axe swing was attributed to visible-shade share without a visual check. | trials table; `fill-swing.mts` |
| Armed carrier | Test, about 40 gens | **Disagree with the design and timing** (section 4). | |
| Locked helmet | Reject, optional free Hurt test | **Agree.** Helmet rim 0.56 vs 0.27 rest; only 3 % of frames >= 3 px. | 1.2 table |
| Cover rule (1 px into air) | Reject; "jut 1.8 posed vs 1.6 rest, posing does not create the problem" | **Agree with rejecting the additive rule (PixelDoll never draws), disagree with the reasoning.** The pooled jut hides the per-class effect: bench `jut` itself shows a-chest walk 1.4 vs 0.0, b-tunic walk 2.8 vs 0.8. A subtractive variant is worth an offline test. | `bench-fit.json` rows 6-7, 22-23 |
| Hidden-piece repaint | Reject, not applicable | **Agree.** Items are dressed alone on the bare key body. | `chromaPrompt` |
| Shift restore | Reject | **Agree.** `clipToStencil` plus G10 fail is the safer contract. | `items.ts` |
| Part map | Reject | **Agree** (no consumer). | |
| Mirror / estimate-skeleton reuse | Reject | **Agree** (about 0.1 gen per frame saved). | |
| pixminimax twins | Reject | **Agree.** Body becomes the model twin, breaking the frozen base (D3). | PLAN D3 |

## 3. What PixelDoll should change

1. **Offline experiment, medium confidence: a subtractive posed rim cut.** For posed cells, hide base pixels that touch the
   item, lie outside the model's own figure, sit on the base's outer edge, and have no visible model-drawn body inward (so no
   outline is broken). It draws nothing, reuses the `baseCut` mechanism (today posed cuts are limited to the keyframe's
   `cutAllow`). What-if on the bench (`rim-cut.mts`): frames with >= 3 rim px drop feet 16 -> 0, capes 23 -> 2,
   torso 26 -> 16 (only 33 % of torso rim px are safe to hide; the rest border visible shirt), head 5 -> 4. Needs a visual
   check in motion and the bench before adoption; abandon it if it notches limbs.
2. **Measurement fix, high confidence:** any future fit claim should use shipped-composite seam metrics per item class
   and view (as in `rimlib.mts`), not `friend`/`two_bodies`, and include a torso pose arm.
3. No route change. Re-posing stays the default; anchored edit stays the fallback where it already applies.

## 4. The proposed armed-carrier paid test

Problems:

- **Prior art ignored.** `docs/research/2026-11-02-weapon-aware-grip.md` already tested authoring the gripping hand before
  freezing the body (armed source, bounded disarm, freeze once): it "improves the sampled composites" but the guided repair
  damaged the weapon head and nothing was promoted. The new test should build on that, not restart.
- **Conflicts with one frozen base.** "A body move authored with a closed fist" per weapon class is a second body; every
  other item (gloves, bracers, a lantern) would then need dressing on both. The 11-02 route (author grip, disarm, freeze
  once) keeps one base; the proposed arm B does not.
- **Confounded.** Arm B is a new body animation, so a blind preference judges body motion as much as grip. A and B must share
  the stored skeleton keypoints and differ only in the hand description.
- **Underpowered and out of scope.** Two seeds, two views (east, NE), "3 of 4 pairs". The Ready card is about validating the
  current route in 8 directions, west grip and off-hand; the A/B covers none of west or off-hand.

Better order:

1. **Free first:** measure grip float on stored held clips (bench sword/axe/bow, the 11-02 green armed outputs): px between
   the item grip and the base fist per frame, per view; `closeGrip` notes 1-3 px offsets and 323 hole px left over 144 bow
   frames.
2. **Run the card as written, current route only:** one slash for 5 drawn views of Top-down 8 (incl. west via independent
   views), main-hand sword plus one off-hand item. Rough estimate 50-80 gens (item keyframe dressing plus 3 gens per posed
   8-frame clip; more if body slash clips must be generated). This produces the failure rate the carrier would have to beat.
3. **Only if grip fails in a meaningful share of views:** a carrier A/B per the 11-02 method, same keypoints, >= 3 seeds,
   including west and one diagonal, with a gate that the disarmed frozen base still dresses a non-weapon item. Estimate
   about 80 gens. Not now.

## 5. Limits

Bench views are 3-5 per case; no trousers or two-handed weapons. The 0.28 luminance cut separates outline from color
heuristically. "Safe to hide" is geometric and was not judged in motion. Hand-picked frames were checked visually; the
rest are counts.
