# Test performance: keeping unit and end-to-end tests fast

Last measured 2026-10-25. Read this before changing `app/vitest.config.ts`, `app/playwright.config.ts`, `.github/workflows/pages.yml`, or before adding slow or timing-sensitive tests.

## Where we started and where we are

| | 2026-10-24 (before) | 2026-10-25 (after) |
|---|---|---|
| CI, push to deployed | 15m05s ([run 40088050662](https://github.com/Shilo/PixelDoll/actions/runs/40088050662)) | 2m54s–3m43s with 8 shards ([run 40185183099](https://github.com/Shilo/PixelDoll/actions/runs/40185183099)); 16 shards cut the e2e phase by a further ~30 s (benchmark below) |
| CI end-to-end | 12m50s, one job, one worker | 16 parallel one-worker jobs |
| CI unit (`npm test`) | 63 s | 22 s |
| Local full e2e (i7-13700K, 24 threads) | 7m46s, 98 tests, 1 worker | 3m46s, 107 tests, 4 workers |
| Local unit | 39.5–59.5 s | 4.7 s |
| Typical agent check: `npm run check` + `npm test` + one spec | no partial-run guidance (`npm run e2e` ran the full suite) | 7 s + 4.7 s + 34 s (`npm run e2e -- characters`) |

Commits: `1b6230a7`, `16b787ef`, `84f718e3`, `1c59e22e`, `3a246fff`, `8b098785`, `7d817624` and `3cc08055`, the queue self-test fix merged in `87ee9f53`, and the follow-ups that introduced this guide's 16-shard layout. Codex and Claude subagents reviewed the work adversarially; the handoffs are local only (`.claude/handoffs/2026-10-25-test-speed-*`).

## How the setup works, and why

- **Unit tests (Vitest)** run test files in parallel. Each file already runs in its own process (the default `forks` pool with `isolate`), so module state never leaks between files. `--no-isolate` fails dozens of tests (28–53 measured): never turn isolation off.
  - CI uses Vitest's default worker count: CPUs − 1, which is 3 on a 4-vCPU runner.
  - Locally `maxWorkers: '50%'`. It measured faster than the default on 24 threads (3.8 s against 5–6 s), because each extra process only adds startup cost, and it leaves the machine usable.
  - `testTimeout` is 5 s on CI and 20 s locally. With an 8-worker e2e run beside it, the heaviest export tests exceeded 5 s (1–10 failures per run); 20 s passed every run.
- **End-to-end tests (Playwright)** use `fullyParallel`. Every test owns a fresh browser context (storage, locks, BroadcastChannel), so any test can run beside any other, and shards split per test rather than per file.
  - **CI: one worker per runner, sixteen shard jobs** beside the `build` job. This follows Playwright's CI advice: get parallelism from sharding, not from piling workers onto one machine.
  - Each Studio page animates continuously and uses about three CPU threads. Two workers on a 4-vCPU runner made tests about 42% slower and produced a load flake (benchmark below).
  - A push uses 17 jobs. GitHub Free allows 20 concurrent jobs per account, so a second push (or another workflow) while one runs queues some jobs: it finishes later, but it still runs.
  - **Local: `workers: '20%'`**, which gives 4 on 24 threads and 1 on 8 or fewer. 6 and 12 workers were slower and caused timeouts.
  - `expect.timeout` is 5 s on CI (an unloaded single worker) and 15 s locally (workers share the CPU).
  - `retries` is 1 on CI. The `github` reporter annotates any test that only passed on retry as flaky; investigate those, don't ignore them.
  - Failures and retried flakes upload `app/test-results` traces as an artifact for 7 days.
- **CI layout:** `build` (check, unit, build, Pages artifact) runs in parallel with the e2e shards. `deploy` needs all of them.
  - A newer push to a non-main ref cancels its older run.
  - On main, a run that has started always finishes. A queued one can be replaced by a newer push, which is then tested and deployed itself.
  - Manual runs have their own concurrency group, so they can't replace a pending deployable push.
- **Agents** run `npm run check`, `npm test` and only the specs mapped in AGENTS.md "End-to-end scope". CI runs everything before deploying.

## How sharding actually splits the work

Playwright 1.64 (`filterForShard` in `node_modules/playwright/lib/runner/index.js`) orders tests by project, file and position, then cuts that list into **contiguous slices of equal test count**. It does not weigh by duration.

- With one worker, a shard's time is the **sum of its tests**, not its longest test.
- Heavy tests that sit next to each other land in the same shard. With 16 shards the bottleneck is the slice holding both parameterized creator cases (`character-creator.spec.ts:460`, Side-scroller 2 and Unique 8, always adjacent) and the device import roundtrip: 2.0 min in run 40187808473, against 41 s for the last shard. With 8 shards it was the end of `studio.spec.ts` (150 s) plus the creator slice (121 s).
- Splitting a long test does not rebalance anything: its parts stay adjacent, usually in the same shard. Replaying `filterForShard` on real durations, splitting the three longest tests changed the slowest shard from 150 s to 136 s in one run, and made it worse (110 s to 121 s) in another.
- What helps: more shards (smaller slices); less actual work in heavy tests; or spreading heavy tests across the order, e.g. splitting a huge spec file by feature so its parts sort apart.
- `PWTEST_SHARD_WEIGHTS` can weight the slices (best contiguous cut ≈ 95 s against 150 s in one run), but it is an undocumented internal variable. Don't rely on it.

### Benchmark, 2026-10-25

Each layout ran on real CI twice (a push plus a full rerun) on a throwaway branch. The metric is the time from the first job starting to the last e2e job finishing.

| Layout | Run 1 | Run 2 | Notes |
|---|---|---|---|
| 8 shards × 1 worker | 175 s | 182 s | previous layout |
| **16 shards × 1 worker** | **151 s** | **147 s** | stable; adopted |
| 8 shards × 2 workers | 200 s | 128 s | the 256 px creator test failed under load and passed on retry in run 1 |

Runs: [40187369452](https://github.com/Shilo/PixelDoll/actions/runs/40187369452), [40187808473](https://github.com/Shilo/PixelDoll/actions/runs/40187808473), [40188179676](https://github.com/Shilo/PixelDoll/actions/runs/40188179676).

## Warning signs: when to stop and look

| Signal | Budget | How to see it |
|---|---|---|
| CI push to deployed | over 5 min | `gh run list`, then `gh run view <id> --json createdAt,updatedAt` |
| Any e2e shard job | over 3 min including setup (about 35–45 s of each job) | `gh run view <id> --json jobs` |
| One e2e test | over 45 s in CI (it costs every local run and inflates its slice) | `gh run view <id> --log` (list reporter prints each duration) |
| Unit suite | over 15 s locally or 45 s in CI | `npx vitest run` from `app/` |
| One unit file | over 3 s locally (CI is roughly 1.5× slower) | `npx vitest run --reporter=verbose` or `--reporter=json` |
| Flaky annotations, or "retry #1" lines in CI logs | any | the workflow summary annotations |

Slowest tests on 2026-10-25 ([run 40185183099](https://github.com/Shilo/PixelDoll/actions/runs/40185183099)):

| e2e test | Time | Where the time goes |
|---|---|---|
| `character-creator.spec.ts` Unique 8, 256px | 38.9 s | 17 s is the app's own offline creation pipeline at 256 px |
| `studio.spec.ts` Inspector animation | 29.3 s | about 6 s less since its frame checks read geometry in one call per sample |
| `studio.spec.ts` free item color matching | 27.8 s | spread over real app work (fixture setup, reload, export) |
| `studio.spec.ts` studio demo | 23.6 s | spread over real flows |
| `character-creator.spec.ts` Side-scroller 2 | 21.5 s | creation pipeline |
| `characters.spec.ts` device import roundtrip | 20.8 s | save, reopen and delete |

Locally every unit file runs under 2.4 s. In CI the slowest are `character-option-matrix` and `character-import`, at about 3.5 s.

## What made tests slow or flaky before (don't reintroduce)

1. **Serial runners.** Playwright had `workers: 1` and Vitest `fileParallelism: false`, left over from older scripts, with no shared state that needed them.
2. **`toEqual` on pixel buffers.** Vitest walks typed arrays element by element: one loop over 341 images took 6.2 s; a byte compare takes 5 ms. Use `expectPixels(actual, expected, label)` or `expectBytes` from `app/test/unit/pixels.ts`. They check size, array type and every byte, and accept `null` for empty cells.
3. **Exhaustive matrices in e2e.** Every combination of a pure function belongs in a unit test (`test/unit/character-option-matrix.test.ts` covers all 863 facing plans and 12,082 transitions). An e2e test proves the UI is wired: one case per control or template.
4. **Duplicate end-to-end variants.** A full creation, export and reimport run per preset, where two variants already covered the distinct paths.
5. **Sequential browser round trips.** The Inspector check made about 12 Playwright calls per animation sample. Read related geometry in one `locator.evaluate`. Remember that `getBoundingClientRect` gives a hidden element a zero box, where `boundingBox()` gave `null`, so assert a real size.
6. **Counting ticks or sleeping instead of waiting for state.**
   - The queue self-tests counted `setTimeout(0)` ticks and flaked under load.
   - Poll the condition with a wall-clock deadline (`until()` in `src/lib/pixellab/queue.ts`).
   - In Playwright, use `expect(...)`, `expect.poll` or a DOM signal, not `waitForTimeout`.
7. **Real-time windows asserted across separate `page.evaluate` round trips.** A round trip can take more than 180 ms under load.
   - For logic driven by time, hold page time still. `experience-parity.spec.ts` overrides `performance.now`, the only clock the wheel handler reads.
   - Have each action report its effect directly, e.g. "did this start a load?". Asynchronous follow-ups (`openProject`) can make a wrong step and a right step end on the same final state.
8. **Polling a finished failure.** Wait for completion (e.g. `data-failures` is a number), then assert once with the log as the message, so a failure reports in under a second instead of after the timeout.
9. **Trusting `page.reload()` to test unload behavior.** A page-initiated `location.reload()` lost an autosave edit every time, while Playwright's reload did not. Test unload paths the way users trigger them.
   - The Studio now keeps the unsaved dress state (outfit, colors, saved outfits, layer order, hides) in localStorage on `pagehide` and when the page is hidden.
   - It **replaces** the saved state on the next open, because merging can't express a reset or a removal.
   - It sweeps snapshots of deleted characters whenever the character list loads.

## Rules for new tests

- **Put coverage at the cheapest level that proves it:**
  - pure logic in unit tests;
  - browser APIs (IndexedDB, Web Locks, CompressionStream) in the browser self-tests;
  - UI wiring and user flows in e2e.
- **Keep every e2e test independent.** No ordering or shared state between tests or files. `fullyParallel` and sharding depend on it.
- **Keep tests lean.** Shard time is the sum of its tests, and adjacent heavy tests share a shard, so cut real work and round trips rather than splitting a test into parts. If one spec file collects many heavy tests, split it by feature.
- **Register a new spec in `app/playwright.config.ts` `testMatch`**, or it never runs (it is silently skipped). Then add it to the AGENTS.md spec map so agents select it.
- **Stay offline.** Route `https://*.pixellab.ai/**` to fixtures or `abort()`, and keep the existing "no paid request" assertions.
- **Before merging anything that changes timing or waits,** run it under load: `npm run e2e -- <spec> --repeat-each=10 --workers=8` with your own `E2E_PREVIEW_PORT` / `E2E_DEV_PORT` / `TEST_OUTPUT_DIR`, and once in CI mode: `CI=1 npm run e2e -- <spec> --workers=1`.
- **Prove a timing or guard test can fail.** Temporarily break the app code it guards, confirm the test fails, then restore the file exactly.

## Open options, measured or modeled but not done

- **Separate the two parameterized creator cases** (`character-creator.spec.ts:460`) so they no longer share a slice, e.g. by moving one into another spec file by feature. Re-measure with CI after any move: the bottleneck shifts as tests are added.
- **Setup per shard is about 35–45 s** (installing Playwright with its apt packages takes 16–26 s). Browser caching saves about 3–6 s and Playwright advises against it. Dropping `--with-deps` needs Linux validation first.
- **The 15 s local expect timeout** hides UI steps that take up to 15 s on a loaded workstation. CI's 5 s still catches them.
- **The unload snapshot covers only the debounced dress state.** Other flows (character creation, import, moves) write through their own awaited saves; a new debounced write path would need the same treatment. Known limits:
  - Only the outfit and color paths have regression tests. Saved outfits, layer order and hides ride on the same `applyDress` path that undo uses.
  - The "loaded project is clean" reset after a failed save has no test: one would need an import plus a forced IndexedDB failure.
  - If the snapshot's save never landed and another tab then changes that character's presets or colors outside the autosave, reopening applies the older snapshot. Items added since are kept.
  - The deleted-character sweep can, in a tiny window, drop a snapshot another tab writes while this tab's character list is loading.

## Measuring

From `app/`:

```bash
npx vitest run --reporter=verbose                  # per-test unit durations
npm run e2e                                        # full suite, local workers
npm run e2e -- <spec>                              # targeted
CI=1 npm run e2e -- --shard=3/16                   # one CI-shaped shard (1 worker, 5 s expect, 1 retry)
gh run view <run-id> --json createdAt,updatedAt,jobs
gh run view <run-id> --log                         # per-test durations from the list reporter
```

Compare against a baseline from the same machine at the same time. The owner's workstation varies by ±30% depending on other load (one round of parallel runs here once took 4× longer for no reproducible reason), and the required runtime is Node 24.22.1 (`.nvmrc`).
