# Peer review: one embedded PixelDoll frame editor

Date: 2026-10-23. Author: Evaluate pixel editing scope peer. Status: proposal for agreement; planning only.

## Position and revised recommendation

**I support one dedicated editor screen inside PixelDoll for both character and equipment frames, including pixel drawing/erasing, alignment/nudging and joint editing.** My earlier equipment-only recommendation was a conservative delivery boundary, not a claim that body editing is inherently outside the product. The user's expanded requirement replaces that boundary. Body editing belongs in the agreed design; its dependency and publication controls must be delivered with it.

One screen should edit the selected character's animation assets. The same document, canvas, frame navigation, target selection, history and save transaction serve every tool. A full-screen editing environment does not imply a general illustration suite or a runtime skeletal animation engine.

Read for this review: [frame control recommendation](../../reviews/2026-10-23-frame-repair-recommendation.md), [my earlier project review](../../research/project-repair-workflow-review-2026-10-23.md), and the current relevant source. Those older reports remain dated evidence, not proof that all listed defects remain open. Current `acceptItem()` has structural/coverage guards, `saveItem()` atomically publishes blobs and references, and body-move replacement now calls `invalidateMoveItems()` with revision checks. Reuse these improvements rather than describing the old acceptance and replacement defects as current findings. No tests, generations, dependencies, credentials or source changes were needed for this peer proposal.

## The single mental model

**Choose what to edit, choose the frame, make a reversible change, review its effects, save and return.**

The primary object is a character document containing a body, fitted equipment and moves. Tools act on the selected target and actual source cell. They do not create separate pixel, skeleton and alignment documents.

Recommended screen:

- **Header:** character name, current target, move/direction/frame, unsaved/draft state, Undo/Redo, Back and Save & return.
- **Main canvas:** nearest-neighbour pixels, shared pivot, optional joint/anchor overlays, optional grid/onion skins; a 1× check alongside magnification.
- **Targets:** Character body and equipment items; visibility, lock and solo are preview controls. Selecting an item selects its logical visible artwork, with existing front/back pieces accessible under it.
- **Filmstrip:** all frames in the selected direction/move; warning markers, derived-mirror badge, standing-reference entry where relevant, and optional all-direction comparison.
- **Small tool set:** Move, Pencil, Eraser, Restore, Pick colour, Joints. Inspector options depend on target/tool. Existing front/back transfer can be a layer action rather than another primary mode.

The editor opens from a character, item, paused frame or issue. It restores the exact originating character/outfit/move/direction/frame on return. An empty layer click must not silently select the body. Context layers remain visible but locked until explicitly selected/unlocked.

The default scope reads, for example, **Helmet · Walk · East · cell 3**. A visible range/whole-direction choice changes scope deliberately. Do not use a wizard that requires selecting an internal QA failure category before editing. Guided hints can explain an issue in this same workspace; a second independent guided editor would fragment navigation, history and implementation.

## Movement and alignment must have explicit meanings

An unqualified “align” or “move character” action hides several different operations:

| User operation | Exact meaning | Required consequence |
| --- | --- | --- |
| Pan/zoom canvas | Change the viewport | No asset, pivot, joint or hash changes. |
| Move selected equipment | Translate that item's selected cells relative to the fixed body/pivot | Bake integer pixel changes; move all its existing fg/bg pieces together by default; review edge loss and attachment effects. |
| Move body in this frame | Translate body pixels relative to the fixed character pivot | Create a body revision; inspect affected equipment/observations/anchors. Do not silently move the entire wardrobe. |
| Move body and selected equipment together | Explicit multi-target translation of listed current-frame assets | One undoable operation; preview transformed observations/anchors and all target cells; do not infer hidden pixels. |
| Adjust an attachment/grip marker | Correct an item placement reference | Metadata-only until an explicit raster placement action uses it. Never imply that a marker automatically binds a generatively drawn sword. |
| Change common origin/canvas geometry | Alter the document's frame/pivot contract | Separate advanced operation, deferred initially. It affects exports, references and all layers; it is not a one-frame nudge. |

