# Decision on moving attacks

**Yes. Ship an opt-in pilot for reviewed, same-facing Walk plus Attack combinations.** Start with one stored pair and an explicitly reviewed outfit. Use shaped body masks and per-frame hip alignment, keep held gear intact, and preserve the walking phase. An accepted brief cape glitch can pass visual review. Missing art, disappearing gear, or a broken grip still fail. The two labs support the pilot on one sprite and one attack direction, with no native playback or foot-lock evidence. Existing art avoids the cost of a generated whole-body clip. Reserve that option for attacks that need coordinated hips, feet, and clothing. [First lab](../layering-lab.html) · [Independent lab](lab.html) · [Lab notes](lab-notes.md)

## Exported API

Use an **explicit two-clock sample**, backed by an optional versioned table of reviewed pairs in the export. The table is asset metadata. Games opt in on each sample, with two methods and no controller toggle or recipe ID to manage.

```ts
type Track = { clip: string; direction: string; elapsedMs: number };
type MotionSample = { locomotion: Track; action?: Track; layerAction?: boolean };
type ActionLayerPair = { locomotion: string; action: string; direction: string };
type MotionResult =
  | { status: "locomotion" | "layered" }
  | { status: "fullAction"; reason: "disabled" | "unsupportedPair" | "unsupportedEquipment" }
  | { status: "locomotion"; reason: "missingActionCoverage" }
  | { status: "rejected"; reason: "invalidInput" | "missingLocomotionCoverage" };

// Phaser/JS and GDevelop
getActionLayerPairs(): ActionLayerPair[];
presentMotion(sample: MotionSample): MotionResult;
```

Godot exposes `get_action_layer_pairs() -> Array[Dictionary]` and `present_motion(sample: Dictionary) -> Dictionary`. Unity exposes `ActionLayerPair[] GetActionLayerPairs()` and `MotionResult PresentMotion(MotionSample sample)`. Use equivalent fields and results.

- The query lists validated pairs for the currently equipped items. Old exports return an empty list. To enable layering, pass `layerAction: true` with both tracks. Omitted or false uses normal full-body action art. Existing `play` / `play_anim` / `Play` exits manual sampling and keeps its existing contract.
- Sample finite, nonnegative milliseconds against authored frame durations. Loop locomotion. Play the action once. With no action, or at its exact completion, show locomotion at the supplied phase. The game owns both clocks, movement, aim, and hit timing.
- For an active action without eligible layering, draw the complete action at its supplied aim and time and report why. If that art lacks coverage for the outfit, show locomotion and report `missingActionCoverage`. Reject unknown clips, invalid times or direction IDs, or a request with no drawable result. Rejection preserves the previous draw. Equipment and palette edits refresh the last sample at the same times. [Runtime contract](../../../architecture/javascript-runtime.md)

## Live views

Add one per-character switch **Layer moving attacks** in Settings → Live views, below **Attack**. Default **Off**. When on, select the reviewed fit automatically for the current action, gait, facing, and outfit. Use the ordinary attack when standing, airborne, mounted, facing another way, or missing a matching pair. Preserve the existing aim. Keep seam placement in the reviewed art data.

For grounded Live attacks, use a fixed **0.8× travel speed** in Top-down and Side-scroller, including full-body fallback with the switch off. Apply the same factor to distance-driven gait cadence, mouse destination reach, and movement integration while the attack plays. Restore 1.0× when it ends. Attack playback and repeat timing stay at 1.0×. Leave airborne movement alone. This belongs in Live movement policy. Games can scale their movement and supplied gait time as needed.

## Smallest shippable plan

1. **Prepare one pair offline.** Check every phase and continuous playback at 1×, using stored frames. Bake separate transparent upper/lower fragments and integer anchors. Record exact supported equipment and source fingerprints. Preserve padded item pivots, palette ownership, and draw order. Accept an exact cape outfit when its visible result passes review.
2. **Wire Live.** Reuse the clocks in `WorldStage.svelte`, `liveActions.ts`, and `presentation.ts`. Apply the travel factor through `movement.ts` and the stage. Persist through `liveSettings.ts`, `liveViews.ts`, and `state.svelte.ts`. Add the switch to `LiveViewSettings.svelte` and its text to `app/src/locales/`. Extend `experience-movement.test.ts`, `live-actions.test.ts`, and the Live settings case in `experience-parity.spec.ts`.
3. **Ship export parity together.** Put pair selection and draw semantics in `runtime/paperdoll.js` using `timeline.js`. Package fragments through `export/build.ts` and `sheets.ts`, with adapters in `phaser.ts`, `gdevelop.ts`, `godot.ts`, and `unity.ts`. Run `npm run runtime:sync` and update the runtime contract and generated engine guides. Extend `runtime.test.ts`, `export-phaser.test.ts`, `gdevelop-export.test.ts`, `godot-export.test.ts`, and `unity-export.test.ts` for phase continuity, exact completion, coverage fallback, and padded gear. Verify fresh exports with `verify-phaser-export.mjs`, `verify-gdevelop-engine.mjs`, `verify-unity-export.mjs`, and `GODOT_BIN` for the Godot test. Run check, unit tests, and full E2E for the shared runtime, including `export-picker.spec.ts` and `crash-recovery.spec.ts`.

Cut seam and speed sliders, a recipe editor, automatic splitting of arbitrary art, cross-facing layers, generated clips, and general animation channels from this pilot.
