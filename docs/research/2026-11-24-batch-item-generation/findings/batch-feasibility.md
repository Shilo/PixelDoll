# Batch item generation: feasibility, cost and separability

2026-11-24. Offline research for [the brief](../BRIEF.md). No paid calls, no token use, no app code changed.
Measurements come from the accepted S2 fixture layers and from stored study results; the script and its output are in
this folder ([`measure.mts`](measure.mts), [`measure-output.txt`](measure-output.txt)).

## Answer

**Generation can be batched, but a composite cannot be split.** PixelLab returns one image per input frame and has no
layers, and PixelDoll's extractor turns one composite into one binary mask per cell ([`extractCell`](../../../../app/src/lib/items/items.ts),
[`chromaLayer`](../../../../app/src/lib/image/chroma.ts)). Drawing two items on one body therefore yields one mask
containing both; nothing in the app or the contract labels pixels by item.

The only batching that keeps layers separate is the one that keeps the **images** separate: one request carrying several
independent chroma mannequins (one per item, view and frame), each returned as its own image, each extracted with its own
key. On the S2 fixture that route is exact by construction, and at 64 px it saves 50 to 56 percent against the anchored
route (30 generations for 2 items, 40 for 3). It does **not** beat the default skeleton route on a later move, which is
9 generations per item.

Drawing several items together has three measured blockers:

1. **Legitimate occlusion is absent from the output.** The lower item loses every pixel the upper item covers: 85.5% of the
   hair under a steel helmet (98.8% max), 55.8% under a wizard hat, 46.6% of a vest under a cape (100% max), 9.8% of a
   cape under a sword. The current route draws each item alone, so each layer is complete and can be exported or removed
   later.
2. **Connected components merge exactly the items that overlap.** The hair and helmet union is one 8-connected component in
   30 of 30 frames, hair and hat in 24 of 24, helmet and hat in 24 of 24. The app keeps components of at least 2 px
   ([`chromaLayer`](../../../../app/src/lib/image/chroma.ts)); no component rule can split those unions.
3. **One call means one key for every item.** An item whose colors score as that key is deleted silently. The wizard hat
   loses 90.6% of its pixels on blue and azure; armor and weapons sit close to the blue family (the chroma study measured
   steel rewriting on azure). Per-item key choice, which handles green gear today, disappears.

A batched multi-image call still has to be qualified: the model may treat the images as frames of one animation and
enforce one design across different items. That is the one unknown worth 10 generations.

## What the app does today

| Piece                                                                     | Behavior                                                                                                                   | Consequence for batching                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `itemRoute.edit` ([items.ts:121](../../../../app/src/lib/items/items.ts)) | One `edit-animation-v2` request with 2 to 16 frames, one `image_size`, one description, one seed                           | A request can hold independent images, but they share prompt, size, key and seed                 |
| `itemRoute.pose` ([items.ts:145](../../../../app/src/lib/items/items.ts)) | One `animate-with-skeleton-v3` request per item, view and frame batch, 3 gen per view for 4 to 12 frames                   | Cannot pose two items in one request (one `first_frame`)                                         |
| `extractCell` ([items.ts:2061](../../../../app/src/lib/items/items.ts))   | `chromaLayer` of the composite against the real base; one mask, connected components of at least 2 px                      | No item label; split is impossible once items share a body                                       |
| `bandOf` ([items.ts:1241](../../../../app/src/lib/items/items.ts))        | A y-band per slot from keypoints                                                                                           | Separates head from legs, not sleeves from gloves or hair from a hat                             |
| `postProcess` ([items.ts:1949](../../../../app/src/lib/items/items.ts))   | `trimToKeyframe`, `dropOffBody`, `attachHeld`, `closeGrip`, `repairDropped`                                                | Every repair needs the item's own dressed keyframe and wrist or neck keypoints; a union has none |
| `itemQa` ([items.ts:2534](../../../../app/src/lib/items/items.ts))        | Per item, per clip: body kept, key outside, area CV, palette distance, held grip                                           | No notion of a second item, and no cross-view check on edit cells                                |
| Price ([items.ts:210, 757](../../../../app/src/lib/items/items.ts))       | `editGens` = 10 up to 128 px; `meanSideGens` = 10 / 15 / 25 at 256 / 336 / above                                           | Batching saves only when it reduces the number of 10-gen requests                                |
| Frame caps ([routes.ts:249](../../../../app/src/lib/pixellab/routes.ts))  | `edit-animation-v2` and `edit-images-v2`: 16 frames at 64 px, 9 at 80, 4 above; `transfer-outfit-v2` one fewer, 15 / 8 / 3 | 3 views x 6 frames = 18 frames never fits one request at 64 px                                   |

