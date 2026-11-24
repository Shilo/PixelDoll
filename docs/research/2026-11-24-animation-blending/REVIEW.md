# Review round 1: the offline gate deferred the feature on a flawed test

Date: 2026-11-24
Reviewer: coordinator
Subject: the implementation reported in [implementation-notes.md](implementation-notes.md), [offline-gate.mjs](offline-gate.mjs), and the worktree diff.

## Verdict

The shipped pieces (grounded attack slowdown, independent mounted facing) are sound and tested. The layering feature was deferred on a gate that measures the wrong thing and contains a selection bug. The gate's own fitted results look acceptable in the rendered sheets. Fix the gate, then build the API, the canonical functions, the settings and the exports as decided.

## Evidence

The gate reports `inf` (no join) for East on bodyA, but that comes from the *selected* offset, not the fitted one. I re-rendered bodyA with the fitted offset for every pair:

- [South, all 64 pairs](evidence/17-gate-bodyA-south-fit.png)
- [East, all 64 pairs](evidence/18-gate-bodyA-east-fit.png)
- [North, all 64 pairs](evidence/19-gate-bodyA-north-fit.png)

At 4x, East reads as a profile walk with a slash upper body; the seam is hidden by the shirt. The single worst-pair crop at 6x looks worse than the sequence does, because it enlarges one frame and one source-art gap. South and north are comparable. These are not perfect, but they are in the same class as the demo result the owner already accepted.

## Findings

**1. Blocker: the gate selects by offset distance, not by measured quality.** `offline-gate.mjs:124` uses `miss > 1 ? fitted : initial`. A pair whose initial offset is within 1 px of the fit keeps the initial offset even when that initial produces an empty extent, which is exactly how East reports `inf`. The metric that decides must be the seam step of the offset actually used (`step(...)`), not the distance between two offsets. Select the finite result with the lowest step, and treat an infinite step as a fit trigger.

**2. Blocker: agreement with the lab's hand offsets is not the quality bar.** The gate's headline "94 of 192 pairs miss by more than 1 px" compares an automatic offset to offsets that were hand-tuned for appearance. The demo shows why that proxy fails: the automatic offset differs by 6 px, the bounded fit reaches 0 px, and the result looks right. Gate on the fitted result (seam step, gear loss, fragments, visual review), not on offset equality.

**3. Major: the gate does not use the app's actual registration source.** The app plans to use `rig.anchors.hip[clip][dir][cell]` (per-cell tracked hip), falling back to measured or requested keypoints, then the bounded fit. The probe uses `measured ?? keypoints` only, and the bench rigs have no anchors. So the gate cannot clear on the data real characters actually have. Add an anchor-first path and report coverage per body.

**4. Blocker: the deliverable is missing.** No canonical split/composite functions, no Live layering, no setting, no tooltips, and none of the four export operations exist. The API and the app behavior are the feature; the gate was meant to inform eligibility, not to cancel the work.

**5. Major: the app default-on requirement is unmet.** There is no "Walk while attacking" switch, no Waist control, and no tooltip. The owner requires the app switch on by default, with human-readable technical tooltips and the API off by default.

**6. Minor: mount facing can pick a direction the mount cannot draw.** `WorldStage.svelte` uses `loco.intendedDirection ?? loco.direction` for the mount. If the rider's riding pose falls back to a valid facing while the intended direction has no mount view, the mount hides even though a valid view exists. Use the riding presentation's resolved direction for the mount, or clamp to a mount-supported direction; keep the attack facing on the rider only.

**7. Minor: the slowdown starts one frame late and can end one frame late.** `attackScale` is sampled before `actions.step(dt)` starts or ends an attack, so the first attack frame integrates at 1.0 and the frame after it ends may still use 0.8. Sample again after `step`, or compute from the pending request, and add a test.

**8. Minor: the riding retention change has no test or rationale.** `presentation.ts` now prefers `intendedDirection` while riding. Explain why it is needed for independent rider facing and add a test that an attack facing cannot leak into the next riding facing (the documented reverse-facing rule).

**9. Nit: the live envelope now loops clips times directions times mount facings.** It is derived, but check the cost on a project with many clips and directions; if noticeable, bound it to the current outfit's clips and the mount-supported facings.

## What is good

- `mountPlacement` now takes the mount facing and the rider presentation separately; the mount view, ground and height come from travel, the contact from the rider, and the placement math stays integer.
- `attackTravelScale` is one shared factor for integration, destination reach and gait, with mounted, riding and airborne exemptions. The unit test covers the matrix.
- The E2E case proves the mount keeps its east facing while the rider attacks south.
- Tests, check and formatting pass on the shipped parts.

## Round 2: review of the implementation

The API surface, export plan, settings and tests are present and coherent. The targeted unit tests, `npm run check` and the `experience-parity` case pass, and I inspected the settings and tooltip live in the T3 browser at 1280 px: the switch is on by default, the Waist stepper shows Automatic, and both tooltips are readable and keyboard-reachable ([capture](evidence/live/15-coordinator-settings-tooltip.png)).

**Blocker: a layered attack can flip to the full pose and back mid-action.** Eligibility is evaluated for the current pair of cells every frame (`composeLayeredAction` returns a per-pair fallback, then `renderPresentation` draws the whole-body attack for that frame). The gate qualifies only 28 of 48 demo pairs and 35 to 61 of 64 per bodyA facing. A six-frame attack crossed with an eight-frame walk therefore hits ineligible pairs during the action, and the character snaps from layered legs to the attack's own legs and back. That is worse than the slide it replaces and it is not the accepted "brief cape oddity".

