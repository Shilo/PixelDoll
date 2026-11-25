# Where a multi-item generation pass would fit in the item pipeline

2026-11-24. Read-only analysis. No app code, tests or paid calls were changed or run.

Scope: map the current item pipeline, distinguish "request-level batch" (one paid API call, N items drawn at once) from "UI-level batch" (N calls queued together), and name the smallest seam plus the blockers. It does not design the feature.

Files read: `app/src/lib/items/items.ts`, `run.ts`, `slots.ts`, `app/src/lib/pixellab/routes.ts`, `queue.ts`, `plans.ts`, `app/src/studio/create.ts`, `itemGeneration.ts`, `itemRoute.ts`, `movePricing.ts`, `costEstimate.ts`, `state.svelte.ts`, `NewItemSheet.svelte`, `ItemGenerationSheet.svelte`, `ItemGenerationList.svelte`, `ItemPane.svelte`, `app/src/lib/store/manifest.ts`, `app/src/lib/image/chroma.ts`, `app/src/lib/dress/dress.ts`, `item-palette.ts`, `app/src/lib/equipment/copy.ts`, `app/src/lib/store/generation.ts`, `app/src/lib/rig/clips.ts`.

## 1. The item pipeline, step by step

### 1.1 New item: form, plan, draft, cost

| Step                                          | Where                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Form fields, planned cost, Generate           | `app/src/studio/NewItemSheet.svelte:132-151` (plan), `:256-267` (submit), `:297` (gens shown) |
| Plan and draft interface                      | `app/src/studio/itemRoute.ts:41-65` (`ItemRoute.plan`, `draft`, `run`, `accept`, `spent`)     |
| Plan calls the item planner                   | `itemRoute.ts:144-164` (`chromaEdit.plan` -> `planItem`, `planGens`, `itemPlanMinimumTier`)   |
| Spec for a new item (standing coverage first) | `itemRoute.ts:122-131` (`newItemSpec`, `standingCoverage` at `:84-121`)                       |
| Start a paid draft                            | `app/src/studio/state.svelte.ts:3843-3945` (`startItem`, `startItemDraft`, `runGen`)          |
| Persist a draft and share the plan            | `run.ts:292-326` (`newDraft`), `Draft` at `run.ts:178-186`                                    |

The default scope is "standing views first": one still pose across all generated directions, priced from `standingCoverage` and `planItem`. Animated moves are separate later offers.

### 1.2 Dress step: chroma mannequin and prompt

| Step                                          | Where                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Chroma key from the prompt                    | `app/src/lib/image/chroma.ts:90-91` (`pickKey`), `keyAllowed` at `:67`                         |
| Mannequin recolor                             | `chroma.ts:94-108` (`toChroma`)                                                                |
| Dress prompt                                  | `chroma.ts:678-688` (`chromaPrompt`)                                                           |
| Item wording (held phrase, one held item)     | `items.ts:465-477` (`dressItem`, `heldPhrase`, `ONE_HELD` at `:462`)                           |
| Held-hand red dot                             | `items.ts:481-521` (`HAND_MARK`, `markHand`)                                                   |
| Dress request builder                         | `items.ts:119-140` (`itemRoute.edit` -> `routes.editAnimationV2`)                              |
| Which frames a dress call carries             | `items.ts:631-673` (`planItem`), `anchorChunks` at `:742-751`                                  |
| Frame cap per call                            | `app/src/lib/pixellab/routes.ts:250` (`editFrameCap`: 16 at <= 64 px, 9 at 65-80, 4 at 81-256) |
| Request assembly (chroma cells, held padding) | `run.ts:683-784` (`callRequest`, edit branch `:723-781`)                                       |

The design ("dress") call is one `edit-animation-v2` per chunk of rest views. Later chunks reuse chunk 1's dressed cell as an anchor (`planItem` comment at `items.ts:658-662`, `anchored` at `:753-754`).

### 1.3 Pose/animate step

