# Independent final source review

November 8, 2026. Reviewed the actual working-tree correction against `c1024a0c`, the prepared corrected snapshot, and the integration snapshot based on `aa222267`. This review owns no production, test, board, or other agent changes.

**Finding:** no actionable defect found in the selected review-only policy. This endorses its disclosed behavior, not a claim that the classifier now identifies every erroneous hip or that all intended action artwork remains a clean pass. Completion still depends on the coordinator's pending full browser and final integration results.

## Source and behavior checked

- Read `AGENTS.md`, the owned production/test diffs, the implementation and persistence helpers, the correction README, and both independent challenge/control reports. Inspected the runner's clean/review decision and clip replacement and acceptance paths.
- Independently matched SHA-256 hashes of the working-tree `items.ts`, `qa-summary.ts`, and Studio `model.ts` to `fixed-snapshot.json`. The integration snapshot identifies the same three source hashes and the expected separate manifest baseline.
- Confirmed that the new G16 observations call only the warning helper, count each affected clip once, and do not populate failure or soft-call maps. Existing G4 and G8 failures remain on their existing paths. Ordinary action names retain the existing exemption.
- Confirmed the optional count is part of replaceable per-clip summaries, summed by `mergeQa`, retained by `acceptQa`, and translated by saved-item `qaReasons`. It is not appended to persistent design warnings. The existing replacement mechanism removes a replaced clip's contribution.
- Inspected the new tests for strict-gait negative controls, ordinary actions, clean art, signed and unsigned turns, shape comparison, size thresholds, loop seams, acceptance, JSON, partial replacement, and editable ZIP bytes. The two browser changes extend the existing real-reload review test without removing prior assertions.

## Additional independent offline differential probe

Ran a small deterministic probe through the real baseline and corrected `itemQa` modules using pinned Node 24.22.1 and the existing no-PixelLab transport preload. The probe was supplied on standard input and changed no source or test file. It imports the frozen motion fixture and makes its own cell images and masks.

Its 64 cases vary zero versus 32-pixel padding, transparent versus opaque rectangular body rasters, looped versus nonlooped playback, clean/reversed/shrunken/missing equipment, and `walk` versus ordinary `dodge` names. Unlike the broad policy matrix, the opaque-body cases exercise the visibility computations with body pixels. They are branch controls, not visual proof of realistic occlusion.

Result: 24 review changes, each with exactly one aggregate count, one clip count, and one G16 warning. All 64 cases retain identical failure and soft-call maps. Ordinary action cases have no result drift; consistent equipment acquires no motion warning. The command completed successfully in approximately two seconds. No PixelLab call, credential access, browser action, or paid generation occurred.

## Qualifications

The change deliberately leaves the original classifier and its imperfect hip-relative movement evidence intact. A gait-containing name with legitimate action movement can now receive a review warning when the existing G5/G9 limits are exceeded. Existing hanging/occlusion exceptions and tiny-item signed-direction limits remain. Those boundaries are disclosed in the main report and are not evidence of universal semantic detection.

I did not rerun the full unit or browser suites while the coordinator's full browser run was active. The reported 2,042 unit passes, seven focused passes, and broader independent matrices belong to their respective recorded runs; this review does not recast them as tests run here. No heavy concurrent test job was started.
