# Try the test mount

This is a free local experiment using a schematic mount. It does not generate creature art, save a mount to an outfit, or include it in exports.

## Try it

1. Open `http://localhost:5199/?mounts` and customize a character. The agent workflow uses `npm run dev:agent`; stored artwork works without the PixelLab Docker API.
2. Click the paw icon, **Test mount**, beside Preview, Top-down and Side-scroller. Click it again to remove the mount. Hover or focus it for a short explanation.
3. In **Preview**, choose any existing move and facing. The toggle does not change that move. A standing pose will still have straight legs.
4. In **Top-down** or **Side-scroller**, move normally. The mount follows the displayed facing and moves with the character. Its bob pauses while stopped. The rider uses a matching **Ride** view if stored, otherwise standing artwork, not a walking cycle.
5. Switch between views with the mount on. The choice lasts until you turn it off or reload; it is not saved.

The schematic has eight authored or explicitly mirrored directions. A four-direction character still shows only its own four directions. This is not proof that generated creature art works from eight camera angles.

## What to judge

Watch the rider's hips, knees, boots and long clothing. The open saddle deliberately leaves these visible so bad contact and far-leg overlap are not hidden by a broad front wall. There is no automatic leg detection or reviewed rider-part mask yet.

The prior Open seat and Covered seat menu and see-through diagnostic were research comparisons. They used the same rider compositor, but different foreground art. The covered enclosure concealed lower-body mistakes; it was removed from the interactive demo rather than used to imply successful saddle fitting.

In the live-trial browser profile, **Mount trial E (isolated copy)** has a recovered East-only **Ride** move. It is browser-local, not bundled. Select Ride in Preview to compare it with Default without generating anything. The existing paid clip and free recovery are documented in [live results](live-results.md).

## Runtime boundary

PixelLab generates images and animation frames. PixelDoll's paper-doll runtime equips layers, applies palettes, chooses facing frames and samples animation time. Neither is a gameplay movement or physics system. Studio's host scene handles keyboard/touch input, world position and camera movement; a game engine does that in a real game.

A real mount should be a separately animated entity attached at a seat, not a clothing slot. Generating, saving, equipping and exporting real mounts remains follow-up work. No new runtime API or native export parity is claimed by this demo.
