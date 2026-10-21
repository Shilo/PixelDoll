# B9 report: held items on the 96 px canvas, streak cleanup, authored idle (2026-10-21)

Scope: wire S5's held-item route into `lib/items` + the Studio, improve the posed-layer post-processing (B7's helmet streaks),
fix the forward-leaning east idle, live-test one sword on B7's "Ranger" rig, export to Godot and run B8's engine harness.

**Result.** A sword made from the Studio's New item sheet ("steel sword", Hands) now routes to the 96 px held route by itself,
is priced correctly (37 gens), passed every gate and was kept as "Clean". It is stored as an oversize layer (`cell 96×96`,
`pivot (48, 75)` = rig pivot (32, 59) + 16), held in the right hand in 44/60 frames (1 L, 13 ambiguous, 2 none), 0 px on the
canvas border, and in Godot 4.7.1 the Studio's export renders **pixel-identical** to PixelDoll's compositor (0 / 1,474,560 px)
with every layer in sync (1,080 ticks, 0 failures). The east idle no longer leans (neck ahead of the hips 3 px → 0, feet drift
1 → 0). The helmet's slash streaks are gone with 0 legit px lost on idle/walk. **Spend: 62.2 gens** (budget 120).

## 1. What changed

| Area | Files |
|---|---|
| **Held route (S5)**: `padOf(slot, method)` = 16 for skeleton-pose `main_hand`/`off_hand`; `padImg`, `padKeypoints` (`(x·64 + 16)/96`); dress = 3 padded chroma rest views in ONE `edit-animation-v2` at `image_size 96` with `heldPhrase` ("held in the character's right hand, pointing down and slightly outward; exactly one weapon, no other weapons, no scabbard, no shield; the arms stay exactly as they are"); pose = raw skeleton-v3 at 96 (`itemRoute.pose({…, slot, cell, pad})`), held description "holding X in the right hand; exactly one weapon …"; **frame 0 sent last** when it is ≤ 1 px from the rest pose (`f0Last`, outputs reordered by `unrotate`); extraction against the 96-padded real base; layers stored with `cell`/`pivot` (`buildItem({pad})`). `poseItemClip` (Add a move) derives the pad from the item's layer cell, so adding a move to a sword stays at 96. Non-held requests are byte-identical to before (ledger cache hits; self-tested). | `lib/items/items.ts`, `lib/items/run.ts` |
| **Free repair**: `repairDropped` pastes the dressed keyframe layer at the requested wrist move into a near-rest frame whose item area < 50 % of the clip median; `CellQa.repaired`, QA warning. | `items.ts`, `store/manifest.ts` (+1 field), spec §2 |
| **Grip QA**: `gripSide` / G8 now use the clip's **requested wrist keypoints** (+ pad) instead of the tracked anchors; a clip held mostly in the wrong hand fails. | `items.ts` `itemQa(…, pad)` |
| **G9 for held items, rotation-aware**: blade principal axis minus forearm angle (requested elbow→wrist) must not change > 30° between adjacent locomotion frames (`axisOf`, `angleDiff`, `GATES.heldTurn`). The aligned-IoU G9 stays where no keypoints exist (anchor route); `heldIoU` 0.4 → 0.3 (S5). Held + back view + action: G4 area drop = review warning, not re-roll (S5 axe behind the body). | `items.ts` |
| **Cleanup** (`postProcess` after extraction, posed cells): head items (`slot.band`) `trimToKeyframe`; held items `attachHeld` + `repairDropped`; worn items unchanged. Details §3. | `items.ts`, called from `run.ts` `evaluateItem` + `poseItemClip` |
| **Authored idle**: `ACTIONS.idle` = rest pose with head/shoulders/arms sinking 0, 0.5, 1, 0.5 px (hips and legs fixed); excluded from the Add-a-move list. Create flow uses it instead of the managed breathing-idle motion source (saves 3 managed calls + 12 estimates per character; `estimate()` updated). `MoveSpec.replace` re-renders an existing clip (+ re-poses the chosen items), used to fix the Ranger. | `lib/rig/poses.ts`, `studio/create.ts` |
| **Studio**: New item sheet shows "96 px canvas so long weapons are never cut off" for held slots (`plan().cell`); price unchanged by design (pose calls bill by frames). Stage and the review card draw on `bakedFrame(m)` so a 96 sword is never clipped in the preview. | `studio/itemRoute.ts`, `NewItemSheet.svelte`, `Stage.svelte`, `GenCard.svelte` |
| **B8 harness generalized**: sync test reads z (layer z + slot zOverrides, like `resolveZ`) and the oversize items from the manifest; render test treats a slot a preset omits as empty (the Studio's `default` preset is `{body}` only — the old script left the sword equipped and reported 16,659 false diff px). Still PASS on `s5_sword`. | `docs/testing/b8_engine_tests/test_*_oversize.gd` |
| Docs: architecture §4.1 (held route + cleanup), §4.5 (grip, G9); manifest-spec §2 `CellQa.offset/repaired`, §2.1 pipeline note. Self-tests: pad/keypoints/f0Last/unrotate, non-held request unchanged, oversize layer cell+pivot, trim (streak removed, split item + consensus part kept), axis/angle, idle pose. | |

## 2. Live run (Ranger, `rig-01ab6ec414d4`, own dev server :5175)

The rig was copied from :5173's IndexedDB (project record, 1,940 blobs, B7's 181 done ledger records) into :5175 so that T1's
tabs never shared my queue. Key via the dev-only "Use dev key" button (never printed).