## Cost model

One move, 3 views (south, east, north; west mirrors east), 6 frames, 64 px. Generations use the app's model; USD is the
planning ratio $0.005 per generation, not a cash rate.

| Option                                                        |  Requests, 2 items |          Gen, 2 items |  Requests, 3 items | Gen, 3 items | What the layer is                                           |
| ------------------------------------------------------------- | -----------------: | --------------------: | -----------------: | -----------: | ----------------------------------------------------------- |
| A, `edit-animation-v2` on one body                            |                  2 |                    20 |                  2 |           20 | One composite mask per frame, both items                    |
| A, skeleton dress then pose                                   |                  4 |                    19 |                  4 |           19 | One composite mask; dress 10 + 3 pose x 3                   |
| A, skeleton, later move (keyframe composed from saved layers) |                  3 |                     9 |                  3 |            9 | Same                                                        |
| B1, batched dress + skeleton pose                             |                  7 |                    28 |                 10 |           37 | Per item; separate outputs                                  |
| B2, one packed canvas per view                                |                  3 |                    30 |                  3 |           45 | Per item by cell; single image per view                     |
| B3, one packed canvas for every cell                          | 1 (2 with margins) |                    25 | 1 (2 with margins) |           25 | Per item by cell; 4 px margins push 3 items to 2 calls (50) |
| C, queue (current)                                            |                  6 |                    60 |                  9 |           90 | Per item; no saving                                         |
| C, queue, skeleton (current)                                  |                  8 |                    38 |                 12 |           57 | Per item; no saving                                         |
| D, `transfer-outfit-v2`, all items worn in the reference      |                  2 | 20 (price unmeasured) |                  2 |           20 | One composite; no chroma key if frames are real bases       |
| E, 1-direction objects + 8 rotations                          |                  3 |   22 to 26 (inferred) |                  4 |     28 to 34 | Separate objects; not frame-aligned                         |
| F, independent images in `edit-animation-v2` requests         |                  3 |                    30 |                  4 |           40 | Per item; separate outputs, current extraction              |

B1 assumes the 9 rest views (3 items x 3 views) fit one 16-image call at 10 gen, then 3 pose calls per item at 3 gen.
B2 packs N items x 6 frames per view: 12 cells at 64 px is 256x192 (10 gen), 18 cells is 384x192 (15 gen), no margins.
B3 packs 36 or 54 cells in one canvas: 384x384 and 512x448, both mean side above 336, so 25 gen.
E prices `create-1-direction-object` at 10 to 25 per call ([OpenAPI](../../../pixellab/pixellab-openapi-v2.json)) and
`generate-8-rotations-v3` at $0.029 to $0.038 per call, about 6 to 8 gen, from
[the Pip review](../../tools/pixellab_pip/pixellab_pip_paperdolling_review.md); on this account it is unmeasured.

## Option by option

### A. One call, all items named, one dressed body

Request: `POST /edit-animation-v2` with `description` naming every item and their order, `frames` = the chroma cells, one
`image_size` (64x64), `no_background: true`, one `seed`. The prompt is `chromaPrompt` with several nouns, for example
"Add short messy dark brown hair and a steel helmet worn over it, drawn in their own colors (no bright green on the
items), identical design in all frames; the helmet covers the hair, only the hair below the brim shows." 18 frames do not
fit the 16-frame cap, so it is two requests (16 + 2 with an anchor cell), 20 gen. The skeleton form is one 10-gen dress
call of the 3 rest views plus 3 pose calls of 3 gen, 19 gen for any item count.

Identity and palette: one key, one prompt, one seed, one quantization. `target_palette` is not typed on `edit-images-v2`
and was rejected on `edit-animation-v2` by a paid A/B (6/8 versus 8/8), so there is no palette lock. The item palette
would be recovered per item only after a split, and the split is the failure.

