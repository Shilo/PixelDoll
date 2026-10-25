# B8: oversize layers in compose + export (test report)

Date: 2026-10-21 · Agent: B8 · Spec: [`manifest-spec.md`](../manifest-spec.md) **v1.3.1** §2.1, §3 inv. 2 + 10, §6 ·
Source need: [S5](../spikes/S5_held_items.md) "Export implications" · Harness: [`b8_engine_tests/`](b8_engine_tests/)

**Result: a layer can now have its own cell and pivot (S5's 96×96 sword on the 64×64 base). Compose and export handle it end
to end. In Godot 4.7.1 and in Phaser 3.80, 3.90 and 4.2.1 the export renders exactly like PixelDoll's compositor
(0 differing px of 1,179,648 per engine), and every layer stays in sync. The exported Unity C# compiles with no errors.
No PixelLab generations were used.**

## Convention

- **Manifest.** Each `Layer` can have `cell {w,h}` and `pivot {x,y}`. They default to `rig.cell` and `rig.pivot`. The
  exported `manifest.json` always writes both on every layer, so engine readers never need to fill in defaults.
  - S5 held layer: `cell {96, 96}`, `pivot = rig.pivot + (16, 16)`.
  - Layers line up **by pivot**: in rig-cell coordinates, a layer's cell sits at `rig.pivot − layer.pivot`.
- **Sheets.** Each layer's sheet uses its own cell size: `cells × layer.w` by `dirs × layer.h` (inv. 2).
  - Rows, columns, frame names, playlists and the clock do not change.
  - Generic strips use the layer's cell height.
- **Preview.** `composeCell(...)` defaults to the rig cell, so oversize pixels are clipped there. An optional `frame`
  argument gives any other canvas.
- **Baked composites.** Every baked sheet in an export uses one cell: the union of all exported layers around the shared
  pivot (64 + 96 sword → 96×96, pivot rig + 16). This is stored as `export.bakedCell` / `bakedPivot`.
  - Why: an RPG-Maker-style engine reads a single fixed cell, and the sword tip is never cut off.
  - Rejected: keeping the base cell for baked sheets, because it would clip the blade in 5 of 8 slash frames.
- **Mirroring.** A mirrored row flips the whole layer cell. So whenever a direction is mirrored, an oversize cell must be
  centered on the rig cell: `2·(rig.pivot.x − layer.pivot.x) + layer.w = rig.w` (new inv. 10, enforced by `validate`).
- **Unity scale.** Unity's PPU stays the base's (`export.pixelsPerUnit`, default 64) for every layer, so the world scale is
  the same for all layers.

## What changed

| File | Change |
|---|---|
| `lib/store/manifest.ts` | `Layer.cell?`, `Layer.pivot?`, `ExportInfo.bakedCell?/bakedPivot?` (surgical, +5 lines) |
| `lib/compose/compose.ts` | `Frame`, `rigFrame`, `layerFrame`, `unionFrame`, `bakedFrame`. `composeCell(..., frame?)` draws each layer at `frame.pivot − layer.pivot`. **`over()` now clips to the destination**: before, it had no bounds check and would have written out of bounds for a 96 cell. |
| `lib/compose/fixture.ts` | Crops each layer by its own cell. The fg/bg split pads the base into the layer's frame. |
| `lib/export/sheets.ts` | Sheets are built per layer cell. `bakedSheet(..., frame = bakedFrame)`. |
| `lib/export/generic.ts` | `validate` checks size against the layer's cell, requires integer cell and pivot, and applies inv. 10. The exported manifest writes cell and pivot explicitly, plus `bakedCell`/`bakedPivot`. Strip height comes from the layer. |
| `lib/export/godot.ts` | AtlasTexture region uses the layer's cell. The `.tscn` node `offset` is the equipped layer's −pivot. `paperdoll.gd` `equip` re-sets `offset = -layer.pivot`, so a 64 item and a 96 item can share a slot. |
| `lib/export/phaser.ts` | Each atlas frame rect and normalized pivot comes from its layer. Runtime JS is unchanged: `setFrame` applies each frame's custom pivot. |
| `lib/export/unity.ts` | `pixeldoll_unity.json` layers get `cellW/cellH/pivotX/pivotY`. `Slice()` cuts each layer by its own cell, with the pivot normalized from the bottom-left. PPU stays global. |
| `scripts/build-fixture-s5.ts`, `public/fixtures/s5/` (60 KB) | New fixture, described in the next section. |
| `scripts/export-fixture.ts` | New third argument `fixture` (`s1` \| `s5`). |
| `docs/manifest-spec.md` | v1.3.1: §2 types, new §2.1, inv. 2 and 10, §5, §6.1–6.4, §6.6 |
| `docs/architecture.md` | "Oversize cells" removed from the non-goals. Goal 1 points to §2.1. |

Self-tests cover pivot alignment and clipping, `unionFrame`/`bakedFrame`, oversize sheet size, validation (accept 96,
image ≠ layer cell, off-center plus mirrored), the explicit manifest fields, the Godot region and offset, the Phaser rect and
pivot, and the Unity JSON (96 cell, PPU 64).

## Fixture `s5_sword`

- **Base.** The exact frames S5 posed against: `spikes/api/out/s4_items/sk_<dir>.base0-15`, walk and slash, S/E/N. It is
  the 64 rig with pad y+16 (feet on row 63), so pivot = (32, 64). West mirrors east.
- **Sword.** S5's accepted `fsw` from `out/s5_held/export_fsw_{walk,slash}.png`: walk seed 7, slash S/N with frame 0 sent
  last, slash E seed 11.
  - 96 cells, pivot (48, 80).
  - It is split into fg/bg at load.
  - `main_hand` has bgZ 6, a north bg z1 override, and a neutral per-cell fg z45 on walk/south/4.
- **Presets.** `armed` and `bare`.
- **Export.** 55 files, 156 KB zip. `bakedCell` 96×96, `bakedPivot` (48, 80).

![baked armed walk](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b8_baked_armed_walk.png)

**S1 regression.** The S1 export from the new code is byte-identical to HEAD's for every PNG (layers, baked, strips) and
for the `.tres`, `.tscn` and atlas JSON files. Only the manifest (now with explicit cell/pivot), `paperdoll.gd` and the
Unity files differ. M5's Godot sync test (540 ticks, 0 failures) and render test (0 / 98,304 px) still pass on the new S1
export.

## Engine verification

Steps:

1. Run `node scripts/export-fixture.ts <dir> generic,godot,phaser,unity s5`.
2. Copy `s5_sword/` into the scratch engine projects in `checkouts/engine-tests/` (outside the repo, same as M5).

### Godot 4.7.1

- **Import:** `--headless --import` gives **0 errors**. It gives 4 warnings, all from Godot importing `CREDITS.csv` as a
  translation table (pre-existing, see gaps).
- **Sync:** `--headless --fixed-fps 60 -s test_sync_oversize.gd -- s5_sword` ([log](b8_engine_tests/godot_sync.log)).
  - 2 anims × 4 dirs × 90 ticks = **720 ticks, 1,440 oversize layer-ticks, 0 failures**.
  - Every tick, every visible layer has the body's animation and frame.
  - Its region is `Rect2(cell·w, row·h, w, h)` with **its own** w/h (96 for the sword, 64 for the body).
  - Its offset is −layer.pivot: (−48, −80) for the sword, (−32, −64) for the body.
  - Both z overrides apply.
  - Unequipping hides fg and bg; re-equipping restores the frame and the oversize offset.
- **Render:** windowed `--resolution 384x96 -s test_render_oversize.gd -- s5_sword` on Vulkan Forward+ with an RTX 3070 Ti
  ([log](b8_engine_tests/godot_render.log)).
  - Covers both presets × walk and slash × all 8 frames × S/E/N/W.
  - Each doll sits at the baked pivot of its 96 cell.
  - **0 of 1,179,648 px differ** from `baked/<preset>/<anim>.png`.

  ![Godot slash](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b8_godot_render_slash.png)
- **Mutation check:** I edited a copy of the export to use the old behavior (rig pivot on every node, no offset in
  `equip`).
  - Sync: 1,441 failures.
  - Render: 17,254 differing px (armed only; bare stays at 0).
  - So both tests detect a wrong pivot.

### Phaser 3.80.0 / 3.90.0 / 4.2.1

Setup: `test_oversize.html?v=<ver>&ex=s5_sword`, served by M5's `serve.mjs`, driven by `run_phaser.mjs` (Playwright
headless Chromium, WebGL).

