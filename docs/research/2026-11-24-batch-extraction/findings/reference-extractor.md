# Reference-guided deterministic extraction for a shared-body batch

2026-11-24. Offline research for [the brief](../BRIEF.md), branch `research/batch-item-extraction`.
No paid PixelLab calls, no credentials, no app code changed. Every number comes from
`app/public/fixtures/s2` by alpha-compositing the accepted item layers and injecting the drift measured
in [`separation-baseline.md`](separation-baseline.md).

Scripts: [`../reference_extractor.py`](../reference_extractor.py), [`../verifier_sweep.py`](../verifier_sweep.py).
Outputs: [`../out_ref/tables.md`](../out_ref/tables.md), [`../out_ref/verifier.md`](../out_ref/verifier.md),
`../out_ref/metrics.json`, `../out_ref/verifier_rows.json`. `harness.py` gained one optional
`hair_shift=True` argument on `apply_drift` (default preserves the old behavior) so the 1 px geometry
variant can exclude the 2 px hair shift.

## Answer

**Disjoint items: yes, ship it, with one pre-pay filter.** On the Rule C group
(`vest_leather`, `hat_wizard`, `sword_steel`) the extractor is pixel-exact on accepted art and under
palette drift (100% precision, recall and strict IoU, 0 wrong-item pixels in 42 item-frames). Under a
1 px shape change it still makes **0 assignment errors** (3 wrong pixels out of 8,054, 0.04%) and reaches
**96.0% tolerance-1 IoU** with 95.1% tolerant recall, while strict IoU falls to 59.9%. The strict loss is
silhouette change, not separation.

**One disjoint pair must not be auto-batched even though Rule C calls it disjoint:**
`helmet_steel + sword_steel`. Its reference palettes share gray values within the measured drift distance,
and the extractor puts 4.6 to 14.2% of the helmet's pixels on sword pixels in 13 of 54 item-frames. A
palette-collision check on the accepted reference palettes must join the slot and 2 px checks. Excluding
that pair, the disjoint set has 0 assignment errors in every variant and its weakest tolerant IoU is 94.0%.

**Overlapping items: still no.** Tolerant IoU is 98.0% on exact art, but 27 of 488 item-frames have a
wrong-region assignment, rising to 99 under a 1 px shape change; every overlapped pixel of the lower item
is absent from the composite and cannot be invented.

**Verifier: not an auto-accept gate.** It catches gross failure (empty layer, area collapse, z-order
violation) with 0% false fail on the Rule C group's exact and palette art, but on the wider disjoint set it
catches only 7 of 13 assignment-error frames (46.2% false pass), and under the stricter "unusable layer"
bar it misses 89.6%. On the Rule C group there is nothing to catch, so its 0% false-pass there is not
evidence of skill. Use it to route review and to block gross failures, not to certify a layer.

## What "assignment error" means here, and what is just shape

| failure class             | test                                                                                                     | product meaning                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Assignment error**      | the item's pixels include more than 3% that belong to another item's visible layer, or the item is empty | the layer is wrong; a human must not accept it                                                   |
| **Shape-only difference** | strict precision or recall below 98/95% while the assignment is clean, and tolerance-1 metrics are high  | the generated silhouette legitimately differs by about a pixel; the layer is usable as generated |
| **Occlusion loss**        | accepted pixels of the lower item covered by a higher item                                               | absent from the composite; no extractor can recover them                                         |

Every table below reports both strict (pixel-exact against the accepted layers) and tolerance-1 metrics.
Tolerance-1 precision is the share of predicted pixels within 1 px of the visible accepted layer, recall
the reverse, and `IoU t1` is `(|P∩G₁| + |G∩P₁|) / (|P| + |G|)`. Visible pixels exclude pixels covered by a
higher accepted item, so hidden pixels never count as misses.

## Method

### Data and reference

