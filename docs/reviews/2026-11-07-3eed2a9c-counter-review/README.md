# Independent challenge of the scaled knee-lean correction

Reviewed `3eed2a9c05e90f7b0febccc80e7caff804642ae0` against `50eeea36`, the [prior counter-review](../2026-11-07-50eeea36-counter-review/README.md), and [Claude's response](../2026-11-07-50eeea36-counter-review/claude-response.md). Two independent subagents investigated geometry and downstream item-quality gates; the motion reviewer also challenged the gates evidence. The coordinator inspected the diff and evidence and independently ran the production checks and unchanged new regression tests against both source pins.

**Verdict: the original C1 is corrected, but a new bounded P2 reopens the single-hip bypass in a different moving pose.** Retain the coherent-action correction and the earlier F1/F2/F3 fixes while addressing N1 below. This is bounded evidence, not proof for every possible skeleton or generated image.

| Prior correction | Verdict |
| --- | --- |
| C1 coherent moderate action lean | Held on the original fixture and finite geometry controls |
| F1 erroneous-joint protections | Original controls held; overall partially held because of N1 |
| F2 retained dark-design note | Unchanged; existing regressions pass in the unit suite |
| F3 zero-padding held wording and preview parity | Unchanged; existing regressions pass in the unit suite |
| Anchored wording | Unchanged; no new model qualification |

## Findings and disputed claims

- **The correction is justified.** [items.ts:903](../../../app/src/lib/items/items.ts#L903) derives the knee-view threshold from a 40-degree hip rotation of that same rest pose. It keeps the neck, hip, thigh and child-bone outlier protections. There is no move-name exception or request/prompt change. The original coherent 45-degree action and upright-torch fixture now match the pre-regression result, while the detached-neck negative remains rejected.
- **Claude's severity challenge is reasonable.** The original counterexample establishes a deterministic false review and possible unnecessary explicit retry, not data loss, automatic spending or demonstrated provider prevalence. P3 better describes that bounded user impact. This qualification does not invalidate the defect or its correction.
- **The source-adherence caveat is valid.** Identical requested/measured joints make zero adherence tautological; the synthetic body is not independent evidence of generated visual quality. Complete/in-bounds points, preserved bone lengths, wrist contact, identical cleanup and layer hashes still make useful deterministic controls. Neither review proves that a new model call will render this fixture.
- **An older gap remains.** Below-threshold, abrupt gait-named actions can still receive locomotion checks. Fixing the widened 40-to-68-degree gap does not solve all semantic uncertainty in arbitrary custom motion. Do not add name-specific exceptions or globally waive quality checks based on this result.
- **Action classification is not equipment validation.** The downstream checks have existing action exemptions. The north missing-frame and reversed-item controls below are important limits on claims such as "all controls held"; they are not new defects introduced by this correction.

## N1. P2: one wrong measured hip can again silence G9 on a moving gait

**Introduced by:** `3eed2a9c`. **Source:** the new [knee calibration at items.ts:911](../../../app/src/lib/items/items.ts#L911) and its multiplication in [items.ts:923](../../../app/src/lib/items/items.ts#L923). [isAction:932](../../../app/src/lib/items/items.ts#L932) promotes the clip, and [checkShape:1187](../../../app/src/lib/items/items.ts#L1187) consequently skips held-item checks. The motion reviewer discovered the case, the other reviewer independently reproduced and challenged it, and the coordinator inspected the actual inputs and source path.

**Reproduction:** use the complete 64-pixel six-frame `run` fixture in [hip-candidate.mts](motion/hip-candidate.mts). In frame 2, rotate the whole upper body 30 degrees about the hip midpoint and the left leg 45 degrees about its hip; the right leg and support foot remain still. All actual connected bone lengths remain unchanged. Keep requested poses and body/equipment rasters fixed. In that frame's measured metadata only, move `RIGHT HIP` from `(0.4375, 0.625)` to `(0.320, 0.540)`. The deliberately defective item reverses 180 degrees against the hand in that frame.

| Control | `50eeea36` | `3eed2a9c` |
| --- | --- | --- |
| Correct metadata, correct item | Locomotion; pass | Locomotion; pass |
| Correct metadata, reversed item | G9 failure | G9 failure |
| Only wrong measured hip, correct item | Locomotion; pass | Action; pass |
| **Only wrong measured hip, identical reversed item** | **G9 failure** | **Action; pass** |

The knee already turns 27.46 degrees due to the real subthreshold pose. Calibration multiplies it to 42.35 degrees. The displaced hip makes the neck/shoulder hip-relative angles approximately 43.30/44.76 degrees, so all three terms exceed 40 despite the actual torso lean being 30. Hip-width and thigh growth remain 0.1689 and 0.1435 body heights, inside the existing 0.2 guards. A rest-only hip sweep cannot expose this: its shoulder-to-knee turn is zero, and scaling zero remains zero.

**Why it is reachable:** [hasAll:19](../../../app/src/lib/rig/poses.ts#L19) accepts the complete, finite, in-bounds measured pose; `validateRig` returns no errors. [create.ts:226](../../../app/src/studio/create.ts#L226) estimates joints independently from rendered frames; [create.ts:839](../../../app/src/studio/create.ts#L839) stores requested and measured sequences separately. The classifier prefers the measured sequence. [Pose adherence:126](../../../app/src/lib/rig/poses.ts#L126) measures arm joints by default, so a hip-only error need not trigger an arm-adherence warning. This is one wrong estimate with unchanged art, not the previously declared whole-limb or wrist ambiguity.

**Controls:** exactly one measured label changes. Actual bone-length changes are below `6e-15` pixels; every point is complete and in bounds, with no crossed hips. Both metadata variants have zero source `clipQa` failures/warnings. Here requested and measured poses differ, but zero arm adherence does not validate the hip because that metric excludes it. Actual `postProcess` removes zero pixels and repairs no frames; layer hashes remain identical before/after processing and between revisions. Wrist contact stays within 0.71 pixels. The coordinator independently replayed the final probe and inspected these values in [hip-candidate-results.json](motion/hip-candidate-results.json).

**Impact and limits:** the same deliberately reversed item loses its failure without any pixel changing. This is a silent item-QA false negative, which justifies P2 more strongly than C1's false review. The coherent one-leg-swing pose and raster are synthetic, and the single-hip error is approximately 9.28 pixels. It does not establish observed PixelLab incidence, realism of every gait, or a new generation-quality rate. These controls establish a deterministic supported-path regression, not provider performance.

**Worth fixing:** require the corroborating motion to distinguish genuine torso motion from a displaced hip midpoint while preserving coherent moderate actions. Keep the C1 positives, this moving-gait bad-hip negative, original neck/hip negatives, short slashes, and clean/reversed equipment controls together. Do not roll back the whole correction, add a coordinate/name exception, or simply lower/raise all thresholds to fit this fixture. The question is deterministic and does not require a paid generation.

## Independent geometry and gate evidence

The [motion review](motion/README.md) and [probe results](motion/results.json) reproduce the original fixture and compare against `6006a55c`: zero differences on the synthetic angle/frame-count sweep, the available 12 rigs / 67 stored clip-directions, and 72 projected motion combinations. Stored slash coverage remains 19/20 directions and 38/40 short subsamples. Projected skeletons are not new provider renders.

The geometry lane additionally challenges body width/proportions, inclined rest poses and displaced hips: 6,615 coherent-rotation cases preserve all tested 45/60-degree actions and add no newly decisive 0/30-degree cases; 1,701 fixed-trunk hip translations remain nondecisive. These finite property probes do not cover N1's combination of genuine knee motion and a bad hip estimate. See its owned scripts/results for exact domains and preexisting exceptions, rather than treating them as an anatomical or estimator universality proof.

A separate [projected-run search](motion/projected-run-scan-results.json) finds no new hit in 401,544 single-hip positions across isolated projected run frames. This is useful negative evidence and another reason to keep N1's synthetic-pose scope explicit. It does not refute a reproducible different pose.

The [gates review](gates/README.md), [pinned probe](gates/probe.mts), and [all 80 paired results](gates/results.json) cover G4/G5/G9 through actual `itemQa`, on both revisions. Only ten 45-degree `run-dodge` cases change; all match otherwise-identical ordinary `dodge` action controls. Zero- and 30-degree locomotion and 70-degree action controls stay unchanged.

| Item control in the newly recognized moderate action | Result after the correction |
| --- | --- |
| Upright held item through the lean | Original false G9 failure clears |
| Shortened or one-empty-frame item, south | G4 still fails |
| Entirely absent item, either view | G4 still fails |
| Shortened or one-empty-frame item, north | Existing north-action warning policy applies |
| Reversed held item | Existing action G9 exemption can allow it |

The last two outcomes also occur under `dodge` and stronger action controls before the fix. Broadly restoring locomotion checks on actions would bring back known false positives; a new action-aware equipment validator would need separate evidence. The gates fixture intentionally uses an empty body and the same pose geometry for north/south to isolate these branches; it cannot qualify real north-view occlusion.

F2 persistence and F3 wording/preview paths are byte-unchanged by this commit. The complete unit suite still exercises their regressions. This review does not claim a fresh dedicated F2/F3 browser fixture or maximum-size provider experiment.

## Checks, failures and exclusions

Pinned Node 24.22.1 and existing dependencies. Real Node PixelLab transport was blocked with the existing [review preload](../2026-11-07-session-counter-review/no-pixellab.cjs); browser tests used the existing [offline wrapper](../2026-11-07-session-counter-review/playwright.config.mts), loopback-only keyless dev/preview servers, and blocked unmocked external traffic. No agent server, credentials or user browser tabs were used.

| Check | Result |
| --- | --- |
| `npm run check` | Pass, zero Svelte errors/warnings and TypeScript checks pass |
| `npm test` | 2,012 passed, one existing skip, 167 files |
| Frozen `node scripts/bench.ts`, without `--write` | Exit zero; all 20 rows match expected results. Expected image-QA failures within rows remain |
| Four exact new production regressions on both pins | Before: three expected failures and one passing negative. After: all four pass |
| Original and extended motion probes | See motion evidence |
| Paired G4/G5/G9 integration probe | 80 paired cases pass all asserted controls |
| Moving-gait single-hip counterexample | N1 reproduced independently by both reviewers and replayed by the coordinator; all positive/negative controls assert |
| Studio and browser selftests | 68 passed, 1.4 minutes; final process exit zero |

The [regression preparer](prepare-regressions.mjs) exports source snapshots into ignored `temp.local`; it copies the four new production tests without weakening assertions or editing tracked tests. [Results](regression-results.json) retain historical expected failures. Its nonzero aggregate exit is expected because the prior revision must fail those three cases. Eighteen unrelated test cases across both copies are filtered, not new suite coverage.

**Browser failures retained:** the initial sandbox run completed 58 passing and ten failing test bodies. All ten failed with `download.path: canceled`; it then hung in shutdown and was interrupted. A single Motion Lab download control passed after redirecting TEMP/TMP to a workspace-owned directory, but that sandbox run also hung in shutdown and was interrupted. The final complete 68-test run used workspace TEMP/TMP plus unsandboxed execution to permit test-process cleanup; it passed and exited zero. No app, test assertion, timeout or test configuration was changed. Thus the final result supports an environment/harness failure, not a reason to modify export code. Both environment changes are disclosed; the download control alone does not prove the entire cause of shutdown failure. Initial and final raw logs remain ignored at `app/test-results-3eed-review-browser*.log`.

No paid experiment was needed to decide this geometric correction or deterministic gate behavior. No PixelLab generation, polling or balance request was made. Claude's larger 23-rig/293-direction and 15.2-million/3.8-million scratch sweeps were not independently reconstructed; their scripts are uncommitted. No fresh provider-quality, aesthetic, universal-estimator or full end-to-end-suite claim is made.

No production source, production test, board card, dependency or setting was changed by this review. Only review documentation/evidence and the review index are included in this delivery.

## Reproduction and next review

Commands use the repo-pinned Node and existing dependencies. Set `NODE_OPTIONS` to the absolute no-PixelLab preload path shown above. From the repository root:

```text
node docs/reviews/2026-11-07-3eed2a9c-counter-review/motion/hip-candidate.mts
node docs/reviews/2026-11-07-3eed2a9c-counter-review/motion/probe.mts
node docs/reviews/2026-11-07-3eed2a9c-counter-review/motion/geometry.mts
node docs/reviews/2026-11-07-3eed2a9c-counter-review/gates/probe.mts
node docs/reviews/2026-11-07-3eed2a9c-counter-review/prepare-regressions.mjs
```

From `app/`:

```text
npm run check
npm test
node scripts/bench.ts
node node_modules/vitest/vitest.mjs run --config ../docs/reviews/2026-11-07-3eed2a9c-counter-review/vitest.config.mjs -t 'a coherent moderate lean|a gait word in an action|hips sliding|G9 lets a torch' --reporter=json --outputFile=../docs/reviews/2026-11-07-3eed2a9c-counter-review/regression-results.json
node node_modules/@playwright/test/cli.js test --config ../docs/reviews/2026-11-07-session-counter-review/playwright.config.mts studio.spec.ts selftests.spec.ts
```

The final browser command needs a built app, unique ports (this run used 5557/5558), `PD_REVIEW_R4=0`, an absolute `TEST_OUTPUT_DIR`, the installed `PLAYWRIGHT_BROWSERS_PATH`, and workspace-owned TEMP/TMP. The preceding failed runs used other ports/output directories and were retained. [verification.json](verification.json) records pin/file/log hashes and concise results; [verification.mjs](verification.mjs) regenerates that summary while the ignored local logs exist. Counts overlap and must not be summed as unique tests.

Claude should independently challenge N1 before correcting it, then prove the moving-gait negative and the coherent moderate-action positive together. Preserve F2/F3, original outlier controls, short slashes, preview parity and existing action-policy distinctions. Record what remains unqualified. This review supplies no production fix and does not authorize unrelated wording or UI changes.
