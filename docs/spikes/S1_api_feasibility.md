# S1 — PixelLab API feasibility spike (live generations)

Date: 2026-10-20. Agent: S1. Account: Tier 3 subscription. Spend: **~568 generations** (5266.2 → 4698.5), USD credits untouched.
Code: `spikes/api/` (Node ESM, only dependency `pngjs`). Outputs: `spikes/api/out/<experiment>/` (PNGs, `calls.jsonl` with
base64 stripped and no key, `costs.jsonl`, `results*.json`, contact sheets).

## Verdict

**The core hypothesis holds, but only in a modified form.** "Edit the unchanged base → diff → layer" works when you add
**slot masking**. No PixelLab route leaves the base pixels untouched over a whole animation. Two kinds of route work, each with
its own trade-off:

| | Pixel-exact outside the item? | Same item design in every frame? |
|---|---|---|
| Masked inpaint (`inpaint-v3`, `inpaint-image-pro-flash`), one call per frame | **Yes** (0 px changed outside the mask, 0/10 failures on static edits) | **No** (palette Jaccard 0.12–0.25 between frames; a different helmet every frame; inpaint-v3 deleted the head on 1/8 frames) |
| Batch frame edit (`edit-animation-v2`, `transfer-outfit-v2`), ≤16 frames per call | **No** (every body pixel drifts slightly: 0 % exact, ~45–56 % within Δ8, ~77–80 % within Δ18) | **Yes** (layer area CV 0.01–0.05, palette Jaccard 0.65–0.85, frame order preserved, centroid relative to the anchor within ±1–2 px) |

The design consistency of batch routes is the hard property, and it cannot be fixed locally. Body drift *can* be fixed locally:
we never use the composite's body, only the item pixels inside a slot rectangle, composited over the frozen base. **So the
recommended pipeline is a batch edit plus slot-masked, palette-aware extraction.** The two-pass "remove the character" route is a
fallback for back items whose occluded part is needed.

Showcase: helmet, chest and sword were each generated separately against the same 8-frame base walk, extracted, and re-stacked:
[`anim_showcase_chest_helmet_sword.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e5_stack/anim_showcase_chest_helmet_sword.png). Rows: base / chest
layer / helmet layer / sword layer / composite. It reads coherently, and it shows the remaining artifacts honestly: skin speckles in
the chest layer, a holey chest on frame 2, and a little face baked into the helmet.

## Helpers (to port to the browser)

| File | What | Browser-portable |
|---|---|---|
| `lib/api.mjs` | `client({key})` → `req / run(path, body)` (POST, then poll `/background-jobs/{id}`, 429/529 backoff), `findImages` (base64 or URL anywhere in a payload) | yes (plain `fetch`) |
| `lib/img.mjs` | RGBA image `{w,h,d:Uint8ClampedArray}` (same layout as `ImageData`), over-compositing, scale, pad/crop, bbox, colors | yes, except `decode/encode` (pngjs) → use canvas |
| `lib/diff.mjs` | premultiplied deltas, exact / threshold / hysteresis / palette-novelty masks, connected components, morphology, `growInto`, metrics (residual, drift, erasures), heatmap, temporal stats, `selfTest()` | yes |
| `lib/extract.mjs` | named extraction variants (E6) incl. recommended `slot_novel2_grow1` and `auto` | yes |
| `lib/sheet.mjs` | contact sheet (nearest-neighbor ×N on a checkerboard) | yes |
| `lib/run.mjs` | Node-only harness: output dir, call log, balance-delta cost | no (Node) |

Heatmap legend in every sheet: green = pixel added on empty canvas, red = body pixel changed by >18, blue = small drift (≤18),
magenta = body pixel erased, gray = unchanged base.

## E1 — Base body

Prompt: "plain bald human base body for a paperdoll, light skin, simple plain grey underwear shorts, barefoot, no hair…, arms
slightly away from the body", seed 1234, low top-down.

| Route | Gens | Latency | Stored canvas | Character bbox (south) | Colors | Notes |
|---|---|---|---|---|---|---|
| `create-character-v3` (from text, 64×64) | 2 | 288 s | **64×64** (not padded) | 26×60 at y=2 → **2 px headroom** | ~30 | 8 clean, consistent rotations, detailed shading. Sheet: [`v3_sheet.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e1_base/v3_sheet.png) |
| `create-character-with-4-directions` (image_size 64) | 1 | 52 s | **92×92** (~40 % pad) | 25×65 at y=13 | 8–10 (quantized) | Flatter, chibi-ish, clean. Too big for multi-frame grids (81+ px → max 4 frames). Sheet: [`d4_sheet.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e1_base/d4_sheet.png) |

R1 reported that v3 pads 64→120. We did not see this in from-text mode: the rotations stayed 64×64. Template animations also
kept 64×64.

## E2 — Base animation (`/characters/animations`, mode `template`)

| Anim | Dirs | Frames | Canvas | Gens | Latency | Opaque px stable across all frames |
|---|---|---|---|---|---|---|
| `walking-8-frames` (v3 base) | south, east | 8 / 8 | 64×64 | ~1 per dir (job usage reported as ~$0.015 per dir, but deducted from generations) | 138 s | south 4 / 854, east 19 / 542 |
| `breathing-idle` (v3 base) | south, east | **4** / 4 | 64×64 | 2 | 87 s | 26 / 773, 31 / 497 |
| `walking-8-frames` (4-dir base) | south, east | 8 | 92×92 | ~1–2 | 125 s | 197 / 1172 |

Sheets: [`walk_sheet.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e2_anim/walk_sheet.png), `idle_sheet.png`, `d4walk_sheet.png`.