64 px cells, 3 stored directions, walk 8 frames, cross-punch 6 frames (south only). The reference cell is
`walk/south/0` (tallest body silhouette). Colors come from that one cell. The spatial reference is the
standing cell of each scored direction (`walk/<dir>/0`) because the item's silhouette differs by direction;
it is registered to the frame by the integer shift between body-mask centroids. Cross-punch has no standing
cell, so it uses `walk/south/0` registered the same way. The reference cell of each direction is given, not
extracted, and is excluded from scoring.

Directions where an item has no accepted pixel at all are skipped (the wizard hat has no north art and no
cross-punch sheet). This is app-side knowledge from the accepted reference, and it matches the detector's
pair set.

### Composite and drift

The harness paints the items in slot z order with no body. The baseline found `with_body` and `no_body`
identical (0 px), so the body is omitted. The union is the composite alpha, which is exact in this
simulation; a real extractor must build it against the frozen base. Drift is the measured model:

| variant    | geometry                                                         | palette                                      |
| ---------- | ---------------------------------------------------------------- | -------------------------------------------- |
| `exact`    | none                                                             | none                                         |
| `palette`  | none                                                             | per-item constant RGB offset of 11.5 to 17.1 |
| `geom1`    | per-item 1 px 8-connected dilation or erosion                    | none                                         |
| `geometry` | `geom1` plus the measured hair shift of 2 px down and 1 px right | none                                         |
| `combined` | `geometry`                                                       | `palette`                                    |

### Recommended algorithm

Per item, per frame:

1. **Color likelihood from the accepted reference.** `d_i(p)` is the Euclidean RGB distance from the
   pixel to the nearest color in item `i`'s reference palette; `L_i = -0.5 * (min(d_i, 60) / 8)²`. The
   sharp 8 RGB scale is important: a flat Gaussian (18) makes near-identical colors (hat gold 130,109,52 vs
   sword hilt 121,109,57) tie and produces 21 to 25 wrong pixels.
2. **Reject background.** Chroma-key ramps (green, magenta, blue, azure, 5 stops each, tolerance 12) and the
   known base palette (distance below 5) are not item pixels, unless the pixel is an exact item color. On
   this fixture the reject class fires on 0 px; it is a safety valve for a real generation.
3. **Soft slot band.** The slot band comes only from the current frame's body geometry (the harness
   `bands_for_body`: row fractions of the body silhouette plus a hands band for columns outside the
   vertical core). Its distance transform enters the score with weight 0.5 and sigma 5. This is a
   tie-break, not a gate.
4. **Soft reference and temporal priors.** Distance transforms of the registered reference mask and of the
   previous frame's predicted mask, weights 0.4 each, sigmas 4.5 and 1.5, distances capped at 12 and 4.
5. **Z-order.** The per-pixel winner is the argmax score. If another item is within 0.15 score and has a
   higher z, it takes the pixel, and the lower item records it in `lost_to_z` (the pixels it can no longer
   recover). Claim below score -9 is unassigned.
6. **Component cleanup and temporal inheritance.** Per-item 8-connected components under 2 px are dropped
   unless they continue the previous mask. A small per-item fragment (at most 32 px) may switch to another
   item only when exactly one other item's previous mask is within 1 px and the summed score is within 0.9.

The measured contribution of the priors and the z margin on the **ship case** is zero: setting all three
prior weights to 0 and the z claim margin to 0.05 gives identical Rule C numbers (100% exact and palette,
96.0% tolerance-1 under `geom1`). The priors are kept because the verifier reuses the registered reference
masks and the z-order bookkeeping, not because they raise the ship number. They are not a fix for shared
palettes: with a flat color scale (18) they make the ship result slightly worse (21 to 25 wrong pixels).

### Parameters

| parameter                      |          value | why                                                                  |
| ------------------------------ | -------------: | -------------------------------------------------------------------- |
| color sigma / cap              |         8 / 60 | separates near-duplicate palettes; cap stops one far item dominating |
| reference sigma / cap / weight | 4.5 / 12 / 0.4 | 1 to 2 px dilation effect, soft                                      |
| band sigma / cap / weight      |   5 / 12 / 0.5 | body-derived slot band, tie-break                                    |
| temporal sigma / cap / weight  |  1.5 / 4 / 0.4 | previous frame stability                                             |
| claim score                    |             -9 | keeps the union's pixels without certifying them                     |
| z claim margin                 |           0.15 | only near-ties go to the higher z                                    |
| sticky margin / radius         |     0.9 / 1 px | component-level temporal inheritance                                 |
| minimum component              |           2 px | the app's `chromaLayer` floor                                        |
| key / body reject              |         12 / 5 | chroma ramps and the known base                                      |

