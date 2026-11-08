# Counter-review of Claude's paperdoll session, including the R1 to R7 corrections

November 7, 2026. This is a handoff to Codex. Challenge everything Claude changed this session, test it offline, and report
findings. Claude will then challenge your findings with an independent subagent and fix only the ones that survive. **Do not
make any live PixelLab call** (no generations and no `/balance`): this review must be free.

## Scope

- **Baseline:** `bb830dfb9ac6e7347200e487302b60b2d779f457`, Codex's last commit before this session.
- **Reviewed endpoint:** `19646f097a44dff32e7c02563e4a744499a8ff0e`, plus the commit that delivers this handoff (docs only).
- **Claude's commits:** the range `bb830dfb..19646f09` holds 34 commits; all are Claude's except `9c9a2138`, your own earlier
  review, so 33.
- **Already reviewed:** your earlier counter-review ([handoff](2026-11-07-claude-post-bb830dfb-review.md),
  [evidence](../reviews/2026-11-07-post-bb830dfb/README.md)) covered the 31 commits through `0992bae7` and found R1 to R7.
- **New since that review:**
  - `1a3534b9`: the paid minimal and negative-prompt held-wording test. It is a research record only; production wording is
    unchanged.
  - `19646f09`: the R1 to R7 corrections and [Claude's finding-by-finding response](../reviews/2026-11-07-post-bb830dfb/claude-response.md).

**Priority order:**
1. The corrections in `19646f09` and whether the response's claims hold.
2. The held-wording decision in `1a3534b9`.
3. A second pass over the whole range, for defects the first review missed or new interactions between the corrections and
   earlier commits.

The first 17 commits (through `e951da85`) are on `origin/main`; the last 17 (`0baa1ac3` to `19646f09`) are on local `main`
only. Work from the current checkout; another agent or the owner may add commits, so pin your evidence to the commit you
tested.

## 1. The R1 to R7 corrections

Each correction has a production regression test that fails on `0992bae7`, and an independent subagent challenged it over three
rounds. That does not make the corrections right. Reproduce each original counterexample against `19646f09`, then try to break
the new rule with cases that were not tested. The limits below are already known and recorded; a finding there needs a new
consequence or a reachable case that matters, not a restatement of the limit.

### R1. Held cleanup across a thin connector

**Source:** `heldParts` in `app/src/lib/items/items.ts` (around lines 572 to 592).

**What changed:**
- `offBody` marks a component with at least half of its pixels outside the frozen body's alpha.
- A component below the size floor that lies within `near` (3 px) of the kept set is now kept when it also lies within `near`
  of an unkept, full-size, off-body component. That component then joins on the next pass.

**Tests:** `app/test/unit/held-connector.test.ts`, with the flail, the detached-head control and the buckle-repaint control.

**Known limits:**
- A chain of two or more sub-floor links still loses its head.
- A full-size smear in open air that is reachable through one fleck is now kept; the reach is about 7 px for off-body parts.
- A head lying mostly over the body is still dropped.
- `near` does not scale with the cell size.

**Attack ideas:**
- Generated-artifact smears near swords, bows and staffs on stored frames.
- Diagonal and two-pixel links.
- Cape and hair strands near a held item.
- Whether the new pass can loop, or keep work that grows with frame count.
- Whether `offBody` uses the right base for padded held layers, given the dynamic padding in `padOf`.

### R2. One bad joint estimate turning a walk into an action

**Source:** `BONE` and `decisiveAction` in `items.ts` (around lines 868 to 906).

**What changed:**
- A joint is ignored when any bone on its chain to the trunk grew more than 0.2 body heights over the rest pose.
- A frame is skipped when its hip width grew more than 0.2 H.
- The neck's bone runs to the hip center.
- The lean is the smaller of the neck lean and the shoulder-midpoint lean, and is ignored when the torso length is
  implausible.
- One plausible decisive frame still decides, because real slashes are often decided by the wrist alone in two or three
  frames.

**Tests:** `app/test/unit/move-classification.test.ts`: one eye, both eyes, a wrist above the head, a knee, the neck or a hip
misplaced, and a 4-frame `run-slash`.

**Response claims to check on the stored rigs** (the response says 12 rigs):
- 19 of 20 real slash clip-directions stay decisive.
- 38 of 40 four-frame subsamples stay decisive.
- 0 of 47 walks and idles are decisive.
- KayKit deaths stay decisive.

`node docs/research/2026-11-07-paperdoll-cycle/scripts/review/move-classification.ts rigs` (from the repo root) prints each
stored clip-direction's decision with the current code. It reads the bench rigs, the KayKit motion-lab rigs and local
exports, some of which are ignored files that may be missing on your machine. The four-frame subsample counts came from an
uncommitted probe; reproduce them with your own script rather than trusting the number.

**Known limit:** a plausible-length wrong estimate, such as a whole arm consistently misplaced, can still decide.

**Attack ideas:**
- Bone shrinkage: only growth is tested.
- Mirrored directions and 8-direction rigs.
- Small native sizes, where 0.2 H is only a few pixels.
- Jumps, crouches and falls whose trunk legitimately changes length.
- Whether a skipped frame can hide a real action that only shows in that frame.
- Whether ignoring a joint can suppress G5 or G9 on a real held-item defect.

### R3. Front-only dark detail reported as corruption

**Source:** `grayShare`, `smudgedViews` and `designGraySmudges` in `items.ts` (around lines 1284 to 1330), the `'dark'` branch
in `app/src/lib/items/run.ts` (around line 457), and the `plainReason` text in `app/src/studio/model.ts` (around line 200).

**What changed:**
- A view that is flagged only when solid near-black patches are counted is reported as `'dark'`.
- A `'dark'` view raises the warning "a dark patch not seen in the other views; check that it is part of the design" instead
  of the D1 smudge.
- Gray patches stay D1 smudges.

**Tests:** `app/test/unit/word-lists.test.ts` (the charcoal medallion and the `plainReason` text). Because `smudgedViews` now
returns labels, three existing expectations there changed from `true` to `'smudge'`; check that each still asserts the same
case.

**Attack ideas:**
- A view with both gray and dark patches: does it stay `'smudge'`?
- Whether a `'dark'` warning still reaches review, summary, export and Activity the way a smudge did, or is silently dropped
  somewhere.
- Whether an unrequested black blotch is now under-reported, and whether that matters.
- The four color keys (green, magenta, blue, azure).

### R4. Free saved-frame recovery hidden by a combined failure

**Source:** the error merge in `app/src/lib/items/run.ts` (around lines 700 to 714) and `savedItemFrames` in
`app/src/studio/MoveSheet.svelte` (line 55).

**What changed:** the save-conflict message now leads the combined error, so the `startsWith(ITEM_MOVE_SAVE_CONFLICT)` check
offers **Use saved frames** again.

**Tests:** a combined case in `app/test/unit/automatic-recovery.test.ts`.

**Not verified:** a browser session.

**Your earlier node probe now passes.** `studio-recovery/prepare-race-tests.mjs` generates a Vitest test (not a browser
test). The fact-check reran it at `19646f09`: its formerly failing case, "a mixed failure still exposes the save-conflict
recovery trigger", passes.

**Please run R4 offline in the browser.** Adapt the studio E2E test "failed anchored moves offer cache-only recovery without
an API key or a new request" (`app/test/e2e/studio.spec.ts`, around line 1709). It seeds a failed `studio-move` record with
`ITEM_MOVE_SAVE_CONFLICT`; seed the combined message instead and:
- show the offer after the combined failure and again after a reload;
- assert zero generation POSTs during recovery;
- check that the next paid quote includes only the missing direction.

**Also check:**
- Every other reader of this error text: Activity, toasts and `plainReason`.
- That prefix matching on a message is not also fragile elsewhere.

### R5. Display names losing the noun

**Source:** `stripCount` and `itemHead` in `app/src/studio/model.ts` (around lines 144 to 160).

**What changed:**
- A leading article and count phrase are removed ("a pair of", "sets of", "a couple of").
- "of" names are kept.
- A head longer than four words is cut at " of ".

**Tests:** `app/test/unit/item-name.test.ts` and the name cases in `app/test/unit/word-lists.test.ts`.

**One name expectation was changed on purpose:** `item-name.test.ts` used to expect "Cloak" for "cloak of shadows". Claude
judged that expectation to be the regression itself, not a requirement. Challenge that judgment. (The R3 label change above
is the only other changed expectation.)

**Attack ideas:**
- Counts the strip misses ("three", "a few", numerals).
- Long "of" names.
- Names that become empty.
- Whether the display name can leak into a generation prompt or an export file name.

### R6. A decoration noun moving the item to the other hand

**Source:** `OFF_HAND`, `SUBJECT_END` and `heldSlotFor` in `model.ts` (lines 33 to 37).

**What changed:** the default slot reads the item's subject. That is the description after `stripCount`, cut at attachment and
decoration words (with, bearing, engraved, of, hanging and similar).

**Tests:** the subject and slot cases in `app/test/unit/word-lists.test.ts`.

**Known limit:** "a coat of arms shield" defaults to the main hand, because the subject is cut at "of" before the noun. The
default stays editable.

**Attack ideas:**
- Other subjects cut before their noun, like the known limit. ("a shield of oak" and "a bow of yew" already stay in the off
  hand and are controls, not counterexamples.)
- Subjects cut too late, where a decoration clause is missing from `SUBJECT_END`.
- Hyphenated and plural forms.
- Non-ASCII input.
- Whether a wrong default is visible to the user before a paid dress, and how easy it is to correct.

### R7. A zero-width cell hanging the layout search

**Source:** `validGrid`, `gridEstimate` and `repairGridLayout` in `items.ts` (lines 70 to 105).

**What changed:** both functions share one input validator. Of the six invalid inputs in the new test, only the zero-width
cell misbehaved at `0992bae7` (an endless synchronous loop); the others already threw through `gridEstimate`.

**Tests:** `app/test/unit/grid-estimate.test.ts`.

**Attack ideas:**
- Fractional, `NaN`, negative and very large inputs.
- Whether any valid layout, such as 160 px cells needing three columns or the 336 px edge, is now rejected.
- Whether a malformed stored manifest now fails with a clear message rather than bricking the project.

### Documentation

The grip note in `docs/known-issues.md` is now scoped: the layering cuts nothing from the item at the grip, but extraction
cleanup can still drop small detached parts elsewhere. Check that every disclosure still matches the code after these
corrections.

## 2. The held wording decision (`1a3534b9`)

Production wording is unchanged (`heldPhrase` and `oneHeld` in `items.ts`, around lines 168 to 170). The main hand reads:

> held in the character's right hand, pointing down and slightly outward; exactly one weapon, no other weapons, no scabbard,
> no shield; the arms stay exactly as they are

The off hand swaps to "left hand" and "exactly one held item, nothing in the right hand".

**The owner's request:** they asked whether the prompt could name only the hand, and then whether a negative clause ("not the
left hand") would hold the hand on the Pro edit model.

**What Claude measured:** the current wording against five alternatives, with 203 paid calls on seven items on one 80 px body
([report](../research/2026-11-07-paperdoll-cycle/hand-wording-ab.md), section "Minimal and negative hand wordings: rejected").

| Wording | Bad standing views (wrong hand or drawn twice) |
| --- | --- |
| Current | 0 of 12 |
| The five alternatives | 3 to 6 of 24 each |

**The raw images are not in the repository.** Do not regenerate them. Challenge the method and the conclusion from the report
alone:
- Sample size: one body, and one seed for the current wording against two for the alternatives.
- The asymmetric denominators.
- How a view was judged "bad".
- Whether the right-hand shield result is fairly attributed to the provider.
- Whether the full-pipeline comparison (current passed or warned on 2 of 6 scored items; minimal passed none of 14) supports
  the decision.

If you think a different wording deserves a test, write it up as a paid experiment proposal for the owner. Do not run it.

Offline, you can check:
- that the dress, pose and grid prompts all build the same hand and one-item clauses for both slots;
- that the off-hand clause "nothing in the right hand" is consistent with the main-hand clause;
- that no prompt exceeds the provider's description limit in `docs/research/pixellab/pixellab-openapi-v2.json` (2,000
  characters for edit-animation-v2 and inpaint-v3; animate-with-skeleton-v3 declares none);
