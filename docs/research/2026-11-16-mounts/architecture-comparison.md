# Mounting architectures: independent comparison

Date: November 16, 2026. Status: research and planning only.

Tracking: [Compare and test runtime mounting architectures](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=307571999).

## Decision

**For PixelDoll's existing frame-based wardrobe, the strongest supported candidate is reusable mounted rider artwork with runtime seat attachment and art-controlled overlap. Automatic leg masking is an optional technique to qualify, not the architecture to assume.** A full live skeletal or 3D renderer is more flexible at runtime, but only after more asset preparation or a different source pipeline.

Do not implement a mount slot, renderer, new chroma scheme or public API based on this document. First qualify reusable rider artwork and compare the simplest overlap recipe against any proposed splitter on the same reference cases.

## Scope and method

The initial council examined historical sprite mechanisms and a skeleton-mask hypothesis. After the user challenged that framing, two fresh Opus 5.5 medium reviews independently compared alternatives, counterarguments and preparation costs. The coordinator checked additional primary sources and corrected the probe when a reviewer found its synthetic mask radius unfairly narrow.

This is a systematic comparison of rendering families, not an exhaustive census of every game. Community clients and decompiles establish the behavior of the inspected code, not necessarily all official versions. Unsupported leads are excluded from the recommendation.

Four questions must stay separate:

1. Can game logic attach an entity to a seat?
2. Can the renderer interleave prepared surfaces correctly?
3. Does the art provide a believable seated body, equipment and contact?
4. Can users obtain that prepared art with little work?

Evidence for the first two does not establish the last two. A generic API can accept many prepared assets without guaranteeing that arbitrary images fit physically or visually.

## Comparative evidence

| Architecture                                      | Precedent                                                                 | Advantage                                                                      | Strongest objection for PixelDoll                                                                            | Judgment                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Shared mounted/sitting actions plus seat points   | ClassicUO, MapleStory-compatible client, OpenStarbound                    | Independent wardrobe frames and exact pixels; preparation reused across mounts | Items need pose coverage; wide saddles, robes and contact can require variants                               | Best fit to qualify first                           |
| Reuse/splice existing action frames               | Graal data, LPC archive instructions                                      | Avoids some new rider art                                                      | Depends on compatible donors/proportions, explicit crops and exceptions                                      | Useful optimization, not universal baseline         |
| Prepared mount foreground/background around rider | Terraria, historical Stardew, OpenStarbound, MapleStory-compatible client | Simple runtime and engine-friendly composition                                 | One sandwich cannot express every leg, rein, cape and wing overlap                                           | Default where reviewed art permits                  |
| Separate rider limb passes                        | Spine renderer separation; LPC near-foot redraw                           | Mount can appear between legs without being owned by the doll renderer         | Needs reliable part ownership, not just joint positions                                                      | Conditional extension                               |
| Full cutout/skeletal renderer                     | Spine, Godot Skeleton2D, Unity Sprite Skin                                | Dynamic posing, part order and potential IK                                    | Prepared pieces, weights, hidden art and view coverage; pixel deformation quality is not free                | Strong greenfield choice, not a small mount feature |
| Automatic segmentation and raster/mesh warp       | Meta Animated Drawings, experimental pixel-skinning renderer              | Can reuse a flattened drawing                                                  | Landmark/segmentation errors, missing surfaces, shading/resampling; wardrobe and eight-view quality unproved | Research candidate                                  |
| Per-pixel depth/height sprites                    | NVIDIA depth sprites, GameMaker Z-tilting, Obsidian hybrid rendering      | General overlap within the supplied depth representation                       | Needs consistent depth and renderer/shader integration; does not create anatomy                              | General compositor, expensive missing inputs        |
| 3D source rendered into pixel frames              | Dead Cells developer account                                              | Real geometry can supply directions, ownership and depth                       | PixelDoll has raster outputs, not textured rider/garment meshes                                              | Different art pipeline                              |
| Live 3D with pixel-style rendering                | General skinned meshes/depth, not a newly verified mount game here        | Direct procedural posing and geometric overlap                                 | Full geometry/material/rig/IK pipeline; still needs reachable seats and constraints                          | Outside the current source contract                 |
| Replace mounted body/presentation                 | roBrowser mounted-class mappings; Pokemon bike sheets                     | Predictable art and simple playback                                            | Full outfit swaps introduce combinations or more layer artwork                                               | Fine for fixed designs, poor wardrobe default       |
| Hide rider/enclose seat                           | RPG Maker vehicles; OpenStarbound hide-parent behavior                    | Avoids visible leg problems                                                    | Does not deliver the exposed, recognizable rider requested                                                   | Valid transport design, not this result             |