## Results: the Rule C group

`ruleC` is `{vest_leather, hat_wizard, sword_steel}`, 14 scored cells, 42 item-frames.
`ruleC_no_sword` is `{vest_leather, hat_wizard}`, 28 item-frames. Strict metrics on accepted art:

| scope          | item         | precision | recall | strict IoU | IoU t1 | prec t1 | rec t1 | area error | boundary p95 | z-lost px |
| -------------- | ------------ | --------: | -----: | ---------: | -----: | ------: | -----: | ---------: | -----------: | --------: |
| ruleC          | vest_leather |    100.0% | 100.0% |     100.0% | 100.0% |  100.0% | 100.0% |       0.0% |         0.00 |         0 |
| ruleC          | hat_wizard   |    100.0% | 100.0% |     100.0% | 100.0% |  100.0% | 100.0% |       0.0% |         0.00 |         0 |
| ruleC          | sword_steel  |    100.0% | 100.0% |     100.0% | 100.0% |  100.0% | 100.0% |       0.0% |         0.00 |         0 |
| ruleC_no_sword | vest_leather |    100.0% | 100.0% |     100.0% | 100.0% |  100.0% | 100.0% |       0.0% |         0.00 |         0 |
| ruleC_no_sword | hat_wizard   |    100.0% | 100.0% |     100.0% | 100.0% |  100.0% | 100.0% |       0.0% |         0.00 |         0 |

Micro by variant:

| scope          | variant  | precision | recall | strict IoU | IoU t1 | prec t1 | rec t1 | assignment errors |
| -------------- | -------- | --------: | -----: | ---------: | -----: | ------: | -----: | ----------------: |
| ruleC          | exact    |    100.0% | 100.0% |     100.0% | 100.0% |  100.0% | 100.0% |                 0 |
| ruleC          | palette  |    100.0% | 100.0% |     100.0% | 100.0% |  100.0% | 100.0% |                 0 |
| ruleC          | geom1    |     66.5% |  85.7% |      59.9% |  96.0% |  100.0% |  95.1% |                 0 |
| ruleC          | geometry |     66.5% |  85.7% |      59.9% |  96.0% |  100.0% |  95.1% |                 0 |
| ruleC          | combined |     66.5% |  85.7% |      59.9% |  96.0% |  100.0% |  95.1% |                 0 |
| ruleC_no_sword | exact    |    100.0% | 100.0% |     100.0% | 100.0% |  100.0% | 100.0% |                 0 |
| ruleC_no_sword | palette  |    100.0% | 100.0% |     100.0% | 100.0% |  100.0% | 100.0% |                 0 |
| ruleC_no_sword | geom1    |     73.4% |  82.1% |      63.3% |  94.0% |  100.0% |  92.6% |                 0 |

Reading the `geom1` row: the sword is 1 px dilated, so its predicted area is almost twice the accepted area
(area error 97.4%) and strict precision is 50.8%; the hat is dilated (+45.9% area); the vest is eroded and
loses 58% of its area, taking tolerant recall down to 85.2%. Precision at tolerance 1 is 100% for all three:
every predicted pixel is a real item pixel within a pixel. The three wrong pixels are 0.04% of predictions.
**The strict IoU drop is shape, not assignment.**

## Results: every disjoint and every overlapping pair

`IoU` is strict, `t1` is tolerance 1, `assign` is the count of item-frames with an assignment error.

