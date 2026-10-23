# Holodeck world feasibility

**Later decisions:** [current-design.md](current-design.md) controls interactions and effects. Characters are unlit with optional code-only reflection; no additional shadow. Live movement continues with available animation/direction fallbacks, and mobile uses a dynamic joystick. Earlier strict-coverage and unresolved-touch suggestions below are historical.

2026-10-23. Discussion and evidence only. No renderer, app change, new image, live API call or visual proof was produced for this review.

The Obsidian Holodeck direction is feasible as an HD environment containing authentic pixel characters. The current screenshots establish atmosphere and composition. They do not establish a traversable world, matching camera angles, exact character appearance, real reflections or mobile performance. Keep the direction, but approve those limits explicitly before building it.

## What the images can become

| Surface | Smallest credible treatment | Limit |
| --- | --- | --- |
| Character selection and character preview | One shared default Holodeck background, with actual sprite composites and interface elements drawn separately | A composed screenshot cannot supply reusable UI, separate reflections or character-free background pixels automatically |
| Other creator screens | A background slot for each screen, initially resolving to the shared default where appropriate | Modularity does not require a separate renderer, scene format or different picture for every screen |
| Top-down live view | Continuous world-relative floor, a fixed elevated camera and a following position; actual direction/clip artwork drives the actor | Sliding a perspective screenshot behind the actor makes its horizon, seams and illumination move incorrectly |
| Side-scroller live view | A separately composed side scene with a stable ground line, horizontally continuing floor and distant atmosphere | Cropping the top-down screenshot or rotating its sprite cannot produce this view |

Selection and preview should retain the same selected background and its decoded resource across their transition. They should not trigger a document navigation, restart the atmosphere, reload the same asset or briefly show a blank default. Loading an alternate background can finish before it replaces the current one. This is ordinary client state and asset reuse; it does not require a backend.

Treat the two live views as distinct presentations of the same Holodeck material and lighting direction. They can share source textures and the active outfit while keeping their own camera/framing and actor position. The UI stays in screen coordinates; the floor, contact effects and actor stay in world coordinates. Returning to customization restores deliberate inspection framing. There is no need to preserve an accidental offscreen gameplay location in the creator view.

**A static plate is appropriate for still creator screens. A live scene needs a continuing surface.** A seamless material can repeat without repeating the horizon. Broad illumination and distant atmosphere are separate from that material. A single photographic-looking floor tile containing a bright light pool will reveal repetition and make the lighting appear attached to the floor. The repeated material must instead be quiet and neutral enough for separate large-scale lighting. Canvas exposes repeating image patterns directly; perspective projection remains a separate rendering responsibility. [MDN: createPattern](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/createPattern).

