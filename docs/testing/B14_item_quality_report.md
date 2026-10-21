# B14 report: item quality fixes on the Ranger (2026-10-21)

Builder: B14 · Work list: [T3_item_coverage_report.md](T3_item_coverage_report.md) §6 · Rig: the dressed "Ranger" on :5175
(skeleton-v3 rig, idle/walk/slash/hurt, S/E/N generated, W mirrored) · Not committed.

**Spend: 56 gens** by my own job ledger (cap 90): cape grid 10 + leather boots 46 (0 re-rolls). The account balance fell
further in the same window because other builders were generating too.

## Summary

| # | Issue (T3 §6) | Fix | Result | Gens |
|---|---|---|---|---|
| 1 | P1: the cape wraps the raised arm in slash N (3/3 rolls) | A per clip-direction **Pro `inpaint-v3` packed masked grid fallback** (S4/S5) | Live on the Ranger's cape slash N: 1 call, **passes every gate**, saved | 10 |
| 2 | P1: the helmet's `hides: [hair]` erases long hair | A **tuck-under** rule (`slot.clips`). Compose applies it on the fly; exports bake `"<hair>~<helmet>"` items for the engines | Long hair keeps 13,012 px below the brim; 1,984 poking px are dropped. Short hair: 597 poking px dropped | 0 |
| 3 | P2: "Needs a look" on every item | H4 re-tuned for soft items and turned off for legs; G8 needs half the clip; repaired held frames are no longer warnings; new **D1** dress check | Chest, hair, trousers, sword and the new boots read **Clean**; the cape still flags its real defects | 0 |
| 4 | P3: boots untested | Leather boots made through the Studio New item sheet | Clean on the first roll, all 78 cells, no defects seen | 46 |
| 5 | Export | Studio → Godot, with the boots and a "No helmet" outfit | Godot 4.7.1: **0 of 2,875,392 px** differ; sync 1,440 ticks, 0 fails. Phaser 3.80/3.90/4.2.1: 0 px | 0 |

Checks: `npm run check` 0 errors / 0 warnings (220 files) · `npm run build` ok · `npm run selftest` all passed (new
asserts for tuck, packGrid/cutGrid, gridPrompt, soft H4, D1, jobImages) · `node app/scripts/e2e-studio.mjs` (:5173) all passed.

## 1. Cape slash north: grid fallback

**Fix.** The fallback lives in `lib/items` and has three entry points:

- `runItem` (New item): when a skeleton-pose call still fails after its 2 re-rolls (its best roll already kept), `gridFallback`
  redoes that clip-direction once as a grid. The grid stays only if it has fewer failed checks; otherwise the pose roll comes
  back. Both paid rolls stay in the ledger counts.
- `poseItemClip` (Add a move): after the pose and its re-roll both fail, the same grid runs.
- `regridClip(ctx, item, anim, dir)`: redoes one clip-direction of an item that is already accepted. It saves only when every
  gate passes.

Held items keep their S5 route. Every route uses `gridReq` (run.ts) built on `packGrid`/`cutGrid`/`bandMask`/`gridPrompt`
(items.ts), and the grid output goes through the same extraction and gates (`posed`, so re-registration, cleanup and H4
apply).

**Grid.** The grid is 4 cells wide.

- Cells 0–7 are the clip-direction's chroma mannequin frames.
- Cells 8–10 are the item's 3 dressed keyframes, kept as reference cells with a black mask.
- Each frame's mask is its slot band (for the back slot, from the neck down; full width). The raised hand above the neck is
  outside the mask.
- On the 64 px rig this is 256×192, and the call cost **10 gens**.
- For the back slot, the prompt says the cape "hangs from the shoulders down the back and never wraps around or follows the
  arms" ([input](img/b14_grid_in.png), [mask](img/b14_grid_mask.png)).

`routes.ts` gets `inpaintV3` back (B13 had removed it as unused). `jobImages` now reads inpaint-v3's single
`last_response.image`; without that, the queue would have marked the paid result as malformed.

**Live result** (`regridClip(cape, 'slash', 'north')`, seed 4242, 10 gens):

- Every gate passes: key kept 0.96–1.00, key outside 0.000, area 647–676 px per frame (the dressed N keyframe is 656), no G4,
  no H4.
- The clip was saved into the Ranger's cape.
- The cape now hangs down the back in all 8 frames, and the arm and sword move in front of it
  ([after](img/b14_cape_slash_north_grid.png); before: [T3 rolls](img/t3_cape_slash_north_rolls.png)).
- The grey hem smudges are still there, because they come from the reference keyframe (§3, D1).

**Not tested live:** the automatic fallback inside `runItem` and `poseItemClip`. Neither fired: the boots never failed. Both
share `gridReq` and the extraction with the tested path.

## 2. Helmet over hair: tuck-under

**Rule** (`compose.ts tuck`, data: `slot.clips`). While an item in slot S is worn, the layers of items in `slots[S].clips`
lose their px at or above the cover's lowest opaque row, per column. Columns beside the cover use the nearest covered column,
so hair cannot stick out sideways above the brim. Px below the brim stay.

