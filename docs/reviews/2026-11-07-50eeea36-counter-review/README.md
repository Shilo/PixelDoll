# Independent challenge of the second correction commit

November 7, 2026. Reviewed `50eeea36446f146f6e499a6325843de8ffb77e96` against `6006a55c` and [Claude's response](../2026-11-07-session-counter-review/claude-response.md). **All three original counterexamples are corrected. One new bounded P2 regression remains in the motion classifier. F2 and F3 held.**

Two independent subagents reviewed motion and notes/prompts. The notes reviewer also challenged the motion fixture's intent and reachability; the motion reviewer added cleanup, source-QA, bone-length and grip controls in response. The coordinator inspected their evidence, replayed the final motion probe, verified old/new production regression tests and ran the full offline browser suite.

This delivery changes review artifacts and the review index only. No production source or production test was edited. No PixelLab call, including `/balance`, was made. No board card, dependency, credential or user browser tab was changed. The reusable improvement-cycle document was not opened. The earlier review-only/no-board/no-PixelLab constraints remain in force for this continuation.

## Verdicts on the corrections

| Correction | Verdict | Evidence |
| --- | --- | --- |
| **F1: detached joint turns a walk into an action** | **Original cases held; overall partially held** | The original single-neck counterexample is now rejected. The new production neck/hip regression tests fail at the old revision and pass at `50eeea36`. Stored and projected control decisions remain unchanged in the reproduced subset. However, the new knee-pivot condition introduces **C1** below, rejecting a coherent action with valid equipment. |
| **F2: dark note lost on Keep** | **Held** | Actual Keep, two `mergeClip` replacements, manifest export and export validation retain one uncertain dark note. Gray notes remain, clean items get no note, and Accepted/Clean health remains appropriate. The exact new production regression fails before and passes after. |
| **F3: maximum-size held dress loses wording** | **Held** | Both hands retain their hand and one-item clauses at zero padding. Actual dispatch matches draft previews in 36 size/slot/route cases, and default item previews match the 18 default-route cases. A 14,640-case helper comparison changes only intended held skeleton cases at zero padding. The exact new production regression fails before and passes after. No rendered 256-pixel provider-quality claim is made. |

The F2 semicolon change is justified: saved-note readers split on `'; '`, while `plainReason` still shows the full uncertain dark-detail explanation. The shared `dressItem` helper is a small appropriate root fix for F3; anchor and worn wording remain unchanged. These corrections should be retained.

## C1. P2: the knee-relative threshold falsely rejects a coherent moderate action lean

**Introduced by:** `50eeea36`. **Source:** [items.ts:915](../../../app/src/lib/items/items.ts#L915), specifically the new shoulder-to-knee angle in the `Math.min` lean; action classification around line 922 and locomotion-only held-shape checks around line 1179. Custom move IDs are constructed in [MoveSheet.svelte:34](../../../app/src/studio/MoveSheet.svelte#L34).

The fix compares angles around different pivots to the same 40-degree threshold. A torso rotating 45 degrees about stationary hips moves the shoulder direction around the knees by only about 30 degrees. The skeleton remains coherent, but the new minimum makes it appear insufficiently decisive. For an action ID containing a gait word, G9 is reactivated.

**Synthetic reproduction:** a six-frame 64-pixel `run-dodge`; frame 2 rotates the entire upper body 45 degrees about the hips while knees/hips remain stationary. The frozen body raster follows each pose. A deliberately upright torch remains at the right wrist in world-up orientation, a valid fixture intention involving wrist articulation. Requested and measured keypoints agree.

| Valid/negative control | `6006a55c` | `50eeea36` |
| --- | --- | --- |
| `run-dodge`, no upper-body lean | QA pass | QA pass |
| **`run-dodge`, coherent 45-degree lean, upright torch** | Action; QA pass | **Locomotion; QA failure: G9 item turns 45 degrees against the hand** |
| Exact same 45-degree frames, named `dodge` | Action; QA pass | Action; QA pass |
| `run-dodge`, stronger 70-degree lean | Action; item QA pass | Action; item QA pass |
| Original detached-neck measurement | Incorrectly decisive | Correctly nondecisive |
| Original detached-hip negative control | Incorrectly decisive | Correctly nondecisive |

**Controls that establish the distinction from noisy metadata:**

- `validateRig` reports no errors; all keypoints are complete and in bounds.
- Connected bone lengths change by less than `8e-15` pixels, numerical roundoff only.
- Torch pixels stay within 0.71 pixels of the requested grip.
- Source `clipQa` reports zero adherence error and no failures/warnings for the 45-degree case.
- Actual `postProcess` removes zero pixels and repairs no frames in both revisions. Postprocessed layer hashes are identical.
- The 70-degree case has a separate source-body warning, so it is a classification contrast rather than a claim of perfectly clean source art. The main 45-degree case has no such warning.

**Why this is reachable:** Studio derives a custom ID from the description's first two words, so “Run dodge” can become `run-dodge`; imported animation IDs can also combine gait/action words. The classifier expressly intends motion to override such names, as its existing `run-slash` tests demonstrate. Renaming the same valid candidate to `dodge` makes the failure disappear. This can route complete valid art into review or invite an unnecessary explicit paid retry; it does not delete pixels or automatically spend.

**Scope of the finding:** this is a supported synthetic action/valid-art counterexample using actual production functions, not a newly observed PixelLab output or provider failure rate. The present S5 dress phrase points objects down/outward; the fixture's upright torch does not prove that a new current paid dress would produce that exact candidate. Its purpose is to challenge a generic QA classifier's treatment of valid artwork, including coherent imported/custom motion. It does not refute the unchanged stored-corpus counts.

**Worth fixing:** preserve coherent moderate action motion while retaining the original neck and hip negatives. A knee midpoint can provide corroborating evidence, but an equal threshold around a more distant pivot is not geometrically equivalent. Challenge a consistency/displacement-based interpretation or an uncertainty path. Do not blindly roll back the outlier filters, lower every threshold, globally waive G9 for walks, or add a special case for the name `run-dodge`. Pair this positive case with the bad-hip, bad-neck and short-slash controls.

Reproducer and measurements: [motion/probe.mts](motion/probe.mts), [results](motion/results.json), [independent motion review](motion/README.md). The coordinator replayed this final strengthened probe successfully after peer challenge.

## Which claims were validated

- The original F1/F2/F3 defects and their new production regression tests were independently reproduced on both revisions. The tests were copied into ignored review snapshots with source/mock imports redirected; production tests and assertions were left unchanged.
- **19/20 stored slash directions and 38/40 short subsamples** remain decisive in the available corpus. The available **12 rig files / 67 clip-directions** show zero decision changes. **72 projected KayKit/Quaternius combinations** also show zero changes. These are bounded classification controls, not new generated images.
- Claude's larger **23-rig / 293-direction** corpus and **15.2-million-position** single-hip sweep were not independently reconstructed. The cited scratch probes are uncommitted. Their reported counts are not disproved, but this review does not claim to have verified them. Even an exhaustive grid over a particular corpus would not prove all supported action geometries retain their decisions; C1 supplies a new geometry.
- Remaining end-joint and coherent wrong-limb estimator ambiguity is acknowledged. It is not counted as another newly found defect.
- Dark-note persistence was tested through real application functions with mock queue/storage, including export serialization and validation. A manual browser Keep/reopen session for that particular fixture was not performed; do not conflate it with the broader passing browser suite.
- F3 dispatch/preview parity and native canvas preservation held. It restores intended request semantics; it does not establish new maximum-size generation quality without model outputs.

## Anchored hand wording: what is worth doing

**The selected hand and one requested item are worthwhile anchor-route requirements. The wording change remains an experiment.** Do not copy the entire skeleton phrase into anchored requests: its downward orientation and arm-freeze policy were selected on a different route.

Use the [anchor-specific proposal](anchor-wording-proposal.md): compare the current phrase, hand naming alone, then hand naming plus one instance of the requested item. Keep reference locking, frame-local pose/body preservation and canvas geometry fixed. Do not demand erasure of existing opposite-hand/base pixels. Prove dispatch/preview parity offline, then let the owner authorize a concrete paired model comparison if desired. No experiment is executed or authorized by this review.

**Hidden-view notes are a separate preexisting follow-up worth fixing offline.** Their loss on Keep is real, but a blind extension of the D1 persistence filter is insufficient: current `plainReason('G4 ...')` translates a legitimate hidden-view note as “The item is missing in some frames.” Preserve the view-specific uncertainty and test a genuinely missing item alongside it. This is not a regression introduced by `50eeea36`, and no generation is needed to test its persistence/translation mechanics.

## Validation, failures and skips

Repository-pinned Node **24.22.1**, npm **11.19.1**, existing dependencies/browser cache. Keyless loopback servers; full-suite ports **5527/5528**. The existing [review transport guard](../2026-11-07-session-counter-review/no-pixellab.cjs) rejected real Node PixelLab HTTP/fetch; the [review browser wrapper](../2026-11-07-session-counter-review/playwright.config.mts) blocked unmocked external traffic while retaining local test responses. No agent server or live token was used. No real PixelLab generation, polling or balance request was made.

| Check | Result |
| --- | --- |
| `npm run check` | Pass; zero Svelte errors/warnings; TypeScript checks succeed. |
| `npm test` | **2,008 passed, one existing skip**, 167 files, about 12.3 seconds. |
| Full offline E2E | **248 passed**, about 6.9 minutes; includes Studio, selftests, concurrency and native crash recovery. |
| Frozen `node scripts/bench.ts`, no `--write` | Exit zero; all 20 rows report expected `ok`. Existing image-QA failures inside those rows remain; `ok` is report compatibility, not universal clean art. |
| New F1 production regressions at old/new pins | **Two expected failures before, two passes after**, 14 unrelated cases filtered. Quiet corrected-source sweep takes about 5.9 seconds. |
| Exact new F2/F3 production regressions | **Two expected failures before, two passes after**, 104 unrelated cases filtered. |
| Independent extended F2/F3 checks | **Two passed**, 54 unrelated tracked cases filtered. |
| Motion adversarial probe | Original neck corrected; C1 reproduced; cleanup/source-QA/grip/bone/hash controls retained; zero changes on the stated available stored/projected controls. |

**Loaded-run failures retained:** while the full browser suite ran, the coordinator's copied AFTER F1 sweep took about 21 seconds and returned a Vitest `STACK_TRACE_ERROR` under the unchanged 20-second review deadline. The motion reviewer's separate focused suite likewise recorded eight passes and one error after about 44 seconds, without a position/assertion counterexample. After the browser suite exited, the coordinator repeated both new production F1 cases at the same timeout and with the same assertions: both corrected-source cases passed. Old-source cases failed their intended assertions in both runs. This supports load sensitivity, not a claim that a test was wrong or a license to increase timeouts. Reports: [loaded run](regression-results-loaded.json), [quiet run](regression-results.json), [motion lane run](motion/unit-results.json).

The notes lane corrected two fixture setup omissions before export validation: the real SLOTS ladder and newly saved blobs had to be loaded. The final assertions were retained; these were review-harness corrections, not product bugs. The motion lane corrected a typed-array `flatMap` mistake before its final successful probe. No production configuration, test expectation or assertion was weakened.

Counts overlap with the full suite; do not sum them as unique coverage. Before/after regression commands intentionally return a failure status because the historical implementation must fail. Their expected historical failures are distinct from C1's current behavioral regression and the transient loaded-run timeout.

Reproduction from the repo root with pinned Node:

```text
node docs/reviews/2026-11-07-50eeea36-counter-review/prepare-regressions.mjs
node docs/reviews/2026-11-07-50eeea36-counter-review/motion/probe.mts
node docs/reviews/2026-11-07-50eeea36-counter-review/notes-prompts/prepare.mjs
node docs/reviews/2026-11-07-50eeea36-counter-review/notes-prompts/prepare-regressions.mjs
node docs/reviews/2026-11-07-50eeea36-counter-review/inventory.mjs
```

From `app/`, with workspace-owned TEMP/TMP and the absolute guard path preloaded through `NODE_OPTIONS=--require=...`:

```text
npm run check
npm test
node scripts/bench.ts
node node_modules/vitest/vitest.mjs run --config ../docs/reviews/2026-11-07-50eeea36-counter-review/vitest.config.mjs -t 'one detached trunk|one detached hip' --reporter=json --outputFile=../docs/reviews/2026-11-07-50eeea36-counter-review/regression-results.json
npm run e2e -- --config ../docs/reviews/2026-11-07-session-counter-review/playwright.config.mts
```

The last command needs unique E2E ports/output directory, the installed `PLAYWRIGHT_BROWSERS_PATH`, and `PD_REVIEW_R4=0`. Set PowerShell variables with `$env:NAME='value'`. Lane-specific commands are in [motion](motion/README.md) and [notes/prompts](notes-prompts/README.md). The snapshot generator exports source/package metadata only; fixture scripts never modify tracked application tests. Generated modules/snapshots and raw logs remain ignored in `temp.local/` and `app/test-results-50ee-review-*`; checked-in scripts, source hashes and compact result JSON are portable evidence.

Not performed: any PixelLab call, new rendered generation, 23-rig/full single-hip sweep reconstruction, a universal estimator/fairness proof, new manual aesthetic/accessibility audits, anchor-wording model qualification, or an implementation correction for C1/G4. No production correction was applied in this review. The eight reviewed commit paths and pin hashes are recorded in [inventory.json](inventory.json).

## Response requested from Claude

Have an independent challenger reproduce or refute C1 before fixing it. Preserve the detached-neck/hip negatives and unchanged slash controls; compare valid moderate actions with identical artwork under gait and non-gait names. Retain the F2/F3 corrections. Treat anchor wording and preexisting hidden-note handling as separately scoped work, with paid testing requiring the owner's applicable authorization. Report findings and checks individually; do not equate passing stored-corpus counts with general action preservation.
