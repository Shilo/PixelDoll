# Phaser playback validation, October 28, 2026

## Root cause and correction

The exporter treated `frames[].duration` as an addition to Phaser's base interval. Released Phaser 3.80.1, 3.90.0, and 4.1.0 instead use a nonzero frame duration as the complete interval. The prior exporter turned an 80/180/100 ms playlist into 80/100/20 ms. A real-runtime probe confirmed the middle frame had already advanced at 181 ms, although it should remain until 260 ms.

The exporter now supplies each full duration and the sum of the playlist durations as the animation's `duration`. Phaser derives its fallback frame rate, while the per-frame durations govern actual playback. The native animation's duration metadata also agrees with the intended total.

This follows the tagged implementations of `Animation#getFirstTick`, `getNextTick`, and `calculateDuration`, rather than the contradictory additive-duration explanation in the general concepts page:

- [Phaser 3.80.1 Animation source](https://github.com/phaserjs/phaser/blob/v3.80.1/src/animations/Animation.js)
- [Phaser 3.90.0 Animation source](https://github.com/phaserjs/phaser/blob/v3.90.0/src/animations/Animation.js)
- [Phaser 4.1.0 Animation source](https://github.com/phaserjs/phaser/blob/v4.1.0/src/animations/Animation.js)
- [General animation documentation](https://docs.phaser.io/phaser/concepts/animations)

The earlier verifier inspected `base interval + frame.duration` instead of actual later transitions, so it reproduced the exporter's incorrect assumption. Its single 79/81 ms transition check did not exercise the broken middle hold. Unit and UI adapter checks now use the released override semantics, while the native verifier advances the actual Phaser animation state through each boundary.

## Reproduction

From `app/`, using an installed Node 24 runtime:

```powershell
node --experimental-transform-types scripts/verify-phaser-export.mjs `
  --zip test-results-integration-full/export-picker-actual-UI-ZI-9cad5-ix-engine-and-asset-formats-studio/phaser.pixeldoll.zip
```

`--zip` may be repeated. `--versions`, `--vendor-dir`, and `--output` override the default releases, ignored cache, and JSON report. `PLAYWRIGHT_BROWSERS_PATH` can select an existing managed Chromium installation.

The script downloads missing pinned bundles from the official `phaserjs/phaser` release tags into `app/node_modules/.cache/export-review-phaser`. It adds no application dependencies and makes no PixelLab calls. Browser requests are fulfilled from each export archive, with other origins blocked. The report records bundle source URLs and SHA-256 hashes, archive hashes, renderer IDs, and individual results.

## Coverage and test design

The generated pipeline fixture applies global Export preferences to a clone whose archived loop flags deliberately contradict both selections. Its 80/180/100 ms playlist includes an adjacent repeated source cell. Body and oversized equipment layers retain palette defaults and a second outfit. The actual UI ZIP uses another uneven, repeated-cell playlist and reaches the same runtime through the delivered manifest, atlas, PNG, and JavaScript files.

For each release, Canvas and WebGL execute real Phaser code. A paused Scene prevents wall-clock progression while the verifier advances the native animation state in 1 ms steps. Assertions inspect playlist positions and source-frame names immediately before, at, and after boundaries across three cycles, loop/completion events, terminal holds, same-animation restarts, and visible layer synchronization. Synthetic-fixture checks also retain the original default/continued/selected palette assertions and exact pivots, native bounds, re-equipping, and rendered body/equipment marker pixels.

Three in-memory negative controls deliberately restore the old timing calculation, disable looping, or remove layer-update synchronization. They must fail the specific native clock or synchronization assertion. The old-timing control bypasses only its already-known total-duration metadata failure so it must reach and fail the actual timeline oracle. No application source is changed by these controls.

Pixel sampling uses a 1-by-1 `snapshotArea`, preserving exact coordinates in both renderer families. Phaser 3.90's [single-pixel WebGL helper](https://github.com/phaserjs/phaser/blob/v3.90.0/src/renderer/snapshot/WebGLSnapshot.js) reads `bufferHeight - y`, one row above its rectangular helper's `bufferHeight - y - height` when `height` is 1. Phaser 4.1 [corrects the single-pixel expression](https://github.com/phaserjs/phaser/blob/v4.1.0/src/renderer/snapshot/WebGLSnapshot.js). The original one-pixel test marker exposed this harness issue; expected image colors were not changed to accommodate it.

## Results

Final Windows execution used installed Node 24.20.0, Playwright 1.64.1, and its managed Chromium. The repository-pinned Node 24.22.1 was unavailable locally; CI remains the exact-toolchain check.

| Released runtime | Canvas | WebGL | Deliberate failures detected |
| --- | --- | --- | --- |
| Phaser 3.80.1 | Pipeline and UI ZIP passed | Pipeline and UI ZIP passed | Old timing, repeat disabled, layer updates disabled, in both renderers |
| Phaser 3.90.0 | Pipeline and UI ZIP passed | Pipeline and UI ZIP passed | Same six controls |
| Phaser 4.1.0 | Pipeline and UI ZIP passed | Pipeline and UI ZIP passed | Same six controls |

All **12 positive native runs** passed with no page errors. All **18 negative controls** failed at the intended real clock or synchronization assertion, giving **30 successful verification cases and zero unexpected failures**. The old timing control fails at 259 ms, the disabled-repeat control at 360 ms, and the missing layer-update control at 80 ms. Native animation duration is 360 ms, and looping versus terminal-frame hold and restart behavior matches the global preferences.

The real UI archive came from the final browser test's all-format download flow, with an 80/180/100 ms repeated-cell playlist. Its SHA-256 is `d95f53a822bbace69996083e5ddab60cf527d20f292ff76668a45110c01b6612`. This is fresh post-fix output, not the earlier 100/100 ms archive that could conceal the subtraction bug.

Ignored local evidence:

- `app/node_modules/.cache/export-review-phaser/final-results.json`: per-case results, exact archive hashes, official source URLs, bundle hashes, palette/render samples, and native event counts.
- `app/node_modules/.cache/export-review-phaser/final-run.log`: completed matrix, exit code 0.
- `app/test-results-integration-full/export-picker-actual-UI-ZI-9cad5-ix-engine-and-asset-formats-studio/phaser.pixeldoll.zip`: actual UI download.
- `app/node_modules/.cache/export-review-phaser/pipeline-fixture.pixeldoll.zip`: separate multi-layer pipeline fixture.

The focused existing Phaser unit suite passed **9 tests**, including nonuniform/equal/shorter-duration cases, repeated cells, unsupported views, source-sheet loading, folder identity, palette ownership, and loading errors. External browser engines, mobile GPUs, user changes to native frame-rate properties, and complete third-party game deployments were not exercised. No PixelLab generations, dependency changes, installs, activation, or account changes were required.
