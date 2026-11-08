# Prevent silent item-check waivers from unreliable movement

November 8, 2026. Implements the owner's request to challenge the remaining hip-reference bypass and its possible solutions. Baseline: `c1024a0c`. Two independent reviewers investigated alternatives, exchanged counterexamples and checked the selected implementation; a fresh third reviewer independently challenged the final source. This is a review-policy correction, not a claim to infer every artist's intended movement from joint coordinates.

**Outcome:** preserve animation classification and artwork exactly, but stop silently waiving observable item problems when motion overrides a gait-containing name. Such changes now need review, without a new hard failure or automatic paid retry. Consistent equipment and ordinary action names keep their existing behavior.

## Why the bug and the obvious fixes needed challenge

The [earlier review](../2026-11-08-d4c0c633-counter-review/gates/README.md) established a real silent QA pass: one erroneous measured hip shifts the midpoint used to measure every joint's travel. A gait can then count as an action, which skips size and angle checks. The same reversed equipment fails with correct metadata and passes with that wrong hip. The source pixels do not change.

| Proposed correction | Independent challenge | Decision |
| --- | --- | --- |
| Require travel/rise to exceed the threshold about both hips | Closes the old examples, but rejects four coherent wrist-only actions with genuinely moving hips | Reject as a hard rule |
| Replace hip translation with median movement of all joints | Preserves 41,405 simpler synthetic poses, then changes four ordinary projected runs and an attack in broader controls | Reject |
| Treat agreement of individual-hip observers as proof of reliable movement | A new single-hip counterexample fools every observer; actual reversed equipment still passes | Reject as a confidence guarantee |
| Trust requested joint positions as an extra observer | Requested motion may differ from the actual art; imported sequences may share the same estimates | Do not treat agreement as ground truth |
| Preserve classification and review actual waived item-check disagreements | Catches both old and new false-clean examples without imposing another anatomy rule or rejecting intended action art | Select |

The [challenge report](challenge/README.md) contains complete reproducible counterexamples. The [controls report](controls/README.md) independently tests the prototypes on stored, authored and projected motion. Large unchanged sample counts did not outweigh a valid counterexample. The source of truth was the code, controlled inputs and declared fixture intent, not a promise that a heuristic can cover every conceivable pose.

## Selected behavior and limits

For each clip, the existing `isAction(clip, rig)` decision is retained. If that decision overrides the existing name-only gait rule, existing G5 size and G9 held-shape/angle observations run in review-only mode. Only observations beyond their existing limits produce the new G16 note. Its user-facing wording is: **"Check the item's size and angle as it moves"**.

- No new item names, move words, coordinates, body proportions, joint-error tolerances or model-specific exceptions are added. Both `decisiveAction` and `isAction`, including thresholds, remain byte-identical to the baseline. The existing name fallback is reused through `isAction(clip)` rather than copied.
- Consistent art, subthreshold size changes, normal locomotion and ordinary action names stay on their previous paths. G9 remains held-only. Observable changes explained by the existing hanging/occlusion checks do not acquire a new motion-override warning.
- A real attack with intended wrist articulation can receive a review note when its name contains a gait word. Earlier valid upright-torch C1/pelvic fixtures can therefore become **warnings**, while remaining free of new hard failures. This intentional ambiguity disclosure must not be described as every historical QA status remaining pass.
- A warning does not assert that the hip is wrong or the art is broken. It does not alter pixels, freeze motion, change a request, populate a retry map or start a generation. Literal ordinary action names retain their existing exemptions.
- Very small items can remain below the existing signed-direction reach threshold. The unsigned axis cannot observe every 180-degree reversal. The correction also retains the existing occlusion/visibility limitations and cannot determine artistic intent. It prevents the tested silent waivers; it is not a universal equipment validator.

This approach addresses the shared quality-check exemption instead of repeatedly tightening the motion classifier. It also avoids making identical requested/measured estimates look like independent proof of correct anatomy. No PixelLab render is needed to distinguish these deterministic outcomes, and generation inputs/post-processing are unchanged.

## Durable review and workflow behavior

The optional numeric `motionReviewClips` is stored in `QaSummary` and in each affected clip summary. It counts a clip once even when multiple checks observe a change. `qaReasons` reconstructs the friendly note rather than relying on a transient warning string.