| pair                      | class    | exact IoU | exact t1 | palette IoU | palette t1 | geom1 IoU | geom1 t1 | geom1 boundary p95 | assign exact | assign palette | assign geom1 |
| ------------------------- | -------- | --------: | -------: | ----------: | ---------: | --------: | -------: | -----------------: | -----------: | -------------: | -----------: |
| vest_leather+hat_wizard   | disjoint |     100.0 |    100.0 |       100.0 |      100.0 |      63.3 |     94.0 |               2.97 |            0 |              0 |            0 |
| cape_red+hat_wizard       | disjoint |     100.0 |    100.0 |       100.0 |      100.0 |      62.6 |     96.4 |               2.90 |            0 |              0 |            0 |
| hair_brown+sword_steel    | disjoint |      95.4 |    100.0 |        89.8 |       99.9 |      55.0 |    100.0 |               1.71 |            0 |              0 |            0 |
| helmet_steel+sword_steel  | disjoint |      92.4 |     98.7 |        72.1 |       99.7 |      48.5 |     95.9 |               7.67 |       **13** |              0 |       **13** |
| hat_wizard+sword_steel    | disjoint |     100.0 |    100.0 |       100.0 |      100.0 |      62.5 |    100.0 |               1.70 |            0 |              0 |            0 |
| vest_leather+cape_red     | overlap  |      94.2 |     89.9 |        88.5 |       88.9 |      61.6 |     91.4 |               4.77 |           11 |             31 |           16 |
| vest_leather+hair_brown   | overlap  |      98.4 |     99.6 |        93.0 |       98.1 |      58.3 |     95.1 |               2.81 |            7 |             13 |            4 |
| vest_leather+helmet_steel | overlap  |      99.9 |    100.0 |        84.2 |       99.8 |      53.7 |     93.5 |               2.81 |            0 |              0 |            0 |
| vest_leather+sword_steel  | overlap  |      95.5 |    100.0 |        90.1 |       99.9 |      49.5 |     95.4 |               2.73 |            0 |              0 |            2 |
| cape_red+hair_brown       | overlap  |      95.5 |     97.5 |        95.5 |       97.5 |      62.3 |     95.8 |               3.42 |            4 |              4 |           10 |
| cape_red+helmet_steel     | overlap  |      99.4 |     99.8 |        91.8 |       99.7 |      60.6 |     94.0 |               3.45 |            1 |              0 |            0 |
| cape_red+sword_steel      | overlap  |      97.0 |     99.8 |        94.4 |       99.7 |      53.6 |     92.0 |               3.88 |            0 |              0 |           23 |
| hair_brown+helmet_steel   | overlap  |      99.2 |     91.9 |        72.6 |       93.4 |      35.3 |     79.3 |               4.21 |            4 |              3 |           27 |
| hair_brown+hat_wizard     | overlap  |      99.9 |     99.5 |        99.9 |       99.5 |      62.8 |     99.3 |               1.45 |            0 |              0 |           10 |
| helmet_steel+hat_wizard   | overlap  |      99.7 |     99.5 |        91.5 |       92.5 |      64.3 |     78.2 |               5.28 |            0 |              2 |            7 |

### Z-order and the pixels the lower item cannot recover

The z claim margin flipped only 0 to 14 predicted pixels per pair on exact art (the maximum is vest+hair,
14 px). A pixel the higher item painted almost always scores much worse for the lower item, so it never
contests; the z pass resolves ties, it does not create loss. The information the lower item actually loses
is the accepted overlap, which is absent from the composite: 1,600 px for vest+cape, 2,754 for hair+helmet,
1,411 for helmet+hat, 1,342 for hair+hat, 912 for cape+sword, 84 for cape+helmet, and 0 for the five
disjoint pairs. No deterministic rule can recover those pixels; the verifier's `z_loss` and `hidden`
signals report them so the product can refuse to save a visible-only layer silently.

Aggregates:

