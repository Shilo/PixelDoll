# PixelDoll cost estimate, version 3

Open [the mock-up](cost-calculator-v3.html) directly in a browser. It starts in dark mode with the estimate open. Close the sheet to use **Settings → Appearance** or reopen **Cost estimate…** from Adventurer’s name menu. The mock-up embeds the same world art and character sprite as v2 and runs offline. The connection and receipts are example data.

- [Character name menu](cost-calculator-v3.html?studio)
- [Desktop Details](cost-calculator-v3.html?details)
- [Phone main view](cost-calculator-v3.html?phone)
- [Phone Details in light mode](cost-calculator-v3.html?phone&details&theme=light)
- [Free / Trial with zero retries](cost-calculator-v3.html?tier=0&retries=0)
- [Bundled demo at $0](cost-calculator-v3.html?demo&details)
- [Adventurer copy with two new items and one new move](cost-calculator-v3.html?demo-copy&details)

Use `tier=0` through `3` and `retries=0` through `4` to seed other scenarios. The default example estimates a full rebuild. Details opens each setting beside its cost. Move and item rows open individually for frame counts and coverage. Adding an item gives it every move. Removing an item takes it off the end of the list. The changes are local to the mock-up.

## USD rates

Divide the lowest discounted price and the list price by the monthly generation allowance. The example uses its connected Tier 2. Free / Trial shows Tier 1 rates.

| Plan   | Lowest monthly price | List monthly price | Gens per month |        USD per gen |
| ------ | -------------------: | -----------------: | -------------: | -----------------: |
| Tier 1 |                   $9 |                $12 |          2,000 | $0.0045 to $0.0060 |
| Tier 2 |                  $22 |                $24 |          5,000 | $0.0044 to $0.0048 |
| Tier 3 |                  $50 |                $50 |         10,000 |            $0.0050 |

The headline uses the list-price end so users can budget without assuming a discount. The smaller line shows the discount range and rounded generations. The receipt uses the same list-price rate and includes the selected retries. The plan prices allocate part of a subscription to the work. Actual out-of-pocket charges depend on the invoice, remaining allowance, and separately billed USD credits.

## Savings tips

The calculator shows up to two tips with positive savings, largest first. Each chip applies its change and shows the difference between the displayed headlines, to the cent. Reset restores the original estimate. When savings tie, tips follow this order.

1. **Mirror the west side.** Draw five of eight directions or three of four and fill the west-side views by mirroring.
2. **Limit a held item to its usual moves.** If a weapon covers extra moves, keep the selected moves from its original coverage. The chip lists the moves the weapon will appear in.
3. **Trim to a cheaper pose tier.** Trim a move above 12 frames to 12, where each facing costs one fewer generation per pose. A trim must leave at least eight frames and at least as many as the move's default.
4. **Recolor an item.** Fill a generic item you added with a free palette variant of an earlier worn item that already covers the requested moves and facings. If later edits need extra fits, the estimate includes those costs.

All tips preserve the move list and item count.

## Example arithmetic

Adventurer has a 64 px body and frame, eight directions with five drawn, six authored eight-frame moves, eight worn designs that cover every move, and two held designs that cover three moves each. States starts at zero.

| First-pass work | Arithmetic                                                            |         Gens |
| --------------- | --------------------------------------------------------------------- | -----------: |
| Character setup | 2 for the V3 text draw + 0.25 registration + 5 × 0.1 cold rest checks |         2.75 |
| Body moves      | 6 × 5 × (3 pose + 8 × 0.1 joint checks)                               |          114 |
| Worn items      | 8 × (10 standing design + 6 × 5 × 3 fit)                              |          800 |
| Held items      | 2 × (20 standing design + 3 × 5 × 3 fit)                              |          130 |
| States          | 0 × (10 local Pro edit + 5 × 0.1 cold joint checks)                   |            0 |
| **Total**       | **2.75 + 114 + 800 + 130**                                            | **1,046.75** |

One extra attempt per paid step doubles the total to **2,093.5 gens**. Tier 2 gives **$9.21 to $10.05** (× $0.0044 to $0.0048). The fixture defaults to one retry because its example history includes a replaced attempt. Two retries buy three attempts per step.

**Spent so far** uses settled fixture receipts. At the Tier 2 list rate, (2 + 10 + 3) × $0.0048 + $0.08 in USD credits = **$0.15** after rounding. Details flags the additional unpriced call.

Each item buys its standing design once. The example uses unreferenced skeleton fits. The held design’s 96 px cell fits four drawn views in its first batch and three more per anchored batch. Later fits use the same rates for both item types. Standing reuse is free. Moves stay within the authored Skeleton V3 range of 3–15 frames. One local Pro State edit covers the selected facings at 64 px, with cold checks budgeted for new art. Optional enhancements, grid repairs, redraws, and other routes are outside this fixture. [Cost model](../cost-model.md) · [DeepSeek corrections](../review-deepseek.md)

## Bundled demo and editable copy

A project ID starting with `fixture:` starts at **$0**. What-if additions require an editable copy. The copy ID is `rig-<demo base hash>`, where the hash portion is the original `baseHash.slice(7, 19)`. Its copied base body and standing art are free. A move, item, or item-on-move cell is free when its ID and corresponding cell hashes match the demo. Price new or changed body moves and new or changed item × move × drawn-direction coverage. New item designs, newly drawn directions, States, and replaced or regenerated art use their usual rates. Fitting a copied item to a new move is paid work. The offline mock-up simulates these comparisons with the fixture IDs and coverage. Editing a move’s frame count represents regenerated art. [Copy implementation](../../../../app/src/studio/create.ts#L4549)

In **Adventurer copy**, the new eight-frame Hurt move costs **11.4 gens** (3 drawn directions × (3 pose + 8 × 0.1 joint checks)). Fitting the six copied items to Hurt costs **54 gens** (6 × 3 × 3). Gloves and Boots cost **74 gens** together (2 × (10 standing + 3 moves × 3 directions × 3 fit)). With zero retries, **139.4 gens** at Tier 2 is **$0.61 to $0.67**, with **$0.67** in the headline.

Artwork is from PixelDoll’s embedded Studio worlds and demo fixture. Functional icons are from [Lucide](https://lucide.dev/license).
