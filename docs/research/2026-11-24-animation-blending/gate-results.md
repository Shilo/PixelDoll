# Moving attack gate after the scale-aware fit fix

From `app/`, run `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs`.

Live and export qualify a walk, action, and facing as a **set**. Worst seam, median seam, and shared-shift limits scale by cell width from the reviewed 8 / 4 / 2 px at 92 px, with floors that keep the accepted 64 px rule: `max(8, round(8 × width / 92))`, `max(4, round(4 × width / 92))`, `max(2, round(2 × width / 92))`. Shared shift is the smaller absolute edge shift when both edges move in the same direction, and zero otherwise.

| Cell width (px) | Worst / median / shared (px) |
| ---: | --- |
| 48 | 8 / 4 / 2 |
| 64 | 8 / 4 / 2 |
| 92 | 8 / 4 / 2 |
| 128 | 11 / 6 / 3 |
| 256 | 22 / 11 / 6 |

Missing hip geometry or a seam that fails the check triggers a full-body attack. Gear without complete attack art is omitted from both modes, with the Live notice retained. Gear loss means lower gear that full-body attack would draw has incomplete walk art. The verdict can downgrade once after an equipment change but won't upgrade before the next action.

The fit searches within **1 px per axis** of rounded hip registration. It prefers a shared-shift-compliant fit within 1 px of the best seam, without exceeding the worst limit. Off-silhouette hips prefer valid measured/requested hips, then clamp to the closest occupied row and pixel. This does not catch a plausible-looking 2 px error inside the body. Arm-owned pixels remain visible but do not count toward the seam when both limb chains are complete; otherwise the split uses the ankle-component fallback.

| Set / facing | Worst / median seam (px) | Max shared shift (px) | Max hip departure X / Y (px) | Max frame placement change (px) | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| bodyA Walk/Slash South | 7 / 0 | 0 | 1 / 1 | 2 | Layered |
| bodyA Walk/Slash East | 6 / 3 | 2 | 1 / 1 | 3 | Layered |
| bodyA Walk/Slash North | 7 / 0 | 0 | 1 / 1 | 2 | Layered |
| Demo Walk/Cross punch South, manual hips | 6 / 3 | 0 | 1 / 1 | 3 | Layered with manual hips only |
| Stock demo | n/a | n/a | n/a | n/a | Full body: no tracked hips |

The [review's injected 4 px hip error on South Slash 3](review-opus55/recheck2.md) scores 7 / 1 with a 3 px shared shift, which exceeds the 64 px gate. The real 92 px [Bonequin run](REAL-DATA.md) accepts South (3 / 1 / 1) and North (2 / 1 / 0). East and West are cardinal facings; both still use full body (13 / 4 / 1) despite repairing the unusable Walk 4 join. Bonequin's reviewed archive delta was +87,632 bytes (+7.9%); the rerun added +87,671 bytes (+7.93%).

Frame placement change is the largest absolute delta on either axis across adjacent walk, action, or simultaneous steps, including the walk loop boundary. The largest change in the hip-relative correction is South 2 px, East 2 px, North 1 px, and manual demo South 1 px. This coordinate-wise metric is not diagonal distance: the largest South diagonal displacement is about 2.83 px (both axes change by 2), or 2.24 px for simultaneous steps alone.

The threshold follows visual review, not a requirement that the fixtures pass. With hip registration held fixed, the [South worst frames](evidence/25-fixed-south-worst-8x.png) and [East worst frames](evidence/26-fixed-east-worst-8x.png) read as normal shirt and shorts overlap, not torso slide. The seam measures the silhouette at the waist, not hip alignment; the 8 px ceiling allows isolated changes in silhouette but the 4 px median ceiling keeps the typical join tight.

South's first worst pair is Walk 0 / Slash 5, North's is Walk 2 / Slash 5, and East's is Walk 2 / Slash 0. The [8× South comparison](evidence/27-south-slash-source-vs-composite-8x.png) shows original Slash 5 on the left and the worst composite on the right. All 48 opaque source pixels in the checked right-arm patch match after the (1, 2) px upper translation, including the detached-looking shape. The [complete 8× Live capture](evidence/live/19-bodyA-south-full-slash-8x.png) includes all eight original Slash cells; its Walk 4 / Slash 5 pair also scores the South maximum of 7 px. [South 4×](evidence/22-set-gate-bodyA-south.png) · [East 4×](evidence/22-set-gate-bodyA-east.png) · [North 4×](evidence/22-set-gate-bodyA-north.png) · [Manual demo 4×](evidence/23-set-gate-demo-south.png).

## Walk/Walk diagnostics

BodyB, bodyC and bodyN have Walk but no recorded Slash. Their passing facings below are registration diagnostics, not attack eligibility.

| Diagnostic | Facing: worst / median seam / max shared shift (px) | Passing facings |
| --- | --- | --- |
| bodyB | S 2/0/0, SE 5/2/1, E no join/3/2, NE 4/1/0, N 1/0/0, NW 4/1/0, W no join/3/2, SW 5/2/1 | S, SE, NE, N, NW, SW |
| bodyC | S 3/1/0, E 28/9/9, N 2/0/0, W 28/9.5/10 | S, N |
| bodyN | S 2/1/0, E 22/4.5/11, N 6/1/3, W 22/4.5/11 | S, N |

BodyN North Walk/Walk now passes at its 160 px cell size, where a 3 px shared shift is allowed. It has no recorded attack.
