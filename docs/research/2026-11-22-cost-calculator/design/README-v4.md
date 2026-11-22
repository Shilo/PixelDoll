# PixelDoll cost calculator, version 4

Open [the mock-up](cost-calculator-v4.html) directly in a browser. It starts in dark mode with the estimate open. The Studio art and example data are embedded. Close the sheet to change **Settings → Appearance** or reopen **Cost estimate…** from the character name menu.

- [Adventurer with Details open](cost-calculator-v4.html?details)
- [Long character name at phone width](cost-calculator-v4.html?phone&long-name)
- [Light phone preview](cost-calculator-v4.html?phone&theme=light&details)
- [All three characters](cost-calculator-v4.html?all&details)
- [New character defaults](cost-calculator-v4.html?new&details)
- [Bundled demo at $0](cost-calculator-v4.html?demo&details)
- [Editable demo copy, first pass](cost-calculator-v4.html?demo-copy&retries=0&details)
- [Free / Trial, first pass](cost-calculator-v4.html?tier=0&retries=0)
- [Studio with the sheet closed](cost-calculator-v4.html?studio)

Flags combine. Use **theme=light** or **theme=dark**, **tier=0** through **3**, and any nonnegative whole number for **retries**. The phone flag caps the preview at 390 CSS px. The sheet also adapts to the actual viewport.

## Scope and controls

**Adventurer** loads the saved character’s directions, moves, items, States, and retry history. Every top-level input is editable for planning. Changes are kept in memory for the current preview, and **Reset** restores the seed for the current scope and the starting Tier. A long name gets an ellipsis while the control retains its full accessible name. Mirroring enables the opposite drawing, and removing a mirror’s source promotes its target to a drawing. This matches the New character compass.

The compass puts mirror buttons on the outer edges of the west and east directions, leaving room for each arrow and label. It sits beside the Moves, Items, and States steppers and wraps above them when space is tight.

**All characters** adds the saved scenarios for Adventurer, Scout, and Adventurer copy. The copy contributes only its paid additions or changes. Tier applies throughout the calculator. All characters has its own retry setting, seeded from the roster’s combined history and applied uniformly. Select a receipt row to open that character. Individual what-if edits stay available in that character’s scope.

**New** answers a distinct question about a character that does not exist yet. The existing character scope already supports arbitrary count and direction edits, so a blank Custom segment would duplicate that work and require extra setup. New starts where the creator starts, with a 64 px body, an 80 px frame, eight facings with the three western views mirrored, and zero moves, items, or States. A new generic move uses eight-frame PixMiniMax until a saved character’s most common frame-count and route combination supplies a better default. New items are worn on every move. Added States inherit the saved route, with Local Pro as the New default.

Retries count extra attempts per paid step. The example records preserve original paid calls and their replacements. Adventurer has six replacements across three original calls, giving two extra attempts after rounding. An empty history defaults to two. **Details** opens the receipt in place, with per-move frames, per-item coverage, State route, and settled usage. The large count inputs can be typed, and long lists reveal more rows on demand.

The quiet **Spent** line under the headline shows cash first, followed by generations. It uses the selected character’s records on the character tab and the full roster’s records on **All characters**. It is hidden on **New**. The **Recorded usage** row in Details includes the unpriced-call note.

## Example arithmetic

The large number is allocated USD at the list rate. The smaller line gives the discount range when distinct and the rounded generation count. Division uses the plan allowance and retains precision until display. Free / Trial uses Tier 1 rates. Actual charges depend on the paid invoice, remaining allowance, and separately billed credits. [Cost model](../cost-model.md) · [DeepSeek pricing corrections](../review-deepseek.md)

| Plan   | Monthly low / list | Monthly gens | USD per gen low / list |
| ------ | -----------------: | -----------: | ---------------------: |
| Tier 1 |           $9 / $12 |        2,000 |      $0.0045 / $0.0060 |
| Tier 2 |          $22 / $24 |        5,000 |      $0.0044 / $0.0048 |
| Tier 3 |          $50 / $50 |       10,000 |      $0.0050 / $0.0050 |

| Adventurer first pass | Calculation                                         |                        Gens |
| --------------------- | --------------------------------------------------- | --------------------------: |
| Setup                 | 2 V3 draw + 0.25 registration + 5 × 0.1 cold checks |                        2.75 |
| Six eight-frame moves | 6 × 5 × (3 pose + 8 × 0.1 joint checks)             |                         114 |
| Eight worn items      | 8 × (10 standing + 6 × 5 × 3 fit)                   |                         800 |
| Two held items        | 2 × (20 padded standing + 3 × 5 × 3 fit)            |                         130 |
| States                | Zero                                                |                           0 |
| **Total**             | **First pass plus two extra attempts**              | **1,046.75 × 3 = 3,140.25** |

At Tier 2 this is **$13.82 to $15.07**. Recorded usage is **$0.28** from 42 × $0.0048 plus $0.08 in USD credits, plus one unpriced call. Local Pro States use one 10-gen edit in these fixtures and include the optional cold joint-fit budget of 0.1 per drawn view. Scout uses one packed 1-gen Pixen edit per State. Its first pass is 2.55 setup + 2 × 3 × (1 + 0.8) body + 2 × (10 + 2 × 3 × 3) items + 1 State = **70.35 gens**.

The bundled demo contributes zero. The editable copy reuses its matching body, moves, standing designs, and covered cells. Changed frame counts represent regenerated art, and new drawn facings, moves, items, fits and States are priced. At three drawn facings the copy pays 11.4 gens for Hurt, 54 to fit six copied items to Hurt, and 74 for Gloves and Boots including their fits. That is **139.4 gens** first pass, or **$0.61 to $0.67** at Tier 2. All characters with two retries gives (1,046.75 + 70.35 + 139.4) × 3 = **3,769.5 gens**, or **$16.59 to $18.09**. The mock-up represents the app’s art comparisons with fixture IDs, frame counts, and coverage. [Demo copy implementation](../../../../app/src/studio/create.ts#L4549)

## Savings tips

Up to two tips show the largest positive differences between displayed headline prices. They can mirror the drawn west side when the original east facings are already drawn, return expanded held items to their usual moves, trim authored clips to 12 frames when that preserves the original length floor, or substitute a recolor for a generic added item when a compatible worn design covers the same work. Trimming preserves at least eight frames. Any later coverage edits beyond the recolor source are priced. Each tip preserves the move list and item count.

Artwork comes from PixelDoll’s embedded Studio worlds and demo fixture. [Lucide icon license](https://lucide.dev/license)
