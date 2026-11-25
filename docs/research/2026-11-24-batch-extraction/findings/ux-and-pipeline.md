# User-facing batch mode and the smallest safe pipeline change

2026-11-24. Research only. No paid calls, no credentials, no app code changed.

Reads: [`BRIEF.md`](../BRIEF.md), [`../2026-11-24-batch-item-generation/README.md`](../../2026-11-24-batch-item-generation/README.md),
[`pipeline-fit.md`](../../2026-11-24-batch-item-generation/findings/pipeline-fit.md), plus the code cited below.

This note designs the product around two facts that will not change:

1. **One request can carry several independent chroma mannequins and return one image per input.** Every item keeps its own image, key, extraction, QA, palette and provenance. The saving is the shared 10-generation `edit-animation-v2` floor ([README:27](../../2026-11-24-batch-item-generation/README.md), [batch-feasibility.md:14](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md)). Only this mode is unambiguously safe.
2. **Drawing several items on one body returns one composite and cannot be split into complete layers.** Pixels under another item never exist, and the measured loss is large: 85.5% of hair under a steel helmet, 46.6% of a vest under a cape, up to 100% in some frames ([batch-feasibility.md:22](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md), [README:84](../../2026-11-24-batch-item-generation/README.md)). This mode is conditional on extraction research and must never be the default.

The design below works in all three outcomes of that research: shared-body extraction is not viable; it is viable only for disjoint groups; or it is viable broadly. Sections marked **conditional** only ship if the corresponding research passes.

## 1. The three modes the UI must distinguish

| Mode                           | What one paid request draws                        | Layers afterwards                                                      | Status                                                                                                                 |
| ------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Separate**                   | One item's own mannequin images                    | One complete layer per item, made independently                        | Ships today                                                                                                            |
| **Together (separate layers)** | Several items' own mannequin images in one request | One complete layer per item, each extracted from its own image         | Safe; needs Probe 1 ([batch-feasibility.md:309](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md)) |
| **Together (one drawing)**     | Several items drawn on one body                    | One composite; per-item layers only if extraction research proves them | Conditional; never default                                                                                             |

Names in the UI must not rely on the words "batch" or "shared" alone, because the two "together" modes promise different things. Use **"Generate together, separate layers"** and, only when enabled, **"Draw together on one body"**.

## 2. Entry point, choice and default

### 2.1 Where the choice appears

The batch choice belongs to **new-item creation**, because the dress step is the only step with a shared 10-generation floor. The pose step poses exactly one image per `animate-with-skeleton-v3` call ([`items.ts:145-177`](../../../../app/src/lib/items/items.ts)) and cannot be shared ([pipeline-fit.md §6.2](../../2026-11-24-batch-item-generation/findings/pipeline-fit.md)).

- **Entry point:** the existing New item sheet ([`NewItemSheet.svelte:310-333`](../../../../app/src/studio/NewItemSheet.svelte)), which already owns the form, the plan and the priced Make button ([`NewItemSheet.svelte:132-151`](../../../../app/src/studio/NewItemSheet.svelte), `:249-268`, `:285-301`). Add an **"Add another item"** action that keeps a short list of pending new items in the sheet, reusing the transient `formDrafts.item` state ([`NewItemSheet.svelte:17`](../../../../app/src/studio/NewItemSheet.svelte), `:61-67`). No new sheet and no new top-level flow.
- **Moves are out of the batch choice.** The Generate items picker already queues several items for one move, one request stream each, at the summed price ([`itemGeneration.ts:90-101`](../../../../app/src/studio/itemGeneration.ts), [`create.ts:3047-3074`](../../../../app/src/studio/create.ts), [`state.svelte.ts:5042-5052`](../../../../app/src/studio/state.svelte.ts)). It stays a queue and says so, because sharing a move would require replacing the pose route with a canvas route and paying more in many cases ([pipeline-fit.md §5.9](../../2026-11-24-batch-item-generation/findings/pipeline-fit.md)).

### 2.2 The choice and the default

