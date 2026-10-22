# PixelDoll — Architecture (A1)

Author: A1 (architect) · Date: 2026-10-21 · Status: **v1.3**. Sources: spikes [S1](spikes/S1_api_feasibility.md),
[S2](spikes/S2_clean_layers.md), [S3](spikes/S3_skeleton_rigging.md), [S4](spikes/S4_model_routing.md) (its **§Q4 routing
table is authoritative**), PLAN decisions D1–D9, mockup reports in [`testing/`](testing/) (M1, M2, M4, M5 built). Data model:
[`manifest-spec.md`](manifest-spec.md).

Evidence tags: **[S1]–[S4]** live spikes, **[M1]–[M5]** mockup reports, **[R1]–[R5]** research, **[D#]** PLAN decision,
**[A1]** decided here.

---

## 1. Goals and non-goals

**Goals**

1. Produce **traditional frame-based paperdoll assets**: one frozen base (directions × clips × frames on one fixed cell and
   pivot) plus any number of **frame-aligned, separately exportable item layers**. Every layer sheet has the base's grid (held items may use an oversize 96 cell around the same pivot: spec §2.1 v1.3.1 [S5, B8]).
   Transparent cells are emitted, never omitted.
2. **Every pixel comes from PixelLab.** PixelDoll only pads, recolours to a key, keys, drops stray components and composes. It
   never draws or resamples.
3. **Minimal human work**: one prompt per item; everything runs automatically and ends in one accept/re-roll review [D7].
4. **Correct engine output**: Godot 4.7 and Phaser 3.80/3.90/4.2 render pixel-identical to PixelDoll's compositor [M5];
   Unity compiles, live check deferred [D5].
5. **Fully client-side** on GitHub Pages; the browser calls `https://api.pixellab.ai/v2` with the user's key [D1].

**Non-goals (v1)**: layers from character states; body-shape axis (one base per project, items bound by `baseHash`); bones/IK at runtime (skeletons are a *generation* tool, not an export feature); semi-transparent VFX; backend.

## 2. Allowed models [D8, S4]

| Purpose | Allowed | Banned |
|---|---|---|
| Create characters | `create-character-v3` (default), `create-character-pro-flash` (chibi styles only) | `create-character-pro`, 4/8-direction standard routes |
| Animate | `skeleton-v3` (raw `/animate-with-skeleton-v3`, managed `mode: "skeleton-v3"`), `pixminimax`, `v3` (managed or raw text) | `mode: "template"`, `mode: "pro"`, legacy `/animate-with-skeleton` |
| Skeleton | `estimate-skeleton` | — |
| Edit (Pro allowed for editing) | `edit-animation-v2`, `inpaint-v3` (best); Pro Flash / Pixen only for drafts | `edit-images-v2` for layers (shifts every frame [S4]) |

---

## 3. The rig contract

The rig is a set of **clips**. Every clip-direction is stored as **frozen frames + the reference image + the keypoint
sequence + the route** that produced it. Generation is **not bit-repeatable** (same request + seed: 86 % identical px raw,
49–60 % managed [S3]), so base frames are **never regenerated**: everything is stored.

| Property | Decision | Evidence |
|---|---|---|
| Cell | **64×64** square. | Pro editors fit 16 frames at ≤64 px [S1]. |
| Base character | `create-character-v3` text at **48 px**, clothed (plain grey t-shirt + grey shorts, bald, barefoot; prompts avoid "body/skin"), rotations **padded to 64 (x+8, y+12: 4 px floor, M3/B7), never rescaled** → 12–16 px headroom; one placement rule for every source (`rig/normalize.ts`). Custom art: `create-character-v3` import with `reference_image` + `direction_images`, `n_directions: 4` (0.25 gen, pixel-exact). | [S2, S3, S4, D4] |
| Rest views | The padded S/E/N rotations are re-imported as a managed character (0.25 gen, pixel-exact) → **rest keypoints** free from `skeletons["2d_references"][dir]` (= `estimate-skeleton` within 0.11 px). These rest views are the `reference` (first frame) of every clip and the source of every item keyframe. | [S3] |
| Directions | `south, east, north` generated; `west.mirrorOf = east`. **8-dir (B15, Create → More options):** `south, south-east, east, north-east, north` generated; `west ← east`, `south-west ← south-east`, `north-west ← north-east`; the re-import sends all 8 views (`n_directions: 8`). Authored actions: south-east uses the south tables, north-east the mirrored (north) ones. Mirroring flips pixels and puts held items in the other hand: accepted for `mirror: "flip"`, else `mirror: "generate"`. | [M2, S3, B15] |
| Keypoints | 18 labels (NOSE, NECK, RIGHT/LEFT SHOULDER, ELBOW, ARM = wrist, HIP, KNEE, LEG = ankle, EYE, EAR), x/y normalised 0–1, **character's** left/right. `z_index` omitted (v3 rejects floats; `depth` defaults). `estimate-skeleton` is deterministic (0.00 px repeat), 0.1 gen, run at concurrency 3. | [S3, M2] |
| Clips | Default rig: **`idle` (4), `walk` (8), `slash` (8), `hurt` (6)**; optional `run`, `cast`, `death`. Playlist `frames[{cell, ms}]`. | [S3, S4] |
| Pivot | Integer, top-left origin, pixel-edge coords: `x = w/2`, `y` = feet line of the south rest view. Lunges and death may leave it (QA tolerance per clip). | [M2, S4] |
| Frozen frame | Binary alpha; **largest 8-connected component kept** (skeleton-v3 adds detached motion-smear FX on 7/15 clips); SHA-256 per cell; `baseHash` over all cells. | [S3] |

### 3.1 Clip routes

| Clip kind | Route (default) | Keypoint source | Cost per direction |
|---|---|---|---|
| Locomotion (walk, run, idle) | managed `skeleton-v3` on the rest character (template motion) → `estimate-skeleton` every frame → **re-render through raw `/animate-with-skeleton-v3`** with that sequence on the rest view | estimated from the managed render | 3 (managed) + 0.1/frame + 3 (raw) |
| Actions (slash, cast, hurt, death, block…) | raw `/animate-with-skeleton-v3` | **authored** from the rest pose (`setArm`, `rotate`, `shift` presets; north mirrors south angles; free preview) | 3 (≤8 frames), 4 (≤15) |
| Text fallback (no keypoints wanted) | managed `pixminimax` for walk/run/idle, `v3` for hurt/death; `keep_first_frame: false` | estimated after the fact (QA/anchors only) | 1 |
| Imported frames | as given | `estimate-skeleton` | 0.1/frame |

**Why every skeleton clip ends in raw v3:** posing a *different* first frame with the **same** keypoint sequence gives
pixel-aligned frames (chroma mannequin vs base IoU 0.988 S / 0.977 E, best shift 0,0; dressed keyframe only 0.7–1.4 % of key
pixels outside the base, independent of seed). Managed skeleton-v3 is looser (3–6 % outside) [S3]. So base and items must be
rendered by the same raw request shape. Managed skeleton-v3 is only a **motion source**. **Template mode is banned** [D8].

Raw v3 request: `{first_frame: rest view (64×64), first_frame_keypoints: rest, keypoints: sequence (3–15 frames),
description: looks only ("bald man in a plain grey t-shirt … empty hands, no weapon"), action: short label, direction,
view: "low top-down", no_background: true, seed}`. Output = exactly `len(keypoints)` frames on the 64 canvas (no echo).

**Normalisation:** managed skeleton-v3 renders on a larger centred canvas (**80 for a 48 px character, 96 for 64**); managed
text modes on 68 for 48 px; Pro Flash bases vary by direction (52/56). Re-centre by `(w − 64)/2` before estimating; falling
motions may clip at the rig edge → author death with raw v3 [S3, S4].

**Text-route hygiene [S4]:** pixminimax invents props/attackers ("slash" added a sword, "hurt" a giant fist): always append
"unarmed, no weapon, no props, no other people, no effects". Managed text modes **silently drop directions** at the
concurrency cap (200 with `directions: ["south"]`): send one direction per call or verify `res.directions` equals the request.

### 3.2 Rig QA (freeze gate)

Per skeleton clip, every frame re-estimated: arm adherence ≤ 2 px mean vs requested; feet drift ≤ 1 px on standing clips;
palette fit ≥ 0.97 (colours within 12 of the rest palette); no opaque pixel on the cell border; stray px removed and logged.
Skip the L/R label check on lying frames. Fail → re-roll (new seed), then soften the pose (shorter reach) [S3].

---

## 4. Item pipeline

### 4.1 Default: skeleton-posed dressed chroma keyframe (route `skeleton-pose`) [S3, S4]

```
rest views S/E/N ─▶ toChroma (green key; magenta for green items) ─▶ ONE edit-animation-v2 call with the 3 key frames
  ("dress") ─▶ QA + store the 3 dressed keyframes ─▶ for every clip-direction: raw /animate-with-skeleton-v3
  {first_frame: dressed keyframe, first_frame_keypoints: rest, keypoints: the clip's stored sequence}
  ─▶ keep largest component of the whole frame ─▶ chroma extract (S2 chromaLayer) ─▶ layer over the REAL base frame
```

- One design everywhere: palette distance to the reference ≤ 3 (edited batches 6–15); held items follow the hand in every
  direction; capes swing [S4].
- Adding a clip later = one pose call per item-direction, same design, no re-dress.
- **Dress frame cap [B16]:** edit-animation-v2 takes 16 / 9 / 4 frames at ≤ 64 / 65–80 / 81–256 px (`editFrameCap`). The dress
  is split into chunks under that cap (`anchorChunks`): the first takes `cap` rest views, later ones `cap − 1` plus the first
  chunk's dressed cell 0 as an anchor (its output dropped, S2). An 8-direction held item (5 rest views at 96 px) = 4 + (1 + 1)
  frames, 2 dress calls (20 gens). The anchor route's `planCalls` uses the same cap.
- **Held items (`main_hand`, `off_hand`) [S5, B9]:** rest views and base frames are padded 64 → 96 around the same pivot
  (+16, +16; keypoints `(x·64 + 16)/96`); the dress prompt says "in the right hand, pointing down and slightly outward; exactly
  one weapon …; the arms stay exactly as they are"; poses run at 96 with **frame 0 sent last** when it is within 1 px of the rest
  pose (outputs reordered); a frame that still lost the item (area < 50 % of the clip median on a near-rest pose) gets the
  dressed keyframe layer pasted at the wrist move (free `repair`, `CellQa.repaired`); layers are stored with
  `cell 96×96`, `pivot = rig.pivot + 16` (spec §2.1). Same price: pose calls bill by frame count, not canvas.
- **Clip cleanup after extraction [B9]:** held = largest component + components attached to it or to the gripping wrist
  (≤ 3 px); head items (`slot.band`) = trim px outside the aligned, 2 px-dilated dressed keyframe unless at least half of the
  direction's other frames have item px there (temporal consensus), skipped on frames whose aligned overlap is < 50 %.
  Body-hugging worn items (torso, legs, feet, arms; not `back`/`hair`) drop detached components with < 50 % of their px on
  the body silhouette (motion smears; T3). Capes and hair keep the component filter only (consensus trim would eat swings).
- Cost: dress 10 + 12 clip-directions × 3 = **≈ 46 gens per item** (3 dirs × 4 clips).
- Weak spots: more specks from motion smears (largest-component filter removes most), north slash cape vanished on 2 frames,
  vest thin in east [S4] → QA re-roll, then the alternative route.

### 4.2 Alternative: `inpaint-v3` packed masked grid (route `inpaint-grid`) [S4]

`inpaint-v3` on a **256×256 4×4 packed grid** of chroma-keyed base frames with a slot-band mask (head / torso / cape / feet;
whole cell for held items): 16 cells, 10 gens per call → 6 calls ≈ **60 gens per item**. Cleanest pixels (key kept ≥ 0.99, key
outside ≤ 0.003 on helmet/vest), design varies slightly per call (palDist 4–10, no anchor-cell option). Used for:

- clips without a keypoint sequence (text-animated or imported);
- items that fail §4.1 QA twice: **live since B14** per clip-direction. A pose call still failing after its 2 re-rolls (best
  roll kept) is redone once as a grid of that clip-direction's chroma cells (slot-band mask) plus the 3 dressed keyframes as
  kept reference cells (64 px rig: 4×3 = 256×192); the grid stays only with fewer failed checks. Also in `poseItemClip` (Add a
  move) and `regridClip` (an accepted item's clip-direction). Back items get "hangs down the back, never wraps the arms".

For capes on text clips, `edit-animation-v2` with S2's anchor cell is the second choice.

### 4.3 Superseded or rejected

| Route | Status |
|---|---|
| S2 chroma `edit-animation-v2` over all cells as the primary route | Superseded by §4.1; `edit-animation-v2` is now the **dressing** call (3 frames) and the cape fallback. |
| S1 local diff on skin composites | Fallback only for items colliding with both keys; always human-reviewed. |
| Template animations, rigid propagation, `transfer-outfit-v2` | Banned / superseded (posing gives the consistency propagation was buying). |
| Per-cell masked inpaint, Pro Flash reference per cell | Design flicker [S1, S4]. |
| Animating a dressed keyframe with pixminimax/v3 | Misaligned body (IoU 0.65–0.84) [S4]. |
| `edit-images-v2`, Pro Flash grids, Pixen | Shifts / key loss / faces drawn into layers [S4]. Pixen = 1-gen draft preview only. |

### 4.4 Chroma extraction (unchanged from S2)

Key score ratio < 35 on opaque pixels, rim guard, drop components < 2 px, despill, layer drawn over the real base frame
(pre-occluded). Key choice: green; magenta when the prompt matches `/green|emerald|lime|olive|jade|teal|mint|forest/`; never
grey; switch key after two failures. Colour budget: the key ramp takes ~5–8 of ~17–19 quantized colours → items get 6–8 [S2].

### 4.5 Item QA (per item over all cells)

| Gate | Pass |
|---|---|
| Key kept | ≥ 0.97, or ≤ 8 body px lost (a cape covering the back leaves ~126 body px; T3) |
| Key outside base alpha | ≤ 0.03 (`skeleton-pose`), ≤ 0.05 (other routes) |
| Registration | best integer shift = 0 on every frame |
| Area | each cell ≥ 50 % of the clip median; CV ≤ max(0.15, 2 × the CV of the body band it covers) (T3: trousers walk E) |
| Design lock | palette distance to the dressed keyframe ≤ 15 |
| Grip side (held) | `gripSide` from the clip's requested wrist keypoints: a clip held mostly in the wrong hand fails (G8); > 25 % ambiguous in a front/back view → review (side views are often ambiguous) |
| Shape (held, locomotion) | G9 principal-axis turn relative to the forearm ≤ 30° when keypoints and a reliable axis exist; otherwise adjacent-frame aligned IoU ≥ 0.3. With keypoints, pairs containing a mask below 6 pixels retain the minimum-sample skip. Near-round masks (normalized covariance eigenvalue gap < 0.2) use IoU because a one-pixel silhouette change can swap their axis by 90°. |
| Anchor spread (head items) | layer centroid − head keypoint ≤ 3 px in front/back views |
| Clip | no layer pixel on the cell border |
| Stray px | removed and logged |

For posed held items with wrist tracks, G5/G9 failures may be inconclusive because the body hides part of the item.
Compare masks in wrist coordinates: missing pixels can be hidden only inside the other frame's frozen body silhouette
(1 px tolerance, as in posed extraction). Require at least 6 shared pixels, observable IoU ≥ 0.3, and at least as many
body-hidden differences as visibly unexplained differences. G5 also requires every frame to match the largest observed
silhouette and its area plus potentially hidden reference pixels to meet the original CV limit. Such cases produce an
explicit occlusion review warning, never a clean pass or a paid G5/G9 retry. Original metrics and exported pixels stay
unchanged; hard presence, body integrity, alignment, border and grip checks remain. Hidden geometry is not reconstructed
or proven by this heuristic, and unexplained changes retain their hard failure.

Fail → re-roll the call once (new seed), then switch to the alternative route, then the user decides. When a call is out of
re-rolls it keeps its roll with the fewest failed checks, not the last one (free ledger re-evaluation; same inputs only) [T3].
H4 (keyframe consistency) fails only band items (helmet, face) [T3]. B14: soft items (hair, worn torso/back) warn only in a
clip-direction where the item covers ≥ 50 % of the body in some frame and own < 0.5 (the cape from behind, not its edges from the
front); off for legs and feet (S and N look alike). On the Ranger: 6 of the 7 real cape-north frames still flag (the 7th clip fails G4 anyway), 43 false flags are gone.
G8 decides a clip's hand only with half its frames decided. A held frame repaired from the keyframe (S5) is not a warning.
D1 (dress, 0 gens): a colourful keyframe (median HSV saturation ≥ 0.4) with > 5 % near-grey px fails the dress call, so the
design is re-rolled before 36 gens of poses copy it (T3 cape north hem 11 %; clean views ≤ 2.2 %); skipped when the prompt asks
for grey/metal/black/white parts. Handedness is set by the
motion: authored weapon-hand actions and dressed keyframes keep it; prompts and hand marks do not [S3].

### 4.6 fg/bg split, compose, export

`fg = layer ∩ base alpha`, `bg = layer − fg` for slots with `bgZ` (exact recompose [S1]). Compose and export as built in M4/M5:
draw list by resolved z (cell > anim > dir overrides), ties by slot order, bg before fg, item id. Export: manifest-spec §5–§6.

---

## 5. Slots, z ladder, hides

| Slot | Class | Anchor | fg z | bg z | Default hides |
|---|---|---|---|---|---|
| `body` | base | — | 10 | — | — |
| `feet` | worn | foot | 20 | — | — |
| `legs` | worn | hip | 30 | — | — |
| `torso_inner` | worn | neck | 40 | — | — |
| `waist` | worn | hip | 50 | — | — |
| `torso_outer` | worn | neck | 60 | — | — |
| `shoulders` | worn | neck | 65 | — | — |
| `arms` | worn | hand | 70 | — | — |
| `neck` | worn | neck | 80 | — | — |
| `back` | worn | neck | 90 | 4 | — |
| `facial_hair` | head | head | 100 | — | — |
| `hair` | head | head | 110 | 3 (5 via `zOverrides`: over the cape's bg, T3) | — |
| `face_acc` | head | head | 120 | — | — |
| `head` | head | head | 130 | — | none; tucks `hair` under it (`clips`, B14); a hood ticks hide hair (`item.hides`) |
| `off_hand` | held | hand_l | 140 | 2 (5 in S/E/W) | — |
| `main_hand` | held | hand_r | 150 | 1 (5 in S/E/W) | — |

- Held bg layers (blade outside the silhouette) sit **above** `back.bg`, otherwise the cape hides 44–60 blade px in south
  walk; the ladder ships `zOverrides` `{layer: bg, z: 5}` for south/east/west on both hand slots (bg z 1/2 from behind, so the
  cape covers the weapon in north) [M4]. T3: the Studio ladder lacked them (Ranger: 220 sword px hidden by the cape over walk S);
  `saveItem` now copies ladder overrides into stored slots that have none, and Reset restores them.
- Class drives QA (head: anchor spread; held: grip side) and the inpaint-grid mask band.
- Tuck-under (B14): `slot.clips` drops the clipped slot's px at or above the cover's lowest opaque row per column (beside the
  cover: the nearest covered column), so long hair hangs below a helmet and short hair never pokes through; compose does it on
  the fly, exports bake `"<hair>~<helmet>"` variant items that the engine runtimes swap in (manifest-spec inv. 11). Old records
  with the head slot's former `hides: [hair]` default are migrated on load.
- Hides and overrides are data (`slot.hides`, `item.hides`, sparse `zOverrides`) [R4]. Items are always generated against the
  bare base; no dress-order generation.

## 6. Colour model [M4]

Materials = indexed ramps, shadow → highlight, unique across materials; derived per item from its layers (OKLab k-means,
k ≤ 4 auto) and from the base. **Base regions (B15):** the base's shirt and shorts share one grey ramp (M4), so
`lib/dress/regions.ts` splits them by position: garment greys (C < 0.04, L ≥ 0.18) form 4-connected components (outlines and
skin separate the garments), each component goes to the shorts when ≥ 75 % of it lies at or below hip − 1.5 px along the
neck → hip axis (anchor tracks; fixtures: 60 % of the figure height), a straddling component is cut px by px. The region is
written into the pixel: blue LSB even = shirt, odd = shorts (a 1/255 nudge). Base materials are then Shirt / Shorts / Skin,
still exact-colour and disjoint, so export and engine swap shaders are unchanged. Idempotent; runs when a project opens
(existing rigs are migrated once, `baseHash` and the items made for it move to the new hash). New bases are prompted with
"light grey t-shirt and dark grey shorts". Recolour = exact index swap (`variantRamp`), `linkTo` for linked materials; grayscale × tint
only as a comparison/engine option. Export: source-ramp sheets + `materials` (+ swap shader), baked variants per preset.

## 7. Storage, queue, key [M1, M2]

- IndexedDB `projects` / `blobs` (SHA-256 of RGBA) / `jobs`; project zip = `project.json` + `cells/<sha>.png`; native-stream
  zip and pure PNG encoder, no dependencies. Store **every** generated frame, reference, keypoint sequence and request: they
  cannot be reproduced.
- Queue: persisted ledger; Pro/skeleton-v3 jobs default concurrency 8 (Tier 3 cap observed at 22 jobs [S4]),
  `estimate-skeleton` 3 (code default 3, max 8). Backoff 2 → 60 s and resubmit only on refusals (423/429/503/529); a paid POST
  that gets a network error, timeout (120 s) or another 5xx is marked `lost` ("may have run, check pixellab.ai") and never
  resent automatically [B13]. **Re-poll** the same job id on network errors and timeouts; result downloads back off and give up
  after 10 tries (URLs kept). Server 502/504/CUDA asserts happen [S3, S4]; whether they are charged is unknown. 401/402 pause; 422 and policy `code 5000` terminal. Verify
  `res.directions` on managed animation calls.
- **Offline (B15):** `navigator.onLine` false or a request that got no answer (network error, not a timeout) pauses the queue
  (`paused: 'offline'`): nothing is submitted or polled, so no paid call can be lost to a dead connection. The leader probes a
  free `GET /balance` every 15 s and resumes on any answer; the Studio shows a non-blocking banner.
- A paid POST answered `500 "Failed to start any animation jobs"` (B15 live, 6 parallel jobs on a busy account) is a refusal
  in words: re-queued with backoff like 429/503, not marked lost.
- Key: memory by default, opt-in `localStorage`, never serialized; CSP `connect-src` limited to PixelLab hosts.

## 8. UI [D9]

Look **A (native minimal)**, **dark mode by default** with a visible, persisted dark/light switch; system UI font stack;
**Lucide icons** (`@lucide/svelte`) everywhere; no pixel fonts or pixel icons. Sprites render `image-rendering: pixelated` at
integer zoom. Theming ("Paper" look) deferred.

## 9. Modules (`app/src/lib`)

| Module | Status / change for v1.3 |
|---|---|
| `pixellab/` (client, routes, queue) | built [M1]; add raw/managed skeleton-v3, pixminimax, `create-character-v3` import, `res.directions` check, re-poll policy |
| `store/` (manifest, db, zip, project) | built; manifest gains `Clip` sources (§manifest-spec) |
| `image/` (png, pngraw, hash, chroma, diff) | built; add `largestComponent`, `gripSide`, registration shift check |
| `rig/` (rig, normalize, mirror, skeleton, freeze) | built for template frames [M2]; **update**: rest-view import, clip routes, pose presets (`setArm`/`rotate`/`shift`, port of `spikes/api/lib/skel.mjs`), canvas re-centring 68/80/96 → 64, rig QA §3.2 |
| `items/` (items, run) | update to `skeleton-pose` (dress + pose) and `inpaint-grid` routes |
| `dress/`, `compose/`, `export/` | built [M4, M5] |

## 10. Cost model (gens; 3 generated dirs; idle, walk, slash, hurt)

| Step | Gens |
|---|---|
| Base `create-character-v3` 48 + rest import | 2.25 |
| Locomotion idle + walk (managed 3 + raw 3) × 3 dirs | 36 |
| Actions slash + hurt (raw 3) × 3 dirs | 18 |
| `estimate-skeleton` (managed frames + re-estimate of every raw frame) | ≈ 11 |
| **Base total** | **≈ 67** |
| Item, `skeleton-pose` | ≈ 46 |
| Item, `inpaint-grid` | ≈ 60 |
| 10-item character | ≈ 530 |

## 11. Risks

| Risk | Mitigation |
|---|---|
| Non-deterministic generation | Store everything; never regenerate base frames; items reference stored frames and keypoints. |
| Motion-smear FX, specks | Largest-component filter; avoid identical final poses; QA logs stray px. |
| Pose not followed / wrong hand | Adherence + `gripSide` gates; re-roll; author an armed variant. |
| North action frames lose back items (cape) | QA re-roll; `inpaint-grid` fallback. |
| Side-view grip ambiguity | Accept "ambiguous" in side views; review only front/back. |
| Mirrored west swaps the weapon hand | `mirror: "generate"` per item (pose a west keyframe with mirrored keypoints). |
| Pose presets tuned for one body | Free preview before paying; per-body check. |
| Server failures / silent direction drop | Re-poll, resubmit only on `failed`; `res.directions` check. |
| Small figure (48 base) | Product call (D4: 56 px optional). |
| Unity importer not run live | Deferred [D5]. |

## 12. Mockups

| # | Mockup | Status |
|---|---|---|
| M1 | Key + queue | built |
| M2 | Rig freeze | built on template frames; **rebuild for skeleton-v3 clips** (rest import, presets, raw re-render, rig QA) |
| M3 | Item lab | build on `skeleton-pose` + `inpaint-grid` with the §4.5 gates |
| M4 | Dress-up | built |
| M5 | Export round-trip | built (Godot + Phaser pixel-identical) |

## 13. Decisions

**Settled**: allowed models [D8]; rig = skeleton-v3 clips stored as frames + reference + keypoints [S3]; base v3 48 → 64
[S4, D4]; item default `skeleton-pose`, alternative `inpaint-grid` [S4]; chroma extraction [S2]; held bg z above back bg
[M4]; UI look A, dark default [D9]; concurrency 8 / skeleton 3.

**Open**

| # | Question | Criterion | Default |
|---|---|---|---|
| O7 | Palette: 3-step key ramp to free item colours | colours per item, key kept | 5-step ramp |
| O11 | Face-context items (hair, glasses) and worn items (chest, cape) on `skeleton-pose` over a full 3-dir × 4-clip set | §4.5 pass rate vs `inpaint-grid` | `skeleton-pose` |
| O13 | Held items in mirrored west | visual handedness vs cost of `generate` | flip |
| O14 | Base scale 48 vs 56 | headroom vs figure size | 48 |
| O15 | Dressing with `inpaint-v3` (192×64 row) instead of `edit-animation-v2` | §4.5 after posing | `edit-animation-v2` |
