# S4: Model routing under the new-models-only constraint (live spike)

Date: 2026-10-20/21. Agent: S4. Code: `spikes/api/` (new: `s4_probe.mjs`, `s4_base.mjs`, `s4_anim.mjs`, `s4_items.mjs`,
`s4_q3e.mjs`, `s4_montage.mjs`). Outputs: `spikes/api/out/s4_probe|s4_base|s4_anim|s4_items|s4_q3e/`. Every call is in
`calls.jsonl` (base64 stripped, no key); costs come from each job's own `usage` (`bases.jsonl`, `anim.jsonl`, `costs.jsonl`),
because S3/B-agents spent on the same key at the same time.

**Constraint (user).** Creating from scratch: only `create-character-v3` / `create-character-pro-flash`. Animation: only
`characters/animations` mode `v3` / `pixminimax`, raw `/animate-pixminimax`, `/animate-with-text-v3`, and skeleton
(`estimate-skeleton` + skeleton-v3). Banned: mode `template`, mode `pro`, `create-character-pro`, the 4/8-direction standard
routes, other legacy routes. **Clarification mid-spike (user via PM):** "Pro" is banned only for *creating*; for *editing*
frames, references and sheets the Pro editors are allowed (and expected to be better). Q3 therefore benchmarks every editor.

**Spend:** 1541 generations reported by job `usage`. A few server-failed jobs (502/504/"heavy load") may also have been charged.

## Verdict

1. **Base character: `create-character-v3` at 48 px, padded to 64.** Pro Flash can store an exact 48×48 or 64×64 canvas.
   But it draws a chibi/anime body, and at 48 the figure is only 26–37 px tall, even when the prompt says "adult
   proportions, not chibi". It costs 6 gens against v3's 2, and the walk canvas size differs per direction.
2. **Base animation: skeleton-v3 (S3) is the rig; text animation is the fallback.** For text clips: `pixminimax` for
   walk/run/idle (palette-locked, stronger motion, 1 gen, faster) and `v3` for hurt/death. Both text modes hallucinate:
   pixminimax added a sword to "slash", and a giant fist plus dust FX to "hurt". The prompt must say "unarmed, no weapon,
   no other people, no effects".
3. **Items: Pro wins on quality, but not every Pro route.** The best edited-batch routes are `inpaint-v3` on a slot-masked
   packed grid and `edit-animation-v2`. `edit-images-v2` (also Pro) **shifts the whole sprite on every frame** and is
   unusable for layers without re-registration. Pro Flash and Pixen are cheaper and visibly worse.
4. **The most consistent item route is S3's skeleton-posed dressed chroma keyframe:**
   - dress the 3 chroma rest frames (S/E/N) once with `edit-animation-v2`;
   - pose them with the base's keypoints through raw skeleton-v3.

   The result has one design across every clip and direction (palette distance to the reference ≤3 vs 6–15 for edited
   batches), swords that follow the slash in all directions, and capes that swing. Weak spots: more specks from motion
   smears, and one bad north-slash cape frame.

## Q1: Base character

Setup: same clothed prompt as S2 ("plain bald human mannequin … grey t-shirt + grey shorts, barefoot …"). There were **no
policy refusals**. Sheets:
[`v348b`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_base/v348b_sheet.png),
[`pf48`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_base/pf48_sheet.png),
[`pf48b`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_base/pf48b_sheet.png),
[`pf48c`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_base/pf48c_sheet.png) (adult prompt),
[`pf64`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_base/pf64_sheet.png).

| Run | Stored canvas | Figure height (S) | Headroom | Colors (S) | Cost | Time |
|---|---|---|---|---|---|---|
| v3 48, seed 4321 (S2 `b48`) | 48×48 | 44 | 1–2 | 30 | 2 | ~200 s |
| v3 48, seed 99 | 48×48 | 44 (all 8 dirs) | 2 | 24–34 | 2 | 200 s |
| pro-flash 48, seed 4321 | 48×48 | **26** | 12 | 21–26 | **6** (5 first image + 1 rotations) | 148 s |
| pro-flash 48, seed 99 | 48×48 | 36 | 6 | 20–22 | 6 | 180 s |
| pro-flash 48 + "adult proportions, not chibi" | 48×48 | 29 | 10 | 24–35 | 6 | 193 s |
| pro-flash 64 | 64×64 | 57–59 | 3–5 | 26–43 | 6 | 194 s |