- With one item in the form, nothing changes.
- With two or more eligible items, the sheet shows **two priced options at the point of action**: the separate total and the together total, with the saving ("28 gens instead of 38").
- **Recommended default: separate**, with the together option visible and one click away. Reasons: the shared request is unproven until Probe 1 passes; one request has all-or-nothing failure; and the safe mode still changes cost ownership and provenance. After Probe 1 passes, the owner may flip the default so that together is preselected for eligible groups, leaving separate one click away. The rest of this design does not change with that decision.
- **No permanent setting.** Do not add a Batch or Sharing toggle to Settings. The choice is per submission, scoped to the pending item list, and remembered only by the existing form draft, which is already transient. This follows the guideline to omit unnecessary settings rather than hide them ([`usability-principles.md:6`](../../../usability-principles.md)).
- **Never auto-submit a group.** The priced Make button is the consent for the safe mode; the group is only formed by an explicit click, as with the current single item.

## 3. Grouping preview

Before paying, the sheet shows the proposed group, why each item is in it, the group price, the separate price, and a per-item **"Keep separate"** control. Splitting any item re-prices immediately. A **"Split all"** action restores the separate total.

### 3.1 Rules for automatic grouping

Only **Together (separate layers)** can group automatically. All of these must hold:

| Rule                                                | Why                                                                                                                                                 | Code reference                                                                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Different slots                                     | Two items cannot occupy one slot; same-slot grouping cannot be worn together and maximizes overlap                                                  | Slot ladder [`slots.ts:69-121`](../../../../app/src/lib/items/slots.ts), `Slot` [`manifest.ts:87-111`](../../../../app/src/lib/store/manifest.ts)                                                           |
| Same class (worn/rigid together, never held)        | Held items use a 96 px padded canvas, a shared pivot and a red hand mark; the frame cap at 96 px is 4, so a held item's own three views fill a call | `padOf` [`items.ts:432-438`](../../../../app/src/lib/items/items.ts), `markHand` `:481-521`, `f0Last` `:530-538`, class [`slots.ts:159-166`](../../../../app/src/lib/items/slots.ts)                        |
| One chroma key                                      | One request has one mannequin color; a second key can delete a whole item                                                                           | `pickKey` [`chroma.ts:90-91`](../../../../app/src/lib/image/chroma.ts), `keyAllowed` `:67`, key loss table [batch-feasibility.md:247](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md) |
| Fits the frame cap                                  | Rest views times items must fit `editFrameCap`: 16 at 64 px, 9 at 80 px, 4 above                                                                    | [`routes.ts:250`](../../../../app/src/lib/pixellab/routes.ts), `anchorChunks` [`items.ts:742-751`](../../../../app/src/lib/items/items.ts)                                                                  |
| No predicted overlap in standing views              | Overlap inside one image cannot be split by the current key, band or components                                                                     | `bandOf` [`items.ts:1241-1275`](../../../../app/src/lib/items/items.ts), evidence [batch-feasibility.md:229](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md)                          |
| One prompt can name each item without contradiction | One `description` serves the whole request                                                                                                          | `chromaPrompt` [`chroma.ts:678-688`](../../../../app/src/lib/image/chroma.ts)                                                                                                                               |

Two rules the user must see, not just the algorithm:

- **Slot bands do not imply no overlap.** `bandOf` separates head from legs, not hair from hat or sleeve from glove ([`items.ts:1262-1273`](../../../../app/src/lib/items/items.ts)). The overlap prediction must use stored layers, not slot bands alone.
- **The detector is a claim, not a guarantee.** It predicts from standing views. Animation can bring items together that do not touch while standing. The preview says so.

### 3.2 What the preview shows per item

- Name, slot label, thumbnail, and the chosen key swatch.
- The reason line, for example "No overlap in standing views", "Same background key", "Both worn".
- Its solo price and its share of the group price.
- A **Keep separate** button that removes it from the group.

### 3.3 Price framing

Use the numbers from the prior spike, labeled as 64 px, three views, new items:

| Group   | Separate | Together (separate layers) |
| ------- | -------: | -------------------------: |
| 2 items |       38 |                         28 |
| 3 items |       57 |                         37 |

Sources: [README:27](../../2026-11-24-batch-item-generation/README.md), [batch-feasibility.md:57-66](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md). Show the group price first and the separate price as the comparison, in the existing estimate slot rather than a new settings panel. Do not quote a saving for moves, where there is none.

**Conditional (one drawing):** 19 generations for the whole set versus 38 or 57. This price is only shown if the mode is enabled, and it is always paired with the loss warning in section 5.

## 4. Image review

### 4.1 Separate layers (safe mode)

There is no shared image to inspect, so review stays per item and should not grow a new failure surface:

