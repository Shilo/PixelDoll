# PixelDoll frame control and joint editor recommendation

Review date: 2026-10-23. Status: recommendation and verified interaction concepts; no application implementation or product decision has been adopted by this report.

## Decision

**Implement a focused Repair frames workspace with an embedded joint editor. Keep PixelDoll's frozen raster paperdoll model.** The editor should let a user repair a selected result, rescue a failed skeleton estimate, and prepare a new pose without sacrificing good frames. A general skeletal animation application would be a much larger product and would not solve the immediate extraction, texture and occlusion defects.

Keep ordinary dress-up simple. Repair is an optional contextual mode, reached from an issue or the selected frame. Default to one item, one direction and one actual source cell. Start with protected body pixels; permit body-pose replacement only after dependency invalidation and candidate publication are safe.

The proposed product promise is: **AI-generated, synchronized equipment layers with automated checks and precise human finishing.** “Every pixel must come from the model” and “accept or reroll is enough control” are poor constraints for that goal. Local correction should be available without becoming mandatory work on every generation.

## Review coverage and evidence

Three sub-agents reviewed generation/rigging/extraction, Studio/documentation/persistence, and current primary sources for skeletal and pixel tools. Their reports are:

- [Pipeline audit](2026-10-23-pipeline-audit.md)
- [Studio and documentation audit](2026-10-23-studio-docs-audit.md)
- [Skeletal tools and PixelLab research](2026-10-23-skeletal-tools-research.md)

This synthesis also incorporates the related [project repair workflow review](../research/project-repair-workflow-review-2026-10-23.md), discovered in the resumed working tree. Its offline malformed-batch reproduction is attributed to that report; this task rechecked the supporting acceptance/evaluation code, rather than claiming a second reproduction.

The lifecycle was reviewed from generation through export, together with current and historical docs. This is not a line-by-line security audit, a new inspection of every stored generated image, a hands-on benchmark of competing editors, or a fresh verification of all game-engine runtimes. Source-established findings, reported reproductions, historical measurements and proposals remain distinct. Unrelated working-tree changes were preserved. No PixelLab token or `.env` was read and no paid API call was made.

## What deserves to survive the challenge

Frozen body cells, shared animation timing, content-addressed images, stored request/reference/pose provenance, exact palette ramps and layer pivots are appropriate foundations. Frame sheets remain useful to Godot, Phaser, Unity and raster editors without a runtime skeleton dependency. Existing candidate fitting and missing-cell coverage are better starting points than a new generation queue.

Chroma separation is a practical response to a composite-only AI service. It is still a classification heuristic, and consistent conditioning is still stochastic image generation. The system needs a correction loop precisely because these mechanisms are useful without being guarantees.

## Findings that change the implementation order

