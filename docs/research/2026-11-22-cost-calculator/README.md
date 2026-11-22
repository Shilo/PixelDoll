# PixelLab cost calculator: research, review and mock-up

November 22, 2026. Research and design only; nothing in the app changed and no PixelLab request was sent. Board card: [Research and mock up a PixelLab cost calculator](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=313998475).

| File                                               | Author                           | What it is                                                                                                |
| -------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [cost-model.md](cost-model.md)                     | GPT 6.2 Sol (medium)             | Every paid step, its price rule and source line, a pure-function spec, defaults, dollars, worked examples |
| [challenge-deepseek.md](challenge-deepseek.md)     | DeepSeek v4.1 Flash (low)        | Adversarial review of the idea and three README formulas                                                  |
| [design/](design/README.md)                        | GPT 6.2 Sol (medium), Impeccable | Interactive HTML mock-up, revised once after review                                                       |
| [review-deepseek.md](review-deepseek.md)           | DeepSeek v4.1 Flash (low)        | Rule-by-rule accuracy check of cost-model.md against the code                                             |
| [review-opus.md](review-opus.md)                   | Opus 5.5 (medium)                | Design and function critique of mock-up v2                                                                |
| [review-sol.md](review-sol.md)                     | GPT 6.2 Sol (medium)             | Design and function critique of mock-up v2                                                                |
| [review-deepseek-run2.md](review-deepseek-run2.md) | DeepSeek v4.1 Flash (low)        | A second, independent accuracy run; adds a 512×256 repair grid note                                       |
| [design/README-v3.md](design/README-v3.md)         | GPT 6.2 Sol (medium), Impeccable | Mock-up v3: cash first, demo excluded, arithmetic                                                         |
| [design/README-v4.md](design/README-v4.md)         | GPT 6.2 Sol (medium), Impeccable | **Current mock-up v4**: scope tabs, all main inputs at the top, retries from the character                |

## Round 2 review (mock-up v2)

- **Accuracy:** every price rule checked out except one: an explicit Skeleton V3 start frame costs 0.1 on every first pass, cached or not. DeepSeek also listed 13 edge cases (walk forces 8 frames, automatic anchor route, State route gates, 0.25 registration counted twice if both presentations are summed) that only the real planners get right.
- **Too much text:** both critics count about 120 words before Details. Target under 40: one fact per line, no pipeline notes, tips as chips such as `Mirror west −575`.
- **Headline:** both critics lead with a rounded generation range, because dollars are a share of a subscription, not a cash charge, and the app's own quotes are in generations. There is no measured average to show. Dollars go on a second line when the plan is known.
- **Retries:** None / Some / Many has no unit. Opus: an integer "retries per step" stepper (0 to 3), defaulting to this character's own history (`RecordedCost.replaced`). Sol: drop the global control and let users add extra attempts to a named step.
- **Worn vs held:** merge into one Items stepper. Only a held item's first design costs more (padded canvas); fits cost the same and each item already has its own moves. v2 also mispriced a new held item at 20 gens with no moves.
- **Remove:** scope switch, in-sheet theme toggle, typed plan price and allowance (`/balance` already reports them), long disclaimer. Spent so far should read item provenance, not Activity, which keeps only 2,500 calls.
- **Details:** a receipt of rows (setting, gens) that open in place to edit, plus Assumptions and Activity links.

The pre-review v2 mock-up is kept locally in `design/backup/` for comparison (not committed).

## Verdict

Build it, but narrower and more honest than a free-form spreadsheet. It is feasible and can be accurate for the **first pass** because the app already prices every paid action in pure code (`estimate`, `moveEstimate`, `planItem` + `planGens`, `poseCallGens`, `planStateGeneration`). Sol fed those functions synthetic projects and reproduced the November 16 MVP exactly (2,271.25 gens) plus two other scenarios.

It cannot predict accepted artwork. Retries, repairs, fallback routes and provisional prices (Pro, Pro Flash, inpaint bands, some States) move real spend by 1.5x to 3x or more. So the calculator must show a first pass plus a labeled retry band, never one confident dollar figure.

