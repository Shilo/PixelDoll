# External mounts and the paper-doll API

Date: November 16, 2026. Decision: recipe first; no new runtime API or Studio feature approved.

Tracking: [Plan external mount integration for the paper-doll API](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=306865333).

## Recommendation

**Later qualification evidence:** the [runtime occlusion probe](runtime-occlusion.md) identifies rider partitions as a concrete possible extension when a mount must appear between legs. It keeps the mount renderer host-owned, tests a naive skeleton-mask baseline and distinguishes correct runtime occlusion from generating seated anatomy. This is not approval to implement the proposed API.

**Keep mount artwork, movement and seat motion outside PixelDoll. First demonstrate an external mount carrying the existing dressed rider with existing export operations. Do not add a Mount equipment slot, procedural posing API or attachment subsystem yet.** A ghost mount is a useful qualification fixture, not sufficient reason to create a public API.

The useful distinction is between three problems:

1. **Where the dressed rider is drawn:** host-engine parenting or copying a seat marker's position already solves this.
2. **What the dressed rider looks like:** valid ride, sit or standing frames and matching equipment solve this. A transform cannot manufacture them.
3. **What overlaps what:** a mount rear/rider/mount front sandwich solves some designs. Interleaving limbs requires suitable split artwork and a stronger rendering contract.

Mounting belongs in paper-doll integration guidance, but not every part belongs in its runtime. If an offline proof exposes a repeated, genuinely missing rider operation, add only that operation through the shared-runtime parity workflow. A reviewed rider-seat lookup is a more plausible small extension than a mount registry or a built-in bounce function.