| scope                          | variant | precision | recall | strict IoU | IoU t1 | prec t1 | rec t1 | assignment errors |
| ------------------------------ | ------- | --------: | -----: | ---------: | -----: | ------: | -----: | ----------------: |
| disjoint_all (192 item-frames) | exact   |     99.3% |  98.2% |      97.5% |  99.6% |   99.2% | 100.0% |                13 |
| disjoint_all                   | palette |    100.0% |  92.2% |      92.2% |  99.9% |  100.0% |  99.9% |                 0 |
| disjoint_all                   | geom1   |     65.9% |  82.8% |      58.0% |  95.5% |   98.3% |  94.9% |                13 |
| overlap_all (488 item-frames)  | exact   |     99.1% |  98.2% |      97.3% |  98.0% |   98.8% |  98.7% |                27 |
| overlap_all                    | palette |     98.2% |  92.5% |      91.0% |  97.5% |   98.3% |  98.3% |                53 |
| overlap_all                    | geom1   |     79.0% |  67.0% |      56.9% |  93.3% |   98.0% |  93.7% |                99 |

Disjoint and unexplained together: strict IoU of about 97% on exact art for both classes, so palette
separation does not care whether items touch. What touching costs is hidden pixels (outside these metrics)
and, under drift, real assignment errors (27 to 99 frames in overlapping pairs versus 13 in disjoint ones,
all from the one shared-gray pair).

### Palette drift is a boundary effect, not a region swap

`palette` leaves geometry untouched, yet strict disjoint recall is 92.2% while tolerance-1 recall is 99.9%
and assignment errors are 0. The 7.8% is a one-pixel outline: a constant RGB offset moves an item's outline
color to within a few RGB of a neighboring item's outline, so the shared darkest shade flips. In the
`helmet_steel+sword_steel` pair this is visible as strict IoU 72.1% with tolerant IoU 99.7%. The mask is
right to within a pixel; the exact pixel owner of a shared outline is not determinable from color alone.

### Which failure is "assignment" and which is "shape"

| observation                                                                                       | class                         | evidence                                                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| 1 px dilation of the sword raises strict precision error to 49%, tolerance-1 precision stays 100% | shape                         | sword area error 97.4%, boundary p95 1.9 px                                |
| 1 px erosion of the side-view vest removes 58% of its area and 15% of tolerant recall             | shape plus thin-art fragility | vest strict recall 49.0%, tolerant recall 85.2%                            |
| helmet claims 4.6 to 14.2% of the sword's visible pixels in north and cross-punch                 | **assignment**                | 13 of 54 item-frames, z-order violation 3.3 to 14.2%                       |
| palette drift flips one-pixel outlines                                                            | neither (ambiguous owner)     | strict recall 92.2%, tolerant 99.9%, 0 assignment errors                   |
| overlapping pairs lose the lower item's hidden pixels                                             | occlusion                     | 26.3% of accepted pixels in the all-items composite, not counted as misses |

## Verifier

The verifier sees no ground truth. Per item per frame it computes: empty, area against the registered
direction reference, mean and p90 palette distance, boundary jump (p95 versus the previous frame),
cross-item color contamination, distance from the registered reference mask, shape conflict against the
other items' references, z-order violation (pixels inside a higher-z item's reference mask), frame-to-frame
area change, and the share lost to z. Confidence is a product of fixed penalties; the default pass bar is
0.75.

Two ground truths are reported:

- **Assignment error**: wrong-item share above 3%, or an empty layer.
- **Unusable layer**: the above, or area below half the direction reference, or strict recall below 75%.

| scope                     | variant | assignment errors | false pass (assignment) | false fail (assignment) | false pass (unusable) | false fail (unusable) |
| ------------------------- | ------- | ----------------: | ----------------------: | ----------------------: | --------------------: | --------------------: |
| ruleC (42 frames)         | exact   |              0/42 |                    0.0% |                    0.0% |                  0.0% |                  0.0% |
| ruleC                     | palette |              0/42 |                    0.0% |                    0.0% |                  0.0% |                  0.0% |
| ruleC                     | geom1   |              0/42 |                    0.0% |                   45.2% |                 50.0% |                 42.9% |
| disjoint_all (192 frames) | exact   |            13/192 |                   46.2% |                    0.0% |                 66.7% |                  0.0% |
| disjoint_all              | palette |             0/192 |                    0.0% |                    4.2% |                 82.6% |                  0.0% |
| disjoint_all              | geom1   |            13/192 |                   46.2% |                   31.3% |                 57.1% |                 27.9% |
| overlap_all (488 frames)  | exact   |            27/488 |                   37.0% |                   19.3% |                 23.5% |                  7.9% |
| overlap_all               | palette |            53/488 |                   67.9% |                   25.7% |                 56.9% |                 14.4% |
| overlap_all               | geom1   |            99/488 |                   47.5% |                   40.1% |                 49.6% |                 14.3% |

