# Pipeline audit: generation, rigs and recoverable frame correction

Date: 2026-10-23. Scope: read-only review of current generation/rig/item/storage source, tests, API snapshot, S3–S5 research and preserved local evidence. No PixelLab calls, spending, `.env` access or source changes. This report is a recommendation, not implementation. Unrelated working-tree changes were left untouched.

## Recommendation

Implement a **frame correction workspace with a joint-editing mode**, rather than a full Spine-style skeletal animation engine. The immediate product gap is recoverability after generation: inspect the actual frame, distinguish an incorrect joint estimate from incorrect artwork, fix a selected layer or mask, compare with adjacent frames, and commit only selected changes. Joint dragging is necessary but cannot itself move PixelLab's already-generated pixels.

Keep the frame-based export model, content-addressed images, client-only architecture, existing Svelte/CSS and allowed API routes. Add immutable correction revisions, explicit dependency invalidation and transactional candidate acceptance before exposing editable body joints. Otherwise a visually attractive editor will silently mix old equipment with a new body.

## What actually exists

| Area | Implemented behavior | Evidence / limit |
|---|---|---|
| Base creation | `create-character-v3` creates rotations; padded originals are registered as a managed character to obtain rest joints. | `app/src/studio/create.ts:176` onward; registration keeps originals. |
| Motion | Authored coordinate presets or managed motion → estimated points → raw skeleton-v3 redraw. | `app/src/studio/create.ts:214`; `app/src/lib/rig/poses.ts:56`. No runtime mesh/bone deformation. |
| Default clips | Idle 4, walk 8. | `app/src/lib/pixellab/routes.ts:56`. Architecture's four-clip default is stale. |
| Frozen rig | PNG cells, content hashes, reference images, requested coordinates and measured coordinates are stored. | `app/src/lib/rig/rig.ts:18`; `app/src/studio/create.ts:248`. Strong foundation for non-destructive revisioning. |
| Item generation | Dress chroma rest images; redraw the dressed image through stored requested poses; extract non-key pixels; cleanup; numerical QA. | `app/src/lib/items/items.ts:19`; `app/src/lib/items/run.ts:264`. Alignment is sampled behavior, not an API guarantee. |
| Recovery | Bounded call rerolls, alternate chroma, best-roll selection, packed-grid fallback, explicit item acceptance. | `app/src/lib/items/run.ts:143`, `:190`, `:213`, `:353`. Recovery granularity is mostly paid call/clip, not user-selected pixels. |
| Per-frame display | Frame scrubbing, direction preview, zoom, playback and composition exist. | `app/src/studio/Stage.svelte:1`. No production joint/pixel/mask correction workflow is provided here. |
| Equipment fitting | Newer fitting uses staged rest approval, candidates, exact-copy assessment, target stamps and selected missing cells. | `app/src/lib/equipment/fit.ts:80`, `:245`, `:260`; `generate.ts:81`. Reuse these stronger patterns; do not build another independent job lifecycle. |

## Findings

### 1. High: body replacement can label old equipment as compatible with a changed clip

`addBodyClip` writes new body cells, recomputes the global body hash and moves **all** items matching the previous hash onto the new one. Its comment explicitly says replacement keeps the previous item clip until selected items are reposed (`app/src/studio/create.ts:385–406`). `addMove` reposes only chosen direct items (`:317–323`). Unchosen equipment can therefore retain old replacement-clip pixels while claiming the current body's `baseHash`. If a chosen equipment pose fails after the body commit, the same intermediate mismatch remains saved.

Export staleness checks only hash equality (`app/src/lib/export/generic.ts:62–68`), so this is a source-visible compatibility hole, not merely a prospective editor concern. This audit did not execute a browser reproduction. Adding a genuinely new clip is different: preserving old cells is correct, while new cells are missing. Replacing a clip needs explicit stale coverage.

