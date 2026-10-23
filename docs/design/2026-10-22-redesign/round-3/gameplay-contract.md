# Shared studio and gameplay contract

This records the intended interaction behind the image-only round-three proposal. It supersedes the static-world and per-keypress movement behavior of earlier mockups. It is a design contract, not implemented code or evidence that required animation assets already exist.

## One character, one wardrobe, one interface

Customization and Play share the active character, equipped layers, palettes, outfit state, selected equipment category and projection. Switching state must not clone the character, reset the outfit, or mount a different wardrobe UI. Character information stays left and all equipment actions stay right on desktop. On phones the equipment region stays below the actor.

Clicking **Rowan ▾** opens an anchored character switcher in either state, with names, a small preview, search when needed and access to the full cast. Choosing a character updates the actor and that character's wardrobe while preserving the world/projection and a safe camera position. Switching characters must not imply equipment can be transplanted between incompatible frozen bases. Pending drafts/jobs remain attached to the correct character; switching never silently submits or repeats paid work.

**All parts** opens the full Head, Hair, Body, Legs, Feet, Back and Hands list inside the equipment region. Categories, item choices and modes do not move to another edge. The focused item supports existing local ramps, layer/hiding details and reusable designs. All advanced operations remain available contextually; they do not become permanent toolbars.

## Continuous movement and animation

- Hold WASD or arrow keys to move continuously. Use held input and elapsed time, not operating-system key-repeat frequency. Releasing movement returns to the correct idle pose. Losing focus, changing character or opening a blocking form clears held input so the actor cannot drift.
- Top-down combines horizontal/vertical input. Diagonals should not move faster than cardinal directions. Facing follows the movement vector using the character's actual supported direction set.
- Animation plays from an elapsed-time clock at the clip's authored cadence. A keypress must not advance exactly one sprite frame. Body and equipment use the same animation, facing, frame and pivot for every render.
- In-place authoring playback and gameplay animation are separate control states. Play hides clip selection, facing buttons, frame stepping, Add moves and the Moves authoring tab. Locomotion chooses clips automatically.
- Side view uses continuous left/right movement on a grounded surface. Projection needs compatible side-view artwork and alignment. Do not rotate or distort a top-down body to pretend it is a complete side-view rig.
- The initial world is flat and empty. No obstacle-course props, combat systems or elevation are required. Jump/fall/landing support can follow only with suitable clips and a deliberate control/physics contract; the image's running pose does not establish those assets.
- Every supported gameplay action should use the complete corresponding animation and equipped-layer coverage. Missing directions or moves are resolved before that action is made available, not filled by arbitrary repeated frames or silent mirroring of handed equipment.

## Camera and presentation

The world is continuous ground extending beyond the viewport. Its grid belongs to the material, never a screen overlay. No per-frame snapping to a tile or confinement to a small preview rectangle. Subtle material transitions and coherent light provide movement cues without adding objects.

A following camera keeps the actor within the usable world region, offset away from the equipment area. Desktop should center around the remaining world, not behind the right panel. A small dead zone and restrained smoothing can keep the image stable; reduced-motion handling should remove unnecessary camera easing and ambient motion without stopping input responsiveness.

The projection selector stays in the same screen position when switching Customize/Play. The camera may change framing for gameplay, but the identity, equipment and utility controls remain anchored. Ground and character move under those controls. A switch to side view deliberately changes camera/projection; it does not turn the UI into a new application.

Character layers remain sharp, unmodified and frame-aligned. HD world art is allowed for design, and may be rebuilt as pixel art later. Scene lighting must not destructively recolor exported character assets. World texture, reflected light and grid contrast should remain quiet enough to read cape edges, hair and held items in motion.

## Equipment while playing

Existing items and local color changes update the moving actor immediately. Hovering over a wardrobe control should not force a view change. Clicking an equipment button consumes that pointer action; it does not also move the actor or activate a world action.

New item and exact-text dialogs temporarily suspend movement input so typing W/A/S/D cannot walk the character. Closing returns focus intentionally; resume requires fresh movement input. Local idle/ambient presentation can continue where appropriate. Generation retains the existing explicit cost review and job identity; no automatic retry or background credit spending is implied.

A character picker or blocking modal takes keyboard focus. Escape closes the topmost surface first. An outfit change during gameplay cannot silently reorder layer pivots, create an animation mismatch or suppress known missing coverage. Authoring/coverage details are reachable from the item or Customize, not a permanent Proof button in the world.

## Mobile boundary

The images establish a coherent phone layout and explicitly omit onscreen movement pads. Hardware keyboard WASD/arrows can share the desktop input contract. Touch-only locomotion is not yet established by the brief or validated by these images. Evaluate a direct gesture within the open world area in a focused follow-up, including clear first-use discovery, release-to-stop, equipment hit testing and accessibility. Do not silently add a joystick or claim touch gameplay is already designed or implemented.

## Acceptance before shipping a gameplay implementation

1. A held key produces smooth time-based motion and multiple animation cycles; repeated keydown events do not control travel speed or clip cadence.
2. Camera follows while name, wardrobe and projection controls stay fixed and readable.
3. Changing headgear or a palette in motion preserves frame alignment and outfit state.
4. Entering Play removes animation-authoring controls without moving the equipment region or losing selections; returning restores authoring state.
5. Rowan's name switches characters from either state without requiring a separate test-world page or transferring incompatible equipment.
6. Top-down/side selection uses compatible assets and exposes unsupported coverage honestly. No forged view or movement clips.
7. Blur, dialogs, typing and Escape cannot leave movement stuck on or trigger a paid request accidentally.
8. No default Grid/Bounds/Proof controls, movement pad, action-button bank, props or imposed game systems appear.

None of these runtime acceptance criteria is certified by the screenshots. The current deliverable is design imagery and its behavioral specification.