This narrows the [earlier Mount-selector proposal](README.md#recommendation): a selector could eventually make sense in a complete mount-authoring feature, but is unnecessary for the user's newer, external-mount-only scope. No implementation, paid generation or new feature card is authorized by this plan.

## What is already available

Local source inspected at `fa1e9b3fb0642cdf5be841d1015a426197966763`, with working-tree documentation changes only:

- [Canonical compositor](../../../app/src/lib/runtime/paperdoll.js), `drawList`, `cellImg`, `composeCell`: equipment selection, masks, ordering, mirroring and pivot-aligned pixels.
- [Timeline sampling](../../../app/src/lib/runtime/timeline.js): authored durations, looping and held final cells. It returns a source cell, not a mount phase or timeline-entry identity.
- [Rig metadata](../../../app/src/lib/rig/rig.ts), `RigAnimation`, `AnchorTrack`: named directions, per-move coverage, pivot and optional authoring anchors. `hip` already exists; do not invent another anatomical anchor merely because a seat is needed.
- [Anchor construction](../../../app/src/lib/rig/freeze.ts), `anchorTracks`: estimates refined against frozen frames. An estimated hip is not automatically a reviewed saddle-contact point.
- [Phaser export](../../../app/src/lib/export/phaser.ts): the public `container` carries the layered rider; `play` selects a move and direction.
- [Godot export](../../../app/src/lib/export/godot.ts): a `Node2D` root carries the sprites; generated guidance describes root scene ordering.
- [Unity export](../../../app/src/lib/export/unity.ts): the generated rider root receives a `SortingGroup`.
- [GDevelop export](../../../app/src/lib/export/gdevelop.ts): the controller exposes shared `x`, `y`, `layer` and starting `z`. This is multiple native sprites with coordinated positions/ranks, not one automatic sorting-group node.

The first three engine roots can be moved through normal scene transforms. GDevelop's controller coordinates its sprites. Image-only exports have no live attachment controller; the consuming game must supply one. Existing operations and limitations are defined in the [cross-engine contract](../../architecture/javascript-runtime.md).

**Do not change the character's stored pivot to make it sit.** Keep body, oversized held layers and exports aligned to their existing common pivot. Position a wrapper/root relative to a reviewed seat location instead.

## Evidence and its limits

The [game-by-game research](README.md#1-what-the-games-actually-do) covers UO/ClassicUO, Graal, OTClient, Terraria/tModLoader, historical Stardew, Pokemon Emerald, RPG Maker and LPC riding. It establishes several mechanisms, not a survey of every game or proof of all projections:

- ClassicUO's traditional equipment animation supports common riding groups and mount offsets. Its procedural chair sitting is separate from riding.
- Historical Stardew and Pokemon Surf show rider placement tied to mount animation without runtime skeletal deformation.
- Terraria exposes mount passes and rider offsets. Graal and LPC demonstrate constrained action-pose reuse; reuse does not guarantee arbitrary clothing fits.
- Vehicle-only presentation can hide the rider entirely. That is a valid vehicle design, not a visible-rider solution.

Official engine documentation independently confirms that transforms, point tracks and sorting already have host-side solutions [E1-E5]. This is why adding `bounce()` to PixelDoll is not the first recommendation. Source inspection does not qualify PixelDoll ride artwork, generated poses or real-engine mount playback.

## The smallest external integration

The host owns a mount clip and a seat point in that clip's local coordinates. It chooses a supported rider pose and facing, positions the whole dressed rider at the seat, and supplies optional foreground artwork. PixelDoll still resolves the outfit normally. Neither the manifest nor the paper-doll compositor needs to load a mount image.

```text
host mounted-actor root, located/sorted at mount ground contact
  external mount rear artwork
  rider wrapper, positioned from external seat minus rider contact offset
    existing PixelDoll rider, normal equipment and palette resolution
  external mount foreground artwork, if needed
```

This is logical draw order, not identical scene-tree semantics in every engine. The foreground must sort above the entire rider's internal rank range, not simply have depth 1. Phaser containers draw their children in list order; Unity sorting groups isolate internal ordering; Godot relative Z and Y-sort require deliberate setup; GDevelop needs reserved consecutive ranks [E1-E4]. A parent transform alone does not guarantee correct occlusion or world sorting.

### Contact position and motion

For an unrotated, unscaled pixel-space example:

```text
rider origin in mount space = mount seat - (rider contact - rider pivot)
```

If the rider pivot is `(24, 60)`, its reviewed contact is `(24, 34)`, and the current mount seat is `(100, 50)`, place the rider origin at `(100, 76)`. Moving the seat to `(100, 49)` moves every rider layer up by one pixel. The numbers are illustrative, not measured anatomy.

Both contact and pivot in this example use the same continuous pixel-edge coordinate convention. Existing rig anchors are pixel indices while pivots are pixel-edge coordinates; define the conversion explicitly before using them. Do not subtract the two conventions blindly. Layer padding and atlas trimming must preserve the same reference frame. If transforms are involved, transform the contact offset into the seat's coordinate space before subtraction. Begin with matched pixel scale and translation only, not arbitrary rotation, skew or rescaling of pixel art.

The host samples the mount's seat from the **same displayed frame/state** as its artwork, then applies that position once. A separate sine-wave bounce or wall-clock timer can double the motion or drift. The ghost fixture may use a deliberately authored bob track to illustrate this, but real mounts need their own contact motion.

Do not move physics, collision, the world-sort key or the ground shadow with the rider's bob. Their reference is the host mounted actor's ground contact. Local rider bob is a rendering offset, not travel or elevation. Game-specific jump/elevation behavior remains host policy.

### Pose and timeline ownership

Start with one still ride pose per supported direction. No rider gait clock needs synchronization; only mount artwork and its seat track do. Test existing standing/action poses for boards and enclosing mounts. An open saddle generally needs reviewed straddling art and corresponding garment coverage.

If a later rider cycle visibly leans, rises or pedals, it needs both a sampled pose and a contact point for that same pose. The host should supply one authoritative phase or time to sample both actors. Source cell numbers need not match: one mount can have six frames and the rider two. Repeated source cells, nonuniform durations, stop/start transitions and nonlooping clips make frame-number matching insufficient. Do not call `play(..., restart=true)` each update to simulate seeking.

The canonical compositor already accepts explicit cells, but native controller `play` operations do not establish a portable externally driven frame-sampling API. Native seek primitives exist [E6], but calling one body sprite's seek method is not proof that all equipment, palettes and depth updates remain synchronized. Add an explicit sampling/seek operation only after a real animated-rider case demonstrates the gap, with a specified time unit, loop/clamp and transition policy.

For example, Phaser documents `setProgress` as frame-based rather than duration-based, while Godot's `set_frame_and_progress` sets a frame and progress within it [E6]. Neither can simply be equated with elapsed-time phase when frame durations differ. This is a concrete reason to specify shared sampling semantics before exposing a cross-engine sync method.

### Occlusion and lower-body behavior

Begin with external rear/front art and the existing complete rider between them. This can support deliberately designed saddles or enclosing forms without teaching PixelDoll what a horse is. It cannot place an indivisible body image both behind and in front of the mount.

Do not infer semantic limbs from equipment slots: boots may contain both feet, and a body layer may contain both legs. `drawList` exposes equipment draws, not anatomical segmentation. `baseCut` removes base-body pixels, not all clothing. A lower-body cutoff can leave floating trousers, capes or weapons. A host-side whole-rider mask is a restricted art technique, not a general pose generator; engine masking rules also differ [E1].

A lower-body animation parameter cannot create bending or garment folds absent from the frames. Prefer a reviewed pose change. Only consider split-limb art, external occluder channels or partial-body animation after recording a case that fails the simpler contract. Those are substantially larger features, not free extensions of anchoring.

## Directions and projections

**Direction count and camera projection are different axes.** Eight views do not automatically mean isometric. A four-direction character can also have diagonal screen-space views. Match actual art and contact geometry, not just direction labels. PixelDoll currently records side, low-top-down or high-top-down view metadata, not an explicit isometric projection contract. This plan does not add one.

| Case                   | Minimal workable presentation                                   | Required challenge                                                                                                                        |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| One authored direction | One rider pose, one mount view and one contact placement        | Works only while the game constrains facing; not a free full-turn solution                                                                |
| Two directions         | Two reviewed views or one explicitly accepted mirrored pair     | Left/right is common in side-scrollers but not the definition of two directions; review weapons, reins and contact after mirroring        |
| Four directions        | Pose, seat and front/back treatment for each allowed view       | A convincing front view does not validate exposed side legs; avoid using a different perspective for the mount                            |
| Eight directions       | Matching diagonal artwork and contacts as well as cardinals     | Do not synthesize a diagonal by rotating pixel sprites or blending neighboring images; validate diagonal overlap and asymmetric equipment |
| Side-scroller          | Side-view seat, stable ground line and local vertical bob       | Speed is not a pose; jumping, leaning, landing and bikes may require new rider actions                                                    |
| Top-down               | Contact and foreground patch vary with view                     | South-facing neck overlap may differ from north; width and visible legs change by direction                                               |
| Isometric or oblique   | Matched view angle, foreshortening and projected ground contact | Screen Y bob is not world height; host projection, elevation and sorting must be explicit                                                 |

Use the intersection of **reviewed rider-pose coverage and mount coverage** for allowed facings. A host can deliberately constrain an eight-view character to four compatible mounted facings. It must not silently show an east-facing rider on a north-east-facing mount. A missing direction can disable that presentation or map the entire mounted actor to an approved common facing, not independently choose nearest views.

Select facing, rider pose, contact, mount frame and overlap rules together before drawing. Resolve mirrored views using the same convention as the displayed artwork, exactly once. Parent mirroring plus already-mirrored rider assets can flip twice. Do not mirror asymmetric equipment or extrapolate unreviewed anchor tracks merely to complete a checklist.

The matrix is an engineering qualification plan, not evidence that PixelDoll already supports native one/two-direction authoring or every projection. The existing game's available/exported views still govern.

## API options and objections

| Option                                                    | Benefit                                                     | Objection                                                                                        | Decision                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Host integration recipe, existing API                     | No new runtime state; directly compatible with external art | Host still supplies contact placement and renderer-specific sorting                              | First choice                                                    |
| Optional reviewed rider-contact data                      | Reuses a body's contact placement across compatible hosts   | Hip estimates are not seat quality guarantees; precision, mirroring and coverage must be defined | Consider only if the proof repeatedly needs manual body fitting |
| Small anchor lookup or explicit frame-sampling helper     | Can remove proven cross-engine duplication                  | New semantics, missing-data behavior and native parity are real maintenance costs                | Add only the independently demonstrated missing operation       |
| Mount-specific runtime with bob, gait and occluder schema | Convenient if building a complete mount toolkit             | Duplicates host animation/scene systems and expands scope to art segmentation and timing         | Reject for this scope                                           |

An attachment API should not be justified merely by potential reuse for nameplates, effects or furniture. A concrete failing integration is sufficient reason to investigate a small shared capability; speculative generality is not. Conversely, do not demand an arbitrary number of use cases when one essential, reproducible paper-doll operation is genuinely missing.

If a rider-contact extension is justified, prefer existing rig/manifest structures where their meaning is adequate. Review a fixed contact per direction for a still pose before adding per-cell tracks. Store rider-side data only; leave mount seat tracks with the mount. Specify an error or unsupported result for missing/unreviewed coverage, not a silent center-of-image fallback. Do not publish proposed method names as an implemented API.

Asset-only exports can carry documented contact data or baked pixels if later approved, but cannot promise live API operations. Do not put mounts into equipment manifests just to make one demo load conveniently.

## Should the application include a ghost preview?

**Potentially, after an external proof; not as a normal equipment slot now.** The user task is checking whether a dressed pose can ride something, not dressing a mount. A contextual riding preview beside animation inspection is more honest than presenting the ghost as a generated owned item.

The fixture should be locally authored, license-safe external artwork. It supplies a seat, ground point and optional front patch just like a consuming game would. No PixelLab request is necessary to move or bob it. It must use the public rider compositor/controller behavior rather than special-case only the naked base.

The Studio is a host scene in this arrangement. It may draw external objects around the rider without making those objects part of the paper-doll runtime. Dogfooding means shared rider selection, timing and composition semantics, not embedding Phaser's game lifecycle into the Svelte app or inventing an editor-only attachment effect and claiming exports reproduce it.

Start with a default fitted fixture and existing pose choice, play/pause and view switching. Do not add a mount editor, bone controls, bounce sliders, procedural-leg options or persistent Mount inventory without demonstrated need. Expose the fitting boundary and unsupported directions. Honor reduced motion and the existing explicit consent for paid pose preparation. This is a proposed UX boundary, not validated usability or implementation approval.

## Phased plan and stop conditions

Only this research/documentation phase is executed. The following are proposals for separately approved work, not new implementation tasks.

### 1. Prove existing integration before extending it

Use stored dressed frames plus a locally drawn placeholder. Include an open saddle and an enclosing/platform form. If no usable riding pose exists, compare a manually edited reference and record that actual wardrobe ride coverage remains unproven. Do not spend credits or call a pose API automatically.

Demonstrate one still rider on two differently shaped, compatible mount fixtures using only host position, facing and ordering. Repeat with plain clothing, boots, a long robe/cape and an asymmetric held item. Begin with side and front/back views; test diagonals only where matching art exists. Include an oversized weapon so fitting does not accidentally depend on equal image bounds.

Acceptance: changing fixtures requires no rider/wardrobe regeneration; the agreed contact remains aligned to the exact intended pixel after the host's documented snapping; equipment, colors and padding behave normally; world sorting/shadows do not bob; every claimed facing is reviewed. A deliberate one-pixel wrong offset and wrong foreground order must visibly fail the comparison. Do not claim four/eight-view qualification from a side-view-only result.

**Stop and ship guidance if existing operations suffice.** If only seated art is missing, document an art/pose prerequisite rather than add runtime methods. If the simple sandwich fails, preserve the failing pixels and garment combination before proposing segmentation.

### 2. Decide whether a ghost preview earns application space

Use the same external fixture and integration rules in a small bounded preview only after step 1. Check that changing outfit, direction and pose updates the whole rider; show incompatible combinations rather than conceal them. Compare the result with the external example, including pause/step and reduced motion. No hidden special renderer, no paid action on mount selection.

**Go** only if the preview answers a useful fitting question that ordinary animation inspection cannot. **Defer** if it mostly shows a bouncing standing character without helping produce valid ride art, or implies export capabilities the host recipe cannot reproduce. An external developer example can be the final deliverable without a Studio feature.

### 3. Add only a measured API gap

If body contact placement is repeatedly duplicated, evaluate reviewed rider-side contact metadata/lookup. If an animated rider demonstrably needs external phase control, evaluate deterministic explicit sampling separately. If interleaving is essential, treat split artwork/rendering as its own scope instead of slipping it into an anchor helper. None of these prerequisites implies the other two.

Any runtime extension must follow the [canonical-source and native parity workflow](../../architecture/javascript-runtime.md#maintaining-cross-engine-consistency). Cover fractional times, nonuniform/repeated cells, exact loop boundaries, explicit mirroring, absent coverage, transformed/padded layers, equipment changes and rejected-call state preservation. Verify native adapters with actual engines and independent expected pixels, not only shared-source comparisons. Document what image-only exports can represent. No new universal scene graph or mount asset schema is required merely to deliver one operation.

## Independent challenge and reconciliation

Claude Opus 5.5, medium effort, independently recommended no core API yet: transforms and scene ordering already solve the simple external seat. The coordinator checked local exports and primary engine documentation rather than treating that conclusion as proof.

Three review claims needed narrowing:

- Not every export is a single node: GDevelop coordinates multiple sprites/ranks, and asset-only formats have no live controller. A host recipe must describe those differences.
- Not every mount must support every unmounted facing: the host may deliberately restrict both actors to their reviewed common coverage. Independent nearest-facing fallback is unacceptable.
- A ghost scene is not automatically a forbidden Studio-only paper-doll effect. It is legitimate host-side composition if the rider uses the shared public behavior and the exported integration can reproduce the stated result.

The review's warning about estimated anchors is retained as a qualification requirement, not a claim that current anchors have measured mounting errors. No riding-specific accuracy measurement was performed. Its proposed arbitrary multi-use-case threshold is replaced by the concrete failing-operation gate above.

## Sources and verification

Primary engine references accessed November 16, 2026. These explain available mechanisms; they are not a native compatibility test for PixelDoll's generated exports or a guarantee that the current documentation's engine version matches a user's project.

- **[E1]** [Phaser Container](https://docs.phaser.io/phaser/concepts/gameobjects/container): inherited transforms, local child order and masking restrictions. [Depth and containers](https://docs.phaser.io/phaser/concepts/gameobjects/components#depth-component): scene depth versus container-child order.
- **[E2]** Godot [Node2D](https://docs.godotengine.org/en/stable/classes/class_node2d.html) and [CanvasItem](https://docs.godotengine.org/en/stable/classes/class_canvasitem.html): transform inheritance, relative Z and Y-sort. A marker under a host animation is an integration choice, not a PixelDoll bone rig.
- **[E3]** [Unity Sorting Groups](https://docs.unity.com/en-us/engine/6000.6/manual/unity2d/sprite/sort-sprites/use-sorting-groups): grouping child renderers for sorting, including nested groups and group-root distance.
- **[E4]** [GDevelop custom sprite points](https://wiki.gdevelop.io/gdevelop5/objects/sprite/edit-points/): points can vary per animation/frame, are read with `PointX`/`PointY`, and follow flipping/rotation. Their existence does not make PixelDoll's controller a grouped scene object.
- **[E5]** [Aseprite slices](https://aseprite.org/docs/slices/): named regions, pivots and sprite-sheet JSON keys. This supports host-authored metadata, not an existing PixelDoll seat exporter.
- **[E6]** Godot [AnimatedSprite2D](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html), `set_frame_and_progress`; Phaser [AnimationState](https://docs.phaser.io/api-documentation/class/animations-animationstate), progress operations. Native control primitives do not establish cross-engine normalized-time or equipment synchronization parity.

Verification scope: repository inspection, direct engine documentation, independent challenge and documentation-only validation. No mount prototype, application test/build, browser session, native-engine mount run, art qualification or paid generation was performed. Proposed acceptance criteria are not reported as passed experiments.
