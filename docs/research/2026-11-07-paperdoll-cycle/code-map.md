# Production code map and gap matrix (2026-11-07 cycle)

Researcher: product and implementation mapping. Scope: the current production path from user intention to persisted export, the gaps between stages, doc/code disagreements, test coverage per hop, and the ordinary Studio workflow. Extraction internals ([extraction.md](extraction.md)), held-item geometry ([motion.md](motion.md)) and provider schemas ([provider.md](provider.md)) are covered elsewhere and only cross-referenced here.

Starting revision: `6a33fd37` (main). No PixelLab request, no app edit, no server or browser. Offline scripts ran on Node 25.0.0 (the pinned 24.22.1 was not active); they import production modules and are pure integer image operations.

Claim labels: **[source]** read in code or tests; **[repro]** offline reproduction with the scripts in section 8; **[inference]** reasoning from those; **[untested]** a hypothesis with no control yet.

## 1. Current production path (from code)

Line numbers refer to `app/src` unless a path says otherwise.

| Hop | Where | What actually happens | Tests that cover it |
|---|---|---|---|
| Intention: New item | `studio/NewItemSheet.svelte:38-63`, `studio/state.svelte.ts:790-822` | The sheet prices `itemRoute.plan`, binds consent to the rig JSON and the quoted gens, and `startItemDraft` re-plans and refuses on any change (`:802-808`). **[source]** | `unit/item-review-consent.test.ts`, `e2e/studio.spec.ts` |
| Standing-first scope | `studio/itemRoute.ts:33-43` | `standingCoverage` always dresses only the one-cell standing move (Default, or verified one-cell aliases), even when idle/walk exist. Animated moves are never part of a New item. **[source]** | `unit/progressive-items.test.ts:106` ("standing discovery never buys an animated clip"), `:129` |
| Method and key | `lib/items/run.ts:49-61`, `lib/image/chroma.ts:51` | `skel` when every chosen view has rest keypoints, else `anchor`; `pickKey` by prompt words. Studio never chooses the diff route (`none`). **[source]** | `unit/azure-key.test.ts`, `unit/blue-key.test.ts` |
| Plan and quote | `lib/items/items.ts:207-257`, `studio/itemRoute.ts:47-51` | Standing scope means only `dress` chunks (`anchorChunks` under `editFrameCap`, `routes.ts:66`); price `editGens` per chunk on the padded canvas. **[source]** | `unit/api-plans.test.ts`, `unit/grid-estimate.test.ts`, `unit/pose-price.test.ts` |
| Frozen inputs | `lib/items/run.ts:103-109`, `:193-219`; `chroma.ts:54-60` | Dress frames = `rig.rest[dir].image` recolored by `toChroma` (per-cell luminance range), padded for held items (`padOf`, `items.ts:130`). **[source]** | `unit/item-trial.test.ts`, `unit/held-pommel.test.ts` |
| Request identity, seeds | `lib/pixellab/queue.ts:129-141`, `:616-724`; `run.ts:45`, `:596`, `:615` | Identity = sha256 of method, path and params with images replaced by blob hashes. New items use random seeds per call; item moves use `seedOf(item/anim/dir/moveSeed)` (deterministic per move seed). Any terminal record with the same hash is returned instead of resubmitted (`queue.ts:639-655`). **[source]** | `unit/queue-resume.test.ts`, `unit/anchored-item-moves.test.ts:90`, `unit/automatic-recovery.test.ts:528` |
| Ledger and submit | `queue.ts:848-952` | Persisted before send; `requestStarted` marks the uncertainty boundary; 429 and the narrow animation refusal back off; other uncertain outcomes become `lost` and are never resent. **[source]** | `unit/paid-retry.test.ts`, `unit/paid-outcome-evidence.test.ts`, `unit/queue-generation-consent.test.ts` |
| Polling and raw storage | `queue.ts:954-1063` | Inline images validated and stored as blobs keyed by byte sha (`saveResult :1011`); URL results downloaded with 10 tries; usage summed per record. **[source]** | `unit/queue-download.test.ts`, `unit/live-artwork-freshness.test.ts` |
| Decode | `run.ts:331-336`, `lib/image/png.ts:30` | `binaryAlpha(decodePng)` at alpha 128; cached in a module-level `Map` that is never evicted. **[source]** | `unit/pixels.test.ts` |
| Output cardinality | `run.ts:398-415` | Edit: expected `max(2 - anchor, cells)`; pose: `max(3, cells)`; wrong count or size is structural G1. **[source]** | `unit/item-acceptance.test.ts:35` |
| Registration | `items.ts:665-712` | `bestShift` over visible mannequin witnesses (abstains under 10 % witnesses); posed and standing cells may move 1 px; stencil cells never move. **[source]** | `unit/bench.test.ts`, `unit/item-stencil.test.ts` |
| Extraction and cleanup | `items.ts:704-748`, `:641-646`; `chroma.ts:222` | Chroma layer, band trim, body cut, then `postProcess` (held attach/grip/repair, size floor, keyframe trim, off-body drop). See [extraction.md](extraction.md). **[source]** | `unit/base-cut.test.ts`, `unit/tiny-items.test.ts`, `unit/held-pommel.test.ts` |
| Gates | `run.ts:427-456`; `items.ts:847-1062` (`itemQa`), `:1125-1204` (`dirGate`) | Keyframe G2/G3/G4/D1/D2 go into `g1`; cells get G2/G3/G4/G5/G7/G8/G9/G10, per-frame G6, G11-G14, H4. **No check authorizes a paid retry** (`run.ts:257`, `:320`). **[source]** | `unit/design-drift.test.ts`, `unit/held-grip.test.ts`, `unit/helmet-occlusion.test.ts`, `unit/garment-coverage.test.ts` |
| Auto-save or review | `state.svelte.ts:829-860`, `run.ts:255` | `isClean` (pass, no g1, no fails, no warnings) saves itself; otherwise a review card with Keep it / Try again (priced) / Discard (`studio/GenCard.svelte:95-118`). **[source]** | `unit/item-streaming.test.ts`, `e2e/studio.spec.ts` |
| Publication | `run.ts:504-536`, `lib/store/project.ts:66-83`, `lib/store/db.ts:50` | `buildItem` (`items.ts:1208-1253`) then one IndexedDB transaction for blobs and record; rebases `baseHash` only when body cells are unchanged. Warning text is not stored; only scalar `ItemQa`. **[source]** | `unit/item-publication.test.ts`, `unit/item-acceptance.test.ts:134` |
| Extend to a move | `studio/ItemPane.svelte:48-61`, `studio/StageNote.svelte:26-41` -> `state.svelte.ts:1119-1197` -> `studio/create.ts:709-787` | `missingItemMoves` (`create.ts:625-635`) builds items-only specs; `addMove` runs `poseItemClip` (skeleton, `run.ts:600-643`), `animateAnchoredItem` (anchored edit, `run.ts:544-585`) or `regridClip` (inpaint grid, `run.ts:741-752`). **[source]** | `unit/default-first.test.ts:95`, `unit/pose-item-selection.test.ts`, `unit/anchored-item-moves.test.ts`, `unit/grid-repair.test.ts` |
| Move publication | `run.ts:650-689` | `mergeClip` requires every frame of each direction, guards rig version and item artwork (materials and hides excluded), and appends provenance. **[source]** | `unit/item-publication.test.ts`, `unit/anchored-item-moves.test.ts:111` |
| Dye and recolor | `lib/dress/dress.ts:59-85`, `:118-159`; `run.ts:560-583`; `run.ts:792-833` | Materials derived per item by OKLab ramps; recolor is an exact index swap. Anchored moves apply `standingDyeMatcher`; skeleton moves do not. Manual "Match item colors" (`neutral-owned-v1`) is free and reviewed. **[source]** | `unit/item-palette.test.ts`, `unit/export-colors.test.ts`, `unit/dress-persistence.test.ts` |
| Composition | `lib/compose/compose.ts:212-261` | Static slot z, overrides by cell/anim/dir, fg/bg split by body alpha, tuck-under, body cuts. **[source]** | `unit/base-cut.test.ts`, `unit/tuck-variants.test.ts` |
| Export | `lib/export/export.ts:18-83`, `lib/export/generic.ts:21`, `:119`; `studio/ExportSheet.svelte:149` | Validates, bakes tuck and body-cut variants (`compose.ts:147-198`), excludes stale items, warns about coverage gaps, writes engine files plus `project.json`. **[source]** | `unit/generic-export.test.ts`, `unit/godot-export.test.ts`, `unit/phaser-export.test.ts`, `unit/unity-export.test.ts`, `unit/gdevelop-export.test.ts`, `unit/aseprite-export.test.ts`, `unit/export-validation.test.ts` |

