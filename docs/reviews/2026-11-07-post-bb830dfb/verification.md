# Verification record

November 7, 2026. These checks support the [counter-review handoff](../../handoff/2026-11-07-claude-post-bb830dfb-review.md). No production fix was made, and no credit-bearing request was submitted. Passing existing tests and demonstrating an omitted counterexample are compatible outcomes.

## Revision and environment

- Baseline: `bb830dfb9ac6e7347200e487302b60b2d779f457`.
- Functional comparison: `8ea08c28d92d9a8d41524dcd78f379c38699ea63`.
- Reviewed endpoint: `0992bae7aab684b969880be481a96ff8876d2801`, 31 commits / 89 distinct changed paths after baseline.
- Windows, repository-pinned Node 24.22.1 and npm 11.19.1; existing dependencies, Vitest 4.1.12 and installed Playwright browser cache.
- The working tree was clean when review began. Three help/research commits arrived during review. `git diff 8ea08c28 0992bae7 -- app/src/lib app/src/studio/model.ts app/src/studio/MoveSheet.svelte app/src/studio/GenCard.svelte` is empty. Only CharacterForm help text changes in application source after the functional pin.
- No reusable process document was opened. Historical snapshot exports select `app/`, `app/src`, package metadata or two named ZIP fixtures. They do not export or execute that document.
- Local browser runs used unique loopback ports. Existing localhost tabs were not touched; no computer-use tab was acquired. Tests use their own automated headless browser instances, which exit with the runner. No manual hosted-browser or live-provider result is claimed.

## Checks and outcomes

| Check | Result and qualification |
| --- | --- |
| `npm run check`, shared checkout | Pass. Svelte reports zero errors/warnings; TypeScript checks exit successfully. |
| `npm test`, shared checkout | 1,993 passed, one existing skipped test; 166 files. About 12.4 seconds. |
| Full `npm run e2e`, shared checkout, ports 5457/5458 | 248 passed, about 7.4 minutes. Help-text-only work appeared during the run, so this is explicitly a shared-checkout result. |
| Full E2E, first isolated `8ea08c28` export, ports 5467/5468 | 245 passed, three failed, about 5.7 minutes. One failure was our incomplete export: a character-import test needed two tracked ZIP files outside `app/`. The other failures were crash-recovery UI visibility and phone toast-action timeouts. A dynamic bootstrap import error also appeared in this run. It is not a clean qualification. |
| Full E2E, corrected isolated export, ports 5477/5478 | 247 passed, one failed, about 5.3 minutes. The previously failing import, crash-recovery and toast cases pass. `selftests.spec.ts:198`, move-QA storage/ZIP/replacement test, remained at `Ready` after clicking Create instead of reaching `PASS create` within 15 seconds. No assertion was altered. |
| Isolated focused browser rerun, ports 5487/5488, one worker | All five selected cases passed in about 14.2 seconds: crash recovery, three toast viewports, and the move-QA storage/ZIP test. This does not retroactively make either full isolated run pass. |
| Item baseline/current probe | Executed by its reviewer and replayed by the coordinator after stronger opaque-body controls. Exit zero; the result JSON records behavioral counterexamples, not a clean-bill assertion. Fifty existing relevant unit tests pass. |
| Chroma/grid probe | 14,288 feasible layout configurations; zero oracle mismatches. 960 authored image cases. Historical extraction replay on 17 stored cases / 627 cells. Invalid-width current child times out while baseline rejects. Twenty-seven focused existing tests pass. |
| Studio existing regression checks | 210 passed, zero failed/skipped across seven files. These overlap with the full unit suite. |
| Mixed partial-failure/save-conflict probe | One intentionally failing prefix expectation proves the UI-trigger gap; one passing control recovers the completed direction with zero additional enqueues. Fifty-one unrelated fixture cases were filtered. |
| Completed first-open race | One focused passing test; 67 unrelated cases filtered. Rejects the hypothesized persistent normalization loss on the completed path. |
| Interrupted first-open race | One focused passing test; 68 unrelated cases filtered. Asserts a temporary 308-pixel region mismatch after an injected post-publication read failure and successful real reopen healing. |
| Naming baseline/current probe | Reproduces article-plus-pair name loss while preserving the intended lantern improvement. Independently duplicated by item and Studio reviewers. |

