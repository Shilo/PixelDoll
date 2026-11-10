# Dark item outline lost to the key: root cause and prototype rule (offline, 2026-11-10)

No PixelLab calls, no edits under app/. Production code is loaded unchanged; `hook.mjs` (node --import) redirects every import of
`app/src/lib/image/chroma.ts` to `chroma-x.ts`, which re-exports production chroma and overrides only `chromaLayer` to insert the
prototype rule after `absorbOutline` (`globalThis.__OUTLINE` = off | v1 | v2 | v3; off is production behavior).

Scripts (this folder): `ylive.mts` (arm Y live outputs, run from spikes/api with C25_RUN=chroma-2026-11-09), `corpus.mts` (frozen
bench corpus through `scripts/bench.ts` runBench + report, plus the S4 q3e keyframes, run from app/), `sheet.mts`.
Logs: `ylive.log`, `ylive2.log`, `corpus.log`. Per-px diagnosis: `y_lost_diag.json`.

## 1. Root cause

Lost px = opaque output px dropped as key (score >= KT 35) and more than 40 per channel from the key ramp (eval_y definition).
Arm Y, 356 cells (dress views all keys/bodies/seeds + 48 walk cells): 380 lost px.

- 378 of 380 lie inside the base silhouette; 328 are darker than the ramp's darkest shade (lum < 0.138), e.g. (4,19,0) x 278,
  (2,17,3) x 27, (5,18,0) x 8, blue (0,1,14) x 11. Score 72 to 94, rampDistance 41 to 46.
- Item 8-neighbors: 0: 9, 1: 5, 2: 54, 3: 161, 4: 145, 5+: 6. They are the item's outer contour: one side item, the other side mannequin.
- Why each guard skips them:
  - `chromaMask`: score >= 35, so they are key and never enter the mask.
  - `dropKeyOutline` (rim guard, S2/M3, stroke, greenLeaning, lightOut, OUTLINE.*): only REMOVES px that are already in the mask.
    These px never reach it, so none of its tests (stroke, greenLeaning, lightOut, mean 60) apply. It is not the cause.
  - `absorbOutline`: they are dark (keyLum <= 0.3), but (a) applies only off the base silhouette and (b) needs >= 5 of 8 item
    neighbors. A contour px has 2 to 4. That is the gap: a 1 px outline on the item's outer edge over the body.
  - `despill`: never sees them.
- Mannequin darkened by the model (far-from-ramp key px inside the body, 3+ px from any item): green 4, azure 1, blue 1 in 356
  cells. On the bench, b-tunic (magenta) shows a few darkened head/foot outline px; none touch the item.

Non-dark lost px (52) are mid-tone greenish blends: B hair green (61,95,5), (91,146,42); cyan hair (102,161,87); azure plate
(62,80,98); amulet blue (6,57,89) is the turquoise gem (collision control). Visually ambiguous (antialias between item and
mannequin; one sits on the elf ear), so they are not counted as confirmed outline.

## 2. Variants (applied to the mask after absorbOutline, 2 passes like absorbOutline)

- v1: key px with rampDistance > 40 touching an item px (8-neighbor).
- v2: v1 and keyLum < luminance of the ramp's darkest shade (0.138 in the green frame).
- v3: v2 with 4-neighbor touch.
- "Outside the base only": skipped. absorbOutline (a) already keeps dark key px off the body, and 378/380 are inside.

## 3. Measurements

Arm Y (356 cells):

| variant | recovered | added | dark added | G2 flips | G3 flips | walk QA (itemQa + dirGate) |
|---|---|---|---|---|---|---|
| v1 | 372 / 380 (97.9 %) | 373 | 322 | 0 | 0 | unchanged |
| v2 | 322 / 380 (84.7 %) | 323 | 322 | 0 | 0 | unchanged |
| v3 | 320 / 380 (84.2 %) | 321 | 320 | 0 | 0 | unchanged |

v2 per case (lost/recovered): A hair green dress 30/28, A hair green walk 248/248, A plate green 27/27, A plate blue 11/11,
B plate green 5/1, A jerkin green 8/7. It drops only the mid-tone px: A hair cyan 9/0, B hair green 10/0, B hair cyan 9/0,
B plate azure 5/0, amulet blue 15/0.

Braids and plate, dark (visually confirmed outline) px: v2 recovers 315 / 321 (98.1 %). The 6 not recovered are 2 hair px with no
item neighbor (east view, cheek/ear line), 3 B plate px in a detached chain outside the body with 0 item neighbors, and 1 plate px.

