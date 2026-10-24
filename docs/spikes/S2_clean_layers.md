# S2: Clean, consistent paperdoll layers (live spike)

Date: 2026-10-20/21. Agent: S2. Spend: **348 generations** (balance 4698.5 → 4350.5). Code: `spikes/api/` (new scripts
`s2_*.mjs`, new browser-portable libs `lib/chroma.mjs` and `lib/clean.mjs`). Outputs: `spikes/api/out/s2_*/`. Every Pro call's
cost is in `out/s2_x1|s2_x2|s2_x4/costs.jsonl`, and the request/response log (base64 stripped, no key) is in `calls.jsonl`.

## Verdict

**The chroma mannequin solves the clean-layer problem.** Recolor the frozen base cells to a key-color ramp, then let
`edit-animation-v2` dress the *key mannequin*. Item pixels are then "opaque and not key-colored", and the layer is drawn over the
**real** base cell.

PixelLab keeps the key. Across the 17 X1 calls (green and magenta keys), 97.6–99.9 % of mannequin pixels stayed key-colored, ≤0.4 % were erased, and the
silhouette did not move (≤1.3 % of key pixels fell outside the base alpha).

The resulting layers contain **no face, skin or arm pixels by construction**:

- helmet, chest and boots: 0 specks and 0 pinholes over 8 frames per direction;
- S1's extractor on the same items: 11–38 pinholes, plus skin slivers and a baked-in face.

The cost is the same as S1: **10 generations per ≤16 cells**.

Here is what I did not get: a better diff on skin composites (X3 gains +0.009 F1, and arm slivers stay), and two-pass removal
as a main route (X2 output is clean but un-occluded, and it costs twice as much).

Showcases:

- [`out/s2_x1/stack_sheet.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x1/stack_sheet.png): S1 base, five independent chroma layers stacked,
  walk south and east.
- [`out/s2_x4/showcase48_sheet.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/showcase48_sheet.png): new clothed base; cape, helmet and sword
  on walk south, east and north, and on a cross-punch.

## Setup

- **Base for X1–X3:** S1's frozen 64×64 walk (`out/e2_anim/walk_{south,east}_{0..7}.png`) and S1's skeletons.
- **Base for X4:** two new clothed bases, made with `create-character-v3`, seed 4321, the prompt "plain grey t-shirt and plain grey
  shorts, bald, barefoot…", 2 generations each.
  - `b64` is 64 px, with "small character … plenty of empty space above the head" added to the prompt. Its rotations have
    5–8 px headroom, but its walk frames still have only 6–7 px.
  - `b48` is 48 px, padded to 64 by translating x+8 and y+16. It is never rescaled. Walk frames have 18–20 px headroom.
  - Sheets: [`b64_sheet`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_base/b64_sheet.png), [`b48_sheet`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_base/b48_sheet.png),
    [`b64walk`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_base/b64walk_sheet.png), [`b48walk`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_base/b48walk_sheet.png).
- **Template animations** (`walking-8-frames`; `cross-punch` = 6 frames): the clothed base passed all of them. There was no
  content-policy refusal anywhere in S2.
- **Live template list.** For a `mannequin` character, a 422 on a real character id lists the set below. **There is no `attack`
  or slash template for humanoids.** `attack*` appears only in the global, truncated list, which is for other body templates.
  - backflip, breathing-idle, cross-punch, crouched-walking, crouching, drinking, falling-back-death,
    fight-stance-idle-8-frames, fireball, flying-kick, front-flip, getting-up, high-kick, hurricane-kick
  - jumping-1/2, lead-jab, leg-sweep, picking-up, pull-heavy-object, pushing, roundhouse-kick
  - running-4/6/8-frames, running-jump, running-slide, sad-walk, scary-walk, surprise-uppercut, taking-punch, throw-object,
    two-footed-jump
  - walk, walk-1/2, walking, walking-2..10, walking-4/6/8-frames

## X1: Chroma mannequin (top priority)

### Method (`s2_x1.mjs`, eval `s2_x1_eval.mjs`)