Acceptance retains the note and marks the item Accepted. JSON storage and editable ZIP export/import retain it. Replacing one affected clip removes only its contribution; replacing all affected clips with clean QA removes the counter and restores clean health. It is not stored permanently in `designWarnings`. Existing summary, acceptance, legacy and replacement behavior is reused; there is no new migration or setting.

The Studio browser regression extends the existing real-reload accepted-item test with the new note. It adds an assertion without removing any prior hand/grip assertion. Existing free-color-matching coverage checks that saved QA remains unchanged through local color edits; that path is not modified. The direct new persistence tests cover JSON, acceptance, partial replacement and actual editable ZIP bytes. No fresh custom recolor fixture is claimed.

`failCalls` and `softCalls` remain unchanged in the paired policy matrices. New findings go only to warnings, so the item runner presents review rather than an automatic paid retry. Existing independent missing-frame/hand/body failures still apply. Nothing introduces an endpoint, backend, credential flow, external dependency or untrusted user string in executable code. The plain review text is constant.

## Independent evidence

| Check | Result |
| --- | --- |
| Classification source equality | Exact baseline/corrected block equality, SHA-256 `9bbb8bda8ff6088682fe95fe3d90607f2f6ed16a4c56f514eb7b73df0e171c14` |
| Stored/authored/projected controls | 224 complete clip-directions and 3,740 isolated frames, zero classification changes |
| Translation, reflection, label exchange and size controls | 260 valid transformations, zero differences; 12 out-of-bounds cases excluded |
| Broad paired quality matrix | 1,080 cases, identical classifications and hard-failure lists; 176 intended review changes |
| Original residuals plus newly found false-clear example | 32 paired cases, identical classifications and failure/soft-call maps; all four bad-metadata reversed gait items change from pass to warning |
| Direct acceptance/summary controls | Counts 2 to 1 to absent as affected clips are replaced; reason retained through acceptance/JSON |
| Fresh final review | No actionable defect found; 64 differential cases with padding, opaque body masks and looped playback preserve failure/soft-call maps |

Matrix scope includes both held hands, a worn slot, four cardinal directions, 32/64/128 pixel test canvases, rest/residual/strong action motion, gait/ordinary names, consistent/reversed/shrinking/missing equipment. Body rasters are empty in the broad gate matrix to isolate branches, and directional geometry is intentionally identical. The [fresh final review](final-review.md) additionally exercises visibility computations with opaque masks; those are still branch controls, not realistic visual or north-occlusion proof. Source hashes, exact matrices and exclusions are in the two lane reports. Counts overlap and must not be summed as unique coverage.

## Required verification

All checks use prepared clean archives and the existing installed dependencies, not another agent's uncommitted export changes. The first snapshot overlays only this correction onto `c1024a0c`. An integration snapshot includes another agent's subsequently committed export update `aa222267` plus this same correction. The classifier source equality and independent policy probes establish behavior preservation beyond a single test fixture.

| Check | Result |
| --- | --- |
| `npm run check` | Pass, zero Svelte errors/warnings and TypeScript checks pass |
| `npm test` | **2,042 passed**, one existing skip, 170 files |
| Frozen `node scripts/bench.ts`, no `--write` | All 20 rows match expected results; expected image-QA failures within rows remain |
| New focused regressions | Seven pass |
| Same new regressions on baseline/corrected snapshots | Before: five expected failures, two passing controls. After: seven passes |
| First full offline browser suite on `c1024a0c` plus correction | 247 passed, one native crash-recovery reopening timeout. The unchanged case passes in isolation |
| Integration unit suite on `aa222267` plus correction | Default run times out in the unchanged 20-second F1 sweep; all **2,046 tests pass** with one worker, plus one existing skip |
| Integration checks and benches | Type checks pass; all 20 bench rows match expected results |
| Full integration browser suite | **248 passed**, 7.3 minutes, two workers, process exit zero |

The seven new unit tests cover the original silent reversal, clean/ordinary-action/strict-gait controls, signed and unsigned turns, silhouette comparison without forearm data, size variation, loop-only disagreement, below-limit size variation, acceptance/JSON/partial replacement, and actual editable ZIP export/import. Several checks share tests; seven does not mean seven unique scenario combinations.