| Priority | Finding | Why it matters | Evidence |
| --- | --- | --- | --- |
| P1 | Structural acceptance can omit failed requested output. | A malformed batch can be excluded from numerical QA while surviving cells pass; acceptance needs a coverage guard independent of user overrides. | `app/src/lib/items/run.ts:280`, `:288`, `:312`, `:356`; reported offline reproduction in the related workflow review. |
| P1 | Replacing a body clip can make old gear appear compatible. | `addBodyClip` changes the body hash and relabels matching equipment while keeping old replacement-clip cells. A pose editor would amplify this defect. | `app/src/studio/create.ts:385` onward; `app/src/lib/export/generic.ts:69`; source inspection, not a browser reproduction here. |
| P1 | Normal draft review shows only the first requested move. | The user can accept later moves they could not inspect in that review. Whole-item retry also discards the useful comparison candidate. | `app/src/studio/GenCard.svelte:20`; `app/src/studio/state.svelte.ts:568`. |
| P1 prerequisite | Undo and publication do not cover new raster/pose editing. | Dress-state undo omits pixels/joints. Whole-item saves and delayed jobs can overwrite repairs unless acceptance checks current revisions. | `state.svelte.ts:236`; `lib/store/project.ts:54`; `lib/items/run.ts:439`. |
| P1 | Incomplete estimates can block already-paid usable art. | Users need to place missing joints and continue without generating the same art again. | `app/src/studio/create.ts:115`; `app/src/lib/rig/setup.ts:83`. |
| P1/P2 | Cleanup deletes, shifts, trims and sometimes repastes pixels without a local override. | Disconnected detail and unusual silhouettes can be legitimate. “Restore removed pixels” and “draw new pixels” are different repairs. | `lib/items/items.ts:264`, `:307`, `:359`, `:383`, `:413`, `:424`; pipeline report. |
| P2 | Requested joints, estimated joints, actual anatomy and attachment points can disagree. | A correct wrist estimate is not proof of a correct generated grip; moving a guide does not move the raster. | `lib/rig/rig.ts:18`; `lib/items/items.ts:159`, `:299`; saved shield evidence discussed in the pipeline report. |
| P2 | Existing depth and layer controls are not semantic segmentation. | Foreground/background split reproduces the overlay, but does not establish which fingers should cover a sword. Current Forward/Backward also edits slot-wide rules. | `lib/compose/split.ts:6`; `studio/state.svelte.ts:373`. |
| P2 | Accepted geometry exceeds original quality evidence. | Generalized 32–256 px inputs do not validate fixed-pixel cleanup thresholds for every size, proportion and camera. | `studio/characterConfig.ts`; related workflow review's support matrix analysis. |
| P2 | External finishing is not a safe replacement-import workflow yet. | Project recovery prefers canonical cells; changing exported sheets is not an established way to return edits while retaining pose provenance. | `lib/store/import.ts:65`, `:93`; related workflow review. |
| P2 | Documentation mixes current behavior, old experiments and aspirations. | “Clean,” fixed-size descriptions, old default clips, stale threshold values and old implementation tables overstate or contradict the actual contract. | Both local audit reports, with exact file references. |

Structural validity must be a blocker; visual heuristics can be reviewed exceptions. Do not allow an explicit “keep this appearance” choice to override missing required output, invalid sizes or corrupt data.

## What the tool research actually supports