These are qualitative tradeoffs, not measured quality scores. No comparative runtime timing or paid-generation cost study was performed.

## Additional sources beyond the first survey

### Starbound-compatible rendering

[OpenStarbound StarHumanoid.cpp at aa42287](https://github.com/OpenStarbound/OpenStarbound/blob/aa42287/source/game/StarHumanoid.cpp) selects named sitting/lying frame states for the humanoid and clothing. [StarVehicle.cpp](https://github.com/OpenStarbound/OpenStarbound/blob/aa42287/source/game/StarVehicle.cpp) orders back, passenger and front content. The council traced lounge orientation and seat placement in this community source. This supports side-view clothing with prepared poses, not runtime reconstruction of arbitrary legs. Fork-specific extensions should not be attributed to the original release.

### Dofus: binding and animation policy

The [decompiled RiderBehavior.as at 2f82791](https://github.com/Emudofus/Dofus/blob/2f82791/com/ankamagames/dofus/types/entities/RiderBehavior.as) receives parent direction and remaps selected animations, including mount locomotion, to rider-specific behavior. The council also found mount-driver binding categories and emulator claims about multiple rider skeletons. Those specific skeleton counts were not established independently in original asset data and are not decision premises. Vector/rigged art is different from frozen raster layers.

### Soulbound: reduce new pose work, not all preparation

The developer's [character and cosmetic system account](https://soulbound.game/news/how-we-built-a-pixel-art-character-and-cosmetic-system/) describes hand-drawn gear fitted to a common skeleton and reusing existing frames while adding sitting leg pieces. This is a developer-described customization/sitting precedent, not a source-verified mount renderer or zero-preparation claim.

### Actual live skeletal inputs

[Spine's image guide](https://en.esotericsoftware.com/spine-images) requires separate art for independently moving parts. Its [skins](https://en.esotericsoftware.com/spine-skins) reuse animation across prepared attachments, and [renderer separation](https://en.esotericsoftware.com/spine-unity-rendering#Objects-Between-Skeleton-Parts) allows objects between parts. [Unity Sprite Skin](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.0/manual/SpriteSkin.html) deforms rigged, weighted meshes. [Godot's skeleton tutorial](https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html) requires polygons, bones and weights and discusses bend artifacts.

These are real runtime alternatives. None says eighteen keypoints automatically turn existing garments into clean, complete limb attachments. A cutout rig can reuse part art across many animation frames; it still needs appropriate views and otherwise hidden surfaces.

### Depth is a real alternative to fixed passes

[NVIDIA GPU Gems 2, chapter 15](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-15-blueprint-rendering-and-sketchy) explains per-pixel depth sprites. [Obsidian update 79](https://eternity.obsidian.net/eternity/news/update--79-graphics-and-rendering-) combines pre-rendered background passes and dynamic 3D skinned characters for per-pixel occlusion. This is **not** a mount example or flat characters automatically acquiring depth.

[GameMaker's Z-tilting tutorial](https://gamemaker.io/en/blog/z-tilting-shader-based-2-dot-5d-depth-sorting) provides a shader-based height/depth technique. Its source representation and opaque-sprite limitations are not a drop-in contract for extracted transparent equipment. Lighting normals describe surface orientation, not complete geometry or hidden layers.

Depth avoids fixed small pass counts if both actors share meaningful depth coordinates. It still needs rider/mount depth and a seated silhouette. PixelLab currently supplies flat raster results, not reviewed per-pixel depth or live textured meshes.

### 3D authoring and learned decomposition

Dead Cells artist Thomas Vasseur's [first-person pipeline account](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-) describes exporting animated models to PNG frames and normal maps. This is authoring, not evidence that the game reposes final sprites into arbitrary mounts at runtime.

[See-through](https://arxiv.org/abs/2602.03749) infers semantic layers and inpaints hidden regions for anime illustrations. Learned preparation is possible, not physically impossible in principle. This research does not establish small-pixel palette fidelity, view/frame consistency, client-only feasibility or wardrobe-compatible mounts. No model or dependency was installed or tested.

### Source limits and unsuccessful leads

The council inspected [roBrowser at e4b5b53](https://github.com/vthibault/roBrowser/tree/e4b5b53) mount/job mappings and found separate mounted class sprite identities, but did not decode every name or inspect all mounted assets. This is body-variant evidence, not proof of exact compositing in every class. Super Mario World pose references are corroborative, not newly source-verified here. Wakfu and an unattributed mount-editor document produced no qualified technical evidence and were excluded.

## Challenge to our own test and proposals

The [mask probe](runtime-occlusion.md) tests one technique, not every architecture above. Its 171 successful reconstruction assertions follow from disjoint masks. They do not establish believable riding.

The first synthetic radius was narrower than its drawn legs. A radius sweep reduced side-view ownership error to zero in that simple oracle, with three diagonal pixels still mislabeled. The initial errors do **not** rule out skeleton-seeded segmentation. There is still no real-frame ownership ground truth or seated wardrobe validation.

The hidden-pixel counterexample constrains **reposing that reveals pixels**, not ordinary occlusion of an already-valid seated rider. It must not be used to reject interleaving that keeps those surfaces hidden.

One reviewer proposed different chroma colors for near/far mannequin legs. This is **unqualified**, not automatic ownership recovery: opaque clothing hides the keys, hems extend beyond the body, and PixelLab returns no semantic labels. A known source-part map can seed labels, but moving them through generated clothing still needs validation. Changing protected chroma keys also requires the existing paired paid A/B approval. No such change is authorized here.

## Best-supported direction for this product

1. Keep frame-based paper dolling. Reuse existing action poses when they pass; otherwise produce a reusable mounted pose family. The application should handle preparation rather than making each consuming developer redraw legs.
2. Use the simplest qualified overlap recipe: dressed rider, host-owned mount rear/front and a frame-specific seat. Do not require segmentation if art-controlled overlap works.
3. Add rider partitions only for preserved failures. Compare reviewed masks, skeleton-seeded segmentation and suitable donor-frame reuse against the same seated references. Select by errors and correction burden, not novelty.
4. Keep mount rendering external. A future rider API supplies placement, pose sampling and only the necessary rendering outputs. Mount overlap information can stay host-owned in prepared passes or enter as matte/depth data. Not rendering a mount is different from knowing nothing about its shape.
5. Promise compatible mount families, not arbitrary images. A seat point does not specify saddle width, hand reach, projection, clothing drape or wing overlap. Eight directions require qualified artwork, not just eight facing labels.

For a greenfield product prioritizing procedural poses over existing pixel fidelity, prepared cutout or 3D rigs deserve first consideration. Here, their pipeline changes outweigh the evidenced benefit. That is a scope/quality judgment, not a claim those alternatives are incapable.

## Validation before implementation

- Compare methods on the same seated references, outfits, mounts and directions. Standing frames are a negative baseline, not the acceptance set.
- Establish hand-reviewed part/overlap truth first. Measure false-hidden near pixels, visible far-leg remnants, contact, seams and temporal changes, not just mask identity.
- Cover eight views, standard/slender/chibi proportions, trousers/boots, robe, cape and asymmetric/oversized held items. Vary narrow/wide seats within physically plausible scales.
- Compare ordinary foreground art against reviewed rider passes before depth or warping. Record unsupported combinations rather than hiding failures.
- Measure correction work per pose, item and mount, and how much transfers to another mount. No authoring-time claim is justified yet.
- Choose a public contract only after those gates, then follow native export parity. Paid experiments, production implementation and mockups remain separate steps.

**Conclusion:** researched games and tools make mounting general by standardizing inputs, supplying pose art, part data or geometry, and composing it at runtime. No inspected source establishes high-quality zero-preparation mounting from arbitrary flat paper-doll art for arbitrary mounts, sizes and projections.
