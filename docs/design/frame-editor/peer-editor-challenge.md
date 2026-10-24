# Peer challenge: one embedded Frame Editor

Date: 2026-10-23. Status: planning/research contribution; no application changes or paid API calls.

## Position

Adopt one full-screen **Frame Editor** inside PixelDoll. Enter from the Studio's current frame, an equipment action or a result issue; return to the same Studio context. The editor owns one recoverable draft spanning character artwork, equipment artwork and joint corrections. It is a focused authoring surface for PixelDoll assets, not a separate project, service or general animation application.

The existing review's equipment-first safety sequence was reasonable, but permanent body protection would fail this request. Body pixels and body alignment must be editable in the agreed end design. Safeguards belong in revision publication and dependency review, not an artificial distinction between editable gear and untouchable character art.

## Current evidence changes the old argument

The [older frame-control recommendation](../../reviews/2026-10-23-frame-repair-recommendation.md) is a dated audit, not the current implementation contract. Source was inspected again for this contribution:

| Current source | Consequence for this plan |
| --- | --- |
| `app/src/studio/replaceMove.ts`: `invalidateMoveItems`, `clearMovePoseData`, `affectedMoveDirections` | Body move replacement now clears affected fitted directions, including dependent mirrors, and removes obsolete joint/anchor data. Do not repeat the earlier claim that this defect remains unfixed. Cell-level editor publication still needs a more selective policy. |
| `app/src/studio/create.ts`: body publication checks `moveRigVersion` inside the transaction | Reuse current optimistic concurrency and selective publication patterns; do not invent a second save subsystem. |
| `app/src/lib/store/project.ts`: `saveItem`; `app/src/lib/store/db.ts`: `updateCharacter` | PNG blobs and project references already publish atomically. Missing work is editor draft/revision/history/conflict semantics, not basic transactional storage. |
| `app/src/lib/equipment/copy.ts`: `targetStamp`, `extensionStamp`, `publishCandidate` | Candidate validity already depends on current target/input stamps. Editing must participate in and extend this protection. |
| `app/src/studio/GenCard.svelte`: Keep is disabled by `hasStructuralFailure` | The previous acceptance-guard finding cannot be repeated as an unqualified current defect. Editor publication still must reject structurally invalid output. |
| `app/src/lib/store/manifest.ts`: `ItemPaletteRepair`, `CURRENT_FORMAT = 'pixeldoll/2'` | Local before/after raster changes and modern exact-palette semantics already exist. Reconcile rather than duplicate their provenance/history. |
| `app/src/studio/state.svelte.ts`: Undo snapshots dress state | Existing Undo does not establish pixel/joint draft undo. Never imply that it does. |
| `app/src/lib/compose/compose.ts`: `layerFrame`, `cellImg`, tuck variants, slot z overrides | Pivots align oversize layers; stored direction rows suppress mirror fallback; tucked renderings may hide source pixels; depth rules are slot-wide. These are editor constraints users must not have to discover by losing work. |
| `app/src/lib/store/import.ts`: `projectEntries`, `editable` | Editable archives explicitly serialize selected metadata and reachable images. Adding editor records to IndexedDB alone does not preserve them through export/import. |

This is focused source inspection, not a new whole-project test run or proof of visual correctness.

## The single mental model

**Choose what → choose where → use a tool → save a reviewed revision.** The same canvas, frame strip, history and save lifecycle serve every operation.

| Dimension | UI | Rule |
| --- | --- | --- |
| What | Objects list: Character, Hair, Helmet, Sword, etc. | One active paint target; context remains visible. Select a logical item by default, with Front/Back available when its actual stored pieces require it. |
| Where | Move, direction, source frame; visible scope chip | Default to one actual source cell. Multiple playback occurrences of that cell are identified. Broader scope requires explicit selection, never a hidden sticky mode. |
| Tool | Move, Draw, Erase, Joints | Contextual controls change below a stable small toolbar. Picker, restore and rectangular selection can be tool options. Pan/zoom are navigation, never an ambiguous fifth editing mode. |
| Result | Draft changes, before/after and Save | No target switch or frame switch publishes pixels. Save publishes explicitly reviewed changes; autosave preserves the draft independently. |

Do not make Align, Pixels and Joints separate sheets, projects or sequential steps. Users need to repair a wrist, shift a sword and erase a stray pixel while watching one looping move, then save once.