- Show every generated frame for every item, one row per item, using the same preview data the current review reads: `ItemResult.cells` and `ItemResult.preview` ([`run.ts:187-194`](../../../../app/src/lib/items/run.ts)), rendered as today by the Gen card ([`GenCard.svelte:90-134`](../../../../app/src/studio/GenCard.svelte)).
- Show the group header once: one request, one seed for the dress step, N items, the price, and which items had their own pose calls later.
- Show the per-item QA status and warnings exactly as for a single item. A group must not average or hide one item's warning.

### 4.2 One drawing (conditional mode)

Only if extraction research passes. The review must show:

- Every generated frame, and for each frame the recovered per-item masks, if any.
- An **overlap heatmap** per frame: pixels that two items claim, built from the stored standing layers before purchase and from the recovered assignment after. Red for two owners, amber for a boundary that touches, neutral for no predicted contact. This is a review visual, not the extraction algorithm.
- A hidden-pixel statement per item: "This drawing covers X% of the standing {name} layer." This number must come from the extraction research; do not invent it. If the research cannot produce it, do not ship the mode.

### 4.3 Two different "checked" states

Never print "safe". Print the provenance of the check:

| State                                      | Badge                                          | Meaning                                        |
| ------------------------------------------ | ---------------------------------------------- | ---------------------------------------------- |
| Detector ran, no overlap in standing views | "No overlap in standing views" (check)         | Only the standing poses were compared          |
| Detector did not run                       | "Overlap not checked" (neutral)                | No claim at all                                |
| Detector found overlap                     | "Overlap in these views" (warning) with frames | Group is not eligible for the one-drawing mode |
| Motion                                     | "Not checked for motion" (info, always)        | Animation can create contact later             |

The motion line stays visible in every batch review, including the safe mode, because the same limitation applies to any grouping claim.

## 5. Warnings and consent (exact copy)

All strings go into `app/src/locales/en.json` under new keys; no text is hardcoded (repository localization rule). Keep each string to one or two short sentences. The existing priced confirm is the consent for the safe mode; the one-drawing mode needs an explicit checkbox because its loss is permanent.

| Key                               | Copy                                                                                              | Where                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| `itemBatch.choice.together`       | "Generate together, separate layers"                                                              | Option label              |
| `itemBatch.choice.togetherPrice`  | "{group} gens for all, {separate} gens separately"                                                | Option detail             |
| `itemBatch.choice.oneDrawing`     | "Draw together on one body"                                                                       | Conditional option label  |
| `itemBatch.group.noOverlap`       | "No overlap in standing views"                                                                    | Reason line               |
| `itemBatch.group.notChecked`      | "Overlap not checked"                                                                             | Reason line               |
| `itemBatch.group.sameKey`         | "Same background key"                                                                             | Reason line               |
| `itemBatch.group.bothWorn`        | "Both are worn items"                                                                             | Reason line               |
| `itemBatch.group.split`           | "Keep separate"                                                                                   | Per-item action           |
| `itemBatch.warn.cost`             | "{gens} generations for this group. Made separately, they cost {separate}."                       | Point of decision         |
| `itemBatch.warn.oneJob`           | "This group is one PixelLab request. Its items finish together."                                  | Point of decision         |
| `itemBatch.warn.allOrNothing`     | "If the request fails, every item in it fails together. Retrying costs the same again."           | Point of decision         |
| `itemBatch.warn.noPerItemRetry`   | "There is no retry for one item inside a request. Retry the group, or make that item separately." | Point of decision         |
| `itemBatch.note.separateLayers`   | "Each item keeps its own layer, colors and checks."                                               | Safe mode                 |
| `itemBatch.note.motion`           | "Animation can bring items together even when standing views do not overlap."                     | Every batch review        |
| `itemBatch.warn.hiddenLoss`       | "Pixels under another item are not drawn and cannot be recovered."                                | Conditional mode only     |
| `itemBatch.consent.hiddenLoss`    | "I understand these items share one drawing and lose the pixels under each other."                | Conditional mode checkbox |
| `itemBatch.action.keepGood`       | "Keep the finished items. The rest stay in review."                                               | Review                    |
| `itemBatch.action.makeSeparately` | "Make {name} separately for {gens} gens"                                                          | Recovery                  |

Consent behavior:

