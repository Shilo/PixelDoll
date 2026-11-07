# Review: Back-slot hidden front views (uncommitted, 2026-11-07)

Scope: the working-tree change to `hiddenViews` in app/src/lib/items/items.ts (new `slot` argument and the Back-slot front-view
rule), its three callers (app/src/lib/items/run.ts `dressedKeys` and `evaluateItem`, app/src/lib/equipment/generate.ts
`evaluatePoseFit`) and app/test/unit/hidden-back-views.test.ts. Baseline: HEAD a2313016. The old behavior is reproduced
exactly by calling the working-tree `hiddenViews` without a slot, so no copy of the old code was needed.

Method: offline, production code only, no PixelLab calls. `scripts/review/hidden-back.ts` replays the frozen bench back items
(a-cape 64 px, b-cloak 80 px Top-down 8, n-cloak128 160 px) through `extractCell`, draws 15 synthetic Back-slot shapes from the
north rest keypoints of the real bench bodies A (64), B (80) and N (160), checks the direction mapping and mirrored sets, and
runs `itemQa` on posed frames of a hidden view. The new unit test passes (4 tests).

Run: `node docs/research/2026-11-07-paperdoll-cycle/scripts/review/hidden-back.ts` from the repo root (a few seconds).

Context that changes the weight of every finding: the Studio never re-rolls automatically (`rerollCall` is called only from
the dev page M3), and `fail` and `warn` both put the item on a review card ("look"). So the change turns a failed check
("G4 keyframe ...: item missing") into a softer review note ("no item in this view; check that the view hides it") that reads
as acceptable. The output is unchanged; the risk is that the user keeps a broken item because the note invites it.

## Findings

### 1. Front-visible Back items with a failed front dress are now excused (regression, small items only)

Rule inputs from the north view, with the south view emptied (a failed front dress) and the east view shown:

| Shape (north rest view) | on-body A / B / N | cover A / B / N | south excused at |
| --- | --- | --- | --- |
| backpack | 100 / 100 / 100 % | 14 / 13 / 16 % | all (intended) |
| satchel, small folded wings | 100 % | 2 to 12 % | all (intended) |
| quiver, arrows above the shoulder | 94 / 95 / 81 % | 7 to 9 % | all |
| back greatsword, hilt above the shoulder | 90 / 92 / 80 % | 6 to 8 % | all |
| shoulder capelet or mantle | 100 % | 9 / 9 / 11 % | all |
| narrow scarf with a tail down the back | 100 % | 5 / 6 / 6 % | all |
| waist-length cape | 95 / 95 / 93 % | 27 / **23** / 31 % | B only |
| large backpack with a bedroll, folded wings | 92 to 97 % | 27 to 38 % | none |
| knee and full capes, spread wings, tails | 25 to 88 % | 6 to 83 % | none |

A capelet, a scarf and a waist cape on a slender body are visible from the front; so are arrow fletchings and a greatsword hilt
above the shoulder (6 to 18 % of their px stick out past the silhouette). Their empty front is a failed dress, previously
"item missing", now a soft note. Wings and tails are safe: spread wings and tails lie 25 to 67 % on the body, folded wings
cover 27 to 36 %. The real bench capes are far from the cut (cover 100 to 133 %, on-body 69 to 75 %, stable over walk/north),
so full capes and cloaks keep failing.

Why the 70 % cut is loose: whatever lies off the body from behind also sticks out from the front, so a truly hidden item lies
almost entirely on the body. Every intended case measured 100 %.

Smallest fix:
- Raise the on-body share from 0.7 to 0.95. Drops the greatsword everywhere and the quiver at A and N (B sits at 95 %); keeps
  backpack, satchel and small wings. Real backpacks with 1 px outline overhang were not measured (no real backpack fixture).
- Add a side-view test: in the east keyframe, at least 90 % of the item's px lie behind the body's row center (east faces
  +x). Measured: backpack and quiver 100 %, capelet 50 to 53 %, scarf 69 to 79 %, waist cape 86 to 93 %. This catches the
  capelet and scarf, which no back-view measure can tell from a backpack. The B waist cape (93 %, cover 23 %) still slips; a
  cover cap of 0.20 instead of 0.25 also drops it, with a thin margin (backpack max 16 %).
