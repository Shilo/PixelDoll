# Cost estimate sheet: implementation plan

Board card: [Build the PixelLab cost estimate sheet](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=314057309). Design reference: [mock-up v4](design/cost-calculator-v4.html) and [README-v4](design/README-v4.md). Price rules: [cost-model.md](cost-model.md) with the corrections in [review-deepseek.md](review-deepseek.md).

## What it answers

"What will this character cost when it is finished, how much have I spent, and what is left?" in US dollars, for the open character, all characters, or a new one. The character only seeds the inputs; every input is editable to model any character.

## Numbers shown

- **Headline: estimated total** for the current inputs, priced from scratch, including retries, in USD at the tier's list price. Below it: the discount range and generations, small (`$13.82 to $15.07 · 3,140 gens`).
- **Spent:** the character's recorded generations × the tier's list rate, plus recorded USD charges. Read from item and character provenance (`recordedCost` in `lib/store/generation.ts`), not Activity.
- **To go:** the estimate (with retries) of the work in the inputs that the character does not have yet. Shown as `Spent $1.90 · $14.20 to go`. End cost prediction = spent + to go.
- **Bundled demo** (`fixture:` id): spent $0, its own art costs $0; only additions count. A demo copy counts nothing identical to the demo (see README-v3 rule).

## Inputs (top of the sheet, in this order)

1. Scope tabs, equal width: `[character name, ellipsis]` `[All]` `[New]`.
2. Tier: connected tier from `/balance` via `accountTier`; Free/Trial and unknown show Tier 1 rates. Picker to change it.
3. Retries: extra attempts per paid step, stepper, no maximum, typeable. Default: this character's own redo rate from provenance if retries are actually recorded there; otherwise 2. Verify how replaced and rerolled attempts are recorded before trusting the rate; if it cannot be measured reliably, default 2 and say so in the hint.
4. Moves, Items, States: steppers seeded from the character, no maximum, typeable.
5. Directions: `DirectionCompass` with mirror buttons only on the west side (NW, W, SW), on the left, no presets. Seeded from `rig.directions` and `mirrorOf`.
6. Details (collapsed): receipt rows Character setup, Moves (each with frames), Items (each with its moves), States, Recorded usage. Rows open in place to edit. In All, Details lists each character's total; tapping one switches to it.

All: only Tier and Retries are editable; totals are summed per character. New: starts from New character defaults with 0 moves, 0 items, 0 States.

## Projection rules (predicting the end cost)

- Every item covers **every move in the inputs** unless the user narrows it in Details. A character with 39 items and no moves therefore jumps by 39 item fits per added move per drawn direction.
- Added moves copy the character's typical move (most common frame count and route); with no moves, use the Moves sheet's default for a new move on this rig.
- Added items are worn items covering every move. Held items keep their padded-canvas design price.
- Added States use the character's State route, else the default local route.
- Existing art counts in the total (priced) and is excluded from "to go"; an item already fitted to a move costs nothing to go.

## Architecture

- `app/src/lib/pricing/` (new, pure, no Svelte, no queue or transport): `scenarioFromManifest`, `characterCost` (lines for setup, moves, items, States with gens and a to-go part), `spentCost`, `tierRates`, `usd`. It must call the existing price functions (`estimate`, `nativeMoveGens`, `moveMotionGens`, `moveMotionFrames`, `poseCallGens`/`poseGensFor`, `editGens`/`planItem`/`planGens`, `padOf`, `planStateGeneration`, `EST`) rather than copy formulas. If a function lives in a heavy Studio module, extract it to a shared pure module and import it from both places; do not duplicate it.
- Plan prices: a static table next to `PLAN_JOB_LIMITS` in `lib/pixellab/plans.ts` (Tier 1 $9 to $12 / 2,000; Tier 2 $22 to $24 / 5,000; Tier 3 $50 / 10,000), documented in `docs/pixellab-plans.md`.
- UI: `studio/CostSheet.svelte` loaded through `Lazy.svelte` like the other sheets, using `Sheet.svelte`, Bronze UI components and existing stepper, segmented and compass components. Layout and spacing local; no theme overrides.
- Entry: "Cost estimate…" in the character name menu (`CharacterActions.svelte`).
- Every string localized in all locale files under `app/src/locales/`.

## Tests

- Unit (Vitest): pricing parity against the Studio quotes for real manifests (`moveEstimate`, item plans): v4 example totals; 3/12/15/16 frames; 4 vs 8 directions with mirrors; 64 vs 92 vs 128 px; held padding; demo and demo copy; projection with 0 moves then 6; spent from provenance; tier rates and USD.
- End-to-end: one case in an existing spec that opens the sheet from the character menu and changes one input. Extend before adding.

## Acceptance

- Totals match the app's own per-action quotes for the same work.
- For the owner's workspaces (four-direction 92 and 128 px characters with 9 to 39 items and no moves), the zero-retry total of existing work is close to the recorded spend, and adding moves projects item fits for every item.
- Matches v4 visually in dark and light, desktop and phone; readable, quiet, no editor feel.
- `npm run check`, unit tests and the covering end-to-end spec pass.
