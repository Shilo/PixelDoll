# Moving attack implementation notes

## Offline gate

The gate did not clear. The stored corpus contains one rig with both Walk and Slash. Only the demo has independently fitted offsets, and it has no stored hip geometry. The bounded fit did not reproduce those offsets within 1 px. Whole-body attack rendering remains in use.

The probe uses the midpoint of measured hips when available and requested hips otherwise. It removes base-body components connected to the ankles below the waist, drops upper-body fragments under 40 px, and keeps the Walk pixels from the waist down. It extracts equipment through the existing bench pipeline. The fit applies the coordinator lab's ±5 px search with a pelvis-only extent. It uses the fitted offset when the initial offset differs by more than 1 px on either axis. The demo uses the independently recorded manual offsets in place of unavailable hip offsets.

| Fixture                            | Phase pairs | Offset misses >1 px / worst | Worst seam step, hip or manual → fit → selected | Gear pixels removed / clipped at original sheet bounds | Detached body components / pixels after selection |
| ---------------------------------- | ----------: | --------------------------: | ----------------------------------------------- | -----------------------------------------------------: | ------------------------------------------------: |
| A, Walk/Slash, 3 facings           |         192 |                   94 / 4 px | no join → 4 px → no join                        |                                                 0 / 10 |                                           1 / 141 |
| B, Walk/Walk diagnostic, 8 facings |         512 |                  210 / 7 px | no join → 8 px → no join                        |                                                  0 / 0 |                                           2 / 266 |
| C, Walk/Walk diagnostic, 4 facings |         256 |                   61 / 5 px | no join → 2 px → no join                        |                                                  0 / 0 |                                           2 / 386 |
| N, Walk/Walk diagnostic, 4 facings |         256 |                  106 / 6 px | no join → 13 px → no join                       |                                                  0 / 0 |                                         2 / 1,484 |
| Demo, Walk/Cross punch, south only |          48 |                   48 / 6 px | 6 px → 0 px → 0 px                              |                                                  0 / 5 |                                             0 / 0 |

A seam step is the sum of the left and right pelvis edge differences. “No join” means at least one pair had an empty extent on a measured seam row. All maxima are per pair. For A, South had a worst selected step of 3 px and 19 detached pixels. North had a worst selected step of 2 px and zero detached pixels. The missing East join was within 1 px of a finite fitted offset, so the specified switch rule kept the hip offset. Gear loss counts pixels removed from the selected fragments separately from pixels that would clip if the original lab bounds were used. The gear numbers do not measure new occlusion between upper and lower layers.

B, C and N contain Walk but no attack cells. Walk/Walk exercises their available geometry and equipment, including reflected facings. It supplies no evidence about attacks on those bodies. Demo Cross punch art is populated only on the south row and has no per-cell hip tracks. The probe reads stored pixels and requires no PixelLab calls.

From `app/`, run `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs` to reproduce the per-facing output.

## Independent Live views changes

Grounded attacks on foot scale travel and gait to 80% through one factor shared by destination reach and movement integration. Attack timing stays at its authored rate. Airborne characters, mounts and riding poses use their existing rates.

Mounted rendering resolves the mount from travel facing and the rider from the presented clip. The mount keeps its own gait and locomotion-facing standing height. The rider uses the attack's facing and hip contact and is placed at the seat. Preview and Mount settings pass their selected viewing angle separately from the presented rider. Live framing includes the possible combinations so an aimed attack does not reframe the scene.
