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