Findings:

- **Every frame re-renders the whole body.** Frame 0 is not the rotation image: the body is 3–4 px shorter (bbox y=6 vs y=2).
  Even idle keeps <5 % of pixels stable. Equipment therefore has to be produced against the animation frames themselves. Freeze
  the frame PNGs as the canonical rig.
- The animation frames have 5–7 px headroom, which is fine for helmets. The south template walk is weak (small stride).
- `estimate-skeleton` (64×64) is synchronous, takes ~6 s alone (~11 s with 16 concurrent), and cost 0 measurable generations
  (R1 says 0.1). It returns 18 labels with normalized x/y and `z_index` (east-facing far arm z=−4, i.e. behind the body). We used
  it per frame for slot rectangles: `out/e4_anim/walk_skeletons.json`.

## E3 — Static equipment on one frame (walk south frame 0, 64×64, 854 opaque base px)

Prompt pattern: "Add only {item} to this south-facing pixel art character. Keep every other pixel … exactly unchanged." Masked
routes used a rectangular slot mask (white = generate). Seed 7. "Outside" means changed pixels outside the slot rectangle. Feet
touch the bottom row, so a correct result keeps 5 opaque border pixels.

| Item | Route | Gens | Latency | Changed px | Added on empty | Body px changed | …of which small drift ≤18 | Changed outside slot | Feet kept |
|---|---|---|---|---|---|---|---|---|---|
| helmet | edit-image | 1 | 25 s | 880 | 57 | 823 | 156 | 687 | no (turned body into full armor) |
| helmet | edit-images-v2 | 10 | 63 s | 1009 | 155 | 854 | 211 | 728 | no (shifted) |
| helmet | **inpaint-v3** | 10 | 105 s | 191 | 50 | 141 | 25 | **0** | yes |
| helmet | pf-edit (edit-image-pro-flash) | 5 | 31 s | 880 | 26 | 854 | 662 | 670 | yes |
| helmet | **pf-inpaint** (inpaint-image-pro-flash) | 5 | 31 s | 192 | 35 | 157 | 42 | **0** | yes |
| sword | inpaint-v3 | 10 | 83 s | 221 | 110 | 111 | 78 | 0 | yes |
| sword | pf-inpaint | 5 | 36 s | 326 | 83 | 243 | 166 | 0 | yes |
| sword | pf-edit | 5 | 51 s | 925 | 71 | 854 | 706 | 539 | yes |
| chest | inpaint-v3 | 10 | 67 s | 295 | 7 | 288 | 55 | 0 | yes |
| chest | pf-inpaint | 5 | 43 s | 382 | 11 | 371 | 111 | 0 | yes |
| hair | inpaint-v3 | 10 | 96 s | 317 | 75 | 242 | 60 | 0 | yes |
| hair | pf-inpaint | 5 | 44 s | 347 | 53 | 294 | 157 | 0 | yes |
| cape | inpaint-v3 | 10 | 73 s | 676 | 454 | 222 | 159 | 0 | yes |
| cape | pf-inpaint | 5 | 59 s | 752 | 274 | 478 | 329 | 0 | yes |
| cape | edit-images-v2 | 10 | 89 s | 1542 | 688 | 854 | 164 | 425 | yes |

