# Skeletal editing research for PixelDoll

Date: 2026-10-23. Scope: official tool/API research and targeted inspection of the local rig contract. No paid API calls, tokens, or application source changes. Recommendations below are design inferences, not claims of live-tested PixelLab behavior.

## Recommendation

Implement a focused **Frame Repair** workspace with joint editing, but make free raster repair and attachment alignment the first deliverable. A joint editor alone does not solve the user's stated problem: moving an estimated wrist marker cannot repair an incorrectly painted wrist, and moving a desired pose cannot move the pixels of a frozen generated body. Keep these three actions explicit:

1. **Correct joints**: fix the estimated landmarks on the existing image. Changes metadata, QA reference/anchor inputs and explicitly selected attachment alignment; does not redraw pixels or silently regenerate art.
2. **Repair artwork**: move an item/masked selection in whole pixels, erase/restore pixels, or replace one layer frame from a compatible imported PNG. Deterministic, local, free, undoable.
3. **Change pose**: author desired joint positions, preview the stick figure, then explicitly generate paid candidate art. Review and accept candidates without replacing untouched frames or discarding originals.

The product is a raster paperdoll tool using AI pose conditioning. It should borrow the control patterns of skeletal editors without promising Spine's mesh deformation behavior.

## What established tools actually teach us

