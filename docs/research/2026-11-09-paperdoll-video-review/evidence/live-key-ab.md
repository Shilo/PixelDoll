# Chroma default A/B (arm Y, 2026-11-09)

## Pre-registration (written before the first paid call)

Question: should the default mannequin key stay green, or become cyan (hue 180), azure (210) or blue (240)?

Arms: green, azure and blue use the production ramps, prompts (`KEY_NAME`) and extraction (`items.extractCell`). Cyan is
harness-only: the green ramp rotated +60 in hue, named "bright cyan", extracted by rotating the output back -60 and running the
production green code (the same method `hue.mts` used to validate azure before it shipped). Identical prompts except the key
name, identical seeds, identical bodies.

Stages (budget hard cap 900 generations; the full design in the brief costs about 1,014, so stages 2 to 4 are narrowed):
1. Body A (64 px), dress S/E/N, seed 7, 10 items x 4 keys (40 calls, about 400 gens).
2. Body A seed 11 on the 8 non-colliding items for green and the two best non-green keys after stage 1 (24 calls, about 240).
   Ranking for "best": fewest hard fails on non-colliding items, then lowest lost-to-key px, then highest G2.
3. Body B (Studio default slender elf, 80 px), seed 7, 4 most informative items, same 3 keys (12 calls).
4. Walk S/E/N seed 7 on body A, 3 items, green vs the best non-green key (18 calls, about 54).
Any stage may be cut short if the signal is already clear; the ledger cap enforces 900.

Metrics per call and view: G2 key kept (production gate), G3 key outside the body, item px, `nearKeyShare`, px lost to the key
(output px classed as key, i.e. dropped, whose color is more than 40 per channel from the key ramp in the key's frame: an item
color the extraction ate), despill changes (layer px whose color differs from the raw output), off-hue drift (mean key-channel
excess of near-gray item px in the key's frame: positive = the item leans toward the mannequin hue), mannequin repaint (share of
non-item body px that moved more than 24 per channel from the input mannequin), residual tint (layer px scoring >= NEAR_KEY),
hard fails (G2 fail, G3 > 0.02, empty layer).

Decision rule. A non-green key replaces green as the default only if, over all non-colliding items on both bodies:
- its hard-fail count is no higher than green's, its mean G2 is not lower by more than 0.005, and its summed G3 is not higher;
- it is materially better (at least 25 % relative, and visible on the sheets) on at least one measured failure mode;
- it has no new failure (hard fail or visible defect green does not have) on common materials: steel helm, silver plate, golden
  crown, leather boots, tan jerkin, blonde hair;
- its walk poses have no more hard fails than green's.
Collision controls (turquoise amulet, navy tunic) are reported but not counted against the keys they collide with: they test
whether the switch rule still needs a fallback key. A tie keeps green (switching has a cost: docs, tests, fixtures).

Offline prior (free, before spending): colors of the six stored S4 item layers (steel helmet, red cape, leather chest, boots,
dark brown hair, steel sword) and body B's skin score 0 % near-key and 0 % key on all four keys, so any difference must come
from how the model draws on each mannequin hue, not from the item palettes themselves.

## What ran

| stage | calls | charged gens (usage) | notes |
|---|---|---|---|
| 1 body A seed 7, 10 items x 4 keys | 40 | 400 | all completed |
| 2 body A seed 11, 8 items x green/cyan/azure | 24 | 240 | ranking after stage 1: lost px cyan 0, azure 1, blue 11, so blue dropped |
| 3 body B seed 7, helm/plate/hair/hood x green/cyan/azure | 12 | 120 | estimate 15, actual 10 each |
| 4 walk S/E/N seed 7, helm/cloak/hair x green/cyan | 18 sent, 16 stored | 48 | 13 jobs outlived the client's 15 min poll on the local API and were recovered later by GET only (`c25/y_recover.mts`, `recovered.jsonl`); 2 were refused with 429 (Tier 2, 11 concurrent jobs) and not resent: hair green walk/east, helm cyan walk/north |
| total | 94 sent, 92 charged | 808 | balance after: 18,123.1 generations |

