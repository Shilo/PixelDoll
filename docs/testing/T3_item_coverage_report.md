# T3 report: item coverage on the Ranger (2026-10-21)

**Scope.** I made four new items through the Studio's New item sheet on the "Ranger" rig (:5175, skeleton-v3 rig with
idle, walk, slash and hurt; S/E/N generated, W mirrored), using the default skeleton-pose route:

- long hair (hair, fg/bg split)
- red cape (back, fg/bg split)
- leather chest armour (torso_outer)
- cloth trousers (legs)

I inspected every frame on contact sheets. I also checked every pairing with the existing Iron Knight Helmet and 96 px
Steel Sword. I fixed what I found, and exported the fully dressed Ranger to Godot.

**Leather boots were not made:** the budget ran out (§5).

**Result.**

- All four items are kept on the Ranger, with 78 cells each (4 moves × S/E/N; W is mirrored).
- The full outfit (helmet, sword, hair, cape, chest, trousers) exported from the Studio renders **pixel-identical in Godot
  4.7.1**: 0 of 1,916,928 px differ, and sync passed 1,440 ticks with 0 failures.
- 8 code fixes landed (§3). Each one was re-verified offline on the stored frames at 0 gens.

**Spend: 215 gens** by my own job ledger (60 jobs), against a 220 cap. The balance went from 923 to 705, a drop of 218; the
other 3 gens were not my jobs.

## 1. Per item × move × direction

Legend:

- **✓** clean
- **~** looks right, but a QA warning or a cosmetic note applies
- **✗** visible defect

W is the mirror of E.

