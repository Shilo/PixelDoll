# PixelDoll — Architecture (A1)

Author: A1 (architect) · Date: 2026-10-20 · Status: **Phase 3 synthesis, v1.1** (updated with the final S1 report
[`spikes/S1_api_feasibility.md`](spikes/S1_api_feasibility.md)). Inputs: R1–R5 reports, SHARED_NOTES, S1. Spike S2 is running
(§15). Data model and export format: [`manifest-spec.md`](manifest-spec.md).

Evidence tags: **[S1]** measured live, **[R1]–[R5]** research report, **[A1]** decision taken here.

---

## 1. Goals and non-goals

**Goals**

1. Produce **traditional frame-based paperdoll assets**: one frozen base body (directions × animations × frames on one fixed
   cell + pivot) plus any number of **frame-aligned, separately exportable item layers**. Every layer sheet has exactly the
   base's grid. Transparent cells are emitted, never omitted.
2. **Every pixel comes from PixelLab.** PixelDoll only crops, pads, masks, diffs, snaps colours, translates and composes. It
   never draws or resamples.
3. **Minimal human work.** One prompt per item, one optional design approval. Slot regions, routes, extraction, QA and
   re-rolls run automatically. The human accepts, re-rolls or nudges a calibration knob.
4. **Correct output for Godot 4, Unity, Phaser 3/4 and generic engines**: per-layer sheets, a manifest, and per-engine glue.
5. **Fully client-side** on GitHub Pages. The browser calls `https://api.pixellab.ai/v2` directly with the user's key (CORS
   verified [R2]).

**Non-goals (v1)**

- Semantic segmentation of arbitrary composites. Body-shape axis (one base per project; items bound to it by `baseHash`).
- Layers made from **character states** (`create-character-state` + animate): same poses but not pixel-aligned (815–891 px
  changed per frame) [S1]. States are only previews or transfer-outfit references.
- Full-body outfit swaps presented as a base replacement. Oversize cells for weapon swings (clipped, QA warns).
- Bones, IK, anchor graphs [R4 R-3]. Semi-transparent VFX layers. Backend, accounts, packed atlases.

---

## 2. The rig contract

The rig is frozen once per project. Every PixelLab call that produces item pixels targets the **frozen base animation
cells**, never a previous composite and **never the rotation images**.

| Property | Decision | Rationale |
|---|---|---|
| Cell | **64×64** (allowed: 32×32). Square. | Pro batch routes fit 16 frames (edit-animation-v2) / 15 + reference (transfer-outfit-v2) at ≤64 px, 4 above 80 px, **same cost for 8 or 16 frames** (10 gens) [S1, server limit messages]. `create-character-v3` at 64 keeps a 64×64 canvas; the 4-direction route gives 92×92 → only 4 frames per call → rejected [S1]. |
| Directions | **4**: `south, east, north, west` with `west.mirrorOf = east` (3 generated). Option **8**: 5 generated + 3 mirrored. PixelLab `Direction` names. | UO/Habbo/RSC store 5, show 8 [R4]. Only south/east measured so far; north/west in S2. |
| Mirroring | A mirrored direction is a horizontal flip of the source direction's frozen cells (`x' = w−1−x`, pivot `px' = w − px`). Item `mirror: "flip"` (default) or `"generate"` (asymmetric details; generate against the mirrored base cells). Exported sheets always contain real pixels for every direction. | Handedness flips with `flip`; accepted. |
| Animations | Default **`idle`** (template `breathing-idle`, 4 cells) and **`walk`** (`walking-8-frames`, 8 cells) [S1]. More from the live template list (data, never hard-coded; the spec list is truncated [S1]). | 12 cells per direction. |
| Cells come from animations | **Template animations re-render the whole body every frame** (<5 % of pixels stable even in idle) and **frame 0 ≠ the rotation image** (body 3–4 px shorter) [S1]. So the canonical rig = the returned animation frames; layers are produced per animation frame; rotations are only used to start animations. | [S1 E2] |
| Frame count | As returned, frozen per animation, identical across directions. Playback is a **playlist** `frames[{cell, ms}]` (LPC `cycle`). Defaults 100 ms (walk), 150 ms (idle). | R3/R4/R5. |
| Pivot | Integer, top-left origin, pixel-edge coordinates. `x = w/2`; `y` = bottom edge of the lowest opaque row of `idle/south` cell 0. | Engine conversions in manifest-spec §6. |
| Headroom | **≥ 6 px** free above the head in every cell, else hats and hair clip. Rotations came back with only **2 px** headroom; animation frames had 5–7 px [S1]. Base prompt asks for "a small character with space above the head"; G8 checks it at freeze. S2 measures the fix. | [S1 E1/E2] |
| Frozen base PNGs | Normalized (centre-align, crop/pad, never rescale), binary alpha, SHA-256 per cell; `baseHash` over all cells. A new base = new rig; items with another `baseHash` are **stale** (two characters animated with the same template align only to ±1–3 px [S1]). | |
| Base body look | Bald, barefoot, **neutral tight top (tank top/bodysuit) + shorts**, arms slightly away from the body. Prompts never say "body"/"skin". | A shirtless base got a `code 5000` policy block on 1/8 frames; nude bases fail on south [S1, R1]. |