**Unresolved browser stability qualification:** the intermittent fixture/UI readiness failures need investigation if they recur. A single-worker rerun is evidence of non-persistence under that run, not proof of cause, a waiver of flaky tests, or proof of a production regression introduced in this commit range. We did not change tests, retry configuration, timeouts or expected values. The QA HTML fixture renders its enabled buttons before its module installs handlers, which is a plausible readiness hazard, but this review did not instrument and prove that as the observed root cause. No extra product finding is asserted from it.

## Command provenance

Select the pinned Node directory on `PATH` before running commands. Use workspace-owned ignored `TEMP` and `TMP` for unit/review fixtures. For browser runs set `PLAYWRIGHT_BROWSERS_PATH` to the already installed browser cache. No dependency installation or browser download occurred.

Shared checkout, from `app/`:

```text
npm run check
npm test
E2E_PREVIEW_PORT=5457 E2E_DEV_PORT=5458 TEST_OUTPUT_DIR=test-results-commit-review-e2e npm run e2e
```

The environment-assignment notation above documents the variables; on PowerShell set each with `$env:NAME='value'` before the command. Each output directory is unique and ignored.

For the isolated snapshot, `git archive` exported the exact tracked `app/` tree at `8ea08c28` into ignored `app/test-results-commit-review-pin/source/`. Its `app/node_modules` is a junction to the already installed checkout dependencies. This pins tracked source and tests but is **not a hermetic dependency installation**. The initial junction attempt was denied in the sandbox; it was created with the appropriate filesystem permission and verified before execution. No successful run is claimed for that first setup attempt.

The first export omitted these external test dependencies. Both were then exported from the same Git revision into the snapshot before the corrected full run:

```text
docs/research/artifacts/2026-11-02-east-axe-studio.zip
docs/research/artifacts/2026-11-02-gripped-axe-east.zip
```

The focused rerun used the unchanged isolated app:

```text
npm run e2e -- selftests.spec.ts crash-recovery.spec.ts studio.spec.ts -g 'move QA survives|toast activation|crash' --workers=1
```

Review probe commands and their pinned-source/source-hash rules appear in the [item](item-quality/README.md), [chroma/grid](chroma-grid/README.md) and [Studio](studio-recovery/review.md) reports. The Studio generator's tests run via its owned `vitest.config.mjs`; select its `independent review:`, `independent first-open:` or `independent interrupted first-open:` title to avoid counting filtered existing tests as executed. A future checkout can change the reused fixture, so compare drift before replay.

## Retained local outputs and limits

Raw runner logs and full browser traces remain ignored at these repo-relative locations:

```text
app/test-results-commit-review-check.log
app/test-results-commit-review-unit.log
app/test-results-commit-review-e2e.log
app/test-results-commit-review-e2e/
app/test-results-commit-review-pinned-e2e.log
app/test-results-commit-review-pinned-e2e/
app/test-results-commit-review-pin-final.log
app/test-results-commit-review-pin-final/
app/test-results-commit-review-pin-focused.log
app/test-results-commit-review-pin-focused/
```

They are local supporting evidence, not portable committed media. Portable scripts and result JSON are linked from the review index. No screenshot, private-chat attachment, private media path, `.env` contents or credential is included. Source/fixture JSON may contain local execution paths and public historical request IDs; neither is treated as an access token.

Not performed: fresh paid generations, real-provider race reproduction, a hosted-browser manual interaction pass, new manual pixel ownership labeling of the old corpus, a full accessibility audit, universal layout/pricing proof, all possible item or animation combinations, or a fresh internet survey. Those are not necessary to demonstrate the isolated findings and must not be implied by the passing automated suite.
