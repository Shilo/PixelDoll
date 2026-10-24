# Studio, documentation and frame-repair audit — 2026-10-23

Scope: read-only review of the current working tree's Studio, persistence/export contracts, README, PLAN, TODO, architecture, manifest and user guide, plus test implementation and historical reports. No production source changed, no PixelLab calls, no token or `.env` access. This report is an implementation recommendation, not proof that a future editor works. Exports, user-guide text and theme-design files were already being edited concurrently; references describe the observed working tree, not a clean release commit.

## Recommendation

Implement **Repair frames**, with an optional **Joints** tool inside it. Do not make an all-purpose skeletal animation editor the primary product. The product's missing capability is a local, reversible way to diagnose and correct a particular output cell while preserving good generated work. Joints are one cause and one repair input; they are not the rendered artwork.

The existing architecture remains appropriate for engine-ready frame paperdolls: frozen body pixels, content-addressed cells, explicit layer pivots and one animation clock. Keep those strengths. Challenge the assumption in architecture §1 that minimal work means one final accept/re-roll choice. A casual user also needs the small correction that avoids paying to remake an otherwise good item.

## Evidence-backed findings

| Priority | Finding and concrete impact | Evidence | Status |
|---|---|---|---|
| P1 | **Ordinary item review exposes only the first requested move.** Generating several moves can leave a bad later move uninspected while “Keep it” accepts the item. The rest of the Studio previews the accepted project, so changing its move does not turn the draft review into a multi-move review. | `app/src/studio/GenCard.svelte:20` chooses `spec.anims[0]`; lines 53–61 render that clip, line 73 keeps the whole item. | Implemented limitation, established by source inspection; not browser reproduced in this audit. |
| P1 | **The default recovery sacrifices scope and comparison.** Draft “Try again” removes the draft and starts a fresh item from the original input. One bad frame does not get a targeted repair and the previous candidate is no longer available in the review for A/B choice. Stored ledger history is not a user-facing version history. | `app/src/studio/state.svelte.ts:568–571`, `GenCard.svelte:74`; accepted items route Try again to a prefilled New item in `ItemPane.svelte`. | Implemented. Shared fitted-copy retry is more selective; do not generalize this finding to every pipeline. |
| P1 | **There is no frame-correction workspace in production Studio.** Playback, move/direction choice and comma/period keyboard stepping exist, but there is no visible frame timeline/selected-cell inspector, joint manipulation, pixel patch, local nudge, region correction or reviewed replacement flow. A user can observe a failure but cannot repair it. | `Stage.svelte:78–127`, `Studio.svelte:148–153`; `Inspector.svelte` only Item/Colors/Moves; `Moves.svelte` previews and adds moves. | Implemented gap. Existing dev/library utilities do not equal a Studio workflow. |
| P1 | **Layer-order scope is much broader than the current frame.** Forward/Backward finds a neighbor in the current frame, then stores an override on the slot without animation/cell fields. The change affects every item using that slot, across moves and frames, optionally one direction. This cannot safely be repurposed as a one-frame occlusion repair. | `state.svelte.ts:373–385`; `ItemPane.svelte` labels “Layer order” and “Only when facing …”; manifest `ZOverride` supports `anim` and `cell`, but this UI does not write them. | Implemented behavior; likely intentional outfit control, but insufficiently scoped for repair. |
| P1 | **Current undo cannot protect artwork or joint editing.** It snapshots dress state only: outfits, materials, slot z overrides and hides. Cell references, clip sources, measured skeletons and rig anchors are absent. Reusing `commit()` for the editor would create an apparent undo promise that cannot restore its changes. | `state.svelte.ts:236–273`; `lib/dress/project.ts:14,39–46`. Opening a project clears undo at `state.svelte.ts:214`. | Implemented boundary and implementation blocker, not a defect in the current dress-only editor. |
| P2 | **QA is difficult to act on.** Draft messages deduplicate failures through `plainReason`, losing clip/frame specificity for common gates. Accepted-item reasons reconstruct only G2–G8 from aggregate fields; they omit H4, G9/G10 localization and review-warning detail. `accepted` exceptions collapse to the same “Needs a look” badge as unchecked failures. | `GenCard.svelte:23–24,68`; `model.ts:113–135`; `ItemPane.svelte` reasons calculation and QA Details; manifest stores per-cell and per-clip records. | Implemented. A useful QA data model already exists underneath the simplified UI. |
| P2 | **Quality language overstates what measurements prove.** “Clean: every frame passed” is a gate result, not a guarantee of anatomical correctness, visibility, design continuity or grip. Existing shield, cape and helmet reports explicitly retain uncertainty or real defects. A skeleton estimate can also be wrong. | `docs/user-guide.md:145–150`; `GenCard.svelte:70`; `docs/architecture.md:85–87,169–177`; `TODO.md:8–12,31–39`. | Documentation/product-language correction recommended. Preserve visual review. |
| P2 | **Demo and export regression evidence is older than the allowed generation pipeline.** S2 is a useful deterministic test of compositing, recoloring and export, but includes template-animation provenance. A keyless demo pass does not establish current skeleton-v3 generation, pose adherence, or correction ergonomics. | `app/public/fixtures/s2/fixture.json:4,70,106`; README demo description; `test/e2e/studio.spec.ts`. | Existing historical art is not a new forbidden API call. Label evidence by the capability it demonstrates. |
| P2 | **There is a known vacuous queue assertion in the production regression.** The current checks explicitly pass if dev hooks are absent. Broad claims about offline pause/resume should cite a test that requires the hooks or observes actual queue behavior. | `app/test/e2e/studio.spec.ts:155,160`; `app/playwright.config.ts:26–27` assigns Studio to production; `TODO.md:16–21` already records this gap. | Confirmed source/test gap; do not present it as newly discovered. |
| P2 | **Documentation contains competing current states.** README says shields “not yet” while PLAN/TODO describe a partially validated shield route; README names `CREDITS.csv` while manifest spec defines `CREDITS.txt`; docs index calls the manifest `pixeldoll/1` while the spec and code use `pixeldoll/2`; architecture's module/milestone tables still say skeleton-v3 needs rebuilding after the earlier sections describe it as implemented. | `README.md:33,96`; `docs/manifest-spec.md:14,420`; `docs/README.md:40`; `lib/store/manifest.ts:11`; `docs/architecture.md:314–318,354`. | Current doc drift. Some surrounding files have concurrent modifications. |

