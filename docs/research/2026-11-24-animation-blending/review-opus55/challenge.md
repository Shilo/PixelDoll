# Challenge review: moving attack implementation

Date: 2026-11-24
Reviewer: Opus 5.5 (independent sub-agent)
Subject: commit 2cfc0b63 `feat: layer walking legs under same-facing attacks`
Mandate: challenge the implementation and the coordinator's round-2 review.

## Verdict

**Do not merge as is.** The plumbing is real and the checks pass: canonical functions, four controllers, settings, persistence, the slowdown and the mounted facing. The layered result is not yet a feature a user can rely on, though. In every South, East and demo sequence I could measure, a layered action switches to the full-body pose partway through and back. That is the coordinator's blocker, and it applies to all four exported controllers as well as Live. Three more defects mean that even a stable layered frame is often wrong:

- the bounded fit moves the torso vertically by up to 6 px,
- the lower stack keeps the walk's hands,
- trousers will very likely block layering entirely.

The tests would pass with all of these present.

## What I ran

| Command (from `app/`) | Result |
| --- | --- |
| `npm run check` | exit 0, Prettier clean |
| `npx vitest run live-layering runtime export-phaser gdevelop-export godot unity experience-presentation experience-movement live-roles mount-preview` | 12 files, 130 passed, 2 skipped (Godot opt-ins) |
| `GODOT_BIN=…/Godot_v4.7.2-stable_win64_console.exe npx vitest run live-layering` | 4 passed, including the native Godot action test |
| `npm run e2e -- experience-parity -g "Walk while attacking"` | 1 passed (3.8 s) |
| Scratch scripts (not committed) that call the canonical `actionHip`, `splitUpper`, `splitLower`, `layerOffset`, `compositeAction` and `composeLayeredAction` on `test/fixtures/bench/bodyA` and the s2 demo | images below |

I did not run the Unity verifier. Unity behavior is unverified by me.

Rendered evidence in this folder:

- [demo-sequence-flip.png](demo-sequence-flip.png): one real demo action (full outfit, E2E anchors, walk at 0.8 cadence). Green means layered and red means full: layered, layered, layered, FULL ×4, layered, layered. The legs change from an upright walk to the punch's crouched lunge and back within 600 ms.
- [south-walk1-slash1-third-hand.png](south-walk1-slash1-third-hand.png): walk 1, slash 1, composite, and the composite with walk-sourced pixels tinted blue. The raised attack arm plus the walk's hand at the left hip make three hands. The torso also sits 4 px lower than hip registration, which shortens the shorts.
- [south-removed-and-stubs.png](south-removed-and-stubs.png), [east-removed-and-stubs.png](east-removed-and-stubs.png). Row 1 marks in red what `splitUpper` removes from each slash cell. Row 2 is the composite with detached walk fragments in green. Row 3 is the plain composite.

## Findings

### Blocker 1: layered actions flip to the full pose and back. This affects Live and all four exports

**I agree with the coordinator, and the problem is wider than stated.**

**Live.** Eligibility is decided per frame:
- `WorldStage.svelte` rebuilds `lower` on every frame.
- `renderPresentation` calls `composeLayeredAction` for each new cell pair (`presentation.ts`, the `lower?.pose` block).
- Any per-pair `fallback` drops to `composeCell` of the whole attack.

**Exports.** The controllers do the same thing:
- `exportedActionOffset` returns `null` for a `null` pair cell, and `exportedActionDraws` then returns the full stack (`paperdoll.js`, end of file).
- Godot's `_render_action` calls `_pair_offset` every frame and falls back to the full stack.
- Unity's `Sync` calls `PairOffset` every frame and falls back.

**API.** The `"layered"` return value only describes the first frame. `canLayerAction` checks the current walk cell against `move.frames[0].cell` only (Phaser, GDevelop, Godot and Unity alike).

**Frequency.** I computed this from the gate's own qualifying table (gate-results.md), sampling every start phase:

| Set | Actions with at least one flip | Mean flips per action | Actions fully layered | Layered share of time |
| --- | ---: | ---: | ---: | ---: |
| bodyA South | 100% | 4.6 to 5.0 | 0% | 55% |
| bodyA East | 100% | 4.9 to 5.5 | 0% | 58% |
| bodyA North | 45 to 61% | 0.9 to 1.0 | 39 to 56% | 95% |
| Demo South | 100% | 3.1 to 3.2 | 0% | 58% |

The ranges cover walk cadence 1.0 and 0.8.

**Tests miss it.**
- The Phaser and GDevelop unit fixtures already contain `null` pair cells (`cells: [null, null, {…}, null]` and `[{…}, null, {…}, null]`), but no test advances the action into them.
- The E2E case polls until `data-attack-layered` is `true` once. Its MutationObserver records `clip`, `scale` and `walk`, not `attackLayered`, so a flip passes.

**About the proposed fix.** "Every pair must pass at the current thresholds" is not enough on its own. Against this table it would turn the feature off for every South, East and demo set. Ship the set rule together with the threshold and fit changes in Major 1 to 3.

My recommendation is to latch the decision per action:
- `playAction` decides once and returns that decision. The decision holds until the action ends, `play` is called, or the loop direction changes.
- Eligibility is a precomputed verdict for the set (walk clip, action clip, direction, current outfit), based on hard criteria only: hip data present, no held or worn gear lost, no limb defects (Major 3).
- The seam is a quality score with a generous limit across the whole set. It is never a per-frame switch. Inside a latched action, every pair draws with its best offset.
- Export one verdict per pair record (for example `eligible: boolean` plus `blocked` per pair, not per cell). Keep per-cell offsets.
- Re-evaluate only on an equipment change, never because the walk phase moved.
- Add one test per controller that plays a whole action across a changing walk phase and asserts the layered state never changes. Add `attackLayered` to the E2E observer.

### Major 1: the bounded fit moves the torso vertically, and the seam metric cannot see it

`layerOffset` searches dx and dy within ±5 px and accepts any score below the current one. The score compares only the left and right extents of one row, so vertical placement is effectively unconstrained. On bodyA, the chosen offset departs from hip registration (|dx|+|dy|) by:

- South: median 3 px, max 6 px, 38/64 pairs at 3 px or more
- North: median 3 px, max 5 px, 37/64 pairs at 3 px or more
- East: median 0 px, max 4 px, 9/64 pairs at 3 px or more

On South, the same-index pairs land at dy 2, 4, 4, 1, 3, 5, 1, 3. The torso bobs up to 4 px against the walk and the character shrinks (see the third-hand crop: the shorts lose about 4 rows).

This is also why South body-only reaches a seam of 1 px or less on 63/64 pairs: the metric is satisfied by moving the torso. Constrain dy to the hip registration ±1 (hips are the vertical truth), or add a distance penalty to the score, and report height deviation in the gate.

### Major 2: the 1 px seam and zero-gear-loss rules are mis-aimed

- On South and the demo, the dominant rejection is gear loss (28 and 20 fallbacks), not the seam. In Live, the demo's `gear-loss` comes from `actionClipsGear`: the shifted upper gear leaves the draw frame. That is a frame-size problem, not a quality problem. Pad the action frame by the maximum offset instead of falling back. Caveat: I used `rigFrame`. Live uses the baked or fit frame, which may clip less.
- On East, the 1 px seam rejects 22 pairs that the coordinator called readable at 4×.
- Recommended limits: hard zero loss for held and worn gear, a seam of 2 px or less after the dy constraint, and the verdict decided per set per direction. North (61/64) and East (37/64) behave too differently for one verdict per character. Per frame is never the right level.

### Major 3: limbs around the waist are wrong in both stacks