Nothing was resent. Ledger: `ledger.jsonl` (error rows for the 15 failed polls/refusals carry no gens; the 13 recovered jobs reported 3 gens each).

## Results (from `c25/eval_y.mts`; full output in `eval.md`)

Columns: hard fails (G2 fail, G3 > 0.02, empty layer), G2 key kept, G3 key outside, near-key = `nearKeyShare`, lost px = px dropped as key
whose color is > 40 per channel from the key ramp (item colors the extraction ate), despilled = layer px changed > 2 by despill,
drift = mean key-channel excess of near-gray item px in the key's frame, repaint = share of non-item body px moved > 24 from the input
mannequin, tint = layer px still scoring >= NEAR_KEY after despill, key-leaning = share of item px (max channel >= 64) with any key score.

### Body A seed 7, non-colliding items

| key | views | hard fails | G2 mean | G2 min | G3 sum | near-key mean | lost px (body/out) | despilled px | drift | repaint | tint px | key-leaning | item px |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| green | 24 | 0 | 0.996 | 0.986 | 0.000 | 0.005 | 65/0 | 355 | -8.1 | 0.078 | 2 | 0.017 | 4864 |
| cyan | 24 | 0 | 0.996 | 0.989 | 0.000 | 0.001 | 0/0 | 371 | -0.9 | 0.048 | 0 | 0.135 | 4744 |
| azure | 24 | 0 | 0.997 | 0.987 | 0.000 | 0.027 | 1/0 | 513 | -4.3 | 0.058 | 0 | 0.103 | 4589 |
| blue | 24 | 0 | 0.998 | 0.981 | 0.000 | 0.000 | 11/0 | 421 | -4.8 | 0.108 | 0 | 0.099 | 4499 |

### Body A seed 11, non-colliding items

| key | views | hard fails | G2 mean | G2 min | G3 sum | near-key mean | lost px (body/out) | despilled px | drift | repaint | tint px | key-leaning | item px |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| green | 24 | 0 | 0.997 | 0.991 | 0.000 | 0.010 | 0/0 | 304 | -11.8 | 0.060 | 0 | 0.025 | 4597 |
| cyan | 24 | 0 | 0.996 | 0.989 | 0.000 | 0.023 | 9/0 | 348 | -3.0 | 0.047 | 71 | 0.163 | 4583 |
| azure | 24 | 0 | 0.998 | 0.992 | 0.000 | 0.031 | 6/0 | 769 | -1.5 | 0.067 | 0 | 0.182 | 4403 |

### Body B seed 7

| key | views | hard fails | G2 mean | G2 min | G3 sum | near-key mean | lost px (body/out) | despilled px | drift | repaint | tint px | key-leaning | item px |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| green | 12 | 0 | 0.994 | 0.973 | 0.020 | 0.007 | 13/2 | 219 | -8.3 | 0.093 | 0 | 0.011 | 3722 |
| cyan | 12 | 0 | 0.994 | 0.976 | 0.046 | 0.000 | 9/0 | 454 | 0.8 | 0.074 | 0 | 0.164 | 4182 |
| azure | 12 | 0 | 0.994 | 0.971 | 0.042 | 0.072 | 12/0 | 1350 | 10.2 | 0.090 | 0 | 0.302 | 4144 |

### Collision controls (amulet, tunic), body A

