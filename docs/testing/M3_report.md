# M3 test report: item lab (B4, 2026-10-21)

Scope: architecture §14 M3 on top of S2 (chroma mannequin) and, at the end, S4's skeleton-posed keyframe route.
Page `#/m3`. Tested live in the Claude built-in browser against the Vite dev server (port 5173) with real generations.

**Result.** The full loop works in the browser: chroma input → PixelLab → normalize → gates → automatic re-roll →
extraction → fg/bg split → accept into the IndexedDB project → M5 export (133-file zip, every layer sheet checked).

- **Anchor-cell route, S2-style 48→64 rig.** Six of the seven requested items were accepted: helmet, leather vest, boots, red
  cape, long hair, blue trousers. Hair and trousers were accepted by human override of a correct warning.
- **The sword was not accepted.** Its blade was cut at the cell bottom on every roll, and the north views moved the
  mannequin's arm.
- **Skeleton-posed dressed keyframe (the S4 default route)** is implemented behind the same route interface. It passed for the
  helmet and the cape (28 gens each, one identical design across walk + slash × S/E/N). The sword failed walk-east there too.

Live testing found twelve defects in the S2 extractor, the gates, the rig contract and the app. All are fixed (§ Bugs found and
fixed). The fixes that matter most downstream:

- a **4 px floor** in the rig;
- **dark-key-shade absorption** in extraction;
- **exact keypoints + 1-px re-registration** for posed items.

## What was built

| Area | Files |
|---|---|
| Chroma extraction (port of `spikes/api/lib/chroma.mjs`): key ramps, ratio key score, mask, rim guard (refined), **dark-key-shade absorption** (new), 8-connected components, despill, `keyKept` (cell border skipped), `keyOutside` (item px excluded), key-score heatmap, S2 prompt, key choice (`pickKey`, `keyAllowed`) | `app/src/lib/image/chroma.ts` |
| Diff fallback for items that collide with both keys (S1 `auto` = `slot_novel2_grow1` / `novel_cc` + S2 skin-only rejection + pinhole fill, ported from `diff.mjs`/`extract.mjs`/`clean.mjs`) | `app/src/lib/image/diff.ts` |
| Slot ladder (architecture §4 as data), call planning (`planItem`: skel = dress + pose per clip × dir; anchor = packed ≤16 / 15+anchor), prompts, the **route interface** `itemRoute.{edit,pose}`, keypoint bands, per-cell extraction (posed: re-registration + stray filter), gates G1–G10, fg/bg split check, manifest `Item` builder, contact sheets | `app/src/lib/items/items.ts` |
| UI-free runner for M3 and the Studio (B6): drafts, queue calls, ledger-derived evaluation, auto re-roll policy, key switch, accept | `app/src/lib/items/run.ts` |
| Project store helpers (B2 record format): `listProjects`, `loadProject` (decodes every referenced cell), `saveItem` (re-reads before writing), `deleteItem` | `app/src/lib/store/project.ts` |
| Item lab UI: rig picker, form (slot, name, prompt, key auto/override, route auto/override, anims × dirs, plan + cost), per-item call table, QA table, clip table, log, grid per anim (key input / composite or heatmap / layer / layer over the real base) + final compose rows for **every** rig direction (west = mirror), re-roll per call, accept, dev "save sheet" | `app/src/ui/M3.svelte` |
| M5 exports a real project: source select (S1 fixture or any `projects/rig-*`), in-memory "All items" preset | `app/src/ui/M5.svelte` |
| Rig: 48 px base padded **x+8, y+12** (4 px floor), `Rig.pad`; M1 base preset "S2 clothed 48 px"; M1 base animation modes `skeleton-v3` (default) / `v3` / `pixminimax` (no `template`); `routes.animateWithSkeletonV3` | `rig/normalize.ts`, `rig/freeze.ts`, `rig/rig.ts`, `ui/M1.svelte`, `pixellab/routes.ts` |
| PNG decode uses the pure decoder for 8-bit RGB(A) (`createImageBitmap(Blob)` stalled for minutes in a throttled tab) | `image/png.ts` |
| Dev-only `POST /__dev/save?name=*.png` → `docs/testing/img/` (contact sheets) | `vite.config.ts` |
| Self-tests `image/chroma`, `image/diff`, `items` (node + `#/selftest`) | `lib/selftests.ts` |

