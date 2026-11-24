# Moving-attack implementation report

Date: 2026-11-24
Status: implemented, reviewed, accepted by the independent Opus review, then revised after the Flash High real-data review. The gear rule, hip silhouette validation, scale-aware limits and fallback help are included and tested.
Commits: `2cfc0b63` (feature), `c2d8f504` (fix plan), `23281e1af` (fix round and review), `92630302` (hip lock and justified seam rule), the shared-shift guard, and the real-data fixes.

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

Final checks with the shared-shift guard (from `app/`):

| Command | Result |
| --- | --- |
| `npm run check` | Passed, including types and Prettier |
| `npx vitest run live-layering runtime export-phaser gdevelop-export godot unity experience-presentation` with `GODOT_BIN` | 117 passed in 9 files, including native Godot 4.7.2; no skips |
| `node --experimental-transform-types scripts/verify-unity-export.mjs --editor <Unity.exe>` | Unity 6000.4.0f1: 4,570 Editor Play Mode, 648 GPU, and 648 linear GPU checks passed |
| `npm run e2e -- experience-parity -g "Walk while attacking layers"` | 1 passed; includes the walk-only Wizard hat staying layered, default toggle, Waist, and 80% travel speed |
| `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs` | Passed; regenerated offline sheets and source comparison were byte-identical |

## Offline gate, after the fixes

Worst, median, and shared-shift limits scale by cell width from the reviewed 8 / 4 / 2 px at 92 px, with floors that keep the accepted 64 px rule, so 64 px stays 8 / 4 / 2 and larger cells scale. Offset search stays within 1 px on either axis. A fit that meets the shared-shift limit wins if its seam is within 1 px of the best and no greater than the worst limit. Incomplete attack gear is omitted from both modes and remains in the Live notice. Only lower gear with complete attack art and incomplete walk art blocks the layered set. See [gate results](gate-results.md) for the size table.

| Set | Worst / median seam (px) | Max shared shift (px) | Max hip departure X / Y (px) | Max frame change (px) | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| bodyA South | 7 / 0 | 0 | 1 / 1 | 2 | Full body: worst |
| bodyA East | 6 / 3 | 2 | 1 / 1 | 3 | Full body: shared |
| bodyA North | 7 / 0 | 0 | 1 / 1 | 2 | Full body: worst |
| Manually tracked demo South | 6 / 3 | 0 | 1 / 1 | 3 | Layered with manual hips only |
| Stock demo | n/a | n/a | n/a | n/a | Full body: no tracked hips |

At 64 px, the complete bodyA fixture no longer qualifies; the UI test uses a positive-control timeline without its 7 px Slash 5 outlier. At 160 px, bodyN North Walk/Walk passes with a 3 px shared shift. The real 92 px Bonequin outfit layers 48/48 pairs each in South and North. East and West are cardinal facings and still use full body: Walk 4 recovers a finite join, but the worst seam is 13 px. Silhouette validation can't catch a 2 px error that still intersects the body.

Trousers and bg-cape z-order are covered by fixtures and rendered evidence: [24-bodyA-hands-trousers-cape.png](evidence/24-bodyA-hands-trousers-cape.png). Gate sheets: [22-set-gate-bodyA-south.png](evidence/22-set-gate-bodyA-south.png), [east](evidence/22-set-gate-bodyA-east.png), [north](evidence/22-set-gate-bodyA-north.png).

## Visual evidence