| key | views | hard fails | G2 mean | G2 min | G3 sum | near-key mean | lost px (body/out) | despilled px | drift | repaint | tint px | key-leaning | item px |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| green | 6 | 0 | 0.997 | 0.995 | 0.000 | 0.066 | 0/0 | 27 | -27.1 | 0.078 | 1 | 0.216 | 749 |
| cyan | 6 | 0 | 0.993 | 0.979 | 0.012 | 0.013 | 0/0 | 135 | 10.0 | 0.064 | 0 | 0.338 | 874 |
| azure | 6 | 0 | 0.996 | 0.986 | 0.000 | 0.236 | 278/0 | 144 | 15.6 | 0.187 | 86 | 0.291 | 322 |
| blue | 6 | 3 | 0.999 | 0.998 | 0.042 | 0.032 | 16/0 | 16 | 7.0 | 0.210 | 0 | 0.062 | 81 |

### Per item and key (all stored dress calls; hard fails list view:gate)

| body | item | key | seeds | hard | G2 min | G3 max | near-key | lost px | despilled | drift | repaint | tint | item px |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | helm | green | 7,11 | 0 | 0.986 | 0.000 | 0.009 | 0 | 21 | -11.3 | 0.023 | 0 | 0.009 | 1053 |
| A | helm | cyan | 7,11 | 0 | 0.989 | 0.000 | 0.070 | 0 | 306 | 14.2 | 0.019 | 71 | 0.652 | 1029 |
| A | helm | azure | 7,11 | 0 | 0.992 | 0.000 | 0.214 | 0 | 817 | 19.0 | 0.021 | 0 | 0.770 | 975 |
| A | helm | blue | 7 | 0 | 1.000 | 0.000 | 0.000 | 0 | 271 | 13.2 | 0.040 | 0 | 0.703 | 457 |
| A | boots | green | 7,11 | 0 | 0.990 | 0.000 | 0.000 | 0 | 0 | -26.4 | 0.031 | 0 | 0.000 | 628 |
| A | boots | cyan | 7,11 | 0 | 0.989 | 0.000 | 0.000 | 0 | 0 | -40.1 | 0.021 | 0 | 0.000 | 704 |
| A | boots | azure | 7,11 | 0 | 0.987 | 0.000 | 0.000 | 1 | 2 | -40.8 | 0.024 | 0 | 0.000 | 633 |
| A | boots | blue | 7 | 0 | 0.992 | 0.000 | 0.000 | 0 | 0 | -39.3 | 0.044 | 0 | 0.000 | 305 |
| A | cloak | green | 7,11 | 0 | 1.000 | 0.000 | 0.000 | 0 | 110 | -13.6 | 0.101 | 0 | 0.000 | 2251 |
| A | cloak | cyan | 7,11 | 0 | 0.994 | 0.000 | 0.000 | 0 | 32 | -33.2 | 0.088 | 0 | 0.001 | 2313 |
| A | cloak | azure | 7,11 | 0 | 0.991 | 0.000 | 0.000 | 1 | 46 | -35.6 | 0.161 | 0 | 0.001 | 2377 |
| A | cloak | blue | 7 | 0 | 0.981 | 0.000 | 0.002 | 0 | 40 | 29.9 | 0.168 | 0 | 0.002 | 1010 |
| A | crown | green | 7,11 | 0 | 0.995 | 0.000 | 0.016 | 0 | 45 | 4.6 | 0.025 | 0 | 0.081 | 540 |
| A | crown | cyan | 7,11 | 0 | 0.993 | 0.000 | 0.000 | 0 | 21 | -10.7 | 0.015 | 0 | 0.039 | 619 |
| A | crown | azure | 7,11 | 0 | 0.993 | 0.000 | 0.000 | 0 | 2 | -9.2 | 0.024 | 0 | 0.000 | 654 |
| A | crown | blue | 7 | 0 | 1.000 | 0.000 | 0.000 | 0 | 25 | 1.5 | 0.035 | 0 | 0.082 | 302 |
| A | hair | green | 7,11 | 0 | 0.993 | 0.000 | 0.033 | 30 | 138 | 0.0 | 0.107 | 2 | 0.064 | 1146 |
| A | hair | cyan | 7,11 | 0 | 0.990 | 0.000 | 0.012 | 9 | 15 | -16.4 | 0.050 | 0 | 0.013 | 1174 |
| A | hair | azure | 7,11 | 0 | 0.996 | 0.000 | 0.015 | 4 | 36 | -13.4 | 0.075 | 0 | 0.019 | 1180 |
| A | hair | blue | 7 | 0 | 1.000 | 0.000 | 0.000 | 0 | 15 | -26.1 | 0.146 | 0 | 0.008 | 705 |
| A | jerkin | green | 7,11 | 0 | 0.992 | 0.000 | 0.000 | 8 | 73 | -7.2 | 0.099 | 0 | 0.005 | 1263 |
| A | jerkin | cyan | 7,11 | 0 | 0.990 | 0.000 | 0.001 | 0 | 53 | -33.4 | 0.061 | 0 | 0.001 | 1264 |
| A | jerkin | azure | 7,11 | 0 | 0.992 | 0.000 | 0.001 | 1 | 22 | -31.7 | 0.062 | 0 | 0.003 | 1248 |
| A | jerkin | blue | 7 | 0 | 0.996 | 0.000 | 0.000 | 0 | 10 | -36.7 | 0.149 | 0 | 0.000 | 658 |
| A | plate | green | 7,11 | 0 | 0.993 | 0.000 | 0.000 | 27 | 138 | -9.7 | 0.089 | 0 | 0.008 | 1234 |
| A | plate | cyan | 7,11 | 0 | 0.989 | 0.000 | 0.016 | 0 | 250 | 12.2 | 0.079 | 0 | 0.489 | 1122 |
| A | plate | azure | 7,11 | 0 | 0.996 | 0.000 | 0.000 | 0 | 346 | 12.4 | 0.097 | 0 | 0.344 | 863 |
| A | plate | blue | 7 | 0 | 0.998 | 0.000 | 0.000 | 11 | 44 | 7.8 | 0.184 | 0 | 0.000 | 384 |
| A | hood | green | 7,11 | 0 | 0.993 | 0.000 | 0.001 | 0 | 134 | 0.6 | 0.077 | 0 | 0.001 | 1346 |
| A | hood | cyan | 7,11 | 0 | 0.991 | 0.000 | 0.000 | 0 | 42 | -18.2 | 0.046 | 0 | 0.001 | 1102 |
| A | hood | azure | 7,11 | 0 | 0.993 | 0.000 | 0.000 | 0 | 11 | -24.5 | 0.034 | 0 | 0.001 | 1062 |
| A | hood | blue | 7 | 0 | 0.998 | 0.000 | 0.000 | 0 | 16 | -27.1 | 0.100 | 0 | 0.000 | 678 |
| A | amulet | green | 7 | 0 | 0.995 | 0.000 | 0.132 | 0 | 24 | 0.0 | 0.037 | 1 | 0.433 | 97 |
| A | amulet | cyan | 7 | 0 | 0.991 | 0.012 | 0.025 | 0 | 21 | 4.3 | 0.040 | 0 | 0.067 | 142 |
| A | amulet | azure | 7 | 0 | 0.998 | 0.000 | 0.131 | 0 | 19 | -14.6 | 0.042 | 0 | 0.178 | 111 |
| A | amulet | blue | 7 | 0 | 0.998 | 0.000 | 0.065 | 15 | 16 | 7.0 | 0.071 | 0 | 0.123 | 81 |
| A | tunic | green | 7 | 0 | 0.996 | 0.000 | 0.000 | 0 | 3 | -27.1 | 0.119 | 0 | 0.000 | 652 |
| A | tunic | cyan | 7 | 0 | 0.979 | 0.000 | 0.000 | 0 | 114 | 12.6 | 0.089 | 0 | 0.610 | 732 |
| A | tunic | azure | 7 | 0 | 0.986 | 0.000 | 0.341 | 278 | 125 | 25.3 | 0.332 | 86 | 0.404 | 211 |
| A | tunic | blue | 7 | s7S:empty s7E:G3+empty s7N:empty | 0.998 | 0.023 | 0.000 | 1 | 0 | 0.0 | 0.348 | 0 | 0.000 | 0 |
| B | helm | green | 7 | 0 | 0.973 | 0.009 | 0.000 | 0 | 51 | -11.1 | 0.067 | 0 | 0.000 | 1110 |
| B | helm | cyan | 7 | 0 | 0.984 | 0.009 | 0.000 | 0 | 346 | 11.0 | 0.051 | 0 | 0.456 | 1065 |
| B | helm | azure | 7 | 0 | 0.984 | 0.012 | 0.277 | 0 | 984 | 25.8 | 0.063 | 0 | 0.771 | 1047 |
| B | hair | green | 7 | 0 | 0.999 | 0.001 | 0.003 | 10 | 24 | 0.0 | 0.100 | 0 | 0.016 | 864 |
| B | hair | cyan | 7 | 0 | 0.999 | 0.008 | 0.000 | 9 | 39 | -14.1 | 0.109 | 0 | 0.003 | 1114 |
| B | hair | azure | 7 | 0 | 0.998 | 0.006 | 0.000 | 6 | 17 | -22.2 | 0.141 | 0 | 0.005 | 1150 |
| B | plate | green | 7 | 0 | 1.000 | 0.004 | 0.003 | 5 | 54 | -9.3 | 0.119 | 0 | 0.003 | 579 |
| B | plate | cyan | 7 | 0 | 0.997 | 0.006 | 0.000 | 0 | 67 | 7.9 | 0.072 | 0 | 0.196 | 677 |
| B | plate | azure | 7 | 0 | 0.997 | 0.007 | 0.012 | 5 | 318 | 12.6 | 0.078 | 0 | 0.433 | 682 |
| B | hood | green | 7 | 0 | 0.979 | 0.003 | 0.023 | 0 | 90 | 2.0 | 0.085 | 0 | 0.027 | 1169 |
| B | hood | cyan | 7 | 0 | 0.976 | 0.009 | 0.000 | 0 | 2 | -25.8 | 0.063 | 0 | 0.002 | 1326 |
| B | hood | azure | 7 | 0 | 0.971 | 0.004 | 0.000 | 1 | 31 | -28.3 | 0.077 | 0 | 0.000 | 1265 |