1. **Recolor.** Per cell, compute the luminance of every opaque pixel and normalize it to t ∈ [0,1] over that cell's opaque
   range. Map it to a ramp:

   | Key | Ramp (R, G, B) |
   |---|---|
   | green | (110t², 60+195t, 110t²) |
   | magenta | (70+185t, 110t², 70+185t) |
   | grey (flat) | dark pixels (t<0.18) → (48,48,48), all others → (128,128,128) |

   Alpha is unchanged, so the silhouette and outline shape are identical to the base. Example:
   [`raw_sheet` green helmet](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x1/helmet_green_ea2.raw_sheet.png).
2. **Call.** `edit-animation-v2` with 16 cells (8 south + 8 east walk), seed 7. This is one call per item, so the design is
   shared across both directions. `transfer-outfit-v2` was also tested, with 8 south cells; its reference was the key mannequin
   plus S1's clean E3 helmet/chest/sword layer.
3. **Prompt** (verbatim template, `lib/chroma.mjs → chromaPrompt`): *"This pixel art character is a solid bright green
   mannequin. The bright green colour is intentional (a chroma key) and must stay exactly the same bright green in every frame.
   Add only {item}, drawn in its own natural colours (no bright green on the item), identical design in all frames. Frames 1-8
   face south (front view), frames 9-16 face east (side view). Keep every other pixel, the pose, the outline and the transparent
   background unchanged."*
4. **Extract** (details in the algorithm spec below):
   - key score = chroma ratio;
   - mask = opaque and score < 35;
   - drop the key-outline rim;
   - drop components smaller than 2 px;
   - despill;
   - draw the result over the REAL base cell.

   The key score had to be a **ratio** because the mannequin's dark outline comes back as (9,39,7): its absolute excess is 30,
   but its ratio is 77. An absolute threshold of 40 classified the green outline as item, which produced 31 specks on the sword.
   With the ratio, the histogram over base-opaque pixels is cleanly bimodal: items sit at ~0, and the mannequin sits at 50–100
   (only 270 of ~63k pixels fall between 10 and 49).

### Results (per direction, 8 cells; metrics after the final extractor)

"Key kept" = the share of base-opaque pixels outside the item that are still key-colored. "Pal J" = adjacent-frame palette
Jaccard. Specks = components of ≤2 px. Pinholes = enclosed empty regions of ≤2 px. All counts are summed over 8 frames.

