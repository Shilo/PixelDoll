# Chroma key census: green vs cyan, 195, azure, blue, magenta

2026-11-09. Offline only: no PixelLab calls, nothing under `app/` edited. Scripts in this folder import production
`app/src/lib/image/chroma.ts` by absolute file URL and run with `node <script>.mts` from this folder:
`census.mts` (task 1, writes census.json and samples.json), `aggregate.mts`, `outlines.mts`, `ownnear.mts`, `materials.mts`
(tasks 2 and 3), `blend.mts` (edge contamination), `words.mts` (the 2026-11-07 audit's 169 color words), `inspect.mts <item> [key]`.

## Key definitions

| Key | Hue | Score used |
| --- | ---: | --- |
| green120 | 120 | production `keyScore('green')` (current default) |
| cyan180 | 180 | production green score after rotating the px -60 deg (the hue.mts method; ramp = green ramp rotated +60) |
| h195 | 195 | same, rotated -75 |
| azure210 | 210 | production `keyScore('azure')` (= green after -90) |
| blue240 | 240 | production `keyScore('blue')` (G/B swap; equivalent to a 120 deg rotation) |
| magenta300 | 300 | production `keyScore('magenta')` (its own min(R,B) - G formula) |

Lost = score >= KT 35 (removed silently). Near = NEAR_KEY 20..34 with max channel >= 64 (production `nearKeyShare` rule).

## Data (task 1)

86 dressed keyframe sets (edit-animation-v2 dress calls, one cell per drawn view; 3 views on 64/128/chibi bodies, 5 on
body B) from `spikes/api/out/` (local, git-ignored), each paired with the exact rest base it was dressed on:

| Source | Items | Body / base | Prompts |
| --- | ---: | --- | --- |
| `s4_q3e/dress_ea2_<item>_<dir>.png` | 6 | A (`s3_k6/rot_base_<dir>.png`) | grey steel helmet, red cape, brown leather chest, brown leather boots, dark brown hair, steel longsword |
| `c25/D/<item>/{ctrl,view}_s{7,11}.<i>.png` | 24 | A | steel great helm, red hooded cloak, emerald tunic (*), black leather boots, gold crown with white fur, white wizard robe |
| `c25/K/<item>/{magenta,blue,none}_s{7,11}` | 12 | A | green+pink jester (*), red+green holly tunic (*); "none" = dressed on the real base (diff route) |
| `c25b/Z/<item>/{azure_dress_s7,s11,magenta_dress_s7}` | 8 | A | green+purple jester, stripes, green+violet hood (*) |
| `c25c/S/<item>/dress_s{7,11}` | 4 | A | steel helmet with green+purple plume, green+purple tabard over steel (*) |
| `c25d/G/<item>/{old,new}_dress` | 8 | A (bow padded to 96) | helmet, cape, chest (as s4), wooden longbow |
| `c25e/T/<item>/dress` | 2 | A | gold hoop earrings, wire-rimmed glasses |
| `c25/C/<item>/{ctrl,blue}_dress` | 5 | B (`c25/bodyB.json` rest views) | great helm, red cloak, emerald tunic (*), green+pink jester (*) |
| `c25b/N/<item>/dress` | 5 | body128, chibi | great helm x2, red cloak, steel+brass longsword, green+purple jester (*) |
| `c25e/U/<body>_<item>/dress` | 12 | c26man, c26woman, c27man, c27woman | emerald tunic (*), brown leather vest, red cloak |

(*) = "color-test" item: the prompt deliberately names green with pink, red, purple or violet (36 items); the other 50 are
"ordinary" (about 16 distinct prompts, all generated on green).

**Item px.** Opaque (alpha >= 128) output px that are off the base silhouette or differ from the mannequin input
(`toChroma(base, genKey)`, or the real base for "none") by more than 32 (Chebyshev RGB). The generation key was inferred
per set as the mannequin the most base px still match (fit = share within 24); one override: `S tabard s7` (covers most of the
body; fit 0.26 "none" vs 0.18 azure) is azure, as arm S generated it. Px scoring >= KT under the **generation** key are set
apart as *ambiguous* (a redrawn mannequin shade, a key-tinted outline or a key-colored item px cannot be told apart), so each
key's column excludes the items generated on that key. Totals: **82,915 unambiguous item px**, plus 9,590 ambiguous
(3,252 of them more than 24 off the generation ramp). Bench fixtures (`app/test/fixtures/bench`) were not added: they are
posed frames of the same campaign items (a-*, b-* = s4/C/K/Z keyframes).


### Loss and near-key per key, all item px

Lost = item px scoring >= KT 35 (silently removed). Near = 20..34 with max >= 64 (production flag). Switch = items losing >= 1 % of px. Items generated on a key are excluded from that key's column (their key-colored px are indistinguishable from the mannequin); n = items/px counted.

**Ordinary items (no key-colliding color word), all generated on green** (50 items)

| Key | items | px | lost % | near % | items needing switch (>= 1 % lost) | items with >= 5 % near |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| green120 | 0 | 0 | - | - | 0 (- %) | 0 |
| cyan180 | 50 | 51136 | 0.21 | 0.05 | 1 (2.00 %) | 0 |
| h195 | 50 | 51136 | 0.00 | 0.05 | 0 (0.00 %) | 0 |
| azure210 | 50 | 51136 | 0.00 | 0.09 | 0 (0.00 %) | 0 |
| blue240 | 50 | 51136 | 0.10 | 0.00 | 1 (2.00 %) | 0 |
| magenta300 | 50 | 51136 | 0.00 | 2.50 | 0 (0.00 %) | 4 |

**Color-test items (prompt names green with pink/red/purple; generated on magenta, blue, azure or the real base)** (36 items)

| Key | items | px | lost % | near % | items needing switch (>= 1 % lost) | items with >= 5 % near |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| green120 | 36 | 31779 | 37.75 | 8.44 | 35 (97.22 %) | 11 |
| cyan180 | 36 | 31779 | 25.28 | 6.15 | 23 (63.89 %) | 13 |
| h195 | 36 | 31779 | 5.71 | 17.81 | 13 (36.11 %) | 17 |
| azure210 | 25 | 23890 | 1.79 | 0.39 | 3 (12.00 %) | 1 |
| blue240 | 31 | 26680 | 1.71 | 5.49 | 8 (25.81 %) | 9 |
| magenta300 | 20 | 16099 | 11.28 | 15.55 | 11 (55.00 %) | 14 |

**Real-base ("none") outputs only: no mannequin key could bias colors (K jester, K holly)** (4 items)

| Key | items | px | lost % | near % | items needing switch (>= 1 % lost) | items with >= 5 % near |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| green120 | 4 | 3111 | 24.98 | 1.35 | 4 (100.00 %) | 1 |
| cyan180 | 4 | 3111 | 0.00 | 0.77 | 0 (0.00 %) | 0 |
| h195 | 4 | 3111 | 0.19 | 0.00 | 0 (0.00 %) | 0 |
| azure210 | 4 | 3111 | 0.00 | 0.13 | 0 (0.00 %) | 0 |
| blue240 | 4 | 3111 | 0.00 | 0.06 | 0 (0.00 %) | 0 |
| magenta300 | 4 | 3111 | 2.44 | 12.86 | 1 (25.00 %) | 2 |

**All items** (86 items)

| Key | items | px | lost % | near % | items needing switch (>= 1 % lost) | items with >= 5 % near |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| green120 | 36 | 31779 | 37.75 | 8.44 | 35 (97.22 %) | 11 |
| cyan180 | 86 | 82915 | 9.82 | 2.39 | 24 (27.91 %) | 13 |
| h195 | 86 | 82915 | 2.19 | 6.85 | 13 (15.12 %) | 17 |
| azure210 | 75 | 75026 | 0.57 | 0.19 | 3 (4.00 %) | 1 |
| blue240 | 81 | 77816 | 0.65 | 1.88 | 9 (11.11 %) | 9 |
| magenta300 | 70 | 67235 | 2.70 | 5.63 | 11 (15.71 %) | 18 |


### Loss and near-key per key, bright px only (max channel >= 64; drops dark outlines)

Lost = item px scoring >= KT 35 (silently removed). Near = 20..34 with max >= 64 (production flag). Switch = items losing >= 1 % of px. Items generated on a key are excluded from that key's column (their key-colored px are indistinguishable from the mannequin); n = items/px counted.

**Ordinary items (no key-colliding color word), all generated on green** (50 items)

| Key | items | px | lost % | near % | items needing switch (>= 1 % lost) | items with >= 5 % near |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| green120 | 0 | 0 | - | - | 0 (- %) | 0 |
| cyan180 | 50 | 35528 | 0.00 | 0.07 | 0 (0.00 %) | 0 |
| h195 | 50 | 35528 | 0.00 | 0.07 | 0 (0.00 %) | 0 |
| azure210 | 50 | 35528 | 0.00 | 0.13 | 0 (0.00 %) | 0 |
| blue240 | 50 | 35528 | 0.00 | 0.00 | 0 (0.00 %) | 0 |
| magenta300 | 50 | 35528 | 0.00 | 3.60 | 0 (0.00 %) | 4 |

**Color-test items (prompt names green with pink/red/purple; generated on magenta, blue, azure or the real base)** (36 items)

| Key | items | px | lost % | near % | items needing switch (>= 1 % lost) | items with >= 5 % near |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| green120 | 36 | 26024 | 42.88 | 10.30 | 35 (97.22 %) | 12 |
| cyan180 | 36 | 26024 | 25.84 | 7.51 | 18 (50.00 %) | 14 |
| h195 | 36 | 26024 | 4.39 | 21.75 | 8 (22.22 %) | 17 |
| azure210 | 25 | 19254 | 0.06 | 0.49 | 1 (4.00 %) | 1 |
| blue240 | 31 | 21889 | 1.38 | 6.69 | 7 (22.58 %) | 10 |
| magenta300 | 20 | 13299 | 12.65 | 18.82 | 9 (45.00 %) | 14 |

**Real-base ("none") outputs only: no mannequin key could bias colors (K jester, K holly)** (4 items)

| Key | items | px | lost % | near % | items needing switch (>= 1 % lost) | items with >= 5 % near |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| green120 | 4 | 2394 | 32.46 | 1.75 | 4 (100.00 %) | 1 |
| cyan180 | 4 | 2394 | 0.00 | 1.00 | 0 (0.00 %) | 0 |
| h195 | 4 | 2394 | 0.00 | 0.00 | 0 (0.00 %) | 0 |
| azure210 | 4 | 2394 | 0.00 | 0.17 | 0 (0.00 %) | 0 |
| blue240 | 4 | 2394 | 0.00 | 0.08 | 0 (0.00 %) | 0 |
| magenta300 | 4 | 2394 | 3.17 | 16.71 | 1 (25.00 %) | 2 |

**All items** (86 items)

| Key | items | px | lost % | near % | items needing switch (>= 1 % lost) | items with >= 5 % near |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| green120 | 36 | 26024 | 42.88 | 10.30 | 35 (97.22 %) | 12 |
| cyan180 | 86 | 61552 | 10.93 | 3.21 | 18 (20.93 %) | 14 |
| h195 | 86 | 61552 | 1.86 | 9.23 | 8 (9.30 %) | 17 |
| azure210 | 75 | 54782 | 0.02 | 0.25 | 1 (1.33 %) | 1 |
| blue240 | 81 | 57417 | 0.52 | 2.55 | 7 (8.64 %) | 10 |
| magenta300 | 70 | 48827 | 3.44 | 7.75 | 9 (12.86 %) | 18 |


### Green on its own items (upper bound)

On the 50 ordinary green-generated items, 794 of 51930 candidate px (1.53 %) score as green and sit more than 24 off the green ramp (could be lost item px, or a redrawn mannequin / key-tinted outline); 494 of them are bright (max >= 64). 12 items exceed 1 %. All-ambiguous px (incl. on-ramp): 3880.


### Per item (lost px / near px per key; "gen" = generation key, its column is n/a)

| Item | body | gen | fit | item px | amb (off-ramp) | green120 | cyan180 | h195 | azure210 | blue240 | magenta300 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| s4 helmet | A | green | 0.823 | 360 | 18 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| s4 cape | A | green | 0.622 | 962 | 109 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| s4 chest | A | green | 0.706 | 414 | 21 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| s4 boots | A | green | 0.811 | 317 | 5 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| s4 hair | A | green | 0.854 | 334 | 26 (5) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| s4 sword | A | green | 0.98 | 303 | 27 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/1 |
| D greathelm ctrl s7 | A | green | 0.74 | 452 | 61 (47) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D greathelm ctrl s11 | A | green | 0.795 | 460 | 11 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D greathelm view s7 | A | green | 0.743 | 419 | 9 (2) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D greathelm view s11 | A | green | 0.795 | 464 | 10 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D cloak ctrl s7 | A | green | 0.428 | 1357 | 109 (2) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D cloak ctrl s11 | A | green | 0.456 | 1375 | 61 (1) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D cloak view s7 | A | green | 0.454 | 1505 | 131 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/114 |
| D cloak view s11 | A | green | 0.423 | 1620 | 45 (3) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/191 |
| D tunic ctrl s7 * | A | magenta | 0.47 | 825 | 24 (5) | 426/92 | 541/0 | 92/410 | 0/0 | 0/0 | n/a |
| D tunic ctrl s11 * | A | magenta | 0.486 | 797 | 14 (0) | 504/1 | 550/0 | 0/464 | 0/0 | 0/0 | n/a |
| D tunic view s7 * | A | magenta | 0.475 | 811 | 20 (0) | 541/0 | 541/0 | 0/455 | 0/0 | 0/0 | n/a |
| D tunic view s11 * | A | magenta | 0.509 | 809 | 40 (0) | 482/90 | 572/0 | 0/461 | 0/0 | 0/0 | n/a |
| D blackboots ctrl s7 | A | green | 0.796 | 333 | 11 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D blackboots ctrl s11 | A | green | 0.785 | 361 | 6 (2) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D blackboots view s7 | A | green | 0.788 | 351 | 13 (3) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D blackboots view s11 | A | green | 0.794 | 368 | 5 (1) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D crown ctrl s7 | A | green | 0.954 | 242 | 6 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D crown ctrl s11 | A | green | 0.937 | 196 | 10 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D crown view s7 | A | green | 0.933 | 242 | 11 (1) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D crown view s11 | A | green | 0.917 | 336 | 16 (2) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D robe ctrl s7 | A | green | 0.273 | 1402 | 42 (17) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D robe ctrl s11 | A | green | 0.253 | 1499 | 28 (17) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| D robe view s7 | A | green | 0.222 | 1624 | 44 (21) | n/a | 107/24 | 0/24 | 0/45 | 0/0 | 0/0 |
| D robe view s11 | A | green | 0.261 | 1382 | 104 (93) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| K jester magenta s7 * | A | magenta | 0.843 | 725 | 178 (125) | 264/20 | 0/0 | 0/0 | 0/0 | 0/0 | n/a |
| K jester magenta s11 * | A | magenta | 0.88 | 739 | 186 (159) | 359/0 | 0/359 | 0/0 | 0/0 | 0/0 | n/a |
| K jester blue s7 * | A | blue | 0.851 | 505 | 281 (244) | 211/0 | 0/0 | 0/0 | 0/0 | n/a | 89/179 |
| K jester blue s11 * | A | blue | 0.885 | 548 | 271 (216) | 275/10 | 7/97 | 4/3 | 4/0 | n/a | 58/138 |
| K jester none s7 * | A | none | 0.875 | 807 | 0 (0) | 224/0 | 0/24 | 6/0 | 0/1 | 0/1 | 76/173 |
| K jester none s11 * | A | none | 0.873 | 986 | 0 (0) | 308/0 | 0/0 | 0/0 | 0/3 | 0/1 | 0/227 |
| K holly magenta s7 * | A | magenta | 0.488 | 761 | 65 (44) | 86/15 | 0/0 | 0/0 | 0/0 | 0/0 | n/a |
| K holly magenta s11 * | A | magenta | 0.403 | 815 | 22 (0) | 99/40 | 0/0 | 0/0 | 0/0 | 0/0 | n/a |
| K holly blue s7 * | A | blue | 0.398 | 990 | 45 (0) | 250/0 | 62/0 | 0/0 | 0/0 | n/a | 0/0 |
| K holly blue s11 * | A | blue | 0.418 | 865 | 32 (0) | 169/5 | 79/0 | 79/0 | 71/0 | n/a | 27/0 |
| K holly none s7 * | A | none | 0.572 | 629 | 0 (0) | 134/1 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| K holly none s11 * | A | none | 0.567 | 689 | 0 (0) | 111/41 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| Z jester azure s7 * | A | azure | 0.898 | 409 | 239 (0) | 154/18 | 0/76 | 0/31 | n/a | 0/58 | 29/75 |
| Z jester azure s11 * | A | azure | 0.898 | 842 | 199 (0) | 324/0 | 125/139 | 125/0 | n/a | 0/296 | 0/296 |
| Z jester magenta s7 * | A | magenta | 0.842 | 501 | 503 (389) | 384/16 | 0/0 | 0/0 | 0/0 | 0/0 | n/a |
| Z stripes azure s7 * | A | azure | 0.663 | 446 | 96 (0) | 0/147 | 23/127 | 0/24 | n/a | 23/96 | 0/92 |
| Z stripes azure s11 * | A | azure | 0.634 | 474 | 85 (1) | 11/230 | 152/137 | 43/108 | n/a | 80/105 | 0/178 |
| Z stripes magenta s7 * | A | magenta | 0.474 | 794 | 17 (0) | 82/220 | 65/155 | 0/76 | 134/0 | 107/117 | n/a |
| Z hood azure s7 * | A | azure | 0.698 | 540 | 217 (9) | 147/164 | 172/34 | 40/138 | n/a | 61/26 | 19/104 |
| Z hood azure s11 * | A | azure | 0.708 | 521 | 55 (0) | 282/0 | 90/68 | 86/4 | n/a | 38/12 | 12/78 |
| S plume s7 * | A | azure | 0.84 | 397 | 187 (109) | 63/0 | 67/0 | 4/44 | n/a | 93/29 | 0/76 |
| S plume s11 * | A | azure | 0.843 | 357 | 234 (19) | 71/15 | 34/52 | 0/69 | n/a | 27/37 | 0/42 |
| S tabard s7 * | A | azure | 0.265 | 1264 | 144 (79) | 140/14 | 0/46 | 0/11 | n/a | 0/0 | 136/7 |
| S tabard s11 * | A | azure | 0.59 | 545 | 213 (0) | 136/59 | 195/0 | 59/136 | n/a | 0/82 | 128/53 |
| G helmet old | A | green | 0.833 | 356 | 15 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| G helmet new | A | green | 0.838 | 381 | 29 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| G cape old | A | green | 0.599 | 1221 | 26 (1) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| G cape new | A | green | 0.645 | 490 | 487 (393) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| G chest old | A | green | 0.692 | 454 | 16 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| G chest new | A | green | 0.686 | 438 | 16 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| G bow old | A | green | 0.94 | 366 | 36 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| G bow new | A | green | 0.883 | 524 | 95 (3) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| T earrings | A | green | 0.975 | 10 | 14 (1) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| T glasses | A | green | 0.949 | 10 | 48 (6) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| C greathelm ctrl | B | green | 0.657 | 1564 | 67 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| C cloak ctrl | B | green | 0.385 | 3611 | 266 (70) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| C tunic ctrl * | B | magenta | 0.498 | 1882 | 243 (115) | 1345/0 | 1240/52 | 0/1240 | 0/0 | 0/0 | n/a |
| C jester ctrl * | B | magenta | 0.782 | 1806 | 1010 (384) | 1427/19 | 0/0 | 0/0 | 0/0 | 0/0 | n/a |
| C jester blue * | B | blue | 0.831 | 2191 | 230 (18) | 714/49 | 218/172 | 218/0 | 218/0 | n/a | 209/785 |
| N helm128 | body128 | green | 0.807 | 2031 | 201 (31) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| N cloak128 | body128 | green | 0.468 | 8558 | 437 (4) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/831 |
| N sword128 | body128 | green | 0.888 | 1332 | 501 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| N helmChibi | chibi | green | 0.609 | 1532 | 59 (0) | n/a | 0/0 | 0/0 | 0/0 | 49/0 | 0/0 |
| N jesterChibi * | chibi | azure | 0.799 | 2094 | 673 (512) | 712/8 | 224/320 | 224/0 | n/a | 28/604 | 1033/0 |
| U c26man tunic * | c26man | magenta | 0.514 | 1230 | 55 (4) | 763/9 | 746/80 | 74/588 | 1/0 | 0/1 | n/a |
| U c26man vest | c26man | green | 0.702 | 676 | 94 (49) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| U c26man cloak | c26man | green | 0.65 | 1508 | 202 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| U c26woman tunic * | c26woman | magenta | 0.49 | 1123 | 20 (0) | 19/716 | 886/0 | 317/490 | 0/90 | 0/0 | n/a |
| U c26woman vest | c26woman | green | 0.706 | 602 | 36 (2) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| U c26woman cloak | c26woman | green | 0.567 | 1829 | 80 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/33 |
| U c27man tunic * | c27man | magenta | 0.562 | 1055 | 61 (22) | 305/422 | 728/0 | 443/285 | 0/0 | 0/0 | n/a |
| U c27man vest | c27man | green | 0.708 | 678 | 51 (1) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| U c27man cloak | c27man | green | 0.638 | 1727 | 49 (0) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| U c27woman tunic * | c27woman | magenta | 0.547 | 1007 | 51 (4) | 474/260 | 718/16 | 0/622 | 0/0 | 0/0 | n/a |
| U c27woman vest | c27woman | green | 0.74 | 506 | 43 (2) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| U c27woman cloak | c27woman | green | 0.617 | 2054 | 73 (14) | n/a | 0/0 | 0/0 | 0/0 | 0/0 | 0/109 |

### Hue histogram, Ordinary items (no key-colliding color word), all generated on green (unambiguous item px with chroma >= 24: 33854 of 51136)

| Hue bin | px | % of saturated |
| --- | ---: | ---: |
| 0-14 | 9219 | 27.23 |
| 15-29 | 4400 | 13.00 |
| 30-44 | 2041 | 6.03 |
| 45-59 | 921 | 2.72 |
| 60-74 | 183 | 0.54 |
| 75-89 | 2684 | 7.93 |
| 90-104 | 17 | 0.05 |
| 105-119 | 16 | 0.05 |
| 120-134 | 61 | 0.18 |
| 135-149 | 3 | 0.01 |
| 150-164 | 0 | 0.00 |
| 165-179 | 13 | 0.04 |
| 180-194 | 0 | 0.00 |
| 195-209 | 547 | 1.62 |
| 210-224 | 45 | 0.13 |
| 225-239 | 0 | 0.00 |
| 240-254 | 0 | 0.00 |
| 255-269 | 0 | 0.00 |
| 270-284 | 1 | 0.00 |
| 285-299 | 0 | 0.00 |
| 300-314 | 0 | 0.00 |
| 315-329 | 0 | 0.00 |
| 330-344 | 1109 | 3.28 |
| 345-359 | 12594 | 37.20 |

### Hue histogram, Color-test items (prompt names green with pink/red/purple; generated on magenta, blue, azure or the real base) (unambiguous item px with chroma >= 24: 27503 of 31779)

| Hue bin | px | % of saturated |
| --- | ---: | ---: |
| 0-14 | 1691 | 6.15 |
| 15-29 | 802 | 2.92 |
| 30-44 | 819 | 2.98 |
| 45-59 | 754 | 2.74 |
| 60-74 | 107 | 0.39 |
| 75-89 | 44 | 0.16 |
| 90-104 | 310 | 1.13 |
| 105-119 | 730 | 2.65 |
| 120-134 | 4715 | 17.14 |
| 135-149 | 2411 | 8.77 |
| 150-164 | 6887 | 25.04 |
| 165-179 | 509 | 1.85 |
| 180-194 | 40 | 0.15 |
| 195-209 | 333 | 1.21 |
| 210-224 | 49 | 0.18 |
| 225-239 | 41 | 0.15 |
| 240-254 | 155 | 0.56 |
| 255-269 | 430 | 1.56 |
| 270-284 | 2168 | 7.88 |
| 285-299 | 190 | 0.69 |
| 300-314 | 38 | 0.14 |
| 315-329 | 1020 | 3.71 |
| 330-344 | 1547 | 5.62 |
| 345-359 | 1713 | 6.23 |

### What each key loses on ordinary items (top colors)

- green120: none
- cyan180: lost #1b2b2b h180 s37 x107; near #415a59 h178 s27 x13; near #36474a h189 s23 x11
- h195: near #415a59 h178 s20 x13; near #36474a h189 s24 x11
- azure210: near #5d6a7a h213 s22 x45
- blue240: lost #151124 h253 s42 x49
- magenta300: near #520419 h344 s26 x710; near #420a1e h339 s30 x114; near #60091e h346 s22 x109; near #4a0a1c h343 s24 x105; near #430c1a h345 s21 x86; near #69021d h344 s26 x61

### Dark px follow the mannequin hue (key-following evidence)

Dark px (max channel < 64) among each item's candidate px (unambiguous + off-ramp ambiguous), by generation key. The
real-base "none" outputs draw 94 % neutral darks; on a key mannequin the model tints outlines and deep shadows toward the
key: olive/yellow on green, blue on blue and azure (the K blue items name no blue at all).

| Generation key | items | dark px | neutral (chroma < 8) | 0-44 red/orange | 45-89 yellow/olive | 90-149 green | 150-194 teal/cyan | 195-254 azure/blue | 255-359 violet/magenta/red |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| green (ordinary) | 50 | 15908 | 22 % | 34 % | 25 % | 4 % | 1 % | 4 % | 11 % |
| magenta (color-test items) | 16 | 3494 | 7 % | 2 % | 1 % | 31 % | 23 % | 8 % | 29 % |
| blue (color-test items) | 5 | 1442 | 2 % | 14 % | 0 % | 7 % | 10 % | 47 % | 21 % |
| azure (color-test items) | 11 | 1813 | 33 % | 5 % | 0 % | 1 % | 14 % | 46 % | 1 % |
| none (color-test items) | 4 | 717 | 94 % | 3 % | 2 % | 0 % | 0 % | 1 % | 1 % |

| Generation key | candidate px | off-ramp px scoring as the gen key | of which dark (max < 64) | all ambiguous incl. on-ramp |
| --- | ---: | ---: | ---: | ---: |
| green (50 items) | 55016 | 794 (1.44 %) | 300 | 3880 (7.05 %) |
| magenta (16 items) | 18189 | 1251 (6.88 %) | 539 | 2509 (13.79 %) |
| blue (5 items) | 5958 | 478 (8.02 %) | 478 | 859 (14.42 %) |
| azure (11 items) | 10231 | 729 (7.13 %) | 694 | 2342 (22.89 %) |

### Green's near-key flag on its own ordinary items

green near-key on its own ordinary items: 50/51136 = 0.10 %, items >= 5 %: 1; top #49704a h122 x21; #485b25 h81 x9; #618365 h127 x7; #495b29 h82 x5; #445b45 h123 x4; #416321 h91 x2; #668c41 h90 x1; #405240 h120 x1

## Synthetic materials and ramps (tasks 2 and 3)

### Synthetic materials: shades lost (>= 35) / near (20..34, max >= 64) per key; max score in brackets

| Material | shades | green120 | cyan180 | h195 | azure210 | blue240 | magenta300 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| skin light | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| skin medium | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| skin dark | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| hair blonde | 5 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| hair ginger | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| hair brown | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| hair black (blue-tinted) | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | **1**/2 [38] | 0/0 [0] |
| leather brown | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| wood | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| gold / brass | 5 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| bronze / copper | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| iron / steel (neutral) | 5 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| steel (blue-tinted) | 5 | 0/0 [0] | 0/0 [13] | **0**/2 [21] | **0**/3 [29] | **0**/2 [24] | 0/0 [0] |
| steel (cool, subtle) | 5 | 0/0 [0] | 0/0 [0] | 0/0 [13] | 0/0 [17] | 0/0 [12] | 0/0 [0] |
| silver highlights | 3 | 0/0 [0] | 0/0 [5] | 0/0 [8] | 0/0 [10] | 0/0 [5] | 0/0 [0] |
| red cloth | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| crimson (real cloak) | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | **0**/1 [26] |
| orange | 3 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| pink | 3 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | **0**/1 [25] |
| purple | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | **0**/3 [28] | **3**/1 [40] |
| navy | 4 | 0/0 [0] | 0/0 [12] | **0**/3 [26] | **4**/0 [42] | **4**/0 [55] | 0/0 [0] |
| denim | 4 | 0/0 [0] | **0**/2 [23] | **2**/2 [39] | **3**/1 [53] | **2**/2 [38] | 0/0 [0] |
| royal blue cloth | 4 | 0/0 [0] | **0**/2 [21] | **4**/0 [42] | **4**/0 [62] | **4**/0 [67] | 0/0 [0] |
| turquoise gem | 4 | 0/0 [14] | **4**/0 [80] | **3**/1 [58] | **1**/2 [35] | 0/0 [0] | 0/0 [0] |
| ice / frost | 4 | 0/0 [0] | **1**/1 [36] | **2**/1 [52] | **2**/1 [60] | **0**/1 [28] | 0/0 [0] |
| water / sky | 4 | 0/0 [0] | **2**/2 [40] | **3**/1 [61] | **3**/1 [83] | **2**/1 [45] | 0/0 [0] |
| emerald | 4 | **4**/0 [44] | **3**/1 [50] | **0**/3 [28] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| forest green | 4 | **3**/1 [52] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| olive / khaki | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| lime / poison | 4 | **2**/1 [39] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| bone / ivory | 4 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| white cloth (cool shade, real robe) | 5 | 0/0 [0] | 0/0 [11] | 0/0 [16] | **0**/1 [22] | 0/0 [13] | 0/0 [0] |
| outline black | 3 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| outline dark brown | 3 | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |
| outline dark navy | 4 | 0/0 [0] | 0/0 [0] | 0/0 [26] | **2**/0 [47] | **4**/0 [47] | 0/0 [0] |
| outline dark teal-gray (real robe) | 3 | 0/0 [0] | **1**/0 [37] | 0/0 [28] | 0/0 [32] | 0/0 [0] | 0/0 [0] |
| outline dark olive (real, green gen) | 3 | 0/0 [27] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] | 0/0 [0] |