Use the character pivot as the common editing coordinate space. For layer pixel `p`, character-space position is `p + rig.pivot - layer.pivot`. Convert through the actual layer size/pivot, not a cropped thumbnail. Preserve geometry for initial editing; show edge loss before a nudge is applied and allow cancel. No automatic recentering or silhouette-bottom ground alignment.

When known whole-body translation is applied, the user may include current observed joints/anchors in that same geometric operation. Describe and preview this coupling. Never rewrite the historical requested-pose provenance to claim the translated image came from a different request. Arbitrary paint cannot reliably infer new joints; keep old observations as superseded evidence and require review/correction when geometry changes.

Editing just the body in a frame and carrying the entire outfit are both useful. They must be explicit commands, not invisible side effects based on which canvas region was grabbed.

## Joints: one tool, clearly different records

The inspector for Joints needs **Detected joints** and **Pose for generation** as plainly labelled choices. A small purpose selector is necessary here because their effects differ; it does not justify separate screens.

| Record | What it describes | Editing behavior |
| --- | --- | --- |
| Original requested pose | Coordinates submitted to obtain an existing generated result | Historical, inspectable and immutable. |
| Provider observation | Estimated landmarks on a particular image hash | Original measurement remains available. |
| Corrected detected joints | Human-reviewed landmarks on that image revision | Free local metadata edits; change no raster pixels. Rescue incomplete estimates without resending successful art jobs. |
| Desired pose draft | A requested arrangement for a possible future generation | Free local editing; raster changes only after an explicit priced generation, comparison and reviewed save. |
| Standing/reference calibration | Landmarks describing the actual reference image | Explicit reference context; never fill it with the desired output pose. |