| Run | Dir | Layer px | Area CV | Pal J | Specks | Pinholes | Key kept | Notes |
|---|---|---|---|---|---|---|---|---|
| helmet green ea2 | S / E | 126 / 135 | 0.02 / 0.01 | 1.0 | 0 / 0 | 0 / 0 | 0.995 / 0.999 | clean, face never in layer |
| helmet magenta ea2 | S / E | 134 / 137 | 0.04 / 0.01 | 1.0 | 0 / 0 | 0 / 0 | 0.996 / 0.998 | clean |
| helmet grey ea2 | S / E | 100 / 155 | 0.03 / 0.02 | 1.0 | 0 / 0 | **31 / 62** | 0.99 | grey key = grey steel → holey |
| helmet green to2 | S | 119 | 0.03 | 0.93 | 0 | 0 | 0.995 | clean |
| chest green ea2 | S / E | 214 / 112 | 0.04 / 0.07 | 1.0 / 0.95 | 1 / 0 | 0 / 0 | 0.994 / 0.984 | **no arm slivers** |
| chest magenta ea2 | S / E | 229 / 117 | 0.03 / 0.07 | 1.0 | 0 / 0 | 0 / 0 | 0.997 / 0.991 | clean |
| chest grey ea2 | S / E | 213 / 102 | 0.01 / 0.09 | 0.95 | 0 / 0 | 0 / 1 | 0.995 | brown on grey is fine |
| chest green to2 | S | 252 | 0.03 | 0.99 | 0 | 0 | 0.997 | clean |
| boots green ea2 | S / E | 141 / 148 | 0.06 / 0.11 | 1.0 | 0 / 0 | 0 / 0 | 0.991 / 0.994 | clean |
| boots magenta ea2 | S / E | 129 / 134 | 0.06 / 0.12 | 1.0 | 0 / 0 | 0 / 0 | 0.993 / 0.997 | clean |
| cape green ea2 | S / E | 359 / 364 | 0.09 / 0.04 | 0.93 | 2 / 1 | 0 / 0 | 0.993 / 0.976 | clean, pre-occluded by the body |
| cape magenta ea2 | S / E | 324 / 351 | 0.03 / 0.05 | 1.0 | 2 / 1 | **17 / 31** | 0.99 | red vs magenta: spill 0.3, holes |
| sword green ea2 | S / E | 121 / 95 | 0.01 / 0.07 | 1.0 / 0.95 | 5 / 1 | 1 / 2 | 0.995 / 0.99 | clean; specks are hilt bits split by the hand |
| sword green to2 | S | 124 | 0.05 | 0.84 | 4 | 9 | 0.994 | ok |
| sword magenta ea2 | S / E | 69 / 41 | 0.09 / **0.55** | 0.86 / 0.7 | 6 / 2 | 0 | 0.995 | east: the sword jumps hands and is missing on frame 7 (generation variance) |
| *S1 helmet S ea2 (S1 extractor)* | S | 122 | 0.08 | 0.74 | 1 | **11** | — | redrawn eyes and face in the layer |
| *S1 helmet E ea2* | E | 118 | 0.01 | 0.85 | 0 | **23** | — | |
| *S1 chest S ea2 / to2* | S | 228 / 220 | 0.07 / 0.10 | 0.65 / 0.74 | 1 / 4 | **12 / 23** | — | skin slivers along the arms, frame 2 garbled |
| *S1 sword S to2* | S | 137 | 0.05 | 0.72 | 0 | 3 | — | swords were already fine in S1 |

Other measurements:

- **Silhouette drift:** key pixels outside the base alpha were 0.01–0.15 % for every green or magenta run, 1.3 % for the green
  sword and 2 % for gray.
- **Item color count:** chroma layers have 6–8 colors. S1 layers have 11–17, but those include body leakage.
  `edit-animation-v2` quantizes the whole grid to ~17–19 colors, and the key ramp uses ~5–8 of them.

Sheets, each row showing a layer and then the layer over the real base:

- [`overview/helmet`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_overview/helmet.png): green, magenta, grey, green-to2, then S1.
- [`overview/chest`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_overview/chest.png): same order. The last two rows are S1, with arm slivers.
- [`overview/boots_cape`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_overview/boots_cape.png).
- [`overview/sword`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_overview/sword.png).
- Per-run `out/s2_x1/*.final_sheet.png`, with rows real base / key composite / layer / base+layer.

Zooms:

- [`helmet_f0`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_zoom/helmet_f0.png): base / key composite / chroma layer / S1 layer.
- [`despill`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_zoom/despill.png): the olive edge on the vest disappears after despill.

### Visual judgement (read from the sheets)

- **Helmet, chest and boots on green or magenta are production-clean.** There are no face pixels, no skin specks and no
  arm slivers. Helmets are complete, and the face opening is genuinely empty. Pre-occlusion is correct: a swinging arm in the
  east view cuts the vest.
- **Cape on green is clean.** In the south view the layer contains only the parts visible beside the body, plus the shoulder
  straps. In the north view (X4) it contains the full back.
- **Sword on green is clean.** In the east view the hand correctly occludes the grip, which leaves 1–2 hilt fragments.
- **Gray key fails on gray items, and magenta fails on red items.** Pick the key far from the item hue.
- **Item quality:** the style matches S1 items (same 16-color quantization). Before despill, leather edges were olive, from
  green bounce light; after despill they are dark brown. Helmet interiors on magenta were purple; after despill they are gray.

## X2: Two-pass batch remove (`s2_x2.mjs`)

