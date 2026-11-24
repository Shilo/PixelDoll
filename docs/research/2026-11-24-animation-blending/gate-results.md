# Corrected moving attack gate

Run from `app/` with `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs`. The accepted seam step is finite and at most **1 px total** across both edges, with **zero lost gear pixels**. Infinite and nonzero initial steps try the bounded fit. A fit replaces registration only when it measures better. A tie retains the hip-derived offset.

| Fixture and facing | Hip anchors | Worst / median seam (px) | Max gear loss (px) | Max detached body fragments | Selected source counts | Qualified |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| bodyA South | 0/16 | 2 / 0 | 10 | 1 | 44 fit, 20 requested | 35/64 |
| bodyA East | 0/16 | 4 / 1 | 6 | 0 | 31 fit, 33 requested | 37/64 |
| bodyA North | 0/16 | 1 / 0 | 9 | 0 | 49 fit, 15 requested | 61/64 |
| Demo South, manual geometry | 0/14 | 0 / 0 | 5 | 0 | 48 fit | 28/48 |

BodyB has 128/128 anchor samples and bodyC and bodyN each have 64/64 across all reported facings. Those three fixtures have Walk art for the diagnostic but no Slash. Their results are Walk/Walk registration checks. The stock demo has no hip geometry. The manual diagnostic preserves the earlier visual result and gives no stock-demo Live eligibility by itself.

Tiles are indexed by Walk row and Attack column, both zero-based. East is worst. Tile **Walk 2 / Slash 1** uses the fit at (-1, +3) and still has a 4 px seam. Its sleeve and side profile are readable, but the shirt edge steps abruptly at the join. East Walk 2 / Slash 4 has the tighter profile and qualifies. The cutoff keeps joins within one source pixel across both edges. Printed gear loss is measured separately from the body-only sheets.

[South 4×](evidence/20-gate-bodyA-south-selected.png) · [East 4×](evidence/20-gate-bodyA-east-selected.png) · [North 4×](evidence/20-gate-bodyA-north-selected.png) · [Demo 4×](evidence/21-gate-demo-south-selected.png)

## Qualifying Attack cells for each Walk cell

| Walk | bodyA South | bodyA East | bodyA North | Demo South |
| ---: | --- | --- | --- | --- |
| 0 | 0 6 7 | 0 1 2 3 5 6 7 | 0 1 2 3 4 5 6 7 | 0 1 4 5 |
| 1 | 0 4 6 7 | 2 3 4 | 0 1 2 3 4 5 7 | 1 4 5 |
| 2 | 0 4 6 7 | 4 | 0 1 2 3 4 5 6 7 | 1 4 5 |
| 3 | 0 1 2 3 4 5 6 7 | 2 3 5 6 | 0 1 2 3 4 5 6 7 | 1 4 5 |
| 4 | 0 4 6 7 | 0 1 2 3 5 6 7 | 0 1 2 3 4 5 6 7 | 1 4 5 |
| 5 | 0 4 6 7 | 1 2 3 5 6 7 | 1 2 3 4 5 6 7 | 1 4 5 |
| 6 | 0 4 6 7 | 2 3 | 1 2 3 4 5 6 7 | 1 4 5 |
| 7 | 0 3 4 7 | 0 1 2 3 5 6 7 | 0 1 2 3 4 5 6 7 | 0 1 2 3 4 5 |

South has 1 seam fallback and 28 gear-loss fallbacks. East has 22 seam fallbacks and 5 gear-loss fallbacks. North has 3 gear-loss fallbacks. The demo manual diagnostic has 20 gear-loss fallbacks. When both reasons apply, the seam takes precedence.