## Gates (as implemented)

| Gate | Rule | On fail |
|---|---|---|
| G1 | output count = cells, every output = cell size | re-roll |
| G2 | key kept ≥ 0.97 (base-opaque, non-item, non-border px still key) | re-roll; after 2 re-rolls switch key (only if the item color allows it) |
| G3 | key px outside the base alpha ≤ 0.02 (≤ 0.05 for posed cells, S4) | re-roll |
| G4 | every cell ≥ 50 % of its clip's median area; clip median > 0 | re-roll |
| G5 | clip area CV ≤ max(0.15, body-band CV + 0.05) | re-roll |
| G6 | pixel-weighted palette distance to the design call ≤ 15 | soft: re-roll while re-rolls are left, then keep with a warning |
| G7 | no layer px on the top row / side columns / bottom row away from the feet | re-roll |
| G8 | held items: every clip in the same hand (majority; nearest-px distance to hand_r / hand_l anchors) | re-roll |
| G9 | held items, locomotion clips: adjacent-frame centroid-aligned IoU ≥ 0.4 (rigid object keeps its shape) | re-roll |
| G10 | no misregistered frame: no 1-px shift fits the base silhouette better (S4 "shifted frames = 0"); posed frames are re-registered by that shift first | re-roll |
| posed | skeleton-pose cells: key kept / key outside measured with 1 px tolerance, key outside ≤ 0.05; components < max(4 px, 15 % of the largest) dropped (motion smears); G5/G9 locomotion only, G7 on action clips = warning | — |
| info | fg/bg split recompose exact, specks/pinholes, out-of-band px, centroid spread vs slot anchor | — |

Re-roll = the whole call with a new seed; re-rolling the design call also re-runs the later calls (new anchor). 2 re-rolls per
call, then (G2 only) the other key, then "needs review": the runner still finishes coverage and the user may accept anyway
(QA status `accepted`).

## Rigs used

| Rig | How | Notes |
|---|---|---|
| `rig-af339fa3c098` "hero48" | M1 `create-character-v3` 48 px (S2 clothed prompt, seed 4321, 2 gens) + idle/walk templates S/E/N (USD 0.066) → M2 36 skeletons (3.6 gens) → freeze, pad x+8 y+16 | the 7-item run; pivot (32, 63): feet on the last row |
| `rig-bbf361232c76` "hero48f" | same frames re-frozen with the 4 px floor (x+8 y+12), 36 skeletons (3.6 gens) | sword re-test |
| `rig-c05260993e68` "s4skel" | S3/S4 raw skeleton-v3 walk + slash S/E/N (`app/public/fixtures/s4rig`, shifted up 4 px), imported in M2, 48 skeletons (4.8 gens) | skeleton-posed route |

Template animation was used for hero48 before the new-models-only rule; M1 now offers skeleton-v3 / v3 / pixminimax only
(not live-tested in M1; the S4 fixture rig stands in for a skeleton-v3 base).

## Items on hero48 (edit-animation-v2 + anchor cell, green key, idle + walk × S/E/N = 36 cells, 3 calls)

Contact sheets (`docs/testing/img/m3_<id>.png`): per animation, per direction 4 rows (key input, PixelLab composite, layer,
layer over the real base), then the final compose for S/E/N/W.

QA values are the item's worst over all 36 cells (key kept = min, key outside = max, area ratio = min over clips, CV = max
clip CV, palette distance = max call). "Calls" counts every paid call including re-rolls and early-rule mistakes.

