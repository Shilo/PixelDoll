# S5: Held items (live spike)

Date: 2026-10-21. Agent: S5. Code: `spikes/api/` (new: `s5_held.mjs` dress/pose/repair/eval, `s5_inpaint.mjs` H3,
`s5_dircheck.mjs` H4 gate, `s5_zoom.mjs` sheets). Outputs: `spikes/api/out/s5_held/`. Every paid call is in `costs.jsonl`
(job `usage`) and `calls.jsonl` (base64 stripped, no key).

**Spend: 133 generations** (cap 200). The balance went 1265.06 → 1132.06 = exactly 133, so nothing else spent during the run.

Base: the S3/S4 raw skeleton-v3 walk + slash S/E/N on S2's 48 px character, 64 rig padded x+8 y+16
(`out/s4_items/sk_<dir>.base0-15`, rest views `out/s3_k6/rot_base_*`, request keypoints `out/s3_k1/*.req.json`). The
control is S4's 64 px `skel_ea2` sword (same base, same keypoints, seed 7).

## Verdict

1. **The 96 px oversize canvas (H1) removes the M3 sword failures.** Rest views and base frames are padded 64 → 96 around the
   same pivot (+16, +16). The keyframe is dressed with `edit-animation-v2` at 96 and posed with raw skeleton-v3 at 96.
   - **0 blade px on the canvas border** in 192 posed frames (two items × 6 clips × 8 frames). The 64 px control has
     60 border px over its 6 clips.
   - **No blade flip in the east walk**: the sword and the axe keep their design and angle through all 8 frames.
   - The body stays registered (best shift 0 on every frame, key outside ≤ 0.09).
   - **Same cost**: skeleton-v3 is billed by frame count, not by canvas, so 3 gens per 8-frame clip. `edit-animation-v2`
     with 3 frames at 96 is within the 4-frame cap above 80 px and costs the same 10 gens.
2. **The dressing must leave the arm alone.** The best orientation is "pointing down and slightly outward", continuing the
   forearm (dress key outside 0–0.006).
   - "Upright" (H2) made the model bend the arm: key outside 0.04–0.07 at dress time. Posing then broke: the sword floated
     next to the lowered arm, came back horizontal, and the pommel detached. Grip in the south walk was 4 R / 4 none.
     **Rejected.**
   - "No extra weapons" wording is harmless, but it fixes nothing on its own.
3. **New failure mode, now fixed for free: the first slash frame loses the weapon.**
   - In the slash keypoints, frame 0 is about the rest pose (mean joint distance 0.2–0.3 px from `first_frame_keypoints`).
     Skeleton-v3 then drops the sword on that output frame: south lost it in 3/3 runs (seeds 7 and 11, plus a "grip"
     wording), north in 2 of 3. S4's 64 px run had it too (area 3 / 0 px).
   - **Sending frame 0 last** (sequence `f1…f7, f0`, then reordering) kept it in 2/2 runs (S and N).
   - Free fallback: paste the dressed keyframe layer shifted by the wrist-keypoint delta (`repair`). It looked right on
     S and N.
4. **The east slash motion-smear defects depend on the seed.** Seed 7 gave a dashed or smeared blade on f2/f4 (sword) and an
   axe head lost on f1. Seed 11 was clean for both items, so a QA re-roll handles it.
5. **H3 `inpaint-v3` at 96 with a wrist-disc mask works, but it costs too much as a default.**
   - It gives the cleanest pixels (key outside 0.003 in the walk, no motion smears) and a clear east slash.
   - It costs **25 gens per 480×384 grid** (16 animation cells), about 150 gens per item, against 46 for posing.
   - The design drifts from the keyframe (palette distance 11–13 vs 0), and the grip is ambiguous in side views.
   - Use it as the fallback for clips without keypoints, and after a failed pose re-roll.
6. **H4 direction gate (0 gens)** catches M3's wrong-facing helmet.
   - It flags 3/4 visor-on-back frames as `fail` and the 4th as `review`, with **0 false fails on S4's helmet and hair**
     (one review each).
   - It also flagged S4's known north-slash cape loss (f3–4).
   - It is **not usable for held items or feet**: rotating weapons, separating legs and symmetric S/N boots give many false
     flags. For held items, use grip side + G9 + area instead.

## Method

