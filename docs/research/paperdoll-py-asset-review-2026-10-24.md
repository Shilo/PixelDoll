# External paperdoll pipeline review (paperdoll.py + "PixelLab pipeline" PDF)

Date: 2026-10-24. Main agent plus two reviewer subagents (an independent review, then a challenger), argued to agreement.
No PixelLab calls, 0 generations. Inputs: `paperdoll.py` (diff-based layer extractor; needs Pillow, numpy **and scipy**)
and a one-page pipeline PDF (Pro Flash 96 px iso base, one `create-character-state` per armor piece, diff extraction,
budgets). The live OpenAPI (`/v2/openapi.json`) matched `docs/research/pixellab/pixellab-openapi-v2.json` for every path and
for the params of the endpoints compared.

Scope rule (owner): judge ideas by technical merit and output quality, not by the current model allow-list.

## Verdict

The assets describe the route PixelDoll tested and retired in S1/S2: generate the item on the skin body, then diff. Every
filter in the script (region, drift, palette key, spur, thin, split-y, key-tol-low, key-max-sum) patches body pixels that the
generation recolored. Our chroma mannequin + raw skeleton-v3 posing avoids that by construction. Nothing is ported wholesale.
One idea shipped (keyframe-backed head overflow), one was tested and reverted (palette key), and three spikes are proposed
(`target_palette`, concept-image dressing, state as a dress step).

## Shipped

**Head items keep a coif, aventail or hood mantle that the design has.** Posed head items used to lose every px below the
head band. Now:

- detached components below the band are still trimmed at extraction (B7 smears/props);
- px joined to the item above the band are kept for `postProcess`, which keeps them only where the **aligned, undilated dressed
  keyframe** has them (no temporal consensus: repeated slash streaks would win it; no 2 px dilation: it would grow skirts);
- cells the keyframe cannot judge (no keyframe for the direction, aligned overlap < 50 %, or a slot without the keyframe trim)
  get the old band trim, so the old behavior is the floor.

Code: `app/src/lib/items/items.ts` (`extractCell` sets `CellOut.clipY`; `trimToKeyframe` judges below it; `clipFloor` in
`postProcess`). Tests: `app/test/unit/head-overflow.test.ts` (detached trim, mantle kept, no dilation below the band, no
consensus rescue, floor without keyframe and for non-band slots). Every posed, clipped `extractCell` caller reaches
`postProcess` (`items/run.ts` main, replace-move and regrid paths; `equipment/generate.ts`). Verification: `npm run check`
clean, `npm test` 781 passed, `npm run build` with a clean dist guard. No end-to-end spec covers this path.

An earlier version only warned ("Head overflow: …") and still trimmed. The challenger showed it was noisy (one row of a hood
turned every pass into warn, per-clip copies were not deduplicated, the px were still counted as strays) and fixed the symptom,
not the cause. Replaced by the design above.

## Tested and reverted: palette key on the diff fallback

