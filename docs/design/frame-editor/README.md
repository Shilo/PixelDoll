# PixelDoll Frame Editor

Date: 2026-10-23. Status: planning and research only. No application implementation, new dependency or paid generation is part of this package. Review agreement is recorded in [consensus.md](consensus.md).

## Product decision

Design **one full-screen Frame Editor embedded in PixelDoll**, accessible from the character, an equipment item, a frame preview or a generation-review issue. It feels like a focused standalone tool, but edits the same local character project, uses the app's appearance and returns to the same outfit and preview context.

Character/body frames and equipment frames are first-class editable targets. Users can align artwork, draw or erase pixels, correct detected joints and prepare desired poses in the same session. A single working draft may contain changes to multiple targets and frames before one reviewed Save. The ordinary dress-up screen remains simple; editing is optional.

This expands the earlier equipment-only first-slice recommendation. Body editing belongs in the intended product; immutable revisions and explicit fitting consequences make it safe. Paid body reposing can arrive later without replacing this editor with another tool.

## Package and authority

- This page: product scope, screen, interactions and user-visible behavior.
- [Data and safety](data-and-safety.md): cells, palettes, joints, body fitting, publication, history and interchange.
- [Research and spikes](research-and-spikes.md): primary sources, challenged alternatives, completed source investigations and bounded future experiments.
- [Delivery plan](delivery-plan.md): implementation slices, dependencies, tests and release gates; all implementation remains unstarted.
- [Consensus](consensus.md): objections, decisions and actual reviewer agreement.

Historical [repair reviews](../../reviews/README.md) remain evidence. This package supersedes their equipment-only boundary and repair-only screen proposal for future planning; it does not retroactively change their findings or claim their mock-up is production code. Current shipped behavior remains documented in the architecture and user guide until implementation.

## One mental model

**Choose what → choose frames → use a tool → save changes.**

Three independent choices are always visible:

| Choice | Default | Meaning |
| --- | --- | --- |
| Target | Entry target, otherwise Body | Which actual artwork or guide is editable; every other part is context. |
| Frames | This frame, one direction | Which source cells the operation will affect. |
| Tool | Move | What a drag/tap/keyboard action does. |

Do not make users choose between separate alignment, pixel and skeleton editors. Tool changes preserve selection, view, working draft and Undo history. Do not make them repeat a wizard for every frame. Hide technical detail until the chosen tool needs it; keep target and scope visible even when sidebars collapse.

## Full-screen layout

Desktop schematic, not a new theme specification:

```text
Back to character   Frame Editor / Adventurer   Undo Redo   Draft saved   Save   Done
---------------------------------------------------------------------------------
Body / equipment   Move Draw Erase Joints       Walk / South / Frame 4 / This frame
                   ---------------------------------------------------------------
Body               |                                                             |
Steel sword *      |              pixel-accurate editable canvas                  |
Leather vest       |              outfit context / joint overlay                 |
Hair               |                                                             |
                   ---------------------------------------------------------------
Target properties  Original / Current    Onion skin    Grid    Zoom    Play review
                   [1] [2] [3] [4*] [5] [6] [7] [8]        Selected: 1 frame
```

Use one large canvas and a contextual properties area. Do not permanently display generation settings, a second live game, a bone tree and several inspectors together. Canvas controls and filmstrip belong to this editor, not hidden in global settings. The app's existing light/dark, typography, surfaces, focus and Lucide conventions apply; no GlassKit or separate theme system.

On portrait phones: top Back/Save/Done, visible target-and-frame strip, large canvas, compact tool row, filmstrip and one expandable properties sheet. Keep target, selected scope and save state accessible without opening the sheet. On shallow landscape, use a side properties panel. Panels must not cover the edited pixels; retain pan/zoom rather than shrinking the entire desktop screen.

## Enter, work, save and return

1. **Enter:** “Edit frames…” on a character/item; “Edit this frame” on a paused preview; or an issue link opens the same screen with target/move/direction/cell preselected. Pause animation and game movement. Preserve return screen, outfit, facing, clip, presentation and invoking focus.
2. **Work:** edits update the working copy immediately. Target/frame changes stay in one session. Show changed-cell markers and concise tool help. Local drawing/dragging never calls PixelLab.
3. **Autosave draft:** persist the working draft locally after completed operations. “Draft saved” means recovery is available, not that changes are published. Other previews, exports and generation use the last explicitly saved project.
4. **Save:** validate and publish one local revision. Simple item pixel changes save directly with a concise result. If body changes affect fitting, reference data changes or a conflict exists, show a focused impact review before publication. Do not interrupt every stroke with a dialog.
5. **Done:** return immediately when the draft matches the saved revision. With unpublished changes, offer **Save and return**, **Keep draft and return**, or **Discard unsaved changes**. Browser Back follows the same rule. Escape first cancels a live gesture or closes the topmost temporary surface; it must not discard work or cascade out of the app.
6. **Recover:** reopening restores or offers the local draft and shows any changed underlying inputs before applying it. Storage failure says “Draft not saved” and leaves accepted work intact; never falsely show success.