| Item (slot, layers) | Calls / gens | Key kept | Key out | Area min/med | Area CV | Pal. dist | Specks / pinholes | Result | Visual judgement (sheet) |
|---|---|---|---|---|---|---|---|---|---|
| Iron helmet (head, main z130) | 3 / 30 | 0.989 | 0.000 | 0.97 | 0.017 | 8.3 | 1 / 0 | **pass, accepted** | nasal helmet, empty face opening, identical in all clips/dirs |
| Leather vest (torso_outer, main z60) | 3 / 30 | 0.998 | 0.000 | 0.94 | 0.048 | 11.4 | 1 / 0 | **pass, accepted** | clean; swinging arm correctly occludes it in the east walk |
| Leather boots (feet, main z20) | 7 / 70 | 0.987 | 0.006 | 0.65 | 0.177 (body band 0.129) | 10.9 | 0 / 0 | **pass, accepted** (4 re-rolls under the old G5 rule, 2 wasted magenta calls) | consistent brown boots to below the knee |
| Red cape (back, fg z90 + bg z4) | 12 / 90 (+3 cancelled) | 0.989 | 0.002 | 0.90 | 0.058 | 12.7 | 6 / 0 | **pass, accepted** (re-rolls caused by bugs 1, 3, 6) | full cape N, sides S, flowing in E; holes in the north idle fixed by bug fix 1; split recomposes exactly |
| Long hair (hair, fg z110 + bg z3) | 10 / 100 | 0.987 | 0.000 | 0.86 | 0.053 | **22.1** (G6 warn after 2 re-rolls) | 2 / 0 | accepted (human) | long straight hair, face free, consistent; idle N slightly lighter |
| Blue trousers (legs, main z30) | 9 / 90 | 0.983 | 0.003 | 0.80 | **0.21** walk/east (limit 0.17) | 7.5 | 0 / 0 | accepted (human) | good in S/N and idle; the waistline jumps between walk-east frames (G5 correct) |
| Steel sword (main_hand) | 12 / 120 | 0.989 | **0.032** | 0.94 | 0.042 | 18.8 | 1 / 2 | **not accepted** | right hand in all 6 clips (G8 ok); blade **cut at the cell bottom** in every S/N cell (G7 bottom); north arm moved to hold it (G3 0.021–0.032) |
| Steel sword "lowered" (prompt: hanging straight down) | 6 / 60 | 0.988 | 0.024 | 0.84 | 0.112 | 9.6 | 2 / 0 | **not accepted** | blade on the floor line → clipped; walk east flips from vertical to horizontal mid-clip (new G9: IoU 0.16) |
| Steel sword on **hero48f** (4 px floor) | 5 / 50 | 0.997 (design call) | 0.002 | 0.90 | 0.045 | — | — | needs review | floor fixed the clipping and the edge erasure (key kept 0.97 → 0.997); north arm drift (G3 0.020–0.029) and an idle shape jump remain after re-rolls |

Handedness (G8, hand anchors from M2 keypoints): every sword clip right-handed; mirrored west is left-handed by design (flip).
fg/bg split: recomposition bg → base → fg equals base + layer exactly for the cape and the hair on every cell.

Sheets: `m3_leather_vest.png`, `m3_leather_boots.png`, `m3_red_cape.png`, `m3_long_hair.png`, `m3_blue_trousers.png`,
`m3_iron_helmet.png`, `m3_steel_sword.png`, `m3_steel_sword_lowered.png` (hero48), rejected design calls `m3_rej_*`, debug maps `m3_debug_*` (yellow = key lost inside the body, magenta = erased,
red = key outside the silhouette).

## Skeleton-posed route (S4 default)