### Walk S/E/N (body A, seed 7)

| item | key | hard fails | warnings | G2 min | G3 max | lost px | tint px | layer px |
|---|---|---|---|---|---|---|---|---|
| helm | green | 0 | 0 | 1.000 | 0.003 | 0 | 0 | 4686 |
| helm | cyan | 0 | 0 | 1.000 | 0.003 | 0 | 0 | 2958 |
| cloak | green | 0 | 1 | 1.000 | 0.000 | 0 | 0 | 9763 |
| cloak | cyan | 0 | 0 | 1.000 | 0.000 | 0 | 0 | 9740 |
| hair | green | 0 | 0 | 1.000 | 0.000 | 248 | 16 | 3156 |
| hair | cyan | 0 | 0 | 1.000 | 0.000 | 0 | 0 | 4117 |

Walk note: hair green covers S and N only, helm cyan S and E only (the two 429 refusals), so compare per direction on the sheets.

## What the sheets show (4x, `Y/<body>/<item>.sheet.png`; rows = keys in order green, cyan, azure, blue for seed 7, then the seed 11 rows; columns = input mannequin S/E/N, raw output S/E/N, layer over the real body S/E/N, key heatmap S/E/N with orange = weak key tint; walk: `Y/A/<item>.<key>.walk.sheet.png`)

