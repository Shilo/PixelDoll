# Real backup test: Bonequin

Date: 2026-11-24
Source: the owner's Library backup, two characters. Tested directly through the canonical runtime with the real manifest and decoded blobs.

## Character

- Bonequin: 92x92 cells, pivot 46/86, four directions (west mirrors east), walk 6 cells, slash 8 cells, tracked `anchors.hip` for every move and direction.
- Gear: 39 items across legs, feet, torso, head, hair and one held knife. The current outfit is base only.
- The second character has only a default standing move, so no walk or attack to layer.

## Results

Set verdicts with the base body (and with the knife, which does not change them):

| Direction | Worst / median seam | Shared shift | Verdict |
| --- | --- | --- | --- |
| South | 3 / 1 px | 1 px | Layered |
| North | 2 / 1 px | 0 px | Layered |
| East | infinite / 4 px | 3 px | Full body |
| West | infinite / 4 px | 3 px | Full body |

- Front and back layer on the real art with tracked hips. The torso stays on the legs; seams are 1 to 3 px and hidden by the shorts.
- Profile views fail on the shared-shift guard and an unmeasurable seam. That is the honest result for this character's slash, not a crash.
- A dressed outfit (legs, feet, torso, hair, head, knife) forces full body on all 48 pairs because every clothing item has only `default` art. The feature requires walk and attack coverage on the equipped items; this backup's clothes have never been extended to those moves.

## Visual check

- [South, walk 2 / slash 3, 8x](evidence/28-bonequin-south-2-3-8x.png): extended-arm attack over walking legs, no seam or duplicate limb.
- [South, walk 5 / slash 7, 8x](evidence/29-bonequin-south-5-7-8x.png): recovery pose over walking legs, clean waist.

## Limits of this test

- Tested through the canonical runtime on the real project data, not by importing the backup into the running app.
- One character with walk and slash; no real caper, coat or long-hair outfit with attack coverage.
- No native engine run on this project.