| Phaser | pixel diff vs compose (4 preset/anim sheets) | layer checks | oversize checks | frame mismatches | origin ≠ layer pivot |
|---|---|---|---|---|---|
| 3.80.0 | 0 / 1,179,648 | 2880 | 1920 | 0 | 0 |
| 3.90.0 | 0 / 1,179,648 | 2880 | 1920 | 0 | 0 |
| 4.2.1 | 0 / 1,179,648 | 2880 | 1920 | 0 | 0 |

- All dirs visited cells 0–7 in walk and slash.
- `displayOriginX/Y` equals each layer's pivot every step: (48, 80) on the sword and (32, 64) on the body. So
  `setTexture` → `setFrame` really applies the per-frame custom pivot in Phaser 3 and in Phaser 4.
- Mutation check: sword atlas pivots set to the rig's (32/96, 64/96) gave 17,254 differing px and 1,920 origin mismatches.

![Phaser 4.2.1](https://github.com/Shilo/PixelDoll/raw/1f950291f90d43f5c6f27572445664f757f5716e/docs/testing/img/b8_phaser_4.2.1_oversize.png)

### Unity 6000.4.0f1

Deferred, as for M5 (batchmode is license-blocked). M5's `compile.sh` compiles the new `Paperdoll.cs` and
`PixelDollImporter.cs` (per-layer `Slice`), with and without `PIXELDOLL_2D_ANIMATION`: **COMPILE OK, 0 errors**. The
importer has still not run.

## Checks

- `npm run check`: 0 errors, 0 warnings (212 files).
- `npm run build`: OK.
- `npm run selftest`: all passed.

## Gaps / handoffs

- **For B7 (Studio):** `studio/model.ts itemCell()` draws every layer at (0, 0). For a 96 layer, use
  `over(out, im, rig.pivot.x − f.x, rig.pivot.y − f.y)` with `f = layerFrame(rig, layer)` (from `lib/compose/compose.ts`).
  Today it now draws clipped and misaligned; before `over()` clipped, it would have written out of bounds.
  - The Studio, M3, M4 and M5 previews call `composeCell` with the default rig frame, so they clip the sword.
  - Pass `bakedFrame(m)` (or a union frame) where the full blade should show.
- **Item pipeline:** `lib/items` still produces layers only at the rig cell. The S5 96 route (pad, dress at 96, pose at
  96, extract against the padded base) still needs wiring. It must set `layer.cell`/`pivot` on accepted held items.
- **Godot CREDITS.csv:** Godot imports `CREDITS.csv` as a translation CSV. This is pre-existing (M5 also left
  `CREDITS.*.translation` files) and caused the 4 import warnings here. Fix: ship `CREDITS.csv.import` with
  `importer="keep"`, or rename the file. Not done.
- The Aseprite export (second wave) will need canvas = `bakedCell`, with 64 layers as cels at +16.
- Mirrored west still swaps the hand (O13).