**Required seam:** distinguish appended coverage from replaced cell revisions. Store per-cell dependencies, invalidate only affected item cells, keep accepted prior revision available and display “needs refit” until reviewed. Use compare-and-swap stamps on both generation planning and acceptance. Candidate publication must atomically update body cells, joints, anchors, compatibility and QA; do not relabel stale artwork with the new body hash.

### 2. High: a joint editor alone cannot repair the failures the user sees

The raw API draws new raster frames from a first image and 18 joint targets; `rawClip` submits those coordinates (`app/src/lib/rig/clips.ts:42–48`). There are no meshes, weights or deterministic attachment transforms for generated worn layers. The stored snapshot describes the route as beta and explicitly says it draws one frame per skeleton (`docs/research/pixellab/pixellab-openapi-v2.json`, JSON pointer `/paths/~1animate-with-skeleton-v3/post/description`).

Moving a wrist in metadata cannot fix a bent visor, missing shield, wrong-facing helmet, gray cape hem or erased detail. Conversely, correcting an estimate on an otherwise good raster should not redraw that raster. Build two distinct operations:

1. **Correct joints on this image**: free metadata edit, independent “observed / manually corrected” record, recalculate anchors and relevant QA, leave raster and original requested pose unchanged.
2. **Change the intended pose**: edit a draft target pose, then explicitly regenerate selected body/equipment candidates or apply a limited local rigid transform. Show cost and dependencies before sending anything.

Never overwrite original `ClipSource.keypoints` when annotating a measurement correction. They are a historical record of what generated existing pixels (`app/src/lib/rig/rig.ts:21–27`). A draft intended pose should not pretend to be that history.

### 3. High: valid artwork becomes unusable when the estimator cannot find every joint

`renderClip` retains art but throws if even one frame lacks a complete valid measurement (`app/src/studio/create.ts:115–117`). Imported setup similarly requires all measurements (`app/src/lib/rig/setup.ts:83–86`). The quality-policy test confirms no clip is committed in this case (`app/test/unit/creator-quality-policy.test.ts`, final test).

Stopping protects against fabricating a rig, but there is no user route to supply the missing joints and finish the already-paid result. Faces in profile, crossed arms and small/occluded limbs are exactly where a casual user needs help.

**Required seam:** persist a recoverable setup candidate before measurement, retaining all returned raster hashes. Let a user mark/adjust required joints using rest and adjacent-frame suggestions. Record those as manually observed, not PixelLab-estimated, and resume locally without resending successful paid calls. Keep exportable art separate from ability to generate new equipment when joints are incomplete.

### 4. High: automatic pixel cleanup is destructive inference without a user override

Posed layers discard components smaller than `max(4 px, 15% of largest)` (`app/src/lib/items/items.ts:264–268`). Extraction first discards single-pixel components and despills colors (`app/src/lib/image/chroma.ts`, `chromaLayer`). Head support trimming removes pixels outside an aligned keyframe unless temporal consensus keeps them (`items.ts:307–349`); held attachment keeps the largest component and those near it/wrist (`:359–375`); worn-item cleanup deletes detached parts mostly outside the body (`:413–420`). Near-rest held failures can be replaced by a translated dressed keyframe (`:383–396`). Global silhouette fitting can shift the output by one pixel (`:424–472`).

These are heuristics that have helped known samples, but disconnected earrings, helmet crests, weapon spark details, loose clothing and valid emerging silhouettes can satisfy the same conditions. `CellQa.repaired` and offsets provide some evidence; they do not offer an undo/restore workflow. Frame-local fixes re-evaluated from raw ledger output can also be lost unless modeled after extraction.

**Required seam:** preserve raw composite, extracted layer, removal mask and processed layer as separate immutable stages. Add a simple “Cleanup changes” overlay and restore/erase brush. Treat pipeline corrections as a versioned recipe; manual patches apply after that recipe and become explicit final content hashes. A later reroll must preserve or flag patches, never silently replay them onto unrelated art.

### 5. High: “identical skeleton” does not guarantee alignment to the frozen body

