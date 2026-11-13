# Test performance: keeping unit and end-to-end tests fast

Last measured 2026-10-25; workstation load and suite size remeasured 2026-11-12 (next section). Read this before changing `app/vitest.config.ts`, `app/playwright.config.ts`, `.github/workflows/pages.yml`, or before adding slow or timing-sensitive tests.

## Workstation load, 2026-11-12

Agents were running far more than a change needed, several sessions at once, and the owner's workstation froze. What was measured, and what now prevents it:

| Problem (measured) | Now |
|---|---|
| `npm run e2e` with no arguments ran the whole suite: 329 tests, 26 minutes of serial test time | On a workstation the wrapper (`app/scripts/e2e.mjs`) refuses to run without a scope; `--all` is the full suite |
| Sessions ran e2e at the same time; each run's four workers plus servers already use about half the CPU | One run at a time per machine, across every checkout: the wrapper holds loopback port 5397 for the whole run and later runs print "Waiting" until it is free. The system frees the port when its holder exits, so a killed run leaves no stale lock |
| A direct `npx playwright test` skipped the build and the queue | `playwright.config.ts` refuses a workstation run that did not come through the wrapper (listing still works) |
| Test processes competed with the desktop | Unit and e2e runs lower their own priority (below normal); the build, servers and browser processes inherit it. On a loaded machine a 4-test spec took 7.8 to 8.9 s lowered against 7.0 to 7.2 s at normal priority |
| 482 leftover `test-results-*` folders and logs in `app/` (8.1 GB, 87,727 files), one per agent run with its own `TEST_OUTPUT_DIR`: `prettier --check .` took 114 s walking them (13 s without), and every recursive search crawled | Runs are queued, so the default ports and `test-results/` never collide: leave `E2E_PREVIEW_PORT`, `E2E_DEV_PORT` and `TEST_OUTPUT_DIR` unset and write no output into `app/` |
| `npm run check` repeated all its work on every run: about 60 s on a clean tree (svelte-check 25 s, test types 20 s, Prettier 13 s, node types 2 s) | svelte-check `--incremental`, `incremental` TypeScript projects and `prettier --cache` reuse results for unchanged files: about 10 s on a repeat run (3.4 s, 3 s, 1.8 s, 1.9 s). Each was checked to still fail on a new error. CI has no cache and runs everything |
| Sessions ran the full suite locally before publishing (6 to 7 minutes of heavy CPU each, one waited 21 minutes in the queue), and a test that failed on every CI run still reached `main` and blocked the deploy (2026-11-13: the local runs were on Windows, some in a checkout another session was pulling into) | `npm run land` (`app/scripts/land.mjs`) pushes the commit to a temporary branch, waits for its CI run (16 runners, about 3 minutes, no workstation load) and fast-forwards `main` only when it passed; `.githooks/pre-push` refuses any other push to `main` of an unproven commit. The full suite runs locally only when asked |
| The unit suite grew to 186 files and 2,379 tests, about 100 s of CPU: 13 s at 12 workers, 23 s at 8, 30 s at 6, 43 s at 4 | `maxWorkers: '50%'` stays (the burst is shortest); the run yields to the desktop through its priority |

The queue, the scope check and the lowered priority apply everywhere except GitHub Actions, so a local `CI=1` run (CI timeouts, one worker, one retry) is queued too, and there is no switch to skip the queue. Limits: `playwright.experience.config.ts` runs against an already served build and bypasses the queue, and a run that is killed outright frees the queue even if its browsers take a moment to die. If only the wrapper is killed, its two Vite servers keep listening for good; the next run stops them on Windows and names the command elsewhere (measured 2026-11-13: both servers were still up four minutes after the kill). `npm run check` drops its caches whenever the lockfile, the installed packages, the Node version or a Svelte, Prettier or TypeScript config changes (`app/scripts/check-cache.mjs`), because svelte-check and Prettier do not notice those changes themselves.

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
  - `testTimeout` is 10 s on CI and 20 s locally. With an 8-worker e2e run beside it, the heaviest export tests exceeded 5 s (1–10 failures per run); 20 s passed every run.
  - On CI the whole unit step took 35–60 s across runs of similar code (2026-11-06 to 11-10), a 1.7× spread, and the heaviest sweeps (`move-classification`, `bench`, `character-option-matrix` sizes) took 2.4–2.9 s. A 5 s limit left those within one slow runner of a false timeout, so CI uses 10 s (2026-11-10). A timeout is a hang detector, not a speed budget: watch durations with the table under "Warning signs".