```
rest views S/E/N (64) ─pad +16,+16─▶ 96 ─toChroma─▶ edit-animation-v2 {3 frames, image_size 96, seed} = dressed keyframes
for clip × dir: raw /animate-with-skeleton-v3 {first_frame: dressed 96, first_frame_keypoints: rest + 16 px / 96,
   keypoints: clip sequence + 16 px / 96 (frame 0 sent LAST when it equals the rest pose), description:
   "solid bright green mannequin (chroma key colour) with <item>; exactly one <weapon>, no other weapons…", action, direction}
   ─▶ drop components < max(4 px, 15 % of the largest) ─▶ S2 chroma extraction (dropKeyOutline, minArea 2, despill)
   against the 96-padded real base frame ─▶ gates
```

**Metrics** (`s5_held.mjs eval`, `eval_<tag>.json`):

- body: key kept and key outside the base alpha, and the best integer shift of the silhouette;
- clipping: layer px on the canvas border, px outside the central 64 window, and the overflow per side
  (left/top/right/bottom);
- `gripSide` from the shifted wrist keypoints;
- G9: adjacent-frame centroid-aligned IoU;
- design lock: palette distance to the dressed keyframe of the same direction;
- stray px removed.

## Results

### Dressed keyframes (one `edit-animation-v2` call each, 96×96, 3 frames, 10 gens, 111–120 s)

| Tag | Prompt | Key kept S/E/N | Key outside S/E/N | Visual ([sheet](../../spikes/api/out/s5_held/dress_d96.sheet.png)) |
|---|---|---|---|---|
| `d96` | longsword, right hand, blade down and slightly outward | 1 / 1 / 0.994 | 0 / 0 / 0.006 | one design in all views, arms unchanged, longer blade than S4's 64 px dress |
| `u96` | longsword held upright, blade straight up | 0.956 / 1 / 0.954 | 0.040 / 0.075 / 0.046 | **forearm raised and bent** in every view ([sheet](../../spikes/api/out/s5_held/dress_u96.sheet.png)) |
| `a96` | battle axe, handle down and slightly outward, head at the bottom | 1 / 1 / 0.998 | 0.005 / 0 / 0.014 | clean axe in all views ([sheet](../../spikes/api/out/s5_held/dress_a96.sheet.png)) |

### Posed clips (raw skeleton-v3, 96 canvas, 3 gens per call, 86–210 s)

The final picks: walk seed 7; slash S/N seed 7 with frame 0 sent last; slash E seed 11 (`fsw` = sword, `fax` = axe).

Column notes:

- **Overflow** is in px beyond the 64 window, as left/top/right/bottom.
- **Grip** counts frames as R/L/amb/none.

| Item / clip | Area min/med | Key outside max | Shifted frames | Border px | Px outside the 64 window (frames) | Overflow L/T/R/B | Grip R/L/amb/none | G9 min | Palette distance | Visual |
|---|---|---|---|---|---|---|---|---|---|---|
| sword walk S | 122/134 | 0.042 | 0 | 0 | 30 (5) | 0/0/0/2 | 8/0/0/0 | 0.66 | 0 | identical sword, right hand |
| sword walk E | 136/156 | 0.089 | 0 | 0 | 40 (5) | 0/0/1/3 | 4/0/4/0 | 0.49 | 7.2 | **no flip**: the blade swings with the arm |
| sword walk N | 119/132 | 0.043 | 0 | 0 | 35 (4) | 0/0/0/3 | 8/0/0/0 | 0.51 | 0 | good |
| sword slash S (rot) | 125/143 | 0.049 | 0 | 0 | 121 (5) | 0/8/0/4 | 6/0/1/1 | — | 0 | full swing; f0 kept |
| sword slash E (s11) | 121/138 | 0.039 | 0 | 0 | 0 (0) | 0/0/0/0 | 2/0/6/0 | — | 0 | clean blade; 13 stray px removed; small blob at the head on f2 |
| sword slash N (rot) | 71/135 | 0.037 | 0 | 0 | 69 (4) | 0/8/0/3 | 5/1/0/2 | — | 0 | f0 kept; f5 blade mostly behind the body (back view) |
| axe walk S / E / N | 133 / 100 / 109 min | ≤ 0.074 | 0 | 0 | 24 / 34 / 0 | ≤ 0/0/0/3 | 8/0/0/0, 4/0/4/0, 7/0/1/0 | 0.78 / **0.38** / 0.68 | 0 | consistent axe, the head stays down-forward |
| axe slash S / E (s11) / N | 119 / 116 / 46 min | ≤ 0.053 | 0 | 0 | 41 / 3 / 13 | ≤ 0/5/1/1 | 8/0/0/0, 5/0/3/0, 7/0/1/0 | — | 0 | full swings; N f5–6 the axe is hidden behind the body (back view) |
| **control: S4 sword at 64** | 3–106 min | ≤ 0.050 | 0 | **5–16 per clip (60 total)** | — | — | 7/0/1/0 … 4/0/0/4 | 0.40–0.71 | 0–99 | blade cut at the cell edge in walk S/N and in slash; f0 lost in slash S/N |