| Step                                                                 | Where                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pose request builder                                                 | `items.ts:145-177` (`itemRoute.pose` -> `rawClip` -> `routes.animateWithSkeletonV3`)                                                                                                                       |
| Pose plan (one call per clip-direction, idle+walk packed when short) | `items.ts:710-740` (`posePlan`)                                                                                                                                                                            |
| Held-item frame order fix                                            | `items.ts:530-538` (`f0Last`, `unrotate`)                                                                                                                                                                  |
| Per-move posing of an accepted item                                  | `run.ts:2108-2360` (`poseItemClip`), request at `:2201-2225`                                                                                                                                               |
| Seed identity per item, move, direction                              | `run.ts:2162-2164` (`seedOf`)                                                                                                                                                                              |
| Anchored (frozen-frame) route                                        | `run.ts:1855-1980` (`animateAnchoredItem`), plan at `items.ts:1178-1199`                                                                                                                                   |
| Item sheet route (one edit-images-v2 per move)                       | `items.ts:879-935` (`ITEM_SHEET`, `canSheet`, `itemSheetLayout`, `itemSheetFits`), `:996-1076` (prompt, cells), `run.ts:3181-3294` (`itemSheetRequest`, `readItemSheet`), `run.ts:3299+` (`sheetItemMove`) |
| Grid fallback over a packed clip                                     | `run.ts:563-664` (`gridReq`), `items.ts:326-386` (`packGrid`, `cutGrid`), `run.ts:2788-2985` (`gridRepairRequest`, `regridClip`)                                                                           |

### 1.4 Extraction, post-process, QA, save

| Step                                      | Where                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Extraction                                | `items.ts:2061-2175` (`extractCell`), `items.ts:2176-2184` (`recompose`)                                                                    |
| Post-process (trim, cut, held repair)     | `items.ts:1949-1996` (`postProcess`, `dropOffBody`), `:1700-1832` (held attach/close grip/repair)                                           |
| Per-item QA gates                         | `items.ts:2372-2407` (`GATES`, `g2Fails`, `QaResult`), `:2534-2591` (`itemQa`), `run.ts:1598-1650` (`withH4`), `items.ts:3456+` (`dirGate`) |
| Evaluate a draft and produce `ItemResult` | `run.ts:1248-1541` (`evaluateItem`)                                                                                                         |
| Chroma key collision detection            | `run.ts:1543-1596` (`KEY_COLLISION`, `measuredKeyCollision`)                                                                                |
| Accept and build the `Item`               | `run.ts:1725-1850` (`acceptItem`), `items.ts:3659-3754` (`buildItem`)                                                                       |
| Save into the manifest                    | `items.ts:605-612` (`putItem`), band rules in `bandOf` at `items.ts:1241-1277`                                                              |
| Review and keep                           | `state.svelte.ts:4213-4262` (`acceptGen`), `:4129-4143` (`readGenReview`), `run.ts:2742-2786` (`acceptItemReview`)                          |

## 2. How requests and price are decided today

### 2.1 Number of requests

The only place that decides the request count for a new item is `planItem` (`items.ts:631-673`):

- `dress`: `anchorChunks(spec.dirs.map(restKey), editFrameCap(...))`, so 1 chunk per `editFrameCap` rest views.
- `pose`: `posePlan`, one call per clip-direction (idle+walk packed when both fit 15 frames and the slot is not held), then `poseBatches` splits clips over 15 frames (`app/src/lib/rig/clips.ts:220-231`).
- `anchor`: `planCalls` (`items.ts:1147-1175`) packs whole clips into `editFrameCap` cells.

For an accepted item on an existing move, `itemPosePlan` (`items.ts:806-821`) makes one pose batch per direction, and `poseItemClip` submits one request per batch (`run.ts:2157-2225`).

### 2.2 Price

| Price function       | Where                                   | Rule                                                                                                                      |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `editGens`           | `items.ts:757-760`                      | 10 / 15 / 25 gens by max side <= 128 / <= 170 / larger                                                                    |
| `poseCallGens`       | `clips.ts:232-233`                      | 2 gens for <= 3 frames, 3 for <= 12, 4 for 15                                                                             |
| `meanSideGens`       | `items.ts:229-232`                      | 10 / 15 / 25 gens by mean of width and height (inpaint-v3, edit-images-v2 sheets)                                         |
| `gridEstimate`       | `items.ts:210-225`                      | canvas layout plus `meanSideGens`                                                                                         |
| `planGens`           | `items.ts:763-777`                      | sum over calls: pose, grid, else `editGens`                                                                               |
| `itemPoseGens`       | `items.ts:1121-1143`                    | sum of `poseGensFor(cells)` or `repairGridLayout(...).gens` per direction batch                                           |
| `moveEstimate.items` | `app/src/studio/movePricing.ts:227-266` | per item: grid `repairGridPlan`, sheet `itemSheetLayout().gens`, anchor `planGens(planAnchoredMove)`, else `itemPoseGens` |