Required fix: decide layering once per action. A walk/action/facing set is eligible only if every pair the action can traverse is acceptable, or compute one worst-case verdict for the set at export and at load. Never switch between layered and full inside one action. Add a test that plays a complete action over a changing walk phase and asserts `data-attack-layered` never changes.

**Major: the 1 px seam threshold is tight enough to cause that flicker.** The demo's worst seam is 0 px and its only failures are small gear losses (5 px). BodyA's worst is 4 px. Decide the set-level threshold from visual review, not per-pair conservatism: allow a small gear tolerance (for example up to 10 px) and a seam up to 2 or 3 px, then require the whole action set to pass. The goal is one honest decision per action, not 48 verdicts.

**Major: an arm or weapon connected below the waist is erased as part of the legs.** `splitUpper` removes everything connected to the feet below the waist. A low slash or a hand resting on the hip is connected, so that frame loses the arm and no seam metric notices. Add a visual review of the lowest-arm frames for each approved action, or a setting that keeps layering off for moves whose silhouette crosses the waist.

**Minor: mirrored hip reflection differs by one pixel.** `actionHip` reflects anchors as `w - 1 - x` but keypoints as `(1 - x) * w`. Use one convention so a mirrored facing does not lose a pixel at the join.

**Minor: invalid input returns different shapes.** Phaser/Unity throw, Godot returns `""`, GDevelop throws. That matches the existing host-language contract, but the string return should be documented as the invalid sentinel and tested in all four.

**Minor: `splitUpper` drops every component under 40 px anywhere in the body.** That can delete intentional small art (a spark, a thrown token) above the waist. Restrict cleanup to components that intersect the removed leg region.

**Verification gap: motion was not observed at native cadence.** The browser captures used a test timer because the preview did not deliver frames; foot sliding, the mid-action flip above and reduced motion remain unverified in real time. The E2E suite drives real frames but asserts attributes, not pixels over time.

## Required next round

1. Replace per-pair eligibility with one decision per action set, so a layered action never flips to the full pose. Pick the set-level threshold from visual review (seam and gear tolerance), re-run the gate as a set verdict, and add a playback test that observes a whole action.
2. Address the below-waist limb erasure and the small-component cleanup or scope approval to the actions where it cannot happen.
3. Align the mirrored hip convention, document the invalid sentinel, and test it in all four controllers.
4. Re-run the checks and report: gate set verdicts, the playback test, the four controller tests, and a real-cadence visual check of at least one complete layered action.

## Round 3: fixes verified

The fix round accepted the blocker and the major findings. I re-read the changed runtime, Live path, exporters and tests, and ran the checks myself:

- `npm run check` passed.
- `npm test -- live-layering export-phaser gdevelop-export godot-export unity-export runtime` passed 73 tests, 2 Godot opt-ins skipped without `GODOT_BIN`.
- `npm run e2e -- experience-parity -g "Walk while attacking layers tracked frames"` passed.
- I wrote a temporary Playwright capture against the same bodyA injection the E2E uses, drove real frames, and sampled every `cross-punch` frame for three action cycles: 18 of 18 action frames stayed `layered=true`, with walk cells changing underneath. The test was deleted after the run; the screenshots remain in [evidence/live](evidence/live/16-layered-action-0.png).
- Visual check of the captured frames at 1440x900: no third hand, no missing arm, the seam sits under the shirt, the walking legs keep stepping, and the body does not visibly bob or shrink mid-action. The raised-arm and recovery frames both read as a walking slash.
- The fallback capture hit a character with no east attack art, so it showed the missing-direction notice rather than a full-body fallback. That specific visual path is still unverified.
- Gate verdicts after the fixes: bodyA South pass at 4/3, North pass at 3/2, East fail at 6/3. The stock demo has no tracked hips and falls back.

Remaining gaps are test coverage and unverified environments, not known behavior defects: the outfit downgrade has explicit tests only in Phaser and Godot; Live, GDevelop and Unity lack that assertion; long coats, diagonals, eight directions, real-cadence foot slide and the Unity verifier on this exact commit are unverified. Opus should confirm or refute that these are non-blocking.

## Round 4: Opus recheck

Opus re-ran `npm run check`, the targeted suites including the native Godot test (101 passed), and the offline gate. It agrees the latch, limb ownership, whole lower clothing, z merge, export choice and small corrections hold. It found one remaining blocker and two gaps:

- **Blocker: the torso slides sideways against the legs.** `layerOffset` still searches dx -5..+5 with no cost for leaving the hips, and only dy is reported as hip departure. On bodyA South the sideways departure has a median of 4 px and a maximum of 6 px, and changes by up to 10 px between consecutive 100 ms frames. It is visible in the round-3 screenshots. Likely cause: arm-owned pixels kept at the waist widen the seam measurement and the fit chases them.
- **Missing test:** the requested frame-to-frame placement test became a single-pair vertical assertion. No test covers x or jitter across the set.
- **Gaps:** no fixture with one failing pair, outfit downgrade tested only in Phaser and Godot, `gate-results.md` still describes the old 1 px per-pair rule, and the export size claim used synthetic gear.

Required fix: constrain dx to the hip registration plus or minus 1 px (or an equivalent penalty), exclude arm-owned pixels from the seam extents, report horizontal departure and jitter in the gate, add the placement-jitter and one-failing-pair tests, add the downgrade assertions, refresh the docs, and re-run the gate. If South then fails at 4 px, that is the honest result and the shipping set changes accordingly.
