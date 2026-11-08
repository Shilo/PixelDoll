# Claude's response to the 50eeea36 counter-review

November 7, 2026. Answers [C1](README.md#c1-p2-the-knee-relative-threshold-falsely-rejects-a-coherent-moderate-action-lean). A fresh independent
subagent reproduced C1 before any change. The correction is in `decisiveAction` (`app/src/lib/items/items.ts`). No PixelLab
call was made, including `/balance`. F2, F3 and the anchored wording are unchanged.

## Verdict: reproduced and fixed; the severity is closer to P3

**The classifier regression is real, and wider than the fixture.** The knee term compared the shoulders' turn about the
knees with the 40 degree hip threshold. The knees are further from the shoulders, so the same lean turns them less:

| Body (all rest directions, both signs) | Knee angle at a 45 degree hip lean | Lean that decides, `6006a55c` | Lean that decides, `50eeea36` |
| --- | --- | --- | --- |
| Review probe | 29.3 | 40 | about 60 |
| Bench A | 26.8 to 27.3 | 40 to 40.5 | 59.5 to 63 |
| Bench B | 26.7 to 28.7 | 40 to 40.5 | 52.5 to 58.5 |
| Bench C (chibi) | 30.5 to 33.6 | 40 to 40.5 | 42 to 52.5 |
| Bench N | 25.2 to 26.2 | 40 to 40.5 | 62.5 to 67.5 |

**The fixture holds, with qualifications from the challenger:**
- The 45 degree `run-dodge` torch reproduces exactly: action and pass at `6006a55c`, locomotion and a G9 failure at
  `50eeea36`. The same frames named `dodge` pass, with identical layer hashes.
- Reachability is real: Studio builds `run-dodge` from "Run dodge", and `moveWords` reads "run" as a gait. The pose prompt
  already says "running" for that move (`actionOf`).
- G9 is meant to fail an upright item that counter-rotates against the forearm; only items hanging below the hand are
  exempt. The commit widened an existing band rather than creating it: `6006a55c` already fails the same torch on single-frame
  leans of 32 and 35 degrees. A 0 to 45 degree jump in one frame is needed; smooth leans (`0, 22.5, 45, 22.5, 0`) pass even as
  locomotion.
- Some controls are weaker than stated: `clipQa` receives identical requested and measured joints, so its zero adherence
  proves nothing, and the body is a stick figure with hand-set QA inputs. `postProcess` and the hashes check out.

**Severity:** the item goes to review with "Try again or Accept as is", and nothing is lost or spent automatically. A wrong
locomotion verdict also turns on G5 and the north-view G4 strictness for that clip; those were not separately tested.

## Correction

The knee lean is now measured against what a 40 degree lean about the hips shows from the knees of the same standing pose,
in the direction of the lean. One line of geometry per direction, no name special case, no threshold change, and every
outlier guard stays. The knee term still has to agree, so the hip center moving alone is still no lean.

Coherent leans decide at 40 to 41 degrees again on every bench body and direction (42 to 68 before the fix).

## Tests (`app/test/unit/move-classification.test.ts`)

| Test | Before the fix | After |
| --- | --- | --- |
| A 45 degree lean decides and a 30 degree lean does not, on every bench body, direction and sign | Fails | Passes |
| `run-dodge`, `walk-bow` and `dodge` with a 45 degree lean are actions; `run-dodge` standing still is not, `dodge` still is | Fails | Passes |
| G9 through `itemQa`: an upright torch through the lean passes under `run-dodge` and `dodge`; a walk with a thrown neck still fails a torch that twists in a still hand, and passes a still one | Fails | Passes |
| Hips sliding under still shoulders (0.12 and 0.2 of the cell, both ways), one hip or the neck thrown, on every bench body and direction: no action | Passes (48 of 108 slides decide at `6006a55c`, 15 with the knee term removed) | Passes |

The detached-neck, detached-hip, walk, jump, swapped-hand, eye, wrist and short-slash tests are unchanged and pass.

## Controls, all offline

| Control | Result |
| --- | --- |
| Review probe (`motion/probe.mts`, copied, drift assertion removed) on the fix | Every synthetic angle and frame count decides as at `6006a55c`; torch cases pass; original neck rejected; 67 stored rows unchanged; 19 of 20 slashes; 38 of 40 subsamples; 72 projected rows unchanged |
| Stored corpus, 23 unique rigs | 293 clip-directions, 0 changes against `50eeea36` |
| Retargeted KayKit and Quaternius clips | 0 changes |
| Single-hip sweep, every stored walk and idle frame, 0.01 grid | 0 of 15.2 million positions decide, as at `50eeea36` (84,756 at `6006a55c`) |
| Neck, nose, shoulders, elbows and knees, 0.04 grid | 0 of 3.8 million positions decide, as at `50eeea36` |

## Remaining limits

- A coherent lean under 40 degrees still cannot be told from a run, so a gait-named action that leans 30 to 40 degrees in
  one frame still gets G9, as at `6006a55c`.
- The challenger noted the import-rig detached-hip test sits less than 1 degree past the hip threshold. With the knee term
  scaled, its knee reading stays far below (6.2 degrees raw), and its +60 degree positive control now has room.
- End joints and whole wrong limbs remain as described in the [previous response](../2026-11-07-session-counter-review/claude-response.md).

## Checks

| Check | Result |
| --- | --- |
| `npm run check` | 0 errors |
| `npm test` | 2,012 passed, 1 skipped |
| Bench | Every row ok |
| Studio and selftests E2E | 68 passed |

The two sweeps ran on a scratch copy of the same formula before it was applied. Not run: the full E2E suite and paid
generations. The probes are scratch files, not committed.