- **Can Pro Flash produce exactly 48 or 64?** The *canvas*, yes. 48 and 64 are native sizes, and the stored canvas is exactly
  48×48 or 64×64 (no padding growth). The *figure*, no: grid recovery keeps the model's own pixel scale, so the body fills
  only 55–77 % of a 48 canvas.
- **Pro Flash style.** It is chibi (big round head, short legs). At 64 it adds purple anime eyes. The style is clean and flat,
  with identity well kept across 8 directions. For equipment that is a poor body: the head is half the sprite, and torso and
  legs are tiny slots.
- **API quirks (verified).** `create-character-pro-flash` rejects `no_background` (422 `extra_forbidden`) and rejects
  `n_directions: 4` ("Pro Flash supports 1 or 8"). `/pro-flash/cost` is a free estimate and agreed with the billed `usage`
  (6 gens).
- **v3.** Adult proportions, 44/48 px tall, and the same identity in all 8 directions. It needs the S2 48→64 pad (x+8,
  y+16) for headroom.
- **Pro Flash bases animate fine but the canvas is unstable.** pixminimax walk on `pf48b` returned 52×52 for S and N but
  56×56 for E ([sheet](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_anim/pf_pixminimax_walk_sheet.png)). v3 gave the same split.
- **Pick: v3 48 → pad 64.** Pro Flash is only for a deliberately chibi game style. An imported or custom base also works:
  S3 showed `create-character-v3` with `reference_image` + `direction_images` imports pixel-exactly for 0.25 gen.

## Q2: Base animation (allowed modes only)

**Method.** `s4_anim.mjs` on the S2 v3 48 character (`5352683c…`). Settings:

- one direction per call, then extend the same `animation_group_id`;
- `keep_first_frame: false`, seed 7;
- managed modes for walk 8, idle 4, run 8, slash 8, hurt 4 and death 8, on S/E/N;
- raw routes for walk and slash, S/E, with `first_frame` = rotation padded to 64.

**Metrics** (`anim.jsonl`; frames re-centered onto rotation coordinates):

- feet line and center-x range;
- head-top range;
- color count;
- palette distance and off-palette share against the rotation palette (identity/color stability);
- first-frame exact pixels and IoU against the rotation (body redraw).

Reference values come from S2's template frames, with no new template calls.