These are the shipped confidence bar of 0.75. With the simpler **assignment gate** (fail only on an empty
layer or a z-order violation above 2%), pooled over exact and palette art: ruleC has 0 assignment errors and
0% false pass and false fail; disjoint_all has 13 assignment errors, catches 7 (46.2% false pass, 0% false
fail); overlap_all has 80 assignment errors, catches 21 (73.8% false pass, 15.0% false fail).

What the verifier can and cannot do:

- It catches a **whole-layer failure** reliably: empty layers, an item that collapses, and a lower item
  claiming a higher item's region. The z-order signal alone caught 6 of the 13 disjoint assignment frames.
- It cannot catch a **partial region loss** or a **shared-outline swap**: those frames are color-clean and
  shape-close, and the verifier has no ground truth to compare against. That is why the false pass is
  46.2% on the one shared-gray disjoint pair and 89.6% under the unusable-layer bar (pooled exact and
  palette).
- On the Rule C group it flags 19 of 42 `geom1` frames, because a 1 px shape change moves area and
  boundaries. Seven of those are genuinely unusable layers (the eroded side-view vest), 12 are false fails
  (42.9% of the still-usable frames). Those are "review this layer" flags, not extraction errors.
- **It cannot replace review.** It can block the gross failures and rank frames for review, but a layer
  that passes the verifier is not certified. The pre-pay palette check is the real protection for the
  shared-color case.

## Verdict

**Is the extractor good enough for a disjoint-only shared-body batch?**
Yes for Rule C groups whose accepted reference palettes are mutually separated by more than the drift
distance. Ship thresholds and measured margins:

| bar              | threshold     |  Rule C exact/palette | Rule C 1 px shape | weakest disjoint pair (1 px shape) |
| ---------------- | ------------- | --------------------: | ----------------: | ---------------------------------: |
| wrong-item share | <= 1%         | 0.00% (1.0 pt margin) |   0.04% (0.96 pt) |                     0.00% (1.0 pt) |
| tolerance-1 IoU  | >= 90%        |      100.0% (10.0 pt) |    96.0% (6.0 pt) |           94.0% (4.0 pt), vest+hat |
| tolerant recall  | >= 90%        |      100.0% (10.0 pt) |    95.1% (5.1 pt) |           92.6% (2.6 pt), vest+hat |
| strict IoU       | informational |                100.0% |             59.9% |                              63.3% |

So the pass rule is: **at most 1% wrong-item pixels and at least 90% tolerance-1 IoU**, with the measured
margin 4.0 tolerant-IoU points at the worst pair. On a 64 px sprite that margin is thin but real; it should
be re-measured on a second character before it becomes a hard gate.

**Mandatory addition to Rule C:** compare the accepted reference palettes pairwise and refuse to auto-batch
a pair with any color within 18 RGB (the top of the measured drift range). On this fixture that rejects
`helmet_steel + sword_steel`, the only disjoint pair with assignment errors. Without it, the disjoint false
safe is 13 of 192 item-frames (6.8%) and the failure is a real 5 to 14% region of the helmet that belongs
to the sword.

**Can the verifier catch a bad extraction without human review?**
No. False pass 46.2% at the assignment bar (7 of 13 caught) and 89.6% at the unusable-layer bar on the
disjoint set (pooled exact and palette art); false fail 0% at the assignment bar on the Rule C group's
exact and palette art, but 45.2% under a 1 px shape change. It is a gross-failure gate and a
review router, not a certification. It would become a certification only with (a) a completeness signal
that compares the extracted area to the _generated_ item-colored area in the composite, not to the accepted
reference area, (b) a pre-pay palette-collision decision, and (c) a live sample of real model output to
calibrate the area and boundary bands.

