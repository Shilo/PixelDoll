# Frame Editor: data and safety contract

Date: 2026-10-23. Status: planned contract; no schema or source implementation has changed. Product behavior is defined in [README.md](README.md); delivery gates are in [delivery-plan.md](delivery-plan.md).

## Current foundations, rechecked

The older audits describe a previous snapshot. Current source already provides useful safeguards:

| Source | Existing foundation | Remaining editor work |
| --- | --- | --- |
| `app/src/lib/items/run.ts`, `acceptItem`, `hasStructuralFailure` | Missing/malformed required output is guarded at acceptance. | Preserve guards for editor publication and raster replacement; do not treat visual acceptance as structural permission. |
| `app/src/studio/replaceMove.ts` | `invalidateMoveItems`, `clearMovePoseData` and `affectedMoveDirections` invalidate replacement moves and linked mirrors. | Cell-level editing must retain prior artwork for review, not simply delete changed directions. |
| `app/src/lib/store/project.ts`, `saveItem`; `db.ts`, `updateCharacter` | Blobs and references already publish atomically; a callback can check current inputs. | One multi-target draft/revision, granular read/write checks, recoverable history and change merging. |
| `app/src/lib/equipment/copy.ts`, `fit.ts` | Target/extension stamps and staged candidate publication exist. | Every editor-sensitive job must check the affected input revision before publication. |
| `app/src/lib/store/manifest.ts`, `ItemPaletteRepair` | Explicit local before/after image history and `pixeldoll/2` palette ownership exist. | General editor history must reconcile these records without misusing their narrow version/type. |
| `app/src/lib/store/import.ts`, `project.ts`, `db.ts` | Explicit image loading, editable ZIP fields and conservative GC scanning exist. | Load/export/validate/pin editor originals, drafts, observations and candidates deliberately. |

This is source inspection, not a new runtime verification. Do not turn earlier audit findings already fixed here into current release blockers.

## Address actual artwork

An edit address is **project + item/body + logical piece + clip + direction + source cell**. A bounded filmstrip index selects `clip.frames[index].cell`; an unbounded playback counter resolves through `clip.frames[counter % clip.frames.length].cell`. Neither identifies independent artwork merely by its displayed frame number. Content hashes identify immutable bytes, not edit linkage.

- Two different cell addresses with the same image hash use copy-on-write and remain independent unless an operation explicitly selects both.
- Two playlist occurrences of the same source cell share edits. An occurrence-only operation must explicitly duplicate the source cell, remap the selected occurrence and consistently extend body/item coverage. It is a later controlled operation, not an accidental effect of drawing.
- A transparent intentional cell is editable. A missing/structurally invalid cell is a different state: create/repair it explicitly and require complete selected coverage before publication.
- Ordinary animation frames and standing-reference images are distinct addresses. Editing animation frame 1 never edits `rig.rest` by implication.

## One working draft and accepted revision

Use a small versioned editor record in existing local storage, owned by a specific project and accepted baseline revision, or explicitly by a retained generation/setup candidate and its candidate revision. It contains changed target references, joint/anchor changes, before/after operation history, expected inputs and view/selection recovery state. Avoid copying the entire project and all RGBA arrays after every stroke.

Conceptual records, not executable interfaces or mandatory names:

```text
EditorDraft
  owner (project or retained candidate), projectId when available
  draftId, baselineRevision, draftVersion
  readSet: addressed cells + reference/pose/material/fitting stamps actually used
  operations: ordered pixel/translation/observation/anchor changes
  changedCells: beforeHash -> afterHash, target address, local review state
  correctedObservations, desiredPoseDrafts, attachmentChanges
  saveImpact, recoverableHistory, savedAt

AcceptedEdit
  revisionId, parentRevision, addressed before/after references
  operation summaries, body/fitting review decisions
  retained original references, observations and current QA state
```

Persist completed gestures, not every pointer event. An in-progress gesture uses a temporary preview; pointer cancel returns it to the previous state. One drag/stroke is one Undo step. Repeated keyboard nudges can coalesce while the same key is held; their extent and reversal remain visible. History spans target/frame/tool switches inside the document.

Draft autosave is independent of the accepted record. Generation/export/other screens read accepted data unless explicitly previewing this draft. Give each editing session its own draft ID; two tabs must not overwrite one global draft. Re-entry identifies the project/draft and baseline; choosing another draft never silently merges it. Undo traverses session changes; after Save, Undo creates a new dirty draft against that saved baseline rather than reversing persisted state invisibly. **Restore saved revision** likewise creates a draft from an earlier accepted state, not an unguarded overwrite of newer external work.

