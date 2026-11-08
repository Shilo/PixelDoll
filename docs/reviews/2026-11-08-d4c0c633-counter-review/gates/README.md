# Independent gate and regression review

Reviewed `d4c0c633` against `3eed2a9c`, with `50eeea36` retained as an ancestor control. Every tested implementation is exported with `git archive` into ignored `temp.local`, so the unrelated uncommitted hair/export work is absent. No production source, tracked test, board card or credential was changed. No PixelLab call, balance request or paid generation was made.

## Original N1 and exact regression

[prepare.mjs](prepare.mjs) exports all three source pins and copies the exact new production regression from `d4c0c633`, redirecting source imports to each archive. It preserves all assertions. [vitest.config.mjs](vitest.config.mjs) runs only that new regression.

[regression-results.json](regression-results.json) records one expected assertion failure before the fix and one pass afterward, with 26 unrelated cases filtered across both copies. The historical failure occurs at the bad-hip classification assertion, not a setup failure. This supports the new production regression's validity; it is not a full-suite count.

An initial Vitest attempt ran no test bodies because the sandbox temporary directory rejected file renames (`EPERM`). [regression-setup-failure.json](regression-setup-failure.json) preserves it. Redirecting TEMP/TMP to the workspace-owned ignored directory allowed the unchanged test to run. A separate initial version-check command had a duplicated Node path and did not execute; that command typo supplied no evidence and was corrected. No production assertion, timeout or configuration was weakened.

## Paired G4/G5/G9 matrix

[probe.mts](probe.mts) directly calls each archive's `isAction` and `itemQa`. Its 480 paired cases cover:

- `run` and `dodge`, north and south;
- torso leans of 0, 30, 45 and 60 degrees;
- no leg swing, a 45-degree same-direction left-leg swing, and a 45-degree opposite-direction swing;
- correct metadata or the original N1's one wrong `RIGHT HIP`;
- clean held art, a 180-degree reversal, one absent frame, an entirely absent clip and a shortened item.

[results.json](results.json) retains the source hashes, changed rows, all original N1 rows and original C1 controls. Only ten rows change, all the intended 30-degree run / same-direction 45-degree leg swing / bad-hip combination. Original N1's reversed item fails G9 after the fix; its correct item passes. Correct metadata already rejected the reversal and remains unchanged. The 45-degree coherent torso-only action remains an action, ordinary `dodge` outcomes remain unchanged, and completely absent clips still fail G4.

This matrix intentionally has empty body rasters to isolate gate branches without an occlusion excuse. Its north/south geometry is identical. It is deterministic integration evidence, not an independent visual, north-occlusion or provider-quality assessment. The original C1 upright-world torch intent is separately exercised by the motion reviewer; this matrix's clean item turns with its arm.

## Independently reproduced remaining joint-travel bypass

The response openly declares residual joint-travel/rise cases. [travel.mts](travel.mts) independently finds three concrete examples in 20,030 tried positions and asserts their item-level controls; [travel-results.json](travel-results.json) retains complete requested/measured poses and outcomes.

At a synthetic 35-degree torso lean and 60-degree left-leg swing, move only measured `LEFT HIP` from `(0.5625, 0.625)` to `(0.175, 0.525)` (the other recorded cases vary its y slightly). Correct metadata fails the 180-degree item reversal. With that one bad hip, both the clean and reversed item pass at `50eeea36`, `3eed2a9c` and `d4c0c633`.

This remains a real deterministic equipment-QA false negative, not harmless merely because it predates this correction. However it is **not a new regression in `d4c0c633`**, and does not refute the isolated N1 lean correction. The error is approximately 25.6 pixels at a 64-pixel cell, crosses the hip's screen-side position and combines with a large one-sided swing. The fixture is synthetic, and this lane does not establish provider incidence. The empty-body gate harness also does not demonstrate real source-body review outcomes for this separate residual case.