| Step | Gens | Result |
|---|---|---|
| Helmet slash re-cleanup (`poseItemClip` on B7's stored outputs) | **0** (all ledger cache hits; ledger 181 → 181) | east f2 109 → 98 px (detached fragment gone), north f4 155 → 120 (blade streak gone), east f1 streak gone; status stays "Needs a look" (H4 still flags south f3 where the forearm covers the visor, own 0.48) |
| Replace idle with the authored idle (`addMove({id: 'idle', action: 'idle', replace: true, items: [helmet]})`) | 3×3 raw + 12×0.1 estimates + helmet 3×3 = **19.2** | freeze gate S/E/N: adherence 0.28 / 0.34 / 0.26 px, **feet drift 0 / 0 / 0** (old E: 1), palette fit 1.00, 0 border px; `baseHash` updated, helmet moved to it and re-posed |
| Sword via the Studio New item sheet ("steel sword", Hands → Main hand) | dress 10 + 9 poses × 3 + 2 re-rolls × 3 = **43** | dress keyframes passed G2/G3; walk/east re-rolled twice on the old G9 (IoU 0.24 / 0.26 / 0.20, §4); after the G9 fix the stored outputs pass every gate → "Clean", kept |
| Export (Studio Export sheet → Godot → Download zip, intercepted in-page and copied to the Godot test project) | 0 | `ranger-godot.pixeldoll.zip`, 176 KB, `bakedCell 96×96`, `bakedPivot (48, 75)` |
| **Total** | **62.2** | balance 1,023.2 → 1,004.0 after the idle (exactly 19.2), + 43 for the sword |

### Stored data (read back from IndexedDB)

- `steel_sword`: route `skeleton-pose`, key green, layers `fg z150` + `bg z1`, both **`cell {96, 96}`, `pivot {48, 75}`** (rig
  pivot (32, 59) + 16); 106 non-empty cells, **all 96×96**; `dressed` S/E/N stored at 96; 10 provenance entries.
- QA: status `pass`, key kept ≥ 0.975, key outside ≤ 0.029, shifted frames 0, **clipPx 0** (border), palette distance ≤ 4.4,
  handedness ok, **grip R 44 / L 1 / amb 13 / none 2** (idle E and walk E are side views: amb), repaired 0, re-rolls 2.
- Pose requests: every clip whose first frame is within 1 px of the rest pose (idle S/E/N, walk S/N, slash S/E/N) was sent
  with frame 0 last; walk E (1.73 px) was not. **No slash f0 lost the sword** (S5 saw 3/3 losses without the rotation), so the
  repair never fired live; offline it repairs exactly S5's two losses (§3).
- Overhead slash N puts 20 px of blade outside the 64 window (2 frames): on the old 64 route those px were cut off.

### Screenshots

- `img/b9_2_new_item_held.jpg` — New item sheet, Hands: "10 PixelLab calls · 63 frames · … · 96 px canvas", **Make · 37 gens**.
- `img/b9_3_sword_review.jpg` — review card: Clean, "Every frame passed the checks", 4 directions on the 96 frame.
- `img/b9_4_studio_slash_alldirs.jpg`, `img/b9_5_studio_idle_alldirs.jpg` — Studio stage, helmet + sword, slash f2 / idle f2,
  all four directions (west mirrored), blade whole.
- `img/b9_9_sword_all_clips.png` — every frame: idle / walk / slash × S/E/N/W, composed on the baked 96 frame.
- `img/b9_10_sword_dress_96.png` — the three dressed 96 keyframes.
- `img/b9_8_idle_old_vs_new.png` — rows per direction S/E/N: managed idle (old), authored idle (new). The east row shows the
  hunch going away.
- `img/b9_6_godot_render_slash.png`, `img/b9_7_godot_render_idle.png` — Godot's own render of the export.

## 3. Streak / fragment cleanup (offline validation, 0 gens)

Rules (all after chroma extraction, posed cells only):

1. **Head items** (`head`, `face_acc`): align the dressed keyframe mask per frame (requested head move, refined ±2 px by
   overlap), dilate 2 px = support. Item px outside the support are removed **unless** at least half of the same direction's
   other frames have item px there (keyframe coordinates, 3×3 tolerant) — temporal consensus keeps a real part the keyframe
   lacks. Frames whose aligned overlap is < 50 % of the keyframe (occluded, lying) are left alone. The existing head band
   (neck + 3) still applies.
2. **Held items**: keep the largest component plus every component within 3 px of it or of the gripping wrist (a blade split
   by the fist); drop the rest. Then the S5 repair.
3. **Worn items**: unchanged (the S2/S3 component filter). The consensus trim would remove 266 px of S4's cape swing (walk E
   134, slash S 117) — legit cloth motion — so it is not used there; S4 hair would lose 13 px in slash E: also not enabled.

