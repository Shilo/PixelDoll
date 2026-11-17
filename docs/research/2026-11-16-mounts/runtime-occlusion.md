# Runtime rider occlusion: research and offline probe

Date: November 16, 2026. Status: research complete; production implementation not approved.

Tracking: [Test skeleton-guided runtime mount occlusion](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=307571999).

**Broader decision:** [Architecture comparison and challenged recommendation](architecture-comparison.md). Masking is one candidate, not the premise of that decision.

## Short answer

**A rider-only runtime can expose parts that the host draws on either side of its mount. This is worth qualifying. Automatic skeleton masks do not establish a universal, high-quality standing-to-riding conversion.** Separate correct occlusion from creating a believable pose.

For a side view, draw the far-leg rider pass, the mount, then the remaining rider. A far leg is not permanently erased: the mount naturally covers only the pixels it actually overlaps. An optional mount foreground pass or supplied occlusion matte handles its neck, wing or saddle. PixelDoll need not render the mount to participate in that contract.

The practical candidate is **reusable rider poses plus reviewed part masks, runtime attachment and host-owned mount rendering**. Try suitable existing action frames before requesting new rider art. If they fail, author one riding pose family per direction and fit equipment to that family, not separately to every mount.

No technique inspected or tested establishes arbitrary characters, arbitrary clothing, arbitrary mount sizes and all eight directions without fitting data or review. Do not market that promise.

## What the council found

Two independent Claude Opus 5.5 medium reviews researched precedents and challenged the proposed API. The coordinator rechecked the linked Graal data, MapleStory-compatible source, Spine documentation, Animated Drawings source and LPC archive instructions, and ran the offline probe below.

### Graal: reusable action poses, not a leg-erasing instruction

