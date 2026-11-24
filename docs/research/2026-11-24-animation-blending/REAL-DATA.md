# Real backup test: Bonequin

Date: 2026-11-24
Source: the owner's Library backup, two characters. Tested through the canonical runtime and Studio's Library Restore. The extracted index stores character rows under keys `0` and `1`; converting those rows to an array and repacking the unchanged blobs restored both characters in an isolated local Studio session.

## Character

- Bonequin: 92x92 cells, pivot 46/86, four directions (west mirrors east), walk 6 cells, slash 8 cells, tracked `anchors.hip` for every move and direction.
- Gear: 39 items across legs, feet, torso, head, hair and one held knife. The current outfit is base only.
- The second character has only a default standing move, so no walk or attack to layer.

## Results

The dressed test equipped braided hair, a torn shirt, jeans, sneakers, a plate carrier and a kitchen knife. The first five have only Default art. Both attack modes omit them and keep the five-item notice; the padded knife has complete Slash art and stays visible. Only gear that full-body Slash would draw can block layering: for example, trousers with complete Slash art but incomplete Walk art.

| Direction | Worst / median seam | Shared shift | Layered pairs |
| --- | --- | --- | --- |
| South | 3 / 1 px | 1 px | 48 / 48 |
| North | 2 / 1 px | 0 px | 48 / 48 |
| East | 13 / 4 px | 1 px | 0 / 48 |
| West | 13 / 4 px | 1 px | 0 / 48 |

- East and West are cardinal facings. In Walk 4, the tracked hip is at y=47.5, above the first eligible lower row (48), though there is whole-body art at row 47. The splitter prefers the valid measured hip at y=51.4188 (row 51) instead. The eight unmeasurable pairs per facing are now finite, but the 13 px maximum still exceeds the 8 px gate. Both facings use the full-body attack.
- Silhouette validation can repair a 2 px error outside the body, but an equally wrong hip inside opaque art can pass validation and the seam gate. Visually check the anatomy, not just the numbers.
- Flash High measured the Phaser archive increase at **+87,632 bytes (+7.9%)** before this round. The final rerun measured **+87,671 bytes (+7.93%)** (1,105,747 to 1,193,418 bytes in that run), including the changed runtime and omission metadata. ZIP sizes can vary slightly between runs.

## Visual check

- Studio screenshots: [South, Walk 0 / Slash 6](evidence/live/bonequin-dressed-south.png) and [North, Walk 1 / Slash 2](evidence/live/bonequin-dressed-north.png). Both showed `attackLayered=true` and “5 equipped items hidden for this view.”
- Compositor contact sheets: [South 4x](evidence/bonequin-dressed-south-4x.png) and [North 4x](evidence/bonequin-dressed-north-4x.png), sampled at Walk/Slash cells `0/0`, `2/3`, and `5/7`.
- Reproduce from `app/`: `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/real-gate.mjs <extracted-backup-directory>`.

## Limits of this test

- One character with walk and slash; no real cape, coat or long-hair outfit with attack coverage.
- No native engine run on this project.