Minimum retained history is original source plus current accepted revision plus recoverable working draft. Bound optional deeper history by a documented policy and validate its limits. Never trim the only restore source or a blob needed by a live candidate. Local browser storage is not a guaranteed backup; editable export is portable recovery.

Saving an editor draft owned by an unaccepted candidate updates that candidate revision and returns to its original review; final character/item publication still passes the original Keep/finish flow and structural guards. Preserve raw returned art/measurement outcomes and never resend successful paid work to reopen the editor. Local copy edits preserve immutable shared-library snapshots/lineage; any reusable design update is a separate explicit operation, not a write-through to every character copy.

## Atomic Save and conflicts

1. Prepare image copies, hashes, encoded blobs, diffs, affected-cell review and QA outside the IndexedDB transaction.
2. Inside one existing `updateCharacter`-style transaction, read current project/draft, compare expected input stamps and verify target existence.
3. Merge only declared writes. Preserve unrelated outfit changes, new items and nonoverlapping accepted work. Reject any overlapping or dependency-changing write; entry-time stamps alone are insufficient.
4. Publish blobs, final cell references, body identity, observations/attachments, fitting state, current QA, accepted history and draft checkpoint together. Record a commit identity for idempotent retry of uncertain local acknowledgement.
5. Announce Saved only on transaction completion. An abort/quota/deletion conflict leaves accepted data intact and the draft available. Recovery download carries no credential or internal creation-attempt identifier.

Show concrete conflicts with Original / Your edit / Current project and choices to re-review against the current version, keep the draft, or save a copy. Do not automatically rebase a brush stroke onto a regenerated image. A save-copy path duplicates a valid project snapshot with an independent ID and truthful metadata; it does not claim the old API character registration belongs to the new source revision.

Do not rely on a UI lock, idle GC or a cross-tab notification for correctness. All publishing writers—including add-move, fit acceptance, local palette repair, imports and delayed jobs—must honor revision checks. Local change notifications contain project/revision identifiers only; keep credentials governed by the existing [shared-token contract](../../shared-token-security.md). No encryption/unlock/auth redesign belongs to this feature.

## Raster editing and palette identity

- Never mutate a shared `Img.data` or cached recoloured image. Copy, edit, hash and replace only addressed references; invalidate relevant image-object and palette caches.
- Pencil uses binary alpha and exact source values. Erase clears the selected target pixels only. Existing partial alpha, when imported, is preserved outside edited pixels; pencil does not silently antialias it.
- Default paint colours are the target's existing source palette/ramp shades, including existing fixed source colours. Preview applies current selected variants; the picker samples the selected target's source at that point, not an arbitrary topmost composite RGB.
- If several source roles render the same preview colour, select the material/region explicitly. Never guess role ownership from a displayed RGB or silently recolour other items/materials.
- Body skin/shirt/shorts identity, including the existing blue-LSB region encoding, is preserved or deliberately encoded by a region-aware write. Do not re-derive all body materials after an unrelated pixel stroke.
- Freely adding fixed/custom colours needs a qualified ownership representation: an RGB that also belongs to a recolour ramp cannot be both fixed and recolourable without extra identity. Existing source colours ship first; new fixed colours/material-role authoring is a planned power extension gated by the palette spike. Label this limit rather than silently quantizing arbitrary input or permanently excluding the extension.

Store both semantic operation information and final image references where useful, but final accepted pixels are authoritative. Do not replay a manual patch after extraction against unrelated regenerated art.

## Movement, pivots and metadata

Use a shared character coordinate space, fixed body and layer pivots and actual cell dimensions. For layer pixel-edge position `p`, character-space position is `p + rig.pivot - layer.pivot`. Reverse that conversion when editing the layer. Never use cropped thumbnails or screen zoom as source coordinates.

Raster indexes are integers `0..width-1`; reflected pixel index is `width-1-x`. Joint coordinates are continuous pixel edges; normalize at the API boundary and reflect with `width-x`. Preserve original precision; show out-of-bounds input instead of silently hiding it through serializer clamping.

Whole-item Move translates all logical pieces and any authoring masks belonging to that item together, then preserves explicit front/back decisions. Whole-body translation transforms valid corrected observations and frame-local anchors as derived data. If a referenced record cannot be safely transformed, mark it unavailable for generation pending review. Arbitrary drawing/region movement does not infer anatomy: old observations remain historical and relevant current observations are invalidated conservatively.

