# Claude's response to the 3eed2a9c counter-review

November 7, 2026. Answers [N1](README.md#n1-p2-one-wrong-measured-hip-can-again-silence-g9-on-a-moving-gait). A fresh
independent subagent reproduced N1 before any change. The correction is in `decisiveAction` (`app/src/lib/items/items.ts`).
No PixelLab call was made, including `/balance`. The C1 correction, F1 to F3 and the anchored wording are kept.

## Verdict: reproduced and fixed; a partial regression, P3 by likelihood

**The bypass is real, and broader than the fixture.** In the review's frame, at `3eed2a9c`, a bad hip makes the run an
action, and a reversed item passes G9. At `50eeea36` it stays a walk and fails G9.

| Hip moved, 0.005 grid in the review frame | `3eed2a9c` | `50eeea36` | `6006a55c` |
| --- | --- | --- | --- |
| Right hip | 377 decisive | 0 | 818 |
| Left hip | 3,183 | 0 | 4,528 |

- With a sub-threshold lean, a one-sided leg swing and one hip within 0.15 of its place, every bench body and direction
  (27 of 27) admits a bypass at `3eed2a9c`, and none at `50eeea36`. The smallest error that works is 2 to 3 px at a
  35 degree lean.
- **What the review missed:** with the correct hip, the scaled knee term already reads 42.35. A leg swung the same way as
  the lean moves the knee midpoint (raw 19.4 without the swing, 27.5 with it), so the knee term stops corroborating and the
  hip-center terms decide alone. The bad hip then pushes them past 40.
- **Not new:** `6006a55c` had the same bypass (the original single-hip hole). `3eed2a9c` reopened what `50eeea36` closed.

**Likelihood, from the challenger:**
- Stored measured hips differ from requested ones by 0.4 px median and 1.3 px at most, over 88 bench and demo frames. The
  review's 9.3 px error is about 7 times that.
- The trigger needs a gait-named clip leaning 25 to 39 degrees, a one-sided leg swing in the lean's direction, that hip
  error and a genuinely reversed held item. Opposite-leg swings, as in a run, gave no bypass.
- The impact is a silent QA pass, so P2 is defensible on impact alone; P3 fits the likelihood.

## Correction

The lean must now also hold about each hip on its own, scaled like the knee term (what a 40 degree lean about the hip
center shows from that hip in the standing pose). One wrong hip moves the hip center, but the other hip still shows the
true lean. The knee term stays, so hips sliding under still shoulders are still no lean. No threshold, name rule or outlier
guard changed.

## Tests (`app/test/unit/move-classification.test.ts`)

**New:** "one wrong hip estimate cannot make a leaning, striding run an action". It uses the review's stride: a 30 degree
lean with the left leg swung 45 degrees. It checks that:
- the stride is a walk with the correct and the thrown hip;
- neither hip decides anywhere on a 0.02 grid;
- G9 fails a torch reversed in that frame and passes one that turns with the hand;
- the same stride with a 45 degree lean is an action.

It fails at `3eed2a9c` and passes on the fix. The G9 torch helpers moved to module scope so both G9 tests share them.

C1's four tests, F1's sweeps, the import-rig hip case, and the walk, jump, swapped-hand, eye, wrist and short-slash tests
are unchanged and pass.

## Controls, all offline

| Control | Result |
| --- | --- |
| Review frame, either hip, 0.005 grid | 0 decisive (3,560 at `3eed2a9c`) |
| Bench recipe (lean 20 to 35, either leg swung 30 to 60 either way, either hip on a 0.04 grid; 1.62 million) | No lean-decided case remains; 1,341 cases decided by joint travel or wrist rise, identical at `50eeea36` |
| Coherent lean threshold, bench bodies, with and without leg swings (756 cases) | Unchanged except 20 cases at 41 instead of 40 degrees |
| Stored corpus, 23 unique rigs | 293 clip-directions, 0 changes against `3eed2a9c` |
| Retargeted KayKit and Quaternius clips | 0 changes |
| Single-hip sweep, every stored walk and idle frame, 0.01 grid | 0 of 15.2 million positions decide, as at `3eed2a9c` |
| Neck, nose, shoulders, elbows and knees, 0.04 grid | 0 of 3.8 million positions decide, as at `3eed2a9c` |

## Remaining limits

- **The 1,341 joint-travel cases:** one thrown hip also shifts the hip center, which the travel check subtracts from every
  joint. With a 60 degree leg swing, joints then seem to travel 0.6 body heights. This is identical at `50eeea36` and not
  introduced here. It needs a large swing and a far-off hip, and is left as is.
- A one-sided leg swing still lowers or raises the knee reading. With a 45 degree swing against the lean, a coherent lean
  decides only at 48 to 55 degrees, as at `3eed2a9c`.
- Leans under 40 degrees, end joints and whole wrong limbs remain as in the
  [previous response](../2026-11-07-50eeea36-counter-review/claude-response.md).

## Checks

| Check | Result |
| --- | --- |
| `npm run check` | 0 errors |
| `npm test` | 2,021 passed, 1 skipped |
| Bench | Every row ok |
| Studio and selftests E2E | 68 passed |

The sweeps ran on a scratch copy of the same formula. The working tree also held another agent's uncommitted hair-split
change (`split.ts`, `items.ts` hair calls and a new test), so the unit and browser runs include it; it is not part of this
commit. Not run: the full E2E suite and paid generations. The probes are
scratch files, not committed.
