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

## Required next round

1. Fix findings 1 to 3 and re-run the gate, reporting selected seam step, gear loss, fragments and anchor coverage per body and facing, with a rendered sheet for the worst pair of each facing.
2. Use the corrected gate as eligibility data: a pair layers only when its selected step is finite and within the agreed threshold and gear loss is zero. Everything else falls back.
3. Implement the rest of the decision: canonical split/composite functions in `paperdoll.js`, Live dogfooding, the switch on by default with the Waist control and `Help.svelte` tooltips, the four controller operations, fragments and anchors in the export, and the tests listed in the decision.
4. Fix findings 6 to 9 or rebut them with evidence.
