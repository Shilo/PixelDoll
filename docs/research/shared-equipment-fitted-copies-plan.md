# Shared equipment designs and character-fitted copies

Status: implementation underway under subsequent explicit user authorization. The original research and proposed qualification matrix below remain historical context. Exact copying, portable designs and reviewed fitting are implemented; the paid route is an experimental single-material headwear trial, not qualification of every item class. See the [implementation and verification report](../testing/shared-equipment-2026-10-22.md).
Date: 2026-10-22.  
Scope: a device-local design library shared across PixelDoll characters, portable design archives, and independently editable fitted copies on each target character. The app remains client-only.

## 1. Product decision

An equipment **design** is its approved visual identity and source evidence. A **fitted copy** is the actual frozen equipment raster, palette materials, pose references and coverage made for one character. Saving a design does not make its pixels fit another body.

Use one familiar flow:

1. An accepted item offers **Save as shared design**. Preview exactly the item and colourway being saved.
2. **New item** offers **Create** and **Saved designs**. Users do not need to visit a separate technical library manager.
3. A saved design is **Ready**, **Needs fitting**, **Needs setup**, or **Not supported yet** for the current character, with a short reason.
4. Ready equipment previews and copies locally for **0 generations**. Other equipment offers **Fit to this character**, with the cost and review stages shown before spending.
5. The accepted result becomes an ordinary target-local wardrobe item. Wearing, recolouring, outfits, undo, exports and later moves continue to use that item.

The library is local to this browser origin. “Shared” means available to the user's other local characters; it does not imply a server, public gallery, account sync, or universal sprite compatibility. A versioned design ZIP is the explicit sharing mechanism.

Do not silently update target items when a source design changes, is removed from the library, or its source character is deleted.

## 2. Evidence and its limits

Evidence labels used below:

- **Fact — code:** observed in the current repository.
- **Fact — API:** the official live documentation verified in the coordinating agent's Codex browser on 2026-10-22, cross-checked with the committed OpenAPI snapshot; this is not a new generation result.
- **Measured:** existing saved live experiments, scoped to their actual inputs.
- **Decision:** the proposed product/architecture contract.
- **Experiment:** a hypothesis that must pass a separately authorized, bounded experiment before it becomes a production route.

| Evidence | Finding | Consequence |
|---|---|---|
| Code: `app/src/lib/rig/rig.ts`, `baseHashOf` | `baseHash` hashes a flattened ordered list of base-cell hashes. It does not hash pivot, rest images, skeletons, camera/template, slot semantics or playback. | Matching `baseHash` alone is insufficient for compatibility; changing it alone does not prove that old clips need repainting. |
| Code: `app/src/lib/store/manifest.ts`, `items/run.ts` | Accepted items contain local layer cells, `baseHash`, optional dressed chroma views and per-cell QA/provenance. | Extend this model with design lineage; retain local fitted pixels and references. |
| Code: `app/src/studio/itemRoute.ts` | Coverage includes real per-animation direction availability through `clipDirs`. | Fit only actual body cells; preserve sparse clips and do not invent missing views. |
| Code: `app/src/lib/rig/setup.ts` | Imported frozen art can receive measured joint data without replacing its original frames. Setup has explicit costs and restrictions. | Setup is a separate preflight action where needed, not a hidden fit charge. |
| Measured: [S3](../spikes/S3_skeleton_rigging.md), [S4](../spikes/S4_model_routing.md) | Target-owned rest references and stored skeleton sequences can produce aligned item clips, with extraction and QA still necessary. | Reuse the target's actual rig contract; never send source-body artwork with target-body joints. |
| Measured: [S1](../spikes/S1_api_feasibility.md), [PixelLab Pip review](tools/pixellab_pip/pixellab_pip_paperdolling_review.md) | Unmasked outfit/edit routes redraw body pixels. Early transfer results were composites, not equipment layers. | Reference transfer is a candidate fitting operation, never a finished layer or a body-preservation guarantee. |
| Measured: [shield validation](../testing/shields-2026-10-22.md), [quality follow-up](../testing/item-quality-follow-up-2026-10-22.md) | Occlusion can explain some size/shape flags; real grip/shape defects remain. Hidden geometry cannot be verified from the visible composite. | Keep occlusion warnings and hard failures distinct. Never complete hidden shields/capes by copying a larger visible mask. |
| Code: `dress/dress.ts`, `export/generic.ts` | Recolour works per item, but material derivation and validation currently require globally disjoint RGB ramps. | Independent recolouring needs the ownership prerequisite in section 8. Copying material IDs is unsafe. |
| Code: `store/db.ts`, `store/project.ts` | The `projects` object store already holds namespaced project/draft records; garbage collection scans project/job references. | Add typed design/fit records without a database-version bump, while auditing all readers and lifecycle guards. |

The coordinating agent completed live official-documentation verification in the Codex browser on 2026-10-22; those findings are incorporated below. The document author also inspected the committed schema and current implementation. No credentials, paid tests or capability requests were used for this research. Live Pro Flash preset shapes were not queried; they remain a supported-target preflight requirement.

## 3. Official API contracts and fitting options

