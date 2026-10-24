# Adversarial export follow-up — 2026-10-23

Scope: challenge the already-fixed Godot, Unity, Phaser, GDevelop, Aseprite and PNG/JSON exports, using a dedicated review agent plus independent research and counter-review. No PixelLab requests or credits were used. Prior delivery: [export audit](export-audit-2026-10-23.md) and [GDevelop verification](gdevelop-export-2026-10-23.md).

## Findings agreed and fixed

| Finding | Reproduction and agreed correction |
| --- | --- |
| Invalid layer layouts passed import and every exporter | A background-only body imported successfully; actual Godot emitted missing `body_fg` and null clock errors. Unity and Phaser also assume a foreground body clock. Enforce the documented single `main` foreground or matching `fg`/`bg` pair on every item before composing, importing or exporting. Duplicate, empty and role-mismatched layouts are covered. |
| Two independently equipped clipping slots produced incorrect masks | Hair clipped by both a hat and face accessory differed by 310 pixels after per-pair variant expansion. Reject this unsupported export combination with an actionable error; retain richer source import/preview. Root challenged exponential variant generation as unnecessary scope. Agent challenged root's initial guard for a hood that always hides hair; the final guard respects item/slot hiding overrides, alternative items, stale and empty slots. |
| Godot assigned engine-neutral depths directly to bounded native properties | Native Godot 4.7.1 accepted the import but emitted four depth errors for source values 9999/10000/10001 and left nodes at zero. Root proposed sorted ranks; agent independently reproduced and agreed. Scene and runtime now use compact stable ranks, retaining raw manifest data, slot/background tie order and per-cell crossings. Native tests also cover selected-scene packed export. |
| Unity discarded fractional export scale | Root found JSON could contain `ppu: 2.5` while the generated C# field was `int`. Agent verified native APIs accept floats. Preserve the fraction with a C# float field; reject zero, negative and nonfinite scales before generating any archive. |
| Malformed palette values reached engine conversion | Source/variant values such as `#gggggg` passed validation, producing inconsistent JS conversion and a Unity conversion exception. Reject colors outside six-digit RGB, including non-string imported elements, before any tuck/recolor work. |
| Fractional or overflowing depths collapse in native integer fields | Final counter-review found native integer fields cannot preserve fractional or out-of-range depths. Validate layer, slot and override depths as signed 32-bit integers; this still permits the high-depth Godot regression while preventing truncation or JSON conversion failures. |

## Claims challenged and not accepted

- Phaser terminal-frame synchronization: existing animation events already expose the last frame; no reproduced defect.
- Godot resource replacement stopping playback: the existing refresh path restores frame, progress and playing state; no additional change.
- GDevelop palette assignment after `updatePreRender`: checked against released Sprite runtime; existing ordering is valid.
- Unity restarting an already finished nonlooping state: no established public restart contract or licensed native reproduction; no speculative behavior change.
- Unreal as a PNG/descriptor-only target: Paper2D supplies native sprite/Flipbook assets, but PixelDoll also needs an Editor importer and a tested paperdoll runtime. TODO now explicitly defers that complete integration, including native import/render and cooked dependency tests; the registered old editor directory is missing. GameMaker remains deferred at the user's request because its required runtime is unavailable.

## Verification

- `npm test`: **321 passed across 36 files**, with native Godot 4.7.1 and installed Aseprite enabled. The final signed-32-bit boundary refinement was additionally checked with all **12 shared export tests** passing.
- `npm run check`: zero Svelte errors/warnings and passing application, Node and test TypeScript checks.
- `npm run build`: passed with clean production distribution guard.
- Playwright export-picker and Studio demo: **2 passed**, including native GDevelop ZIP download, responsive layouts and actual Godot export download.
- Released GDevelop **5.6.285** editor core imported the project; official HTML exporter and shipped runtime passed timing, origins, tucked variants, depths, palettes, independent dolls and lifecycle assertions.
- Phaser **3.90.0 and 4.1.0**, each with Canvas and WebGL: **4 native runtime runs passed**.
- Review agent independently reran malformed-layout import/all-six-target refusal, overlapping-clips guard/hiding exception, RGB rejection and fractional/invalid scale probes; no remaining blocking findings.

Unity Editor execution remains unavailable because the installed editor has no activated license; C# structure/JSON checks are not a substitute for an actual Unity import. GDevelop verification uses the actual released editor WASM core, official exporter and shipped GDJS/PIXI runtime; the desktop Electron shell has a crashpad startup failure. All probe artifacts stay in ignored cache/test-output directories.

## Primary references

- [Godot CanvasItem depth constraints and tree order](https://docs.godotengine.org/en/stable/classes/class_canvasitem.html#class-canvasitem-property-z-index)
- [Unity TextureImporter.spritePixelsPerUnit is float](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/TextureImporter-spritePixelsPerUnit.html)
- [Unreal Paper2D sprites, Flipbooks and native import settings](https://dev.epicgames.com/documentation/en-us/unreal-engine/2d-in-unreal-engine)
- [Phaser LoaderPlugin official API](https://docs.phaser.io/api-documentation/class/loader-loaderplugin)
- [GDevelop SpriteRuntimeObject source](https://github.com/4ian/GDevelop/blob/master/GDJS/Runtime/spriteruntimeobject.ts)