## Cheapest live probe

The offline work cannot see the three things a real call changes: the body is redrawn, the model may drift
the design per frame, and one key must suit every item. The Rule C group is key-safe on green (brown vest,
blue/gold hat, steel sword; the hat is the item that dies on blue, so green is required).

**Probe 1, confirm or kill: 10 generations.** One call, one direction, one move.

```
POST https://api.pixellab.ai/v2/edit-animation-v2
Authorization: Bearer <PIXELLAB_API_KEY_AGENT_DEV>   # server-side only, never logged
Content-Type: application/json
{
  "description": "Add a brown leather chest vest, a blue wizard hat with gold trim, and a steel sword held in the right hand, each in its own colors (no bright green on the items), identical design in every frame; the vest covers the torso, the hat sits on the head, the sword hangs at the right hand.",
  "frames": [ 8 x { "image": { "base64": "<chroma cell walk/south/0..7>" }, "size": { "width": 64, "height": 64 } } ],
  "image_size": { "width": 64, "height": 64 },
  "no_background": true,
  "seed": 20261124
}
```

Then run `reference_extractor.py` against the accepted `walk/south` layers (register the accepted layer to
the returned frame by the body centroid) and apply the ship thresholds. Kill if wrong-item share exceeds
1% or tolerance-1 IoU falls below 90% for any of the three items on any frame. Budget: 10 generations,
about $0.05 at the planning ratio. This is the only call needed to decide whether the route survives.

**Probe 2, fixture qualification: 30 more generations.** Add east with all three items (1 call, 8
frames), north with vest and sword only (1 call, 8 frames), and cross-punch south with vest and sword only
(1 call, 6 frames) because the hat has no art there. Three calls, 30 more generations, 40 in total, about
$0.20. Run the same offline comparison. Do not resend a paid request; if a call fails, stop.

## Limitations

- This is a simulation. Alpha compositing models occlusion exactly but not a model redrawing the body and
  all items in one pass; the probe is the only way to see that.
- One 64 px character, 6 items, 3 directions, 2 moves. The Rule C group is 42 item-frames; a 6.8% rate per
  pair is descriptive, not a confidence interval.
- The drift is the measured magnitude, not a sample: a constant RGB offset, one morphology, one hair shift.
  A real generation has per-frame shape and palette variation that this does not reproduce.
- The 1 px erosion of a two-pixel-wide side-view vest nearly deletes it. That is a property of eroding thin
  art at 64 px, not a separation failure; at larger sizes the relative damage is smaller (inferred).
- The reference-guided spatial prior is registered by a translation only. A pose change (cross-punch) and a
  rotation are not registered; the verifier skips its reference-distance signal for cross-punch.
- The union is exact from alpha. A real extractor must build it from the frozen base; a body redraw adds a
  difference image on top of this.
- No 8-direction rig and no live output were available. The palette-collision threshold of 18 RGB comes
  from the measured 11.5 to 17.1 drift, not from an extraction experiment.

## Files and reproduce

From the repository root, Python 3.14, Pillow 13, numpy 2.4, scipy 1.17:

```
python docs/research/2026-11-24-batch-extraction/reference_extractor.py
python docs/research/2026-11-24-batch-extraction/verifier_sweep.py
```

- [`../reference_extractor.py`](../reference_extractor.py): data, composite, drift, extractor, metrics, verifier.
  Writes `out_ref/metrics.json`, `out_ref/verifier_rows.json`, `out_ref/tables.md`.
- [`../verifier_sweep.py`](../verifier_sweep.py): operating points, false-pass and false-fail rates.
  Writes `out_ref/verifier.md`.
- [`../harness.py`](../harness.py): loading, compositing, drift, palettes. One optional `hair_shift` argument added.
- `out_ref/tables.md` and `out_ref/verifier.md` are the small committed outputs; the two large JSON files are
  listed in `out_ref/.gitignore` and are reproducible.

No network, no paid calls, no writes under `app/`.
