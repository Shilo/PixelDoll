# Moving-attack implementation report

Date: 2026-11-24
Status: implemented and revised after the hip-lock visual review. The updated gate has passed local checks.
Commits: `2cfc0b63` (feature), `c2d8f504` (fix plan), `23281e1af` (fix round and review).

## What shipped

- **Canonical runtime**: shaped upper/lower split with nearest arm/leg segment ownership, a seam measurement that excludes the arms, integer registration limited to hip ±1 px on each axis, set-level seam and gear verdicts, z-merged stacks, and a per-set cache. `app/src/lib/runtime/paperdoll.js`, re-exported through `app/src/lib/compose/compose.ts`.
- **Live view**: "Walk while attacking" per character, on by default, with a conditional Waist stepper and accessible help tooltips. Layering is latched for the whole action; gait changes cannot flip it. Grounded, unmounted, same-facing only.
- **Slowdown**: 0.8 travel speed for grounded attacks on foot, in both layered and full-body modes; attack timing untouched; mounts keep 1.0 and their own gait.
- **Mounted facing**: the mount follows travel; only the rider turns to the attack aim. Integer seat placement retained.
- **Exports**: per-frame upper/lower fragments and integer hip anchors, included only when the export option is enabled (default off), and the four controller operations:
  - `setActionLayering` / `set_action_layering` / `SetActionLayering`
  - `playAction` / `play_action` / `PlayAction`
  - `canLayerAction` / `can_layer_action` / `CanLayerAction`
  - `actionPlaying` / `is_action_playing` / `IsActionPlaying`
- **Docs**: runtime contract, manifest spec, engine guides, decision, fix plan and review history.

## Test evidence

Historical coordinator checks before the revised gate:

| Command | Result |
| --- | --- |
| `npm run check` | Passed, Prettier clean |
| `npm test -- live-layering export-phaser gdevelop-export godot-export unity-export runtime` | 73 passed, 2 Godot opt-ins skipped without `GODOT_BIN` |
| `npm run e2e -- experience-parity -g "Walk while attacking layers tracked frames"` | 1 passed |
| Real-cadence Playwright capture with the bodyA injection | 18 of 18 `cross-punch` frames across three action cycles stayed `layered=true` while walk cells changed |

Earlier implementer results, not rerun in full for the revised gate:

- Full unit suite 3,468 passed.
- Full E2E 445 passed.
- Godot 4.7.2 native layered playback passed.
- Unity 6000.4.0f1 verifier passed 4,509 Play Mode, 648 GPU and 648 linear GPU checks.
- Phaser 3.90.0 Canvas and WebGL playback regressions passed; GDevelop native editor unverified.

Revised-gate checks (from `app/`):

| Command | Result |
| --- | --- |
| `npm run check` | Passed, including types and Prettier |
| `npm test -- live-layering export-phaser gdevelop-export godot-export unity-export runtime` with `GODOT_BIN` | 83 passed, including native Godot 4.7.2 |
| `node --experimental-transform-types scripts/verify-unity-export.mjs --editor <Unity.exe>` | Unity 6000.4.0f1: 4,540 Editor Play Mode, 648 GPU, and 648 linear GPU checks passed |
| `npm run e2e -- experience-parity -g "Walk while attacking layers tracked frames"` | 1 passed; includes unsupported-outfit downgrade without upgrading mid-action |
| `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs` | Passed; refreshed the offline sheets and source comparison |

## Offline gate, after the fixes

The set must have a worst seam ≤ 8 px and a median seam ≤ 4 px, with hip geometry, drawable required equipment, and a usable limb split. Offset search stays within 1 px of the hips on each axis. The [worst-frame review](gate-results.md) supports the cutoff: the visible difference is garment overlap, not torso slide.

| Set | Worst / median seam (px) | Max hip departure X / Y (px) | Max frame change (px) | Verdict |
| --- | ---: | ---: | ---: | --- |
| bodyA South | 7 / 0 | 1 / 1 | 2 | Layered |
| bodyA East | 6 / 3 | 1 / 1 | 3 | Layered |
| bodyA North | 7 / 0 | 1 / 1 | 2 | Layered |
| Manually tracked demo South | 6 / 3 | 1 / 1 | 3 | Layered with manual hips only |
| Stock demo | n/a | n/a | n/a | Full body: no tracked hips |

Trousers and bg-cape z-order are covered by fixtures and rendered evidence: [24-bodyA-hands-trousers-cape.png](evidence/24-bodyA-hands-trousers-cape.png). Gate sheets: [22-set-gate-bodyA-south.png](evidence/22-set-gate-bodyA-south.png), [east](evidence/22-set-gate-bodyA-east.png), [north](evidence/22-set-gate-bodyA-north.png).

## Visual evidence

- Round 3 layered real-cadence frames, before horizontal correction: [16-0](evidence/live/16-layered-action-0.png), [16-1](evidence/live/16-layered-action-1.png), [16-2](evidence/live/16-layered-action-2.png), [16-3](evidence/live/16-layered-action-3.png), [16-4](evidence/live/16-layered-action-4.png). Round 4: [six corrected Live frames at 8×](evidence/live/18-bodyA-south-fixed-action-8x.png) from the positive-control subset.
- Revised gate: [complete South Slash cycle at 8×](evidence/live/19-bodyA-south-full-slash-8x.png), including the 7 px Walk 4 / Slash 5 pair. The [source-versus-composite check](evidence/27-south-slash-source-vs-composite-8x.png) confirms the unusual right-side shape is in the original Slash 5 art.
- Settings, default switch, Waist control and tooltip: [15](evidence/live/15-coordinator-settings-tooltip.png).
- Mounted east mount with south rider: [12](evidence/live/12-desktop-mount-east-rider-south.png).
- Missing east attack art fallback notice: [17](evidence/live/17-full-body-fallback.png).

## Review history

1. [Review round 1](REVIEW.md): the first gate was wrong. It selected offsets by distance from a hand fit rather than measured seam quality, ignored tracked hips, and deferred the feature. The fitted results were re-rendered and looked acceptable.
2. [Opus challenge](review-opus55/challenge.md): do not merge. Found the mid-action flip, the unconstrained vertical fit, the third hand and erased attack hand, the trousers block, the z-order defect, export inclusion tied to the Live switch, and duplicated upper sheets.
3. [Fix plan](FIX-PLAN.md): latched per-action verdict, set-level gate with dy ±1 and a padded stable frame, segment ownership, whole walk lower-body clothing, z merge, explicit export inclusion, half-pixel anchors, invalid sentinel, tooltip and docs.
4. [Review round 3](REVIEW.md): fixes read and tested. Real-cadence capture shows no mid-action flip and no visible seam, third hand or bob on the captured action.
5. [Opus recheck of `23281e1af`](review-opus55/recheck.md): found the sideways torso drift. Round 4 limits both axes to the hips and excludes arms from seam measurements. See [current gate results](gate-results.md).

## Known limits and unverified areas

- The stock demo has no tracked hips and falls back. The complete Live cycle uses the bodyA fixture injection from the E2E.
- The revised round did not visually capture an outfit-triggered full-body transition. Live, Phaser, GDevelop, Godot, and Unity have explicit outfit-change downgrade coverage.
- Perceived foot sliding, long coats, diagonals, eight-direction attacks, reduced motion, and the native GDevelop editor remain unverified. Full unit and E2E suites were not rerun for this revision.
- The current Phaser ZIP grows from 116,783 to 130,971 bytes with layering enabled (+14,188 bytes). This measures bodyA with synthetic gear, not a real dressed character.
- The bundled demo and old characters without hip data do not benefit until they have tracked or measured hips.
