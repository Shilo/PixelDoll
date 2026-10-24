# B11: layered Aseprite export + Godot CREDITS fix (test report)

Date: 2026-10-21 · Agent: B11 · Spec: [`manifest-spec.md`](../manifest-spec.md) §5, §6.5 · Harness:
[`b11_aseprite_tests/`](b11_aseprite_tests/) · No PixelLab generations.

**Result: PixelDoll now writes one layered `.aseprite` per character, in the browser, straight from the ase file spec.
The real Aseprite 1.3.18 CLI (batch mode) reads it. Every layer frame matches PixelDoll's layer sheets and every flattened
frame matches PixelDoll's baked composite: 0 differing px on the S1, S2 (multi-move, 10 layers) and S5 (96 px sword)
fixtures. Godot import is now warning-free (CREDITS.csv → CREDITS.txt) and still renders pixel-identical.**

## Aseprite export

`app/src/lib/export/aseprite.ts` (new), target "Aseprite (.aseprite layers)" in the Export sheet, engine id `aseprite`.
Output: `aseprite/<name>.aseprite` + `aseprite/README.txt` (importer settings).

| Aspect | Convention |
|---|---|
| File | One per character, RGBA (depth 32), header flag 1 (layer opacity valid), no palette (optional above 8 bpp) |
| Layers | One per exported (item, layer), named `<slot>.<item>` (`.fg` / `.bg` suffix for split items). Stacked by static z with the inv. 7 tie-breaks (slot order, bg before fg, item id). Bottom = lowest, so bg halves sit under the base. |
| Visibility | All items are in the file. Visible = equipped in `presets[0]` and not hidden by `hides`. In the Studio, `presets[0]` is the current look. |
| Frames | One per playlist entry, for every move × each direction the move has (`rig.animations[].directions`), in rig order. Duration = the entry's `ms`. |
| Tags | `<anim>_<dir>`, forward. Repeat 0 (loop) or 1 (`loop: false`, which Unity's importer reads as non-looping). |
| Canvas | `export.bakedCell` (the union of every layer around the pivot). A layer's cel sits at `bakedPivot − layer.pivot`, so a 96 sword lies at (0, 0) and the 64 body at (16, 16), aligned by pivot exactly as in `baked/`. |
| Pivot | Slice `pivot`: the whole canvas, pivot = `bakedPivot` (key at frame 0). |
| Cels | Compressed (type 2, zlib via `CompressionStream('deflate')`), untrimmed (layer cell size). A cell repeated in a playlist (hold) becomes a linked cel. A transparent cell has no cel. |
| zOverrides | Cel z-index. Aseprite ≥ 1.3 draws by layer index + z-index, so each cel gets `(its position in that frame's resolved draw order) − (layer index)`. The flattened frame then equals `composeCell`. This replaces the planned "static z only" limitation. |
| Colors | Source ramps, the same as `layers/`. Outfit recolors are not applied. |

Sizes: S1 49 KB, S2 92 KB, S5 73 KB.

### Verification with the Aseprite CLI

`node docs/testing/b11_aseprite_tests/verify-aseprite.ts <s1|s2|s5> <outDir> [zmut]` ([log](b11_aseprite_tests/aseprite_cli.log))
exports a fixture with the real export code and runs Aseprite twice, with `-b` only (no window):

1. `--list-layers --list-tags --list-slices <file> --format json-array --data comp.json --sheet comp.png`. This flattens
   the visible layers.
2. `--all-layers --split-layers <file> --filename-format "{layer}|{frame}" ... --sheet layers.png`. This gives every layer
   per frame.

It then checks:

- tag names and ranges
- loop and repeat
- frame count and every duration
- the layer list and slice pivot
- every split-layer frame against the layer sheet cell placed at `bakedPivot − pivot`
- every flattened frame against `baked/<presets[0]>/<anim>.png`

| Fixture | Moves × dirs | Layers | Frames | Tags | Per-layer diff | Composite diff |
|---|---|---|---|---|---|---|
| S1 knight | idle 4 + walk 8 × S/E/W | 5 | 36 | 6 | 0 / 737,280 px | 0 / 147,456 px |
| S2 adventurer (multi-move, `hides`, 2 head items) | walk 8 + cross-punch 6 × S/E/N/W, partial dirs | 10 | 38 | 5 | 0 / 1,556,480 px | 0 / 155,648 px |
| S5 sword (96 oversize) | walk 8 + slash 8 (80–120 ms) × S/E/N/W | 3 | 64 | 8 | 0 / 1,769,472 px | 0 / 589,824 px |

**z-index check (`zmut`).** The fixtures' own overrides change no visible pixels, so this mode adds a south override that puts
the helmet (S1/S2) or the sword fg (S5) behind the body.

- The real file still matches `baked/` with 0 differing px.
- A copy of the same file with every cel z-index zeroed differs by 626 px (S1), 1,594 px (S2) and 148 px (S5).
- So the z-index really is applied, and the test detects it when it is missing.

## Godot CREDITS warning fix

`CREDITS.csv` → **`CREDITS.txt`**. The content is the same CSV text, but Godot only imports `.csv` as a translation table.

- The file is renamed in every export, and the README line now reads "CREDITS.txt … CSV".
- `.import` / `.gdignore` were rejected. Both are Godot clutter in engine-neutral exports, and `.gdignore` would hide the
  whole folder.

Godot 4.7.1 harness (B8 project `checkouts/engine-tests/godot`, b9_ranger / s1_knight / s5_sword re-exported, the b9 file
renamed). Logs: [import](b11_aseprite_tests/godot_import.log), [sync](b11_aseprite_tests/godot_sync.log),
[render S5](b11_aseprite_tests/godot_render_s5.log), [render S1](b11_aseprite_tests/godot_render_s1.log).

| Check | Result |
|---|---|
| `--headless --import` | **0 warnings, 0 errors** (was 4 warnings) |
| Control: CREDITS.txt copied back to `.csv` | The 4 "Locale … does not contain any translation" warnings return |
| Sync `test_sync_oversize.gd` | S5: 720 ticks, 1,440 oversize layer-ticks, 0 failures. S1: 540 ticks, 0 failures |
| Render `test_render_oversize.gd` (windowed, Vulkan) | S5 0 / 1,179,648 px. S1 0 / 294,912 px |

## Byte identity

S1, S2 and S5 exports (generic, godot, phaser, unity) from HEAD and from this change were compared file by file. Every file is
byte-identical except:

- `CREDITS.csv` → `CREDITS.txt`, with identical bytes
- the README's credits line
- `exportedAt`

## Files

| File | Change |
|---|---|
| `app/src/lib/export/aseprite.ts` | New: writer, `readAseprite` (tiny reader), `selfTest` |
| `app/src/lib/export/export.ts` | `aseprite` engine → `asepriteFiles(m, sheets)` (+2 lines) |
| `app/src/lib/export/generic.ts` | `CREDITS.txt`, README line, `ENGINE_START.aseprite` |
| `app/src/studio/ExportSheet.svelte` | 5th target "Aseprite". Engine grid has 5 columns at ≥ 600 px (scoped style); phone stays at 2 columns |
| `app/src/lib/selftests.ts` | Registers `export/aseprite` |
| `app/scripts/e2e-studio.mjs` | Expects `CREDITS.txt` |
| `docs/manifest-spec.md` | §5 layout (README, CREDITS.txt, aseprite/) and §6.5 rewritten |
| `docs/testing/b11_aseprite_tests/` | Verify script + logs |

**selfTest** (`export/aseprite`): writes a 2-layer + oversize 3-layer file and parses it back with `readAseprite`. It checks:

- header magic, size, depth and canvas
- layer names, order and visibility
- frame count and durations
- tags with repeat
- the pivot slice
- empty cells → no cel
- cel offsets by pivot, and decompressed pixels
- a per-cell zOverride → z-index −1
- a held cell → linked cel

**Checks.** `npm run check`: 0 errors and 0 warnings (218 files). `npm run build`: OK. `npm run selftest`: all passed.
I also looked at the Studio: Export sheet → Aseprite lists `aseprite/Ranger.aseprite` (176 KB zip). Afterwards I set the stored
engine choice back to Godot.

## Gaps

- Not run in Unity's Aseprite Importer (license-blocked, same as M5) or in Godot's Aseprite Wizard (needs the plugin and the
  Aseprite binary).
- Expected behavior there:
  - Unity applies cel z-index as Order in Layer.
  - The Wizard makes per-layer SpriteFrames and ignores z-index.
- Visibility follows only `presets[0]`. Other outfits are a matter of toggling layers. One file per preset is possible if users
  ask for it.
- Cels are not trimmed (simpler, valid). Aseprite trims them itself on its next save.