Summary (lost = at least one shade keyed out; flagged = near-key only):

- **green120** loses: emerald (4/4), forest green (3/4), lime / poison (2/4). Flags: nothing.
- **cyan180** loses: turquoise gem (4/4), ice / frost (1/4), water / sky (2/4), emerald (3/4), outline dark teal-gray (real robe) (1/3). Flags: denim (2/4), royal blue cloth (2/4).
- **h195** loses: denim (2/4), royal blue cloth (4/4), turquoise gem (3/4), ice / frost (2/4), water / sky (3/4). Flags: steel (blue-tinted) (2/5), navy (3/4), emerald (3/4).
- **azure210** loses: navy (4/4), denim (3/4), royal blue cloth (4/4), turquoise gem (1/4), ice / frost (2/4), water / sky (3/4), outline dark navy (2/4). Flags: steel (blue-tinted) (3/5), white cloth (cool shade, real robe) (1/5).
- **blue240** loses: hair black (blue-tinted) (1/4), navy (4/4), denim (2/4), royal blue cloth (4/4), water / sky (2/4), outline dark navy (4/4). Flags: steel (blue-tinted) (2/5), purple (3/4), ice / frost (1/4).
- **magenta300** loses: purple (3/4). Flags: crimson (real cloak) (1/4), pink (1/3).