- **Safe mode:** the priced Make button is the consent; cost, one-job and all-or-nothing are shown beside it. This matches the existing `go()` consent that pins the plan price ([`NewItemSheet.svelte:249-268`](../../../../app/src/studio/NewItemSheet.svelte)).
- **One drawing:** a separate checkbox is required. The Make button stays disabled until it is checked, and the checkbox resets whenever the group membership or price changes. This is a vital cost and data-loss boundary, so it may block ([`usability-principles.md:18-21`](../../../usability-principles.md)).
- **No silent re-send.** A failed group never retries itself. The retry actions are priced and explicit, reusing the reviewed-price pattern of `retryGen` ([`state.svelte.ts:4323-4353`](../../../../app/src/studio/state.svelte.ts)) and `rerollGen` ([`state.svelte.ts:4355-4404`](../../../../app/src/studio/state.svelte.ts)).

## 6. Verification and recovery

### 6.1 Per-item checks are unchanged

The existing per-item gates already run per item and per clip: `GATES` and `g2Fails` ([`items.ts:2372-2387`](../../../../app/src/lib/items/items.ts)), `itemQa` ([`items.ts:2534-2591`](../../../../app/src/lib/items/items.ts)), and the evaluation that builds `ItemResult` ([`run.ts:1248-1541`](../../../../app/src/lib/items/run.ts)). In the safe mode each item is extracted from its own image, so these gates keep their current meaning. Do not add a cross-item gate; the research shows the current gates cannot see a wrong cross-item overlap anyway ([batch-feasibility.md:281](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md)).

### 6.2 When one item fails and others pass

**Safe mode (request-level batch):**

- If the shared dress request fails at the provider, every item's dress step fails; no item can be posed. The review shows one group failure plus per-item state. Recovery: retry the group at the reviewed price, or fall back to one item separately.
- If the shared dress succeeds but item A's extraction or QA fails while B passes: **keep B for free**, leave A in review. Extraction, palette and QA are per image, so B's layer is complete and paid for. Offer A a **"Make {name} separately for {gens} gens"** action priced as a normal new item (19 gens for one at 64 px), with consent.
- No per-item retry inside the shared request. The recovery is either group redo or a new single-item draft. Say both prices.

**Conditional one-drawing mode:**

- The group is one composite. If a recovered item fails, offer in this order: keep the items that passed (free), keep the whole result as one outfit if such a slot exists (product decision, not this design), or redraw the group. Do not offer a per-item retry, because there is no per-item request.
- Because the mode is only allowed for detected-disjoint groups, a pass on one item does not destroy the other items' pixels. The permanent-loss risk is motion overlap, which is why the consent is explicit.

### 6.3 Resume

Resume stays keyed by request hash including the seed ([`queue.ts:1349-1388`](../../../../app/src/lib/pixellab/queue.ts)). In the safe mode the group's dress request is one record, so reopening the draft reattaches to it; the per-item pose calls continue independently. In the conditional mode the whole drawing is one record.

## 7. Data model and pipeline seams

The safe mode deliberately keeps `Draft` one item. Every existing per-item mechanic (review, QA, acceptance, retry, delete, copy) then keeps working, and the only new shared object is the dress call.

### 7.1 Types to add, not replace