Primary sources: [official API documentation](https://api.pixellab.ai/v2/docs), [official OpenAPI](https://api.pixellab.ai/v2/openapi.json), and the repository's [OpenAPI snapshot](pixellab/pixellab-openapi-v2.json). The snapshot was taken on 2026-10-20 and the endpoint contracts below were checked against live official docs on 2026-10-22; schemas/prices can still drift before implementation.

| Candidate | Verified documentation contract | Appropriate role | Limitation / required experiment |
|---|---|---|---|
| [`POST /transfer-outfit-v2`](https://api.pixellab.ai/v2/docs#tag/animate/POST/transfer-outfit-v2) | `reference_image`, `frames`, `image_size`; at least 2 target frames; `additional_instructions`, optional palette; actual size-specific target caps 15 / 8 / 3 at <=64 / <=80 / >80 px. The separate reference consumes one grid slot. | Candidate for fitting an approved source item onto target chroma **rest views**, followed by review and the normal target pose pipeline. | Transfers appearance broadly; no explicit isolated-item mask. It may copy source anatomy, clothes, skin, view or key colours. Source chroma improves isolation but is not a segmentation guarantee. |
| [`POST /edit-animation-v2`](https://api.pixellab.ai/v2/docs#tag/animate/POST/edit-animation-v2) | Text-guided edit; no separate `reference_image`; caps 16 / 9 / 4 at the same tiers; at least 2 input frames. | Existing dressing/anchor animation route; candidate retained-reference grid cell for design conditioning. | A prompt alone does not preserve a particular saved design. A source cell mixed into the grid is an experiment, not equivalent to a typed reference parameter. |
| [`POST /inpaint-v3`](https://api.pixellab.ai/v2/docs#tag/inpaint/POST/inpaint-v3) | 32–512 px inpainting image plus same-size mask; white edits, black preserves. Typed `context_image` and `bounding_box` fields are deprecated despite prose still advertising them. | Candidate packed target rest cells with masked item regions and approved source reference cells kept black in the same image. | Prefer the typed contract; do not assume a current reference-context guarantee. Packed-grid identity transfer and sizes/costs must be qualified. Do not rely on deprecated context fields. |
| [`POST /edit-images-v2`](https://api.pixellab.ai/v2/docs#tag/edit/POST/edit-images-v2), reference method | `edit_with_reference`; inputs <=512 px, output 32–512 px; reference-mode caps 15 at <=64, 8 at <=80, 3 at <=128, 1 above 128 px. Documented reference behavior is style matching. | Comparison candidate only if simpler candidates fail. | Style matching does not guarantee saved-item identity. Existing S4 evidence showed geometry shift; structure-preservation prose is insufficient. |
| [`POST /edit-image-pro-flash`](https://api.pixellab.ai/v2/docs#tag/edit/POST/edit-image-pro-flash), reference method | `method` is `text` or `reference`; fixed source canvas, no resize, reference must fit it. [`GET /pro-flash/capabilities`](https://api.pixellab.ai/v2/docs#tag/create-image/GET/pro-flash/capabilities) is authenticated and exposes a generic-object response schema. | Optional comparison candidate for target rest fitting. | Exact live native preset shapes were not queried. Existing whole-image colour redraw, per-direction coherence and cost need qualification. Not the default quality route. |
| [`POST /animate-with-skeleton-v3`](https://api.pixellab.ai/v2/docs#tag/skeleton-animation/POST/animate-with-skeleton-v3) | Beta; actual first-frame pose in `first_frame_keypoints`; 18 joints; 3–15 output frames, <=256 px. Documented generation costs: 2 / 3 / 4 for 3 / 8 / 15 frames, independent of canvas size. | Pose an approved **target-fitted** chroma rest reference through target-owned clips. | This redraws the reference internally. Correct joints, scale and camera remain mandatory; no source-to-target body retargeting guarantee. |
| [`POST /estimate-skeleton`](https://api.pixellab.ai/v2/docs#tag/skeleton-animation/POST/estimate-skeleton) | Paid measurement; allowed square sizes include 64. The actual endpoint is POST; skeleton-v3 prose mentioning GET is a documentation typo. | Explicit missing-rig setup/measurement where supported. | Measurement adds metadata, not proof that regenerated equipment matches arbitrary imported frozen body frames. Never adopt the GET typo or call a measurement during free browsing. |

The transfer request's generic 2–16-frame text does not override its more specific 15 / 8 / 3 size limits. Live documentation verification establishes available fields and limits; it does not establish output fidelity or a successful cross-body fit.

The older architecture's rejection/supersession of transfer as the full item pipeline is evidence against blindly reviving it. It is not a reason to skip a controlled experiment for the narrower, newly required target-rest fitting operation. Pro is used only for editing existing art. Character creation, legacy template modes and legacy animation routes are outside this feature.

### Route selection decision

Qualify one route per item class and supported target profile, then expose one **Fit to this character** action. Do not expose endpoint names as a casual user's decision.

Do not ship a transfer -> inpaint -> Pro Flash automatic paid cascade. A failed fit pauses. A separately approved retry shows the next charge and retains the previous candidate. The existing item runner's automatic rerolls, key switches and grid fallback cannot be inherited implicitly by this new flow.

The production capability table starts empty for cross-body fitting. A class becomes available only after its reference-fitting and downstream animation matrix passes. Exact compatible copying can ship without claiming cross-body fitting is proven. A final full-feature release must pass every item class it advertises; unsupported cases have honest disabled states.

Implementation must audit both `runItem` and `poseItemClip` in `lib/items/run.ts`: the former retries/switches keys/grids, and the latter also retries, may call a grid fallback and writes accepted items through `mergeClip`. Calling either unchanged would bypass fitting's manual-spend and atomic-review policy. Extract/reuse the pure extraction/QA/batching helpers, or add a narrow explicit manual-candidate policy with regressions preserving legacy behavior outside this feature. Do not build a second general queue framework.

## 4. What is reusable, exactly?

### 4.1 Ready, zero-generation copies

Compare source fitted evidence against the target's resolved frozen base, not against project names or an animation named `walk`.

All of the following must hold for each reused cell:

1. Equal body RGBA pixels and dimensions after resolving real mirrored cells. Compare original stored bodies, before non-destructive display recolours.
2. An unambiguous mapping to the target's direction and stored frame/pose cell. A same-named clip does not establish a match. Different names can match exact canonical signatures; ambiguous duplicate poses require explicit mapping/preview or conservative refusal.
3. Compatible rig cell and integer pivot; equal layer cell/pivot geometry, foreground/background meaning, slot class, anatomical grip contract, camera/template and relevant occlusion semantics. Different re-estimated joint floats alone do not make an already identical frozen raster need repainting. Unknown anatomy/slot semantics require a free preview/manual acceptance or an unsupported state, not an automatic paid fit.
4. The same visual design revision and pinned colourway, with a valid target-local material mapping. A different colourway can reuse raw pixels with an exact local palette swap; it does not require AI merely to change colours.
5. Source evidence is accepted and complete for those cells. Missing/failed cells are not reusable simply because another cell matches.
6. Target slot bindings can preserve the item's body-relative layering. Do not copy source project-wide z overrides, outfit hides, or baked helmet/hair variants into unrelated target settings.

V1 copying does not warp, resize, stretch, rotate, infer missing geometry, or translate pixels to approximate another silhouette. Metadata-only rebinding to target item/material IDs and exact palette variants is allowed. Identical original pixels on another project ID require no generation.

Target playback durations, repeated frame holds, animation-list order, preset names and source project IDs are target-owned/audit metadata; they do not independently force repainting. Stored frame mapping must still be exact. Keep two signatures:

- `cellCompatibility`: content-derived source/target body, pose, direction, geometry and slot/grip semantics. Supports unambiguous per-cell/clip reuse.
- `fitAudit`: a complete frozen request/review snapshot, including playback, target identity and plan version. Supports stale-plan detection and reproducibility, not blanket pixel invalidation.

`baseHash` remains the current project's item-acceptance contract. It is neither of these new proofs by itself. A copied item receives the target's current `baseHash` only after compatibility has been established, its target cell map constructed, and target-side offline QA/review completed. Preserve source scores as provenance; do not label them fresh target QA.

Keep **existing-raster compatibility** separate from **future-reference compatibility**. The rules above can permit free copies for existing exact body cells even when the target has newly measured joints or a different stored standing reference. Reusing a dressed source reference to generate new poses additionally requires matching target rest pixels, rest/keypoint geometry, chroma key and layer padding. Otherwise the existing copy remains usable, while extending it needs a reviewed target rest fit or setup. User wording is **Ready for current moves** and **Setup needed before new moves**, not internal compatibility jargon.

### 4.2 Partial reuse and added moves

If a target has new moves or directions, keep verified existing cells. Generate only the missing or changed target cells. Continue from that target copy's saved dressed references when compatible; do not refit its rest design on every added move.

The plan shows which coverage is free, which needs generation and which is unavailable. Default to all currently supported target moves/directions, with a clear advanced coverage choice if needed. Empty body directions stay empty. An intentionally partial fit is labelled with its exact coverage; it is never labelled ready for all moves.

Changes to target body pixels, proportions, view, pivot, grip policy or rest poses invalidate the affected cells/references. Do not replace the target body to make equipment fit. Changing outfit colours or unrelated equipment does not invalidate the body's fitted pixels.

### 4.3 Needs fitting / needs setup

Same skeleton topology, cell size, seed or template is insufficient. A 48 px and 56 px body, stocky and slender bodies, or different head/hand locations need newly fitted target art unless the exact compatibility proof succeeds.

Use the existing rig-readiness and setup restrictions. A missing-joint target offers a separately priced **Set up character** action. A reference-guided direct-frame edit route may support unrigged imported art only after that route/profile passes its own matrix; current text-only editing success does not qualify saved-design identity transfer. Never fabricate joints or silently repaint imported original frames.

## 5. Canonical reference and snapshot contract

Saving a design captures only the accepted item, not the current entire outfit. Prefer real approved source dressed chroma rest views plus isolated foreground/background layers for each evidenced direction. Retain their source body/pose/geometry, palette, slot, grip, hides/clips intent and provenance.

- Store visible-source direction coverage explicitly. A front view does not define an unseen back, and mirrored references are identified as mirrors.
- Existing isolated extracted layers may be pre-occluded by the source body. They do not contain verified complete hidden cape/shield geometry. Keep reference provenance and occlusion limitations.
- Do not turn an engine-only `<hair>~<helmet>` tuck variant into a canonical hair design. Recover the editable original where available; otherwise explain that the imported reference is partial.
- An item missing dressed references may still be saved with isolated visible references and an exact source-fit snapshot. Its eligibility for cross-body fitting depends on the qualified route; do not invent original references or require a paid regeneration merely to save it.
- Save preview defaults to the current visible item-only colourway. Pin raw source fit plus the explicit selected variants. Generate fitting references by applying colour changes to item pixels only, with chroma body/key unchanged.
- Retain a minimal immutable source fit: relevant rig, source base cells, accepted item's cells/QA/materials and required reference images. Do not retain unrelated items, outfit names, connection state or tokens.

Art-changing edits produce a new immutable revision. Name/description organization may change separately without silently changing accepted artwork. Existing fitted copies stay pinned to their selected revision and colourway. A new revision is offered deliberately, not pushed into outfits.

## 6. Fitting flow, price and review

### 6.1 Free preflight

Before a paid request: validate library assets, target frozen hashes, camera/template support, actual clip-direction coverage, rest pose completeness, slot/grip compatibility, source reference coverage, key collision, oversize padding, output caps and available reusable cells. Build a persisted immutable plan from real inputs.

Show:

- Design and current target side by side; the current outfit can be toggled off for inspection.
- Free reused coverage and the requested new coverage.
- Source missing views and target unsupported views.
- Cost for **Preview fit**, then the separate remaining animation cost, estimated retries only if explicitly included, and total maximum authorized spend.
- A plain note that fitting sends the shown target/reference artwork to PixelLab using the user's connection. Device copying is entirely local.

No endpoint is called merely by opening a saved design. No source character regeneration is part of fitting.

### 6.2 Paid rest preview

Run only the qualified reference-fitting route for the chosen class/profile. Use source design references and **target** chroma rest bodies on the correct canvas. Extract candidate item layers, run free checks, and show every requested target direction before animation.

The user sees the original design, target composite, isolated layer and a checker/solid background. Permit synchronized direction switching and a larger pixel preview. Show known source-view gaps. The user can accept the proposed interpretation, retry at an explicit new cost, change scope, or discard.

Rest approval is independent from accepting a final wardrobe item. No target item/outfit is overwritten during this preview.

### 6.3 Animate the approved target fit

After a separate explicit action with the remaining cost, pose approved target rest references through target-owned sequences. Existing long-clip batching and short-clip handling must remain correct. Use per-clip actual directions; preserve frame order, target playlist and coverage.

Evaluate the complete target-specific output and interactions. Review all moves, directions and flagged frames, not only the first animation currently shown by `GenCard`. Allow comparison with the approved rest fit and source design.

**Keep and wear** publishes a new accepted local item and optionally equips it, as one guarded commit. **Keep in wardrobe** is available without changing the current outfit. A failed/rejected replacement preserves the previous accepted copy and its outfit references.

### 6.4 Cost accounting

Use actual endpoint caps and a persisted cumulative spend budget. Include reference slots, anchors, padding, short-clip padding, long-clip batches, missing joints and independently generated mirror views. Count chargeable attempts, not only successful outputs. Price wording is estimated until confirmed by usage.

Illustrations from existing measured 64/96 px routes, not a quote for an untested fitting route:

- A four-direction rig with three generated rest views, idle + walk, and six 8-or-fewer-frame pose jobs had 10 design + 18 pose = 28 planned generations for a non-oversize item. Cross-body fitting must separately establish its own rest-stage price.
- At 96 px, outfit transfer holds only **three target frames plus its separate reference**. Five target rest views require at least two transfer calls. Plain edit holds four inputs, and a later kept anchor consumes one of them. Neither case is a single-call five-view fit.
- Skeleton-v3 live-documented costs are 2 for 3 frames, 3 for 8, 4 for 15, independent of canvas size. Sum real batches; do not multiply by an assumed fixed clip charge.
- Exact compatible reuse and local recolour cost zero. An added move charges only its new target coverage. Setup is shown and authorized independently.

The verified documentation does not establish a generic accurate price estimator for every candidate. Do not treat a Pro Flash cost endpoint as a quote for Pro transfer/inpaint. Larger packed inpaint grids require verified size/cost evidence before showing a fixed price.

## 7. Quality and qualification

### 7.1 Checks on every fit

Preserve current extraction/QA and add cross-design checks without weakening existing hard failures:

- Original target base blobs and RGBA hashes unchanged throughout; no base layer replacement.
- Correct cell count/order/directions and sparse coverage; integer geometry and shared pivot.
- Target key/body fidelity, registration, stray pixels, border clipping and palette contamination.
- All visible reference directions retain intentional distinguishing features and palette roles. Palette distance alone is not design identity.
- Correct head/waist/foot placement and anatomical grip. Same-sized masks are not proof of a correctly fitted item.
- Foreground/background and target-body occlusion; cape/hair extent; interaction with target headgear, hair and simultaneous held items.
- Existing D1/H4/G5/G8/G9 checks and relevant per-class checks remain active. Occlusion-explained evidence is review-only; unseen shapes are not marked verified.
- Aggregate summaries are recomputed from selected per-clip outputs. Do not reuse the known historical aggregate-QA limitation when adding new fitting coverage.
- A palette-role mapping that cannot preserve independent recolouring blocks ready/accepted status until corrected, rather than silently omitting colours.

Machine gates are necessary, not sufficient. Mandatory human design/rest review confirms source identity and any newly inferred direction; final animation review confirms the local fitted copy. Hard failures do not become clean passes through threshold relaxation.

### 7.2 Bounded research matrix before enabling cross-body fitting

No paid matrix is run as part of this planning task. Implementation begins with existing stored evidence/offline tests. A later paid spike needs explicit total and per-stage limits, already-created target/source assets, durable job records and no source/body generation.

Candidate A is source-reference transfer onto target chroma rest views. Candidate B is a masked packed inpaint grid with kept source views; a retained-reference edit grid is optional only if it adds evidence. Start with a small discriminating head/held pair; stop a route on clear body/key contamination. Expand successful candidates rather than running every endpoint indiscriminately.

| Axis | Minimum evidence before claiming support |
|---|---|
| Class | Head/face; body-hugging torso/legs/feet; hair; back/cape; held blade; round shield. Treat flexible/held subcases separately where behavior differs. |
| Body | Different source/target widths and proportions; 48 vs 56 px within 64 cells; altered head and hand positions; source-to-target identity must remain recognizable. |
| View | All requested front, side, back, diagonal views; supported low/high/side camera changes only with evidence. Unqualified camera/template changes stay unsupported. |
| Motion | Rest; walk/idle; overhead action; hurt/death or other substantial occlusion. Include short, long, sparse and repeated-pose clips. |
| Grip/mirroring | Main/off hand, simultaneous sword + shield, mirrored baseline and independently generated western equipment. Do not call a flipped anatomical grip preserved. |
| Geometry | 64 worn layers; 96 held layers with correct pivot and full uncropped preview/export. |
| Colour | Colourful cape with deliberate trim, green item/key collision, target body and equipment sharing exact RGBs, multiple material roles, chosen source colourway. |
| Incomplete source | Missing rear reference and pre-occluded source item; explicitly show inferred/unknown views and require review. |

Record frozen requests, selected outputs, all spend, QA, contact sheets and per-class decision in a research report. A claim such as “works for armour” requires the target rest and animation gates for that class/profile, not one attractive frame. If no candidate qualifies, report that limitation and do not ship a prompt-only substitute labelled as the saved design.

## 8. Independent recolour prerequisite

### Problem

`deriveMaterials` currently excludes RGBs claimed by other target items, while `recolour` already resolves materials by `owner`. A shared helmet and a target sword may intentionally use the same grey; the current global rule can omit one item's colours. Source IDs, ramp lengths and inferred labels are not portable semantic mappings.

### Proposed concrete change

Adopt item-scoped material ownership: RGB ramps are disjoint **within one owner**, and different items may use equal RGB values independently. Material IDs remain unique within the project. A colour appearing in multiple roles of one item still needs a genuine region/index mask or a deliberate shared role; do not pretend a flat RGB image can distinguish identical pixels semantically.

Because `pixeldoll/1` explicitly specifies globally disjoint ramps, introduce `pixeldoll/2` for this semantic change, rather than silently weakening the old invariant. This is a manifest version change, not an IndexedDB version change.

Implementation tasks:

1. `store/manifest.ts`: accept v1/v2 manifests; define v2 ownership and design-lineage fields. A small shared supported-format predicate replaces scattered string checks.
2. `dress/dress.ts`: derive each item's roles using only that owner's existing claims; preserve exact raw pixels. Keep palette swapping owner-local. Explicitly map design-role IDs to target material IDs; never copy source `linkTo` IDs across projects.
3. `export/generic.ts`: v1 validation remains globally disjoint; v2 validates `(owner, RGB)` uniqueness, owner/item references, unique material IDs, exact variant lengths and non-dangling links. Missing/ambiguous role mappings are actionable review errors.
4. `store/project.ts`, `store/import.ts`, `dress/project.ts`, `compose/fixture.ts`, `ui/M2.svelte`, creation/import constructors and fixture scripts: recognize both formats. V1 -> v2 migration copies existing raw images, ramps, variants and presets unchanged; it never repaints old art or guesses missing source roles. Do not destructively rewrite archival ZIPs.
5. `export/godot.ts`, `phaser.ts`, `unity.ts`, `aseprite.ts`, `sheets.ts` and generic output/readmes: audit all palette consumers and hardcoded format metadata. Any consumer doing a project-wide RGB lookup must become owner-local or receive baked, explicitly scoped data. Do not claim engine runtime recolour if it is not implemented there.
6. Update `docs/manifest-spec.md` and import/export tests before v2 output ships. Historical v1 fixtures/archives stay readable. New archives carry the explicit v2 contract; old external readers are told the format version changed.

A source design's semantic palette roles and saved colourway are distinct from fitted-copy material IDs. Refit can change quantization and ramp lengths; map exact resulting roles deliberately, with a visible correction step if ambiguous. Do not silently snap body colours, alter outlines, or reuse source array indices on a different ramp.

Required regressions: body/helmet/sword sharing the exact same grey can recolour one item without changing any other pixel; two roles within one owner cannot claim the same RGB without a supported mask; source/target ramps of different lengths cannot silently mis-map; source-linked beard/hair roles never create a dangling or unintended body link; archive + engine/baked output preserve the selected colourway exactly.

## 9. Storage and type boundaries

Use the current `projects` key-value store with typed accessors and discriminated records. Library/draft IDs never start with `rig-`. No new database object store is required merely for record kinds.

Illustrative schema; implementation should use existing `Rig`, `Item`, `Material`, `Sha256` and image-reference types rather than duplicating them:

```ts
interface EquipmentDesignRecord {
  kind: 'equipment-design';
  format: 'pixeldoll-design/1';
  id: string;                   // equipment-design:<uuid>
  name: string;
  createdAt: string;
  updatedAt: string;            // display metadata only
  revisions: DesignRevision[];  // immutable art revisions
}

interface DesignRevision {
  id: string;                   // immutable content/revision identifier
  slot: string;
  description: string;
  appearance: {
    sourceItem: Item;
    materials: Material[];
    variants: Record<string, string>;
    roles: { id: string; label: string; sourceMaterialIds: string[] }[];
  };
  references: DesignView[];      // hashes + direction + pose + geometry + evidence type
  sourceFit: SourceFitSnapshot;  // source rig/base/item only; full blob references
  gripPolicy: 'match-character-mirrors' | 'preserve-anatomical-hand';
  attribution: Attribution[];
}

interface FittedCopyLineage {
  designId: string;
  revisionId: string;
  colourway: Record<string, string>;
  snapshot: DesignSnapshot;      // enough canonical assets to restore/share independently
  roleMaterials: Record<string, string[]>;
  compatibility: FitCompatibility;
  coverage: FitCoverage;
}

interface EquipmentFitDraft {
  kind: 'equipment-fit-draft';
  format: 'pixeldoll-fit/1';
  id: string;                   // equipment-fit:<uuid>
  targetProjectId: string;
  design: DesignSnapshot;
  targetAudit: TargetFitAudit;
  plan: FrozenFitPlan;
  state: FitState;
  stageApprovals: StageApproval[];
  calls: FitCallState[];         // queue IDs, seeds, selected rolls, produced cells
  budget: SpendBudget;           // reserved + actual, not reset by reload/retry
  candidate?: FittedItemSnapshot;
}
```

`DesignView` records whether it is a dressed chroma composite, isolated layer, original body/reference, or derived colourway; direction and mirroring origin; cell/pivot; source pose hash; blob hashes and visible/occluded coverage. There is no implicit “complete item” flag on a pre-occluded layer.

Target fitted Items keep the existing layers/materials/QA/provenance and add `design` lineage. Target presets continue to reference local item IDs. A library entry is not a live pointer that the compositor must dereference.

Keep one complete approved source-fit snapshot per revision. Other accepted target copies remain normal project items; query their pinned lineage and compatibility signatures to discover reuse. Do not add a second global cache duplicating every fitted project asset.

### Lifetime and atomicity

- Design save/import encodes and validates all blobs before an atomic record + blob transaction. Fit acceptance atomically adds images/materials/item/lineage and optionally the current outfit, with a final target-audit check.
- Extend `putCharacter`/`updateCharacter` or a narrowly scoped transaction helper to handle record publication. Never publish a candidate item before its cells exist.
- Snapshot/draft records keep literal blob hashes reachable by garbage collection. Do not retain only an external source-project ID or a job ID that cleanup can remove.
- Deleting a source character is safe because the library and in-flight fits own source snapshots. Deleting a library entry removes it from the picker; accepted target copies and active pinned drafts survive independently.
- A fit targeting a character participates in that target's deletion/resume guard. Unrelated idle designs do not block character deletion. Active paid jobs are handled consistently with existing queue safety.
- Dropping a draft or design releases only its references; shared blobs are removed by conservative garbage collection, not direct bulk deletion.
- Audit every `db.all('projects')` reader, draft loader, project listing, developer M2 source list, `deleteCharacter`, `cleanUp`, startup prune and leader takeover. Add fitting job tags to protected flow/reference accounting.

## 10. Job lifecycle, failures and concurrent changes

Fit states: `preflight -> awaiting-preview-approval -> fitting-rest -> reviewing-rest -> awaiting-pose-approval -> posing -> reviewing-fit -> accepted`, with `paused`, `needs-attention`, `discarded` and `cancelled` as explicit states.

Exact reuse can go from preflight to reviewing-fit and acceptance without a queue job. Persist every state transition before a chargeable action. Save call IDs, input hashes, route version, seeds, outputs and selected roll references. Resume completed work without requesting a new design or charging again.

- The current leader lock and request-hash ledger remain the submission authority. Followers may browse and perform safe local copies, but never independently drive the same paid fitting plan.
- A timeout/network error after POST with uncertain acceptance remains **lost/needs attention**. Never automatically resend it. Known job IDs resume polling; downloaded outputs are retained locally.
- Reject insufficient credits, offline, policy failures and unsupported model/profile with useful next actions. Do not promise refunds or silently reroute a declined prompt.
- Rest rejection stops before poses. A bad clip does not invalidate good clips or restart the whole fit. Retrying/changing route/key/seed requires the shown new spend authorization and preserves spent totals and prior candidates.
- Compare target audit before each stage and at final acceptance. Outfit-only changes are allowed. Relevant body/pose/geometry changes pause with “Character changed; review the updated fit plan.” Keep completed output available for inspection rather than writing it onto a changed body.
- New moves appearing during a draft produce an explicit coverage delta/new price; they are not silently included under an earlier approval.
- Extending an accepted fitted copy through `studio/create.ts` / `poseItemClip` must stage new item cells and QA for review before merge. Its existing automatic retry/grid/write behavior is not an implicit authorization to spend fitting credits or replace accepted cells. The target body's separate Add move operation remains governed by its own explicit plan.
- Multiple completed fits for the same slot may be accepted as distinct local items, with unique item/material IDs. Two tabs accepting one draft must converge on one published item through an idempotent acceptance marker/transaction.
- Hide/close only dismisses the dialog when work is running; it does not imply a remote cancellation succeeded. Cancellation retains actual spend and already-submitted results.

## 11. Geometry, mirrors, outfits and interactions

**Held equipment:** fit and pose at the existing 96 px geometry when required, with pivot `rig.pivot + (16,16)` and correspondingly padded keypoints. Show the whole layer in review; never judge clipping from the normal 64 px stage alone. Preserve S5 rest-frame ordering/repair evidence without treating a pasted reference repair as verified hidden geometry.

**Mirrors:** “match character mirrors” preserves the current project's deliberate mirrored behavior and explicitly warns that anatomical grip can swap. “preserve hand” requires independent item outputs for western/diagonal views and corresponding resolved target frames/poses; do not claim `mirror: generate` works merely because the manifest type permits it. Qualification, coverage planning, per-direction QA and exports must actually exercise those cells. Block unsupported grip-preserving cases instead of silently flipping them.

**Occlusion:** derive foreground/background against the actual target base and use target slot/clips/hides semantics. Never paste source body-occluded fragments to imply a full fitted cape/shield. Preview held items together and headgear with hair. Do not copy source outfit state into the target.

**Recolour:** retain raw target copy pixels and item-local exact ramps. Recolour variants and selected target outfits do not alter design revisions. A user can explicitly save a new visible colourway/revision.

**Outfits:** keep `Preset.items[slot] = localItemId`. A fit review never replaces another outfit's selected item as a side effect. Removing the shared design or source character does not invalidate any existing outfit. A cross-character global outfit library is outside this change.

## 12. Imports, exports, provenance and privacy

Provide a separate `*.pixeldoll-design.zip` format:

```text
design.json                 pixeldoll-design/1 identity, immutable revisions, reference/source-fit contracts
cells/<rgba-sha256>.png      every referenced canonical/source-fit PNG
README.txt                  design scope, visible-reference limitations, import instructions
ATTRIBUTION.txt             user-supplied rights/source information and generating-tool attribution
```

Use a strict, versioned `design.json` schema, size/pixel/ZIP path/CRC/hash bounds and reference completeness checks. Character import does not guess that a design archive is a character; route it to **Saved designs** with a clear explanation. Deduplicate an identical immutable revision by content. A conflicting identity with different content is imported as a new copy/revision, never overwrites accepted target assets.

Character engine exports still contain only target-fitted layer sheets and target playback. The editable `project.json` includes pinned design lineage/reference snapshot and every blob needed for restoring, adding moves and re-saving the design. Reimport needs neither the original library entry nor the source character. Engine adapters can ignore design lineage; generic/Aseprite/manifest output remains target-specific. Baked tuck variants stay export artifacts, not canonical designs.

Provenance distinguishes original design generation, exact copy, rest fitting, target posing and retry selection. Per-cell QA indices must reference the selected records that actually produced those cells. Attribution does not assert ownership or an art licence from the app's MIT code licence.

Design ZIPs intentionally omit unrelated character/outfit names, other items, connection settings, agent flags, tokens and environment files. Retain only disclosed artwork/provenance necessary for the design; show archive contents before sharing. Character backup remains a self-contained archival artifact. Do not automatically publish library entries or upload them outside explicit PixelLab fitting calls.

## 13. Accessible UI contract

- Reuse the existing custom CSS, native `Sheet` dialog and Lucide icons; preserve dark/light and compact/landscape/tablet layouts.
- Tabs have correct tab/tabpanel semantics, keyboard navigation and focus restoration. Source selection cannot trigger spending.
- Design cards show name, slot, thumbnail and text eligibility; status is never colour-only. Search/filter is local and optional; no folders/tags taxonomy is required initially.
- The main action reads **Wear · Free**, **Copy to wardrobe · Free**, **Preview fit · ~N gens**, **Animate fit · ~N gens**, or **Set up character**, as appropriate. Avoid a misleading unconditional Wear button.
- Rest/final review uses the same direction/move controls and enlarged pixel preview, plus explicit source comparison and flag navigation. A static frame and pause control support reduced motion; all preview information has readable labels.
- Progress announces stage changes through a polite live region, not every frame. Lost jobs and rejected candidates have recoverable visible states.
- Selecting/accepting a fitted copy returns focus to its wardrobe row. Closing a running fit makes progress discoverable in Activity and the item's pending row.
- Empty library explains **Save as shared design** on an accepted item and offers design ZIP import. No mandatory library setup screen or technical routing wizard.

## 14. Implementation milestones and acceptance gates

| Milestone | Owned changes to plan for | Acceptance |
|---|---|---|
| M0 — frozen evidence and contract | This plan; focused spike report; compatibility fixtures and endpoint verification. | Distinguish measured behavior from API promises; no paid work without a separate cap/authorization; exact compatibility counterexamples cover matching skeleton/different body and same hash/different pivot. |
| M1 — ownership and format prerequisite | `store/manifest.ts`, `dress/dress.ts`, `export/generic.ts`, format readers/constructors listed in section 8, relevant exporters/docs/tests. | Both manifest versions round-trip; independent item recolour with overlapping RGBs; no silent role loss, body changes or dangling links. |
| M2 — designs and free reuse | New `lib/equipment/design.ts`, `compatibility.ts`, `store.ts`; narrow db/project/import/export integration; accepted-item save action; New item Saved designs UI. | Source deletion safe; zero-generation exact copies preserve every layer pixel and target playback; same-name/different-pose rejects; exact differently named unique mapping works; partial/new-move reuse retained; unknown cases explain limitation. |
| M3 — route qualification spike | Developer-only bounded harness/report using current queue and existing source/target art. | Matrix gate in section 7 passes per advertised class/profile; all inputs/outputs/usage stored; no source-body changes, hidden geometry assertions or automatic paid route cascades. |
| M4 — resumable target fitting | New `lib/equipment/fit.ts`, `fitPlan.ts`; qualified route builders; persisted fit drafts/budgets; state/Activity integration; rest and final review sheets. | Explicit two-stage spend; reload/leader takeover do not duplicate requests; missing/changed target data pauses safely; reviewed output atomically becomes one local item. |
| M5 — complete workflows | `Wardrobe`, `PhonePanel`, `ItemPane`, `NewItemSheet`/design picker, `Outfits`, `MoveSheet`, exports/imports and lifecycle guards. | All supported classes/targets usable with 64/96 geometry, sparse/long clips, all directions, preserved grip policy, independent colours/outfits; source/library deletion leaves target copies functional. |
| M6 — adversarial and browser verification | Focused Vitest/IndexedDB/queue tests, managed Playwright and Codex browser visual/keyboard review, engine artifact verification. | No paid endpoint in keyless tests; every advertised flow passes dark/light desktop, phone portrait/landscape and tablet; no token exposure, duplicate charge or invalid export. |

The proposed new module names are responsibilities, not a mandate for many abstractions. Combine files if smaller functions remain readable. Keep existing item runner/compositor/export machinery where the contracts actually match; separate fit policy from legacy automatic spending behavior.

### Required adverse cases

1. Same cell size and skeleton but broader body; same `baseHash` with changed pivot/camera semantics; same clip name with different poses; exact pixels under another project ID.
2. Source character removed; library entry removed; an active fit with its source removed; target deletion; blob GC during save/acceptance; low-storage abort.
3. Existing target outfit edited during fit; target body/rig changed; new move added; two tabs accept the same draft; page reload between POST and job-ID persistence.
4. Only one source direction; no target back view; no reference keyframe; body-occluded shield/cape; old engine ZIP with no dressed references; green design with green key.
5. 96 px held fit with five views exceeding one-call caps; independent west hand; simultaneous sword/shield; long batch boundaries; short/rest clips; sparse clips.
6. Shared body/equipment RGB; different role/ramp lengths; tied/linked hair/beard; source current colourway; recolour target copy without changing another item.
7. Exact duplicate design import; conflicting IDs; malformed/oversized archive; missing referenced cells; wrong RGBA hash; restore character backup after library deletion.
8. Real shield and helmet-occlusion saved failures remain failures/review warnings; no quality-threshold relaxation introduced to make fitting appear successful.

## 15. Decisions reached through debate

- **Agreed:** immutable shared design identity plus target-owned fitted pixels; no naive universal raster overlay.
- **Agreed:** qualify reference fitting as a new narrow use case, rather than citing the old transfer rejection as an absolute ban.
- **Agreed:** one qualified route per class/profile behind one fit flow; explicit retries and cost, no silent paid fallback chain.
- **Agreed:** `baseHash` alone is inadequate; exact frozen per-cell/geometry/slot compatibility permits free existing-raster reuse, while timing/project IDs and re-estimated joint floats alone do not force repainting. Future dressed-reference reuse separately requires target-rest/keypoint compatibility and fresh target-side QA.
- **Agreed:** source snapshots and canonical references survive source deletion; target copies/outfits survive library changes.
- **Agreed:** existing namespaced object store is sufficient, with comprehensive reader/GC/lifecycle audits and atomic publication.
- **Agreed:** independently recolourable equipment cannot ship with silently omitted overlapping colours. The narrow palette ownership prerequisite and format implications are part of the plan.
- **Verified:** live official endpoint contracts were checked in the coordinating agent's Codex browser on 2026-10-22. Typed contracts take precedence over the documented transfer frame-limit generalization, deprecated inpaint context prose and skeleton-estimation GET typo.
- **Scheduled qualification gates:** execute the bounded matrix to select the eligible reference-fitting route per class/profile and verify actual costs for new packed reference layouts. These are defined experimental milestones, not undecided implementation behavior. Exact live Pro Flash preset shapes are checked only if that optional candidate is pursued.

This plan adds no source implementation or paid fitting experiments.
