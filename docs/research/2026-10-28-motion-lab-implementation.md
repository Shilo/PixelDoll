# Motion lab and skeleton-v3 qualification

Date: October 28, 2026. Branch: `codex/motion-lab`. This implements the owner's approved follow-up to the [diagnosis](2026-10-27-animation-diagnosis.md). Keep that report and its rejected raw frames as the before record.

## Scope and acceptance

Build a dev-only offline motion lab, fix conversion in a reusable pure module, curate idle/walk/run/attack/hurt/death, and qualify rendered motion and representative equipment. Do not silently replace Studio defaults with unqualified motion. A preset can be marked qualified only with specific body/view/size evidence. Keep unsupported cases and subjective concerns explicit.

The owner approved use of the remaining original generation allowance: **914 generations remaining after the 86-generation diagnosis**. Reserve against that allowance before paid submissions, retain unknown outcomes, never automatically resend paid requests, and record actual per-job usage. Offline checks come first. No dependency on an account or generation is permitted for offline editing and preview.

## Before

- `retarget2.mts` derives x/y from adapted geometry but depth from the original source; zero motion gain still animates depth.
- Choosing ankles within 2 cm of the lowest foot causes a 0.85 px support-switch discontinuity on the stored walk.
- Projected screen-angle transfer becomes unstable near the camera axis; bone coordinates are silently clamped at the canvas boundary.
- The tested attack flails and squats in its requested poses. The fall's final render breaks even with identical final two targets.
- No usable offline lab exists. Current authored Studio actions remain the baseline until replacement qualification.

## Implementation record

1. Preserve previous research, raw baseline references, source hashes, and reproduction scripts in the isolated worktree.
2. Implement coherent target geometry with fixed 3D lengths, stable direction transfer, explicit contacts, and projected x/y/depth from the same target points. Surface invalid calibration and overflow.
3. Add a dev-only lab for reference calibration, source/target previews, timeline and durations, joint/IK edits, local import/export, pose diagnostics, and reviewed generation candidates through existing queue infrastructure.
4. Compare old/new inputs and rendered frames on the same fixtures before expanding to body proportions, sizes, facings, and equipment.
5. Record qualification outcomes, limits, exact spending, tests, and before/after evidence here and in a compact machine-readable record.

## Results

The offline lab and corrected conversion are implemented and tested. The strongest bounded result is the adult 64 px south/east walk: two frozen visual candidates were reviewed and exported, and all six representative equipment cases pass existing gates after documented cleanup. The full six-action set is **not professionally qualified for arbitrary humanoids**. Attack equipment and some front falls still fail. Studio defaults remain unchanged. See the final qualification below; earlier checkpoints describe intermediate results.

## Implemented changes and first pilot, October 28

The converter and standalone Motion Lab are now implemented. See [tool contract](../design/skeleton-pose-lab.md). Neither is wired into Studio defaults. The original retargeters remain unchanged as historical baselines, apart from exporting source sampling and parameterizing their existing camera estimator for reuse.

| Concern | Before | Corrected implementation / evidence |
| --- | --- | --- |
| Support switch | 0.856 px maximum joint step across 0.5954-0.5955 s | 0.00479195 px with the final ground-support solver on the same stored walk |
| Depth with motion disabled | 56 depth units of change in the reproduced two-sample south check | Exactly zero; XY and depth derive from the same target geometry |
| Bone length | Screen foreshortening and silent clamps could conceal invalid poses | Fixed 3D segment lengths, including contact IK, to numerical precision |
| Idle source | Tired clip produced a persistent hunched squat | `Idle_Loop`; the bad source was caught in offline preview before rendering |
| Strike | Uniform sampling, flared balance arm, deep crouch | Event-focused sampling near 0.4 s; separate torso/leg/arm gains; revised render pending review |
| Front fall | Backward fall viewed end-on | View-specific sideways motion-basis adaptation; revised render pending review |
| Fall canvas | Whole-clip shifts and coordinate clamps | Transparent native-pixel padding, scaled for 80/160 px cells; explicit overflow failure |
| Terminal frame | Previous research showed a broken final render | Both first-pilot falls held stable with a buffer, one seed each; buffer retained raw and excluded from reviewed playback |
| Source/target camera | One camera estimate reused | Per-body estimates: adult 8.87/20.10 degrees, chibi 10.03/23.45, 128 px adult 11.07/25.34 (elevation/side yaw); editable assumptions |
| Review | No offline tool or persistent acceptance | Credential-free documents, raw evidence, saved exclusions/notes, authored playback and local terminal holds |