| Item | Move | S | E | N | Notes |
|---|---|---|---|---|---|
| **Long hair** (green key, 46 gens, 0 re-rolls) | idle | ✓ | ✓ | ✓ | Same design in every view: framing strands S, hangs down the back E, full sheet N ([dress](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_hair_dress.png)). |
| | walk | ✓ | ✓ | ✓ | Sits on the head in every frame; no offset. |
| | slash | ~ | ~ | ✓ | S/E f1–5: the raised forearm covers part of the hair, and the layer is pre-occluded correctly. H4 warns (own 0.36–0.74). In S the right strand is drawn very dark while the arm is up. |
| | hurt | ~ | ~ | ✓ | The hair swings outward with the flinch (plausible). H4 warns. |
| **Red cape** (green, 68 gens) | idle | ✓ | ✓ | ~ | N: the dressed design has gray-brown smudges at the hem (in PixelLab's own output, not an extraction artifact). Roll 1 of the dress was clean but was rejected by a false G2 (§3.1). |
| | walk | ~ | ✓ | ~ | E: natural swing ([sheet](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_cape_comp.png)). S: only the cape edges show, so H4 warns on 4 frames. |
| | slash | ~ | ✓ | **✗** | E: big flare behind the lunge (plausible). Slash E f2–3 put 1–3 px on the cell border (G7 warn). **N f1–5: the cape wraps the raised arm and uncovers the back in all 3 rolls** (G4 43–49 %); the S4 weakness is confirmed. The best roll is kept (§3.6) ([rolls](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_cape_slash_north_rolls.png)). |
| | hurt | ~ | ✓ | ~ | N f1–2: the cape balloons into a round shape over the flung-out arms; odd, but in sync. |
| **Leather chest armour** (green, 46 gens, 0 re-rolls) | idle | ✓ | ~ | ✓ | E is thin, showing mostly a shoulder plate and a side strap; the dressed E keyframe is thin too (same as S4's vest) ([dress](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_chest_dress.png)). |
| | walk | ✓ | ~ | ✓ | Same thin E. |
| | slash | ~ | ✓ (fixed) | ✓ | E f2/f4/f5 had a gray swoosh and brown streaks. These were **motion smears extracted as armour, and QA passed them (false pass)**; removed by §3.3 ([before](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_chest_slash_east.png) / [after](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_chest_slash_east_fixed.png)). |
| | hurt | ~ | ✓ | ~ | H4 warnings only; the frames look right ([sheet](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_chest_comp.png)). |
| **Cloth trousers** (green, 55 gens) | idle | ✓ | ✓ | ✓ | **Full-length trousers** on the gray-shorts base; no shorts showing ([dress](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_trousers_dress.png)). |
| | walk | ~ | ✓ | ~ | E failed G5 on 3 seeds (CV 0.20–0.22): a **false fail**, fixed in §3.4. S/N: H4 warnings while the legs move. |
| | slash | ✓ | ✓ | ✓ | E re-rolled once on G3 0.052 (borderline); both rolls look the same ([sheet](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_trousers_comp_roll1.png)). |
| | hurt | ✓ | ✓ | ✓ | |

**QA status accuracy (live).**

- **False fails, each costing a re-roll:**
  - cape dress G2 (10 gens)
  - trousers walk E G5 ×2 (6 gens)
  - hair H4, 9 frames: would have cost 3 calls × 2 re-rolls; fixed before they ran
- **False pass:** chest slash E smears.
- **True fails:** cape slash N.

All four Studio cards ended at **"Needs a look"**. The cause is H4 warnings on cloth and hair that deforms. That is honest
for the cape and borderline noise for the others (§6, P2).

## 2. Combinations

All items, plus the helmet and the sword, in every move and direction (baked 96 frame; W mirrored):

- with the helmet: [idle](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_final_idle.png) · [walk](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_final_walk.png) · [slash](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_final_slash.png) · [hurt](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_final_hurt.png)
- without the helmet: [idle](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_final_nohelmet_idle.png) · [walk](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_final_nohelmet_walk.png) · [slash](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_final_nohelmet_slash.png) · [hurt](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_final_nohelmet_hurt.png)

I measured occlusion as "item px that one item hides from another", summed over every frame (Ranger, all 4 moves):

| Pair | Before | After | Verdict |
|---|---|---|---|
| Sword under cape | S idle 80, **walk 220**, slash 79 px hidden; N 63–185 | S/E/W 0 (sword over cape); N unchanged (cape over the blade from behind) | **Fixed (§3.5)**. The M4 fix was in the demo fixture only, not in the Studio's slot ladder. |
| Hair under cape | **walk E 359**, slash E 370, hurt E 374, N 94–191, S 22–224 px hidden | 0: the hair's bg is now drawn over the cape's bg | **Fixed (§3.5)**. Long hair lies over the cape in every view. |
| Trousers under chest | S 88–168, N 36–74, E 7–23 px | — | Correct: the armor hem sits over the waistband. |
| Hair under helmet | Helmet `hides: [hair]`, so **long hair disappears completely** ([walk](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_combo1_walk.png)) | Unchanged default | With the hide unticked, long hair hangs naturally below the helmet ([no hide](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_combo1_nohide_walk.png), [zoom](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_helmet_hair_nohide_zoom.png)). Short spiky hair pokes through without the hide (M4), so I kept the default (§6, P1). |
| Chest pauldrons vs cape (N) | The pauldrons draw over the cape's shoulders | — | Plausible (the cape sits under the shoulder plates). |

## 3. Issues → fix → evidence

All fixes are lean and match the existing style. Self-tests were added for §3.1–3.3. Every fix was re-checked offline on the
stored frames at 0 gens.

1. **G2 false fail when the item covers the body (cape N).**
   - **Cause:** only 126 body px are left visible. 6 olive outline px (27,40,4; key score 32 < 35) gave 0.952 key kept, and
     a clean dress was re-rolled for 10 gens.
   - **Fix:** G2 also needs **> 8 lost px** (`GATES.keyLostPx`, `g2Fails`, `keyKept().lost`), applied in itemQa and on the
     dress keyframes.
   - **Evidence:** [roll 1](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_cape_dress_roll1.png) vs [roll 2](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_cape_dress.png).
2. **H4 re-rolled long hair on legit occlusion and swing.**
   - **Cause:** 9 slash/hurt frames scored own 0.36–0.74, and they look right ([zoom](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_hair_h4_flagged.png)).
   - **Fix:** H4 **fails only band items** (helmet, face). Hair now gets the cloth treatment: a review warning in every view.
3. **Motion smears passed as worn items (false pass).**
   - **Fix:** `dropOffBody`. Body-hugging worn slots (not back or hair) drop detached components that have fewer than half
     their px on the body silhouette.
   - **Live data:** the smears were 13–30 px with 0–2 px on the body. Real parts split off by a forearm lie 90–100 % on the
     body (12/12, 15/15, 25/26, 43/55 px).
4. **G5 false fail on trousers walk E, 3 seeds (CV 0.20–0.22 vs a body-band CV of 0.11).**
   - **Cause:** the far trouser leg hides behind the near one.
   - **Fix:** the CV limit is now `max(0.15, 2 × body-band CV)`. G4 still catches a lost item.
5. **Z ladder.**
   - **Hand slots:** the Studio's ladder had no held-bg overrides (M4 found this; it was fixed only in the demo fixture). The
     ladder now ships `bg z5` for S/E/W on `main_hand` and `off_hand`.
   - **Hair:** gets `bg z5` in every view (over the cape's bg 4).
   - **Old projects:** `saveItem` copies the ladder defaults into stored slots that have no overrides. The Ranger was
     migrated with the same rule.
   - **Reset:** Reset layer order restores the ladder default, and the Reset button shows only when the order differs from
     it.
   - **Godot:** the export carries the overrides, and the harness passes.
6. **Re-roll strategy: keep the best roll, not the last.**
   - **Fix:** a call that is out of re-rolls keeps the roll with the fewest failed checks (`keepBestRoll`). This is a free
     re-evaluation over rolls with identical inputs (same keyframe and key); the dress call is skipped.
   - **Live:** cape slash N went back to roll 1 (1 failed check vs 2 for rolls 2 and 3), which is also the most plausible
     visually.
7. **Studio crash (P0, found live).** Two or more warnings with the same plain-language reason gave a duplicate key in
   GenCard's keyed each-block. Svelte threw `each_key_duplicate` and the **whole Studio went blank**. Fixed by deduping the
   reasons; this was committed with B13's e745bc4.
8. Prompt wording: no change needed.
   - "cloth trousers" came out full length on the shorts base.
   - "empty hands, no weapon" is already in every pose request, but slash still invents smears; §3.3 removes them.

Docs: architecture §4.1 (cleanup), §4.5 (G2, G5, keep best roll, H4) and §5 (hair and held bg z).

## 4. Engine and checks

| Check | Result |
|---|---|
| Studio Export → Godot | 395 KB zip; the blob was captured in-page, no download. Baked cell 96×96, pivot (48, 75). Presets `current` (all 7 items) and `default`. |
| Godot 4.7.1 `--import` | 0 errors |
| `test_sync_oversize.gd -- t3_ranger` | **1,440 ticks, 2,880 oversize layer-ticks, 0 failures**. z from the manifest: hair bg z5, sword bg z5 (S), cape bg z4 ([log](b8_engine_tests/t3_ranger_sync.log)) |
| `test_render_oversize.gd -- t3_ranger` (Vulkan, RTX 3070 Ti) | **0 of 1,916,928 px differ**, 2 presets × 4 moves × 4 directions ([log](b8_engine_tests/t3_ranger_render.log)); Godot's own render: [walk](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_godot_render_walk.png), [slash](https://github.com/Shilo/PixelDoll/blob/v0.1.0/docs/testing/img/t3_godot_render_slash.png) |
| `npm run check` / `build` / `selftest` | 0 errors / ok / all passed |
| `e2e-studio.mjs` (BASE :5173) | all passed |

The Studio's all-directions grid screenshot was **not taken**: the Browser pane was hidden for the whole run. The outfit
sheets above come from the same compositor (`drawList`/`composeCell`) that the grid and the baked export use, and the baked
export matches Godot exactly.

## 5. Costs

| Item | Calls | Gens | Extra over the 46 base |
|---|---|---|---|
| Long hair | 13 | 46 | 0 |
| Leather chest armour | 13 | 46 | 0 |
| Red cape | 18 | 68 | dress re-roll 10 (false G2); slash N 3 rolls + 1 duplicate 12 |
| Cloth trousers | 16 | 55 | walk E 2 re-rolls (false G5) + 1 duplicate; slash E 1 re-roll |
| **Total** | 60 | **215** | 29 on re-rolls, 22 of them on false fails or duplicates |

- **Duplicate rolls (6 gens).** Vite hot reloads during the live run (my own edits and B13's) left two runner instances of
  the state module in the page. Each re-rolled the same call with its own random seed. B13 fixed this (one runner per draft,
  leader-only).
- **Budget guard.** It blocked one more trousers re-roll at the cap. I attached that call's roll 2, which passes the fixed
  G5.
- **Boots: not made.** All 215 gens were spent on the four items above.

## 6. Remaining issues (prioritized)

- **P1 — Cape slash N.** The cape wraps the raised arm in all 3 rolls (and in S4). Options:
  - the `inpaint-grid` fallback for back items on action clips
  - an authored slash-N variant that keeps the arm in front of the body
- **P1 — Helmet and long hair.** The default `hides: [hair]` removes long hair completely. A fix needs per-pair data, for
  example "hide hair above the helmet rim" (a clip mask, which would need exporter support), or a short/long hair flag set
  at creation.
- **P2 — H4 warning noise.** All 4 new items show "Needs a look":
  - Hair: aligning H4 by the requested head move (as `trimToKeyframe` does) lifts 4 of 12 hair flags above 0.75; tested
    offline, not shipped.
  - Cloth: consider warning only on "looks like the opposite view".
- **P2 — Dress design defects pass every gate.** Examples: the chest armour is thin in E, and the cape's N hem has gray
  smudges. A dress-level check, such as item area per view relative to the body or color outliers, could re-roll the dress
  before 36 gens of poses are spent.
- **P2 — Live-run robustness (fixed by B13, re-test):**
  - hidden or background tabs are throttled: my scripts timed out, and the 15 s storage-open screen appeared
  - hot reloads restarted runners (duplicate paid rolls)
- **P3 — Untested:**
  - boots (feet slot)
  - shields (off_hand)
  - G3 `keyOutsidePosed` 0.05 (the trousers slash E roll at 0.052 looked fine; one sample, threshold left as is)
  - the Studio grid screenshot
