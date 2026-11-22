# PixelLab cost calculator review

**Ship a character rebuild estimate with a small what-if tool.** The mock-up spends its best space on account math and a retry guess. The useful question is what it costs to produce this character’s chosen art and how that changes when you add gear or moves.

## Ranked findings

1. **Price the work Studio would actually do.** The fixture’s `1,046.75` reconciles for its chosen route, but changing a frame count to 16 silently changes the body model. The model also documents sparse facings, imported art that can switch to grid or block a held fit, and States with unknown quotes. Seed from saved routes and coverage, flag assumptions and blocked work, and share the actual request planners with Studio. Match the production sequence in parity tests. `planItem` can pack Idle and Walk together, while ordinary Studio extensions price them individually. Keep unknown charges beside the priced subtotal and use a range only for priced alternatives. [Mock-up](design/cost-calculator.html) · [Cost model](cost-model.md)

2. **Lead with `≈1,047 gens` under `First-pass rebuild`.** The $5.23 is an allocated slice of a subscription. A subscriber may owe $0 extra, a new subscriber pays for the plan, and USD-credit rates vary by request. There is also no measured average to lead with. Round the headline, keep precision in Details, and remove the gauge, tier switch, and plan-term inputs from v1. The unknown-allowance gauge invents its own scale. If verified allowance context earns a place later, use plain text in Details, with any dollar figure labeled `Share of subscription`. [Plan and account evidence](cost-model.md#dollars-and-account-data)

3. **Delete None / Some / Many.** One retry can buy a single 3-gen pose, a 20-gen full held-item redress in this fixture, or a repair at a different rate. Two attempts may be common in someone’s workflow and still tell us nothing about which work repeats. `0 / 2 / 4` and a global stepper have the same missing unit. Say `Extra attempts cost more` by the total. If users need a contingency tool, put `Add an extra attempt` in Details, choose the named step and affected moves or facings, then allow a count for that specific operation. Show the added gens and any selected refits. Polling, local edits, and reuse of completed work add no new paid attempt. [Retry and receipt evidence](cost-model.md#acceptance-and-price-drift)

4. **Group gear together and surface move coverage.** In the browser, `+ Held items` added 20 gens for Standing alone. At the same five drawn facings, fitting it to three eight-frame moves adds another 45. Worn gear can also have limited coverage, and held padding can raise the initial dress cost. Use one `Gear` entry, with `Worn` or `Handheld` chosen only when adding a what-if item. Show `Standing only` or the selected moves and the price delta before accepting the scenario edit. Seed existing items from their actual coverage. [Equipment rules](cost-model.md#equipment-fit-and-repair)

5. **Keep the entry by the character and drop the scope switch.** `All characters (1)` costs a row for the same estimate. With more characters it would mix a library total with edits to one character. Use `Estimate cost…` in the Customize name menu and keep paid quotes in their existing action reviews. The rebuild answers a real comparison question. Add a remaining-work estimate only when intended coverage is explicit, since a missing layer may be intentional. Move `Spent so far` to a quiet `Activity` link in Details. If showing a summary there, use deduplicated, character-attributed receipts and retain reported gens, USD, and unknown or partial charges. Keep it out of the rebuild math. [Plan](README.md) · [Activity reconciliation](../../../app/src/lib/pixellab/activity.ts#L184)

6. **Make Details a receipt with controls where they matter.** At 320 × 568 and 844 × 390, the account and retry block pushes the useful controls below the fold. Expanded desktop Details takes over 2,000 px of scroll content. Use aligned label/value rows and open a single move or gear row to edit it. Fold route and price notes into `Assumptions`. Remove the tips block and show a saving only beside a choice the user is considering, with its tradeoff. Use Studio’s existing sheet, global theme, and focus return. Keep the total and close action in view, with the sprite beside the sheet on wide screens or above it on phones. Lazy-load the sheet through `Lazy.svelte`, keep it local to the active manifest, and use shared pure pricing without session, queue, or transport dependencies. [Mock-up](design/cost-calculator.html) · [Usability principles](../../usability-principles.md)

## Proposed layout

```text
MAIN
Estimate cost · Adventurer                     [Close]
≈1,047 gens · First-pass rebuild
Extra attempts cost more
Gear · 10 designs                          [Try gear…]
Details                                             ›

DETAILS
First-pass breakdown                           gens
Character & rig                                2.75
Moves · 6                                114   [Edit]
Gear · 10                                930   [Edit]
States                       only when present or planned
Assumptions ›             Activity ›
```

Show `Reset changes` after the first edit. In an expanded gear row, use `Sword · Run, Slash, Thrust`. If a price is missing, put `1 step unpriced` next to the subtotal and identify the step in Details.

Reviewed the local HTML in Chromium in desktop, Details, phone, light, compact portrait and landscape states. Exercised menu entry, retry selection, scope, adding gear, reset, and close. Production behavior and live billing were outside this review.