Separation: impossible in principle, not merely hard.

- The extracted mask is the union. Pixels in the overlap exist once, in the upper item's color.
- Slot bands separate head from torso but not hair from hat, sleeve from glove (both `arms`), or cape from armor (both
  cover the torso band).
- Connected components fail on the cases that matter: the fixture's hair plus helmet is one component in every frame.
- Color assignment on the fixture is perfect for **exclusive** pixels (100% on all 15 pairs, zero ties) because accepted
  palettes are disjoint. That is the ceiling, not the result: it cannot invent the lower item's hidden pixels, and it
  breaks as soon as the generated palettes approach each other. 37.9% of exclusive hair pixels sit within 16 of the
  helmet's palette, 58.7% of the exclusive pixels in the helmet and sword pair sit within 16 of the other item's palette,
  and 10.8% of cape pixels within 8 of the hair's; the
  measured palette drift at 64 px is 11.5 to 17.1 after the app's snap.

Overlap failure modes:

- **Sleeve over glove:** the shared boundary is 1 to 2 px wide. Whichever item the model puts on top owns the boundary;
  the other loses its cuff. Removing the sleeve later leaves no cuff. `bandOf` returns the whole hand region for both.
- **Cape over armor:** 46.6% mean, 100% max of the vest is covered; one component in 16 of 30 frames. The cape's front
  straps and the armor merge, and the armor under the cape is gone. The cape also needs its behind-body part (`bgZ`), which
  is composited from a complete layer, not from the visible union.
- **Hair over hat:** 85.5% of the hair is covered by the helmet (98.8% max), 55.8% by the hat; one component in every
  frame. The "hair" layer becomes the visible fringe only. This also breaks the slot rule that a helmet clips hair.
- **Weapon over hand:** the accepted sword layer is only 4.7% on the body, so the hand overlap is small, but the grip is
  rebuilt per item by `attachHeld` and `closeGrip` from the wrist keypoint and the dressed keyframe, which currently records
  a 0 px grip gap. A union has no grip to rebuild, and the blade segment hidden behind the hand is missing.
- **Pixels legitimately occluded in a view** (hair under a helmet, the torso under a cape, the haft inside the fist) do not
  exist in any frame of a shared call. The current pipeline keeps them because each item is drawn against its own keyed
  copy of the body. Losing them is not a review finding, it is permanent data loss for the layer product.

### B. Several chroma mannequins in one canvas, split by cell

Two different things share this label.

**B1, batched dress (recommended shape).** One `edit-animation-v2` request with the N items' 3 rest views as separate
images, one mannequin per image, then pose each item as today. 10 gen for the dress plus 3 gen per item
per view: 28 gen for 2 items, 37 for 3, against 38 and 57 today. Every image is a separate mannequin, so identity, key and
extraction stay per item; the only new question is whether one prompt with several items keeps each image's own design.

**B2, one canvas per view.** Cells 2 items x 6 frames = 12 or 3 items x 6 = 18 at 64 px, 10 to 15 gen per view, 30 to 45
gen for the move, no separate pose. The model sees a sprite sheet; split by cell is exact. Cell bleed is the risk: the
qualified item sheet uses 4 px margins and still had 22 of 450 frames touching a cell edge before margins, and 3 of 8
64 px sheets drew back-view frames. A 54-cell canvas with margins does not fit 512 px.

**B3, one canvas for all cells.** 25 gen for 36 or 54 cells, the nominal cheapest. It has no margins (bleed), one prompt
must assign a different item to every cell (description limit 2000 characters), and one key covers all items. It is the
least tested layout and saves 5 to 20 gen over B2.

Separation in B is by geometry, so overlap inside a cell is still fatal: if the model draws the item onto the wrong cell,
or across a border, the mask is as unsplittable as A.

### C. One request per item, queued together (current)

6 requests and 60 gen for 2 items, 9 and 90 for 3 on the anchored route; 8 and 38, 12 and 57 on the skeleton route.
Concurrency reduces latency, not generations ([`planCalls`](../../../../app/src/lib/items/items.ts) packs one item's
clips; nothing merges items). This is the baseline the others must beat.

