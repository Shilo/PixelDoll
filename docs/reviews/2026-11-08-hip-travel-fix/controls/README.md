# Independent controls and solution challenge

The baseline is Git pin `c1024a0c`. Every implementation used for behavior is exported into ignored `temp.local`; no dirty export or other agent source is imported. This lane changes only its own research artifacts. No PixelLab request, credential access, production/test edit or board mutation was made.

## Reject a blanket per-hip travel minimum

[probe.mts](probe.mts) compares the baseline with a scratch candidate that takes each joint's minimum travel/rise over the midpoint and both individual-hip translation origins. The thresholds and other classifier logic remain unchanged. [results.json](results.json) records source hashes and controls:

- 224 complete clip-directions: 17 stored bench, 135 authored mathematical clips and 72 projected motion-library combinations. No whole-clip decision changes.
- 3,740 isolated-frame cases, with and without exchanging the two measured hip labels. Seventeen decisions change from decisive to nondecisive. Fifteen involve hip-label exchange in slash/cast/death/attack frames; two are ordinary projected chibi-run frames without label exchange.

The isolated-frame differences do not themselves establish 17 production defects. A literal action name remains an action even without decisive metadata, and the two run-frame changes might be desirable corrections. They demonstrate that unchanged whole-clip counts do not establish universal behavior preservation. The other reviewer supplies a stronger coherent, bone-preserving wrist-action/pelvic-tilt counterexample that a strict per-hip minimum incorrectly suppresses.

[invariance.mts](invariance.mts) runs 260 valid bench cases under global translations, horizontal reflections with/without anatomical-label exchange, and uniform cell sizes 16/32/64/96/128/256. Twelve out-of-bounds transformations are excluded. [invariance-results.json](invariance-results.json) records no changed decision within either implementation or between implementations. These are geometry checks, not provider-size qualification.

## Reject a global median-of-joints replacement

The other reviewer proposed the median of all 18 joint displacements as an independent translation reference. I replayed that exact candidate, hash `e4471ad30a943c1d4298864243e30bf0c65b52ee4f5a4b0871469f1c7cd88913`, through the same controls. [median-results.json](median-results.json) records four complete ordinary projected runs becoming decisive: east/west for `c27man` and `body128`. No hip error was injected. Twenty-three isolated-frame decisions also change, including an unswapped projected chibi attack frame becoming nondecisive.

This contradicts promoting the median formula as a safe general replacement based only on large synthetic positive counts. The ordinary-run changes could waive equipment checks in new clean-metadata cases. Articulated body parts have different motion; the facial/upper-body majority does not necessarily estimate whole-body translation.

## Preferred policy and limits

Keep the existing classification, and make its unresolved uncertainty visible only when relevant: if measured motion overrides a gait-containing name and an otherwise waived equipment test actually observes excessive size/angle/shape change, request review without declaring the art broken or starting a paid retry. Consistent equipment and ordinary action names remain unchanged. Reuse existing thresholds and the existing name/motion rules rather than adding item names, pose coordinates or new joint tolerances.

The tradeoff is explicit: a valid gait-named custom attack with intended wrist articulation may receive a review note. That is safer than silently declaring ambiguous equipment clean or rejecting valid art based on rigid anatomical assumptions. Acceptance must retain the reason through storage, clip replacement and export; a transient warning string is insufficient. The selected policy applies even when another frame supplies strong action evidence: classification remains an action, while observed equipment changes still merit review when the name suggests a gait. It does not infer artistic intent or prove every possible user pose.

## Reproduction

From the repository root with pinned Node 24.22.1 and the existing no-PixelLab preload:

```powershell
$env:NODE_OPTIONS='--require=C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/reviews/2026-11-07-session-counter-review/no-pixellab.cjs'
$node='app/node_modules/.cache/pixeldoll-verified-node/node-v24.22.1-win-x64/node.exe'
& $node docs/reviews/2026-11-08-hip-travel-fix/controls/probe.mts
& $node docs/reviews/2026-11-08-hip-travel-fix/controls/invariance.mts
```

