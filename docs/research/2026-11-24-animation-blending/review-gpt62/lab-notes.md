# Walk × punch lab notes

Open [lab.html](lab.html) directly. It embeds the South rows of the original PixelDoll demo PNGs and runs offline. Frame indices start at zero.

## Cases

- **Same seam.** At row 43, walk 4 / punch 3 shows the fixed cut keeping part of the walking arm and sword below the join. The shaped split changes the body edge step from 7 px to 0 px. A fixed cut removes 85–99 occupied sword pixels from the punch layer over its six phases. The shaped version draws that layer intact in the translated attack stack. High confidence in the improvement for this pose.
- **Moving attack.** Both presentations travel south at 2 source px per 100 ms, shown by identical scrolling floors. The original punch translates with its planted legs. The split retains the walk’s body alpha mask from row 53 down in all 48 pairs. The gold tick tracks the x centroid of the occupied pixels in body rows 60–63. It ranges from 33.3 to 35.5 px during the punch and 29.1 to 35.2 px during the walk. High confidence the gait survives. Low confidence about foot lock because the marker cannot identify a planted foot and the travel speed is illustrative.
- **Equipment failure.** Walk 0 / punch 3 has a 0 px body edge step, 11 px of join overlap, and 0 detached body pixels. The original cape’s leg outline still carries into the walk pose and newly covers 23 leg pixels. This is the lab’s worst artifact. The sword stays attached to the same hand in both views. High confidence this cape should be excluded. Medium confidence in this held sword.

## Grading all 48 pairs

The shaped result uses a hand-marked hip anchor per frame. The walk retains a narrow hip window above row 53 and the full lower body below it. The punch shifts by integer pixels and overlaps the walk on the selected seam row. Occupancy means alpha greater than zero.

- **Fail** if the larger left/right edge step is greater than 2 px, shared occupied columns are fewer than 9 px, there are more than 2 body pixels outside the largest four-connected component, or the enabled cape newly covers 12 or more lower-body pixels.
- **Warn** if the edge step is 2 px, overlap is 9 px, there are 1–2 detached body pixels, or the enabled cape newly covers 1–11 lower-body pixels.
- **Pass** otherwise. The cape metric counts new lower-body overlap relative to the shifted original punch body. It does not score holes or check clothing depth. The other equipment toggles affect the drawing while the body geometry score stays the same.

| Row 43, alignment on | Pass | Warn | Fail |
| --- | ---: | ---: | ---: |
| Cape off | 46 | 1 | 1 |
| Cape on | 0 | 17 | 31 |

The largest cape conflict is walk 0 / punch 3 at 23 px. The worst body join with the cape off is walk 0 / punch 5, with a 7 px step despite 11 px of overlap and no detached pixels. Walk 2 / punch 4 warns at a 2 px step. The matrix recalculates when the seam, alignment, or cape changes.

## Where the evidence changed my mind

I expected the fixed row plus manual registration to cover the entire South pair. Walk 0 / punch 5 still fails at the default row. The clean body join in walk 0 / punch 3 also made the cape failure easier to isolate. I have medium confidence in shipping same-facing layering for reviewed pairs after visual checks across every phase and a real engine test. I would reject this cape as-is, and I would revisit a passing recipe if playback shows a spare hand, a jittering waist, a detached item, or foot skate at the intended movement speed.

The fixture covers one body and one punch direction, with no long coat, sword swing, or real engine test. It supplies no evidence for independent aim or contact behavior at game speeds.

## Verification

Headless Chromium opened the page from a local file with HTTP traffic blocked and reported no console messages, page errors, or network requests. I clicked all 48 cells and checked phase selection, playback, pause, reduced motion, row and alignment changes, all five equipment toggles, and 6× zoom. The preview rendered at 728 × 1040 px and 390 × 1548 px. At 4×, each 72 × 72 px canvas displays at 288 × 288 px.
