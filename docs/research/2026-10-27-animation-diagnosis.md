# Why the mocap animations looked uncanny, and what to do next

Research date: October 27, 2026. Scope: documentation and source audit, independent external-source research, offline reproductions, and a controlled live PixelLab pilot through the Codex browser. This is research, not adoption of a replacement pipeline. No production animation code, dependency, model policy, or saved character is changed.

Companion: [free motion assets and rigging libraries](2026-10-27-animation-rigging-sources.md).

## Finding

**There are real problems in our conversion, and a separate fall-sequence rendering failure remains after correcting its endpoint. The evidence does not justify blaming either the prompt alone or PixelLab alone.** In particular, the earlier conclusion that the revised retargeter produced “clean” or “correct” motion was too strong. We can reproduce inconsistent depth and a discontinuous foot switch without calling PixelLab at all.

The most useful next step is an offline, inspectable preset-authoring and calibration spike, followed by a small renderer qualification. Collecting more mocap or rerolling the same faulty skeleton will not repair the geometry. Quaternius remains a suitable CC0 input; current KayKit provides a useful independent CC0 comparison. Optional Three.js MIT tooling and original constrained pose math fit the client-only product better than embedding another animation engine.

## Evidence trail and scope

| Evidence inspected | What it establishes | Limit |
| --- | --- | --- |
| [S3 skeleton spike](../spikes/S3_skeleton_rigging.md), especially K1 and limitations | Early adherence, redrawing, repeated-pose smears, and nonidentical results with the same seed | Small original bodies and motion set; quality language is historical, not a professional-motion certification |
| [B7 integration report](../testing/B7_rig_v13_report.md) | Alignment and pipeline tests passed while an invented blade escaped the original gates | Pipeline correctness and low joint error do not establish natural animation |
| [Pipeline review](generation-pipeline-review-2026-10-25.md), sections 10-18 | Authored stiffness, round 7 mocap promise, round 8 rejection, round 9 alternatives, deferred product choices | Earlier rounds contradict one another if read without their dates and scope |
| [Lexingel comparison](lexingel-paperdoll-findings-round5-2026-10-25.md) | 3D renders and AI-dressed raster frames solve different problems; hidden geometry and equipment extraction remain important | A 3D route changes the art workflow; existing layer-error numbers do not imply exact layers |
| [Skeletal editing review](../reviews/2026-10-23-skeletal-tools-research.md), [pose lab proposal](../design/skeleton-pose-lab.md) | Reference calibration, desired poses, and raster repair are separate actions | The pose lab is proposed, not built; its universal-fit and lint claims are not validated |
| `spikes/api/mocap/{glb,mocap,retarget2}.mts`, `x27/moves.mts`, current `app/src/lib/rig/{poses,clips,skeleton}.ts` | The actual conversion, sampling, serialization, and production boundaries | Mocap tooling is an offline experiment; it is not the production motion preset library |
| Stored `spikes/api/out/x27/M1`, `M2`, galleries, request-pose JSON; `out/x26` and `out/x28` inventories | Actual old frames remain available locally, including the flailing slash and broken last fall frame | Generated evidence directories are ignored; they are not automatically retained by committing this report |
| Fresh public OpenAPI and API overview | Current raw skeleton-v3 and text-animation contracts | A beta contract is not an output-quality promise |

The external sub-agent researched asset and code licenses separately, then independently challenged the local retarget math. Its findings were reconciled with the root agent's offline measurements. No new packs were installed or imported, and the linked YouTube preview could not be inspected. The companion report records unavailable sources explicitly.

“Mocap” is the existing experiment's folder/workflow label. This investigation does not establish that each Quaternius clip originated in recorded human motion capture, or independently certify the source choreography as professional. Inspecting the original source motion remains a prerequisite to choosing a preset.

## What failed before PixelLab

### 1. The original authored motions were intentionally incomplete

`app/src/lib/rig/poses.ts` still authors idle mainly as a 0-1 px upper-body shift. Slash, cast, and hurt are largely arm motions over stationary legs. Hips, knees, and ankles staying still during an otherwise large attack explains much of the original robotic look. A prompt cannot supply missing weight transfer while also being expected to obey those joints.