| Concern                         | Seam                                                                                                                           | Reference                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| One item's spec and plan        | `ItemSpec`, `planItem` already model one item's calls                                                                          | [`items.ts:615-628`](../../../../app/src/lib/items/items.ts), `:631-673`                                                                      |
| Draft stays per item            | `Draft.spec` remains one `ItemSpec`; add an optional batch pointer                                                             | [`run.ts:178-186`](../../../../app/src/lib/items/run.ts)                                                                                      |
| Call state gains group identity | `CallState` already has `recId`, `old`, `rerolls`; add `batch?: { group: string; index: number; record: string }`              | [`run.ts:167-177`](../../../../app/src/lib/items/run.ts)                                                                                      |
| Group plan                      | New `BatchPlan` beside `ItemSpec`: `{ id, key, seed, cell, members: { draftId, itemIndex, cells }[], gens }`                   | Planned in `newItemSpec`/`chromaEdit.plan` for one item today ([`itemRoute.ts:122-131`](../../../../app/src/studio/itemRoute.ts), `:144-164`) |
| Per-item frame mapping          | `identifiedOutputs` maps output index to `c.cells[i]` with no item dimension                                                   | [`run.ts:369-376`](../../../../app/src/lib/items/run.ts); labels are `<direction>/<index>`                                                    |
| Output split                    | `cellOuts` and `expectedCellOutputs` assume one item's cells                                                                   | [`run.ts:362-367`](../../../../app/src/lib/items/run.ts)                                                                                      |
| Request assembly                | `callRequest` edit branch builds one item's chroma cells; it must accept N item groups in one request                          | [`run.ts:683-784`](../../../../app/src/lib/items/run.ts)                                                                                      |
| Provenance                      | `toProv` writes `produced` as a flat `CellKey[]`; one shared record would be counted once per item                             | [`run.ts:1677-1690`](../../../../app/src/lib/items/run.ts), `draftProvenance` `:1694-1716`                                                    |
| Cost ownership                  | `ownProvenance` and `recordedCost` sum every item's provenance; a shared record must count once                                | [`generation.ts:72-88`](../../../../app/src/lib/store/generation.ts)                                                                          |
| Copies and shared items         | Copies keep the source's provenance and are excluded from the target's cost                                                    | [`generation.ts:69-70`](../../../../app/src/lib/store/generation.ts), [`manifest.ts:152`](../../../../app/src/lib/store/manifest.ts)          |
| Retry                           | Per call today, reseeded by `rerollCall`/`rerollFailed`; a shared call retries as a group                                      | [`run.ts:853-899`](../../../../app/src/lib/items/run.ts)                                                                                      |
| Persistence                     | `Item.provenance` is a list per item; a batch pointer is additive and needs no migration because preview data may break freely | [`manifest.ts:113-159`](../../../../app/src/lib/store/manifest.ts), `Provenance` `:280-291`                                                   |
| Manifest write                  | `acceptItem` builds cells, QA and provenance per item; unchanged if the split happens before it                                | [`run.ts:1725-1850`](../../../../app/src/lib/items/run.ts), `buildItem` [`items.ts:3659-3754`](../../../../app/src/lib/items/items.ts)        |
| Save order                      | `putItem` inserts by slot; N items in one accept must be written together or one at a time                                     | [`items.ts:605-612`](../../../../app/src/lib/items/items.ts)                                                                                  |
| Review state                    | `store.results` is keyed by draft id; group review is a view over those entries                                                | [`state.svelte.ts:4129-4143`](../../../../app/src/studio/state.svelte.ts)                                                                     |
| Accept per item                 | `acceptGen` accepts one draft; keep it per item so a good item can save while a bad one waits                                  | [`state.svelte.ts:4213-4271`](../../../../app/src/studio/state.svelte.ts)                                                                     |

### 7.2 Required invariants

1. **One group, one record, one owner.** The shared dress request is one `JobRec`. Exactly one participant (for example index 0) records `usage`; the others record the same `requestHash` with produced cells and no usage, so `recordedCost` counts the money once. This mirrors the copy rule in `ownProvenance`.
2. **Item order is explicit.** The request's image order and the per-item cell ranges are stored in the `BatchPlan`; output splitting never infers item identity from labels alone, because labels have no item dimension.
3. **A group member can be deleted without losing the record.** Discarding one draft must not orphan the shared record or change another item's recorded cost.
4. **No partial item write.** A failed split or a missing image fails the affected item, never writes half an item.
5. **Fallback is a new plan.** "Make separately" creates an ordinary single-item `Draft` through `startItem`; it never mutates the shared record.

## 8. Smallest implementation

### 8.1 Step 0: choice and previews without a shared drawing (no pipeline change)

This is the whole feature if Probe 1 fails, and the visible first half if it passes.

- Add a pending-item list to the New item sheet and an **Add another item** action.
- Submit with one `startItem` call per item, in a loop, exactly as the current path does ([`state.svelte.ts:3843-3862`](../../../../app/src/studio/state.svelte.ts)). Each item keeps its own draft, plan, price, QA, provenance and retry.
- Show the summed price, the per-item prices, and a line that the requests run separately. Show the grouping preview and the "together would save N gens" comparison only as a preview of the next step.
- **Never promise the saving in this step.** It is a queue, like the existing Generate items picker, and it is the honest fallback.

Estimated scope: one sheet, its state, copy, and unit tests around the price sum. It reuses `pickedOffers`-style aggregation ([`itemGeneration.ts:90-101`](../../../../app/src/studio/itemGeneration.ts)).

### 8.2 Step 1: one request, separate layers (the safe batch)

Only after Probe 1 passes ([batch-feasibility.md:309](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md)). The narrowest seam is the dress call, not the pose call.

