# S3: Skeleton rigging (live spike)

Date: 2026-10-21. Agent: S3. Code: `spikes/api/` (new: `lib/skel.mjs`, `s3_skel.mjs`, `s3_poses.mjs`, `s3_k1.mjs`,
`s3_k1_eval.mjs`, `s3_k2.mjs`, `s3_k4.mjs`, `s3_k6.mjs`, `s3_k6_eval.mjs`, `s3_k6_items.mjs`, `s3_viewskel.mjs`, `s3_overview.mjs`).
Outputs: `spikes/api/out/s3_skel|s3_k1|s3_k2|s3_k4|s3_k6|s3_overview/`. Every job is in `costs.jsonl` / `calls.jsonl`
(base64 stripped, no key) of its folder.

Base: S2's 48 px clothed character `5352683c…` (b48), rotations and template frames padded to the 64 rig (x+8, y+16).

> **Constraint change mid-spike (PM, user):** only `create-character-v3` / `create-character-pro-flash`, animation modes
> `v3` / `pixminimax`, and skeleton routes `estimate-skeleton` + skeleton-v3 (raw `/animate-with-skeleton-v3` and
> `/characters/animations` `mode: "skeleton-v3"`) are allowed. Legacy `/animate-with-skeleton`, `mode: "template"` and `pro`
> were run here **only as early baselines (6 jobs) and are not recommended**; nothing below depends on them.

## Verdict

1. **Skeleton-v3 is the rig.** Raw `/animate-with-skeleton-v3`, fed keypoints authored from one `estimate-skeleton` rest pose,
   produced the missing RPG actions (slash, cast, hurt, death; S/E/N) from **one reference image** with:
   - pose adherence 0.4–1.1 px mean (re-estimated vs requested, standing actions; 2.1 px on death);
   - the requested hand moving in 100 % of slash frames (right-hand displacement 78–96 px vs left 11–28 px);
   - feet drift 0 px, canvas = the 64 rig cell, palette fit 1.00 (every colour within 12 of the base palette), 21–27 colours;
   - 3 generations per ≤8-frame clip, ~2 min.
2. **NEW, most important for paperdolling: posing a DIFFERENT keyframe with the SAME skeleton sequence gives pixel-ALIGNED
   frames.** Raw v3 on the chroma mannequin vs the base: silhouette IoU 0.988 (S) / 0.977 (E), best shift 0,0 on every frame.
   On a dressed chroma keyframe (helmet + sword) only 0.7–1.4 % of key pixels fall outside the base frame's alpha — **and it
   does not depend on the seed** (seed 11 vs 7: 1.4 % vs 1.3 %). Managed `skeleton-v3` with the same template behaves the same,
   slightly looser (chroma IoU 0.93–0.95, dressed 3–6 % outside). → **items can be animated by posing a dressed keyframe**:
   one design, identical in every clip, 3 gens per clip-direction, no per-frame edit.
3. **Handedness** stays right when the clip's motion is authored for the weapon hand (v3 slash) or comes from a dressed keyframe.
   It is **not fixable by prompt** on unarmed template motions (cross-punch: 2–4 of 6 frames right-held in every variant), and
   a magenta hand mark makes layers dirty. Use a keypoint QA gate (`gripSide`) and re-roll/re-author instead.
4. **Keypoints are reliable anchors/QA:** `estimate-skeleton` is deterministic (0.00 px over 3 repeats), its head point agrees
   with patch tracking within 0.06–0.77 px on walks, left/right labels were consistent on 100 % of standing frames.
5. Honest weak spots: skeleton-v3 adds **detached motion-smear FX** (7 of 15 raw clips, 23–130 px, first or last frame);
   it is **not bit-deterministic** (same request + seed: 86 % identical px raw, 49–60 % managed); managed skeleton-v3 renders on
   a bigger canvas (80 for a 48 px character, 96 for 64) and clips falling motions at the rig edge; unarmed action templates
   lose or swap the sword.

Showcases: [`k1_v3_actions`](../../spikes/api/out/s3_overview/k1_v3_actions.png) (all v3 actions),
[`items_raw_slash_south`](../../spikes/api/out/s3_k6/items_raw_slash_south_s7.png) and
[`items_walking-8-frames_south`](../../spikes/api/out/s3_k6/items_walking-8-frames_south_s7.png) (dressed-keyframe route).

## Skeleton format (v3 vs legacy, verified)