### Alternative routes and recovery

- **Which extension route a user gets** **[source]**: characters with rest keypoints (every Studio-created character) store items as `skeleton-pose` and extend through `poseItemClip`. The demo (`public/fixtures/s2/fixture.json` has no rest keypoints) and unrigged imports store `ea2-anchor` items and extend through `animateAnchoredItem`. The Nov 6 live dye and "Use saved frames" work ran on the demo copy and imports, so it exercised the anchored route ([deep review](../deep-paperdoll-review-2026-11-06.md), "Live browser evidence"). **[inference]**
- **Grid route**: automatic only when imported poses have corroborated issues (`frozenGrid`, `items.ts:217-222`); otherwise manual per view from ItemPane "Try new item frames" (`ItemPane.svelte:38-46`). `Item.route` stays `skeleton-pose` after a grid repair (`items.ts:1241`). **[source]**
- **Unknown outcomes**: `lost` records are terminal and returned on identical re-enqueue (`queue.ts:652-655`). A New item retry is a new draft with new seeds (`state.svelte.ts:968-972`). **[source]**
- **Use saved frames**: anchored only (`MoveSheet.svelte:53`, `:127`; `create.ts:720`; `run.ts:554-559`). A skeleton item move that hits `ITEM_MOVE_SAVE_CONFLICT` or fails one direction has only "Try again" with a new random seed (`MoveSheet.svelte:126`). Because `poseItemClip` seeds are deterministic, rerunning with the original `moveSeed` would reattach completed jobs for free (`automatic-recovery.test.ts:528` shows the reuse). **[source]**
- **Cache identity**: per-draft extraction cache signature (`run.ts:424`) includes record, slot, key, route, pad, posed flag, `baseHash`, keyframe record and stencil hash. Saved-frame recovery recomputes the exact request identity (`run.ts:555`), so any change to prompt text, chroma recolor or body pixels (for example a later `splitBase`) makes saved frames unreachable by design. **[source]**