**Method.** `edit-animation-v2` received S1's dressed composites with the prompt "Remove the character completely … keep ONLY
the {item} … same position, size … transparent background. Draw the hidden parts…". The output was clamped to S1's slot and
drawn over the base. 3 calls, 30 generations.

| Item | Dir | Layer px | Area CV | Specks / pinholes | Out-of-slot px per frame | IoU vs S1 layer | Centroid shift vs S1 |
|---|---|---|---|---|---|---|---|
| helmet | S | 160 | 0.02 | 0 / 0 | 0 | 0.73 | ≤0.8 px |
| helmet | E | 131 | 0.02 | 0 / 4 | 58 (leg outlines left over, clamped) | 0.85 | ≤0.6 px |
| chest | S | 237 | 0.03 | 0 / 0 | 19 | 0.72 | ≤1.3 px |
| sword | S | 168 | 0.02 | 0 / 0 | 11.5 | 0.79 | 1–2 px |

Sheets: [`helmet_south`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x2/helmet_south.final_sheet.png),
[`helmet_east`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x2/helmet_east.final_sheet.png),
[`chest_south`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x2/chest_south.final_sheet.png). Zoom of X2 against X1 over the base:
[`x2_vs_x1`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_zoom/x2_vs_x1.png).

**Verdict.** The items are clean, consistent and in place, but they are **un-occluded full objects**:

- the helmet's face opening is filled solid black, so it covers the face;
- the vest is drawn over the arms and the sword over the hand;
- some east frames keep leg-outline leftovers.

It needs 2 calls (dress, then remove), which is 20 generations per 16 cells. **Use it only for back items whose hidden pixels
are needed.** Even there, the chroma north view already gives a full cape.

## X3: Better diff on skin composites (offline, free; `lib/clean.mjs`, `s2_x3*.mjs`)

**Variants tested:**

- ±1 px neighborhood-tolerant matching (`maskNbr`);
- body-palette rejection (all base colors, or skin-only colors with r−b>30);
- pinhole fill;
- outline growth;
- temporal consensus: votes in anchor-aligned coordinates, keep a pixel at ≥3 of 8 votes, fill one at ≥6 of 8 when it changed.

**Ground truths:**

- (a) S1's single-frame E6 set;
- (b) an 8-frame version: the E3 layer propagated by tracked offsets, plus real `edit-animation-v2` drift;
- (c) **a clean GT built from the chroma layers.** Because the chroma layers are item-shaped and contain no body pixels, they are
  an unbiased GT: 5 items × 16 cells, with real S1 `edit-animation-v2` body drift composited underneath.

| Variant | (a) F1 | (b) F1 | (c) P / R / F1 | (c) FP px per cell |
|---|---|---|---|---|
| S1 `slot_novel2_grow1` | **0.961** | 0.966 | 0.937 / 0.947 / 0.942 | 11.9 |
| S1 `auto` | 0.918 | 0.966 | 0.934 / 0.970 / 0.952 | 12.7 |
| **S1 `auto` + skin-only rejection (Δ≤10) + pinhole fill** | 0.925 | — | **0.951 / 0.970 / 0.961** | **9.2** |
| nbr ±1 + grow + fill | 0.899 | 0.940 | 0.814 / 0.917 / 0.862 | 38.8 |
| nbr ∧ novel2 + grow + fill | 0.921 | 0.965 | 0.945 / 0.912 / 0.928 | 9.9 |
| any of the above + temporal consensus | — | +0.001–0.006 | −0.01 to −0.02 (moving limbs) | — |

**Real S1 composites** ([`real_s1_skinrej_sheet`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x3/real_s1_skinrej_sheet.png)): skin rejection with
pinhole fill brings pinholes to 0 (helmet 11→0, chest 12–23→0). But **the arm slivers and the redrawn eyes stay.** Redrawn skin
is more than 10 levels from every base color, and widening the tolerance eats leather.

**Verdict:** local diffing has hit its ceiling at about 9–12 false body pixels per cell. Keep it only as the fallback for items
whose color matches both keys, using `auto` + skin-only rejection + pinhole fill.

