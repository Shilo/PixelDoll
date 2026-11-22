# Challenge: per-project PixelLab cost calculator

Research review: November 22, 2026. Reviewed against the November 16 cost snapshot and the current planning code in this worktree. No PixelLab request was sent.

**Verdict:** the app can price one action on one route from the real planners. It cannot total a project in dollars without presenting a confident-looking floor that users will treat as a budget. The proposed calculator is the wrong product shape.

## 1. Can it be accurate?

Only for one known route, one action, first pass. Every additional scope dimension multiplies error.

| Error source                 | Size of the error                                                                                                                                                                                                                                                                                      | Evidence                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Retries and rejected artwork | 2x attempts costs +100%; 3x costs +200%. The owner's own sensitivity table spans $510 to $10,160 for the same catalog.                                                                                                                                                                                 | README:41-50. Retries are explicit paid actions, so they never appear in a first-pass total.               |
| Grid fallback                | An 8-frame item pose costs 3 units. The same clip-direction through `inpaint-v3` costs 10, 15 or 25, so +233% to +733%.                                                                                                                                                                                | `app/src/lib/rig/clips.ts:231`, `app/src/lib/items/items.ts:213-229`, `app/src/lib/items/items.ts:673-688` |
| Frame count                  | Pose price is 2 units at 3 frames, 3 at 4-12, 4 at 15. A single editable "frames" field overprices a 3-frame clip by 50% and underprices a 15-frame clip by 25%; 16 frames split into two batches and cost 6, not 3. For ordinary items, idle and walk can share one call, cutting a pair from 6 to 3. | `clips.ts:218-231`, `items.ts:713-718`                                                                     |
| Direction count              | Cost uses non-mirrored generated directions. An input of 8 on a 5-generated rig overstates item poses by 60%; an input of 4 on a 3-generated rig overstates by 33%.                                                                                                                                    | `app/src/studio/itemRoute.ts:65-79`, `app/src/studio/create.ts:1713-1723`                                  |
| Character model              | Default V3 is 2.25 units. Standard is 1.25. Pro is 10.25 at 48 px and 25.25 at 128 px, with no quote elsewhere. Pro Flash starts at 6.25 and rises with canvas. The base differs by 4.5x to 11x.                                                                                                       | `create.ts:281-293`, `create.ts:306-325`                                                                   |
| Body size                    | V3 creation is 2.25 up to about 90 px, 3.25 at 96 px, 5.25 at 168 px. Uploaded reference art reprices by reference area and can reach 8.25 at 256 px.                                                                                                                                                  | `create.ts:316-323`                                                                                        |
| Provisional prices           | Pro has no price quote at all and is interpolated from two receipts. Pro Flash reads a provisional provider cost. Inpaint tiers are inferred from 11 receipts. PixMiniMax falls back to 6 units for any unlisted size, non-square cell, or frame count outside its table.                              | `create.ts:287-293`, `create.ts:309-310`, `items.ts:196-201`, `create.ts:2412-2421`                        |
| Provider price changes       | Every constant is a dated receipt or inference. A provider change silently invalidates a total, with unbounded error until the code and its tests are updated.                                                                                                                                         | `clips.ts:230`, `items.ts:196`, `create.ts:280`                                                            |
| State generation             | `edit-image-pro-flash` has no known price. `edit-images-v2` is a range, 10 to 25 per batch. No single number exists.                                                                                                                                                                                   | `app/src/studio/stateGenerationPlan.ts:151-160`                                                            |
| Dollar basis                 | $0.005 per unit is Tier 3 allocated subscription value, not cash. USD credits have a separate basis. The code already carries a second constant, 0.00513. Actual usage can report generations, USD, neither, or both.                                                                                  | README:25, `create.ts:2330`, `app/src/lib/store/generation.ts:61-84`                                       |
| Route selection              | Item method is chosen automatically and depends on joints and slot class. Imported joint quality silently switches a project to the expensive grid route.                                                                                                                                              | `itemRoute.ts:131-139`, `items.ts:673-688`                                                                 |
| Tier                         | Tier gates access and allowance. It appears in no price function. `accountTier` can also return null, so "current tier" is not always knowable.                                                                                                                                                        | `app/src/lib/pixellab/plans.ts:17-28`, `docs/pixellab-plans.md:15`                                         |

A per-action estimate with fixed constants can be within about 10%. A project total inherits all of the above at once. Expect 2x to 3x misses from retries alone, and 3x to 8x misses on the fallback route. Dollars are worse: they are not a single quantity the app can compute.

The already-shipped joint-check quote demonstrates the honest form: "estimated 0.1 gens or $0.005" (`app/test/e2e/studio.spec.ts:7573`). It says "or", not a summed total, because the billing basis is unknown until PixelLab reports usage.

## 2. Is a per-project calculator the right product?

**For:** a team planning a wardrobe needs an aggregate before spending. Per-action prices do not answer "what will 20 items across 5 moves cost". A what-if tool can show that cutting weapon coverage saves more than cutting cosmetics.

**Against:** the aggregate is only a floor, and the actionable decision is always the next paid action. The app already prices each of those at the point of decision: character creation (`CreateSheet.svelte:112-114`), a new item (`NewItemSheet.svelte:252`), a move or repair (`MoveSheet.svelte:1480`, `:2353`), a plan review (`ApiPeek.svelte:117-119`), and recorded spend in Activity and generation details (`ActivitySheet.svelte:115-129`, `generation.ts:61-84`). A separate calculator asks users to retype parameters the manifest already knows, then divides the price from the submission it just bypassed.