The implementation choice can wait for the visual proof. A simple 2D treatment is sufficient for an orthographic floor and horizontal side scene. A genuinely receding plane with a camera-controlled perspective may justify a small GPU-rendered surface; this alone does not justify a game engine, full 3D character system or new dependency stack. WebGL supplies browser rendering primitives rather than requiring an engine. [Khronos WebGL specification, introduction](https://registry.khronos.org/webgl/specs/latest/1.0/).

## Preserve the real character

Round-three [provenance](../round-3/provenance.md) states that its characters are illustrative ImageGen output. On inspection, the hero's proportions, face, equipment and pose vary between customization, top-down play and side play. Those are useful mood studies, not exact views of a frozen PixelLab character. An environment image must not bake in an invented hero, shadow or reflection and then remain behind a different live outfit.

The real actor uses each character's stored body dimensions, frame dimensions and pivots, including aligned equipment and oversize held layers. Small native cells in the existing demo are examples, not a universal size limit: the current creator accepts body sizes from 32–256 px in steps of four, with 48/64/96/128 presets and a default 64 px body in an 80 px frame. HD refers to the environment here. Enlargement preserves the actual source pixels; it does not add the detail implied by a newly invented higher-resolution illustration. If that contrast looks unattractive in the proof, adjust the environment and framing before promising a different character-art pipeline.

The current code provides a useful foundation:

- [`composeCell`](../../../../app/src/lib/compose/compose.ts) resolves equipped items, hidden slots, tuck-under variants, direction/frame z order and pivot alignment into one RGBA image. `bakedFrame` includes oversize equipment around the shared pivot.
- [`Stage.svelte`](../../../../app/src/studio/Stage.svelte) already uses that union frame for previews. World rendering should consume the same dressed result, including local palettes, rather than reconstruct the wardrobe in another rendering path.
- [`Sprite.svelte`](../../../../app/src/studio/Sprite.svelte) disables smoothing and uses integer device pixels per sprite pixel. Preserve that sharpness policy for the actor while allowing smooth environment sampling. Disabling Canvas image smoothing preserves enlarged pixel edges; it does not solve every fractional-position artifact. [MDN: imageSmoothingEnabled](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled).
- [`Studio.svelte`](../../../../app/src/studio/Studio.svelte) currently advances inspection clips with a timeout. This is animation playback, not a locomotion/camera loop. Continuous movement needs elapsed-time input and rendering, with the authored clip cadence retained independently.

These are rendering findings, not a creator-workflow audit or a recommendation to change exports.

## Camera angles are constrained by sprite artwork

The round-three top-down gameplay picture shows a much more elevated floor than the customization picture while retaining a largely side-facing illustrated runner. Its believable atmosphere does not prove a matching sprite projection. Likewise, a side-facing sprite from a three-quarter top-down set is not automatically a strict side-scroller body.

Approve a specific fixed angle for each scene against an actual stored character. A three-quarter top-down view is a reasonable first target if the real frames support it. Strict overhead viewing exposes different surfaces and needs matching artwork. Side view must use frames that look correct there, with all equipped layers covering the same clips and directions. The shared pivot is an alignment reference, not a per-frame sole-contact track.

Camera following can translate freely on flat ground while the viewing pitch remains fixed. It cannot tilt/orbit freely around a flat sprite without exposing the illusion. Turning a billboard toward the camera does not invent the top of a helmet, the back of a shield or the opposite weapon hand. Neither stretching the body nor automatically mirroring a held item is an acceptable angle correction. Keep unsupported actions/views unavailable until their artwork exists.

There is also a real visual tradeoff between perfectly even sprite pixels and completely smooth apparent travel: subpixel placement can shimmer or blur, while snapping the final actor position to device pixels can produce small steps. Keep simulation and camera coordinates continuous, then judge final presentation at actual display scales in the proof. Do not assume a still image settles that tradeoff.

## Shadows and configurable reflections

| Effect | Credible first version | Accuracy boundary |
| --- | --- | --- |
| Contact shadow | Restrained soft shape at the actor's ground anchor | Grounds the actor but does not describe each boot's contact during every pose |
| Outfit-responsive shadow | Optional flattened alpha silhouette from the complete composed frame | Responds to a cape, helmet or sword, but has no true height/depth information and may look like a cutout |
| Floor reflection | Faint transformed copy of the same complete composed frame, faded into the floor, with its own softness | Keeps the visible outfit/colors current; cannot reproduce a physically correct reflected viewpoint or reveal unseen surfaces |

Use the **same current composition** for actor and approximate reflection. Equipment, palette, hides and animation must update both together; a stock shadow/reflection baked into the background would leave ghosts when the outfit changes. Anchor effects to the ground contact, including any offset between that contact and the rig pivot. Do not anchor them to the bottom of the union image, which can be extended by a sword or cape.

Reflections can be configurable without an elaborate material editor: off plus a restrained strength control is sufficient initially. The scene supplies the angle-appropriate placement/fade. Test the subtle default against off using the actual sprites. A front inspection/side view admits a simple vertically reflected approximation; a steep top-down view is much less forgiving and should use very diffuse, minimal reflection if it reads correctly at all. Do not promise the same mirror geometry in both views.

A genuine reflected camera image or geometrically correct cast shadow requires additional geometry or view-dependent artwork that the current flat RGBA layers do not contain. A 3D floor underneath them does not reconstruct that information. Keep these effects as presentation only; they must not recolor source/export pixels or imply verified lighting accuracy.

## Performance and phones

One actor, one floor and a few restrained effects are a plausible browser workload. That is an engineering estimate, not a measured performance result. HD background pixels, oversized render targets, blur and translucent passes are more likely to dominate this scene than a 64/96 px sprite.

Cache the current outfit's needed frame composites; rebuild them on outfit/palette changes, not on every camera tick. Bound the cache rather than baking every possible outfit. Reuse decoded background assets and release unused alternatives. Limit effect area to the actor where possible. A 2048 × 2048 RGBA8 image alone is 16 MiB before mipmaps, extra copies or render targets; several full-screen layers can become expensive quickly. Prefer a lower-resolution world/effect buffer on constrained devices while keeping DOM text and the actor sharp. GPU limits differ across devices, so effects and resolution need a budget. [MDN: WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

Use the animation timestamp for movement rather than assuming 60 callbacks per second. Hidden-tab animation is commonly suspended; resuming should reset elapsed time/input rather than simulate a long jump. Avoid continuous world rendering while a still screen is idle. [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).

Check phone portrait and landscape with the actual equipment region: the visible world may be much smaller than the screen. Desktop camera centering cannot simply be reused under a large bottom panel. The existing round-three contract leaves touch locomotion unresolved. A beautiful phone still does not establish usable phone play, and a hardware-keyboard proof cannot certify touch input. Reduced motion should remove unnecessary ambient movement/easing while retaining responsive locomotion.

## Smallest later visual proof

Only after the text decisions and new images are approved, build one isolated disposable scene using stored fixture frames and no PixelLab access. Keep it outside the production studio and queue. No new character generation or application-wide renderer abstraction is needed for that proof.

1. Show one real frozen character with headgear, cape and an oversize held item, assembled through the existing compositor. Compare it against the approved Holodeck image at the intended size.
2. Include the shared still background in selection/preview, then the two fixed live-view scene compositions. Switch without a document reload or losing the chosen world/outfit. The side scene is certified only if the fixture's actual side artwork is suitable; otherwise record the asset gap explicitly.
3. Hold movement through multiple animation cycles and across enough ground to expose repetition, seams and camera-follow errors. UI remains anchored. Change one item and one palette while moving.
4. Compare contact shadow, reflection off and subtle reflection using that same dressed frame. Check empty/changed equipment leaves no ghost and that oversize items do not move the ground anchor.
5. Inspect actual desktop fractional scaling and phone portrait/landscape. Measure frame time and memory on representative hardware, then decide the resolution/effect fallback. Include blur/visibility pause and reduced motion. Do not claim all-mobile performance from emulated screenshots.

The proof should answer whether the real sprite/world combination looks convincing in motion and what the mobile quality budget is. It should not add terrain, obstacles, combat, jumping, elaborate physics or a new engine architecture. If the actual sprite looks incompatible with an approved camera, resolve the art/camera decision before expanding the implementation.

## Evidence reviewed

Opened the final Holodeck customization, desktop top-down play, desktop side play and phone customization PNGs at their stored resolution. Read round-three README, gameplay contract, immersive-world research and provenance, current architecture documentation, compositor, sprite/stage rendering, and the relevant playback/state code. External links above were checked on 2026-10-23 and support browser capabilities/constraints; the proposed visual treatments and feasibility judgments are this review's inferences. No runtime benchmark was performed.