**Route** (`method: 'skel'`, default whenever the rig has keypoints for every needed cell): one `edit-animation-v2` call dresses
the three chroma rest cells (`walk/<dir>/0` here; `idle/<dir>/0` when the rig has idle). Then, for each clip × direction, one raw
`/animate-with-skeleton-v3` call poses that direction's dressed keyframe with the base clip's keypoints. The description is "solid
bright green mannequin (chroma key colour) wearing …", and the action gets ", empty hands, no weapon, no effects" unless the slot
is held. Each output is re-registered, chroma-extracted and run through the same gates. Plan for walk + slash × S/E/N: 1 + 6
calls, **28 gens per item**. `Item.route = 'skeleton-pose'`, `Item.dressed[dir]` = RGBA hash of the dressed keyframe,
`CellQa.route = 'posed'`.

Rig: the S3/S4 raw skeleton-v3 walk + slash on S2's character (`app/public/fixtures/s4rig`, imported through M2's drop zone,
48 skeletons, 4.8 gens). The **exact request keypoints** from `spikes/api/out/s3_k1/*.req.json` were then written into the record
(`fixtures/s4rig/keypoints.json`). No new base generations.

| Item | Paid calls / gens | Key kept | Key out (1 px tol.) | Re-registered cells | Stray px dropped | Area min/med | Pal. dist | Result |
|---|---|---|---|---|---|---|---|---|
| Iron helmet | 29 / 94 (the clean run is 28) | 0.994 | 0.031 | 1 | 177 | 0.70 | **0.5** | **pass, accepted** |
| Red cape (fg/bg) | 23 / 76 | 0.988 | 0.026 | 2 | 400 | 0.87 | 3.3 | **pass, accepted** |
| Steel sword | 32 / 103 | 0.987 | 0.028 | 2 | 359 | 0.51 | 2.5 | needs review: walk-east G9 shape jump + G7 (blade leaves the cell) after 2 re-rolls; grip R 36 / L 3 / amb 5 / none 4 |

Sheets: `img/m3_skel_iron_helmet.png`, `m3_skel_red_cape.png`, `m3_skel_steel_sword.png` (slash rows first, then walk),
dressed keyframes `img/m3_skel_dressed_keyframes.png`. Failure evidence: `img/m3_debug_skel_align.png` (estimated keypoints:
1 px wider body + a hallucinated sword in a helmet slash) and `img/m3_debug_g10.png` (walk/south/7 posed 1 px right).

Visual judgement:

- **Design lock is the best of any route** (palette distance 0.5–3.3 vs 7–22 for the anchor-cell route): the helmet, cape and
  sword are the same object in every clip and direction. Walk clips are excellent for all three items.
- Helmet slash north f3–f6 shows a **front-facing visor on a back view** (the model turned the helmet with the crossing arm).
  No gate catches a wrong-facing item. Slash east f2 keeps a small detached gray streak.
- Cape: swings convincingly in the east slash. North slash f0 has an olive smear inside the cape, and f2–3 lose part of the
  cape (S4 saw the same; G4 re-rolled a missing frame once).
- Sword: follows the swing in S/E/N slash (right hand in 36 of 48 cells). In walk east f4–7 the blade drops/flips and leaves
  the cell on every roll. Slash frames exceed the 64 px cell (G7 warnings): an architecture limit (no oversize cells).
- Three earlier mistakes cost ~120 gens before the clean run:
  - estimate-skeleton keypoints instead of the request keypoints (key kept 0.87–0.97 and key outside 0.06–0.12 on nearly every
    clip);
  - the plain "slash" action text;
  - re-rolls of the systematic 1-px misregistration before re-registration existed.

## Export (M5 with the real project)