`probe.mts` optionally takes an absolute candidate `items.ts` path and an owned JSON output file name. The median replay used the other reviewer's `challenge/temp.local/median/app/src/lib/items/items.ts` after its median generator ran. Source hashes identify the tested module; the script's external-candidate label avoids confusing it with the built-in per-hip prototype. The invariance script imports and reruns the ordinary probe; these counts overlap and must not be summed as unique clips.

These commands complete successfully while preserving behavioral counterexamples as results. They are research probes, not claims that rejected candidates pass production acceptance. Final implementation QA, persistence, unit and browser checks belong to the coordinator and any additional final-source checks recorded below.

## Independent validation of the selected policy

The coordinator supplied a clean corrected snapshot, `../temp.local/fixed/app/src/lib/items/items.ts`, with source hash `48f7b838d12b2091145d4ca14a63eb956f9e00c7867bd6925364b17ce26b55bf`. [source-check.mjs](source-check.mjs) confirms the `decisiveAction` and `isAction` block is byte-identical to the baseline; [source-results.json](source-results.json) records the block hash. Classification preservation therefore does not depend on pretending a finite pose sample covers every possible input.

The [same clip/frame controls](policy-classification-results.json) produce zero decision changes in all 224 whole clips and 3,740 isolated frames. [policy-invariance-results.json](policy-invariance-results.json) records zero differences in the 260 valid transformation cases. The earlier 17 differences belong only to the rejected strict per-hip prototype, not the selected implementation.

[policy-probe.mts](policy-probe.mts) compares actual baseline/corrected `itemQa` over 1,080 cases: right hand, left hand and a worn slot; four cardinal directions; 32/64/128 pixel cells; rest, the residual bad-hip pose and a strong 60-degree action pose; gait/ordinary action names; clean, reversed, size-varying, one-empty-frame and all-empty equipment.

Every case asserts unchanged action classification and identical hard-failure messages. [policy-results.json](policy-results.json) records 176 changed review outcomes/metadata. All changes belong to gait names whose motion overrides the name, with observable rotation/size variation or an already missing frame. There are no changes for consistent equipment, ordinary `dodge` action names, normal rest motion or all-empty clips. Existing missing-frame failures remain failures. The empty body rasters and identical directional geometry deliberately isolate quality-gate branches; these are not visual render or north-occlusion qualifications.

The native 64-pixel bad-hip reversal changes from pass to warning, with one `motionReviewClips` total and one per-clip count. Size variation does likewise. A strong gait-named action with an intentional reversal also receives a warning, not a hard failure: this is the disclosed uncertainty tradeoff rather than proof of bad art. Native control cases have no `softCalls` entries; queue-level no-paid-request behavior is tested by the coordinator, not inferred solely from this map.

Small 32-pixel fixtures have eight-pixel-long equipment, below the existing signed-reach threshold. Their 180-degree reversals remain unchanged when an unsigned axis cannot observe the difference. Rotation on the worn slot likewise remains unchanged because G9 is held-only. This is useful scope control, not a claim that tiny weapon reversals are now detected.

[policy-check.mjs](policy-check.mjs) independently asserts those recorded policy boundaries and count deduplication; [policy-check-results.json](policy-check-results.json) retains the summary. Persistence, clip replacement, export validation and browser behavior remain the coordinator's tests. None of these probes changes generated pixels or makes a PixelLab call.

After the corrected snapshot is prepared, run from the root using the same Node/transport guard:

```powershell
$candidate='C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/reviews/2026-11-08-hip-travel-fix/temp.local/fixed/app/src/lib/items/items.ts'
& $node docs/reviews/2026-11-08-hip-travel-fix/controls/source-check.mjs $candidate
& $node docs/reviews/2026-11-08-hip-travel-fix/controls/invariance.mts $candidate policy-classification-results.json
& $node docs/reviews/2026-11-08-hip-travel-fix/controls/policy-probe.mts $candidate
& $node docs/reviews/2026-11-08-hip-travel-fix/controls/policy-check.mjs
```