| | `estimate-skeleton` | raw skeleton-v3 | managed `skeleton-v3` | legacy (baseline only) |
|---|---|---|---|---|
| Labels | 18: NOSE, NECK, {RIGHT,LEFT} {SHOULDER, ELBOW, ARM (=wrist), HIP, KNEE, LEG (=ankle), EYE, EAR} | same 18, each once per pose | none (template poses) | same 18 |
| Left/right | **character's** side (south view: RIGHT = viewer's left; north: viewer's right) | same | — | same |
| Coords | x, y normalised 0–1 of the image | 0–1 (schema min/max) | — | 0–1 (pixel coords fail: adherence 3.1 px, wrong hand) |
| z | `z_index` **float** (−3.5, −0.5 in side views) | `z_index` int (optional), `depth` 0–255 (optional, defaults to the template standing pose) | — | `z_index` int: floats → **422** |
| Frames | 1 pose | 3–15 (`first_frame_keypoints` + `keypoints[]`) | template's count | exactly 3 |
| Size | 16/32/48*/64/128/256 (*48 accepted) | first_frame ≤256; output = first_frame size | character canvas → bigger animation canvas | 16–256 |
| Cost / time | 0.1 gen, 2.4–3.2 s median at concurrency 3 | 3 gens for 6–8 frames, 1.7–4.4 min | 3 gens / direction, ~1.6–3 min | 1 gen, 0.5–1 min |

- **There is no v3-specific estimator.** v3 consumes `estimate-skeleton` output directly (round `z_index`, or omit it — S3
  omitted z everywhere and let `depth` default). The two formats map 1:1.
- **Managed characters already store the estimate**: `GET /characters/{id}` → `skeletons["2d_reference"]` and
  `skeletons["2d_references"][dir]` equal `estimate-skeleton` on the rotation within ≤0.11 px. → `first_frame_keypoints` free.
- `create-character-v3` with `reference_image` + `direction_images` + `n_directions: 4` **imports our own rotations
  pixel-exactly** (1.000 identical on S/E/N/W) for **0.25 gen**, 26–34 s. This is how a frozen/padded/chroma/dressed keyframe
  becomes a managed character for `mode: "skeleton-v3"`.

## K1: Custom actions on the frozen base

**Method.** `estimate-skeleton` on the padded rotations S/E/N → rest pose (px). `s3_poses.mjs` builds sequences procedurally
(`lib/skel.mjs`: `setArm(side, upperDeg, foreDeg)` with the estimated bone lengths, `rotate()` about the hip centre, `shift()`):
slash (right arm wind-up → overhead → diagonal down across → recover, 8 f), cast (both arms raise → thrust → release, 8 f),
hurt (recoil lean + arms fling, 6 f), death (stagger → kneel → fall over, 8 f). North mirrors the south angle tables
(a → 180 − a). Previews: `out/s3_k1/*_preview_s7.png`. Then `animate-with-skeleton-v3` with `first_frame` = padded rotation
(64×64), `description` "bald man in a plain grey t-shirt … empty hands, no weapon", `action` short label, `view` low top-down,
no z/depth, seed 7. Every output frame was re-estimated (`s3_k1_eval.mjs`) to measure adherence.

**Results** (`out/s3_k1/eval_table.json`; sheets `out/s3_k1/<clip>.eval.png` rows = frames / measured skeleton / requested):

| Clip (v3 raw) | adherence all / arms (px) | hand moved R/L (px) | feet drift | lower-body IoU vs rotation | torso / shoulder dev | pal fit | colours | stray px per frame |
|---|---|---|---|---|---|---|---|---|
| slash S (s7 / s11 / repeat) | 0.5 / 0.9 (0.6 / 1.2) | 96 / 15 | 0 | 0.90 | 0.03 / 0.02 | 1.00 | 26 | 0 |
| slash E (s7 / s11) | 0.9 / 1.6 (1.3 / 2.7) | 87 / 28 | 0 | 0.99 | 0.03 / 0.13 | 1.00 | 25 | 0 (s11: 30 on f2) |
| slash N | 0.6 / 1.2 | 78 / 11 | 0 | 0.96 | 0.02 / 0.05 | 1.00 | 21 | 32 on f0 |
| cast S / E / N | 0.9 / 2.1, 0.9 / 1.2, 0.9 / 2.1 | both | 0 | 0.89–1.0 | ≤0.04 / ≤0.24 | 1.00 | 21–26 | S 31+71 (f0–1), N 34 |
| hurt S / E / N | 0.4 / 0.6, 0.6 / 1.0, 0.4 / 0.6 | both | 0 | 0.90–0.99 | ≤0.04 | 1.00 | 21–27 | S 23 on f0 |
| death S / E / N | 2.1 / 1.5, 1.1 / 1.0, 1.5 / 0.6 | — | (lying) | — | ≤0.06 | 1.00 | 21–25 | 29 / 32 / 130 on the last frame |
| walk S/E/N, punch S **retargeted** (keypoints = estimated S2 template frames) | 0.5–0.8 / 0.6–1.1 | — | 3.6 (stride) | — | ≤0.03 | 0.99–1.0 | 21–29 | 0 |

