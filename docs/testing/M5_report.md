# M5 export: test report (B3)

Date: 2026-10-20 · Route: `#/m5` · Spec: [`manifest-spec.md`](../manifest-spec.md) §3, §5, §6 · Harness: [`m5_engine_tests/`](m5_engine_tests/)

**Result: the same export zip imports and plays correctly in Godot 4.7.1 and in Phaser 3.80, 3.90 and 4.2.1. In every
case the layers stay in sync, and the rendered pixels match PixelDoll's own compositor exactly (0 differing px). Unity
6000.4.0f1 could not run in batchmode because licensing blocked it. Instead, the exported C# compiles with no errors or
warnings against the real Unity 6000.4.0f1 assemblies, with 2D Sprite and with 2D Animation 14.0.3.**

## What was built

| File | Role |
|---|---|
| `app/src/lib/compose/compose.ts` | Resolves z (`layer.z` from the slot ladder or an item override, then the most specific sparse `zOverride`: cell > anim > dir), applies hides (`item.hides ?? slot.hides`), builds the draw list (z, slot order, bg before fg, item id), gets a cell image (a mirrored direction without stored cells is a flip of its source direction), and composes pixels. Pure code over `Img`, so the preview, the baked export and node all share it. |
| `app/src/lib/compose/split.ts` | Splits an item into fg = layer ∩ base opaque and bg = the rest. |
| `app/src/lib/compose/fixture.ts` | Fixture loader. It slices the sheets into hashed cells, splits items in `bgZ` slots, and computes `baseHash` with B2's `baseHashOf`. |
| `app/src/lib/export/sheets.ts` | Writes one untrimmed sheet per layer per animation: rows are `rig.directions` (mirrored rows baked in), columns are cells, and transparent cells are kept. |
| `app/src/lib/export/generic.ts` | Validates the invariants (`validateRig` plus body, ramps, cell sizes; the export refuses if any fail), writes the exported `manifest.json` (cells → `sheets`, stale items dropped with a warning, `export` info), `CREDITS.csv` (one row per PixelLab call: job id, seed, prompt), `generic/*_strip<N>.png` and `baked/<preset>/<anim>.png`. |
| `app/src/lib/export/godot.ts` | Writes a `SpriteFrames` `.tres` per (item, layer), `Paperdoll.tscn` and `paperdoll.gd`. |
| `app/src/lib/export/phaser.ts` | Writes a JSON-Hash atlas per sheet (normalized `pivot`, `pixeldoll` customData) and `PaperdollContainer.js` (`loadPaperdoll`, `Paperdoll`). |
| `app/src/lib/export/unity.ts` | Writes `pixeldoll_unity.json`, the manifest flattened for JsonUtility, plus `Editor/PixelDollImporter.cs`, `Runtime/Paperdoll.cs` and 2 asmdefs. |
| `app/src/lib/export/export.ts` | Turns a project into zip entries, or a zip via `store/zip.ts`. |
| `app/src/lib/image/pngraw.ts` | Pure PNG encode/decode using `CompressionStream`, so export works in node. B2 now uses it for bulk encodes too. |
| `app/src/ui/M5.svelte` | Loads the fixture, offers preset and per-slot equip, previews all directions with the same compose function and playlist timing, lets you pick targets plus baked composites, and downloads the zip. |
| `app/scripts/build-fixture.ts`, `export-fixture.ts` | Rebuild the fixture from `spikes/api/out`, and run the browser export code in node. |
| `app/public/fixtures/s1/` (34 KB) | Real S1 outputs. The base is walk (8 cells) and idle (4 cells) for south and east, plus the leather vest (walk, south), the iron helmet (walk, south and east) and the steel sword (walk, south; split into fg/bg at load). West mirrors east. Items have no idle cells, which exercises the transparent-cell path. The `main_hand` slot has a visually neutral per-cell override (`fg` z 45 on walk/south/4) so the engines must honor per-cell z. |

