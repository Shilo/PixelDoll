# Try the test mount

Studio includes an optional schematic mount without a URL flag. It does not generate creature art, save a mount to an outfit, or include it in exports.

## Direction behavior

Far leg applies to all six side and diagonal views, including West, North-West and South-West, when the displayed frame has matching joints. Mirrored views reflect their source geometry once; independently authored western art needs its own joints. North and South intentionally keep both legs in Far mode. Both legs applies to every direction with complete hip and arm geometry. Missing or invalid geometry leaves the artwork unchanged, rather than cutting with a different pose.

Far is approximate: overlapping legs, wide feet and connected clothing can survive its conservative ownership rule. Both clears below the hips except protected arm regions, so remaining pixels can be hand protection rather than a west-specific error. Neither option bends straight legs into a seated pose.

## Try it

1. Open `https://pixeldoll.app/` and customize a character. For local agent testing, use `npm run dev:agent` at `http://localhost:5199/`; stored artwork works without the PixelLab Docker API.
2. Click the **Mount settings** paw icon in the top-right navigation bar, immediately before Random look. Turn **Show mount** on or off in its menu. The icon uses Bronze UI 0.3.7's normal accent highlight while the mount is shown, with no check badge. The switch is the authoritative state; opening the menu alone does not activate the highlight. On small phones Random look moves into More options, but the mount icon stays on the bar.
3. In **Preview**, choose any existing move and facing. The same facing lineup now draws each neighbor with its own mount, contact and leg cutout. Selection and ordering work as before; wider mounted silhouettes can fit fewer neighbors on small screens. The toggle does not change the move. A standing pose will still have straight legs.
4. In **Top-down** or **Side-scroller**, move normally. The mount follows the displayed facing and moves with the character. Its bob pauses while stopped. The rider uses a matching **Ride** view if stored, otherwise standing artwork, not a walking cycle.
5. Switch between views with the mount on. The choice lasts until you turn it off or reload; it is not saved.
6. In the paw menu, try **Hide legs: None / Far leg / Both legs**. **Far leg** is the default for side and diagonal views; front/back views keep both legs because neither is uniquely farther away. Choose Both legs explicitly if you want that comparison, or None for unchanged artwork. The cutouts include overlapping equipment and do not bend legs or recover hidden artwork. A missing pose leaves the rider unchanged and shows why in Mount settings. Click outside the menu to return to the character.

The schematic has eight authored or explicitly mirrored directions. A four-direction character still shows only its own four directions. This is not proof that generated creature art works from eight camera angles.

## Correct a saved seat

In Mount settings, turn on **Show mount**, choose a saved one-cell **Riding pose**, and
select its facing. **Adjust seat** pauses the preview. The arrow buttons move the whole
rider one pixel at a time. **Save** keeps the point for that pose and facing, and
**Use automatic** previews removing it before you save. Mirrored facings can be
corrected individually. Closing the page discards a draft. Resetting Mount settings
resets the display preferences and keeps the character's reviewed points.

The [stored East Ride frame](evidence/mount-live-east-raw-strip.png) reproduces why the
fallback can need a correction. With a standing ground of (32, 60) and height of 50 px,
the estimate meets the saddle at body (32, 37.5). A reviewed contact of (30, 45) places
the same chair-sit sprite 2 px right and 8 px up on the unchanged saddle. The
[placement test](../../../app/test/unit/mount-preview.test.ts) checks two saddle positions
with independent expected coordinates and padded gear. This verifies contact placement.
The stored frame still needs suitable astride anatomy and matching gear for art qualification.

Saved points travel in [exports and editable copies](../../manifest-spec.md#rider-seat-contact).

## What to judge

Watch the rider's hips, knees, boots and long clothing. The open saddle deliberately leaves these visible so bad contact and far-leg overlap are not hidden by a broad front wall. There is no reviewed rider-part mask yet.

The small outlined rectangle drawn over the rider is the schematic saddle's front edge, not a selection box or a debugging overlay. Real mount art would replace this placeholder shape. No diagnostic markers are enabled by this experiment.

Both legs now uses a continuous lower-body cut, not two narrow leg capsules: every composed pixel below the average hip row is removed through the canvas bottom except the protected elbow-to-wrist regions. This removes the center gap and wide toes, including pixels in padded equipment space. Hanging clothing and held items can disappear. Complete arm geometry is required so missing hands are not silently cut away. The protected hand regions can also preserve intersecting leg or item pixels; they are not semantic hand masks. Far still uses its existing bounded ownership comparison and conservative fragment cleanup. Extending Far to the bottom would erase a lower near foot in some diagonal poses.

The cutout is an unreviewed joint-based guess, not reliable anatomical segmentation. It can miss leg fragments or remove clothing, weapons or hands that cross the guessed region. Keep None as the comparison. A conservative cleanup removes detached fragments touching the far-leg cut only when the whole fragment stays near that leg, below the hips and outside the near-leg region. Connected or ambiguous artwork is preserved, so some remnants can remain. These choices only change this local display, never the stored rider or export. Mount settings live together in the paw menu, not More options or a separate panel.

After a pointer click on quick navigation actions such as Random look, Undo or Redo, character controls resume without another click on the stage. Keyboard activation keeps its native button focus. Open menus, selects, text fields and dialogs keep their own keys; click the stage to resume after adjusting settings.

## Travel speed

Studio now walks at 300 world units/second in Top-down and 150 in Side-scroller. The side projection magnifies floor travel more strongly, so equal world speeds previously looked substantially faster there. Mounting multiplies each mode's walking speed by 1.3: 390 and 195 respectively. Analog input scales travel and gait together; stopping pauses the mount's gait. Preview keeps its ordinary playback controls and timing.

The 1.3 multiplier is a conservative demo tuning choice, not a universal game standard or measured foot-contact calibration. [Guild Wars 2's developer diary](https://www.guildwars2.com/en-gb/news/developer-diary-joy-of-movement-on-mounts/) describes mount-specific movement physics, animation and cameras rather than a single cosmetic speed boost. [ESO's riding-skill documentation](https://help.elderscrollsonline.com/app/answers/detail/a_id/30297/~/how-do-riding-skills-work) makes mounted speed separately trainable without affecting unmounted movement. These primary sources support treating speed as game-specific. Neither establishes 130% as a common standard.

The prior Open seat and Covered seat menu and see-through diagnostic were research comparisons. They used the same rider compositor, but different foreground art. The covered enclosure concealed lower-body mistakes; it was removed from the interactive demo rather than used to imply successful saddle fitting.

In the live-trial browser profile, **Mount trial E (isolated copy)** has a recovered East-only **Ride** move. It is browser-local, not bundled. Select Ride in Preview to compare it with Default without generating anything. The existing paid clip and free recovery are documented in [live results](live-results.md).

## Runtime boundary

PixelLab generates images and animation frames. PixelDoll's paper-doll runtime equips layers, applies palettes, chooses facing frames and samples animation time. Neither is a gameplay movement or physics system. Studio's host scene handles keyboard/touch input, world position and camera movement; a game engine does that in a real game.

A real mount should be a separately animated entity attached at a seat, not a clothing slot. Generating, saving, equipping and exporting real mounts remains follow-up work. No new runtime API or native export parity is claimed by this demo.
