# Phaser AE export (2026-11-26)

The Phaser AE export (`phaser-ae/` in the ZIP) was run in the real Phaser AE engine with
`app/scripts/verify-phaser-ae-export.mjs`. No PixelLab calls were made.

## Setup

- Engine: Phaser AE v3-82bf126, kernel 3.0.0-2, installed by `npx -y @phaser-ae/cli blank` under a free (basic)
  phaser.io account. The engine is not public on npm, so the verifier is opt-in and takes that game folder (`--game`).
- Browsers: headless Chromium, where AE's render-auto falls back to WebGL2, and headed Chromium on an NVIDIA Ampere GPU,
  where it picks WebGPU (its default). `--renderer webgl2|webgpu` asserts the backend the game chose; headless
  Chromium on this machine cannot create a WebGPU device.
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

Result of the first design: 30 of 30 runs passed (8 clean runs, 21 controls caught, the README build).

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

## Three-way review

A Claude Opus (medium) reviewer and a second GPT-6.2 Sol (medium) reviewer each challenged that design in their own
copies of the engine; the coordinator merged both lists into decisions and both reviewers challenged those before any
change. Agreed and implemented:

- The actor owns the transform. Both reproduced that a doll kept a second position, so moving it undid collision pushes
  and broke wrapping, and that tint, alpha, scale and rotation set on the actor never reached the layers. `doll.x/y`
  are now derived from and written to the actor; emit reads the actor's interpolated position, `sx`, `sy` (a sign flip
  mirrors without interpolating), rotation, alpha and tint (`#rrggbb` or `#rrggbbaa`). The top-down feet correction
  follows the live scale every frame. `options.box` sets the actor's box and pivot.
- `doll.actor` is typed `ReturnType<G['spawn']>` on a generic `Paperdoll<G>`: the game's own `Sprite` with every
  composed pack's fields, so `game.rig.follow(doll.actor)` and pack fields build in strict mode.
- Exact recolor lookups: both measured canvas readback changing the RGB of translucent pixels (Opus: 794 of 1270), so
  exact palette entries missed. The app's PNG decoder moved into the canonical runtime (`png.js`) and recolorable sheets
  are decoded from their bytes. A translucent-palette archive (alpha 64, 128 and 192) now matches within ±1, and a
  canvas-readback control misses by 38 levels.
- Retries: a corrupt 200 response stayed cached by key and URL; failed files are now refetched with a cache-busting
  query and stable keys, and errors name the file. Every sheet is size-checked and registered in a fixed order.
- Clock: a clip started inside a step renders from zero whichever step runs first (stamped with `clock.frame`), each
  doll's step is named after its actor, and looping clocks wrap so long sessions keep the 1 µs tolerance.
- Lifecycle: a killed actor (game code, collision or scene exit) stops its doll; `alive`; idempotent `destroy()`.
- Draw records are rebuilt only when pose, equipment or colors change; emit wraps with the view the gather passes, and
  only on world layers. The first outfit's palette grids (and any in `options.prepare`) are built at load.
- README and agent doc: copy only `manifest.json`, `phaser-ae/` and the listed sheets, share the loaded manifest
  through a `hero.ts` module, the actor id is `pixeldoll-1`, integer pivots for crisp stills, MIT runtime versus
  Phaser's engine license, placeholder ids.

Deferred at the time and fixed later the same day (commits 518a8eb09 and 92f477cc9): a layered action showed the full
action while the gait faced away and returned to layered when it faced back, in every player, and the Phaser 3/4
adapter read its palette source through a canvas, so its exact lookups missed translucent pixels too. No view culling: layers may extend
past the actor box, and 200 dolls sync in about 1.1 ms per step.

A third round had both reviewers re-run their repros against the implementation. No regressions; fixed from it:
rotation now enters the pivot accessors, teleport and feet sorting (Sol: a 90° turn drew the pivot 34 px from where it
read); sheets larger than 4096 px decode (the cell decoder's cap); an empty download in a browser is an error, not blank
frames; one load reports every bad file and closes every bitmap, and a retry refetches only what failed; a later
loadPaperdoll call's `prepare` is honored; `cancelAction()` redraws at once; colors are prepared only for an outfit's
shown items; and `Paperdoll<typeof game>` keeps the Sprite type on a stored doll (the default actor type is a minimal
handle).

The verifier then ran 41 of 41: 11 clean runs (four archives plus the demo export in side-on and top-down worlds, and a
wrapping world) with the strict `hero.ts` README build (including a stored `Paperdoll<typeof game>`), solid-wall
collision, step order, killed actors, corrupt-then-corrected retry, actor tint and alpha, a turned and stretched actor
and a seam crossing, and 29 negative controls, including canvas-readback recoloring, a missing dead-actor check, a
missing step-order stamp and an unturned pivot.

## Not covered natively

- Moving-attack layering (`playAction` with precut fragments) and the headless manifest path ran only in
  `test/unit/export-phaser-ae.test.ts` against a stub kernel: the shared archives have no action layers.
- Grids larger than an atlas page in the verifier itself (the Opus reviewer forced them with
  `"atlas": 256` and saw the same pixels).
- Exact recolors of translucent pixels go through a canvas round trip; they matched within ±1 on WebGL2 and WebGPU.
- Publishing to phaser.io with files from the manifest `assets` list, and AE's `npm run -s play` tool (its half-size
  viewport cuts off a `fixed` screen larger than it; games normally use `letterbox`).

Final run on both backends: 41 of 41 on WebGPU (headed) and 41 of 41 on WebGL2 (headless), pixel-exact against
`baked/` with every negative control caught.