The first pilot completed all 12 adult 64 px cases: six motions, south/east, seed 7, **36 provider-reported generations**. All requested outputs were retained. Raw sheets and timed playback show coherent walk, run and hit poses, but visible model redrawing and scale/detail changes remain. The strike still needs restrained source motion; the front fall is anatomically hard to read. No preset is declared professionally qualified from this pilot.

An additional 81 generations were reserved for 24 chibi/128 px body cases and three revised adult candidates, for **117 reserved** in the new campaign. Those body controls began with the adult camera estimate; the per-body camera change is recorded as a later revision rather than retroactively attributed to them. Subsequent qualification records must distinguish revisions by request hash and full parameters.

## Verification checkpoint

- Exact Node 24.22.1 and npm 11.19.1 installed from the official Node distribution, checksum verified. No project dependency changes.
- `npm run check`: passed with zero errors and warnings after UI fixes.
- Full unit suite at the first implementation checkpoint: 104 files, 1,012 tests passed, one existing skip. Added geometry/document tests cover all 144 body/action/view documents, fixed lengths, zero-gain depth, the old support-switch boundary, overflow rejection, IK edits and native-pixel padding.
- Targeted browser suite `selftests.spec.ts`: five tests passed, including two new Motion Lab flows. Editing and save/import sent no paid requests. Candidate review survived reload, excluded the paid buffer, and exported the authored final local hold.
- Production build and dist guard passed. Motion Lab assets and its credential path are absent from production output.
- Later geometry/authoring changes require the final check/unit/targeted browser run recorded below. No full end-to-end run is claimed for this isolated development entry.

## Evidence and reproduction

Local raw exports and generated galleries: `spikes/api/out/motion-lab-2026-10-28/`. `evidence.json` is exported from the browser ledger; `render-analysis.json` records actual completed usage, frames, detached pixels, border contact and palette diagnostics. Those pixel metrics do not score naturalness. `conversion-comparison.json` and before/after skeleton strips are produced by the comparison script. The old 86-generation diagnosis remains separate.

Source bake: `app/dev-fixtures/motion-lab/library.json`, six 60 Hz clips and three native body fixtures with mirrored-view metadata; CC0 license alongside. Original GLB SHA-256: `bccd7586a5b6b088397965dd69d431d2209bc07fb3a602bafca9492a7dca69da`. Scripts and versioned text preserve reproducibility; raw media remain ignored according to repository policy. No token is included in either document or evidence exports.

## Second conversion pass and corrections to the first checkpoint

The first 144-case audit covered geometry, including stored joint entries whose artwork was absent. It was not eight-view image qualification. The source fixtures actually retain south/east/north artwork and a west mirror. The bake now rejects missing images, verifies native PNG dimensions, builds west through the existing mirror helpers, and offers only image-backed views. The corrected audit covers **72 documents: 54 native and 18 mirrored**. Mirrored views preview for free and cannot trigger independent paid generation. Visible handedness flips with mirrored pixels; unique-view weapon qualification is separate.

A 60 Hz continuity audit found a further defect in the initial contact correction. It blended feet horizontally toward the source actor's stride, which disagreed with the target's calibrated proportions. The first 128 px east run interval rotated the lower leg by 60.64 degrees, versus 19.82 degrees in the source. The corrected `ground-support-v2` solver preserves the target FK foot path in X/Z and blends only its height toward the calibrated ankle ground, with a continuous pelvis reach correction. Zero-weight contacts do not run IK. The worst dense run angular step across the audited profiles fell from about 61 to 30 degrees. Fixed lengths and finite, unclamped coordinates remain enforced. This is ground support, not proof of world-space sole planting.

The body templates were queued as an 84-case cohort: all six moves, south/east, three body families and seeds 7/8, plus adult north at both seeds. The final ledger audit found eight missing profiles because development reloads had canceled queued jobs before transport. Fresh seed-9 candidates fill those eight comparison gaps; canceled jobs retain their original IDs and zero usage. Thus the completed comparison uses two seeds per body/action/view, with seed 9 replacing a canceled replicate where needed. A subsequent fall comparison uses 13 event-focused poses around the fast phase near 1.0 seconds, plus a terminal buffer. Hurt playback now follows its actual source intervals and a final hold. Candidate playback supports free per-frame duration overrides, respects non-looping clips, and retains the original raw request and timing separately from review edits.