1. **The attack's own hand or weapon arm below the waist is erased (I agree with the coordinator).** `splitUpper` removes every below-row component connected to a foot seed. On bodyA, the wrist keypoints (`LEFT ARM` y 0.741) sit below the hips (y 0.705) in ordinary frames, so a hanging hand touching the shorts is part of the removed set (red in row 1 of the South sheet).
2. **New finding: the walk's hands stay.** `splitLower` is a straight cut. Everything below the row survives, including the walk's hands. When the attack raises that arm, a third hand appears (crop above; detached stubs on South walk 6 and 7 are green in row 2).

The owner's bar excludes broken or missing art, and both cases are that.

**Detectable:** yes. A wrist or elbow keypoint below the waist row flags the frame.
**Fixable without runtime masking:** at export or in Live, label each below-row pixel by its nearest skeleton segment (hip-knee, knee-ankle vs elbow-wrist). The lower stack keeps leg pixels only, and the upper removes leg pixels only. Use the current flood fill only when no keypoints exist.
**Testable:** on bodyA South (walk 1 / slash 1 and walk 6 / slash 6), assert that no lower-stack pixel lies nearer a forearm segment than a leg segment.

### Major 4: trousers will probably never layer (unverified, because no fixture exists)

The Live path returns `gear-loss` and the export path adds the item to `blocked` whenever a lower-slot item (`feet`, `legs`, `underwear`) has any pixel above the waist row (`actionLayerFragment` `lost`, then `composeLayeredAction` and `actionSheets`). Legs garments are extracted from a band starting 4 px above the hips (`items.ts:1271`, `from(Math.min(...hips) - 4)`). A waistband above the hip row is the normal case, so a character in trousers is likely never layered at Waist 0.

Neither the bench nor the demo has a `legs` item, so the gate never exercised this. Fix: draw lower-slot items from the walk whole, without a cut. The upper stack covers the overlap anyway. Then add a trousers fixture to the gate.

### Major 5: the upper stack draws entirely above the lower stack

Live (`compositeAction`) and all four controllers draw the whole upper stack over the lower stack. Upper `bg` layers, such as a held weapon's blade behind the body or a back-slot `bgZ: 4` layer, therefore draw in front of the walking legs. The demo cape is fg-only, so it does not show the problem. Fix: merge both stacks by z, using lower fragments for lower-stack layers and upper fragments for the rest. In the controllers this is a sort change, not masking.

### Major 6: exports ship fragments by default, tied to a Live-views setting

`ExportSheet.svelte` passes `actionLayering` whenever `currentLiveLayering(doc.id).on` is true, and that is true by default. Every Phaser, GDevelop, Godot or Unity export of a character with hip data now carries fragment sheets, and nothing in the export UI says so. This is the opposite of "API default off" for archive contents.

For non-body upper layers, `actionLayerFragment` returns the image unchanged, so `action/upper/...` sheets are byte-identical copies of the attack sheets. That is pure duplication. Archive size was not measured. Reference the existing sheet for non-body upper layers, disclose or gate inclusion in Export, and record the size delta on a real character.

### Minor

- **Mirrored hips. I partly disagree with the coordinator.** Each formula is right for its own convention. Anchors are pixel indices (`mounts.ts` adds `+ 0.5`), so `w - 1 - x` is correct. Keypoints are continuous, so `(1 - x) * w` is correct. The real inconsistency is that `actionHip` returns anchors without the `+ 0.5`. Mixed anchor/keypoint pairs are therefore biased by half a pixel, and `Math.round(hip.y)` can move the waist row. Add `0.5` to anchors as `mounts.ts` does.
- **Invalid input. The coordinator's summary is wrong.** Phaser and GDevelop throw. Godot returns `""` with `push_warning`, and Unity returns `""` with `Debug.LogWarning`. Every one preserves state (tested in all four). Document `""` as the native invalid sentinel in the four READMEs and `javascript-runtime.md`.
- **Under-40 px cleanup. I disagree on severity: nit.** `actionFragment` masks the body-only composite (`composeCell(project, {}, …)`), and item layers in the upper stack are never masked. A spark or thrown token on an item cannot be deleted.
- **Live performance is unmeasured.** Each new cell pair recomputes two `composeCell` calls, a flood fill and 121 offset evaluations, with no cache. This is fine at 64 px but unmeasured at 128 px and above. A per-set cache (Blocker 1) removes it.
- **Tooltip.** `layeringHelp` omits the cape and coat caveat that DECISION.md specifies ("Capes may look odd").
- **Stale notes.** `implementation-notes.md` still says "The gate did not clear … Whole-body attack rendering remains in use", which contradicts the shipped code.

