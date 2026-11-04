# Windows eight-worker cold-start stress, November 4, 2026

Three fresh isolated cohorts passed **90/90 cases**, with eight workers, zero retries, and the original headless-shell browser and screenshot tracing. No application behavior, test assertion, or deadline was changed. The corrective action was to establish an exclusive testing window and provide a repeatable stress profile, rather than adopt the initially suspected recorder or browser workaround.

## Workload and environment

`app/playwright.stress.config.ts` extends the ordinary Playwright configuration. It runs the existing manual acceptance, automatic acceptance, and Export keyboard cases ten times each: 30 cases, eight workers, zero retries. Browser selection, test deadlines, assertions, fixtures, viewports, screenshots, DOM tracing, and source capture stay inherited. Ordinary local tests and CI are unchanged. The new profile is included in TypeScript checking.

The tests exercise real saved-character persistence and acceptance publication, held transaction boundaries, worn-draft composition, GIF/PNG pixels, clipboard/native-share output, and keyboard navigation. PixelLab access stays blocked by their existing offline setup. No generations or dependency installations were needed.

Runs used Windows, an i7-13700K with 32 GB RAM, Node 24.22.1, npm 11.19.1, Playwright 1.64.1, and Chromium 156.0.8078.4. Full Chromium and headless shell are both revision 1248. Playwright documents the separate executables and the [`chromium` channel for new headless mode](https://playwright.dev/docs/browsers#chromium-new-headless-mode).

Cold start here means fresh preview/dev server processes, fresh browser processes and isolated browser contexts, with no application or module prewarming. OS filesystem caches and Vite's persistent dependency cache were not purged. Unique ports and output directories prevented server reuse and artifact collisions.

## Isolated qualification

After the import agent finished its full suite and focused follow-up, it explicitly released a quiet window and made no further source edits or heavy test runs. Each stress command checked for competing Playwright, Vitest, or type-checking processes before starting. A native process snapshot during the first cohort showed only its runner and eight workers. The application source remained stable while the import agent recorded its commits, ending at `01dd352f`.

| Cohort | Browser and recording | Result | Duration | Evidence suffix |
| --- | --- | ---: | ---: | --- |
| 1 | Original headless shell, ordinary screenshot tracing | 30/30 | 59.4 s | `isolated-shell-1` |
| 2 | Final stress profile, ordinary screenshot tracing | 30/30 | 22.1 s | `isolated-shell-2` |
| 3 | Final stress profile, all screenshot traces retained | 30/30 | 26.4 s | `isolated-shell-3` |

All three commands exited successfully with no unexpected, flaky, or skipped cases. They were independent cohorts, not failed-test retries. The third retained 30 traces; an inspected acceptance trace contained 174 screencast frames, 149 DOM snapshots, and two TypeScript source files. Screenshot capture was not disabled to obtain these results.

Each evidence suffix identifies `.runtime.tmp/windows-cold-<suffix>.log` and `.json`, plus `app/test-results-windows-cold-<suffix>/`. Process snapshots are also retained locally under the same ignored prefix. The successful isolated runs close the requested workload qualification; they do not erase the earlier diagnostic failures or establish that every historical timeout had one cause.

## Investigation

The old headless-shell failures were reproduced, including the earlier missing Export dialog and first-cohort acceptance timeouts. They were not all fixture stalls: one DOM-only failure had a fixture evaluation of about 6.5 seconds, multiple later slow actions, about 48 seconds of context teardown, and 15 to 21 seconds of browser cleanup. No application deadlock was demonstrated.

Turning off recording initially passed. Preserving DOM traces while disabling screenshots also initially passed, but a later identical DOM-only workload failed. Therefore screenshot recording alone was not a sufficient diagnosis or fix, and the final profile retains screenshots.

Full Chromium then passed the same 30-case workload with ordinary screenshot tracing. A subsequent headless-shell control failed again, followed by another full-Chromium pass. However, a third full-Chromium cohort failed 3 of 30 cases while a process inventory demonstrated a concurrent four-worker suite from another chat. Its owner confirmed the overlap: together the runs were asking for twelve workers. Therefore browser mode alone was not a sufficient diagnosis either. No browser override survived into the final profile.

The earlier comparisons did not establish complete machine isolation and remain diagnostic evidence. No specific operating-system, GPU, Chromium scheduling, or application deadlock defect is claimed, and no speculative rendering or storage change was made. The confirmed overlap was removed before the original browser was qualified in isolation.

| Native browser / recording | Cases passed | Duration | Local evidence suffix |
| --- | ---: | ---: | --- |
| Headless shell, ordinary tracing, acceptance | 12/20 | 167.8 s | `native` |
| Headless shell, tracing off, acceptance | 20/20 | 48.6 s | `no-trace` |
| Headless shell, DOM-only tracing, acceptance | 20/20 | 17.2 s | `no-screenshots` |
| Headless shell, ordinary tracing, keyboard | 9/10 | 86.1 s | `keyboard-baseline` |
| Headless shell, all screenshot traces, mixed cases | 24/30 | 155.2 s | `round1` |
| Headless shell, all DOM-only traces, mixed cases | 30/30 | 197.7 s | `round2` |
| Headless shell, repeated all DOM-only traces | 24/30 | 304.9 s | `round4` |
| Full Chromium, ordinary tracing, mixed cases | 30/30 | 29.8 s | `full-chromium` |
| Headless shell, ordinary tracing after Chromium pass | 22/30 | 140.0 s | `shell-control` |
| Full Chromium, all screenshot traces | 30/30 | 57.9 s | `qualified-2` |
| Full Chromium, demonstrated overlap with four other workers | 27/30 | 160.2 s | `qualified-3` |

Each table suffix uses the same evidence paths described above. The failed controls remain failures, not passing reruns. Initial sandbox attempts could not find the browser or complete downloads; those environment failures are excluded, and subsequent native runs used the installed browser outside the sandbox. A prematurely started second build was stopped before its browser workload and is also excluded from qualification.

## Other validation

Final checks on Node 24.22.1 and npm 11.19.1 passed: `npm run check` reported zero errors and warnings, and `npm test` passed all 146 files with 1,717 passed tests and one existing skip. Build and distribution checks passed with the stress commands. Logs are `.runtime.tmp/windows-cold-final-check.log` and `.runtime.tmp/windows-cold-final-unit.log`.

The coordinated import agent also completed the normal full browser suite at the same application source: 220/220 passed, followed by its strengthened Inspect-menu regression. Those results are recorded in [the import verification report](character-import-2026-11-04.md). They are reused here rather than represented as another full-suite run by this chat; this follow-up changes only the optional stress profile, its type-check inclusion, and documentation.

## Reproduce

Select Node 24.22.1 and npm 11.19.1, reuse the installed Playwright browser, and run from `app/` in a native Windows shell:

```powershell
$env:E2E_PREVIEW_PORT = '6379'
$env:E2E_DEV_PORT = '6378'
$env:TEST_OUTPUT_DIR = 'test-results-windows-stress-1'
Remove-Item Env:PLAYWRIGHT_CHANNEL -ErrorAction SilentlyContinue
npm run e2e -- --config=playwright.stress.config.ts
```

Expect exactly 30 cases and eight workers. Arrange a quiet window with other agents and verify that no other Playwright, Vitest, or type-checking run overlaps the cohort. Wait for the command to exit before starting another cohort. Use new port numbers and an unused `test-results*` directory for each repeat. The prefix keeps trace writes outside Vite's watcher. `--trace=on` retains screenshot traces for passing cases too; it does not reduce the assertions or alter the browser channel.

This qualification covers the original eight-worker Windows headless-shell workload in the documented quiet-window conditions. It does not promise a deadline under arbitrary unrelated machine load or purged OS caches. Normal CI continues to test its existing browser path and concurrency separately.

Refs: [stress follow-up card](https://github.com/users/Shilo/projects/7?pane=issue&itemId=293389883), [original Share report](share-review-2026-11-03.md), [test performance policy](test-performance.md).
