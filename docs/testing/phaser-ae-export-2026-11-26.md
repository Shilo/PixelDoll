# Phaser AE export (2026-11-26)

The Phaser AE export (`phaser-ae/` in the ZIP) was run in the real Phaser AE engine with
`app/scripts/verify-phaser-ae-export.mjs`. No PixelLab calls were made.

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

1. The README path: the export copied into `game/pixeldoll/hero/`, `phaser-ae/assets.json` in the game manifest's
   `assets`, static imports of `paperdoll.js` and `manifest.json`, and AE's strict build gate (types, game rules,
   bundle). The build copied every listed file and the doll rendered pixel-equal to `baked/`.
2. For each world and archive: every outfit, move, direction and playlist entry against the dressed character sheets
   (exact for opaque and transparent pixels, ±1 for partial alpha); two pairs of overlapping dolls (one six units
   higher, one level at the feet) and a prop whose bottom edge is two units below a doll's feet, which must draw over
   it; the playlist clock over 48 fixed steps for every move, read from what the aggregate emits; repeat, restart,
   completion replay, turning mid-move, rejected calls leaving state unchanged, moving, scaling, hiding, teleporting and
   destroying.
3. Negative controls mutate the delivered runtime and must fail a check: wrong pivot, restart on every play, uniform
   durations, no palette, no covers, no hides, wrong direction row, turning restarts, reversed layer order, no feet
   sorting (top-down) and a looping State.

Result: 30 of 30 runs passed (8 clean runs, 21 controls caught, the README build).

## Independent review

A GPT-6.2 Sol (medium) review challenged the adapter against the kernel source and reproduced several problems in its
own native game. Fixed:

- Two top-down dolls level at their feet interleaved their layers, and per-layer depth steps let props fall between a
  doll's layers. Moving dolls also drifted apart for one frame when a layer changed, because each sprite interpolated on
  its own. A doll is now one roster object (`doll.actor`) made an aggregate that emits every layer around one
  interpolated pivot, which also gives games a stable handle for camera follow, picking, collision and tags.
- Per-step rounding moved frame boundaries at other fixed step rates (120 Hz ended a 1000 ms clip a step late). The
  clock now sums raw steps and samples with a 1 µs tolerance.
- A full-body `playAction` on a doll with no move reported "full" but drew nothing; it now draws.
- A headless replay, which fetches nothing, could not load the manifest; `loadPaperdoll` now takes the statically
  imported manifest. The whole preparation is tracked, failures name the file, and the cache key includes the base URL.
- `paperdoll.d.ts` typed the game as `unknown`, omitted `completed` and claimed untyped helpers; it now types the
  kernel surface the doll uses, `completed`, `actor`, `alpha` and `tint`, and the README no longer lists untyped helpers.
- The README and the Studio description overstated "no upload or Pro"; they now call this a local manifest `assets`
  integration and name Phaser's Pro `upload` route as the hosted one, which this export does not use.

Earlier fixes from the first native runs: a doll defaulted to the world's backdrop layer (it now uses `world`), and
summed steps showed frames late on exact boundaries.

## Not covered natively

- Moving-attack layering (`playAction` with precut fragments) and the headless manifest path ran only in
  `test/unit/export-phaser-ae.test.ts` against a stub kernel: the shared archives have no action layers.
- WebGPU rendering, wrapping worlds and grids larger than an atlas page (AE then gives a grid its own texture).
- Exact recolors of translucent pixels go through a canvas round trip; they matched within ±1 on WebGL2 only.
- Publishing to phaser.io with files from the manifest `assets` list, and AE's `npm run -s play` tool (its half-size
  viewport cuts off a `fixed` screen larger than it; games normally use `letterbox`).
