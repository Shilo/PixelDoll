# Shared JavaScript paper-doll runtime

PixelDoll runs the canonical JavaScript paper-doll modules shipped in its Phaser export. The canonical source is
`app/src/lib/runtime/`: `paperdoll.js` handles equipment, hiding, layer order, live masks, cell lookup,
mirroring, pivots and straight-alpha composition; `colors.js` handles linked palette selection, exact
RGB swaps and owner-local recolored project views; `timeline.js` handles timeline duration and sampling.
These are plain JavaScript ES modules with checked JSDoc, not TypeScript that consumers must compile.

The Phaser export's `phaser/PaperdollContainer.js` includes these source files verbatim, followed by the
Phaser adapter. All their public exports are available from that single standalone ES module. There
are no application imports, runtime dependencies, code evaluation or Phaser dependency in the core.
The adapter still uses the host game's Phaser instance and native animation events.

The adjacent `phaser/types.d.ts` is generated from the application's existing manifest, rig and image
type declarations. Canonical JavaScript JSDoc references that portable schema, with module-specific
aliases so concatenation cannot introduce duplicate names. No second handwritten schema is maintained.
The delivered JavaScript and schema are type-checked together in an isolated consumer directory.
The generated schema describes project data, including authoring metadata, rather than additional
runtime services. Schema changes intentionally require regeneration and consumer checking.

## Decision and challenge

The requested Sol medium and OpenCode `deepseek/deepseek-flash` low audits independently identified that
embedding the existing Phaser class would require export atlases, eager mask baking and a Phaser game
lifecycle inside the editor. That is not dogfooding the useful boundary. The implementation instead
extracts the shared behavior and makes both the editor and the Phaser adapter consume it.

Flash preferred conformance tests without making the exported implementation authoritative. That
restriction was not adopted: keeping independent equipment, color and geometry rules would preserve
the drift this task addresses. Sol's shared-core proposal avoids the renderer lifecycle mismatch,
while independent golden tests and real-engine negative controls challenge the common implementation.

The application imports these JavaScript modules normally. `compose.ts`, `mirror.ts` and `palette.ts`
re-export the canonical functions instead of maintaining alternatives. `dress.ts` only supplies the
authoring ramp resolver to the shared recolor implementation. Live presentation uses shared timeline
sampling while retaining phase-preserving direction changes and velocity scaling as UI policy.

Deliberate boundaries:

- Generation, skeleton authoring, quality review, storage and UI state are not game runtime behavior.
- Source-ramp generation and procedural color choices remain authoring operations. Export materializes
  those choices into stored ramps; both consumers share selection and exact pixel application.
- Editing uses live masks and decoded hash-addressed cells. Export preparation bakes mask combinations
  and sheets once. Exported manifests retain cover metadata, so both paths use the same variant
  selection rule. Editing never eagerly bakes every combination.
- Preview playback intentionally loops, including authored once-only clips. Native Phaser playback
  honors the exported loop flag. Timeline policy is explicit, not silently changed by this refactor.
  The inspector's timer advances playlist entries for pause/step controls; it does not implement a
  second pixel compositor or equipment resolver.
- Phaser texture loading, sprite placement and native frame events remain adapter responsibilities.
  `sync()` consumes the same `drawList()` used by internal composition, not a second visibility or z rule.
- GDevelop's native JavaScript event embeds the canonical modules inside its controller factory, removing
  only ES module `export` keywords. Its adapter uses `sampleTimeline`, `drawList`, `paletteMap` and
  `applyPalette`; Sprite resources, origins and renderer textures remain GDevelop-specific.
  Module-local caches are therefore per-controller in GDevelop. Shared behavior must not depend on
  cross-controller mutable state; recolor caches are performance-only.
- Aseprite resolves and applies first-outfit palettes through the canonical color API. Generic and RPG
  Maker baked frames use the canonical compositor. Godot and Unity retain native-language controllers,
  so their independent implementations still require native conformance checks rather than source identity.

Add runtime behavior to the canonical JavaScript modules, not the TypeScript facades. Existing
application entry points preserve caller interfaces; direct canonical imports are appropriate for
other engine-neutral modules. Phaser's public `z()` and `layerOf()` convenience methods remain available.