- Round 3 layered real-cadence frames, before horizontal correction: [16-0](evidence/live/16-layered-action-0.png), [16-1](evidence/live/16-layered-action-1.png), [16-2](evidence/live/16-layered-action-2.png), [16-3](evidence/live/16-layered-action-3.png), [16-4](evidence/live/16-layered-action-4.png). Round 4: [six corrected Live frames at 8×](evidence/live/18-bodyA-south-fixed-action-8x.png) from the positive-control subset.
- Revised gate: [complete South Slash cycle at 8×](evidence/live/19-bodyA-south-full-slash-8x.png), including the 7 px Walk 4 / Slash 5 pair. The [source-versus-composite check](evidence/27-south-slash-source-vs-composite-8x.png) confirms the unusual right-side shape is in the original Slash 5 art.
- Settings, default switch, Waist control and tooltip: [15](evidence/live/15-coordinator-settings-tooltip.png).
- Mounted east mount with south rider: [12](evidence/live/12-desktop-mount-east-rider-south.png).
- Missing east attack art fallback notice: [17](evidence/live/17-full-body-fallback.png).
- Restored Bonequin in Studio with all six requested items equipped: [South](evidence/live/bonequin-dressed-south.png), [North](evidence/live/bonequin-dressed-north.png). Both layered with the five-item notice and visible knife. See [real-data verification](REAL-DATA.md).

## Review history

1. [Review round 1](REVIEW.md): the first gate was wrong. It selected offsets by distance from a hand fit rather than measured seam quality, ignored tracked hips, and deferred the feature. The fitted results were re-rendered and looked acceptable.
2. [Opus challenge](review-opus55/challenge.md): do not merge. Found the mid-action flip, the unconstrained vertical fit, the third hand and erased attack hand, the trousers block, the z-order defect, export inclusion tied to the Live switch, and duplicated upper sheets.
3. [Fix plan](FIX-PLAN.md): latched per-action verdict, set-level gate with dy ±1 and a padded stable frame, segment ownership, whole walk lower-body clothing, z merge, explicit export inclusion, half-pixel anchors, invalid sentinel, tooltip and docs.
4. [Review round 3](REVIEW.md): fixes read and tested. Real-cadence capture shows no mid-action flip and no visible seam, third hand or bob on the captured action.
5. [Opus recheck of `23281e1af`](review-opus55/recheck.md): found the sideways torso drift. Round 4 limits both axes to the hips and excludes arms from seam measurements. See [current gate results](gate-results.md).
6. [Opus final review](review-opus55/recheck2.md): mergeable. The 8/4 rule is justified because the seam measures waist outline, not alignment, and the worst frames show clothing overlap. It found one blind spot, a symmetric 3 px shift; the shared-shift guard above closes it. Final verdicts: South, East, North and the manually tracked demo layer; the stock demo falls back.
7. Coordinator final verification: `npm run check`, 89 targeted tests (2 Godot opt-ins skipped without `GODOT_BIN`), and the layering E2E case passed on the final tree. The implementer separately ran 117 targeted tests with native Godot and the Unity verifier, both passing.
8. [Flash High real-data review](review-flash-high.md): fixed the gear false positive, invalid silhouette anchor, scaled fit and fallback tooltip. `npm run check`, 134 targeted tests with native Godot, the E2E case, Unity verification, and both offline gates passed.

## Known limits and unverified areas

- The stock demo has no tracked hips and falls back. The positive-control Live cycle uses the bodyA fixture injection from the E2E.
- Bonequin layers South and North with the real dressed outfit and keeps the five-item hidden notice; East and West are cardinal facings that fall back at a 13 px seam on that character. A plausible 2 px hip error inside the silhouette can still pass, so anatomy is checked visually as well as numerically.
- The revised round covers the outfit-triggered single downgrade in Live, Phaser, GDevelop, Godot and Unity; the dressed real-data screenshot is the layered path, not the downgrade.
- Perceived foot sliding, long coats, diagonals, eight-direction attacks, reduced motion, and the native GDevelop editor remain unverified. Full unit and E2E suites were not rerun for this revision.
- Bonequin's Phaser ZIP grew by 87,632 bytes (+7.9%) in review and by 87,671 bytes (+7.93%) in the fixed rerun. The complete bodyA fixture now generates no fragment PNGs at its tighter threshold.
- The bundled demo and old characters without hip data do not benefit until they have tracked or measured hips.