- **End-to-end tests (Playwright)** use `fullyParallel`. Every test owns a fresh browser context (storage, locks, BroadcastChannel), so any test can run beside any other, and shards split per test rather than per file.
  - **CI: one worker per runner, sixteen shard jobs** beside the `build` job. This follows Playwright's CI advice: get parallelism from sharding, not from piling workers onto one machine.
  - Each Studio page used about three CPU threads when these limits were set (2026-10-25). Since 2026-11-12 the stage repaints only when its frame changes, so an idle page uses far less (item 10 below); the worker limits have not been re-measured. Two workers on a 4-vCPU runner made tests about 42% slower and produced a load flake (benchmark below).
  - A push uses 17 jobs. GitHub Free allows 20 concurrent jobs per account, so a second push (or another workflow) while one runs queues some jobs: it finishes later, but it still runs.
  - **Local: `workers: '20%'`**, which gives 4 on 24 threads and 1 on 8 or fewer. 6 and 12 workers were slower and caused timeouts.
  - Don't raise it for a single run either: each animating Studio page used about three threads when measured, so 6 or more workers saturated a 24-thread machine. On 2026-10-25 one shared-equipment test failed 12 of 12 times at 12 workers and passed 8 of 8 at 6, with no race involved. Other sessions on the same machine add to that load.
  - The explicitly requested Windows eight-worker Share/keyboard stress has a separate `playwright.stress.config.ts`: `npm run e2e -- --config=playwright.stress.config.ts`. It repeats the three existing cases ten times with zero retries and inherits the ordinary browser, screenshots, DOM traces, assertions and deadlines. The queue keeps other wrapper runs out; also stop unit runs and checks first: another four-worker suite was observed contaminating a cohort. This does not raise ordinary local/CI concurrency. See [Windows cold-start qualification](windows-cold-start-2026-11-04.md) for results, environment and fresh-server procedure.
  - Dev-server tests (those that `import('/src/...')` in the page, plus characters and creator-request-matrix) fail first under that overload: Vite transforms each module on request, and at 4 workers a blank first page still had 61 of about 200 module requests pending after 20 s. Vite's `server.warmup` cut an idle first load from 0.87 s to 0.2 s but did not reduce these failures (5 and 4 failed with it, against 5 without), so it was not adopted. CI's one worker per runner does not hit this.
  - The production preview strips the dev-only `__queue`/`__studio` hooks, so a `studio demo:` test asserts they are absent, and a small `dev server:` test in `studio.spec.ts` checks the queue pausing offline and resuming online instead of rerunning the whole demo.
  - `expect.timeout` is 5 s on CI (an unloaded single worker) and 15 s locally (workers share the CPU).
  - `retries` is 1 on CI. The `github` reporter annotates any test that only passed on retry as flaky; investigate those, don't ignore them.
  - Failures and retried flakes upload `app/test-results` traces as an artifact for 7 days.
  - **The browser installs without `--with-deps`.** The runner's preinstalled Google Chrome already brings every library the headless shell needs; `--with-deps` only added fonts and security upgrades from an Ubuntu mirror that stalled 4 of 32 shard installs for 3–10 min on 2026-10-25. Validated on a throwaway branch ([run 40211945075](https://github.com/Shilo/PixelDoll/actions/runs/40211945075)): all 16 shards passed with no flakes, the install fell from a median of 19 s to 4–6 s, and `fc-match` gave the same font file for every name the app's stacks use (sans-serif, serif, monospace, system-ui, Segoe UI, Georgia, Times New Roman) with and without the packages.
  - The intentional persistent-profile crash test uses full Chromium (`channel: 'chromium'`) for its native browser/profile implementation. CI installs both Chromium and the headless shell; `--only-shell` would leave that test without its required executable. Ordinary tests continue to use the shell. The earlier 4–6 second install measurement covered only the shell.
  - Playwright 1.64.1's Chromium host-dependency check does nothing on Linux (it looks in `chrome-linux`; the folders are `chrome-linux64` and `chrome-headless-shell-linux64`). A library missing from a future runner image shows up as a browser launch crash instead, which still fails every test and blocks the deploy.
