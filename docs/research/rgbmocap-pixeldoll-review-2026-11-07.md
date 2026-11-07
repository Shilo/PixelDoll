# RGB MoCap and PixelDoll motion authoring

November 7, 2026. Research and source review of a public RGB-video motion-capture project, its conversion requirements, and possible value to PixelDoll. Companion: [hybrid body, clothing, and motion review](hybrid-body-motion-review-2026-11-07.md).

## What it is and what it could improve

RGB-video motion capture means estimating a person's three-dimensional movement from ordinary color video. It does not mean that the input must already be a red/green/blue stick-figure animation. A colored skeleton video is a rendered representation of movement; it is different from structured joint coordinates with names, timestamps, units, and a reference pose.

The strongest public name match found is [toyxyz RGB MoCap](https://github.com/toyxyz/toyxyz_RGBMocap/tree/75cda26531b47f41c75d4aa4a82c4f135daa6eea), pinned at `75cda26531b47f41c75d4aa4a82c4f135daa6eea`. Its official README describes a Windows application that reconstructs human motion from video, reviews and corrects contacts, retargets humanoid characters, and exports motion. This is the most likely project to investigate, not proof that a privately described workflow used this exact repository or revision.

Its plausible value to PixelDoll is **authoring better reusable movement**: capture or correct one motion, convert it to PixelDoll's existing representation, qualify it on target body families, freeze the accepted poses, and reuse those poses for equipment. It is not an outfit generator, a transparent-layer extractor, a PixelLab integration, or evidence that independently generated clothing will match a frozen animation.

## Scope and acquisition status

This review read official documentation and selected pinned source text. It queried the public repository tree and HEAD, inspected PixelDoll's current motion conversion/lab code, and compared public API contracts in the companion spike. It did not install RGB MoCap, download models or body data, run its source, reconstruct footage, produce an FBX/BVH, or purchase generations. Runtime quality, GPU requirements on this machine, export correctness and improved PixelDoll outputs therefore remain unverified.

The source text reviewed includes:

| Pinned file | Relevant mechanism observed |
| --- | --- |
| [retarget/source.py](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/mocap/retarget/source.py) | Prepares source rest/motion, validates recorded frame rate, and preserves contact data separately from motion |
| [retarget/mapping.py](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/mocap/retarget/mapping.py) | Maps 22 body bones for supported humanoid families; rejects missing, duplicate or ambiguous mappings and invalid roots |
| [retarget/calibration.py](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/mocap/retarget/calibration.py) | Separates source bind removal and a virtual leg reference; reorients outgoing bone frames while asserting unchanged joint centers |
| [retarget/foot_calibration.py](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/mocap/retarget/foot_calibration.py) | Builds sole reference frames from registered foot geometry; rejects degenerate geometry |
| [retarget/pipeline.py](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/mocap/retarget/pipeline.py) | Uses the source frame rate, scales through target/source leg lengths, preserves a rotation-only control, and applies contact/pose corrections |
| [source_bvh.py](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/mocap/source_bvh.py), [export.py](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/mocap/export.py) | Serializes hierarchy, channel order and frame time; export metadata records units, up axis and rotation order |

These are source observations, not successful reproductions. A solver's source assertion is useful to inspect but is not a test result from this review.

## Documented workflow, constraints and licensing

The [official setup overview](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/README.md) requires Windows, a compatible NVIDIA environment and OpenGL support. Setup prepares separate runtimes and supporting tools; weights and registered body files are acquired separately. Some optional pipelines require additional native build tooling. This is an authoring workstation workflow, not a browser-only dependency suitable for embedding in PixelDoll.

The [model guide](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/docs/models/README.md) separates ExMR, FlowHMR, GVHMR, multi-view MAMMA, PromptHMR and experimental PEAR live tracking. They do not have interchangeable camera, tracking, finger, correction or export capabilities. In particular, a live preview does not establish recorded/exportable corrected motion.

The [user guide](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/docs/USER_GUIDE.md) documents FBX/BVH and portable Blender exports, contact-preserving retargeting, and remaining problems with unreachable targets or substantially different proportions. Clothing and hair physics are not simulated. The source rest/bind pose remains distinct from the first animation frame. A colored preview alone loses most of that metadata.

Treat the project's [performance records](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/docs/PERFORMANCE.md) as measurements under their stated hardware, clip, phase and memory conditions. They do not establish minimum hardware or speed on another computer, and lower GPU memory can trade against system memory or elapsed time. This review did not reproduce those results and makes no universal model-quality ranking.

The [third-party notices](https://github.com/toyxyz/toyxyz_RGBMocap/blob/75cda26531b47f41c75d4aa4a82c4f135daa6eea/THIRD_PARTY_NOTICES.md) are consequential: the app's own MIT code does not relicense its reconstruction models, weights, registered body/hand data, Blender components, or optional dependencies. Some listed components have noncommercial or registered-access terms. A motion captured with a permitted setup is a different question from distributing the reconstruction stack or its body assets. Obtain component-specific permission and provenance before a commercial pipeline or distributable preset library. This is a technical provenance requirement, not a legal determination for a particular asset.

## What PixelDoll already has

PixelDoll is not starting from an absent motion-conversion pipeline:

- [motion.ts](../../app/src/lib/rig/motion.ts) defines `MotionClip` as reference geometry, timestamped poses, contact weights, events, timing and source identity. Its coordinates are anatomical-left +X, up +Y and forward +Z. It calibrates a target's visible reference joints, preserves target segment lengths and reports unreachable or out-of-bounds cases.
- [planting.ts](../../app/src/lib/rig/planting.ts) supports authored contact adjustment, and the [Motion Lab model](../../app/src/ui/motion-lab/model.ts) carries per-body camera, source reference artwork, sampled times, durations, edits and provenance.
- The offline [GLB reader](../../spikes/api/mocap/glb.mts), [source conversion](../../spikes/api/mocap/mocap.mts) and [Motion Lab bake](../../spikes/api/mocap/bake-motion-lab.mts) already sample a licensed 3D motion library into the shared representation. That specific bake is not a general RGB MoCap BVH/FBX importer.
- [Imported-rig setup](../../app/src/lib/rig/setup.ts) measures keypoints on already frozen raster frames. It is distinct from importing arbitrary 3D motion. The Studio's ordinary import workflow must not be described as accepting RGB MoCap's 3D files merely because both workflows use the word import.
- [rawClip](../../app/src/lib/rig/clips.ts) and [item posing](../../app/src/lib/items/items.ts) consume stored reference and target keypoints. Once a new motion is qualified, that shared pose sequence is the important connection to modular equipment.

The [earlier motion diagnosis](2026-10-27-animation-diagnosis.md), [targeted authoring](2026-10-28-motion-targeted-authoring.md), [custom Skeleton v3 study](2026-11-01-custom-skeleton-v3.md), and [motion closeout](2026-11-02-animation-closeout.md) already examine contact, camera, proportion and provider-rendering failures. A new motion source must beat or extend those controls rather than restart the same source-conversion experiment under a new tool name.

## The conversion contract that still needs qualification

Exported FBX/BVH is useful structured evidence; it is not ready-made PixelLab keypoints. A narrow offline adapter would need the following explicit contract before production integration is justified:

1. **Identity and rights:** exact source export hash, capture/source provenance, reconstruction/correction settings, export format, permitted use and source revision. Keep original and corrected motion distinct.
2. **Hierarchy and bind:** evaluate parent transforms and local rotations against the actual reference/bind pose. Select the intended skeleton/actor. Do not substitute the leading T-pose or first sampled pose for a documented bind frame accidentally.
3. **Coordinates:** read or validate length units, handedness, forward/up axes, rotation order, root origin and camera. Apply a single documented conversion into PixelDoll's basis; verify it with asymmetric left/right probes and an explicit forward direction.
4. **Joint meaning:** map semantic anatomical joints to PixelLab's 18 labels. Source shoulder/clavicle and ankle/toe positions are not interchangeable. Head bones alone do not directly observe PixelLab's eyes, ears and nose; declare proxy offsets or use reviewed target anatomy, and keep that uncertainty visible.
5. **Time and root:** preserve source timestamps and contact intervals before sampling. Choose in-place versus traveling motion deliberately, record sample times and playback durations, and distinguish loop closure from duplicated endpoints. A frame count reduction is not a license to drop a kick impact or stance transition.
6. **Per-body fit:** retarget segment lengths and camera against each frozen body. Check foot support, hand reach, root height, stride and facing. A child-proportioned or stylized body may need different motion, not simply a scaled adult trajectory.
7. **Projection and pixel grid:** generate normalized target keypoints, joint depth where supported, bounds and pivot from the exact target canvas. Verify body occupancy, one-pixel shifts, padding and camera projection without silently moving approved artwork.
8. **Provider output:** keep the requested skeleton and measured rendered evidence distinct. Test body silhouette, facing, soles, grip and garment motifs after rendering. Matching joint arrays does not prove that two stochastic body and gear renderings match pixel for pixel.

Do not add a broad binary importer, automatic humanoid remapper, or another backend before a real export demonstrates that this source provides missing value. A one-source authoring adapter that emits the existing `MotionClip`/lab representation is a smaller experiment. Running reconstruction locally does not remove PixelLab's paid rendering cost or guarantee portable fitted gear.

## Source mechanisms worth challenging against our implementation

| Mechanism | What could transfer | What must be disproved before adopting it |
| --- | --- | --- |
| Explicit bind removal and bone-frame calibration | Separately inspect orientation/roll versus actual joint-center motion, especially foreshortened limbs and weapon-hand orientation | A fix that changes a displayed bone axis may not improve 2D silhouette or contact; never overwrite the frozen target rest artwork |
| Sole geometry rather than ankle height alone | Author reviewed heel/toe or sole witnesses and distinguish foot contact from the silhouette's lowest pixel | A 3D mesh sole is not automatically the visible sole of an AI-rendered sprite; validate rendered correspondence and camera separately |
| Contact timings retained through retargeting | Reuse approved timing/events across body variants and compare target-specific reachable contact positions | Retaining timing can still make a different body slide, reach impossibly or appear unnatural |
| Original, rotation-only and corrected controls | Attribute an improvement to calibration, root/contact correction, or model capture rather than blending all changes into one result | A lower contact error can damage arm pose, ground clearance, shape or timing; score those tradeoffs independently |
| Explicit failed/ambiguous mappings | Fail with actionable diagnostics rather than guess missing joints, actor identity, handedness or bind pose | Do not require an expensive reconstruction when a licensed existing motion already solves the same authoring problem |

These mechanisms are informed by the inspected source. They are not recommendations to copy its solver wholesale or claims that PixelDoll lacks equivalent partial mechanisms.

## Next discriminating experiment

Start with an existing licensed motion and frozen body family to establish an offline conversion control. Then use one legitimately obtained RGB MoCap export, with original and corrected versions if available, through a narrowly reviewed authoring adapter. No new capture or PixelLab generation is required merely to inspect that export's structure.

Compare four conditions where the source data supports them: the existing motion control, RGB source motion before correction, the same RGB motion after source correction, and target-body contact adjustment using PixelDoll's existing helpers. Hold the target artwork, reference joints, camera, sample times, direction, pivot and motion gain constant. If a source export lacks bind or correction provenance, label the condition unavailable rather than invent it.

Use at least two substantially different body proportions and a front/side view, with an asymmetric hand action or kick as a handedness/depth probe. Measure segment-length preservation, rest reprojection, source/target contact timing, foot/sole motion, unreachable targets, framing and loop discontinuity. Show native-scale puppet/proxy playback for review. Proxy improvements qualify motion geometry only; subsequent body and gear rendering still need their own tests.

If the RGB source offers visibly better authoring evidence or easier correction than the existing licensed library, a controlled paid pilot can render the exact frozen pose sequence through the allowed PixelLab route and evaluate a tunic plus asymmetric held gear. Keep accepted-layer cost, pose/body/motif fidelity and failed samples. If it merely duplicates motion already available with simpler provenance, document that negative result and retain the existing route.

## Recommendation

Investigate RGB MoCap as an optional **offline motion-authoring source**, especially for custom actions and contact editing. Do not expose its model choice, installation or reconstruction stack in the casual PixelDoll workflow based on this review. Do not promise it fixes outfit consistency, cross-body fit, cloth physics or paper-doll extraction. The next useful proof is an actual permitted export whose calibration/contact evidence improves our existing motion pipeline under controlled offline comparison.