Item-only thumbnails and inspector frames call `composeCell` with a project view containing just
that item and its layer-union frame. Other equipment is intentionally excluded, but depth overrides,
mirroring, owner-local images and pixel composition are not reimplemented. `compareDraws(manifest)`
owns the total layer ordering, including equal-depth ties; `drawList` and Aseprite's editable
all-layer stack both use it. Aseprite gets first-outfit visibility from `drawList`. Phaser and
GDevelop assign renderer ranks from the returned draw-list order instead of creation-order ties
or a second depth sort. Change ordering in the canonical comparator, not in these adapters.

Primary API references reviewed: [Phaser animations](https://docs.phaser.io/phaser/concepts/animations)
and [TypeScript JavaScript checking](https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html).
Native engine tests, not documentation alone, verify nonuniform Phaser frame durations and synchronization.

## API use

```js
import {
  composeCell,
  bakedFrame,
  recolor,
  sampleTimeline,
  drawList,
  loadPaperdoll,
  Paperdoll,
} from "./phaser/PaperdollContainer.js";

const frame = bakedFrame(project.manifest);
const colored = recolor(project, { hair: "azure" });
const cell = sampleTimeline(move.frames, elapsedMs, move.loop);
const image = composeCell(
  colored,
  outfit.items,
  move.id,
  direction,
  cell,
  frame,
);
```

`project` is `{ manifest, images }`, with decoded RGBA images `{ w, h, data: Uint8ClampedArray }` in a
`Map` keyed by the full cell hash. To reconstruct it from an export, read the manifest inside
`project.json` and decode each referenced `cells/<hash without sha256:>.png` into that map.
The separate `manifest.json` describes atlas/sheet assets and omits layer cell references; it is not
a decoded compositor project and cannot be passed directly to `composeCell`.
Optional `layerImages` preserves owner-local recoloring when layers share a
hash. `composeCell` returns a new image, aligns all layers by stored pivot and defaults to the rig's
frame, which intentionally clips oversized layers. Pass `bakedFrame` to retain the full layer union.
The compositor does not recolor implicitly: use the returned `recolor` view as the application does.
For exported sheets and native Phaser sprites, use the existing `loadPaperdoll` / `Paperdoll` API.
The public `paletteMap` returns active RGB swaps only; colors without a selected ramp are omitted.

`sampleTimeline` clamps negative/nonfinite elapsed input to the start, loops by default and holds the
last authored cell when looping is false. Empty, nonfinite or nonpositive-duration timelines throw.
The core assumes a validated manifest, just as the existing compositor did. Application-specific
draft coverage filtering and recovery happen before rendering; the core does not schedule generation.

## Cross-engine behavior contract

Consistency means matching paper-doll results and operation semantics, not imposing JavaScript names,
renderers or loading on other engines. The engine-neutral JavaScript is authoritative for equipment,
visibility, cover selection, depth, geometry, pixels, palettes and timeline sampling. Native ports
implement those same decisions in their host language; changing JavaScript does not update them automatically.

| Operation                                    | Phaser / GDevelop                                   | Godot                                         | Unity                                    |
| -------------------------------------------- | --------------------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| Select animation                             | `play(move, direction, restart = false)`            | `play_anim(move, direction, restart = false)` | `Play(move, direction, restart = false)` |
| Change one slot                              | `equip(slot, item)`                                 | `equip(slot, item)`                           | `Equip(slot, item)`                      |
| Apply complete outfit                        | `applyPreset(idOrObject)`                           | `set_preset(id)`                              | `ApplyPreset(id)`                        |
| Change color selections                      | `setVariants(map)` replaces all explicit selections | `set_variant(material, name)` changes one     | `SetVariant(material, name)` changes one |
| Remove explicit color                        | Omit the key or use `null` in the replacement map   | `set_variant(material, null)`                 | `SetVariant(material, null)`             |
| Unequip a non-body slot                      | `null`                                              | `""`                                          | `null` or `""`                           |
| Invalid move, direction, equipment or outfit | Throws before mutation                              | Warning and `false`, before mutation          | Warning and `false`, before mutation     |
| Disposal                                     | `destroy()`                                         | Native `queue_free()`                         | Native `Destroy(gameObject)`             |

All four live controllers must preserve these behaviors:

- Selecting the active move/direction preserves its progress. Selecting a different move/direction
  starts at the beginning. Selecting a completed once-only clip replays it. Explicit `restart = true`
  starts the requested clip from its first playlist entry, even if it is already active.
- Frame lists retain authored order, repeated cells and individual durations. Loops repeat; once-only
  clips hold their final cell. Equipment, outfit and palette changes do not restart animation.
- The body cannot be unequipped. Equipment must belong to the requested slot and cannot directly
  select a baked variant. Equipped hidden items still contribute the documented hides/cuts rules.
  Hand-conflict removal in the Studio is interaction policy; exported controllers resolve visibility
  without silently removing the other equipped item.
- Applying an outfit replaces equipment and explicit colors, with the frozen body restored. Removing
  an explicit color restores its material default, not necessarily the original source colors. An
  empty-string color selection uses source colors. Linked materials follow their target selection.
  JavaScript color maps replace the selection set; native setters deliberately change one key.
- Invalid operations leave equipment, colors and playback unchanged. JavaScript exceptions and native
  warning/boolean results are intentional host-language differences, not permission to fail silently.
- Unknown material keys in JavaScript replacement maps are retained but have no visual effect; native
  one-material setters reject unknown material IDs. Unknown variant names, like empty strings, use
  source colors in all four controllers. Phaser mutators return `undefined`; GDevelop returns the doll
  for chaining. These return conventions do not change rendered results.
- Stored layer pivots and cell sizes, most-specific depth overrides, slot/role tie order, exact RGB
  swaps, alpha and source-image immutability retain the same meaning in every renderer.
- Instances keep independent equipment, colors and clocks. Disposal releases owned nodes/resources;
  Phaser's documented game-wide palette texture cache lasts until game teardown.

Generic PNG/JSON is an integration format, not a live API. Aseprite records editable layers and the
first outfit. RPG Maker resamples to its fixed sheet format. These targets must use shared decisions
where applicable, but cannot expose live operations the destination format does not support.

## Maintaining cross-engine consistency

Before changing a paper-doll behavior or public controller operation:

1. Reproduce the problem with a failing golden or exported-runtime test. Identify affected consumers
   from the operation table, including native controllers and asset-only exports where applicable.
2. Put engine-neutral behavior in the canonical modules. Keep rendering, loading, native naming and
   lifecycle in adapters. Update native ports in the same change, or document and justify why a port
   is unaffected. Do not treat matching JavaScript source as evidence of native behavior.
3. Keep this contract, the export-format specification and generated engine READMEs aligned. Record
   deliberate differences here instead of adding compatibility aliases or a universal renderer framework.
4. Run the source synchronization workflow below when canonical code or its data types change. Run
   `npm run check`, the unit suite, and affected application export/selftest E2E specs. `AGENTS.md` "Testing" maps
   areas to specs and lists the cross-cutting changes that need the full suite.
5. Run the affected native checks: `GODOT_BIN` enables `godot-export.test.ts`; the Phaser, GDevelop and
   Unity verifiers live in `app/scripts/verify-*-export.mjs` and `verify-gdevelop-engine.mjs`.
   Playback checks include repeated selection, explicit restart and completion replay; palette checks
   include restoration and owner isolation; rejected calls must preserve state and report failure.
   Preserve negative controls and test a freshly generated export, not a previously downloaded runtime.
6. Have an independent reviewer challenge the behavior, tests and intentional differences. Report
   exact engine versions and what actually ran. An unavailable native engine or skipped opt-in test
   is a verification limitation, never a native conformance pass.

Native tests are opt-in because their engines are not installed by the ordinary unit/CI workflow.
Default unit tests guard export construction and JavaScript execution; they do not replace native
GDScript/C# execution. Do not claim that every native port automatically inherits future JavaScript fixes.

Required scenario coverage lives in these existing harnesses rather than a second test framework:

| Scenario                                     | Executable checks                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shared rendering, ordering and palettes      | `runtime.test.ts`, `runtime-preset.test.ts`, `export-phaser.test.ts`, `gdevelop-export.test.ts`                           |
| Repeat selection, restart, completion replay | `verify-phaser-export.mjs`, `verify-gdevelop-engine.mjs`, native `godot-export.test.ts`, `unity-review/NativePlayback.cs` |
| Rejection atomicity and palette restoration  | Controller unit tests, native `godot-export.test.ts`, `unity-review/NativePlayback.cs`                                    |
| Portable resources and export boundary       | `export-portability.test.ts`, `export-validation.test.ts`                                                                 |

Paths in this table are under `app/test/unit/` or `app/scripts/`. Test exported runtime bytes and
native controller output; matching source text alone is not evidence of matching engine behavior.

## Maintaining exact source identity

`app/scripts/sync-runtime.mjs` generates `runtime/sources.ts`, a transport-only copy of the exact JS
source bytes. It contains no separately authored implementation. This makes exports synchronous in
the browser and keeps direct Node export scripts usable without Vite `?raw` hooks or browser `fs`.

After changing a runtime module, format that module and run `npm run runtime:sync` from `app/`.
The production prebuild refuses a stale generated transport file. Unit tests compare every canonical
module byte-for-byte, verify that the shipped module contains those bytes, import the delivered module
without Phaser or DOM initialization, and assert internal composition exports are the same functions.
Do not edit `sources.ts` by hand. Do not add independent paper-doll rules to the Phaser adapter.
The GDevelop adapter follows the same rule. A regression test edits a copied canonical timeline module,
proves the stale guard rejects it, runs the real generator, then executes the internal and delivered
modules and a GDevelop controller to verify all changed together. Separate GDevelop mutation controls
verify it executes canonical timeline, draw-list and palette decisions, rather than carrying unused text.
The generator rejects imports, export lists and default exports in canonical modules (the checks live in
`app/scripts/runtime-modules.mjs`, which unit tests call directly). Keep public
exports on named declarations so the embedded native-event form remains safe to generate.
It also checks that every line beginning with `export ` is an actual top-level export modifier,
and every such modifier uses that prefix. Misleading prefixes inside multiline strings/comments
or indented export declarations fail synchronization instead of being silently changed by embedding.
It also rejects cross-module top-level binding collisions before writing transport files, since
the delivered modules share one scope. `runtime-sync.test.ts` exercises that failure and recovery.

The same command regenerates `types.d.ts` from the existing TypeScript data contracts. Changes to those
contracts require resynchronizing the export transport as well. The prebuild checks both generated files.
This remains an explicit synchronization workflow, not a development-server watcher: after editing a
canonical module, run the synchronization command before testing an export from an already-running dev server.

Phaser and GDevelop accept either an outfit object or its exported ID in `applyPreset`. Unknown IDs
throw without changing equipment or colors. Constructors resolve the same IDs/objects. Canonical
`validEquipment` supplies the slot/item rule to setters and `resolvePreset`; malformed custom outfits
are rejected atomically. Stored presets with missing, wrong-slot or baked-variant references fail
export validation. Known stale items remain warnings and are removed from the exported outfit.
Godot's `set_preset` and Unity's `ApplyPreset` use IDs.
Native controllers can change equipment and exact stored palettes at runtime. Generic exports are
PNG/JSON integration assets, Aseprite records the first outfit's visible layers and per-frame timing,
and RPG Maker deliberately resamples a walk into its fixed step-sheet layout. Those formats do not
provide a live controller API equivalent to Phaser, Godot, Unity or GDevelop.

Exported path segments escape Windows device IDs with a leading underscore (`con` becomes `_con`)
without changing the manifest's immutable IDs. Valid IDs cannot start with an underscore, so this
cannot collide with an unescaped valid ID. Layer `sheets`/`sourceSheets` contain the resulting paths;
baked paths use the same escaping for outfit and move IDs. Display-derived Unity/Aseprite/RPG Maker
names use the shared portable-name helper. The final archive path check remains a safety backstop.

See `app/test/unit/runtime.test.ts` for source identity and independent pixel/timeline golden values;
existing mask, equipment, palette, presentation and export suites cover their established behavior.
`app/scripts/verify-phaser-export.mjs` runs pinned real Phaser engines with negative controls for broken
duration, looping, layer synchronization, pivots, masks, visibility, palettes and direction rows. It
compares every playlist frame against combined outfit sheets when those sheets are included. A ZIP
without them still receives clock checks and explicitly reports that its pixel oracle did not run.

Phaser Canvas expands each sprite by half a pixel when the camera's `roundPixels` flag is enabled.
For exact pixel comparison at integer character positions, disable that flag with
`scene.cameras.main.setRoundPixels(false)`. The native verifier does this only for Canvas pixel checks;
it does not change the application's compositor or silently modify a game's camera in the adapter.

Full application E2E is required for shared-runtime changes. See the
[implementation verification](../testing/shared-javascript-runtime-2026-11-12.md) for the exercised
workflows, real-engine results, review fixes and remaining evidence limitations.