Zip layout follows spec §5. It contains 71 files and is 149 KiB:
`manifest.json, CREDITS.csv, layers/<slot>/<item>/<layer>/<anim>.png, baked/<preset>/<anim>.png, generic/…, godot/…, phaser/…, unity/…`.

## Verification

Self-tests: `npm run selftest` now covers 8 more modules (`pngraw`, `compose`, `compose/split`, `export/sheets|generic|godot|phaser|unity`), and all pass. `npm run check` reports 0 errors and 0 warnings, and `npm run build` succeeds.

**App (`#/m5`, Claude Browser):** the fixture loads, and the three direction previews animate. West is the mirror of east, and the sword renders behind and in front of the body. "download zip" produces 71 files (149.0 KiB, `s1_knight.pixeldoll.zip`), the same file list as the node export. For the check, the anchor click was stubbed so no file was written. ![M5 UI](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m5_ui.jpg)
The same compositor produced the baked sheet: ![baked](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m5_baked_knight_walk.png)

### Godot 4.7.1 (fully verified)

Steps: `node scripts/export-fixture.ts <dir>`, then copy `s1_knight/` into the scratch project
`checkouts/engine-tests/godot/pixeldoll/` (outside the repo).

1. `--headless --path . --import`: imports with 0 errors and 0 warnings. **Relative `ext_resource` paths** (`../layers/...png` and `paperdoll.gd`) resolve, so the export folder can sit anywhere under `res://`.
2. `--headless --fixed-fps 60 -s test_sync.gd` ([log](m5_engine_tests/godot_sync.log)): plays every anim × dir (idle and walk × south, east, west) for 90 ticks each, 540 ticks in total. Every tick, every visible layer has the body's animation and frame, and its AtlasTexture region equals `Rect2(cell*64, dirRow*64, 64, 64)`. The pivot offset is `(-32,-63)` with `centered=false`, and `main_hand_fg.z_index` is 45 only on walk/south/cell 4 and 150 elsewhere. The body visits all cells, and equip/unequip hides fg and bg. Result: **PASS, 0 failures**. A mutation run with the `frame_changed` sync disconnected fails (3444 failures), so the test does detect drift.
3. Windowed `--resolution 192x64 -s test_render.gd` ([log](m5_engine_tests/godot_render.log)): renders `Paperdoll.tscn` with Vulkan Forward+ on an RTX 3070 Ti for each of the 8 walk frames × south, east and west, and compares every pixel with `baked/knight/walk.png`. Result: **0 of 98,304 px differ**, so z order, the fg/bg split, the pivot and mirrored rows all match PixelDoll's compositor.
   ![Godot render](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m5_godot_render_walk.png)

### Phaser 3.80.0 / 3.90.0 / 4.2.1 (fully verified)

Setup: a static server (`serve.mjs`, launch config `phaser-test`) and `test.html?v=<version>` with Phaser from
cdn.jsdelivr.net, run in the Claude Browser. The page calls `loadPaperdoll(scene, 's1_knight/')` and places three `Paperdoll`s.
It then (1) freezes each walk frame and compares a `renderer.snapshot` pixel-exactly with the baked sheet, and (2) plays walk in
all three directions for 180 steps, checking that every visible layer's frame name equals the body's.

| Phaser | pixel diff vs compose | layer checks | mismatches | body cells seen |
|---|---|---|---|---|
| 3.80.0 | 0 | 2304 | 0 | 0–7 for every dir |
| 3.90.0 | 0 | 2292 | 0 | 0–7 for every dir |
| 4.2.1 | 0 | 2208 | 0 | 0–7 for every dir |