The script's best idea is a palette key: keep a changed px only if its color is near the item's own colors. We implemented it on
`diffLayer` (body px only, key from the item's colors on empty canvas, a 50 % guard) and reverted it.

| Real S1 edit-animation-v2 drift (S2 X3 method c; 16 cells per item) | F1 without key | F1 with key | FP / FN per cell, with key |
|---|---|---|---|
| all | 0.963 | 0.954 | 4.4 / 11.8 (was 8.6 / 5.1) |
| helmet | 0.971 | 0.994 | 0.8 / 0.9 |
| cape | 0.971 | 0.983 | 11.6 / 0.7 |
| sword | 0.968 | 0.976 | 4.2 / 1.1 |
| chest | 0.902 | **0.840** | 4.4 / 41.8 |
| boots | 0.994 | **0.942** | 1.0 / 14.9 |

Why it fails: on body-hugging items the px on empty canvas are mostly outline, so the key deletes the shading ramp (fixture vest:
3038 px on the body, 166 off it; 68 % of on-body px are 106–332 L1 from every off-body color). The guard ran per cell, so it
also flickered between frames and could flip the item-level `novel_cc`/`novel2` choice. Gating to head/back/held slots was
considered and rejected: n = 16 cells per item from one drift source, held items were measured with a tight region while
production gives them the whole padded canvas, and the diff route is rare and always human-reviewed (`warn`). Re-test with
`real.ts` if a real diff-route item shows body leaks.

**Benchmark lesson.** The first synthetic benchmark (same-sign drift on all channels, oracle bbox) showed a gain (F1 0.977 →
0.985) that real drift reversed. Drawing the drift per channel instead drops our baseline from 0.977 to 0.853, 15× the claimed
gain; a full-width region instead of the bbox drops the sword from 0.964 to 0.830. Use real stored drift and production regions.
Synthetic results, including "our `diffLayer` beats paperdoll.py" (0.977 vs 0.961 best), are stress tests only;
paperdoll.py was not scored on the real-drift composites.

## Why `create-character-state` is less reliable for unchanged body pixels

Measured on the v0.1.0 S1 evidence (`e4_state`): the state **kept the geometry** (0 base px lost in all four views, new px only
in the helmet rows, lower-body alpha IoU 1.000, no shift) but **recolored the body**: 669 of ~900 body px changed on south, 25 %
of shared px by more than Δ18. Animating the state with the same template left 815–891 px per frame different from the base walk.
The PDF's notes say a body-change flag "did not clear after 35 generations". Reasons:

1. **No preservation input.** The request is `character_id` + `edit_description` (+ palette and canvas options): no mask, no
   protected region, no frame input. Nothing tells the model which colors to keep. `inpaint-v3`'s mask keeps 99.5 % of px
   outside it exact [S1].
2. **It re-renders every rotation into a new character** ("applies a text edit to an existing character's rotations and saves
   the result as a new character"): the silhouette survives, the shading does not.
3. **Its options act on every pixel.** `use_color_palette_from_reference` and `target_palette` snap all colors including the
   body; `override_frame_size` re-canvases the character with undocumented placement.
4. **Animations are not carried over.** Re-animating the state is a new render, aligned at pose level only.
5. **A diff turns every recolored body px into a false item px**, hence the script's stack of hand-tuned filters.

Our dress call (`edit-animation-v2`) also recolors (0 % exact, 78 % within Δ18), but on a chroma mannequin the body only has to
stay key-colored: G2 key-kept and G3 key-outside measure exactly that. Because the state's geometry held, the state is still a
candidate **dress step** on a key mannequin (spike below).

### Pros and cons

| | `create-character-state` | `edit-animation-v2` on chroma views (current dress) | `transfer-outfit-v2` | diff on skin (assets) |
|---|---|---|---|---|
| Body px | geometry kept, colors ≈ 74 % changed (skin base) | no px exact; key kept 97.6–99.9 % | 0 identical px; key mostly kept | must be identical; they aren't |
| Design across directions | one job, all 4/8 rotations | one call per ≤ 16/9/4 frames; later chunks anchored (palette distance ~10) | one call per ≤ 15/8/3 frames | per state |
| Input | character id + text | frames + text | **reference image** + frames + text | — |
| Cost | 10 gens measured at 64 px; MCP says 10–25; 96 px unmeasured | 10/15/25 by size | 10/15/25 by size | free locally |
| Output | new character in the user's library (rotations only) | frames | frames, motion kept | layer |
| Main risk | key survival, placement under `override_frame_size`, library clutter | handedness drift on actions | design drift across calls (palette distance 34 vs 10), sword shape CV 0.27–0.39, one olive outline | body leakage, hand tuning |

## `transfer-outfit-v2`: why it was "banned", and the change

It was never banned for a quality or safety reason. S2 X4 compared it with anchor-cell `edit-animation-v2` for one job, keeping
an item identical across later clips with the dressed cell 0 as the reference. It lost: palette distance 34 vs 10 (helmet), 29 vs
20 (sword); the sword changed shape and hand mid-clip (area CV 0.27–0.39 vs 0.04); one run redrew the mannequin outline olive.
Skeleton posing then removed per-clip dressing, and the architecture table filed it as "banned / superseded". The code kept using
it for fitted equipment copies (`equipment/generate.ts`).

Change: allowed in `AGENTS.md` and `architecture.md` §2 for reference-image dressing; concept-image items are experimental
until the spike below passes. The S2 evidence is about the reference role itself, which is why the spike has a control arm.

## Concept-image items (agreed design)

> **Tested 2026-10-25** ([campaign](generation-quality-campaign-2026-10-25.md), arm E4): `transfer-outfit-v2` beat the anchored
> dress, and the raw concept did at least as well as the local paste-up, so the paste-up step below is dropped (provisional).

The concept replaces only the dress step. Posing, extraction, H4 and the keyframe trim run unchanged.

1. **Local prep (0 gens):** remove the background and crop the item (the user confirms; no crop, no item); scale it to the slot
   from the rest keypoints (nearest or mode downsampling); quantize to ≤ 16 colors (the concept palette); paste it onto the south
   chroma rest view. The paste-up turns any concept into "the same character in the new outfit", the reference form the MCP guide
   asks for, and normalizes a foreign character or art style.
2. **One dress call:** every drawn chroma rest view as frames (≤ 15 at 64 px; anchored chunks above), reference = the paste-up,
   `target_palette` = key ramp + concept palette, the instruction template of `equipment/generate.ts`.
3. **Gates:** G2, G3, G4, D1, plus concept fidelity on the palette, both ways: layer → concept mean nearest-color distance ≤ 12
   (foreign colors) and concept → layer area-weighted coverage (the main concept colors must appear: catches "changes almost
   nothing"). Shape: only an area check against the paste-up (0.5–2×, warning). IoU against the hand-placed paste-up was rejected
   as noise. Views the concept does not show (back, sides) need the user's approval before posing.

**Spike (~60 gens).** Phase 0 (0 gens): the paste-up tool and metrics, calibrated with a stored S2 helmet keyframe as the concept
(known answer). Phase 1: 4-direction 64 px rest views, concept A (same style) and B (foreign character and style), one call per
arm: raw concept, paste-up, paste-up + `target_palette`, and the control (paste-up as the anchor cell of today's anchored
`edit-animation-v2` dress). Measure G2/G3, palette distance, cross-direction consistency, refusals and a human fidelity score.
**Kill rule:** if the control matches the transfer arms, ship the paste-up with anchored `edit-animation-v2` and add no
transfer-outfit path.

## Other spikes

> **Outcome 2026-10-25** ([campaign](generation-quality-campaign-2026-10-25.md)): `target_palette` on the dress was cut (it caps every
> pixel, key colors included); the state-as-dress spike was cut (no 8-direction body in scope).

- **`target_palette` on dress and pose calls** (first to fund for existing items). It is typed in `routes.ts` but never sent by
  item code. S1: exact body px rose from 0 % to 25.6 % (`edit-animation-v2`) and 34.2 % (`transfer-outfit-v2`). Key ramp +
  design palette should cut G6 palette drift between calls directly.
- **State as a dress step**, only for 96 px held items on 8-direction rigs (at 64 px it costs the same as today's dress call).
  The geometry risk is cleared offline. Import the chroma rest views (0.25 gen), one state with
  `use_color_palette_from_reference: false` (otherwise the item is snapped to green) and `override_frame_size`; pass if G2
  ≥ 0.97, G3 within limits, `bestShift` = (0,0) on every view and held placement = +16,+16. Kill risks: the key is lost or
  "humanized", the API refuses a state of an imported character, unknown cost at 96 px, two extra characters per item in the
  user's PixelLab library.

## Technique-by-technique

| Asset technique | PixelDoll | Verdict |
|---|---|---|
| Pro Flash base, 96 px, 8 drawn directions | v3 default; S4: Pro Flash bodies come out chibi, 52/56 px canvas per direction, ~3× cost, rejects `no_background` | ours better for adult proportions |
| `create-character-state` per piece → diff | chroma mannequin dress → pose → key extraction | ours better as a layer route; state may help as a dress step |
| Alpha-aware diff + tolerance | `diffLayer` (S1 auto + skin rejection + pinhole fill), fallback only | ours ahead on synthetic drift only |
| Drift drop | not needed on the key body; G2 catches redraws | not useful for us |
| Speck floor = 2 % of changed area | ≥ 2 px (chroma), ≥ max(4, 15 % of largest) posed | theirs can drop real small parts |
| Region clip + joined overflow test | band trim | **adopted**, decided by the keyframe instead of item color |
| Palette key from the item's own still layer | none | tested on real drift, **reverted** (body-hugging items lose shading) |
| Spur filter | `majorComponents` + `attachHeld` | ours better |
| Thin filter (2×2 block) | none | harmful (−14 % recall on synthetic) |
| split-y / key-tol-low / key-max-sum | none | per-item hand tuning; casual users can't use it |
| `--match` palette snap | `normalizeItemPalette` with a distance limit, refuses ties | ours better (theirs has no limit and hides leaks) |
| Round-trip check | layer over the real base + G2/G3/registration gates | theirs excludes every dropped px and is skipped with `--match` |
| `align()` brute-force offset | fixed pad rule, ±1 px `bestShift` | ours better (their score is biased by the item silhouette) |
| Binary alpha at 128; same canvas, one pivot; prompts name the item only | same | equal |
| Weapon + hand as one layer, front/behind table | real base hand shows through; per-pixel fg/bg + `zOverrides` | ours better (a baked hand won't match the base pose) |
| "Hidden pixels are not recoverable" | north views give the full cape | wrong (S1 E5 two-pass recovered 667 cape px) |
| skeleton-v3 for base and item | raw v3 with the same stored keypoints (IoU 0.988) | ours better |
| 24 gens per clip per item; bake the attack per weapon | 3 gens per clip-direction, mirrored views 8 → 5 | theirs ignores mirroring; baking breaks paper dolling |
| Review at 3×/6×, "a passed gate is not a good layer", stop chasing a flag | review warnings, `MAX_REROLLS = 2`, fewest-fail roll kept | equal (good discipline) |

## Asset defects

- The handoff says Pillow + numpy; the script also imports scipy (`ndimage`).
- `--region` without `--clip` fails on any outside px.
- The overflow test ignores px with RGB sum ≤ 180 (`paperdoll.py:96`): blind on black, dark steel and dark leather items.
- `key_max_sum` drops bright item colors (gold, white) together with skin; `MIN_KEPT` lets cleanup silently remove 30 %.
- Drift values are per-base magic numbers (30 iso, 90 chibi).

## Open weaknesses in PixelDoll

1. **Held pommel/crossguard may be dropped before the wrist rule.** `extractCell` runs `majorComponents` per cell before
   `postProcess → attachHeld`, whose "blade split by the fist" keep only sees survivors (a 6 px pommel beside a 50 px blade is
   12 %, under the 15 % floor). Unverified on real frames: the S5 fixture stores only extracted layers.
2. **Long front hair lands in bg** by the silhouette split (`compose/split.ts`, hair bgZ 3), so hair in front of the shoulders in
   south could sit under shoulder armor. Unverified.

## How the reviews changed the conclusions

| Claim | First position | After challenge |
|---|---|---|
| Palette key | adopt (synthetic F1 +0.008) | revert (real drift F1 −0.009; chest −0.062) |
| Head overflow | warn and trim | keep only keyframe-supported px; band trim as the floor |
| State body change | "whole body redrawn, may re-center" | geometry kept, colors redrawn; re-centering only a risk under `override_frame_size` |
| State saves gens | "10 vs 30 for held items" | unsourced; 96 px cost unmeasured |
| Missed improvement | — | `target_palette` is never sent by item code |