### Key ramps (t = 0, 0.25, 0.5, 0.75, 1): RGB, true Rec.601 luminance

| Key | t=0 | t=0.25 | t=0.5 | t=0.75 | t=1 | luminance range | hue of every step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| green120 | #003c00 (0.14) | #076d07 (0.26) | #1c9e1c (0.41) | #3ece3e (0.57) | #6eff6e (0.77) | 0.14..0.77 | 120 |
| cyan180 | #003c3c (0.16) | #076d6d (0.31) | #1c9e9e (0.47) | #3ecece (0.64) | #6effff (0.83) | 0.16..0.83 | 180 |
| h195 | #002d3c (0.13) | #07546d (0.25) | #1c7e9e (0.39) | #3eaace (0.56) | #6edbff (0.75) | 0.13..0.75 | 195 |
| azure210 | #001e3c (0.10) | #073a6d (0.19) | #1c5d9e (0.32) | #3e86ce (0.47) | #6eb7ff (0.66) | 0.10..0.66 | 210 |
| blue240 | #00003c (0.03) | #07076d (0.07) | #1c1c9e (0.17) | #3e3ece (0.31) | #6e6eff (0.50) | 0.03..0.50 | 240 |
| magenta300 | #460046 (0.11) | #740774 (0.20) | #a31ca3 (0.33) | #d13ed1 (0.48) | #ff6eff (0.67) | 0.11..0.67 | 300 |