- the dev-only motion lab (`app/src/ui/motion-lab/equipment.ts`, around line 29) applies `heldPhrase` only to `main_hand`,
  while production (`run.ts` around line 234 and `apiPlans.ts` around line 58) applies it to every padded held slot. Say
  whether that difference makes any lab evidence unrepresentative of the off hand.

## 3. Second pass over the whole range

Your first review challenged each commit through `0992bae7`. Look again where the corrections now interact with earlier
changes:
- `decisiveAction` with the G5, G9 and G15 scoping that depends on `isAction`.
- `heldParts` with `attachHeld` and the hanging-item warnings.
- The `'dark'` label with the cross-view D1 logic from `4bc9f3fb`.
- The error ordering with the partial-direction saves from `e951da85` and the saved-frame guard from `666f489a`.
- `stripCount` with names and slots.

Also challenge anything the first review accepted as "no additional defect established" if you now see a reachable failure.

## How to test without spending

- **Use the keyless dev server or tests.**
  - Prefer `npm run dev`, unit tests, `npm run e2e` and the offline fixtures.
  - Avoid the agent server (`npm run dev:agent`, port 5199). If you must use it, set `localStorage['pixeldoll.agentKey'] =
    'off'` before the app first loads (for example with Playwright `addInitScript`, as `studio.spec.ts` does) and keep it set
    for the whole run. The app reads the switch once at load, so setting it after the page opens is too late.
  - Never print, log or screenshot a token or `.env`.
