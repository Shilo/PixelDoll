# Review: cost calculator plan and mock-up

November 22, 2026. Independent review by Claude Opus 5.5 of [README.md](README.md), [cost-model.md](cost-model.md), [challenge-deepseek.md](challenge-deepseek.md) and [design/](design/README.md), checked against app code. No app checks, builds or PixelLab requests.

**Verdict:** the pricing research is solid; the sheet is not. It leads with a falsely precise floor, models retries with a label that hides what they cost, splits items on a distinction the app does not make, ignores account data the app already has, and asks users to read about 120 words plus pipeline jargon. Cut it to one number range, three controls and one line of history.

## Findings, most important first

### 1. The headline is a falsely precise floor (owner concern 2)

- **Problem:** `1,046.75 gens · first pass` with Retries defaulting to None. Two decimals imply a quote; the default shows the cheapest case the user will rarely see. "First pass" is pipeline jargon.
- **Evidence:** mock-up `retry = 'none'`, `numbers` keeps two decimals; README: retries move spend "1.5x to 3x or more"; the paper-doll ledger had two of four designs retried (cost-model.md, Acceptance).
- **Fix:** lead with a **gens range**, rounded to 3 significant figures: `1,050 – 2,100 gens`. Low end = everything works first try; high end = with the retry setting. When retries are 0, show one number. Second line, muted: `≈ $5–10 · 11–21% of your month`.
- **Why gens, not currency:** every confirm button in the app quotes gens (`Est. {gens} gens`, locales/en.json), and the PixelLab balance in the top bar is gens (`ui/TopBar.svelte:28`). The estimate must be comparable with what the user will press. Dollars here are a share of a subscription, not cash: a subscriber with allowance left pays $0 extra, so a leading dollar figure invites a wrong budget. Keep dollars as the secondary translation.
- **Why not an average:** there is no measured distribution to average. A midpoint is a guess dressed as data. A labeled range is honest and just as compact.

### 2. Retries: None / Some / Many hides what a retry is (owner concern 3)

- **Problem:** a uniform 1x / 1.5x / 2x multiplier with vague words. The owner's own experience (two retries common) is 3x under this model, beyond "Many". "Some" means half a retry per step, which nobody can picture.
- **What a retry actually is:** in the app a retry ("Try again") re-buys **one failed paid step**, only its missing views (`lib/items/run.ts:1706,1994`; `studio/create.ts:3110`). Steps and their price at the example's 64 px, 5 drawn views: item look 10 gens (held 20), one item move fit 15 (3 per view), one body move 19. New items buy only the standing look (`studio/itemRoute.ts:80`, `standingCoverage`); moves are fitted later, per move.
- **Hidden data:** provenance already records retried attempts and their cost: `RecordedCost.replaced`, "Attempts later re-rolled; their cost is included" (`lib/store/generation.ts:52-73`).
- **Fix:** an integer stepper **Retries per step: 0 to 3**, labeled exactly that, so 2 means three tries of each paid step (3x). Default: this character's measured rate from provenance (`replaced` calls ÷ accepted calls), shown as `you average 0.6`; with no history, default 1 and say "assumed". Details lists the price of one retry per step type, so "a retry" is concrete. Uniform per-step is honest because each step repeats at its own price; per-type steppers are not worth the controls.

### 3. Too much text (owner concern 1)

- **Problem:** about 120 words in the main view before Details: `gens · first pass`, `About $5.23 to $10.47 in plan value`, `10.5% to 20.9% of a Tier 3 month (10,000 gens, $50)`, `2× assumption · up to about 2,094 gens`, `Example Activity ledger`, `What-if edits apply to Adventurer only.`, a full-sentence tip, a disclaimer. Details adds pipeline notes ("Skeleton V3 through 15 frames. At 16, the body uses Text V3 and each item fit takes two pose calls.") that `docs/usability-principles.md` forbids requiring.
- **Fix:** one fact per line, numbers over sentences. Delete: retry note (the range shows it), plan terms in parentheses, "Example Activity ledger", the what-if scope note, the "Try a what-if" heading, all Details field notes. Disclaimer becomes the title word **estimate**. Tips become chips: `Mirror west side −575`. Target: under 40 words in the main view.

### 4. Worn vs held is not a user distinction (owner concern 4)

- **Problem:** two steppers imply two kinds of work. In the app both are made the same way (standing look first, then fitted per move), and both choose moves per item (move specs carry an explicit `items` list, `studio/create.ts` `moveEstimate`). The only price difference is the look: a held layer is drawn on a 96 px canvas (`HELD_PAD`, `padOf`, `lib/items/items.ts:425-437`), so its look costs 10 / 20 / 30 gens at 3 / 5 / 8 drawn views versus 10 for worn. Fits cost the same per view (`poseCallGens` has no size input, `lib/rig/clips.ts:231`).
- **Accuracy bug:** adding a held item in the mock-up adds a weapon with **no moves** ("Extra weapons start with Standing only"), so `+1 held` adds about 20 gens while `+1 worn` adds 100. The steppers teach the opposite of reality.
- **Fix:** one **Items** stepper. A new item defaults to all moves (the honest, larger case). Slot type comes from the manifest; Details shows each item with its move chips and a `bigger canvas` tag on held ones. Coverage editing applies to every item, not just weapons.

