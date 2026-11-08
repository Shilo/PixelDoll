# Claude's response to the session counter-review

November 7, 2026. Answers the [offline counter-review](README.md) of `6006a55c`. An independent subagent reproduced each
finding with its own probes before any change. A second independent subagent then reviewed the corrections; its one valid
finding (below, under F1) was corrected too. Each regression test fails on `6006a55c` and passes on the correction. No PixelLab
call was made.

| Finding | Verdict | Correction |
| --- | --- | --- |
| F1 single-neck bypass | Confirmed, and broader than reported | A joint also needs plausible bones to its own children; a frame with a stretched thigh is skipped; a lean must also hold about the knees. |
| F2 dark note lost on Keep | Confirmed; introduced by `19646f09` | Kept items save the dark-patch note with the other accepted design notes. |
| F3 256 px held dress | Confirmed; predates the session | The dress wording follows the held skeleton route, not the padding. |

## F1. One detached joint making a walk an action

**Reproduced, and wider than the neck.** The challenger moved one joint in one frame of each of the 41 stored walks and idles
that are not decisive, over a 20 by 20 grid of positions:
- At `19646f09`, the neck flipped all 41 clips to actions.
- The nose, elbows, knees and hips flipped 17 to 27 clips each.
- Real proportions put the decisive neck positions at or below hip level, a gross error, but every walk has such a region.
- The previous response listed a misplaced knee, neck or hip as fixed. That was overstated: its tests used only frame-corner
  positions, which the bone-length guard already rejected.

**Correction** (`decisiveAction` in `app/src/lib/items/items.ts`):
- A joint counts only when the bones to its own children also stay within 0.2 body heights of standing. A lone neck, nose,
  elbow or knee stretches them.
- A frame whose thigh grew more than 0.2 H is skipped, as one whose hip width grew already was.

**A gap found by the fix review.** In one real stored import walk, a single moved hip still passed. That walk is
`spikes/api/out/user-import-review-2026-10-27`, south-east, frame 0.
- Hip width and thigh grew only 0.16 H, but the shifted hip center made the neck and shoulders seem to lean 41 degrees.
- Checking the hip line's direction did not help, because the label-swap allowance accepts it.
- A lean now counts only when the shoulders also lean about the knee midpoint. That midpoint does not move with one hip.

**Tests** (`app/test/unit/move-classification.test.ts`):
- A sweep moves the neck, nose, each elbow, knee and hip over a 20 by 20 grid on all four bench bodies and every walk
  direction.
- The real-rig hip case, plus a control where the whole upper body tips 60 degrees and is still decisive.
- Both fail on `6006a55c`.

**Controls kept, all offline:**

| Control | Result |
| --- | --- |
| Stored rigs (`move-classification.ts rigs`) | 19 of 20 slash clip-directions decisive; no walk, idle, rest or hurt row decisive. |
| Four-frame slash subsamples | 38 of 40 decisive, as before. |
| Stored corpus (23 unique rigs) | 293 clip-directions, 0 decision changes against `6006a55c`. |
| Retargeted clips | 72 KayKit and Quaternius clip-directions over three bodies, 0 changes; attacks and deaths stay decisive. |
| Thigh growth on real moves | 0.05 H at most stored, 0.012 H retargeted. |
| Single-hip sweep | Every stored walk and idle frame at a 0.01 grid: 0 of 15.2 million positions decisive (84,756 at `6006a55c`). |

The reviewer found no single neck, nose, shoulder, elbow or knee position that still passes, at a 0.04 grid (4.75 million
evaluations).

**Correction to the previous response:** its "0 of 47 walks and idles" are 41 walks and idles, 4 rests and 2 hurts, as the
counter-review noted.

**Remaining limits:**
- End joints (wrists, ankles, eyes and ears) have no children to contradict them.
  - One misplaced wrist can still decide, because one wrist is how real slashes are decided.
  - A wrist raised far enough also passes the rise check.
- A whole limb misplaced at plausible lengths can still decide.
- Retargeted chibi clips stretch nose to neck up to 0.23 H, so the neck can drop out of `moved` in those frames. No decision
  changed. The code comment now says so instead of "at most 0.06".

## F2. The dark-patch note lost on Keep

**Reproduced.** The challenger used real `runItem` and `acceptItem` on the offline queue fixture, then reloaded the stored
item.
- After Keep, the dark note was gone; the gray smudge note was kept in `designWarnings`.
- Before `19646f09`, the dark case landed in `g1` mislabeled as gray smudges, and so was kept.
- The change to a review note made it transient, so this was a regression of that commit.

**Correction** (`acceptItem` in `app/src/lib/items/run.ts`):
- The D1 dark notes from the review's warnings are saved with the accepted keyframe notes.
- Their text lost its semicolon, so readers that split notes on `'; '` (ItemPane) keep one reason. ItemPane shows "A dark
  patch is not seen in the other views; check that it is part of the design".
- The note stays a review note: it is never a smudge or a failure, and a clean item gets none.

**Verified by the fix review:**
- The saved status was already `accepted` in this case.
- No other `D1 ` string reaches the warnings.
- Later move merges do not duplicate the note. It also keeps the item "Accepted" after a merge that would otherwise recompute
  "Clean".
- Export validation accepts it.

**Test** (`app/test/unit/automatic-recovery.test.ts`): dark, gray and clean three-view cloaks through Keep. The dark and gray
notes are saved, and the clean cloak saves none.

**Not changed:** the hidden-view G4 note ("no item in this view; check that the view hides it") is also lost on Keep. That loss
predates this session and is left as is.

## F3. A 256 px held dress without the hand wording

**Reproduced. It predates `bb830dfb`.**
- `run.ts` and the API preview chose the held wording by `pad`, and `padOf` returns 0 at a 256 px cell (the canvas cap).
- Sizes up to 224 kept the wording; 256 lost the hand and one-item clauses in both hands.
- Reachable through custom Studio sizes (`autoFrame` reaches 256 for tall bodies) and imported 256 px rigs.

**Correction** (`items.ts`):
- A new `dressItem` helper picks the wording by the held skeleton route, and `padOf` uses the same route test.
- `run.ts` and `apiPlans.ts` both call it, so the preview still matches the request.

**Verified by the fix review:**
- Over every slot, method and cell size from 16 to 320, requests differ from before only where pad is 0 (a longest side of 255
  or more). Padded 64 to 224 px requests are unchanged.
- The draft preview, which passed no cell and showed the wording, now agrees with a 256 px request.

**Test:** captured dress requests at 64 and 256 px in both hands keep the hand and one-item clauses, with the canvas size
unchanged. A worn item gets no hand wording.

**Needs a decision, not changed:** the anchor route never adds the hand or one-item clauses (its pad is always 0). The S5
wording was qualified only on the skeleton route. The full phrase was written for posing ("pointing down", "the arms stay
exactly as they are") and may not suit anchored edits, although the hand and one-item clauses might. This is the owner's call
and may need paid testing.

## Checks

| Check | Result |
| --- | --- |
| `npm run check` | 0 errors |
| `npm test` | 2,008 passed, 1 skipped |
| Bench | Every row ok |
| Studio and selftests E2E | 68 passed |

The challenger's and the reviewer's probes are scratch files, not committed. Not run: the full E2E suite and paid generations.
