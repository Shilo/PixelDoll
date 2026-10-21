# PixelDoll — Architecture (A1)

Author: A1 (architect) · Date: 2026-10-20 · Status: **Phase 3 synthesis, v1 draft**. Inputs: R1–R5 reports, SHARED_NOTES,
S1 interim outputs in `spikes/api/out/` (e0 probe, e1 base, e2 anim, e3 static helmet). The S1 report
(`docs/spikes/S1_api_feasibility.md`) did not exist yet, so decisions that depend on it are listed in §15 with the measurement
S1 must provide. Data model and export format: [`manifest-spec.md`](manifest-spec.md).

Evidence tags: **[S1]** measured in the live spike (interim), **[R1]–[R5]** research report, **[A1]** decision taken here.

---

## 1. Goals and non-goals

**Goals**

1. Produce **traditional frame-based paperdoll assets**: one frozen base body (directions × animations × frames on one fixed
   cell + pivot) plus any number of **frame-aligned, separately exportable item layers**. Every layer sheet has exactly the
   base's grid. Transparent cells are emitted, never omitted.
2. **Every pixel comes from PixelLab.** PixelDoll only crops, pads, masks, diffs, snaps colours, translates and composes. It
   never draws or resamples.
3. **Minimal human work.** One prompt per item. Masks, routes, extraction thresholds, QA and re-rolls run automatically.
   The human accepts, re-rolls or nudges a calibration knob.
4. **Correct output for Godot 4, Unity, Phaser 3/4 and generic engines**: per-layer sheets, a manifest, and per-engine glue.
5. **Fully client-side** on GitHub Pages. The browser calls `https://api.pixellab.ai/v2` directly with the user's key (CORS
   verified [R2]).

**Non-goals (v1)**

- Semantic segmentation of arbitrary composites, or "remove the body" two-pass AI extraction [R1 §6].
- Body-shape axis (male/female/child variants of one item). One base per project. An item is bound to its base by `baseHash`.
- Full-body outfit swaps presented as layers. `transfer-outfit-v2` output redraws the whole body (0 identical pixels, 76–98 %
  coverage [R1]). It is not used in v1.
- Oversize cells for weapon swings (LPC 128/192). Pixels outside the cell are clipped and QA warns.
- Bones, IK, anchor graphs (MapleStory/RO) [R4 R-3]. Semi-transparent VFX layers.
- Backend, accounts, sharing service. A packed multi-layer atlas export. Undo history beyond the session.

---

## 2. The rig contract

The rig is frozen once per project. Every PixelLab call that produces item pixels targets the **frozen base cells**, never a
previous composite (pip rule [R1]).

| Property | Decision | Rationale |
|---|---|---|
| Cell | **64×64** (allowed: 32×32). Square, no other sizes. | Pro grid routes fit **16 frames per call at ≤64 px** (9 at 65–80, 4 above) and bill per grid [R2]. `estimate-skeleton` accepts only 16/32/64/128/256 squares [R2]. Pro Flash edit/inpaint native sizes include 32×32 and 64×64 [S1 e0]. `create-character-v3` at `image_size` 64 returned a 64×64 canvas and template animations stayed 64×64 [S1 e1/e2]. The legacy 4-dir route returned **92×92** for size 64 [S1 e1] and must be cropped. A ~52 px tall character fits in 64 with room for a hat. |
| Directions | **4**: `south, east, north, west` with `west.mirrorOf = east` (3 generated). Option **8**: `south, south-east, east, north-east, north` generated; `south-west←south-east`, `west←east`, `north-west←north-east` mirrored. PixelLab `Direction` enum names everywhere. | UO/Habbo/RSC store 5 and show 8 [R4]. Mirroring saves 25–37 % of every generation. |
| Mirroring | A mirrored direction is a **horizontal flip of the source direction's frozen cells**: `x' = w−1−x` for pixels, `px' = w − px` for the pivot. An item has `mirror: "flip"` (default; flip its source-direction layer) or `"generate"` (generate real frames against the mirrored base cells: emblems, text, handed details). Exported sheets always contain **real pixels for every direction** (mirrored rows baked), so engines need no flip logic. | Handedness: a flipped right-hand sword becomes left-handed. That is accepted for `flip`; use `generate` when it matters. Habbo-style hand-slot swapping is skipped (add if a user needs strict handedness). |
| Animations | Default **`idle`** (template `breathing-idle`, 4 cells) and **`walk`** (template `walking-8-frames`, 8 cells) [S1 e2]. More (run, attack, hurt, death) are added from the **live template list**, stored as data, never hard-coded [R2]. | 4 + 8 = **12 cells per direction ≤ 16**, so a whole direction fits into one Pro grid call (§5.4). |
| Frame count | Whatever the base generation returned, **frozen per animation, identical across directions** (normalize or fail). Playback is a **playlist** `frames[{cell, ms}]` (LPC `cycle`): repeats and holds cost no generation. Default 100 ms per frame (idle 150 ms). | R3/R4/R5. |
| Pivot | One integer point per rig, **top-left origin, pixel-edge coordinates** (0..w). `x = w/2`; `y` = bottom edge of the lowest opaque row of `idle/south` cell 0 (ground contact). Same for every cell and layer. | Every engine converts from this (manifest-spec §6). Integer only (fralonra float bug [R5]). |
| Frozen base PNGs | After normalization (§5.2) each base cell is stored as a PixelDoll-owned PNG with **binary alpha** (0/255), hashed (SHA-256 of RGBA bytes). `baseHash` = SHA-256 over all base cell hashes in canonical order (animation, direction, cell). Any base change = new rig; items with another `baseHash` are flagged **stale**. | PixelLab "echo" frames are never exact [R1 F5]; layers are pre-occluded against one exact base [R3]. |
| Base body look | Neutral, clothed in plain underwear, bald, barefoot, arms slightly away from the body. | Nude south views are policy-rejected [R1 F9]. Bald + arms apart keeps hair/sleeve regions free. S1 base prompt passed. |

