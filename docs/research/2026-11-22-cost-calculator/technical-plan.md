# Cost estimate sheet: technical plan

November 22, 2026 · branch `claude/pixellab-cost-calculator-e4bedd` at `646c8bdc6` · Phase 1 (investigation only, no app code changed). Implements [implementation-plan.md](implementation-plan.md); the [plan corrections](#plan-corrections-and-risks) at the end need a decision before Phase 2. Line numbers are at this revision; paths start at `app/src/`.

## Files

| File                                                                   | Change                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `studio/movePricing.ts` (new)                                          | Pure price helpers **moved** out of `studio/create.ts` (list below). `create.ts` and its current importers import them from here. No queue, db, client or Svelte imports.                                                                                                                |
| `studio/costEstimate.ts` (new)                                         | The calculator model, pure: `seedScenario`, `characterCost`, `spentCost`, `planRate`, plus the generic-count arithmetic. Lives in `studio/`, not `lib/pricing/`, because every input it needs is a Studio module (see correction 1).                                                     |
| `studio/CostSheet.svelte` (new)                                        | The sheet. Loaded through `Lazy.svelte`. Uses `Sheet.svelte`, `DirectionCompass.svelte`, Bronze UI classes. Steppers are a local snippet (no stepper exists to reuse, correction 9).                                                                                                     |
| `lib/items/items.ts`                                                   | Receives `itemPoseGens` and `poseGens` (from `lib/items/run.ts:1783-1806`) and `posable`/`anchorable` (from `run.ts:1617-1636`), so pricing never imports the item runner. `itemPoseGens` widens its item type to `Pick<Item, 'slot' \| 'key' \| 'layers'>`; no caller changes behavior. |
| `studio/stateGenerationPlan.ts`                                        | Adds `managedStateCost(side)`, extracted from the inline managed quote in `studio/stateGeneration.ts:338-346`, which then calls it.                                                                                                                                                      |
| `lib/store/generation.ts`                                              | Exports `creationCall(base)` (the `CREATORS` lookup at `:159` and `:189`) so `generationDetails` and the calculator share it.                                                                                                                                                            |
| `lib/pixellab/plans.ts`, `docs/pixellab-plans.md`                      | `PLAN_PRICES` beside `PLAN_JOB_LIMITS`: `{ 1: { low: 9, list: 12, generations: 2000 }, 2: { low: 22, list: 24, generations: 5000 }, 3: { low: 50, list: 50, generations: 10000 } }`, dated and sourced in the doc.                                                                       |
| `studio/state.svelte.ts`                                               | `SheetId` gains `'cost'` (`:245-269`); `ui` gains `costProject: ''` next to `directionProject` (`:314`).                                                                                                                                                                                 |
| `studio/Studio.svelte`                                                 | `parts.cost: () => import('./CostSheet.svelte')` (`:64-85`) and `{#if ui.sheet === 'cost'}<Lazy load={parts.cost} id={ui.costProject} />{/if}` beside Adjust frame (`:391`).                                                                                                             |
| `studio/CharacterActions.svelte`                                       | One `role="menuitem"` row, same pattern as Directions (`:44-56`): `ui.costProject = id; ui.sheet = 'cost'`, label `openerLabel(t('characterActions.costEstimate'))`. Shown for every id, demo included.                                                                                  |
| `studio/icons.ts`                                                      | `export { default as Calculator } from '@lucide/svelte/icons/calculator'`.                                                                                                                                                                                                               |
| `locales/*.json` (9 files)                                             | New `costSheet.*` keys and `characterActions.costEstimate`.                                                                                                                                                                                                                              |
| `test/unit/cost-estimate.test.ts` (new), `test/e2e/characters.spec.ts` | See [Tests](#tests).                                                                                                                                                                                                                                                                     |

Suggested split into two commits: (1) the pure extraction with no behavior change, verified by the existing tests that cover `moveEstimate`, `apiPlans` and items; (2) the calculator.

## Price functions reused

Everything below is called, never re-implemented. "Move" means a move to `studio/movePricing.ts` unless stated.

| Need                         | Function (current location)                                                                                                                                                                                                                      | Action                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draw + registration          | `estimate` (`studio/create.ts:306`), `proDrawGens`/`PRO_RECEIPTS` (`:281-295`), `EST` (`:216`), `costBody` (`studio/characterConfig.ts:205`)                                                                                                     | Move `estimate`, `proDrawGens`, `PRO_RECEIPTS`, `EST`. Use `maxGens` (cold joint checks), as the v4 arithmetic does.                                                                            |
| Imported setup               | `0.25 + EST * U` per `lib/rig/setup.ts:60` (`setupPlan`, async, decodes images)                                                                                                                                                                  | U counted from the stored base cell hashes (same hashes `setupPlan` computes). A unit test pins it against `setupPlan`.                                                                         |
| Move body                    | `moveEstimate` (`:2611`), `moveFrames` (`:2379`), `nativeMoveGens` + table (`:2395-2421`), `moveMotionFrames`/`moveMotionGens` (`:2423-2433`), `isAuthoredAction`/`moveAnimationModel` (`:2375-2378`), `moveDirections`/`genDirs` (`:1713-1724`) | Move all. Call `moveEstimate(m, { ...spec, items: [] }).body`. Add `motionSource` to its `Pick` (cost-model note).                                                                              |
| Pose prices                  | `poseBatches`, `poseCallGens`, `poseGensFor` (`lib/rig/clips.ts:218-234`)                                                                                                                                                                        | Already pure; used through `itemPoseGens`.                                                                                                                                                      |
| Item design (standing dress) | `planItem` (`lib/items/items.ts:629`), `planGens` (`:748`), `padOf` (`:430`), `canPose` (`:580`), `editGens` (`:742`), `anchorChunks` (`:727`), `chromaEdit.plan` (`studio/itemRoute.ts:141-160`) as the parity reference                        | Call `planGens(planItem(rig, spec), paddedCell)` with `standingCoverage`-shaped specs. `itemRoute.ts` imports `run.ts`, so the calculator does not import it.                                   |
| Item fit per move            | `itemPoseGens` (`lib/items/run.ts:1785`), `planAnchoredMove` (`items.ts:840`), `planCalls` (`:809`), `hasCompleteCells` (`lib/dress/dress.ts:302`), `extendable` (`create.ts:2338`)                                                              | Move `itemPoseGens` to `items.ts`, `extendable` to `movePricing.ts`. Skeleton items price with `itemPoseGens`, anchored with `planGens(planAnchoredMove(...))`, exactly as `moveEstimate` does. |
| States                       | `planStateGeneration`, `localStateCost` (`studio/stateGenerationPlan.ts:144-168`); managed quote (`stateGeneration.ts:338-346`)                                                                                                                  | Call as-is; extract `managedStateCost`. Pro Flash needs a live quote (correction 10).                                                                                                           |
| Recorded spend               | `recordedCost` (`lib/store/generation.ts:61`)                                                                                                                                                                                                    | Called on the filtered provenance list (see Spent).                                                                                                                                             |
| Tier                         | `accountTier` (`lib/pixellab/plans.ts:17`) on `app.balance`                                                                                                                                                                                      | 1 to 3 map to `PLAN_PRICES`; 0, unknown and 4+ show Tier 1 rates and the picker.                                                                                                                |
| New defaults                 | `characterDraftWithDefaults` (`studio/creationSettings.ts:138`), `currentCreationSettings` (`studio/settingsDefaults.svelte.ts:48`), `facingOf`, `toggleDirection`, `toggleMirror` (`characterConfig.ts:351-389`)                                | The New tab and the compass edits use the creator's own draft helpers.                                                                                                                          |

`movePricing.ts` importers to update: `apiPlans.ts`, `MoveSheet.svelte`, `MoveReviewSheet.svelte`, `stateJointFit.ts`, `CreateSheet.svelte` and any other `create.ts` importer of the moved names. `create.ts` stays the runtime owner of everything with side effects. Hypothetical items and moves are priced by adding synthetic entries (`cost-move-N`, `cost-item-N`) to a cloned rig/manifest, which `moveEstimate`, `planAnchoredMove` and `planCalls` already accept; nothing is persisted.

## Reading a manifest

From a `StoredProject` (`lib/store/project.ts:14`); All loads `listProjects()` (`:49`, manifests only, no images).

- **Directions:** `rig.directions` (`{ id, mirrorOf? }`). Drawn = no `mirrorOf`. The compass edits a `{ selected, mirrors }` draft and prices `facingOf(draft)`.
- **Moves:** `rig.animations` with `kind !== 'state'` and `id !== DEFAULT_MOVE` (`lib/rig/rig.ts:110`). Frames = `cells`. Route per drawn facing from `sources[dir]`: `route` (`skeleton-v3`, `pixminimax`, `v3`, `import`) and `motion` (`authored:<action>`, `managed-skeleton-v3:walking-8-frames`, `pixminimax:<text>`, `<model>:<text>`, written at `create.ts:4212-4229`). This maps back to a `moveEstimate` spec (`action`, `animation.model`, `frameCount = cells`). `import` clips are free art whose measurement is in setup.
- **Items:** `m.items` minus the base, minus export-only variants (`variantOf`). Held = `requireSlot(m, item.slot).class === 'held'`. Route `item.route`, `key`, `standing`, `dressed`, `coverage`, layer cell. Covered pairs come from `hasCompleteCells`.
- **States:** `rig.animations` with `kind === 'state'`, one cell. Route from `source.endpoint`: `'local'` (capture, `studio/moveActions.svelte.ts:166-172`) costs 0; `/create-character-state`, `/edit-images-v2`, `/edit-animation-v2`, `/transfer-outfit-v2`, `/edit-image-pixen`, `/edit-image-pro-flash` (saved by `saveState`, `studio/stateGeneration.ts:775-785`). The State route for added States is the most recent generated one, else the user's State model setting (default `pro`).
- **Setup:** a created character has a draw call in base provenance (`creationCall`): body size from `params.image_size`, model from the endpoint, priced by `estimate`. An imported character (no draw call) is priced as setup: `0.25 + EST * U`.
- **Inherited art:** items with `copiedFrom` (their provenance is the source character's, `lib/store/manifest.ts:142-144`) and provenance with an empty `requestHash` (the bundled demo's, `public/fixtures/s2/fixture.json`; every paid record has one, `create.ts:1095`, `run.ts:1490-1506`). Inherited art is priced $0 and excluded from Spent. This also implements the demo-copy rule without loading the fixture.

## Default for a new move

`MoveSheet.svelte` starts a new move with the user's Moves model setting, default **Skeleton V3** (`creationSettings.ts:60`, `MoveSheet.svelte:417-419`), the first unused suggestion (`:249`, order `idle, walk, run, slash, hurt, death, cast` in `studio/promptSuggestionDefaults.ts:88-95`) and base frames 8 (`:408`), resolved by `moveFrames` (`:482-491`). On a rig with no moves that is authored **Idle, 4 frames**: `P(4) + 4 * 0.1 = 3.4` gens per drawn facing. README-v4's "eight-frame PixMiniMax" default is wrong (correction 4).

## Retries: what is recorded

- Item drafts keep each re-rolled attempt as provenance with `replaced: true` (`lib/items/run.ts:1510-1525`); `recordedCost` counts them (`generation.ts:65`).
- Move re-rolls are **not** recorded: a move saves only its final records (`create.ts:4206-4229`, one `recs` entry per clip, `:784`). Discarded drafts, deleted items and remade items leave nothing in provenance.
- The owner's workspaces: 66 item calls, 0 `replaced`. A measured rate would default to 0 retries, which is false.

So a redo rate is **not measurable**. Retries default to 2 everywhere (character and All), with the hint "default". `RecordedCost.replaced` can still be shown in Recorded usage.

## Spent and to go

- **Spent** = `recordedCost` over the base and item provenance of the character, minus inherited provenance; dollars = `generations * list / allowance + usd`; unknown calls counted. All = sum over characters. Deleted items and open drafts are missing, so it is a floor; the Recorded usage row says "Saved artwork only".
- **To go** per line, first pass times `1 + retries`:
  - setup: 0 for an existing character;
  - a move: 0 if it exists with its saved frame count, else its body for every drawn facing (frame edit = re-render, added facing = that facing);
  - an item × move × drawn facing: 0 if `hasCompleteCells`, else its fit. An item that is not `extendable` (copies, the demo's items, items whose `baseHash` no longer matches) cannot be fitted in the app, so covering a move it lacks prices a remake: one standing design plus every covered fit (correction 6);
  - an added item: design plus fits; a State: per added State.
- **Headline** = existing work priced from scratch (inherited art $0) + to go, times `1 + retries` for the from-scratch part as v4 does. **Spent · to go** under it; End cost = spent + to go.

Large counts stay cheap: one generic move, one generic item and one generic item × generic move price are computed once and multiplied; only existing and edited rows are priced individually (the v4 approach).

## UI

- Entry: `CharacterActions.svelte` (used by `Toolbar.svelte:606` and `experience/Experience.svelte:715`). Icon `Calculator`.
- `CostSheet.svelte` inside `Sheet.svelte` (title "Cost estimate"). Scope tabs: Bronze `bu-segmented` radio markup as in `SettingsItemSegmented.svelte`, equal width, character name ellipsized with its full accessible name. Tier: `bu-input` select. Retries, Moves, Items, States: a local stepper snippet (`bu-action` minus/plus around a numeric `bu-input`, typeable, no maximum). Directions: `DirectionCompass` with `onmirror` and `mirrorTargets={['north-west', 'west', 'south-west']}` so mirror buttons appear only on the west side. Details: `bu-details` with receipt rows that open in place; move rows edit frames from `moveFrameCounts(model, cell)`; item rows edit move coverage; "Show more" pages of 16.
- Demo (`fixture:` id) is locked as in v4: $0, inputs hidden, note "Use an editable copy to estimate additions."
- Layout and spacing local; no theme overrides. Reset restores the seed and the connected tier.

## Locale keys

`characterActions.costEstimate` ("Cost estimate…"), and under `costSheet`: `title`, `scopeLabel`, `scopeAll`, `scopeNew`, `tier`, `tierFree`, `tierN`, `tierOneRates`, `retries`, `retriesHint` (default / edited), `moves`, `items`, `states`, `directions`, `directionCount`, `increase`, `decrease`, `headlineRange` (`{low} to {high} · {gens}`), `gens`, `spentToGo`, `spent`, `basisRebuild`, `basisNew`, `basisAll`, `basisDemo`, `basisCopy`, `details`, `setup`, `setupNote`, `movesRow`, `itemsRow`, `statesRow`, `framesValue`, `fitToMoves`, `standingOnly`, `allMoves`, `someMoves`, `remake`, `held`, `stateRoute.*`, `recordedUsage`, `savedArtworkOnly`, `unpriced`, `showMore`, `noRows`, `demoLocked`, `reset`. Pluralized with the existing ICU pattern; added to all 9 locales (`locales.test.ts` enforces it).

## Tests

Unit, `test/unit/cost-estimate.test.ts`, building manifests with the existing `test/unit/equipment-fixture.ts` helpers (no owner data):

- parity: `characterCost` lines equal `moveEstimate`, `chromaEdit`-equivalent `planGens(planItem(...))`, `itemPoseGens` and `planStateGeneration` for the same work; v4 Adventurer first pass 1,046.75 gens and Scout 70.35;
- 3/12/15/16 frames; 4 vs 8 directions with mirrors; 64, 92 and 128 px (92 px PixMiniMax uses the 6-gen fallback); held padding at 64 and 256 px;
- imported setup `0.25 + 0.1 * U` against `setupPlan` on one fixture;
- inherited art: a `copiedFrom` item and an empty-`requestHash` item price $0, are excluded from Spent, and a new move prices them as remakes;
- projection: 0 moves then 6 adds item fits for every item; a covered pair has 0 to go;
- Spent from provenance with `replaced` and USD; tier rates and USD formatting.

End-to-end: extend `characters.spec.ts` "unselected demo shows its facts after reload": open the demo's character menu, Cost estimate…, see $0.00, switch to New, add one item, see a nonzero total. Command: `npm run e2e -- characters -g "unselected demo"`. Phase 2 checks: `npm run check`, `npm test`, that spec, plus `api-peek` if the `apiPlans.ts` imports change behavior (they should not).

## Owner workspace sanity check (aggregates only)

Priced by hand from the rules above, retries 0:

| Character         | Recorded (own) | Existing work, from scratch | +1 default move (Idle 4 frames)            |
| ----------------- | -------------: | --------------------------: | ------------------------------------------ |
| 92 px, 38 items   |    380.65 gens |                 380.65 gens | 4 × 3.4 + 38 × 4 × 3 = 469.6 gens          |
| 128 px, 20 copies |      4.65 gens |                   0.65 gens | 13.6 + 20 remakes × (10 + 12) = 453.6 gens |
| 92 px, 8 copies   |      0.65 gens |                   0.65 gens | 13.6 + 8 × 22 = 189.6 gens                 |

The 128 px gap is a deleted move (4 PixMiniMax calls still in base provenance). Without the inherited-art rule the copies would add 280 gens to existing work and 280 to Spent, counted twice in All.

## Plan corrections and risks

1. **`lib/pricing/` would import Studio.** Its inputs (`costBody`, `moveFrameCounts`, `planStateGeneration`, creation settings) all live in `studio/`. Fix: `studio/movePricing.ts` + `studio/costEstimate.ts`.
2. **The price functions are in heavy modules.** `create.ts` imports the queue, client and db; `itemPoseGens`, `posable`, `anchorable` live in `run.ts` (queue). Fix: the moves above, with importers updated, no re-export shims.
3. **Copies and the demo carry someone else's provenance.** Fix: the inherited-art rule. Without it Spent and All double count, and the acceptance check fails for two of the three owner characters.
4. **New-move default is Skeleton V3 Idle (4 frames), not PixMiniMax 8.** Repeating Idle for every added move underprices. Proposal: added moves follow the Moves sheet's suggestion order (Idle, Walk, Run, Slash, Hurt, Death, Cast), skipping existing ones, then repeat the character's typical move (or the last suggestion). **Needs decision**; the plan says "copy the typical move".
5. **Walk is not the 3-gen preset in practice.** `MoveSheet` sends `motionSource` as `'managed'` or `'standalone'` (`MoveSheet.svelte:547`, `resolveMoveMotionSource` at `create.ts:3271`), never undefined once resolved, so Walk prices as PixMiniMax at 8 frames plus poses, not `3 + ...`. The calculator passes `motionSource: 'standalone'` for described motions (same table as managed).
6. **Copied and demo items cannot be extended** (`extendable` needs `dressed`, a route, a key and a matching `baseHash`; none of the 28 owner copies or 6 demo items qualify). v4's "54 to fit six copied items to Hurt" is not something the app can do. Proposal: price a remake; the row says "Remake" and coverage can be narrowed. **Needs decision.**
7. **Retries are not measurable** (above). Default 2, hint "default". The plan's "this character's own redo rate" should be dropped.
8. **Local Pro State includes an optional 0.1 per view joint fit in v4.** The Studio State quote does not, so this breaks "totals match the app's quotes". Proposal: drop it. **Needs decision.**
9. **No stepper or scope-tab component exists** in the app or Bronze UI 0.3.9 (AGENTS.md still says 0.2.8; `package.json` has 0.3.9). Fix: a local snippet using Bronze classes; if the owner wants a shared stepper look, it belongs in Bronze UI first.
10. **Pro Flash States have no offline price** (live quote). Proposal: added Pro Flash States price as Local Pro and say "Pro Flash priced as Pro".
11. **Added directions are what-if only.** The Directions sheet can only remove or mirror; adding a drawn facing to an existing character is not possible in the app. The calculator still prices it (per-facing move and fit cost; item design repriced at the new facing count).
12. **Savings tips and recolor are in the v4 mock but not in the plan.** Proposal: leave them out of this card (YAGNI); a Later card if wanted. Reset stays.
13. **Spent is a floor** (deleted items, discarded drafts, rejected move attempts). Reading the Activity ledger would fix it but the plan rules Activity out (2,500-call cap).
14. **Studio state change.** Adding a `SheetId` and a `ui` field touches `state.svelte.ts`, listed as cross-cutting in AGENTS.md Testing (full suite). It changes no behavior; I propose only the covering spec plus CI. **Needs confirmation.**
15. **92 px and other off-table sizes** price PixMiniMax at the 6-gen fallback (`create.ts:2418-2420`). Parity is correct but the estimate may be high there; noted in the hint, not changed.
16. **Created characters drawn from a reference** store no reference size in provenance; the setup line then assumes the `image_size` area and is marked assumed.