`#/m5` now has a **Source** select: the S1 fixture or any `projects/rig-*` record (base + accepted M3 items), plus an
in-memory "All items" preset. Exported `rig-af339fa3c098` (hero48, 6 accepted items) from the UI ("download zip" with the
anchor click stubbed): **133 files, 219 KiB**, 0 errors, 0 warnings. Re-checked in-page with `lib/store/zip.ts unzip`
(+1 extra preset → 135 files): 18 layer sheets, every sheet `cells×64 × 4×64` untrimmed, **west row = pixel flip of the east
row in every layer sheet**, Godot (12 files: `.tres` per layer, `Paperdoll.tscn`, `paperdoll.gd`), Phaser (19: JSON-Hash atlas
per layer sheet + `PaperdollContainer.js`), Unity (4 + README), `generic/` strips, `CREDITS.csv` with 26 rows (one per
PixelLab call: endpoint, job id, seed, prompt). Engines were not re-run (B3 verified the same exporter pixel-exact in Godot 4.7
and Phaser 3.80/3.90/4.2).

Baked composites (same compositor as the engines): `img/m3_export_baked_all_walk.png` (helmet hides hair; vest, boots,
cape), `img/m3_export_baked_hair_walk.png` (hair + cape + boots), `img/m3_export_baked_ranger_walk.png`/`_idle.png`
(hair, vest, trousers, boots, cape). Judged at 2×: layering is right in all four directions (cape bg behind the body and
hair in S/E, hair over the cape in N, straps over the shoulders, vest under the cape), no misaligned or missing cells.
Observation: the ladder draws `legs` (z 30) over `feet` (z 20), so trousers cover the boot shafts (an untucked look).

## Bugs found and fixed

1. **Dark key-shade outlines and folds were keyed out.** `edit-animation-v2` quantizes the grid to ~17–19 colors, so the
   red cape's outline and fold lines came back as the key ramp's darkest green (9,39,7): holes through which the gray shirt
   showed (north idle) and outline gaps. G3 also read the outline outside the silhouette as "mannequin moved" (0.19–0.28) and
   re-rolled good capes. Fix: `absorbOutline` (dark key px outside the base alpha touching the item, or with ≥5 of 8 item
   neighbors, 2 passes). Cape north holes gone, G3 0.0016.
2. **Rim guard ate item outlines.** S2's guard drops dark item px over dark base lines (hair tips, trouser edges). Fix: a
   candidate touching non-candidate item px is the item's own outline and is kept (selftest keeps the olive-rim drop).
3. **G2 false failures from the cell edge.** PixelLab erases the outermost row; with S2's y+16 pad the walking feet sit on
   row 63, so 12 erased foot px cost ~3 % key kept (cape 0.966–0.969, trousers 0.955). Fix: `keyKept` skips the 1-px border;
   root fix: rig floor margin (next).
4. **Rig had no floor.** y+16 puts the feet on the last row: swords pointing down were cut at the cell bottom (G7 now checks
   the bottom row away from the feet: 2–5 px per cell on every sword attempt). `normalize` now pads 48→64 as x+8, y+12
   (headroom 12–16 px, floor 4 px). Re-frozen hero48f: sword design call key kept 0.997, 0 clip.
5. **G5 was wrong for legs.** Boots/trousers in the side walk vary in area because legs cross and arms occlude the hips.
   G5 now allows the body region's own CV + 0.05 (boots passed; trousers still fail on a genuinely jumping waistline).
6. **Key switch on the wrong failures.** The runner switched a red cape to magenta (S2: magenta fails on red) and a sword to
   magenta for an arm drift (G3) — both useless. Now: switch only on G2 and only to an allowed key (`keyAllowed`).
7. **G6 metric.** S2's unweighted palette distance read 51 on a visually identical vest because of one 2-px highlight.
   Now pixel-weighted (the vest call: 10.4).
8. **`createImageBitmap(Blob)` stalled** for minutes in a hidden/throttled pane (the page looked hung). `decodePng` now uses
   the pure decoder for 8-bit RGB/RGBA (all PixelLab outputs).
9. Accept failed with `DataCloneError` (a Svelte proxy array in provenance); `acceptItem` snapshots. Accepting right after
   another accept silently did nothing (results reset); it now re-evaluates.
