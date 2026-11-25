# Paperdoll API review and batch item generation spike

2026-11-24. Research only. No app behavior changed, no paid PixelLab calls, no token use. Every claim uses public PixelLab sources or this repository.

Read with the four findings files in [`findings/`](findings/):

- [api-delta.md](findings/api-delta.md): live OpenAPI versus the October snapshot, and every paperdoll-relevant route or field.
- [pixellab-public-features.md](findings/pixellab-public-features.md): what PixelLab publicly documents about paperdolls, equipment and batches.
- [pipeline-fit.md](findings/pipeline-fit.md): where a shared request would enter the current item pipeline and what blocks it.
- [batch-feasibility.md](findings/batch-feasibility.md): cost model, separability measurements on the S2 fixture, and the paid probe plan.

## Answer

**PixelLab has no public paperdoll system, no equipment slots, and no public batch call that generates several equipment items for one animation.** The secondhand description does not match any public PixelLab feature. The closest public things are outfit transfer onto one clip, character states, and a multi-object candidate sheet. Treat the description as a product hypothesis, not a PixelLab capability we failed to use.

**Batch generation is still worth testing, but only at the request level.** The `edit-animation-v2` contract accepts several independent chroma mannequin images in one call, one per item, and returns one image per input. If the model keeps them independent, every item keeps its own image, key, palette and extraction, so layers stay separate. That would save the 10-generation dress call for each additional item, but it does not beat the default 3-generation skeleton pose call for a later move. Whether the model keeps them independent is the one unproven step, and a 10-generation probe decides it.

**Drawing several items on one body is the cheap route, and it cannot produce separate layers.** The API returns composites, and PixelDoll's extractor produces one mask per cell with no item labels. Overlapping items merge into one connected component, and pixels hidden under the other item never exist in the output. The measured loss on accepted art is large: 85.5% of hair under a steel helmet, 46.6% of a vest under a cape (100% in some frames). This is not a visual flaw we can warn about and accept; it is permanent data loss for a paperdoll layer.

**The sound way to draw a set together is to make the set one item.** One full-body outfit layer costs about the same as one item, keeps occlusion coherent because the model draws it as one design, and cannot be swapped or recolored per piece. That is a product choice, not a batching trick.

So the menu is:

| Option                                   | Cost for a new 3-view item set       | Layers        | Verdict                                                          |
| ---------------------------------------- | ------------------------------------ | ------------- | ---------------------------------------------------------------- |
| Separate items, current skeleton route   | 19 gen per item                      | Per item      | Today's default                                                  |
| Separate items, one shared dress request | 10 + 9 per item (28 for 2, 37 for 3) | Per item      | Save 10 gen per extra item if a 10-gen probe passes              |
| Separate items, anchored route batched   | 15 per item at 64 px (30 for 2)      | Per item      | Saves against the anchored route, still worse than skeleton pose |
| Items drawn together on one body         | 19 gen for the whole set             | One composite | Dead for separate layers                                         |
| One outfit as one item                   | 19 gen for the whole set             | One layer     | Cheap and visually coherent, set-only swapping                   |

## 1. The premise: what PixelLab actually publishes

PixelLab's public docs, `llms.txt`, MCP docs and OpenAPI (140 paths) contain no paperdoll, equipment-slot, wardrobe or layered-character feature. `paperdoll` and `paper doll` return zero hits. `equipment` returns one hit, a use case in the Transfer Outfit description. Every public use of "slot" means a packed grid cell, a UI inventory icon, a GPU concurrency slot, or a per-direction job. Details and quotes are in [pixellab-public-features.md](findings/pixellab-public-features.md).

The lines closest to the hypothesis, and what they actually mean:

- **"every direction in its own slot"** in the 2026-11-11 "What's New" video describes custom animation with a separate job per facing direction. The API says "one job per direction, directions independent". It is not about items.
- **Transfer Outfit (Pro)** applies one reference outfit to 2 to 16 frames of one animation in one call, priced by the packed grid. It returns composites, one per frame, with no layer separation.
- **Create Character State** applies one edit to all 4 or 8 rotations for one charge and saves a new character in a group. It produces rotations, not animation frames, and not layers.
- **1-direction objects with `item_descriptions`** generate several distinct objects in one call (1 to 64 candidates depending on size), then require a review selection. They are not worn, posed, or aligned to a body.
- **UI split-template states** draw every element in every state on one labelled grid for one generation. It is the structural pattern PixelLab uses for batching slots, and it is UI-only.

There is also no public first-party warning about overlapping equipment. The nearest is a January 2026 marketing Short whose prompt tells the model to omit occluded clothing and leave hard cut-outs. That is the same conclusion PixelDoll reached on its own, and it is prompt advice, not a product guarantee.

## 2. Public API capabilities we have not tried, ranked for paperdolling

The live spec grew from 102 to 140 paths since the October snapshot. Most additions are objects, rooms, VFX, UI, audio and fonts. Five are relevant enough to name. None is a batch-item call.

