# Production / approved prototype parity review

2026-10-23 — feature branch `feat/game-experience-rework`.

## Authority and method

The approved reference is the current [round-six playable prototype](2026-10-22-redesign/round-6-prototype/README.md), including its Bronze UI refinements. The first production integration (`172eedc`) preserved many workflows but did **not** preserve the reference's visual hierarchy and responsive composition closely enough. Passing behavior tests did not establish that fidelity.

Compare the prototype on port 5202 against the production build on port 5208 using identical viewport dimensions and theme. `app/scripts/compare-experience.mjs` retains 40 original reference captures and the initial production captures, then captures corrected production without replacing the baseline. The matrix covers Characters, Create, Preview, Top-down, Side-scroller, Colors, Outfits, Moves, additional equipment and More options; desktop 1440×900 and phone 390×844, dark and light. Each gallery displays original images directly, without rescaling or redrawing the source artwork. Native browser screenshots supplement this matrix for live interaction inspection. Never alter the user's selected outfit to make a comparison appear closer: test fixtures use isolated storage.

## Reviewed decisions

| Screen or behavior | Regression corrected | Deliberate production difference retained |
|---|---|---|
| Global shell | Restored readable type and control scale, top-center desktop view navigation, tablet spacing and purpose-based hierarchy. | Actual account, Activity, API information, Undo/Redo and export remain available. |
| Characters | Restored phone search/action row, responsive actor scale, stage-centered caption and clearer library hierarchy. | The real saved library plus bundled demo replaces three fabricated prototype identities. |
| Wardrobe | Restored stacked category icons, heading/count, larger art cards, separate None, contextual New item and Use a saved design actions. Details and palette follow the equipped item in the selected category. | Real palette ramps, quality notes, layers, all supported equipment slots and fitted/shared designs remain. These can require scrolling. |
| Creator | Restored left size guide, name above the form, vertical trait labels, separated editor actions and readable compass. Removed legacy mobile name width limit; tabs size to their labels without overlap. | Real linked prompt, allowed trait values, help, V3 validation, costs, enhancement, recovery and persistence replace disconnected prototype fields. |
| Preview | Restored playback hierarchy, useful prompt expansion/copy and responsive hero scale. Painted bounds avoid shrinking the actor because of transparent equipment padding. | Requested facing remains explicit; unavailable clips use Still. Inspect opens the real precision tools, not a placeholder. |
| Live scenes | Restored Side-scroller sky/horizon composition and separate fading reflection; resize retains position/camera. Side entry chooses an available horizontal facing. | Actual body/equipment coverage, pivots, animation timing and sparse-direction resolver take precedence over fixture assumptions. Moves stays hidden during gameplay as approved. |
| Keyboard | Partial chord release recomputes facing; stale repeats do not restart input. Screen changes focus the world; focused fields keep native editing. Escape/Backspace dismiss a prompt/menu before leaving the studio. | Native form focus, reduced-motion pause and valid existing facing are preserved. |
| Selection wheel | Filters horizontal/modifier gestures and expires old wheel bursts; rapid events do not accidentally skip characters. | Search-filtered saved projects are the navigation source. |
| Touch | One movement finger keeps ownership; a second deliberate button tap works, while dragged or canceled touches do not activate equipment. | The guarded fallback is retained only after direct browser comparison proved native activation did not occur while the first touch stayed held. |
| Motion state | Selecting a move preserves the user's paused state. Resize stops input safely without teleporting the character. | Preview clock phase and valid facing survive view switches; resetting both like the prototype would discard useful state. |

## Theme and implementation boundaries

These corrections belong to the production consumer: layout dimensions, responsive rules, workflow markup, canvas fitting and input coordination. Bronze UI 0.2.1 still owns shared colors, surfaces, borders, radii, focus, controls and scrollbar appearance. No copied color palette, GlassKit, lighting shader or tint has been added. Exported sprites and PixelLab generation code are unchanged.

`bounds.ts` computes a cached stable painted union; `ground.ts` fits that union; the existing compositor still draws full frames at their original pivots. A separate reflected copy receives the reflection mask. Selection thumbnails use the same real presentation path as the world. Background URLs remain modular and reuse cached assets.

## Evidence and repeatable verification

From `app/`, with the pinned Node 24.22.1 runtime and normal offline local servers:

```text
npm run check
npm test
npm run build
# Serve the build on 5208; keep the approved prototype on 5202.
# PowerShell: $env:BASE='http://127.0.0.1:5208'
npx playwright test --config playwright.experience.config.ts
node scripts/compare-experience.mjs --phase after
```

Local evidence is ignored by Git under `app/test-results/experience-comparison/`: `gallery-before.html` preserves the original integration; `gallery-after.html` compares the approved prototype directly with corrected production. The JSON manifests record dimensions, build assets and browser/API errors. Never cite an earlier gallery as evidence of a later build.

The [input verification](../testing/production-parity-input-verification.md) records dedicated behavior tests. Final visual review and suite results must be recorded after the final build; this document's decision matrix is not itself a claim that every control has passed.

## User-requested stopping checkpoint

The user paused work for transfer to Claude before final visual approval. Latest build `bootstrap-DNqv5yzi.js` / `bootstrap-1aqQx-Rl.css` passed all 23 focused browser cases (54.5s); type check/build passed and the unit run passed 770 with one existing skip. The final `after` comparison and supplemental dialog captures were **not run**; `index.html` remains the intermediate iteration1 gallery. The standard 98-workflow suite has not been rerun against these corrections. See the [independent review checkpoint](../testing/production-parity-review-checkpoint.md) and [Claude continuation handoff](../../.claude/handoffs/2026-10-23-production-parity-ui-ux-continuation.md). A confirmed remaining issue is desktop creator focus skipping Name in the heading and selecting Details instead.
