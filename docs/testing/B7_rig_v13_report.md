# B7 report: rig v1.3 in the Studio, "Add a move", queue lock, material names (2026-10-21)

Scope: architecture v1.3 §3 (rig = skeleton-v3 clips stored as frames + reference + keypoints + route) wired into the Studio's
Create flow, item posing on the stored keypoints, authored/text moves, a cross-tab queue lock, sensible material names.
Live-tested in the Claude built-in browser (`app-dev`, :5173) with real generations: **one new character (idle + walk), one
helmet, one authored move (slash) with the helmet posed onto it**.

**Result.** The v1.3 rig works end to end and is the first rig whose items line up by construction: the helmet passed every
gate on the first try (28 gens, 0 re-rolls) with **key outside 0.000 and zero 1-px re-registrations** (M3 on the fixture rig:
key outside 0.031, re-registration needed). The new rig passed the freeze gate in all 9 clip-directions without a re-roll.
Live testing found one real defect (a blade drawn into the helmet's slash frames that every old gate passed); it is fixed by a
port of S5's H4 keyframe-consistency gate plus a prompt fix, and was re-run live (§4).

## 1. What was built

| Area | Files |
|---|---|
| v1.3 rig types: `Keypoint`, `RestView`, `ClipSource`, `Rig.rest`, `RigAnimation.sources` (manifest-spec §2) | `lib/rig/rig.ts`, `lib/store/manifest.ts` (re-export only) |
| **One placement rule** for M2 / M3 / Studio: `normalize(src, w, h, thr, char)` — the character canvas (`char`, default = source) is padded x-centered with the 4 px floor (48 → x+8, y+12); larger render canvases (managed 80/96, text 68, B6's 64) re-center first. Studio's own `place()` (y+16) is deleted. | `lib/rig/normalize.ts`, `studio/model.ts` |
| Keypoint authoring, port of S3 `skel.mjs` + `s3_poses.mjs`: `setArm`, `rotate`, `shift`, `ACTIONS` slash / cast / hurt / death (north mirrors south), `toApi`/`fromApi`, `adherence`. Death's last frame is a 1 px settle instead of S3's duplicate pose (duplicate final poses caused smear FX). | `lib/rig/poses.ts` |
| Clip helpers: `rawClip` (the raw `/animate-with-skeleton-v3` request shared by base and items), `actionOf`, `largestComponent`, `paletteFit`, `borderPx`, **freeze gate `clipQa`** (arms ≤ 2 px vs requested, feet drift ≤ 1 px on standing clips, palette fit ≥ 0.97, 0 border px; lying clips 3 px) | `lib/rig/clips.ts` |
| Create flow: v3 48 px → rest views (floor pad, west = flip east) → **re-import** (0.25) → rest keypoints from `skeletons["2d_references"]` (estimate as fallback) → per clip × dir: managed skeleton-v3 on the rest character (motion source; `res.directions` checked) → `estimate-skeleton` per frame → raw skeleton-v3 on the rest view → largest component → re-estimate → gate (1 re-roll, keep the better) → freeze with `rig.rest`, `sources[dir]` {route, reference, keypoints, motion, measured, provenance}, `rig.pad`, anchors, `character` {id, looks}. Seeded + cached → resumable. | `studio/create.ts`, `CreateSheet.svelte` |
| **Add a move**: authored (raw skeleton-v3 with keypoints from the rest pose) or described (pixminimax motion with "unarmed, no weapon, no props, no other people, no effects", `res.directions` check, then the same raw re-render). Writes the clip + mirrored west + measured skeletons + keypoint anchors, recomputes `baseHash` and moves items made for the old base to the new hash. Then poses every chosen item's dressed keyframes (one call per item × direction, cost shown per item). Resumable. | `studio/create.ts` (`addMove`), `MoveSheet.svelte`, `Moves.svelte`, `state.svelte.ts` |
| Items consume the stored rig: `canPose` needs `rig.rest` + `sources[dir].keypoints` (no estimated fallback, no hand-patched fixture keypoints; older rigs use the anchor route); the dress call dresses the **rest views** (`rest/<dir>/0`); pose calls send exactly the stored sequences; `poseItemClip` adds a clip to an accepted item (1 re-roll on a failed gate) | `lib/items/items.ts`, `lib/items/run.ts`, `lib/store/project.ts` (decodes rest views) |
| **H4 keyframe-consistency gate** (port of S5 `s5_dircheck.mjs`, 0 gens): rigid/head items must look like their own direction's dressed keyframe (own ≥ 0.75, any view) → else fail + re-roll; worn items: front/back warning only; off for feet and held. Item pose description now also says "empty hands, no weapon". | `lib/items/items.ts` (`simAligned`, `dirGate`), `run.ts` (`withH4`) |
| Head-band clip for posed head items (`slot.band`: head, face_acc): layer px below neck + 3 are dropped (invented props/smears) | `lib/items/items.ts` (`extractCell` `clip`) |
| **Queue cross-tab lock**: `navigator.locks.request('pixeldoll-queue')`; the holder (leader) loads, submits and polls; other tabs mirror the ledger every 1.5 s, only enqueue/cancel, never mark records `lost`; the leader merges records enqueued elsewhere; when the leader closes the next tab takes over (and only then cleans orphaned submits). The in-memory key reaches the leader over a same-origin `BroadcastChannel` (never stored). UI: "Running in another tab" (toolbar + Activity). `enqueue(..., {cache})` reuses deterministic unseeded calls (estimate-skeleton, GET character). | `lib/pixellab/queue.ts`, `main.ts`, `Toolbar.svelte`, `ActivitySheet.svelte`, `ConnectSheet.svelte` |
| **Material names** from description nouns, then slot, then hue ("iron knight helmet with a red plume" → Metal, Feather; boots → Leather; base → Skin, Clothes); shown for old projects too. Swatches show the **full ramp** with an inset light ring so near-black ramps stay visible on dark. | `lib/dress/dress.ts` (`materialNames`), `Colors.svelte`, `studio.css` |
| `itemCell` aligns oversize layers by pivot (B8's v1.3.1 frames) | `studio/model.ts` |
| Self-tests: `rig/poses`, `rig/clips`, queue two-tab fake-lock test, normalize render canvases, material names, H4 | `lib/selftests.ts` + modules |

## 2. Live run (one character, budget ≤ 150 gens)

Balance before: 1,132 gens. All costs from each job's own `usage`.

| Step | Calls | Gens | Result |
|---|---|---|---|
| Create "a lean young human ranger with a calm face" (seed 918123) | v3 base 1, import 1, GET 1, managed 6, raw 6, estimate 72 | 2 + 0.25 + 18 + 18 + 7.2 = **45.45** | rig `rig-01ab6ec414d4`, 0 freeze-gate fails, 0 re-rolls (~19 min wall, account busy) |
| Helmet ("iron knight helmet", Studio New item, skeleton-pose) | dress 1 + pose 6 | **28** | pass first try, accepted ("Clean") |
| Add move: Slash (authored) | raw 3, estimate 24 | 9 + 2.4 = **11.4** | 0 gate fails, 0 re-rolls |
| Pose helmet onto slash (first run) | 3 | **9** | passed the old gates, **but a blade was drawn into 9 of 24 frames** (§4) |
| Re-pose helmet slash with H4 + prompt fix | 5 (2 re-rolls) | **15** | no blade; status warn (3 small leftovers, §4) |

Freeze gate per clip-direction (stored in `rigQa.clips`):

| Clip | adherence (px, arms) | feet drift | palette fit | border px | stray px |
|---|---|---|---|---|---|
| idle S / E / N | 0.22 / 0.50 / 0.17 | 0 / 1 / 0 | 1.00 / 1.00 / 1.00 | 0 | 0 |
| walk S / E / N | 0.34 / 0.67 / 0.36 | (stride, not gated) | 1.00 / 0.996 / 1.00 | 0 | 0 |
| slash S / E / N | 1.08 / 1.61 / 1.16 | 0 / 0 / 0 | 0.995 / 1.00 / 1.00 | 0 | 0 / 19 / 0 |

Stored-data checks (read from IndexedDB in the page):

- every cell and rest view is **64 × 64**; `rig.pad = {x: 8, y: 12}` (floor pad), pivot (32, 59);
- `rig.rest.{south,east,north}` = rest image hash + **18 keypoints** (free from the imported character's `2d_references`; 0
  estimate calls were needed);
- every `sources[dir]`: route `skeleton-v3`, reference = that direction's rest view, `keypoints` [cells × 18] (idle 4, walk 8,
  slash 8), `measured` [cells × 18] on every frame, `motion` `managed-skeleton-v3:breathing-idle` / `walking-8-frames` /
  `authored:slash`, `provenance` indexes into the base's 17 provenance entries (create, import, managed, raw);
- managed skeleton-v3 on the **64 px imported** character came back on **80 × 80** (S3 saw 96 for 64): same scale (figure
  height 45 px in both), centered +8/+8 → `normalize(…, char = 64)` crops it exactly;
- adding slash changed `baseHash` (`…` → `sha256:81ef8a5a…`); the helmet moved to the new hash and stayed "Clean".

Screenshots / sheets:

- `img/b7_1_lock_follower_toolbar.jpg` — a second tab shows "Running in another tab";
- `img/b7_2_create_progress.jpg` — Create progress (Drawing / Setting up the skeleton / Animating 15/84 / Checking and saving);
- `img/b7_3_ranger_rig.png` — row 1 rest views S/E/N, then idle S/E/N/W, walk S/E/N/W (base only, 3×);
- `img/b7_4_helmet_kept_alldirs.jpg` — helmet kept, worn in 4 directions, material "Metal";
- `img/b7_5_add_move_sheet.jpg` — Add a move: Slash / Cast / Hurt / Death, describe field, "Iron Knight Helmet 9 gens", Add Slash · 21 gens;
- `img/b7_6_slash_helmet.png` — first helmet slash run: per direction base row + helmet row for slash, then walk (the
  stray blade is visible in slash E f1–f7 and N f1/f4/f5);
- `img/b7_7_slash_helmet_fixed.png` — after the fix (§4).

Visual judgement: the rig is clean (no specks, no clipped feet, identical face/shirt/shorts in every clip). Walk strides read
well in all directions. **Idle east/west leans forward** (the managed breathing-idle motion is hunched in the side view and the
raw re-render follows it faithfully) — a motion-source quality issue, not a pipeline one. Slash reads in S/E/N; the right arm
leads (character's right). The helmet is the same object in every idle/walk frame.

## 3. Queue lock (two+ tabs, live)

Three tabs on :5173 (Studio, M3, M5) after the reload: `navigator.locks.query()` showed one holder and two pending requests;
`window.__queue.role` = leader in one tab, follower in the other two; the Studio follower showed "Running in another tab".
Entering the key in the follower Studio tab put the key into the leader (M3 tab, `hasKey: true`) without storing it. Closing
the other two tabs (navigating them away) handed the lock to the Studio tab (`role: leader`, ledger 348 records loaded), which
then ran the whole live test. Self-test (`queue`): two/three fake tabs on one ledger — the follower never submits, an in-flight
`submitting` record survives a third tab opening, a follower's job is merged and submitted exactly once, the next tab takes
over and only then marks the orphan lost, and the leader adopts a key entered in a follower.

## 4. Defect found live: a blade in the helmet's slash frames

The first pose of the helmet onto slash passed every gate (key kept ≥ 0.978, G2–G10, status pass), but the model drew a
gray scimitar into **east f1–f7 and north f1/f4/f5** (`b7_6`). Area and shape gates are off on action clips (a swing legitimately
changes area), and the blade is item-colored, not key. Two changes:

1. **H4 gate** (S5's direction gate, extended): a rigid item's posed layer must match its own direction's dressed keyframe
   (centroid-aligned appearance similarity, mannequin-occluded keyframe px skipped) — own < 0.75 fails in any view. Re-checked
   offline on the stored outputs (0 gens): slash E fails f1, f2, f3, f5, f6, f7 (own 0.11–0.49), slash N fails f1, f4, f5
   (0.37–0.44), slash S flags f3 (arm across the visor, own 0.52); **all 6 idle/walk clip-directions pass** (no false fails).
2. The pose `description` now also says "empty hands, no weapon" for non-held items (the base's own description always did,
   and the base slash had no blade).

3. Head items (`head`, `face_acc`: `slot.band = true`) drop posed layer px **below the head band** (neck + 3 px from the base
   frame's measured keypoints) before the component filter — smears and props the pose invents at hip height.

Re-run (same seeds, new description): 5 calls, **15 gens**. East passed first try; south and north failed H4 once
(south f3 forearm across the visor; north a short blade) and kept their re-roll. Result (`b7_7_slash_helmet_fixed.png`, rows
per direction: composite, helmet layer alone): **no blade in any frame**; helmet area per frame 101–155 px (first run up to
216). What is left and is flagged honestly (item status **warn → "Needs a look"**): a thin streak above the helmet in north
f4, a 1-px streak in east f1, and east f2 where the raised forearm splits the helmet and leaves two small fragments. The band
clip was applied afterwards by re-extracting the stored outputs (0 gens: every request was a ledger cache hit) and removed
the hip-height specks of north f6/f7.

## 5. Costs

| What | Gens |
|---|---|
| Create (base, import, 6 managed, 6 raw, 72 estimates) | 45.45 |
| Helmet (dress + 6 poses) | 28 |
| Slash body (3 raw + 24 estimates) | 11.4 |
| Helmet on slash, first run | 9 |
| Helmet on slash, re-run with H4 (5 calls incl. 2 re-rolls; band-clip re-extraction 0) | 15 |
| **Total B7** | **≈ 108.9** (budget 150; balance 1,132 → 1,059 after the helmet, on a key shared with other agents) |

## 6. Tests

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings |
| `npm run build` | ok |
| `npm run selftest` | all pass (new: `rig/poses`, `rig/clips`; queue two-tab test; normalize render canvases; material names; H4) |
| `node app/scripts/e2e-studio.mjs` (Playwright, demo) | all passed (wear, undo/redo, recolor, outfit, keys, theme, reload, export) |

## 7. Known gaps / not done

- **S5 held-item route not wired** (96 px canvas around the same pivot, frame 0 sent last, layer `cell`/`pivot`): B8's
  per-layer frames are in compose/export and `itemCell` now aligns by pivot, but `lib/items` still produces 64 px held layers.
  Next: pad rest views/base frames 64 → 96 (+16, +16; keypoints (x+16)/96), dress at 96, pose at 96 with frame 0 last, store
  `layer.cell = 96×96`, `layer.pivot = rig.pivot + 16`.
- Text moves (pixminimax → raw re-render) and cast/hurt/death were not run live (code path shared with walk/slash; budget).
- Items on moves added later: only skeleton-pose items with dressed keyframes can be posed; anchor-route items get
  transparent cells for the new clip (shown as hidden).
- Anchors of an added move come straight from the measured keypoints (no patch tracking).
- Provenance lists the generation calls, not the 0.1-gen estimate calls (their cost is in the ledger).
- A hidden Browser pane throttles the leader tab's timers to about one tick a minute; a tab that runs long jobs should stay
  visible (or the queue should move to a worker later).
- HMR: editing lib modules while a run is active can remount the Studio; drafts/moves are guarded per module instance only —
  reload between code edits (pre-existing, B6).
- H4 thresholds are from S5's one labeled helmet run plus this one; a south slash frame with the forearm across the visor
  scores 0.52 and re-rolls once.
