# Moving-attack implementation report

Date: 2026-11-24
Status: implemented, reviewed, fix round applied. Independent Opus re-check pending.
Commits: `2cfc0b63` (feature), `c2d8f504` (fix plan), `23281e1af` (fix round and review).

## What shipped

- **Canonical runtime**: shaped upper/lower split with nearest arm/leg segment ownership, hip-anchored integer registration with the fit constrained to hip dy ±1, set-level seam and gear verdicts, z-merged stacks, and a per-set cache. `app/src/lib/runtime/paperdoll.js`, re-exported through `app/src/lib/compose/compose.ts`.
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

Reproduced by the coordinator on this commit:

| Command | Result |
| --- | --- |
| `npm run check` | Passed, Prettier clean |
| `npm test -- live-layering export-phaser gdevelop-export godot-export unity-export runtime` | 73 passed, 2 Godot opt-ins skipped without `GODOT_BIN` |
| `npm run e2e -- experience-parity -g "Walk while attacking layers tracked frames"` | 1 passed |
| Real-cadence Playwright capture with the bodyA injection | 18 of 18 `cross-punch` frames across three action cycles stayed `layered=true` while walk cells changed |

Reported by the implementer, not reproduced by the coordinator on this exact commit:

- Full unit suite 3,468 passed.
- Full E2E 445 passed.
- Godot 4.7.2 native layered playback passed.
- Unity 6000.4.0f1 verifier passed 4,509 Play Mode, 648 GPU and 648 linear GPU checks.
- Phaser 3.90.0 Canvas and WebGL playback regressions passed; GDevelop native editor unverified.

## Offline gate, after the fixes

| Set | Worst / median seam | Verdict |
| --- | --- | --- |
| bodyA South | 4 / 3 px | pass |
| bodyA North | 3 / 2 px | pass |
| bodyA East | 6 / 3 px | fail, falls back |
| Stock demo | n/a | falls back, no tracked hips |

Trousers and bg-cape z-order are covered by fixtures and rendered evidence: [24-bodyA-hands-trousers-cape.png](evidence/24-bodyA-hands-trousers-cape.png). Gate sheets: [22-set-gate-bodyA-south.png](evidence/22-set-gate-bodyA-south.png), [east](evidence/22-set-gate-bodyA-east.png), [north](evidence/22-set-gate-bodyA-north.png).

## Visual evidence

- Layered real-cadence frames: [16-0](evidence/live/16-layered-action-0.png), [16-1](evidence/live/16-layered-action-1.png), [16-2](evidence/live/16-layered-action-2.png), [16-3](evidence/live/16-layered-action-3.png), [16-4](evidence/live/16-layered-action-4.png).
- Settings, default switch, Waist control and tooltip: [15](evidence/live/15-coordinator-settings-tooltip.png).
- Mounted east mount with south rider: [12](evidence/live/12-desktop-mount-east-rider-south.png).
- Missing east attack art fallback notice: [17](evidence/live/17-full-body-fallback.png).

## Review history

1. [Review round 1](REVIEW.md): the first gate was wrong. It selected offsets by distance from a hand fit rather than measured seam quality, ignored tracked hips, and deferred the feature. The fitted results were re-rendered and looked acceptable.
2. [Opus challenge](review-opus55/challenge.md): do not merge. Found the mid-action flip, the unconstrained vertical fit, the third hand and erased attack hand, the trousers block, the z-order defect, export inclusion tied to the Live switch, and duplicated upper sheets.
3. [Fix plan](FIX-PLAN.md): latched per-action verdict, set-level gate with dy ±1 and a padded stable frame, segment ownership, whole walk lower-body clothing, z merge, explicit export inclusion, half-pixel anchors, invalid sentinel, tooltip and docs.
4. [Review round 3](REVIEW.md): fixes read and tested. Real-cadence capture shows no mid-action flip and no visible seam, third hand or bob on the captured action.
5. Opus re-check of `23281e1af`: pending. See `review-opus55/challenge2.md` when complete.

## Known limits and unverified areas

- East fails the set gate on bodyA and falls back; only South and North layer there.
- The stock demo has no tracked hips, so it always falls back; the visual guest used the same test injection as the E2E.
- The full-body fallback was not visually captured; the fallback capture hit missing east attack art instead.
- Real-cadence foot sliding, long coats, diagonals, eight-direction attacks, reduced motion and the Unity verifier on this exact commit are unverified.
- Outfit-change downgrade has explicit tests in Phaser and Godot only; Live, GDevelop and Unity lack that specific assertion.
- Archive size for a dressed bodyA Phaser export is +14,110 bytes (+12.1%), reported by the implementer.
- The bundled demo and old characters without hip data do not benefit until they have tracked or measured hips.
