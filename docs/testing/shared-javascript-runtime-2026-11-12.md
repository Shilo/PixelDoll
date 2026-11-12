# Shared JavaScript runtime verification, 2026-11-12

Scope: make the application consume the same engine-neutral JavaScript paper-doll source delivered
in Phaser exports. No Phaser renderer was embedded in Studio. See the
[architecture and API](../architecture/javascript-runtime.md) for the boundary and maintenance commands.

## Source and consumer contract

- Internal composition, masking, equipment visibility, layer ordering, pivot geometry, mirroring,
  palette selection/application and live timeline sampling use `app/src/lib/runtime/*.js`.
- The delivered `phaser/PaperdollContainer.js` contains those canonical source bytes verbatim and calls
  them from its Phaser adapter. Internal TypeScript entry points are adapters or re-exports.
- Unit tests compare source identity, actual executable imports and internal function identity.
  The new application E2E test downloads a real UI Phaser ZIP and checks its runtime and type bytes.
- An isolated TypeScript consumer checks the delivered JavaScript with only its adjacent generated
  `types.d.ts`, not the repository's source tree. This caught and fixed the Sol review's packaging
  finding: colliding JSDoc aliases and unavailable repository-relative type imports after concatenation.
- Independent pixel and timing golden tests cover source-over alpha, owner-isolated shared hashes,
  mirrored cells, unchanged source assets, cache identity and timeline boundaries/terminal holds.
  Existing equipment, mask, color, geometry, export and presentation suites continue exercising the
  canonical functions through their former application entry points.

## Final automated results

Primary runs use Node 24.22.1. No dependency or test configuration was changed.

