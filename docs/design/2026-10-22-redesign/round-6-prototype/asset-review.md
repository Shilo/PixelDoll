# Isolated playable proof: asset and rendering review

2026-10-23. Offline review for the authorized prototype; no production integration, generation or token access. Only this review document was written. Parent owns implementation.

## Verified fixture facts

Loaded `app/public/fixtures/s2` through the real [`loadFixture`](../../../../app/src/lib/compose/fixture.ts), decoded its PNGs and inspected resulting coverage. The JSON alone is insufficient: sheets can contain entirely empty direction rows.

| Property | Actual S2 fixture |
| --- | --- |
| Native frame | 64 × 64 |
| Rig pivot | x=32, y=64, pixel-edge coordinates |
| `bakedFrame(manifest)` | `{x:32,y:64,w:64,h:64}` |
| Directions | South, east, north; west is an authorized mirror of east |
| Walk | Eight cells, playlist 0–7, 100 ms each; 800 ms loop |
| Cross-punch | Six cells, playlist 0–5, 100 ms each; 600 ms loop |
| Actual punch coverage | Body and available equipment: south only |
| Idle / original rest | No Idle clip; no `rig.rest` |
| Geometry metadata | No `rig.anchors`, no `rig.view`, no layer-specific cell/pivot |
| Oversize equipment | Not present in this fixture; its sword also inherits 64 × 64 |

Walk has eight visible cells in every cardinal direction for the body, vest, cape, hair, steel helmet and sword. **Wizard hat has south/east/west Walk, but no north Walk and no punch.** This supplies a real, offline missing-equipment case for the approved resolver: north movement continues with the body; the hat remains equipped but is hidden for that sequence, with one deduplicated explanation, then restores when compatible. Never make the body change direction to accommodate the hat.

These observations describe this legacy bundled demo, not supported production character sizes or new allowed generation routes. Its stored `source.mode='template'` is historical provenance; it is not permission to generate new template assets.

## Simplest faithful animation/equipment path

Use the existing compositor as the authority, with a direct fixture load and isolated in-memory outfit:

```text
loadFixture(read fixture files)
  → preset[0].items, edited locally
  → optional explicit recolor(project, chosenVariants)
  → composeCell(projectView, visibleCompatibleItems, clip, direction, cell, bakedFrame)
  → reusable native-size canvas / cached image
  → nearest-neighbor actor draw
```

[`composeCell`](../../../../app/src/lib/compose/compose.ts) already handles foreground/background splitting, z overrides, hair tucking, hiding, authorized mirrors and pivots. [`loadFixture`](../../../../app/src/lib/compose/fixture.ts) performs the necessary split for cape/hair/sword, so drawing the seven original PNG sheets in a naive slot stack is not equivalent. Use its resolved result rather than reproducing this logic in prototype rendering.

For an isolated static page, an offline preparation step can import those TypeScript modules with the existing Node runtime and emit compositor-produced pose atlases for the small demonstrated outfit set. If the prototype entry is compiled by existing Vite, import the pure modules directly and cache poses on equipment changes. Choose one approach; a new engine or build dependency is unnecessary. Do not precompute arbitrary outfit combinations without a need.

Avoid [`openSource`](../../../../app/src/lib/dress/project.ts) and Studio state for this proof: they reach the user's saved IndexedDB dress state, and Studio additionally calls `splitBase`, which introduces region-marking color nudges. Direct `loadFixture` reproduces round-five source art without those unrelated application effects. Do not mutate the source fixture or write app storage.

Use one elapsed-time presentation clock and authored playlist durations. Facing changes carry phase within Walk. Stopping chooses a deterministic valid still frame in the retained direction, with equipment from that same Walk cell; do not keep cycling Walk while stopped, invent Idle or claim an original rest pose exists. Preview may deliberately play the actual Walk clip. Keep cross-punch as explicit Preview playback if included, not an automatic movement fallback. Apply the already approved [resolver](../round-4-discussion/animation-resolver.md), including intentional reduced directions and the distinct missing-coverage cases.

Do not copy round five's per-image occupied-pixel crop into an animation loop. Bounding boxes change by frame and direction; centering each crop makes the body and floor contact jitter. Keep the 64 × 64 frame and pivot. A fixed crop spanning the entire sequence is also valid if its offset is retained. At integer device scale k, place the native frame at `groundX − 32k, groundY − 64k`. The frame's bottom edge is a useful fixed demo ground anchor, not a measured sole-contact track for every possible character.

