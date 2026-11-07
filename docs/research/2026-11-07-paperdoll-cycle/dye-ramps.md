# Default dye materials: qualifying the adjacency ramp merge (2026-11-07 cycle)

Qualification of [ecosystem rank 1](ecosystem.md#ranked-transferable-mechanisms): keep production `autoRamps` hue groups and merge groups joined by a spritesplit-style mutual-best lightness step between touching colors. **No PixelLab call and no app change.** Scripts are in [scripts/dye/](scripts/dye/) and import production code read-only. Large outputs (labeling sheets, per-item JSON, logs) are in `C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/dye/` (machine-local).

## Verdict

**Reject the hybrid as proposed.** On PixelDoll's own retained PixelLab items it is worse than production (30 against 33 of 45 labeled materials exact) and adds cross-material merges to three more items, including the demo base body (gray clothes merged with skin, 10,145 px) and the demo sword (gold guard merged into the blade). Its premise does not hold here: production already keeps wide uniform gray ramps whole (demo clothes L 0.32 to 0.87, great helms L 0.32 to 0.98).

**A guarded variant is a candidate, not an adoption.** Merging only near-neutral groups with near-neutral groups, or chromatic groups within 40 degrees of hue, with no topological outline removal, scores 36 of 45 here (no new merge) and 107 of 331 on LPC (cloth 39 of 125 against 6; no multi-material item mixed). But the guard was written after seeing both corpora, its PixelDoll gain is three materials on three items (two of them old S1 fixtures), and it breaks explicit color matching on two items. Adopt only after a held-out set passes (see "What would disprove it").

## 1. Where ramps go (downstream of `autoRamps`)

| Consumer | File | Effect of a merge-only ramp change |
| --- | --- | --- |
| Derivation | `deriveMaterials` [dress.ts:59-85](../../../app/src/lib/dress/dress.ts) calls `autoRamps` at :71 (non-garment colors of region-split bases) and :75, on counts from every stored cell (`itemImgs`, :65). It runs only for items without materials: fresh fixtures (the demo derives at load, [state.svelte.ts:320](../../../app/src/studio/state.svelte.ts)), project creation ([create.ts:737](../../../app/src/studio/create.ts)), generated items ([generate.ts:202](../../../app/src/lib/equipment/generate.ts)) and anchored items animated before they have materials ([run.ts:577](../../../app/src/lib/items/run.ts)). | Saved items keep their stored ramps, ids (`<item>_<n>`), variants and presets, so no migration is needed. Newly derived items get fewer, longer ramps and different ids. |
| Saved designs | [design.ts:54-60](../../../app/src/lib/equipment/design.ts) adds "Detail" ramps for colors no material owns | Fewer Detail entries. |
| Names and recolor UI | `materialNames` (dress.ts:36), [Colors.svelte](../../../app/src/studio/Colors.svelte) | One swatch row per ramp; "Detail 2" style rows disappear. |
| Dye math | `variantRamp` (palette.ts:95) shifts a ramp's mean lightness to the pick | A material split in parts and dyed with one swatch per part flattens or inverts its shading; one ramp keeps its steps (measured below). |
| Dye correction after posing | [run.ts:580-581](../../../app/src/lib/items/run.ts) `standingDyeMatcher` with `owned` = union of the item's ramp colors | A merge-only change keeps the union, so proposals and the boundary veto are unchanged. |
| Explicit color matching | `itemPaletteMatcher` [item-palette.ts:57-64](../../../app/src/lib/dress/item-palette.ts) requires exactly one all-neutral material (chroma at most 0.035) | A merged ramp that absorbs slightly tinted dark shades stops qualifying. Regression found (section 4). |
| Fitting | [fit.ts:152-159](../../../app/src/lib/equipment/fit.ts) maps roles by exact sorted-ramp equality and keeps only one-material results | A design saved under the old split may report unmatched roles; merges can only lower the material count. |
| Exports | generic.ts:70-79 (ramp and variant length checks), unity.ts:205-207, phaser.ts:108, gdevelop.ts:47, aseprite.ts:84 | Manifest format unchanged; index-wise swaps stay valid. |

## 2. Labeled corpus

27 items: the demo fixture (`app/public/fixtures/s2`, 7 items including the base body), dev fixture s1 (3 equipment items) and the frozen benchmark (17 non-reference cases, extracted with production code through this cycle's `runPipe`). Excluded: the s1 and s5 base bodies (s5 repeats the demo body; the s1 garment split was not judgeable) and s5 `sword_fsw` (same art as `bench/a-sword96`). `docs/research/evidence` holds JSON only.

Labels ([labels.json](scripts/dye/labels.json)) were assigned per color from [render.ts](scripts/dye/render.ts) sheets (standing views plus posed frames that show extra colors, each color highlighted and numbered) **before any detector ran on these items**. Each color is a material, `outline` (contour or near-contour dark, scored as "don't care") or `ignore` (strays and posed-only singletons). Shirt and shorts on the demo body reuse the same gray shades (checked by row position), so they form one "clothes" material. Result: 45 materials, 14 multi-material items (cloth and trim, steel and gold, steel and wood, hat and band, three-material jester hats and a plumed helmet, plus leaked skin in S1 items). `bench/a-bow96` (wood and string) is low confidence.

Scoring ([compare.ts](scripts/dye/compare.ts)): detector ramps are restricted to labeled material colors, and a material is exact when one ramp equals it. A **cross-material merge** is any ramp holding colors of two labeled materials. The "merge all" baseline (one ramp of every non-outline color) shows what an over-merging metric rewards: 99% pixel recall, but only 12 of 45 exact and merges on all 14 multi-material items. Pixel recall is therefore not used to rank.

## 3. Results on PixelDoll items

| Detector | Exact (45) | Mean Jaccard | Items with a cross-material merge | Multi-material exact (32) |
| --- | ---: | ---: | ---: | ---: |
| Production `autoRamps` | 33 | 0.899 | 3 | 21 |
| spritesplit replay (standing views) | 14 | 0.657 | 5 | 12 |
| Hybrid as proposed | 30 | 0.850 | 6 | 18 |
| Hybrid, hue guard 30 degrees | 34 | 0.903 | 3 | 22 |
| **Candidate**: neutral or 40-degree guard, no outline removal | **36** | **0.917** | **3** | **24** |
| Merge all (baseline) | 12 | 0.596 | 14 | 0 |

Adjacency from standing views or from all frames, and with or without topological outline removal, gave identical candidate results here. Production's three merges (leaked skin with leather or a brow band, bow wood with string) are shared by every detector.

Per item: exact materials, ramp count and merges with pixel counts. Inversions count shade-order inversions when every ramp that touches the steel gets the same swatch, which is what a user must do today when the steel is split.

| Item | Materials (labeled) | Production | spritesplit replay | Hybrid (as proposed) | Candidate (guarded hybrid) | Same-swatch inversions (production / hybrid / candidate) |
| --- | --- | --- | --- | --- | --- | --- |
| s2/base | clothes 18, skin 23 | 2/2 exact, 2 ramps | 0/2 exact, 15 ramps | 0/2 exact, 1 ramp, **merge** clothes:5298px+skin:4847px | 2/2 exact, 2 ramps |  |
| s2/vest_leather | leather 7 | 1/1 exact, 2 ramps | 0/1 exact, 2 ramps | 1/1 exact, 2 ramps | 1/1 exact, 2 ramps |  |
| s2/cape_red | cloth 6 | 1/1 exact, 2 ramps | 0/1 exact, 3 ramps | 1/1 exact, 2 ramps | 1/1 exact, 2 ramps |  |
| s2/hair_brown | hair 4 | 1/1 exact, 1 ramp | 0/1 exact, 2 ramps | 1/1 exact, 1 ramp | 1/1 exact, 1 ramp |  |
| s2/helmet_steel | steel 5 | 1/1 exact, 1 ramp | 0/1 exact, 2 ramps | 1/1 exact, 1 ramp | 1/1 exact, 1 ramp | 0 / 0 / 0 |
| s2/hat_wizard | cloth 3, band 2 | 2/2 exact, 3 ramps | 2/2 exact, 2 ramps | 2/2 exact, 2 ramps | 2/2 exact, 3 ramps |  |
| s2/sword_steel | blade 5, guard 1 | 2/2 exact, 2 ramps | 0/2 exact, 3 ramps, **merge** blade:318px+guard:60px | 0/2 exact, 1 ramp, **merge** blade:1401px+guard:60px | 2/2 exact, 2 ramps | 0 / 0 / 0 |
| s1/chest_leather | leather 3, skin 9 | 0/2 exact, 2 ramps, **merge** leather:964px+skin:363px | 0/2 exact, 5 ramps, **merge** leather:520px+skin:345px | 0/2 exact, 2 ramps, **merge** leather:964px+skin:363px | 0/2 exact, 2 ramps, **merge** leather:964px+skin:363px |  |
| s1/helmet_iron | steel 12, band 1, skin 10 | 0/3 exact, 4 ramps, **merge** band:8px+skin:41px | 1/3 exact, 14 ramps, **merge** steel:66px+skin:9px | 0/3 exact, 2 ramps, **merge** steel:932px+skin:17px; band:8px+skin:41px | 1/3 exact, 3 ramps, **merge** band:8px+skin:41px | 11 / 0 / 0 |
| s1/sword_steel | steel 8, skin 10 | 0/2 exact, 4 ramps | 0/2 exact, 9 ramps, **merge** steel:9px+skin:2px | 0/2 exact, 2 ramps, **merge** steel:678px+skin:11px | 1/2 exact, 3 ramps | 7 / 0 / 0 |
| bench/a-helmet | steel 6 | 1/1 exact, 1 ramp | 0/1 exact, 3 ramps | 1/1 exact, 1 ramp | 1/1 exact, 1 ramp | 0 / 0 / 0 |
| bench/a-cape | cloth 10 | 1/1 exact, 2 ramps | 0/1 exact, 5 ramps | 1/1 exact, 2 ramps | 1/1 exact, 2 ramps |  |
| bench/a-chest | leather 7 | 1/1 exact, 1 ramp | 0/1 exact, 2 ramps | 1/1 exact, 1 ramp | 1/1 exact, 1 ramp |  |
| bench/a-boots | leather 8 | 1/1 exact, 1 ramp | 0/1 exact, 2 ramps | 1/1 exact, 1 ramp | 1/1 exact, 1 ramp |  |
| bench/a-hair | hair 5 | 0/1 exact, 2 ramps | 0/1 exact, 3 ramps | 0/1 exact, 2 ramps | 0/1 exact, 2 ramps |  |
| bench/a-sword96 | steel 13, gold 20 | 2/2 exact, 2 ramps | 0/2 exact, 11 ramps | 2/2 exact, 2 ramps | 2/2 exact, 2 ramps | 0 / 0 / 0 |
| bench/a-axe96 | steel 10, wood 4 | 2/2 exact, 2 ramps | 2/2 exact, 5 ramps | 2/2 exact, 2 ramps | 2/2 exact, 2 ramps | 0 / 0 / 0 |
| bench/a-jester-blue | pink 5, green 5, bells 3 | 3/3 exact, 3 ramps | 2/3 exact, 6 ramps | 3/3 exact, 3 ramps | 3/3 exact, 3 ramps |  |
| bench/b-tunic | cloth 5, trim 6 | 1/2 exact, 3 ramps | 1/2 exact, 3 ramps | 1/2 exact, 3 ramps | 1/2 exact, 3 ramps |  |
| bench/b-cloak | cloth 8 | 1/1 exact, 2 ramps | 0/1 exact, 6 ramps | 1/1 exact, 2 ramps | 1/1 exact, 2 ramps |  |
| bench/b-greathelm | steel 17 | 1/1 exact, 1 ramp | 1/1 exact, 2 ramps | 1/1 exact, 1 ramp | 1/1 exact, 1 ramp | 0 / 0 / 0 |
| bench/b-jester-blue | pink 6, green 4, bells 5 | 2/3 exact, 4 ramps | 2/3 exact, 5 ramps | 3/3 exact, 3 ramps | 3/3 exact, 3 ramps |  |
| bench/n-cloak128 | cloth 16 | 1/1 exact, 2 ramps | 0/1 exact, 4 ramps | 1/1 exact, 2 ramps | 1/1 exact, 2 ramps |  |
| bench/c-greathelm | steel 14 | 1/1 exact, 1 ramp | 1/1 exact, 3 ramps | 1/1 exact, 1 ramp | 1/1 exact, 1 ramp | 0 / 0 / 0 |
| bench/a-bow96 (low confidence) | wood 12, string 8 | 0/2 exact, 3 ramps, **merge** wood:2817px+string:387px | 0/2 exact, 8 ramps, **merge** wood:1123px+string:154px | 0/2 exact, 3 ramps, **merge** wood:2817px+string:387px | 0/2 exact, 3 ramps, **merge** wood:2817px+string:387px |  |
| bench/a-plume-azure | steel 4, leaves 3, feathers 5 | 3/3 exact, 3 ramps | 2/3 exact, 6 ramps | 3/3 exact, 3 ramps | 3/3 exact, 3 ramps | 0 / 0 / 0 |
| bench/a-stripes-azure | green 6, purple 5 | 2/2 exact, 2 ramps | 0/2 exact, 9 ramps | 2/2 exact, 2 ramps | 2/2 exact, 2 ramps |  |

Ramp counts include production's separate tinted-outline ramp (vest, capes, cloaks), which is restricted away before scoring.

Findings:

1. **No wide gray over-split on PixelDoll output.** Every uniform gray (helmets, great helms, demo clothes) is one production ramp. Production's real splits are **hue-shifted** ramps: S1 bluish dark steel (chroma 0.036 to 0.039) against neutral highlights, jester bells (brown to yellow), and tunic trim (tan to yellow, which no detector fixes).
2. **The LPC over-split has the same cause, not lightness span.** LPC's white cloth palette rotates hue across its shades at chroma 0.026 to 0.041. `feat` places each shade at a different hue angle, and `autoRamps` returns four groups for that palette alone, while LPC gray (uniform hue) stays one group. [synthetic.ts](scripts/dye/synthetic.ts) reproduces both with generated colors.
3. **The unguarded hybrid merges materials through highlights.** Mutual-best chains link a skin highlight to a white steel highlight (S1 helmet and sword), a skin highlight to light clothes (demo body) and the gold guard to a light blade shade (demo sword). LPC's multi-material check (1 of 19 mixed) underestimated this.
4. **Outline handling.** Production excludes neutral darks and keeps tinted contours as their own ramp (named "Outline" when dark); the hybrid variants leave this unchanged (42 labeled outline colors in ramps for production and every hybrid). spritesplit's topological outline removal does not help on PixelDoll items and costs LPC cloth (19 against 39 exact without it). Production's fixed neutral-dark cut also drops a real dark hair shade (`bench/a-hair` `#2c1d14`, L 0.247), which no merge can fix.

## 4. LPC regression and downstream checks

[lpc.ts](scripts/dye/lpc.ts) reproduces the ecosystem replay exactly for production (74 of 331, Jaccard 0.678, policy-neutral 99) and for the hybrid (100, 0.809, 199).

| Detector | Exact (331) | Policy-neutral exact | Cloth exact (125) | Hair exact (121) | Multi-material items mixed (19) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production | 74 | 99 | 6 | 50 | 0 |
| Hybrid as proposed | 100 | 199 | 18 | 64 | 1 |
| Hue guard 30 degrees | 74 | 99 | 6 | 50 | 0 |
| Candidate with outline removal | 87 | 176 | 19 | 50 | 0 |
| **Candidate, no outline removal** | **107** | **200** | **39** | 50 | **0** |

The candidate gives up the hybrid's LPC hair gains (chromatic hair groups more than 40 degrees apart).

Downstream on PixelDoll items:

- `variantRamp` shade inversions fall from 11 and 7 to 0 on the two split S1 steels.
- All seven demo items get identical ramps under the candidate, so the demo's Studio state, names and tests are unaffected.
- `itemPaletteMatcher` (Match colors) becomes **refused** on `s1/helmet_iron` and `s1/sword_steel`, where production accepts it, because the merged steel ramp includes shades above its 0.035 chroma limit.
- Dye correction is unchanged by construction (same owned color union).

## 5. Smallest production change, if a held-out set confirms it

- [palette.ts:84](../../../app/src/lib/dress/palette.ts) `autoRamps(counts, claimed?, minDist?, views?: Img[])`: after choosing k, union groups linked by a mutual-best step between touching colors in `views` (cost `(dL/0.4)^2 + dab^2/0.01`, dL from 0.02 to 0.4, dab^2 at most 0.01, as in spritesplit), allowed only between two groups whose mean chroma is below 0.045, or two chromatic groups within 40 degrees of hue. No outline pass. About 30 lines; `chains`, `hybrid` and `neutralFamily` in [detectors.ts](scripts/dye/detectors.ts) are the reference.
- [dress.ts:65, :71, :75](../../../app/src/lib/dress/dress.ts): keep `itemImgs(p, it)` in a variable and pass it as `views`. [design.ts:54-56](../../../app/src/lib/equipment/design.ts): pass the same images.
- Decide before shipping: the neutral limit in [item-palette.ts:57-64](../../../app/src/lib/dress/item-palette.ts) (0.035) against the merge limit (0.045), or Match colors regresses on merged steels.

Regression tests (palette selftest or a unit test, generated colors only, no corpus pixels): a hue-shifted near-white ramp becomes one ramp; a uniform gray from L 0.33 to 0.98 stays one; a neutral blade touching a gold guard stays two; gray clothes touching skin never share a ramp; the existing "2 hue families" selftest holds; the demo fixture's derived materials stay identical. Corpus checks: `compare.ts` adds no cross-material merge and `lpc.ts` keeps 0 of 19 mixed.

## What would disprove it

- Any new cross-material merge on held-out PixelLab items (generated by the current pipeline and labeled blind, as here), especially trim with cloth, gold with steel, or skin with gray.
- No production split of a single material in held-out PixelLab output. The change would then only serve LPC-style hue-shifted art and would not earn its code.
- The two thresholds (0.045 chroma, 40 degrees) needing retuning on the held-out set.

## Limits

Labels are one annotator's judgment; outline versus darkest-shade calls were scored as "don't care" to keep them out of the comparison. Fourteen multi-material items is a small precision sample. Two of the three candidate gains are on old S1 fixtures with leaked skin. Scripts ran on Node 25.0.0 (the project pins 24.22.1).

Reproduce from the repository root: `node docs/research/2026-11-07-paperdoll-cycle/scripts/dye/<render|compare|lpc|synthetic>.ts`.
