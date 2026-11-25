# Deterministic separation baseline for a shared-body batch

2026-11-24. Offline research for [the brief](../BRIEF.md), branch `research/batch-item-extraction`. No paid PixelLab calls, no credentials, no app code changed. Every number comes from the accepted S2 fixture art by alpha-compositing the item layers. Script: [`../harness.py`](../harness.py). Outputs: [`../out/`](../out/).

## Answer

**Disjoint items: viable, and the only safe auto-batch case.** On the accepted art, both component-plus-palette (E1) and pixel-palette (E3) recover disjoint pairs to 99.8% and 97.6% IoU. With the measured drift injected, the extractor itself still assigns 98.6% of the pixels that survive in the composite, but only 83.0% of the accepted item pixels survive at all, so absolute IoU falls to about 0.59. The loss is shape drift and occlusion, not ambiguity.

**Overlapping items: the visible part can be separated; the hidden part cannot.** Even on exact art, palette assignment reaches 97.7% IoU on the visible pixels of overlapping pairs, but 26.3% of all accepted item pixels are hidden in the all-items composite (hair 89.7%, vest 47.2%, helmet 40.9%). Component assignment collapses where items touch: the union is one mixed component in most frames (35 mixed components across 30 cells). With the same injected drift, overlapping-pair IoU is 0.55.

**Verdict.** Auto-batching to one shared-body generation is defensible only for pairs that are pixel-disjoint in every stored frame, and only if the product accepts that a deterministic split cannot recover occluded pixels. Truly overlapping pairs must keep separate generation. "Overlapping only in some directions or frames" is not safe: the fixture's barely-overlapping pairs (vest+hair, 9 px in 4 frames; vest+sword, 4 px in 2 frames) already lose every overlapped pixel of the lower item and merge components.

## What is a ceiling and what includes drift

| Variant          | Meaning                                                                          | Status                                       |
| ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| `exact`          | Composite of the accepted layers, no color or shape change                       | Ceiling. Exact accepted art, no model error. |
| `drift_geometry` | Per-item 1 px dilation or erosion, plus a hair shift of 2 px down and 1 px right | Measured geometry drift only                 |
| `drift_palette`  | Per-item constant RGB offset of 11.5 to 17.1                                     | Measured palette drift only                  |
| `drift`          | Both, the realism variant                                                        | Includes injected drift                      |

The `with_body` and `no_body` modes produce identical extraction targets and metrics here (0 px difference in every run). Compositing the accepted body under the items and deriving the target as "changed against the known base" is equivalent to the item-only alpha in this simulation. A real generation also redraws the body; that variable is untested (see Limitations).

## Method

### Data

`app/public/fixtures/s2`, 64 px cells. `walk`: 8 frames x 3 stored directions (south, east, north). `cross-punch`: 6 frames, south only (rows 1 and 2 of the sheet are empty, as `fixture.json` coverage states). Items and draw order from `fixture.json` z: body base 10, `vest_leather` 40, `cape_red` 90, `hair_brown` 110, `helmet_steel` 130, `hat_wizard` 130 (same slot, drawn after the helmet here; the two cannot be worn together, so the all-items case is a stress upper bound), `sword_steel` 150. A run covers 30 cells where both items have sheets (24 walk plus 6 cross-punch); any pair containing `hat_wizard` covers 24 walk cells, and the all-items run covers 30 cells with the hat absent from cross-punch.

### Composite and ground truth

The harness paints the items in slot z order, with or without the body underneath. The extraction target is the union of item alpha (or, with the body, pixels that differ from the known base). Ground truth for scoring is each accepted layer per cell. "Visible" is the accepted pixels of an item not covered by a higher accepted item. Precision, recall and IoU are computed against visible pixels; hidden pixels are reported separately and are excluded from precision/recall because no extractor can reach them.

### Extractors