### D. `transfer-outfit-v2` with a reference wearing all items

Request: `reference_image` = one 64 px frame already dressed with every item; `frames` = the move's body frames;
`image_size` 64x64; `additional_instructions`. Cap is 15 frames at 64 px, so 18 frames is 2 requests. The route is not in
the x31 ledger; S1 measured 10 gen for 8 frames at 64 px ([S1](../../../spikes/S1_api_feasibility.md)), so 20 gen is an
allowance and the 15 + 3 split is not receipted.

Identity: the reference fixes the design strongly, and `target_palette` exists on this route but is untested. Palette is a
share of the reference, not per item.

Separation: none. The output is a dressed frame, not a keyed composite unless the submitted frames are chroma mannequins,
which is untested for this route. Extracting against the real base falls back to the diff route (`route: 'none'`), whose
best variant reached 0.945 precision and 0.977 recall in S1, below the chroma route. All A failure modes apply, plus a
weaker mask.

### E. `create-1-direction-object` `item_descriptions` + `generate-8-rotations-v3`

Request: `POST /create-1-direction-object` with `size: 64`, `view: "top-down"`, `description` for the set, and
`item_descriptions` listing one item per object (at 64 px the call yields up to 16 candidates). Then one
`/generate-8-rotations-v3` per object. Cost 22 to 26 gen for 2 items, 28 to 34 for 3, inferred.

Identity: prompt only. There is no body, no key, no reference design shared with the saved standing item, and the
rotations are regenerated, not exact ("Regenerates; not exact" in the Pip review). Alignment: none. The result is a set
of isolated objects that would need a rigid attachment system. The pipeline spike already holds that route as research,
not shippable: rotating a layer per frame changes which body pixels it covers, the over/behind split and the grip must be
recomputed, and the current pipeline records 0 px grip gap, so there is no accuracy case. It is also outside this repo's
allowed model list, so it needs an owner decision before any spend.

Separation is trivial (one object per output) but the question asked is frame-aligned layers, and E does not produce them.

### F. Independent images in one edit request (the honest batch)

Request: `POST /edit-animation-v2` (frames 2 to 16, one image per input, proven by the 16-frame S1 call and the 4-frame
x31 calls) or `POST /edit-images-v2` (`edit_images[1..16]`, untested at 64 px because the x32 probe was refused at 92 px).
One request carries 16 independent chroma images: item A's reference and frames, then item B's, and so on. At 64 px,
2 items x 18 frames = 36 images is 3 requests; 3 items = 54 images is 4 requests. 30 and 40 gen.

Identity: per image, per item. Each output is extracted by the current `extractCell` with its own key, its own band and its
own standing palette; no new split logic. Different items that need different keys can be grouped into different requests.
The only new risk is cross-image design bleed, which is testable for 10 gen.

This is the only route that both reduces requests and keeps frame-aligned layers. Its saving is against the anchored
route (60 to 30, 90 to 40), not against skeleton posing on a later move (9 per item).

## Offline measurements

Source: `app/public/fixtures/s2`, 6 accepted items on a 64 px, 3-direction rig, 42 cells per item (walk 3 x 8, cross-punch
3 x 6), one PNG sheet per item. Method: each item's mask is compared per cell with every other item's mask and with the
body mask; colors are read from the same PNGs. This measures accepted layers, so it is the ceiling for separability, not
a model output.

### Coincidence (legit occlusion of the lower-z item)

| Pair, lower item      | Frames | Overlap px mean | Max | Share of lower item mean |       Max |
| --------------------- | -----: | --------------: | --: | -----------------------: | --------: |
| hair + helmet (hair)  |     30 |           102.9 | 135 |                **0.855** | **0.988** |
| hair + hat (hair)     |     24 |            63.9 | 102 |                    0.558 |     0.895 |
| helmet + hat (helmet) |     24 |            67.0 | 108 |                    0.527 |     0.817 |
| vest + cape (vest)    |     30 |            60.7 | 163 |                    0.466 |     1.000 |
| cape + sword (cape)   |     30 |            32.8 |  84 |                    0.098 |     0.308 |
| all other pairs       |        |        0 to 2.8 |  22 |                   < 0.01 |    < 0.06 |