Items are generated using requested source poses (`clipKeypoints`, `items.ts:159–162`), while the actual body may differ from those poses. Body QA now correctly treats arm difference, palette variation and bottom silhouette movement as observations, not redraw commands (`app/src/lib/rig/clips.ts:90–118`). That makes manual correction more necessary: a body deviation may be deliberately accepted, yet later gear still targets the original request. Some item measurements use the requested skeleton (`items.ts:299–302`) while other paths use measured skeletons and tracked anchors (`items/run.ts:88–91`; `rig/freeze.ts:118`).

**Required seam:** show requested, observed and corrected overlays independently. Declare which source each attachment/grip check uses. Provide a reviewed per-frame attachment track for items; it may override a wrong wrist estimate without altering the intended animation. Do not globally switch all item posing to estimated joints without a validation spike: that changes the established base/item request relationship and can introduce another mismatch.

### 6. Medium-high: the layer split encodes body overlap, not anatomical occlusion

`splitFgBg` assigns every equipment pixel overlapping opaque body pixels to foreground and all remaining pixels to background (`app/src/lib/compose/split.ts:6–12`). This exactly reconstructs “base plus extracted overlay”; that identity does not prove the arm should cover the cape or the fingers should cover the hilt. API-drawn mannequin pixels can imply occlusion, but this app has no general body-part segmentation, explicit grip cutout or per-pixel front/behind authoring. Slot `zOverrides` support direction/animation/cell scope (`app/src/lib/store/manifest.ts:48–58`) and are useful but cannot split one frame's item around a hand by themselves.

**Required seam:** first add front/behind mask editing to a selected item's frame and a per-frame grip marker. Let the user restore/remove pixels or move visible item pixels between existing fg/bg layers. Defer a larger body-part segmentation system until actual cases justify it. Joint depth/draw order is generation guidance, not a guaranteed runtime occlusion mask.

### 7. Medium-high: automated QA can drive paid churn while missing semantic errors

The item loop rerolls hard failures and soft palette drift twice, can switch key and re-run all calls, then may try a grid (`app/src/lib/items/run.ts:27`, `:154–166`, `:190–247`). Acceptance intentionally converts exceptions into an accepted state (`:352–357`; `qa-summary.ts:10`). `planGens` calculates one pass (`items.ts:227`), not every possible recovery branch. The queue's safe resume policy is valuable; a new paid reroll is nevertheless a separate expense.

Numerical pass is not “the user likes this frame.” H4 is off for held items, feet and legs (`items.ts:807–809`); soft deformation, projection and occlusion make strict thresholds unreliable. A failed threshold can still be acceptable art. Basing fallback choice on count of failed checks (`run.ts:199–205`) does not measure visual improvement or severity.

**Required seam:** explicit per-operation spending ceilings and “review before another paid attempt” after the first candidate, while retaining an opt-in automatic budget for users who want it. Display actual attempted cost separately from estimated base cost. Give “fix locally,” “retry selected frames,” “use alternate result” and “keep exception” equal treatment. Preserve hard structural guards and distinguish structural, heuristic and human-review evidence.

### 8. Medium: source-level docs still disagree with current behavior

`docs/architecture.md:22` describes one prompt ending in accept/reroll as a goal. That is now insufficient for the user's control requirement and should become “automatic first draft with explicit correction and selective regeneration.” `:55` says frozen base keeps only the largest component, while `:89` and current code explicitly preserve all components. `:53` lists idle/walk/slash/hurt as the default versus code's idle/walk. `:162` says posed key outside ≤0.03 versus code's 0.05 (`items.ts:487`); `ItemPane.svelte:133` shows ≤0.02 generically. `:48` hardcodes 64 cells, while creator validation and normalization support selectable size/frame. S3 and S5 contain historical recommendations superseded by later QA changes.

**Required seam:** documentation should separately label shipped behavior, experiment evidence and future recommendation, with one current threshold table generated/referenced from code. Keep historical spike reports immutable and link a current interpretation. An editor should show the check actually applied, its measured value and an explanation; do not repeat static numbers from old docs.

