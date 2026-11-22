# PixelLab cost calculator mock-up

Open [cost-calculator.html](cost-calculator.html) directly in a browser. It starts in the dark main state. Expand **Details** for the breakdown, directions, move frames, weapon coverage, States, and plan terms. Use the sun or moon button to switch themes.

- [Details with retries](cost-calculator.html?details&retries=many)
- [Phone preview](cost-calculator.html?phone)
- [Phone preview with light theme and Details](cost-calculator.html?phone&details&theme=light&retries=some)
- [Character name menu entry](cost-calculator.html?studio)

The previews use one offline example project. **Cost calculator…** lives in the character name menu in Customize. The trailing sheet keeps the sprite visible on wide screens and becomes a bottom sheet on phones. The mock-up retains the Studio world art, fixture sprite, Lucide icons, and inline Bronze UI styling.

## What changed

- **First pass and retries.** The headline is the full rebuild in gens. The prior repair percentage had no measured frequency behind it. **None**, **Some**, and **Many** model 1×, 1.5×, and 2× first-pass usage as sensitivity assumptions. The bar fills to first pass and adds a striped band to the selected retry endpoint. None is the default. The band illustrates a scenario, and actual usage can land outside it.
- **Activity and scope.** **Spent so far** shows example settled ledger usage separately from the rebuild. The example contains three reported calls (2 + 10 + 3 = 15 gens) and one registration call with unknown cost. The prototype counts unique call IDs. Production should use the Activity ledger’s reconciled request cost and character attribution, preserving partial usage and counting calls with missing costs. **All characters (1)** uses the same example and sums the estimates per character. What-if edits affect Adventurer only. [Activity reconciliation](../../../../app/src/lib/pixellab/activity.ts)
- **Plan context.** The example connection selects Tier 3. The allowance bar shows how much of a plan month the scenario uses, and plan value is the allocated subscription share. Price and allowance are editable. Tier 1 and 2 start with dated catalog prices and blank allowances so users can enter their actual terms. With no allowance the bar uses a 2× first-pass scale. USD credits have endpoint-specific rates. [Plan prices and account data](../cost-model.md#dollars-and-account-data)
- **What-if controls.** Worn and held items have separate steppers. Worn items cover all six moves. Held items use the 96 px padded canvas and individual move selections in Details. Extra weapons start with Standing only. Details lists the named moves and their own frame steppers. The example keeps body and frame size at 64 px and assumes fresh V3 text creation, authored Skeleton V3 moves through 15 frames, skeleton fits, and no uploaded item references. A 16-frame edit uses the supported Text V3 body route while equipment still uses two balanced Skeleton V3 pose calls. States use the local Pro text scenario. [Cost-model research](../cost-model.md)
- **Savings.** Tips recalculate the first pass with one change and show the difference in gens. A tip appears only when its change saves generations. Palette recolor adds zero paid operations and is compared with creating and fitting one more worn design. Reset restores character inputs while preserving scope, retry assumption, and plan terms.

## Example arithmetic

Adventurer has a 64 px body and frame, eight directions with five drawn and three mirrored, and six moves with eight frames each. The eight worn items cover every move. The Sword covers Run, Slash, and Thrust, and the Staff covers Run, Thrust, and Cast. There are zero States.

| First-pass component | Arithmetic                                                                                                                    |         Gens |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -----------: |
| Character setup      | V3 text draw 1 + ceil(8 × 64² / 65,536) = 2. Registration adds 0.25. Budget five missing rest-joint measurements at 0.1 each. |         2.75 |
| Body moves           | 6 × 5 × (3 for the eight-frame authored pose + 8 × 0.1 for output-joint checks)                                               |          114 |
| Worn items           | 8 × (10 for one 64 px dress batch + 6 × 5 × 3 for fits)                                                                       |          800 |
| Held items           | 2 × (20 for two 96 px dress batches + 3 × 5 × 3 for fits)                                                                     |          130 |
| States               | 0 × 10 for the local Pro image edit at 64 px                                                                                  |            0 |
| **First pass**       | **2.75 + 114 + 800 + 130**                                                                                                    | **1,046.75** |

Saved rest joints can reduce the setup cost by up to 0.5 gens. At 64 px the worn dress holds up to 16 views per call. A held layer adds 16 px per side and its 96 px dress holds four views initially, then three new views per call because later calls carry an anchor. At three, five, and eight drawn views a held dress uses one, two, and three calls at 10 gens each. A Skeleton V3 pose call costs 2 gens through 3 frames, 3 through 12, and 4 through 15. Sixteen frames split into two eight-frame calls for 6 gens per independently drawn item facing. More generally, pose batches balance across ceil(frames / 15) calls. [Creation and move estimator](../../../../app/src/studio/create.ts), [Move frame choices](../../../../app/src/studio/moveAnimationOptions.ts), [Item packing and prices](../../../../app/src/lib/items/items.ts), [Pose batching](../../../../app/src/lib/rig/clips.ts), [State estimator](../../../../app/src/studio/stateGenerationPlan.ts)

Tier 3 plan value uses $50 ÷ 10,000 = $0.005 per gen. The first pass is $5.23375, displayed as **about $5.23**, or **10.5%** of the allowance. Some projects 1,570.125 gens at its upper endpoint and displays **about $5.23 to $7.85** and **10.5% to 15.7%**. Many projects 2,093.50 gens at its upper endpoint and displays **about $5.23 to $10.47** and **10.5% to 20.9%**. These values describe the share of the plan used by the estimate. Any incremental cash charge depends on actual billing and available balance.

| Tip scenario                                                          |                                                                                                                                                                  First-pass savings |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| Start with eight drawn views and mirror the three west views          |                                                                  3 × (0.1 rest check + 6 × 3.8 body + 8 × 6 × 3 worn fit + 2 × 3 × 3 held fit) + 2 × 10 held dress = **574.7 gens** |
| Add Walk to the Sword and then restrict it to its three example moves |                                                                                                                                                             1 × 5 × 3 = **15 gens** |
| Set Run to 16 frames, then trim it to 12                              | Ten items save 10 × 5 × (6 − 3) = 150 gens. The body rises from 5 × (1 + 1.6) = 13 to 5 × (3 + 1.2) = 21 when it switches back to the authored route. Net savings are **142 gens**. |
| Recolor one worn item instead of generating a new design              |                                                                                                                                 10 dress + 6 × 5 × 3 fit − 0 recolor = **100 gens** |

Artwork comes from PixelDoll’s app/public/worlds/ and app/public/fixtures/s2/. Functional icons are from [Lucide](https://lucide.dev/license). The mock-up embeds its assets and runs offline. Its ledger and connection are fixture data.