## 2. Doc and code disagreements

| Doc claim | Code and tests | Label |
|---|---|---|
| architecture §4.5: "Fail -> re-roll the call once (new seed), then switch to the alternative route"; "keeps its roll with the fewest failed checks". | One attempt per batch: `runItem` "Checks never authorize another paid attempt" (`run.ts:257`, `:320`); `poseItemClip` has `rerolls: 0` (`run.ts:640`). `rerollCall` is used only by `ui/M3.svelte:209` and tests. | [source] |
| architecture §4.2: grid fallback "live since B14 per clip-direction ... after its 2 re-rolls ... redone once as a grid". | No failure-driven grid. Tests assert the opposite: `pose-item-selection.test.ts:108`, `item-streaming.test.ts:164`. | [source] |
| architecture §4.4: a keyframe failing G3 "switches at once to the next key". §4.7 says chunks wait because "a later chunk's G3 switches the key". | `switchTo` (`chroma.ts:12`) is referenced only by `azure-key.test.ts`; `key-switch.test.ts:26` and `item-streaming.test.ts:222` assert no switch. The chunk wait (`run.ts:285`) survives with an obsolete reason. | [source] |
| architecture §3.3 and known-issues: "Add idle + walk ... queues the missing base moves with every posable item"; "poses the items the character has when it is tapped". | `baseMoveSpecs` sends `items: []` (`create.ts:638-641`); `progressive-items.test.ts:129` asserts items are never included. | [source] |
| architecture §4.1 cost "worn ≈ 25 gens (dress 10 + 5 pose calls × 3)" for a New item. | A New item only dresses the standing move (section 1); each move is a separate priced action. | [source] |
| architecture §5: hair/head/face slot class "head". | `SLOTS` uses `rigid` (`items.ts:192-197`); manifest-spec type also says `rigid`. | [source] |
| manifest-spec §2: `CellQa.snappedPct: number` "0..100 of layer px within the item's ramps". | Optional and commented "no palette snap yet" (`store/manifest.ts:130`); the item pipeline never writes it; `equipment/fit.ts:173` writes a 0..1 share of changed pixels. | [source] |
| manifest-spec §2: `Item.route` includes `inpaint-grid`; held layers get `cell {96, 96}`. | `buildItem` never emits `inpaint-grid` (`items.ts:1241`); the pad is `min(16, (256 - cell)/2)`, so the default 80 px rig gets 112 px layers (`items.ts:130`). The spec also omits `Item.standing`, `underAll`, `pending`. | [source] |