1. **`inpaint-image-pro-flash` with `output_method: "Modify current layer, only changes"`.** The only public request that returns changes-only pixels, transparent outside the mask, with exact preservation claimed outside it. This is the closest public replacement for the chroma key and despill step. PixelDoll uses `inpaint-v3`, which has no output method. Needs a price check and a live alpha check on one stored frame. It is not in the repository's allowed model list, so it needs an owner decision first.
2. **`create-8-direction-object` from a reference image, plus free `objects/import` and paid `expand-rotations`.** "Generates 8 rotations of this exact image" for 10 to 25 generations, and import is free and pixel-exact. This can turn one item PNG into a static 8-direction item set, and can restyle every direction in one object state call. It cannot follow a move, so it fits held or rigid items only after a separate attachment design. Transparency is not stated in the spec, which is the first thing to verify.
3. **`generate-8-rotations-v3` with `direction_images`.** Completes or repairs a direction set from art the user already drew, returns supplied directions pixel-exact, and costs the same as a single rotation. Still one static pose per direction, not a move.
4. **`target_palette` now covers skeleton-v3, and `direction_prompts` gives each direction its own prompt.** The first could lock an item palette inside the paid call, which PixelDoll currently does locally. The second could improve view consistency for base moves. Both are quality experiments, not batching, and `target_palette` already lost one paid A/B on `edit-animation-v2`.
5. **`estimate-custom-skeleton` and the `rig` input on `animate-with-skeleton-v3`.** A cape, tail, wing or weapon can get its own joints instead of reusing the body skeleton. This is the most interesting quality route for difficult items, but it needs a separate design and is not a cost saving.

The free `canvas`, `duplicate`, `ungroup`, `mirror`, `rename` and `save-to-asset` endpoints mostly make PixelLab's own library easier to manage. They do not change what PixelDoll can draw. `mirror` only helps if item frames are produced as PixelLab animations, which they are not.

## 3. The two meanings of batch

**UI-level batch** already exists. The "Generate items" sheet lets a user pick several items missing one move, shows the summed price, and queues them one after another. Each item keeps its own draft, retry, review and provenance. There is no cost saving. The smallest remaining gap is starting several new items from one form; that is a loop around the existing draft path, not a pipeline change.

**Request-level batch** means one paid call carries images for several items. Only `edit-animation-v2` and `edit-images-v2` can do this with separate outputs, and only if each item keeps its own mannequin image. The shared body variant is a different thing and is covered in section 4. Items that need different chroma keys also make a shared prompt harder, so the first probe should use two items that share one key.

The cost model, one move, 3 views, 6 frames, 64 px, using the app's own price functions:

| Shape                                      | 2 items | 3 items | What is returned |
| ------------------------------------------ | ------: | ------: | ---------------- |
| Current skeleton route, new items          |      38 |      57 | Per item         |
| Current skeleton route, later move         |      18 |      27 | Per item         |
| Shared dress request, then pose per item   |      28 |      37 | Per item         |
| Anchored route, current                    |      60 |      90 | Per item         |
| Anchored route, independent images batched |      30 |      40 | Per item         |
| One body with all items, skeleton          |      19 |      19 | One composite    |
| One outfit layer                           |      19 |      19 | One layer        |

The shared dress saving exists because every `edit-animation-v2` call has a 10-generation floor up to 128 px. Filling that call with 6 or 9 rest views instead of 3 is nearly free. The same logic explains why the pipeline spike's earlier "multi-image batching is not a cost win" test was correct in its own case: it compared splitting one item's frames across images, not filling an underused call with other items.

Frame caps make the limit concrete. At 64 px a call holds 16 images, so five items' 3 rest views still fit. At 80 px it holds 9, so three items fit. Above 80 px it holds 4, so a single item's 3 views fit and no items can share a call. Held items use a 96 px canvas, so they cannot be batched at all with this route.

## 4. Why items drawn together cannot become separate layers

Measured on the accepted S2 fixture (6 items, 64 px, 3 directions, 42 cells per item):

- **Legitimate occlusion disappears.** Hair is 85.5% covered by a steel helmet (98.8% worst frame), 55.8% by a wizard hat, a vest is 46.6% covered by a cape (100% in some frames). A layer drawn alone contains those pixels; a layer drawn together cannot, because the other item is on top.
- **Connected components merge the overlapping pair.** Hair plus helmet is one 8-connected component in 30 of 30 frames; hair plus hat in 24 of 24; helmet plus hat in 24 of 24. The extractor keeps components of at least 2 px, so no component rule can split them.
- **One call means one chroma key.** Per-item key choice disappears. The fixture's wizard hat loses 90.6% of its pixels on blue or azure; a set with a green item and a blue item has no collision-free key.
- **Color splitting is exact only on visible, disjoint pixels.** Nearest-palette assignment is 100% correct on pixels owned by one item in this deliberately distinct set, but 37.9% of the hair pixels that only hair owns sit within 16 of the helmet palette, and 58.7% of the pixels owned by only one item in the helmet and sword pair do the same. Measured palette drift at 64 px is 11.5 to 17.1, which is enough to cross those margins on a real generated composite.
- **The gates cannot see a wrong overlap.** `itemQa` evaluates one item's cells and palette. A whole-view swap passed all four items in an earlier study. Detection is manual, and the seams are 97 px wide on average for hair and helmet, 428 px for vest and cape, per frame.