Save is local to the browser. Export remains the deliberate portable backup action. A recovery download may be offered when local storage fails; it must contain editor data rather than credentials. Undo cannot refund a paid generation.

Entry from an unaccepted generation/setup result uses this same editor with a visible **Editing candidate** owner. Save updates the retained candidate only; it cannot publish it into the accepted character or bypass the originating Keep/finish flow and its structural guards. Return restores that review. Incomplete estimates may be corrected locally without resending the successful art request; missing required artwork still needs explicit structural repair. This is ownership context, not another editor.

## Targets, context and selection

The target list shows **Body** and actual project equipment items with thumbnails, selection and visibility. The whole composite is context; it is not a flattened paint target. Equipped parts are first in the list; users can select an unequipped item and preview it without changing the saved outfit. Read-only fixture art must be copied into an editable local character through the existing copy flow before changes can be saved.

Select one artwork target for Draw/Erase/Joints. All other targets remain protected. A target's linked foreground/background pieces appear as one item by default; expand **Parts** only when explicitly editing overlap. Canvas picking is optional and explicit: Pick target selects only, never also starts a stroke or moves another item under the pointer.

Editing a fitted/shared equipment copy changes that character's local item only. Preserve immutable source-design snapshots and lineage; updating the reusable library requires a separate explicit save-as-new-design action. Never propagate pixel corrections to other characters or the library silently.

**Whole character · all wardrobe alternatives** is a deliberate Move target for alignment, comprising Body plus every compatible stored item at the selected source cells, including unequipped/hidden alternatives. Show its membership/count. It must not mean “only what happens to be visible.” Ineligible or missing cells remain labelled; stale assets are never silently promoted. This operation is distinct from moving Body alone and never changes the shared export pivot.

## Tools

### Move

- Drag/nudge the selected target's actual pixels in whole source-pixel increments. Display X/Y displacement, axis constraint, arrow steppers and numeric entry. The pivot/cell geometry stays fixed.
- **Item:** move the item's visible pieces together, preserving explicit front/back authoring. Other targets and body stay in place.
- **Body:** move body artwork only. Display fitting consequences in the draft; do not move gear to make the difference disappear. Coherently translate applicable manually observed joints/anchors as derived data, with before/after retained; never rewrite historical API target poses.
- **Whole character:** explicitly apply the same integer translation to the chosen cells of the body and eligible equipment. It is not camera movement, pivot editing or a new pose. Only a validated lossless group operation can preserve fitting automatically.
- Show canvas-edge loss before Save; allow cancel/reset. The first release rejects an operation that would discard nontransparent pixels rather than silently cropping or resizing cells.
- A minimal rectangular pixel selection can move a bounded region on one target. Moving a body region changes anatomy/geometry and therefore requires fitting review; it is not labelled as skeletal deformation.

Pan/Zoom are navigation, available as labelled controls and gestures. Their state never appears as a saved pixel edit. Do not expose arbitrary rotation, scaling or pivot resizing as an alignment shortcut.

### Draw and Erase

- Crisp source-pixel editing on Body or one item; start with 1 px pencil/eraser, source palette swatches, eyedropper and a simple rectangular selection. No opacity, anti-aliasing, gradients or generic effects in the core release.
- Drawing occurs on one active frame. A multiframe filmstrip selection does not stamp a stroke onto different poses. Use an explicit **Repeat edit on selected frames…** preview only for supported deliberate batch operations; defer general paint propagation.
- The canvas shows the currently recoloured outfit, while paint stores a known source-ramp shade/material role. Fixed-colour detail is an explicit later capability, not a silent nearest-colour guess or material reassignment.
- Erase changes alpha only on the target. **Restore** is an Erase-tool option that recovers pixels from a named available stage: saved original or preserved pre-cleanup extraction. Do not promise pixels that were never retained or invent hidden geometry.
- Where an item already has front/back pieces, an explicit overlap option transfers selected pixels between those pieces, with composite preview. It does not change slot-wide stacking or flatten another target into this one. Outfit-specific hair/hat clipping remains separate from the shared hair artwork.

### Joints

The same canvas gets an overlay and a named joint inspector. Choose **Detected joints** or **Pose draft** explicitly. The label remains visible; changing purpose does not replace the other data.

