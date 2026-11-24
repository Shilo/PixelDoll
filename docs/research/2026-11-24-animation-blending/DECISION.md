# Decision: attack while walking

Date: 2026-11-24
Status: implementation round 1 follows the coordinator review and uses the corrected gate.
Inputs: [spike](README.md), [pixel probe](composite-probe.md), [independent review](review-gpt62/README.md), [Sol decision](review-gpt62/decision-sol.md), [Opus decision](review-opus55/README.md), [my lab](layering-lab.html), [Sol lab](review-gpt62/lab.html).

## Verdict

Ship it, narrowly and optionally. Same-facing only: the Walk's legs stay under the Attack's upper body, the attack's own legs are removed with a shaped mask, and held gear stays intact. On by default in Live, off by default in engine controllers, no PixelLab cost, and a whole-body fallback whenever the pair is ineligible.

The owner has seen the shaped result and accepts the quality, including a brief cape oddity during the attack. That settles the quality question for the pilot. It does not settle the export contract, so the app proves it first.

Do not build: independent aim, different facing per half, strafe or backpedal gaits, a review registry, per-pair fingerprints, a recipe editor, seam or speed sliders, or generated combined clips in this pilot.

## What makes a pair eligible

All must hold, otherwise the current whole-body attack plays:

- The character is on the ground and moving on its Walk clip (not Idle, not airborne, not mounted).
- The attack's resolved direction equals the locomotion direction.
- Both the Walk and the Attack have per-cell hip geometry for that direction (requested or measured keypoints, or the frozen hip anchor track).
- Action layering is enabled for that character.

Upper part: every attack layer, with the body's legs removed by the leg-shaped flood fill below the waist row, then fragments under 40 px dropped. Held weapons and capes stay whole.
Lower part: the Walk body and lower-body clothing from the waist row down. Held gear, capes and upper clothing come from the Attack so they appear once.
Registration starts with the tracked hip, then uses measured or requested hips when needed. A nonzero or missing seam measurement tries the bounded silhouette fit. Use the offset with the lower measured seam step. A frame pair qualifies at a finite seam step of at most 1 px and zero gear loss.

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

## Mounted facing

While mounted, the mount follows travel only and never turns for an attack. The rider turns to the attack aim. The two are separate drawings, so this needs no new art: the mount view is selected from the locomotion facing, the rider's presentation and hip contact come from the attack facing, and the rider is offset so its hip sits on the mount's seat for the travel facing. Attacking must not change the mount's direction, gait phase, height or visibility.

No exported API operation is added for this. Mounts are editor-only today, and a rider is simply a second doll with its own `play(move, direction)`, so a host game can already compose a mount and a rider that face differently. If mounts become exportable, add a seat helper then, not now. Record the general rule in the architecture note.

## Live view setting

In Settings, Live views, directly under the Attack picker, per character:

- **Walk while attacking** (switch, default on). Help: "Legs keep walking during a same-facing attack. Capes may look odd."
- **Waist** (stepper, minus 4 to plus 4 px, default Automatic, shown only while the switch is on). Nudges the cut line for characters with long tops or low belts.

Everything else is automatic: eligibility, registration, fragment cleanup, which layers come from which clip, fallback, and the slowdown. No seam slider, no speed slider, no per-pair list.

## Slowdown

App policy, not exported API. While a grounded, unmounted attack plays, travel speed is multiplied by 0.8, in both modes, layered or not. Attack playback and repeat timing stay at 1.0, because authored timing is part of the attack's feel and a slower swing reads as lag. Gait cadence follows velocity, so the legs slow with the body and do not skate. Mouse destination reach and movement integration use the same factor. Airborne movement is unchanged.

**Mounted characters are exempt.** The rider and the mount are separate entities, so a rider's attack must never change the mount's speed or gait. While mounted or in a riding pose, travel stays at 1.0 and the mount keeps its own 1.3 multiplier. Layering is already off while mounted; the speed factor is off for the same reason. The Live setting tooltip words the slowdown as applying to walking characters.

0.8 is noticeable without reading as a stop. Sol proposed 0.8, Opus 0.7, and the owner asked for a small but noticeable slowdown.

## Plan

### Phase A: offline gate, no app change, no credits