A follow-up should challenge the common translation origin used in [items.ts:927](../../../../app/src/lib/items/items.ts#L927): moving one hip shifts the midpoint subtracted from every joint. Corroborating apparent travel/rise about additional independent references is worth investigating, with genuine short slashes, jumps and moving-pelvis actions retained as controls. It is not automatically safe to transplant the rigid individual-hip lean constraint to all motion metrics.

## Independent challenge of the new pelvic-countertilt regression

I read and independently replayed the motion lane's [pelvis-probe.mts](../motion/pelvis-probe.mts), with all its assertions passing. The intended custom action has a 45-degree upper-body lean and a coherent 30-degree countertilt of the pelvis; each leg translates with its own hip. The support-foot-height normalization is a global translation. The 180-degree reversal fixture above is not reused here: this is a deliberately upright world-oriented torch requiring wrist articulation.

With identical artwork and complete metadata, `3eed2a9c` says action/pass, while `d4c0c633` says locomotion and fails G9 by 45 degrees. Changing only the move name to `dodge` passes both. Keeping the pelvis neutral or removing the upper-body lean also passes the intended controls. The body, hip width and explicitly checked bone lengths stay coherent; cleanup and image hashes remain unchanged. The new individual-hip calibration assumes stationary relative hip positions, so legitimate movement of the reference pivots defeats it.

I endorse this as a bounded new false-review regression worth correcting while preserving N1. Its severity is closer to P3 than N1's silent pass: it sends intended art to review without deleting it or automatically spending. The raster/action intent is synthetic, the implied lumbar bend is 75 degrees, and the upright torch is an explicit fixture intention. Neither zero adherence from identical requested/measured points nor passing source QA proves that a provider would generate such art. Those limitations should remain explicit, while the supported custom/imported-pose counterexample should not be dismissed solely because the frozen corpus lacks it.

## Independent candidate challenge

[candidate.mts](candidate.mts) exports another private `d4c0c633` archive and copies only the motion reviewer's scratch candidate `items.ts` into that archive. It does not import the dirty application tree. The candidate permits two plausible, nondegenerate, disjoint upper-body axes (nose-to-neck and shoulder-to-shoulder) to corroborate a coherent action when individual-hip pivots cannot. It retains the knee, torso and hip-center checks.

[candidate-results.json](candidate-results.json) records the candidate module SHA-256, a direct original-N1 rejection, unchanged decisions on 17 bench clip-directions and 72 projected combinations, and zero decision changes over 25,992 individual-joint positions across all 18 labels on four south-view resting bodies. This last comparison is against `d4c0c633`; it does not mean every old wrist or end-joint ambiguity is rejected.

The same script privately adapts the original pelvic item-QA fixture, preserving its historical probe. [candidate-pelvis-results.json](candidate-pelvis-results.json) records `d4c0c633` failing the intended upright torch and the candidate passing, with rename-only, neutral-pelvis, torso-zero, cleanup and geometry controls intact. All assertions pass. Its source hashes identify the scratch module, not an already committed production correction.

One first adaptation attempt inherited an archive header with a different relative root and stopped on `git archive` path resolution. It did not reach candidate assertions. The owned replay generator was corrected to use already prepared pinned sources; production files and fixture assertions were untouched. The final invocation exits zero.

I also statically reviewed the coordinator's corresponding production function and two new regression tests. Skipping the fallback calculation when the individual hips already meet 40 degrees, or the hip-center bend is below 40, preserves the candidate's threshold decisions because the surrounding minimum already decides those cases. The new tests cover both countertilt signs, name controls, a neutral torso and single head/shoulder outliers. The coordinator owns clean-snapshot validation of that final implementation; this lane's scratch results should not be relabeled as a full production-suite run.

## Challenge to likelihood and provenance claims

- `6006a55c` having the same old hole is useful history. It does not make the reopening at `3eed2a9c` cease to be a regression relative to its immediate guarded baseline.
- Measured-versus-requested differences in 88 stored frames are not ground-truth estimator error measurements or a representative incidence study. The response's own smaller 2-to-3-pixel triggers also mean that the original 9.3-pixel example cannot alone establish rarity.
- A reversed item is one observable harm, not a prerequisite to misclassification itself. The shared decision also controls G5 and north-view G4 leniency.
- The response candidly states its suite included unrelated uncommitted changes. The coordinator's clean pinned checks, rather than the reported 2,021 dirty-tree tests, must establish the correction commit's own validation.
- The 293-direction, 15.2-million and 3.8-million scratch sweeps were not reconstructed by this lane. Their counts remain reported claims, separate from the committed portable probes here.

## Reproduction

From the repository root with pinned Node 24.22.1:

```powershell
$env:NODE_OPTIONS='--require=C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/reviews/2026-11-07-session-counter-review/no-pixellab.cjs'
$node='app/node_modules/.cache/pixeldoll-verified-node/node-v24.22.1-win-x64/node.exe'
& $node docs/reviews/2026-11-08-d4c0c633-counter-review/gates/prepare.mjs
& $node docs/reviews/2026-11-08-d4c0c633-counter-review/gates/probe.mts
& $node docs/reviews/2026-11-08-d4c0c633-counter-review/gates/travel.mts
```

The candidate replay additionally needs the motion reviewer's pinned `pelvis-probe.mts` and `candidate-check.mts` to run first, then `gates/candidate.mts`. It exports its own private candidate archive, preserving the original probes and the dirty working tree.

For the regression from `app/`, set TEMP/TMP to `docs/reviews/2026-11-08-d4c0c633-counter-review/gates/temp.local/unit-temp` using its absolute path, then run pinned Node on:

```text
node_modules/vitest/vitest.mjs run --config ../docs/reviews/2026-11-08-d4c0c633-counter-review/gates/vitest.config.mjs -t 'one wrong hip estimate' --reporter=json --outputFile=../docs/reviews/2026-11-08-d4c0c633-counter-review/gates/regression-results.json
```

The paired unit command exits nonzero because the historical implementation is intentionally required to fail. Probe and travel commands exit zero. The travel script imports the gate probe, so that command also reruns the same 480-case matrix; do not count it as additional unique coverage. No browser suite or full production suite was run by this lane; those belong to the coordinator.