Comparisons on the same base (slash S unless noted; sheet [`k1_routes_slash_south`](../../spikes/api/out/s3_overview/k1_routes_slash_south.png)):

| Route | Result |
|---|---|
| `animate-with-text-v3` "overhead slash attack with the right arm …" (1 gen, 9 frames incl. reference) | **wrong hand** in S (left hand moved 105 px vs right 18), smoke FX, no slash; E: 144 px of FX; height drift 5.8–7.9 px. Unusable for controlled weapon actions. |
| `/characters/animations` `mode: "v3"` (1 gen) | 9 frames on a **68×68** canvas (`keep_first_frame: false` still returned 9), both hands move (64 / 51), 32–37 colours. |
| managed `mode: "skeleton-v3"` templates (3 gens/dir) | walking-8 S/E, falling-back-death, taking-punch on the b48 character: **80×80** canvas (re-centred exactly onto the rig), identity OK, one black glitch patch on the head (walk f6, f8), death falls past the rig bottom (feet clipped), head/neck proportion off on hurt/death (head-neck dev 0.41–0.43). |
| legacy `/animate-with-skeleton` (baseline only, now disallowed) | 3 frames only, adherence 0.6–2.2 px, **41 colours, palette fit 0.83–0.89, height drift 2.3–3.3 px**; pixel coordinates fail. |
| `mode: "template"` (baseline only, now disallowed) | falling-back-death / taking-punch: black smear artifacts, torso dev 0.15. |

Visual judgement (contact sheets read):

- [`k1_v3_actions`](../../spikes/api/out/s3_overview/k1_v3_actions.png): every action reads; the arm chain follows the authored
  keypoints closely; **the face, shirt, shorts and proportions stay those of the base**; legs do not move unless asked.
  Death lies down cleanly in S and E. Weak frames: the slash "strike high" frame covers the face with the forearm (as authored),
  east overhead frame squashes the head slightly.
- Grey **motion-smear streaks** (detached components) appear along fast arm paths (cast f0–1, slash N f0) and on the final frame
  when the last two poses are identical (all three deaths). Keeping the largest 8-connected component removes them.
- [`k1_retarget`](../../spikes/api/out/s3_overview/k1_retarget.png): re-running a template's estimated skeletons through raw v3
  on the one reference gives a clean walk (east stride clearly readable) and punch → **any motion can be stored as
  (reference image, keypoint sequence)**.

**Identity across clips.** Raw v3 clips keep every colour inside the base palette (fit 1.00) and torso/shoulder/head-neck
proportions within 2–6 % of the rest pose (east shoulder width varies 13–30 % because the far shoulder is occluded — a metric
artefact). Same request + same seed is **not** bit-identical (86 % of opaque px identical, 0/8 frames identical) → generated
frames must be stored, never regenerated.

## K2: Chroma item route on the new clips

`s3_k2.mjs`: S2's route (green key mannequin of the new frames + `edit-animation-v2`, 10 gens/call), anchor cell = S2's dressed
walk cell (`sword48_A.out0/out8`, `*_Ba.out0` for north), 14 new cells per call (8 slash + 6 cross-punch, or 8 slash + 6 hurt
north). 12 calls, 120 gens, 108–177 s.