## X4: Coverage on the clothed base (`s2_x4.mjs`)

All runs use the green key. The A, B and C runs below use the padded 48→64 base.

- **A runs:** `edit-animation-v2`, 16 cells = walk south + walk east.
- **B runs:** walk north (8) + cross-punch south (6) = 14 cells, as either:
  - `to2`: `transfer-outfit-v2` with reference = A's dressed cell 0; or
  - `ea2a` (**anchor-cell** `edit-animation-v2`): frame 1 = A's dressed cell 0, then 14 new key cells, and output 0 is dropped.
- **C run:** cross-punch east (6 cells), `to2`.

"Pal dist" is the mean distance from each layer color to the nearest color of the A call's layer (max-channel, 0 = identical
palette). It measures design lock across calls.

| Run | Cells | Layer px | Area CV | Specks / pinholes | Key kept | Top y | Pal dist to A |
|---|---|---|---|---|---|---|---|
| helmet A (b48) S / E | 8 / 8 | 122 / 133 | 0.01 / 0.02 | 0 / 1, 0 / 2 | 0.996 / 0.998 | 14 / 17 | — |
| helmet B to2 N / punch S | 8 / 6 | 140 / 145 | 0.02 / 0.02 | 0 / 0, 0 / 3 | 0.994 / 0.989 | 16 / 17 | **34 / 34** |
| **helmet B ea2a N / punch S** | 8 / 6 | 141 / 128 | 0.04 / 0.04 | 0 / 0, 0 / 0 | 0.998 / 0.997 | 15 / 16 | **10.3 / 8.6** |
| sword A S / E | 8 / 8 | 95 / 83 | 0.02 / 0.05 | 2 / 29\*, 1 / 22\* | 0.997 / 0.99 | — | — |
| sword B to2 N / punch S | 8 / 6 | 83 / 93 | 0.04 / **0.27** | — | 0.996 / 0.987 | — | 29 / 29 |
| **sword B ea2a N / punch S** | 8 / 6 | 96 / 94 | 0.02 / 0.04 | 0 / 25\*, 2 / 7 | 0.998 / 0.993 | — | 20 / 20 |
| sword C to2 punch E | 6 | 110 | **0.39** | 0 / 0 | 0.998 | — | 22 |
| cape A S / E | 8 / 8 | 290 / 355 | 0.07 / 0.05 | 3 / 0, 0 / 0 | 0.997 / 0.992 | — | — |
| cape B to2 N | 8 | **570** (full back) | 0.06 | 0 / 0 | 0.984 | — | 9.9 |
| cape B to2 punch S | 6 | 328 | 0.14 | **11** / 1 | **0.912** | — | 12.4 |

\* Sword "pinholes" are mostly real gaps: the hand occludes the grip, and the thin blade has 1-px gaps.

**Sheets:**

- [`helmet48_Ba`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/helmet48_Ba.final_sheet.png), [`helmet48_B` (to2)](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/helmet48_B.final_sheet.png),
  [`helmet_calls` zoom](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_zoom/helmet_calls.png) (design across calls).
- [`sword48_A`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/sword48_A.final_sheet.png), [`sword48_Ba`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/sword48_Ba.final_sheet.png),
  [`sword48_C`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/sword48_C.final_sheet.png).
- [`cape48_A`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/cape48_A.final_sheet.png), [`cape48_B`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/cape48_B.final_sheet.png).

**Findings:**

- **North works.** Helmet, cape and sword are all clean. The north cape is the full cape, so no two-pass is needed for back
  items in north views.
- **Non-walk clip (cross-punch, 6 frames).** Chroma extraction stays clean. Weak points:
  - **Handedness is not stable across clips.** The walk-south sword is in the right hand; in the punch clip it moves to the free
    left hand.
  - With `transfer-outfit-v2`, the punch sword changes shape and hand mid-clip (area CV 0.27–0.39).
  - The anchor-cell `edit-animation-v2` keeps the sword rigid and consistent (CV 0.04).