No P0 data-loss or security exploit was established by this review. Several P1 entries are capability gaps against the requested product goal rather than newly introduced programming bugs.

## What to preserve and reuse

- `DesignPreview.svelte` already has a move selector, all-frame direction strips, zoom and item-only/composited view. Reuse this foundation for normal generation review and the repair filmstrip. Do not build a parallel preview implementation.
- `FitDesignSheet.svelte` already separates rest-fit review from animation approval, shows costs, requires a review acknowledgment and keeps existing project cells until acceptance. That is a better repair model than “discard and restart”.
- `StoredProject`, `Layer.cells`, `rig.rest`, `ClipSource.keypoints`, `ClipSource.measured`, `StoredProject.skeletons` and `rig.anchors` give the editor much of its input data. They represent different concepts and must not be silently overwritten together.
- `saveItem` writes content-addressed blobs, then atomically updates the current record (`lib/store/project.ts:54–75`). `saveDress` preserves concurrent additions. Extend those ownership rules rather than serializing a stale full project over newer work.
- Editable export already includes `project.json`, cell blobs and optional skeleton/rig QA metadata (`lib/store/import.ts:43–44,100`; `lib/export/export.ts:14,36`). Engine exports already bake final cells and pivots. Preserve this distinction.
- Established custom CSS, native dialog handling, keyboard shortcuts and responsive layouts are useful infrastructure. The accepted Bronze visual prototype is separate from production; skeleton repair does not require a production theme migration.

## The repair workflow