---

## 3. End-to-end pipeline

```
 A. Base     create-character-v3 (64, 4|8 dirs) ─▶ /characters/animations (templates) ─▶ download every frame immediately
             (or import user PNGs via direction_images)
 B. Freeze   normalize (crop/pad, never rescale) ─▶ binary alpha ─▶ pivot ─▶ estimate-skeleton per cell ─▶ anchors
             ─▶ hash ─▶ RIG FROZEN (baseHash)
 C. Item     slot + prompt ─▶ per-frame slot masks ─▶ route by item class (rigid | worn) ─▶ PixelLab calls (job queue)
 D. Extract  normalize ─▶ clamp outside mask to base ─▶ palette snap ─▶ diff (hysteresis) ─▶ components ─▶ body-material
             rejection ─▶ layer cell
 E. QA       gates per cell + temporal per direction ─▶ auto re-roll failing cells (max 2) ─▶ human accept/re-roll
 F. Split    wrap items: fg = layer ∩ base silhouette, bg = rest
 G. Compose  z ladder + sparse overrides + hides ─▶ live preview (same code bakes composites)
 H. Export   per-layer per-animation sheets + manifest.json + engine glue ─▶ zip
```

### 3.1 Base creation (A)

- Default route: `POST /create-character-v3` with `image_size {64,64}`, `view` (user choice, default `low top-down`),
  `template_id: mannequin`, `no_background: true`, explicit `seed`. S1: 2 generations, ~5 min [S1 e1].
- Base animation: `POST /characters/animations` `mode: template`, one call per animation with all stored directions.
  S1: walk ≈ 1.5 generations per direction, ~2 min; idle 4 frames [S1 e2]. Template vs `skeleton-v3` mode is open (§15 O6).
- Import path: user PNGs per direction via `direction_images` (0.25 generations, frames used as drawn [R1]) or raw PNG cells
  dropped into the rig editor. Same freeze step applies.
- Download every frame as soon as a job completes (jobs auto-delete [R2]). Storage CDN is CORS `*` [R2].

### 3.2 Freeze (B)

1. **Normalize** each returned frame to the cell: centre-align (PixelLab centres frames [R2]), then crop/pad. Never rescale.
   Fail if crop would cut opaque pixels. Record the offset.
2. **Binary alpha**: alpha ≥ 128 → 255 with RGB kept, else 0/0/0/0. Count semi-alpha pixels as a QA note.
3. **Pivot** from `idle/south` cell 0 (§2). Check every animation's south cell 0 has its lowest opaque row within ±1 px of the
   pivot; warn otherwise (feet drift).
4. **Skeleton**: `POST /estimate-skeleton` per stored cell (sync, 0.1 generation, 18 labels with normalized 0–1 `x,y` and
   `z_index` [S1 e3]). 3 dirs × 12 cells = 36 calls ≈ 3.6 generations. Managed `GET /characters/{id}.skeletons` gives only one
   3D pose, not per frame [S1].