### Nits

- Godot `can_layer_action` skips the direction-availability check that Phaser and Unity perform. The result is the same through the pair lookup.
- `actionLayers` has no version field of its own. Fragments are baked into the same ZIP, so editing the character later only requires a re-export. That is acceptable but undocumented in `manifest-spec.md`.

## What is good

- Round 1 finding 7 (slowdown sampled one frame late) is fixed: the action is resolved before speed is computed.
- The mount and rider split, the mounted, airborne and riding exemptions, and persistence and reset of the layering preference are clean and tested.
- No controller performs masking or anatomical inference. They draw supplied fragments at integer offsets, and this holds in all four.
- The API names and shapes match across JS, GDScript and C#, apart from the invalid sentinel above. `play` cancels, the loop clock keeps running, and equipment and palette changes do not restart either clock (asserted in the Phaser, GDevelop, Godot and Unity tests).

## Agreement with the round-2 findings

| Coordinator finding | Position |
| --- | --- |
| Blocker: mid-action flip | **Agree.** It is wider (all four exports) and more frequent (100% of South, East and demo actions). The fix needs a latched per-action decision, plus the threshold and fit changes, or the feature never fires. |
| Major: 1 px seam too tight | **Partly agree.** The larger problems are the unconstrained dy that games the seam and gear loss from frame clipping. |
| Major: below-waist arm erasure | **Agree.** I add the mirror defect (walk hands kept in the lower stack) and a keypoint-based fix. |
| Minor: mirrored hip 1 px | **Partly disagree.** The mirrors are correct for their conventions. The bug is the missing half-pixel on anchors. |
| Minor: invalid input shapes | **Agree it needs documenting.** The coordinator's attribution is wrong: Unity returns `""`, it does not throw. |
| Minor: under-40 px cleanup | **Disagree on severity.** Items are never masked, so it is a nit. |
| Verification gap at native cadence | **Agree.** Still open. |

## Must change before merge

1. Latch layering once per action in Live and all four controllers, with a per-set verdict, and add a whole-action playback test per controller plus `attackLayered` in the E2E observer.
2. Constrain the fit's dy to hip registration ±1 and pad the action frame instead of failing on frame clipping. Then re-run the gate as set verdicts per direction.
3. Fix the waist-region limbs in both stacks (skeleton-segment labeling) and add the bodyA regression.
4. Stop cutting lower-slot items and add a trousers fixture.
5. Merge the two stacks by z.
6. Stop duplicating non-body upper sheets, and make export inclusion explicit or disclosed.

## Not verified by me

- Unity native behavior: verifier not run.
- Real-cadence motion and foot sliding.
- Reduced motion, diagonals and 8-way rigs.
- Long coats.
- Whether real generated characters have `rig.anchors.hip`. The stock demo has none, so default-on currently does nothing for it.
- The trousers claim (no fixture).
- Archive size.

## Questions for the implementer

1. Why does `layerOffset` allow dy ±5 when the hips already fix the vertical? Did you review the height change frame to frame?
2. Which real generated characters (not bench or demo) carry `rig.anchors.hip` for both Walk and Attack? Without them, is "on by default" doing anything for users today?
3. Was any character with a `legs` item ever layered?
4. Why do engine exports include fragments based on a Live-views switch instead of an export choice?
5. When the loop direction changes during a layered action, should the action end layered, switch to full, or keep the old lower facing? This needs one documented answer across all four controllers.