10. A sword that flipped from vertical to horizontal mid-walk passed every gate → new G9 (held shape IoU 0.16 caught).
11. Skeleton route, three fixes:
    - estimate-skeleton keypoints misaligned the posed items (5–12 % key px) → use the exact request keypoints;
    - posed frames came back 1 px off on some frames for every seed → re-registration (`CellQa.offset`), with G10 for what
      remains;
    - a "slash" action drew a sword into a helmet layer → unarmed action text. G5/G9 had also re-rolled correct swings on
      action clips → they now apply to locomotion only.
12. Runner, two fixes:
    - a call out of re-rolls stopped the loop before the other re-rolled calls ran;
    - a rig-switch race left the UI on the previous rig → `openRig` ignores stale loads, and run/evaluate/accept refuse a draft
      that belongs to another rig.

## Costs

All costs come from each job's own `usage`. The account was shared with S3/S4/B5/B6 the whole time. Balance at the end: 1265 gens.

| What | Calls | Gens |
|---|---|---|
| Base `create-character-v3` 48 px | 1 | 2 |
| Template idle + walk × S/E/N (before the new-models rule) | 2 | USD 0.066 |
| `estimate-skeleton` (hero48, hero48f, s4skel, incl. a reload re-run) | 130 | 12.3 |
| hero48 items, `edit-animation-v2` (7 items + the sword variant) | 62 | 590 |
| hero48f sword | 5 | 50 |
| s4skel skeleton-pose (helmet, cape, sword; dress + pose + re-rolls + the wasted runs) | 84 | 273 |
| **Total** | | **≈ 927 gens** |

Clean-run cost: 30 gens per item for the anchor-cell route (36 cells, 3 calls), and 28 for skeleton-pose (walk + slash × 3 dirs).
The rest is re-rolls (by design: boots 4, cape 9, hair 7, trousers 6, sword 9) and the bugs listed above.

Latency was 74–515 s per call. Most of the wall time was the account's 23-job cap (other agents), which pushed M3's concurrency
down to 1–2 for long stretches.

## Known gaps / honest failures

- **The sword never passed.** On the edit route: cell-bottom clipping and north arm drift. On the skeleton route: walk-east
  shape jump, and the blade leaves the cell. Held weapons remain the weakest class. The next experiment is a larger cell for
  weapon layers, or a dedicated held-item keyframe per direction.
- Trousers (G5 waistline jump) and hair (G6 22.1) were accepted by human override. The gates were right to flag them.
- No gate detects a wrong-facing item (helmet visor on a back view in the north slash). A per-direction similarity check
  against that direction's dressed keyframe would.
- The 4 px floor only applies to rigs frozen after this change. hero48 (the 6-item export) still has y+16. The Studio's
  `studio/model.ts place()` (B6) also pads y+16 into the 64 canvas before `buildRig`, so it bypasses the floor.
- The skeleton route ran on a fixture rig whose keypoints were patched in by hand. M2 does not yet store ClipSource keypoints
  when it builds a rig (v1.3 rig builder). Without them it falls back to `estimate-skeleton` keypoints, which misalign.
- The dressed keyframes use `walk/<dir>/0`. v1.3 wants the padded rest rotation, which the M2 rig does not store.
- M1's new base-animation modes (skeleton-v3 default, v3, pixminimax) were not live-tested from M1. M2's loader expects the
  per-direction job labels of the template route; this is untested for v3/pixminimax.
- The diff fallback (`key: none`) is implemented and self-tested, but was not run live (no item needed it).
- Mid-run code edits remount M3 (HMR). The old instance keeps running its loops and persisting a stale drafts array, so reload
  between edits. A Web-Locks leader tab (B6's note) would also fix the multi-tab double-spend risk.
- Draft ids are unique per rig only. The UI keys results by item id, which is fine because it shows one rig at a time.
- Palette snapping / materials (`snappedPct`) are not implemented; `CellQa.snappedPct` is omitted.