1. Entry points: **Review frames** after generation, **Repair frames…** from a selected item or move, and an actionable issue badge on a particular filmstrip cell. Open the affected move/direction/cell paused, with the selected item and frozen body visible.
2. Show a filmstrip with frame numbers, timing, warning markers, mirrored badges and an explicit selected frame. Switch between **Character**, **Item only**, and **Before/After**. Allow previous/next onion skins at a low opacity without altering pixels.
3. Ask for the kind of correction through concrete tools: **Move item**, **Layer order**, **Joints**, **Erase/paint**, **Replace frame**. Explain the active tool in one sentence. Avoid forcing a casual user to classify an internal QA gate first.
4. Default scope is **this item, this direction, this source cell**. Show an always-visible scope chip. Range/whole-clip/all-direction operations are explicit choices. Distinguish a playlist entry from a unique cell: repeated entries referring to the same cell currently share its artwork. Offer “make this occurrence independent” only when needed.
5. Show the exact changed region/cells and estimated paid call coverage before a paid action. PixelLab's minimum frame batch or packed-grid request can cover more cells than selected; the apply step must still replace only the user-approved target cells. Keep neighboring cells as context when the route permits it, not as implicit replacement scope.
6. Keep **original** and **candidate** together. **Apply repair** performs one atomic revision. **Discard candidate** preserves the original. Local actions say **Free**; a generation action shows its additional estimate. No silent paid retry follows a failed repair.
7. Recompute applicable checks for affected cells and their temporal neighbors; present remaining observations separately from technical validity. Provide an explicit, scoped **Reviewed exception** for visual acceptance where allowed. Never relabel an unmeasured patch as an automated pass.

For the first release, prefer local nudge, scoped layer order and external PNG replacement plus precise joint correction. A full pixel editor can follow if a focused erase/paint workflow is insufficient. Do not implement mesh weights, arbitrary bone hierarchies, curves, constraints, physics and runtime IK just to solve a handful of generated pixel failures.

## Joint editing needs three explicit meanings

| User action | What changes | What must stay fixed by default |
|---|---|---|
| **Correct joint detection** | Editable observation over the existing frozen frame; dependent anchor/QA calculations may be recalculated. Retain the original measured points. | Body and item pixels, requested generation poses, rest references, paid provenance. |
| **Pose an item against this body** | An item-specific generation guide/override, producing a candidate layer over the same frozen body. | Frozen body, other equipment cells, shared rig sources. |
| **Change the body's pose** | A new body clip/frame revision with dependent-item compatibility assessment and explicit replacement/rebuild scope. | Original body/project revision until review and commit. |

This distinction prevents the central failure mode: a user drags a wrist expecting the displayed hand to move, but only changes metadata used by a later generation, which can then misalign with the unchanged base.

