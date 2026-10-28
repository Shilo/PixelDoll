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

Implementation and paid qualification are in progress. No quality improvement is claimed yet.

## Implemented changes and first pilot, October 28

The converter and standalone Motion Lab are now implemented. See [tool contract](../design/skeleton-pose-lab.md). Neither is wired into Studio defaults. The original retargeters remain unchanged as historical baselines, apart from exporting source sampling and parameterizing their existing camera estimator for reuse.

| Concern | Before | Corrected implementation / evidence |
| --- | --- | --- |
| Support switch | 0.856 px maximum joint step across 0.5954-0.5955 s | 0.0033302 px on the same stored walk, with continuous reach correction |
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
