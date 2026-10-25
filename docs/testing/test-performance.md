# Test performance: keeping unit and end-to-end tests fast

Last measured 2026-10-25 on `main` at `3cc08055`. Read this before changing `app/vitest.config.ts`, `app/playwright.config.ts`, `.github/workflows/pages.yml`, or before adding slow or timing-sensitive tests.

## Where we started and where we are

| | 2026-10-24 (before) | 2026-10-25 (after) |
|---|---|---|
| CI, push to deployed | 15m05s ([run 40088050662](https://github.com/Shilo/PixelDoll/actions/runs/40088050662)) | 2m54s–3m43s ([runs 40181556065, 40185183099](https://github.com/Shilo/PixelDoll/actions/runs/40185183099)) |
| CI end-to-end | 12m50s, one job, one worker | 8 parallel jobs; the slowest job takes 3m23s (≈50 s of it setup) |
| CI unit (`npm test`) | 63 s | 22 s |
| Local full e2e (i7-13700K, 24 threads) | 7m46s, 98 tests, 1 worker | 3m46s, 107 tests, 4 workers |
| Local unit | 39.5–59.5 s | 4.7 s |
| Typical agent check: `npm run check` + `npm test` + one spec | no partial-run guidance (`npm run e2e` ran the full suite) | 7 s + 4.7 s + 34 s (`npm run e2e -- characters`) |

Commits: `1b6230a7`, `16b787ef`, `84f718e3`, `1c59e22e`, `3a246fff`, `8b098785`, `7d817624` and `3cc08055`, plus the queue self-test fix merged in `87ee9f53`. Codex reviewed the work in two rounds; the handoffs are local only (`.claude/handoffs/2026-10-25-test-speed-*`).

## How the setup works, and why

- **Unit tests (Vitest)** run test files in parallel. Each file already runs in its own process (the default `forks` pool with `isolate`), so module state never leaks between files. `--no-isolate` fails 53 tests: never turn isolation off.
  - CI uses Vitest's default worker count: CPUs − 1, which is 3 on a 4-vCPU runner.
  - Locally `maxWorkers: '50%'`. It measured faster than the default on 24 threads (3.8 s against 5–6 s), because each extra process only adds startup cost, and it leaves the machine usable.
- **End-to-end tests (Playwright)** use `fullyParallel`. Every test owns a fresh browser context (storage, locks, BroadcastChannel), so any test can run beside any other, and shards split per test rather than per file.
  - **CI: one worker per runner, eight shard jobs** beside the `build` job. This follows Playwright's CI advice: get parallelism from sharding, not from piling workers onto one machine.
  - Each Studio page animates continuously and uses about three CPU threads. Two workers on a 4-vCPU runner made each test about 42% slower.
  - Nine jobs per push stay under GitHub Free's 20 concurrent jobs.
  - **Local: `workers: '20%'`**, which gives 4 on 24 threads and 1 on 8 or fewer. 6 and 12 workers were slower and caused timeouts.
  - `expect.timeout` is 5 s on CI (an unloaded single worker) and 15 s locally (workers share the CPU).
  - `retries` is 1 on CI. The `github` reporter annotates any test that only passed on retry as flaky; investigate those, don't ignore them.
  - Failures and retried flakes upload `app/test-results` traces as an artifact for 7 days.
- **CI layout:** `build` (check, unit, build, Pages artifact) runs in parallel with the 8 e2e shards. `deploy` needs all of them.
  - A newer push to a non-main ref cancels its older run. Main always finishes.
  - Manual runs have their own concurrency group, so they can't replace a pending deployable push.
- **Agents** run `npm run check`, `npm test` and only the specs mapped in AGENTS.md "End-to-end scope". CI runs everything before deploying.

## Warning signs: when to stop and look

| Signal | Budget | How to see it |
|---|---|---|
| CI push to deployed | over 5 min | `gh run list`, then `gh run view <id> --json createdAt,updatedAt` |
| Any e2e shard job | over 4 min, or more than about 2× the fastest shard | `gh run view <id> --json jobs` |
| One e2e test | over 45 s in CI (it is the floor for its shard) | `gh run view <id> --log` (list reporter prints each duration) |
| Unit suite | over 15 s locally or 45 s in CI | `npx vitest run` from `app/` |
| One unit file | over 3 s | `npx vitest run --reporter=verbose` or `--reporter=json` |
| Flaky annotations, or "retry #1" lines in CI logs | any | the workflow summary annotations |

Slowest tests on 2026-10-25 ([run 40185183099](https://github.com/Shilo/PixelDoll/actions/runs/40185183099)):

| e2e test | Time |
|---|---|
| `character-creator.spec.ts:460` Unique 8, 256px | 38.9 s |
| `studio.spec.ts:312` Inspector animation | 29.3 s |
| `studio.spec.ts:1521` free item color matching | 27.8 s |
| `studio.spec.ts:51` studio demo | 23.6 s |
| `character-creator.spec.ts:460` Side-scroller 2 | 21.5 s |
| `characters.spec.ts:61` device import roundtrip | 20.8 s |

Every unit file runs under 2.4 s. The slowest are `studio-flow-state` (2.4 s), `measurement-recovery` (1.8 s) and `character-import` (1.6 s).

## What made tests slow or flaky before (don't reintroduce)

1. **Serial runners.** Playwright had `workers: 1` and Vitest `fileParallelism: false`, left over from older scripts, with no shared state that needed them.
2. **`toEqual` on pixel buffers.** Vitest walks typed arrays element by element: one loop over 341 images took 6.2 s; a byte compare takes 5 ms. Use `expectPixels(actual, expected, label)` or `expectBytes` from `app/test/unit/pixels.ts`. They check size, array type and every byte, and accept `null` for empty cells.
3. **Exhaustive matrices in e2e.** Every combination of a pure function belongs in a unit test (`test/unit/character-option-matrix.test.ts` covers all 863 facing plans and 12,082 transitions). An e2e test proves the UI is wired: one case per control or template.
4. **Duplicate end-to-end variants.** A full creation, export and reimport run per preset, where two variants already covered the distinct paths.
5. **Counting ticks or sleeping instead of waiting for state.**
   - The queue self-tests counted `setTimeout(0)` ticks and flaked under load.
   - Poll the condition with a wall-clock deadline (`until()` in `src/lib/pixellab/queue.ts`).
   - In Playwright, use `expect(...)`, `expect.poll` or a DOM signal, not `waitForTimeout`.
6. **Real-time windows asserted across separate `page.evaluate` round trips.** A round trip can take more than 180 ms under load.
   - For logic driven by time, hold page time still. `experience-parity.spec.ts` overrides `performance.now`, the only clock the wheel handler reads.
   - Have each action report its effect directly, e.g. "did this start a load?". Asynchronous follow-ups (`openProject`) can make a wrong step and a right step end on the same final state.
7. **Polling a finished failure.** Wait for completion (e.g. `data-failures` is a number), then assert once with the log as the message, so a failure reports in under a second instead of after the timeout.
8. **Trusting `page.reload()` to test unload behavior.** A page-initiated `location.reload()` lost an autosave edit every time, while Playwright's reload did not. Test unload paths the way users trigger them.

## Rules for new tests

- **Put coverage at the cheapest level that proves it:**
  - pure logic in unit tests;
  - browser APIs (IndexedDB, Web Locks, CompressionStream) in the browser self-tests;
  - UI wiring and user flows in e2e.
- **Keep every e2e test independent.** No ordering or shared state between tests or files. `fullyParallel` and sharding depend on it.
- **Keep single tests short.** Split a test that grows past about 30 s by user flow; the longest test sets the floor for its shard.
- **Register a new spec in `app/playwright.config.ts` `testMatch`**, or it never runs (it is silently skipped). Then add it to the AGENTS.md spec map so agents select it.
- **Stay offline.** Route `https://*.pixellab.ai/**` to fixtures or `abort()`, and keep the existing "no paid request" assertions.
- **Before merging anything that changes timing or waits,** run it under load: `npm run e2e -- <spec> --repeat-each=10 --workers=8` with your own `E2E_PREVIEW_PORT` / `E2E_DEV_PORT` / `TEST_OUTPUT_DIR`, and once in CI mode: `CI=1 npm run e2e -- <spec> --workers=1`.
- **Prove a timing or guard test can fail.** Temporarily break the app code it guards, confirm the test fails, then restore the file exactly.

## Open options, measured or modeled but not done

- **Shard layout.** Shards are uneven (57 s to 2.6 min of tests in one run) because Playwright splits contiguously.
  - Modeled on the 103-test run, excluding setup: 8×1 = 110 s, 16×1 = 92 s, 8×2 ≈ 89 s (assumes 2 workers make each test 50% slower).
  - Benchmark 16×1 against 8×2 with real CI runs before changing. 16×1 uses 17 of the 20 job slots, so a second concurrent push would queue.
  - The alternative with no new jobs: split the 3 longest tests listed above.
- **Setup per shard is about 50 s**, mostly `playwright install --with-deps --only-shell chromium` (apt packages). Browser caching saves about 3–6 s and Playwright advises against it. Dropping `--with-deps` needs Linux validation first.
- **The 15 s local expect timeout** hides UI steps that take up to 15 s on a loaded workstation. CI's 5 s still catches them.

## Measuring

From `app/`:

```bash
npx vitest run --reporter=verbose                  # per-test unit durations
npm run e2e                                        # full suite, local workers
npm run e2e -- <spec>                              # targeted
CI=1 npm run e2e -- --shard=3/8                    # one CI-shaped shard (1 worker, 5 s expect, 1 retry)
gh run view <run-id> --json createdAt,updatedAt,jobs
gh run view <run-id> --log                         # per-test durations from the list reporter
```

Compare against a baseline from the same machine at the same time. The owner's workstation varies by ±30% depending on other load, and the required runtime is Node 24.22.1 (`.nvmrc`).
