# Independent challenge of hip-reference fixes

Baseline: `c1024a0cfc8f74b6b94583d8c493ad6d893298ef`. All behavior in this lane comes from Git-exported source under ignored `temp.local`, not the shared dirty tree. No production source, tracked test, board card, credential or PixelLab endpoint was changed or used.

## The remaining defect is real

The old travel fixtures alter only one measured hip, leaving requested motion and equipment unchanged. Baseline classification becomes an action, so G9 skips a reversed item. This is not a harmless estimator statistic: real `itemQa` changes its verdict. The original three cases remain decisive at the current baseline.

The mechanism is the translation origin: midpoint movement from one erroneous hip is subtracted from every joint. Apparent joint travel or wrist rise can then exceed the action thresholds. Earlier corrections protected the separate lean calculation, not this calculation.

## Rejected fix 1: require every hip reference to corroborate action travel

[probe.mts](probe.mts) creates a private candidate that takes each joint's minimum travel/rise across the center and both individual hip translations. It closes all three old travel examples. But it also suppresses real motion when the pelvis moves independently.

Its [results](results.json) contain four complete in-bounds counterexamples. A bone-length-preserving right-arm motion (shoulder rotation -180 degrees, elbow -54) plus coherent pelvic tilt of -40, -30, -20 or +20 degrees decides as an action before, but not with the candidate. Each leg rigidly follows its own hip. Thus the minimum can move a valid wrist-only action below a threshold merely because an observer pivot moved. This is the same underlying rigid-reference problem seen in the preceding lean correction.

This is a synthetic classifier counterexample, not observed provider incidence or a full rendered-art study. It is sufficient to reject universal preservation claims for the proposed hard rule.

## Rejected fix 2: replace the hip center with median joint displacement

[median.mts](median.mts) uses the existing median helper over all 18 point displacements for travel/rise only; lean still uses the hip center. It closes the three old cases, preserves the four examples above, and changes none of 41,405 valid arm/pelvis combinations with a still upper trunk.

That initial negative result is not enough. [median-stress.mts](median-stress.mts) adds independently leaning the whole upper body. In 24,981 tried combinations it already finds four changed decisions: previously nondecisive 25-degree upper leans become decisive with particular arm rotations and pelvic tilt. Head/face points comprise much of the point set and can bias the inferred translation toward upper-body articulation rather than actual whole-body translation. [Results](median-stress-results.json) retain the inputs.

The separate controls reviewer also found changes on ordinary projected runs and an attack, so the median candidate should not ship as a general motion-origin replacement. The 41,405 unchanged simpler cases do not refute those counterexamples.

## A confidence-only version of the minimum is also insufficient

Merely preserving the old action decision while calling it "clear" when both individual hips corroborate it leaves additional false-clean cases.

[false-clear.mts](false-clear.mts) finds three examples in 6,336 tried positions. With a -40-degree pelvic tilt and bone-preserving right-arm rotations of -180/-76 degrees, the actual pose is nondecisive. Moving only measured `LEFT HIP` to `(0.25, 0.675)` makes both the original midpoint rule and the all-anchor minimum decisive. The untouched individual hip was already just beyond the threshold, while the true midpoint was below it. One unreliable reference can therefore move all three apparent results across the cutoff even though one reference is correct.

[false-clear-qa.mts](false-clear-qa.mts) supplies actual `itemQa` controls using independently retained requested poses:

| Metadata and art | Original | All-anchor candidate |
| --- | --- | --- |
| Correct metadata, correct item | Pass | Pass |
| Correct metadata, 180-degree item reversal | G9 failure | G9 failure |
| One wrong hip, correct item | Pass | Pass |
| One wrong hip, same reversed item | Pass | Pass |

All item pixels stay in bounds. [QA results](false-clear-qa-results.json) establish that this is a missed item check, not just a different classifier label. The first discovery helper aliases requested/measured poses for its isolated classification calculation; the QA probe explicitly separates actual requested poses from corrupted measured metadata. Neither proves provider frequency. It also demonstrates why the individual-hip confidence criterion is not a universal single-error guarantee.

Adding requested hip coordinates as another reference could catch this particular independently requested case. It cannot prove that the requested pose was actually rendered, and imported estimates may serve as both stored sequences. Requested-versus-measured agreement should not be treated as ground truth.

## Preferred correction: review the uncertain exemption instead of guessing intent

The coordinator proposed preserving the existing action classifier exactly, then reviewing previously waived size/angle checks when a gait-containing name is overridden by motion. I endorse that narrower policy after challenging the geometric replacements above.