| Run | Clip | area CV | grip R/L/amb/none (QA gate) | key kept | Notes (visual) |
|---|---|---|---|---|---|
| sword v0 S | v3 slash | 0.13 | **7/0/1/0** | 0.993 | sword raised overhead and swung down-right in the right hand ([sheet](../../spikes/api/out/s3_k2/sword_v0_S.final_sheet.png)) |
| sword v0 S | cross-punch | 0.18 | 4/1/0/1 | 0.94 | sword floats behind the head / changes hand |
| sword v0 E | v3 slash | 0.04 | 6/0/2/0 | 0.978 | near (right) hand throughout ([sheet](../../spikes/api/out/s3_k2/sword_v0_E.final_sheet.png)) |
| sword v0 E | cross-punch | 0.12 | 2/0/0/4 | 0.98 | sword hangs low, not following the punch |
| sword v0 N | v3 slash / hurt | 0.06 / 0.05 | 6/0/0/2, 6/0/0/0 | 0.989 / 0.998 | correct, right = viewer's right |
| helmet v0 S | slash / punch | 0.05 / 0.02 | — | 0.997 / 0.996 | clean; head-anchor dx spread 0.7 / 3.2 px ([sheet](../../spikes/api/out/s3_k2/helmet_v0_S.final_sheet.png)) |
| helmet v0 E | slash / punch | 0.06 / 0.03 | — | 0.993 / 0.996 | clean; dx spread 3.7 / 2.7 px (side view, helmet extends back) |

The sword design matches the walk sword (same anchor). The mannequin is redrawn slightly on big-motion cells: key pixels
outside the base alpha 1–12 % (cross-punch E 11–22 %), vs ≤2 % in S2's walk runs — QA `keyOutside ≤ 0.05` flags those cells.

## K3: Handedness

| Variant (14 cells, S/E) | slash S | punch S | slash E | punch E | layer quality |
|---|---|---|---|---|---|
| v0 S2 prompt + anchor cell | 7/8 R | 4/6 R | 6/8 R | 2/6 R | clean |
| v1 + image-side phrasing ("right hand … viewer's LEFT … stays in that hand") | 7/8 | **2/6** (3 L) | 5/8 | 1/6 (4 L) | clean |
| v2 magenta hand mark (r 2.5 px at the right-wrist keypoint) | 7/8 | 3/6 | 4/8 | 1/6 | **dirty**: PixelLab repaints the mark brown/skin (0 magenta px left), which leaks into the layer as brown specks on most frames; area CV up to 0.21 |
| v3 phrasing + mark | 7/8 | 2/6 | 4/8 | 3/6 | dirty, strike frames point the blade the wrong way ([sheet](../../spikes/api/out/s3_k2/sword_v3_S.final_sheet.png)) |
| dressed-keyframe posing (K6) | 8/8 visually (gate 5/1/2) | sword lost on 4/6 | 8/8 visually (side view: gate mostly "amb") | 3/6 | 1–6 specks per clip + motion smears |

What reliably keeps handedness: **the motion itself**. If the weapon hand drives the clip (skeleton-authored attack) the sword
follows it; a dressed keyframe carries the hand into every pose. Unarmed templates (cross-punch) give the model no reason to keep
the sword, and no prompt fixes that. Retro-QA of S2's runs with the same gate reproduced S2's visual finding exactly
(walk S 8/8 R; punch S **0/6 R, 6/6 L**).

## K4: Skeleton as anchors and QA (`s3_k4.mjs`, `out/s3_k4/k4.json`)

| Measure | Walk S / E / N (template) | Punch S / E | v3 slash, cast, hurt | v3 death |
|---|---|---|---|---|
| Repeat noise (same image ×3) | 0.00 px | — | — | — |
| Head keypoint vs patch-tracked head, mean (max) | 0.06 (0.17) / 0.77 (1.2) / 0.37 (0.62) | 1.1 (5.2) / 1.5 (7.4) | 0.07–0.54 (≤1.8) | 14–15 (tracking invalid when the body rotates) |
| Head y vs silhouette top, mean | 0.04 / 0.55 / 0.17 | 0.19 / 0.22 | 0.15–1.15 | 3–4.7 |
| L/R label consistency | 8/8 each | 6/6 | 100 % | 6/8–7/8 (lying poses) |
| Jitter (mean 2nd difference), neck / hips / head px | 0.6–0.8 / 0.8–1.5 / 0.5–0.6 | 2.1–2.5 / 1.0–1.2 / 2.7–4.7 | 0.7–1.6 / 0.4–1.0 / 0.4–3.1 | 4–6 |

**QA metrics that worked** (all in `lib/skel.mjs` / `s3_k2.mjs`):

- `gripSide(dR, dL, handsDist)`: min distance from held-item pixels to each wrist keypoint; R/L if one is ≤6 px and the
  other is ≥1.5 px further, "amb" if the hands are <3 px apart or the distances are within 1.5 px (side views). Gate: no "L"
  frames for a right-hand item; >25 % "amb" in a front/back view → review.
- Helmet anchor: (layer centroid − head-keypoint centre) spread per clip: 0.2–0.7 px on walk/slash S, 2–4 px in side views and
  punches. Gate ≤3 px front/back.