- Build a `BatchPlan` from the eligible items' dress calls (`planItem`'s `dress` chunks, [`items.ts:631-673`](../../../../app/src/lib/items/items.ts)), using the same key and cell size.
- Send one `edit-animation-v2` request with each item's rest-view mannequins as separate images, one `description` that names each item, one seed.
- Split the returned images back into each item's `CallState.cells`; then run the existing per-item `posePlan` and evaluation unchanged.
- Add the batch pointer and the cost-owner rule (section 7.2).
- Review: group header plus the existing per-item review. No heatmap, because the images are separate; the overlap preview from standing layers is optional and only needed to explain grouping.

This is the only batching shape that both saves generations and keeps a complete layer per item. It saves the 10-generation floor per extra item, not the 9-generation pose per item.

### 8.3 Step 2: one drawing (conditional, not behind a warning)

Only if extraction research proves per-item recovery for a class of groups. Then, and only then, add it as an explicit third option, default off, gated by the overlap detector, with the hidden-loss consent. If the research proves it only for disjoint groups, the detector is the eligibility rule and motion overlap remains a disclosed risk. If the research proves it is not viable, this step is never built.

### 8.4 What must not ship behind a warning

- **Shared-body drawing presented as producing complete per-item layers.** No warning can restore pixels that were never drawn.
- **Any extractor that guesses hidden pixels or assigns overlapping pixels to an item by heuristic.** Wrong ownership is silent data loss.
- **Automatic grouping across different chroma keys, or mixing held and worn items.**
- **Batching pose or move calls by drawing several items into one canvas without per-cell proof and per-item recovery.** The current pose route is one image per call, and a canvas batch is more expensive in many cases.
- **A silent group retry or an automatic resend of a failed paid request.**
- **Double-counted cost, or a shared record that vanishes when one participating draft is deleted.**
- **"No overlap detected" shown as a guarantee.** It is a standing-view check plus a permanent motion disclaimer.

## 9. Not in scope

- The deterministic extraction algorithm and its measurements.
- The overlap/conflict detector's implementation and its false-safe and false-unsafe rates.
- Paid probes, balances and receipts.
- Batching the pose or move step, and the anchored or canvas routes.
- A Full body or outfit slot, and the "one outfit, one layer" product.
- App code, tests, localization translations (English source strings only here), and any Settings surface.
- Exact prices for unmeasured routes; all prices quoted are from the prior spike and labeled as such.

## 10. Open decisions for the owner

1. **Default after Probe 1:** keep separate as the default with the together option beside it, or flip eligible groups to together by default.
2. **Grouping aggressiveness:** require the overlap detector before offering any group, or start with a conservative slot-and-key rule and add the detector later.
3. **One-drawing mode:** build it only if extraction research passes for a group, and if so, is it a per-item layer mode or a single outfit layer.

## 11. Code and research sources

- Pipeline: [`items.ts`](../../../../app/src/lib/items/items.ts), [`run.ts`](../../../../app/src/lib/items/run.ts), [`itemRoute.ts`](../../../../app/src/studio/itemRoute.ts), [`itemGeneration.ts`](../../../../app/src/studio/itemGeneration.ts), [`create.ts`](../../../../app/src/studio/create.ts), [`state.svelte.ts`](../../../../app/src/studio/state.svelte.ts), [`manifest.ts`](../../../../app/src/lib/store/manifest.ts), [`generation.ts`](../../../../app/src/lib/store/generation.ts), [`slots.ts`](../../../../app/src/lib/items/slots.ts), [`chroma.ts`](../../../../app/src/lib/image/chroma.ts), [`routes.ts`](../../../../app/src/lib/pixellab/routes.ts), [`queue.ts`](../../../../app/src/lib/pixellab/queue.ts).
- UI: [`NewItemSheet.svelte`](../../../../app/src/studio/NewItemSheet.svelte), [`ItemGenerationSheet.svelte`](../../../../app/src/studio/ItemGenerationSheet.svelte), [`ItemGenerationList.svelte`](../../../../app/src/studio/ItemGenerationList.svelte), [`GenCard.svelte`](../../../../app/src/studio/GenCard.svelte).
- Prior evidence: [batch README](../../2026-11-24-batch-item-generation/README.md), [batch-feasibility.md](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md), [pipeline-fit.md](../../2026-11-24-batch-item-generation/findings/pipeline-fit.md), [chroma-key.md](../../2026-11-09-paperdoll-video-review/chroma-key.md).
- Rules: [`usability-principles.md`](../../../usability-principles.md).

No paid PixelLab call was made and no app behavior changed.