**Initial harness failures retained:** the first size-change fixture did not exceed the existing G5 threshold. Attempts at shorter lengths still rasterized to a below-threshold CV of 0.144; this correctly passed. The fixture was changed to exceed the limit while retaining enough area to avoid G4, and an explicit below-limit control was added. The original status assertions were kept, with an additional metric assertion proving the intended branch is exercised. Initial/diagnostic JSON and the failed first full-unit log are retained. These were test-input errors, not a production-threshold change or a reason to weaken assertions.

**Other failures retained:** the first full browser run stalled at "Opening your workspace" while reopening the native test browser after deliberate process termination. The unchanged crash-recovery test passes alone (3.6-second test body, 8.5-second run). The first integration unit run times out only in the existing F1 position sweep; it reports no joint-position assertion counterexample. All tests subsequently pass with one unit worker. The final full browser run uses two workers to reduce concurrent load, retaining every test, assertion and deadline and using zero retries. These outcomes support load sensitivity, not a claim that this correction repaired startup or the old test's performance. Counts overlap; failed runs were not erased.

The paired command intentionally exits nonzero because the historical implementation must fail. No production test, timeout or existing assertion was weakened. Checks run under the repository-pinned Node 24.22.1, with workspace TEMP/TMP and unique loopback test ports (5617/5618 first full run, 5627/5628 isolated crash replay, 5637/5638 integration). Real Node PixelLab transport is blocked by the existing [review preload](../2026-11-07-session-counter-review/no-pixellab.cjs); the prepared Playwright wrapper blocks unmocked external traffic and retains local test mocks. The native persistent-browser crash test has its own explicit PixelLab abort route. No agent server or token is used. No real PixelLab generation, polling or balance call was made. User browser tabs were untouched.

The integration unit count is four higher because the separately committed export update added tests. Another export-UI-only commit, `2db6c5d4`, landed after the frozen integration snapshot; this report does not relabel the `aa222267` run as testing that unrelated UI change. Subsequent uncommitted held-item wording work in `items.ts` is also excluded. The owned evaluator is overlaid separately, and only that evaluator plus this correction's other owned files are staged. [verification.json](verification.json) records source/log hashes and exact run summaries; [verification.mjs](verification.mjs) reproduces the audit while ignored logs and snapshots exist.

Not established: universal semantic correctness, provider failure rates, new generated-art quality, a fresh manual hosted-browser aesthetic audit, detection below existing geometry limits or complete elimination of all joint-estimate ambiguity. The original source of false motion can remain ambiguous; its equipment-check consequences now receive review in the selected cases.

## Reproduction and tracking

From the repository root with pinned Node and the absolute no-PixelLab preload in `NODE_OPTIONS`:

```text
node docs/reviews/2026-11-08-hip-travel-fix/prepare-snapshot.mjs --baseline
node docs/reviews/2026-11-08-hip-travel-fix/prepare-snapshot.mjs
node docs/reviews/2026-11-08-hip-travel-fix/prepare-snapshot.mjs --integration
node docs/reviews/2026-11-08-hip-travel-fix/prepare-regressions.mjs
```

From a prepared snapshot's `app/`, run `npm run check`, `npm test` and `node scripts/bench.ts`. For the full browser suite run `npm run e2e -- --config playwright.hip-review.config.mts`, using an installed `PLAYWRIGHT_BROWSERS_PATH`, workspace TEMP/TMP, unique E2E ports and an absolute `TEST_OUTPUT_DIR`. The build reads version metadata from the containing repository's Git history; snapshot/source hashes identify the actual implementation under test.

The paired unit replay uses the root app's Vitest CLI with [vitest.config.mjs](vitest.config.mjs) after the preparer. The two lane READMEs document their independent probes and source pins. Generated archives, dependency junctions, build output, traces and raw logs stay ignored under `temp.local` and `app/test-results-hip-travel-*`.

Tracking: [Review item changes when motion overrides a gait label](https://github.com/users/Shilo/projects/7?pane=issue&itemId=297488640). The commit includes only this correction, tests and owned evidence. Other agents' export and held-wording work is preserved and excluded from the commit.