Minimum keyScore along each own ramp (65 steps): green120 57, cyan180 57, h195 57, azure210 57, blue240 57, magenta300 57

### Min Chebyshev RGB distance from each key ramp to reference colors (lower = closer; ramp shades within ~24 are hard to tell apart), and the reference color's own key score

| Reference | green120 | cyan180 | h195 | azure210 | blue240 | magenta300 |
| --- | --- | --- | --- | --- | --- | --- |
| near-black (#000000 #141414 #1c1c1c) | 32 (score 0) | 32 (score 0) | 32 (score 0) | 32 (score 0) | 32 (score 0) | 42 (score 0) |
| dark brown (#2b1d14 #3b2414 #24180c) | 36 (score 0) | 43 (score 0) | 43 (score 0) | 43 (score 0) | 43 (score 0) | 50 (score 0) |
| dark navy (#141a2e #1b1f3b #0e1420) | 40 (score 0) | 29 (score 0) | 20 (score 26) | 20 (score 47) | 26 (score 47) | 43 (score 0) |
| dark olive (#24310c #2e3315) | 35 (score 27) | 46 (score 0) | 46 (score 0) | 46 (score 0) | 49 (score 0) | 51 (score 0) |
| dark green (#1c3a18 #12231c) | 26 (score 52) | 32 (score 0) | 32 (score 0) | 32 (score 0) | 35 (score 0) | 52 (score 0) |
| dark teal (#0f2a2a #1b2b2b) | 41 (score 0) | 18 (score 64) | 18 (score 48) | 18 (score 31) | 41 (score 0) | 43 (score 0) |
| white / highlight (#ffffff #f0f8ff #e8f0f8) | 138 (score 0) | 122 (score 0) | 122 (score 5) | 122 (score 6) | 130 (score 0) | 130 (score 0) |
| light skin highlight (#ffe0c8) | 145 (score 0) | 145 (score 0) | 145 (score 0) | 145 (score 0) | 145 (score 0) | 114 (score 0) |

KT 35, NEAR 20.

### Edge contamination: item shade blended with the key mid ramp

| Key | mix | warm materials (14 x shades): lost / near | cool & other: lost / near | worst warm material |
| --- | --- | --- | --- | --- |
| green120 | 25 % key | 0/57 lost, 3 near | 6/42 lost, 7 near | - |
| green120 | 50 % key | 19/57 lost, 30 near | 24/42 lost, 16 near | olive / khaki 4, hair brown 3, skin dark 2 |
| cyan180 | 25 % key | 0/57 lost, 0 near | 14/42 lost, 16 near | - |
| cyan180 | 50 % key | 5/57 lost, 17 near | 36/42 lost, 5 near | skin dark 1, hair brown 1, leather brown 1 |
| h195 | 25 % key | 0/57 lost, 0 near | 18/42 lost, 14 near | - |
| h195 | 50 % key | 4/57 lost, 13 near | 35/42 lost, 6 near | skin dark 1, hair brown 1, leather brown 1 |
| azure210 | 25 % key | 0/57 lost, 0 near | 20/42 lost, 11 near | - |
| azure210 | 50 % key | 6/57 lost, 13 near | 37/42 lost, 4 near | hair brown 2, skin dark 1, leather brown 1 |
| blue240 | 25 % key | 0/57 lost, 0 near | 14/42 lost, 14 near | - |
| blue240 | 50 % key | 8/57 lost, 18 near | 34/42 lost, 8 near | skin dark 2, hair brown 2, leather brown 1 |
| magenta300 | 25 % key | 0/57 lost, 5 near | 7/42 lost, 5 near | - |
| magenta300 | 50 % key | 17/57 lost, 29 near | 22/42 lost, 14 near | skin dark 3, hair brown 3, red cloth 3 |

### Audit color words (2026-11-07 list, 4 shades each; the list is green-heavy: 60 green/blue-green, 14 blue)

169 words: green/blue-green 60, red/pink/purple 44, blue 14, warm/neutral 51

| Key | words with >= 1 of 4 shades lost | green/blue-green | red/pink/purple | blue | warm/neutral | words |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| green120 | 25 | 25 | 0 | 0 | 0 | chartreuse, avocado, kelly, hunter, fern, lime, jade, emerald, malachite, shamrock, harlequin, basil, spring, lawn, sea, kiwi, pea, leaf, grass, forest, ivy, clover, neon, toxic, frog |
| cyan180 | 20 | 15 | 0 | 5 | 0 | pine, jade, mint, viridian, shamrock, spring, jungle, bottle, myrtle, verdigris, teal, turquoise, cyan, aqua, cerulean, azure, cobalt, sapphire, denim, ocean |
| h195 | 20 | 13 | 0 | 7 | 0 | pine, jade, shamrock, jungle, bottle, myrtle, verdigris, teal, turquoise, cyan, aqua, cerulean, sky, azure, cobalt, sapphire, denim, cornflower, ocean, steelblue |
| azure210 | 15 | 5 | 0 | 10 | 0 | pine, teal, cyan, aqua, cerulean, blue, navy, azure, cobalt, sapphire, denim, cornflower, midnight, ocean, steelblue |
| blue240 | 11 | 0 | 2 | 9 | 0 | violet, indigo, blue, navy, azure, cobalt, sapphire, denim, ultramarine, cornflower, midnight |
| magenta300 | 14 | 0 | 14 | 0 | 0 | ruby, rose, raspberry, magenta, fuchsia, violet, purple, plum, indigo, orchid, aubergine, grape, heliotrope, byzantium |

## Findings

1. **Ordinary items (50 sets, 51,136 px, all generated on green): every candidate key is near zero.** Bright px (max >= 64)
   lost: 0.00 % on cyan, 195, azure, blue and magenta. All-px loss: cyan 0.21 % (all 107 px are one dark teal-gray outline,
   `#1b2b2b`, on a white robe), blue 0.10 % (49 px dark navy outline `#151124` on the chibi great helm), others 0. Magenta
   flags 2.5 % near-key (crimson cloak shadows `#520419`..). Green on its own items cannot be measured directly; the upper
   bound is 1.44 % (794 off-ramp green-scoring px, 390 of them one redrawn-mannequin set, `G cape new` `#71af5c`), and its
   production near-key flag reads 0.10 %. Real steel (6 helms, 3 swords, plume/tabard plate) lost 0 px on every key.
2. **Color-test items (36 sets naming green + pink/red/purple):** lost px green 37.8 %, **cyan 25.3 %**, 195 5.7 %, azure
   1.8 %, blue 1.7 %, magenta 11.3 %. Cyan does not escape green collisions: the real "emerald green tunic" is drawn at hue
   150-163; on the 9 emerald tunic sets cyan loses 541-1240 px per set vs 19-1345 on green, at least as many as green in 7 of 9.
3. **Unbiased real-base outputs (4 sets, K jester/holly "none"):** green loses 25 %, cyan/195/azure/blue about 0 %, magenta 2.4 %.
   These are named-green prompts, so they only confirm the expected collision.
4. **Hue histogram of ordinary items:** 89 % of saturated px sit in 0-59 or 330-359 (reds, browns, golds), 8 % at 75-89 (one dark olive cloak shadow `#24310c`, green-tinted); blues 1.8 %
   (one cool-shaded white robe); greens 0.3 % (expected: green prompts are routed away and green px are ambiguous).
5. **Synthetic materials:** green loses emerald, forest green, lime (and nothing warm: skin, hair, leather, wood, gold, olive and
   khaki all score 0). Cyan loses turquoise, sky/water, ice, emerald (3/4) and dark teal outlines, and flags denim and royal
   blue. 195 and azure lose denim, royal blue, sky, ice; azure also navy and dark navy outlines. Blue loses navy, denim, royal
   blue, sky, a blue-tinted black and every dark navy outline shade. Blue-tinted steel is never lost; 195/azure/blue flag it.
   **The olive/khaki hypothesis is false** for solid colors: the ratio score needs G above both R and B by 12, so olive (hue 60)
   scores 0; loss starts around hue 80 (lime, chartreuse).
6. **Edge blends are where complementary keys win:** a warm shade mixed 50 % with the key mid ramp is lost in 19/57 cases on
   green vs 5/57 on cyan (4 on 195, 6 azure, 8 blue, 17 magenta); at 25 % no key loses a warm edge. Cool materials flip it
   (green 24/42, cyan 36/42). In real green outputs this mechanism is rare (0.10 % near-key).
7. **Key-following darks:** on the real base 94 % of dark item px are neutral; on a key mannequin the model tints outlines and deep
   shadows toward the key (green: 25 % olive/yellow; blue and azure: 46-47 % blue, although the K blue prompts name no blue).
   On blue and azure 100 % / 95 % of the off-ramp key-scoring px are dark; on green only 38 % are, because green's tint lands
   on olive, which green does not score. A cyan default would likely get cyan-tinted outlines that score as key (dark teal
   `#04181f` scores 65 on cyan) and need the rim/outline guard (`OUTLINE.greenHue` in chroma.ts is green-specific) retuned.
8. **Ramps (task 3):** all six keep the same HSV structure (single hue, own-ramp min score 57), but true luminance differs:
   cyan 0.16-0.83 (brightest), green 0.14-0.77, 195 0.13-0.75, azure 0.10-0.66, magenta 0.11-0.67, **blue 0.03-0.50** (the
   dark third is near black: weakest shading cue). The dark end of every ramp is 32 from near-black. Closest outline
   collisions: dark teal 18 from cyan/195/azure (scores 64/48/31), dark navy 20 from 195/azure and 26 from blue (scores
   26/47/47), dark green 26 from green (score 52). Whites and highlights are at least 122 from every ramp (cyan's bright end
   `#6effff` is not near white in RGB).

## Prior evidence (not repeated)

- Arm K (2026-10-25): blue key added for green + pink/red; blue extraction equals green on swapped channels.
- Arm Z (round 2): azure (210) for green + purple, 6/6 dress sets pass with purple kept 100 %; noted azure scores 35-44 on
  blue-gray steel shading but 0 of 6,496 real steel px scored (this census agrees: 0 lost, a few near flags).
- Tool spike 2026-11-06: an external workflow uses a five-shade cyan skin ramp; the spike warned global cyan removal discards
  turquoise gear (confirmed here: turquoise 4/4 shades lost on cyan).
- Color audit 2026-11-07 (`key-collision.ts`): the real risk is unnamed key-colored items (goblin, elven, poison). The same
  class exists for cyan: "ice", "frost", "ocean", "sapphire", "mage", "knight tabard" are often drawn blue or teal without a
  cyan word (cyan loses 20 of the audit's 169 color words, green 25, azure 15, blue 11, magenta 14; the list is green-heavy).

## Verdict

Offline evidence does **not** favor moving the default from green to cyan. On ordinary gear (warm, neutral, steel) every key
loses about 0 % of bright px, so the choice is decided by which hues users ask for and by outline behavior, not by the
census. Cyan's 120-240 window catches teal/emerald on one side and sky/ice/denim on the other, so it keeps green's emerald and
jade collisions (worse on real emerald) and adds the blue family plus cool dark outlines. Its one measured advantage is
cleaner warm edges in 50 % blends, which real green outputs rarely produce. Azure (210) measured cleanest on this sample, but
the sample has almost no blue gear, and azure loses navy, denim and royal blue, which are common fantasy cloth colors; blue
(240) additionally has the darkest ramp. Recommendation: keep green as the default with the existing fallbacks; if the owner
wants a decision beyond this, run a matched paid A/B (about 10 ordinary + 5 blue/teal prompts, same seeds, green vs cyan
mannequin) measuring loss, key-tinted outlines and dressing quality.

## Caveats

- Sample bias: all 50 ordinary items were generated on green with "no bright green" wording, from about 16 prompts that skew
  red/brown/steel; the 36 others were chosen to contain green. Green px on green items are unmeasurable (ambiguous).
- Generated colors follow the key (finding 7), so cyan behavior on a cyan mannequin cannot be read from green outputs.
- Item px inference (changed by > 32 or off-body) also counts redrawn skin or a recolored mannequin; key inference relied on
  fit, with one manual override.
- Synthetic ramps and blends are hand-built approximations; the audit word list over-represents greens.