## 3. Dead, duplicated or misleading code

- **Dead in production**: `switchTo` (`chroma.ts:12`); `rerollCall` outside M3 (`run.ts:240`); the diff route `none` outside M3 (Studio `pickKey` never returns it). **[source]**
- **Two extension pipelines** with different QA references: anchored passes `standingPalettes` (per-frame against the standing design); `poseItemClip` calls `itemQa` without them, so `designColors` uses the first posed direction as the "design call" (`items.ts:864-867`, `run.ts:640`) and emits "G6 call k ... to the design call" against another generation, next to `dirGate`'s real per-frame comparison. Only anchored moves get dye matching, standing material publication and saved-frame recovery. **[source]**
- **Misleading thresholds in the saved-item inspector**: `ItemPane.svelte:100-104`, `:256-259` show G3 at 0.02 and G5 at 0.15, while posed items gate at 0.05 (`GATES.keyOutsidePosed`) and G5 uses `max(0.15, 2 × body CV)` (`items.ts:925`). A passing item can list G3/G5 reasons; a warn from H4 soft, per-frame G6, R1, G9 seam or occlusion lists none. **[source]**
- **Name-based motion classes**: `isAction` (`items.ts:763`) treats `default` as an action, so G5 and G11-G14 never run on standing cells; also noted in [motion.md](motion.md) for G9. **[source]**
- **Duplicated seed expressions** `1 + Math.floor(Math.random() * 1_000_000)` in `MoveSheet.svelte:109`, `:126`, `ItemPane.svelte:44`, `:59`, `StageNote.svelte:39`, `create.ts:625`, `:638`, besides `run.ts:45`. **[source]**
- **Quote paths**: MoveSheet per-item label uses `poseGens` (`MoveSheet.svelte:200`) while the total uses `itemPoseGens` (`create.ts:668`); they diverge only for frozen-grid imports. **[source]**
- **Layer order control**: `moveLayer` (`state.svelte.ts:608-621`) edits the slot's fg override for every item in the slot and never the bg layer, though it is presented per item. **[source]**

## 4. Gates whose metric can pass damaged output

- **G6 is a pixel mean of nearest-color distance** (`items.ts:779-793`) and **H4 is whole-layer similarity** (`similarity.ts:14-33`). **[repro]** Synthetic 20 × 24 tunic with a 4 × 4 gold emblem (16 of 480 px), compared with production functions: emblem erased G6 0.00 / H4 0.967; emblem replaced by cloth G6 0.00 / H4 0.967; emblem recolored blue G6 5.67 / H4 0.967. Gates are 15 and 0.75 (band) or 0.5 (soft): all pass.
- **H4 coverage**: held, feet and legs return before H4 (`items.ts:1173`); non-band items are judged only where they cover at least half the body (`:1186`), so most torso items and hair are never compared to their keyframe. **[source]**
- **Standing design**: a single dress call makes every standing view, so G6 is 0 by construction (`designColors`), H4 compares each standing cell to its own keyframe, and `isAction('default/...')` skips G5 and G11-G14. Only D2 (waist band) compares views. The standing set is the reference for every later move and clean drafts save themselves. **[source + inference]**
- **G2** is a whole-body ratio (`chroma.ts:233-245`, `items.ts:767`): at least 3 % of the body and more than 8 px must be lost. The composite draws the frozen body, so the visible damage is limited to missing cut decisions. **[inference]**
- **Negative result on skeleton-route dye** **[repro]**: on the frozen bench (12 non-held cases, 488 posed frames from real skeleton-v3 outputs), exact membership of posed pixels in the same-facing standing palette is 99.2-100 % per case; worst single frames 0.78 (a-chest), 0.82 (a-boots), 0.83 (a-hair), 0.91 (a-cape). Applying the anchored route's `standingDyeMatcher` with standing-derived ramps raises a-chest's worst frame to 0.87 and changes little else. Skeleton posing keeps the palette; the missing dye step on that route is low impact.

