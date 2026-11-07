# Extraction and ownership challenge

November 7, 2026, paperdoll improvement cycle, extraction researcher. Offline only: no PixelLab calls, no `app/src` edits. Every probe imports production functions from `app/src/lib`; the only research code is case construction, scoring, and thin counterfactual wrappers around production functions. Labels: **source** (read in code or a primary source), **offline** (reproduced here with a script), **inference**, **untested**.

Scripts live in [scripts/extraction](scripts/extraction/). Run them from the repo root, for example `node docs/research/2026-11-07-paperdoll-cycle/scripts/extraction/counterfactuals.ts`. Large outputs (JSON tables, zoomed sheets) go to `C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/extraction/`.

| Script | Measures |
| --- | --- |
| `lib.ts` | Shared fixture loading, slicing, PNG save |
| `body-stats.ts` | Dark (mean RGB < 60) interior px of every benchmark body, ASCII map of body A |
| `synthetic-mutations.ts` | 22 ground-truth mutations on the real body A south rest cell, stage attribution |
| `bench-replay.ts` | Production pipeline on the 17 live benchmark cases (627 cells): key-ramp distance, shipped-vs-raw RGB, stage volumes, keyframe re-extraction |
| `despill-pairs.ts` | Top raw to shipped RGB pairs per case, far-from-ramp key colors |
| `rim-guard.ts`, `rim-guard-components.ts`, `rim-guard-sheet.ts` | Where `dropKeyOutline` removes px on real frames, component sizes, visual sheets |
| `counterfactuals.ts`, `cf1b-sheet.ts`, `cf2-pairs.ts` | CF1/CF1b rim guard, CF2/CF2b despill, CF3 key-collision witness, scored on synthetic and real cells |
| `metamorphic.ts` | Input immutability, equip/unequip restoration, posed re-extraction, postProcess idempotence |
| `skin-repaint.ts`, `skin-repaint-sheet.ts` | G2 repainted-skin blind spot: survival sweep and a frozen-body palette detector on synthetic and real cells |

## 1. Code map (source)

Dressing input and key choice, [chroma.ts](../../../app/src/lib/image/chroma.ts):

- `pickKey` L51 and `keyAllowed` L45 pick green, magenta, blue, then azure from prompt color words (`HUES` L36). `switchTo` L12 has no production caller since `0b7ede7b`; only `test/unit/azure-key.test.ts` uses it. No runtime check reacts to a near-key color the prompt did not name.
- `toChroma` L54 maps each opaque base px to the key ramp `RAMP` L28 by per-cell luminance range.
- `keyScore` L67 (ratio of key-channel excess, 0 below an absolute excess of 12), `tint` L71 (same ratio from excess 5), `isKey` L75 (alpha >= 128 and score >= `KT` = 35, L77).

Per-cell extraction, `chromaLayer` L222 = `chromaMask` L79 then `dropKeyOutline` L90 then `absorbOutline` L196 then 8-connected components >= `minPx` 2 (L225, `components` L115) then `despill` L168:

- `dropKeyOutline` (rim guard): candidate = item px on the base silhouette ring **or over a dark base px (mean RGB < 60)** with >= 2 key 4-neighbors (L96-97); dropped unless an 8-neighbor is a non-candidate item px (L99-110).
- `absorbOutline`: dark key px (lum <= 0.3) become item when off the base and touching item, or with >= 5 of 8 item neighbors; two passes (L209-217).
- `despill`: px with tint > 10 lose the key excess (L178-180, a max(other channels) limit for green and blue), then snap to a clean ("core", tint <= 10) color within Chebyshev 40 (L183), else a luminance-nearest core color within 0.08 (L184), else keep the partially despilled color.

Cell and clip pipeline, [items.ts](../../../app/src/lib/items/items.ts):