- **Cross-call design lock: anchor-cell `edit-animation-v2` beats `transfer-outfit-v2`.** Palette distance is 9–10 vs 34 on the
  helmet and 20 vs 29 on the sword. The helmet shape is visibly closer: `transfer-outfit-v2` changed the crest and cheek guards.
  The lock is still not pixel-identical.
- **One failure seen.** In `transfer-outfit-v2` punch frames (cape B), PixelLab redrew the **mannequin outline in olive
  (48,46,11)**, which is not key. The rim filter (`dropKeyOutline`) removes most of it, but olive bits remain on 3 of 6 frames.
  The QA gate catches it: key kept was 0.912 against a threshold of 0.97.
- **Headroom:**
  - The tall wizard hat on the 64 px base was **squashed** (bent, short cone) to fit 6 px of headroom, and it touches y=0 on one
    frame ([`wizardhat_A`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/wizardhat_A.final_sheet.png)).
  - On the padded 48→64 base the full tall hat fits with a 6 px margin
    ([`wizardhat48_A`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s2_x4/wizardhat48_A.final_sheet.png)).
  - Helmets fit both bases (top y 5–6 on the 64 base, 14–17 on the padded one).
  - **Prompting for a "small character" does not shrink the animation frames** (b64 walk headroom is 6–7 px, the same as S1).
    Generating smaller and padding does.
- **West.** I did not generate it. The rig contract mirrors east, which is a pure flip of base and layers with handedness caveats.

## X5: Winner per item class

| Class | Tested items | Winner | Key evidence |
|---|---|---|---|
| **Head** (helmet, hat; hair untested) | helmet ×6 runs, wizard hat ×2 | **Chroma green (or magenta) + `edit-animation-v2`, 16 cells** | 0 specks and 0 pinholes against S1's 11–23 pinholes plus a face in the layer; area CV ≤0.04; use the 48→64 padded base for tall hats |
| **Torso** (chest armour) | chest ×5 | **Chroma + `edit-animation-v2`** (`transfer-outfit-v2` was equal on south) | no arm slivers (S1 had them on every frame); pinholes 0 vs 12–23 |
| **Legs** (pants, skirts) | not tested directly | Chroma + `edit-animation-v2` (inferred from chest and boots, which share the same mechanics) | needs a test with long pants over the walk stride |
| **Feet** (boots) | boots ×2 | **Chroma + `edit-animation-v2`** | 0 specks and 0 pinholes, S and E |
| **Back** (cape) | cape ×5 | **Chroma green + `edit-animation-v2`.** North comes free from the north cells. X2 two-pass only when hidden pixels are needed in S/E views (it costs 2×) | magenta fails on red; north full cape, 570 px |
| **Held** (sword) | sword ×8 | **Chroma green + `edit-animation-v2`**, with a generous whole-cell slot. Further clips use the anchor-cell `edit-animation-v2`, not `transfer-outfit-v2` | clean extraction, but handedness and pose of the weapon in non-walk clips is a *generation* problem (see failures) |

The fallback for an item that collides with both keys (for example a green-and-magenta jester outfit) is the skin-base route with
S1 `auto` + skin-only rejection + pinhole fill (X3).

## Algorithm spec (for the app; reference implementation in `spikes/api/lib/chroma.mjs`, pure functions over `{w,h,d}`)

**Inputs:**

- Frozen base cells `B` (64×64 RGBA, binary alpha), with directions and clips.
- The item prompt and the item class.
- Optionally, per-cell skeleton keypoints for the slot bands (from `estimate-skeleton`, which is free).

**0. Rig.** Generate the base with `create-character-v3` at `image_size` 48 from text (2 generations). Use a clothed prompt:
grey t-shirt + grey shorts, bald, barefoot. Animate with templates at 48 px, then pad every frame to 64 (x+8, y+16) before
freezing. Never rescale. This gives 16–20 px of headroom. For 64 px detail when tall hats are not needed, the 64 base works
with 6–7 px headroom.

**1. Choose the key.** Default to `green`. Use `magenta` if the item's color words match
/green|emerald|lime|olive|jade|teal|mint|forest/. Never use `grey`. If QA fails twice, re-roll with the other key.