All of these are additive per item. Nothing in the price model represents a shared call.

### 2.3 What "batchable" already means (UI-level only)

The Done card "Make per-move item generation obvious and batchable" landed a priced picker over several items for one move:

- Rows are one per item missing that move: `app/src/studio/itemGeneration.ts:27-32` (`clipMissingItems`), `ItemGenerationList.svelte:47-81` (multi-select, per-row price).
- Offers combine: `itemGeneration.ts:37-65` (`clipItemOffer`), `:77-83` (`fillMissingMovesOffer`, several moves for one item), `:90-101` (`pickedOffers`: chosen rows, summed gens, concatenated specs).
- Sheet state and submit: `ItemGenerationSheet.svelte:26-52` (rows, `pickedOffers`, `itemOfferAccess`), `:54-70` (`generate` -> `queueMoves`).
- Each chosen spec is still one item: `create.ts:2612-2662` (`missingItemMoves`, `items: [item.id]`), priced via `create.ts:3047-3074` (`itemMoveOffer`, sum of per-spec `itemReview.gens`).
- Queue: `state.svelte.ts:5042-5052` (`queueMoves` appends and runs one spec at a time).
- Runner loops items and submits per item, per direction: `create.ts:3371-3384` (plans per item), `:3473-3543` (loop -> `animateAnchoredItem` / `sheetItemMove` / `regridClip` / `poseItemClip`).

So today's "batchable" is exactly UI-level batch: N specs, N request streams, price = sum, no shared call and no discount. One per-item "Fill missing moves" action remains listed as unfinished on that card.

## 3. Item data model and what a shared generation would need

`Item` (`manifest.ts:113-159`): `id`, `name`, `slot`, `status`, `route`, `key`, `dressed`, `standing`, `layers`, `baseHash`, `baseCut`, `anchorCell`, `provenance`, `qa`, `coverage`, `pending`, `copiedFrom`, `refit`, `unfitted`, `materials`.

- Frames: `Layer.cells: Record<anim, Partial<Record<dir, (Sha256 | null)[]>>>` (`manifest.ts:268-279`), plus optional per-layer `cell` and `pivot` for padded held layers.
- Slot and draw order: `Slot` with `z`, `bgZ`, `zOverrides`, `class`, `anchor` (`manifest.ts:87-111`), ladder in `slots.ts:69-122`, near-hand overrides in `slots.ts:62-67` and `:101-121`.
- Palette: `Item.materials` are ids into `Manifest.materials`, owned per item (`dress.ts:173-215`, `deriveMaterials`); color matching requires exactly one neutral material owned by the item (`app/src/lib/dress/item-palette.ts:83-115`).
- Source/provenance: `Provenance` has `endpoint`, `params`, `seed`, `requestHash`, `jobId`, `usage`, `produced: CellKey[]`, `replaced` (`manifest.ts:280-291`). `acceptItem` remaps call numbers into this list (`run.ts:1694-1723`, `:1750`).
- Shared items: copies are ordinary `Item` records with `copiedFrom` (or `unfitted`/`refit`); the source paid their calls (`app/src/lib/equipment/copy.ts:202-214`, `:508`, `app/src/lib/store/generation.ts:68-75` excludes copies from `ownProvenance`). Outfits and presets reference item ids (`manifest.ts:292-297`).

What one shared generation would additionally need:

1. A batch identity on each participating item (for example `batch: { recordId, call, itemIndex }`) because `Provenance.produced` is flat `CellKey[]` and cannot say which frames belong to which item, and `Provenance.usage` would otherwise be counted once per item by `recordedCost(ownProvenance(m))` (`generation.ts:72-88`).
2. A per-item split of the batch's output frames, plus the frame-to-item mapping that the current label rule cannot express (see 5.4).
3. Per-item cell provenance that points at the shared record without duplicating its usage, and a rule for who owns the paid record if one item is later deleted or shared with another character.

## 4. Insertion points for a multi-item mode

