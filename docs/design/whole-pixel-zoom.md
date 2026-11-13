# Whole-pixel scene zoom (deferred)

Status: Later, low priority. No visual problem has been reported; this records the analysis so the work can start without
rediscovery. Board card: "Make scene zoom levels whole-pixel".

## Background

Scene zoom is absolute (see "Scene zoom" in [production-experience.md](production-experience.md)): 100% is one CSS
pixel per art pixel. Wheel, keys and buttons step through every whole multiple (100, 200, 300, 400%, ...) with even
steps between them while a step would exceed 25% (125, 150, 175, 250 and 350%), plus each screen's fit
(`zoomLevels` in `app/src/studio/experience/zoom.ts`).

Pixel-perfect means every art pixel covers the same whole number of device pixels. That already holds for:

- every whole multiple on a whole-number `devicePixelRatio` (1, 2, 3);
- 150%, 250% and 350% at `devicePixelRatio` 2;
- Customize's fit, which `actorScale` and `planLineup` choose in whole device pixels.

## The concern

Nearest-neighbor rendering keeps edges sharp, but a non-whole scale draws some art pixels one device pixel wider than
others. Symptoms: outlines of varying thickness, uneven dither, and shimmer while a walk cycle moves pixels across the
uneven grid. It remains for:

- the in-between levels (125, 150, 175, 250, 350%) at `devicePixelRatio` 1;
- every level at fractional `devicePixelRatio` (Windows scaling 125% or 150%), where 100% is 1.25 or 1.5 device pixels;
- the Characters fit on phones, which `castPose` caps at 48% of the stage width (`app/src/studio/experience/carousel.ts`)
  and can therefore be fractional, including the default view.

Visibility shrinks with scale: a one-pixel difference is 50% of an art pixel at 2x but about 12% at 8x, and high-density
displays make it subtle. It is most visible on 1x monitors at small scales.

## Options

1. **Drop the in-between levels at `devicePixelRatio` 1** (step 100, 200, 300, ...). Every level pixel-perfect there, but
   coarse at small scales (one step from 100% doubles the size).
2. **Generate in-between levels in whole device pixels**: levels k / `devicePixelRatio`. At 2x this is already the case
   for 150, 250 and 350%; at 1x there are none between whole multiples. Ladders then differ between displays.
3. **Make the Characters fit whole-pixel**: drop the fractional 48% cap in favor of the largest whole-device-pixel scale
   that fits that width. The default framing on phones changes slightly.
4. **Accept fractional `devicePixelRatio`**: 100% stays one CSS pixel; pixel-perfect there would mean defining 100% in
   device pixels, which makes characters smaller on scaled displays.

## Recommendation

Only if the measurement below shows visible artifacts: option 3 first (it fixes the default view itself), then option 1
behind a measurement on a 1x monitor. Keep option 4: CSS pixels are the honest unit for "true size".

## Rollout without regressions

1. **Measure first.** Screenshot 125% and 100% on a 1x monitor with a small fit, and the Characters default on a phone.
   If the difference is not visible, close the card.
2. Option 3 is the riskiest step (cast layout on phones): compare screenshots on phone and desktop, portrait and
   landscape, dark and light, before continuing.

## Testing

- **Unit** (`app/test/unit/experience-zoom.test.ts`): ladders keep every whole multiple, stay strictly increasing, and
  retrace exactly from fits 0.75 to 20; any change keeps those.
- **End-to-end** (`app/test/e2e/scene-zoom.spec.ts`): at each whole multiple on `deviceScaleFactor` 1 and 2, the selected
  sprite's device-pixel width divided by its art width is an integer on both screens; the round-trip, cross-screen,
  resize and swipe tests keep passing unchanged.
- **Visual:** a screenshot matrix across 320x568, 390x844, 844x390, 1280x720 and 1920x1080, both themes, checking
  outlines and a walk cycle for shimmer.
- **Regression:** the full `npm run e2e` suite if the Characters fit changes, since it touches cast layout, the carousel
  and hit regions.