- `extractCell` L704: `bestShift` L665 1 px registration for posed cells (L709-712, G10 input), band clip for posed head items (L715-722), `majorComponents` L374 for gate metrics only (L725), body cut `cutOf` L445 (L733), G2 inputs via `keyKept` (chroma.ts L233) with detached body FX skipped (L736-737), G3 via `keyOutside` (chroma.ts L248), `clipToStencil` L388 for grid repairs.
- `postProcess` L641: held items `attachHeld` L530, `clipFloor` L519, `closeGrip` L558, `repairDropped` L589; other items `sizeFloor` L627 with `partFloor` L610, then `trimToKeyframe` L472 for band slots or `dropOffBody` L653 for body-hugging worn slots.
- Gates: `GATES` L764, `g2Fails` L767; `evaluateQa` L868 emits G10 L874, G2 L877, G3 L878, G7 L886, G4 L933-935, G5 L944, G8 L967, G9 L1016-1017, G6 L1038; H4 `dirGate` L1125 with `H4` L1117.
- Studio call sites: [run.ts](../../../app/src/lib/items/run.ts) L129, L426, L632, L733 (`extractCell`), L453, L633, L734 (`postProcess`).

Dye correction and boundary veto, [item-palette.ts](../../../app/src/lib/dress/item-palette.ts): `standingDyeMatcher` L10 (owned, unambiguous match within 12 per channel, L24) and the clip-wide boundary veto L27-43; applied per direction in run.ts L581. `itemPaletteMatcher` L62 is the explicit neutral-material repair.

## 2. Adversarial results

### 2.1 Synthetic ground truth on a real body (offline)

`synthetic-mutations.ts` keys body A south rest exactly with `toChroma`, then paints items whose owner is known by construction. Selected rows (item px; kept by the keyframe extractor; stage that lost them; gate verdict):

| Case | Item px | Kept | Lost at | False item px | G2 / G3 |
| --- | ---: | ---: | --- | ---: | --- |
| 1 px belt on the body's own waist line (row 42) | 16 | 4 | 12 rim guard | 0 | pass / pass |
| Same belt on row 38 (light body) | 22 | 22 | none | 0 | pass |
| 1 px silver necklace on the neck line | 12 | 8 | 4 rim guard | 0 | pass |
| Belt on waist line + 2x2 buckle | 18 | 10 | 8 rim guard | 0 | pass |
| 1 px belt row 38, dark-skinned body (RGB x0.42) | 22 | 13 | 9 rim guard | 0 | pass |
| 1 px diagonal strap, dark-skinned body | 15 | 11 keyframe, 6 posed | 4 rim guard, 5 more `sizeFloor` | 0 | pass |
| Cap + two detached 3 px earrings | 56 | 56 keyframe, 50 posed | 6 `sizeFloor` (and `dropOffBody`) | 0 | pass |
| 1 px detached stud | 1 | 0 | `minPx` 2 | 0 | pass |
| Panel with 28 isolated 1 px holes (8 over dark key shades) | 226 | 226 | none | 8 (`absorbOutline`) | pass |
| Panel with 2x2 holes | 238 | 238 | none | 8 (`absorbOutline`) | pass |
| Panel with checkerboard mesh | 191 | 190 | 1 | 2 | pass |
| Fern panel (scores 35/38/31) | 254 | 78, 0 exact RGB | 170 key mask, 5 rim guard | 0 | pass |
| Jade/teal panel (36/31/30) | 254 | 166, 0 exact RGB | 85 key mask | 0 | pass |
| Turquoise ramp (scores 7-17) | 254 | 254, 64 exact | 190 recolored off-palette by despill | 0 | pass |
| Olive-drab ramp | 254 | 254, 84 exact | 170 snapped onto a sibling shade (ramp collapse) | 0 | pass |
| Ring blended 25/50/75 % with the key | 254 | 245 | 13 (25 % blends) | 0 | pass |
| Off-body brim at alpha 64/128/200/255 | 72 | 54 | 18 (alpha 64) | 0 | pass |
| Bracers painted in the exact skin RGB under them | 14 | 14 | none | 0 | pass |
| Provider repaints 14 face px in skin tone | 50 | 50 | none | 14 | pass |

