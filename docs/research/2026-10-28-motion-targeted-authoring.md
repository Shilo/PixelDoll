# Targeted contacts, grip and native-view qualification

Branch: `codex/motion-lab`. Continuation of [the previous follow-up](2026-10-28-motion-followup.md). This document records this phase separately so that historical results, paid usage and rejected experiments remain intact.

## Scope and acceptance

The requested outcome is consistent, natural-looking preset animation with dependable weapon grip, body occlusion and ground contact. A mathematical contact lock, a clean connected component or a passing equipment extraction gate does not establish that outcome. Qualification needs actual rendered anatomy, hand contact, depth order, soles, timing and identity to pass together.

The library has actual south, east and north artwork for the adult 64 px, chibi 64 px and adult 128 px bodies. West is a mirror of east, with reversed visible handedness. There is no native diagonal artwork. This phase tests all available native views and records unsupported views explicitly.

## Before and after implementation

| Area | Before | Added in this phase |
| --- | --- | --- |
| Foot support | Dense ankle-path diagnostic and source confidence, with no editable world-space anchors | Explicit stance intervals, entry/exit fades, target-body anchors, world root velocity, coherent two-bone IK and shared feasible pelvis correction |
| Running samples | Uniform samples could miss every short full-support interval | Contact-event sampling includes the starts and ends of full support, then fills the largest gaps; cumulative rounding preserves the cycle duration |
| Weapon placement | Prototype followed requested wrist and forearm direction | Offline editor binds to exact frozen output hashes, with independent source grip/blade axis and per-frame visible-hand grip and blade angle |
| Occlusion | Item drawn entirely in front | Native per-frame masks hide item pixels only where frozen body pixels actually exist |
| Equipment views | Paired south/east reference dressing | Optional third native reference in the same supported `edit-animation-v2` call; reference SHA and output index remain view-specific |
| Budget | Historical conservative reservations included unsent and rejected work | Separate 194-generation phase allowance after 806 actual prior generations; historical reservations remain unchanged |

Contact plans are saved in the motion document. Changing body calibration or motion controls clears the plan because its anchors may no longer fit; Undo restores it. Sparse joint edits can break a contact, so the resulting error is recalculated and full-weight violations block rendering. Horizontal reach failures, incompatible two-leg contacts, canvas violations and nonfinite values are surfaced before paid transport. No leg stretching is allowed.

The attachment editor imports a transparent directional item PNG. Its initial wrist-based coordinates and upright blade angle are drafts, not accepted measurements. The author must calibrate the source grip and blade-axis point and inspect every target grip, angle and mask against actual body pixels. Saved drafts and exports are tied to the exact job, ordered body hashes, native canvas, padding, pivot and direction. The export retains native body PNGs, item PNGs, composites, masks, timing, selected frames and a manifest marked `qualified: false`. It does not alter the frozen body to hide a failure.

## Reproducible offline contact experiment

`spikes/api/mocap/author-contacts.mts` writes 18 full documents for three bodies, walk/run and three native views into the ignored `spikes/api/out/motion-targeted-2026-10-28/` directory. The source fixture and converter are versioned. No API calls occur in this script.

Root policy: fit one forward speed to each target body's south motion, explicitly author lateral speed as zero, and share that world velocity across its three views. Anchors come from the target body, not the source actor. This is an authoring proposal requiring visual approval, not a universal engine-speed prescription.

All 18 dense checks preserve target bone lengths, remain reachable and in bounds, and hold full-weight anchors within floating-point precision. Walking has 49 full-support samples at the dense source rate; running has six. Twelve render samples now retain at least four full-support events in each running cycle.

This does not uniformly smooth every motion. For example, the chibi north run's maximum dense bone-angle step increases from about 24.48 to 30.41 degrees. An exact lock can worsen a knee transition. That is a reason to inspect and tune the stance fade or reject the result, not label the clip professional based on anchor error alone.

## Evidence and live accounting

Raw exports, individual frames, before/after strips, requested-joint overlays, timed GIFs and machine-readable diagnostics are stored separately under `spikes/api/out/motion-targeted-2026-10-28/`. The previous campaign remains under `spikes/api/out/motion-lab-2026-10-28/`.

The live test matrix reserves 164 generations initially: 54 for 18 planted walk/run candidates, 26 for eight remaining north presets including conservative fall reservations, 30 for three equipment designs with three native views, and 54 for 18 walk/attack equipment poses. Provider-reported usage is authoritative; reservations are upper bounds. The original 1,000-generation approval remains the total ceiling. No uncertain accepted request is automatically resent.