### Body pixels under items

| Item   | Item px mean | On the body | Share of item | Share of visible body px |
| ------ | -----------: | ----------: | ------------: | -----------------------: |
| vest   |         92.0 |        87.7 |         0.954 |                    0.228 |
| cape   |        278.3 |       102.8 |         0.369 |                    0.267 |
| hair   |         87.1 |        40.9 |         0.470 |                    0.106 |
| helmet |         93.7 |        49.8 |         0.532 |                    0.130 |
| hat    |        155.1 |        41.2 |         0.266 |                    0.077 |
| sword  |         65.7 |         3.1 |         0.047 |                    0.008 |

Body pixels claimed by two or more items at once (mean px per frame; the stacking a shared call cannot label):

| Set                  |  Bare | One item | Two or more | Share of body px |
| -------------------- | ----: | -------: | ----------: | ---------------: |
| hair + helmet        | 334.1 |      9.8 |        40.5 |            0.105 |
| vest + cape          | 234.6 |    109.1 |        40.7 |            0.106 |
| vest + hair + cape   | 194.8 |    147.8 |        41.7 |            0.109 |
| helmet + vest + cape | 186.4 |    156.0 |        41.9 |            0.109 |
| all five worn items  | 183.2 |    119.7 |        81.5 |            0.212 |

### Can a union be split?

| Pair           | Exclusive px all correct | Ties | Palette min distance | Exclusive px within 16 of the other palette | Union components | Frames with one component | Seam px mean |
| -------------- | -----------------------: | ---: | -------------------: | ------------------------------------------: | ---------------: | ------------------------: | -----------: |
| hair + helmet  |                    1.000 |    0 |                   14 |                                       0.379 |             1.00 |                   30 / 30 |         96.6 |
| hair + hat     |                    1.000 |    0 |                   28 |                                       0.000 |             1.00 |                   24 / 24 |        195.1 |
| helmet + hat   |                    1.000 |    0 |                   12 |                                       0.029 |             1.00 |                   24 / 24 |        182.6 |
| vest + cape    |                    1.000 |    0 |                   16 |                                       0.040 |             2.77 |                   16 / 30 |        428.2 |
| cape + sword   |                    1.000 |    0 |                   26 |                                       0.000 |             3.83 |                    8 / 30 |        443.7 |
| helmet + sword |                    1.000 |    0 |                   13 |                                       0.587 |             2.37 |                    0 / 30 |        223.1 |
| hat + sword    |                    1.000 |    0 |                    9 |                                       0.444 |             1.96 |                    8 / 24 |        246.5 |

"All correct" is nearest-palette assignment of pixels owned by only one item. It confirms that palette matching can
separate **visible** pixels in this warm, deliberately distinct set; it says nothing about hidden pixels, and the margin
column shows how little color drift is needed to break it.

### Chroma key loss on accepted layers

| Item                            | Green | Magenta |      Blue |                        Azure |
| ------------------------------- | ----: | ------: | --------: | ---------------------------: |
| vest, cape, hair, helmet, sword |     0 |       0 |         0 | 0 lost; sword 12.4% near-key |
| wizard hat                      |     0 |       0 | **0.906** |                    **0.906** |

This matches the chroma census ([chroma-key.md](../../2026-11-09-paperdoll-video-review/chroma-key.md)): green is clean on
warm materials, and the key switch exists precisely because one key cannot serve every item. In one shared call there is
no switch. A set with a green item and a blue item has no collision-free key, because green deletes the first and blue
deletes the second (inferred from the score rule and the census; the fixture has no such set).

### Body drift inside a slot

No stored composite was available for a new offline measurement, so this uses the measured studies:

- `edit-animation-v2` and `transfer-outfit-v2` change every body pixel: 0% exact, 44.7 to 50.8% within Δ8, 77.0 to 78.0%
  within Δ18 ([S1 E4](../../../spikes/S1_api_feasibility.md)).
- Skeleton posing keeps the layer fit but the returned body differs by 23 to 58 px per east frame, and 3 of 4 items
  failed the body-kept gate; re-registration does not fix it
  ([x31 review round 1, point 3](../../2026-11-23-item-move-route-cost.md)).