Joint controls should say **Left hand (character's left)** and **Right hand**, with subtle side colors plus text, not color alone. Allow pointer drag, click-to-select and arrow-key nudging; Shift makes a larger step. Show numeric pixel coordinates in an expandable inspector. Keep the source API coordinates normalized at serialization boundaries. Offer **Move hand** with a simple two-segment arm solve and a visible elbow-side toggle only after direct joint movement works reliably; do not claim occluded limbs have a uniquely correct estimate.

For mirrored cells, default to editing the source direction and show the dependent mirrored preview. “Edit independently” must explicitly materialize new cells and metadata instead of unexpectedly changing both sides or breaking `mirrorOf` invariants. Off-hand grip and 96 px weapon coordinates must be displayed in the same shared-pivot space as the 64 px body, not naively normalized to whichever image is currently shown.

## What skeleton editing cannot fix

- A cape's gray smudges, inconsistent texture, wrong helmet contour, missing hair detail and stray pixels are artwork/extraction defects. Moving a joint does not repaint them.
- A misdrawn or occluded grip can need a mask or new art; joint proximity is not proof that a weapon is held correctly.
- A weapon disappearing behind the body can be correct occlusion, a front/back-layer error or missing art. A joint editor cannot infer the hidden shape from a composited image.
- Mirroring a raster image reverses handedness. Relabeling joints does not restore the original weapon hand in the pixels.
- Changing a pivot moves the whole frame/layer relative to other assets; it does not repair the pose. Do not expose pivot as a general “alignment fix” without showing all layers and export consequences.
- Requested poses and measured poses can differ. Correcting a measured estimate does not establish that a requested motion was accurately rendered. Keep this uncertainty visible.

## Persistence, undo and export contract before implementation

Use content-addressed immutable originals and small persistent repair revisions, not copied RGBA arrays in each undo snapshot. A revision should identify project/base compatibility, target item/layer/move/direction/cell, previous and next image references or metadata values, operation kind, relevant input hashes, original source, timestamp and applicable QA/review status. The implementation can use a small versioned record; it does not need a general command framework.

Store the revision and cell-reference change atomically. Reject stale repair application if the target hashes changed while a job ran or another tab edited the project. Keep the candidate available for re-review, rather than overwriting another tab's work. While an AI request is running, users can work elsewhere; its completion never auto-applies a replacement.

Undo/redo must restore image references, observation/request overrides, anchors where affected and QA status together. One pointer drag is one undo step. Persist accepted revision history across reload and retain at least the original and current version; bound longer history using an explicit retention policy. Garbage collection must mark original/candidate/history hashes as live. A real API charge cannot be undone; Undo restores the prior local output, and the usage ledger remains truthful.

Do not conflate a pixel edit with a change to the whole body's identity. Item-only patches keep the base hash. Body pixel changes need a new compatibility decision: either new base identity with dependent items marked stale, or a rigorously defined per-cell compatibility system. The current “one baseHash for all cells” invariant makes a casual body replacement affect every existing item, even if the intended visual change was small. Start body edits as a duplicated revision or branch-like candidate, not an in-place global mutation.

Engine exports consume the final resolved cells, timing, z overrides and pivots. Editable exports additionally preserve repair revisions, requested-vs-observed distinctions and restore originals. `ImportedCharacter.extra` currently only lists `character`, `skeletons`, and `rigQa`; adding history in IndexedDB alone will not survive export/import. Version and validate the new editable-project fields and describe old-reader behavior. External PNG replacement must validate dimensions, alpha, exact placement and palette ownership; do not silently resize or import anti-aliased art.

## Mobile and accessibility

- Desktop: canvas + inspector + filmstrip; touch portrait: canvas with a bottom tool sheet and horizontally scrolling filmstrip. Keep scope and Apply visible. Landscape may use the existing trailing-panel pattern.
- Provide a tap-to-select joint list and stepper controls for small pixel joints. Large hit areas must not obscure adjacent points; show the selected joint's magnified loupe rather than requiring precision finger dragging.
- Separate canvas pan/zoom gestures from dragging the selected joint. Use pointer capture and handle pointer cancellation. Never commit a half-finished drag when a phone rotates or a dialog closes.
- Implement keyboard access to joint selection, x/y nudges, frame stepping, mode switching, Undo/Redo and Apply. Announce selected frame/joint/coordinates and validation messages; decorative bone lines stay out of the accessibility tree.
- Use labels/icons/patterns alongside colors for left/right, warning, original/candidate and mirrors. Respect reduced motion; repair opens paused.
- Test browser-emulated small phone, tablet and landscape. Physical-phone verification remains out of scope under PLAN D15; do not claim it from emulation.

## Evidence and documentation work required

The 8.5/10 historical UX score and pixel-identical engine tests are useful evidence for their specific builds and workflows. They cannot score a correction workflow that does not exist. Historical reports often cite old toolchains, uncommitted hot-reloading source, screenshots stored at the v0.1.0 tag and known issues later fixed. Preserve them as dated evidence; add a current capability matrix instead of editing history to imply all reports describe today's code.

Before release, demonstrate these acceptance cases with stored/offline fixtures and mocked paid calls:

1. A later-move failure can be selected from review; the highlighted cell and issue match the rendered item, direction and frame.
2. A one-frame nudge/PNG replacement changes only its declared cells; non-target hashes remain byte-identical. Shared-cell playlist occurrences are handled explicitly.
3. Correcting an observation changes no pixels and no requested pose. An item-specific guide changes no body or unrelated item metadata.
4. Apply, Undo, Redo, reload and editable ZIP round trip restore identical pixels, source points, scope, QA/review state and relevant history.
5. Mirrored directions, an independently generated direction, sparse moves, hidden/transparent cells and 96 px held layers preserve coordinates and coverage.
6. Candidate completion after another tab edits the target triggers a conflict/review, not overwrite. Storage failure leaves the original usable; candidates/history survive normal garbage collection.
7. Exported final composed frames match the Studio in each supported engine's actual verified path. Compilation-only paths retain that label.
8. A failed/unknown paid request is never resent by reload, Undo or reopening the repair sheet. Local tools generate zero network calls.
9. Keyboard-only and touch-emulated flows can select, repair, inspect scope and apply without unreachable controls or overflow.

Keep live PixelLab verification narrow and separately authorized by task need: one representative corrected-pose request and one masked-art repair, only after offline work passes. Document the observed success and failures rather than calling the editor “pixel-perfect” from a single sample.

Update current docs together: architecture's human-control goal and module state, PLAN's phased repair decision, TODO's actionable quality path, user guide's exact scope/charges/undo promises, and manifest/project round-trip fields. Change “Clean” help to “Passed automated checks; inspect the result,” distinguish reviewed exceptions, and add a short explanation of frozen body versus editable generation guides.