Use character-side labels (“Right hand — character's right”), a named joint list for overlapping side-view handles, pointer/keyboard/numeric placement, and continuous coordinates. Paint/nudges are integer-pixel operations; joints are not necessarily integer positions. Joint x/y use pixel-edge coordinates and reflection `width - x`; pixel indexes use `width - 1 - x`.

Direct joint placement is a sufficient first capability. Two-bone IK, bend-side controls and pose copying are optional later conveniences, not prerequisites for the unified editor. Full mesh/weight authoring, constraint graphs and runtime skeleton exports remain outside this plan.

Changing detected joints must not silently alter `ClipSource.keypoints` used by equipment generation. A user who intends to change generated motion chooses Pose for generation and sees the dependency/cost consequences. Correcting a point and redrawing the underlying anatomy must never look like the same operation.

## Body editing: supported, with revision-aware consequences

Body pencil/eraser/nudge belong in the planned initial editor capability, subject to the same immutable and atomic saving foundation as equipment edits. They are not hidden behind a permanent “body locked” policy. Locking is a deliberate selection safeguard, not a rejection of the user's requirement.

For a body candidate, compare old/new RGBA, alpha silhouette, frame geometry and associated observations. Present affected cells and equipment. A conservative first policy may mark affected equipment **Needs fit review**, preserving prior pixels and allowing explicit reviewed reuse where justified. It must not require paid regeneration for every small RGB correction, nor silently certify old layers as refitted by changing `baseHash`.

Suggested save behavior:

1. Preserve current accepted body, items, references and history while edits are a candidate.
2. Determine affected animation cells and mirror dependencies. Keep unchanged equipment cells intact.
3. Store body revision, derived base identity, observation/anchor status and affected equipment coverage/review state together. Never mix a new body identity with unlabeled old-geometry gear.
4. Allow the user to save useful raster artwork even if pose-dependent generation is unavailable pending joint review. Separate “can export/play these pixels” from “safe to pose new gear against this revision.” Structural raster validity is still mandatory.
5. Keep original requested pose/reference/provenance inspectable. Rest/reference artwork edits create a new reference revision and affect future jobs; an animation-frame edit does not silently replace the standing reference.

A selected body frame can be repaired without rewriting every clip or every historical provenance entry. Avoid a large global dependency graph until needed: explicit per-target expected hashes and a conservative affected-cell/reference invalidation policy are a viable starting point. Specify that policy completely rather than using “recompute base hash” as compatibility logic.

Pose regeneration is a later advanced capability **within this same editor**. Its request, candidate and publication contracts must be planned now, but its quality must be established by dedicated spikes. Minimum-three skeleton-v3 padding does not establish reliable one-frame redrawing or temporal continuity. Actual submitted/billed batch and user-approved replacement cells must be distinct; generation completion never auto-applies new body art.

## Save, undo and safe return

Recommend **recoverable draft autosave plus explicit Save & return**. This fits a substantial editing screen without silently publishing each brush stroke to the dressing view. The wording must distinguish draft recovery from accepted character changes.

- One stroke, drag, nudge sequence or explicit multi-cell operation is one undo command. Undo applies across tool switches within this document, including pixels and metadata. Separate “revert saved revision” from undoing the latest gesture.
- Back with changes offers Save & return / Discard edits / Continue editing. A clean Back returns immediately. Discard does not destroy the last accepted character or unrelated work.
- A no-op save creates no raster revision or network request. Failed persistence leaves the draft recoverable; the screen cannot announce Saved before the IndexedDB transaction completes.
- Commit immutable new images with fresh hashes. Never mutate shared `Img.data`. Include body/equipment/reference state, QA/review status and history references in one checked publication transaction.
- Compare expected revisions inside the transaction against the latest persisted record. Preserve unrelated dressing changes; reject overlapping edits without losing the candidate. Other tabs and late generation jobs are writers too.
- An entry stamp alone is insufficient for a long editing session. A stale publication must offer concrete conflicting targets, reload/rebase or save a copy; no silent last-writer-wins. Do not make pixel editing depend on broadcasting credentials or change the agreed shared-key contract.
- Make current editor drafts, original/current revisions and retained history reachable to garbage collection, loading and editable ZIP export/import. Current `loadProject()` visits explicit image families and `projectEntries()` exports loaded images; merely adding hash strings to a record is insufficient for full recovery.
- Bound optional deep history and explain retention, but retain the original and latest accepted versions. Full unbounded undo persistence is not required for the first version.

The other planning chat owns the final persistence UX choice. If it prefers one Save action plus a separate Back, that is acceptable provided accepted versus draft state and unsaved exit behavior are unambiguous. Avoid both mandatory Apply-then-Save-then-Return and silent final autosave mixed with a misleading Save button.

## Pixels, palettes, occlusion and mirrors

### Paint source artwork while previewing recolours

Keep the existing exact-ramp model. Pick a material shade or source colour while viewing the current outfit's recolour. A source/preview toggle and material indicator prevent the user from painting a preview RGB that later recolours incorrectly. The picker must identify the selected target's source colour; sampling an overlying cape cannot silently become a body material.

Free custom RGB is reasonable for a capable editor, but new colours need an explicit destination: existing/new material role or fixed detail. A safe minimal implementation may offer existing source colours first and custom fixed colours with a clear label, without rebuilding every palette or changing unrelated variants. Do not claim every arbitrary RGB can unambiguously map back into a ramp when two selected variants share the same colour.

Body skin/shirt/shorts regions currently use special colour identity. The editor must preserve or deliberately update that identity instead of blindly deriving a new palette after a stroke. Existing palette repair metadata is not automatically a general manual-edit history format.

### Layer control without a general scene graph

A logical item can contain existing front/back pieces. Move item affects both by default; selecting a piece is explicit. Pixel-transfer between fg/bg should be atomic and reversible, never copy-and-delete in two separate saves. Layer visibility/solo/lock are editor view state unless a deliberate outfit-rule action is chosen.

The current fg/bg split is based on body alpha and cannot reconstruct hidden geometry. Editing a visible part's front/back ownership does not prove a physically complete item. Moving it behind the body may hide pixels without recovering the missing parts.

Hair/hat clipping is outfit-dependent. Allow the user to inspect/disable the preview heuristic and plan a pair-specific override if supported; never permanently erase shared hair to fit one hat. Current slot ordering changes affect alternatives in that slot: selected-item/frame ordering needs explicit scoped storage and export support, or use existing raster-piece transfers initially. No blend modes, effect stacks, arbitrary group graphs or general layer creation is necessary for the core requirement.

### Mirrored views and shared cells

Resolve actual cells with `animation.frames[ui.frame % animation.frames.length].cell`; a repeated playback entry shares artwork. Expose that sharing rather than silently editing only one apparent occurrence.

For a derived mirror, show **Edit source and mirror** versus **Make this view independent** before mutation. Materialize the whole affected direction rows/pieces consistently, not one sparse cell that prevents source fallback elsewhere. Body mirrors additionally affect observed joints, body identity and equipment fit review. Partial item independence can retain the body's derivation relationship; do not sever the whole character's direction relation just to fix one asymmetric hat.

Never paste a manual correction into other poses or directions automatically. Explicit range scope and previews can support batch nudges; repeated detail changes still require selected target sets.

## Powerful controls versus a general art suite

In scope: body/equipment pixel repair, local raster movement, joint correction/rescue and desired-pose drafts, filmstrip, layer-piece inspection, preview context, immutable revisions, save/return, compatible export and future explicit pose candidates.

Not required: arbitrary canvas resizing, pivot restructuring, vector drawing, sophisticated brush engines, shapes/gradients, effects/blend modes, arbitrary file-format editing, mesh/weight rigging, runtime bone systems, curve editors, physics or automatic all-pose propagation. Mature tools such as [Aseprite](https://www.aseprite.org/docs/animation/) and [PixelLab's Pixelorama editor](https://www.pixellab.ai/docs/ways-to-use-pixellab) remain suitable for extensive finishing. [Game Character Hub](https://www.gamecharacterhub.com/portfolio-edition-features/) is direct prior art for combining character assembly with frame/layer pixel correction. These sources were researched in the earlier review; no new hands-on comparison is claimed here.

The product boundary is the paperdoll document and safe generation workflow, not the editor's screen size or number of pixels visible. A separate full editor screen is compatible with a small, understandable toolset.

## Objections and agreement conditions

I would challenge a consolidated plan if it:

1. Calls body editing a future non-goal again, rather than including it with revision/invalidation safeguards.
2. Treats a joint drag as raster deformation, or overwrites original requested poses when correcting a detection.
3. Uses generic “alignment” without defining viewport movement, item translation, body translation and global pivot changes.
4. Publishes a new body while old affected gear appears automatically refitted, or blocks every colour-only repair on a paid rebuild.
5. Implements separate pixel and skeleton documents/history or multiple independent repair editors.
6. Promises safe autosave/undo without image immutability, transaction-time revision checks and reload/ZIP/GC history reachability.
7. Claims guaranteed one-frame paid repair from structural API batching support alone.
8. Expands into a full art suite before the documented defect cases are usable in one workspace.

I agree in principle when the unified plan includes one screen/session/history for body and equipment; explicit targets/scopes; distinct detected versus desired joints; original/candidate/accepted states; deterministic local tools; safe body dependency handling; immutable transaction-checked save and return; and staged, explicitly priced regeneration without implementation in this planning task.

## Decisions the consolidated plan must settle

These are concrete design choices for the planning team, not permission questions or reasons to stop this peer work:

| Decision | My preferred choice | Acceptable alternative |
| --- | --- | --- |
| Publishing local edits | Recoverable draft autosave; Save & return publishes once | Explicit Save plus Back, with equally clear draft/accepted distinction |
| Default Move target | Selected logical body/item, fixed pivot; explicit multi-target selection | A clearly labelled contextual “Move body + equipped items” command |
| Body edit effect on gear | Changed cells receive fit review/invalidation; explicit reviewed reuse; no forced paid work | Finer per-cell geometry compatibility proof with equivalent honesty |
| Free custom colours | Source ramps first; custom colour with material/fixed-detail destination | Limit first delivery to source palette if disclosed as a tool limitation, not claimed arbitrary colour authoring |
| Rest-image editing | Explicit standing-reference target in same frame selector, revision-sensitive | A contextual reference subpanel within the same editor session |
| Conflict result | Keep candidate; list overlapping targets; reload/rebase or save copy | Simpler reject-and-preserve-draft flow initially |
| First pose interaction | Direct joint placement, detection correction and desired-pose draft | Optional IK after direct placement works |

## Spikes and validation before implementation claims

No live spike is authorized or performed by this peer review. Plan these bounded investigations:

- **Offline publication spike:** body/item pixel plus detected-joint edit, save, reload, ZIP, GC, stale-tab conflict and delayed candidate. Assert all non-target hashes and original provenance remain unchanged.
- **Coordinate/mirror spike:** actual-cell versus playback index, pixel-edge joints, 64/96 and larger source geometry, item-specific mirror independence, full-row materialization and edge-loss prevention. Never normalize origins using silhouette-bottom guesses.
- **Body compatibility spike:** paint RGB only, erase alpha, nudge pixels, move body plus selected gear, edit a standing reference. Demonstrate exact equipment review/coverage and generation-eligibility consequences for each; do not infer anatomical correctness from hash equality.
- **Palette/occlusion spike:** body region identities, recoloured shade picking, equal preview colours from different ramps, fg/bg transfer and hair/hat pair handling. Verify rendered preview/export parity using the current compositor.
- **UX prototype:** one desktop/phone editor for body and gear; user identifies the target/frame, distinguishes detection from desired pose, understands move scope, undoes one gesture, saves and returns to the same outfit context. Browser-emulated touch only; no physical-phone testing.
- **Later paid generation spike, separately authorized:** selected-frame pose candidates using permitted v3 routes, real batch/cost disclosure, neighboring-frame continuity, identity and selective merge. No promise of production single-frame quality before results. Keep any failed candidate and successful original calls recoverable without automatic resubmission.

Success is a comprehensible correction loop that protects good work. If users must repaint most cells, narrow or improve the generation pipeline; a large editor is not evidence that paperdoll generation is reliable.

## Verification of this peer artifact

Planning document only. No code, dependencies, tests, API requests, credentials, canonical plans or commits changed by this peer. Existing dirty work was preserved. The coordinating chat owns consolidation, agreement round, staging and planning-only commit.

## Canonical README challenge round

Reviewed the first [canonical proposal](README.md) on 2026-10-23 after the coordinator's follow-up. **I agree with its single-screen mental model, body editing in the core capability, one draft across targets, explicit Save distinct from recovery autosave, joint-purpose separation, fixed pivot/canvas and staged generation.** Its Save/Done behavior is an acceptable alternative to my preferred Save & return arrangement; it does not require an extra Apply step. This is agreement on the README, pending the complete data/safety, delivery and research package, not a final package sign-off.

### Whole character alignment: accept the expanded target

I accept the coordinator's proposal: **Whole character moves Body plus all compatible stored equipment at the selected cells, including unequipped and hidden alternatives.** This deliberately supersedes my earlier suggestion of body plus only selected/equipped gear as the default group. Moving only the visible outfit would leave wardrobe alternatives misaligned while the command name suggests a character-wide correction.

Keep Body-only and Item moves available and clearly separate. Whole character is a special explicit group target, not an automatic consequence of dragging body art. Its membership/count, no crop, no pivot change and no stale/missing promotion conditions are essential.

The final safety contract must settle these details:

1. **Membership is frozen against revisions.** Show the affected body plus compatible current equipment cells and excluded reasons before applying. Accepted, pending, stale, historical, read-only, missing and intentionally transparent cells are different states. An intentional transparent cell can be a legitimate no-op member; an absent requested cell cannot gain coverage. A late-added item must trigger a membership conflict/review, not silently join or remain apparently aligned.
2. **No silent partial group success.** If any included body's/item's pixels would leave their own cell, reject that candidate as stated in the README. Name the blocking item/cell, including an unequipped hat or oversize sword, and offer reduced displacement or switching to a narrower target. Do not silently skip the blocker and still call the result Whole character.
3. **Transforms preserve coordinate meaning.** Apply the same character-space integer translation through each layer's real cell/pivot coordinates and to all owned fg/bg pieces. Translate applicable current observations/anchors/attachment markers coherently; retain original requested-pose provenance. Missing joint observations remain missing. Do not pretend the operation calibrated a standing reference that was outside the selected scope.
4. **Source mirrors need an explicit vector rule.** Translating an authored source by `(dx, dy)` and deriving its horizontal mirror moves that mirrored result by `(-dx, dy)` in screen coordinates. This differs from moving both displayed views by `(dx, dy)`. The linked-view preview must show this consequence; same-screen-vector movement of both directions requires deliberate independent materialization or another clearly specified representation. Resolve each logical source target once; never double-transform it through a source and its derived view.
5. **Fit preservation needs a bounded proof.** Lossless identical group translation can preserve existing local body/item overlap when every relevant current dependency is transformed consistently. It does not establish a universal physical ground origin, improve anatomy, recover hidden pixels, or make stale artwork current. Preserve only already-supported compatibility for the selected cells. Check rendered before/after against the known translation, including fg/bg/tuck behavior; do not rely on bounding boxes or matching hash relabelling.
6. **Avoid expensive work on pointer movement.** Large wardrobes can include many layers per cell. Dragging should preview one pending transform, then evaluate/hash/encode once per completed operation or save, not rewrite every item for every pointer event. This is a performance constraint, not a new rendering framework requirement. The candidate remains all-or-nothing across its actual listed members.

### Other concrete clarifications for the complete package

- **Keep draft and return:** name the character/draft on re-entry; normal Studio/export/generation must continue using the accepted project. Multiple drafts/tabs need explicit ownership/revision handling, not a single global draft record that overwrites another session. No new credential-bearing messages are needed.
- **Body edits with pending fit review:** the README correctly permits saving the body. Specify whether an unresolved item is hidden in normal playback/export, previewed only with a badge, or exportable after an explicit reviewed exception. Never silently output old affected cells as compatible. The user must be able to return without being forced into a paid refit.
- **Existing source colours:** source-palette limitation is acceptable for the core tools. Permit picking existing raw target colours such as outlines even when they are not assigned a recolourable material; preserving an existing exact fixed shade is different from introducing arbitrary new RGB. If restricted, disclose the limitation before a user tries to restore an outline.
- **Reference targets:** clearly distinguish animation body cells from standing-reference images. If editing references is supported in the core screen, the same save review must identify future generation eligibility and whether server-side registration needs a later explicit action. An already saved animation-frame edit must not silently update the managed character remotely.
- **Historical findings:** research/delivery should identify acceptance guards, atomic item publication and body-move invalidation as current reuse seams. Earlier reports should stay linked as historical motivation, rather than being copied as an unchanged bug list.
- **Undo after Save:** decide whether undoing a saved operation creates a new dirty draft against the saved revision, rather than rolling back persisted state invisibly. This is the least surprising behavior for the explicit-save model.

No README-level objection remains if these details are resolved consistently in the companion specification. I will review the complete package for an explicit final agree/challenge round as requested.

## Data-and-safety challenge round

Reviewed [data-and-safety.md](data-and-safety.md) with the README on 2026-10-23. **I agree with the proposed storage/publication model and explicitly accept the conservative whole-item engine-export exclusion policy.** Saving a body revision with unfinished equipment is supported; it does not force a paid refit and does not certify old gear. Unaffected cells remain stored and available for inspection/editing. Finer partial-item runtime compatibility can be deferred.

The contract resolves major earlier objections: source colours include existing fixed outlines, B15 identity is explicit, detected/desired/reference data stay distinct, atomic saves check current data, all writers must participate, editor image reachability extends beyond GC scanning, and old safeguards are acknowledged as current foundations. Restricting newly introduced fixed RGB to a later qualified ownership extension is an acceptable core limitation; it must remain visible to users rather than implying unrestricted colour authoring.

### Concrete agreement blockers to resolve in the complete package

1. **Align the README's export wording with the agreed coarse policy.** Its Body edits section currently offers “exclude affected cells from a later export,” while data-and-safety excludes the whole unresolved item initially. Use whole-item exclusion for first release everywhere; reserve partial-cell export explicitly for the later consumer/coverage enhancement. The unchanged cells may remain available in the editor without implying that they are separately exported in this first policy.
2. **Define the two export projections.** Ordinary engine `manifest.json`, sheets, presets, equipment/outfit rules and importer/runtime metadata must have a coherent filtered item set, with no dangling equipped-item/material/variant references. Disclose removed items and any resulting outfit changes before downloading. The accompanying editable `project.json` recovery content must retain unresolved gear, its original pixels, history and compatibility status; it must not become the filtered engine projection. An item excluded from runtime must not disappear from its portable backup. Validate each projection against its own contract.
3. **Guard Whole character membership against phantom additions.** Comparing read/write stamps for already-listed cells does not detect a compatible item added while a draft is open. Include the disclosed membership set/predicate in transaction-time checking, or conservatively a wardrobe-membership revision. If membership changed, preserve the draft and require a fresh group review; do not silently include or omit new compatible alternatives. Body-only and single-item operations can still preserve unrelated new items under their explicitly narrower scope.
4. **Specify mirror translation algebra rather than only “preview both.”** A source-linked horizontal translation `(dx,dy)` yields `(-dx,dy)` on its reflected view. Same-screen-vector movement of both directions is a different operation requiring independence or another explicit representation. State how group target resolution handles this once per unique logical source and prevents double transformation. This affects both body and all participating wardrobe alternatives.
5. **Define the return-to-Studio behavior for Needs fitting review.** Engine exclusion is clear; ordinary dressing playback is not yet equally explicit. Choose a predictable policy for unresolved gear: for example, do not automatically wear it on affected body cells, keep its card/outfit selection recoverable, show an actionable review badge, and allow an explicitly labelled editor/WIP comparison. If another policy is chosen, it must not silently show unresolved overlap as the normal verified outfit. State how a saved outfit referencing an excluded item is displayed and exported.

These are specification-completeness blockers to **final package agreement**, not objections to implementing body editing or reasons to reopen the general scope decision. They can be resolved through documentation; no code experiment or paid work is needed for this round.

### Nonblocking precision and delivery checks

- Explicitly say Undo after Save creates a new dirty draft from the current accepted baseline; it does not retroactively rewrite accepted storage before another Save.
- Distinguish session/draft ownership and version checks from project baseline lineage. Two editor tabs must not overwrite the same draft just because accepted project cells are unchanged. A `{projectId,draftId,draftVersion}` check is a straightforward option, without adding a general collaboration protocol.
- If `clip.frames[index].cell` is fed by the unbounded UI playback counter, map through modulo first. A bounded filmstrip index and a source-cell address remain different.
- Keep lossless group-fit preservation explicitly limited to included, current and transformed dependencies. When out-of-bounds joints/anchors cannot be transformed under the coordinate contract, show the generation-readiness consequence even if all opaque pixels remain contained.
- Expected-input checks should include relevant palette-role/variant ownership revisions. A disjoint outfit selection may be mergeable while a changed material definition used by a stroke is a real conflict.

Pending the above clarifications and the final research/delivery review, I approve the data contract's direction, including body saves, conservative export, immutable revisions, source palette ownership and local-only joint edits. I have not yet given unconditional final package sign-off.

## Final package agreement — AGREE

Date: 2026-10-23. Reviewed the complete canonical package: [product and UX](README.md), [data and safety](data-and-safety.md), [research and spikes](research-and-spikes.md), and [delivery plan](delivery-plan.md).

**AGREE. No concrete planning blocker remains from this peer.** This final record supersedes the conditional agreement and outstanding-blocker status in the preceding challenge rounds; those earlier entries remain the discussion history.

The five material objections are resolved in the shared specification:

| Earlier objection | Agreed resolution now present |
| --- | --- |
| Partial-cell versus whole-item first export | README, safety policy and delivery gates consistently exclude the entire unresolved item from initial ordinary engine export; safe partial-item export remains a qualified later enhancement. |
| Runtime filtering could lose unfinished work or leave broken references | Two projections: filtered, validated engine assets/rules/presets without dangling references, and full accepted editable recovery retaining unresolved gear, observations and history. Exclusions and outfit changes are disclosed before download. |
| Group membership can change after a draft starts | Whole character uses disclosed, revision-stamped all-compatible-wardrobe membership; new/changed alternatives require review and can prevent publication. Group clipping is all-or-nothing. |
| Source/mirror displacement was ambiguous | Source `(dx,dy)` implies mirror `(-dx,dy)`; same-screen-vector movement requires explicit independence. Unique logical source resolution prevents double application. |
| Returning with unfinished gear lacked a normal-display rule | Studio suppresses unreviewed gear on affected cells, retains its outfit selection/card and gives a persistent actionable note. The editor provides explicitly labelled WIP comparison; unaffected cells remain available. |

The package also incorporates the required precision: modulo playback-to-cell mapping, independent session draft IDs, Undo after Save producing a new dirty draft, existing fixed outline colours, B15 role-aware writes and relevant material/reference/pose stamps. Body editing is included in the first coherent local editor release rather than permanently deferred. Detected-joint corrections, reference calibration and desired-pose drafts remain distinct; local actions never imply raster deformation or a paid call.

The research document distinguishes primary-source behavior from design inferences and identifies completed read-only investigations separately from unrun experiments. Its proposed small user trial is explicitly an acceptance proposal, not observed usability or statistical evidence. S1–S5 and E0–E4 gate the local editor; optional power/external interchange and paid-candidate work extend the same editor only after their own evidence. Current structural guards, atomic item publication and replacement invalidation are treated as foundations to preserve.

The resulting product is one embedded screen, one paperdoll document, one recoverable draft/history and an explicit reviewed Save/return path for both body and equipment. Whole-character alignment covers all compatible wardrobe alternatives; body-only and item-local moves retain precise scope. General illustration features, arbitrary rig topology and runtime mesh/skeleton authoring are not necessary to satisfy this agreement.

This is final **planning agreement**, not implementation approval, live PixelLab quality validation or proof of casual-user intuitiveness. No implementation, dependency changes, API calls, credential access, tests or commit were performed by this peer review. The coordinator may record this agreement and commit the scoped planning package; implementation/spike checkboxes must remain unstarted until their evidence exists.

### Final ownership addendum — AGREE

Reviewed the final ownership additions in README, data-and-safety and delivery-plan on 2026-10-23. **AGREE; no new blocker.** An unaccepted result is visibly candidate-owned, editor Save changes only its retained candidate revision, and return restores the original review. Keep/finish remains the publication boundary with structural guards; reopening or locally correcting joints does not resend successful paid art. Editing a fitted/shared copy affects only that character's local item, preserving immutable library snapshots and lineage; reusable changes require an explicit save-as-new-design operation. The corresponding delivery task and acceptance case cover both boundaries. These clarify ownership within the agreed single editor and do not expand implementation authorization. Final planning agreement remains in force.