The full table, with all 30 calls and every extraction variant, is in `out/e3_static/results.json`.

Contact sheets (columns: base / composite / heatmap / layer exact / layer thr18 / layer slot+hyst / mask):
[`route_inpaint-v3.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e3_static/route_inpaint-v3.png),
[`route_pf-inpaint.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e3_static/route_pf-inpaint.png),
[`route_pf-edit.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e3_static/route_pf-edit.png),
[`route_edit-images-v2.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e3_static/route_edit-images-v2.png),
[`helmet_all.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e3_static/helmet_all.png) (all 7 helmet routes).

Findings:

- **Both masked inpaint routes preserve outside-mask pixels exactly** (0 px over 10 calls). The July "inpaint-v3 ignores the
  mask" bug did **not** reproduce. Inside the mask they redraw the body too: the face under a helmet, the torso under a vest.
  inpaint-v3 redraws far less than Pro Flash (small-drift pixels inside the mask: 25–159 vs 42–329). That makes inpaint-v3
  layers visibly cleaner, at 2× the cost and 2× the latency.
- **The Pro Flash `output_method` values work over REST.** "New layer with changes" and "Modify current layer, only changes"
  return an image that is transparent outside the mask (204 px for the helmet, 0 outside the mask). But 35 of those pixels are
  identical to the base: this is **a crop of the inpaint result to the mask, not a semantic layer**. It gives nothing beyond
  local diff of the default output. The job payload carries `images`, `original_images` (identical) and `image_url`. The URL
  version differs slightly inside the mask (0/219 identical), so **use the base64 `images[0]`**. Pro Flash accepts 64×64.
- `edit-image` (cheap, 1 gen) ignores "add only" (helmet prompt → full plate armor) and moves or erases pixels. **Reject it.**
- `edit-images-v2` (10 gens) redraws and shifts the body (green halo in the heatmap). **Reject it.**
- `edit-image-pro-flash` keeps the geometry but recolors ~100 % of body pixels by small deltas (blue everywhere). It is usable
  only with slot masking. A slot rectangle that is too tight cuts weapons that extend beyond it, so weapon slots must be generous.

## E4 — Animated equipment (THE question): 8-frame base walk, 64×64

Per-frame slot rectangles come from per-frame skeletons. Extraction variant: `auto` (see E6). Metrics are per frame, averaged.
Areas are layer pixels. "Adj. palette J" is the Jaccard index of layer color sets between adjacent frames (1 = identical colors).

| Item / dir | Route | Gens | Latency | Frames / order ok | Body px changed outside slot (mean) | Layer px | Area CV | Adj. palette J | Notes |
|---|---|---|---|---|---|---|---|---|---|
| helmet S | **edit-animation-v2** | 10 | 89 s | 8 / yes | 622 (all) | 122 | 0.08 | 0.74 | same helmet every frame |
| helmet S | **transfer-outfit-v2** (ref = E3 inpaint composite) | 10 | 120 s | 8 / yes | 622 | 139 | 0.09 | 0.73 | same helmet, matches reference |
| helmet S | pf-inpaint per frame (8 calls) | 40 | 80 s (parallel) | 8 / yes | **0** | 134 | 0.14 | 0.20 | design changes per frame |
| helmet S | inpaint-v3 per frame (8 calls) | 80 | 126 s | 8 / yes | **0** | 130 | 0.38 | 0.13 | frame 6 deleted the head |
| helmet S | pf-edit method=reference per frame | 40 | 84 s | 8 / yes | 621 | 97 | 0.18 | 0.06 | inconsistent |
| helmet E | edit-animation-v2 | 10 | 107 s | 8 / yes | 277 | 118 | 0.01 | 0.85 | |
| helmet E | transfer-outfit-v2 (south reference) | 10 | 100 s | 8 / yes | 416 | 163 | 0.06 | 0.81 | cross-direction reference works |
| helmet E | pf-inpaint per frame | — | — | failed | — | — | — | — | **content-policy block** on 1 frame |
| sword S | edit-animation-v2 | 10 | 152 s | 8 / yes | 615 | 135 | 0.04 | 0.65 | |
| sword S | **transfer-outfit-v2** | 10 | 170 s | 8 / yes | 606 | 137 | 0.05 | 0.72 | cleanest sword |
| sword S | pf-inpaint per frame | 40 | 51 s | 8 / yes | 28 | 120 | 0.15 | 0.19 | different sword per frame |
| chest S | edit-animation-v2 | 10 | 119 s | 8 / yes | 415 | 228 | 0.07 | 0.65 | arm speckles in the layer |
| chest S | transfer-outfit-v2 | 10 | 126 s | 8 / yes | 416 | 220 | 0.10 | 0.74 | |
| helmet S+E | **edit-animation-v2, 16 frames (8 S + 8 E) in one call** | 10 | 127 s | 16 / yes | — | 141–176 | — | 0.57–0.77 vs S frame 0 | **one design across both directions** |
| helmet S | edit-animation-v2 + `target_palette` (base palette + 5 grays) | 10 | 99 s | 8 / yes | — | — | — | — | body exact 0 % → **25.6 %**, ≤18 → 73.7 % |
| helmet S | transfer-outfit-v2 + `target_palette` | 10 | 78 s | 8 / yes | — | — | — | — | body exact 0 % → **34.2 %**, ≤18 → 78.4 % |

Body drift distribution below the head (y≥24, 5033 px over 8 frames):

| Route | Exact | Δ≤8 | Δ≤18 |
|---|---|---|---|
| edit-animation-v2 | 0.0 % | 44.7 % | 78.0 % |
| transfer-outfit-v2 | 0.0 % | 50.8 % | 77.0 % |
| pf-edit (reference) | 0.1 % | 55.8 % | 79.7 % |
| pf-inpaint (per frame, masked) | 99.5 % | 99.6 % | 99.9 % |

Sheets (rows: base / composite / heatmap / layer):
[`helmet_south_all.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e4_anim/helmet_south_all.png) (edit-animation-v2, transfer-outfit-v2),
[`helmet_south_all2.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e4_anim/helmet_south_all2.png) (pf-inpaint, inpaint-v3, pf-edit-ref),
[`sword_south_all.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e4_anim/sword_south_all.png),
[`final_compare.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e4_anim/final_compare.png) (chest edit-animation-v2 + sword transfer-outfit-v2 with
the final extractor; rows: base / composite / layer / base+layer),
[`ea2_16_sheet.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e7_limits/ea2_16_sheet.png) (16 frames, two directions, one call). Every `*.final_sheet.png`
in `out/e4_anim/` is the same view for another run.