| Concern                   | Function or type                                                                    | Where                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Request builder           | `itemRoute.edit`, `itemRoute.pose`, `gridReq`, `itemSheetRequest`                   | `items.ts:119-178`, `run.ts:563-664`, `run.ts:3181-3226`                          |
| Plan and request count    | `planItem`, `itemPosePlan`, `planCalls`, `posePlan`                                 | `items.ts:631-673`, `:806-821`, `:1147-1175`, `:710-740`                          |
| Price                     | `planGens`, `itemPoseGens`, `moveEstimate`, `itemMoveOffer`                         | `items.ts:763-777`, `:1121-1143`, `movePricing.ts:187-268`, `create.ts:3047-3074` |
| Draft and job entry       | `Draft`, `CallState`, `newDraft`, `submit`, `queue.enqueue`                         | `run.ts:166-186`, `:292-326`, `:789-818`, `queue.ts:1306-1415`                    |
| Per-item result splitting | `identifiedOutputs`, `cellOuts`, `cutGrid`, `readItemSheet`, `evaluateItem`         | `run.ts:362-408`, `:1296-1375`, `:3229-3294`                                      |
| Review UI state           | `ItemResult`, `store.results`, `readGenReview`, `acceptGen`, `Gen`                  | `run.ts:187-194`, `state.svelte.ts:4129-4143`, `:4213-4262`                       |
| Offer UI                  | `pickedOffers`, `ItemGenerationSheet`, `ItemGenerationList`, `ItemGenerationFooter` | `itemGeneration.ts:90-101`, `ItemGenerationSheet.svelte:26-70`                    |
| Tier and consent gates    | `itemPlanMinimumTier`, `itemOfferAccess`, `retryGen`, `rerollGen`                   | `items.ts:779-804`, `itemOfferAccess.ts:9-25`, `state.svelte.ts:4323-4404`        |
| Manifest and export       | `buildItem`, `Layer.cells`, `exportId` uniqueness                                   | `items.ts:3659-3754`, `manifest.ts:268-279`, `app/src/lib/store/identity.ts:24`   |
| Recovery                  | `queue.enqueue` request-hash reuse, `runCall`, `submitOrSaved`, `draft.recId`       | `queue.ts:1349-1388`, `run.ts:820-842`, `:2093-2106`                              |

## 5. Constraints that make multi-item calls risky here

### 5.1 Chroma key and costume color collisions

`pickKey` chooses one key per prompt from four candidates and falls back to magenta when all four collide (`chroma.ts:85-91`). Extraction (`extractCell`, `items.ts:2061+`) and the collision note (`run.ts:1543-1596`) assume every non-key pixel outside the body belongs to one item. Two items in one mannequin pass must avoid all four keys across both prompts, and a single near-key share of 20 percent already flags K1 (`KEY_COLLISION`, `run.ts:1543`). If one item's own color leans toward the key, the safest keys for the two items can differ, and only one mannequin color can be sent.

### 5.2 Separation, overlap, and per-slot bands

The slot ladder overlaps deliberately: torso_inner z 40, waist z 50, torso_outer z 60, shoulders z 65 (`slots.ts:69-96`). `bandOf` derives a y-band per slot for extraction and repair (`items.ts:1241-1277`), and `itemQa`/`withH4`/`dirGate` evaluate one slot's band and one design call. Two items in one image cannot be split by the existing color key when they overlap (a belt over a shirt, gloves over sleeves), and bands overlap by design. Per-item masks would have to come from the request itself (a grid with per-cell masks, as `packGrid` already supports at `items.ts:326-370`), not from color.

### 5.3 One palette and one design lock per item

QA measures palette distance to the design call (`paletteDistance`, `items.ts:2423-2438`; `maxPaletteDist` in `ItemQa`, `manifest.ts:237-242`) and the design call is assumed to be call 0 (`designFill` at `items.ts:2603-2613`, `availableGaps` at `run.ts:226-256`). Materials are derived per item from that item's own pixels (`dress.ts:173-215`), and color matching needs exactly one neutral material owned by the item (`item-palette.ts:83-95`). A batch whose output mixes two items would make the "design call" and the palette reference ambiguous unless each item's cells are grouped before QA.

### 5.4 Output identification assumes one item per call

`identifiedOutputs` requires the exact expected count and contiguous labels, then maps output i to `c.cells[i]` (`run.ts:364-376`, `:403-408`). `expectedCellOutputs` (`run.ts:364-367`) and `cellOuts` (`:362-363`) are one item. A call that returns two items' frames would either fail G1 ("expected N identifiable frame outputs", `run.ts:1333-1336`) or silently assign the wrong frames, because labels are only `<direction>/<index>`, with no item dimension (`routes.ts` `jobImages`, `frameOrder`).

