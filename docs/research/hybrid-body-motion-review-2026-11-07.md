# Hybrid body, clothing, and motion research

November 7, 2026. This spike evaluates motion-reference generation, endpoint dressing, parametric bodies, and 3D-derived evidence against PixelDoll's frozen-body paper-doll contract. It complements the [ComfyUI review](comfyui-paperdoll-review-2026-11-07.md) and [dedicated RGB MoCap review](rgbmocap-pixeldoll-review-2026-11-07.md); it does not propose a ComfyUI backend or another production generation provider.

**Executed follow-up:** [post-handoff qualification](post-handoff-qualification-2026-11-07/README.md) records motion/ownership controls, native rendering, live endpoint dressing, fixes and independent challenge. Native reconstruction, body authoring and fitting claims that remain unqualified are identified separately.

## Result and evidence boundaries

The strongest transferable idea is to separate **motion and geometry evidence** from **appearance generation**. A reusable animation needs an exact frame/pivot/pose contract; a convincing video or a dressed final frame alone does not supply that contract. A parametric 3D body can provide explicit correspondence and visibility, while an AI result can supply appearance. Neither automatically creates swappable low-resolution equipment.

Three opportunities merit further qualification:

1. Evaluate inexpensive dressing candidates as a source of approved standing artwork, while retaining the existing frozen target motion for equipment posing.
2. Use authoring-time 3D material/owner/depth passes to establish ground truth for rendered occlusion fixtures, rather than treating chroma removal as semantic ownership.
3. Qualify motion and equipment on different body proportions with explicit fitting, contact, camera, and pixel-grid checks.

These are research recommendations, not demonstrated production improvements. This spike read current source and primary documentation, fetched a free public API schema, and inspected public source text. It made no paid calls, installed no applications or models, ran no third-party code, and performed no native Blender, MakeHuman, or motion-capture execution. There are no comparative output-quality or price measurements from a new generation campaign here.

## What the repository already researched

- [Provider and conditioning research](deep-paperdoll-provider-2026-11-06.md) already distinguishes PixMiniMax from raw Skeleton v3, documents optional endpoint guidance, and identifies the difference between a source raster and its requested joints.
- [Geometry and equipment-depth research](deep-paperdoll-geometry-2026-11-06.md) already covers motion warps, occlusion maps, 3D depth/owner passes, and the failure of fixed whole-layer order in some compositions. These mechanisms are not new discoveries in this spike.
- [Conditioning experiments](deep-paperdoll-conditioning-2026-11-06.md) already establish that an approved extracted layer must remain separate from a derived conditioning composite.
- [Completed matched live trials](deep-paperdoll-live-trials-2026-11-06.md) already compare raw, canonical and shared-ramp conditioning, with mixed results that did not qualify a generation default change. A larger-body or motif-focused experiment must extend that evidence with a specific unresolved question rather than describe canonical conditioning as untested.
- [Custom Skeleton v3 research](2026-11-01-custom-skeleton-v3.md) and [motion closeout](2026-11-02-animation-closeout.md) distinguish authoring experiments from qualified Studio behavior. The [earlier motion diagnosis](2026-10-27-animation-diagnosis.md) already challenges camera projection, proportions, contacts, and provider redraw.
- [Shared equipment and fitted copies](shared-equipment-fitted-copies-plan.md) already separates a reusable equipment design from pixels fitted to one character. A new body shape must not inherit a previous fitted copy merely because its canvas dimensions match.

The fresh contribution is a direct live contract check, a source-level comparison to explicit clothing fitting and coverage, a public motion-capture candidate with clear access/identity limits, and discriminating experiments for the proposed hybrid workflows.

## Acquisition and source status

Public source HEADs were checked with `git ls-remote` on the review date. Only relevant source text and documentation were read. No repositories, weights, executables, or third-party assets were installed or run.

