# Review: held-item hang note, steady grip and G4 occlusion (uncommitted, 2026-11-07)

Scope: the working-tree change to `evaluateQa` in app/src/lib/items/items.ts (G9 hang note, G5 `steadyGrip`, G4 `hiddenExplainsLoss`), the `plainReason` line in app/src/studio/model.ts, and app/test/unit/held-hang-wave.test.ts. Baseline: commit edc604be.

Method: offline, production `itemQa` only, no PixelLab calls. `scripts/review/held-hang.ts` loads three copies of items.ts (baseline, working tree, and the working tree with candidate fixes F1 to F3 applied as text patches) into the gitignored app/test-results-review/ folder, imports them, then deletes the folder. It runs synthetic clips with explicit wrists and forearm angles, the audit kinds on the frozen bench walk keypoints, and the saved shield controls (app/test/fixtures/shield-occlusion.json) with mutations. The two held unit test files pass on the working tree (11 tests).

Run: `node docs/research/2026-11-07-paperdoll-cycle/scripts/review/held-hang.ts` from the repo root (about 10 s).

## Findings

### 1. The G5 steady grip excuse hides a lost blade tip (regression)

Rigid blades that lose 30 to 45 % of their length in one to three frames failed G5 before and now pass with a G5 warning at every cell size (64, 128, 256 px, padded or not). G4 cannot catch them because the area stays above half the median. A tiny dagger that loses 3 of 7 px is also downgraded at 128 and 256 px. `steadyGrip` counts only the pixels within half the reach of the wrist, so any loss beyond that radius (a blade tip, the far side of a shield) is invisible to it.

Smallest fix (F2): also require every frame to keep 70 % of the clip's largest reach (`ext.every((r) => r >= 0.7 * reach)`, computed with the same `dist`). At 0.70 every lost-tip case fails again, and the audit's banner and torch on the bench keep their improvement (bench N: 0 fails, as on the working tree). At 0.75 the audit torch with a 2 to 7 px flame fails again. At 0.60 the 30 to 35 % losses slip through. The margin is thin: the synthetic torch keeps 74 % of its reach, a blade that loses 30 % keeps about 71 %.

Remaining: a shield that loses only its far side (5 px of a 7 px radius disc in 2 frames) keeps 72 % of its reach, so it still downgrades to a G5 warning with F2 at 0.70 (it fails at 0.75). This is a tradeoff: a reach-based rule cannot tell a flame from a shield rim.

### 2. The G4 occlusion excuse checks only the smallest frame and is weaker than the G5 excuse (regression)

`hiddenExplainsLoss` compares the largest frame with the smallest one. Any other frame under the floor is never examined. A clip with one frame truly behind the torso and another frame 60 % missing out in the open, 10 px from the body:

- walk: G4 fail before, now only G5 fails (G4 is lost, the clip still fails);
- action (attack/east, where G5 and G9 do not run): G4 fail before, now **warn only** (Occlusion).

The saved b14 ranger east control loses its G4 failure on both mutations as well (the clip still fails G5).

The G5 occlusion excuse requires every frame to be compatible with the largest frame and the corrected areas to have a CV within the limit. The new G4 excuse only requires the smallest frame plus its hidden pixels to reach half the median, so a frame can be missing far more than the body explains.

Smallest fix (F3): use the G5 predicate for the whole clip. No frame may be empty, every frame must be compatible with the largest, the corrected CV must be at most `cvMax`, and every corrected area must reach the floor. With F3, both two-frame cases and the ranger mutations fail G4 again. The buckler test case, the saved controls and the audit cases are unchanged.

Inherent limit (tradeoff, not fixed by F3): on the saved b15 north-east shield, deleting half of the middle frame's mask (on the side away from the body centroid) failed G4 before and is now only an Occlusion warning, even with F3. The largest frame (206 px) already differs from the others by real occlusion. 115 of the missing pixels lie over the cut frame's body silhouette, so `heldVisibility` reports them as hidden and the clip's corrected CV still fits. Silhouettes cannot tell drawn-in-front from hidden-behind (as the `heldVisibility` comment says). Before this change, G4's hard 50 % floor was the last backstop for occlusion-excused clips; now the floor itself can be excused. A buckler in front of the torso that loses the half over the body still fails G4 and G5 in this synthetic harness. I did not isolate why, so do not rely on that.

### 3. The G9 hang excuse also accepts counter-rotation (regression, fixable) and limp or detached rigid items (tradeoff)

All flips stay caught: a 90 degree sideways flip, a 45 degree tilt and a reversal to point up still fail on the working tree.

Counter-rotation is the fixable regression. The excuse needs the world angle to change by at most 30 degrees, but it does not compare that change with the forearm's. A sword that turns 20 degrees against a 12 degree forearm swing (32 degrees relative) failed before and is now a hang warning. Smallest fix (F1): also require the world change to be at most half the forearm change (`world <= Math.min(GATES.heldTurn, foreTurn / 2)`): a hanging item lags the hand. With F1 the counter-rotating sword fails again, while the lantern, the chain whip and the bench lantern stay warnings.

The tradeoff, with or without F1: an item hanging straight down that does not follow the hand now gets a warning instead of a failure. Three cases show it: a limp sword, a sword frozen in place while the wrist moves 6 px, and a sword sliding 6 px out of the fist. Without the item's kind, these cannot be told from a lantern. The excuse also does not check that the item stays attached; G8 only warns past 6 px. Optional: require the nearest item pixel's distance to the wrist to change by at most 2 px between the two frames.

### 4. Thresholds and scale (fine)