- Green's one recurring defect: near-black item outlines come back tinted toward the mannequin's darkest shade (4,19,0 and 2,17,3; key
  score 79 to 82), score as key and are dropped. Blonde braids lose their dark outline over the chest and back (seed 7 dress: 30 px;
  walk south/north: 248 px, broken dashed braid outlines in every frame); silver plate loses 27 px, jerkin 8. Blue shows the same
  defect (plate 0,1,14 dropped, 11 px). Cyan and azure did not show it at seed 7, and showed 9 and 6 px at seed 11.
- Blue-family keys' defect: cool steel and silver lean toward the key. Key-leaning share on the helm: green 0.009, cyan 0.65, azure 0.77,
  blue 0.70; on the plate: green 0.008, cyan 0.49, azure 0.34. Despill then rewrites steel (azure helm 817 px, cyan 306, green 21): azure
  flattens blue-gray steel to neutral or warm gray, cyan seed 11 kept 71 px of teal tint in the helm layer and its steel reads darker and
  bluer. No gate catches this; all still pass.
- Collision controls: the navy tunic extracts cleanly on green, survives on cyan (fully tinted, 114 px despilled), is mostly eaten on azure
  with no hard fail (211 of about 700 px kept, a silent loss), and vanishes on blue (empty layer, hard fail). The turquoise gem survives on
  green, azure and blue, but on cyan the model simply did not draw it (a hollow gold ring, no gate fires). Green keeps both common
  "blue-ish" materials that blue-family defaults would push to a fallback key.
