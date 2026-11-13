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

## First-iteration automated results

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

## Independent second iteration

The first implementation was committed as `14fa4814`. A new Sol medium delegate independently
retraced the entire application/runtime/export boundary and implemented three reproducible fixes:

- Phaser now accepts an outfit object or exported ID in `applyPreset`. An unknown ID throws without
  changing equipment or palettes, matching the other live controllers' ID-based contract.
- GDevelop's controller embeds and executes the canonical JavaScript for equipment, cover selection,
  ordering, palettes and timeline sampling, rather than maintaining those rules independently.
- Aseprite uses canonical palette selection as well as canonical pixel application.

A separate Flash low adversarial review challenged the resulting implementation. Its differential
GDevelop harness reported 509 scenarios with no old/new behavior differences. The coordinator accepted
the missing verification and regression-test findings, then added stronger preset state/atomicity
assertions, a palette mutation control and actual GDevelop execution after canonical regeneration.
The generator now rejects imports, export lists and default exports that would make native-event
embedding unsafe. Regression tests edit a copied canonical module, prove the stale-source guard
fails, regenerate with the real script, and execute the changed internal, Phaser and GDevelop paths.

These fixes were committed as `9d58c764`, then current main was integrated cleanly as `6d4ec497`
(upstream `65bd8976`) before the final checks. The narrowly scoped AGENTS.md pointer is intentional:
agents must read the architecture and synchronization workflow before editing shared paper-doll
behavior, without duplicating that contract in agent instructions.

Source synchronization is explicit, not a dev-server watcher. Format canonical changes and run
`npm run runtime:sync`; the production prebuild rejects stale transport/types. Godot and Unity remain
native-language implementations requiring conformance tests. Generic PNG/JSON, Aseprite and RPG Maker
are asset formats with their documented timing/layout policies, not interchangeable live controllers.
This does not claim arbitrary host-edited manifests or future engine versions have been verified.

### Integrated verification

Runs use Node 24.22.1 and dedicated test output/port pairs. No paid requests were made.

| Check                                   | Result                                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                         | Passed again after the native-harness change; zero Svelte errors/warnings, TypeScript and formatting clean.                                                                                                                           |
| Full units with `GODOT_BIN` set         | 181 files and 2,283 tests passed, zero skips. The final two-worker repeat also passed all assertions, with fork-termination warnings during host memory pressure.                                                                     |
| First integrated full E2E, four workers | 304 passed, five failed in 18.3 minutes. Original traces and UI ZIPs remain in `app/test-results-runtime-iteration2/`.                                                                                                                |
| Isolated E2E rerun, one worker          | All five failures passed unchanged in 1.3 minutes: crash recovery, browser-restart export preferences, incomplete PWA release recovery, full Studio workflow and item long-press/export. No assertion or timeout was weakened.        |
| Native Phaser matrix                    | 72 cases passed: 24 positive runs and 48 detected negative controls, across 3.80.1, 3.90.0 and 4.1.0 in Canvas/WebGL. Compared 2,484 frames and 16,736,256 pixels with the same exact/alpha-rounding contract as the first iteration. |
| Native GDevelop 5.6.285                 | Fresh official editor-core import, official HTML export and shipped GDJS/PIXI execution passed timing, origins, masks, depth, palettes, independent dolls, stop, unequip and destruction checks.                                      |
| Native Godot and Aseprite               | Passed through the full unit run, including the enabled Godot 4.7.2 executable and installed Aseprite batch equivalence checks.                                                                                                       |
| Native Unity 6000.4.0f1                 | Fresh UI Unity ZIP plus timing/render fixtures passed 4,486 Editor Play Mode checks, 15 duration-contract probes, 648 Gamma GPU checks and 648 Linear GPU checks. The optional standalone-player build was not run.                   |

The first Unity harness attempt did not reach compilation: without `ProjectVersion.txt`, the Editor
expanded the minimal verification project's package list to unrelated defaults and stalled resolving
them. Only that invocation's verified Editor and package-manager processes were stopped. The harness now reads the installed
Editor version with `-version` and writes project-version metadata before opening the isolated project.
The new fresh project retained its five required packages and completed all native assertions. This
changes test-project setup, not the exported C# implementation or application dependencies.

Local evidence:

- `app/test-results-runtime-evidence/phaser-iteration2.json`: exact bundle/archive hashes and all
  positive/negative-control results, using fresh UI downloads from this iteration.
- `app/node_modules/.cache/gdevelop-native-verification/`: official export, `result.json` and preview.
- `app/node_modules/.cache/unity-export-review/shared-runtime-iteration2-versioned/`: source archive
  identities, native results, 15 duration samples, both GPU reports and Editor logs.

The fresh full-demo Phaser ZIP is
`73877aadd7f9e776b5e172e58181f77f53e4a06e432d9d08859d314d1e5fa8f0` (SHA-256); the global-playback
Phaser ZIP is `be6b5cab8b90a8e0913334e35d0f6087fe032e5a80d87f7644b7e06e0ed7fcab`, and the actual UI
Unity ZIP is `b27a36436ebd2af7e514a8ece600fab2ba25673a215b72ed550a028289e71747`.

### Final low-worker and merged checks

Main's generation-tile fix (`4a28fe27`) was integrated as `27a0a72e`. On that tree,
`npm run check` passed and all 2,283 unit tests passed with Godot enabled and two workers, without
the earlier fork-termination warnings. A fresh full E2E run then passed **310 of 310 tests** in
11.4 minutes with two workers and no retries. Its traces and UI ZIPs remain separate in
`app/test-results-runtime-final-low-usage/`; no earlier failed-run evidence was overwritten.

Before publication, main's wardrobe-scroll fix (`c44a92b4`) was integrated cleanly as `70ce5efe`.
It changed no runtime, export or schema source. On that merged tree, `npm run check` and all
2,283 unit tests passed again, followed by all **102 Studio and character E2E tests** in 3.2 minutes
with two workers. This rerun covers the new upstream loading/reopening behavior and equipment,
recolor, drafts, review, storage and export interactions. It is targeted merged-state coverage, not
a claim that the earlier 310-test run included the later upstream commit. Production builds,
canonical-source synchronization and distribution guards passed in both E2E invocations.

A fresh keyless T3 preview session at localhost:5228 loaded the character-selection page. Read-only
page evaluation confirmed the Adventurer demo, its customization controls and four canvas elements.
However, both snapshot attempts returned `Preview automation snapshot timed out after 15000ms`,
and clicking Customize also timed out without changing the observed page. The tab and owned dev
server were closed. This is not a successful manual dressing or visual-regression verification;
the application workflow evidence above comes from Playwright and native-engine automation.
No live PixelLab generation was needed or performed.

## Sol and Opus follow-up challenge

Two new independent reviews used GPT-6.1 Sol medium and Claude Opus 5.5 medium against main
`00ade519`. Both received the original goal: genuinely execute one canonical paper-doll implementation
inside PixelDoll and JavaScript exports, not merely ship matching source text or rename old helpers.
Their briefs also required distinguishing appropriate engine/UI policy from avoidable behavior forks.

The coordinator independently reproduced and accepted these findings:

- Sol found item-only thumbnails and inspector previews sorting background before foreground instead
  of honoring canonical depth and cell overrides. An overlapping split item rendered red in `itemCell`
  but blue in canonical composition when its foreground depth moved below its background. The new
  regression failed before the fix. Item-only previews now call canonical `composeCell` on a scoped
  one-item project view, retaining union geometry and owner-local image identities.
- Opus found Phaser using sprite-creation order for depth ties and Aseprite copying the canonical
  comparator and visibility assembly. Present-day ties matched, so this was forward-change drift,
  not a claim of already incorrect ordinary Phaser pixels. The coordinator independently reversed
  canonical slot ties: the compositor changed from base/A/Z to base/Z/A, while Phaser and Aseprite
  stayed base/A/Z. A copied-source regression reproduced this failure before the fixes.
- `compareDraws` now owns the ordering in canonical `drawList` and Aseprite's complete editable
  layer stack, including hidden layers and per-frame depth exceptions. Aseprite visibility comes
  from canonical `drawList`. Phaser and GDevelop assign renderer order from that list, without a
  second sort. The copied-source mutation now verifies actual compositor pixels, Phaser sprite
  order, GDevelop z ranks and decoded Aseprite cel order together. A separate visibility mutation
  verifies that Aseprite consumes canonical draw decisions.
