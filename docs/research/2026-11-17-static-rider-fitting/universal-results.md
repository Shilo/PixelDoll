# Reusable astride target probe

November 17, 2026. Offline research only. No application, API, schema, export or generation changes. No new paid calls. See the [interactive probe](universal-rider.html) and [eight-direction contact sheet](evidence/universal-directions.png).

## Decision

Pursue a reusable static astride pose, not a promise that one pose fits everything. Keep the rider upright and unchanged while each mount owns its seat, neck motion and tack endpoints. Prefer one reviewed pose across compatible mount shapes and rider sizes; allow an explicit alternate seated pose when that fit fails. Do not automatically rotate or stretch the rendered rider to conceal incompatibility.

The wider candidate has better geometric coverage than the balanced candidate in this sample, but spreads its thighs considerably. Fixed bone lengths do not prove comfortable anatomy. Neither target is ready to become the production Ride skeleton. The current paid East pixels still depict a chair-sit; this experiment does not repair them.

Static-first with optional animation remains the proposed product direction, not implemented functionality. A reviewed still avoids generating repeated cells per item. Optional rider clips need separately qualified timing and mount-relative contact; they need not share the mount's frame count.

## Experiment and acceptance

Three authored ellipsoid mounts vary seat height, back width, neck length and head motion. All eight facings project the same local target; four phases translate the seat and independently move the head. No whole-body rotation occurs. The explicit broad-back override changes only leg angles and preserves bone lengths. The user chooses that mode, and the named broad fixture receives the override; no collision score automatically selects it.

The clearance proxy samples 32 points per thigh and shin, both sides, and subtracts a 1.5-unit limb radius from the smallest lateral distance to the ellipsoid section. There is no hidden exclusion near the hip. A nonnegative adjusted margin passes this proxy only. It is not exact capsule collision, saddle contact, garment silhouette clearance or a calibrated anatomical model. The ellipsoid tapers at the seat, unlike a broad flat saddle. Sampling can miss narrow intersections.

Measured minimum adjusted lateral margins, in synthetic model units:

| Rider size | Mount     | Balanced | Wider |
| ---------- | --------- | -------: | ----: |
| 75%        | Compact   |    -2.09 |  0.40 |
| 75%        | Long neck |    -2.01 |  0.51 |
| 75%        | Broad     |    -5.97 | -3.03 |
| 100%       | Compact   |    -0.55 |  1.40 |
| 100%       | Long neck |    -0.31 |  1.51 |
| 100%       | Broad     |    -4.02 | -0.65 |
| 125%       | Compact   |     0.45 |  2.40 |
| 125%       | Long neck |     0.69 |  2.51 |
| 125%       | Broad     |    -2.30 |  1.17 |

These deliberately include failures. At standard size, the wider pose clears two of three mounts, not all three. At 75%, it still clears the two narrow mounts. The broad mount needs a different seat, pose or size pairing. The explicit override is the same wider target, so it cannot solve a broad case that already fails with that target. No fixture was narrowed to make an assertion pass. Rider size scales the skeleton, not the rendered stroke: the 1.5-unit radius stays fixed at every size, matching the drawing. These are not proportionally scaled body silhouettes.

## Tack and depth

- Mounts declare bridle or harness contacts; arbitrary creatures may instead use no reins, handlebars or authored tack. There is no universal neck location.
- Harness endpoints sit at 70% along the animated neck segment with opposite 3.5-unit lateral offsets, matching the intended neck radius. This is a schematic 3D tube convention, not pixel-exact contact on the projected 7-unit SVG stroke. Real mount artwork needs reviewed visible attachment pixels per frame.
- A fixed-sag line joins the synthetic grip to the contact without moving either endpoint. Neck motion changes the line rather than fitting the rider's hands to the head.
- North/South draw both legs behind the barrel symmetrically. Side and oblique views put the far leg behind and near leg in front. This symmetry fix is legs only: axial arms and reins still use illustrative near/far ordering. This is not a general depth resolver or correct axial tack qualification.
- One occupied hand suppresses its line; both occupied suppress both. This demonstrates exclusion only. It does not implement gathering both reins into the free hand or validate weapon/cape pixels.
- Saved-art mode uses the original East still at native size, with West explicitly reflected. It disables target pose, size and tack controls. It does not invent six missing seated views or attach lines to unmeasured target grips.

## Adversarial review response

Opus 5.5 medium identified asymmetric axial leg layering, a disconnected long neck, head-relative harness drift, centerline-only clearance, a weak same-bob motion test, missing size controls and a stale-generated-page risk. These were valid: the renderer now uses symmetric axial leg layers and a body-connected neck root; harness contacts follow that neck; clearance includes the declared radius; tests compare every joint relative to the seat in all four phases, exercise the size failures and reject stale inlined model code. Inactive saved-art controls and hidden marker handling were also corrected.

The review's statement that every small rider fails described the earlier balanced candidate, not the later wider candidate. The table records both. Reusing exactly the same pose is an invariant, not proof of fit. Selecting an explicit mount-specific override is intentional, not an automatic fitting bug. Extreme abduction remains a visual/anatomical concern without adopting an unverified numerical anatomical limit.

An Opus 5.5 medium recheck found no blockers and independently matched the standard Compact margin and broad-mount outcomes. Its valid wording findings are reflected here: the override is scoped by mount ID after explicit selection; the contact sheet labels every proxy failure; fixed stroke radius and axial arm/rein limitations are disclosed. The generated-code check covers both inlined model modules and the template script after the sprite placeholder, not all markup/styles or the manually rasterized PNG. Those outputs were regenerated and visually inspected, not protected by a complete stale-artifact test.

## Remaining gates

The camera shear is illustrative and uncalibrated. The 24 projected targets are not 24 generated sprites or independent anatomical successes. Mount feet use a schematic screen ground, not a physical gait. Reins may cross silhouettes; automated endpoint checks do not prove correct occlusion or grip ownership. The saved art scale is not calibrated to the target units. No saddle/stirrup geometry, independent West art, real neck motion, equipment, unusual body proportions or flat broad backs are qualified.

Next useful step: review a corrected astride East still on a real mount with explicit hip, free-hand grip and mount tack contacts. Check a near leg down the flank and far-leg occlusion, not just bent knees. Then qualify axial and diagonal views and one weapon/cape case before application integration. Further pose generation and item posing remain separate paid work, not automatically authorized by this offline result.

## Reproduce

From the repository root:

```sh
node docs/research/2026-11-17-static-rider-fitting/build-universal.mts
node --test docs/research/2026-11-17-static-rider-fitting/test.mts docs/research/2026-11-17-static-rider-fitting/universal.test.mjs
magick -background none docs/research/2026-11-17-static-rider-fitting/evidence/universal-directions.svg docs/research/2026-11-17-static-rider-fitting/evidence/universal-directions.png
```

The source strip remains byte-identical. These research checks do not require the app's test suite because no app code changes.

### Verification record

The combined research suite passed all 21 tests. The 3,456 attachment combinations verify endpoint and occupied-hand invariants, not independent artwork acceptance. The regenerated 24-target contact sheet was inspected for connected necks, axial leg symmetry and obvious layer gaps. The three schematic mount shapes remain deliberately simple.

The interactive page rendered at 728 pixels in dark appearance and 390 pixels in light appearance with no console messages. Control behavior was exercised in the DOM harness, including motion, facing, fit failures and saved-art restrictions. Native browser interaction, pixel-exact real-art contact, application tests and engine exports were not exercised in this offline follow-up.