- Pose adherence (re-estimate vs requested, arms mean ≤2 px) for every skeleton-v3 clip.
- Stray px (opaque px outside the largest component) → auto-remove, and log.

Keypoint anchors also place rigid items without AI: the K6 dressed keyframes were built by moving S2's walk-frame helmet and
sword layers by the head-centre / right-wrist delta onto the rotations ([`preview_rotations`](../../spikes/api/out/s3_k6/preview_rotations.png)).

## K6 (added for the constraint): skeleton-v3 alignment across keyframes

`s3_k6.mjs`: three managed characters imported with `create-character-v3` (reference + direction_images, 0.25 gen each,
pixel-exact): **base** (padded 64 rotations), **chroma** (green key), **dressed** (key + anchor-placed helmet and sword).
Each posed with the same skeleton: managed `mode: "skeleton-v3"` (walking-8-frames, cross-punch; S/E; seed 7) and raw v3
(K1 slash keypoints; S/E). Extraction = S2 chroma extractor on the dressed frames, drawn over the BASE frames.

| Clip | intra-clip exact px (consecutive) | base repeat: IoU / exact | chroma vs base IoU (min), shift | dressed key px outside base | item layers (visual) |
|---|---|---|---|---|---|
| managed walk S | 0.70 | 0.954 / 0.60 | 0.949 (0.912), 0,0 | 4.2 % (seed 11: 2.9 %) | **clean, rigid, aligned in 8/8** |
| managed walk E | 0.38 | 0.928 / 0.49 | 0.930 (0.895), 0,0 | 6.4 % | aligned; sword 4 R / 4 amb |
| managed cross-punch S / E | 0.30 / 0.24 | — | 0.895 / 0.873, ≤1 px | 4.2 / 8.3 % | helmet OK, **sword lost or wrong** on 3–4 of 6 |
| raw v3 slash S | 0.66 | — | **0.988 (0.974)**, 0,0 | **1.3 %** (seed 11: 1.4 %) | **sword swings in the right hand, helmet locked** ([sheet](../../spikes/api/out/s3_k6/items_raw_slash_south_s7.png)) |
| raw v3 slash E | 0.54 | — | 0.977 (0.957), 0,0 | 0.7 % | correct; 2 frames with grey motion smears ([sheet](../../spikes/api/out/s3_k6/items_raw_slash_east_s7.png)) |

References for "stable body pixels": S2 template walk 0.35 (S) / 0.23 (E) consecutive-frame exact px. **Skeleton-v3 is about
twice as stable but not pixel-locked**: a managed walk frame shares only 35–44 % (S) / 10–36 % (E) exact px with the rotation;
raw v3 rest frames share ~67 %. The "moves the character instead of redrawing" claim is partly true.

**Conclusion.** The pose sequence, not the seed, fixes the silhouette. Posing a dressed key keyframe with the clip's
skeleton yields item frames that line up with the base frames to ~1 % (raw) / 3–6 % (managed) of body pixels. That is a
deterministic-design item route with no `edit-animation-v2` call per clip.

## K5: Recommended rigging pipeline

```
1 Base      create-character-v3 (S4 decides v3 vs pro-flash; 48 px + pad) ─▶ rotations S/E/N (+W = flip) ─▶ pad to 64
            ─▶ re-import the padded rotations: create-character-v3 {reference_image: S, direction_images: {east,north,west},
               n_directions: 4}  (0.25 gen, pixel-exact)  ─▶ rest keypoints = character.skeletons.2d_references (free)
2 Motions   rig = per clip and direction a KEYPOINT SEQUENCE (18 joints, 0–1, character's L/R):
            · standard motions: managed skeleton-v3 once on the base (3 gens/dir) ─▶ estimate-skeleton every frame (0.1 each)
              ─▶ store the sequence (optional: re-render through raw v3 for one uniform path)
            · custom actions (slash/thrust/cast/block/bow/hurt/death): author from the rest pose (lib/skel setArm/rotate,
              s3_poses tables; north mirrors south) ─▶ preview (free) ─▶ raw /animate-with-skeleton-v3
              {first_frame: padded rotation, first_frame_keypoints: rest, keypoints: seq, description (looks only),
               action: short label, direction, view: "low top-down", no_background: true}   3 gens ≤8 f, 4 gens ≤15 f
3 Freeze    keep largest component (drop motion smears) ─▶ binary alpha ─▶ estimate-skeleton per frame ─▶ QA
            (adherence arms ≤2 px, feet drift ≤1 px for standing clips, palette fit ≥0.97, no clipped edges)
            ─▶ store frames + keypoints (never regenerate: not bit-deterministic)
4 Items     A (new, default for rigid/held items): dressed chroma keyframe per direction (one edit-animation-v2 call on the
              key rotations, or anchor placement of an existing layer) ─▶ import as a character (0.25) ─▶ re-run every clip's
              sequence on it (raw v3, same keypoints; or the same managed template) ─▶ S2 chroma extraction over the base
              frames. 3 gens per clip-direction; design identical across clips.
            B (S2, fallback / worn items / unarmed clips): chroma mannequin of the frozen frames + edit-animation-v2, anchor cell.
5 QA        keyKept ≥0.97, keyOutside ≤0.05 (route A: ≤0.03 raw), gripSide (no L frames for right-hand items),
            helmet anchor spread ≤3 px, stray px removed, area CV ≤0.15 ─▶ fail: re-roll the call once, then switch route
```