5. **Anchors** per cell (used for item propagation and masks): `head` (mean of eyes/ears/nose), `neck`, `hand_r`/`hand_l`
   (`RIGHT ARM`/`LEFT ARM` = wrist), `hip`, `foot_r`/`foot_l` (`*_LEG` = ankle). Character-relative names (RIGHT = the
   character's right). Refined by **patch tracking** (§5.3).
6. **Base palette**: count colours; build/snap the `skin` ramp and other base materials (§7). Hash, freeze.

### 3.3 Items, masks, routes (C) — see §4 and §5.

### 3.4 Extraction (D)

Per cell, inputs: frozen base `B`, normalized composite `C`, slot mask `M`. Port of `spikes/api/lib/diff.mjs` (browser-portable).

1. **Shape gate**: `C` size = cell after normalization; alpha binarized.
2. **Clamp**: outside `M`, `C := B`. Masked routes are already byte-exact outside the mask [S1 e3: 0 changed pixels for
   `inpaint-image-pro-flash` and `inpaint-v3`; R1: 43/43]; this makes unmasked routes safe too.
3. **Palette snap** of `C` inside `M` to (base materials ∪ item materials) in OKLab, max distance τ_snap (§7).
4. **Diff**: premultiplied max-channel ΔRGB and Δalpha. **Hysteresis**: seed Δ > τ_hi (40), grow 4-connected into Δ > τ_lo (8),
   any Δalpha > 16 seeds [S1 `maskHysteresis`].
5. **Components**: 8-connected, keep components ≥ 3 px that overlap `M`; clip to `M` (`slot_hyst_cc` variant: residual
   16 px on the masked helmet [S1]).
6. **Body-material rejection** (default on): drop layer pixels that sit on base-opaque pixels and whose snapped colour belongs
   to a body material (skin). This removes the redrawn face/neck that masked inpaint bakes into a helmet layer [S1 e3 visual:
   face and shoulders inside the rect mask were redrawn]. Off for items that intentionally recolour skin (none in v1).
7. **Layer** = `C` pixels where the final mask is 1. **Erasures** (base opaque → composite transparent) cannot be represented by an
   over-layer: count them for QA (helmet masked: 0 [S1]).

τ_hi, τ_lo and τ_snap are the user-visible **calibration knob** (one slider "strict ↔ tolerant" mapping to presets) with a
diff heatmap (green added, red body changed, blue small drift, magenta erased; as `spikes/api/lib/diff.mjs heatmap`).

### 3.5 QA gates and metrics (E)

All metrics are stored per cell in `item.qa` (manifest-spec §2). Defaults are starting values to calibrate in
Phase 5.

| Gate | Metric | Default threshold | On fail |
|---|---|---|---|
| G1 Shape | canvas = cell after normalize; frame count = rig | exact | job failed, re-roll |
| G2 Locality | `outsideDrift` = pixels changed outside `M` before clamp | masked routes: 0 (else route broken, stop + report); unmasked: info only | masked: stop route |
| G3 Recompose | `residualPct` = pixels where `over(B, layer) ≠ C` inside `M` / layer area | ≤ 10 % | warn ≥ 10 %, fail ≥ 25 % |
| G4 Presence | `area` = layer pixels | ≥ 12 px (and ≥ 30 % of the direction's median area) | fail (item missing) |
| G5 Erasure | `erasures` inside `M` | ≤ 8 px | warn |
| G6 Temporal (per direction) | area vs direction median; centroid jump vs anchor motion; palette Jaccard vs keyframe | area ratio 0.6–1.6; jump ≤ 3 px after anchor compensation; Jaccard ≥ 0.4 | fail cell |
| G7 Palette | share of layer pixels snapped within τ_snap; colours per material | ≥ 90 %; ≤ ramp length | warn |
| G8 Clip | opaque layer pixels on the cell border | 0 | warn (oversize) |

Failing cells are re-rolled automatically (new seed, same route, **only those cells**), at most 2 times, then shown to the user as
`fail` with "accept anyway / re-roll / switch route". Rigid-class items pass G6 by construction.

### 3.6 fg/bg split for wrap-around items (F)

For slots with `split: true` (back, hair), after extraction, per cell:
`fg = layer ∩ baseOpaque`, `bg = layer − fg`. The fg part covered the body (cape on north, hair over the forehead, collar on
south); the bg part lies outside the silhouette (cape sides on south, hair beside the shoulders) and draws behind every other
item. Deterministic, free, no extra generation. Diff layers are already occluded against the base [R3], so this only matters
item-vs-item. Precision on capes and long hair is measured in Phase 5 (§15 O9).

### 3.7 Compose (G) and export (H)

The compositor builds a draw list per (animation, direction, playlist frame): visible layers (respecting `hides`), sorted by
resolved z (slot ladder → item override → sparse `zOverrides`), drawn with Canvas2D `drawImage` (nearest, no smoothing) at the
same origin. The preview and the optional `baked/` composites use the same function. Export: manifest-spec §5–§6.

---

## 4. Slot taxonomy, z ladder, hides

**Equip slot vs drawn layer.** A slot is what can be equipped (one item per slot, mutual exclusion). An item emits 1..n drawn
layers (`main`, or `fg` + `bg`), each with its own z [R4 R-1, LPC `layer_N`].

Default slots (16; data, user-editable). z ladder with gaps of 10; bg layers sit below the body.

| Slot | Class | Anchor | fg z | bg z | Default hides | Typical items |
|---|---|---|---|---|---|---|
| `body` | base (required) | — | 10 | — | — | the frozen base |
| `feet` | worn | foot | 20 | — | — | boots, shoes |
| `legs` | worn | hip | 30 | — | — | pants, skirt |
| `torso_inner` | worn | neck | 40 | — | — | shirt, tunic |
| `waist` | worn | hip | 50 | — | — | belt, sash |
| `torso_outer` | worn | neck | 60 | — | — | armour, robe, coat |
| `shoulders` | rigid | neck | 65 | — | — | pauldrons, mantle |
| `arms` | worn | hand | 70 | — | — | gloves, bracers |
| `neck` | rigid | neck | 80 | — | — | amulet, scarf |
| `back` | worn, split | neck | 90 | 4 | — | cape, backpack, quiver |
| `facial_hair` | rigid | head | 100 | — | — | beard, moustache |
| `hair` | rigid, split | head | 110 | 3 | — | hair (long hair: worn) |
| `face_acc` | rigid | head | 120 | — | — | glasses, mask |
| `head` | rigid | head | 130 | — | `hair` (per item, off by default) | hat, helmet, hood |
| `off_hand` | held | hand_l | 140 | 2 | — | shield, torch |
| `main_hand` | held | hand_r | 150 | 1 | — | sword, staff |

- **Sparse overrides** `{layer, z, dir?, anim?, cell?}` on a slot cover the classic exceptions (UO cloak-by-direction, RO
  shield-behind [R4 R-2]), e.g. `main_hand` fg z 85 on `north` so the cape covers the weapon arm. Per-cell entries are allowed
  but should be rare; prefer the fg/bg split [R3, R4].
- **Hides as data**: `slot.hides` (default) and `item.hides` (override). A visible item hides all layers of the listed slots
  (full helmet → `hair`; robe → `legs`). No hard-coded rules (UO anti-pattern [R4 R-7]).
- `required`: only `body`. Every other slot may be empty.

**Item-vs-item order policy [A1]**: every item is generated **against the bare frozen base**, never against base + other items.
Items stay independent and freely combinable; order between items comes only from the z ladder, overrides, split and hides.
"Dress order" generation (outer item on top of inner items) is rejected: it makes every item depend on a specific inner item
(combinatorial regeneration). Known artefact: an inner item wider than an outer item shows at its edges, as in every layered game.

---

## 5. Item generation strategy

### 5.1 Item classes

| Class | Slots | Route | Cost per item (3 stored dirs, 12 cells/dir) |
|---|---|---|---|
| **rigid** | head, face_acc, facial_hair, hair, neck, shoulders | **Keyframe + propagate**: one masked call on `idle` cell 0 per stored direction → extract → copy the layer into every other cell, translated by the anchor delta (§5.3). Zero AI calls per frame. | 3 × `inpaint-image-pro-flash` = **15 gens** |
| **held** | main_hand, off_hand | Same as rigid with the hand anchor for animations marked `rigidOk` (idle, walk). Animations where the held item rotates (attack) use the worn route for that animation only. | 15 gens + worn route per action animation |
| **worn** | feet, legs, torso_inner, waist, torso_outer, arms, back, long hair | **Per-frame generation** with clamp + extraction. Route A (default until S1 says otherwise): one `edit-animation-v2` call per stored direction with all ≤16 cells packed, `target_palette` = materials, then clamp outside `M` (§3.4). Route B (repair): per-cell `inpaint-image-pro-flash` with mask. | A: 3 × 10 = **30 gens**; B: 36 × 5 = 180 gens |

Rigid propagation is the cheapest route and gives perfect temporal consistency (LPC/lpctools `distribute`, Terraria/Stardew
per-frame offsets [R4, R5]). Its ceiling is head/hand rotation; cells that fail G3/G4 after propagation are escalated to route B.

### 5.2 Normalizing returns

Every PixelLab image is normalized like base frames: crop/pad, never rescale, binary alpha, verify size. Read `paste_x`,
`paste_y`, `canvas_growth` from Pro Flash jobs [R1] (S1: 0/0/false at 64×64). Always send `no_background: true` explicitly
(defaults differ per route [R1 F8]). Multi-frame routes: frame order in = frame order out, else G1 fails.

### 5.3 Anchors and propagation

Anchor delta between the keyframe cell and cell *k* = integer translation (search ±4 px) that minimizes the sum of absolute
differences between the **base** patch around the keyframe anchor (head: the head mask region; hand: 9×9 around the wrist) and
the base cell *k*. Keypoints only seed the search. This uses the exact frozen base pixels, so it is free and does not jitter
like keypoint estimates. The propagated layer is clipped to the cell; pixels that would land on base-transparent area where the
keyframe had base-opaque support are kept (hats overhang).

### 5.4 Grid packing (route A)

At 64 px one `edit-animation-v2` call takes 2–16 frames and bills one grid (10 gens) [R2]. Pack **all cells of one stored
direction** (idle 4 + walk 8 = 12). Prompt template (pip, ≤500 chars [R1 §6.12]): identity + direction + item + body region +
placement + "keep every other pixel unchanged". Whether mixing animations in one grid hurts consistency is §15 O8. More than 16
cells per direction → split by animation.

### 5.5 Slot region masks

Masks serve three purposes: the `mask_image` of masked routes (white = generate, black = keep [R2]), the clamp region for unmasked
routes, and the extraction region. One mask per (item, cell), derived automatically:

```
M = grow( shape(slot, keypoints of the cell), slot.grow ) ∩ (slot.worn ? grow(baseOpaque, 2) : everything)
```

| Slot | Shape (keypoint-relative, character-right = image-left on south) |
|---|---|
| head / hair / face_acc / facial_hair | box: x = ears ± 0.6·earDist, y = top of silhouette in that column band − 6 … nose + 0.5·earDist (hair: … shoulder y + 4) |
| neck / shoulders | box shoulders ± 3, y = neck − 3 … shoulder + 4 |
| torso_inner / torso_outer | polygon shoulders → hips, ± 3 px (outer: ± 5, down to knees for robes via `item.maskExtend`) |
| arms | capsules shoulder → elbow → wrist, r = 3 |
| waist | box hips ± 4, y = hip − 3 … hip + 3 |
| legs | capsules hip → knee → ankle, r = 4 |
| feet | box ankles ± 4, y = ankle − 2 … cell bottom |
| back | torso polygon + 8 px sideways, down to knees |
| main_hand / off_hand | circle at the wrist r = 6 + item `reach` box outward (default 20 px) |

Masks are rendered pixel-exact in the UI (overlay) and can be repainted on the keyframe of each direction; the edit is translated
to the other cells like a rigid layer. Missing keypoints → fallback to silhouette bounding-box fractions (head = top 28 % …).
S1 interim lesson: the rect helmet mask included neck and shoulders, which were redrawn; templates must stop at the neck.

---

## 6. Masked route choice

| Route | Locality [S1] | Cost/latency at 64² [S1] | Use |
|---|---|---|---|
| `inpaint-image-pro-flash` (default `output_method`) | **exact outside mask** (0 px), border clean | 5 gens, ~31 s | **default masked route** |
| `inpaint-v3` | exact outside mask (bug seen in July looks fixed) | 10 gens, ~105 s | fallback if Pro Flash rejects a size |
| `output_method` "New layer with changes" / "…only changes" | transparent outside mask, but **still contains redrawn body pixels** inside it (~30 of ~200 identical to base, face redrawn) | 5 gens | not used: no extra information vs the composite, and local diff is still required. One code path. |
| `edit-image`, `edit-images-v2`, `edit-image-pro-flash` (unmasked) | whole body redrawn (670–728 px changed outside the helmet box) | 1 / 10 / 5 gens | only via clamp; `edit-image` turned the whole body into armour once [S1 e3] |

---

## 7. Colour model

- **Materials** = indexed source ramps, ordered shadow → highlight, colours **unique across materials** (LPC/Vitruvian [R5]):
  base: `skin` (6), `eyes` (3), `underwear` (4); per item ≤ 3 materials of 3–6 colours (`cloth_1`, `leather`, `metal`, `hair`…).
- **Getting AI output into ramps**: pass the item's ramps plus the base ramps as `target_palette` (edit-animation-v2,
  transfer-outfit-v2, characters/animations, states) or `color_image` + `force_colors` (legacy routes) [spec]. Masked inpaint
  routes have no palette field, so all outputs are **snapped locally**: nearest ramp colour in OKLab within τ_snap (default ΔE
  0.08); pixels beyond τ_snap keep their colour and count against G7. `/reduce-colors` with `palette_image` (0.1 gen) is the
  fallback if local snap proves too weak.
- **Ramp creation**: the first accepted keyframe of an item defines its ramps: k-means (k = material count × ramp length) on the
  layer in OKLab, sorted by lightness per cluster group. The user can rename/merge materials. Base ramps come from the frozen base.
- **Recolor regions = materials.** Recolor is exact-match index swap source ramp → variant ramp. `linkTo` makes a material follow
  another (beard → hair, ears → skin) [R5]. No masks needed because ramps are disjoint. Multiply tint only as an engine option.
- **Export**: sheets in source ramps + `materials` in the manifest (+ tiny per-engine swap shader); optional baked variants.

---

## 8. Project storage (browser)

- **IndexedDB** (one DB `pixeldoll`), three stores: `projects` (manifest JSON + QA), `blobs` (PNG `Blob`, key = SHA-256,
  content-addressed, so re-rolls and identical cells dedupe), `jobs` (ledger, §9). OPFS is skipped: IndexedDB stores blobs fine at
  this scale (one project ≈ 16 slots × 3 dirs × 12 cells × 64² ≈ a few MB). Call `navigator.storage.persist()` on first save.
- Cells are stored individually; sheets are assembled only at export.
- **Project zip** (export/import, the backup and share format): `project.json` (manifest + QA + provenance, never the key) +
  `cells/<sha256>.png`. Import verifies every hash. Zip writer/reader in ~100 lines over native `CompressionStream`/
  `DecompressionStream('deflate-raw')` + CRC32 (store mode for PNGs). No dependency; swap to `fflate` if bugs appear.
- PNG decode: `createImageBitmap(blob, {premultiplyAlpha: 'none', colorSpaceConversion: 'none'})` → `OffscreenCanvas`
  `getImageData`. Encode: `OffscreenCanvas.convertToBlob({type: 'image/png'})`. Safe because alpha is binary.

## 9. Job queue

- **One queue** for all PixelLab calls. Concurrency user-set 1–8, default **3**; on 429 drop to `max(1, n−1)` and retry later.
- **Backoff** (`Retry-After` is not readable from JS [R2]): exponential with jitter, 2 s → 60 s, on 429/529/5xx/network errors
  **of the submit**. 423 on export routes: same. 401 → stop queue, ask for key. 402 → stop queue (out of credits). 422 → terminal
  (free [R1]). `last_response.code 5000` (policy) → terminal, never retried [R1 F9].
- **Polling** every 5 s (status words are open-ended; completion = result present [R1]); show `queue_position` /
  `estimated_wait_seconds`.
- **Persist first**: the ledger entry (endpoint, params without images and key, input hashes, request hash, seed) is written before
  submit; `background_job_id` right after submit; result PNGs to `blobs` the moment the job completes, before extraction.
  On reload, pending jobs resume polling. **A job with an id is never resubmitted** because a poll failed. A 404 after completion
  with no saved result → `lost` (warn; cost spent).
- **Request-hash cache**: identical endpoint + params + input hashes + seed → reuse the stored result instead of paying again.
- **Cost**: per-job `usage` from the completed job (S1: Pro Flash 5 gens, inpaint-v3 10, edit-images-v2 10, edit-image 1,
  estimate-skeleton 0.1, template animation reported in USD). `/balance` snapshot before and after each batch for
  reconciliation; a static estimate table (data, from observed usage, refreshed by `/pro-flash/cost`) drives a pre-flight
  "this will cost ~N generations" confirm when N > user threshold (default 20). Never hard-code prices [R1 F16].
- **Cancel** = `DELETE /background-jobs/{id}`, user-initiated only.

## 10. API key handling

- Held in memory by default. Opt-in checkbox "remember on this device" → `localStorage` (cleared by "forget key").
  Never in URLs, never in the project zip, ledger, provenance or logs.
- Sent only as `Authorization: Bearer` to `https://api.pixellab.ai`. A `<meta http-equiv="Content-Security-Policy">` restricts
  `connect-src` to `api.pixellab.ai` and `*.pixellab.ai` storage, so a compromised dependency cannot exfiltrate it.
- UI warning: the API accepts any origin, so a leaked key is usable anywhere [R2]; rotate at pixellab.ai/account.

---

## 11. Module breakdown (`app/src/lib`)

| Module | Files | Responsibility |
|---|---|---|
| `pixellab/` | `client.ts` (fetch, auth header, error classes), `routes.ts` (typed builders for the ~10 routes used: create-character-v3, characters/animations, GET characters/{id}, estimate-skeleton, inpaint-image-pro-flash, inpaint-v3, edit-animation-v2, balance, background-jobs), `queue.ts` (§9) | No SDK [R2]. Types hand-written from `pixellab-openapi-v2.json` for used routes only. |
| `image/` | `png.ts` (decode/encode, binary alpha), `diff.ts` (deltas, hysteresis, components, heatmap — port of spike `diff.mjs` + its self-test), `masks.ts` (slot shapes, grow, rasterize), `extract.ts` (§3.4), `palette.ts` (OKLab, snap, k-means ramps, recolor), `qa.ts` (§3.5), `hash.ts` (SHA-256 via `crypto.subtle`) | Pure functions over `{w, h, data: Uint8ClampedArray}`. Main thread (36 cells × 64² is trivial); move to a Worker only if profiling says so. |
| `rig/` | `rig.ts` (contract, validation), `normalize.ts` (crop/pad, pivot), `skeleton.ts` (keypoints → anchors, patch tracking), `mirror.ts` | Owns the frozen base. |
| `compose/` | `compose.ts` (resolve z, hides, draw list, Canvas2D render), `split.ts` (fg/bg) | Shared by preview and baked export. |
| `export/` | `sheets.ts` (cells → per-layer per-animation PNG), `generic.ts` (manifest, strips), `godot.ts` (.tres/.tscn/.gd text), `unity.ts` (importer C# + runtime C# as template strings), `phaser.ts` (JSON-Hash atlas + container JS), `aseprite.ts` (layered .aseprite writer; second wave) | Pure "manifest + cells → files" functions; zip via `store/zip.ts`. |
| `store/` | `db.ts` (IndexedDB), `project.ts` (Svelte 5 runes store, command-based edits), `zip.ts` | Single source of truth = manifest + blobs. |
| UI (`app/src/ui/`) | Key/balance bar, Rig editor (grid dirs × anims), Item lab (mask overlay, heatmap, QA table, knob), Dress-up (slot carousel, preview, palette), Export dialog | Three-pane builder [R5]. |

Each pure module keeps one runnable self-check (the spike pattern: `selfTest()` with `console.assert`).

---

## 12. Cost model (64 px, 4 dirs → 3 generated, idle+walk)

| Step | Generations (S1 interim) |
|---|---|
| Base character v3 | 2 |
| Base animations (2 templates × 3 dirs) | ≈ 9 |
| Skeleton (36 cells) | 3.6 |
| **Base total** | **≈ 15** |
| Rigid item | 15 |
| Worn item, route A / route B | 30 / 180 |
| 10-item character (6 rigid, 4 worn A) | ≈ 225 |

Tier 2 ≈ 2000 generations/month [R2], so route B for every worn item is not affordable as the default; it stays a per-cell repair.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Body redraw inside the mask baked into layers | Tight masks stopping at the neck; body-material rejection (§3.4.6); G3. |
| Temporal inconsistency of worn items | Grid route (one call per direction, PixelLab's own frame consistency); G6; per-cell re-roll; rigid propagation wherever possible. |
| Masked route drifts outside the mask (regression) | G2 is a hard gate for masked routes; inpaint-v3 as fallback. |
| Grid route redraws the body (no preservation promise) | Clamp outside `M` is a local copy of frozen base pixels; inside `M`, hysteresis + body-material rejection; route B repair. |
| Wrong item-vs-item order | Static ladder + split + sparse overrides + hides; preview every direction before export. |
| Base change invalidates items | `baseHash` on every item; stale badge; "regenerate for new base" re-runs stored prompts/seeds. |
| Palette noise (hundreds of colours) | `target_palette` where possible; local OKLab snap; G7. |
| Template list / prices change | Data files refreshed from live API; usage read from jobs. |
| Concurrency limits, stuck jobs, policy rejects | Adaptive concurrency, backoff, persisted ledger, terminal policy state. |
| Key leakage | Memory default, CSP `connect-src`, never serialized. |
| Oversize items clip at 64 px | G8 warning; document; oversize cells are a later feature. |
| Handedness on mirrored directions | `mirror: "generate"` per item. |

---

## 14. Mockup plan (Phase 4, functional, ugly is fine)

| # | Mockup | Must prove |
|---|---|---|
| M1 | **Key + queue** | Browser-direct calls with a pasted key; `/balance`; submit a base (v3) + 2 template animations; ledger in IndexedDB survives reload mid-job; cost per job shown; key never in storage unless opted in. |
| M2 | **Rig freeze** | Frames downloaded, normalized to 64×64, pivot computed, skeleton per cell, anchors via patch tracking, `baseHash`; grid view dirs × anims with playlist playback; west mirrored. |
| M3 | **Item lab** | Slot masks per cell (overlay), rigid route (keyframe + propagate) and worn route A with clamp, extraction with knob + heatmap, QA table per cell, auto re-roll of failing cells, fg/bg split. Measures §15 O1/O2/O9 on real items (helmet, hair, chest, cape, sword). |
| M4 | **Dress-up** | 4–6 items composed with z ladder, overrides, hides; recolor via material ramps; animated preview in all directions; stale detection on base swap. |
| M5 | **Export round-trip** | Zip with manifest + sheets + Godot `.tres/.tscn/.gd` + Phaser atlas JSON; loaded in a minimal Godot 4 project and a Phaser page; layers stay in sync and pivots match (Phase 5 verifies Unity importer and `.aseprite`). |

---

## 15. Open decisions waiting on S1 (and Phase 5)

| # | Decision | Options | Criterion S1 must answer | Default until then |
|---|---|---|---|---|
| O1 | Worn-item route | A: `edit-animation-v2` per direction (≤16 cells) + clamp + diff · B: per-cell masked Pro Flash inpaint, fixed seed · C: masked keyframe, then `edit-images-v2 edit_with_reference` with the dressed keyframe | Per route on chest, pants, boots, cape over 8 walk cells: G3 residual, G6 pass rate (area ratio, centroid jump, palette Jaccard), drift inside the mask after hysteresis, gens per *accepted* cell | A, B as repair |
| O2 | Rigid propagation validity | translate-only by anchor patch tracking vs per-cell generation | On helmet/hair over idle+walk: G3/G4 pass rate of propagated cells; visual head-bob match | propagate |
| O3 | Masked route | Pro Flash inpaint vs inpaint-v3 | Locality repeatability over ≥ 5 items/dirs (sword reaching outside the silhouette, cape) | Pro Flash |
| O4 | Base creation route | v3 (64→64, 2 gens) vs legacy 4/8-dir (64→92, 1 gen) vs Pro | South passes policy; identity; canvas behaviour on all dirs; 8-dir cost | v3 |
| O5 | Mixed-animation packing in one grid | pack idle+walk per direction vs one call per animation | Consistency of the item between the two animations inside one grid vs separate calls | pack |
| O6 | Base animation mode | template vs `skeleton-v3` | Frame-to-frame body stability (identical pixels across frames, palette), feet line drift | template |
| O7 | Palette forcing | `target_palette` strictness on edit-animation-v2; local snap ΔE | % of layer pixels inside ramps before/after snap | local snap always |
| O8 | Skeleton accuracy | estimate-skeleton per cell vs patch tracking only | Keypoint jitter on static parts across idle cells (px) | keypoints seed, patch tracking decides |
| O9 | fg/bg split rule | silhouette rule vs keypoint `z_index`-assisted | On cape/long hair (S1 already has `cape`/`hair` edit-image runs): visual correctness against `torso_outer` and `main_hand` in all dirs | silhouette rule |
| O10 | Concurrency default | 3 vs tier-dependent | Observed 429 threshold and latency under parallel load | 3, adaptive |

Already settled by S1 interim data: canvas 64 (v3 keeps 64×64); estimate-skeleton coordinates are normalized 0–1 with 18
labels; masked Pro Flash and inpaint-v3 are byte-exact outside the mask; changes-only `output_method` adds nothing over local
diff; unmasked edits redraw the whole body.