- Common warm materials (leather boots, red cloak, gold crown, tan jerkin, khaki hood) are clean on every key; the khaki hood shows no
  yellow-olive bleed on green.
- Design variance between seeds and keys (pauldrons on or off, braids missing in cyan north) is larger than any key effect on most items.

## Verdict against the pre-registered rule

Best challenger: cyan (azure is similar on lost px but worse on steel and loses navy silently; blue fails navy outright and shares green's
outline defect).
- Hard fails: tie (0 on all non-colliding items, both bodies, and walks). Pass.
- G2 mean: tie within 0.001. Pass.
- Summed G3: body A 0 vs 0; body B cyan 0.046 vs green 0.020 (all views far under the 0.02 per-view gate). Fail, by a small margin.
- Materially better on one failure mode: yes. Lost item px: dress 18 vs 80 in total, walk hair 0 vs 248; repaint 0.048 to 0.074 vs
  0.060 to 0.093. Pass.
- No new failure on common materials: steel helm and silver plate lean toward cyan (0.65 and 0.49 key-leaning vs 0.01) with residual teal
  tint in one helm. Visible but mild. Borderline fail.
- Walk hard fails: tie. Pass.

Decision: keep green as the default. Cyan does not clear the rule (G3 sum, steel margin), and its advantage is one specific green failure
(dark outline px tinted toward dark green) that looks fixable in extraction rather than by changing the key. Confidence: moderate.

Follow-up worth testing offline on these stored frames (no generations): a key-scored px that is far from the key ramp (rampDistance
> ~40) and touches item px is an item outline, not the mannequin, since the darkest ramp shade is (0,60,0). That would recover the 30 +
248 braid px without touching cyan.

Remaining doubts: 2 seeds on body A and 1 on body B, 10 items; cyan is a harness rotation of the green ramp, not a shipped key; the lost-px
metric undercounts outline px within 40 of the ramp; the local API at localhost:8000 may not match production behavior or timing; walk
coverage is partial (2 refused calls).

## Files

- Arm, launcher, evaluator, recovery: `spikes/api/c25/arm_y.mts`, `y_env.mts`, `eval_y.mts`, `y_recover.mts`
- Raw outputs: `Y/A/<item>/<key>_dress_s<seed>.<i>.png`, `Y/B/<item>/<key>_dress_s7.<i>.png`, `Y/A/<item>/<key>_walk_<dir>.<f>.png`
- Per-view metrics: `Y/dress_rows.json`; logs `stage1.log` to `stage4.log`