**Whole character · all wardrobe alternatives** Move uses one disclosed, revision-stamped target set: body plus all compatible stored equipment at selected cells, including hidden/unequipped items and every piece. Missing/stale cells are listed and cannot be silently promoted; intentional transparent cells can be valid no-op members. A newly added/changed alternative triggers membership review before publication. Any nontransparent edge loss in any listed target rejects the whole operation and identifies the item/frame; no partial group publication. Canvas and common pivot stay fixed. The uncropped gesture preview keeps pixels recoverable when dragged back. Drag renders one pending transform; expensive wardrobe-wide hashing/encoding happens after the gesture, never for every pointer move.

Group translation can preserve existing fit evidence only when the validated operation applies the same lossless delta to every participating body/item image, authored mask and relevant effective joint/anchor record. Any ambiguous/unincluded dependency remains Needs fitting review. The operation never rewrites historical generation poses/references or creates evidence that the model followed a new pose. Future generation uses an explicit effective guide/reference revision and corresponding dependency stamp.

## Body changes, fit review and coarse current formats

Body pixels are editable; saving them must not depend on purchasing a refit. Treat body identity and geometry-fitting evidence separately.

| Operation | Default consequence |
| --- | --- |
| Free corrected joint observation | New image-bound metadata revision; refresh/invalidate affected anchor/QA evidence; no raster mutation or automatic item movement. |
| Recognized exact source-role palette mapping | Preserve proven geometry relationships, refresh palette-related evidence and source/reference readiness where relevant. This exception requires proof of unchanged positions/alpha and stable role encoding. |
| General body pencil/erase/region move or body-only translation | New body revision; affected equipment cells and observed anatomy require review, even when bounding boxes or alpha happen to match. |
| Validated lossless Whole character group translation | Preserve only the proven relationships described above; retain original source/request history. |
| Edited standing-reference artwork/calibration | New reference revision for future jobs; existing accepted art retains old generation lineage. Never silently replace managed character registration. |
| Desired pose draft | Store intent only; accepted body/gear remain unchanged until explicit candidate publication. |

Review equipment against the final draft body. For each affected fitting relationship allow: manually repair the item in this draft, explicitly **Reviewed compatible** against this body revision, or leave **Needs fitting review**. Human compatibility evidence is separate from automated QA and never removes structural blockers. Preserve prior equipment pixels and original body state for comparison; do not call the current direction-deletion helper as a destructive editor-save shortcut.

Start conservatively. No general dependency graph or semantic body-segmentation engine is required: explicit changed cells, source image hashes, reference/pose/material revisions and recorded compatibility decisions suffice. An unrestricted RGB brush edit cannot claim safety solely because alpha is unchanged.

The current global `baseHash` remains an identity/guard, not a substitute for these decisions. Do not simply update every item to the new hash. An item's global compatibility can advance only once every relevant changed relationship is either proven preserved or reviewed compatible. Original stale/missing coverage never becomes current by this transition.

**Initial conservative export policy:** an item with unresolved affected cells is visibly Needs fitting review and excluded as a whole from ordinary engine export until resolved; the export review lists excluded items and allows body-only/other valid items. Its unaffected frames remain stored, editable and inspectable. Selectively exporting only safe portions of such an item is a later enhancement requiring a complete coverage/consumer contract. This avoids claiming current whole-item guards already support partial compatibility. Generation that needs uncertain metadata/fit is blocked for that target, not for all ordinary raster editing.

Users can therefore Save body work with unfinished gear without losing it or silently exporting stale art as verified. On return to ordinary Studio/gameplay preview, suppress unreviewed gear only on its affected cells and show a persistent actionable note (for example, “Sword hidden in 2 frames — review fitting”). Preserve its outfit selection and wardrobe card with Needs fitting review; unaffected cells retain their known visibility. The editor's explicit **Include unreviewed gear (WIP)** comparison can display retained pixels for repair. No unlabelled overlap is presented as a verified outfit, and no stored artwork is deleted. Export remains more conservative than this diagnostic preview: it excludes the whole unresolved item and never claims a clean full wardrobe while omitting things silently.

### Two export projections

An export containing engine files and editable recovery has two deliberately different views of the same accepted project:

- **Engine projection:** filtered `manifest.json`, final sheets, presets/equipment rules and every engine adapter include only export-eligible items. Remove/remap equipped references and variants for excluded items coherently; preserve required surviving material/link dependencies or resolve equivalent values explicitly. No dangling item/material/tuck/mask/lineage reference can reach the consumer. Before download, list excluded items and resulting outfit changes; validate the filtered projection and preview its actual output.
- **Editable project projection:** the versioned `project.json` and reachable source cells/history/observations retain the full accepted project, including unresolved gear and its compatibility state. They are not replaced by the filtered runtime manifest. Reimport restores unfinished work, not only the safe runtime subset. Unsaved draft recovery, if requested, is separately labelled.

