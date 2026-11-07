# Review of the uncommitted D1, waist-band and off-hand word changes

Scope: the working-tree diff in `app/src/lib/items/items.ts` (`smudgedViews`), `run.ts` (D1 uses it),
`design-consistency.ts` (`expectsWaistBand`), `studio/model.ts` (`OFF_HAND`) and the new `app/test/unit/word-lists.test.ts`.
Offline only; no PixelLab calls. Rule applied: a change must not make any output or decision worse than HEAD.

Scripts (run from the repo root; neither writes files):

| Script | What it measures |
| --- | --- |
| `scripts/review/d1-cross-view.ts` | D1 per view under HEAD (`old`), the change (`new`, min of other views) and three variants (`median`, `min2`, `band`) on every frozen bench keyframe, the T3 red cape keys with copies of its north hem smudge, and synthetic views |
| `scripts/review/word-lists.ts` | HEAD vs new vs a candidate for `expectsWaistBand` and `heldSlotFor` on 24 and 15 phrases; HEAD rules are read with `git show` and evaluated in memory |

`npx vitest run test/unit/word-lists.test.ts`: 4 of 4 pass. `npm run check`, the full unit suite and e2e were not run.

## Context: what a D1 or waist-band decision costs today

- D1 no longer saves pose generations. After the dress calls, `run.ts` stops only on a structural (G1) failure; every
  other keyframe failure, D1 included, still runs all pose calls and ends with "Issues detected ... No automatic retry was
  made". D1 now does two things: it stops the early pose start of a single dress chunk (`poseEarly`, `failsOf(res, 0)`), and
  it marks the item for review, which invites a paid Try again. The code comment at `run.ts:455` ("re-roll a smudged design
  ... before 36 gens of poses copy it") and `docs/architecture.md` (D1 paragraph, section 4.5) describe the older behavior and
  do not mention the cross-view rule. Pre-existing, but it sets the cost: a missed D1 lets a smudged design ship as clean;
  a false D1 costs a review flag and possibly a needless paid retry.
- `g1` is keyed by call index. With one dress chunk every view shares call 0, so the item fails if any view fails; a
  per-view exemption changes the item verdict only when it exempts every failing view.
- `expectsWaistBand` true: `poseEarly` waits (latency only), D2 and G13 run. D2 needs at least 4 observed views and a strict
  majority with a light band, so a false positive rarely yields a false warning. False negative: D2 and G13 never run, so a
  band missing from some views goes unflagged.
- `heldSlotFor` only sets the default slot in `NewItemSheet.svelte` until the user picks one; casual users keep the default,
  which decides the hand, the prompt wording ("no shield" for main hand) and the grip checks.

## 1. D1 cross-view baseline: tradeoff, with one cheap fix

By construction `new` only removes failures (a view must still fail `designGraySmudges`), so every change is a missed D1 or
a removed false D1.

**Bench (20 cases, real PixelLab keyframes, prompt with no gray word):** 18 identical. Two view-level differences, both on
recorded key-collision references, neither changes the item verdict:

| Case | Shares | old | new | Why the item verdict holds |
| --- | --- | --- | --- | --- |
| b-jester (5 views) | 0.021 0.039 0.046 0.064 0.040 | `...F.` | `.....` | every keyframe also fails G3 (key outside 0.095 to 0.217) |
| a-stripes-magenta | 0.248 0.341 0.141 | `FFF` | `FF.` | south and east still fail D1 on the same dress call |

**T3 red cape (the only real smudge sample) and counterfactuals** (the 74 north hem px copied onto the other views at the
same offset from the bbox bottom center):

| Case | Shares (S E N) | old | new | median | min2 | band |
| --- | --- | --- | --- | --- | --- | --- |
| T3 as generated | 0 0 0.133 | `..F` | `..F` | `..F` | `..F` | `..F` |
| smudge north + south | 0.179 0 0.133 | `F.F` | `F.F` | `F..` | `F.F` | `F.F` |
| smudge in all three | 0.179 0.178 0.133 | `FFF` | `...` | `...` | `...` | `FF.` |
| 2-view item (E, N), smudge both | 0.178 0.133 | `FF` | `..` | `..` | `FF` | `..` |

**Synthetic** (red design, off-white emblem at the top, (71,64,58) smudge at the bottom): smudge in 1 of 3, 2 of 3 and 4 of 5
views is still caught by `new`; smudge in every view (3 of 3, 5 of 5, 2 of 2) is missed. An emblem in every view no longer
false-fails (the intended gain). An emblem in one or two views only (a pirate skull on the hat front, a buckle not seen
from the back) still fails D1 under every variant, so the gain is narrower than the comment's "shows in every view" claims.
An emblem in every view also masks a smaller smudge: emblem plus 4 % smudge on one view passes (old failed it, but old also
false-failed every clean view of that item).

Regressions, real smudges that now pass:

- A smudge in every drawn view. No real sample exists (T3 was north only), and a consistent gray area across views is
  hard to tell from design by share alone; the `band` variant (match per vertical third) still catches 2 of 3 views of the
  copied T3 smudge but only because the copy lands at slightly different heights, which is not evidence it generalizes.
- A 2-view item with the smudge in both views (a custom direction set with two own views; Side-scroller 2 has one drawn
  view because west mirrors east, so it keeps the single-view rule). With one other view, "min of others" is one
  sample, and any shared smudge exempts both.

Baseline choice: **keep min, reject median.** Median is strictly worse: it misses the T3 north + south case (north passes
because the other views' median is the smudged south) and all 4 smudged views of 5. Body-relative position matching (`band`)
adds code without fixing the all-view case and would re-fail emblems that sit at different heights across views.

**Smallest fix:** require at least two other drawn views before exempting (`min2`):
`return others.length < 2 || share[i] - Math.min(...others) > DESIGN.gray;` This restores HEAD behavior for 2-view items
(both rows above) and keeps every 3+ view gain; the existing unit tests still hold. Accept the all-views miss as a recorded
tradeoff in `docs/known-issues.md`. Also: the new JSDoc was inserted between the face_acc comment ("Neutral pupils ...") and
`designGraySmudges`, so that comment now sits detached above `smudgedViews`; move it back. Update the D1 paragraph in
`docs/architecture.md`.

## 2. `expectsWaistBand` negation: regression, fixable without losing the gains

| Phrase | Intended | HEAD | new | candidate |
| --- | --- | --- | --- | --- |
| a tunic with no sleeves and a leather belt | true | false | true | true |
| no-frills belt and tunic | true | false | true | true |
| a tunic with no embroidery, leather belt | true | false | true | true |
| a dress with a silk girdle / tuxedo with a red cummerbund | true | false | true | true |
| a leather belt with no buckle / a belt, no cape | true | true | true | true |
| **a robe without a wide leather belt** | false | false | **true** | false |
| **a tunic without a thick brown leather belt** | false | false | **true** | false |
| **a robe with no gold or silver belt** | false | false | **true** | false |
| a robe, no belts / without belts or sashes | false | true | true | false |
| not a belt but a waist sash | true | false | false | false |
| belt-less tunic / a tunic lacking a belt | false | true | true | true |

The new rule allows only one modifier word between the article and the band, so two-adjective negations that HEAD read
correctly now expect a band (regression; cost is small: early posing waits and D2/G13 run, and D2 needs a majority of views
with a light band). "no-frills" is fixed only because `\s+` after "no" rejects the hyphen. Plurals ("no belts") were wrong
before and still are, because the negation's band word has no `s?`.

**Smallest fix:** let the negation reach the band across up to four words but not across a clause boundary, with plurals:

```ts
/\b(?:without|no|not|absent|omit)\s+(?:(?!(?:and|but|with|plus)\b)[\w-]+\s+){0,4}?(?:belt|waistband|sash|girdle|cummerbund)(?:e?s)?\b/i
```

Commas and semicolons already stop it because a token must be followed by whitespace. It matches HEAD or better on all 24
phrases; the remaining misses ("not a belt but a waist sash", "belt-less", "lacking a belt", "not visible from the back")
are pre-existing and rare. Add the three multi-word negations to `word-lists.test.ts`.

## 3. `heldSlotFor` new shield words: regression for "aegis"

"aegis" is mostly an adjective or a name in item prompts: "aegis-engraved sword", "sword of the aegis", "Aegis blade",
"spear with an aegis crest" all flip from main hand (HEAD) to off hand. "scutum-shaped mace" flips too (contrived). targe,
pavise and scutum as the head noun are correct gains; "targeting crossbow" stays main hand.

**Smallest fix:** drop `aegis`, and add `(?!-)` after the shield and bow alternatives so a hyphenated compound does not decide
("shield-breaker axe", "scutum-shaped mace", "bow-shaped guard"; the first was already wrong at HEAD). The candidate keeps
every case in the `model.ts` self-check. Still wrong under every rule: "sword with a shield emblem", "bow staff"; deciding by
the head noun would fix them but is a larger change.