| Check                        | Result                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run check`              | Passed, including Svelte diagnostics, TypeScript and formatting.                                                   |
| `npm test -- --maxWorkers=4` | 178 files passed; 2,246 tests passed, 1 existing skip.                                                             |
| Full `node scripts/e2e.mjs`  | 301 passed in 7.7 minutes, including the new actual UI runtime export test.                                        |
| `npm run build`              | Passed with the production source-sync and distribution guards.                                                    |
| Native Phaser matrix         | 72 cases passed: 24 positive cases and 48 deliberate failure controls.                                             |
| Full native pixel oracle     | 2,484 playlist frames and 16,736,256 pixels satisfied the comparison across all three releases and both renderers. |

The full E2E suite covers dressing/unequipping, recolor/reset, outfits, undo/redo, save/reload, drafts,
missing and pending cells, review/repair, inspector pause/step and eight-direction fitting, live preview,
top-down/side-scroller behavior, thumbnails, share PNG/GIF, import, exports and browser self-tests.
Generation tests use offline mocks. No PixelLab balance call, paid request or generation was necessary.

Earlier overlapping validation runs encountered two 20-second unit timeouts and two E2E startup or
pixel-wait timeouts. The E2E failures passed unchanged on a targeted single-worker retry. The final
full E2E run passed without retries, and the final bounded-worker unit run passed. No assertions,
timeouts or test configuration were weakened to make these suites pass.

## Native engine matrix

`app/scripts/verify-phaser-export.mjs` downloads official pinned Phaser bundles, caches them locally
and runs the actual delivered ES module in Chromium. Versions: **3.80.1, 3.90.0 and 4.1.0**, each in
**Canvas and WebGL**. No fake scene is used in these native runs.

Inputs:

1. The settings-pipeline fixture: unequal 80/180/100 ms holds, repeated playlist cells, looping and
   once-only playback, source/default palette sheets, and a padded 96-pixel layer with its own pivot.
2. The adversarial fixture: eight directions with stored source views and mirrors, six outfits,
   hair tucking, body cuts, combined body-cover variants, two-layer cape, negative/cell/animation/
   direction z overrides, mutual hand hides, rectangular padded held equipment and partial alpha.
3. The full dressed demo ZIP downloaded through the application's Export sheet: four directions,
   two moves, multiple items and outfits, with combined outfit sheets.
4. The actual UI global-playback Phaser ZIP: no combined sheets, so it receives native clock and
   synchronization checks and reports its full-frame pixel oracle as not run.

Every included outfit, available move/direction and authored playlist entry is compared against its
combined sheet. Opaque and transparent RGB results must match exactly after compositing on magenta;
fractional-alpha channel rounding is allowed at most one unit. Pixel checks do not claim bit-identical
intermediate GPU alpha representations. The independent unit golden verifies straight-alpha math.

All eight negative controls must produce the appropriate clock, synchronization or pixel failure:
old duration calculation, disabled repeat, removed layer-update event, one-pixel pivot offset,
disabled shared cover selection, disabled hiding, disabled recolor and wrong mirrored-direction row.

Phaser Canvas's `roundPixels` camera mode expands sprites by half a pixel. The full-frame oracle uses
integer positions with `camera.setRoundPixels(false)` for Canvas and normal rounded positioning for
WebGL. This engine-specific requirement is documented in the exported README. The runtime does not
modify the host camera. The pixel workload has a 60-second harness deadline; simulated timeline
assertions retain exact authored boundaries and are not relaxed by this deadline.

Local ignored evidence: `app/test-results-runtime-evidence/phaser-final.json` contains bundle hashes,
archive hashes, individual results, frame/pixel counts, and detected negative-control failures.
The E2E output directory retains both UI downloads. Archive SHA-256 values:

| Archive                           | SHA-256                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| Settings pipeline                 | `0e3073d410f8e7cb947fbd56c95e05bd05804f0e24f309da844cda2de1a0e6cc` |
| Eight-direction masks/hands/alpha | `385d87f08b854db015404d83a03d3c78eb74a9617704195da1f4273d4d53323e` |
| Full demo UI Phaser ZIP           | `bb7fdc1a66374ef4da7a1e57565b8d0be5f4c9d4fd3e51b875061a2b1210a70e` |
| Global-playback UI Phaser ZIP     | `420d78a5a2fd7576dc9d2622bb369bc13b703a3717311215660c69c5c8719408` |

To reproduce, run the full E2E suite with a dedicated `TEST_OUTPUT_DIR`, find the two Phaser downloads,
then run from `app/`:

```powershell
node --experimental-transform-types scripts/verify-phaser-export.mjs `
  --zip <full-demo-ui-phaser-zip> --zip <global-playback-ui-phaser-zip> `
  --output test-results-runtime-evidence/phaser-final.json
```

## Manual browser and review limits

T3 preview tools exercised character selection, unequip/re-equip, facing and move selection, colors,
inspector opening/pause/step/closing, and switching top-down/side-scroller views against a production
build. Unsupported east-facing Cross punch correctly reported a still-frame fallback.

The T3 tab reported `document.visibilityState === 'hidden'`; snapshot calls timed out in the inspector,
share preparation waited on animation-frame scheduling, and a requested phone resize did not change
the reported viewport. These are limitations of this manual session, not proof of completed visual,
share-download or mobile inspection. The automated real-browser suites separately passed those
workflows. The temporary tab and servers were closed. No paid live generation was used as a substitute
for deterministic stored-frame checks.

Sol's architecture and adversarial reviews were completed; its valid portable-type finding was fixed
and regression-tested. Flash's architecture challenge was addressed by sharing engine-neutral
behavior rather than embedding the Phaser renderer. Flash's completed postimplementation review
correctly challenged a separate prepared-variant rule and an inactive-color sentinel in the public
palette map. The rule was removed, the swap-only public contract restored, and body-cut selection
through Phaser `sync()` plus inactive palette behavior regression-tested. Compositor input requirements
and the exported schema are now documented explicitly. Full-schema generation remains deliberate;
the isolated consumer check guards its portable type references.

Board access initially failed with `approval required by policy, but AskForApproval is set to Never`.
A final retry through the normal CLI succeeded. Tracking was reconciled with the existing
[dogfooding card](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=301924471),
rather than creating a duplicate.