That is also a simplicity problem. `docs/usability-principles.md:6-8` says omit unnecessary features and keep estimates at the point of decision. A standalone calculator screen is neither.

**Recommendation:** do not build a free-form project calculator. Build a small **Project cost** view with three parts:

1. **Spent.** Actual recorded generations, reported USD and unknown-call counts, already available from provenance. Do not merge them into one dollar number.
2. **Committed.** Priced offers for unfinished drafts and pending paid steps, already computed by the planners.
3. **Cost to finish current coverage.** Compute gaps from the manifest (`hasCompleteCells`, missing moves, item coverage) and call the real planners. Label it a first-pass floor and show a 1x to 3x retry band.

This is more accurate than a calculator because it uses the project's actual routes, frame counts and coverage, and it does not ask users to learn the pipeline. If "what if" is still required, limit it to "preview one more move" or "preview one more item design" using the same planners, with no invented fields.

## 3. Risks

- **Misleading numbers.** A total implies precision. Users will budget against a first-pass floor that omits retries, fallbacks, imported-art repairs, labor and USD credits. The blast radius is real money.
- **Two pricing truths.** Either the calculator imports the planners, in which case it is a UI over the existing code and needs a real manifest, or it reimplements the README formulas, in which case it drifts the first time a receipt changes. The repository already shows the failure: 0.005 in the research doc versus 0.00513 in `create.ts:2330`.
- **Maintenance drift.** Prices are receipts with dates: pose 2/3/4, edit 10/15/25, inpaint 10/15/25, Pro receipts at 48 and 128. A parallel layer needs parallel tests and will not fail when a stored route changes.
- **Scope creep.** Models, tiers, States, USD, retries, per-character, scenarios, tips, save and compare. Each one is a feature.
- **UI complexity.** A screen of knobs teaches the pipeline before the user has a character, against the app's stated simplicity-first rule.
- **Tips age into noise.** The useful advice is scope advice from the research (pilot first, cut weapon coverage, avoid unnecessary bodies), not arithmetic. Static tips duplicate docs and will be ignored.

## 4. Spot-check of three "Calculation basis" formulas

### `H(D) = 1 + ceil(max(0, D - 4) / 3)`

**Match, with a definition trap.** Held items pad a 64 px cell to 96 (`items.ts:430-436`). `editFrameCap` allows 4 frames at 96 px (`app/src/lib/pixellab/routes.ts:204`). Dressing chunks 8 generated views as 4, then 3 plus 1 (`items.ts:656-665`, `items.ts:727-735`), which is 3 calls at 10 units each (`items.ts:742-745`). H(8) = 3, H(5) = 2, H(4) = 1. All match.

The trap: D must be generated views, not direction count. The code dresses `coverage().dirs`, which excludes mirrored directions (`itemRoute.ts:68`). A default taken from the rig's 8 direction slots on a 3-generated or 5-generated rig will overprice weapons by 20 or 10 units each. The README prose "eight views therefore require three calls" (README:139) reads as direction slots to a casual implementer.

### `Pose = S * 3 * D * [(C + U) * M + sum(k_w)]`

**Mismatch.** The constant 3 is only the 8-to-12-frame price. `poseCallGens` returns 2 at 3 frames and 4 at 15 frames (`clips.ts:231`). A 3-frame clip is overpriced 50% (3 vs 2); a 15-frame clip is underpriced 25% (3 vs 4); 16 frames split into two 8-frame batches and cost 6, not 3. For ordinary items, idle and walk can share one call up to 15 cells, so a 4-frame idle plus an 8-frame walk costs 3 units, not 6 (`items.ts:713-718`).

The README reference uses 8-frame clips, so its examples are internally correct. A calculator with an editable frames field is not. It would either need per-move frame counts or would misprice every clip that is not 8 to 12 frames.

### `Body = S * [2.25 + D * (5.6 * M + 2)]`

**Match only for a text-created V3 body at 64 px, with described 8-frame moves and exactly one walk per direction.** Creation is 1 + 0.25 + ceil(area * 8 / 65536), which is 2.25 at 64 px (`create.ts:316-323`). A described 8-frame direction is 0.8 output checks + 3 render + 1 motion source + 0.8 source checks = 5.6 (`create.ts:2634-2644`, `clips.ts:231`, `create.ts:2429-2433`). Walk adds 2, matching the formula's +2.

It fails elsewhere:

- Pro is 10.25 at 48 px and 25.25 at 128 px, with no quote elsewhere (`create.ts:281-293`, `:311-314`).
- Pro Flash is 6.25 upward and size-dependent (`create.ts:316-323`).
- Standard is 1.25 (`create.ts:322-323`).
- V3 at 96 px is 3.25, at 168 px is 5.25, and reference uploads reprice by area (`create.ts:316-323`).
- A custom start frame adds 0.1 per direction, which the formula omits (`create.ts:2645-2649`).
- A project with no walk overstates by 2 per direction.

### Dollar formula

`Allocated USD = Total * 0.005` (README:134) does not match the shipped joint-check constant of 0.00513 (`create.ts:2330`). The e2e assertion still expects $0.005 because the UI rounds (`studio.spec.ts:7573`). Any dollar total built on one of these is already contradicted by the other.

**Bottom line:** ship cost so far and cost to finish, priced by the real planners, with ranges and unknown counts. Do not ship a project calculator that outputs one dollar figure.