| Tool and official evidence | Useful pattern | PixelDoll adaptation | Limit or wrong inference to avoid |
| --- | --- | --- | --- |
| [Spine first steps](https://esotericsoftware.com/spine-first-steps), [UI guide](https://esotericsoftware.com/spine-ui) | Setup pose is distinct from animation poses; timeline keys and reversible editing. Images are attached to bones. | Separate reference-joint calibration from frame pose authoring; show selected frame, scope and undo clearly. | PixelDoll's single raster body is not already a set of cutout body parts. A skeleton overlay supplies no deformation weights. |
| [Spine IK constraints](https://esotericsoftware.com/spine-ik-constraints) | Drag a hand/foot target; the limb follows. FK rotates parents first; IK solves toward the endpoint. Bend direction is explicit. | Optional two-bone limb drag, fixed shoulder/hip, reach indicator and “Bend other way”; direct landmark drag remains available. | Do not silently stretch a limb, introduce full constraint graphs, or describe 2D screen-space limb length as true anatomical length. |
| [Spine skins](https://esotericsoftware.com/spine-skins) | Reuse animations with interchangeable attachments through stable slot placeholders. | Preserve stable paperdoll slots and shared pivots/anchors; preview combinations during repair. | Spine skins are runtime attachment substitution. They do not guarantee that AI-generated clothing follows a separate frozen raster frame. |
| [Spriter quickstart](https://brashmonkey.com/spriter_manual/quickstart.htm), [character maps](https://brashmonkey.com/spriter_manual/what%20are%20character%20maps.htm) | Pivot placement matters when swapping modular images; character maps combine equipment variants. | Show grip/pivot and frame alignment against the base; offer a separate item offset tool. | Pivot swapping cannot invent missing occluded pixels or turn a flat cape into every pose. |
| [DragonBones armature data](https://raw.githubusercontent.com/DragonBones/DragonBonesJS/master/DragonBones/src/dragonBones/model/ArmatureData.ts), [skin data](https://raw.githubusercontent.com/DragonBones/DragonBonesJS/master/DragonBones/src/dragonBones/model/SkinData.ts), [IK implementation](https://raw.githubusercontent.com/DragonBones/DragonBonesJS/master/DragonBones/src/dragonBones/armature/Constraint.ts) | Bones, slots, skins, animations and constraints are separate model concerns. IK includes an explicit bend direction. | Keep rig landmarks, attachment transforms, raster revisions and generation requests separate. | No need to bring an entire animation runtime into a client-side frame repair screen. Current repository recommends LoongBones; do not assume old editor documentation describes a maintained product. |
| [Godot 2D skeleton tutorial](https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html) | Rest pose, hierarchy and weighted polygons are separate prerequisites; triangulation can produce unexpected deformation. | Make calibration and coordinate conversion explicit; keep the raster preview honest. | Tutorial is marked potentially outdated. Mesh rigging would add weight painting, segmentation and triangulation work rather than remove the need for frame repair. |
| [Aseprite animation](https://www.aseprite.org/docs/animation/), [onion skin](https://www.aseprite.org/docs/onion-skinning/), [spritesheets](https://www.aseprite.org/docs/sprite-sheet/) | Frame/layer/cel selection, previous/next tinted ghosts, duration, selected-layer export/import. | Filmstrip with issue badges, previous/next ghosts, single-frame default scope, native-pixel preview and external PNG round trip. | A complete pixel editor is unnecessary. A small deterministic correction set plus reliable round trip covers the immediate need. |
| [LibreSprite official repository](https://github.com/LibreSprite/LibreSprite) | A free external raster editing companion. | Support compatible PNG/spritesheet replacement with fixed cell mapping. | External tool availability is an escape hatch, not a substitute for basic in-app repair. |

## Verified PixelLab boundaries

Primary machine contract: local `docs/research/pixellab/pixellab-openapi-v2.json` (minified, line 1; use the following JSON pointers), published at [PixelLab OpenAPI](https://api.pixellab.ai/v2/openapi.json). No generation was performed to revalidate provider claims.

| Operation | Contract evidence | Product implication |
| --- | --- | --- |
| Estimate landmarks | `/paths/~1estimate-skeleton/post`: POST; supports only square 16/32/64/128/256 images. | Existing padding/unpadding is required. Manual correction should remove dependence on a new paid estimate for every small fix. |
| Generate requested poses | `/paths/~1animate-with-skeleton-v3/post`, `/components/schemas/AnimateWithSkeletonV3Request`: 3–15 output frames; each from one reference image; all 18 labelled joints for reference and requested poses; output count equals requested pose count; maximum 256×256. | There is no native one-frame skeleton-v3 edit. A single-frame replacement requires a disclosed minimum-three request, selective acceptance, and a test of temporal consistency. Start with clip candidates if that is more reliable. |
| Reference calibration | `AnimateWithSkeletonV3Request.properties.first_frame_keypoints`: points must match the pose the reference image is already in; mismatch can hurt transparency and colour accuracy. | “Reference joints” deserves its own calibration state. Do not reuse a desired animated pose as the reference estimate. |
| Depth/order | `/components/schemas/Keypoint-Input`: normalized `x/y`, integer `z_index` draw order, optional depth 0–255. Missing depth comes from the direction-specific template body. | Keep depth out of the default 2D editor. Do not invent depth from draw order. Advanced occlusion controls need separate semantics and an experiment. |
| Batch text edits | `/paths/~1edit-animation-v2/post`: minimum 2 frames; at ≤64px up to 16, 65–80px up to 9, 81–256px up to 4. No joint or per-region mask field in `EditAnimationV2Request`. | A “fix frame 6” button must not imply this endpoint understands that frame's skeleton or preserves untouched pixels. Request scope and accepted output scope are different. |
| Masked artwork repair | `/paths/~1inpaint-v3/post`, `/components/schemas/InpaintV3Request`: one image plus same-size mask; white generates and black preserves; `crop_to_mask`; context/bounding-box fields deprecated. | For targeted paid repair, compose context with a selected item/region, request a candidate, then merge only the user-approved mask/layer locally. Preserve original bytes outside it regardless of provider behavior. |

The current [public API overview](https://www.pixellab.ai/pixellab-api) independently describes skeleton-v3 as pose-per-frame from a reference image. The [inpaint tool page](https://www.pixellab.ai/docs/tools/inpaint-v3) documents 32px minimum, tier 1 maximum 256 per side, tier 2+ maximum 512 per side, and 10 generations per use. The [animation edit page](https://www.pixellab.ai/docs/tools/edit-animation-pro) corroborates size-dependent limits but says extensions only; the snapshot has a REST endpoint. Prefer the machine contract for REST availability; do not promise availability from stale marketing text alone.

PixelLab's [skeleton editor guide](https://www.pixellab.ai/docs/tools/animate-with-skeleton) already explicitly recommends touching up imperfect estimates and editing skeletons across the frames. Its freeze-one/generate-two and legacy square-size workflow describes the older editor tool; **do not carry those legacy endpoint behaviors into skeleton-v3**.

## Local architecture implications

- `app/src/lib/rig/rig.ts:13` stores normalized landmarks as `{label,x,y}`. `ClipSource.keypoints` (`:20`) is the sequence actually sent for generation; `measured` (`:22`) is re-estimated on the accepted raster. These must remain separate. Add user corrections as a third layer instead of overwriting either historical record.
- `app/src/lib/rig/poses.ts:10` lists the 18 provider labels. “RIGHT ARM” is the wrist and “RIGHT LEG” is the ankle. UI labels should say “Right hand” and “Right foot” while retaining provider labels internally. Character-right must remain distinct from viewer-right, especially north and mirrored views.
- `app/src/lib/rig/poses.ts:16` clamps and rounds coordinates; a new editor should show out-of-bounds/reach warnings before submission rather than silently hiding pose errors by clamping. `hasAll` (`:19`) is a useful minimum, not proof that a pose is anatomically sensible.
- `app/src/lib/rig/skeleton.ts:10` parses `z_index` into a local `z` field. `poses.ts:18` resets this to zero when converting API input. Neither is a true 3D depth representation. Name any expanded model fields by their actual meaning.
- `app/src/lib/rig/estimate.ts:5` and `:14` already pad/unpad normalized estimator coordinates without scaling pixels. Reuse this logic and test overlay registration against native raster coordinates.
- `app/src/lib/rig/clips.ts:106` already pads one/two requested poses to three by repeating the last pose. This is request validity plumbing, not evidence that a three-frame request yields a temporally seamless single-frame replacement.
- `docs/spikes/S3_skeleton_rigging.md:109` reports non-identical outputs for the same request and seed; `:247` notes that skeleton-v3 is not pixel locked. Preserve originals and candidate images. The evidence is useful but narrow (see the spike limitations); avoid turning one test character into a universal alignment guarantee.

## Interaction contract

Enter from a failed QA frame or the selected frame in Studio. Show a large nearest-neighbor canvas, base/item visibility, one chosen repair action, and a filmstrip with the current direction and clip. Default to “This frame”; “Selected frames” and “Entire direction” are explicit opt-ins. Do not propagate to other directions automatically.

For joint correction, show a simple torso/limb overlay first; reveal eye/ear points as a “Head landmarks” group. Drag updates locally, arrow keys nudge by one source pixel, zoom changes handle size in screen pixels, and a numeric inspector allows precision. Head-group translation preserves facial landmark relationships. Use a labelled inspector list and keyboard selection so overlapping side-view joints remain selectable. A faint target-vs-estimated overlay should have a legend.

For posing, direct joint drag is the safe baseline. Optional two-bone IK and projected-length locks improve limb positioning but must allow deliberate foreshortening, overlapping side views and stylized proportions. Add copy/paste pose and reset; defer interpolation initially. Later, apply a user-approved correction delta over selected neighboring frames, preview every affected frame, and preserve the original motion path rather than replacing it with a linear pose-to-pose tween.

For pixels, integer translation preserves values, but arbitrary rotation still resamples silhouettes even with nearest-neighbor. Label its preview and avoid automatic rotation on rigid pixel equipment until the user approves the result. Separate image mirroring, anatomical side labels, and grip side. Local raster changes refresh the affected hashes, QA and export data atomically; body edits explicitly flag affected equipment for review instead of blindly overwriting it.

Paid actions show endpoint intent, request frame count, affected output frames and estimated cost before a single explicit Generate action. There is no charge while dragging. Candidate acceptance is per frame and undoable. Retry is explicit; never auto-resend a charged request because the UI lost its connection.

## Phased scope and acceptance

1. **Ship local repair first**: frame/direction/layer selection, onion skin, base comparison, whole-pixel offsets, erase/restore, frame PNG replacement, undo/redo, durable revisions, export parity. Demonstrate correction of a helmet shift, stray pixel and wrong grip anchor offline.
2. **Ship calibrated joint editing**: separate reference, generated target, measured and corrected joints; group drag/nudges; anchor preview; optional limb IK; explicit temporal scope. Editing a joint must leave original image bytes unchanged, persist through reopen, and never issue a paid request.
3. **Add paid candidate repair/posing** after targeted experiments validate minimum-three single-frame candidates, mask compositing and temporal seams. If selected-frame pose repair is not reliable, ship honest full-clip candidates and retain local frame repair.

Deferred: body-part segmentation, weight painting, meshes, graph editor, generic rig topology, procedural runtime animation, automatic all-direction pose propagation and Spine-format output. These solve a larger animation-authoring product and create a new validation burden.

## Dependency and licensing boundary

Use external tools as design references and round-trip companions. Do not copy editor UI assets or assume accessible source is permissively reusable. [Spine runtime terms](https://esotericsoftware.com/spine-runtimes-license) have editor-license conditions; avoid bundling them for this feature. [DragonBonesJS is MIT](https://github.com/DragonBones/DragonBonesJS/blob/master/LICENSE), but permission is not an argument that its runtime is needed. [Aseprite's EULA](https://github.com/aseprite/aseprite/blob/main/EULA.txt) restricts redistribution and source use; [LibreSprite is GPL-2.0](https://github.com/LibreSprite/LibreSprite). Keep implementations independent and check any proposed reuse separately. A small original SVG overlay plus canvas pixel operations fits the existing Svelte/TypeScript stack and keeps client-only deployment.