- **Detected joints:** annotate an existing body image. Dragging corrects metadata; pixels stay unchanged. Preserve original estimates. Missing estimates can be filled manually, including imported/generated art that cannot yet complete setup. Incomplete rig data must not block ordinary pixel editing.
- **Pose draft:** edit desired joints for future candidate generation. Existing accepted pixels remain visible as reference. A stick-figure preview must never imply the raster is deforming. Saving a pose draft does not apply it to body art or call PixelLab.
- **Reference calibration:** an advanced, explicitly selected standing-reference target uses the same Joints tool. It changes future generation calibration and is reviewed independently of animation-frame observations; no silent reference replacement when editing frame 1.
- **Item attachment/grip:** edit a visible item-specific marker under Move properties. Show the body's joints as read-only context, with an explicit “Edit body joints” action that visibly changes target. Do not silently modify global joints while an item is selected.
- Present friendly names and character-left/right. Keep all 18 provider labels internally; collapse eye/ear detail by default. Include named selection for overlapping/occluded points, numeric coordinates, one-source-pixel arrow nudges and subpixel precision without snapping anatomical estimates to integer pixels.
- Optional later two-bone IK is a Pose-draft assist with pinned parent, explicit bend side and reach feedback. Direct placement remains available for foreshortened/stylized bodies. No hidden stretching or full constraint graph.

## Frames and scope

One clip and direction are primary at a time. Show thumbnail filmstrip, source-cell number, playback occurrence, duration and issue/changed/review badges as relevant. Editing opens paused. Play review displays the working draft at original timing; while it plays, mutation gestures are disabled and controls offer Pause to edit. Neighbor ghosts reference effective draft cells and are visual only.

Scope starts at **This frame**. Range selection applies only to supported operations and lists affected cells before a batch. No default all-directions operation. Equal content hashes do not establish shared edit intent: copy-on-write changes only addressed cells. Repeated playback entries pointing at the same logical cell are different; disclose “Used in N timeline positions.” Changing only one occurrence requires explicit duplication/remapping, not timing changes made by an unrelated stroke.

Derived mirrors show a link badge. Offer **Edit source and linked view** with both previews, or **Make this view independent** before editing. No handedness claim follows from relabelling joints. All scope and coordinate rules are detailed in [data-and-safety.md](data-and-safety.md).

## Body edits and fitting

Body is editable in the core tool. A colour/detail change, alpha/contour change, body translation, region move and desired-pose change have different effects. Derive impact from the actual before/after differences and dependency records; never infer safe fitting solely from an unchanged bounding box.

Save review lists affected body cells and equipment coverage, shows existing gear over the draft, and lets the user preserve it as **Needs fitting review**, manually repair affected gear in the same session, or explicitly exclude unresolved items from a later export. No automatic paid refit or wardrobe-wide redraw. Body and selected item repairs can publish together when the final reviewed state is consistent.

Do not delete old equipment to achieve consistency: retain it as a reviewable previous revision. A body edit can be saved even if some equipment still needs finishing; exports/generation must respect its state rather than pretending it is verified current. Ordinary preview suppresses unreviewed gear on affected cells and shows an actionable fitting note while retaining its outfit selection; an explicit editor WIP comparison displays it for repair. Unaffected cells retain known visibility and remain stored/editable. Initially, ordinary engine export excludes an entire unresolved item with a visible explanation; fine-grained partial-item export is a later enhancement. Editable recovery archives retain the full accepted project, including unfinished gear. Full compatibility rules and the two export projections are specified separately.

## Power without a general art application

The core tool includes body/items, single-frame pixels, safe alignment, joint metadata, selection, frame context, local recovery and portable saved revisions. Add advanced controls only when they serve those tasks. Defer arbitrary new layer trees, canvas/rig-topology authoring, effects, mesh weights, runtime IK/skeleton exports, automatic animation interpolation and native Aseprite document parsing.

AI assistance is an explicit optional inspector action in this same screen, with separate request and replacement scope, cost and candidate comparison. It must not become a second editor or a prerequisite for local work.

## Accessibility and appearance

Use the host app's current appearance contract; the editor uses a quiet opaque workspace behind exact unlit sprite pixels even when entered from an immersive world. No world motion or reflections under a pixel-inspection task. Restore previous presentation on exit.

All tools and targets have labels, keyboard access and visible focus. Arrow keys nudge the selected artwork/joint only while the editor canvas has focus; text inputs and native controls keep their behavior. Ctrl/Cmd+Z operates editor-session history, not outfit Undo. Ctrl/Cmd+S saves the editor draft as a project revision; frame/tool shortcuts do not leak into game movement. Space pans only during an active editor gesture, with Play available by a labelled control.

Touch supports tap selection plus steppers/numeric input as alternatives to precision drag, a loupe for pixel placement, explicit pan mode and nonoverlapping effective joint targets. Pointer cancellation restores a pending gesture; no partial accidental stroke is committed. Test reduced motion, contrast, zoom, 320 px portrait and shallow landscape using emulation; no physical-phone testing is claimed or required.

## What counts as done

A casual user can enter from a specific defect, identify target and scope, move an item, repair a body pixel, erase a stray item pixel, correct a joint, save, reopen and export the intended result without changing unrelated frames or paying unexpectedly. They understand whether a joint edit changes pixels. Body changes never silently invalidate the wardrobe, and local work survives delayed jobs, Undo, storage errors and editable ZIP round trips.

The plan is complete only when the participants have reviewed the same specification and resolved substantive objections. The tool is implemented only after the separate delivery and evidence gates pass; neither reviewer agreement nor an attractive mock-up certifies it.
