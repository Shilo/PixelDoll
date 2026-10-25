# Native export expansion — 23 October 2026

The user requested native GameMaker and GDevelop exports, each with a specialist agent and actual engine verification.
GameMaker was subsequently deferred explicitly by the user because its required runtime will not be installed.
The original [target review](export-targets-2026-10-23.md) describes the earlier maintenance-based deferral; this work
revisits GDevelop with an implementation and verification requirement.

## Export picker decisions

- **Export format** replaces “For which engine?” because Aseprite and PNG + JSON are formats, not engines.
- **Engines & frameworks** includes Phaser accurately; **Asset formats** includes editable Aseprite without calling it raw.
- Use Godot, Unity, Phaser, GDevelop as the supported integration order; Aseprite and PNG + JSON are in the separate
  format section. This is a product order for PixelDoll's layered 2D workflow, not a universal popularity ranking.
- Do not insert an unavailable Unreal or deferred GameMaker radio option simply to reflect industry popularity.
- Two-column cards scale better than the old five-column row. Native radios provide keyboard selection and focus behavior.
- Keep names and short deliverable labels visible. A selected-target description supports touch and assistive technology;
  hover titles supplement it. Essential instructions do not depend on tooltips.
- Lucide symbols are small local files under `app/public/icons/exports/`, matching the existing visual language. They are
  not brand logos. `public/` assets are still deployed with the application, but add no JavaScript icon dependency or
  third-party icon requests. Source IDs and license notices accompany the files.

## GameMaker: explicitly deferred

The specialist inspected the official LTS2026 IDE 2026.0.0.16 and bundled ProjectTool 2024.14.165. ProjectTool generated
a native blank `.yyp` baseline, but it cannot substitute for compiling/running equipment behavior. The matching runtime
2026.0.0.23 is not installed; only old GameMaker Studio 1.x artifacts exist locally. No exporter, runtime or public target
was shipped. The user's deferral is a Later card on the [board](https://github.com/users/Shilo/projects/7); the acceptance criteria are below.

A useful future target should produce native sprites with origins, reusable GML objects/API and a demonstration room,
plus shared elapsed-millisecond timing, equipment/hides/tucking/draw order, and exact owner-local palette swaps.
Shader uniform capacity must be tested rather than assuming every palette fits. Actual Igor compilation and rendered
fixtures are prerequisites to exposing the target.

Official sources: [project/resource/package formats](https://manual.gamemaker.io/monthly/en/Additional_Information/Project_Format.htm),
[CLI build prerequisites](https://manual.gamemaker.io/monthly/en/Settings/Building_via_Command_Line.htm),
[runtime download guide](https://gamemaker.io/en/help/articles/how-to-download-gamemaker-s-runtime-tools-without-using-the-ide),
[LTS2026 release](https://releases.gamemaker.io/release-notes/2026/0).

## GDevelop: native project implemented and verified

The GDevelop specialist implemented `gdevelop/game.json`, registered native Sprite objects and individual PNG resources,
with an embedded JavaScript event for the paperdoll controller. The controller preserves exact playlist timing, pivots,
equipment/hides/tucking, z overrides and owner-local palettes. Separate dolls remain independent; character identities
include name and frozen-base hash so two character libraries sharing the same item IDs can coexist.

The released GDevelop 5.6.285 editor-core WASM importer and official HTML exporter accepted the generated project.
Its shipped GDJS/PIXI runtime rendered the native Sprite resources and passed timing, pixel, origin, color and equipment
assertions in Chromium. The portable Electron desktop executable failed at crashpad startup, so desktop GUI verification
is not claimed. The actual editor core/exporter/runtime path is documented in the [test report](../testing/gdevelop-export-2026-10-23.md).

Primary sources: [GDevelop release](https://github.com/4ian/GDevelop/releases/tag/v5.6.285),
[editor core](https://github.com/4ian/GDevelop/tree/master/GDevelop.js),
[official exporter](https://github.com/4ian/GDevelop/blob/master/GDJS/GDJS/IDE/Exporter.h),
[Sprite runtime](https://github.com/4ian/GDevelop/blob/master/GDJS/Runtime/spriteruntimeobject.ts),
[PIXI image manager](https://github.com/4ian/GDevelop/blob/master/GDJS/Runtime/pixi-renderers/pixi-image-manager.ts).

## Unreal: possible, but not currently implemented

Unreal has a native Paper2D route. Epic's [.paper2dsprites importer](https://dev.epicgames.com/documentation/unreal-engine/import-sprites-in-unreal-engine?lang=en-US)
creates textures and Sprite assets. Sprite resources support [custom pivots](https://dev.epicgames.com/documentation/unreal-engine/paper-2d-sprite-editor-in-unreal-engine),
and Flipbook keyframes have [integer frame-run lengths](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/Paper2D/FPaperFlipbookKeyFrame).
The earlier recommendation deferred maintenance and verification cost; it did not mean native support was impossible.

A complete PixelDoll integration would additionally require a shared-clock, Blueprint-callable Actor/component for
equipment, visibility and per-frame ordering; exact palette textures/materials; and an Editor importer that creates the
native assets. Deliver source as a [`.uplugin` with Editor/runtime modules](https://dev.epicgames.com/documentation/en-us/unreal-engine/plugins-in-unreal-engine),
instead of claiming portable browser-generated binary `.uasset` files. Changing a Flipbook must restore shared playback
time using [SetPlaybackPosition](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/Paper2D/UPaperFlipbookComponent/SetPlaybackPosition?lang=en-US).
Material choice affects ordering: [masked and translucent sprite materials](https://dev.epicgames.com/documentation/en-us/unreal-engine/paper2d-import-settings-in-the-unreal-engine-project-settings)
need different depth/sorting validation. Cooked-game dependency and rendering tests are part of the native contract.

No actual Unreal installation is available: a stale UE 5.1 registry entry points to a missing editor directory. Unreal
implementation is outside this request's GameMaker/GDevelop scope, so no unsupported option was added to the picker.