All accepted jobs are now settled. This phase has 54 reservations referencing 51 unique completed jobs, with no new failed, canceled, submitting, running or queued jobs and no reservation without a job. The provider reported **186 new generations**, bringing the original research total to **992 of 1,000**. Eight approved generations remain unused. There were 566 returned images across the new unique jobs; repeated comparison records are not counted as additional returned images or spending.

Accounting is deliberately explicit:

| Work | Original reservations | Actual generations |
| --- | ---: | ---: |
| Eighteen planted walk/run candidates | 54 | 54 |
| Eight remaining north presets | 26 | 24 |
| Three designs with south/east/north references | 30 | 30 |
| Eighteen equipment poses | 54 | 54 |
| Three closed-fist body comparisons | 9 | 9 |
| Equipment comparisons against the closed-fist bodies | 9 | 0 |
| Two-frame frozen-body inpaint grid probe | 10 | 15 |
| Total | 192 | 186 |

The last three equipment comparisons reused the same queued job IDs and raw outputs because their actual provider requests were identical. Their frozen-body comparison contexts remain separate. The evaluator now preserves every comparison instead of collapsing them by job ID, and includes the frozen body ID in artifact names to prevent overwrites.

The grid probe cost **15**, exceeding its inferred area-based estimate of **10**. This is a real estimator miss. The total stayed within the user's approval, and no more paid requests were made. Historical estimates remain unchanged. The lab now raises reservations to higher known provider charges, yielding a conservative **197/194** reconciled reservation display while actual phase usage is **186/194**. It also reserves 25 for any future instance of this bounded grid probe. That display does not mean 197 generations were spent. The separate production area estimator was not rewritten from a single new measurement.