- **CI layout:** `build` (check, unit, build, Pages artifact) runs in parallel with the e2e shards. `deploy` needs all of them.
  - A newer push to a non-main ref cancels its older run.
  - On main, a run that has started always finishes. A queued one can be replaced by a newer push, which is then tested and deployed itself.
  - Manual runs have their own concurrency group, so they can't replace a pending deployable push.
- **Agents** run `npm run check`, `npm test` and only the specs mapped in AGENTS.md "Testing", once, when a change is complete. CI runs everything before deploying.

## How sharding actually splits the work

CI does not use Playwright's `--shard`. Playwright 1.64–1.65 (`filterForShard` in `node_modules/playwright/lib/runner/index.js`) orders tests by project, file and position, then cuts that list into **contiguous slices of equal test count**, without weighing duration. With one worker a shard's time is the **sum of its tests**, so adjacent heavy tests shared a slice: on 2026-11-10 the slowest shard ran 119–133 s of tests while the lightest ran 50 s, and the slowest job set every deploy's time.

Since 2026-11-10 each e2e job runs `node scripts/e2e-shard.mjs <n>/16 <file>` and then `playwright test --test-list <file>`:

- **Plan:** every job lists all tests and assigns them, heaviest first, to the shard with the least recorded time so far, using `app/test/e2e/durations.json` (averaged CI durations). A test without a recorded duration, new or renamed, weighs as a median test. Every job computes the same plan from the same commit. On the recorded durations each shard holds about 95 s (2026-11-12).
- **Guards:** the step fails before any test runs if the shards do not cover every test exactly once, if a title is empty, padded or contains `›` or a newline, if two tests share a title path, if `durations.json` holds a non-number, or if Playwright's own `--list` with that file does not select exactly the planned tests.
- **Helper files:** a test list loads only the files it names. `dialog-dismissal.ts`, `studio-thumbnails.ts` and `setup-concurrency.ts` register tests from inside other specs, so a list naming only their tests selected nothing (verified). The script adds a `(load file)` line for every spec file; that title matches no test, and the selection guard would catch it if one ever did.
- **Refreshing durations:** the plan stays valid without it, but balance drifts as tests change: by 2026-11-12 the suite had grown from 248 to 329 tests, the 85 new ones weighed as a 3 s median although several run 15 to 37 s, and shards ran 76 to 138 s against a planned 80 s (a refresh put every shard at about 95 s). After a large test change, refresh from recent green runs: `gh run view <id> --log > ci-<id>.log` for two or three runs, then `node scripts/e2e-shard.mjs update ci-*.log` from `app/` (in Git Bash; it refuses to write when fewer than half the tests have a duration), and commit the JSON.
- Earlier attempts inside `--shard` gave little: registering heavy tests apart (2026-10-25) took the slowest shard from 99–112 s to 72–87 s for a while, splitting long tests did nothing (the parts stay adjacent), and `PWTEST_SHARD_WEIGHTS` is an undocumented internal variable.

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
| One unit file | over 3 s locally (CI is 1.5–3.5× slower; `move-classification`'s sweep took 0.86 s locally and 2.86 s in CI) | `npx vitest run --reporter=verbose` or `--reporter=json` |
| Flaky annotations, or "retry #1" lines in CI logs | any | the workflow summary annotations |

Slowest tests on 2026-10-25 ([run 40185183099](https://github.com/Shilo/PixelDoll/actions/runs/40185183099)):

| e2e test | Time | Where the time goes |
|---|---|---|
| `character-creator.spec.ts` Unique 8, 256px | 38.9 s | 17 s is the app's own offline creation pipeline at 256 px |
| `studio.spec.ts` Inspector animation | 29.3 s | about 6 s less since its frame checks read geometry in one call per sample |
| `studio.spec.ts` free item color matching | 27.8 s | spread over real app work (fixture setup, reload, export) |
| `studio.spec.ts` studio demo | 23.6 s | spread over real flows; split into eight independent tests on 2026-11-12 (item 11 below) |
| `character-creator.spec.ts` Side-scroller 2 | 21.5 s | creation pipeline |
| `characters.spec.ts` device import roundtrip | 20.8 s | save, reopen and delete |

Locally every unit file runs under 2.4 s. In CI the slowest are `character-option-matrix` and `character-import`, at about 3.5 s.

## What made tests slow or flaky before (don't reintroduce)

1. **Serial runners.** Playwright had `workers: 1` and Vitest `fileParallelism: false`, left over from older scripts, with no shared state that needed them.
2. **`toEqual` on pixel buffers.** Vitest walks typed arrays element by element: one loop over 341 images took 6.2 s; a byte compare takes 5 ms. It came back in `shared-refit.test.ts` (one test 7 to 10 s on CI, 0.35 s under the limit) until 2026-11-12. Use `expectPixels(actual, expected, label)` or `expectBytes` from `app/test/unit/pixels.ts`. They check size, array type and every byte, and accept `null` for empty cells.
3. **Exhaustive matrices in e2e.** Every combination of a pure function belongs in a unit test (`test/unit/character-option-matrix.test.ts` covers all 863 facing plans and 12,082 transitions). An e2e test proves the UI is wired: one case per control or template.
4. **Duplicate end-to-end variants.** A full creation, export and reimport run per preset, where two variants already covered the distinct paths.
5. **Sequential browser round trips.** The Inspector check made about 12 Playwright calls per animation sample. Read related geometry in one `locator.evaluate`. Remember that `getBoundingClientRect` gives a hidden element a zero box, where `boundingBox()` gave `null`, so assert a real size.
6. **Counting ticks or sleeping instead of waiting for state.**
   - The queue self-tests counted `setTimeout(0)` ticks and flaked under load.
   - Poll the condition with a wall-clock deadline (`until()` in `src/lib/pixellab/queue.ts`).
   - In Playwright, use `expect(...)`, `expect.poll` or a DOM signal, not `waitForTimeout`.
   - Never assume which concurrent async call reaches a hook first: crypto.subtle, IndexedDB and timers reorder under load. Select the held call by identity, or await whichever settles (`Promise.race`). `measurement-retry.test.ts` held "the second claim" but awaited one fixed caller, and hung to the 5 s timeout on CI whenever the other caller claimed second.
   - A concurrent call may also never reach the hook at all. After that fix, the same test hung again on CI ([run 42804968716](https://github.com/Shilo/PixelDoll/actions/runs/42804968716)): one enqueue finished before the other's hashing did, so the second reused the in-memory job and never claimed. When a test needs every caller inside a dependency, hold them at a barrier until all have arrived.
   - Don't collect results in completion order. `requestIdentity` pushed each input hash as it finished, so `item-trial.test.ts` failed about 1 run in 6 under load until each image reserved its slot in request order (2026-11-10).
   - Timers the page scheduled before `page.clock.install` stay real, and the fake `clearTimeout` cannot cancel them. Studio's first frame timer fired in real time and made the first Preview check in `export-picker.spec.ts` see too few frames on fast runs (3 of 20). Stop app timers before installing the clock, then restart them.
   - `context.setOffline` waits for every service worker Playwright tracks, and a worker still stopping never answers. Stopping the worker over CDP and then going offline hung `pwa.spec.ts` to the test timeout on some CI runners (15 of 240 stress runs, all on one runner, so the retry failed too); going offline first passed 240 of 240 (2026-11-10).
   - Don't message the outgoing service worker while an update activates. After `skipWaiting()` Chromium stops the old worker once it is idle, but a message that restarts it cancels that, and with DevTools attached (as Playwright is) the worker never reports idle again, so activation waits for Chromium's 5-minute limit. Polling `controllerBuild` right after the Update click failed 7 of 10 and 5 of 10 runs of two `pwa.spec.ts` tests on Windows; waiting for the reloaded document first passed 30 of 30 and 10 of 10 (2026-11-13).
   - Budget a wait for the app's own intervals. The queue polls a running job every 5 s (`POLL_MS`), so a completion check took 4.9–5.0 s and failed CI's 5 s expect timeout in 3 of 40 runs; that one poll now allows 15 s. Measure the wait from a trace before choosing a budget.
   - In CI mode on a 4-worker workstation, the 5 s waits also fail from load alone (5 of 496 in a 2026-11-10 sweep, none of them seen in 40 CI runs). Use CI history, not a local CI-mode sweep, to decide what is flaky.
7. **Real-time windows asserted across separate `page.evaluate` round trips.** A round trip can take more than 180 ms under load.
   - For logic driven by time, hold page time still. `experience-parity.spec.ts` overrides `performance.now`, the only clock the wheel handler reads.
   - Have each action report its effect directly, e.g. "did this start a load?". Asynchronous follow-ups (`openProject`) can make a wrong step and a right step end on the same final state.
8. **Polling a finished failure.** Wait for completion (e.g. `data-failures` is a number), then assert once with the log as the message, so a failure reports in under a second instead of after the timeout.
9. **Trusting `page.reload()` to test unload behavior.** A page-initiated `location.reload()` lost an autosave edit every time, while Playwright's reload did not. Test unload paths the way users trigger them.
   - The Studio now keeps the unsaved dress state (outfit, colors, saved outfits, layer order, hides) in localStorage on `pagehide` and when the page is hidden.
   - It **replaces** the saved state on the next open, because merging can't express a reset or a removal.
   - It sweeps snapshots of deleted characters whenever the character list loads.
10. **Repainting an idle stage.** The Studio stage redrew its full-window canvas and its WebGL floor on every animation frame, about 0.78 CPU cores per idle Studio page, so parallel workers starved each other and a different set of studio tests failed under load on every run (2026-11-12). The stage now records each frame's drawing and paints only when it differs (`app/src/studio/experience/paint.ts`; the floor skips unchanged frames in `ground.ts`): about 0.18 cores idle. A test that reads stage pixels must let the stage paint after it changes something; `experience-parity.spec.ts` waits one animation frame after a resize, because it once read the previous viewport's frame (painted bottom 1005 where 986 was allowed).
11. **One long chained test.** The `studio demo` test chained about 30 flows (dressing, export, sheets, move views, dev rigs, four device sizes) in one 90 s budget, so under load one slow step timed out everything after it, and its shard slice could not split. It is now eight independent tests that share a guard (`demoGuard`: every paid API call is recorded and refused, and page errors fail the test). In parallel (3 workers, 2026-11-12) its longest part takes 6.8–13.4 s; the whole chain took 28.9–37.7 s.
    - The same day "top notifications fit both themes…" merged its dismiss and show calls into one evaluate and reused its last polled measurement as evidence: about 340 fewer round trips over 168 notices, 13.0–20.4 s against 24.9–40.0 s.
    - Under 16 busy CPU threads, the affected tests passed 108 of 110 at 8 workers (`--repeat-each=10`). Both failures were the first page load on the dev server, described under the local workers above.
12. **Pausing a fake clock at its install time.** `page.clock.install({ time })` keeps the clock running, so `pauseAt(time)` threw "Cannot fast-forward to the past" whenever the install had already advanced it. Pause at a later time.
13. **Starting Node inside a unit test.** Each `spawnSync` of a script costs about 0.9 s on a slow CI runner. `runtime.test.ts` started 13 and failed its 10 s limit on slow runners (two of the four pushes after it grew to 13). Export the logic and call it in the test process (`scripts/runtime-modules.mjs`), and keep one real start to prove the command line's exit status and message.

## Rules for new tests

- **Put coverage at the cheapest level that proves it:**
  - pure logic in unit tests;
  - browser APIs (IndexedDB, Web Locks, CompressionStream) in the browser self-tests;
  - UI wiring and user flows in e2e.
- **Keep every e2e test independent.** No ordering or shared state between tests or files. `fullyParallel` and sharding depend on it.
- **Keep tests lean.** Shard time is the sum of its tests and no shard can finish before its heaviest test, so cut real work and round trips. After adding a test over about 20 s, refresh `app/test/e2e/durations.json` once it has passed in CI (see How sharding actually splits the work).
- **Register a new spec in `app/playwright.config.ts` `testMatch`**, or it never runs (it is silently skipped). Then, if its name does not reveal its area, add it to AGENTS.md "Testing".
- **Stay offline.** Route `https://*.pixellab.ai/**` to fixtures or `abort()`, and keep the existing "no paid request" assertions.
- **When the task is about timing or flakiness,** repeat the tests you changed before merging: `npm run e2e -- <spec> -g "<title>" --repeat-each=10`, and once in CI mode: `CI=1 npm run e2e -- <spec> --workers=1`. The run holds the machine's one e2e slot, so keep it to the tests you changed.
- **Prove a timing or guard test can fail.** Temporarily break the app code it guards, confirm the test fails, then restore the file exactly.
- **Runs are queued, and a run with its own port still builds separately.** Ordinary runs wait for each other (Workstation load, above) and share `dist/` and `test-results/` in turn. With `E2E_PREVIEW_PORT` set, `npm run e2e` (app/scripts/e2e.mjs) sets `E2E_DIST_DIR=dist-e2e-<port>`, builds into `app/dist-e2e-<port>/`, previews that folder and deletes it when the run ends. Only that wrapper sets `E2E_DIST_DIR` (app/dist-dir.ts rejects other names), so no CI variable can redirect the Pages build away from `dist/`. A shared `dist/` rebuilt by another agent's run replaced hashed chunks under a running preview server, so a lazy import 404'd and its "Part of PixelDoll could not load" toast covered dialogs: the intermittent failure of "setup and move drafts survive canceled connection" (2026-11-11).

## Open options, measured or modeled but not done

- **End-to-end tests that repeat unit coverage** (audit of 2026-11-12; seconds are CI test time):
  - Done: the Preview facing lineup ran 11 rigs through 9 sizes (71 s); five rigs remain and the dropped custom sets joined the unit invariants in `facing-lineup.test.ts` (saves about 37 s).
  - Done: `scene-zoom.spec.ts` ran every camera check on both plates at ten sizes (eight tests, 190 s). Both plates share one pixel size and one camera, and their placement is a unit matrix for both themes at every one of those sizes (`experience-zoom.test.ts`), so the dark plate keeps all ten sizes and the light plate runs three: the smallest phone and the two most extreme shapes (two tests, 40 s in CI against 98 s for the four they replace).
  - Left alone, because each saves under 10 s and would cost real coverage or clearer failures: `creator-request-matrix.spec.ts` (52 s; its remaining loops post a few values per control), the ten "creator fits" viewport tests (2 s each), `dialog-dismissal.ts` at 320x568 (7 s) and "refuses a stale rig review" (2 s).
- **Running part of `studio.spec.ts`.** It holds 60 tests (271 s). Playwright tags (`{ tag: '@repair' }`, selected with `--grep @repair`) would give each area a 20 to 60 s subset without renaming tests or moving them; check first that tags do not change the titles `scripts/e2e-shard.mjs update` parses.
- **Setup per shard is about 20–25 s.** Browser caching saves about 3–6 s and Playwright advises against it.
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
npm run e2e -- --all                               # full suite, local workers (waits for any other run)
git push origin HEAD:refs/heads/try/<name>         # full suite in CI on any branch; read it with gh run list --branch try/<name>
npm run e2e -- <spec>                              # targeted
node scripts/e2e-shard.mjs 3/16 $TEMP/shard.txt && CI=1 npm run e2e -- --test-list $TEMP/shard.txt   # one CI shard (1 worker, 5 s expect, 1 retry)
gh run view <run-id> --json createdAt,updatedAt,jobs
gh run view <run-id> --log                         # per-test durations from the list reporter
```

### Where a slow test spends its time

Record a trace (`npm run e2e -- <spec>:<line> --workers=1 --trace=on`; plain `npx playwright test` is refused on a workstation, because it would skip the build and the queue), then sum action time per spec line. Save this as a scratch file outside the repo and run `node prof.mjs test-results/<test-dir>/trace.zip`:

```js
// prof.mjs: sum traced Playwright action time per spec line (needs `unzip` on PATH, e.g. Git Bash).
import { execSync } from 'node:child_process'
const text = execSync(`unzip -p "${process.argv[2]}" test.trace`, { maxBuffer: 1 << 28 }).toString()
const begin = new Map(), byLine = new Map()
for (const l of text.split('\n')) { if (!l) continue; const e = JSON.parse(l)
  if (e.type === 'before') begin.set(e.callId, e)
  if (e.type === 'after') { const b = begin.get(e.callId); const f = b && !b.parentId && (b.stack || []).find((s) => /\.spec\.ts$/.test(s.file))
    if (f) byLine.set(f.line, (byLine.get(f.line) || 0) + e.endTime - b.startTime) } }
for (const [line, ms] of [...byLine].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(String(line).padStart(5), (ms / 1000).toFixed(2) + 's')
```

One line dominating while waiting on app output (the 256 px creator waits about 17 s at its "Start dressing up" assertion) means the cost is app work: cutting it costs coverage. Time spread across many small actions (`boundingBox`, `getAttribute` in loops) means round trips that one `evaluate` can replace.

### Which shard is slow

`gh run view <run-id> --log | grep -F "passed ("` prints each shard's test time, and `gh run view <run-id> --json jobs` gives each job's wall time. Each job's "e2e-shard" step prints its planned seconds and every shard's plan. A shard far above its plan points at a test that got slower than its recorded duration: read that shard's `✓` lines, then fix the test or refresh the durations.

### Benchmarking a shard layout

Push the workflow change to a throwaway branch: branch runs test but never deploy. A newer push to that branch cancels the running one, so wait for each run to finish. Rerun each layout once with `gh run rerun <run-id>` and compare both attempts: one flaky retry costs over a minute. Measure from the first job's start to the last e2e job's end with `gh api repos/Shilo/PixelDoll/actions/runs/<id>/attempts/<n>/jobs`. Delete the branch afterwards with `git push origin --delete <branch>`.

Compare against a baseline from the same machine at the same time. The owner's workstation varies by ±30% depending on other load (one round of parallel runs here once took 4× longer for no reproducible reason), and the required runtime is Node 24.22.1 (`.nvmrc`).