Bench corpus (17 cases + references, 693 cells incl. 15 S4 q3e keyframes; `corpus.log`):
- v1 = v2: 547 px added, all on b-tunic (magenta key; 0 on every green, blue and azure bench case and on S4 q3e).
- `report()` (docs/testing/bench.md) changes on one line only: b-tunic maxAreaCV 0.122 -> 0.110. No verdict, keep, keep-exact,
  drop (labeled non-item px), fails or warnings change. G2 flips 0, G3 flips 0.

Wrongly kept: upper bound (every added px counted as wrong) = (323 + 547) / (356 + 693) = 0.83 px per cell. On the sheets, the
added px are the item's dark contour (braid edges, plate and jerkin side outlines, tunic sleeve and hem gaps). Ambiguous: 1 hair px
on the north shoulder over the body's black outline (invisible after compositing), and about 2 to 3 tunic collar px at the neck.
Estimate: < 0.05 per cell.

Halos: none seen on the inspected sheets. The added px fill gaps in an outline that is already there. No ring appears around items.

## 4. Pre-registered rule: v2 PASSES

- >= 80 % of confirmed lost outline on braids and plate: 98.1 %.
- <= 1 wrongly kept px per cell: <= 0.83 upper bound, about 0.05 estimated.
- No visible halo: none on the inspected sheets.
- No G2/G3 pass/fail change: none (Y dress, Y walk QA, bench report).
- v1 also passes the numbers but keeps mid-tone green blends (e.g. an elf ear px), so it is rejected.

Not inspected: every sheet one by one (I checked hair green dress and walk, plate green, jerkin green, B hair green, and the
b-tunic rows). Not covered: c25 arm folders beyond what the bench fixtures froze; 128 px bodies apart from n-cloak128 (no change);
the LPC multi-tone bodies of lpc-fairness.md (the card "Check absorbOutline for skin-tone bias" should rerun with the rule).
Not run: vitest. The hook cannot redirect vite-node imports.

## Sheets

`sheets/v1|v2/<body>_<item>_<key>_<kind>.png` (6x, columns: raw, baseline over body, variant over body, variant layer alone,
marked raw) and `sheets/v1|v2/crop_*.png` (12x crops, columns: raw, baseline layer, variant layer, marked raw; magenta = still
lost, yellow = added). Bench: `sheets/corpus_v1|v2/crop_b-tunic.png`.
Key ones: `sheets/v2/crop_A_hair_green_dress_s7.png`, `sheets/v2/crop_A_hair_green_walk.png`,
`sheets/v2/crop_A_plate_green_dress_s7.png`, `sheets/v2/crop_A_plate_blue_dress_s7.png`, `sheets/v2/crop_A_jerkin_green_dress_s7.png`,
`sheets/v1/crop_B_hair_green_dress_s7.png` (v1 mid-tone keeps).

## 5. Proposed production change (not implemented)

`app/src/lib/image/chroma.ts`, `absorbOutline` (L424; the rule at L454):

```
const darkest = keyLum(key, ...RAMP[key](0));   // per key: green (0,60,0); the prototype used green's 0.138 for all keys
const farDark = (p) => isKey(C,p,key,kT) && rampDistance(key, r,g,b) > 40 && keyLum(key, r,g,b) < darkest;
// in the pass loop, beside (a) and (b):
if ((!B.data[p*4+3] && n > 0) || n >= 5 || (n > 0 && farDark(p))) o[p] = 1;
```

The rule keeps a key-scored px drawn darker than any mannequin shade and far from the ramp when it touches the item. Snapping
needs no new code: despill already maps (4,19,0) to the item's darkest core color. One wording fix belongs in the change: use
the magenta darkest shade (70,0,70) for magenta instead of green's 0.138. Its effect on b-tunic must be re-checked, and bench.md
must be regenerated (`npm run bench -- --write`; b-tunic maxAreaCV 0.122 -> 0.110).

Unit tests to add (test/unit, for example `outline-contour.test.ts`):
1. A green body with a 1 px contour of (4,19,0) along a blonde item edge, with 2 to 4 item neighbors: kept, and despilled to the
   item's dark color.
2. The same (4,19,0) px 3+ px away from any item px: dropped (a darkened mannequin stays key).
3. A mid-tone blend (91,146,42) touching the item: still dropped.
4. A ramp-dark px (0,60,0) touching the item: still dropped (rampDistance 0).
5. Blue and azure parity: the blue (0,1,14) contour is kept, and azure matches green after rotation (as in azure-key.test.ts).

Existing tests that touch this: chroma.ts `selfTest` (the absorbOutline cases still hold), rim-guard-skin-tones.test.ts (calls
dropKeyOutline directly, so it is unaffected), azure-key and blue-key tests (chromaLayer frame parity, which the per-key
rampDistance and keyLum keep), and bench.test.ts (bench.md changes on one line, so regenerate it, not weaken it).