Every failure above passes G2 and G3. G2 needs both `keyKept < 0.97` and `keyLost > 8` (items.ts L767): the waist-line belt costs 12 px but keeps 0.981. The dark-skin rows matter for fairness: on a darker body more px fall below mean RGB 60, so thin items are removed in more places (inference from L96; body A alone has 11.9 % dark interior px, all bodies 11.0-22.0 %, `body-stats.ts`).

### 2.2 Real corpus (offline, 627 cells, 17 live cases)

- **Rim guard volumes.** `dropKeyOutline` removed 644 components touching only the silhouette ring (1 px: 588) and 133 with an interior px; the largest interior component is 5 px (five cells). Sheets for a-helmet and a-axe96 show the bright removals are mannequin rim specks the provider repainted gray: correct removals (offline visual).
- **Key-ramp distance.** Of 343,249 key-scoring in-body raw px, 99.4 % lie within Chebyshev 24 of the production ramp and 924 beyond 32. Against the scaled key family `s * ramp(t)` (s 0.3-1, models darker provider shades) only 30 px exceed 32, at most 4 per cell (CF3 below).
- **Shipped RGB differs from raw** on 35,209 of 233,654 item px (15.1 %; includes `closeGrip`/`repairDropped` copies on held items). The largest single change is designed: n-cloak128's dark shadow (36,49,12) becomes maroon (53,11,10) on 22,212 px (round 2 arm N chose this). Dark near-neutral outlines also lose small tints, for example a-helmet (21,28,21) to (21,21,21), 698 px.
- **Idempotence.** `despill` on its own output changes 0 px in all cases (hypothesis rejected). Keyframe re-extraction from keyed body + shipped layer + cut: 0 lost, 11 added, 0 recolored, 0 cut changes (matches the conditioning study). Posed re-extraction (568 cells, without postProcess): 6 lost, 169 added. A second `postProcess` changes 0 px and repairs nothing.
- **Equip/unequip.** Extraction and cleanup never mutate submitted base or raw images (0 of 627); `recompose` changes the bare body only on layer or cut px (0 leaks); cuts total 986 px on the three hooded/helmet cases. Multi-item cut combinations were already qualified in the 2026-11-06 ownership follow-up.
- **Partial alpha.** No raw benchmark px has fractional alpha, so the alpha 64 loss and raw alpha 128/200 pass-through are synthetic-only findings.

### 2.3 G2 repainted-skin blind spot (offline, coordinator request)

`skin-repaint.ts` repaints growing regions of the keyed body A (face 4 px, face 30, face and hands 42, face and arms 90, face, arms and chest 172) on a light and a darkened copy. It uses three color models: the body's own RGB at each px, a generic four-shade skin ramp, and the generic ramp mixed 50 % with the body color. A red cap is the real item. Valid-gear controls are bracers in the exact body RGB, tan leather bracers and a brown belt.

- **Survival:** every repainted px survives keyframe extraction on the light body (4/4 to 172/172). The dark body keeps 170/172 (2 lost; stage not attributed). G2 reads 1.000 (light) and 0.992-0.997 (dark), and G3 passes in all 30 repaint cases. The posed path removes only the isolated 4 px face repaint (`sizeFloor`); 30 px and larger repaints survive. The repaint also adds 6-10 non-repaint body px to the item, which are the enclosed dark eye and mouth px (*inference*: `absorbOutline` makes dark key px with >= 5 item neighbors item, then `despill` snaps them to skin). Root cause: `keyKept` skips every px already in the item mask (`skip`, items.ts L736-737), so G2 cannot observe repaint. This repeats the 2026-11-06 spike at more sizes.
- **Body-palette detector:** count item px over the base silhouette within Chebyshev `tol` of the frozen base's opaque palette. Exclude colors the same layer also uses off the body, as a proxy for "colors the design legitimately shares" (`bodyPaletteFlags`).
  - **Exact palette (tol 0):** 0 flagged px across all 627 real cells, and it catches body-RGB repaints fully. It sees only 6-10 of 30-172 generic repaints. *Inference:* in the chroma route the provider never receives the true skin colors, so exact-palette repaint is the unlikely case.
  - **Full palette at tol 24:** catches generic repaints on the light body (172/172). It catches 0 on the dark body, because generic skin is far from a dark palette. It flags 130 of 627 real cells at >= 12 px, mostly steel near the body's gray shorts (c-greathelm 2,178 px, b-greathelm 1,463).
  - **Warm skin-only palette at tol 24 (r > g > b, chroma >= 24):** still catches light generic repaints (172/172) and 0/172 on the dark body. It flags 33 real cells, with a-chest at 1,223 px. The a-chest sheet shows valid brown leather armor flagged (offline visual), plus a-boots 260 and b-tunic 169.
  - **Valid gear:** bracers in the exact body RGB are indistinguishable from an exact repaint (14 of 14 flagged) under every variant.