- **E1 `components_band_palette`.** 8-connected components of the union, minimum 2 px (the app's `chromaLayer` minimum). Each component goes to an item whose slot band intersects it; ties by nearest palette to the component mean color; components with no band hit go to the globally nearest palette.
- **E2 `bands`.** Per-pixel slot band only. Ties resolve to the topmost slot (highest z, then draw order).
- **E3 `palette`.** Per-pixel nearest palette to each item's colors in one reference cell.
- **E4 `combo`.** 8-connected components, minimum 2 px, split per pixel by band; pixels in more than one band are resolved by nearest palette; split pieces under 2 px are dropped.

Bands come only from the body mask geometry: row fractions of the body silhouette for `above_head`, `head`, `neck`, `torso`, `waist`, `legs`, `feet`, plus a `hands` band for columns outside the body's vertical core below 30% of its height. Which bands each slot may occupy is slot semantics: vest = neck/torso/waist, cape = neck/torso/waist/legs, hair = head/neck, helmet = head, hat = above_head/head, sword = hands. No ground-truth item box is used.

Reference cell for E3 palettes: **`walk/south/0`**, the frame with the tallest body silhouette in walk/south (most upright). Palette sizes: vest 4 colors, cape 6, hair 3, helmet 4, hat 7, sword 4.

### Drift parameters

Fixed seed 20261124. Palette offset magnitude from the measured 11.5 to 17.1 RGB distance; one morphological change per item (1 px 8-connected dilation or erosion); hair shifted (-2 rows, +1 column), matching the measured 64 px sheet shifts of (1,-1) and (1,-2) on hair. Newly dilated pixels take the nearest item color so the halo is item-colored, not black.

| Item         | Palette drift | Morphology |
| ------------ | ------------: | ---------- |
| vest_leather |         13.43 | erode      |
| cape_red     |         13.85 | erode      |
| hair_brown   |         14.09 | dilate     |
| helmet_steel |         16.13 | erode      |
| hat_wizard   |         12.12 | dilate     |
| sword_steel  |         13.06 | dilate     |

## Which pairs and directions overlap

Accepted art, both animations, every stored direction. Values are summed over frames, not per frame.

| pair                      | south | east | north | frames with overlap | max px in one frame |
| ------------------------- | ----: | ---: | ----: | ------------------: | ------------------: |
| vest_leather+cape_red     |   364 |  273 |  1184 |                  30 |                 163 |
| vest_leather+hair_brown   |     0 |    9 |     0 |                   4 |                   3 |
| vest_leather+helmet_steel |     2 |   18 |     0 |                   5 |                   5 |
| vest_leather+sword_steel  |     4 |    0 |     0 |                   2 |                   3 |
| cape_red+hair_brown       |    47 |   18 |     0 |                  13 |                  15 |
| cape_red+helmet_steel     |    60 |   19 |     5 |                  10 |                  22 |
| cape_red+sword_steel      |   765 |   25 |   193 |                  26 |                  84 |
| hair_brown+helmet_steel   |  1239 |  810 |  1039 |                  30 |                 135 |
| hair_brown+hat_wizard     |   800 |  734 |     0 |                  16 |                 102 |
| helmet_steel+hat_wizard   |   768 |  841 |     0 |                  16 |                 108 |

Five of 15 pairs are pixel-disjoint in every frame: vest+hat, cape+hat, hair+sword, helmet+sword, hat+sword. Ten overlap. Note the direction dependence: vest+cape is worst from the north (1184 px) and vest+helmet overlaps only in east and south. A pair cannot be classified from the standing frame alone.

The injected 1 px geometry drift does not push any accepted-disjoint pair into contact (0 px in 0 frames for all five).

## Results

### All items together, exact accepted art (ceiling)

IoU per extractor, and the occlusion floor. 30 cells (24 walk + 6 cross-punch).

| item         | E1 IoU | E2 IoU | E3 IoU | E4 IoU | hidden px | hidden share | E3 bad frames |
| ------------ | -----: | -----: | -----: | -----: | --------: | -----------: | ------------: |
| vest_leather |   4.4% |   0.0% |  85.4% |  90.0% |      1825 |        47.2% |             6 |
| cape_red     |  14.6% |  18.9% |  97.0% |  88.6% |      1082 |         9.3% |             3 |
| hair_brown   |   2.0% |   0.0% |  92.9% |  16.4% |      3281 |        89.7% |             5 |
| helmet_steel |   6.0% |  21.4% |  88.9% |  95.3% |      1609 |        40.9% |            14 |
| hat_wizard   |  31.2% |  55.6% |  95.3% |  86.2% |         0 |         0.0% |             0 |
| sword_steel  |  26.7% |  27.5% |  82.9% |  95.5% |         0 |         0.0% |            14 |

Micro totals for the all-items run: E1 22.8/22.8/12.9, E2 42.7/42.3/27.0, E3 96.3/96.3/92.8, E4 93.1/92.7/86.7 (precision/recall/IoU, %). "Bad frames" counts cells per item with precision below 98% or recall below 95%.

E3 precision, recall and wrong-item pixels per item (the only extractor that is a plausible candidate):

| item         | exact P | exact R | exact IoU | exact wrong px | exact bad | drift P | drift R | drift IoU | drift wrong px | drift bad |
| ------------ | ------: | ------: | --------: | -------------: | --------: | ------: | ------: | --------: | -------------: | --------: |
| vest_leather |    86.5 |    98.6 |      85.4 |            314 |         6 |    83.7 |    57.8 |      51.9 |            230 |        23 |
| cape_red     |   100.0 |    97.0 |      97.0 |              0 |         3 |    81.6 |    58.5 |      51.6 |           1401 |        30 |
| hair_brown   |    92.9 |   100.0 |      92.9 |             29 |         5 |    22.6 |    28.4 |      14.4 |            367 |        30 |
| helmet_steel |    89.1 |    99.8 |      88.9 |            284 |        14 |    75.3 |    49.4 |      42.5 |            377 |        30 |
| hat_wizard   |    95.3 |   100.0 |      95.3 |            184 |         0 |    66.3 |   100.0 |      66.3 |           1892 |        16 |
| sword_steel  |    99.8 |    83.0 |      82.9 |              5 |        14 |    48.2 |    83.0 |      43.9 |           2462 |        30 |

Reading the exact numbers:

- Per-pixel palette (E3) is the only rule that survives the all-items composite. Its gaps are shared colors, not geometry: the hat trim gold (130,109,52) and the sword hilt gold (121,109,57) are nearly identical, so sword recall is 83.0% and hat precision 95.3%. Helmet and sword share gray families, which costs helmet precision 89.1% and 284 wrong pixels.
- E1 fails catastrophically because the union is one huge 8-connected component in most cells: 35 mixed components across 30 cells, and the hair/helmet, hair/cape and vest/cape pairs co-occur in 29 to 30 of 30 cells. One component assigned to one item takes whole garments with it (vest precision 5.0%, 10,602 wrong pixels).
- E2 fails because a band maps one item per pixel. The cape owns every torso pixel, so vest recall is 0.0%; the hat owns the head band above the helmet, so helmet recall is 24.5% (and E1, which assigns whole merged components, drops helmet recall to 6.1%).
- Hidden pixels are not a bug: `hat_wizard` and `helmet_steel` are both head slot and cannot be worn together. This all-items case is the worst-case stress composite, not a legal outfit.

### All items together, injected drift (realism)

| item         | E1 IoU | E2 IoU | E3 IoU | E4 IoU | E3 wrong px | E3 missed px | E3 bad frames |
| ------------ | -----: | -----: | -----: | -----: | ----------: | -----------: | ------------: |
| vest_leather |  18.3% |   0.0% |  51.9% |  55.1% |         230 |          861 |            23 |
| cape_red     |  34.7% |  15.3% |  51.6% |  54.1% |        1401 |         4404 |            30 |
| hair_brown   |   3.4% |   0.0% |  14.4% |  10.0% |         367 |          270 |            30 |
| helmet_steel |   0.0% |  17.5% |  42.5% |  48.3% |         377 |         1177 |            30 |
| hat_wizard   |  40.0% |  45.8% |  66.3% |  57.0% |        1892 |            0 |            16 |
| sword_steel  |  10.3% |  29.9% |  43.9% |  52.2% |        2462 |          468 |            30 |

Micro: E1 35.3/34.5/21.1, E2 41.0/39.5/25.2, E3 68.5/67.1/51.3, E4 69.5/67.8/52.2. Every item is under both thresholds in nearly every frame.

### Disjoint pairs versus overlapping pairs

Micro precision/recall/IoU across the relevant pair runs.

| scope    | variant | E1             | E2             | E3             | E4             |
| -------- | ------- | -------------- | -------------- | -------------- | -------------- |
| disjoint | exact   | 99.9/99.9/99.8 | 95.0/90.9/86.7 | 98.8/98.8/97.6 | 97.0/97.0/94.2 |
| disjoint | drift   | 68.4/82.3/59.6 | 70.1/78.2/58.6 | 68.0/81.8/59.0 | 68.5/82.4/59.7 |
| overlap  | exact   | 84.0/84.0/72.5 | 78.9/73.4/61.4 | 98.8/98.8/97.7 | 95.9/95.8/92.0 |
| overlap  | drift   | 69.7/60.2/47.7 | 71.2/55.4/45.2 | 76.1/65.8/54.6 | 76.9/66.4/55.4 |
| all      | exact   | 22.8/22.8/12.9 | 42.7/42.3/27.0 | 96.3/96.3/92.8 | 93.1/92.7/86.7 |
| all      | drift   | 35.3/34.5/21.1 | 41.0/39.5/25.2 | 68.5/67.1/51.3 | 69.5/67.8/52.2 |

The surprise is that exact overlapping pairs are as separable as disjoint pairs for E3 (97.7 vs 97.6 IoU). Palette separation does not care whether items touch; it only fails on shared colors. What overlapping costs is hidden pixels, which the metric excludes by design, and component merges, which destroy E1/E2.

### Pair detail

Overlap is the accepted-art pixel intersection. Hidden is the sum of both items' occluded pixels. Bad frames are E3 item-cells with precision below 98% or recall below 95%.

| pair                      | class    | overlap px (frames) | hidden px | merges exact | E1 exact IoU | E3 exact IoU | E4 exact IoU | E3 drift IoU | E4 drift IoU | E3 exact bad | E3 drift bad |
| ------------------------- | -------- | ------------------- | --------: | -----------: | -----------: | -----------: | -----------: | -----------: | -----------: | -----------: | -----------: |
| vest_leather+cape_red     | overlap  | 1821 (30)           |      1821 |           30 |        0.759 |        0.948 |        0.960 |        0.619 |        0.619 |            9 |           53 |
| vest_leather+hair_brown   | overlap  | 9 (4)               |         9 |           12 |        0.659 |        0.975 |        0.857 |        0.501 |        0.516 |           17 |           60 |
| vest_leather+helmet_steel | overlap  | 20 (5)              |        20 |           28 |        0.378 |        1.000 |        0.868 |        0.539 |        0.530 |            0 |           60 |
| vest_leather+hat_wizard   | disjoint | 0 (0)               |         0 |            0 |        1.000 |        1.000 |        0.873 |        0.632 |        0.624 |            0 |           40 |
| vest_leather+sword_steel  | overlap  | 4 (2)               |         4 |            6 |        0.994 |        1.000 |        0.993 |        0.524 |        0.522 |            0 |           60 |
| cape_red+hair_brown       | overlap  | 65 (13)             |        65 |           17 |        0.795 |        0.958 |        0.875 |        0.483 |        0.578 |           10 |           60 |
| cape_red+helmet_steel     | overlap  | 84 (10)             |        84 |           29 |        0.664 |        0.959 |        0.883 |        0.610 |        0.588 |           11 |           60 |
| cape_red+hat_wizard       | disjoint | 0 (0)               |         0 |            0 |        0.995 |        1.000 |        0.902 |        0.678 |        0.658 |            0 |           40 |
| cape_red+sword_steel      | overlap  | 983 (26)            |       983 |           27 |        0.738 |        1.000 |        0.981 |        0.559 |        0.551 |            0 |           60 |
| hair_brown+helmet_steel   | overlap  | 3088 (30)           |      3088 |           30 |        0.775 |        0.998 |        0.991 |        0.332 |        0.331 |            5 |           60 |
| hair_brown+hat_wizard     | overlap  | 1534 (16)           |      1534 |           16 |        0.894 |        1.000 |        0.895 |        0.629 |        0.578 |            0 |           40 |
| hair_brown+sword_steel    | disjoint | 0 (0)               |         0 |            0 |        0.998 |        1.000 |        0.999 |        0.538 |        0.538 |            0 |           60 |
| helmet_steel+hat_wizard   | overlap  | 1609 (16)           |      1609 |           16 |        0.850 |        0.998 |        0.961 |        0.645 |        0.641 |            0 |           40 |
| helmet_steel+sword_steel  | disjoint | 0 (0)               |         0 |            0 |        0.999 |        0.917 |        0.999 |        0.483 |        0.528 |           28 |           60 |
| hat_wizard+sword_steel    | disjoint | 0 (0)               |         0 |            0 |        0.999 |        0.940 |        1.000 |        0.583 |        0.614 |            8 |           40 |

Notes: merge counts exceed overlap-frame counts for some pairs because 8-connected diagonal contact merges components without any shared pixel. Nearly-disjoint pairs still merge (vest+helmet: 20 overlap px, 28 merged components).

E3 precision, recall, IoU and wrong-item pixels per pair (exact and drift):

| pair                      | class    | exact P | exact R | exact IoU | exact wrong px | exact bad | drift P | drift R | drift IoU | drift wrong px | drift bad |
| ------------------------- | -------- | ------: | ------: | --------: | -------------: | --------: | ------: | ------: | --------: | -------------: | --------: |
| vest_leather+cape_red     | overlap  |    97.3 |    97.3 |      94.8 |            368 |         9 |    99.0 |    62.3 |      61.9 |             89 |        53 |
| vest_leather+hair_brown   | overlap  |    98.7 |    98.7 |      97.5 |             96 |        17 |    65.0 |    68.7 |      50.1 |           2774 |        60 |
| vest_leather+helmet_steel | overlap  |   100.0 |   100.0 |     100.0 |              0 |         0 |   100.0 |    53.9 |      53.9 |              0 |        60 |
| vest_leather+hat_wizard   | disjoint |   100.0 |   100.0 |     100.0 |              0 |         0 |    76.2 |    78.7 |      63.2 |           1701 |        40 |
| vest_leather+sword_steel  | overlap  |   100.0 |   100.0 |     100.0 |              0 |         0 |    65.2 |    72.7 |      52.4 |           2562 |        60 |
| cape_red+hair_brown       | overlap  |    97.9 |    97.9 |      95.8 |            325 |        10 |    70.1 |    60.8 |      48.3 |           3957 |        60 |
| cape_red+helmet_steel     | overlap  |    97.9 |    97.9 |      95.9 |            324 |        11 |    99.9 |    61.1 |      61.0 |             13 |        60 |
| cape_red+hat_wizard       | disjoint |   100.0 |   100.0 |     100.0 |              0 |         0 |    85.8 |    76.4 |      67.8 |           1701 |        40 |
| cape_red+sword_steel      | overlap  |   100.0 |   100.0 |     100.0 |              0 |         0 |    77.8 |    66.5 |      55.9 |           2562 |        60 |
| hair_brown+helmet_steel   | overlap  |    99.9 |    99.9 |      99.8 |              5 |         5 |    43.7 |    57.9 |      33.2 |           3358 |        60 |
| hair_brown+hat_wizard     | overlap  |   100.0 |   100.0 |     100.0 |              0 |         0 |    65.5 |    94.1 |      62.9 |           2643 |        40 |
| hair_brown+sword_steel    | disjoint |   100.0 |   100.0 |     100.0 |              0 |         0 |    55.0 |    96.0 |      53.8 |           5034 |        60 |
| helmet_steel+hat_wizard   | overlap  |    99.9 |    99.9 |      99.8 |              4 |         0 |    72.6 |    85.2 |      64.5 |           1701 |        40 |
| helmet_steel+sword_steel  | disjoint |    95.7 |    95.7 |      91.7 |            289 |        28 |    61.8 |    68.9 |      48.3 |           2846 |        60 |
| hat_wizard+sword_steel    | disjoint |    96.9 |    96.9 |      94.0 |            184 |         8 |    59.5 |    96.9 |      58.3 |           3908 |        40 |

Bad-frame counts for E1, E2 and E4 in every scope and variant, and the full per-item tables, are in [`../out/tables.md`](../out/tables.md).

### How much of drift is missing pixels versus wrong assignment

Recall denominator is the accepted visible pixels, so injected erosion and shift that remove pixels from the composite are counted as failures. Conditional recall is recovery of the pixels that are actually present in the composite.

| scope    | variant | accepted-visible px | missing from composite | coverage | E1 cond. | E2 cond. | E3 cond. | E4 cond. |
| -------- | ------- | ------------------: | ---------------------: | -------: | -------: | -------: | -------: | -------: |
| disjoint | exact   |               39391 |                      0 |   100.0% |    99.9% |    90.9% |    98.8% |    97.0% |
| disjoint | drift   |               39391 |                   6710 |    83.0% |    99.2% |    94.2% |    98.6% |    99.3% |
| overlap  | exact   |               95018 |                      0 |   100.0% |    84.0% |    73.4% |    98.8% |    95.8% |
| overlap  | drift   |               95018 |                  28098 |    70.4% |    85.5% |    78.6% |    93.5% |    94.3% |
| all      | exact   |               21826 |                      0 |   100.0% |    22.8% |    42.3% |    96.3% |    92.7% |
| all      | drift   |               21826 |                   4828 |    77.9% |    44.3% |    50.7% |    86.2% |    87.1% |

This is the most important table for reading the realism numbers. At 64 px a 1 px erosion or shift removes 17.0% of accepted item pixels in disjoint pair runs and 29.6% in overlapping pair runs before any extractor runs. Palette assignment then recovers 98.6% and 93.5% of what remains. The headline drift IoU of about 0.55 is therefore mostly the strict pixel-exact ground truth penalizing a one-pixel silhouette change, not separation failure.

### Drift attribution (E3 micro IoU)

| scope    | exact | palette only | geometry only | combined |
| -------- | ----: | -----------: | ------------: | -------: |
| disjoint | 0.976 |        0.976 |         0.590 |    0.590 |
| overlap  | 0.977 |        0.911 |         0.570 |    0.546 |
| all      | 0.928 |        0.838 |         0.524 |    0.513 |

Palette drift alone costs nothing for disjoint pairs, 6.6 IoU points for overlapping pairs and 9.0 points for the all-items composite. Geometry drift alone accounts for almost all of the combined loss. Palette and geometry interact slightly for overlapping pairs.

### Component merges and hidden pixels

- All-items composite: 7797 of 29623 accepted item pixels (26.3%) are hidden by construction. Hair 3281 of 3658 (89.7%), vest 1825 of 3863 (47.2%), helmet 1609 of 3934 (40.9%), cape 1082 of 11687 (9.3%), sword and hat 0.
- Mixed 8-connected components in the all-items exact run: 35 across 30 cells (71 under drift). Pairs co-occurring in one component, count of cells: hair+helmet 30, hair+cape 29, helmet+cape 29, vest+cape 30, vest+helmet 29, hair+vest 29. Diagonal contact merges components without a shared pixel, so vest+helmet merges in 29 cells even though it overlaps in only 5.
- No deterministic rule in this harness can recover a hidden pixel. That is not a property of the assignment rule; the pixel is absent from the composite.

## Verdict: disjoint versus overlapping

**Disjoint.** Safe for auto-batching by the extraction test, with two conditions. First, "disjoint" must be established from stored layers across every stored frame and direction, not from the standing pose: 5 of 15 pairs qualify, and the direction table shows overlap appearing only in some directions. Second, the product must accept that animation can introduce contact later. The injected 1 px drift did not make any of the five disjoint pairs touch in this fixture, but that is a 64 px fixture with generous margins, not a guarantee.

**Overlapping.** Not safe for auto-batching. Pixel-palette separation is excellent on the visible part (97.7% IoU on exact art), but the layer that would be saved is incomplete for the lower item every time it is covered (hair loses 89.7%, vest 47.2%, helmet 40.9% in the all-items composite), and component rules collapse on contact. A product that silently saves the visible-only layer is losing art permanently. If overlapping items are batched, the app must show the loss and require per-item review; the default should stay separate generation.

**Which extractor to use if this is productized.** E3, nearest palette from a reference cell, per pixel, with a shared-palette guard. E1/E2/E4 are not candidates: E1 needs components that overlap destroys, E2 cannot express two items in one band, and E4 inherits both problems. E3's known failure is shared colors between items (hat trim versus sword hilt, helmet gray versus sword gray), which the app can detect from the reference palettes before paying.

## Implications for the batch guard

1. The pre-pay detector must test stored layers frame by frame and direction by direction, not bounding boxes and not the standing pose.
2. Treat any nonzero overlap in any frame as overlapping, even 4 px in 2 frames. The near-disjoint pairs lose the overlap entirely and merge.
3. Do not rely on connected components to split a composite. Only per-pixel palette assignment works at the exact-art ceiling, and it does not address hidden pixels.
4. Warn that animation can create contact that the standing layers did not show, and that a 1 px silhouette change is 17 to 30% of accepted pixels at 64 px.
5. Palette collisions are predictable before generation: compare reference palettes pairwise and flag pairs whose colors are within the measured drift distance.

## Limitations and incomplete measurements

- **This is a simulation, not a PixelLab output.** Alpha-compositing accepted layers models occlusion exactly but not a model redrawing several items on one body. No live shared-body generation was run (no paid calls allowed), so model-induced design drift, body redraw, dithering and per-frame shape change beyond the injected drift are unmeasured.
- **The `with_body` variable is degenerate here.** With the accepted body composited unchanged, the extraction target is identical with and without the body (0 px difference in every run). A real generation redraws or re-keys the body; that case is not covered.
- **The realism drift is a model, not a sample.** It uses a constant RGB offset per item, per-item 1 px morphology, and one fixed hair shift. It reproduces the measured magnitudes, not the measured per-frame distribution. No actual generated sheet was used.
- **No registration was applied.** The app's `bestShift` would recover part of the injected 2 px hair shift. The drift numbers are raw, before registration.
- **Strict pixel-exact ground truth.** A 1 px boundary change is counted as error. The numbers say how well the accepted design is reproduced, not whether a layer is usable. A tolerant metric (1 px boundary slack) would score much higher and was not requested.
- **No 8-direction rig, diagonal view, or frame above 64 px** was available. Erosion and shift are relatively more damaging at 64 px, so the drift results should improve with size, but that is inferred.
- **`hat_wizard` and `helmet_steel` share a slot.** Including both in the all-items composite is an artificial stress case.
- **Scope aggregates over pair runs count an item once per pair.** They are micro over pair runs, so an item in five pair runs contributes to five runs. The per-pair table is the non-duplicated view.

## Files and reproduce

- Harness: [`../harness.py`](../harness.py). Python 3.14, Pillow 13, numpy 2.4.0, scipy 1.17.1. No npm install.
- Generated data: `../out/metrics.json` (all runs, overlap census, drift parameters, per-item and per-pair metrics), `../out/tables.md` (full per-scope, per-extractor tables), `../out/summary.txt` (one line per scope and variant).
- Generated images: `../out/composite_*.png`, `../out/gt_*.png`, `../out/E1_*` to `E4_*` for walk/south frame 0 and walk/east frame 2, `../out/pair_hair_helmet.png`. `out/` is git-ignored; rerun the harness to recreate them.
- Run from the repository root: `python docs/research/2026-11-24-batch-extraction/harness.py`.

The overlap census, visible/hidden split and palette numbers are measured directly from the fixture. The drift magnitudes are taken from [`../../2026-11-23-item-move-route-cost.md`](../../2026-11-23-item-move-route-cost.md) (64 px palette distance 10.9 to 17.1 before snap, 11.5 to 15.1 after; sheet shift 1 to 3 px varying by seed) and the 64 px consistency findings in [`../../2026-11-24-batch-item-generation/findings/batch-feasibility.md`](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md).