The toolbar may group Draw/Erase/Picker under Pixels on compact screens. This is presentation, not a second editor workflow. Avoid hidden automatic target selection on every brush stroke; users must see what will change before touching the artwork.

## Layout proposal

```text
← Studio     Frame Editor · Character name       Undo Redo    Draft saved    Save

Objects / visibility      Move · Walk  Direction · East       Contextual inspector
● Character               Frame 3 · source cell 2             Move artwork
  Hair                    Scope: This frame                   X / Y, arrow nudges
  Helmet                  ┌────────────────────────────┐     Target: Sword
● Sword                   │                            │     Pieces: Both
                          │  nearest-neighbor artwork  │     Selection: Whole
Move Draw Erase Joints    │  optional joint overlay    │     Clip warning if needed
                          │                            │
                          └────────────────────────────┘     1× animation preview
                          Before / After · Grid · Onion

                 Play  [frame][frame][selected][frame] ...  Changes (3)
```

Use existing custom CSS, themes and typography. On narrow screens, keep the canvas and scope visible; objects and inspector become labeled sheets. Explicit Draw versus Pan and pinch navigation must work without a modifier key. A keyboard joint list with numeric coordinates must provide an alternative to small overlapping handles. Restrict single-key shortcuts while typing in inputs; distinguish frame navigation from arrow-key nudging.

## Objections the design must resolve

### “Move the character” is ambiguous

Expose **Body** and an explicit **Whole character** group in Move controls. Body corrects drifting body art relative to gear. Following review of the canonical draft, Whole character means body plus **all compatible stored wardrobe alternatives at the selected cells**, including hidden/unequipped items. This supersedes this reviewer's initial equipped-only proposal: moving only the visible outfit would leave alternatives misaligned when later selected. Label the properties “All wardrobe alternatives,” show count/expandable membership and name ineligible/missing items; do not imply this is merely moving the current outfit. Never silently change the rig pivot or a layer's persistent pivot to compensate for one bad frame.

Raster translations snap to source pixels. Show fixed cell boundaries and pixels that would leave them. Keep an uncropped move preview so dragging back recovers those pixels. The canonical core policy rejects nontransparent edge loss rather than permitting an intentional crop; this is a sensible simpler safeguard. If a wardrobe alternative would clip, name the item/cell and reject the complete group operation without partial publication. Body-only remains available with fitting review. Whole-item move shifts foreground/background pieces together. Paint and selection movement can operate on one disclosed piece. Multi-object painting is disallowed; group movement is allowed.

When body pixels translate, the associated corrected joint observation and relevant attachment positions need a disclosed companion translation or invalidation. Historical requested joints remain unchanged. A character-group translation is not evidence that model output followed a newly requested pose. Only proven lossless consistent translation of the body, all eligible dependent artwork and relevant derived coordinates can automatically retain fitting; omitted stale/missing cells are not promoted.

### Joint editing must not lie about raster deformation

Within Joints distinguish **Correct joints on this image** from **Draft a pose**. Correcting observations changes guides/metadata only. Pose drafting also changes no pixels until an explicit generation request produces a candidate. An item attachment/grip adjustment is a separate named value under Move/Joints; it must not secretly modify anatomy or every item in that slot.

Direct dragging, labeled point selection, numeric coordinates and nudge controls are sufficient first. Optional two-bone IK belongs to pose drafting after direct editing works. Keep joints continuous; do not quantize observations to raster indexes. Reference calibration, measured observations, manual corrections and desired poses remain distinct records.

### “Save” must not discard the rest of the wardrobe

Body editing needs a small impact review at Save, not a paid refit demand after every stroke. Identify changed body cells, dependent joint observations, affected fitted items and mirrors. Preserve old equipment frames as recoverable review candidates rather than deleting them to make the project consistent.

Offer explicit review/keep of visually compatible affected equipment, repair in the same draft, or leave affected cells **Needs review/refit**. A local visual acceptance is honest human compatibility evidence, not a fabricated generation/QA pass. Missing or invalid cells remain structural blockers. Unchanged cells keep their compatibility evidence. Saving the character must not silently re-stamp old gear current or export stale affected cells as certified output.

The first implementation can conservatively mark changed-cell dependencies for review; do not require semantic inference that a pixel is “only cosmetic.” A later optimization may distinguish proven non-geometric operations, but changed image hashes alone cannot establish pose compatibility.

### Multi-frame scope is not one generic switch