- The item sheet never fell below 0.949 body kept on a passing sheet, and 0 of 18 failed at 92 px; at 64 px 3 of 8 sheets
  drew 1 to 2 back-view frames, 4 of 216 frames, and QA caught one
  ([x31](../../2026-11-23-item-move-route-cost.md)).
- Separate calls are not repeatable: the same input frame twice differs in 6 to 94 px of item shape (2 to 20%) and about
  70% of exact colors ([pipeline spike](../../2026-11-24-pipeline-spike/README.md)).

For a slot, the practical number is how much of the slot's body is exposed: 384 body px per 64 px cell on average, of
which one item covers 0.8 to 26.7% depending on the slot. A 23 to 58 px body drift is therefore a material share of the
body under a torso or head item, and in a shared call the same drift runs under every item at once.

### Review cost of a wrong overlap

There is no measured review-minutes figure anywhere in the repository, and the pipeline spike names review as the binding
cost without quantifying it. What can be quantified:

- A wrong order shows along the seam: 97 px mean for hair and helmet, 182 to 246 px for head and hand pairs, 428 px for
  vest and cape per frame.
- The gates cannot see it. `itemQa` evaluates one item's cells and palettes ([items.ts:2534](../../../../app/src/lib/items/items.ts)),
  and a synthetic whole-view swap passed QA for all four 92 px items
  ([x31 point 4](../../2026-11-23-item-move-route-cost.md)). A 30 px wrong-color region in a 500 px glove moves mean palette
  distance by roughly 2, under the threshold of 15 (estimate from the gate formula, not measured).
- Detection is manual and per cell. One move is 18 composite cells; with 2 items that is at least 97 to 428 seam px per
  cell to inspect, at 64 px, per item pair. Rework is a whole re-roll (10 to 25 gen), not a local patch, and the re-roll
  can swap a different pair.

## Most promising option

**F, independent images in one `edit-animation-v2` request, with B1 as the cheaper form for a new item.** Keep one
mannequin per image and one output per input; never draw two items on one body.

- New item: batch the 3 rest views of every new item into one 10-gen dress request (B1), then pose each item as today.
  28 gen for 2 items, 37 for 3, against 38 and 57. Later moves stay at 9 gen per item, so batching is a first-creation
  saving, not a per-move saving.
- Anchored route: batch up to 16 independent frames per request (F), 30 gen for 2 items and 40 for 3, against 60 and 90.
- Do not pack different items into one canvas (B2/B3) before the independent-image call is qualified; the canvas adds cell
  bleed and per-cell prompt assignment for a smaller saving.

## Cheapest paid falsification test

Two requests, **20 generations**, one seed, existing accepted items on the S2 fixture rig (64 px, walk, south), no UI
work. Probe 1 decides the recommended option; if it fails, the option is dead and Probe 2 is not spent. Probe 2 tests the
shared-body idea and is expected to fail; that does not affect the independent-image route.

### Probe 1: does one request keep separate items separate? (10 gen)

`POST /edit-animation-v2`, `image_size` 64x64, `no_background: true`, seed 7, **10 frames**:

1. `hair_brown` dressed south reference (its saved `dressed` chroma cell)
2. 4 chroma south walk frames of the same base (the hair targets)
3. `helmet_steel` dressed south reference
4. 4 chroma south walk frames (the helmet targets)

Description, exact:

> These 10 separate images are frames of the same pixel art character, a solid bright green mannequin, facing south.
> Image 1 already wears short messy dark brown hair: copy exactly that design, colors and size onto images 2 to 5.
> Image 6 already wears a steel helmet: copy exactly that design, colors and size onto images 7 to 10, with no hair
> visible below the brim. The bright green is a chroma key and must stay exactly the same bright green. Keep every other
> pixel, the pose, the outlines and the transparent background unchanged. Empty hands, no weapons, no effects.

Extract each output with `extractCell` (green key) and score with `postProcess` and `itemQa`.