- The ladder's head slot now has `clips: ['hair']` and no `hides`.
- Ticking "Hair" under "When worn, hide" still hides it completely (`item.hides`, for hoods and full masks). Hides wins.
- The item pane says so in plain words.
- `loadProject` migrates old records whose head slot still has the old `hides: [hair]` default. The S2 demo fixture
  (steel helmet, wizard hat) uses the rule too.

**Engines.** Masking per engine was not needed.

- `withTuckVariants` (run in `exportFiles`) bakes one item `"<item>~<cover>"` (`variantOf`, `under`) per pair.
- The Godot (`_shown`), Phaser (`shown`) and Unity (`Shown`) runtimes draw it whenever the cover is equipped. Aseprite sets
  layer visibility with `shownItems`.
- Compose draws the same variant, so baked sheets and engines agree. Mirrored rows stay flips, because tucking commutes with
  the flip.
- Spec: manifest-spec invariant 11, architecture §5.

**Evidence (0 gens).** Long hair under the Iron Knight Helmet, every move × view (with and without the helmet):
[walk](img/b14_tuck_zoom_walk.png) · [slash](img/b14_tuck_zoom_slash.png) · [hurt](img/b14_tuck_zoom_hurt.png) ·
[idle](img/b14_tuck_zoom_idle.png).

| Pair (all moves, all views) | Hair px kept | Dropped | Of those, outside the cover (would poke through) |
|---|---|---|---|
| Ranger long hair + Iron Knight Helmet | **13,012** (the old hide kept 0) | 12,037 | 1,984 |
| Demo short spiky hair + steel helmet | 75 | 4,495 | **597** (poke-through gone) |
| Demo short hair + wizard hat | 2,214 | 2,356 | 88 |

- Short hair: [walk](img/b14_tuck_demo_short_walk.png), [cross punch](img/b14_tuck_demo_short_cross-punch.png). No spike
  shows above or beside the steel helmet.
- The wizard hat has no north frames in the demo (B10), so the north row shows bare hair, as before.

**Found on the way (P1, fixed).** With hair visible under the helmet, Godot differed from PixelDoll by **4 px** (slash S f4).

- Cause: hair bg and sword bg are both z 5 in south. PixelDoll breaks that tie by slot order (the sword over the hair).
  Godot breaks ties by tree order, and the scene sorted its nodes by static z (the hair's bg 3 came after the sword's bg 1).
  This was latent before because the old hide removed the hair.
- Godot fix: `Paperdoll.tscn` now orders nodes by compose's tie-break (slot order, bg before fg).
- Phaser fix: a stable depth sort with that order (`pdOrder`). Phaser's previous `sort('depth')` kept the last frame's order
  on ties.
- Unity: `sortingOrder` ties are not handled yet (see Open).

## 3. "Needs a look" re-tune and the dress design check

**Evidence base.** I rebuilt each Ranger item's draft from its provenance (`requestHash` → ledger record) and re-ran
`evaluateItem` on the stored PixelLab outputs (0 gens). Then I labelled each flagged frame by eye: [hair](img/b14_h4_long_hair.png),
[trousers](img/b14_h4_cloth_trousers.png), [chest](img/b14_h4_leather_chest_armour.png), [cape](img/b14_h4_red_cape.png),
[helmet](img/b14_h4_iron_knight_helmet.png) ([zoom](img/b14_h4_helmet_zoom.png)).

| Item | Before (T3 gates) | Frames that are actually wrong | After (B14 gates) |
|---|---|---|---|
| Long hair | warn: 12 H4 (own 0.36–0.74) | 0 | **pass (Clean)** |
| Cloth trousers | warn: 13 H4 (own ≈ opposite on every frame: S and N trousers look alike) | 0 | **pass (Clean)** |
| Leather chest armour | warn: 6 H4 (0.52–0.74) | 0 | **pass (Clean)** |
| Steel sword | fail: G8 hurt E "0 R / 1 L frames"; warn: 2 repaired frames | 0 | **pass (Clean)** |
| Red cape | fail G4 slash N + 19 H4 + 2 G7 | slash N f1–4 (wrap), hurt N f1–3 (balloon) | after the grid: hurt N f1–3 H4 + 2 G7 → **Needs a look** (true) |
| Iron Knight Helmet (band) | fail: 5 H4 (hurt S/E, slash S f3) | hurt S f1–2 deformed visor, hurt E f2 streak; slash S f3 is arm occlusion | unchanged (band rule, see Open) |

**Rules (items.ts, architecture §4.5):**

- **Soft H4.** For soft items (hair, worn torso/back), H4 is a *warning* only. It applies only in a clip-direction where the
  item covers ≥ 50 % of the body in some frame (the cape from behind, not its edges from the front), and only when
  own < 0.5. Result: 6 of the 7 real cape-north frames still flag (the 7th clip also fails G4), and 43 false flags are gone.