## 5. Interactions without test coverage

- Multi-direction skeleton item move where one direction fails or the save conflicts: `poseItemClip` uses `Promise.all` and publishes nothing (`run.ts:609-641`); only single-direction fixtures exist (`automatic-recovery.test.ts:518-559`). **[source]**
- Saved-item inspector reasons versus the warnings the gates produced (`ItemPane.svelte:90-116`). **[untested]**
- Gate sensitivity to small motif loss on worn items (section 4 synthetic only; no fixture in `test/`). **[untested]**
- Cross-view consistency of a standing design (section 4). **[untested]**
- Materials for an item never touched by an outfit edit are re-derived in memory on every open (`state.svelte.ts:320`) and persisted only by the next outfit autosave (`dress/project.ts:104-129`), so ramps can include colors of moves added later. **[inference, untested]**

## 6. Ordinary workflow review (usability principles)

- **Create body**: many visible choices (details, traits, exact prompt, enhance, body and frame size, camera, presets, compass, mirrors, seed) but strong defaults; the downstream item price above 80 px is stated at the decision (`CharacterForm.svelte:121`). Acceptable.
- **Dress**: standing-first is disclosed (`NewItemSheet.svelte:92`) and priced; after it, every move needs one more priced action per item or per move (`StageNote.svelte:54-56`, `ItemPane.svelte:189-195`). Reasonable, but the docs still promise otherwise.
- **Add move**: items are excluded by default to keep cost down (`MoveSheet.svelte:202`). A failed move shows "Try again" with **no price on the button** (`MoveSheet.svelte:126`; `e2e/studio.spec.ts:1564` asserts the bare label); the estimate appears only for saved-frame cases. The ApiPeek beside it is secondary access, not the point of decision.
- **Review and repair**: drafts show real warning text (`GenCard.svelte:30`, `:98-104`), saved items do not (section 3). "Accept as is" is hidden while any move lacks frames (`ItemPane.svelte:178`), coupling an acknowledgement to a purchase. ItemPane "Try again" opens a New item with the old prompt (`ItemPane.svelte:156-158`) and creates a second item rather than replacing the first.
- **Recolor, save, reload, export**: autosave and save-failure toasts exist; export lists coverage gaps (`ExportSheet.svelte:149`). No gap found beyond section 5.

## 7. Gap matrix