All new tests are relative: angles, half reach, 25 % of the core count. They behaved identically at 64, 128 and 256 px and with a 16 px pad. The only absolute value, `top >= 6`, matters only for items under about 7 px, where it fails safe. A stray far pixel enlarges the clip-wide reach and makes `steadyGrip` (and F2) stricter, never looser. `HELD_SIGNED_REACH` (10 px) is unchanged.

### 5. Paid grid repair (tradeoff, inherits 1 to 3)

`regridClip` (run.ts) merges whenever `failCalls` is empty, and the Studio grid move (create.ts) runs it for every direction, including complete ones. So a grid redo now replaces the existing clip artwork in three cases: a lost blade tip (finding 1), a frame missing in the open next to an occluded one (finding 2), or a counter-rotating blade (finding 3). The item is marked "Needs a look" with "item quality checks need review", and nothing is retried. That matches the existing policy for other warnings (G5 occlusion, G7, G8). With F1 to F3, those three cases fail again and the repair is rejected as before.

### 6. Draft status (fine), saved-item reason (minor)

A held draft with only these warnings has status `warn`. `isClean` is false, so `autoSave` never runs, and GenCard lists the warnings through `plainReason`, including the new hang text. Keep it was already allowed with failures, so for drafts the fail-to-warning change is mostly a label change.

Minor: after Keep it or a grid merge, saved QA holds only numbers. A clip whose only note is the hang warning has no numeric trace, so `qaReasons` lists nothing for it and ItemPane says "Checks found issues" with no reason. Fix: a `heldHangReviewClips` counter and a `qaReasons` line, following `heldLoopReviewClips`. The G4 occlusion warning shows as "The item is missing in some frames" after saving (the existing behavior for excused G4).

## Measurements

Key: F = fail, W = warning. old = edc604be, new = working tree, fix = F1 + F2 (0.70) + F3.

| case (64 px unless noted) | old | new | fix |
|---|---|---|---|
| lantern straight down, forearm 50-130 | fail F[G9] | warn W[G9hang] | warn W[G9hang] |
| sword limp straight down, forearm 50-130 | fail F[G9] | warn W[G9hang] | warn W[G9hang] |
| sword counter-rotates 20 deg against a 12 deg forearm | fail F[G9] | warn W[G9hang] | fail F[G9] |
| sword counter-rotates 28 deg against a 15 deg forearm | fail F[G9] | fail F[G9] | fail F[G9] |
| mace down flips 90 deg / tilts 45 deg / sword reversed | fail F[G9] | fail F[G9] | fail F[G9] |
| sword frozen in place while the wrist moves 6 px | fail F[G9] | warn W[G9hang] | warn W[G9hang] |
| sword slides out of the fist (gap 0-6 px) | fail F[G9] | warn W[G9hang] | warn W[G9hang] |
| chain whip hanging, sways +-10 deg | fail F[G9] | warn W[G9hang] | warn W[G9hang] |
| rigid blade loses 40 % in 1 frame (64, 128, 256 px, padded) | fail F[G5] | warn W[G5] | fail F[G5] |
| rigid blade loses 30 / 35 / 45 % in 2-3 frames | fail F[G5] | warn W[G5] | fail F[G5] |
| tiny dagger 7 px loses 3 px, 128 and 256 px | fail F[G5] | warn W[G5] | fail F[G5] |
| shield loses its far side (5 px) in 2 frames | fail F[G5] | warn W[G5] | warn W[G5] |
| shield shrinks uniformly (r 7 to 4) | fail F[G4,G5] | fail F[G4,G5] | fail F[G4,G5] |
| buckler slides behind torso (unit test case) | fail F[G4] W[Occl] | warn W[Occl] | warn W[Occl] |
| buckler in front of torso loses the half over the body | fail F[G4,G5] | fail F[G4,G5] | fail F[G4,G5] |
| frame behind torso + another 60 % missing in the open, walk | fail F[G4,G5] | fail F[G5] | fail F[G4,G5] |
| same, attack/east | fail F[G4] | warn W[Occl] | fail F[G4] |

Audit kinds on the bench walk keypoints (main hand, south, east and north), clips failing: old / new / fix.

| kind | old | new | fix |
|---|---|---|---|
| sword (rigid), A 64 px and N 160 px | 0 | 0 | 0 |
| lantern, A and N | 0 | 0 | 0 |
| banner, A 64 px | G5 x3 | G5 x2 | G5 x2 |
| banner, N 160 px | G5 x3 | 0 | 0 |
| torch, A 64 px | G5 x3 | G5 x2 | G5 x2 |
| torch, N 160 px | G5 x3 | 0 | 0 |

Saved shield controls: the four saved clips give the same result in old, new and fix. Mutations of the middle frame (half of its mask removed):

| mutation | old | new | fix |
|---|---|---|---|
| b14 ranger east, half away from the body | F[G4,G5,G9] | F[G5,G9] | F[G4,G5,G9] |
| b14 ranger east, half toward the body | F[G4,G5] | F[G5] | F[G4,G5] |
| b15 north-east, half away from the body | F[G4] W[Occl] | W[Occl] | W[Occl] |
| b15 north-east, half toward the body | F[G4,G9] | F[G9] | F[G9] |
| b15 south-east and east (both halves) | unchanged | unchanged | unchanged |

Share of the clip's largest reach that every frame must keep (F2 threshold sweep, 64 px walk):

| case | new | 0.60 | 0.70 | 0.75 |
|---|---|---|---|---|
| blade loses 25 % in 2 frames | pass | pass | pass | pass |
| blade loses 30-35 % in 2 frames | warn | warn | fail | fail |
| blade loses 40 % in 2 frames | warn | fail | fail | fail |
| audit torch, 2-7 px flame | warn | warn | warn | fail |
