# Shared-copy exports in real engines and the Godot Aseprite Wizard path, 2026-11-09

Scope: run shared-equipment exports in real Godot, Phaser and Aseprite (board card SE6), and verify whether the Godot
Aseprite Wizard addon imports PixelDoll's `.aseprite` export. Everything ran offline: no PixelLab requests, generations or
credits. Earlier evidence only built and reimported shared-copy artifacts ([shared equipment](shared-equipment-2026-10-22.md));
this report executes them.

## Scenario

Input is the retained live evidence in the main checkout's ignored `spikes/api/out/shared-fit/`:

| Archive | SHA-256 |
| --- | --- |
| `cast-complete.pixeldoll.zip` (fitted helmet copy A; Cast added after copying) | `2a988c138771318a890f8ecb881238dbc0c150ab6c2ad39fa2fd44ad3d3b0441` |
| `one-view-move-test.pixeldoll.zip` (the same character before Cast) | `acb730e661b98bfb9c2879c330284b400b33a4753c4d6512de8dd47cccf49c42` |

[`gen.mjs`](engine-shared-copy-2026-11-09/gen.mjs) uses the app's own code, run in Node:

1. `readCharacterZip` reads both archives.
2. `createDesign` saves the helmet from the pre-Cast clone as a design. `prepareCopy` makes it a free **copy B** on the Cast character. The body pixels match, so all 12 idle and walk cells copy. Cast did not exist in the design, so copy B has no Cast cells. Copy A keeps its 20 cells, including the 8 Cast cells added later.
3. Both copies start from identical source RGBs (asserted). Copy B's material gets its own `crimson` variant. Copy A keeps `azure`, and copy B's default colorway is the design's azure.
4. Four outfits: `current` (copy A azure plus the old shield), `copy_b` (copy B crimson plus shield), `copy_b_default` (copy B only) and `copy_a_raw` (copy A in source colors).
5. The global export setting makes Cast play once, as the Studio's Export sheet applies it.
6. Separate Godot, Phaser, Aseprite and generic ZIPs are exported. Each reimports with both copies, their design revisions and copy B's own `crimson` variant, while copy A has none.