Reference overlays for all three bodies in south/east/north show no gross side swaps. Joint centers under clothing and on occluded sides remain uncertain. Their placement is not independently established anatomy, and the latent depth is still a proxy. The lab retains manual calibration rather than claiming the original estimates are universally correct.

## Laboratory and export fixes found during real testing

- Changing presets initially attempted to clone Svelte proxies. The corrected selector copies plain joint values and preserves body calibration when switching clips. Imported bodies and motions stay selected rather than silently reverting to a fixture.
- Queue refreshes initially reset an unsaved candidate review. A browser regression reproduced that loss, then passed after image loading was keyed by result identity. Review status, exclusions, notes, timing edits and local holds persist.
- Large campaigns initially reparsed the full ledger for every candidate row. One parsed snapshot and indexed job lookup now serve the lists; only the inspected candidate loads full image previews. HMR disposes the prior lab queue.
- Reviewed export verifies image dimensions and preserves the original requested joints, reference artwork, frame durations, loop metadata and padded pixel pivot. Historical incomplete records remain raw evidence rather than silently receiving fabricated pivots.
- Budget reservations include the canonical request identity. Evidence totals deduplicate job IDs so cached results cannot inflate reported spending. Identical requests and uncertain reservations are never automatically resent.

## Equipment protocol and explicit rejected requests

Equipment qualification reuses production chroma, dressing, posing, extraction, cleanup and QA helpers. A design is dressed once on paired native front/side views. Each pose call uses the frozen body's exact stored request poses and its original standing image. Held items receive the production oversize canvas. The offline evaluator retains before/after cleanup images and reports removed pixels and failed gates; it does not equate a gate pass with natural animation.

The first lab-only dressing attempt incorrectly supplied one frame. PixelLab explicitly rejected all three requests with HTTP 422 because `edit-animation-v2` requires at least two frames. They reported zero generations and had no accepted background jobs. The corrected experiment uses paired front/side references. The related production single-direction edge case was reported to the coordinating agent without changing another task's item module.

Thirty attempts on image-less fixture directions failed during preparation, before queue creation or transport. Their 90 reserved generations remain conservatively in the ledger, along with 30 reserved for the three rejected edits. **These 120 reserved generations were not billed.** The final spending report distinguishes reservations, logical jobs, accepted jobs, rejected requests, raw returned images and unique provider-reported usage. Missing-image preparation now occurs before reservation.

The first equipment comparison, before the second contact correction, produced 8 passes, 1 warning and 3 failures across helmet/tunic/sword on walk/strike in south/east. The failures are retained. The corrected-body comparison and final selected-preset findings follow below when all jobs settle.

## Final qualification

The campaign completed with **720 provider-reported generations**, plus the earlier 86, for **806 of the approved 1,000**. There are 277 reservations, 247 unique local job IDs, 233 completed jobs, three explicit unbilled HTTP 422 failures, and 11 cancellations explicitly stopped before transport. Completed jobs returned 2,542 images. Nothing remains running or queued. The ledger retains 887 reservations against its 914 cap: 120 unbilled preparation/rejection reservations, 33 canceled before transport, and 14 from reserving four generations for falls that the provider reported as three. Reservations are not billing totals.

The final comparison contains **84 body/action/view/seed profiles**: three bodies, six actions, native south/east, two seeds, plus adult north at two seeds. Seed 9 replaces the eight canceled replicates. Fourteen 13-pose falls supplement the earlier nine-pose controls. All 18 body/action overview sheets, covering every included frame in those 84 profiles, were visually inspected. This is an agent assessment, not an independent animator review or measured naturalness score.

| Action | Final visual finding | Disposition |
| --- | --- | --- |
| Idle | Stable silhouettes and small breathing motion across the tested families; slightly bent side reference stance. | Useful candidates, with no universal anatomy or equipment claim. |
| Walk | Coherent alternating limbs across bodies. Adult south/east seed 7 is the strongest body/equipment control. | Two frozen experimental clips accepted with bounded notes and exported. Keep authored loop timing and zero final hold. |
| Run | Readable cycles and improved proportions. Adult east seed 7 has 16 detached pixels in one frame. | Reject or repair flagged frames; engine stride speed and sole planting remain unmeasured. |
| Attack | Restrained balance arm and legs reduce the initial flailing/crouch. Side-view overhead readability and model redrawing remain concerns; east seed 9 has a 15-pixel detached component. | Empty-handed body candidates only; equipped attack remains unqualified. |
| Hurt | Readable short reactions with body/view-specific amplitude. | Preserve source intervals, approximately 67 ms, and a 120 ms final hold. Retiming existing frames is free. |
| Death | Event-focused sampling clarifies the fall and yields a stable lying frame. Some duplicate terminal buffers still corrupt. | Exclude the buffer and hold the last included frame locally. Review foreshortening per body. More samples are not automatically better. |