### State route: `create-character-state` + animate the state

[`state_vs_base_sheet.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e4_state/state_vs_base_sheet.png)

- The state (10 gens, 116 s) re-renders all rotations: 669 of ~900 body px changed on south.
- Animating the state with the same template (`walking-8-frames`, ~1 gen/dir) gives the **same poses**. The silhouette bbox
  matches within 0–3 px. But the frames are **not pixel-aligned** with the base walk: 815–891 px changed per frame, with many
  strong (red) changes along limb edges.
- Diff against the base therefore only works with a head-only gate, and it leaks.
- **Answer to PM Q6:** two characters animated with the same template align at pose/silhouette level (±1–3 px), not per pixel. A
  regenerated base invalidates every layer, so store a `baseHash` per layer. States are good for dressed previews and as
  transfer-outfit references, not for layers.

### E8 — Rigid propagation without AI calls (architecture question O2)

Method: take the helmet and sword layers from frame 0 (E3 inpaint-v3), find a per-frame integer translation by tracking a
head or hand patch on the frozen base, and shift the layer.
[`prop_all.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e8_propagate/prop_all.png)

- Helmet offsets (dx, dy) for frames 1–7: (−1,−1), then (0,−1) for frames 2–6, then (1,−1). The edit-animation-v2 helmet
  centroid relative to NECK varies only ±1 px too, so the head really is rigid in walk and idle. **This works visually for the
  south walk.**