| Reference | Borrow | Avoid assuming |
| --- | --- | --- |
| [Spine setup and animation](https://esotericsoftware.com/spine-first-steps), [IK](https://esotericsoftware.com/spine-ik-constraints), [skins](https://esotericsoftware.com/spine-skins) | Separate calibration from animation poses; hand/foot targets, elbow bend control, stable attachment slots. | PixelDoll's body is already segmented and weighted. Bones cannot deterministically deform its monolithic frozen raster. |
| [Spriter](https://brashmonkey.com/spriter_manual/quickstart.htm) | Visible pivots, modular swaps, inspectable attachment placement. | A pivot fixes missing art, cloth deformation or changing projection. |
| [DragonBones armatures](https://raw.githubusercontent.com/DragonBones/DragonBonesJS/master/DragonBones/src/dragonBones/model/ArmatureData.ts) | Separate bones, slots, skins and animation state. | A complete runtime/editor dependency is necessary. |
| [Godot 2D skeletons](https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html) | Explicit rest pose and coordinate hierarchy. | Weighted polygons and mesh deformation are free prerequisites; their authoring introduces new work. |
| [Aseprite onion skinning](https://www.aseprite.org/docs/onion-skinning/), [animation](https://www.aseprite.org/docs/animation/) | Filmstrip/cel selection, adjacent-frame ghosts, pixel tools, native-size preview and external finishing. | A general sprite editor or native Aseprite parser belongs in the first release. |
| [PixelLab skeleton guide](https://www.pixellab.ai/docs/tools/animate-with-skeleton) | Manual correction of imperfect estimates and inspection of skeletons across frames. | Its older freeze/generate UI behavior is available through the permitted skeleton-v3 REST route. |

These are documented interaction precedents, not evidence that one interface will be intuitive to PixelDoll users. Test both concepts with representative repair tasks. Keep implementations original; do not import Spine runtime licensing or another editor's code/assets for a small overlay.

## Three actions with different consequences

| User-facing action | Local behavior | Raster consequence | Cost |
| --- | --- | --- | --- |
| **Repair artwork** | Nudge the selected item, erase/restore/paint source pixels, transfer selected pixels between supported front/back pieces, replace a mapped PNG frame. | Changes only explicitly selected final layer cells. | Free. |
| **Correct detected joints** | Adjust landmarks on an existing image; explicitly recompute relevant anchors/QA. | Existing body and gear pixels remain identical. | Free; no re-estimation request on drag. |
| **Change pose** | Prepare desired joint positions, then explicitly request candidate art. | New raster candidates appear only after generation; accepted originals remain until reviewed replacement. | Drafting is free; generation spends credits. |

An item-specific grip/attachment marker is a fourth data concern, but need not become a fourth primary mode: place it under Align item/Joints. Correcting it should preview its proposed placement effect; it must not silently retarget the entire wardrobe.

## Recommended interaction

1. From an issue or a paused Studio frame, choose **Repair frame**. Open the matching item, move, direction and actual source cell, with the current outfit as context. Make all generated moves inspectable before initial acceptance.
2. Show one dominant nearest-neighbor canvas, a compact filmstrip and a small contextual inspector. Provide item-only/composite, original/current, optional onion skins, pixel grid and a 1× check. Keep body and unrelated layers locked by default.
3. Start with **Align item**, **Pixels**, and **Joints**. The Joints inspector must explicitly distinguish **Detection on this image** from **Desired pose**. The former cannot expose an implied redraw action.
4. Keep scope visible: **This frame** by default. Selected ranges and an entire move-direction are explicit. Do not automatically propagate across directions or paint one patch over different poses.
5. Preserve before/after and previous accepted revisions. One drag or brush stroke is one Undo action. Apply publishes a local revision; completion of an AI job never auto-applies a replacement.
6. Display human review separately from measurements: “Passed automated checks,” “Needs review,” “Edited locally,” “Reviewed exception,” “Needs refit,” and structural blockers. A user-accepted exception is not a clean automated pass.

On desktop, use the **Repair workspace** concept: canvas, filmstrip and contextual inspector. Use the **Guided repair** concept as an optional entry flow or small-screen approach, not a second independent editor engine. On phones, stack the canvas and tool sheet, retain scope and the Apply action, and support panning/zooming separately from editing gestures. The full concept currently stacks controls rather than implementing a production sticky sheet.

### Joint-specific controls

- Retain the provider's 18 labelled points internally. Use familiar UI terms: “Right hand (character's right)” maps to `RIGHT ARM`; “Right foot” maps to `RIGHT LEG`. Head landmarks can be a collapsed group.
- Start with direct joint placement, a selectable named joint list, numeric source-pixel coordinates, arrow-key nudges and parent/joint pins. Keep handle hit regions in screen pixels and usable when side-view points overlap.
- Allow continuous/subpixel landmark positions; only raster paint/translation snaps to whole pixels. Do not round joint data just because the artwork is pixel art.
- Add optional two-bone IK for hand/foot posing after direct placement is reliable: pinned shoulder/hip, explicit bend side, reach feedback and no silent stretch. Projected limb lengths vary with foreshortening; length locks must be optional.
- Preserve original target, estimated and manually corrected overlays as different records. Do not alter the historical target sequence when correcting a measurement.
- Reference/rest calibration is separate from a frame's pose. Changing reference calibration affects future jobs that use that reference; it does not retrospectively establish how old pixels were generated.
- Copy/paste a pose can follow. Defer curves, full constraint graphs and interpolation across moves/directions. An optional later delta over selected frames requires a preview of every affected frame.

## Implementation architecture

Use the existing strict TypeScript/Svelte stack, custom CSS, Lucide icons, IndexedDB and content-addressed PNG cells. An SVG interaction overlay over the existing pixel canvas is sufficient. No backend, skeletal runtime, large canvas framework or replacement UI system is needed.

### Reuse existing seams

| Existing code | Proposed responsibility |
| --- | --- |
| `studio/DesignPreview.svelte`, `Stage.svelte`, `Sprite.svelte` | Shared move/direction/cell selection, filmstrip and pixel-accurate rendering. Reuse behavior rather than copying a second compositor. |
| `studio/FitDesignSheet.svelte`, `lib/equipment/fit.ts`, `copy.ts` | Staged candidate review, expected-target stamps and acceptance lifecycle. Reuse the smallest applicable pattern. |
| `lib/rig/poses.ts`, `estimate.ts`, `skeleton.ts` | Typed labels, normalized/source coordinate conversion, observation/anchor helpers; make editing validation explicit before serialization. |
| Small new `lib/corrections/` module | Pure cell edits, observation overrides, dependency checks and revision publication. Avoid a generic command/event framework. |
| `lib/store/project.ts`, `db.ts`, `import.ts` | Atomic local revisions, history reachability, conflict detection and versioned editable-project round trip. |
| `lib/compose/` and exporters | Consume the same resolved final cells used in the Studio. Audit any new ordering semantics across every target. |

### Minimum durable model

Exact naming can be decided during implementation. Preserve the following boundaries:

```ts
type FrameAddress = {
  animation: string;
  direction: DirectionName;
  cell: number; // unique source cell, not playback-entry index
};

type CellTarget = FrameAddress & { itemId: string; layerId: string };

type ObservedJointOverride = {
  imageHash: Sha256; // correction only valid for this raster revision
  points: Keypoint[];
  revision: string;
};

type RepairRevision = {
  id: string;
  parent?: string;
  targets: CellTarget[];
  before: Sha256[];
  after: Sha256[];
  operation: 'paint' | 'erase' | 'restore' | 'translate' | 'occlusion' | 'replace';
  createdAt: string;
};
```

Keep original API `ClipSource.keypoints` and measured observations immutable. Store observed overrides separately, and keep desired poses as drafts or the source of a newly accepted generation revision. Raster revisions, joint observations and attachment tracks are related but cannot be one interchangeable “skeleton” object.

Candidate stamps should include the affected body image hashes, relevant rest/reference revision, target pose revision, attachment revision, selected item cells and extraction recipe version. A global `baseHash` is useful as an asset identity but insufficient to express partial compatibility. If fine-grained dependency tracking is too large for the first release, conservatively mark dependent equipment stale and keep body editing locked; do not rehash stale pixels as current.

### Publication and rendering rules

1. Clone source pixels; never edit shared `Img.data` in place. Paint using source palette identities while previewing the user's selected recolour. Recompute the final hash and invalidate image/palette caches.
2. Retain generated composite, extracted result and available cleanup-removal masks. Manual edits operate on final authoring data after the automatic recipe. Restored details must not be deleted by rerunning cleanup.
3. Store output blobs, then atomically check expected revisions and publish cell references, corrected metadata, QA/review state and history. Reject stale acceptance without losing the candidate. Use changed-cell merges rather than whole-item stale snapshots.
4. Preserve originals and accepted history through reload and editable ZIP export/import. Extend the explicit `projectData`/import schema; adding only IndexedDB fields is insufficient. Mark history/candidate blobs live during garbage collection. Bound optional history, but retain the original/current accepted state.
5. Engine exports bake resolved pixels, timing and existing pivots. Preview and export must share the resolution path. Keep outfit-specific tucking/masks separate from shared source-art edits, so fitting one hat does not permanently erase hair for other outfits.
6. Recompute applicable cell and affected temporal checks; retain historical generation checks. Key-retention evidence cannot be reconstructed honestly from only an edited transparent layer. Do not invent new API provenance, job IDs or usage for local operations.

### Coordinate and scope pitfalls to test explicitly

- `animation.frames[ui.frame].cell` identifies the source artwork; a repeated playlist entry shares it. Show this relationship before editing or explicitly duplicate the occurrence.
- Use body/pivot coordinates as the overlay reference. A 96 px held layer and a 64 px body have different image origins around the same pivot. Never use thumbnail crop coordinates for editing.
- Joint coordinates describe continuous pixel edges (`x / width`); raster indexes describe pixels (`0..width-1`). Joint reflection uses `width - x`, while pixel reflection uses `width-1-x`. Reuse and test existing conventions.
- A derived mirror needs an explicit choice: edit its source and show both, or materialize an independent direction. Materialize complete affected rows/pieces before a partial override, since a present direction row suppresses source fallback.
- Translate pixels within fixed cell/pivot geometry; show edge loss before applying. Do not move the shared pivot to fix one item frame. Arbitrary rotation/resampling is outside the first release.
- Current z overrides are slot rules. A selected-item repair must not mutate every alternative item. Prefer scoped pixel transfer between existing fg/bg pieces where appropriate; introduce new item-order schema only after compositor/runtime/export parity is established.

## PixelLab repair contract

The [REST OpenAPI](https://api.pixellab.ai/v2/openapi.json) and the repository snapshot define the permitted request shapes; the official tool guide is useful UX evidence but includes older workflows.

- Skeleton-v3 draws from one reference image and an 18-point pose sequence with **3–15 frames**. There is no native one-frame skeleton-v3 redraw. For a selected-frame replacement, distinguish the number of poses billed/submitted from the number of candidate cells the user may replace.
- Existing minimum-three padding makes short requests structurally valid; it does not prove temporal continuity. Compare repeated-pose and neighboring-context strategies in a small later experiment before promising reliable single-frame pose repair.
- Reference joints must describe the reference image's existing pose. Desired poses must not be substituted into that calibration slot. Keep optional depth out of basic editing; draw order is not true 3D depth.
- Pro inpaint-v3 is the existing masked editing option, and edit-animation-v2 is a batch image-edit route without per-region masks. Any candidate merge must enforce the user-approved mask/layer locally and preserve bytes outside it regardless of model behavior.
- Show estimated additional cost, actual request batch, accepted replacement scope and already-spent usage. No charge occurs during dragging. Retry and further paid attempts are explicit; uncertain requests are reattached/reconciled rather than resent.
- Prefer local fixes first. Offer an explicit generation budget for users who want automated attempts; do not equate numerical failure with permission for an unbounded paid search.

No new route or legacy model is proposed. Targeted live-quality validation remains outstanding; it was unnecessary for this review and no credit was spent.

## Delivery sequence

| Stage | Ship | Gate before continuing |
| --- | --- | --- |
| Trustworthy review | Structural coverage guards; all-move/frame review; actionable QA locations; honest statuses; body-replacement compatibility fix. | Invalid/missing requested output cannot be accepted as a pass; unchosen old gear cannot silently become current. |
| Local equipment repair | Durable immutable revisions, nudge, pencil/erase/restore, source palette, before/after, onion skins, undo/revert; protected body. | Non-target hashes identical; source/mirror and oversize tests; reload/ZIP/GC/conflict/export parity. |
| Joint correction and rescue | Correct detected points, rest calibration and reviewed attachment tracks; resume retained art after estimation failure. | Joint edits issue no paid requests and change no raster bytes; original targets/measurements remain inspectable. |
| Target-pose candidates | Desired pose drafts; optional two-bone IK; explicitly paid regeneration and selective comparison. | Revision-safe candidate publication and evidence that temporal seams/identity remain acceptable. Otherwise retain honest full-clip candidates. |
| External finishing | Mapped PNG replacement packages with geometry, palette and source-hash checks. | Diff preview changes only selected cells and preserves rig/provenance. Native Aseprite parsing is not required. |

Body pose/art replacement remains a deliberate advanced revision after these safeguards. Full meshes/weights, runtime skeleton exports, arbitrary rig topology, physics, a graph editor, automatic all-direction propagation and a general pixel-art suite are deferred.

## Documentation changes to accompany implementation

- **Architecture:** replace the accept/reroll-only goal with optional finishing; document implemented geometry, immutable source versus edited revisions, correction/invalidation and current cleanup behavior. Remove contradictory implementation-status tables and component-preservation claims.
- **PLAN/TODO:** record the product decision only after it is accepted; prioritize structural correctness and repair foundations before new automation. Keep known shield/cape/helmet limitations actionable.
- **User guide:** explain frozen body, detected joints, desired pose, local versus paid operations, actual scope, mirrors, undo retention and external replacement versus project recovery.
- **Manifest/project spec:** version repair metadata, original/candidate reachability, per-cell compatibility and round-trip validation. Do not imply every engine executes an editor recipe.
- **README/docs index:** reconcile current format names, export credit filenames, shield status and supported/validated geometry. Label historical S2 art as UI/compositing evidence, not current skeleton generation proof.
- **Test/research reports:** preserve dated evidence. Add a capability matrix separating implemented, structurally tested, visually validated and experimental behavior; link the rotation-origin withdrawal wherever old alignment claims appear.

These are recommended edits. Existing canonical docs were not rewritten to present the proposal as shipped behavior.

## Mock-ups and verification

Two interactive concepts accompany this recommendation: **Repair workspace** and **Guided repair**. They reuse stored S2 demo artwork only for UI illustration. The joint guide is illustrative, only its wrist is interactive, and no new generated result is represented. They demonstrate local nudge/erase/undo, filmstrip scope, joint drag/keyboard control, detection versus target draft separation, and a request preview that sends nothing. They are not production components, an IK implementation or proof of paid repair quality.

The original inline fragment is preserved in [frame-repair-mockup.html](frame-repair-mockup.html), byte-identical to the chat visualization source. This is an archived repair concept, not the active Bronze UI implementation. Its original local location was: `C:/Users/shilo/.codex/visualizations/2026/10/23/01a169b9-b361-71c3-93dd-750af5091ee3/pixeldoll-frame-repair.html`. Representative captures are in [mockup-previews](mockup-previews/). The [verification script](verify-frame-repair-mockup.mjs) and [result](frame-repair-mockup-verification.json) record the checks. It uses the visualize skill's local preview wrapper; run that preview on localhost, set the managed Playwright browser cache path if needed, then run the script. `MOCKUP_URL` overrides its default `http://127.0.0.1:5275/`.

Verified in this task:

- Local nudge affects the selected frame, another frame retains its offset, and Undo restores the exact canvas.
- Keyboard and pointer joint changes leave raster output identical. Detected and desired points are separate; only desired-pose mode exposes the local request preview.
- Erasing a known sword pixel changes the raster; Undo restores it. Explicit clip-scope nudge affects all eight selected-view cells in one history step.
- 320 px and 390 px layouts have no root horizontal overflow and expose touch-sized Apply controls. Desktop dark and mobile light captures were visually inspected; guided desktop was also inspected.
- Both variants operate without page errors or PixelLab requests.
- Earlier baseline `npm run check`: zero errors/warnings. Unit tests: 33 suites, 297 passed, one skipped after redirecting sandbox temporary files to an ignored workspace cache. These results precede unrelated edits that appeared during the interruption. The host used Node 25.0.0/npm 11.16.0, not the required Node 24.22.1/npm 11.19.1; no pinned-runtime claim or current full browser-suite pass is made here.

Before production release, add meaningful offline tests for actual-cell identity, shared-hash isolation, palette roles, mirrors, 96 px pivots, front/back masks, human review state, history/ZIP/GC, late-job conflicts, estimator rescue and strict coverage. Use saved shield/helmet/cape defects and legitimate disconnected details for usability trials. Measure whether casual users can identify the affected frame, understand scope, repair it quickly and preserve animation quality. If most assets require extensive manual repainting, improve or narrow the generation pipeline rather than treating an editor as proof that it works.

## Recommendation to implement

Proceed with **trustworthy result review → reversible local frame repair → joint calibration/rescue → explicitly paid pose candidates**. Borrow Spine's precise joint interaction and Aseprite's frame context while retaining PixelDoll's lightweight frame-based asset contract. This gives users control over failed automation without making them maintain a second animation system.