**Explicit v3-vs-legacy answers (PM):**

1. **Authoring custom actions:** raw skeleton-v3. Legacy is 3 frames, drifts palette (41 colours, fit 0.83–0.89) and size,
   rejects float z, and is now disallowed. Text animation (`animate-with-text-v3`, character `v3`) cannot be trusted with the
   hand or with FX.
2. **Per-frame keypoints for anchors/QA:** `estimate-skeleton` (the only estimator; shared by both, 0.1 gen, deterministic).
   Feed its output to v3 unchanged except `z_index` (round or omit). Managed characters already carry the rotation estimates.
3. **Base animation generation:** managed `skeleton-v3` for the humanoid template motions (template mode is disallowed; v3
   managed is ~2× more pixel-stable than template mode and keeps identity), raw skeleton-v3 for everything custom. Both are
   "derived from one character", and both reduce to stored keypoint sequences — the rig contract.

**Costs (reported `usage`, this spike):** skeleton-v3 raw 26 jobs × 3 = 78; managed skeleton-v3 19 × 3 = 57; K2
`edit-animation-v2` 12 × 10 = 120; estimate-skeleton 354 × 0.1 = 35.4; imports 3 × 0.25; baselines (legacy 4, text 3,
char-v3 2, template 2 × ~$0.011). **≈ 300 generations.** Two jobs failed server-side (`CUDA … INTERNAL ASSERT`; resubmitted
fine) and two polls hit network timeouts (recovered by re-polling the job id, `JOB=<id>` in `s3_k1.mjs`). The account balance
fell 4350.5 → 3218.9 during the spike, but other agents (B4/B5/S4) were spending on the same key, so the delta is not S3's.

**Failure handling:**

| Failure | Detection | Handling |
|---|---|---|
| Motion-smear FX (detached grey streaks) | stray px > 0 | drop all but the largest component; avoid duplicate final poses |
| Pose not followed / wrong hand | adherence > 2 px arms, handOk < 1 | re-roll (different seed), then soften the pose (shorter arm reach) |
| Managed canvas larger than the rig | output w/h ≠ 64 | re-centre ((w−64)/2); falling motions may clip → use raw v3 with an authored death |
| Sword lost / wrong hand on unarmed templates | gripSide L or none | author an armed variant with raw v3, or exclude the held item from that clip |
| Mannequin redrawn off-silhouette | keyOutside > 0.05 | re-roll; accept ≤0.03 |
| Server `failed` / poll timeout | job status / network error | re-poll the same id; resubmit only on `failed` |

## Honest failures and open points

1. Skeleton-v3 is not pixel-locked: body pixels change between frames (30–70 % exact). Layers must still be extracted per frame.
2. The dressed-keyframe route was tested with anchor-placed S2 layers (no AI design call) on 6 clips; a worn item (chest, cape)
   and a full 4-direction item set are untested. Item specks 1–6 per clip, motion smears on raw east.
3. Death/lying poses break head tracking and the L/R label heuristic (label QA must skip lying frames).
4. Side views make `gripSide` ambiguous (hands overlap): 2–5 of 8 east frames are "amb"; z_index of the wrist could break ties.
5. My pose tables are hand-tuned for one body; they are procedural, but other body proportions need a check via the free preview.
6. The "managed skeleton-v3 ≈ template mode identity" comparison used the 48 px character only (template mode now disallowed).
7. West was not generated (mirror of east; mirroring swaps the held hand — see R4's `mirror: swapHands`).
