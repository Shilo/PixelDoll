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

Add runtime behavior to the canonical JavaScript modules, not the TypeScript facades. Existing
application entry points preserve caller interfaces; direct canonical imports are appropriate for
other engine-neutral modules. Phaser's public `z()` and `layerOf()` convenience methods remain available.

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

## Maintaining exact source identity

`app/scripts/sync-runtime.mjs` generates `runtime/sources.ts`, a transport-only copy of the exact JS
source bytes. It contains no separately authored implementation. This makes exports synchronous in
the browser and keeps direct Node export scripts usable without Vite `?raw` hooks or browser `fs`.

After changing a runtime module, format that module and run `npm run runtime:sync` from `app/`.
The production prebuild refuses a stale generated transport file. Unit tests compare every canonical
module byte-for-byte, verify that the shipped module contains those bytes, import the delivered module
without Phaser or DOM initialization, and assert internal composition exports are the same functions.
Do not edit `sources.ts` by hand. Do not add independent paper-doll rules to the Phaser adapter.

The same command regenerates `types.d.ts` from the existing TypeScript data contracts. Changes to those
contracts require resynchronizing the export transport as well. The prebuild checks both generated files.

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