## Evidence quality: proven mechanism, incomplete generality

The research is useful and unusually candid. It demonstrates the mechanism, not a guarantee across every body, direction, weapon and seed.

- S3 explicitly records stochastic raster output, incomplete pixel locking and estimator limitations (`docs/spikes/S3_skeleton_rigging.md:108–110`, `:245` onward). I inspected the archived `1f95029:spikes/api/out/s3_k1/eval_table.json`: `slash_east_v3_s11` has arm adherence 2.7 px and 30 removed stray pixels in frame 2; `cast_south_v3_s7` has arm adherence 2.1, `handOk` 0.67 and 31/71 stray pixels in its first two frames. Those measurements do not establish that all atypical pixels are wrong.
- S4 admits one seed per route/item (`docs/spikes/S4_model_routing.md:346`). Do not generalize “same skeleton, aligned” beyond its measured sample.
- S5's original oversize claim is 192 frames, one body and two weapons; polearms, shields and 128-pixel layers were untested (`docs/spikes/S5_held_items.md:248–252`). Later shield evidence adds valuable coverage, with remaining failures.
- I inspected local ignored `spikes/api/out/shields/joint-audit.json` and compact regression geometry. For the 4-direction east transition 0→1, the saved audit shows a centroid shift of about 13.55 pixels while the intended left wrist shifts 0.68 pixels. The 8-direction audit includes a 67.7° relative turn. The existing follow-up correctly says these are review evidence, not proof of the root cause (`docs/testing/item-quality-follow-up-2026-10-22.md:12–23`). This is a concrete reason to expose joint/attachment/raster inspection together.
- Existing tests meaningfully cover preservation, occlusion, provenance and resumability. This reviewer read them; the coordinating reviewer ran `npm run check` with zero warnings and all 33 unit suites successfully (297 passed, one skipped), after working around an initial temporary-file `EPERM` by setting process `TEMP`/`TMP` to an app cache directory. Host Node 25.0.0/npm 11.16.0 differ from the pinned Node 24.22.1/npm 11.19.1, so this is qualified local evidence, not validation on the required runtime. Broad passing tests should not be presented as visual acceptance of all generated clips. No live-model validation is claimed.

## Proposed implementation seams

### Data and transactions first

Add a correction model under `app/src/lib/corrections/` with pure coordinate, diff and invalidation functions. Reuse content-addressed blobs and `db.updateCharacter`/transactional publication. Keep viewport transient state under Studio. Proposed records, with exact names decided during implementation:

```ts
type FrameAddress = { animation: string; direction: DirectionName; cell: number };
type CorrectionTarget = FrameAddress & { itemId: string; layerId: string };
type JointObservation = {
  points: Keypoint[];
  origin: 'estimated' | 'manual';
  imageHash: Sha256;
  revision: string;
};
type CellDependency = {
  bodyImage: Sha256;
  restImage: Sha256;
  poseRevision: string;
  attachmentRevision?: string;
  cleanupVersion: string;
};
```

Do not duplicate existing original requested poses; reference them. A manual observation is image-bound and becomes stale if its image changes. A pixel patch stores its source hash and resulting immutable hash. A candidate stores the target stamp it was prepared against, chosen cell replacements, job records and local edits. Undo/redo traverses local correction commands; reverting after acceptance restores a previous revision in one transaction. Export writes resolved pixels, not a promise that engines will apply edit instructions.

### Edit semantics and invalidation

