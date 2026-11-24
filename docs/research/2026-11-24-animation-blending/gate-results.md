# Moving attack gate after the horizontal fit fix

From `app/`, run `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs`.

Live and export qualify a walk, action, and facing as a **set**. A set must have a **worst seam ≤ 8 px** and a **median seam ≤ 4 px**, measured across both edges of every reachable pair. Any pair also fails if both waist edges move in the same direction by **more than 2 px each**. The shared shift is the smaller absolute edge shift when both move in the same direction, and zero otherwise. Missing hip geometry, undrawable required outfit layers, and an unusable limb split with no finite join still force a full-body action. The verdict is latched at action start; a newly unsupported outfit can downgrade it once, but restoring support does not upgrade it. The table isolates the geometry gate; the recorded gear-pixel counts are input counts, not loss measurements.

The fit may improve the measured seam only within **1 px per axis** of rounded hip registration. Arm-owned pixels stay visible but do not count toward the seam extents when both limb chains are complete. Otherwise the split uses the ankle-component fallback, with the same placement bounds.

| Set / facing | Worst / median seam (px) | Max shared shift (px) | Max hip departure X / Y (px) | Max frame placement change (px) | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| bodyA Walk/Slash South | 7 / 0 | 0 | 1 / 1 | 2 | Layered |
| bodyA Walk/Slash East | 6 / 3 | 2 | 1 / 1 | 3 | Layered |
| bodyA Walk/Slash North | 7 / 0 | 0 | 1 / 1 | 2 | Layered |
| Demo Walk/Cross punch South, manual hips | 6 / 3 | 0 | 1 / 1 | 3 | Layered with manual hips only |
| Stock demo | n/a | n/a | n/a | n/a | Full body: no tracked hips |

The [review's injected 4 px hip error on South Slash 3](review-opus55/recheck2.md) now forces full-body rendering: the set still scores 7 / 1 on worst / median seam, but its maximum shared shift is 3 px. The boundary is inclusive at 2 px and rejects 3 px in either direction.

Frame placement change is the largest absolute delta on either axis across adjacent walk, action, or simultaneous steps, including the walk loop boundary. The largest change in the hip-relative correction is South 2 px, East 2 px, North 1 px, and manual demo South 1 px. This coordinate-wise metric is not diagonal distance: the largest South diagonal displacement is about 2.83 px (both axes change by 2), or 2.24 px for simultaneous steps alone.

The threshold follows visual review, not a requirement that the fixtures pass. With hip registration held fixed, the [South worst frames](evidence/25-fixed-south-worst-8x.png) and [East worst frames](evidence/26-fixed-east-worst-8x.png) read as normal shirt and shorts overlap, not torso slide. The seam measures the silhouette at the waist, not hip alignment; the 8 px ceiling allows isolated changes in silhouette but the 4 px median ceiling keeps the typical join tight.

South's first worst pair is Walk 0 / Slash 5, North's is Walk 2 / Slash 5, and East's is Walk 2 / Slash 0. The [8× South comparison](evidence/27-south-slash-source-vs-composite-8x.png) shows original Slash 5 on the left and the worst composite on the right. All 48 opaque source pixels in the checked right-arm patch match after the (1, 2) px upper translation, including the detached-looking shape. The [complete 8× Live capture](evidence/live/19-bodyA-south-full-slash-8x.png) includes all eight original Slash cells; its Walk 4 / Slash 5 pair also scores the South maximum of 7 px. [South 4×](evidence/22-set-gate-bodyA-south.png) · [East 4×](evidence/22-set-gate-bodyA-east.png) · [North 4×](evidence/22-set-gate-bodyA-north.png) · [Manual demo 4×](evidence/23-set-gate-demo-south.png).

## Walk/Walk diagnostics

BodyB, bodyC and bodyN have Walk but no recorded Slash. Their passing facings below are registration diagnostics, not attack eligibility.

| Diagnostic | Facing: worst / median seam / max shared shift (px) | Passing facings |
| --- | --- | --- |
| bodyB | S 2/0/0, SE 5/1/0, E no join/3/2, NE 4/1/0, N 1/0/0, NW 4/1/0, W no join/3/2, SW 5/1/0 | S, SE, NE, N, NW, SW |
| bodyC | S 3/1/0, E 28/9/9, N 2/0/0, W 28/10/10 | S, N |
| bodyN | S 2/1/0, E 22/4.5/11, N 6/1/3, W 22/4.5/11 | S |

BodyN North Walk/Walk is the only recorded verdict change. It now fails on a shared shift of 3 px; it has no recorded attack and does not affect shipped attack layering.
