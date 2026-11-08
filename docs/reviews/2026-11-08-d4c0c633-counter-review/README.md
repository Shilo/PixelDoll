# Independent review and correction of d4c0c633

November 8, 2026. Reviewed `d4c0c633d4ba9fbffd8a9765420a0527c100e208` against `3eed2a9c`, [Claude's response](../2026-11-07-3eed2a9c-counter-review/claude-response.md) and the [prior N1 evidence](../2026-11-07-3eed2a9c-counter-review/README.md). Two independent subagents challenged geometry and item-quality gates. Both independently reproduced the pelvic countertilt counterexample and peer-reviewed the coordinator's narrow correction. All testing was offline.

**Verdict: original N1 is fixed. One new P3 false-review regression was confirmed and corrected in this delivery.** The older joint-travel bypass is real and remains a separately qualified limitation. This review does not claim universal rejection of erroneous estimates or universally clean generated equipment.

| Reviewed behavior | Verdict |
| --- | --- |
| N1 single bad hip in the original leaning stride | Held; unchanged new regression fails before `d4c0c633` and passes after |
| C1 coherent moderate action with stationary pelvis | Held |
| Coherent action with independently tilting pelvis | Failed in `d4c0c633`; corrected here, R1 below |
| Original F1 outlier controls | Held in focused pinned run and corrected full suite; older joint-travel ambiguity remains |
| F2 dark-note persistence and F3 zero-padding wording | Unchanged by both classifier corrections; existing regressions included in the clean full unit suite |
| Anchored wording | Unchanged; no new provider qualification |

## R1. P3: stationary-hip calibration falsely rejects a coherent pelvic countertilt

**Introduced by:** `d4c0c633`. **Source at that pin:** `app/src/lib/items/items.ts:918` adds individual-hip pivots, and `:930` takes their minimum. The important expression is `Math.min(...pivots.map(...), neckLean, Math.abs(bend))`. Source-line positions in the shared working tree differ because another agent's hair changes precede this function; the Git pin identifies the reviewed lines precisely.

The individual-hip calibration models a rotating upper body with those hip pivots at their standing positions. A coherent pelvis may counter-tilt instead. The central torso lean and knee corroboration still exceed the threshold, but the moving individual hips reduce one observer below 40 degrees and reactivate locomotion-only G9.

**Reproduction:** [pelvis-probe.mts](motion/pelvis-probe.mts) exports both source pins and creates a complete six-frame 64-pixel `run-dodge`. Frame 2 leans the upper body 45 degrees and counter-tilts the pelvis 30 degrees around its midpoint. Each leg translates with its own hip. A global two-pixel shift preserves the support sole's height. An intentionally world-upright torch stays at the wrist; no estimator error is involved.

| Control | `3eed2a9c` | `d4c0c633` | Corrected snapshot |
| --- | --- | --- | --- |
| 45-degree upper lean, level pelvis | Action; pass | Action; pass | Action; pass |
| **45-degree upper lean, -30-degree pelvis** | **Action; pass** | **Locomotion; G9 fails 45-degree turn** | **Action; pass** |
| Identical countertilted frames, renamed `dodge` | Action; pass | Action; pass | Action; pass |
| Pelvic tilt with no upper lean | Locomotion; pass | Locomotion; pass | Locomotion; pass |

**Controls:** complete finite in-bounds joints, zero `validateRig` errors, unchanged limb/face bone lengths and hip width, and unchanged central neck-to-hip distance. Individual neck-to-each-hip distances are not asserted as fixed bones: the pelvis articulates. Actual `postProcess` removes no pixels and repairs no frames; layer hashes remain identical across cleanup and implementations. Grip stays within one pixel. Source `clipQa` has no failures/warnings; its zero adherence from identical requested/measured inputs is not independent visual-estimation proof. [Historical results](motion/pelvis-results.json) and [fixed results](motion/fixed-results.json) preserve these distinctions.

**Reachability and impact:** the custom move ID can contain a gait word, and imported/custom complete poses can articulate the pelvis. The same art's rename-only control changes the verdict, as in the earlier C1. This sends valid fixture art to review without deleting it or automatically spending, so P3 matches the demonstrated impact. The action, raster and wrist intention are synthetic; the implied lumbar bend is 75 degrees. This establishes a supported deterministic counterexample, not observed PixelLab prevalence or a claim that every real-world action takes this pose.

## Correction and preservation of the earlier fixes

The correction changes only `decisiveAction` and adds two regression tests in `app/test/unit/move-classification.test.ts`.

It retains all existing knee, central torso, neck, individual-hip, chain and bone-growth checks. When the per-hip observers cannot corroborate a central lean, the minimum turn of two independent upper-body axes can corroborate it instead: nose-to-neck and shoulder-to-shoulder. Both require plausible endpoints and nonzero length. One bad hip rotates neither axis; one bad head/shoulder joint cannot rotate both disjoint axes. Existing `angleDiff` is reused, so a 180-degree endpoint swap does not manufacture an axis rotation. Zero-length axes cannot supply evidence.

The fallback only replaces the restrictive individual-hip corroboration; it does not override knee or central torso checks, or globally declare the move an action. Short circuits skip it when the hips already pass or the central bend already vetoes a lean. No threshold, move-name exception, route, prompt, request, UI or persistence policy changed. No new dependency was introduced.

The new positive regression covers both countertilt signs, gait and ordinary action names, actual G9 outcomes, and a pelvis-only negative. It fails on `d4c0c633` and passes with the correction. The second regression covers 100 single nose/neck/shoulder positions against a subthreshold lean and passes before and after. The existing N1 grid and reversed/clean item controls remain unchanged and pass.

The independent [motion review](motion/README.md) verifies the final corrected source hash and replays actual item QA, original N1 and collapsed-axis controls. The [gates review](gates/README.md) challenges a scratch implementation with equivalent threshold behavior: 17 bench clip-directions, 72 projected combinations and 25,992 single-joint positions retain their decisions. These are bounded controls, not universal estimator validation. The final clean production snapshot has its own required suite results below.

## Other claims challenged

- **Regression history:** `6006a55c` already permitting the old single-hip hole does not invalidate N1 being a reopening relative to `50eeea36`. The new correction does fix the specific N1 lean bypass.
- **Likelihood:** measured-versus-requested differences in 88 stored frames are not ground-truth estimator error or representative incidence estimates. Claude's own 2-to-3-pixel triggers weaken an argument based only on the original 9.3-pixel example. A reversed item demonstrates harm; it is not required for the underlying misclassification, which also controls G5 and north-view G4. No numeric probability or confident rarity classification is established here.
- **Broad sweeps:** the independent geometry lane tests 31,185 finite poses and finds no new 45/60-degree loss in its simple motion families. Those families do not independently tilt the pelvis and therefore miss R1. Claude's 293-direction, 15.2-million and 3.8-million scratch counts were not reconstructed; their scripts remain uncommitted. They are reported claims, not this review's coverage.
- **Uncommitted work:** Claude candidly says its checks included another agent's work. This review instead archives `d4c0c633` and tests it without the shared tree's hair/export modifications. A second archive overlays only the owned classifier block and regression file. Both reuse the existing dependencies through a junction. Source hashes are recorded in [snapshot.json](snapshot.json) and [fixed-snapshot.json](fixed-snapshot.json).

## Remaining preexisting joint-travel limitation

The gates reviewer independently reproduces actual reversed-item passes at `50eeea36`, `3eed2a9c` and `d4c0c633`: a synthetic 35-degree torso lean with a 60-degree one-leg swing, plus one measured hip displaced approximately 25.6 pixels across its screen-side position. Correct metadata rejects the reversed item. Changing that hip shifts the common midpoint subtracted from all joints and makes their apparent travel decisive. [travel-results.json](gates/travel-results.json) contains three examples, found in 20,030 tried positions.

This is a real older deterministic false negative, not harmless merely because it predates this commit. It does not refute the isolated N1 lean correction and was not introduced by R1's fix. Its error is large, its fixture synthetic, and the empty-body gate harness does not independently qualify source-body review for it. It remains uncorrected here; fixing it requires separately qualifying the travel/rise translation origin against genuine slashes, jumps and moving-pelvis actions. Do not copy the rigid-pivot rule into those metrics without those controls. This delivery claims a narrow R1 correction, not removal of every known joint-estimate ambiguity.

## Validation, failures and skips

Pinned Node 24.22.1, existing dependencies, no install. [prepare-snapshot.mjs](prepare-snapshot.mjs) exports tracked source and fixtures, excludes private `.env` and unrelated uncommitted files, and writes an offline Playwright wrapper inside ignored snapshots. `--fixed` overlays only the owned classifier function and regression test file. No worktree was reverted or stashed.

| Check | Clean `d4c0c633` | Clean corrected snapshot |
| --- | --- | --- |
| `npm run check` | Pass; zero Svelte errors/warnings | Pass; zero Svelte errors/warnings |
| Full `npm test` | Two attempts each hit the unchanged 20-second F1 sweep deadline; other 2,012 tests passed, one existing skip | **2,015 passed**, one existing skip, 167 files |
| Pinned focused classification suite, unchanged deadline | **14 passed**, heavy sweep approximately 8.7 seconds | Included in passing full suite |
| Frozen `node scripts/bench.ts`, no `--write` | All 20 rows match expected results | All 20 rows match expected results |
| Studio and selftests browser specs | **68 passed**, process exit zero, approximately 2.1 minutes | **68 passed**, process exit zero, approximately 2.8 minutes |
| Exact original N1 regression on old/new source pins | Before: one expected assertion failure; after: one pass | Existing regression remains unchanged and passes |
| Two new regression tests on pinned/corrected source | Countertilt positive fails before; independent-joint negative passes | Both pass |

The two pinned full-suite failures were timeouts (approximately 35.4 and 24.9 seconds), not discovered joint-position assertion failures. The later isolated focused run passes at the same 20-second deadline. They are retained as load-sensitive test evidence, not silently erased or relabeled as a product fix. No test, timeout or assertion was weakened. The new regression command deliberately exits nonzero because the historical implementation must fail its positive assertion. Counts overlap; do not add them as unique coverage. The corrected clean count differs from Claude's dirty-tree 2,021 count because unrelated tests are excluded. [verification.json](verification.json) records concise results and source/log hashes; [verification.mjs](verification.mjs) regenerates that summary while the ignored local logs and snapshots exist.

Initial harness problems are recorded: Windows denied the dependency junction until the bounded snapshot preparation ran outside the sandbox; a gate-lane Vitest temporary-directory failure and path/adaptation mistakes were corrected in owned research scaffolding. The coordinator initially placed focused-result JSON too high in `docs/`, then moved that owned file into this review directory. None was a production behavior finding. Gate-lane setup failure JSON is retained separately.

Real Node PixelLab HTTP/fetch was blocked with the existing [review preload](../2026-11-07-session-counter-review/no-pixellab.cjs). Browser tests used a dead external proxy with loopback bypass and PixelLab DNS blocking, while retaining existing test mocks. Servers were keyless, loopback-only, with workspace TEMP/TMP. Ports 5567/5568 cover the pinned run; 5577/5578 cover the corrected run. No agent server, real token, generation, polling or `/balance` call was used. No paid experiment is needed to decide these deterministic geometry and QA outcomes.

Not performed: full end-to-end suite, fresh provider generations, a manual hosted-browser design audit, complete multi-million sweep reconstruction, or a universal estimator/pose proof. No user browser tab was opened or closed.

## Reproduction and tracking

From the root with pinned Node and the absolute review preload in `NODE_OPTIONS`:

```text
node docs/reviews/2026-11-08-d4c0c633-counter-review/prepare-snapshot.mjs
node docs/reviews/2026-11-08-d4c0c633-counter-review/prepare-snapshot.mjs --fixed
node docs/reviews/2026-11-08-d4c0c633-counter-review/motion/geometry.mts
node docs/reviews/2026-11-08-d4c0c633-counter-review/motion/pelvis-probe.mts
node docs/reviews/2026-11-08-d4c0c633-counter-review/motion/candidate-check.mts
node docs/reviews/2026-11-08-d4c0c633-counter-review/motion/fixed-check.mts
node docs/reviews/2026-11-08-d4c0c633-counter-review/gates/prepare.mjs
node docs/reviews/2026-11-08-d4c0c633-counter-review/gates/probe.mts
node docs/reviews/2026-11-08-d4c0c633-counter-review/gates/travel.mts
node docs/reviews/2026-11-08-d4c0c633-counter-review/gates/candidate.mts
node docs/reviews/2026-11-08-d4c0c633-counter-review/prepare-regressions.mjs
```

Run `npm run check`, `npm test`, and `node scripts/bench.ts` from each prepared snapshot's `app/`. For browser coverage use `npm run e2e -- --config playwright.counter-review.config.mts studio.spec.ts selftests.spec.ts` with unique ports, installed `PLAYWRIGHT_BROWSERS_PATH`, absolute `TEST_OUTPUT_DIR` and workspace TEMP/TMP. The archived build derives version metadata from the containing repository's Git history; source and test hashes identify the actual snapshot being tested.

For paired new tests, run the root application Vitest CLI with this review's [vitest.config.mjs](vitest.config.mjs), filter `a coherent action lean stays decisive|one head or shoulder estimate`, and JSON output into [regression-results.json](regression-results.json). Lane READMEs give their exact commands and setup order.

Tracking is pending: active/archived board listings and the completed N1 card were inspected, but automatic approval review rejected creation of a separate public R1 card under the earlier review-only/no-board restriction. No board mutation succeeded or was retried. Local file work remained independently authorized by the user's request to implement necessary fixes. The new card must not be claimed as synchronized or Done.

The commit includes the owned classifier hunk, two regression tests, this review's evidence and the review index only. Other agents' hair/export changes remain untouched and uncommitted. Nothing is pushed.