| Operation | Cost | Update / invalidate |
|---|---|---|
| Correct measured joint | Free | Observation/anchor revision, affected grip/attachment/QA evidence; existing raster retained. |
| Move item 1 px | Free | Selected item's final cell hash, fg/bg split and QA; no change to body or other items. Warn before dropping canvas pixels. |
| Restore cleanup pixels / alpha mask | Free | Selected final cell and its fg/bg; retain generated source; rerun relevant clip comparisons. |
| Move target pose joints | Free draft | Mark prospective pose changes; existing accepted source remains authoritative until replacement is accepted. |
| Regenerate selected body frames | Paid | New body candidate + measurements; dependent equipment cells need review/refit. Other directions/cells retained. |
| Regenerate selected item frames | Paid | New item candidates only, dependent on accepted frozen body/rest/pose revision; neighboring accepted cells unchanged. |
| Edit standing/rest pose | Free draft; downstream redraw paid | Future generation reference contract changes. Retain old reference revisions for existing pixels; explicitly plan affected equipment and moves. |
| Correct mirrored direction | Free or paid | Default edit source + reflected linked frame; allow “make independent” explicitly. Keep handedness semantics visible. |

`baseHash` remains useful as an export identity, but cannot substitute for these dependency checks. The new equipment fitting path's `targetStamp`, `extensionStamp` and staged candidate publication are the closest working analogs (`app/src/lib/equipment/copy.ts:17–25`; `fit.ts:245–255`). Generalize the minimum needed logic, avoiding a second queue or broad rewrite.

### Smallest useful product increment

1. Frame strip with severity markers; select actual cell, direction and item. Freeze playback while editing. Onion skins and composite/item-only/raw/cleanup overlays. Mouse/touch pan and integer zoom.
2. Free item nudge, erase/restore mask, front/behind brush, eyedropper plus exact-palette pixel brush, before/after and undo/redo. Editing must work on 64/96/other valid canvas sizes through existing pivot transforms.
3. Joint overlay for rest and per-frame observations, larger hit targets than visual dots, pixel-step keyboard movement, explicit character left/right, pin parent/joint, optional two-bone IK as an authoring helper. Preserve direct joint editing; foreshortened 2D limbs should not be forced to one fixed length.
4. Paid selected-frame pose regeneration, candidate comparison and transactional acceptance; only after revision/invalidation and recoverable setup are implemented. Start with current minimum-three-pose API batching; do not claim a one-frame skeleton request is supported.

The API minimum is three frames (`paddedPoses`, `app/src/lib/rig/clips.ts:126–133`; stored OpenAPI `AnimateWithSkeletonV3Request`). A one-frame repair can send repeated or contextual poses and retain only explicitly selected output cells, but **which strategy preserves appearance best needs a paid, separately authorized validation experiment**. Avoid implying continuity is solved by selecting one frame. Show the actual three-frame request charge; the snapshot describes 3 frames ≈2 gens, 8≈3, 15≈4, while existing dress/grid calls are approximately 10. Price is an estimate from stored evidence, not a current billing guarantee.

### Acceptance criteria before shipping

- Local joint edit makes zero network calls and never changes raster pixels; corrected measurement and intended pose remain distinguishable after reload and ZIP round-trip.
- Item nudge/brush changes exactly selected cells, preserves palette identity, and matches preview/export composition including held-layer padding and mirrored directions.
- Body change cannot leave an old dependent cell marked current; unselected old cells remain explicitly stale rather than silently rehashed.
- A missing estimator result can be rescued from already stored art without regenerating it; original API observations and manual overrides stay inspectable.
- QA is recomputed at correct scope: selected-cell checks, affected clip comparisons and summary aggregation. A human review status never becomes a clean measurement pass merely because the user accepted an exception.
- Stale candidate acceptance fails safely; reload/retry reattaches existing jobs; no automatic resend of uncertain paid requests.
- Cleanup can be toggled/overridden and a user-restored detail survives re-evaluation and export.
- Validate against the saved shield, forearm-covered helmet, real malformed helmet and gray cape cases, plus a tiny legitimate disconnected detail. Separate offline behavioral tests from any later live-model quality study.

## Decision

Approve a scoped frame correction workbench and embedded 18-joint editor. Prioritize reversible local layer/mask/attachment repairs and estimator rescue before custom motion authoring. Defer full mesh weighting, runtime skeleton exports, generic nonhumanoid rigs, automatic joint interpolation across every direction and automatic redraw propagation. Those would expand complexity without addressing the most frequent observed failures as directly as explicit frame-level control.
