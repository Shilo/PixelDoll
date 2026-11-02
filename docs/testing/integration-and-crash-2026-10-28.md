# Coordinated integration and crash recovery, October 28, 2026

The user authorized coordination, preservation of concurrent work, combined testing, and a normal push to main. No PixelLab requests or credits were used for this validation.

## Integration

The motion-research owner committed its remaining root-checkout research as `4ae2caa8`. Local main then contained that commit and the garment/imported-pose fixes in `7c49772c`, while origin contained the reviewed export/recovery merge `43101089` and its import/tucked-hair fixes. Merge `417e4e77` combines both histories without rewriting either one.

The active `codex/motion-lab` and `codex/automatic-consistency` implementations remain in their owners' worktrees. They are not part of this integration. Their owners were notified that this chat was coordinating main integration and pushing.

## Crash coverage

`app/test/e2e/renderer-crash.spec.ts` kills the leader renderer through CDP and requires its surviving follower to reach needs-attention within 15 seconds, with a different lock owner, no pagehide cleanup, and no API requests. `app/test/e2e/crash-recovery.spec.ts` saves all three global Export preferences through the actual UI and seeds retained work in a dedicated profile. It terminates only that test-created browser, identified through its own CDP process information, then reopens the same profile and checks acknowledged preferences, absent pagehide cleanup, and recovery within 15 seconds. Their shared fixtures are in `retained-equipment.ts`; the existing close and pagehide cases remain in `shared-equipment.spec.ts`.

`app/test/unit/queue-resume.test.ts` separately checks the payment-sensitive boundary. A durable accepted remote job resumes GET polling without another POST. An interrupted HTTP submission without a durable receipt remains lost across repeated restarts and is not automatically resubmitted.

The retained browser fixture uses an unavailable target to prove takeover and the resulting needs-attention state. It does not claim to execute a real paid request across a crash. The queue tests cover accepted and uncertain submission states with a synthetic transport. These tests also do not simulate operating-system power loss or storage hardware failure.

## Related native verification

- [Phaser playback](phaser-playback-2026-10-28.md) records a reproduced frame-duration defect, its correction, and actual runtime checks.
- [Unity playback](unity-playback-2026-10-28.md) records the resolved activation prerequisite, native timing/replay fixes, Editor checks, and Windows standalone validation.

## Test environment

Initial local checks used Node 24.20.0 and npm 11.19.0 through a per-command PATH. Later inspection found an already available repository-local Node 24.22.1/npm 11.19.1 runtime under `.runtime.tmp/`; final crash stress and final combined checks use that exact pinned toolchain. This chat performed no runtime installation or global version switch. The Unity report separately records its native launcher's runtime and byte-identical archive generation under the pinned runtime.

The first sandboxed unit invocation could not import tests because Windows denied temporary-cache rename operations. Running the suite in the approved execution context resolved that environment restriction. The merged baseline then passed type checking and 1,009 unit tests, with one existing skip.

## Initial combined checks

- Fresh production build: passed, including the distribution guard.
- Final type checking: zero errors and warnings.
- Full unit suite after the Phaser correction and queue regressions: **1,012 passed**, one existing skip, across 104 files.
- Full browser suite against that fresh build: **155 passed**, four workers, retries disabled, in 7.3 minutes. This includes global preference persistence, all six UI-downloaded formats, always-looping in-app and Share playback, and the new crash case. The crash case itself passed in 6.6 seconds.
- Native Phaser verification: **12 positive runs passed** and **18 deliberate failure controls were detected** across three releases and both renderer families. See its report for the real-runtime timing defect and proof that the corrected exporter preserves the intended timeline.

The initial full run preceded test-only refinements: a single 15-second poll for the final recovery state replaces stacked polling windows, and the two native crash boundaries run independently. The original combined case exceeded its overall 90-second test budget in one of ten eight-worker stress repetitions even though actual crash recovery passed within 15 seconds. Combining two app tabs, Export UI writes, browser termination, and a persistent-profile restart compounded unrelated costs under load. Splitting those boundaries retains all assertions and adds retained-work recovery after a fresh browser restart; it does not increase timeouts or alter production recovery.