Move can apply an explicit delta to selected cells after preview. Pixel painting starts on one cell; copying a patch to other selected cells needs its own preview because pose-local coordinates differ. Corrected joint observations are image-specific, not an “apply all” pose. Broad pose edits need deliberately selected frames and a comparison. Scope resets to one cell after leaving a broad operation.

Two different cells sharing one content hash are not linked edits. Two playback entries referencing the same source cell are linked. Explain the latter once and offer a deliberate duplicate-cell operation later; do not accidentally expand the painting target set.

### Displayed color is not authoring color

Default to the selected target's source palette/material roles; let users view active outfit colors while preserving authoring identity. Picking a displayed color must resolve its source role and shade. If two source roles display the same color, ask for the role rather than guessing.

Support deliberate unmatched source colors as explicit fixed colors, with a warning that they will not follow material recolors. If initially deferred, label the limit and add it to the follow-on plan; do not pretend a permanently palette-locked editor can correct every asset. Do not silently add colors to global ramps, broaden their ownership or destroy the existing encoded shirt/shorts region semantics.

### Hidden pixels and clipping are not the same as missing pixels

Provide **As worn / Source artwork** view and target isolation. The user must be able to see pixels hidden by another item, hair tuck rules or foreground/background split. A source-art erasure affects every outfit using that art; an outfit-specific tuck adjustment is a different operation. Do not paint a rendered tucked variant back over its reusable source. Keep per-item occlusion authoring deferred until its compositor/export contract is complete; existing slot-wide z controls must be labeled honestly.

### Save versus recovery versus export

Draft autosave preserves work after interruption without changing accepted art. Save publishes a revision in the local project; Save and return can be a secondary action. Return with unsaved edits offers Keep draft, Discard draft or Save. Export writes the accepted revision by default and clearly offers saving first if a draft is open.

One stroke/drag is one Undo action, across target and frame switches. Undo remains distinct from restoring an older saved revision. Persist a bounded recoverable draft plus original/current accepted blobs and a documented bounded saved history. Quota failures keep the draft in memory and provide an offline recovery download; never report successful save before the storage transaction completes.

## Official interaction precedents

Sources checked 2026-10-23. These establish documented behavior, not usability proof or permission to reuse implementation/assets.

