# Final decision: walk while attacking

Date: 2026-11-24
Reviewer: Opus 5.5
Status: recommendation, no implementation

## Decisions

1. **Build it, narrowly.** Same-facing, leg-shaped layering of the Walk legs under the Attack upper body, off by default. No PixelLab credits, no review registry, no outfit gating.
2. **API: one-shot `playAction` over the running loop.** Not a two-clock sample, not a recipe registry.
3. **Live view: one switch plus one waist offset**, per character.
4. **Slowdown is app policy, not exported API.** Movement drops to 70% while an attack plays. Attack timing is untouched. Fixed, not a setting.
5. **Ship the live view first, exports second.** Cut everything about independent aim, Tier 2 and Tier 3.

## 1. Scope

Worth it: engineering only, versus 45 to 250 generations per dressed move. The owner accepts brief artifacts over sliding, so per-pair review, fingerprinting and cape exclusion are unnecessary for an opt-in feature.

In scope:

- Layered only when all hold: the character is moving on its Walk clip, the attack's resolved direction equals the locomotion direction, and both clips have stored hip keypoints for that direction. Otherwise the current whole-body attack plays.
- Upper part: every attack layer, with the body's legs removed by the lab's leg-shaped flood fill (below the waist row, connected to the bottom edge) and fragments under 40 px dropped. Held weapons and capes stay whole.
- Lower part: the Walk composite from the waist row down, so walk boots and trousers come along.
- Registration: integer offset from the difference of the two frames' stored hip keypoints., replacing the lab's hand-marked junction rows.

Out: mixed facings, strafe gaits, generated combined clips, side-view up/down attacks, jumps, idle attacks.

Risk: hip keypoints must land within 1 px of the lab's fitted offsets; otherwise use the lab's bounded silhouette fit, still automatic.

## 2. Exported API

A two-clock sample forces games into manual time, breaking the self-ticking `play(move, direction, restart)` contract; GDevelop event users would not use it. A registry is review tooling dressed as API. Extend `play` with a one-shot overlay the controller ticks itself.

| Operation | Phaser / GDevelop | Godot | Unity |
| --- | --- | --- | --- |
| Play once over the current loop | `playAction(move, direction)` returns `"layered"` or `"full"` | `play_action(move, direction) -> String` | `string PlayAction(string move, string direction)` |
| Enable layering | `setActionLayering(enabled)` | `set_action_layering(enabled)` | `SetActionLayering(bool enabled)` |
| Can this pair layer now | `canLayerAction(move, direction)` | `can_layer_action(move, direction)` | `CanLayerAction(move, direction)` |
| Is an action playing | `actionPlaying` (getter) | `is_action_playing()` | `IsActionPlaying` (property) |

Semantics:

- `playAction` plays the move once from its start, then returns to the loop that `play` last selected, at that loop's current progress. The loop keeps ticking underneath in both modes, so the gait never restarts.
- Returns `"layered"` when layering is enabled and `canLayerAction` is true, else `"full"`. `"full"` is exactly today's behavior: whole-body action, then back to the loop.
- `play` during an action cancels it. Invalid input follows the existing contract.
- Default off. Exports without layering data report `canLayerAction` false. Equipment and palette changes restart neither clock.
- Native ports do no masking: the export ships per-frame upper and lower fragments plus integer hip anchors, and the controller draws two ordered sprite stacks at `lowerAnchor - upperAnchor`. Fragments are per frame, not per pair.
- The game moves the root. The export does not slow anything.

## 3. Live view setting

In `LiveViewSettings.svelte`, directly under the Attack picker, saved per character like the role choices:

- **Walk while attacking** (switch, default off). Help: "Legs keep walking during a same-facing attack. Capes may look odd."
- **Waist** (stepper, shown only while the switch is on, range minus 4 to plus 4 px, default 0 shown as "Automatic"). Moves the cut line relative to the hip keypoints for characters with long tops or low belts.

Automatic: eligibility, hip registration, fragment cleanup, which layers come from which clip, whole-body fallback, and the slowdown.

## 4. Slowdown

Game policy, so not exported; the export README recommends scaling movement to about 0.7 while `actionPlaying`.

In the app: while `actions.attack` is set, multiply travel speed by `ATTACK_MOVE_SCALE = 0.7`, in both modes (layered or not). Because `livePlaybackDelta` derives gait cadence from velocity, the legs slow with the body and do not skate. Do not scale attack playback: timing is authored, and a slower swing reads as lag. Fixed, no setting; 0.7 is noticeable without feeling like a stop.

## 5. Plan

**Phase A: offline check (0 credits).** Compare hip-keypoint offsets on `app/public/fixtures/s2/` with the lab's fitted offsets for all 48 south pairs. Gates Phase B.

**Phase B: live view.**

- `app/src/lib/runtime/paperdoll.js`: canonical `splitUpper`, `splitLower`, `layerOffset` (pure, deterministic, sampled by the existing `sampleTimeline`). Run the source sync workflow from `docs/architecture/javascript-runtime.md`.
- `app/src/studio/experience/presentation.ts`: `renderPresentation` accepts an optional lower clip and cell.
- `app/src/studio/experience/WorldStage.svelte`: when eligible, render attack cell over `clock.cell`; apply `ATTACK_MOVE_SCALE`.
- `app/src/studio/experience/movement.ts`: `ATTACK_MOVE_SCALE` next to `TRAVEL`.
- `app/src/studio/experience/liveSettings.ts`: `layering: Record<characterId, { on: boolean; waist: number }>` with the same tolerant parsing.
- `app/src/studio/LiveViewSettings.svelte` and `app/src/locales/`: the two controls and help text.
- Tests: new `app/test/unit/live-layering.test.ts` (offsets, leg removal keeps the sword, lower slots from walk, fallback on direction mismatch, determinism) on fixture frames; extend `live-roles.test.ts` or a settings test for parsing; one case in `test/e2e/experience-parity.spec.ts` that toggles the switch, walks and attacks, and asserts a new `data-attack-layered` host attribute plus reduced travel.

**Phase C: exports**, only after the owner has used Phase B.

- `app/src/lib/export/sheets.ts`: fragment cells and anchors in the manifest, only when the character enables layering at export.
- `phaser.ts`, `gdevelop.ts`, `godot.ts`, `unity.ts`: the four operations above.
- Update the behavior contract table in `docs/architecture/javascript-runtime.md`.
- Tests: `export-phaser`, `gdevelop-export`, `godot-export`, `unity-export`, `runtime-sync` unit tests, the native parity check, and `npm run e2e -- export-picker`.
- Move the waist offset from browser preferences into the saved character so exports match.

**Cut:** recipe registry, fingerprints, per-pair review UI, `presentMotion`, reason codes, cape exclusion, cross-direction pairs, attack time scaling, every paid tier.