- Opus's optional embedding concern was valid as a narrow forward-safety issue: a string/comment
  line beginning with `export ` would be changed by GDevelop's stripping regex. Synchronization now
  verifies those prefixes against parsed top-level export modifiers. Regression cases reject
  misleading string/comment prefixes and indented declarations, rather than silently corrupting
  emitted code. This adds no runtime parser, dependency or second implementation.

All three behavioral gaps predated the original extraction. They were missed integration paths,
not regressions introduced by moving the core. Sol described Aseprite's comparator as optional
maintenance; Opus's executable mutation and the user's forward-change requirement justify fixing it.
The existing Phaser test now checks the same expected sprite identities instead of `pdOrder` numbers:
those numbers are deliberately current draw ranks, no longer permanent creation indices.

The coordinator did not broaden this into new caching, viewport fitting or authoring abstractions.
Fitting already calls canonical equipment/visibility primitives and intentionally unions stored poses;
it is not a second rendered compositor. Procedural palette generation, draft-coverage diagnostics and
export mask preparation remain authoring policies with existing parity tests. No additional visible
defect was demonstrated for those suggestions. Preview looping and hand-conflict interaction policy
remain the documented distinctions, and native-language adapters still require conformance testing.

### Follow-up verification and baseline control

The initial follow-up `npm run check` passed, followed by 183 unit files and 2,334 passing tests
with Godot enabled. The first two-worker full E2E run had 324 passes and one PWA second-tab startup
timeout in 9.2 minutes. A three-repeat serial run of that unchanged PWA test had two passes and one
later release-activation timeout. Neither assertion nor timeout was changed.

To challenge attribution, an unmodified `git archive` of `00ade519` was built in a temporary copy
with the existing dependencies linked and read-only Git metadata supplied to the build. The same
PWA test ran five times serially: three passed and two failed at the same later release-activation
assertion. That failure therefore also exists without these runtime fixes. This does not prove
that every observed startup timeout shares that cause, and no PWA fix is claimed here. The original
full-run evidence remains in `app/test-results-runtime-sol-opus/`, the repeats in
`app/test-results-runtime-sol-opus-pwa-rerun/`, and the baseline traces in the temporary baseline's
`app/test-results-pwa-baseline/` directory. The failed initial baseline setup attempts did not run
tests: Node refused TypeScript under `node_modules`, then the temporary build needed Git metadata.

Implementation and review rationale were committed as `bf5acc9c`. Main's subsequent zoom changes
were integrated as `2005ff24` before the final verification. On that integrated state,
`npm run check` passed and all 183 unit files and 2,337 tests passed with Godot enabled and two workers.
The final full E2E run then passed **327 of 327 tests** in 9.9 minutes with two workers and no
retries, including the previously intermittent PWA test. Its independent output directory is
`app/test-results-runtime-sol-opus-final/`. Production source-sync and distribution guards also
passed. The earlier failures and baseline control are retained rather than replaced by this green run.

Fresh native Phaser verification then passed all 72 cases: 24 positive executions and 48 detected
negative controls across Phaser 3.80.1, 3.90.0 and 4.1.0 in Canvas and WebGL, using both generated
fixtures and the final run's actual UI ZIPs. It compared 2,484 frames and 16,736,256 pixels under
the existing exact/partial-alpha contract. The report is
`app/test-results-runtime-evidence/phaser-sol-opus.json`. The full-demo UI ZIP SHA-256 is
`11be94a6453264a00103c3aac7a0d6c148020201406ae8dca9d7df912c55dfe2`; the global-settings UI ZIP is
`276b351b564d36a2b8ab2b035ad27e238f144c1b63444a39d706aa742bafa620`.

Fresh GDevelop 5.6.285 verification passed the official editor-core import, official HTML export
and shipped GDJS/PIXI rendering checks for timing, pivots, masks, depth, palettes, independent dolls,
stopping, unequipping and destruction. Evidence is in
`app/node_modules/.cache/gdevelop-native-verification/`; the previous output was copied to its
`-pre-sol-opus` sibling before this run. Native Aseprite equivalence and enabled Godot checks passed
in the full unit run. Unity's adapter was not changed; no fresh Unity Editor or standalone-player
run is claimed in this follow-up. No manual preview session or paid PixelLab call was needed.