Frame `duration` replaces `msPerFrame` (checked in the 3.90 `Animation.js` source), so playlist ms values map 1:1.
![Phaser 3.90](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m5_phaser_3.90.png) ![Phaser 4.2.1](https://github.com/Shilo/PixelDoll/raw/v0.1.0/docs/testing/img/m5_phaser_4.2.1.png)

### Unity 6000.4.0f1 (compile-verified only)

- `Unity.exe -batchmode -nographics -quit -createProject …` exits with code **198**. The log says `Access token is unavailable`,
  `'com.unity.editor.headless' was not found` and `No valid Unity Editor license found`. The Hub is not signed in, so batchmode
  (and therefore `-executeMethod PixelDoll.Editor.PixelDollImporter.ImportAll`) cannot run on this machine.
- Fallback ([`compile.sh`](m5_engine_tests/compile.sh)): Unity's own Roslyn (`DotNetSdkRoslyn/csc.dll`, C# 9, netstandard 2.1 plus
  netfx shims) compiles the code against all 6000.4.0f1 `Managed/UnityEngine/*.dll` (engine and editor modules). It also uses
  `Unity.2D.Sprite.Editor.dll` and `Unity.2D.Animation.Runtime.dll` (14.0.3) taken from another 6000.4.0f1 project's
  `Library/ScriptAssemblies`. `Runtime/Paperdoll.cs`, `PixelDollImporter.cs` without `PIXELDOLL_2D_ANIMATION` and
  `PixelDollImporter.cs` with `PIXELDOLL_2D_ANIMATION` all compile with **0 errors and 0 warnings**.
- What has not been verified: the importer actually running (slicing via `ISpriteEditorDataProvider` and `ISpriteNameFileIdDataProvider`,
  Point/uncompressed/PPU settings, the bottom-left rect and pivot conversion, clips, controller, prefab, `SpriteLibraryAsset`), and
  the runtime `LateUpdate` sync. **Next step:** sign in to the Unity Hub once, then run
  `Unity.exe -batchmode -projectPath <proj> -executeMethod PixelDoll.Editor.PixelDollImporter.ImportAll -quit -logFile -`
  with the export under `Assets/`, after adding `com.unity.2d.sprite` and optionally `com.unity.2d.animation`.

## Bugs found / fixed during verification

- Godot test: the first version also asserted equal `frame_progress`. Layers are deliberately not playing, since the body is the
  clock, so only frame and animation have to match. This was an over-strict test, not an exporter bug, and the assertion was removed.
- Phaser test: the page hung because the Browser pane was hidden (no `requestAnimationFrame`, and `img.decode()` never
  resolved). Fixed in the test page with `fps.forceSetTimeOut`. Runtime code that should work in hidden tabs needs the same flag.
- The static test server crashed on 404s because headers were written twice. Fixed in the test server.
- No exporter bugs were found by the engines. Every first export imported cleanly.

## Deviations from the spec (proposed for manifest-spec v1.2)

- `CREDITS.csv` at the zip root (LPC-style credits) and `unity/pixeldoll_unity.json` (JsonUtility cannot read dictionaries)
  are new files in the layout. Unity also ships two asmdefs, and its `versionDefines` enables the SpriteLibrary path only when
  `com.unity.2d.animation` is installed.
- Unity: `PaperdollLayer.cs` is merged into one `Paperdoll.cs` component (SpriteRenderer name-match on `LateUpdate`, plus
  equip, hides and zOverrides). SpriteLibraryAssets (Category `<anim>_<dir>`, Label `<cell>`) are built instead of being skipped.
- Phaser `customData` is the small `pixeldoll` key from spec §6.4, not the whole manifest. The loader fetches `manifest.json` once.
- Compose is pure pixel code (`over()` on `Img`), not Canvas2D `drawImage`. The result is the same for binary alpha, and it
  also runs in node and in self-tests.

## Remaining gaps

- Unity importer behavior (see above). Aseprite export (spec §6.5, second wave) is not built.
- M5 only exports the fixture. Wiring in B2's frozen rig from IndexedDB (`projects/rig-*`) plus M3 items is the next step.
- Godot exported games need `*.json` in the export filter for `manifest.json` (noted in `godot/README.txt`).
- Hides are taken from every equipped item, even one that is itself hidden, and hide chains are not resolved (`ponytail:` note).
- The fixture has no north direction and only south-facing vest/sword cells, and the idle animation has no item cells. A full
  4-direction item set comes from M3.