- Sword: offsets up to (1,−3). It looks right in the south walk, where the hand barely moves.
- **Valid for head and face items in any idle/walk and for held items in low-motion clips. Not valid for side-view arm swings
  or attacks**, which need rotation; there, use batch edits.
- Caveat: a layer propagated from frame 0 carries frame 0's redrawn face pixels into every frame. The masks must stop at the
  hairline or brow; the architecture's "body-material rejection" covers this.

## E5 — Stacking, front/back split, two-pass fallback

[`e5_all.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e5_stack/e5_all.png): row 1 progressive static stack, row 2 the static layers, row 3 cape
split, row 4 two-pass. Animated stack: [`anim_stack_sheet.png`](https://github.com/Shilo/PixelDoll/blob/v0.1.0/spikes/api/out/e5_stack/anim_stack_sheet.png).

- **Independent extraction and stacking works.** Static layers (inpaint-v3): cape 499 px, chest 229, hair 228, helmet 145, sword 135.
  Pairwise overlap is small where it should be: helmet+chest 2, chest+sword 0, helmet+sword 0. It is large where the items
  conflict semantically: hair+helmet 94, chest+hair 65, cape+sword 64. Those pairs need slot rules ("helmet hides hair") rather
  than pixel tricks.
- Animated helmet (edit-animation-v2) + chest (edit-animation-v2), each extracted against the same base frames: overlap is
  0/0/2/0/7/0/0/0 px per frame and the result composes coherently.
- **Cape front/back split by base silhouette:** front (over the silhouette) 45 px, which are the shoulder straps; back (outside
  the silhouette) 454 px. Drawing order back → base → front reproduces base+layer exactly. The rule "fg = layer ∩ base alpha,
  bg = layer − base alpha" is sound for south.
- **Two-pass "remove the character" from the cape composite:**
  - `edit-image-pro-flash` (5 gens) produced a full cape, *including* 667 plausible occluded pixels behind the body. 519 of the
    ~520 diff-layer pixels overlap it, 464 of them within Δ18. Composed behind the base, only 32 px outside the silhouette differ
    from the original composite. **This is usable as a back-layer fallback** when occluded pixels matter (north view, sway).
  - `edit-images-v2` shifted the cape 13 px up and drew another design (IoU 0.19). Reject it.

## E6 — Diff algorithm variants (offline, `e6_diff.mjs`)

Semi-synthetic benchmark with ground truth. Each composite is built as C = over(B_drift, L*):

- L* is a clean item layer (inpaint-v3, slot_thr18).
- B_drift is the base with **real** body redraw taken from other routes' composites (pf-edit, pf-inpaint, edit-images-v2),
  outside their item regions.

That gives 5 items × 3 drift sources. Bias warning: L* was itself made with slot_thr18, which flatters thr18 recall.

| Variant | Precision | Recall | F1 |
|---|---|---|---|
| exact (any change) | 0.45 | 1.00 | 0.62 |
| thr8 | 0.57 | 1.00 | 0.72 |
| thr18 (max-channel premultiplied >18 or alpha >16) | 0.67 | 1.00 | 0.80 |
| thr32 | 0.71 | 0.93 | 0.81 |
| hysteresis 40/8 | 0.62 | 1.00 | 0.76 |
| thr18 + connected components (min area 6) | 0.69 | 0.99 | 0.82 |
| thr18 + components overlapping slot | 0.71 | 1.00 | 0.83 |
| novel (palette novelty) | 0.74 | 0.94 | 0.82 |
| slot ∩ thr18 | 0.81 | 1.00 | 0.89 |
| slot ∩ novel + components | 0.85 | 0.93 | 0.89 |
| slot ∩ novel2 + components | **0.98** | 0.79 | 0.88 |
| **slot ∩ novel2 + components + grow 1 ring into Δ>18** | 0.945 | 0.977 | **0.961** |
| slot ∩ novel2 + grow 2 | 0.91 | 1.00 | 0.95 |
| auto (novel2-grow1, falling back to novel_cc) | 0.87 | 0.97 | 0.92 |

Real composites (`out/e6_diff/e6_results.json`) confirm the ranking: global thresholds pick up drift speckle everywhere (pf-edit
thr18: 45 components on average, 332 px outside the slot). Slot gating removes every out-of-slot pixel, and novelty filtering
roughly halves "base-color leakage" (pf-edit 39.7 % → 14–21 %).

**Failure mode of novel2:** leather brown is close to skin shading, so the chest lost 45–53 % of its pixels (holes). The `auto`
fallback keeps novel_cc when novel2 removes more than 25 % of the area. **Decide this per item across all frames, not per frame.**
Deciding per frame made chest frame 2 holey in the showcase.

"Drift repair" (treating small-delta pixels as unchanged) is exactly the thr18 / novelty step. Doing it at the source with
`target_palette` raised exact body pixels only to 26–34 %, so local repair is still required.

## E7 — Practicalities

### Costs (generations, Tier 3, 64×64)

| Operation | Cost | Latency |
|---|---|---|
| `create-character-v3` | 2 | 288 s |
| `create-character-with-4-directions` | 1 | 52 s |
| template animation | ~1 per direction | 70–140 s |
| `create-character-state` | 10 | 116 s |
| `estimate-skeleton` | ~0 (≤0.1) | 6 s, synchronous |
| `edit-image` | 1 | 17–51 s |
| `edit-image-pro-flash` | 5 | 31–51 s |
| `inpaint-image-pro-flash` | 5 | 31–59 s |
| `inpaint-v3` | 10 | 66–105 s |
| `edit-images-v2` (1 image) | 10 | 53–89 s |
| `edit-animation-v2` (8 or 16 frames) | **10** (same cost for 8 and 16) | 89–152 s |
| `transfer-outfit-v2` (8 frames) | 10 | 78–170 s |

Validation rejections (400/422) cost nothing. Pro Flash `/pro-flash/cost` predicted 5 for edit and inpaint at 64×64, which was
correct.

### Async behavior

- Every edit, inpaint and animation route returns 202 with `background_job_id`. Submit takes 0.8–3 s; poll
  `/background-jobs/{id}` until `status: completed`.
- Results are in `last_response`:
  - `images[]` holds `{type:"base64", base64:<PNG>, width, height}`.
  - `image` is used by edit-image and inpaint-v3.
  - Pro Flash adds `image_url` and `original_images`.
  - Managed characters and animations return public storage URLs, via `GET /characters/{id}` (`rotation_urls`,
    `animations[].directions[].frames[]`).
- **No raw RGBA was ever returned; everything was PNG.**
- **`edit-animation-v2` output equals `quantized_images`: it is quantized to 16 colors** (`original_image_n_colors` 106 →
  `quantized_image_n_colors` 16). That is one cause of the global body drift.

### Limits (server messages, verbatim)

- edit-animation-v2: "Too many frames: got 5 but image_size 92x92 supports at most 4 frames. Frame limits by output size: <=64px
  up to 16, 65-80px up to 9, 81-256px up to 4."
- edit-animation-v2: more than 16 items gives a 422 "List should have at most 16 items".
- transfer-outfit-v2: "supports at most 15 frames (one grid slot is used by the reference image) … 32-64px up to 15, 65-80px up to
  8, 81-256px up to 3."

So **keep the rig at ≤64 px**.

### Concurrency

- 24 Pro jobs submitted at once: 2 × 429 (retried after 5 s backoff), and all 24 completed.
- 16 concurrent `estimate-skeleton` calls were fine.

### Content policy

`inpaint-image-pro-flash` on the east-facing shirtless base failed: `code 5000 "Generation blocked by content policy … prompts
mentioning the body or skin are blocked most often"`, on 1 of 8 frames. **The base should wear a neutral tight top as well as
shorts**, and prompts should avoid "body/skin" wording. Our prompts say "body", so drop it.

The live template-animation id list is truncated ("…") in the OpenAPI description, so it could not be captured from the spec.

## Recommended pipeline for PixelDoll

1. **Base.**
   - Use `create-character-v3` from text at 64×64 (2 gens). It gives 8 consistent rotations at a canvas that fits the
     16-frame grid.
   - Prompt for a slightly smaller figure ("small character with space above the head"); the rotations had 2 px headroom.
   - Clothe the base: tank top/bodysuit + shorts.
   - Do not use the 4-direction route at 64 (it gives a 92 px canvas, so 4 frames per Pro call). Using it with a smaller
     `image_size` (~44 → ~62 px) is untested.
2. **Base animations.**
   - Template mode via `/characters/animations` (~1 gen per direction): `walking-8-frames`, `breathing-idle` (4 frames).
   - **Freeze the returned frame PNGs as the rig. Never use rotation images as layer bases.**
   - Run `estimate-skeleton` on every frame (free) and keep the per-frame keypoints with their z.
3. **Items: generate per item against the bare base, always.**

   | Slot class | Route | Cost per item | Notes |
   |---|---|---|---|
   | Headgear, face, hair | `edit-animation-v2`, 16 cells per call (mix directions/animations in one call for one design), **or** one masked `inpaint-v3` on frame 0 per direction + translation propagation (E8) | 10 per 16 cells, or 10 per direction | Mask/slot stops at the brow; hair gets an fg/bg split |
   | Torso, legs, feet (worn) | `transfer-outfit-v2` (15 cells per call, reference = an approved single-frame masked inpaint composite) or `edit-animation-v2` (16 cells) | 10 per 15–16 cells | Expect arm/skin speckle → torso slot excludes arms, or reject skin-material pixels |
   | Held weapon / shield | `transfer-outfit-v2` / `edit-animation-v2` batch; generous slot (whole hand-side half of the canvas) | 10 per 15–16 cells | Propagation only for low-motion clips; split fg/bg by silhouette + hand keypoint z |
   | Back items (cape, quiver, wings) | batch edit + fg/bg split by base silhouette; when occluded pixels are needed (north, sway): two-pass `edit-image-pro-flash` "remove the character" on the composite | 10 (+5) | Two-pass was good on the cape (32 px mismatch) |
   | Never | `edit-image` (ignores "add only"), `edit-images-v2` (shifts), per-frame inpaint for animated items (design flicker), state + animate for layers (not pixel-aligned) | | |

4. **Extraction (per cell).**
   - Slot rect from the skeleton.
   - Changed pixels = premultiplied max-channel Δ>8 or alpha Δ>16.
   - Item pixels = base empty **or** color within ±6 of the item core palette (colors added on empty canvas inside the slot)
     **or** color >12 from both the base palette and the composite's redrawn-body palette (learned outside the slot).
   - Connected components (8-connected), min area 3, must overlap the slot.
   - Grow 1 ring into pixels with Δ>18, then clip to the slot.
   - Fall back to `slot ∩ novel_cc` *per item* when novel2 removes more than 25 % of the area.
   - Layer = composite pixels where mask = 1, composited over the frozen base.
5. **QA gates (per item over all cells).**
   - Frame count, order and canvas are equal (alpha-IoU argmax check passed in 100 % of runs).
   - Layer area CV ≤ 0.15.
   - Adjacent-frame palette Jaccard ≥ 0.6.
   - Centroid relative to the anchor keypoint spreads ≤ 2 px.
   - No frame with less than 50 % of the median area (catches the inpaint-v3 deleted head).
   - Report out-of-slot drift as information only.
   - Bad cells: re-run the whole batch call; never patch a single cell with a different route.

## Honest failures and open questions

- Extracted layers still contain **some redrawn body pixels inside the slot**: the face under the helmet, arm edges in the chest.
  Masks need to be item-shaped (brow line, torso without arms), or need skin-material rejection with LPC-style ramps.
- PixelLab's quantization (16 colors) and redraw shift the item palette between calls. Per-item palette lock (`target_palette`
  / ramp snap) is still needed for recolors.
- Batch-route layers drift ±1 px per frame in centroid. This is acceptable visually, but the patch-tracking alignment could
  snap it.
- Untested:
  - north/west and 8-direction coverage;
  - attack animations (big arm motion: does the weapon stay in hand in edit-animation-v2?);
  - 92 px or 4-direction bases at smaller sizes;
  - whether the content-policy failure was charged;
  - skeleton-v3 base animations.