| Data | Removed (px) | Reading |
|---|---|---|
| **B7 Ranger helmet**, all stored poses (idle, walk, slash × S/E/N) | idle 0, walk 0, slash S 2, slash E 14 (f1 3, f2 11), slash N 35 (f3 2, f4 33) | exactly B7's three leftovers: the east f1 streak, the detached east f2 fragment (the two split helmet halves are kept), the north f4 blade streak; **0 px on idle/walk** ([`b9_1`](img/b9_1_helmet_trim_ranger.png), red = removed) |
| S4 helmet (64, walk + slash) | 20 | strap/smear tails (walk N f5/f7 1–2 px, slash E f2 detached blob); helmet shape untouched ([`b9_11`](img/b9_11_trim_s4_helmet.png)) |
| S4 hair / chest / cape / boots | 0 | worn and hair classes are not trimmed |
| S5 final sword `fsw` (96) | 39 (slash N only) | a detached speck right of f0 and a fragment at f5; blade intact |
| S5 final axe `fax` (96) | 87 (slash E 24, slash N 63) | detached smear blob under the axe (E f3) and a detached shape (N f1) ([`b9_12`](img/b9_12_held_attach_s5_axe.png)) |
| S5 `d96` seed 7 (f0 losses) | 0 removed, **repaired slash S f0 + N f0** | the two frames S5 lost; same fix as S5's `repair` |
| Live sword | 94 + stray filter | detached blobs on slash E f3 / N f3 |

## 4. G9 on a held blade: a systematic false fail, fixed

Walk/east failed the IoU G9 on all three seeds (0.24, 0.26, 0.20; [`b9_13`](img/b9_13_walk_east_g9_rerolls.png)): when the arm
swings back the blade turns from 29° to 74°, so a 1–2 px thin blade's aligned IoU collapses, although the sword keeps its design
and follows the hand. Measured offline, the blade-minus-forearm angle stays −39° … −14° across the frames on every seed (idle
−31…−35, walk N −31…−40). G9 for posed held items now checks that relative angle (≤ 30° change between adjacent frames), which
would still catch the M3 failure (a blade flipping against the hand). All three rolls pass the new G9 (max change 16° / 22° /
within 30°; the second roll still fails G3–G5 on its own). 6 gens of the 62 went to this false fail.

## 5. Engine check (Godot 4.7.1, B8 harness on the Studio export)

| Test | Result |
|---|---|
| `--headless --import` | 0 errors |
| `test_sync_oversize.gd -- b9_ranger` | 3 anims × 4 dirs × 90 = **1,080 ticks, 2,160 oversize layer-ticks, 0 failures**; offsets body/helmet (−32, −59), sword fg/bg (−48, −75); z from the manifest (sword bg 1, body 10, helmet 130, sword fg 150); unequip/re-equip of the sword restores frame + offset ([log](b8_engine_tests/b9_ranger_sync.log)) |
| `test_render_oversize.gd -- b9_ranger` (Vulkan, RTX 3070 Ti, 384×96) | presets `current` (helmet + sword) and `default` × idle/walk/slash × S/E/N/W: **0 of 1,474,560 px differ** from the export's own baked sheets ([log](b8_engine_tests/b9_ranger_render.log)) |
| Regression `s5_sword` with the generalized scripts | sync 720 ticks 0 failures; render 0 / 1,179,648 px |

## 6. Checks

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings (212 files) |
| `npm run build` | ok |
| `npm run selftest` | all pass (new held-route, cleanup, G9 axis and idle tests) |
| `node app/scripts/e2e-studio.mjs` (BASE = :5175) | all passed |

## 7. Gaps / not done

- One sword on one rig. `off_hand` (shields, left hand) uses the same code with "left hand" wording but is **untested**; a
  shield "pointing down" is probably wrong wording. 128 px (spears) not added.
- The helmet's H4 still flags south slash f3 (forearm over the visor, own 0.48): a true occlusion, so the helmet stays
  "Needs a look". An occlusion-aware H4 that skips keyframe px covered by the posed arm is the next step.
- The relative-angle G9 is from one live sword plus S5's sword/axe; the 30° threshold has no labelled flip case from the 96
  route yet (M3's flips were at 64). PCA angles of very short items (daggers) are noisy: below 6 px the gate is skipped.
- Walk E frames 5–7 draw the blade near-vertical and partly behind the leg (arm swung back). It reads as a swing, but it is the
  weakest clip visually.
- The authored idle is a 1 px vertical bob only (no chest/arm breathing beyond that). Old projects keep their managed idle
  unless re-rendered with `addMove({…, replace: true})` (no UI button for that yet).
- `MoveSpec.replace` re-poses only the items passed in `items`; other skeleton-pose items keep their old cells of that clip
  until re-posed (they are still on the new `baseHash`).
- The Studio's "default" preset omits slots instead of nulling them; engines and the fixed harness treat that as empty.
- Studio previews other than Stage and the review card (CreateSheet, Moves thumbnails, Welcome) still clip at the rig cell.