### 5. Spent so far uses the wrong source and wastes its best use

- **Problem:** it reads the Activity ledger, which keeps only the last 2,500 calls and labels totals "retained calls only" (`lib/pixellab/activity.ts:45-47,374`). It also shows jargon (`1 unknown-cost call`).
- **Fix:** sum `recordedCost` over the character's and its items' provenance (persists with the project, includes replaced attempts). Show `Spent 1,320 gens · 9 retried`. Unknown-cost calls go to Details. This line is the only measured number in the sheet and it feeds finding 2's default: spent ÷ first-try rebuild of the same content is the user's real overhead.

### 6. Plan gauge asks for data the app already has

- **Problem:** users type a monthly allowance for Tier 1 and 2; with none, the bar uses a meaningless "2× first pass" scale. The gauge shows share of a full month, not whether the work fits now.
- **Evidence:** the balance already carries remaining and total subscription gens; the top bar shows `{generations}/{total} gens` (`ui/TopBar.svelte:28`).
- **Fix:** track = this month's total, fill = estimate range, marker = what is left. Caption: `fits in 3,200 left` or `needs 1,400 more`. Drop the allowance input. Keep only an editable monthly price (catalog default by tier) inside Details for the dollar line; no tier known means no dollars and no bar, just gens.

### 7. Remove the scope switch

- **Problem:** `This character / All characters (1)` is a dead control with one character, and with several it mixes a project total with what-if edits that apply to one character (the mock-up needs a sentence to explain this). Loading every project record via `listProjects` also defeats a light lazy sheet.
- **Fix:** the sheet is about this character. If the owner wants a project total later, it belongs in a read-only Details row, computed on open.

### 8. Details: merge the breakdown with its controls

- **Problem:** a read-only breakdown at the top, then six unrelated control groups (directions, six frame steppers, weapon coverage grids, States, plan segments, two inputs, two notes). Inputs are far from the cost they change; on a phone it is several screens of scrolling.
- **Fix:** Details is a list of cost rows: `label · current setting · gens`. Tapping a row expands its editor in place (accordion, one open at a time). Each control sits next to its number, so every edit shows its effect. Unknown-price lines and the per-retry prices live here too. Directions read as `8 directions · mirror west [on]`, not `8 / 5 drawn`.

### 9. Tips: actionable or gone

- **Problem:** the recolor tip ("save 100 gens versus a new worn design") appears whenever any worn item exists and compares against a purchase nobody planned. Tips are text the user must translate into an edit.
- **Fix:** at most two chips, ranked by saving, each a tap that applies the change to the what-if (Reset undoes it). Keep mirror, trim-to-threshold and skip-move. Drop recolor; mention it in Details under Items as `Recolors are free`.

### 10. Small removals and renames

- **Theme toggle in the sheet header:** remove; the app has one theme switch. A per-sheet toggle is a new pattern.
- **Title:** `Cost calculator…` suggests a spreadsheet. Use `Cost estimate…` in the menu and `Cost` as the sheet title.
- **"Rebuild Adventurer":** reads as an action that redoes the character. Use `A character like Adventurer` or just the character name.
- **Sticky compact total:** unnecessary once the main view fits a phone without scrolling.
- **Placement:** keep the character name menu. It is an infrequent planning tool, one step from its character, and per-action quotes already sit at the point of decision. Activity is account-wide and Settings is the account.
- **Lazy loading:** fine and required. The real cost is extracting `lib/pricing/` out of Studio transport modules; budget for that, not for the sheet.

## Proposed layout

Main view (same structure on phone and desktop; must fit a 390 × 844 bottom sheet without scrolling):

```
Cost                                                  ✕
A character like Adventurer
1,050 – 2,100 gens                (+ unknown, if any)
≈ $5–10 · 11–21% of your month
[██████▒▒▒▒▒▒░░░░░░|░░░░░░░░░]        fits in 3,200 left
Retries per step        [−]  1  [+]       you average 0.6
Items                   [−] 10  [+]
Spent 1,320 gens · 9 retried
[ Mirror west −575 ]  [ Sword: skip Walk −15 ]     Reset
Details                                               ⌄
```

Details (rows expand in place, one at a time):

```
Setup        V3 · 64 px                          3
Body         6 moves · 8 directions          114  ›
               8 directions · mirror west [on]
               Walk   [−] 8 [+]   19
               Run    [−] 8 [+]   19   ...
Items        10 · 2 bigger canvas            930  ›
               Cape       all moves          100
               Sword ⓘ   Run Slash Thrust    65   (move chips)
               Recolors are free
States       0                                 0  ›
Retries      1 per step                   +1,050  ›
               One retry: look 10 (held 20) · move fit 15 · body move 19
Unknown      listed only when a step has no price
Spent        1,320 gens · 9 retried · 1 unreported
─────────────────────────────────────────────────
Total                                 1,050 – 2,100
Plan         Tier 3 · $50 / month           edit
```