- A mirrored-front test (flip the north layer onto the south body) is not robust: the mirrored north body matches the south
  body at IoU 0.97 (A) but only 0.64 (B) and 0.79 (N).

### 2. A failed back view plus a failed front view is excused (regression, double failure)

South empty and north drawn as only the top 20 % of the cape (a shoulder strip) with east intact: a-cape and b-cloak now
excuse south (old: fail); n-cloak128 still fails. There is no minimum size either: one stray on-body pixel in the north view
is enough. Smallest fix: require the opposite view's item to have at least `H4.minPx` (12) px and at least half the area of
the side (east) keyframe item. Bench capes have north/east area ratios of 2.2 to 3.2; the fragments fall to 0.28 to 0.55. The 0.5 ratio is untested on a
real backpack or quiver (no fixture), whose side view can be deep; treat it as a starting value.

### 3. Direction mapping and mirrored sets (fine, one gap)

South maps to north, south-east to north-west, south-west to north-east (verified). Top-down 4 (west mirrored): south is
excused. With all 8 views drawn, S, SE and SW are excused together. In the default Top-down 8 (south-west, west and north-west
mirrored), north-west is absent from `keys`, so south-east is never excused: an item with an empty S and SE still fails, so the
change does not help default 8-direction rigs when both front views are empty. Not a regression. Smallest fix if wanted: when
`keys[o]` is missing, use the mirror source (north-east for north-west); on-body share and cover are mirror-invariant, so its
own cell base can be used unflipped.

### 4. Posed frames of a hidden view are only held empty when the clip median is 0 (pre-existing gap, now wider)

`itemQa` on a hidden south view (Back slot, 4 posed frames): all empty gives warn; the item in 1 of 4 frames fails "item
missing"; 3 of 4 fails "min area 0 %"; **all 4 frames pass cleanly**. The `!med` branch at items.ts G4 is the only place
`hidden` is read. In `evaluateItem` the keyframe note still keeps the whole item at warn, but in Add moves and repair
(`dressedKeys`, run.ts) there is no keyframe note, so a new move whose south frames all draw the backpack passes with no
warning while the standing view and other moves hide it. The old code passed that case too, but no Back item with an empty
front could be accepted without overriding a failure. Smallest fix: before the `!med` branch, flag a hidden view whose frames
have any item px ("G4 clip: the item appears in a view its dressed keyframe hides"), as the code comment already promises.

### 5. Other downstream effects (fine)

`postProcess`, `dirGate` (H4 skips an empty keyframe unless a posed frame has 12 px and 50 % body cover; Back has `bgZ`, so
G11 to G14 do not run), exports and dye do not read `hidden`. Empty frames save as authored transparency (`coverage`), the same
path glasses from behind use, so exports and the missing-item hint treat them correctly. generate.ts passes the same slot id
(`spec.slot`), so pose fitting matches the draft path.

### 6. Scale (fine, body proportions matter more than pixels)

Both inputs are ratios. The same backpack measures 13 to 16 % cover and 100 % on-body at 64, 80 and 160 px. The variation that
crosses a threshold comes from body proportions, not size: the waist cape is 27 % (chibi A), 23 % (slender B), 31 % (N). At
64 px a quiver or hilt that sticks out by 3 to 4 px is 6 to 10 % of the item, so a per-pixel floor would behave differently
from the share; the share-based fix in finding 1 is scale-stable.

### 7. Evidence in the code comment (fine, wording)

The comment cites "a backpack failed G4 item missing on every attempt". That comes from the synthetic audit (audit-worn.md
section 4); the live Agent-mode backpack passed and saved itself (README live test). Suggest "synthetic audit" in the comment.

## Tests

The new test covers the backpack, a cape, an off-body item and earrings. Missing: diagonal mapping (SE to NW), an absent
opposite view, a capelet or scarf (finding 1) and a hidden view whose posed frames show the item (finding 4).