Validate each projection against its own contract. An unresolved item excluded from a game export must never disappear from its portable backup. Tests must include an outfit wearing excluded gear and a surviving material linked to excluded ownership. Current importer preference for `project.json` is useful here; its envelope must understand the new state rather than silently discarding it.

## Joints and generation inputs

Keep separate:

1. Immutable historical requested pose and reference recorded for existing generation.
2. Original provider measurement on a specific image hash.
3. Manual observed-joint override tied to that image revision.
4. Desired-pose draft and its lineage.
5. Explicit reference calibration revision.
6. Item-specific attachment/grip track.

Metadata-only correction changes no raster hash. Translation creates derived observed data referencing the new image and prior observation; arbitrary anatomy edits invalidate it until reviewed. Joint absence must not prevent drawing/exporting valid raster cells. Rig-dependent generation stays unavailable until its required labels/coordinates/reference contract are valid.

Moving a grip marker does not move generative pixels by magic. An explicit Align-to-marker action may propose a known integer translation with before/after and scope, then save it as raster movement. Pose drafting changes pixels only through a separately requested candidate. Direct landmark edits remain available even if optional IK is added later.

All paid candidates carry exact input stamps and actual submitted/billed batch scope. Skeleton-v3's 3–15 poses cannot be presented as native single-frame redraw; replacement scope may be narrower than request scope. No background resend, paid request on drag or automatic application on completion. A local Undo restores the earlier art and retains truthful spend history.

## Mirrors, pieces and outfit masks

- A derived mirror requires an explicit source-linked edit or direction independence. Preview both source and mirror impacts; preserve character-side labels versus visual handedness.
- A source translation `(dx, dy)` produces `(-dx, dy)` in its horizontal derived mirror. The preview must show this; a same-screen-vector change in both directions requires explicit independent materialization. Resolve each source cell once rather than applying a selected source and derived view twice.
- Materializing an independent item direction must populate its complete rows/pieces before editing because a present row suppresses source fallback. Do not sever the body's direction relation for one asymmetric hat. Independent body direction edits assess dependent equipment derivation and observations together.
- Whole-item transforms preserve all pieces. A front/back pixel transfer is atomic, removes from one piece and adds to the other once, and preserves a defined union of visible pixels. Do not re-run automatic splitting over artist decisions.
- As worn / Source artwork and isolation expose clipping/tucking without changing the source. An outfit-specific mask fix does not erase shared hair or become a global slot rule. Pair-specific masks are deferred until their stored/exported semantics pass a separate spike.

## Loading, GC and archives

Teach image loading to traverse accepted history, retained original stages, working drafts and active candidates explicitly. GC's deep hash scan alone does not make those images appear in `Project.images` or exported ZIPs. Draft/reference/history publication and trimming must be atomic with blob reachability.

Plan a versioned editable-project envelope for editor state and compatibility evidence. Reserve a proposed `pixeldoll-project/2` only during the archive spike; do not change code, silently extend an envelope that older readers will discard, or bump the runtime manifest merely to store UI state. Engine files contain final accepted resolved pixels. New runtime semantics require a separately justified manifest version and all-exporter support.

Default editable export contains accepted source/history/observation state needed for safe restoration. An unsaved draft is included only as a clearly labelled recovery export; it must not be presented as an accepted engine asset. Import validates counts, dimensions, hashes, target IDs, observation bounds, history reachability and migration, without trusting arbitrary operation scripts. Unknown mandatory versions fail clearly; legacy exports remain readable under the existing policy.

Mapped PNG replacement is separate from project recovery: stable item/piece/clip/direction/cell mapping, fixed geometry, expected prior hashes, source colour/role semantics and a diff preview. Retain rig metadata and untouched cells. Do not weaken hash verification or pretend editing an engine sheet inside a recovery archive updates its canonical cells.

## Required invariants

- Local editing/Save/Undo/reopen issues no PixelLab request.
- Non-target image bytes and palette roles remain unchanged; equal hash deduplication does not expand edit scope.
- Joints never imply raster deformation; historical source/request provenance remains truthful.
- Body Save retains prior assets and explicitly accounts for affected gear, mirrors, references and observations.
- A draft, stale job, another tab or failed persistence cannot overwrite newer accepted state silently.
- No source-to-export mismatch: every exported accepted frame matches the resolved saved artwork, pivots, colours and supported occlusion rules.
- A usable raster character remains editable/exportable when rig metadata is incomplete; generation-readiness is a separate contract.