### 5.5 Held-item padding, pivot, and one canvas

Held items get a 96 px canvas with a shared pivot (`padOf`, `items.ts:432-438`; `buildItem` `size` at `:3677-3683`; `Layer.cell`/`pivot` at `manifest.ts:277-278`), and a red hand mark is drawn into the mannequin (`markHand`, `items.ts:484-521`). Mixing a held item with worn items in one call forces every participant onto the oversized canvas and one pivot, and the held frames may be reordered (`f0Last`, `items.ts:530-538`), which is per item.

### 5.6 Direction gating and body-kept checks

`canPose`/`clipKeypoints` require stored keypoints per clip and direction (`items.ts:582-602`), `missingItemMoves` filters per direction (`create.ts:2626-2649`), mirrored directions keep their source order (`slots.ts:101-121`), and `canSheet` restricts to cardinal views (`items.ts:892-898`). G2 "the body was redrawn" uses `keyKept`/`keyLost` per cell (`items.ts:2386-2387`, `manifest.ts:255-262`). A batch must prove the same body was kept once, then apply each item's own band, silhouette, and held gates separately.

### 5.7 Retries, cost consent, and per-item recovery

Retries are per draft call: `rerollCall` drops one call and reseeds it (`run.ts:853-874`), `rerollFailed` reseeds failed calls (`:885-899`), and `retryGen`/`rerollGen` re-check the reviewed price before spending (`state.svelte.ts:4323-4404`). Queue resume is keyed by `requestHash` including the seed (`queue.ts:1349-1388`), and a record is one request. A shared record would make one bad frame fail all items in the batch, with no per-item reseed and no per-item price to consent to. `callStopped` logs one call (`run.ts:844-850`).

### 5.8 Shared-item copies

Copies keep the source's provenance and are excluded from the target's recorded cost (`equipment/copy.ts:202-214`, `generation.ts:68-75`). If items share one paid record, a later copy or delete must not duplicate or lose that record's usage, and `ownItems` would need to treat a batch-shared record like a copied one.

### 5.9 Frame and canvas caps, and the economics

- `edit-animation-v2` caps frames per call at 16 / 9 / 4 by size (`routes.ts:250`). Two 8-frame walk items need 16 frames, which fits only at <= 64 px and leaves no room for a third item. A held item is drawn at 96 px, where the cap is 4 frames, so two held items cannot share a move call.
- `animate-with-skeleton-v3` poses one image through 3-15 keypoint sets (`items.ts:145-177`, `app/src/lib/rig/clips.ts:219-236`). There is no slot for a second item in that request; sharing means moving the move art to a canvas edit route (`edit-images-v2` sheet or `inpaint-v3` grid), which is a different route and price.
- The canvas routes are priced by canvas (`meanSideGens`, `items.ts:229-232`). Putting N items' row groups on one canvas roughly multiplies one side by N and moves at most one 10/15/25 band, while the same work as N pose calls is 2-4 gens per call (`clips.ts:233`). Batching a move is therefore expected to cost more than the current pose route in many cases, and the sheet route's tested 80-128 px cell range (`items.ts:879-898`) further limits it.

## 6. Smallest change, split by kind

### 6.1 UI-level batch (no cost saving)

Largely exists. Selecting 2 or 3 items on separate slots for one move is `ItemGenerationSheet` plus `pickedOffers` plus `queueMoves` (`ItemGenerationSheet.svelte:26-70`, `itemGeneration.ts:90-101`, `state.svelte.ts:5042-5052`), and its price is the sum of per-item offers (`create.ts:3066`).

The smallest remaining change is to let one submit start several new-item drafts (one per selected slot) and queue them through the same path, for example a multi-slot list in `NewItemSheet` that calls `startItem` once per slot, or a small loop around `startItemDraft` (`state.svelte.ts:3863-3945`). No request builder, queue record, or QA code changes. Price remains the sum, and each item keeps its own draft, provenance, retry, and review. This is the cheapest way to give users "one pass for this move" ergonomics, but it does not save money.

### 6.2 Request-level batch (real shared call)

The narrowest real seam is not the pose step but the packed canvas request builders, because they already cut a canvas into cells and price it once:

