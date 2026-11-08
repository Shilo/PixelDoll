# Independent motion counter-review

Reviewed `3eed2a9c` against `50eeea36`, with `6006a55c` retained as the original-action control. The original coherent-lean correction holds on the reproduced fixtures and broad finite geometry probes. One new bounded single-hip false positive remains, N1 in the parent review. No production source or production test was changed, and no PixelLab request was made.

## N1: a moving gait plus one bad hip can again bypass held-item QA

The new [calibration factor at items.ts:911](../../../../app/src/lib/items/items.ts#L911) and [scaled knee term at line 923](../../../../app/src/lib/items/items.ts#L923) are correct for a coherent upper-body rotation with stationary hips and knees. They do not prove that a measured hip midpoint is correct when the knees already move during a subthreshold gait. That independent motion can supply enough scaled knee angle to corroborate a false hip-relative lean.

[hip-candidate.mts](hip-candidate.mts) is a self-contained reproduction using the real before/after modules. It creates a complete 64-pixel six-frame `run`. Frame 2 rotates the upper body 30 degrees about the hip center and the left leg 45 degrees about its own hip. The right leg and support foot stay fixed. This is a synthetic one-leg-swing running pose, not newly generated provider art. All actual connected bone lengths are preserved to numerical precision.

Requested poses, body rasters and equipment rasters remain unchanged. Only frame 2's measured `RIGHT HIP` moves from `(0.4375, 0.625)` to `(0.32, 0.54)`, a 9.28-pixel error. The hips do not cross. A control held item follows the arm; its defective counterpart reverses 180 degrees against the hand in that frame.

| Metadata and artwork | `50eeea36` | `3eed2a9c` |
| --- | --- | --- |
| Correct metadata, correct item | Locomotion; pass | Locomotion; pass |
| Correct metadata, reversed item | G9 failure | G9 failure |
| Only the bad hip, correct item | Locomotion; pass | Action; pass |
| Only the bad hip, identical reversed item | G9 failure | Action; pass |

[Recorded evidence](hip-candidate-results.json) and executable assertions establish:

- Exactly one measured joint label changes. Complete, finite and in-bounds keypoints pass `hasAll`; `validateRig` returns no errors.
- Actual connected bone lengths change by less than `6e-15` pixels. The bad measured hip increases hip width by 0.1689 body heights and its thigh by 0.1435, below the unchanged 0.2 guards.
- Raw knee-angle change is 27.46 degrees. The 25.94-degree calibration turns that into 42.35 degrees. The wrong hip makes the neck and shoulder hip-relative angles 43.30 and 44.76 degrees, so the new lean minimum exceeds 40.
- Actual `postProcess` removes zero pixels and repairs no frames. Layer hashes remain identical before/after cleanup and between source revisions. Reversed-item grip remains within 0.71 pixels of the requested wrist.
- Both metadata variants pass source `clipQa` with no warnings. Its zero arm-adherence error does not validate the bad hip, which the default adherence metric excludes. This control establishes that the existing source check need not stop this input; it is not evidence of independent visual estimation accuracy.

This is a single erroneous measured joint with unchanged artwork, not a whole wrong limb or an ambiguous wrist. The real item-QA outcome changes from a clear 180-degree reversal failure to pass. The parent review explains measured-keypoint reachability through source creation and assigns P2 to that silent QA false negative. The other reviewer and coordinator independently replayed and challenged this fixture.

The pose, raster and metadata error are synthetic. This does not establish PixelLab frequency, justify a provider-quality claim or invalidate unchanged frozen-corpus counts. Both hips translated under an otherwise fixed resting trunk are a different case and remain correctly rejected below. Preserve the original C1 positive controls when addressing N1; do not globally remove the knee check, waive G9 or special-case a name or coordinate.

## Original fixture and corpus replay

[probe.mts](probe.mts) adapts the previous review's probe without editing the original. It pins the current module to `3eed2a9c` and compares against archived `6006a55c` source. [results.json](results.json) reproduces:

- Zero changes on its coherent-angle and frame-count matrix, including the original 45-degree upright-torch case.
- The original detached-neck counterexample is now nondecisive, as intended.
- Twelve available stored rig files, 67 clip-directions, with no decision changes; 19/20 stored slashes remain decisive.
- 38/40 four-frame slash subsamples remain decisive.
- Seventy-two projected KayKit/Quaternius fixture/clip/direction combinations, with no changes.

These projected skeletons are not new rendered PixelLab images. This lane did not reconstruct Claude's 23-rig / 293-direction or 15.2-million-position sweep; its own counts are separate bounded evidence.

## Broader finite geometry controls

[geometry.mts](geometry.mts) compares `50eeea36` and `3eed2a9c` over all 27 bench rest views. Five body-width/aspect scalings and seven whole-body rest inclinations from -45 to 45 degrees are uniformly fitted inside a square 64-pixel cell. It then rotates the upper body by -60, -45, -30, 0, 30, 45 or 60 degrees. These are body-proportion transforms, not rectangular cell support.

[geometry-results.json](geometry-results.json) records 6,615 cases. Every 45/60-degree coherent lean is decisive after the correction. No 0/30-degree case becomes newly decisive. Two widened-chibi 30-degree controls were already decisive before the correction through another existing motion gate; they are recorded rather than mislabeled as new failures. A separate 1,701-case bounded translation of both hips under a fixed resting trunk remains nondecisive in both revisions.

[projected-run-scan.mts](projected-run-scan.mts) tests each rendered run frame from the three available motion-lab fixtures in four directions, moving only one measured hip on a 0.025 grid. [projected-run-scan-results.json](projected-run-scan-results.json) records 401,544 positions and no new decisive hit. This negative search makes N1 a bounded new synthetic-pose counterexample, not an observed frozen-corpus regression. It also shows why passing a large finite scan is not a universal guarantee for different gait geometries.

## Reproduction

From the repository root, with pinned Node 24.22.1 and the existing offline transport guard:

```powershell
$env:NODE_OPTIONS='--require=C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/reviews/2026-11-07-session-counter-review/no-pixellab.cjs'
$node='app/node_modules/.cache/pixeldoll-verified-node/node-v24.22.1-win-x64/node.exe'
& $node docs/reviews/2026-11-07-3eed2a9c-counter-review/motion/probe.mts
& $node docs/reviews/2026-11-07-3eed2a9c-counter-review/motion/geometry.mts
& $node docs/reviews/2026-11-07-3eed2a9c-counter-review/motion/projected-run-scan.mts
& $node docs/reviews/2026-11-07-3eed2a9c-counter-review/motion/hip-candidate.mts
```

All four completed with exit zero. Each exports only the needed historical source/package metadata into its ignored `temp.local/` directory and pins the current application module. No checkout or source mutation is required. The geometric and item-QA question is deterministic; no paid generation is necessary to validate or refute it.