---

## 3. End-to-end pipeline

```
 A. Base     create-character-v3 (64) ─▶ /characters/animations (template, ~1 gen/dir) ─▶ download frames immediately
 B. Freeze   normalize ─▶ binary alpha ─▶ pivot + headroom check ─▶ estimate-skeleton per cell (free) ─▶ slot rects,
             anchors ─▶ hash ─▶ RIG FROZEN
 C. Item     slot + prompt ─▶ route by item class (§5): batch edit (default) | keyframe + propagate (rigid)
 D. Extract  slot rect ∩ palette-novelty diff ─▶ components ─▶ 1-px ring ─▶ per-item fallback ─▶ layer over frozen base
 E. QA       per-item temporal gates over all cells ─▶ re-roll the whole batch call, never patch one cell
 F. Split    wrap items: fg = layer ∩ base alpha, bg = rest
 G. Compose  z ladder + sparse overrides + hides ─▶ live preview (same code bakes composites)
 H. Export   per-layer per-animation sheets + manifest.json + engine glue ─▶ zip
```

### 3.1 Base (A) and freeze (B)

- `POST /create-character-v3`, `image_size {64,64}`, `template_id: mannequin`, `no_background: true`, explicit seed: 2 gens,
  ~290 s [S1]. Import path: user PNGs via `direction_images` (0.25 gens) or dropped cells; same freeze.
- `POST /characters/animations` `mode: template`, all stored directions: ~1 gen per direction, 70–140 s [S1]. The south template
  walk has a weak stride; acceptable for v1.
- Download every frame as soon as the job completes (jobs auto-delete [R2]). For Pro Flash results use base64 `images[0]`,
  not `image_url` (differs inside the mask) [S1].
