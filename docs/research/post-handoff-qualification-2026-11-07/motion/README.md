# Motion-source qualification

November 7, 2026. Executed offline follow-up to the [RGB MoCap review](../../rgbmocap-pixeldoll-review-2026-11-07.md) and [hybrid body/motion review](../../hybrid-body-motion-review-2026-11-07.md). This work tested current shared authoring code and fixed a reproduced source-timeline defect. It did not install motion-capture software, reconstruct video, run Blender, or purchase PixelLab calls.

## Evidence and result

The existing CC0 Quaternius-baked [motion library](../../../../app/dev-fixtures/motion-lab/library.json), with its [license](../../../../app/dev-fixtures/motion-lab/LICENSE.txt), supplied six moves on three body proportions and two views. These are existing licensed controls, not newly produced RGB MoCap exports.

The replay ran **36 cases and 3,234 frames**. It measured reference projection, a separate bind-pose still control, zero-gain behavior, fixed target segment lengths, input preservation and complete retargeted result hashes. Before/after results are in [before.json](before.json), [after.json](after.json) and [comparison.json](comparison.json).

All 36 valid result hashes are unchanged after the fix. Inputs remain unchanged. Maximum segment-length error was approximately `3.20e-14`; maximum bind/zero-gain projection error was approximately `1.78e-14` pixels. Those floating-point results qualify numerical preservation of the existing authoring controls. They do not prove anatomical accuracy, natural rendered motion, valid face/grip pixels, or production image-quality improvement.

The adversarial replay originally accepted five of eight malformed source cases as finite output: descending source times, contradictory duplicate timestamps, nonfinite duration, negative source time, and a source time after the declared duration. The other three cases already failed: negative duration through the sampler, a missing source joint, and an invalid contact weight. The missing joint still fails through a generic low-level error in this direct-helper probe; actual imported authoring documents separately validate missing joints before building.

The shared [motion.ts](../../../../app/src/lib/rig/motion.ts) now validates source chronology and duration at both sampling and retargeting boundaries. A source time must be finite, nonnegative, within the finite nonnegative duration, and ordered. Repeated timestamps remain valid when their canonical joint positions and contact weights agree. Contradictory same-time poses or support states fail explicitly. This prevents ambiguous imported timing from being silently resampled into a plausible-looking pose sequence.

The fix deliberately preserves:

- Repeated requested sample times used for holds and repeated frames.
- Identical duplicate source samples, including contact information.
- A single still pose and a zero-duration still-pose source.
- Sources whose samples do not cover the entire declared duration. No new endpoint clamp, loop policy or full-span requirement was introduced.
- Existing target reference, per-body proportions, projection, handedness labels, root/contact solving and padding behavior.

The replay's additional sparse-coverage arm-distance diagnostic was zero because the selected arm samples were static. It is nondiscriminating evidence and does not qualify a new extrapolation or clamping policy.

## Regression and performance checks

The new [motion-source-contract tests](../../../../app/test/unit/motion-source-contract.test.ts) exercise both shared consumers and JSON-round-tripped Motion Lab documents. They also retain valid holds, identical duplicates, single poses, zero-duration sources, and partial coverage.

Before the fix, the new file had 13 failing tests and three passing controls: 11 failures exposed unexpected acceptance; two concerned a negative-duration error that came from target-time checking rather than a clear source-duration check. After the fix, all 16 pass. Existing motion, planting, Motion Lab, motion tools and aligned-motion suites also pass: **51 tests across six files**.

The first unit launch failed before collection because the sandbox's temporary-directory rename was denied. Using the owned, ignored `temp.local` directory allowed normal collection. That infrastructure error is separate from the reproduced regression failures.

[compare.mts](compare.mts) also ran five alternating-order warmed timing pairs, each making 100 retargeting calls on the 82-frame walk. Baseline and changed medians were approximately 99.47 and 96.32 milliseconds in the recorded local run. The timing spread does not establish a speedup; it shows no material slowdown in this small CPU probe. It is not a general performance guarantee. The script uses Node's experimental TypeScript-stripping API to load the pinned baseline without changing production files and emits the corresponding Node warning.

## Public RGB MoCap export check

[source-availability.mjs](source-availability.mjs) queried the complete public Git tree at the research-pinned RGB MoCap revision. [source-availability.json](source-availability.json) records zero files with common structured-motion extensions (`fbx`, `bvh`, `glb`, `gltf`, `npz`, `npy`) and three preview videos. A preview is not a structured motion export and cannot establish bind, hierarchy, joint, contact or sampling metadata.

This finding is limited to that pinned public tree and those extensions. It does not establish that all releases, external downloads or separately supplied exports are unavailable. No actual RGB MoCap export was converted, and no model/body-data terms were accepted to manufacture one. General FBX/BVH import remains unimplemented and unqualified; the successful controls use the repository's existing motion representation.

## Dispositions and next evidence

| Lead | Executed disposition |
| --- | --- |
| Existing licensed motion across proportions and views | Numerical invariants and exact before/after hashes preserved over 36 cases; no image-quality conclusion |
| Ambiguous source timestamps and invalid durations | Reproduced through helpers and authoring import; fixed in shared source validation with focused regressions |
| Same-time authored holds and partial source coverage | Preserved; rejected the overbroad alternative of enforcing strict timestamp increase everywhere or requiring full-duration coverage |
| Missing joint mappings | Malformed source joints fail, and authoring import validates them. A general RGB MoCap semantic/bind mapper was not invented from video evidence |
| RGB MoCap export/native reconstruction | No common structured sample in the checked pinned tree. Actual export comparison remains blocked on a legitimately available export; no native quality claim |
| Parametric/voxel rendering and semantic masks | No native authoring/render run in this work. Geometry labels would describe the rendered fixture only; AI-pixel correspondence remains a separate qualification |
| Endpoint clothing physics and generated gear transfer | No new paid comparison in this motion subtask. Existing mixed conditioning evidence remains the baseline; a controlled motif/body-fidelity extension is still needed |

The delivered change improves correctness of motion-authoring input handling. It does not add an end-user motion importer, another model, or a new generation default. The next useful RGB MoCap test requires an actual licensed structured export with recorded bind, basis, timing and correction provenance. Compare it to these existing controls before adding consumer UI or dependencies.

## Reproduce

Run from the repository root with the repository-pinned Node executable:

```text
node docs/research/post-handoff-qualification-2026-11-07/motion/probe.mts docs/research/post-handoff-qualification-2026-11-07/motion/after.json
node docs/research/post-handoff-qualification-2026-11-07/motion/compare.mts
node docs/research/post-handoff-qualification-2026-11-07/motion/source-availability.mjs
```

The availability check uses the public network; the replay and comparison use local stored controls. `compare.mts` checks the captured source hashes and loads the recorded baseline commit. Preserve `before.json` as historical evidence. Unit commands run from `app/` under the same pinned Node and an owned temporary directory:

```text
npm test -- motion-source-contract.test.ts motion.test.ts planting.test.ts motion-lab.test.ts motion-tools.test.ts aligned-motion.test.ts
```