Official material is inconsistent enough that a quoted floor is not an upper bound: the [tool guide](https://www.pixellab.ai/docs/tools/inpaint-v3) gives a 10-generation cost, while the [API catalog](https://www.pixellab.ai/pixellab-api) lists size-dependent Pro price bands. The repository's previous area interpretation was explicitly inferred. The raw 448×112 request, mask, response, provider usage and job ID `f9d4ef6a-e166-482c-a580-ec59c06c4c10` are retained for a future pricing audit without more paid probing.

## Native body results

There are now completed raw candidates for all **54 available native profiles**: three bodies × six actions × three views. The [current catalog](2026-10-28-motion-targeted-catalog.json) retains the two previously saved experimental walk reviews and treats new renders as unqualified comparisons. No replacement is promoted merely because its requested ankles lock exactly.

All 18 planted walk/run candidates have zero raw border and detached-component pixels. The eight new north presets also have zero border pixels. The 128 px north attack has two detached pixels in its worst frame. These are diagnostic observations, not anatomy scores.

Visual strip inspection found:

- South/north walks are subtle and can read as shuffling. East silhouettes show stride more clearly. Running has stronger leg/arm separation, but front-view faces and silhouettes still vary.
- North idle is nearly static. North hit reactions have limited chest motion and can read as a slight head/body turn rather than a distinct impact.
- North chibi/128 attacks retain body-turning and arm-visibility problems around the strike. The adult south/north attack controls also turn toward a side view, which cannot be fixed by moving a weapon layer.
- Both new north falls reach a lying pose. The 128 px terminal buffer invents an extra upper body attached to the lying body. It has no detached-component warning because the hallucinated pixels are connected. The buffer stays in raw evidence and is excluded from default playback. Repeating the intact preceding final image locally is the intended hold, not a claim that the buffer was repaired.
- The three closed-fist prompt comparisons change some hand pixels but do not remove the camera/pose defects or improve sword extraction enough to pass. Same seed is not pixel-repeatable, so these are observations from three paired comparisons, not a universal causal conclusion about prompting.

## Rendered sole measurements

`measure-rendered-soles.mts` records manually estimated visible toe-outline points from enlarged native pixels and verifies that every marked pixel is opaque. The new editor imports, saves and exports these exact-hash-bound annotations; transparent marks, mixed heel/toe landmarks and incomplete observations cannot produce a valid sampled result. The experiment covers only adult east walk/run at seed 7. Other bodies/views were rendered and visually inspected but have no manually measured sole result.

| Candidate | Right stance projected span | Left stance projected span | Marked full-support samples |
| --- | ---: | ---: | --- |
| Previous east walk, under the same proposed root path | 2.01 px | 1.96 px | 4 per stance, 333 ms observed |
| Authored-contact east walk | 2.76 px | 1.88 px | 5 per stance, 381/404 ms observed |
| Authored-contact east run | 2.99 px | 0.26 px | 2 per stance, 33 ms observed |

These are maximum pairwise distances between manually picked toe pixels after adding projected root displacement. They do not compare a toe directly to an ankle anchor. The exact formula is `imagePoint + [dot(v, camera.right), -dot(v, camera.up)] * unwrappedSourceTime`. Wrapped observations are normalized into the same stance cycle. Two marks at the same unwrapped time do not establish temporal evidence.

This is **mixed evidence**, not a successful universal foot-planting fix. One walking stance improves slightly, the other worsens. The running pair exposes an almost stable toe and a roughly 3 px displacement on the opposite foot. Measurements assume frame-boundary root samples `R_i = velocity * sourceTime_i`. Retiming requires a matching root trajectory in playback time. A sprite held while its root moves continuously can still skate between those samples; neither this tool nor exact 3D ankle locks certify that interval.

## Equipment and authored weapon results

The initial 18 equipment comparisons give **13 extraction-gate passes, four failures and one warning case**. All nine planted-walk item comparisons pass those gates. Attack remains the weak case:

| View | Helmet | Tunic | Sword |
| --- | --- | --- | --- |
| South attack | Fails H4 direction/shape in frames 4–5 | Passes extraction gates | Fails G4; minimum area 7% of median, plus border warnings |
| East attack | Passes extraction gates | Passes extraction gates | Fails G4; minimum area 21% of median |
| North attack | Fails H4 shape in frames 7–8 | Passes extraction gates | Warnings: area 19% of median and one frame over 6 px from either requested hand |

Frame numbers in this table are zero-based gate identifiers. The three closed-fist recomposition comparisons add two sword failures and one warning, for **21 comparison records total: 13 pass, six fail, two warn**. They do not add provider generations. Passing extraction does not establish correct grip or physically plausible weapon motion.

A concrete source-art defect explains part of the rigid prototype failure: extracting an item removes the handle pixels hidden by the source hand. The resulting directional sword PNG has a gap between pommel and guard. Rotating that incomplete sprite preserves the gap. `author-weapons.mts` explicitly restores 22 south, 25 east and 20 north hidden-handle pixels before placement, preserving hashes of both raw and authored art.

The script writes three complete 12-frame authoring documents with explicit source grip/blade axis, target hand estimates, independent blade angles, body masks and notes naming ambiguous grips. A 40 px development-only border around the native 80 px body removes clipping in all three tracks. No frozen body pixels are edited. South/east/north masks hide 183/238/135 item pixels respectively. East frame 5 places the item behind the body because the hand is occluded; other masks cover explicitly authored hand regions. These are editable prototypes, not inferred finger segmentation or accepted animation.

The remaining limits are visible: an inferred hidden grip, front/back body turns, incomplete perspective, nearest-neighbor rotation artifacts and changes to the body silhouette. A mask cannot manufacture the missing hand pose. A larger canvas fixes clipping only.

## Frozen-frame repair probe

The skeleton equipment route sends a dressed standing image and the requested joints. It does **not** send each frozen animated body image. Consequently, changing the body animation's hand prompt alone does not change that item's provider request. The deduplicated comparisons above expose this architectural limitation directly.

The lab therefore tests the existing masked-grid approach against actual frozen pixels: adult east attack source frames 6 and 7, plus east/south dressed sword references, packed into one 448×112 image. Masks use the explicitly authored visible grips and the existing 34 px held-item region. `inpaint-v3` edits an existing image; no disallowed creation model is used.

The result is promising on these **two frames only**:

- All 42,928 black-mask pixels are preserved exactly, including the protected references.
- Both recompositions use the unchanged frozen body with zero alignment shift, retain 99.63–100% of chroma body pixels, and have no layer pixels on the border.
- Sword areas are 186 and 181 px, compared with large area collapse in the skeleton-posed attack clip. Visible hand contact is coherent in the two-frame comparison.
- One extracted layer has 18 pixels outside its largest component; an occluded handle can legitimately split an item, so deleting those pixels automatically would be inappropriate.

This is not a full-clip, all-view, repeated-seed or final-occlusion qualification. It does not repair the underlying body's camera changes or soles. The complete 12-frame padded grid would require a larger price band than the remaining eight approved generations, so it was not submitted. The evidence supports continuing this route on a curated clip after the frozen body itself passes review, rather than spending more on skeleton-only grip rerolls.

## Recommendation and remaining work

Keep the current production defaults and two prior experimental walk reviews. Use the new lab to qualify a small set of body/view-specific clips, with an explicit root path, measured soles and visible hand tracks. Select or manually correct the frozen body first. Use restored directional item art and authored masks where rigid placement remains plausible; use frozen-frame grid editing for critical grips where the two-frame probe is promising. Front/back swings need frame-specific perspective art and correction of unwanted body turning before they can pass.

Do not promise one automatic rig for every humanoid shape. The current evidence still requires body/view calibration, curated motion, artist decisions about occluded anatomy and per-clip acceptance. Full equipped attack, continuous foot stability, repeated-seed robustness and independent west/diagonal views remain unqualified. The board card stays Progress with this remaining scope. No further paid testing is authorized beyond the original ceiling, and this phase stopped at 992 total generations.

## Reproduction and verification

From the repository root, using Node 24.22.1:

```text
node spikes/api/mocap/author-contacts.mts
node spikes/api/mocap/qualify-targeted.mts
node spikes/api/mocap/evaluate-motion-equipment.mts spikes/api/out/motion-targeted-2026-10-28/evidence.json spikes/api/out/motion-targeted-2026-10-28
node spikes/api/mocap/author-weapons.mts
node spikes/api/mocap/measure-rendered-soles.mts
node spikes/api/mocap/evaluate-grid-probe.mts
node spikes/api/mocap/catalog-targeted.mts
node spikes/api/mocap/package-targeted.mts
node spikes/api/animation-research-2026-10-27/serve.mjs spikes/api/out/motion-targeted-2026-10-28 5271
```

Open `/review.html` on the loopback viewer, or unpack `motion-targeted-review.zip`. The ZIP includes raw evidence, source documents, current catalog, rejected outputs, native layers, authoring tracks, before/after strips, GIFs, annotations and these findings. GIFs repeat for inspection; one-shot playback and final holds remain explicit in the motion metadata. The viewer has no token endpoint or paid transport. Generated media stays ignored under the repository's existing evidence policy. Compact findings and numeric records are versioned in [the result ledger](2026-10-28-motion-targeted-results.json).

Verification includes the strict app check, full unit suite and the browser self-test spec. The new checks cover world-anchor preservation, no bone stretching, wrapped contacts, deterministic adjacent-window ownership, unreachable-plan blocking, short running-stance sampling, exact timing, body-only occlusion, exact-hash attachment imports, visible-sole projection, missing temporal evidence, saved authoring and upward charge reconciliation. A new textarea persistence test initially used a text-content assertion; its trace showed the saved value was present. The assertion now checks the textarea value and passes. Final counts and any omitted checks are recorded in the result ledger. No paid request was retried.

## November 1 documentation update

The [custom Skeleton v3 follow-up](2026-11-01-custom-skeleton-v3.md) identifies a newly documented managed authoring workflow that this campaign did not test. One bounded comparison is now recommended before further conversion tuning. The previous rendered findings and 992-generation total remain unchanged; no new quality claim follows from the documentation alone.

## Research rationale and boundaries

A read-only research subagent reviewed the targeted contact/attachment problem without using credits. These primary sources informed the original implementation; no third-party runtime or copied implementation was added:

- [Footskate Cleanup for Motion Capture Editing](https://research.cs.wisc.edu/graphics/Gallery/FootskateSolver/footskate.html) supports explicit contact constraints, IK and root correction. The research page is not evidence that its code is MIT or CC0.
- [ozz-animation IK documentation](https://guillaumeblanc.github.io/ozz-animation/documentation/ik/) and its [foot IK sample](https://github.com/guillaumeblanc/ozz-animation/blob/master/samples/foot_ik/sample_foot_ik.cc) explain contact targets, blending and reach handling. ozz is an MIT implementation reference; it does not recover soles from a generated sprite.
- [ozz attachment example](https://guillaumeblanc.github.io/ozz-animation/samples/attach/) demonstrates attachment transforms. A wrist position or forearm vector alone does not determine the weapon's independent wrist rotation.
- [DragonBones slot implementation](https://github.com/DragonBones/DragonBonesJS/blob/master/DragonBones/src/dragonBones/armature/Slot.ts) is an MIT reference for attachment transforms and display/depth organization. Per-frame slot ordering alone cannot express fingers in front of a hilt while a blade crosses in front of the torso; pixel masks or separately authored parts are needed.

The current 18-point skeleton does not encode fingers, a closed fist, a heel/toe pivot or complete foot orientation. An occlusion mask can hide pixels but cannot invent a convincing closed hand, an unseen weapon surface or perspective shortening. A fixed rigid layer is therefore suitable only for motions/views where reviewed directional art and explicit tracks remain plausible. Frozen body pixels cannot be made to plant by changing metadata afterward. A global body shift also cannot independently correct two sliding feet.

The implementation remains an isolated development lab. Production Studio has not adopted these candidate presets, contact assumptions or attachment masks automatically.