**2. Recolor (`toChroma`).**

- Per cell: luminance `L = 0.299R + 0.587G + 0.114B` over the opaque pixels.
- Normalize: `t = (L − Lmin) / (Lmax − Lmin)`.
- Green: `(round(110t²), round(60 + 195t), round(110t²))`.
- Magenta: `(round(70 + 185t), round(110t²), round(70 + 185t))`.
- Alpha is unchanged.

**3. Generate.**

- **Design call.** `POST /edit-animation-v2` with:
  - `frames`: ≤16 key cells. Put the most important cells first; walk south + walk east is the tested choice.
  - `image_size {64,64}`, `no_background: true`, a fixed `seed`.
  - `description = chromaPrompt(item, key, "Cells in order: 8 cells walk facing south, 8 cells walk facing east. ")`.
- **Further calls for the same item.** Use the same endpoint with `frames = [designCall.out[0], ...≤15 new key cells]`, add
  "Frame 1 already wears the {item}: copy exactly that {item} design, colours and size onto the other frames." to the prompt, and
  **discard output 0**.
- Cost: 10 generations per call, ~100–160 s.

**4. Extract each output cell `C` against its base cell `B` (`chromaLayer(C, key, {B, region})`).**

1. Key score:
   - green: `ex = G − max(R,B)`, `score = ex < 12 ? 0 : 100·ex / max(G,1)`;
   - magenta: `ex = min(R,B) − G`, `score = ex < 12 ? 0 : 100·ex / max(R,B,1)`.
2. Mask: `alpha ≥ 128 ∧ score < 35`, and optionally inside the slot band:
   - head: `y < NECK.y + 3`;
   - torso: `NECK.y − 3 ≤ y < max(HIP.y) + 6`;
   - feet: `y ≥ min(KNEE.y) − 3`;
   - back: `y ≥ NECK.y − 4`;
   - held: whole cell.
3. Rim guard (`dropKeyOutline`): drop a mask pixel when all of these hold:
   - B is opaque there;
   - the pixel is on the silhouette edge ring (it has a transparent 4-neighbor in B) **or** the base pixel is dark (mean < 60);
   - at least 2 of its base-opaque 4-neighbors are key in C.
4. Drop 8-connected components smaller than 2 px.
5. `L` = the C pixels under the mask.
6. Despill:
   - tint = `ex ≥ 5 ? 100·ex / max : 0`, measured on the raw excess with no 12-level floor;
   - core = layer pixels with tint ≤ 10;
   - for each pixel with tint > 10: snap to the core color with the nearest luminance if `|Δlum| ≤ 0.08`, otherwise remove the
     excess (green: `G := max(R,B)`).
7. Output: `L` is the layer cell. It is pre-occluded against `B`, so draw it over the real base. The fg/bg split and z-ladder
   rules from the architecture apply unchanged.

**5. QA per cell. A fail re-rolls the whole call, never a single cell.**

| Check | Pass condition |
|---|---|
| `keyKept(B, C)` | ≥ 0.97 |
| `keyOutside(B, C)` | ≤ 0.02 (mannequin did not move) |
| Layer area | ≥ 50 % of the clip median |
| Area CV per clip | ≤ 0.15 |
| Layer touching y=0 | treat as clipped: re-roll, or the rig needs more headroom |
| Palette distance to the design call | ≤ 15 is OK; above that, warn and offer a re-roll |
| Spill rate | report only |

## Costs (S2)

| What | Calls | Generations |
|---|---|---|
| X1 chroma (`edit-animation-v2` 14, `transfer-outfit-v2` 3) | 17 | 170 |
| X2 two-pass remove | 3 | 30 |
| X4 (`edit-animation-v2` 8, `transfer-outfit-v2` 4, `ea2a` 2) | 14 | 140 |
| Bases (`create-character-v3` 48 and 64) | 2 | 4 |
| Template animations (walk ×3 dirs ×2 bases, cross-punch ×2 dirs ×2 bases) | 4 | ~4 (reported as USD 0.015–0.043 per direction; balance delta implies ≤1 generation per direction) |
| X3, all evaluation | 0 | 0 (offline) |
| `estimate-skeleton`, template probes | — | 0 (the probes used a fake character id, which returns a free 404/422) |
| **Total** | | **348** (balance delta) |