Use the real rigs in `app/test/fixtures/bench/` (bodyA, bodyB, bodyC, bodyN with rest and per-cell keypoints, plus cape, boots, chest, helmet, hair and two-handed weapon sheets). Compare hip-keypoint offsets with the lab's fitted offsets for every walk and slash phase in each direction. Bake upper and lower fragments, verify the sword and cape stay whole, verify no gear disappears, and record the worst seam step per body.

Gate: measure the seam at the chosen offset and report lost gear and detached body components. Keep the full action for each ineligible pair. [Round 1 review](REVIEW.md) records why offset agreement was dropped.

### Phase B: Live view, ship and use it

- `app/src/studio/experience/movement.ts`: `ATTACK_MOVE_SCALE = 0.8` next to `TRAVEL`.
- `app/src/studio/experience/presentation.ts`: `renderPresentation` accepts an optional lower clip and cell.
- `app/src/studio/experience/WorldStage.svelte`: when eligible, draw the attack cell over `clock.cell`; apply the travel factor while `actions.attack` is set; expose `data-attack-layered` for tests.
- `app/src/lib/runtime/paperdoll.js`: canonical `splitUpper`, `splitLower`, `layerOffset`, pure and deterministic. Run `npm run runtime:sync`.
- `app/src/studio/experience/liveSettings.ts` and `liveViews.ts`: per-character `layering: { on, waist }` with tolerant parsing.
- `app/src/studio/LiveViewSettings.svelte` and `app/src/locales/`: the switch, the waist stepper, and help text.
- Tests: new `app/test/unit/live-layering.test.ts` (offsets, leg removal keeps the sword, walk boots come from the walk, direction mismatch falls back, determinism, waist clamping) on bench frames; settings parsing in the existing settings test; one `experience-parity.spec.ts` case that toggles the switch, walks and attacks, and asserts the host attribute plus reduced travel.

The corrected gate is shared by Live and export preparation.

### Phase C: exports

- `app/src/lib/export/sheets.ts` and `build.ts`: fragment cells and anchors when the character enabled layering.
- `phaser.ts`, `gdevelop.ts`, `godot.ts`, `unity.ts`: the four operations above.
- `docs/architecture/javascript-runtime.md`: add the operations to the behavior contract.
- Tests: `runtime.test.ts`, the four export suites, `runtime-sync.test.ts`, and the native verifiers. Run the full E2E suite because the shared runtime changed, plus `export-picker`.
- Bake the character’s selected waist offset into the exported fragments.

## Review criteria for the implementation

The implementer and the reviewer both check these before the pilot is accepted.

**API, structural parity**

1. The same four operations exist with the same names, arguments and results in JS/Phaser, GDevelop, Godot and Unity. Only host-language conventions differ.
2. Default is off. Enabling layering never changes what `play` does; `play` during an action cancels it; invalid input leaves state unchanged.
3. `playAction` returns `layered` only when layering is enabled and the pair is eligible; otherwise `full`, and `full` renders exactly today's behavior.
4. The loop keeps its own clock and progress across action start and end. Equipment and palette changes restart neither clock.
5. No controller performs masking or anatomical inference. They draw supplied fragments at integer offsets.
6. An export without fragments or anchors reports `canLayerAction` false and behaves as before.

**App, dogfooding**

7. The Live view calls the canonical runtime split and composite functions. No second implementation of the mask, offset or draw order exists in `studio/`.
8. Eligibility is: grounded, unmounted, moving on Walk, attack direction equals locomotion direction, both clips have hip geometry, layering enabled. Everything else falls back with a reason.
9. Same-facing only; mounted, airborne, idle and mismatched directions never layer.
10. The 0.8 travel factor applies to grounded unmounted attacks only, in both modes, with gait following velocity. Mounts keep 1.0 and their own gait. Mount facing follows travel; only the rider turns to the aim.
11. Settings: one switch on by default, one Waist stepper shown only when on, both with accessible human-readable tooltips, all text localized. No seam or speed sliders.
12. Walk phase is preserved across attack start, end and direction change; the walk does not restart.

**Tests and reporting**

13. Unit tests cover offsets, shaped removal keeps held gear, lower slots come from Walk, fallback on direction mismatch, determinism, waist clamping, settings parsing, the mounted exemptions and the four controller operations.
14. One E2E case asserts layered rendering and reduced travel through the UI.
15. The implementer reports exactly what ran and what could not run. Native engine output stays unverified until a native check runs.

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