- **H4 is off for `legs`** (like feet).
- **G8** decides a clip's hand only when half its frames are decided.
- **A held frame repaired from the keyframe** (S5) is recorded in `cells[].repaired`, not as a warning.
- **Plain reason:** "Some frames do not look like the design (e.g. a cape wrapped around an arm)".

**D1 dress check (0 gens).** It flags a colourful keyframe (median HSV saturation ≥ 0.4) with > 5 % near-grey px
(saturation < 0.25). That fails the dress call, so the design is re-rolled (10 gens) before 36 gens of poses copy it.

- Measured on the T3 keyframes: the cape's N view is **11.3 %** (the smudged hem). Every clean view of hair, chest, trousers
  and cape is ≤ 2.2 %. Grey items (helmet, sword) have a median below 0.4, so they are skipped.
- Prompts that ask for grey, metal, black, white or fur skip the check.
- Plain reason: "The design has grey smudges". The boots dress scored 0 %.
- **A "thin design" check was not added.** Area per view cannot separate T3's thin chest E (E/mean(S,N) 0.47) from correct
  trousers E (0.48), or by body coverage (0.76 vs 0.72).

The stored Ranger items were re-evaluated, and the four that now pass were set to `pass`, so the Studio shows "Clean".

## 4. Leather boots

I made them in the Studio: Feet → New item → "leather boots" → Make (46 gens shown, 46 spent, 0 re-rolls). The review card
showed **Clean**, "Every frame passed the checks", and I kept it.

- Dress: [keyframes](img/b14_boots_dress.png) (D1 0 %).
- All 4 moves × 4 views: [b14_boots_all.png](img/b14_boots_all.png). The design is the same everywhere, the boots follow the
  stride in walk E/W, there are no smears or flips, and they sit under the trouser hems (feet z20 < legs z30).

## 5. Final outfit and engine

Full outfit (helmet, long hair tucked, chest armour, trousers, boots, red cape, steel sword), baked 96 frame, rows S/E/N/W:

- with the helmet: [idle](img/b14_final_idle.png) · [walk](img/b14_final_walk.png) · [slash](img/b14_final_slash.png) · [hurt](img/b14_final_hurt.png)
- without the helmet: [idle](img/b14_final_nohelmet_idle.png) · [walk](img/b14_final_nohelmet_walk.png) · [slash](img/b14_final_nohelmet_slash.png) · [hurt](img/b14_final_nohelmet_hurt.png)

| Check | Result |
|---|---|
| Studio Export → Godot | 513 KB zip (captured in-page, not downloaded). 9 items, including `long_hair~iron_knight_helmet`. Presets `current`, `default`, `no-helmet` (saved as a Studio outfit) |
| Godot 4.7.1 `--import` | 0 errors. 1 warning: a stale `.uid` cache entry from re-exporting into the same folder |
| `test_sync_oversize.gd -- b14_ranger` | **1,440 ticks, 2,880 oversize layer-ticks, 0 failures** ([log](b8_engine_tests/b14_ranger_sync.log)) |
| `test_render_oversize.gd -- b14_ranger` (Vulkan, RTX 3070 Ti) | **0 of 2,875,392 px** differ over 3 presets × 4 moves × 4 views ([log](b8_engine_tests/b14_ranger_render.log)). Godot's render: [slash](img/b14_godot_render_slash.png), [no helmet walk](img/b14_godot_render_nohelmet_walk.png). Before the tie-break fix: 4 px (§2) |
| Phaser harness, `run_phaser.mjs b14_ranger` | 3.80.0 / 3.90.0 / 4.2.1: **0 px** on all 3 presets, 0 sync or origin mismatches |

I fixed one bug in the Phaser harness itself: `test_oversize.html` now unequips the slots a preset leaves out, as the Godot
harness already did (B9). Without that, the `default` preset kept the previous preset's items and showed 11–25 k px of
harness-only diff.

## 6. Open

- **Cape hurt N** f1–3 still balloon ("Needs a look"). `regridClip(cape, 'hurt', 'north')` would cost about 10 gens; the
  brief limited the live test to slash N.
- **Cape N hem smudges** come from the T3 dress. D1 would now re-roll such a dress; the stored cape keeps it.
- **Helmet (band H4).** Hurt S f1–2 and hurt E f2 are real (deformed visor, streak) and fail correctly. Slash S f3 is a false
  fail: the forearm covers the visor (own 0.48). Band items might need the arm-occlusion term that soft items now avoid.
- **Unity** breaks equal `sortingOrder` ties by its own rules, so ties may still differ from compose there. The Unity export is
  compile-only (D5), so this is untested.
- **`runItem` / `poseItemClip` grid fallback** is not exercised live (§1).
- The tuck rule's ceiling: an item that should cover only part of the head (a circlet, a hat with a hole) would still clip
  everything above its lowest row. Such items can opt out by removing the slot's `clips` (data), and nothing needs that yet.