The [pinned third-party ride.gani copy](https://github.com/MorenoLand/GScript.Suite/blob/170a457220b5894b7a9b9148d381669481474e56/ganis/ride.gani) selects full 32 by 32 body cells from lifting/grabbing actions. There is no lower-body clipping command. The council reconstructed its frames using the matching body and horse sheets: tucked chibi legs make the illusion work, with the rider drawn after the horse. This does not authenticate original-client behavior or every shipped asset version.

**Takeaway:** existing action frames can be enough for compatible proportions. Graal does not prove generic skeleton-based leg deletion.

### LPC: the left/right mechanism is a crop-and-redraw recipe

The author's [0.9.0 archive](https://opengameart.org/sites/default/files/LPC_ride_0.9.0.zip), `HOWTOUSE.txt`, describes separate horse foreground/background images, upper-body crops and lower-body donor strips. Side views borrow the bottom of a male thrust frame. After the foreground horse, additional foot-only column crops restore the visible near leg. North/south use cast-pose strips instead. Offset tables coordinate the gait. The [author's page](https://opengameart.org/content/lpc-horse-riding) discloses incompatible long garments and appendages.

**Takeaway:** runtime splicing can work when source anatomy and equipment are standardized. It is not simply hiding one leg in arbitrary standing art. The archive is artwork plus prose instructions, not an executed implementation in this spike.

### MapleStory-compatible client: a strong external-asset precedent

In [pinned HeavenClient CharLook.cpp](https://github.com/neeerp/RustMS/blob/c7d785a69c0383db6c96400d0ff3727736ae4ab6/HeavenClient/Character/Look/CharLook.cpp), `rider_pose` selects SIT, or ROPE while climbing. `rider_shift` subtracts the rider's body contact from the mount's per-frame navel point. `draw_mounted` draws mount parts before and after the dressed rider.

This is community-client evidence, not Nexon's official source. It reuses authored sitting artwork; it is not evidence that sitting anatomy is synthesized at runtime. It is a side-view precedent, not eight-direction validation.

### ClassicUO: authored riding artwork remains relevant

The [earlier verified ClassicUO sources](README.md#ultima-online-an-equipment-mount-shared-riding-groups-and-a-separate-sitting-trick) use mounted groups and corresponding equipment art. Its procedural chair shear is a separate branch. This spike did not inspect original artist files, so it cannot claim artists specifically erased a far leg.

### Runtime segmentation and clipping do exist

[Spine's official rendering documentation](https://en.esotericsoftware.com/spine-unity-rendering#Objects-Between-Skeleton-Parts) explicitly supports inserting an object between skeleton parts using separated renderers. Its [bone-weighted clipping attachments](https://en.esotericsoftware.com/spine-clipping) clip selected draw-order ranges. These features assume prepared attachments and polygons; they do not infer anatomy from a flat sprite.

[Meta Animated Drawings](https://github.com/facebookresearch/AnimatedDrawings/blob/b859684857519c7424da51a0b0862fbd1fd258f4/animated_drawings/model/animated_drawing.py) assigns image regions to joints, deforms a mesh and orders groups by joint depth. It demonstrates that raster segmentation and deformation are possible. It does not validate exact small-pixel artwork, independent equipment, mounts or hidden-pixel recovery.

A separate [open-source pixel-skinning experiment](https://github.com/blackmoon87/canvas-sprite-skeletal-animation-js) documents manual side-view far-foot labels, prepared turnaround poses and mirroring restrictions. Its claims were not executed here. It is additional evidence that preparation matters, not a universal solution or a proposed dependency.

## Offline experiment actually run

### Inputs and method

- Four existing benchmark bodies: A, B, C and N, with 64, 80 and 160 pixel cells.
- Rest plus eight walk cells per supported direction: **171 frames**. Body B covers eight views, including three mirrored directions. This is low top-down coverage, not side-scroller or isometric qualification.
- Stored measured keypoints where available, otherwise stored generation keypoints. Source keypoints are not guaranteed pixel-accurate measurements.
- Capsules around hip-knee-ankle segments; nearest segment assigns candidate leg pixels. North/south deliberately have no far-leg split. This is one simple heuristic, not an exhaustive search of mask algorithms.
- A one-pixel horizontal perturbation of the left-leg joints tests boundary sensitivity. Mirrored cases derive source geometry and flip it consistently.
- Six existing item cases were extracted with the current benchmark pipeline, yielding 270 stored cells. Their intersections with the same body-space mask were measured, including a padded sword. The probe does not replace extraction or claim those source cases are defect-free.
- Plain ellipse mount silhouettes isolate overlap and size assumptions. They are not horse art, a riding-quality mockup or a proposed product visual.

### Results

| Check                                                          | Result                                    | What it establishes                                                           |
| -------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| Split and recombine unmodified body                            | 171 of 171 bit-exact                      | Disjoint raster splitting need not destroy source pixels                      |
| Mirror consistency                                             | 45 of 45 checked frames                   | This implementation mirrors its own source masks consistently                 |
| Opaque pixels near both leg segments with nearly tied distance | 73 frames                                 | Skeleton proximity alone leaves ambiguous ownership candidates                |
| One-pixel joint perturbation changes opaque-pixel membership   | 99 frames                                 | Small landmark changes can change which visible pixels are hidden             |
| Item/mask intersections                                        | 104 sampled item cells                    | A body-space mask also affects clothing and held-object pixels                |
| Hand-authored seated oracles, E and SE                         | Known masks preserve every near-leg pixel | Runtime interleaving works when ownership is supplied                         |
| Heuristic versus known seated masks                            | 27 and 32 pixel-label differences         | This capsule heuristic does not recover even these simple part labels exactly |

The item intersection count is **not** a count of incorrectly removed pixels. Some intersections are expected boots. The sensitivity count is **not** a visual failure rate. No hand-labeled ground truth exists for the real generated bodies, and these are not seated production garments.

**Council correction:** the first radius was too narrow for the synthetic five-pixel-wide legs. A radius sweep increased its minimum from 1.6 to 2.56 pixels, reducing the east oracle error from 27 to **0**, and the south-east error from 32 to **3**. Larger tested radii, 3.84 and 5.12 pixels, did not improve those results further. Thus the original oracle error is not evidence that skeleton-based segmentation cannot work. The seated figure now shows the tuned candidate; the real eight-direction contact sheet retains the original baseline. The wider radius was not validated against ground truth on real generated sprites.

The small oracle uses bent, separately colored legs and known ownership. It validates near-leg preservation with the mount in the middle, not believable production artwork. Its mismatch count includes all opaque disagreements, not just pixels hidden by that particular mount silhouette. Sensitivity and item counts are diagnostics, not accuracy measurements or comparisons against the other architectures.

A synthetic counterexample also passed: two different hidden-leg images produce the same flattened sprite under an opaque near leg. Removing or moving that near leg requires different missing pixels despite identical visible inputs. Therefore the flat sprite and joint locations do not uniquely determine the correct reconstruction. Extra art, labels or a generative prior can help, but masking alone cannot recover it. This constrains reposing or revealing hidden regions, **not** simply interleaving already-correct seated pixels while those regions stay hidden.

### Visual evidence

- [Eight directions: unsplit, guessed leg split and waist cutoff](evidence/eight-directions.png).
- [Same rider and mask on three fixture widths](evidence/mount-widths.png).
- [Seated source: guessed versus known labels](evidence/seated-oracle.png).
- [Per-frame measurements and assertions](evidence/results.json).

Visual review found remaining far-foot fragments in diagonal heuristic splits, unchanged straight-legged front/back silhouettes, and a torso-only waist-cutoff result. Changing the silhouette's width does not change rider anatomy. Those results reject this simple heuristic as an automatic open-saddle solution, not every conceivable segmentation or deformation method.

### Reproduce

From the repository root, with the existing app dependencies, Node 24 and Python with Pillow already available:

```powershell
node docs/research/2026-11-16-mounts/extract-fixtures.mjs
python docs/research/2026-11-16-mounts/probe.py
```

The first command reuses production extraction through the existing benchmark. Intermediate extracted cells go to ignored `temp.local/`. The second writes measurements and contact sheets under `evidence/`. Neither script imports an API client or makes a paid request. The figure labels use the Windows Arial font.

## Recommended runtime boundary, if later qualified

**Accept a mount relationship, not ownership of a mount renderer.** The host supplies the displayed direction and seat position, and draws its own art. PixelDoll supplies the dressed rider's transform and reviewed draw passes. This is a conceptual contract, not a shipped API or frozen schema.

1. Choose a supported rider pose/frame. Preserve the stored pivot and equipment alignment.
2. Place a wrapper so the rider's reviewed contact point meets the mount's seat. Use the displayed mount frame's seat offset for bob, not a second sine-wave clock.
3. Partition the rider using a reviewed label/mask map in common body coordinates. Automatically seeded skeleton masks are candidates for review, not trusted ground truth.
4. Let the host draw rider rear, mount body, rider front, then optional mount foreground. A more complex mount may need extra passes; do not silently promise two passes solve every design.
5. Alternatively accept an external occlusion matte plus a rider-region selection. A matte is data, not rendering mount art. A full mount alpha silhouette applied to the whole rider would also erase the near leg, so it is not enough by itself.

For strict partitioning, split the already-composed rider through one common spatial map. That preserves existing item composition exactly when recombined, but cannot move a weapon independently from the body pixel it overlaps. Per-item exceptions can improve weapon/cape placement, but can change established overlap and require separate reference tests. Do not claim identity merely because each individual layer has disjoint masks.

Mount-side minimum information is a compatible view/direction, seat placement and enough overlap information: existing front art, a matte, a depth field or an agreed restricted composition. Seat coordinates alone do not describe where the belly, neck, wing and saddle cover the rider. Deriving a useful first guess from alpha bounds is possible, but cannot settle semantic depth.

Preparation may be shared across all compatible mounts. A reviewed mask is data that controls runtime drawing; it is **not** baking the rider onto a particular horse. Mount profiles likewise should be prepared once per mount, not manually once per outfit. These are workflow goals, not measured authoring-time promises.

### Direction and scale rules

| Case                               | Required treatment                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| East/west                          | Explicit near/far policy or reviewed labels; preserve one resolved mirror convention                           |
| Diagonals                          | Review partial overlaps and foot fragments; do not extrapolate a side-view mask blindly                        |
| North/south                        | Neither leg is automatically the single far leg; use suitable pose and host foreground geometry                |
| Different proportions              | Keypoints can seed masks, but cannot validate pixel ownership or manufacture missing pose pixels               |
| Different mount sizes              | Seat height is not saddle width; require a compatible pose/scale envelope rather than stretching legs silently |
| Isometric or different camera tilt | Match projection separately from direction count; this probe supplies no evidence for it                       |
| Robes/capes/long weapons           | Explicit pose and overlap review, or declare that combination unsupported                                      |

Missing keypoints or unsupported directions must be reported, not silently treated as valid generic geometry. Optional authoring depth hints are not a complete per-pixel depth model.

## Council disagreements resolved

- One reviewer recommended shipping an occlusion splitter; the evidence supports a **qualification prototype**, not shipping yet. Correct identity checks do not prove correct anatomy or garment ownership.
- One reviewer said no host matte was needed because foreground art suffices. That is true for prepared split art, but a host-owned matte is a legitimate equivalent input when the mount is not already split. Neither representation removes authoring assumptions.
- MapleStory reuses SIT art. It should not be counted as a proof of mounting without seated artwork.
- A shared keypoint label vocabulary does not imply every imported/project/exported character has those points, or that the points identify pixel regions accurately.
- Exact automatic conversion for every input is not defensible. Existing-pose reuse, mask review and a reusable authored riding fallback are compatible, rather than mutually exclusive approaches.

## Next gates

1. Preserve these results as the rejected naive baseline. Do not tune a mask until it merely looks good on one elf side frame.
2. Compare a stronger segmentation candidate against hand-reviewed masks on an actual reusable riding pose, all eight views, plain clothes/boots, robe, cape and near/far held items. No universal claim without this ground truth.
3. Demonstrate the same dressed rider on two compatible mount fixtures, with per-frame seat motion and deliberate bad-order/one-pixel-offset negative controls. Report unsupported combinations.
4. If donor-frame reuse fails, separately approve a bounded generation/edit experiment for the rider, not a new generation per mount. No paid work was performed here.
5. Only after art and masking gates pass, add the smallest canonical rider partition/attachment capability and native export parity checks under the [runtime contract](../../architecture/javascript-runtime.md). Native exports may precompute pass textures while selection and attachment remain runtime operations.

No production API, Studio feature, runtime benchmark, engine rendering test, mesh-warp implementation or paid generation was delivered by this spike. Existing app check/test/E2E suites were not run because production code was unchanged.