Slot bands do not rescue this. They separate head from legs, not hair from hat, sleeve from glove, or cape from armor. Both items in each pair share the same band by design.

So the user-facing warning cannot honestly be "items may overlap and look wrong". It has to be "the items become one layer, and pixels under the other item are gone". That is a different feature: one outfit, not several items.

## 5. What to build, if anything

**Recommended, in order:**

1. **Do not draw several items on one body for separate layers.** Keep this as a rejected design with the evidence above, not an option behind a warning.
2. **If cost matters more than swapping, offer one outfit layer.** One full-body item, generated and posed exactly like any item, about 19 generations for the whole set. It is visually coherent, because the model draws the set as one design, and the caveat is simple: it swaps, recolors and exports as one piece. This needs a slot decision (a Full body slot, or a custom slot) before design.
3. **If separate layers are required, test shared dress requests.** A 10-generation probe on stored art decides whether one prompt can dress item A on images 1 to 5 and item B on images 6 to 10 without imposing one design on both. If it passes, the new-item form can offer "Generate all selected items" for 10 + 9 per item instead of 19 per item. Each item keeps its own draft and retries; only the dress call is shared.
4. **Leave the anchored and sheet routes alone for now.** Batching them saves money only against the anchored route, which is already the expensive fallback. The default skeleton pose route is cheaper and better tested.

**What this does not give the user:** one generation pass that returns N swappable items from one drawing. No public PixelLab route can do that, and the app's own extractor cannot split the result. The honest product promise is either "one outfit, one layer, cheap" or "several items, several layers, one shared request".

## 6. Proposed paid probes (needs approval)

No generations were spent. Balances and receipts should be checked with `GET /balance` only, as the agent rules require.

| Probe                            | Generations | Question                                                                                                                                                  | Pass                                                                                                                                                           |
| -------------------------------- | ----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared dress request             |          10 | Can one `edit-animation-v2` request dress two different items on their own mannequin images without blending the designs or applying both to every image? | 10 images returned in order, each item within 1 px body silhouette, at most 2% cross-item color contamination, both QA results pass or warn, billed at most 10 |
| Changes-only inpaint             |          10 | Does `inpaint-image-pro-flash` return a clean transparent layer at 64 to 256 px, and what does it cost?                                                   | Alpha is binary outside the mask, unasked pixels unchanged, price at most the 10-gen Pro tier                                                                  |
| 8-direction object from one item |    10 to 25 | Do object rotations keep the item's palette, scale and silhouette well enough to overlay on a body frame, and is the output transparent?                  | Transparency confirmed, silhouette within 2 px after pivot alignment, 6 of 8 directions accepted                                                               |

The shared dress probe is the only one that decides the batching feature. The other two are route questions that would each need their own design work. Total if all three run: 30 to 45 generations, plus a reserve.

## 7. What would change this answer

- If a shared dress probe passes, request-level batching is a real, small feature and should be scheduled.
- If `inpaint-image-pro-flash` changes-only is cheap and exact, it could replace the chroma key for static or layered edits, which is a bigger quality change than batching and should be evaluated on its own.
- If the owner's source saw a private or beta PixelLab paperdoll feature, it is not public. It should not be cited or planned against until PixelLab documents it.
- If a full-body outfit slot ships, the cheap shared-drawing option becomes a product choice with a clear cost story.

## 8. Sources

- Live OpenAPI: https://api.pixellab.ai/v2/openapi.json, fetched 2026-11-24 (140 paths).
- PixelLab docs: https://www.pixellab.ai/docs and the tool pages cited in [pixellab-public-features.md](findings/pixellab-public-features.md).
- PixelLab `llms.txt`: https://www.pixellab.ai/llms.txt.
- MCP guide: https://api.pixellab.ai/mcp/docs.
- Transfer Outfit (Pro): https://www.pixellab.ai/docs/tools/transfer-outfit-pro.
- 2026-11-11 "What's New" video: https://www.youtube.com/watch?v=OND5ExBdajQ.
- "Building modular clothes with PixelLab!" Short: https://www.youtube.com/shorts/1EDq2xHQcJ8.
- Repository: `docs/research/2026-11-24-pipeline-spike/`, `docs/spikes/S1_api_feasibility.md`, `docs/research/2026-11-23-item-move-route-cost.md`, `docs/research/2026-11-09-paperdoll-video-review/chroma-key.md`, and the code references in [pipeline-fit.md](findings/pipeline-fit.md).

No private PixelLab information, authenticated app internals or proprietary JavaScript were used.
