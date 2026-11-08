# Independent motion review of d4c0c633

Both production modules are exported from Git pins into this lane's ignored `temp.local/`. No behavioral result imports the dirty worktree's `items.ts`; the unrelated hair and export edits are excluded. No PixelLab request, credentials access, board mutation or production/test edit was made.

## New P3: a coherent pelvic countertilt reactivates G9 on an action

`d4c0c633` correctly closes the prior N1 example by requiring the lean about both individual hips. However, its calibration assumes each hip stays at its rest-relative place while the upper body rotates. A real pelvis can articulate independently of the upper trunk. The additional minimum can reject that coherent motion even with correct measured joints.

**Source:** pinned `d4c0c633`, `app/src/lib/items/items.ts:918` adds the individual-hip observers; `:930` takes their scaled minimum. At this review's dirty worktree these appear at lines 924/936 because the unrelated hair change adds preceding lines. `isAction` then enables the locomotion-only held-shape check. The reporting coordinator should use the final verified source lines if a fix is later applied.

[pelvis-probe.mts](pelvis-probe.mts) is a self-contained, pinned-source reproduction. A complete 64-pixel six-frame `run-dodge` has a 45-degree upper-body lean in frame 2. Both hips countertilt 30 degrees around their midpoint, and each leg translates with its own hip. A two-pixel whole-body shift preserves the support foot's standing height. There is no wrong estimate: requested and measured joints agree. An intentionally upright torch stays at the requested wrist. This is a coherent synthetic custom-action fixture involving wrist articulation, not newly observed provider art.

| Control | `3eed2a9c` | `d4c0c633` |
| --- | --- | --- |
| 45-degree upper lean, level pelvis | Action; pass | Action; pass |
| **45-degree upper lean, -30-degree pelvis** | **Action; pass** | **Locomotion; G9 failure, item turns 45 degrees against hand** |
| Exact same countertilted art and poses, named `dodge` | Action; pass | Action; pass |
| Pelvic countertilt without upper lean | Locomotion; pass | Locomotion; pass |

[pelvis-results.json](pelvis-results.json) records the complete input and checks. All points are finite, complete and in bounds; `validateRig` reports no errors. Actual connected limb/face bone lengths, pelvis width and the central neck-to-hip distance remain unchanged within numerical precision. The explicit bone list's maximum error is below `8e-15` pixels. A pelvis is allowed to articulate relative to the trunk; this does not claim that both individual neck-to-hip distances are fixed bones.

Source `clipQa` has no failures or warnings in all four controls. Its zero adherence is not independent visual-estimation proof because requested and measured inputs agree. Actual `postProcess` removes zero pixels and repairs no frames. Before/after layer hashes remain identical, and the torch is within one pixel of the requested wrist. The real `itemQa` failure therefore comes from the new classification constraint rather than cleanup or changed art.

This is **P3 by the demonstrated impact**: valid synthetic art receives an unnecessary review; there is no artwork deletion or automatic spending. The first-two-words custom move ID path and the unchanged `dodge` control establish reachability of the gait/action distinction. Provider frequency is unknown. Do not roll back the N1 protection or add a special case for this name, angle or hip coordinate.

## Broad geometry controls

[geometry.mts](geometry.mts) archives `3eed2a9c`, `d4c0c633` and `50eeea36`, then tests 31,185 valid finite poses. It covers all 27 bench rest views, five body-width/aspect transforms, seven whole-body rest inclinations, eleven rotation angles, and upper-only / whole-body / upper-plus-hips rotations. All transforms fit inside a square 64-pixel cell; these are not rectangular-cell support claims.

[geometry-results.json](geometry-results.json) records zero newly decisive cases and zero losses at absolute rotations of 45 degrees or more in those three simple families. Boundary decisions at 40/41 degrees do change: 42 upper-only, 1,296 whole-body and 1,236 upper-plus-hips cases. These are bounded geometry observations, not a universal preservation proof. None of those families varies pelvic orientation independently, which is why their broad negative results coexist with the counterexample above.