Sheets (layer over the real base on the 96 canvas, magenta = the 64 window; the first column is the dressed keyframe):

- [`eval_fsw`](../../spikes/api/out/s5_held/eval_fsw.sheet.png) (final sword);
- [`eval_fax`](../../spikes/api/out/s5_held/eval_fax.sheet.png) (final axe);
- [`eval_d96`](../../spikes/api/out/s5_held/eval_d96.sheet.png) (seed 7 everywhere: f0 losses, smeared E slash);
- [`eval_u96`](../../spikes/api/out/s5_held/eval_u96.sheet.png) (upright, rejected);
- [`eval_d96fix`](../../spikes/api/out/s5_held/eval_d96fix.sheet.png) (anchor repair);
- [`eval_s4`](../../spikes/api/out/s5_held/eval_s4.sheet.png) (64 control).

Raw zooms: [`zoom_d96_slash`](../../spikes/api/out/s5_held/zoom_d96_slash.png),
[`zoom_d96_walk`](../../spikes/api/out/s5_held/zoom_d96_walk.png), [`zoom_d96r`](../../spikes/api/out/s5_held/zoom_d96r.png),
[`zoom_E11`](../../spikes/api/out/s5_held/zoom_E11.png), [`zoom_a96`](../../spikes/api/out/s5_held/zoom_a96.png).

Export-shaped layer sheets (8 × 96 by S/E/N, untrimmed, transparent):

- `out/s5_held/export_fsw_walk.png`, `export_fsw_slash.png`;
- `export_fax_walk.png`, `export_fax_slash.png`.

### First-frame weapon loss (slash)

| Run | S f0 item px | N f0 item px |
|---|---|---|
| S4 at 64, seed 7 | 3 | 0 |
| d96, seed 7 | 2 | 9 |
| d96, seed 11 | 5 | 135 (ok) |
| d96, action "…the sword stays gripped in every frame" | 0 | 21 |
| **d96, frame 0 sent last** | **142** | **161** |
| d96 + `repair` (keyframe layer shifted by the wrist delta (4,0) / (−3,0), 0 gens) | 135 | 128 |
| axe a96, seed 7 (control) | 119 (ok) | 128 (ok) |

Frame 7 (also about the rest pose, but not the first output frame) never lost the weapon, so the loss is **positional**.

### H3: `inpaint-v3` packed grid at 96 (`s5_inpaint.mjs`)

- Grid: 5×4 cells of 96 = 480×384.
  - Cells 0–15 are the chroma walk E + slash E frames.
  - Cells 16–18 are the `d96` dressed S/E/N keyframes, as design anchors with a black mask.
  - Each animation cell's mask is a disc of radius 34 around that frame's right-wrist keypoint.
- 1 call, **25 gens**, 88 s.
- Result ([zoom row 1–2](../../spikes/api/out/s5_held/zoom_inp96.png)):
  - Walk E: key outside 0.003, area CV 0.04, G9 0.68, grip 2/1/5/0.
  - Slash E: key outside 0.057, CV 0.06.
  - No motion smears, and the blade is drawn crisply in the swing.
  - Palette distance to the keyframe is 11–13: the design is close, but the hilt differs.
- Cost per item, 96 cells: 6 grids × 25 = **150 gens** (3× posing). Fallback only.

### H4: direction-consistency gate (`s5_dircheck.mjs`, 0 gens)

**Gate.** For a posed layer in a front/back view, compute an appearance similarity to the dressed keyframe layer of each
direction:

- centroid alignment, refined by ±1 px;
- over the union of both masks, each pixel scores `1 − maxChannelDiff/128` when both are opaque and 0 when only one is;
- **keyframe pixels that land on the posed frame's visible mannequin (key) are skipped as occluded**;
- specks under 4 px are dropped.

Rules:

- `own < 0.75` → **review**;
- additionally `opposite ≥ own − 0.1` → **fail** (wrong-facing, re-roll).
- Side views are skipped.

| Run (labels) | fail | review | Reading |
|---|---|---|---|
| M3 skeleton-pose helmet, slash N (f3–f6 visor on a back view, from the M3 sheet) | **f3, f4, f5** | f6 | 4/4 caught (own 0.52–0.73 vs ≥ 0.93 on good frames) |
| M3 helmet, every other clip | 0 | 0 | — |
| S4 helmet / hair (no known errors) | 0 | 1 each (N slash f5, arm + smear) | 0 false fails |
| S4 chest | 1 (S slash f5: vest broken into fragments behind the crossing arm) | 0 | a true defect |
| S4 cape | N slash f3–4 (S4's known "cape vanishes" frames) | walk S/N 5–6 frames (cloth deformation) | review noise on capes |
| S4 boots | walk S/N every frame | — | not applicable: legs separate, and S and N look alike |
| S5 sword / axe, even with the rotation-tolerant held variant (keyframe rotated in 15° steps) | many | many | **not applicable to held items** |

Use: head class (`fail` + `review`); torso and back (`review` only); off for feet and held. The thresholds come from one
labelled helmet run. Without the occlusion term, the arm crossing a helmet or vest raised false flags (chest 3 → 1).

## Why the M3 sword failed, now explained

| M3 symptom | Cause (S5 evidence) | Fix |
|---|---|---|
| Blade cut at the cell bottom | A 64 cell has 1–4 px under the feet. The blade needs 2–5 px below the 64 window in walk and 8 px above it in an overhead slash. | 96 canvas: 0 border px |
| Arm drift in north views (edit route) | The edit route and arm-moving prompts redraw the arm. The upright dress moved the arm too (key outside 0.04–0.07). | Skeleton-pose route with a "pointing down, continuing the forearm" dress (key outside ≤ 0.006) |
| Blade flips and leaves the cell in the east walk | At 64 the forward-down blade has no room below the cell, so the model re-orients it. At 96 the same forward-down design stays put in all 8 frames for the sword and the axe. | 96 canvas |
| Sword missing on slash f0 (also in S4, unnoticed) | Positional: the first output frame equal to the rest pose drops the item | Send frame 0 last; `repair` as the fallback |

## Recommended held-item route (`skeleton-pose`, oversize)

1. **Canvas.** Held items (and long back items) are generated on **96×96** around the rig pivot.
   - Pad = `(96 − 64)/2 = 16` on both axes. Pivot `(32, py)` → `(48, py + 16)`.
   - Keypoints: `(x + 16)/96`, `(y + 16)/96`.
   - Do not trim per item: one fixed size per class keeps the engines simple.
   - The measured need on this rig: 8 px up, 5 px down, 6 px right. With M3's 4 px-floor rig (y+12), the top need becomes
     12 px, so 80 is too tight and 96 is right. LPC uses 128/192 for its largest weapons; a `128` class can be added for
     spears and polearms (untested).
2. **Dress.** One `edit-animation-v2` call:
   - 3 chroma rest frames at `image_size 96` (cap 4 above 80 px), 10 gens;
   - prompt: item in the **right hand, pointing down and slightly outward**, "exactly one <weapon>, no other weapons, no
     scabbard, no shield", "keep … the arms … unchanged";
   - QA: dress key outside ≤ 0.02, or re-roll (catches arm-moving designs).
3. **Pose.** Raw `/animate-with-skeleton-v3` per clip × direction:
   - `first_frame` = dressed 96 keyframe, keypoints shifted as above;
   - 3 gens per ≤ 8 frames;
   - **if frame 0 is within 1 px mean of the rest pose, send it last and reorder**;
   - description "solid bright green mannequin (chroma key colour) with <item>; exactly one <weapon>…".
4. **Extract.** Stray components (< max(4 px, 15 % of the largest)) out, then S2 chroma extraction against the 96-padded
   real base frame. fg/bg split against the padded base alpha, as today.
5. **Gates (held class).**

   | Gate | Rule |
   |---|---|
   | Border | layer px on the canvas border = 0 |
   | Area | each frame ≥ 50 % of the clip median; on a back-view action, review instead of re-roll (true occlusion) |
   | `gripSide` | no L frames (side views are "amb") |
   | G9 | ≥ **0.3** on locomotion. M3's 0.4 would false-fail the axe east walk at 0.38. |
   | Key outside | ≤ 0.10 |
   | Registration | shift 0 |
   | Fail | re-roll with a new seed (fixed the E slash smears 2/2), then `repair` (near-rest frames), then the `inpaint-v3` grid |

6. **Cost.** Dress 10 + 12 clip-directions × 3 = **46 gens per item**, the same as the 64 px route. This run's final sets
   needed 1 extra seed per item (E slash), so plan about 49.

## Export implications (manifest + engines)

Manifest (proposal for `manifest-spec.md`; architecture §1 lists "oversize cells" as a v1 non-goal, which this reverses
for held/back slots):

- `Layer.cell?: {w, h}` and `Layer.pivot?: {x, y}`, defaulting to `rig.cell` / `rig.pivot`. An oversize layer is
  `{w: 96, h: 96}`, `{x: rig.pivot.x + 16, y: rig.pivot.y + 16}`.
  - Alternative: `Layer.pad: 16`. Keep the base cell unchanged.
- Validity rule 2 becomes per layer: sheet = `cells × layer.cell.w` by `directions × layer.cell.h`.
- Grid, frame names and the clock stay identical, so engines still sync by frame index or name.
- `Slot.cell` default per class: held 96, back 96 (optional), the others 64.

Engines (current exporter code paths that assume `rig.cell` / `rig.pivot`):

| Target | Change |
|---|---|
| `lib/compose` (preview, baked) | Draw a layer at `−pad`. Baked sheets use the largest cell of the visible layers, with the base drawn at `+pad`. |
| Godot (`export/godot.ts`) | Per-layer `AtlasTexture` region = layer cell; `offset = −layer.pivot` per node. Already per node, but it uses `rig.pivot`. |
| Phaser (`export/phaser.ts`) | Per-layer atlas: frame rect = layer cell; pivot = `layer.pivot / layer.cell` (normalized). Origins line up automatically. |
| Unity (`export/unity.ts`) | Sprite rect and pivot per layer sheet. **PPU must stay the base's (64), not the layer width**, or the weapon renders at 2/3 scale. |
| Generic strips | Strip height = layer cell. `generic.ts` currently rejects any layer cell ≠ rig cell (the size check must use the layer's own cell). |
| Aseprite (2nd wave) | Canvas = largest layer cell. 64 layers are placed as cels at (+16, +16). |
| Mirrored west | Pixel flip of the 96 cell about x = 48. The pivot is unchanged because it stays centred. |

## Honest gaps

- One body, two items (sword, axe), one dress per item. Spears/polearms and shields (left hand, `off_hand`) are untested.
  128 px is untested.
- `u96` was posed with the rest keypoints as `first_frame_keypoints`, although its arm was bent. Re-estimating the dressed
  keyframe might rescue upright designs. Not pursued: it changes the arm, so the item no longer matches the base arm anyway.
- The "send frame 0 last" fix rests on 2 runs (S, N) plus 4 failing controls. Re-verify in the app across more seeds.
- The H3 grid was run once (east only). Its design drift is larger than posing, and its cost was measured at 480×384 only.
- The H4 thresholds come from one labelled run. Back items get review noise, and the gate is unusable for held items and feet.
- Mirrored west still swaps the hand (O13, out of scope).
- The pose description for the axe used "exactly one held weapon". The axe dress call still said "exactly one sword", with no
  visible effect.

## Costs (job `usage`)

| What | Calls | Gens |
|---|---|---|
| `edit-animation-v2` dress at 96 (d96, u96, a96) | 3 | 30 |
| Raw skeleton-v3 poses at 96 (d96 6 + s11 2 + grip 2 + rot 2 + s11 E 1; u96 6; a96 6 + s11 E 1) | 26 | 78 |
| `inpaint-v3` 480×384 grid (H3) | 1 | 25 |
| H4 gate, evaluations, repair | — | 0 |
| **Total** | 30 | **133** |

Latency: dress 111–120 s; pose 86–210 s (median ~125 s); inpaint 88 s. No failed jobs and no 429s.