| Clip | Mode | Frames returned | Canvas | Feet (rotation = 46) | Colors max (rotation 30/28/23) | Off-palette | Gens / dir | Median time | Visual |
|---|---|---|---|---|---|---|---|---|---|
| walk | pixminimax | 8/8 | 68×68 | 45–48 | 28/42/22 | **0–0.7 %** | 1 | 88 s | strong E stride; S slightly turns on f6–7 |
| walk | v3 | 8/8 | 68×68 | 45–47 | 43/41/29 | 0.3–1.2 % | 1 | 130 s | good S/E/N cycle, softer |
| idle | pixminimax | 4/4 | 68×68 | 46 | 28/27/21 | 0 % | 1 | 62 s | **subtle stable breathing, IoU 1.0** |
| idle | v3 | 4/4 | 68×68 | 46 | 40/32/27 | 0.2–1.3 % | 1 | 83 s | arms drift out to a T-pose; not a loop |
| run | pixminimax | 8/8 | 68×68 | 44–48 | 29/42/23 | 0–1 % | 1 | 87 s | **excellent dynamic run** |
| run | v3 | 8/8 | 68×68 | 42–46 | 43/46/35 | 0.6–2.6 % | 1 | 125 s | walk-like run, leg color flicker |
| slash ("slash with the right arm, empty fist as if gripping a sword") | pixminimax | 8/8 | 68×68 | 46–53 | — | ~0 % | 1 | 85 s | **FAIL: a sword is added into the base**, and S turns to a side view |
| slash2 ("unarmed … no weapon, no effects") | pixminimax | 8/8 | 68×68 | 46 | 37/37/23 | 0–0.3 % | 1 | 66 s | good overhead chop, right arm, no props |
| slash / slash2 | v3 | 8/8 | 68×68 | 46 | 38/34/29 | 0.2–0.7 % | 1 | 114 s | readable S; E punch-like; N weak |
| hurt ("flinch from a blow") | pixminimax | 4/4 | 68×68 | 46 | — | 0–1.7 % | 1 | 69 s | **FAIL: a giant attacking fist and dust FX are drawn in** |
| hurt2 ("character alone recoils, no other people, no effects") | pixminimax | 4/4 | 68×68 | 46 | 30/41/22 | 0–0.7 % | 1 | 55 s | S/N fine; E still has dust FX |
| hurt / hurt2 | v3 | 4/4 | 68×68 | 45–46 | 43/41/34 | 0.6–2.2 % | 1 | 106 s | clean flinch, no FX |
| death | pixminimax | 8/8 | 68×68 | lying | 27/27/23 | 0 % | 1 | 72 s | E good; S/N fall-forward ok |
| death | v3 | 8/8 | 68×68 | lying | 44/42/35 | 1.7–2.2 % | 1 | 141 s | good S/E; N turns to a side view |
| raw walk | `/animate-pixminimax` | 9 (echo exact 2/2) | **64×64** (rig) | 61–63 (rotation 62) | 28–34 | 0–0.1 % | 1 | 125 s | E good; **S barely walks** |
| raw walk | `/animate-with-text-v3` | 9 (echo not exact 2/2) | 64×64 | 61–62 | 30–31 | 0–0.2 % | 1 | 159 s | E good; S nearly static |
| raw slash | pixminimax / v3 | 9 / 9 | 64×64 | 62 | 28–37 | ≤0.8 % | 1 | 92–159 s | readable, but both lunge (center-x 29→45) |

Sheets: `out/s4_anim/<tag>_sheet.png`, for example
[`a48_pixminimax_walk`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_anim/a48_pixminimax_walk_sheet.png),
[`a48_v3_walk`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_anim/a48_v3_walk_sheet.png),
[`a48_pixminimax_run`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_anim/a48_pixminimax_run_sheet.png),
[`a48_pixminimax_slash`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_anim/a48_pixminimax_slash_sheet.png) (the added sword),
[`a48_pixminimax_slash2`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_anim/a48_pixminimax_slash2_sheet.png),
[`a48_pixminimax_hurt`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_anim/a48_pixminimax_hurt_sheet.png) (the fist),
[`a48_v3_death`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_anim/a48_v3_death_sheet.png),
[`r48_rawpm_walk`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_anim/r48_rawpm_walk_sheet.png).

**Findings:**

- **Frame-count control is exact.** Managed v3 and pixminimax with `keep_first_frame: false` returned exactly N frames
  (24/24 directions). S3 saw 9 frames from a single v3 call. Raw routes return N+1.
  - The raw pixminimax echo was pixel-exact 4/4.
  - The raw v3 echo was never exact (0/4).
- **Canvas.**
  - Managed modes return a **68×68 canvas for a 48 px character, rotation centered at +10/+10**. Normalize by centering, then
    pad.
  - Raw routes keep the 64 rig canvas exactly, so no normalization is needed.
  - Pro Flash bases come back at 52 or 56 depending on direction.
- **Identity and color.**
  - pixminimax stays inside the rotation palette: 0–1.7 % off-palette, often exactly 0, with color counts at or below the
    rotation's.
  - v3 adds 10–15 new colors (off-palette 0.2–2.6 %).
  - Both keep the face and clothes.
  - The body is always redrawn: frame 0 shares only 21–90 % of rotation pixels, with no "moves instead of redraws"
    behavior.