- **Stored evidence:**
  - frozen bench rigs and frames (`node scripts/bench.ts`, which rewrites nothing without `--write`);
  - `app/public/fixtures/s2/`;
  - the research scripts in `docs/research/2026-11-07-paperdoll-cycle/scripts/`;
  - your own probes in `docs/reviews/2026-11-07-post-bb830dfb/`. Those pin historical source, so point them at `19646f09`
    to rerun the original counterexamples.
- **Repository checks, from `app/`:**
  - `npm run check`
  - `npm test`
  - `npm run e2e -- studio selftests`. `selftests` is required: `items.ts`, `run.ts` and `model.ts` are registered in
    `src/lib/selftests.ts` and all changed in `19646f09`.
  - Give the run its own `E2E_PREVIEW_PORT`, `E2E_DEV_PORT` and `TEST_OUTPUT_DIR`.
  - The full E2E suite was not run after `19646f09`. Run it once if you can; the error-ordering change touches queue and
    recovery paths.
- **Claude's last results at `19646f09`:**
  - `npm run check`: 0 errors.
  - Unit tests: 2,004 passed, 1 skipped.
  - Studio E2E: 56 passed.
  - Selftests E2E: 12 passed (run while writing this handoff).
  - Bench report: unchanged.
  - Not run: the full E2E suite, a browser check of R4, and a check that each regression test fails at `0992bae7`.

## What to deliver

Write your findings to `docs/reviews/2026-11-07-session-counter-review/README.md`. Use the earlier format: P2 or P3, source
with lines, introducing commit, reproduction, valid and invalid controls, and why the case is reachable.

- Mark each R1 to R7 correction as held, partially held or failed.
- Separate new defects from known limits that you think are wrongly accepted.
- Label synthetic cases as synthetic.
- Add an entry for your review to `docs/reviews/README.md`.
- Do not change production source or production tests. Commit only your review files, with a Conventional Commit.
- Do not create board cards or change this card's status; Claude manages it.
- Report what you ran, what failed and what you skipped.

**Claude's next step:** challenge each finding with an independent subagent, fix only the valid ones with regression tests,
and reply finding by finding.

Board card: "Hand off the paperdoll cycle changes for Codex counter-review" on the
[PixelDoll board](https://github.com/users/Shilo/projects/7).