The old shield has no Cast cells, and neither does copy B. `coverageGaps`, the data behind the Export sheet's
warning, reports `cast/south` for both and nothing for copy A. `missingAt` reports the shield for `current` and
the shield plus copy B for `copy_b`. PixelDoll's compositor rendered 80 oracle frames (4 outfits, 20 cells),
which every engine check below compares against.
The Godot and Phaser checks clear the canvas to magenta (#FF00FF) and expect it wherever the oracle is transparent.
The oracle has no magenta pixel but 7,064 opaque black ones, so a black clear color could not tell opaque black from
transparent. An earlier pass with a black clear color (Godot on Vulkan and Direct3D 12, and Phaser) gave the same counts.

## Results

| Runtime | What ran | Result |
| --- | --- | --- |
| Godot 4.7.1, windowed Forward+ on Direct3D 12 (RTX 3070 Ti, OpenGL fallback disabled) | Headless import with 0 errors, then [`godot_shared.gd`](engine-shared-copy-2026-11-09/godot_shared.gd). Two `Paperdoll.tscn` instances render side by side, with every playlist frame of every move in four configurations: copy A azure next to copy B crimson, copy B default next to copy A source, cross-copy recolor, and swapping copy B into a doll that wore copy A. Copy B's Cast textures are checked for transparency. Cast plays once and holds its last frame. Layers stay in sync for 240 real ticks. | **0 of 1,474,560 px** differ; all runtime checks pass. Negative control ([`godot_control.gd`](engine-shared-copy-2026-11-09/godot_control.gd): copy B in its default colors without the shield, compared with the copy B crimson-plus-shield oracle) reports 3,510 differing px. |
| Phaser 3.80.1, 3.90.0 and 4.1.0, each in Canvas and WebGL (headless Chromium, Playwright 1.65) | [`phaser_shared.mjs`](engine-shared-copy-2026-11-09/phaser_shared.mjs) serves the ZIP by route interception, with no server or port. It runs the same four configurations plus the same negative control, and checks Cast `repeat` 0, idle `repeat` -1 and an empty copy B Cast texture. | All **24 positive runs: 0 of 368,640 px** each. All **6 controls** detect 3,510 px. No page errors. |
| Aseprite 1.3.18.6 CLI | [`ase_render.lua`](engine-shared-copy-2026-11-09/ase_render.lua) renders the exported file with its saved visibility, then with layers toggled to body + copy B, body + shield + copy B, and body + copy A. [`ase_compare.mjs`](engine-shared-copy-2026-11-09/ase_compare.mjs) compares the renders with the compositor in the first outfit's colors. | **0 of 184,320 px** in each of the 4 configurations. Tags `idle_south`, `walk_south` and `cast_south` (`repeat` 1); durations 150/100 ms. Copy B's layer alone has 106 opaque px in each idle and walk frame and **0 in all 8 Cast frames**. |

What this establishes:

- **Independent palettes:** both copies share source RGBs, but recoloring one never changes the other, in either engine.
  This holds when two dolls show different copies at once, when a doll recolors the copy it is not wearing, and when one
  doll swaps copies. Aseprite carries only the first outfit's colors by design, so copy B's crimson cannot appear there.
  Its hidden layer correctly carries its own default colorway.
- **Source sheets:** copy B has a default variant, so its export ships `sourceSheets`. Godot and Phaser recolor from those
  raw ramps to both default and crimson; exact pixels prove it.
- **Later moves:** copy A's Cast cells, added after copying, render exactly. Cast plays once in all three runtimes.
- **Sparse coverage:** Studio reports missing whole clips (copy B and the shield in Cast) through `coverageGaps`. Engines
  leave those frames transparent; nothing is filled from other moves or frames.

## Finding: a partially covered move was not reported (fixed)

[`partial_probe.mjs`](engine-shared-copy-2026-11-09/partial_probe.mjs) removes Cast cells 4 to 7 from copy A and
drops them from its `coverage`. Before the fix, `coverageGaps` returned `[]`, `missingAt` listed only the shield, and the
Export sheet showed no warning. The cause was in `app/src/lib/dress/dress.ts`: `coverageGaps` and `missingAt` used `hasCells`, which counts a clip as present when any cell has pixels. A free copy with
partial coverage, which [shared equipment](shared-equipment-2026-10-22.md) explicitly allows, can therefore blink out
on some frames in every engine without the Export sheet, item pane or stage warning about it.

Fix: a new `missingFrames` returns the cells of a clip an item would vanish in. For items with a coverage list these are the
cells never recorded; recorded transparent cells (an item hidden or off-canvas on some frames) are intentional and never
flagged. Items without a coverage list keep the old all-or-nothing rule. `coverageGaps` and `missingAt` use it, so the
Export sheet ("is missing 4 of 8 cast south frames"), item pane, design preview, stage note and "Fit missing frames" now
see partial moves; whole missing moves keep "has no ... frames". A unit test in `progressive-items.test.ts` covers the
partial, transparent, mirrored, whole-missing and legacy cases. The probe now reports `cast/south` for the helmet, and the
four retained real archives show no new gaps. A keyless browser import of the probe character showed the new Export
warning with zero PixelLab requests.

## Godot Aseprite Wizard: compatible, with three settings

The addon came from the official GitHub release `v9.8.0-4` (`viniciusgerevini/godot-aseprite-wizard` zipball, SHA-256
`540f52dacbe99f18a3f2ab537714a61b2dd85d124cb51e4736980e383b6925fc`). It was treated as untrusted data and extracted into its
own folder. It ran only in a throwaway Godot 4.7.1 project in the session scratchpad, isolated via `APPDATA`, and was not
added to the repository. Its GDScript makes no network calls; it only runs the configured Aseprite command. Headless
`--editor --import` imported the files through the addon's automatic importer, which called Aseprite 1.3.18.6.
[`wizard_inspect.gd`](engine-shared-copy-2026-11-09/wizard_inspect.gd) then compared every imported frame with the
compositor. The second Aseprite file is [`ase_reorder.mjs`](engine-shared-copy-2026-11-09/ase_reorder.mjs): the same
export with `copy_b_default` first, so the shield and copy A are hidden.

| Import | Result |
| --- | --- |
| SpriteFrames importer, defaults, first outfit shows every item | 0 px differ (nothing hidden to leak). Animations `idle_south`, `walk_south`, `cast_south`; Cast `loop=false` from tag `repeat` 1; idle and walk loop. **Idle 150 ms frames become 142.9 ms** (`round_fps` makes it 7 fps). |
| SpriteFrames importer, defaults, first outfit hides items | **3,528 px differ**: the default `only_visible_layers=false` exports with `--all-layers`, so hidden equipment (shield, the other helmet copy) is drawn. |
| SpriteFrames importer, `only_visible_layers=true`, `round_fps=false` | **0 px differ**; durations exact (150 and 100 ms). |
| SpriteFrames (Split By Layer) | One SpriteFrames per item layer on the shared 96x96 canvas. Body plus copy B stacked: **0 px differ**, durations exact with `round_fps=false`. The first headless pass logged one `Error loading resource` for the container while creating `.ase_layer` files; a second pass imported all five layers cleanly. |

Not supported by the addon:

- **Pivot slice:** the addon has no pivot or offset handling, so it ignores the `pivot` slice. A default centered
  AnimatedSprite2D puts the feet 27 px off for this 96x96 canvas.
- **Draw-order exceptions:** Split By Layer produces independent SpriteFrames, so per-frame cel z-index
  (`zOverrides`) cannot apply.
- **Recoloring:** the addon does no palette swaps, so only the first outfit's colors exist.

The export's `aseprite/README.txt` now tells users what to do: turn on "Only visible layers", turn off "Round fps", turn
off Centered and set Offset to `-bakedPivot`, and note that Split By Layer loses per-frame draw order. For recoloring,
outfits and synchronized layers, the dedicated Godot export remains the recommended path.

## Verification

- `npm run check`: 0 errors and warnings; formatting clean.
- `npm test`: **2,056 passed in 172 files**, with native Godot 4.7.1 (`GODOT_BIN`) and installed Aseprite enabled.
- Magenta clear color rerun: Godot 4.7.1 on Direct3D 12 (`fallback_to_opengl3=false`) passed with 0 of 1,474,560 px
  and its control reported 3,510 px; all 36 Phaser runs (24 positive, 6 controls, 6 runtime-fact checks) passed with the
  same counts as above. Aseprite and the Wizard compare alpha directly, so they were not rerun.
- End-to-end specs: none run. The only app change is README text inside the Aseprite export, which no spec asserts.
- Toolchain: Node 25.0.0 was installed rather than the pinned 24.22.1 (CI is the exact-toolchain check). Phaser bundles were
  downloaded from the release tags, with the same URLs as the [Phaser playback](phaser-playback-2026-10-28.md) verifier. SHA-256:
  - 3.80.1: `9649498…ae2b`
  - 3.90.0: `0d65d91…d426`
  - 4.1.0: `71d9268…9dd1e`
- Generated ZIP SHA-256 values: Godot `7acf6b89…6af`, Phaser `10f56206…de59`, Aseprite `b3d2017a…6c86`, generic
  `38ad084b…d7a`. Outputs, the Godot and Wizard projects and logs stay in the session scratchpad; the input archives
  stay ignored in the main checkout.
- The installed PixelLab Aseprite extension prints a Lua error in batch mode (`handle-pose.lua:58`). This is unrelated to
  PixelDoll, and every exit code was 0.

## Remaining gaps

- One shared-copy scenario on one direction and a 64 px rig, from one real character. Eight-direction, mirrored and
  oversize shared copies were not executed in engines (oversize and mirroring are covered by earlier non-shared runs).
- Unity, GDevelop and RPG Maker shared-copy runtimes were not run. Unity still needs an activated Editor license.
- The Aseprite Wizard check covers the import plugins, not the addon's editor docks (AnimationPlayer or inspector flows),
  and one addon release.
- Phaser ran in headless Chromium only; no mobile GPUs or other browsers.

## Reproduction

From a scratch folder `<scratch>`, with `<app>` the repo's `app/` and `<evidence>` the folder holding the two archives.
Every `.mjs` script runs with `node --experimental-transform-types`, because it imports the app's TypeScript sources:

```sh
node --experimental-transform-types gen.mjs <app> <evidence> <scratch>/out
```

Godot (never use the OpenGL or Compatibility renderer on this machine):

1. Copy the contents of `out/godot/`, plus `out/expected/` and `out/scenario.json`, into a project folder.
2. Add `godot_shared.gd` as `verify.gd`, `godot_control.gd` as `control.gd`, and a minimal `project.godot`:

   ```ini
   config_version=5
   [application]
   config/name="Shared copy engine test"

   [rendering]
   rendering_device/fallback_to_opengl3=false
   ```

3. Run `godot --headless --path <project> --editor --import --quit`.
4. Run `godot --path <project> --rendering-driver d3d12 --resolution 192x96 --script verify.gd` (expects `GODOT_SHARED_PASS`).
5. Run `godot --path <project> --rendering-driver d3d12 --resolution 192x96 --script control.gd` (expects a nonzero
   `CONTROL_DIFF` and exit code 0).

Phaser (downloads the bundles into `<vendor>` on first use; no server or port):

```sh
node --experimental-transform-types phaser_shared.mjs <app> <scratch>/out <vendor>
```

Aseprite: `ase_render.lua` renders one configuration of the exported file
`out/aseprite/aseprite/<name>.aseprite` into a folder:

```sh
aseprite -b <file> --script-param out=<dir> --script-param show=<layers|*> --script ase_render.lua
```

`ase_compare.mjs` reads these five output folders, with `<B>`, `<A>` and the shield ID from `out/scenario.json` and
the manifest (layer names are `<slot>.<item>`, plus `.fg`/`.bg` for the shield):

| Output folder | `show` |
| --- | --- |
| `<scratch>/ase/default` | `*` |
| `<scratch>/ase/copyB` | `body.base,head.<B>` |
| `<scratch>/ase/copyB_shield` | `body.base,head.<B>,off_hand.<shield>.bg,off_hand.<shield>.fg` |
| `<scratch>/ase/copyA` | `body.base,head.<A>` |
| `<scratch>/ase/copyBonly` | `head.<B>` |

Then run `node --experimental-transform-types ase_compare.mjs <app> <scratch>` (expects `ASEPRITE_SHARED_PASS`).

Godot Aseprite Wizard:

1. Run `node --experimental-transform-types ase_reorder.mjs <app> <scratch>`. It writes `out/copy_b_first.aseprite`
   with `copy_b_default` as the first outfit.
2. Download the `v9.8.0-4` release zipball, check its SHA-256 above, extract it into its own empty folder and copy only
   `addons/AsepriteWizard/` into a new Godot project's `addons/`.
3. Give that project a `project.godot` that enables the plugin and its automatic importer, with the OpenGL fallback off:

   ```ini
   config_version=5
   [application]
   config/name="Aseprite Wizard PixelDoll test"

   [aseprite]
   import/import_plugin/enable_automatic_importer=true

   [editor_plugins]
   enabled=PackedStringArray("res://addons/AsepriteWizard/plugin.cfg")

   [rendering]
   rendering_device/fallback_to_opengl3=false
   ```

4. Isolate the editor: set `APPDATA` to an empty folder inside the project (for example `home/`) for every Godot
   command below, and set `aseprite/general/command_path` to the Aseprite executable in that folder's
   `Godot/editor_settings-4.7.tres` (run the import once to create the file, then edit it).
5. Copy the exported Aseprite file to `char/shared.aseprite`, and `out/copy_b_first.aseprite` to `char/b_all.aseprite`,
   `char/b_visible.aseprite` and `char/split.aseprite`. Copy `out/godot/manifest.json`, `out/scenario.json` and
   `out/expected/` to the project root, and `wizard_inspect.gd` as `inspect.gd`.
6. Set each file's importer in its `.import` file (all other parameters stay at the addon defaults):

   | File | `importer` | Settings |
   | --- | --- | --- |
   | `shared.aseprite`, `b_all.aseprite` | `aseprite_wizard.plugin.spriteframes` | defaults (`only_visible_layers=false`, `round_fps=true`) |
   | `b_visible.aseprite` | `aseprite_wizard.plugin.spriteframes` | `only_visible_layers=true`, `round_fps=false` |
   | `split.aseprite` | `aseprite_wizard.plugin.spriteframes-split` | `round_fps=false` |

7. Run `godot --headless --path <project> --editor --import --quit` twice (the second pass finishes the Split By Layer
   `.ase_layer` resources).
8. Run `godot --headless --path <project> --script inspect.gd` (prints per-import pixel differences and timings, then
   `WIZARD_INSPECT_DONE`).