- **Foot line.** Stable within 0–2 px on standing clips (templates were 1 px below the rotation's feet). Lunges move the
  center-x 5–16 px. The rig QA must tolerate this or re-center.
- **Handedness.** Unarmed slash2 used the character's right arm in S/E/N for pixminimax, and mostly for v3. Text
  routes cannot be trusted with *which* hand when held items are involved (S3: animate-with-text-v3 swung the wrong hand).
- **Multi-direction silent truncation (new, important).** At the **22-job Tier 3 cap**,
  `/characters/animations` with `directions: [S,E,N]` returned 200 with `directions: ["south"]` and one job. The other
  directions are silently dropped. The app must compare `res.directions` with the request, or send one direction per call.
- **Cost and latency.** Every text clip cost 1 gen per direction at 48 px (8 frames). pixminimax is faster: median 69 s
  (max 142) against v3's 125 s (max 290).
- **S3 comparison.** Raw skeleton-v3 hit 0.4–1.1 px pose adherence, 0 px feet drift, palette fit 1.00, and the requested
  hand in 100 % of slash frames, for 3 gens per clip on the 64 rig. **Skeleton-v3 remains the right base rig.**

## Q3: Item editors, head to head

### Is `edit-animation-v2` legacy?

**No.**

- The live `llms.txt` groups it under "Animation → Animate", next to `transfer-outfit-v2`. No `(legacy)` heading exists
  anywhere in the current file.
- The docs site lists it as "Edit animation (Pro)" in Animate, with nothing marked *old* or *legacy* (the "(old)" tag is used
  for Animate with text (old) and Interpolate (old)).
- The only "legacy" API labels are animation mode `pro` and the 4/8-direction template creators.
- Pro Flash has **no multi-frame editor**: its capabilities list single-image edit and inpaint only.

"Pro" is a price/quality tier (10/15/25 gens), not an age label. `edit-animation-v2` is the current frame-batch editor.

### Pro Flash native sizes and cost (`/pro-flash/capabilities`, free)

- edit/inpaint native sizes: 32, 32×48, 64, 96×64, 96 and 128, plus **custom 32–256 in steps of 4 (beta)**.
- Cost: 64 → 5 gens, 128 → 6, 192×128 → 6, **256 → 9**.
- Measured: 256×256 and 256×128 both cost 9; 192×64 cost 6.

### Experiments

**Common base.** S3's raw skeleton-v3 clips on the S2 b48 rig: walk (template-retargeted keypoints) and slash (authored),
S/E/N, 8 frames each, strays removed (`out/s4_items/sk_<dir>.base0-15`). Every route got the same green chroma mannequin
(S2 `toChroma`). Extraction used S2 `chromaLayer` drawn over the real base.

**Six items:** helmet, cape, leather vest, boots, hair, sword.

**Routes for frame batches** (one call per direction = 16 cells: walk + slash):

| Route | Family | What | Cost per 16 cells |
|---|---|---|---|
| `ea2` | Pro | `edit-animation-v2`, 16 frames | 10 |
| `eiv2` | Pro | `edit-images-v2` `edit_with_text`, 16 images | 10 |
| `inv3` | Pro | `inpaint-v3` on a 256×256 4×4 packed grid, slot-band mask (head/torso/cape/feet; whole cell for the sword) | 10 |
| `pfinp` | Pro Flash | `inpaint-image-pro-flash` on the same packed grid and mask | 9 |
| `pfgrid` | Pro Flash | `edit-image-pro-flash` on the packed grid, no mask | 9 |
| `pixen` | Pixen | `edit-image-pixen` on the packed grid (prompt must be ≤500 chars) | 1 |
| `skel_ea2` | Pro + skeleton | (e) dress the 3 rest chroma frames in **one** `edit-animation-v2` call, then 6 raw skeleton-v3 calls (walk/slash × S/E/N) with the base's keypoints | 10 + 6 × 3 |
| `skel_pfg` | Pro Flash + skeleton | (e) dressed with a Pro Flash inpaint 192×64 3-view grid, then posed; helmet and cape only | 6 + 18 |

**Metrics** (`s4_q3e.mjs eval`, `out/s4_q3e/h2h.jsonl`):

- key kept;
- max key pixels outside the base alpha (body moved);
- silhouette IoU against the base, and frames where a non-zero integer shift fits better (systematic misregistration);
- specks and pinholes;
- area CV;
- anchor spread: item centroid relative to its keypoint (head / neck+hips / ankles / neck / right wrist), max−min in dx+dy;
- adjacent palette Jaccard;
- **palDist**: mean color distance to the S-walk frame-0 layer of the same route (design lock across clips and
  directions);
- sword grip side (S3 `gripSide`, R/L/amb/none).

**Visuals.** Every montage was viewed: [`m_helmet`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_q3e/m_helmet.png),
[`m_cape`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_q3e/m_cape.png), [`m_chest`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_q3e/m_chest.png),
[`m_boots`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_q3e/m_boots.png), [`m_hair`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_q3e/m_hair.png) and
[`m_sword`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_q3e/m_sword.png). Each has two rows per route (S walk, E slash), in the route order
listed above. Per-route sheets with all six clips are in `out/s4_q3e/h2h_<item>_<route>.sheet.png`.

### Results (S+E clips, 4 clips × 8 frames per cell; N available for ea2/pfinp/skel)

| Item | Route | Key kept | Key out max | Shifted frames | Specks / pinholes | Area CV | palDist (design lock) | Visual |
|---|---|---|---|---|---|---|---|---|
| helmet | **inv3** | 0.996 | 0.003 | 0 | 0 / 0 | 0.07 | 7.1 | full helmet S/E, clean |
| helmet | ea2 | 0.995 | 0.086 | 0 | 0 / 79 | 0.07 | 3.5 | S good; E thin, hair-like |
| helmet | **skel_ea2** | 0.986 | 0.040 | 0 | 5 / 3 | 0.06 | **1.3** | nasal helmet, identical in every clip |
| helmet | pfgrid | 0.915 | 0.129 | 23 | 1 / 14 | 0.05 | 7.0 | adds unrequested pauldrons |
| helmet | pixen | 0.983 | 0.238 | 0 | 1 / 0 | 0.05 | 7.1 | **draws a skin face into the layer** |
| helmet | eiv2 | 0.662 | 0.487 | **32/32** | 0 / 26 | 0.09 | 19.8 | helmet floats 3–4 px above the head |
| cape | ea2 | 0.996 | 0.007 | 0 | 6 / 0 | 0.08 | 3.0 | good; swings in the E slash |
| cape | inv3 | 0.992 | 0.030 | 0 | 7 / 0 | 0.18 | 7.0 | good full cape, swings |
| cape | skel_ea2 | 0.974 | 0.046 (N: 0.29) | 1 | 33 / 0 | 0.06 | **1.0** | flows and swings naturally S/E; **N slash f4–5 cape vanishes or swirls** |
| cape | pfinp / pfgrid | 0.94 / 0.96 | 0.17 / 0.04 | 18 / 3 | 14–15 | 0.11–0.14 | 13–20 | S = thin red outline only |
| vest | **inv3** | 0.991 | 0.003 | 0 | 1 / 0 | 0.09 | 4.3 | good S and E |
| vest | ea2 | 0.985 | 0.017 | 0 | 13 / 4 | 0.18 | 7.5 | S good; **E vest almost missing** |
| vest | skel_ea2 | 0.980 | 0.046 | 0 | 5 / 0 | 0.12 | **1.0** | S good; E thin |
| vest | pixen | 0.962 | 0.323 | 0 | 5 / 0 | 0.11 | 6.9 | orange vest, body redrawn |
| boots | ea2 / inv3 | 0.995 / 0.996 | 0.007 / 0 | 0 | 1–0 / 2 | 0.05–0.06 | 8 / 3.6 | both good |
| boots | skel_ea2 | 0.977 | 0.028 | 0 | 22 / 1 | 0.08 | **0.4** | good |
| boots | eiv2 | 0.532 | 0.963 | 32 | 8 / 26 | 0.05 | 17 | **E: ghost white body outlines extracted as item** |
| hair | ea2 / inv3 | 0.994 / 0.995 | 0.006 | 0 | 2–0 / 0 | 0.06 | 3 / 8.8 | both good |
| hair | skel_ea2 | 0.980 | 0.058 | 0 | 0 / 0 | 0.04 | **0.6** | good |
| sword | **inv3** | 0.988 | 0.064 | 0 | 6 / 0 | 0.08 | 10.7 | **the blade follows the E slash, clear** (grip 17/5/8/2) |
| sword | ea2 | 0.984 | 0.187 | 0 | 8 / 2 | 0.09 | 7.6 | E slash blade thin and faint (22/0/9/1) |
| sword | **skel_ea2** | 0.984 | 0.044 | 0 | 15 / 0 | 0.19 | **0.4** | **swings with the arm in S/E/N**, same sword everywhere (all dirs 33/2/7/6) |
| sword | pfinp / pfgrid | 0.92 / 0.96 | 0.16 / 0.07 | 21 / 13 | 4–10 | 0.06–0.09 | 11 | blade static, not following the slash (L 8–10) |
| sword | pixen | 0.957 | 0.128 | 0 | 4 / 0 | **0.44** | 21.7 | sword missing in 5 frames, swaps sides (6/12/7/7) |

### Earlier Q3 runs on S2's template walk (S+E, 16 cells; `out/s4_items/*.final_sheet.png`)

- **Pro Flash 256 packed grid without a mask (`pfgrid`).** One image gives one consistent design (palette distance to cell 0
  only 0–7). But it redraws the key body: key kept 0.92–0.98, 2.5–6 % key outside. It makes semantic errors:
  - capes drawn as outlines (S) or in front;
  - a second sword in 4 E frames ([`pfgridg_sword`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_items/pfgridg_sword.final_sheet.png));
  - cells bleed across touching 64 px cell edges (the sword tip crossed into the next row).
  Adding 8 px gutters (248×256) did *not* help: key kept 0.83–0.94.
- **Pro Flash inpaint grid (`pfinp`).** Pixel-exact outside the mask (1.000 on every run). Helmet and hair are good
  ([`pfinp_helmet`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_items/pfinp_helmet.final_sheet.png),
  [`pfinp_hair`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_items/pfinp_hair.final_sheet.png)). The cape and the E vest fail.
- **Pro Flash per cell with the dressed cell 0 as reference (`pfref`).**
  - The design changes every frame: adjacent palette Jaccard 0.00–0.03, palette distance 16–35.
  - It costs 5 gens per cell (70 per item).
  - **Rejected.**
- **Animating a dressed chroma keyframe with pixminimax/v3 (`animpm`/`animv3`).** The item design is perfectly consistent, but
  the mannequin's motion differs from the base: 7–16 % key outside, silhouette IoU 0.65–0.84. The layer is occluded by the
  wrong body. **Rejected, as expected**; skeleton-v3 is the aligned variant of this idea.
- **The `edit-animation-v2` baseline on the new pixminimax walk base (`nb_ea2_*`).** Clean: key kept 0.99+, ≤0.8 % outside,
  0–11 pinholes ([`nb_ea2_cape`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_items/nb_ea2_cape.final_sheet.png)). The chroma route transfers to
  text-animated bases.

### Dressing a single keyframe (for route (e))

3 rest chroma frames (S/E/N) per item, six items. Montage [`m_dress`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/s4_q3e/m_dress.png) has rows in
this order: ea2, eiv2, inv3, pfg, pfe, pxg, pxe.

| Editor | Calls / gens | Key kept | Key outside | Cross-view design | Visual |
|---|---|---|---|---|---|
| **edit-animation-v2, 3 frames** (Pro) | 1 / 10 | 0.99–1.00 | ≤0.01 (cape N 0.12) | **one design** | **best: clean nasal helmet, cape, vest, boots, hair, sword in the right hand** |
| **inpaint-v3, 192×64 row** (Pro) | 1 / 10 | 0.85–1.00 | 0–0.05 (cape S 0.20) | one design | very good; bigger hair/helmet; sword clean in the right hand |
| inpaint-image-pro-flash, 192×64 row | 1 / 6 | 0.78–1.00 | sword 0.11–0.25 (body redrawn) | one design | ok; knight helmet; N vest becomes a backpack |
| edit-image-pro-flash per view | 3 / 15 | ~1.0 | 0 | **different per view** | clean, but the vest and helmet differ between S/E/N |
| edit-image-pixen, 3-view row | 1 / 1 | ~1.0 | 0 | one design | **draws a skin face under the helmet**, which leaks into the layer |
| edit-image-pixen per view | 3 / 3 | ~1.0 | 0 | differs | same face problem |
| edit-images-v2, 3 frames (Pro) | 1 / 10 | 0.01–0.75 | 0.14–0.99 | — | **shifts the mannequin up 3–4 px**: the layer is misaligned |

Not run: `create-character-v3` rotating a dressed *south* frame into E/N (`dress v3rot` is implemented but not executed). Its
rotations would not match the base rotations pixel-wise; S3's 0.25-gen exact import is the way to make a dressed set a managed
character.

### Verdict on "Pro wins"

**Partly confirmed:**

- **Confirmed** for `inpaint-v3` (packed + masked grid) and `edit-animation-v2`. Both are the cleanest on every item, with
  0 misregistered frames and key kept ≥0.98.
- **Refuted** for `edit-images-v2`. It re-frames the sprite: 32/32 frames are shifted and key kept falls to 0.53–0.67. Never
  use it for layers unless every frame is re-registered.
- **Pro Flash** (9 gens per 16 cells) is ~10 % cheaper but loses 2–8 points of key fidelity, misregisters 13–35 frames per
  item and makes semantic mistakes.
- **Pixen** (1 gen) is 10× cheaper but redraws faces and drops held items. It is acceptable only for preview/drafts of simple
  worn items (boots, vest).

### Cost per item for a 3-direction × 4-clip rig (12 clip-directions × 8 frames = 96 cells)

| Route | Calls | Gens / item | Notes |
|---|---|---|---|
| (e) skeleton-posed keyframe (dress ea2 + pose) | 1 + 12 | **10 + 36 = 46** | requires the base clips to be skeleton-v3 keypoint sequences; ~2.5 min per pose call, all parallel |
| inpaint-v3 packed grid | 6 | 60 | ~2.6 min per call; design varies slightly per call (palDist 4–10), and there is no anchor-cell option |
| edit-animation-v2 | 6–7 (with an anchor cell) | 60–70 | S2 anchor cell keeps the design (palDist ~10) |
| Pro Flash inpaint grid | 6 | 54 | quality loss above |
| Pixen grid | 6 | 6 | drafts only |

## Q4: Routing table (final, allowed models only)

| Use case | Default | Alternative | Avoid (and why) |
|---|---|---|---|
| Base character | `create-character-v3` text, 48 px, seed fixed; pad to 64 at freeze | import own art: `create-character-v3` `reference_image` + `direction_images`, `n_directions: 4` (0.25 gen, pixel-exact, S3) | `create-character-pro-flash`: chibi, 26–37 px body at 48, 3× the cost; use only for a chibi art style |
| Base rig keypoints | `estimate-skeleton` on the rotations (0.1 gen; free on managed characters via `skeletons.2d_references`) | — | — |
| Standard locomotion (walk / run / idle) | managed `skeleton-v3` template motion, then estimate keypoints and re-render through raw skeleton-v3 (S3, 3 gens per dir) | `characters/animations` **`pixminimax`** (1 gen per dir, palette-locked, best run/idle), one direction per call, `keep_first_frame: false` | v3 idle (drifts to a T-pose); raw text routes for south walk (barely moves) |
| Combat actions (slash, cast, block, hurt, death) | raw **`animate-with-skeleton-v3`** with authored keypoints (S3: correct hand 100 %, 0 px feet drift) | text: pixminimax for slash (prompt "unarmed, no weapon, no props, no effects"); **v3** for hurt/death (no FX) | pixminimax hurt (invents the attacker/FX); any text route when the hand matters |
| Imported or custom base (frames only) | raw skeleton-v3 with `estimate-skeleton` | raw `/animate-pixminimax` (exact echo, rig canvas kept) | raw `animate-with-text-v3` (echo not exact, weaker) |
| Items, all slots, rigs on skeleton-v3 | **(e) dressed chroma keyframe**: `edit-animation-v2` on the 3 rest chroma frames, then raw skeleton-v3 per clip-direction with the base keypoints (46 gens per item; design identical everywhere, held items follow the hand) | `inpaint-v3` on a 4×4 packed chroma grid with a slot-band mask (60 gens per item; cleanest pixels) | `edit-images-v2` (shifts); Pro Flash per-cell reference (design flicker) |
| Items on text-animated or imported clips (no keypoint sequence) | `inpaint-v3` packed masked grid (head, torso, feet, hair, held) | `edit-animation-v2` + anchor cell (S2; best for capes) | Pro Flash grids (key loss, semantic errors); animate-the-keyframe with pixminimax/v3 (misaligned) |
| Back items (cape) | (e) for S/E plus a QA re-roll on N action frames; or `edit-animation-v2` | `inpaint-v3` (cape mask) | Pro Flash (outline-only capes) |
| Keyframe dressing (single frame or 3 views) | `edit-animation-v2` with 2–3 frames (one call, one design) | `inpaint-v3` on a 192×64 row with masks | per-view Pro Flash or Pixen edits (different designs, faces); `edit-images-v2` (shift) |
| Cheap preview / draft | `edit-image-pixen` on the packed grid (1 gen) | `inpaint-image-pro-flash` grid (9) | — |
| QA (every route) | key kept ≥0.97, key outside ≤0.05, no shifted frames (best integer shift = 0), `gripSide` for held items, stray-component removal | — | — |

**Clearly worse allowed models** (flagged):

- `create-character-pro-flash` for this body type;
- `characters/animations` v3 for idle/run;
- pixminimax for hurt;
- the raw text routes for south walks;
- every Pro Flash editor and Pixen for layers;
- `edit-images-v2` for any layer work.

## Honest failures and open points

1. **Network and server reliability.**
   - ~10 jobs failed server-side (502 "Inference stream ended", 504, "heavy load") and ~10 client POSTs died on network
     timeouts.
   - `lib/api.mjs` now retries GETs on network errors and 429s up to 40 times. It never auto-resubmits a paid POST.
   - Failed jobs may still be charged.
2. **Managed text modes silently drop directions near the concurrency cap.** Covered above; the app must check
   `res.directions`.
3. **(e) skeleton route weak spots:**
   - specks from motion smears (cape 33, boots 22–39, sword 15–22 per 4–6 clips; S3's largest-component filter removes most);
   - the north slash cape disappears on f4–5;
   - it inherits skeleton-v3's non-determinism (store the frames).
   - The inpaint-v3-dressed keyframe and `pfg` beyond helmet/cape were not posed. inpaint-v3 dressing looked as good as ea2,
     so it is the untested alternative.
4. **Design lock across calls for edited batches** is only approximate: palDist 3–11 between per-direction calls. Neither
   inpaint-v3 nor Pro Flash has an anchor-cell mechanism. (e) avoids this by construction.
5. **Single sample per cell.** One seed per route and item. Pixen and Pro Flash quality may vary more than shown.
   `inpaint-v3` cost was 10 gens for a 256×256 grid; larger grids were not tested.
6. **Pro Flash base canvas varies by direction** (52 vs 56). It was not tested whether a custom-size Pro Flash base avoids
   this.
7. **v3 bases with the 64 px rig** were not regenerated; all animation numbers are on the 48 px character (68 px managed
   canvas). West is still a mirror of east.
8. `pf_v3_walk` (Pro Flash base, v3 walk) did not complete (network). Its pixminimax walk and both slash2 variants did.