**Pass:** 10 images returned, order preserved (each output's body silhouette is within 1 px of its input); each item's
targets match its own reference (aligned silhouette IoU at least 0.85, mean palette distance at most 15 after the app's
snap, the same floor as the 64 px sheet study; the IoU bar is chosen from the 0.80 to 0.85 seed-to-seed and truth IoUs
measured at 64 px, not from a batch result); cross-item contamination under 2% of item pixels (hair colors in the
helmet set, helmet gray in the hair set); `itemQa` passes or warns, not fails, for both items; billed usage is at most 10.

**Fail:** fewer or more than 10 images; order changed; one design imposed on both sets; either item fails G2 or G3; or the
call is billed above 10. A fail means the model treats a multi-item request as one animation, so batching independent
items needs `edit-images-v2`, which is itself untested at 64 px.

### Probe 2: does a shared body separate? (10 gen)

`POST /edit-animation-v2` with the same 6 south chroma walk frames, one image per frame, 64x64, seed 7. Description, exact:

> This pixel art character is a solid bright green mannequin. The bright green is intentional (a chroma key) and must stay
> exactly the same bright green in every frame. Add short messy dark brown hair and a steel helmet worn over it, drawn in
> their own colors (no bright green on the items), identical design in all frames. The helmet covers the hair; only the
> hair below the brim shows. Cells in order: 6 cells walk facing south (front view). Keep every other pixel, the pose, the
> outline and the transparent background unchanged.

Attempt the split three ways: the slot band from `bandOf`, per-item accepted palettes, and connected components.

**Pass (for A) only if** each item's recovered layer is within 3% of its accepted full layer area and no visible pixel is
owned by both. Because the hair under the helmet is 85.5% of the accepted hair (98.8% max) on this exact pair, A's pass
bar is unreachable without the model redrawing hidden pixels. **Fail is the expected and useful outcome:** it converts
the offline ceiling into a recorded live result, and it costs 10 gen.

### Budget

| Item                                                        |    Gen |
| ----------------------------------------------------------- | -----: |
| Probe 1, multi-item request                                 |     10 |
| Probe 2, shared body                                        |     10 |
| Reserve for one repeat of a probe whose result is ambiguous |     20 |
| **Total**                                                   | **40** |

Cheapest decisive version: Probe 1 alone, 10 gen. It decides the recommended option. Probe 2 is 10 gen to close the
question in the brief with a live record rather than inference.

## Caveats a UI warning would have to state

If a batch request mode ever ships, the warning next to the action must say:

1. **Items stay separate layers.** PixelDoll batches the request, not the drawing. It never draws two items on one body,
   because layers cannot be separated afterward and pixels hidden under the other item would be lost.
2. **The whole request is one job.** If it fails, every item in it is lost together and a retry costs the same again;
   there is no per-item retry inside one request. Progress is per request, so all items in it finish at once.
3. **One prompt and one seed for the group.** Items are grouped by key so no item silently loses pixels to the chroma
   key. An item that needs a different key is sent in a different request, which can finish later.
4. **The cap is real.** At most 15 images with a reference (16 without) at 64 px, 9 at 80 px, 4 above. A move with more
   frames spans requests, and separate requests differ (6 to 94 px of shape, about 70% of exact colors), so a group is
   not one guaranteed-identical design.
5. **Review is still required.** PixelDoll has no cross-item or cross-view check. The user must look at every frame of
   every item before saving, as with any edit call.
6. **Cost is shown up front** in generations for the whole group, with the per-item equivalent, and no paid request is
   resent after a failure.

## Limits

- The fixture is one 64 px character, 6 items (5 warm or gray plus one blue hat), 3 directions, one walk and one punch. It
  has no green gear, no held weapon in an attack, and no 8-direction or diagonal view. The key-loss table is therefore a
  lower bound on real collisions.
- The separability numbers are measured on accepted layers with disjoint palettes. A generated composite has drifting
  colors; the margin table bounds how much drift the color split tolerates.
- `edit-images-v2` N-in / N-out at 64 px is not measured. The x32 probe was refused at 92 px before a result, so the
  recommended route uses `edit-animation-v2`, whose 16-in / 16-out is receipted.
- `transfer-outfit-v2` has one measured point (10 gen for 8 frames at 64 px in S1) but no receipt for the 15-frame cap
  split; D's 20 gen is an allowance.
- No review minutes exist in the repository. The review-cost section reports seam pixels and gate blindness, not time.