- Keep the existing model, thresholds, motion result, pixel processing and literal ordinary-action behavior.
- For motion-overridden gait names, run the existing G5/G9 observations. If they actually cross an existing threshold, retain an explicit review note rather than claiming that the art is broken or quietly calling it clean.
- Consistent equipment should still pass. Valid wrist articulation can receive an uncertainty note without a hard failure or a paid retry. Ordinary action names continue their existing treatment.
- Preserve the note through Keep, reload, recolor, export and partial clip replacement. Replacing one clip must not leave stale aggregate warnings for it or clear another clip's warning.

This handles the original travel examples and the new false-clear case without adding coordinate/name exceptions or imposing a new rigid-body assumption. It is an explicit review policy for a real ambiguity, not a claim to infer the artist's intent from 18 points in every possible pose.

### Required challenges before calling it complete

1. The original C1 and countertilted-pelvis upright-torch fixtures may intentionally become review warnings while remaining free of hard failures. Do not claim every historical QA status stays unchanged.
2. Use uncertainty language such as checking whether a size or angle change is intended. Do not assert a wrong hip or broken art from this heuristic alone.
3. Cover signed turn, unsigned-axis comparison, shape IoU and loop-seam observations, as well as G5 size variation. Retain ordinary gait failures and ordinary action behavior.
4. Test all persistence/merge boundaries and avoid duplicate or permanently sticky notes.
5. Prove no new failure call or automatic paid retry is introduced by the review-only path.
6. Retain current north-view G4 handling unless a separately demonstrated problem requires changing it.

The coordinator owns production implementation, required checks and final evaluation of those boundaries. This lane has not run the final implementation's test suite and does not label the recommendation as an already validated release.

## Independent check of the actual correction

[final-check.mts](final-check.mts) imports the coordinator's clean corrected snapshot and verifies all four owned source hashes against `fixed-snapshot.json`. It asserts that the complete `decisiveAction` / `isAction` source block remains identical to the pinned baseline. It then independently replays the three old travel cases and this lane's new false-clear case through real `itemQa`.

[final-results.json](final-results.json) records 32 paired cases: four fixtures, gait/ordinary action names, correct/corrupt metadata, and correct/reversed equipment. All classification, failure-call and soft-call results stay unchanged. The four corrupt-metadata/reversed-item gait cases change from clean pass to review warning, each with exactly one G16 note and one retained clip counter. Correct consistent art and ordinary `dodge` outcomes stay unchanged.

A legitimate wrist-only action that the rejected minimum had suppressed remains an action. Its item that turns with the hand passes with no warning; an intentionally world-fixed item receives the disclosed soft review note, with no hard failure. The latter is an ambiguity tradeoff, not a proven art defect.

Direct summary/presentation checks also pass: `acceptQa` retains the counter and accepted status; JSON roundtrip and `qaReasons` retain the plain review reason; merging two affected clips gives counter 2, replacing one with clean QA leaves only the other counter, and replacing that clip clears the counter and restores pass. These are actual summary helpers, not a fresh browser Keep/reload/recolor/export run. The coordinator's wider tests own those application boundaries.

Source review found no new paid-request path. The item runner uses `failCalls` for failures, `isClean` for review presentation, and does not automatically retry a warning. All replayed failure/soft-call maps remain identical. The new counter is summed from replaceable clip parts, rather than appended permanently to the item. Existing legacy summary handling remains conservative as before. No correction to the owned implementation was requested by this peer check.

## Reproduction

From the repository root with Node 24.22.1 and the existing offline transport guard:

```powershell
$env:NODE_OPTIONS='--require=C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/reviews/2026-11-07-session-counter-review/no-pixellab.cjs'
$node='app/node_modules/.cache/pixeldoll-verified-node/node-v24.22.1-win-x64/node.exe'
& $node docs/reviews/2026-11-08-hip-travel-fix/challenge/probe.mts
& $node docs/reviews/2026-11-08-hip-travel-fix/challenge/median.mts
& $node docs/reviews/2026-11-08-hip-travel-fix/challenge/median-stress.mts
& $node docs/reviews/2026-11-08-hip-travel-fix/challenge/false-clear.mts
& $node docs/reviews/2026-11-08-hip-travel-fix/challenge/false-clear-qa.mts
& $node docs/reviews/2026-11-08-hip-travel-fix/challenge/final-check.mts
```

Each command completed with exit zero. Several import the baseline preparer/probe, so repeated executions are not additional unique coverage. `median-stress` needs `median` first; the QA replay needs `false-clear` first. `final-check` additionally requires the coordinator's prepared corrected snapshot and matching source-hash metadata. Generated source remains ignored. The checked-in scripts and bounded result files contain no private reference media or token.
