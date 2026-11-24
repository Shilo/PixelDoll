# Decision: attack while walking

Date: 2026-11-24
Status: decided by the coordinator after independent memos from GPT-6.2 Sol and Claude Opus 5.5. No implementation yet.
Inputs: [spike](README.md), [pixel probe](composite-probe.md), [independent review](review-gpt62/README.md), [Sol decision](review-gpt62/decision-sol.md), [Opus decision](review-opus55/README.md), [my lab](layering-lab.html), [Sol lab](review-gpt62/lab.html).

## Verdict

Ship it, narrowly and optionally. Same-facing only: the Walk's legs stay under the Attack's upper body, the attack's own legs are removed with a shaped mask, and held gear stays intact. Off by default, no PixelLab cost, and a whole-body fallback whenever the pair is not eligible.

The owner has seen the shaped result and accepts the quality, including a brief cape oddity during the attack. That settles the quality question for the pilot. It does not settle the export contract, so the app proves it first.

Do not build: independent aim, different facing per half, strafe or backpedal gaits, a review registry, per-pair fingerprints, a recipe editor, seam or speed sliders, or generated combined clips in this pilot.

## What makes a pair eligible

All must hold, otherwise the current whole-body attack plays:

- The character is on the ground and moving on its Walk clip (not Idle, not airborne, not mounted).
- The attack's resolved direction equals the locomotion direction.
- Both the Walk and the Attack have per-cell hip geometry for that direction (requested or measured keypoints, or the frozen hip anchor track).
- Action layering is enabled for that character.

Upper part: every attack layer, with the body's legs removed by the leg-shaped flood fill below the waist row, then fragments under 40 px dropped. Held weapons and capes stay whole.
Lower part: the Walk composite from the waist row down, so walk boots and trousers come along.
Registration: an integer offset from the two frames' stored hip points, with the lab's bounded silhouette fit as the fallback when the hip points miss by more than 1 px.

## Exported API

Adopt the one-shot action over the running loop. It is smaller than a two-clock sample, keeps the existing self-ticking contract, and needs no review table or recipe ID. The controller already knows the last loop because the game calls `play` for it.

| Operation | Phaser / GDevelop | Godot | Unity |
| --- | --- | --- | --- |
| Enable layering (default off) | `setActionLayering(enabled)` | `set_action_layering(enabled)` | `SetActionLayering(bool enabled)` |
| Play one action over the loop | `playAction(move, direction)` returns `"layered"` or `"full"` | `play_action(move, direction) -> String` | `string PlayAction(string move, string direction)` |
| Can this pair layer now | `canLayerAction(move, direction)` | `can_layer_action(move, direction)` | `CanLayerAction(move, direction)` |
| Is an action playing | `actionPlaying` getter | `is_action_playing()` | `IsActionPlaying` property |

Semantics:

- `playAction` plays the action once from its start, then returns to the loop that `play` last selected, at that loop's current progress. The loop keeps ticking in both modes, so the gait never restarts.
- Returns `"layered"` only when layering is enabled and `canLayerAction` is true; otherwise `"full"`, which is exactly today's behavior.
- `play` during an action cancels it. Invalid input follows the existing contract and leaves state unchanged.
- Equipment and palette changes restart neither clock.
- The game owns movement, aim and hit timing. The export never slows anything.
- Native ports do no masking. The export ships per-frame upper and lower fragments plus integer hip anchors, and the controller draws two ordered sprite stacks at `lowerAnchor - upperAnchor`. Exports without that data report `canLayerAction` false.

Why not the alternatives: a two-clock `presentMotion` forces games into manual time and duplicates the loop clock; a versioned pair registry is review tooling in the API and would need maintenance the owner does not want. If a future game needs exact time control, it can call `play` with its own sampling later.

## Live view setting

In Settings, Live views, directly under the Attack picker, per character:

- **Walk while attacking** (switch, default off). Help: "Legs keep walking during a same-facing attack. Capes may look odd."
- **Waist** (stepper, minus 4 to plus 4 px, default Automatic, shown only while the switch is on). Nudges the cut line for characters with long tops or low belts.

Everything else is automatic: eligibility, registration, fragment cleanup, which layers come from which clip, fallback, and the slowdown. No seam slider, no speed slider, no per-pair list.

## Slowdown