The largest detached fall component, 977 pixels in the 128 px front seed-8 case, is **only in the excluded terminal buffer**. The adjacent included lying frame is intact. Adult front buffers similarly contain 14/103 detached pixels at the two seeds. Two earlier nine-pose falls have a one-pixel component in playback. Buffer exclusion contains the observed worst terminal failures, but does not establish that future renderer errors always land there. Raw frames and requested joints are retained; no disconnected body pixels were silently removed.

The corrected equipment cohort has **9 passes and 3 failures out of 12**, without warnings. Walk passes all six helmet/tunic/sword and south/east combinations after production cleanup. Attack passes tunic in both views and east helmet. Front helmet fails H4 keyframe-shape consistency at four frames; swords fail G4 area retention in both views, down to 43%/18% of median area. Cleanup removes 3-254 pixels per corrected case. Before/after and separate layers remain available. Gate passes do not establish professional motion or correct weapon orientation. Equipment was tested only on adult 64 px and one pose seed.

**Recommendation:** use a curated library per proportion family and native view. Calibrate once, validate coherent target XYZ/depth, render candidates, freeze selected body frames, then qualify each equipment layer against those exact frames. The implemented lab and two reviewed walks demonstrate that workflow. A professional six-action equipped replacement remains unfinished, particularly weapon grip/orientation, fast-action readability, foot planting and broader native views. Studio defaults remain unchanged. Eight unique views, arbitrary anatomy, 48 px/256 px bodies and other art styles were not qualified.

Stronger deterministic guarantees require prepared separated 2D limb artwork/mesh weights or a fitted 3D proxy. One composited PNG does not supply hidden limb surfaces, toe/sole geometry, fingers or a weapon rotation axis. The 18-point skeleton cannot recover all of those constraints. The [CC0/MIT survey](2026-10-27-animation-rigging-sources.md) identifies Quaternius/KayKit as licensed motion inputs and Three.js/Godot or MIT Animated Drawings as implementation references, not universal automatic sprite riggers. Asset and code licenses remain separate. The current bake uses pinned Quaternius data, not independently verified human mocap. No runtime dependency was added.

## Final verification and artifacts

- Type checking: zero errors and warnings. A new timing test initially exposed a 3.33 ms rounded attack-duration mismatch; durations now derive from actual source intervals.
- Full unit suite: 105 files passed, 1,019 tests passed, one existing skip.
- Relevant browser suite: six passed. Motion Lab tests repeated ten times with eight workers: 30 passed. CI=1 with one worker: three passed.
- Deliberately removing the one-shot stop guard made the review test fail. Exact source bytes were restored and the same test passed. An earlier unsaved-review reset was also reproduced before its fix.
- Production build and dist guard passed; the lab is absent from production assets. Full production E2E and new remote CI were not run for this isolated development entry. This branch is not merged into main.
- Offline geometry: 72 documents, zero reach warnings, maximum bone-length error 3.907985046680551e-14. Old/new support step: 0.856 -> 0.00479195 px. Zero-gain depth motion: 56 -> 0. Geometry metrics do not score naturalness.

Committed compact results: [2026-10-28-motion-lab-results.json](2026-10-28-motion-lab-results.json). Local media remain ignored under `spikes/api/out/motion-lab-2026-10-28/`: raw `evidence.json`, `render-analysis.json`, `equipment-analysis.json`, `qualification-summary.json`, the two `reviewed-walk-*.json` exports and `motion-review.zip`. The ZIP contains token-free evidence, 84 timed GIFs, all-frame sheets, requested-joint overlays, provenance and the reviewed walks. GIFs repeat for inspection; JSON timing/loop fields are authoritative. This research pack is not a Studio character ZIP.

Reproduce with the [lab contract](../design/skeleton-pose-lab.md), then `node spikes/api/mocap/evaluate-motion-equipment.mts` and `node spikes/api/mocap/package-motion-review.mts`. Packaging expects the two reviewed exports and screenshot in the output directory. The agent credential server was stopped after all accepted jobs settled and replaced with normal dev on localhost:5199. Reloaded Motion Lab supports free editing and saved-result review with paid controls disabled.
