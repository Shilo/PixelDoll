# PixelDoll — Architecture (A1)

Author: A1 (architect) · Date: 2026-10-21, updated 2026-10-26 (round 10: Default-first creation, item streaming, optional
review [D26]) · Status: **v1.3**. Sources: spikes [S1](spikes/S1_api_feasibility.md),
[S2](spikes/S2_clean_layers.md), [S3](spikes/S3_skeleton_rigging.md), [S4](spikes/S4_model_routing.md) (its **§Q4 routing
table is authoritative**), PLAN decisions D1–D9, mockup reports in [`testing/`](testing/) (M1, M2, M4, M5 built). Data model:
[`manifest-spec.md`](manifest-spec.md).

Evidence tags: **[S1]–[S4]** live spikes, **[M1]–[M5]** mockup reports, **[R1]–[R5]** research, **[D#]** PLAN decision,
**[A1]** decided here.

---

## 1. Goals and non-goals

**Goals**

1. Produce **traditional frame-based paperdoll assets**: one frozen base (directions × clips × frames on one fixed cell and
   pivot) plus any number of **frame-aligned, separately exportable item layers**. Every layer sheet has the base's grid (held items may use an oversize cell, the body cell + 32 px, around the same pivot: spec §2.1 v1.3.1 [S5, B8]).
   Transparent cells are emitted, never omitted.
2. **Every pixel comes from PixelLab.** PixelDoll only pads, recolors to a key, keys, drops stray components and composes. It
   never draws or resamples.
3. **Minimal human work**: one prompt per item; everything runs automatically. A clean item saves itself; a flagged one
   waits for an optional Keep it / Try again / Discard review [D26, supersedes D7's mandatory review].
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
| Edit (Pro allowed for editing) | `edit-animation-v2`, `inpaint-v3` (best); `transfer-outfit-v2` (reference-image dressing: concept-image items, experimental until their spike passes); Pro Flash / Pixen only for drafts | `edit-images-v2` for layers (shifts every frame [S4]) |

---

## 3. The rig contract

The rig is a set of **clips**. Every clip-direction is stored as **frozen frames + the reference image + the keypoint
sequence + the route** that produced it. Generation is **not bit-repeatable** (same request + seed: 86 % identical px raw,
49–60 % managed [S3]), so base frames are **never regenerated**: everything is stored.

| Property | Decision | Evidence |
|---|---|---|
| Cell | Square frame sized by the creator: default **80×80** around a 64 px body (body presets 48/64/96/128 px or custom; auto frame or manual, up to 256 px). Legacy rigs: 64×64 around 48 px. | Legacy 64 px cell: Pro editors fit 16 frames at ≤64 px [S1]. |
| Base character | `create-character-v3` text at the chosen body size (default **64 px**; legacy rigs **48 px**), bare (`BASE_CLOTHES`: "with plain bare skin everywhere, nothing worn", bald, barefoot; round 5: the former gray t-shirt showed through items, "underwear" drew briefs or a topless body, shorter wordings drew briefs on men, and "nude" is avoided; [bare-skin wording](research/bare-skin-base-wording-2026-10-25.md)), older rigs clothed (plain gray t-shirt + gray shorts), rotations **padded into the frame (legacy 48→64: x+8, y+12, 4 px floor, M3/B7), never rescaled** → 12–16 px headroom; one placement rule for every source (`rig/normalize.ts`). Custom art: `create-character-v3` import with `reference_image` + `direction_images`, `n_directions: 4` (0.25 gen, pixel-exact). | [S2, S3, S4, D4] |
| Rest views | The padded drawn rotations are re-imported as a managed character (0.25 gen, pixel-exact) → **rest keypoints** free from `skeletons["2d_references"][dir]` (= `estimate-skeleton` within 0.11 px). These rest views are the `reference` (first frame) of every clip and the source of every item keyframe. | [S3] |
| Directions | New forms default to the **Top-down 8** preset: five drawn views plus western flips. Other presets (Top-down 4, Diagonal 4, Side-scroller 2, Unique 8) and per-direction mirror toggles choose which views are drawn; Unique 8 preserves original western rotations. The initial text-only v3 request retains default eight rotations; the reference import registers all eight original views (`n_directions: 8`). An in-flight creation saved before explicit direction plans is not resumed. `rig.directions[].mirrorOf` is canonical; independent rows have no mirror link. Western authored actions use the actual western rest pose and retain anatomical joint labels. | [M2, S3, B15, professional audit] |
| Keypoints | 18 labels (NOSE, NECK, RIGHT/LEFT SHOULDER, ELBOW, ARM = wrist, HIP, KNEE, LEG = ankle, EYE, EAR), x/y normalized 0–1, **character's** left/right. `z_index` omitted (v3 rejects floats; `depth` defaults). `estimate-skeleton` is deterministic (0.00 px repeat), 0.1 gen, run at concurrency 3. | [S3, M2] |
| Clips | New Studio characters start with **`default`** only: one standing frame per direction (the rest view, source `imported-rest`) [D26]. **Add idle + walk** queues `idle` (4) and `walk` (8); add moves such as `slash` (8), `hurt` (6), `run`, `cast` or `death` the same way. Older rigs were created with idle and walk. Playlist `frames[{cell, ms}]`. | [S3, S4, Studio create] |
| Pivot | Integer, top-left origin, pixel-edge coords: `x = w/2`, `y` = feet line of `idle/south/0`, else the first move's south cell (`default/south/0`, the standing south view, on new characters; moves added later keep it). Lunges and death may leave it (QA tolerance per clip). | [M2, S4] |
| Frozen frame | Binary alpha; every component kept and detached ones reported for review (skeleton-v3 adds detached motion-smear FX on 7/15 clips; §3.2); SHA-256 per cell; `baseHash` over all cells. | [S3] |

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

Raw v3 request: `{first_frame: rest view (cell size, default 80×80), first_frame_keypoints: rest, keypoints: sequence (3–15 frames),
description: looks only ("bald man in a plain gray t-shirt … empty hands, no weapon"), action: short label, direction,
view: "low top-down", no_background: true, seed}`. Output = exactly `len(keypoints)` frames on the cell canvas (no echo).

**Normalization:** managed skeleton-v3 renders on a larger centered canvas (**80 for a 48 px character, 96 for 64**); managed
text modes on 68 for 48 px; Pro Flash bases vary by direction (52/56). Re-center by `(w − cell)/2` before estimating; falling
motions may clip at the rig edge → author death with raw v3 [S3, S4].

**Text-route hygiene [S4]:** pixminimax invents props/attackers ("slash" added a sword, "hurt" a giant fist): always append
"unarmed, no weapon, no props, no other people, no effects". Managed text modes **silently drop directions** at the
concurrency cap (200 with `directions: ["south"]`): send one direction per call or verify `res.directions` equals the request.

### 3.2 Rig QA (freeze gate)

Every body frame must be nonempty, fit its frame without opaque cropping, have the expected frame count and yield complete valid measured joints. Empty/wrong-count rendering may retry once with a new seed. Missing joint observations stop setup and retain the generated art; they do not redraw it.

Estimated arm-joint difference, silhouette-bottom displacement, palette similarity, border contact and disconnected pixels are **review observations**, not proof of bad art and never automatic body-redraw triggers. The 2 px arm threshold highlights estimates for review; it is not a scale-independent accuracy guarantee. Silhouette bottoms do not identify foot contact or a rotation origin. The historical `feetDrift` storage field records this bottom displacement only. Optional hat/hair headroom is advisory when the body itself fits.

Body output keeps all normalized components, including detached details. Binary-alpha normalization remains the pixel-art contract. Component counts are reported without deleting artwork. Item chroma extraction and its independently documented checks retain their existing policy. Genuine body-pose deviation can still affect later equipment fitting; review notes remain visible and measurements are retained.

### 3.3 Creation: Default first, moves on demand [D26]

`createCharacter` (`studio/create.ts`) makes only the draw (`create-character-v3`), the padded re-import (0.25) and the free
`GET /characters/{id}` rest keypoints (0.1 `estimate-skeleton` per missing reference), then publishes a rig whose only move is
`default`: one cell per direction, the rest view itself, `motion: 'imported-rest'`, posed by its rest keypoints. No animation
or estimate calls run at creation: about 2.25 gens up to a 90 px body (3.25 up to 128 px) and 3–5 minutes. The standing views stream into
the creator as soon as the draw is normalized (`onViews`). The animation workflow and every PixelLab request body are
unchanged: skeleton-v3 is deferred for replacement ([review §15–§17](research/generation-pipeline-review-2026-10-25.md)).

- **Add idle + walk** (creator result and Moves; `BaseMoves.svelte`, `baseMoveSpecs`) queues the missing base moves for the
  body only (`items: []`, as the progressive equipment decision in PLAN requires), one random seed, and the request shapes
  creation used to send (authored idle, managed walk → estimates → raw render), so it costs what creation used to spend
  (≈ 11 gens per drawn direction). Each item extends to these moves through its own priced offer.
- **Move queue** (`queueMoves` in `state.svelte.ts`): moves run one at a time, FIFO, through the unchanged `addMove`; Add a
  move queues behind a running move ("Queue another move") and never queues the same move twice. The
  queue is persisted with the running move's record (`studio-move`), and the next move replaces that record in one write.
  A failed move holds the queue: Try again continues it, Start over (dismiss) drops that character's queued moves while
  other characters' moves go on.
- Items treat `default` like any single-cell `imported-rest` clip: its cell is the dressed standing view, with no pose call.
- Every created or imported character has exactly one `default` move (UI "Default"); `rig.rest` stays the internal standing data sent to
  PixelLab and is never shown on its own. Imports name their rotations `default` (a ZIP animation of that name becomes
  `default-copy`), and the id is reserved for user moves. Characters saved by earlier versions are not upgraded (the app
  is in preview): they keep their old moves and have no Default.
- The creator's form notes the frame-size price steps: above 80 px items dress 4 views per call; above 128 px a dress call
  costs 15–25 gens and no repair grid fits.

---

## 4. Item pipeline

### 4.1 Default: skeleton-posed dressed chroma keyframe (route `skeleton-pose`) [S3, S4]

```
drawn rest views ─▶ toChroma (§4.4 key) ─▶ edit-animation-v2 with one key frame per view, chunked under the frame cap
  ("dress") ─▶ QA + store the dressed keyframes ─▶ for every clip-direction: raw /animate-with-skeleton-v3
  {first_frame: dressed keyframe, first_frame_keypoints: rest, keypoints: the clip's stored sequence}
  ─▶ keep largest component of the whole frame ─▶ chroma extract (S2 chromaLayer) ─▶ layer over the REAL base frame
```

- One design everywhere: palette distance to the reference ≤ 3 (edited batches 6–15); held items follow the hand in every
  direction; capes swing [S4].
- Idle and walk of a direction share one pose call (12 frames cost 3 gens like 8; round 4); held items and other moves pose one
  move per call. Single-cell `imported-rest` clips (`default`) use the dressed standing view, with no pose call. Adding a clip
  later = one pose call per item-direction, same design, no re-dress.
- PixelLab is not deterministic: a byte-identical request and seed returned 6–10 % different pixels (round 4), so a single
  same-seed pair cannot separate a change from noise; compare across seeds.
- **Dress frame cap [B16]:** edit-animation-v2 takes 16 / 9 / 4 frames at ≤ 64 / 65–80 / 81–256 px (`editFrameCap`). The dress
  is split into chunks under that cap (`anchorChunks`): the first takes `cap` rest views, later ones `cap − 1` plus the first
  chunk's dressed cell 0 as an anchor (its output dropped, S2). On the default 80 px cell a worn item dresses the 5 drawn
  views of Top-down 8 in one call; a held item (112 px canvas, cap 4) takes 4 + (1 + 1 anchor) frames, 2 dress calls (20
  estimated gens). Unique 8 (8 drawn views) at a cap of 4: 4 + (3 + 1 anchor) + (1 + 1 anchor) frames, 3 dress calls (30
  estimated gens). A dress call costs 10 gens up to a 128 px canvas, 15 up to 170 and 25 above (`editGens`). Actual billing
  can use USD. The anchor route's `planCalls` uses the same cap.
- **Held items (`main_hand`, `off_hand`) [S5, B9]:** rest views and base frames are padded by 16 px on every side around the
  same pivot (`HELD_PAD`, less when the canvas would pass 256 px; 80 → 112, legacy 64 → 96; keypoints `(x·cell + 16)/(cell + 32)`); each chroma rest view gets a 2.2 px red dot on the
  held wrist (`markHand`) and the dress prompt says "held naturally, the way it is normally carried, in the character's right
  hand, the hand marked with a small red dot ...; exactly one held item; the arms stay exactly as they are" (no forced
  direction; the item text decides its orientation); poses run on the padded canvas with **frame 0 sent last** when it is
  within 1 px of the rest pose (outputs reordered); a frame that still lost the item (area < 50 % of the clip median on a
  near-rest pose) gets the dressed keyframe layer pasted at the wrist move (free `repair`, `CellQa.repaired`; review warning
  R1, "Held item pasted on N … frames", since the pasted item stands still); layers are stored with the padded `cell` and
  `pivot = rig.pivot + 16` (spec §2.1). Same price: pose calls bill by frame count, not canvas.
- **Clip cleanup after extraction [B9]:** held = largest component + components attached to it or to the gripping wrist
  (≤ 3 px), plus parts that reappear past the body (mostly outside the body silhouette, joined to a kept part by a straight gap
  over body px only: a bow limb or spear tip behind the torso; 2026-11-07); head items (`slot.band`) = trim px outside the aligned, 2 px-dilated dressed keyframe unless at least half of the
  direction's other frames have item px there (temporal consensus), skipped on frames whose aligned overlap is < 50 %.
  Below the head band, detached components are trimmed at extraction; px joined to the item above the band (coif, aventail,
  hood mantle) stay only where the aligned, undilated keyframe has them (no consensus), and frames the keyframe cannot judge
  fall back to the band trim (2026-10-24). Body-hugging worn items (torso, legs, feet, arms; not `back`/`hair`) drop detached components with < 50 % of their px on
  the body silhouette (motion smears; T3). Capes and hair keep the component filter only (consensus trim would eat swings).
  The component filter (< 15 % of the largest part) keeps a part that lies mostly on the aligned dressed keyframe: a cape's
  clasps or a hem seen between the legs are design, not smears (2026-11-07: 412 to 584 design px per cape were deleted).
- Cost on the default rig (Top-down 8, 80 px cell, idle + walk): worn **≈ 25 gens** (dress 10 + 5 pose calls × 3), held
  **≈ 50** (2 dress calls + 10 pose calls). On a Default-only character only the dress calls run (10 / 20).
- Weak spots: more specks from motion smears (largest-component filter removes most), north slash cape vanished on 2 frames,
  vest thin in east [S4] → QA re-roll, then the alternative route.

### 4.2 Alternative: `inpaint-v3` packed masked grid (route `inpaint-grid`) [S4]

`inpaint-v3` on a **256×256 4×4 packed grid** of chroma-keyed base frames with a slot-band mask (head / torso / cape / feet;
whole cell for held items): 16 cells, 10 gens per call → 6 calls ≈ **60 gens per item**. Cleanest pixels (key kept ≥ 0.99, key
outside ≤ 0.003 on helmet/vest), design varies slightly per call (palDist 4–10, no anchor-cell option). Used for:

- clips without a keypoint sequence (text-animated or imported);
- explicit repair of an accepted item's clip-direction (`regridClip`, Studio repair). Since paid retries require player
  consent (2026-10-28), a failing pose call is never re-rolled or switched to a grid automatically: the draft keeps its
  result and waits for review. A planned grid call remains only for imported frames whose poses cannot be posed
  (`frozenGrid`). A grid over 256 px needs Tier 2: when the account's known plan cannot run it (`queue.planBlocks`), the
  request fails with the plan message instead of waiting in the queue forever. Back items get "hangs down the back, never
  wraps the arms". (Rounds B14 to 10 describe an automatic two-re-roll then grid fallback that no longer runs.)

For capes on text clips, `edit-animation-v2` with S2's anchor cell is the second choice.

Accepted-item repair also supports oversize held layers. `gridRepairRequest` pads each frozen body frame into the item's
existing cell without scaling, adds protected dressed reference cells, and refuses a canvas above 512 px on either side.
Eight 96 px frames plus four references form a 384×288 grid. Held masks are a disc around the actual measured
wrist whose radius is the weapon's farthest pixel from the rest wrist over every dressed view (largest component) plus
max(4 px, 10 %), never below the former 34 px (a 64 px body's sword already reaches about 39 px); missing or out-of-cell measurements fail before enqueue. The held prompt requests exactly one held item in the
intended hand. `regridClip` publishes only complete, correctly sized output with no failed quality checks, and verifies
the current rig and original item inside the same atomic save transaction. Other directions and moves remain intact.

Scoped move replacement persists explicit source directions in `MoveSpec.dirs`. It replaces their body cells, sources,
measurements and anchors together, invalidates equipment coverage only there, and re-poses selected items only there.
Dependent mirror views are included when their source changes. Failed measured body candidates cannot replace an
existing scoped clip. New authored side Slash uses persisted `poseStyle: visible-side-v1`: a visible forward high guard
and separated passive wrist. Missing style retains the original pose arrays and paid request hashes for older jobs.

An explicit `near-rest-v1` body-palette repair reuses completed renders. It changes only outliers beyond the existing
12/255 channel tolerance with a unique nearest standing color within 16/255 per channel and a compatible hue family.
Both raw drift and changed-pixel shares are capped at 5%; unsafe matches stay untouched. Alpha and coordinates never
change. Only corrected PNGs need new actual measurements. Existing pose, palette, feet and border gates still apply.
`ClipSource.processing` preserves the version, original fit, correction counts and raw/final estimator-input PNG hashes.

### 4.3 Superseded or rejected

| Route | Status |
|---|---|
| S2 chroma `edit-animation-v2` over all cells as the primary route | Superseded by §4.1; `edit-animation-v2` is now the **dressing** call (one frame per drawn view) and the cape fallback. |
| S1 local diff on skin composites | Fallback only for items colliding with both keys; always human-reviewed. |
| Template animations, rigid propagation | Banned / superseded (posing gives the consistency propagation was buying). |
| `transfer-outfit-v2` as the per-clip design lock | Superseded, not banned: anchor-cell `edit-animation-v2` held the design closer (palette distance 9–10 vs 34) and kept the sword's shape (area CV 0.04 vs 0.27–0.39) [S2 X4]. Allowed for reference-image dressing; run the same chroma gates. Concept-image items use the anchored edit-animation-v2 route instead: blind-judged against transfer, no winner and more hard fails on transfer ([round 2](research/generation-quality-round2-2026-10-25.md) arm E). |
| Per-cell masked inpaint, Pro Flash reference per cell | Design flicker [S1, S4]. |
| Animating a dressed keyframe with pixminimax/v3 | Misaligned body (IoU 0.65–0.84) [S4]. |
| `edit-images-v2`, Pro Flash grids, Pixen | Shifts / key loss / faces drawn into layers [S4]. Pixen = 1-gen draft preview only. |

### 4.4 Chroma extraction (unchanged from S2)

Key score ratio < 35 on opaque pixels, rim guard, drop components < 2 px, despill, layer drawn over the real base frame
(pre-occluded). Key choice: green; magenta when the prompt matches `/green|emerald|lime|olive|jade|teal|mint|forest/`; blue
(the green ramp with G and B swapped) when the prompt also names a red or pink hue and no blue or purple one (a green-and-pink
item on magenta lost its pink on every frame; 2026-10-25 campaign arm K; purples and indigo score as blue key); azure (the
green ramp hue-rotated to 210°; scored, despilled and luminance-matched in the rotated frame) when the prompt names green and a
purple but no blue (a green-and-purple tunic on magenta kept 1.3 % of its purple while every gate passed, on azure 100 %; round
2 arm Z); magenta when all four collide, as before (the diff route would keep the colors but cannot be posed); never gray; a dressed
keyframe that fails G3 (key px outside the body: a key/item collision) is reported for review and never switches the key
automatically (2026-10-28 consent change). The prompt words are only a first guess: each dressed view also measures its
near-key share (item px with key score 20 to 34 and a brightest channel of at least 64, since very dark shades inflate the
ratio score); 20 % or more adds a K1 review note, and on any collision (K1, keyframe G3 or G4) the draft's Try again uses a
key chosen from the measured colors (`keyFor`, the shared-fit rule; off-body key px count only when they are more than 16
from the key ramp), preferring keys the prompt allows (2026-11-07); G2 and posed-frame failures never switch (a collision cannot lower G2; G2 fails on erased body px). Color budget: the key ramp takes ~5–8 of ~17–19 quantized colors → items get 6–8 [S2].
Why green and not cyan or blue as the default (D27), with every measurement and how to retest: the
[chroma key reference](research/2026-11-09-paperdoll-video-review/chroma-key.md).

**Round 3 cleanup rules** ([round 3](research/generation-quality-round3-2026-10-25.md)).
- *Despill*: a key-tinted px first loses the key excess (the key channel down to the next one; azure in its rotated frame),
  then snaps to the nearest clean item color within 40 (Chebyshev RGB); a px left near-gray only snaps to near-gray colors. With
  none that near, the old luminance rule decides, except for a lightly tinted px de-spilled to near-gray (steel stays gray; a
  fold drawn in the key's darkest shade still becomes the item's dark color). The luminance-only snap turned blue-gray steel on
  the azure key into the plume's purple. A colored px that matches no clean color and scores below the key with a real key
  excess keeps its own color (jade, fern and turquoise gear were half-despilled into colors the item never had; 2026-11-07
  cycle), unless the despilled result is near-gray. Only spill is touched: a tinted px that is saturated (S >= 0.35), very dark
  or next to a bright px extraction removed (a removed dark outline leaves no light spill). Steel is drawn blue-gray on every mannequin (S up to 0.35 on green), the azure key's own
  hue, so an excess-only test flattened 1,356 of 1,577 azure helm px to gray (2026-11-10 keys 3 review).
- *Hidden body px* (`Item.baseCut`): PixelLab erases the ear tips under a hood or great helm wider than the head, and layers can
  only add px. The dressed keyframe decides where an item may hide body px (erased, above the neck + 3 rows, touching the item
  and the body's edge, ≥ 3 px components, ≤ 4 % of the body; never held items or in-place edit cells); each posed frame hides its own erased px only
  inside that region, moved with the head (posed frames draw legs and hands 1–3 px off, so they never cut on their own). G2
  counts hidden px as covered; the compositor clears them while the item is worn; exports bake `"<base>~<item>"`.
- *Grip fill* (`closeGrip`, held items): the stand-in's hand covers the grip and the posed hand sits 1–3 px from the body's own,
  so a 2 px morphological closing fills the px the stand-in covered where the body has none, with the nearest item color.

**Why a color key and not a pixel diff.** The obvious approach is to record the body before generation and keep only the pixels
that changed. It was the first route (S1) and is still the fallback (`image/diff.ts`, route `none`), but it loses on output:

- **PixelLab repaints the whole body when it adds an item.** Batch edits keep 0 % of body pixels exact; only 45–56 % stay within
  Δ8 and 77–80 % within Δ18 [S1]. `create-character-state` keeps the silhouette but recolors ≈ 74 % of the body [S1, 2026-10-24
  review]. "Unchanged pixel = body" therefore does not hold, and every recolored body pixel becomes a false item pixel.
- **Measured quality.** On the same items, the chroma layers had 0 specks and 0 pinholes and no skin; the diff extractor had 11–38
  pinholes, skin slivers along the arms and a redrawn face baked into the helmet [S2 X1]. The best diff variant tops out at ≈ 9–12
  false body pixels per cell [S2 X3]; on real stored drift it scores F1 0.963 with 8.6 false and 5.1 missed pixels per cell, and
  adding the script-style palette filter made clothing worse (chest F1 0.902 → 0.840) [2026-10-24 review].
- **Posed frames have no clean "before".** Every skeleton-posed frame is a new render; a diff against the frozen base frame also
  picks up the re-render's own differences, while the key only asks "is this pixel still key-colored?".
- **Same cost.** Both use the same generations and run instantly locally. The real trade-off: the key forbids its own color in the
  item (hence the key choice above), the diff accepts dirty layers. The diff route remains as a fallback (dev M3 page); the Studio
  does not choose it automatically because diff items cannot be posed, fall back to the anchored edit route and always end in review.

### 4.5 Item QA (per item over all cells)

| Gate | Pass |
|---|---|
| Key kept | ≥ 0.97, or ≤ 8 body px lost (a cape covering the back leaves ~126 body px; T3) |
| Key outside base alpha | ≤ 0.05 (`skeleton-pose`), ≤ 0.02 (anchor/diff route evaluation); current `GATES` and caller-selected limits govern |
| Registration | best integer shift = 0 on every frame |
| Area | each cell ≥ 50 % of the clip median; CV ≤ max(0.15, 2 × the CV of the body band it covers) (T3: trousers walk E) |
| Design lock | palette distance to the dressed keyframe ≤ 15 |
| Grip side (held) | Requested wrist keypoints, or tracked hand anchors as fallback. A frame votes only within 6 px of a wrist and with a > 2 px side margin; at least half the clip's frames must decide. A decided opposite-hand clip fails (G8). Each missing-position, unclear-side or no-contact clip retains a review warning; silhouette proximity is not anatomical proof. |
| Shape (held, locomotion) | G9 principal-axis turn relative to the forearm ≤ 30° when keypoints and a reliable axis exist. The axis is signed (pointed from the gripping wrist toward the item's centroid, so a blade reversed in the hand reads as a 180° turn) when, in both frames, the item reaches at least 10 px, its centroid lies at least a quarter of that reach from the wrist and within 45° of the axis; otherwise the unsigned axis decides; otherwise adjacent-frame aligned IoU ≥ 0.3. With keypoints, pairs containing a mask below 6 pixels retain the minimum-sample skip. Near-round masks (normalized covariance eigenvalue gap < 0.2) use IoU because a one-pixel silhouette change can swap their axis by 90°. |
| Hanging, waving, hidden (held) | Review notes instead of failures, each only with physical evidence (2026-11-07): G9 when the item hangs below the hand along a near-vertical axis and turns in the frame by at most half the forearm's own turn (a lantern, censer or flail head); G5 when the px within half the reach of the wrist stay within 25 % and every frame keeps 70 % of the largest reach (a banner's pole or a torch's handle with a moving cloth or flame); G4 when the clip passes the same body-occlusion test as G5. An empty frame, a lost tip, counter-rotation and a strapped shield that fails to turn still fail. |
| Locomotion or action | G5, G9 and G11-G14 apply to locomotion only; G15 also judges the authored slash for items drawn over the body. A clip is an action when its stored joints (measured, else requested; hip-relative, mirror-tolerant) show motion no idle, walk or run reaches: a joint 0.6 body heights from standing, a wrist risen 0.45, or 40 degrees more lean. Otherwise the move id's whole words decide (idle, walk, run, jog, sprint, stroll, march, trot and their forms are locomotion); unknown names stay actions. Motion size alone cannot separate runs from attacks (2026-11-07). |
| Anchor spread (head items) | layer centroid − head keypoint ≤ 3 px in front/back views |
| Framing review | border contact is reported for review; it cannot prove unseen pixels were cropped and does not trigger a G7 retry |
| Stray px | removed and logged |

For posed held items with wrist tracks, G5/G9 failures may be inconclusive because the body hides part of the item.
Compare masks in wrist coordinates: missing pixels can be hidden only inside the other frame's frozen body silhouette
(1 px tolerance, as in posed extraction). Require at least 6 shared pixels, observable IoU ≥ 0.3, and at least as many
body-hidden differences as visibly unexplained differences. G5 also requires every frame to match the largest observed
silhouette and its area plus potentially hidden reference pixels to meet the original CV limit. Such cases produce an
explicit occlusion review warning, never a clean pass or a paid G5/G9 retry. Original metrics and exported pixels stay
unchanged; hard presence, body integrity, alignment and grip checks remain. Hidden geometry is not reconstructed
or proven by this heuristic, and unexplained changes retain their hard failure.

Border contact and optional headwear padding are review policies, not export constraints. A contained layer can legitimately
reach a cell edge. Keep the contact count and a framing warning; reject actual normalization pixel loss, wrong dimensions,
missing frames or invalid required joints as before. Reference fitting warns about low headroom before a paid trial.

Fail → the draft keeps its result and waits for the user, who may accept it, discard it, or approve a priced Try again or
repair; nothing is re-rolled automatically (2026-10-28). Manual re-rolls remain on the dev-only M3 page, which keeps the roll
with the fewest failed checks, not the last one (free ledger re-evaluation; same inputs only) [T3].
H4 (keyframe consistency) fails only band items (helmet, face) [T3]. B14: soft items (hair, worn torso/back) warn only in a
clip-direction where the item covers ≥ 50 % of the body in some frame and own < 0.5 (the cape from behind, not its edges from the
front); off for legs and feet (S and N look alike). On the Ranger: 6 of the 7 real cape-north frames still flag (the 7th clip fails G4 anyway), 43 false flags are gone.
For band items with stored rest/move poses, a failed H4 may instead require review when an observed forearm explains
it. Align by head joints (±1 px), and allow occlusion only at visible key-colored body pixels within the requested
elbow-to-wrist capsule (3 px radius at a 64 px cell). Require at least 6 visible item pixels, a failing unmasked score,
and a masked score ≥ the unchanged 0.75 floor under that same joint alignment. An unrelated arm or head alignment
alone cannot excuse a failure. This produces an explicit review warning, not verified hidden detail or a clean pass.
All item and new-move H4 callers supply the rig; missing poses retain the original check.
G15 (design detail, review note only; worn items in locomotion, plus the authored slash for items drawn over the body): a same-color patch of the same-facing dressed design (4 px
at a 64 px cell, scaled with the cell area) whose color has no match within 32 per channel anywhere in a posed frame; colors
within 13 of the frame's body are skipped. It sees a lost or recolored detail in its own color, not one sharing a shade with
other parts. Frozen bench: 0 of 328 locomotion frames flagged, also at 2x and 4x upscales (2026-11-07).
New QA records retain scalar summaries per `animation/direction`, including H4 failure/review status and the decided
hand. Adding or replacing a complete direction reduces the current parts again: minimum kept/area ratio, maximum
outside/CV/palette distance, and summed border/shift/stray/grip counts. Source-call mappings stay per frame. Recorded
retry history is retained rather than subtracted when artwork is replaced. Accepting an item overrides only non-clean
parts; replacing the last accepted exception can restore a clean result. A clip's slot-side gate determines failure;
an accepted hand exception is not reopened by a later majority vote.

Palette reporting uses the worst per-clip call-segment distance against the same evaluation's design-call palette.
This prevents a clean segment of a packed call from diluting a drifting one; per-call paid retry maps/budgets are
unchanged. A new per-clip review warning always carries an explanation. This does not add a cross-generation palette
comparison to an older item's original design; each evaluation retains its own design reference.

A free copy's checks cannot be split per move from transparent layers/composites. On a move edit, retain the copy's
indivisible scalar summary (`qa.inherited`) for the moves not yet replaced, merge new parts, and prevent a clean status
while inherited moves remain. The inspector shows "Partial checks": copied checks cover whole moves and totals may
include replaced frames. The summary is removed only after all those moves are replaced; an item without any checks
(the demo's items) lists its moves as inherited without a summary instead.
This preserves the copied evidence, not a claim that its totals measured every previously appended move.
G8 requires at least half a clip's frames to supply contact-qualified side votes. Positions must be finite for every inspected
frame; missing positions cannot be reported as merely ambiguous. Conversely, valid overlapping wrists cannot be described
as missing anchors. A confident sibling never hides an uncertain clip. Detached pixels retain `grip.none` diagnostics and
do not vote for the nearer wrist. The user reviews uncertain grip; no hidden anatomy is inferred. A held frame repaired
from the keyframe (S5) is a review warning (R1), not a failure; its pixels are unchanged.
D1 (dress, 0 gens): a colorful keyframe (median HSV saturation ≥ 0.4) with > 5 % near-gray px flags the dressed view for
review and holds the early pose start; the pose calls still run, since only G1 is structural (T3 cape north hem 11 %; clean
views ≤ 2.2 %). It is skipped when the prompt asks for gray/metal/black/white parts. With three or more drawn views a view
fails only when it is > 5 % grayer than the least gray other view, so a neutral emblem drawn in every view passes; a smudge
in every view is then missed (2026-11-07). A gray px whose color (within 16 per channel) is drawn in at least two other views is shared design, not a smudge: quiver fletching, a white fox-tail tip (live 2026-11-10: 3 of 14 legitimate dress calls were flagged, 1 still is). Two views are required so a smudge drawn in two views cannot excuse itself (one in three of four or more views still can), and only lit grays (max channel ≥ 64) can be shared, so outline shades never excuse a dark patch or a dark-gray smudge. Near-black px (max channel < 48) are line art and do not count, so a black outline cannot
fail an outlined design (2026-11-07). Handedness is set by the
motion: authored weapon-hand actions and dressed keyframes keep it; prompts and hand marks do not [S3].

### 4.6 fg/bg split, compose, export

When appending or replacing an accepted item's move, each new `CellQa.provenance` resolves the selected record by its
`produced` frame keys and adds the existing item provenance length. Direction-local call indices are not source indices:
requests can finish out of order, span batches, or use a grid fallback. Existing cells keep their source references;
missing source evidence fails before persistence. Historical exports are not rewritten automatically.

`fg = layer ∩ base alpha`, `bg = layer − fg` for slots with `bgZ` (exact recompose [S1]). Hair, when the cell's NECK keypoint is
known: an fg piece reaching below the neck is front hair, and bg px within `strandEdge` of it (3 px at 80 px, scaled with the cell)
move to fg, so armor wider than the body no longer covers the outer edge of strands drawn over it (live 2026-11-07: 34 and 22
hidden px in east and north went to 0; south keeps 16 px of back hair between arm and torso, 4 to 5 px from the strand, behind the
armor). Farther hair, such as a back mass beside the shoulders, stays bg, so pauldrons, collars, beards and an upright staff still
cover it. Short hair that ends above the neck keeps the plain split, and the demo fixture (no stored keypoints) is unchanged. Hair
items saved before 2026-11-07 keep their stored split until a move is regenerated. Compose and export as built in M4/M5:
draw list by resolved z (cell > anim > dir overrides), ties by slot order, bg before fg, item id. Export: manifest-spec §5–§6.

### 4.7 Streaming, worn drafts and optional review [D26]

Same requests and ledger as before; only the order of the calls and what the Studio shows changed (`items/run.ts`,
`studio/state.svelte.ts`).

- **Streaming.** A direction's pose calls start as soon as its own dress chunk lands and passes its keyframe gates (the design
  call must pass too), without waiting for the other chunks. Exception: several dress chunks on the first key wait for each
  other, since a later chunk's G3 switches the key and would restart every pose already sent. After every landed call the
  draft is re-evaluated (one evaluation at a time, landings during one coalesce into the next; extraction is cached per
  draft and output) and its preview is republished. A worn draft comes off when it fails or is saved or discarded elsewhere.
- **Coverage.** A draft preview item lists its landed cells in `Item.coverage` and the cells of calls still running in the
  preview-only `Item.pending`, so a pending or missing cell is never read as authored transparency. Saved items never carry
  `pending`.
- **Worn drafts.** `doc.drafts` (slot → draft id) overlays a draft's current preview on the outfit. It is never in
  `doc.items`, so autosave, undo, outfits and exports never see it; wearing a saved item or None in that slot, Discard and
  opening another character clear it. A running draft with no preview yet is a layerless stand-in whose cells are all
  pending. Preview, Top-down and Side-scroller show "<item> loading — <directions>" for pending views instead of hiding the
  item as missing; the draft card marks loading views with a spinner; Inspect draws the landed cells only.
- **Optional review.** When the run ends, a clean draft (`isClean`: status pass, no G1, no failed call, no warning) saves
  itself ("<name> saved"; the open character reloads in place and a worn draft becomes the worn item). Warned or failed
  drafts stay drafts with their badge; Keep it, Try again and Discard stay available.

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
| `head` | head | head | 130 | — | none; tucks `hair` under it (`clips`, B14); a hood checks hide hair (`item.hides`) |
| `off_hand` | held | hand_l | 140 | 2 (5 in S/E/W) | — |
| `main_hand` | held | hand_r | 150 | 1 (5 in S/E/W) | — |

- Held bg layers (blade outside the silhouette) sit **above** `back.bg`, otherwise the cape hides 44–60 blade px in south
  walk; the ladder ships `zOverrides` `{layer: bg, z: 5}` for south/east/west on both hand slots (bg z 1/2 from behind, so the
  cape covers the weapon in north) [M4]. T3: the Studio ladder lacked them (Ranger: 220 sword px hidden by the cape over walk S);
  `saveItem` now copies ladder overrides into stored slots that have none, and Reset restores them.
- Class drives QA (head: anchor spread; held: grip side) and the inpaint-grid mask band.
- Tuck-under (B14): `slot.clips` drops the clipped slot's px at or above the cover's lowest opaque row per column (beside the
  cover: the nearest covered column), so long hair hangs below a helmet and short hair never pokes through; compose does it on
  the fly, exports bake `"<hair>~<helmet>"` variant items that the engine runtimes swap in (manifest-spec inv. 11).
- Hides and overrides are data (`slot.hides`, `item.hides`, sparse `zOverrides`) [R4]. Items are always generated against the
  bare base; no dress-order generation.

## 6. Color model [M4]

Materials = indexed ramps, shadow → highlight, disjoint within each item owner; derived per item from its layers (OKLab k-means,
k ≤ 4 auto) and from the base. **Base regions (B15):** the base's shirt and shorts share one gray ramp (M4), so
`lib/dress/regions.ts` splits them by position: garment grays (C < 0.04, L ≥ 0.18) form 4-connected components (outlines and
skin separate the garments), each component goes to the shorts when ≥ 75 % of it lies at or below hip − 1.5 px along the
neck → hip axis (anchor tracks; fixtures: 60 % of the figure height), a straddling component is cut px by px. The region is
written into the pixel: blue LSB even = shirt, odd = shorts (a 1/255 nudge). Base materials are then Shirt / Shorts / Skin,
still exact-color and disjoint, so export and engine swap shaders are unchanged. Idempotent; runs when a project opens
(existing rigs are migrated once, `baseHash` and the items made for it move to the new hash). Bases made with the shirt prompt
("light gray t-shirt and dark gray shorts") get this split; new bare bases have no garment grays, so they get no Shirt or Shorts material. Recolor = exact index swap (`variantRamp`), `linkTo` for linked materials; grayscale × tint
only as a comparison/engine option. Export: source-ramp sheets + `materials` (+ swap shader), baked variants per preset.

## 7. Storage, queue, key [M1, M2]

- IndexedDB `projects` / `blobs` / `jobs`: project cell keys hash RGBA pixels; queue inputs/results hash their stored
  PNG or raw bytes. These hashes are not interchangeable. Project zip = `project.json` + `cells/<sha>.png`; native-stream
  zip and pure PNG encoder, no dependencies. Store **every** generated frame, reference, keypoint sequence and request: they
  cannot be reproduced.
- Queue: persisted ledger; `/balance` identity selects maintained concurrency defaults: Free/Trial 1, Tier 1 8,
  Tier 2 10, Tier 3+ 20, and a fallback of 3 for unknown plans. These maintained defaults live in
  `app/src/lib/pixellab/plans.ts`; see [plan policy and endpoint audit](pixellab-plans.md). Restricted workflows declare
  their minimum tier before their first paid request and remain queued until eligible. Count remote jobs rather than requests. The leader shares
  capacity and cooldown with other tabs. Proven capacity refusals (429 or the narrowly validated no-jobs-started response) apply a
  queue-wide jittered backoff up to 60 s, honoring longer exposed `Retry-After` values; after waiting, single in-flight
  probes refill the account ceiling. Accepted jobs keep polling. Initial balance detection gates submission; periodic
  refreshes do not interrupt work using a known ceiling. Cooldowns survive reload and first connection.
  Paid retry requires a documented 429 refusal. Generic 423/503/529, network uncertainty and ambiguous 5xx responses leave
  a paid POST `lost` ("may have run, check pixellab.ai"), never automatically resent. Accepted background-job identifiers
  override every error classification, including 401/402, and remain in the ledger without paid resubmission. Ordinary
  auth/credit refusals without accepted-job evidence leave submission waiting for the current credential to recover.
  Policy `code 5000` and ordinary validation errors are terminal. Verify managed-animation `res.directions`.
- **HTTP deadlines:** synchronous `POST /estimate-skeleton` permits 600 s; other API calls permit 120 s. These are bounded
  client policies, not provider SLAs. Record the submission timestamp at HTTP invocation so synchronous wait duration is
  visible. Poll known background-job IDs instead of resubmitting them; result downloads back off and give up after
  10 tries (URLs retained). Unknown lost records stay terminal across reload.
- **Offline (B15):** a browser-offline indication or a request network failure pauses new driving work. This cannot prove
  that an already-sent request was unaccepted. The leader probes free `GET /balance` after a short initial delay, then
  every 15 s; current authentication/credit errors retain the corresponding pause. Stale credential responses cannot
  release work or pause a replacement key, including Forget/reconnect with the same value. A successful current probe
  permits recovery; known jobs remain available for polling and unknown paid requests remain lost.
- The observed B15 animation refusal is narrowly retryable: HTTP 500 on `/characters/animations`, exact "Failed to start
  any animation jobs" text as raw text or a simple root `detail`/`error` envelope containing only that refusal. Additional
  or conflicting payload, other routes/statuses and accepted job-ID evidence defeat this proof and remain unknown.
- Key: memory by default, opt-in `localStorage`, never stored in projects or persisted request payloads; CSP `connect-src` limited to PixelLab hosts.
  Typed credentials remain per tab and never cross `BroadcastChannel`; only a credential-free Forget notification crosses
  tabs. Connect in the tab running the queue, or close that tab to let a connected follower take over. Pending lock
  requests are canceled on disconnect, so a closed Studio instance cannot later restart queue driving.

## 8. UI [D9]

Look **A (native minimal)**, **dark mode by default** with a visible, persisted dark/light switch; system UI font stack;
**Lucide icons** (`@lucide/svelte`) everywhere; no pixel fonts or pixel icons. Sprites render `image-rendering: pixelated` at
integer zoom. Theming ("Paper" look) deferred. The shipped Studio has since moved to the Bronze UI immersive experience; see [production experience](design/production-experience.md).

## 9. Modules (`app/src/lib`)

| Module | Status / change for v1.3 |
|---|---|
| `pixellab/` (client, routes, queue) | built [M1]; add raw/managed skeleton-v3, pixminimax, `create-character-v3` import, `res.directions` check, re-poll policy |
| `store/` (manifest, db, zip, project) | built; manifest gains `Clip` sources (§manifest-spec) |
| `image/` (png, pngraw, hash, chroma, diff) | built; body connectivity observations, item grip and registration checks |
| `rig/` (rig, normalize, mirror, skeleton, freeze) | built for template frames [M2]; **update**: rest-view import, clip routes, pose presets (`setArm`/`rotate`/`shift`, port of `spikes/api/lib/skel.mjs`), canvas re-centering 68/80/96 → 64, rig QA §3.2 |
| `items/` (items, run) | update to `skeleton-pose` (dress + pose) and `inpaint-grid` routes |
| `dress/`, `compose/`, `export/` | built [M4, M5] |

## 10. Historical cost model (gens; 3 generated dirs; idle, walk, slash, hurt)

This preserves the older measured four-move scenario, including managed idle, for comparison. It is not the current
new-character estimate: Studio now authors idle, starts with the Default move only (§3.3) and defaults to Top-down 8. Current
policy-specific baseline/retry estimates appear in the creation UI and [handedness scope](research/handedness-implementation-scope-2026-10-22.md).
USD billing and unknown charges prevent treating any estimate as an account spending cap.

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
| Motion-smear FX, specks | Body components are preserved and reported for review; item extraction retains its slot-specific cleanup. |
| Pose not followed / wrong hand | Adherence + `gripSide` gates; re-roll; author an armed variant. |
| North action frames lose back items (cape) | QA re-roll; `inpaint-grid` fallback. |
| Side-view grip ambiguity | Retain ambiguity warnings and visually inspect grips and trajectories in every direction. |
| Mirrored west swaps the weapon hand and one-sided items | New characters default to Top-down 8, which mirrors the west views; Unique 8 or turning off a view's mirror gives independent views. An item-only toggle cannot repair a flipped attacking body. |
| Pose presets tuned for one body | Free preview before paying; per-body check. |
| Server failures / silent direction drop | Poll known jobs; never automatically resend unknown paid outcomes. Require the exact requested direction set before publication. |
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
[M4]; UI look A, dark default [D9]; maintained plan concurrency (Free/Trial: 1, Tier 1: 8, Tier 2: 10, Tier 3+: 20, unknown: 3).

**Open**

| # | Question | Criterion | Default |
|---|---|---|---|
| O7 | Palette: 3-step key ramp to free item colors | colors per item, key kept | 5-step ramp |
| O11 | Face-context items (hair, glasses) and worn items (chest, cape) on `skeleton-pose` over a full 3-dir × 4-clip set | §4.5 pass rate vs `inpaint-grid` | `skeleton-pose` |
| O13 | Held items in mirrored west | Per character: mirrored views flip the hand, independent views (Unique 8 or a view's mirror off) keep it; generated grips still require QA. | Top-down 8 (mirrored west) |
| O14 | Base scale 48 vs 56 | headroom vs figure size | 48 |
| O15 | Dressing with `inpaint-v3` (192×64 row) instead of `edit-animation-v2` | §4.5 after posing | `edit-animation-v2` |