| Source | Revision or access status | Inspected material |
| --- | --- | --- |
| [PixelLab public REST schema](https://api.pixellab.ai/v2/openapi.json) | Fetched live without a token; compared selected fields with the [vendored schema](pixellab/pixellab-openapi-v2.json) | `AnimatePixminimaxRequest`, raw skeleton request shape, frame and reference contracts |
| [MiniMax H3](https://github.com/MiniMax-AI/MiniMax-H3/tree/199b7d0e1fd95e7b3eafa8c15eca692534142427) | HEAD `199b7d0e1fd95e7b3eafa8c15eca692534142427` | Official README, reference/keyframe mode distinction, system stages; no checkpoints downloaded |
| [MPFB](https://github.com/makehumancommunity/mpfb2/tree/6ff1eb358f6c1959ced77e79e6dd2406d9a71f49) | HEAD `6ff1eb358f6c1959ced77e79e6dd2406d9a71f49` | ClothesService documentation and `src/mpfb/services/clothesservice.py` source text |
| [RGB MoCap candidate](https://github.com/toyxyz/toyxyz_RGBMocap/tree/75cda26531b47f41c75d4aa4a82c4f135daa6eea) | HEAD `75cda26531b47f41c75d4aa4a82c4f135daa6eea` | Official README, model guide and third-party notices; no application execution |
| [Blender render-pass source](https://github.com/blender/blender/blob/67e5a5f874cf37e2a114cebd24f219d8c44a16ad/source/blender/makesrna/intern/rna_scene.cc) | HEAD `67e5a5f874cf37e2a114cebd24f219d8c44a16ad` | RNA fields for position, normal, object/material index and Cryptomatte passes |

The RGB MoCap repository is a publicly identifiable candidate, not a verified identification of any privately described project or exact software version. Blender manual pages could not be retrieved through the web reader; the official source text confirms pass controls, but no render was produced to qualify their sampling or accuracy.

## 1. A motion-reference video is not an exact pose contract

The official [MiniMax H3 overview](https://github.com/MiniMax-AI/MiniMax-H3/blob/199b7d0e1fd95e7b3eafa8c15eca692534142427/README.md) distinguishes first/last-frame generation from multimodal reference generation. Its reference mode accepts image, video, and audio evidence. Its Context-IR stage interprets the input relationships before generation; the [Context-IR endpoint](https://platform.minimax.io/docs/api-reference/video-generation-v2-h3-context-ir) returns an enhanced prompt, not a generated video. Those are external MiniMax capabilities, not a declaration that PixelLab exposes the same fields.

The live PixelLab `AnimatePixminimaxRequest` exposes these fields:

```text
first_frame, last_frame, description, frame_count, seed,
no_background, drift_threshold, enhance_prompt, direction,
view, subject_description, initial_pose
```

The required fields are `first_frame` and `description`; undeclared properties are disallowed. The live and vendored versions have the same property names and required fields for this request. The live description permits frame counts in multiples of four from 4 through 40, at up to 256 by 256 pixels, with an optional same-size last frame. This check found no pose-video, reference-video, skeleton sequence, or separate garment-reference field in that request. It does not establish parity for every provider interface or future release.

In PixelDoll, [rawClip](../../app/src/lib/rig/clips.ts) sends the exact reference bitmap, its reference joints, and the stored sequence of target joints. [Item posing](../../app/src/lib/items/items.ts) uses that same target sequence, including padded coordinates for held gear. The [rig contract](../../app/src/lib/rig/rig.ts) preserves per-direction source provenance and poses.

**Consequence:** a video model following a colored skeleton may produce recognizable movement while changing timing, camera, silhouette, limb lengths, or local pixel placement. Even perfect joint adherence would not alone prove exact body or garment boundaries. Preserve the motion/video as authoring evidence until frames are frozen, measured, and qualified. Do not substitute a second independently generated dressed clip for an already approved bare clip and assume they align.

## 2. Endpoint dressing is a candidate source, not a modularity result

A still character and an adjacent same-scale garment can be supplied as a single image layout, then an animation prompt can ask for a dressing event. Keeping a final frame is a plausible low-cost hypothesis for obtaining a standing design. Physics language might improve perceived drape, but describing gravity or cloth physics does not establish a physical simulator or exact clothing-to-body correspondence.

Important failure modes remain:

- The reference layout can leak into the output as a second object, background residue, or incorrect clothing scale.
- A visually plausible final frame can change protected anatomy, resting pose, face, palette, camera, or canvas registration.
- A tunic may lose a motif or introduce skin-colored fragments that survive key removal.
- The last frame may still be settling; choosing a favorable interior frame after seeing results introduces selection bias.
- Discarding most generated frames does not make those frames free. Actual cost includes rejected candidates, extraction, repairs, and subsequent motion generation.

Compare this hypothesis to the existing allowed edit and reference-transfer routes using the **same body, garment design, facing, native pixel grid, and acceptance rules**. Predetermine whether the final frame or a separately declared selection rule is evaluated. Keep all candidates and include failures in cost per accepted layer. Freeze an accepted design before posing it through existing stored motion. Any new default needs a representative paid comparison, not a single pleasing endpoint.

## 3. Chroma-keying a freely generated clip does not restore lost correspondence

Chroma keying addresses color separation. It cannot ensure that independently redrawn clothes fit another animation's frozen body, recover hidden surfaces, distinguish every skin-like pixel from fabric, or preserve view-dependent depth. A valid gear layer must also satisfy its target cell, timing, pivot, body-cut and ownership contracts.

PixelDoll already uses chroma preprocessing, registration, extraction, gates, and per-clip fallback through [items.ts](../../app/src/lib/items/items.ts) and [run.ts](../../app/src/lib/items/run.ts). The current [chroma research](tool-spikes-2026-11-06-chroma-and-occlusion.md) demonstrates why a successful key-retention measurement is not proof of correct semantic extraction.

The useful hybrid is to select or author motion once, freeze it, then reuse its exact target poses and frame identities for equipment. A general video can supply motion inspiration or a new base candidate; its generated body must be accepted as a new frozen asset before fitting equipment. Clothing motion such as flutter can still be generated inside trusted constraints, but it needs separate visibility, silhouette and temporal review.

## 4. Parametric bodies offer correspondence and fit metadata

[MakeHuman's basemesh documentation](https://static.makehumancommunity.org/mpfb/docs/assets/basemesh_and_helpers.html) explains that body-shape changes preserve vertex/face topology and use helpers for joint locations and clothing fitting. This is a reusable correspondence mechanism, not evidence that a garment fits every silhouette without a refit.

[MPFB's ClothesService](https://github.com/makehumancommunity/mpfb2/blob/6ff1eb358f6c1959ced77e79e6dd2406d9a71f49/docs/services/clothesservice.md) and its inspected source separate clothing fitting, weight transfer, optional sub-rigs and underlying body hiding. A clothing vertex maps to basemesh vertices with weights and offsets. `fit_clothes_to_human`, `interpolate_weights`, `set_up_rigging` and `update_delete_group` implement distinct responsibilities. That separation is more useful to PixelDoll than treating a voxelized body as the whole solution.

The official [modeling guide](https://static.makehumancommunity.org/mpfb/docs/characters/modeling.html) explicitly requires refitting attached assets after body shape changes, either manually or through automatic refit. The [rig creation guide](https://static.makehumancommunity.org/mpfb/docs/randomization/creation.html) also describes clothing assets receiving matching sub-rigs. These are checks against assuming that one skeleton or equal image dimensions establish cross-body compatibility.

**Transfer hypothesis:** author body families with known local coordinates, coverage rules, and material owners, then render a fixed set of directions and poses. Use those assets as ground truth, reference evidence, or approved imports. PixelDoll should retain its distinction between shared designs and character-fitted layers. Reusing concepts does not authorize copying GPL/AGPL code into the MIT client: [MakeHuman's license page](https://www.makehumancommunity.org/about/license.html) distinguishes source licenses from the CC0 core assets; contributed assets require their own provenance review.

Voxelization is one possible style representation. It is not established here as a requirement for this process or as a solution to low-resolution eyes, outlines, or authored shading. Test direct pixel-grid rendering and geometry-derived masks alongside voxel rendering rather than choosing voxelization from an attractive composite alone.

## 5. Use 3D passes as independent evidence

The inspected [Blender source](https://github.com/blender/blender/blob/67e5a5f874cf37e2a114cebd24f219d8c44a16ad/source/blender/makesrna/intern/rna_scene.cc) declares position and normal passes, object/material index passes, and object/material/asset Cryptomatte controls. These establish available representations, not a measured paper-doll accuracy result.

Potential offline uses are:

- Independent gear/body/material labels for testing same-RGB ownership collisions and color-key extraction.
- Depth and per-frame visibility for front/back gear passes and hands crossing clothing or weapons.
- Controlled camera, timing, pivot and contact witnesses for projected rig conversion.
- Known hidden geometry for testing whether a visible-only extracted item incorrectly claims arbitrary recombination.

Those labels are ground truth for the rendered fixture and its sampled geometry. They do not automatically label AI-stylized pixels, which may move or invent boundaries. Any transfer of labels to a generated result needs separately validated correspondence and an uncertainty policy.

Normals encode surface orientation, not semantic clothing ownership or an artist's finished palette ramps. AI-generated textures still need a stable mapping to geometry and a separately evaluated lighting/palette policy. A raster normal image is not the same input as raw Skeleton v3's per-joint depth. Do not add unsupported depth, normal, or pose-video fields to a PixelLab request.

Native-resolution rendering also needs qualification: camera projection, subpixel phase, coverage sampling, transparent RGB, nearest-neighbor display, and engine export can affect one-pixel details. Preserve authored face and eye evidence as a separate quality target; body similarity must not dominate the score for those small regions.

## 6. Motion capture and body proportions

The candidate [RGB MoCap model guide](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/docs/models/README.md) documents reconstruction, optional contact correction and exported FBX/BVH/Blender motion. Its model-specific input and output limitations differ; a live tracking preview is not automatically an exportable corrected clip. This spike did not verify its output against PixelLab or identify it as the exact origin of any example.

The project's [third-party notices](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/THIRD_PARTY_NOTICES.md) distinguish the wrapper's MIT code from restricted model weights, body data and other components. Treat this as an authoring-tool lead requiring component-level review, not a ready MIT pipeline dependency.

PixelDoll's [motion.ts](../../app/src/lib/rig/motion.ts) already contains source/target calibration, exact XY reference lifting, per-body segment lengths, projection, two-bone solving and unreachable-target diagnostics. [planting.ts](../../app/src/lib/rig/planting.ts) handles authored contact adjustment. [Imported-rig setup](../../app/src/lib/rig/setup.ts) measures frozen input frames and records provenance. These are existing mechanisms to challenge and extend, not missing code to recreate.

Body families should be evaluated by proportions and supported movement, not only an age label. A common 18-joint vocabulary does not make an adult walk natural on a much shorter body or guarantee a garment's fit. Preserve character-relative handedness, foot support, stride, contact timing, camera elevation and facing; qualify facial details and frame occupancy independently. Actual low-resolution anatomy and hidden joints may make some conversions ambiguous, in which case review or a separately authored motion is preferable to an unreported fallback.

## Ranked experiments and acceptance criteria

| Priority | Experiment | Fixed evidence and controls | Reject or abstain when |
| --- | --- | --- | --- |
| 1, offline | Imported/frozen body-family motion replay | Existing public clips; per-body reference joints, camera, scale and contacts; all supported test facings; current shared retargeting helpers | Required source/target metadata is missing, fitting changes an existing frozen base, contacts become unreachable, or visible registration is worse despite acceptable joint averages |
| 2, offline | Independent owner/coverage benchmark | Small public or synthetic gear/body scenes with hand-authored labels; same-RGB owners; hidden sleeves, cape and held-item overlap; current extraction as baseline | A favorable composite hides body repaint, removal of an occluder reveals missing gear, or an item depends on the prior outfit's body cuts |
| 3, offline/native authoring | Direct versus voxelized rendered evidence | Same licensed geometry, poses, camera, grid, palette and owner IDs; direct render versus voxel representation; face/eye and motif regions scored separately | Tiny-detail or palette loss outweighs consistency; owner masks are resampled inconsistently with beauty frames; no native execution is available to validate claims |
| 4, paid only after offline plan | Endpoint-dressing prompt ablation | Public/synthetic standing body and same-scale garment reference; plain dressing versus cloth-settling language; existing allowed edit/transfer control; multiple bodies, views and seeds | Final recomposition changes protected frozen-body pixels, endpoint pose/camera drifts, design details fail, extraction does not fit the frozen body, or accepted-layer cost is worse. Measure raw provider body deviations against the controls and current gates separately; do not impose an unstated zero-change raw-output rule |
| 5, paid only after standing approval | Pose the accepted endpoint design on frozen motion | Same accepted layer, body, source pose, target poses, palette policy and view across routes; compare retained raw and extracted output | Standing appeal does not survive action extremes, key violations or depth conflicts appear, or fitted copy cannot be swapped with its intended body |

For every experiment, retain source and output hashes, exact sanitized requests, all requested results, failure classifications and actual receipts. Evaluate cost per **accepted fitted layer/clip**, including rejected samples and repair work. Never infer current PixelLab prices from an external workflow's credit display or a historical generation-count claim. Use the app's current quote and reconcile provider billing without automatically retrying unknown paid outcomes.

## Production disposition

Do not switch the current default to freely generated keyed clothing clips, add external H3 serving, or promise cross-body apparel from these examples. The current allowed PixelLab routes and client-only architecture remain in force. The immediate value is better experimental separation: reference design, fitted standing art, frozen body motion, semantic ownership, geometry evidence, and rendered appearance each have their own provenance and acceptance criteria.

The next implementation should follow a reproduced failure or successful controlled comparison. Existing pose metadata, fitted-copy signatures, extraction and review helpers should be reused. Native 3D authoring, motion-tool execution, endpoint-dressing quality and claimed savings remain unverified by this spike.