- `gridReq` (`run.ts:563-664`) with `packGrid`/`cutGrid` (`items.ts:326-386`) and `gridEstimate`/`repairGridLayout` (`items.ts:210-281`) for `inpaint-v3` masked cells.
- `itemSheetRequest` (`run.ts:3181-3226`) with `itemSheetCells`/`itemSheetPrompt` (`items.ts:996-1076`) for `edit-images-v2`.

A minimal experiment would extend one of these to carry per-item row groups or masked cells, with a per-item cell range and mask, and split the result with the existing cut. That requires: a batch plan type beside `ItemSpec`/`MoveSpec`, a request builder that carries N item prompts and N cell groups, an output-to-item mapping (the current label rule cannot express it), per-item `extractCell` plus `itemQa`, and a manifest rule for the shared record (section 3).

What does not work as the seam: `itemRoute.pose` and `callRequest`'s pose branch, because one skeleton-v3 request poses one image and returns one frame set (`items.ts:145-177`, `run.ts:698-722`). Any request-level batch for a move must change the drawing route, which is a product and pricing decision, not a plumbing tweak.

## 7. Existing tests that constrain or would need to change

For a UI-level multi-draft change (6.1), the tests that assert the offer and price seams:

- `app/test/unit/progressive-items.test.ts:116-188`, `:348-380` (`itemMoveOffer` sums, `clipItemOffer`, `fillMissingMovesOffer` equals the sum of separate offers).
- `app/test/unit/anchored-item-moves.test.ts:142`, `:251` (`itemMoveOffer` gens).
- `app/test/unit/item-sheet.test.ts:323-382` (`itemMoveOffer`, `clipItemOffer` sheet offer).
- `app/test/unit/item-move-readiness.test.ts:86-179` (offer availability and null price).
- `app/test/unit/cost-estimate.test.ts:304` and its item pricing cases (`itemPoseGens` batches).
- `app/test/e2e/studio.spec.ts:7185`, `:9591-9606`, `:10051-10245` (Generate items picker select, price, submit).

For a request-level change (6.2), additionally the tests that assert one call per item or direction, and per-call provenance, recovery, and QA:

- `app/test/unit/automatic-recovery.test.ts:1278`, `:1373`, `:1410` (one batch per posed item, per-batch source identity, per-batch failure).
- `app/test/unit/independent-pipeline.test.ts:84` (held views across three dressed batches).
- `app/test/unit/anchored-item-moves.test.ts:277` (finished facing survives a later failed batch).
- `app/test/unit/grid-repair.test.ts:314-412` (per-batch provenance, a shifted or failed batch).
- `app/test/unit/clip-provenance.test.ts:86` (sources across batches and grid fallback).
- `app/test/unit/item-acceptance.test.ts:190` (a malformed complete batch never writes a partial item).

No test was run for this note.

## 8. Findings summary

1. The item pipeline is single-item at every layer: plan, request, output identification, QA, provenance, retry, price. `Draft.spec` is one `ItemSpec` (`run.ts:178-186`).
2. "Batchable" in the shipped product is UI-level only: one priced picker, N specs, N request streams, summed price (`itemGeneration.ts:90-101`, `create.ts:3047-3074`, `state.svelte.ts:5042-5052`).
3. The harmless next step is multi-slot New item submission into the existing per-item draft path, which needs no pipeline change and saves no money.
4. A real shared call has to replace the per-item pose requests with a packed canvas route (`inpaint-v3` grid or `edit-images-v2` sheet), because skeleton-v3 poses exactly one image per call.
5. The blockers are structural, not UI: one chroma key, overlapping slot bands, one design call and palette per item, label-based output mapping with no item dimension, per-item held padding and pivot, per-item retries and consent, and per-item provenance and cost accounting.
6. The economics are doubtful for local moves: pose calls cost 2-4 gens each, while canvas routes cost 10-25 and grow with N, so the saving is at most one price band and may be negative.

## 9. Not verified

- No PixelLab call was made, so I did not confirm whether `edit-animation-v2` or `edit-images-v2` would reliably keep two items apart on one canvas, or how it would split overlapping garments. That is the falsifying paid test the brief asks for.
- I did not measure the real label and usage behavior of a hypothetical multi-item response; section 5.4 is inferred from the typed `jobImages`/`identifiedOutputs` contract.
- I did not trace the export manifest writers beyond `buildItem` and `manifest.ts`; if items are unpacked into ordinary per-item layers, export appears to need no change, but the shared-record reference in an engine export was not checked.