App policy, not exported API. While a grounded attack plays, travel speed is multiplied by 0.8, in both modes, layered or not. Attack playback and repeat timing stay at 1.0, because authored timing is part of the attack's feel and a slower swing reads as lag. Gait cadence follows velocity, so the legs slow with the body and do not skate. Mouse destination reach and movement integration use the same factor. Airborne movement is unchanged. Fixed, no setting.

0.8 is noticeable without reading as a stop. Sol proposed 0.8, Opus 0.7, and the owner asked for a small but noticeable slowdown.

## Plan

### Phase A: offline gate, no app change, no credits

Use the real rigs in `app/test/fixtures/bench/` (bodyA, bodyB, bodyC, bodyN with rest and per-cell keypoints, plus cape, boots, chest, helmet, hair and two-handed weapon sheets). Compare hip-keypoint offsets with the lab's fitted offsets for every walk and slash phase in each direction. Bake upper and lower fragments, verify the sword and cape stay whole, verify no gear disappears, and record the worst seam step per body.

Gate: the automatic hip offset must be within 1 px of the fitted offset, or the fallback fit must reach it. If both fail on real rigs, stop and keep the whole-body attack.

### Phase B: Live view, ship and use it

- `app/src/studio/experience/movement.ts`: `ATTACK_MOVE_SCALE = 0.8` next to `TRAVEL`.
- `app/src/studio/experience/presentation.ts`: `renderPresentation` accepts an optional lower clip and cell.
- `app/src/studio/experience/WorldStage.svelte`: when eligible, draw the attack cell over `clock.cell`; apply the travel factor while `actions.attack` is set; expose `data-attack-layered` for tests.
- `app/src/lib/runtime/paperdoll.js`: canonical `splitUpper`, `splitLower`, `layerOffset`, pure and deterministic. Run `npm run runtime:sync`.
- `app/src/studio/experience/liveSettings.ts` and `liveViews.ts`: per-character `layering: { on, waist }` with tolerant parsing.
- `app/src/studio/LiveViewSettings.svelte` and `app/src/locales/`: the switch, the waist stepper, and help text.
- Tests: new `app/test/unit/live-layering.test.ts` (offsets, leg removal keeps the sword, walk boots come from the walk, direction mismatch falls back, determinism, waist clamping) on bench frames; settings parsing in the existing settings test; one `experience-parity.spec.ts` case that toggles the switch, walks and attacks, and asserts the host attribute plus reduced travel.

No export changes in Phase B. The runtime functions land because Live will reuse them later, not because exports change yet.

### Phase C: exports, only after the owner has used Phase B

- `app/src/lib/export/sheets.ts` and `build.ts`: fragment cells and anchors when the character enabled layering.
- `phaser.ts`, `gdevelop.ts`, `godot.ts`, `unity.ts`: the four operations above.
- `docs/architecture/javascript-runtime.md`: add the operations to the behavior contract.
- Tests: `runtime.test.ts`, the four export suites, `runtime-sync.test.ts`, and the native verifiers. Run the full E2E suite because the shared runtime changed, plus `export-picker`.
- Move the waist offset from browser preferences into the saved character so an export reproduces it.

## Dissent and why

| Question | Sol | Opus | Decision |
| --- | --- | --- | --- |
| API | Explicit two-clock `presentMotion` plus a reviewed pair table | One-shot `playAction` over the running loop | One-shot. Smaller, no registry, fits `play` |
| Export timing | Live and exports together | Live first, exports after use | Live first, with a hard gate |
| Review gating | Reviewed pairs, equipment, fingerprints | No review, accept artifacts | No registry. Eligibility from data, development-time gate in Phase A |
| Slowdown | 0.8, app only | 0.7, app only | 0.8, app only |
| Character of the feature | Reviewed pilot | Pragmatic opt-in | Pragmatic opt-in with a data gate |

## Risks and accepted limits

- Only one sprite and one attack direction have been judged visually. Real rigs may fail the 1 px gate.
- Capes and long coats will look wrong for the length of the attack. Accepted for an opt-in feature.
- Foot contact at real speeds is unverified. The slowdown helps; it does not prove it.
- Native engine output is unverified until Phase C.
- The fixture has no hip data; the bench rigs do, and Phase A must use them.

## Track

One card: live-view layering plus the app slowdown. Export parity becomes its own card when Phase B is accepted.
