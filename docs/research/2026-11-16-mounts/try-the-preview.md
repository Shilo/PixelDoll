# Try the test mount

This is a free local experiment using a schematic mount. It does not generate creature art, save a mount to an outfit, or include it in exports.

## Try it

1. Open `http://localhost:5199/?mounts` and customize a character. The agent workflow uses `npm run dev:agent`; stored artwork works without the PixelLab Docker API.
2. Click **Mount** beside Preview, Top-down and Side-scroller. It becomes **Dismount** to remove the mount. On narrow screens these actions use the paw icon and an accessible action name.
3. In **Preview**, choose any existing move and facing. The toggle does not change that move. A standing pose will still have straight legs.
4. In **Top-down** or **Side-scroller**, move normally. The mount follows the displayed facing and moves with the character. Its bob pauses while stopped. The rider uses a matching **Ride** view if stored, otherwise standing artwork, not a walking cycle.
5. Switch between views with the mount on. The choice lasts until you turn it off or reload; it is not saved.
6. With a mount on, open **More options** and try **Hide legs: None / Far leg / Both legs**. None is the unchanged baseline. The other options cut out estimated leg pixels from the displayed rider, including any overlapping equipment. They do not bend legs or recover hidden artwork. Far leg is unavailable in front/back views, where one leg is not uniquely farther away. A missing pose leaves the rider unchanged and shows why.

The schematic has eight authored or explicitly mirrored directions. A four-direction character still shows only its own four directions. This is not proof that generated creature art works from eight camera angles.

## What to judge

Watch the rider's hips, knees, boots and long clothing. The open saddle deliberately leaves these visible so bad contact and far-leg overlap are not hidden by a broad front wall. There is no automatic leg detection or reviewed rider-part mask yet.

The optional cutout is an unreviewed joint-based guess, not reliable anatomical segmentation. It can miss leg fragments or remove clothing, weapons or hands that cross the guessed region. Keep None as the comparison. These choices only change this local display, never the stored rider or export. More options keeps this infrequent experiment out of the main toolbar; a new Mount panel is not justified by one unsaved prop.

## Travel speed

Studio now walks at 300 world units/second in Top-down and 150 in Side-scroller. The side projection magnifies floor travel more strongly, so equal world speeds previously looked substantially faster there. Mounting multiplies each mode's walking speed by 1.3: 390 and 195 respectively. Analog input scales travel and gait together; stopping pauses the mount's gait. Preview keeps its ordinary playback controls and timing.

The 1.3 multiplier is a conservative demo tuning choice, not a universal game standard or measured foot-contact calibration. [Guild Wars 2's developer diary](https://www.guildwars2.com/en-gb/news/developer-diary-joy-of-movement-on-mounts/) describes mount-specific movement physics, animation and cameras rather than a single cosmetic speed boost. [ESO's riding-skill documentation](https://help.elderscrollsonline.com/app/answers/detail/a_id/30297/~/how-do-riding-skills-work) makes mounted speed separately trainable without affecting unmounted movement. These primary sources support treating speed as game-specific. Neither establishes 130% as a common standard.

The prior Open seat and Covered seat menu and see-through diagnostic were research comparisons. They used the same rider compositor, but different foreground art. The covered enclosure concealed lower-body mistakes; it was removed from the interactive demo rather than used to imply successful saddle fitting.

In the live-trial browser profile, **Mount trial E (isolated copy)** has a recovered East-only **Ride** move. It is browser-local, not bundled. Select Ride in Preview to compare it with Default without generating anything. The existing paid clip and free recovery are documented in [live results](live-results.md).

## Runtime boundary

PixelLab generates images and animation frames. PixelDoll's paper-doll runtime equips layers, applies palettes, chooses facing frames and samples animation time. Neither is a gameplay movement or physics system. Studio's host scene handles keyboard/touch input, world position and camera movement; a game engine does that in a real game.

A real mount should be a separately animated entity attached at a seat, not a clothing slot. Generating, saving, equipping and exporting real mounts remains follow-up work. No new runtime API or native export parity is claimed by this demo.
