# Downstream action-gate counter-review

Reviewed `3eed2a9c` against `50eeea36`. The bounded regular-lean gate matrix establishes no additional regression. A later
independent challenge of the motion lane's isolated-hip candidate is recorded below. The action classification
fix holds across the G4, G5 and G9 branches exercised by the matrix. This does not mean that an action classification validates an
item's visual correctness: the application deliberately disables some locomotion-only checks for actions.

## Reproduction

From the repository root, using Node 24.22.1:

```powershell
$env:NODE_OPTIONS='--require=C:\Programming_Files\Shilocity\PixelLab\PixelDoll\docs\reviews\2026-11-07-session-counter-review\no-pixellab.cjs'
& 'app/node_modules/.cache/pixeldoll-verified-node/node-v24.22.1-win-x64/node.exe' docs/reviews/2026-11-07-3eed2a9c-counter-review/gates/probe.mts
```

[The probe](probe.mts) imports each revision's real `itemQa` and `isAction` implementations, without copying their formulas.
It exports the old source into ignored `temp.local` using `git archive`; no checkout or source mutation is performed.
[Results](results.json) retain all 80 paired cases and source SHA-256 hashes. A byte-equality assertion pins the current
import to `3eed2a9c`. The probe was rerun after adding that check: it exits zero, and all assertions pass.

## Scope and controls

The matrix covers `run-dodge` and `dodge`, south and north, upper-body leans of 0, 30, 45 and 70 degrees, and five item
conditions: steady upright rod, shortened rod, one completely empty frame, completely empty clip, and reversed rod.
The complete pose is finite and deterministic. Each six-frame clip has an impulse lean in its third frame. The equipment
is drawn at its requested right wrist; the body image is intentionally empty to prevent an occlusion excuse from masking
the branch being tested. This is synthetic gate integration evidence, not a provider quality or anatomically realistic
north-view rendering experiment. Identical requested and measured poses are inputs, not proof of visual adherence.

Only the ten `run-dodge` 45-degree rows change. All ten become actions, matching the otherwise-identical `dodge` control
after replacing the clip name in diagnostic text. No 0-degree or 30-degree locomotion check changes. The 70-degree and
ordinary `dodge` action controls do not change.

| Condition at a 45-degree `run-dodge` lean | Before | After | Interpretation |
| --- | --- | --- | --- |
| Steady upright rod, south/north | G9 failure | Pass | Original C1 is corrected |
| Shortened rod, south | G4, G5, G9 failures | G4 failure | Presence guard remains strict |
| Shortened rod, north | G4, G5, G9 failures | G4 warning | Existing action occlusion leniency now applies |
| One empty frame, south | G4 and G5 failures | G4 failure | Missing frame remains a failure |
| One empty frame, north | G4 and G5 failures | G4 and G8 warnings | Existing north-action policy, not an empty-frame exception newly added here |
| Entire empty clip, south/north | G4 failure | G4 failure | Missing clip remains a failure |
| Reversed rod, south/north | G9 failure | Pass | Existing action exemption skips rigid-angle checking |

## Challenge to broad claims

- `app/src/lib/items/items.ts:1134` downgrades north-action area loss, including a zero-area frame, to a warning. The nearby
  statement that an empty frame is never excused belongs to `hiddenExplainsLoss`, not the later action branch. A warning
  is still retained. This is an existing action policy and was already observed under `dodge` before this correction, so it
  is not a new finding against `3eed2a9c`.
- `app/src/lib/items/items.ts:1136` and `:1187` deliberately skip G5 and G9 for actions. Consequently a coherent leaning
  body plus an independently corrupted item can pass the now-action clip. That behavior also exists under ordinary action
  names and stronger leans in both revisions. Do not describe the correction as proving that all bad equipment is rejected.
- The response's statement that G5 and north G4 are affected is correct. Its admission that it did not test them is also
  correct; this matrix supplies bounded coverage of those omitted branches.
- No change in the correction touches the F2 note persistence or F3 shared dressing wording paths. This lane did not rerun
  their unrelated end-to-end fixtures and does not claim a fresh persistence or provider-wording validation.

No paid experiment is necessary to decide the geometric classification or these deterministic branch outcomes. No PixelLab
request, balance check, credentials access, board mutation, production edit or production test edit was made in this lane.

## Independent challenge of the compound-pose single-hip candidate

After the regular gate matrix, the motion reviewer found an additional synthetic counterexample and strengthened it to
a one-leg swing with a stationary support leg. I independently read and replayed the final probe under the no-PixelLab
guard. It exits zero and reproduces the same point: a 30-degree upper-body lean, the left leg rotated 45 degrees about its
hip, the right leg and support foot unchanged, and only the measured `RIGHT HIP` moved from `(0.4375, 0.625)` to
`(0.32, 0.54)`. Before: false. After: true. The undistorted pose is nondecisive in both revisions.

This is distinct from the declared whole-limb ambiguity. The requested pose and depicted body remain unchanged; exactly one
measured joint differs. It also is not a wrist/end-joint ambiguity. The estimate error is about 9.28 pixels at a 64-pixel cell,
with no hip-label crossing. A single leg swinging backward while the support leg stays planted is stronger gait evidence
than the earlier both-legs-back candidate, but this is still synthetic, not a stored or provider-generated run. A report
must retain that limitation rather than claiming observed provider incidence or universal locomotion realism.

The path is reachable without malformed inputs: `hasAll` validates complete labels and finite in-bounds coordinates, which
this point satisfies (`app/src/lib/rig/poses.ts:19`). Generated clips store independently estimated joints after this check
(`app/src/studio/create.ts:225` and `:839`). The standard pose-adherence measurement defaults to arm joints
(`app/src/lib/rig/poses.ts:126`), so an isolated hip discrepancy need not cause an adherence warning. `validateRig` checks
structural metadata rather than measured bone lengths (`app/src/lib/rig/rig.ts:91`). `decisiveAction` deliberately prefers
complete measured poses to requested poses (`app/src/lib/items/items.ts:882`). Thus a structurally valid frozen clip can
reach the changed classification with this one erroneous estimate.

I also independently replayed [the motion lane's final gate probe](../motion/hip-candidate.mts), with all assertions passing.
With correct measured metadata, a reversed item fails G9 in both revisions. With only this wrong measured hip, the exact
same reversed item still fails G9 at `50eeea36` but has no failures at `3eed2a9c`. The clean item passes under both
metadata conditions and revisions. Thus this is a bounded new false-negative regression rather than merely a hypothetical
effect of the classifier. The measured hip width and thigh growth stay below the existing 0.2-height guards at
0.1689 and 0.1435. The actual requested pose's bone lengths change by less than `7e-15` pixels. Source-body QA reports no
failures or warnings with correct or corrupted hip metadata; arm adherence ignoring hips explains part of that result,
so it is not independent proof of hip-estimate correctness. Actual cleanup removes zero pixels, and the grip stays within
0.708 pixels of the requested wrist. None of those controls repairs the corrupted measurement or changes the reversed art.

The evidence supports a P2 finding against the correction rather than dismissing this as the already accepted whole-limb
limit: it silently accepts a deliberately reversed item, while the fixed C1 merely sent valid art to review. No claim of
frequent occurrence is established. The motion lane retains the complete gate-level reproduction and controls. The regular
matrix above also establishes that this classification enables the existing G5 and north-view G4 leniencies; it does not
show that those branches independently generate additional paid-provider defects.