- [Aseprite Move tool](https://www.aseprite.org/docs/move-tool/) moves cels and supports selected multiple cels through its timeline. Borrow explicit target/scope selection and axis constraint; translate/bake into PixelDoll's existing fixed-cell contract rather than inventing unsupported runtime offsets.
- [Aseprite animation](https://www.aseprite.org/docs/animation/) combines frames, layers, playback and onion skins. Borrow persistent frame context while retaining PixelDoll's short synchronized clips rather than a full timeline authoring suite.
- [Spine tools](https://esotericsoftware.com/spine-tools) offers direct selection/manipulation, numeric transform entry and keyboard adjustment. Borrow precision and accessible alternatives; do not imply PixelDoll has Spine's segmented mesh/bone deformation data.
- [PixelLab skeleton guide](https://www.pixellab.ai/docs/tools/animate-with-skeleton) explicitly says estimated skeletons may require corrections and recommends frame inspection. This supports joint correction as a real need; its older generation UI is not evidence that the allowed REST v3 route supports frozen-neighbor one-frame editing.

## Proposed stages and release gates

1. **Offline design spike:** real fixture frames; end-to-end prototype of body/item move, painting, erasing, joint correction, scope, save impact and return. Test mouse, keyboard and touch layouts. No paid image generation needed.
2. **Revision foundation:** image-isolated edits, recoverable draft, history, dependency impact, expected-revision publication, editable archive migration, GC reachability and shared render/export path. Existing transactional primitives are the starting point.
3. **Coherent local editor:** one real screen with body and item targets, whole-pixel move, single-pixel draw/erase, picker, before/after, onion skin, source/as-worn view, direct observation correction, multi-target draft and reviewed save. It is not complete if body editing is permanently absent.
4. **Controlled power:** rectangle select/move/copy, selected-frame transforms, restore where genuine pre-cleanup data exists, deliberate mirror independence, palette enhancements and mapped PNG replacement. Never fabricate restore pixels that were not retained.
5. **Explicit generation candidates:** desired poses, reference calibration, optional IK and selective candidate acceptance. Preserve model restrictions, cost preview, no automatic paid resend and input revision conflicts. Live generation quality remains a separately authorized experiment.

Before local release, verify body-only drift repair, full-character translation, sword foreground/background synchronization, 64/96 px pivot offsets, mirrored direction editing, shared-hash isolation, repeated source-cell occurrences, palette-role ambiguity, hidden/tucked art, exact undo/reload/archive round trips, quota recovery, late generation conflicts and non-target-byte preservation. Test that accepted unchanged equipment remains available and affected unreviewed equipment is visibly distinguished in Studio/export.

## Agreement criteria

I recommend agreement only if the canonical plan preserves all of these:

- One embedded, separate editor screen and one draft/session, not three independent repair tools.
- Both body and equipment pixels can be edited and saved in the agreed product; body safety is an impact/revision policy.
- Active target, true source frame and operation scope remain visible before editing.
- Actual artwork translation, pivot metadata, joint observations, desired poses and grip positions have distinct semantics.
- No charge or raster deformation occurs from joint dragging; paid generation is a separately reviewed candidate action.
- Save is revision-safe and recoverable across reload/export/import; it never discards older accepted art or silently blesses dependent fits.
- Pixel/palette, mirrors, layering and export are treated as project contracts, not implementation details deferred until after launch.
- The first coherent local editor is small enough to build with the current stack; full rig engines, meshes, weight painting, arbitrary animation curves and general illustration features remain outside scope.

## Canonical design review and agreement

Reviewed the canonical [product specification](README.md) and [data/safety contract](data-and-safety.md) after independent drafting. I agree with their combined design; no substantive product/data blocker remains.

Resolved differences:

- **Group membership:** adopted Whole character = body plus all compatible wardrobe alternatives at selected cells. This deliberately replaces my initial equipped-only proposal; visible membership and atomic rejection naming any clipping item/cell make the wider scope reviewable.
- **Clipping:** adopted core rejection of nontransparent edge loss instead of a destructive-apply option. Region movement/painting still cover anatomy corrections without resizing pivots or cells.
- **Body compatibility/export:** agree that body edits can save unfinished while preserving old gear for review. The first export policy excludes an entire item until every affected relationship is proven or reviewed compatible. Unaffected cells remain editable/stored, but the plan does not pretend today's global `baseHash` implements partial-cell compatibility/export.
- **Palette scope:** agree with existing source colors, explicit material role selection and B15-aware region writes in the core. Arbitrary new fixed/custom colors are an explicit extension gated by ownership evidence; this is a delivery boundary, not permanent exclusion.
- **Joint meaning:** agree on observation/reference/desired-pose/attachment separation, no implicit redraw, and image-bound correction/derived translation with immutable request history.
- **Durability:** agree on separate autosaved draft and accepted revision, stamped atomic publication, no destructive wardrobe deletion, bounded documented history, editable-archive versioning and recovery under quota/conflicts.

The canonical delivery/research documents must carry these agreed contracts into release gates. Actual implementation, user testing and live generation quality remain unverified. Final package consensus is recorded in [consensus.md](consensus.md), not inferred solely from parallel report creation.

### Final package signoff

**AGREE — reviewed all four canonical documents on 2026-10-23:** [README.md](README.md), [data-and-safety.md](data-and-safety.md), [research-and-spikes.md](research-and-spikes.md) and [delivery-plan.md](delivery-plan.md). No unresolved substantive blocker remains for this planning/research deliverable.

The final changes resolve the remaining integration risks: engine export filters its references coherently while the editable archive retains unfinished gear; Studio suppresses only affected unreviewed cells with an actionable note while retaining outfit selection; editor WIP comparison makes those pixels available for finishing; linked mirrors reflect horizontal deltas and avoid double application; group membership is checked again at publication; Undo after Save creates a dirty draft. The acceptance/spike matrix covers these contracts without claiming it has run. Existing tools, body support and later optional extensions remain clearly distinguished.

This is design/research agreement, not implementation approval, a usability certification or a claim that S1–S6 experiments were performed. No application source, dependency, credential, paid API or commit was changed by this reviewer.

**Agreement addendum — candidate and library ownership:** reviewed the added README, data/safety and delivery-plan passages. AGREE. A visibly candidate-owned session saves back to that retained candidate and returns to its originating review; it cannot bypass Keep/finish structural acceptance or resend already successful paid art. A character-local fitted-copy edit cannot write through immutable library snapshots or other character copies; creating a reusable revised design is separate and explicit. The planned owner discriminator and acceptance scenario close these boundaries without introducing another editor. No new blocker.