- `POST /estimate-skeleton` per stored cell: synchronous, ~6 s, ~0 gens, 18 labels, normalized x/y, `z_index` (far arm on
  east = −4) [S1]. 16 concurrent calls were fine. Keypoints give slot rects (§5.4) and anchors (`head`, `neck`, `hand_r`,
  `hand_l`, `hip`, `foot_r`, `foot_l`; RIGHT = the character's right).

### 3.2 Extraction (D) — S1 extractor (`slot_novel2_grow1` + `auto`), per cell

Inputs: frozen base `B`, normalized composite `C`, slot rect `S` for this cell. Port of `spikes/api/lib/{diff,extract}.mjs`.

1. **Changed** = premultiplied max-channel Δ > 8 or Δalpha > 16.
2. **Item colour test**, a changed pixel is item if: base is empty there, **or** its colour is within ±6 of the item **core
   palette** (colours added on empty canvas inside `S`), **or** it is > 12 from both the base palette and the composite's
   **redrawn-body palette** (learned from changed pixels outside `S`).
3. **Components**: 8-connected, min area 3, must overlap `S`.
4. **Ring**: grow 1 px into pixels with Δ > 18, then clip to `S`.
5. **Per-item fallback**: if step 2 removes > 25 % of the area that `S ∩ novel_cc` would keep, use `S ∩ novel_cc` for **all cells
   of the item** (decided per item, not per cell; per-cell choice made a holey chest frame [S1]).
6. **Layer** = `C` pixels under the final mask. Output is always `over(B, layer)`; the composite's body is never used, which is
   what makes batch-route body drift harmless.

Semi-synthetic benchmark: precision 0.945, recall 0.977, F1 0.961 (global thr18 alone: F1 0.80) [S1 E6]. Known weakness: item
colours close to skin shading (leather) lose pixels → holes. **Not yet production-clean** (§13). τ values (8/16/±6/12/18,
25 %) are the user-visible calibration knob, with the S1 heatmap (green added, red body changed, blue drift, magenta erased).

### 3.3 QA gates (E) — per item over all its cells

| Gate | Metric | Threshold [S1] | On fail |
|---|---|---|---|
| G1 Shape | frame count, order (alpha-IoU argmax), canvas | exact (100 % pass in S1) | re-roll call |
| G2 Area stability | layer area coefficient of variation | ≤ 0.15 | re-roll |
| G3 Design stability | adjacent-cell palette Jaccard | ≥ 0.6 | re-roll |
| G4 Placement | spread of layer centroid relative to the slot anchor | ≤ 2 px | re-roll |
| G5 Presence | min cell area / median area | ≥ 0.5 (catches deleted heads) | re-roll |
| G6 Overlap | pixels shared with items it does not `hides` | info, shown per pair | user sets hides/z |
| G7 Clip | opaque layer pixels on the cell border (headroom) | 0 | warn |
| — | out-of-slot body drift | info only | — |

A failing item **re-runs the whole batch call** (new seed). A single cell is never patched with a different route: per-frame
routes change the design (§6). Two automatic re-rolls max, then the user decides. Metrics land in `item.qa` (manifest-spec §2).

### 3.4 fg/bg split for wrap-around items (F)

Slots with `split: true` (back, hair, held items): `fg = layer ∩ baseOpaque`, `bg = layer − fg`. Verified on the south cape:
fg 45 px (straps), bg 454 px; drawing bg → base → fg **reproduces base+layer exactly** [S1 E5]. Held items may refine with the
hand keypoint `z_index` (far hand behind) — later, only if needed. When occluded pixels matter (cape on north, sway), the
**two-pass fallback** runs `edit-image-pro-flash` "remove the character" on the composite (5 gens): it produced a full cape incl.
667 occluded px, 32 px mismatch outside the silhouette [S1]. Batch two-pass is in S2.

### 3.5 Compose (G) and export (H)

Draw list per (animation, direction, playlist frame): visible layers (respecting `hides`), sorted by resolved z, Canvas2D
`drawImage` without smoothing at one origin. Preview and `baked/` composites share it. Independent extraction stacks
coherently: animated helmet + chest overlap 0–7 px per frame [S1 E5]. Export: manifest-spec §5–§6.

---

## 4. Slot taxonomy, z ladder, hides

A slot is what can be equipped (one item per slot). An item emits 1..n drawn layers (`main`, or `fg` + `bg`), each with its own z.

| Slot | Class | Anchor | fg z | bg z | Default hides | Slot rect (from keypoints) |
|---|---|---|---|---|---|---|
| `body` | base | — | 10 | — | — | — |
| `feet` | worn | foot | 20 | — | — | ankles ± 4 → cell bottom |
| `legs` | worn | hip | 30 | — | — | hips → ankles, ± 4 |
| `torso_inner` | worn | neck | 40 | — | — | shoulders → hips, **excluding arm capsules** |
| `waist` | worn | hip | 50 | — | — | hip line ± 3 |
| `torso_outer` | worn | neck | 60 | — | — | as torso_inner, ± 5, to knees with `item.rectExtend` |
| `shoulders` | worn | neck | 65 | — | — | shoulder line ± 4 |
| `arms` | worn | hand | 70 | — | — | capsules shoulder → wrist, r 3 |
| `neck` | rigid | neck | 80 | — | — | neck → shoulders, ± 3 |
| `back` | worn, split | neck | 90 | 4 | — | torso + 8 px sideways, to knees |
| `facial_hair` | rigid | head | 100 | — | — | nose → chin |
| `hair` | rigid, split | head | 110 | 3 | — | head box above the **brow**, + sides to shoulders |
| `face_acc` | rigid | head | 120 | — | — | eyes ± 3 |
| `head` | rigid | head | 130 | — | `hair` (per item) | head box above the **brow** − 6 px |
| `off_hand` | held, split | hand_l | 140 | 2 | — | **whole hand-side half of the cell** |
| `main_hand` | held, split | hand_r | 150 | 1 | — | **whole hand-side half of the cell** |

- Rects stop at the brow and exclude arms because inside-rect body redraw becomes layer pixels (S1 face-in-helmet, arm
  speckle in the chest). Weapon rects are generous because a tight rect cuts blades [S1]. Missing keypoints → silhouette
  bounding-box fractions. The user may repaint the rect on one cell per direction; it is translated to the others.
- **Sparse overrides** `{layer, z, dir?, anim?, cell?}`, e.g. `main_hand` fg z 85 on `north` so the cape covers the weapon arm.
  Prefer the fg/bg split [R3, R4].
- **Hides as data**: `slot.hides` default, `item.hides` override. S1 measured large semantic overlaps (hair+helmet 94 px,
  chest+hair 65, cape+sword 64) that need hides/z rules, not pixel tricks.
- **Item-vs-item order policy [A1, confirmed by S1]**: every item is generated against the **bare frozen base**; order between
  items comes only from z, split, overrides and hides. No dress-order generation.

---

## 5. Item generation strategy

### 5.1 Route per class

| Class | Route | Cells per call | Cost per item (3 dirs × 12 cells = 36) |
|---|---|---|---|
| **rigid** (head, face_acc, facial_hair, hair, neck) | **Keyframe + propagate**: one batch call (`edit-animation-v2`) on the `idle/0` cell of every stored direction → one design across directions [S1: S+E in one call = one design] → extract → copy into every other cell, translated by the anchor delta (§5.3). | 3 (+ optional extra cells) | **10** |
| **worn** (feet, legs, torso_*, waist, shoulders, arms, back) | **Approved keyframe + reference batches**: masked `inpaint-v3` on `idle/south/0` (user approves the design) → `transfer-outfit-v2` with that composite as reference, ≤15 cells per call, cells of all directions packed [S1: cross-direction reference works]. If all cells fit one call, `edit-animation-v2` (16 cells, text only) is equivalent. | 15 | 10 + 3 × 10 = **40** |
| **held** (main_hand, off_hand) | Same as worn. Propagation only for low-motion clips (idle; south walk passed with offsets ≤ 3 px); never for attacks or side-view arm swings. | 15 | **40** |

Why a shared reference for worn items: an item with 36 cells needs ≥ 3 batch calls, and only a shared reference keeps the design
identical **between calls** (palette Jaccard 0.73–0.81 with reference, sword cleanest on transfer-outfit) [S1 E4].

Always pass `target_palette` (item ramps + base ramps): it raises exact body pixels only to 26–34 % [S1], but it locks the item
palette. `edit-animation-v2` output is quantized to 16 colours [S1]. Always send `no_background: true`.

### 5.2 Rejected routes [S1]

| Route | Why |
|---|---|
| Per-frame masked inpaint (`inpaint-v3`, `inpaint-image-pro-flash`) for animations | Exact outside the mask, but a different item every frame (palette Jaccard 0.13–0.20, area CV 0.14–0.38; inpaint-v3 deleted the head on 1/8; Pro Flash hit a policy block on 1/8). **Not a repair route either.** Used only for single keyframes. |
| `edit-image` | Ignores "add only" (helmet → full plate armour). |
| `edit-images-v2` | Redraws and shifts the body; two-pass shifted the cape 13 px. |
| `create-character-state` + animate | Not pixel-aligned with the base (§1). |
| Pro Flash changes-only `output_method` | A crop of the inpaint result to the mask, still with redrawn body pixels; no gain over local diff. |

Masked keyframes use **`inpaint-v3`** (10 gens, 66–105 s): far less redraw inside the mask than Pro Flash (small-drift px 25–159
vs 42–329) → cleaner layers. Pro Flash inpaint (5 gens, ~31–59 s) is the cheap draft option. Both changed 0 px outside the
mask over 10 calls; the July inpaint-v3 bug did not reproduce [S1 E3].

### 5.3 Rigid propagation

Anchor delta between the keyframe and cell *k* = integer translation (search ±4 px) minimizing the sum of absolute differences
between the **frozen base** patch around the anchor (head mask / 9×9 hand) in both cells; keypoints only seed the search.
S1: helmet offsets on the south walk were (−1,−1), (0,−1)×5, (1,−1); batch-route helmets also stay within ±1 px of NECK, so the
head is rigid in idle/walk [S1 E8]. A propagated layer copies the keyframe's redrawn face pixels into every cell, so the head
rect must stop at the brow and skin rejection (S2) applies.

### 5.4 Prompt

Pip template, ≤ 500 chars [R1]: "Add only {item} to this {direction}-facing pixel art character. Keep every other pixel … exactly
unchanged." No "body"/"skin" wording (policy). `transfer-outfit-v2` uses `additional_instructions` for direction hints.

---

## 6. Colour model

- **Materials** = indexed source ramps, shadow → highlight, colours **unique across materials** (LPC/Vitruvian [R5]): base `skin`
  (6), `eyes` (3), `top`/`shorts` (4 each); per item ≤ 3 materials of 3–6 colours.
- **Into ramps**: `target_palette` on batch routes; then local snap of layer pixels to the item's ramps in OKLab (ΔE ≤ 0.08).
  Pixels beyond keep their colour and lower `snappedPct`. `/reduce-colors` with `palette_image` is the fallback.
- **Ramp creation**: from the approved keyframe layer (k-means in OKLab, sorted by lightness). User can rename/merge.
- **Recolor regions = materials**; exact index swap source → variant ramp; `linkTo` (beard → hair). Multiply tint only as an
  engine option. Export: source-ramp sheets + `materials` in the manifest (+ tiny swap shader); optional baked variants.

---

## 7. Project storage (browser)

- **IndexedDB** `pixeldoll`: `projects` (manifest + QA), `blobs` (PNG `Blob` keyed by SHA-256 of RGBA, deduped), `jobs`
  (ledger). OPFS skipped (a project is a few MB). `navigator.storage.persist()` on first save. Cells stored individually;
  sheets assembled at export.
- **Project zip**: `project.json` (manifest with `cells`, QA, provenance; never the key) + `cells/<sha256>.png`; import verifies
  hashes. Zip reader/writer ~100 lines over native `CompressionStream`/`DecompressionStream('deflate-raw')` + CRC32; swap to
  `fflate` if it misbehaves.
- PNG: `createImageBitmap(blob, {premultiplyAlpha: 'none', colorSpaceConversion: 'none'})` → `OffscreenCanvas.getImageData`;
  encode with `convertToBlob`. Safe because alpha is binary. PixelLab returns PNG only, never raw RGBA [S1].

## 8. Job queue

- One queue. Concurrency default **8** (user-set 1–16); S1 submitted 24 Pro jobs at once on Tier 3 and got two 429s that a 5 s
  backoff cleared [S1]. On 429 drop to `max(1, n−2)`, recover +1 per success. Sync `estimate-skeleton` runs up to 16 at once.
- **Backoff** (`Retry-After` unreadable [R2]): exponential with jitter 2 → 60 s on 429/529/5xx/network errors of the submit.
  401 → stop, ask for the key. 402 → stop. 422/400 → terminal (free [S1]). `code 5000` policy → terminal, never auto-retried;
  show the message (whether it is charged is untested [S1]).
- Poll `/background-jobs/{id}` every 5 s until a result is present; submit returns 202 in 0.8–3 s; batch jobs take 78–170 s [S1].
- **Persist first**: ledger entry before submit, `background_job_id` right after, result PNGs to `blobs` on completion before
  extraction. On reload, pending jobs resume. A job with an id is never resubmitted because a poll failed.
- **Request-hash cache**: same endpoint + params + input hashes + seed → reuse the stored result.
- **Cost**: per-job `usage` (template animations report USD but deduct generations [S1]); `/balance` snapshot before/after each
  batch; static estimate table as data (§12); confirm before a batch above a user threshold (default 20 gens).

## 9. API key handling

- In memory by default; opt-in "remember on this device" → `localStorage`; "forget key". Never in URLs, project zip, ledger,
  provenance or logs. Sent only as `Authorization: Bearer` to `api.pixellab.ai`.
- CSP meta `connect-src` limited to `api.pixellab.ai` and the `*.pixellab.ai` storage host.
- Warn: the API accepts any origin, so a leaked key is usable anywhere [R2].

---

## 10. Module breakdown (`app/src/lib`)

| Module | Files | Responsibility |
|---|---|---|
| `pixellab/` | `client.ts`, `routes.ts` (typed builders for: create-character-v3, characters/animations, GET characters/{id}, estimate-skeleton, inpaint-v3, inpaint-image-pro-flash, edit-animation-v2, transfer-outfit-v2, edit-image-pro-flash (two-pass), balance, background-jobs), `queue.ts` | Plain `fetch`, no SDK; port of `spikes/api/lib/api.mjs`. |
| `image/` | `png.ts`, `diff.ts` + `extract.ts` (port of spike `diff.mjs`/`extract.mjs` incl. `selfTest()`), `slots.ts` (keypoints → slot rects), `palette.ts` (OKLab, snap, ramps, recolor), `qa.ts`, `hash.ts` | Pure functions over `{w, h, d: Uint8ClampedArray}` (= `ImageData` layout). Main thread until profiling says otherwise. |
| `rig/` | `rig.ts`, `normalize.ts`, `skeleton.ts` (anchors, patch tracking), `mirror.ts` | Owns the frozen base. |
| `compose/` | `compose.ts` (z, hides, draw list, render), `split.ts` | Preview + baked export. |
| `export/` | `sheets.ts`, `generic.ts`, `godot.ts`, `unity.ts`, `phaser.ts`, `aseprite.ts` (second wave) | Manifest + cells → files. |
| `store/` | `manifest.ts` (types), `db.ts`, `project.ts` (Svelte 5 runes, command-based edits), `zip.ts` | |
| UI (`app/src/ui/`) | Key/balance bar, rig editor, item lab, dress-up, export dialog | Three-pane builder [R5]. |

---

## 11. Item lifecycle (what the user sees)

1. Pick slot, type the item → (worn/held) one keyframe on south idle → approve or re-roll (10 gens each).
2. Batch calls run; extraction + QA run automatically; failing items re-roll the batch up to 2×.
3. Item card shows coverage (dirs × anims), QA badges, heatmap per cell; accept, re-roll, or adjust the knob.

## 12. Cost model (64 px, 3 generated dirs, idle + walk = 36 cells) [S1 prices]

| Step | Generations |
|---|---|
| Base character v3 | 2 |
| Base animations (2 templates × 3 dirs) | ≈ 6 |
| Skeleton (36 cells) | ≈ 0 |
| **Base total** | **≈ 8** |
| Rigid item | 10 |
| Worn / held item | 40 (30 without a keyframe when ≤ 16 cells) |
| 10-item character (5 rigid, 5 worn/held) | ≈ 260 |

S1 spent ~568 gens on a Tier 3 account; Tier 2 ≈ 2000/month [R2]. Per-frame inpaint (5–10 gens per cell) is unaffordable and
inconsistent anyway.

---

## 13. Risks and mitigations

| Risk | Status / mitigation |
|---|---|
| **Extraction not production-clean.** PM review of S1 sheets: layers still contain redrawn face/eye pixels, skin slivers along arms, and holes (leather close to skin shading). | Item-shaped slot rects (brow line, torso without arms), per-item fallback, skin-material rejection + neighbourhood-tolerant diff + temporal consensus (**S2**), chroma mannequin (**S2**). Until then every item passes human review in the item lab. |
| Batch routes redraw the whole body (0 % exact, ~78 % within Δ18) | Harmless by construction: only item pixels inside the slot are kept and composited over the frozen base. |
| Design differs between batch calls | Shared approved reference (transfer-outfit-v2); pack cells of several directions per call. |
| Headroom: hats clip at the top | ≥ 6 px rule at freeze, base prompt, G7 (**S2**). |
| Coverage untested: north/west, 8 dirs, attack animations (does the weapon stay in hand?) | **S2**; held items on attacks may need their own animation-specific batches. |
| Content-policy blocks | Clothed base (top + shorts), no "body/skin" in prompts, terminal state with a clear message. |
| Occluded back-item pixels missing (cape north/sway) | Two-pass `edit-image-pro-flash` fallback; batch two-pass in **S2**. |
| Wrong item-vs-item order | z ladder + split + overrides + hides; preview all directions before export. |
| Base change invalidates items | `baseHash`, stale badge, "regenerate for new base" re-runs stored prompts/seeds/reference. |
| Template list / prices change | Data files; usage read from jobs. |
| Key leakage | Memory default, CSP, never serialized. |

---

## 14. Mockup plan (Phase 4)

| # | Mockup | Must prove |
|---|---|---|
| M1 | **Key + queue** | Browser-direct calls; `/balance`; base v3 + 2 templates; ledger survives reload mid-job; adaptive concurrency at 8; per-job cost. |
| M2 | **Rig freeze** | Animation frames normalized to 64×64, pivot, headroom check, skeleton per cell, slot rects drawn, anchors by patch tracking, `baseHash`; dirs × anims grid with playlist playback; west mirrored. |
| M3 | **Item lab** | Rigid route (one batch + propagate) and worn route (keyframe approval + transfer-outfit-v2 batches); S1 extractor + knob + heatmap; per-item QA gates; whole-batch re-roll; fg/bg split. Uses S2's extractor improvements. |
| M4 | **Dress-up** | 4–6 items composed with z ladder, overrides, hides; recolor via ramps; animated preview in all directions; stale detection. |
| M5 | **Export round-trip** | Zip with manifest + sheets + Godot `.tres/.tscn/.gd` + Phaser atlas JSON, loaded in minimal Godot 4 and Phaser projects; layers in sync, pivots match. |

---

## 15. Decisions

**Settled by S1**

| # | Decision | Result |
|---|---|---|
| O1 | Worn-item route | Batch routes (`transfer-outfit-v2` with approved reference, or `edit-animation-v2`). Per-frame masked inpaint rejected, also as repair (palette Jaccard 0.13–0.20). Re-roll = whole batch. |
| O2 | Rigid propagation | Valid for head/face/hair in idle/walk (offsets ≤ 1 px on the south walk) and low-motion held items; not for attacks or side-view arm swings. |
| O3 | Masked keyframe route | `inpaint-v3` (cleaner); Pro Flash inpaint as cheap draft. Both 0 px outside the mask. |
| O4 | Base route | `create-character-v3` at 64. 4-direction route rejected at 64 (92 px canvas). |
| O5 | Packing | Mixing directions in one 16-frame call gives one design across them; 8 and 16 frames cost the same → pack. |
| O8 | Skeleton | `estimate-skeleton` per cell, free, sync; keypoints seed slot rects; patch tracking decides propagation offsets. |
| O9 | fg/bg split | Silhouette rule reproduces base+layer exactly (south cape). |
| O10 | Concurrency | Default 8, adaptive; 24 concurrent → two 429s, all completed. |
| — | Changes-only `output_method`, state route, `edit-image`, `edit-images-v2` | Rejected (§5.2). |

**Still open**

| # | Decision | Options | Criterion | Default |
|---|---|---|---|---|
| O6 | Base animation mode | template vs `skeleton-v3` | body stability across frames, feet drift | template |
| O7 | Palette lock | `target_palette` + local OKLab snap vs `/reduce-colors` | % layer pixels inside ramps; recolor quality | target_palette + local snap |
| O11 | Extraction cleanliness | S1 extractor vs + skin rejection / neighbourhood-tolerant diff / temporal consensus vs chroma mannequin | face/eye pixels, arm slivers, holes on helmet/chest/hair over all cells | S1 extractor + human review |
| O12 | Rigid keyframe route | one 3-cell `edit-animation-v2` across directions (untested at 3 cells) vs `inpaint-v3` per direction (30 gens) | design match across directions, in-rect redraw | batch |
| O13 | Coverage | north/west, 8 dirs, attack animations; headroom fix | G1–G7 pass rates per direction/animation | 4 dirs, idle + walk |

**Spike S2 (running)** tests: chroma-mannequin generation (recolour the base to a key colour before edits so items separate by
colour), two-pass batch "remove the character", neighbourhood-tolerant diff + skin rejection + temporal consensus, north/west +
attack coverage, and headroom. Its results decide O11–O13 and may replace §3.2 steps 2–5.
