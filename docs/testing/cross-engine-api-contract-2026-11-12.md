# Cross-engine API contract audit, November 12, 2026

## Intent and review

Keep the application and delivered JavaScript runtimes on the same paper-doll implementation,
and keep the native engine ports consistent in behavior without forcing identical language APIs.
This is a new audit after the earlier [shared-runtime verification](shared-javascript-runtime-2026-11-12.md),
not a claim that its native results cover the changes below.

Independent Sol medium, Opus 5.5 medium and OpenCode Flash low reviews challenged the full API,
then cross-reviewed the fixes. The coordinator rejected forced uniform method names, a new
cross-language interpreter and native-port code generation as unnecessary. Existing native
harnesses plus a written behavior contract are the smaller maintainable boundary.

## Confirmed issues and corrections

- Repeated animation selection froze Phaser and GDevelop while Godot and Unity kept advancing.
  All four now preserve active progress, replay completed once-only clips and support explicit restart.
  Changing the move or direction starts at the beginning.
- Native invalid operations silently returned. Godot and Unity now report a warning and return
  `false` before changing state. JavaScript throws before mutation, an intentional language difference.
- Godot could not remove a color override without changing the outfit. Null now restores the default;
  an empty string retains source colors, consistently with the other controllers.
- JavaScript preset objects bypassed equipment validation, and accepted source presets could reference
  the wrong slot. Canonical `resolvePreset` and `validEquipment` now serve both JavaScript adapters
  and export validation. The frozen body, stale-item exclusion and copy isolation remain intentional.
- A regenerated transport could pass prebuild despite duplicate top-level module bindings that made
  the concatenated export invalid. Synchronization now rejects collisions before writing either output.
- Phaser atlas metadata pointed at a default-colored sheet rather than the source sheet loaded by
  the palette-aware runtime. Metadata and loading now resolve the same resource.
- Valid immutable IDs could generate Windows device paths. Shared path helpers escape resource
  paths without changing manifest IDs. Baked-path discovery is documented and tested from the
  exported manifest, and the native Phaser verifier uses the same helper as the exporter.
- The export boundary now rejects unsupported manifest formats and invalid saved equipment rather
  than shipping inconsistent native behavior. Tests distinguish missing references from known stale items.

The final Opus delta review caught that escaping baked filenames alone broke their documented
discovery convention. The corrected export README, format specification, verifier and manifest-based
regression now use the same rule. Opus approved that correction with no remaining defect.

## Durable maintenance boundary

The [runtime contract](../architecture/javascript-runtime.md) maps operations across all controllers,
records deliberate differences and names the required regression/native checks. `AGENTS.md` points
all paper-doll and engine-export changes at that contract. Canonical JavaScript is still under
`app/src/lib/runtime/`; generated transport is checked for staleness and name collisions.
Godot and Unity remain native ports that require their own updates and execution checks.

Asset-only targets intentionally differ: generic exports provide integration data, Aseprite preserves
editable layers for the first outfit, and RPG Maker resamples to its destination layout.

## Verification record

Production code settled on top of `9d8b45a0`. Pinned Node 24.22.1 was used, with one unit-test worker
and at most two E2E workers. No paid PixelLab requests, installs or credentials were needed.

The first final check stopped on formatting in `export.ts`; scoped formatting corrected it.
The subsequent `npm run check` passed, including Svelte diagnostics, all TypeScript projects and
application formatting. Under concurrent browser load and roughly 1.3 GB free physical memory,
the first final unit run exceeded existing timeouts in runtime synchronization and shared-refit tests.
Those failures must not be treated as green runs or hidden by relaxed assertions or timeouts.

After integrating main's `7c56b861` as `3f8d8701`, the full check passed again. The full unit run
passed 2,378 tests and timed out in one unrelated measurement-recovery case. Its unchanged file
then passed all 61 tests serially in 6.96 seconds. All 2,379 tests are covered across those runs,
including enabled native Godot 4.7.2 and Aseprite checks. The three earlier timeouts passed in
the integrated full run. There was no assertion change or timeout increase.

Fresh native verification on that integrated source passed:

| Engine                       | Result                                                                                                                                         | Local evidence                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Unity 6000.4.0f1             | Editor Play Mode 4,361 checks; Windows Mono player 3,580; GPU rendering 648 each in Editor, player and Linear color space                      | `app/node_modules/.cache/unity-export-review/run-7eZ09Z/`              |
| GDevelop 5.6.285             | Official editor-core import, official web export and shipped GDJS/PIXI checks, including repeated play, completion replay and explicit restart | `app/node_modules/.cache/gdevelop-native-verification/result.json`     |
| Phaser 3.80.1, 3.90.0, 4.1.0 | All 66 generated-fixture executions passed in Canvas and WebGL, including detected negative controls                                           | `app/node_modules/.cache/export-review-phaser/api-contract-final.json` |

The Unity harness's initial earlier attempt had a test-helper scope error, corrected before the
fresh runs above. These are actual native executions, not compilation-only or source-string claims.

A manual T3 browser check opened the integrated production build's demo, entered Customize,
opened Export, selected Phaser and downloaded the ready 382,756-byte ZIP. T3 snapshot and normal
click automation timed out; DOM-backed browser interaction completed the check. No screenshot
or visual-layout approval is claimed from that session. The browser download receipt confirmed
completion; automatic test ZIPs are retained for subsequent native verification.

The final full E2E suite passed **329 of 329 tests**, with two workers, no retries and no source
edits during the run (14.8 minutes). The build, runtime stale-source guard and distribution guard
passed. Output is retained under `app/test-results-api-contract-final/`.

The two fresh Phaser ZIPs produced by those browser tests then passed the real-engine verifier:
**78 executions**, comprising 24 positive runs and 54 detected negative controls across the three
pinned Phaser versions in Canvas and WebGL. The positive runs compared 2,484 frames and
16,736,256 pixels under the existing exact/partial-alpha contract. No pixel tolerance was relaxed.
The report is `app/node_modules/.cache/export-review-phaser/api-contract-final-ui.json`.

- Global-settings UI ZIP SHA-256: `9ca7bcd81a344be0fb70c8e243fe9a46505b7437da0b3bcb85c4322eb847d66a`.
- Full-demo UI ZIP SHA-256: `9c0c942d184fd0f91425dc7559e5258ce9845066e5409584334f787e53a80895`.

Native claims are limited to the named installed versions and generated validated exports.
No native RPG Maker application or additional Unity/Godot releases were run. Asset-only formats
retain their format-specific tests; native ports do not automatically inherit JavaScript edits.
All requested independent implementation reviews are complete, with no remaining confirmed defect.
