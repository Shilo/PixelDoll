# PixelLab cost calculator: research, review and mock-up

November 22, 2026. Research and design only; nothing in the app changed and no PixelLab request was sent. Board card: [Research and mock up a PixelLab cost calculator](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=313998475).

| File                                           | Author                           | What it is                                                                                                |
| ---------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [cost-model.md](cost-model.md)                 | GPT 6.2 Sol (medium)             | Every paid step, its price rule and source line, a pure-function spec, defaults, dollars, worked examples |
| [challenge-deepseek.md](challenge-deepseek.md) | DeepSeek v4.1 Flash (low)        | Adversarial review of the idea and three README formulas                                                  |
| [design/](design/README.md)                    | GPT 6.2 Sol (medium), Impeccable | Interactive HTML mock-up, revised once after review                                                       |
| [review-deepseek.md](review-deepseek.md)       | DeepSeek v4.1 Flash (low)        | Rule-by-rule accuracy check of cost-model.md against the code                                             |
| [review-opus.md](review-opus.md)               | Opus 5.5 (medium)                | Design and function critique of mock-up v2                                                                |
| [review-sol.md](review-sol.md)                 | GPT 6.2 Sol (medium)             | Design and function critique of mock-up v2                                                                |

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

## What the calculator should be

- **Place:** "Cost calculator…" in the character name menu in Customize, opened as a lazy-loaded sheet beside the character (bottom sheet on phones). It is character-scoped planning; Settings > PixelLab stays for the account.
- **Main view:** first-pass gens and plan value, a bar showing the share of a plan month, a Retries switch (None / Some / Many = 1x / 1.5x / 2x sensitivity), "Spent so far" from Activity kept separate, scope switch This character / All characters, two steppers (worn items, held items).
- **Details (progressive):** breakdown by setup, body moves, worn, held, States; direction layout (4/3, 8/5, 8/8 drawn); each move's frame count; each held item's move coverage; States (default 0); plan tier with editable price and allowance.
- **Tips:** each one is a recomputation with one change, shown only when it saves something, with the exact saving (mirror west views, restrict a weapon to its moves, trim 16 frames to 12, recolor for 0).
- **Defaults:** read from the active manifest (cell, directions and mirrors, moves and frame counts, items and slot class, held-item coverage, connected tier). Unknown creation model defaults to V3 and is labeled assumed.

## How to build it accurately

1. **One source of truth.** Move the price rules Studio already uses into a pure `lib/pricing/` module with no queue or transport imports. Studio quotes and the calculator both call it. Never re-derive the README formulas.
2. **Pure pipeline:** `scenarioFromManifest(manifest, balance)` → `characterCost(scenario)` (setup, moves, items, States as priced lines with low/high and unknown flags) → `projectCost(characters, plan)` → `savings(scenario)` as diffs. All numbers stay decimal until display.
3. **Parity tests:** for fixture projects, `characterCost` must equal the sum of the Studio planners' quotes; boundary cases at 3/12/15/16 frames, mirroring, 64 vs 96 px held padding, reference slots and grid tiers.
4. **Lazy load** the sheet through the existing `Lazy.svelte` so no calculator code ships until it opens. Localize all copy.
5. **Plan terms** in a dated table next to `PLAN_JOB_LIMITS`, editable in the UI.

## Corrections found along the way

- The November 16 README totals reconcile at their own assumptions, but its formulas are only valid for 64 px V3 bodies and 8-frame clips: the pose price is 2 / 3 / 4 gens for up to 3 / 12 / 15 frames and two calls from 16, and idle and walk can share one call.
- `D` must be drawn (non-mirrored) views. Feeding it the total direction count overprices by up to 60%.
- Joint checks are quoted at $0.00513 in USD credits (`create.ts:2330`), while the research uses $0.005 of Tier 3 plan value. Both are right on different bases; the calculator must never mix them in one total.
- Sol's first mock-up invented a 50% repair allowance that was 57% of its total. The revision replaced it with the retry band.

## Public plan prices (checked November 22, 2026)

Tier 1 $12, Tier 2 $24, Tier 3 $50 a month, corroborated by several third-party listings. Tier 3's 10,000 gens is corroborated; Tier 1's 2,000 has one source; Tier 2's allowance was not verified. PixelLab's own pricing page loads by script and could not be read. USD credits have endpoint-specific prices, so there is no single dollars-per-gen rate for them.

## Decisions for the owner

1. Placement: character name menu (recommended) or Settings.
2. Lead with **rebuild** (what this character costs) or **cost to finish** (only missing coverage). Rebuild is simpler and is what the mock-up shows; cost to finish needs reliable gap detection and is a good second step.
3. Whether to show dollars at all for unknown tiers, or generations only until a plan is chosen.