A separate diagnostic reproduced Windows retaining `chrome_debug.log` after the browser disconnected. Profile deletion now uses Node's bounded retry support for transient filesystem errors; cleanup still throws if the retries are exhausted.

## Native crash instrumentation

Browser disconnection is not proof that its process tree has exited. A controlled probe found renderer/network processes still alive after disconnection. The test terminates only its owned process tree, verifies its private POSIX process group before group termination, and waits for the recorded owned processes to exit before profile reuse. This is resource readiness, not an increase to the application's recovery timeout.

Initial live-recording controls exposed native Chromium quota/backing-store failures before test teardown. Eight untraced app-profile probes and eight DOM-snapshot-only probes passed; screenshots-only and combined recording reproduced the failure. Those early recorder probes saved preferences but omitted the retained-fit record, so they do not establish equivalence to the complete recovery scenario. File-lock diagnostics also found benign quota warnings in successful runs; warnings alone were not treated as the cause of a failure.

The two deliberate native-crash specs retain DOM snapshots, sources, network information, events, owned-process attachments and native phase steps, while disabling live screencast frames. Ordinary UI tests keep their original tracing. The persistent-profile case runs full Chromium's native profile implementation and honors an explicitly configured browser channel. CI installs both full Chromium and the headless shell; it does not require new system packages.

Moving these cases into their own specs also removes the unused default context created by the shared-equipment hook for a test that owns its persistent browser. The final mixed stress run recorded exactly 20 manual persistent-browser launches and 10 renderer-fixture launches for its 20 cases, with no additional unused browser launches.

The final mixed cohort passed **20/20 cases at eight workers with zero retries**, using the pinned runtime and unchanged 15-second recovery and 90-second test limits. Full Chromium alone, splitting the cases alone, and disabling recording only on the persistent case did not resolve all earlier mixed failures; those candidates were not accepted as complete fixes. No application database retry, silent reset, test skip, worker reduction, or relaxed assertion was introduced.

The final CI-shaped single-worker run passed **both cases without retries**. Additional raw controls then matched the retained-fit seed, browser, runtime, context options, pre-crash state, post-restart recovery and all three preferences: **8/8 passed with DOM tracing and 8/8 with full tracing**. Thus live recording is not an exclusive or deterministic cause, and the exact Chromium/recording interaction behind every historical failure is not established. Disabling live recording for deliberate process-failure tests is an instrumentation precaution supported by the final mixed stress result, not a claim that arbitrary browser/storage crashes are fully solved. DOM traces and native diagnostics remain available.

Key ignored evidence is under `app/test-results-crash-native-bench/`, including native process probes, recording comparisons, profile logs and the final `both-dom-run.log`. The passing mixed cohort is under `app/test-results-crash-both-dom-stress/`. Old failed artifacts are retained separately rather than overwritten or represented as passing reruns.

## Final combined validation

All final application and test source passed using **Node 24.22.1 and npm 11.19.1**:

- `npm run check`: zero errors and warnings.
- `npm test`: **1,012 passed**, one existing skip, across 104 files.
- `npm run e2e -- --workers=4 --retries=0`: fresh build and distribution guard, then **156 passed in 4.0 minutes**. Both final crash specs ran successfully alongside the ordinary suite.
- The final UI-downloaded Unity runtime and importer C# files, and the Phaser runtime JavaScript file, match their native-tested ZIP counterparts byte for byte. Metadata timestamps and version stamps do not substitute for adapter-source verification.
- Unity: **884 Editor assertions**, **700 Windows Mono player assertions**, and **15 native duration controls** passed. The report records the tested Editor, artifacts, runtime provenance and headless-rendering limits.
- Phaser: **12 positive native runs** and **18 intended failure controls** passed across three releases and both renderer families.

No extra Windows permission was required after the user signed into Unity Hub. The standalone harness exchanges results through local files; no firewall exception or administrator approval was needed for the completed tests. OS power loss, physical storage failure, and older Unity Editor versions were not certified.