| # | Observation | Evidence | User impact | Current coverage | Smallest fix | Offline control |
|---|---|---|---|---|---|---|
| 1 | Worn-item gates cannot see a lost or recolored motif; clean results save themselves | `items.ts:779-793`, `:1173`, `:1186`; `similarity.ts:14`; `state.svelte.ts:858`; repro section 4 | Damaged frames ship as "Clean" with no review | `design-drift.test.ts` covers whole-frame recolor only | Per-frame local check against the same-facing keyframe: count keyframe color components (at least 2 px) with no matching component in the posed frame after joint-aligned placement; warn only | Bench worn cases plus erase/recolor mutations of 2-16 px motifs; must flag mutations and keep the 20 benchmark verdicts |
| 2 | Saved items lose warning text; inspector infers reasons from fixed thresholds | `run.ts:640-641`, `:676`; `manifest.ts:94-121`; `ItemPane.svelte:90-116`, `:256-259` | "Needs a look" with wrong or no reason and no frame to inspect | None | Persist per-clip warning messages in `QaSummary` (bounded) and render them; drop the hardcoded thresholds | Unit: posed item with keyOutside 0.03 shows no G3; H4-soft warn shows its message |
| 3 | Skeleton item moves are all-or-nothing and retry with a new seed (2026-11-07: finished views are now saved when another view fails; the save-conflict case remains) | `run.ts:609-641`, `MoveSheet.svelte:53`, `:126`; reuse shown by `automatic-recovery.test.ts:528` | Pays again for completed directions after a conflict or one lost call | Single-direction tests only | Offer "Use saved frames" for skeleton moves by rerunning with the original `moveSeed` (no enqueue of new hashes), and publish completed directions | Fake ledger: 3 directions, one lost; retry makes exactly one new request |
| 4 | Failed-move "Try again" has no price at the decision | `MoveSheet.svelte:126`; `e2e/studio.spec.ts:1564` | Unexpected spend (a body move is roughly 11 gens per drawn view) | e2e asserts the unpriced label | Always append `Est. N gens` from `retryPlan` | e2e: failed move shows the estimate |
| 5 | Standing design cross-view consistency is unchecked | `items.ts:864-867`, `:763`, `run.ts:420`, `:442` | An inconsistent front/side/back design auto-saves and propagates to every move | D2 waist band only | Compare each standing view's palette to the union of the others; warn above the G6 limit | Bench keyframes with one view hue-rotated; expect a warning, none on the originals |
| 6 | Docs describe automatic re-roll, key switch, grid fallback and items in Add idle + walk | Section 2 | Maintainers and agents reason about a pipeline that does not run | Tests assert the current behavior | Rewrite architecture §3.3, §4.1-§4.7, known-issues bullets; mark `switchTo` dead | Doc review against the listed tests |
| 7 | Review actions on saved items: accept gated on full coverage; Try again duplicates | `ItemPane.svelte:156-158`, `:178` | Extra purchases or clutter to clear a warning | None | Allow Accept as is with gaps; make Try again replace via the existing consent `replaces` path or say it adds a copy | e2e: warn item with missing walk can be accepted |
| 8 | Skeleton extension QA compares directions to the first posed direction | `run.ts:640`, `items.ts:848`, `:864-867` | Duplicate, misleading G6 messages | `design-drift.test.ts` covers `dirGate` | Pass `standingPalettes` from dressed keyframes in `poseItemClip` and `regridClip`, as anchored does | Bench: G6 messages reference the standing design only; verdicts unchanged |
| 9 | `snappedPct`, `inpaint-grid`, 96 px held cell in manifest-spec | Section 2 | Importers or readers trust fields that are absent or differently scaled | None | Correct the spec | Doc check |
| 10 | Layer Forward/Backward edits the whole slot's fg only | `state.svelte.ts:608-621` | A cape's back half keeps its old order | None | Label it per slot or move fg and bg together | Unit on `drawList` order |
| 11 | Unbounded decode cache | `run.ts:331-336` | Memory growth in long sessions | None | Bound or clear per draft | Count entries after N evaluations |

**Ranked top 8 by impact on output quality and user success**: 1, 2, 3, 5, 4, 6, 7, 8. Rows 1 and 5 decide whether damaged art reaches export without review; rows 2, 3 and 4 decide whether a user can find, repair and pay for a fix knowingly; row 6 keeps future changes from building on a pipeline that no longer exists.

## 8. Offline scripts

Machine-local copies (not portable links): `C:/Users/shilo/AppData/Local/Temp/claude/52688aff1ceef557/8783d125-0b50-4f8c-84c2-94eda3a97695/scratchpad/motif-gates.ts` and `skel-dye.ts`, both run as `node <file> <repo root>`. Core of the motif probe:

```ts
const items = await import(`${root}/app/src/lib/items/items.ts`), sim = await import(`${root}/app/src/lib/image/similarity.ts`);
// tunic(): 20x24 three-shade red cloth, dark outline, 4x4 gold emblem at (38..41, 38..41); variants erase, cloth-fill or recolor it
const ref = colorsOf(tunic('gold'));
for (const v of ['gold', 'cloth', 'gone', 'blue']) report(items.paletteDistance(ref, [tunic(v)]), sim.simAligned(tunic(v), tunic('gold')));
```

The dye probe runs `app/scripts/bench.ts` `runCase` on every non-held bench case, derives ramps with `autoRamps(colorCounts(keyframes))` and applies `standingDyeMatcher(standingColors, owned, sameFacingFrames)` per direction.