Latency: `edit-animation-v2` and `transfer-outfit-v2` took 96–196 s per call with 13 concurrent jobs and no 429s;
`create-character-v3` took 198–286 s; template animations took 87–365 s.

## Honest failures and open points

1. **Mannequin outline drawn off-key.** One `transfer-outfit-v2` cross-punch run redrew the outline olive. The rim guard reduces
   it but does not remove it; QA flags it (key kept 0.91). I have not seen it with `edit-animation-v2`.
2. **Weapon handedness and pose drift across clips.** The punch clip moved the sword to the free hand. `transfer-outfit-v2`
   flickered it, and a magenta `edit-animation-v2` east run lost it on one frame. This is a generation problem, not an
   extraction one. Mitigations, untested: name the hand side in image terms ("on the left side of the image"), use anchor cells,
   and add per-clip QA on the hand keypoint distance.
3. **Design lock across calls is approximate.** Anchor-cell `edit-animation-v2` is close (palette distance ~10) but not
   identical. Keep an item's cells in as few calls as possible: 16 cells is one call per direction-pair. Budget per item for
   4 dirs × (idle 4 + walk 8) = 48 cells ≈ 3–4 calls ≈ 30–40 generations.
4. **The key color must avoid the item hue.** Gray failed on steel and magenta failed on red. A two-color item that collides
   with both keys needs the X3 fallback.
5. **Fewer colors per item.** The key ramp takes ~5–8 of the ~17–19 quantized colors, so items get 6–8 colors. Untested
   knob: a 3-step ramp to free palette slots.
6. **The mannequin hides the face and skin from the model.** "Face visible" helmets worked. Hair, glasses, masks and makeup are
   untested and may need the face context: try a key body with the real face, or the X3 fallback.
7. **Untested:** legs/pants, hair, idle clips on the new base, west generation (mirrored only), and 8 directions.
8. **X3 ground truths are semi-synthetic.** They model real drift, but not drift correlated with the item, such as shadows the
   item casts.
9. The padded 48 base is visibly smaller in the 64 cell. Whether that is acceptable is a product call. An untested middle ground
   is a 56 px base padded by 8.

## Files

- **Libraries:**
  - `spikes/api/lib/chroma.mjs`: `toChroma`, `KEY`, `chromaMask`, `dropKeyOutline`, `despill`, `chromaLayer`, `keyKept`,
    `keyOutside`, `spill`, `chromaPrompt`, `selfTest`;
  - `spikes/api/lib/clean.mjs`: `maskNbr`, `rejectBody`, `fillHoles`, `growOutline`, `track`, `temporalConsensus`,
    `cleanliness`, `selfTest`.
- **Scripts:**
  - `s2_base.mjs`, `s2_anim.mjs`: bases and animations;
  - `s2_x1.mjs` with `s2_x1_eval.mjs`: chroma calls and evaluation;
  - `s2_x2.mjs`: two-pass remove;
  - `s2_x3.mjs`, `s2_x3b.mjs`, `s2_x3c.mjs`: diff benchmarks;
  - `s2_x4.mjs`: coverage and cross-call runs;
  - `s2_stack.mjs`, `s2_stack48.mjs`, `s2_overview.mjs`, `s2_zoom.mjs`: sheets.
- **Outputs:** `out/s2_base`, `out/s2_x1`, `out/s2_x2`, `out/s2_x3`, `out/s2_x4`, `out/s2_overview`, `out/s2_zoom`.
- **Character ids:** b64 = `8b885ed1-8d79-430c-9419-497796a03ca0`, b48 = `5352683c-54aa-4617-b303-e942e472c66d` (in
  `out/s2_base/*_character.json`).
