# Fix plan after the Opus challenge

Date: 2026-11-24
Inputs: [Opus challenge](review-opus55/challenge.md), [coordinator review](REVIEW.md), commit `2cfc0b63`.

The plumbing is accepted. The following must change before the feature is called done. Each item is a hard requirement unless marked as a nit.

## 1. Latch layering for the whole action

- Decide once per action: a verdict for the set (walk clip, action clip, direction, outfit). Hold it until the action ends or `play` cancels it. A walk phase change must never switch between layered and full.
- Re-evaluate only on an equipment change. If the new outfit invalidates the set, the rest of the action may switch once; document and test that single case.
- Live, Phaser, GDevelop, Godot and Unity all hold the verdict. `playAction`'s return describes the action, not the first frame.
- Add a whole-action playback test in every controller and in Live: play across a changing walk phase and assert the layered state never changes.
- The E2E observer must record `attackLayered` and assert it stays true for the action.

## 2. Eligibility is a set verdict, not a per-frame one

- Hard failures: missing hip data for the set, held or worn gear that cannot be drawn, a limb-ownership failure (item 4), or a seam that exceeds the set limit.
- Seam limit: score the whole set. Use the worst pair after the fit, with a limit of 4 px and a vertical constraint of hip registration ±1 px. Report worst and median, not per-pair pass fail.
- Frame padding: compute one stable draw frame for the set, including the largest required offset, so gear is never lost because it leaves the frame. The frame must not change during the action, or the character will rescale mid-attack. Do not use frame clipping as a fallback reason.
- Re-run the offline gate as set verdicts per body, direction and action, and list which sets ship.

## 3. Constrain the fit vertically

- `layerOffset` must keep dy within ±1 px of hip registration. Hips are the vertical truth. The seam score alone cannot see vertical position.
- Keep the horizontal search bounded as today. Report the chosen dx/dy and the hip departure in the gate.
- Add a test that the torso height does not move by more than 1 px between layered frames.

## 4. Limb ownership in both stacks

- Do not use the foot flood fill as the only rule. For each pixel below the waist, compare distance to the leg segments (hip knee, knee ankle) and to the arm segments (shoulder elbow, elbow wrist) from the stored keypoints. Leg-owned pixels go to the lower stack; everything else stays with the upper stack.
- If the keypoints for a cell are missing, fall back to the flood fill or mark the set ineligible; do not guess silently.
- The attack's own hand below the waist must survive in the upper stack. The walk's hand below the waist must not appear in the lower stack. Add the bodyA South walk 1 / slash 1 regression that shows no third hand and no missing hand.
- Keep the under-40 px cleanup only for components that intersect the removed leg region. Do not drop unrelated small art.

## 5. Lower-body clothing comes from the walk, whole

- Lower-slot items (feet, legs, underwear) are taken whole from the walk, without the leg cut. The upper stack covers the waistband overlap.
- Add a trousers fixture to the gate and prove a character in trousers can layer at Waist 0. If it still fails, fix the reason rather than accepting it.

## 6. Merge the two stacks by z

- Do not draw the whole upper stack above the lower stack. Collect draws from both poses, tag each with its source and part, and sort with the canonical comparator. Lower-slot draws use the lower fragment; everything else uses the upper fragment; offsets apply only to upper draws.
- Add a bg-layer fixture (a cape or back-slot `bgZ` layer) that proves it draws behind the walking legs.

## 7. Export inclusion is explicit

- Stop using the Live-view switch to decide whether an export contains fragments. Add an Export control, default off, with a clear label and help. A Live user who wants layering should not silently grow every archive.
- Do not duplicate non-body upper sheets. Reference the existing attack sheet for layers whose upper fragment is unchanged. Measure and report the size delta on a real character.
- Document the archive contents and the control.

## 8. Small corrections

- Add the half-pixel anchor convention: anchor hips are pixel indices, so add 0.5 before averaging or comparing with keypoints, as `mounts.ts` does. Keep the reflection formulas for their own conventions.
- Document `""` as the invalid sentinel for Godot and Unity; Phaser and GDevelop throw. Test all four.
- Update the tooltip to include the cape and coat caveat and the 80 percent slowdown.
- Update the stale implementation notes that still say the feature was not shipped.
- Cache the per-set fragments and offsets so a new action does not recompute two composites, a flood fill and 121 offsets per frame. Measure at 64 px and 128 px.

## 9. Verification before handoff

- `npm run check`, the targeted unit suites, the whole-action playback tests, the trousers and bg-layer tests, one E2E case, and the native Godot and Unity verifiers.
- The coordinator runs a real-cadence visual check of one complete layered action and one full-body fallback in the T3 browser. Do not claim native-cadence motion until that passes.
- Report exact commands, what passed, what remains unverified, and any rebuttal with evidence.