The model's 18 labels include wrists under `RIGHT/LEFT ARM` and ankles under `RIGHT/LEFT LEG`. They are anatomical left/right. Misreading these labels, or applying viewer-left conventions to a north view, is a separate avoidable calibration error. The code currently knows these names, so no evidence establishes a wholesale label swap as the root cause here.

### 2. The first mocap retargeter transferred the wrong relationships

The old `mocap.mts` uses the first `Idle_Loop` pose as its default reference and transfers world-space bone rotation changes onto differently oriented drawn bones. Its support-foot root correction and facing cancellation can move the entire target unnaturally. A staggered source stance is not a neutral target bind pose; a twist about a source bone's long axis is not necessarily a bend about the target's corresponding axis.

New offline measurements reproduce the reported excessive walking root drift:

| Input sequence, 80 px frame | Hip x range | Hip y range | Largest adjacent joint step |
| --- | ---: | ---: | ---: |
| Stored PixelLab walk, south | 0.632 px | 0.464 px | 2.932 px |
| First mocap walk, south | 9.796 px | 3.096 px | 7.154 px |
| Revised cutout walk, south | 0.992 px | 2.276 px | 4.234 px |
| Stored PixelLab walk, east | 1.116 px | 1.052 px | 9.704 px |
| First mocap walk, east | 12.212 px | 4.268 px | 15.891 px |
| Revised cutout walk, east | 0.344 px | 2.184 px | 8.516 px |

These are measurements of submitted positions, not estimated output joints and not naturalness scores. They reproduce why the first walk lurched and show that the revision improves only some aspects.

### 3. The revised cutout retargeter still has two proven defects

**Depth describes different geometry than x/y.** In `retarget2.mts`, x/y come from target `q`, after target bone proportions, gain, limb gains, facing, lean, and foreshortening adjustments. Depth instead comes from source pose `P` at line 165. An independent control sets motion gain to zero: every target x/y stays stationary, yet depth varies by up to **59 units south and 23 east**. A model receiving these inputs can be asked to change occlusion and apparent pose while its visible joints remain fixed. This is a conversion inconsistency, irrespective of whether the renderer visibly responds to depth.

**Support switching is discontinuous.** Lines 159-164 choose whichever ankle is within 2 cm of the lowest ankle, recompute an average correction, and translate the entire body vertically. At `Walk_Loop` time **0.5954 -> 0.5955 seconds**, the selected set changes from both ankles to the right ankle. The target jumps **0.848-0.856 px downward in 0.0001 seconds**, despite smooth source ankle trajectories. There is no authored contact interval, hysteresis, velocity test, horizontal foot lock, or flight phase. “Foot pinning” overstates what this calculation does.

Reproduction: [retarget-audit.mts](../../spikes/api/animation-research-2026-10-27/retarget-audit.mts), run from `spikes/api` with `node animation-research-2026-10-27/retarget-audit.mts`. Assertions passed. Credential-free detailed results: local ignored `spikes/api/out/animation-research-2026-10-27/retarget-audit.json`.

### 4. The remaining geometry and timing assumptions are not universal

- **Near-camera limbs:** a bone pointing toward the camera has a tiny projected vector. Its screen angle becomes unstable. The revised code fades the angle and clamps apparent length to 0.4-1.2 times the drawn length; this is a readability heuristic, not a reconstruction of target 3D anatomy. A target with a short arm, large head, or hidden far elbow needs different constraints.
- **Camera fitting:** calibration is derived from one body's stored south/east generated walk, including assumptions about symmetric widths and depth. This run estimates elevation **8.868 degrees** and side yaw **20.102 degrees**. These are fitted parameters, not measured ground truth. The code requires that particular body's views and walk; it does not prove support for arbitrary sprites.
- **Clipping:** the clip-wide translation cannot fit a motion wider than its cell. Bottom overflow is not repaired by its vertical shift; individual joints are silently clamped afterward. The current south `die2s` sequence includes a clamped coordinate. That sequence cannot be described as unaltered, anatomically clean source motion.
- **Sampling:** `slash2` still contains adjacent requested joint displacements of **20.681 px south and 28.459 px east**. Fast impact can legitimately have large displacement, so these numbers alone do not prove a defect. They require checking source times, impact and recovery, interpolation, occlusion, and playback durations together. A loop seam is likewise a time-dependent adjacent transition, not a requirement that first and last sampled frames be identical.
- **Missing information:** the API contract has no spine chain, heel/toe orientation, finger grip, weapon orientation, segmented parts, or skin weights. Face landmarks are synthetic head offsets. Several distinct 3D poses can produce the same 18 projected points. An 18-dot rig cannot fully communicate all professional animation intent.