## Scratch correction candidate, not production validation

[candidate-check.mts](candidate-check.mts) injects a proposed correction into a fresh ignored `d4c0c633` snapshot only. It retains the knee, hip-center, neck, growth and chain checks, while allowing independent upper-body orientation to corroborate the per-hip term. The corroboration uses the minimum of the disjoint nose-neck and shoulder-line turns, existing `angleDiff`, plausible endpoints and nonzero axis lengths. Thus a lone hip does not rotate either axis, and one wrong nose/neck/shoulder does not rotate both independent axes. Zero-length profile axes cannot supply corroboration.

The candidate restores the countertilted action, keeps the original N1 negative, preserves the level-pelvis positive and no-upper-lean negative, and changes none of the 17 pinned bench clip-directions available in the four bench files. [candidate-results.json](candidate-results.json) records these limited checks. It is a research prototype, not a fully qualified fix: it needs the full outlier regressions, original C1/N1 controls, profile/degenerate axis cases, broader corpus comparisons and required checks before production use. No new source fix is claimed by this lane.

## Peer review of the coordinator's correction

The coordinator implemented the same corroboration in the owned `decisiveAction` function, with short circuits that avoid evaluating it when the existing hip minimum already passes or the unchanged hip-center bend already vetoes the lean. Those short circuits are equivalent for the final boolean decision. All knee, hip-center, neck, growth and chain checks remain. For finite nondegenerate values the new `max` cannot reduce a previously passing lean, so it cannot introduce a false negative relative to `d4c0c633` through this added branch.

[fixed-check.mts](fixed-check.mts) imports the coordinator's clean corrected snapshot, verifies its full `items.ts` SHA-256 against `fixed-snapshot.json`, then runs the actual four `itemQa` controls again. [fixed-results.json](fixed-results.json) records source hash `1a1343712072ad6f3e2dd8ed6bac2cee9ea67edc6714a007181b469835f22a6a`. The countertilted `run-dodge` becomes an action and passes; the level-pelvis and renamed-action positives still pass; the pelvis-only negative stays locomotion. The original N1 bad-hip classifier case remains nondecisive. Two deliberately collapsed-axis controls, nose coincident with neck or the shoulders coincident, remain nondecisive as before. These are conservative degenerate-axis controls, not a proof that every real profile pose can be classified semantically.

I also inspected the owned function and two new production regressions. The tests cover both countertilt signs, actual G9 outcomes under gait/ordinary names, no upper-torso motion, and a single wrong nose/neck/shoulder against subthreshold motion. The correction uses existing `angleDiff`; it does not add a move-name or coordinate exception. Full unit, type and browser checks belong to the coordinator's report. This lane did not touch production source or tests itself.

## Reproduction

Use the pinned Node 24.22.1 and the existing offline transport guard. From the repository root:

```powershell
$env:NODE_OPTIONS='--require=C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/reviews/2026-11-07-session-counter-review/no-pixellab.cjs'
$node='app/node_modules/.cache/pixeldoll-verified-node/node-v24.22.1-win-x64/node.exe'
& $node docs/reviews/2026-11-08-d4c0c633-counter-review/motion/geometry.mts
& $node docs/reviews/2026-11-08-d4c0c633-counter-review/motion/pelvis-probe.mts
& $node docs/reviews/2026-11-08-d4c0c633-counter-review/motion/candidate-check.mts
```

All three ran with exit zero. The first two export their own source pins; the candidate check follows the pelvis probe because it consumes its recorded fixture. The coordinator owns whole-commit type/unit/browser verification. This lane did not run the full E2E suite or reproduce Claude's uncommitted 293-direction and multi-million-position scratch sweeps. No paid experiment is needed to decide these deterministic geometry and QA outcomes.

After the coordinator prepares the clean corrected snapshot with `prepare-snapshot.mjs --fixed`, run `motion/fixed-check.mts` with the same Node/transport guard. It also completed with exit zero. It intentionally requires that snapshot and its matching source-hash record rather than importing the dirty worktree.