- **Verdict:** **rejected as a gate**, and not proposed as an automatic warning. The detector separates repaint from gear only when the repaint copies the body palette exactly. The real corpus shows no such px. Leather and tan gear collide with skin shading, and skin-tone repaints on darker bodies go undetected, so false flags and misses both fall unevenly by skin tone. The useful protection remains the 2026-11-06 route: a trusted stencil (protected face and hands) for repairs. Showing repaint candidates for review needs independent owner labels before it can be qualified (**untested**).

## 3. Ranked candidates

### 1. Rim guard deletes thin items that cross dark base lines (offline, strongest)

- **Failure:** 1 px belts, necklaces and straps over the body's internal outline or dark skin lose 25-75 % of their px; fragments then fall to `sizeFloor` in posed frames. Gates pass.
- **Root cause:** the dark-base clause chroma.ts L96-97 plus anchoring that needs a non-candidate 8-neighbor (L99-110). A 1 px line where every px is a candidate has no anchor.
- **Smallest shared fix (CF1b):** after `dropKeyOutline`, restore a removed 8-connected component if it has >= 6 px including an interior px, or if it touches two or more separate kept item components (its removal splits the item). Topology-preserving deletion ([Kong and Rosenfeld 1989](https://scholarhub.vn/publication/Digital-topology-Introduction-and-survey/b682e33c-05e0-43bd-9bc0-8544ad145e4c) simple points) at component granularity.
- **Offline control:** synthetic belt 4 to 16/16, necklace 8 to 12/12, dark-skin belt 13 to 22/22, dark-skin strap 11 to 15/15, no false px. Real corpus: 9 px change; 4 are bowstring px crossing the body in a-bow96 (visual), 3 are cape edge px in b-cloak, 2 green stripe px in a-stripes-azure. The chain-only rule (CF1) changes 0 real px and fixes only the waist-line belt.
- **Risks:** a provider-redrawn internal outline that bridges two item parts would survive (none observed in 627 cells). The 6 px chain threshold is a fixed count; check at 160 px cells.
- **Accept if** the benchmark verdicts and keep labels are unchanged and the 9 restored px pass visual review; **reject if** any H4 or G2 verdict changes or a restored component is mannequin.

### 2. Despill recolors legitimate green-dominant gear (offline)

- **Failure:** turquoise keeps 64 of 254 exact colors, jade and fern 0 exact; colors leave the item palette, so dye ramps and G6 palette distance see drift that the provider never drew.
- **Root cause:** chroma.ts L177 treats any tint ratio > 10 as spill, then L185 writes the partially despilled color when nothing snaps. VFX despill is likewise a heuristic that cannot tell natural green from spill ([Natron Despill](https://natron.readthedocs.io/en/rb-2.5/plugins/net.sf.openfx.Despill.html); [Smith and Blinn 1996](https://www.alvyray.com/Papers/CG/blusig96.pdf), "Vlahos Assumption", spill clamp min(B, a2 G)).
- **Smallest fix (CF2b):** when no clean color snaps and the raw px has a real key excess but does not score as key (`0 < keyScore < KT`), keep the raw RGB.
- **Offline control:** turquoise 254/254, jade 166/166, fern 78/78 exact. Real corpus: 41 px change (n-cloak128 36, a-stripes-azure 5). Plain CF2 (no excess floor) is **rejected**: it changes 4,112 real px, restoring green tints on dark outlines (a-helmet 698, b-jester-blue 3,323).
- **Risks:** a genuinely contaminated mid-tone without a clean sibling keeps its tint; the olive-drab ramp collapse is not fixed (it snaps within 40).
- **Accept if** the 41 real px pass review and keep exact stays >= 99.8 %; **reject on** any new G6 warning.

### 3. Near-key colors nobody named are deleted silently (offline, partial detector)

- **Failure:** fern loses 170/254 px and jade 85/254 on green with G2/G3 passing; `switchTo` is dead code.
- **Smallest fix (CF3):** a review warning when a cell has >= 12 key-scoring px farther than 32 from the scaled key family. This is a trimap-style uncertain band ([matting pre-processing survey](https://jcst.ict.ac.cn/EN/Y2017/V32/I1/122)) with abstention ([Chow 1970](https://researcher.watson.ibm.com/publications/on-optimum-recognition-error-and-reject-tradeoff)). Smith and Blinn show single-backing matting is underspecified, which argues for review rather than automatic recovery.
- **Offline control:** 0 of 627 real cells warn (max 4 px); jade gives 85 px (detected); fern gives 0 (**not detected**: its dark shade lies inside the scaled family).
- **Risk:** a false sense of coverage. Accept only as a diagnostic.

### 4. Posed size floor drops small parts the keyframe has (offline, low)

`sizeFloor` (items.ts L631-634) removes posed components below max(`partFloor`, 15 % of the largest); synthetic earrings lose 6/6 px in posed frames. On the real corpus, 24 keyframe components (345 px) sit below that floor, unlabeled. A fix needs part correspondence to the keyframe; **untested**.

### Rejected or deferred

- `despill` is not idempotent: **rejected** (0 px).
- Bright rim-guard removals are item px: **rejected** (visual: mannequin specks).
- `absorbOutline` hole filling: 8 of 8 dark holes become item, but the same rule rescues key-shade folds (5,789 real additions), so it remains an inherent ambiguity. Keep it.
- Frozen-body palette check for repainted skin: **rejected** as a gate or automatic warning (section 2.3).
- Two-backing triangulation matting (dress on two keys and intersect, per Smith and Blinn) would separate key-colored gear but doubles paid calls on non-deterministic outputs; **untested, paid**.

## 4. Coverage log

| Query | Useful result |
| --- | --- |
| Simple points, 4/8 duals, Rosenfeld | Kong and Rosenfeld 1989 (CVGIP 48:357-393): simple point deletion preserves topology under (8,4)/(4,8) pairs |
| Keylight despill bias, max(R,B) limit | [Ben McEwan](https://benmcewan-website.pages.dev/blog/understanding-despill-algorithms) limit formulas; Natron spill-map mix; Keylight internals not public |
| Pixel art matting, segmentation, palette indexing | [SpriteToMesh](https://www.arxiv.org/pdf/2602.21153) uses alpha or a CNN mask; no palette-aware matting paper found |
| Trimap from color distance, abstention | Matting pre-processing survey (color-distance unknown-region expansion); no selective-classification matting source |
| Smith and Blinn, Vlahos, triangulation | Primary PDF read locally: single backing has "an infinity of solutions"; two-backing triangulation |
| Depixelizing pixel art heuristics | [Kopf and Lischinski 2011](https://history.siggraph.org/?p=114686) treats single px as features; heuristic text not retrieved |
| Material ID, palette swap shaders | [Godot indexed palette shader](https://godotshaders.com/shader/sprite3d-indexed-color-palette-swapping-shader/), [Undertale Yellow palette shader](https://undertaleyellow.wiki.gg/wiki/Technical:Palette_Shader): an index is a lookup, not an owner label (agrees with 2026-11-06) |
| Chow reject option | Chow 1970, IEEE T-IT 16(1):41-46 |