## What the calculator should be (v4, owner decisions)

- **Place:** "Cost estimate…" in the character name menu in Customize, a lazy-loaded sheet beside the character (bottom sheet on phones).
- **Scope tabs:** [character name, truncated] / All characters / New. The character only seeds the values; everything is editable and Reset restores them. New starts from New character defaults for a character that does not exist yet (chosen over a blank "Custom"). All characters sums per-character totals; only Tier and Retries change there.
- **Cash first.** Headline in USD at the tier's list price, then the discount range and generations small: `$15.07` / `$13.82 to $15.07 · 3,140 gens`, then `Spent $0.28 · 42 gens` (recorded gens × tier rate + USD credit charges). USD per generation = monthly price / monthly generations. No currency conversion.
- **Main inputs at the top:** Tier (connected tier), Retries (extra attempts per paid step; this character's own redone / paid calls, else 2), Directions (arrow compass with mirror buttons like New character, no presets), Moves, Items, States steppers seeded from the character. No maximums; no progress bar.
- **Details:** a receipt of setup, moves (with frames), items (with their moves), States and recorded usage; each row opens in place to edit.
- **Tips:** at most two chips with the exact saving that apply the change. Only quality-safe changes: mirror the west side, limit a weapon to its moves, trim a move that stays at 8 frames or more, recolor instead of a new design.
- **Demo excluded.** The bundled demo starts at $0. A copy of the demo (`rig-<demo base hash>`) counts nothing identical to the demo; new items, moves, fits of copied items to new moves, States and regenerated art are priced.
- **Defaults** come from the active manifest and the connected tier; Free/Trial shows Tier 1 rates.

## How to build it accurately

1. **One source of truth.** Move the price rules Studio already uses into a pure `lib/pricing/` module with no queue or transport imports. Studio quotes and the calculator both call it. Never re-derive the README formulas.
2. **Pure pipeline:** `scenarioFromManifest(manifest, balance)` → `characterCost(scenario)` (setup, moves, items, States as priced lines with low/high and unknown flags) → `projectCost(characters, plan)` → `savings(scenario)` as diffs. All numbers stay decimal until display.
3. **Parity tests:** for fixture projects, `characterCost` must equal the sum of the Studio planners' quotes; boundary cases at 3/12/15/16 frames, mirroring, 64 vs 96 px held padding, reference slots and grid tiers.
4. **Lazy load** the sheet through the existing `Lazy.svelte` so no calculator code ships until it opens. Localize all copy.
5. **Plan prices** as static data next to `PLAN_JOB_LIMITS` (PixelLab's API does not report them).

## Corrections found along the way

- The November 16 README totals reconcile at their own assumptions, but its formulas are only valid for 64 px V3 bodies and 8-frame clips: the pose price is 2 / 3 / 4 gens for up to 3 / 12 / 15 frames and two calls from 16, and idle and walk can share one call.
- `D` must be drawn (non-mirrored) views. Feeding it the total direction count overprices by up to 60%.
- Joint checks are quoted at $0.00513 in USD credits (`create.ts:2330`), while the research uses $0.005 of Tier 3 plan value. Both are right on different bases; the calculator must never mix them in one total.
- Sol's first mock-up invented a 50% repair allowance that was 57% of its total. The revision replaced it with the retry band.

## Plan prices (confirmed by the owner, November 22, 2026)

| Tier | List price | Lowest discounted price | Generations per month | USD per generation |
| ---- | ---------: | ----------------------: | --------------------: | -----------------: |
| 1    |        $12 |                      $9 |                 2,000 | $0.0045 to $0.0060 |
| 2    |        $24 |                     $22 |                 5,000 | $0.0044 to $0.0048 |
| 3    |        $50 |             no discount |                10,000 |            $0.0050 |

USD credits have endpoint-specific prices; recorded USD charges are added as reported.

## Open questions

1. Rebuild (what this character costs) or cost to finish (only missing coverage)? v3 shows rebuild; the demo-copy rule already prices only additions.
2. Whether all inputs at the top stay there or some move back into Details (v4 tries them all at the top).