The local GLB contains 127 clips, all using LINEAR interpolation in this inspected file. Its SHA-256 is `bccd7586a5b6b088397965dd69d431d2209bc07fb3a602bafca9492a7dca69da`. Its generator is Khronos glTF Blender I/O v4.3.47; its local modified time is May 14, 2026, which is not authoritative release metadata. The adjacent license states CC0 1.0. Current Quaternius release notes contain relevant export, elbow, and root-motion fixes, but that does **not** prove this exact archive is affected. Verify a release and inspect the original 3D motion before replacing it.

## What the provider contract does and does not say

The live [PixelLab OpenAPI](https://api.pixellab.ai/v2/openapi.json) was downloaded for this investigation. The four checked request schemas match the repository snapshot: `AnimateWithSkeletonV3Request`, `Keypoint-Input`, `AnimateWithTextV3Request`, and `AnimatePixminimaxRequest`.

Raw skeleton-v3 accepts a reference image, its actual 18-joint reference pose, and 3-15 requested poses, at up to 256 px. It returns one generated image per requested pose. Optional depth and draw order have different meanings. Appearance belongs in `description`; `action` is a short motion label. The first reference is redrawn internally, so incorrect reference joints can damage output even when later poses are correct. The [official overview](https://www.pixellab.ai/pixellab-api) labels the model beta. The older Aseprite [skeleton editor guide](https://www.pixellab.ai/docs/tools/animate-with-skeleton) is useful for calibration concepts but its legacy freeze/inpaint controls are not raw v3 parameters.

These statements establish a pose-conditioning workflow. They do not promise rigid bone lengths, foot contact, identical pixels between separately generated body/item frames, or identical output from a repeated seed. Small joint errors and good palette fit cannot substitute for those qualities.

## Live experiment design and evidence

The owner authorized up to **1,000 generations**. The initial diagnostic pilot used **80 generations across 28 requests**. Its lying-pose results justified a final two-request, **6-generation** endpoint comparison. **Final: 30 completed requests, 270 returned images, 86 provider-reported generations, zero unresolved submissions, zero paid resubmissions.** Every paid submission originates from an explicit button action in the Codex browser on the localhost-only agent server. Credentials remain in memory and are excluded from exported evidence. Each case is reserved before POST and retains its job ID. Polling existing jobs is free.

| Group | Controlled comparison | Cases | Estimated generations |
| --- | --- | ---: | ---: |
| Reference | Fixed standing targets, two seeds, south/east; reference joints deliberately shifted 4 px upward in the paired negative control | 6 | 18 |
| Motion | Stored walk vs first and revised mocap walk; revised slash with/without depth and with short vs explicit empty-hand wording; revised fall | 14 | 42 |
| Alternative | Text-v3 empty-hand strike, same starting and ending image, south/east | 2 | 2 |
| Shape | Static-pose controls on an existing chibi and 128 px body | 2 | 6 |
| Lying | Identical, unclamped lying targets from a standing reference vs a stored lying reference, south/east | 4 | 12 |
| Fall endpoint | Repeat the preceding coherent pose in place of the original final fall target; everything else matches the paired motion test | 2 | 6 |

The motion comparisons reuse the exact previous pose sequences and native-size stored references. Text generation is a route comparison, not a one-variable skeleton ablation. Shape controls test static reference stability only; they do not qualify cross-body motion. Lying-reference joints are inherited requested joints from the stored frame, not independently measured ground truth. Raw frames and detached pixels are preserved.

Source: [prepare.mts](../../spikes/api/animation-research-2026-10-27/prepare.mts), [browser harness](../../spikes/api/animation-research-2026-10-27/browser.html), [offline image analysis](../../spikes/api/animation-research-2026-10-27/analyze.mts), and [run instructions](../../spikes/api/animation-research-2026-10-27/README.md). The [compact per-case test record](2026-10-27-animation-test-summary.json) is versioned without credentials, account balances, or image payloads. The generated case bundle, job responses, per-case usage, PNG frames, overlays, and [review gallery](../../spikes/api/out/animation-research-2026-10-27/index.html) are local under ignored `spikes/api/out/animation-research-2026-10-27/`.

### Observations

The reference batch completed. With the original south reference joints, all eight frames retain a 1,009 px foreground area and score 1.0 on the existing palette-fit helper (12 units of per-channel tolerance). Between adjacent frames, 1-19 pixels change across the two seeds. This is small raster variation with a visually stable pose, not evidence of grossly bad animation. The deliberately misregistered south reference increases disagreement with the original image from about 125-147 pixels to 710-715; translation and redrawing must be distinguished before interpreting that difference as deformation. Whole-image patch registration finds no shift in the correct south controls and a 1 px vertical shift in the first mismatched south output, so the 4 px reference-input change should not be described as a measured 4 px output translation.

The account-wide balance changed by more than this batch's own reported usage. Consequently this report attributes spending from individual jobs, not from a shared balance delta. It does not infer the cause of other account activity.

All 14 motion comparisons also completed, bringing attributable usage to 60 generations for the first 20 requests. The revised south walk is steadier than the first retarget but remains weak in leg motion. All three slash variants retain the same wide off-arm swing and deep squat. Removing `depth`/`z_index`, or changing the action to the short label `attack`, does not cure this input. This supports fixing the trajectory rather than continuing to tune those two parameters; it does not establish that the renderer is innocent of all defects.

The raw south fall reproduces the broken last frame: 34 detached pixels in the final output; the east final frame has 44, with 21 already detached in the preceding frame. The south motion also touches the frame border in frames 5-8. The slash variants have no detached pixels or border contact and largely retain the reference palette, yet their motion remains unsuitable. Those checks cannot certify natural movement.

All eight final pilot controls completed, giving **28 completed requests, 252 returned images, 80 reported generations, and no unresolved submissions** before the endpoint follow-up:

- **Repeated lying poses do not inherently dissolve.** All four lying controls retain a coherent last frame. From the lying reference, foreground area stays exactly 821 px south and 693 east, with zero detached pixels across all eight frames. From standing, the first two outputs differ substantially despite identical requested targets, then settle. This is evidence of remaining generative sequence behavior, not a faithful rigid pose renderer. The lying art still touches the border, so this does not qualify its framing or anatomy as production quality.
- **Chibi and larger static references work in this narrow control.** The chibi hold retains a 1,422 px area with small frame variation; the 128 px body in its 160 px cell returns eight pixel-identical frames after redrawing the reference (3,775 px area). These are stationary tests only, not evidence that mocap motion transfers correctly to those shapes.
- **Text-v3 is not a proven replacement from this pilot.** The two takes raise an arm and return; the south take uses anatomical left, and whole-body weight transfer is weak. They do not establish a professional strike preset. They return nine images for eight generated frames, including the unchanged input at index zero. `last_frame` is guidance, not a pixel-exact final-copy promise: the last south/east frames differ from the supplied end image by 89/14 visible pixels.
- **Recovery avoided double spending.** The development page reloaded during the last batch. All submitted IDs were retained, free polling resumed, and every job was reconciled without resending a paid request.

**The endpoint follow-up still fails.** We verified that every request field and the first eight requested poses match the paired original fall, and that the final two target poses are now identical, including depth/draw order. The replacement endpoint has no boundary-clamped joint. Nevertheless the last south/east images break apart, with **52/32 detached pixels** and foreground areas dropping from **846 to 485 px / 692 to 377 px** between the final two frames. Earlier body-border contact persists, so this is not a fully qualified production clip. It does, however, rule out the original final target alone as a sufficient explanation. This specific moving-fall sequence exposes a provider rendering/sequence-processing limitation; the static lying controls show it is not a universal inability to draw lying bodies or repeated poses.

Visual judgments are the investigating agent's qualitative review, not a blind owner preference study. The paid experiment deliberately stops at **86 of 1,000** generations: more rerolls of these inputs would not repair the proven conversion defects or establish universal preset quality.

### Local visual evidence

The strips below are raw outputs, with no component removal or cosmetic repair. Images remain local under the existing ignored-media policy; the numerical record and analysis source are retained above.

The revised slash still contains the wide arm swing and squat:

![Revised south slash raw frames](../../spikes/api/out/animation-research-2026-10-27/slash2_south_depth.strip.png)

The final fall frame breaks even after repeating the preceding target pose:

![Fall with identical final two requested poses](../../spikes/api/out/animation-research-2026-10-27/die2s_repairedlast_south.strip.png)

The repeated lying-pose control stays intact:

![Repeated lying-pose control](../../spikes/api/out/animation-research-2026-10-27/lying_from_lying_south.strip.png)

## Recommended approach

### First: repair and validate the motion representation offline

Build the smallest dev-only calibration and preset-authoring spike, using existing rig/image infrastructure. This is a recommendation for separately authorized implementation, not a feature delivered by this research.

1. **Approve the reference overlay per direction.** Use anatomical labels, native pixels, separate reference and desired poses, explicit camera and visible/occluded joints. Store correction provenance. An arbitrary flat sprite does not reveal hidden anatomy or a unique 3D skeleton.
2. **Pin one known-good source clip and its license/version.** Inspect the original 3D motion; record skeleton names, bind transforms, units, axes, source duration, and in-place/root-motion mode. Compare Quaternius with equivalent current KayKit clips before blaming one library.
3. **Use a coherent target rig.** Prefer retargeting in local bone spaces with explicit rest-axis correction onto a target-proportioned proxy. Preserve segment lengths in that rig, solve contacts and bend directions, then derive x/y and depth from the **same final target geometry**. If a 2D solver is chosen instead, treat foreshortening/occlusion as authored pose information rather than importing unrelated source depth.
4. **Author support and event metadata.** Ground contacts, left/right support intervals, flight phases, grip hand, root translation, anticipation, strike, recovery, and loop timing are part of a preset. Smooth contact transitions and solve feet/hands with constrained IK. Do not alternate a global offset based only on the lowest ankle.
5. **Curate for the camera.** Preview each direction; avoid unreadable end-on falls and unstable toward-camera limbs. Any readability correction must preserve gameplay facing, attack direction, grip, and root semantics. Turning the sampling camera is not a universally safe correction.
6. **Inspect free previews before generation.** Show source 3D motion, target rig, projected stick figure, actual rest overlay, and an optional rough sprite puppet at native scale and slow speed. A puppet needs segmented pixels and cannot predict AI-generated hidden surfaces or final art quality.
7. **Freeze a small preset set.** Start with idle, walk, run, one clear attack, hurt, and death on defined adult/chibi/tall proportion families. Normalize to anatomy and leg length, not whole-image dimensions. Store authored durations and contact metadata; qualify new sizes and proportions rather than promising universal transfer.

Lint must be action-, view-, and size-aware. A lunge legitimately moves the pelvis; a straight support knee or overlapping legs can be intentional; a standing hold can repeat a pose. The stable repeated-pose standing controls already refute a blanket claim that identical consecutive poses inevitably dissolve. Do not enforce a universal 4 px idle amplitude or fail every repeated pose. At 64 px, believable breathing can depend on subtle volume/shading changes that sparse joints do not describe.

This follows the distinction in [Animated Drawings](https://arxiv.org/abs/2303.12741): projection/readability adaptation matters for disproportionate drawings. [ReConForM](https://arxiv.org/abs/2502.21207) independently treats contact preservation across morphologies as an explicit retargeting problem. These papers support the design direction; neither demonstrates this PixelDoll pipeline or supplies a plug-in guarantee for pixel sprites.

Fit the full body/weapon silhouette inside the chosen canvas before paying, rather than checking joint positions alone. A head or foot can clip while its joint is inside the frame. Preserve native pixel scale and a common pivot when adding padding; larger canvases can increase equipment-edit costs. Reference calibration must also match each dressed anchor's actual pose, while all target layers follow the same frozen body motion.

### Then: qualify the renderer against approved inputs

Keep the same approved reference, exact poses, seed, source sampling times, playback durations, and output sizes across paired tests. **Skeleton-v3 receives ordered poses, without timestamps or per-frame durations.** Sampling and preview/export timing must therefore be recorded separately; professional impact timing is not a parameter the endpoint itself preserves. Include manually polished controls. Assess motion readability, full-body balance, support contacts, bends, silhouettes, grip, facings, bounds, raster stability, and body/item alignment separately. Do not use the provider's own estimated joints as the only judge of its generated art.

If a hand-approved, coherent, contact-correct pose sequence still redraws badly across a small multi-seed test, retain the request, reference, overlays, and raw outputs as a reproducible provider issue. At that point a renderer limitation is a justified conclusion for that case. Avoid spending hundreds of generations tuning prose around demonstrably invalid geometry.

A practical fall/hold workaround worth qualifying is to **review and freeze the last coherent generated frame, then hold it locally with frame duration**. Do not pay to redraw an identical terminal pose. This is a candidate-selection strategy, not a repaired provider model: preserve the rejected raw frame and its failure record, fix remaining clipping, and keep body/equipment cell timing synchronized. Do not remove detached components merely to make the broken body appear to pass.

Candidate scope: three proportion families, south/east first, six moves, then all supported directions on the winners. Approve reference and motion before paying. Test at least one rigid head item, one deforming garment, and one held weapon before claiming the presets preserve paperdoll alignment. Set acceptance examples with the owner; no numeric threshold by itself defines “professional” animation.

### Fallbacks and product decisions

| Route | What it buys | What it does not solve |
| --- | --- | --- |
| Curated target poses + skeleton-v3 | Explicit hand, direction, pose and reusable item alignment inputs; preserves the existing architecture | Generative redraw, hidden anatomy, exact pixels and successful rendering on every body remain unproven |
| Text-v3 / pixminimax body animation + edits on actual frames | Previously more natural full-body motion with fewer body-generation steps | Hand/facing/loop drift and higher equipment costs; no deterministic shared preset motion. Round 9 S/E results do not qualify arbitrary bodies or 8 directions |
| Authored 2D directional cutouts or meshes | Deterministic motion after rigging; prepared attachments and explicit contacts | Requires segmented directional artwork, occluded parts and deformation cleanup. A single composited sprite is insufficient |
| Rigged 3D characters/equipment rendered to sprites | Strongest geometric consistency for repeatable contacts, cameras and true equipment surfaces | Requires a 3D character workflow and a separate style decision; cannot automatically recover any supplied sprite. This would change the earlier PixelLab-only-art direction |

**Recommendation:** keep the production route unchanged during research. Repair the proven conversion defects and qualify a deliberately small preset pack before deciding whether skeleton-v3 is viable. If the requirement is guaranteed consistency without per-character review, use standardized authored body families or a deterministic 3D/2D asset workflow. No surveyed free tool can substantiate that guarantee for every arbitrary humanoid sprite.

## Validation and remaining uncertainty

- Offline retarget reproductions passed; original failures and revised input ranges were remeasured from the existing source/fixtures.
- Historical slash/fall PNGs were reopened with submitted-joint overlays. The historical last fall frame breaks apart while earlier lying frames remain readable. Because the final requested sequence also contains conversion/clipping issues, that observation alone does not isolate a renderer-only cause.
- All 30 live requests completed and their individual usage sums to 86 generations. The endpoint-only paired-input assertions passed. No paid outcome is unresolved and no paid request was resent.
- The standalone prepare/analysis scripts ran, retarget-audit assertions passed, Node syntax checks passed, and research-text/diff checks passed. The available shell runtime was Node 25.0.0; this is not validation on the project's required Node 24 toolchain.
- `npm run check`, `npm test`, and Playwright production suites were skipped for this documentation/standalone research change. No production source was changed by this investigation. The temporary app harness entry was removed and the agent dev server stopped after testing. The credential-free static evidence viewer remains available for review. No packages, new services, or animation archives were installed.
- External tools were surveyed from primary sources; their browser integration, exact free archive inventories, and effect on PixelDoll output were not benchmarked. The linked video was unavailable.
- Full 8-direction coverage, proportion-family motion, all sprite sizes, actual revised solver output, and equipment qualification remain future implementation/validation work, not claims of this research.
