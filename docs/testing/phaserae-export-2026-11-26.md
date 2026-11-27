# Phaser AE export (2026-11-26)

The Phaser AE export (`phaserae/` in the ZIP) was run in the real Phaser AE engine with
`app/scripts/verify-phaserae-export.mjs`. No PixelLab calls were made.

## Setup

- Engine: Phaser AE v3-82bf126, kernel 3.0.0-2, installed by `npx -y @phaser-ae/cli blank` under a free (basic)
  phaser.io account. The engine is not public on npm, so the verifier is opt-in and takes that game folder (`--game`).
- Browser: Playwright headless Chromium, WebGL2 (AE's WebGPU path was not available headless on this machine).
- Worlds: the default side-on world (`core-2d`) and `world-topdown`, a 1024 × 1024 fixed screen with `pixelArt: true`
  and a plain clear color (AE's background packs dither, which would hide one-step pixel errors).
- Archives: the three synthetic archives shared with the Phaser 3/4 verifier (`scripts/export-review-fixtures.mjs`:
  nonuniform and repeated playlist entries, play-once clips, eight directions with mirrors, oversize and translucent
  layers, covers, hides, depth overrides, palettes, a State) and the Studio demo export (`--zip`).

## What ran

1. The README path: the export copied into `game/pixeldoll/hero/`, `phaserae/assets.json` in the game manifest's
   `assets`, a static `import` of `paperdoll.js` and AE's strict build gate (types, game rules, bundle). The build
   copied every listed file and the doll rendered pixel-equal to `baked/`.
2. For each world and archive: every outfit, move, direction and playlist entry against the dressed character sheets
   (exact for opaque and transparent pixels, ±1 for partial alpha), engine draw depths in draw-list order, two
   overlapping dolls (the front doll must cover the back one), the playlist clock over 48 fixed steps for every move,
   layer synchronization, repeat/restart/completion replay, turning mid-move, rejected calls leaving state unchanged,
   moving, scaling, hiding, teleporting and destroying.
3. Negative controls mutate the delivered runtime and must fail a check: wrong pivot, restart on every play, uniform
   durations, no palette, no covers, no hides, wrong direction row, turning restarts, reversed sprite pool (side-on),
   no feet sorting (top-down) and a looping State.

Result: 29 of 29 runs passed (8 clean runs, 20 controls caught, the README build).

## Fixed during verification

- Two overlapping dolls interleaved their layers in side-on worlds, because each layer's depth step could outrank
  the other doll. Sprites are now a pool spawned in draw order, so AE's z-then-spawn order keeps each doll whole.
- Summed 1/60 s steps reach 199.999… ms, showing a frame one step late on exact boundaries. The clock is rounded to
  a microsecond.
- A doll on the world's first layer drew under the backdrop; it now defaults to the `world` layer when the world has one.

## Not covered natively

- Moving-attack layering (`playAction` with precut fragments) ran only in `test/unit/export-phaserae.test.ts` against a
  stub kernel: the shared archives have no action layers.
- WebGPU rendering and AE's `npm run -s play` tool. `play` opens a half-size viewport, so a `fixed` screen larger than it
  is cut off in its shots; games normally use `letterbox`.
- Publishing to phaser.io, which copies the same `dist/` the build produces.