## Exact pixel preservation and reflections

All 32 default Adventurer Walk composites were assembled offline. No visible composite color fell outside the decoded fixture palette. This checks compositor source-color preservation, not final browser display scaling. The original fixture itself already contains historical palette nudges; preserve its stored pixels rather than trying to reconstruct earlier API outputs.

Draw the actor at full opacity, without filters, blend modes, theme tint, new lighting, shadows or glow. Preserve existing painted shading. Use nearest-neighbor scaling and integer device-pixel placement/scale where practical; evaluate fractional display scaling rather than assuming CSS pixels equal physical pixels. Render atmosphere/scrims behind the actor, and do not put a global theme gradient over its pixels. Intentional palette editing can use the existing exact-ramp `recolor` path independently.

Optional reflection is a **code-only scene configuration**, with no interface toggle/slider. Reuse the current complete dressed frame, reflect about its ground anchor and fade below the feet; keep actor draw state separate so reflection opacity/compositing never leaks onto it. Reuse the effect surface instead of allocating a new canvas every animation tick. It is a subdued raster approximation, not an alternate physical view. The approved stills used a faint Preview reflection; enable other scene reflections only where the proof supports them. Missing/changed gear must update reflection immediately. Do not add a contact shadow: the current approved design expressly excludes new actor shadows.

## Smallest ground/camera strategy

Keep selection and Preview on the same retained stage asset; screen switching changes controls/actors without reloading that asset. Keep actor state, outfit and theme independent of the screen's background choice. Retain separate positions for the two live views and restore deliberate Preview framing.

For live scenes, use continuous world coordinates for actor and camera. Render material/seams from those coordinates, with the camera following inside the unobscured world region; UI stays anchored. A perfectly actor-centered camera still needs floor movement cues. Tiny screen-space shifts of an otherwise static plate do not demonstrate a continuing world.

The smallest credible Canvas treatment is a repeating quiet material surface with projected world-coordinate seams and separate distant atmosphere. Top-down uses a fixed elevated ground projection; side view constrains motion to one horizontal ground axis. A fixed-camera ground projection can be implemented without a game engine. A textured GPU plane is another option, but do not introduce that stack merely to move a single actor. Avoid two competing grids: if projected seams supply motion, do not leave a second stationary seam pattern visible underneath. Material repetition, seams, horizon and actor ground position must agree.

Do not wrap the complete generated perspective PNG as a tile. Its vanishing point, baked illumination and seams are neither seamless nor translationally correct. Existing plates can supply stationary atmospheric distance; the moving ground must replace their foreground rather than visibly sliding the whole room. If a sampled material patch is used, check seam tiling and remove any baked grid/light pool that exposes repetition. For this empty proof, convincing restrained surface motion matters more than dense procedural detail.

Inspected `porcelain-stage.png`, `porcelain-side.png` and `porcelain-topdown.png` directly. **The old Porcelain side asset has tall wall/rib forms; it does not match Preview's open atmospheric space.** Honor the user's correction: use Preview's open pearl air/light as the side scene's distance, with a lower horizontal ground composition and matching ceramic material. No pillars, panel wall, platforms or extra props. Cropping the old ribbed plate does not reliably remove that enclosure. The actual east/west demo frames can represent side movement, but do not claim a separately generated strict side-camera rig.

## Focused verification for the parent

- Eight-cell Walk repeats at 800 ms regardless of display refresh, without restart on each direction/input update; release shows a real still frame.
- Helmet/none, cape and sword changes preserve pivot/animation; wizard hat hides only on unsupported north Walk and restores on south/east/west.
- Original opaque actor RGB remains exact across Obsidian/Porcelain, reflection enabled/disabled and all three scene modes. Check actor pixels independently of background/effect pixels.
- Held movement crosses repeated material boundaries without seams jumping, camera hitting a finite image edge or a horizon scrolling vertically as a texture tile.
- Selection↔Preview uses the retained shared asset; live views retain outfit/theme while changing camera/scene. Porcelain side remains open like Preview.

Evidence: current fixture JSON/sheets and compositor/rig/dress modules, round-five render source/provenance and three Porcelain environment PNGs, current approved design/resolver. No runtime frame-rate, touch interaction or browser screenshot test was performed by this review.
