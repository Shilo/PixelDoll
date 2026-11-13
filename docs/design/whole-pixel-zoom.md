# Whole-pixel scene zoom (deferred)

Status: Later, low priority. No visual problem has been reported; this records the analysis so the work can start without
rediscovery. Board card: "Make scene zoom levels whole-pixel".

## Background

Characters and Customize Preview share one scene zoom (`app/src/studio/experience/zoom.ts`, `sceneZoom.ts`). Wheel
notches, the `+`/`-` keys and the zoom buttons step through fixed levels, `ZOOM_STEPS` = 50, 60, 70, 80, 90, 100, 110,
125 and 150%. Pinch zoom is continuous and snaps to 100% when released within 4% of it. Both screens share the 50 to
150% bounds so a level reads and scales the same on each.

"100%" is the automatic fit, not the sprite's native size. How each screen picks its fit:

- **Customize Preview** (`WorldStage.svelte`, `lineup.ts`): `actorScale` and `planLineup` choose a whole number of
  device pixels per art pixel (`Math.floor(fit * density) / density`), so 100% is already pixel-perfect.
- **Characters** (`Experience.svelte`, `carousel.ts`): `heroScale` floors to a whole CSS-pixel multiple, but `castPose`
  then caps the selected character at 48% of the stage width (`Math.min(size, width * 0.48)`). On phones that cap makes
  the cast fractional even at 100%.

## The concern

Pixel-perfect means every art pixel covers the same whole number of device pixels, not native size. A level that
multiplies a whole-pixel fit by a non-integer factor breaks that. Example with a 4x fit:

| Level  | 50% | 60%  | 70%  | 80%  | 90%  | 100% | 110% | 125% | 150% |
| ------ | --- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Scale  | 2x  | 2.4x | 2.8x | 3.2x | 3.6x | 4x   | 4.4x | 5x   | 6x   |
| Whole? | yes | no   | no   | no   | no   | yes  | no   | yes  | yes  |

Non-whole scales draw some art pixels one device pixel wider than others (nearest-neighbor rendering keeps edges sharp
but uneven). Symptoms: outlines of varying thickness, uneven dither and checker patterns, and shimmer while a walk cycle
moves pixels across the uneven grid.

How visible it is depends on scale and display density:

- A one-pixel difference is 50% of an art pixel at 2x, 33% at 3x, about 12% at 8x.
- High-density displays (phones, Retina, most laptops at 2x or 3x) make it subtle.
- It is most visible on 1x desktop monitors with a small fit (2x or 3x).
- Fractional OS scaling (Windows 125% or 150%, `devicePixelRatio` 1.25 or 1.5) cannot be whole-pixel at every level.

## Options

1. **Snap each level to the nearest whole-pixel scale.** Cheapest, but at small fits several steps collapse to the same
   size (3x fit at 1x density: 60 to 90% all draw at 2x), so steps appear to do nothing.
2. **Generate the levels from the fit:** `k / (fit * devicePixelRatio)` for integer `k`, kept within 50 to 150%. With
   8 device pixels per art pixel (4x fit, 2x display): 50, 62.5, 75, 87.5, 100, 112.5, 125, 137.5 and 150%. Every step
   is pixel-perfect and distinct, but the ladder depends on the fit, so the two screens only match when their fits do.
3. **Option 2 plus one shared whole-pixel fit for both screens.** Characters adopts Customize's whole-device-pixel fit
   rule and drops the fractional 48% width cap, so both screens share one ladder: identical percentages, pixel-perfect
   everywhere, and stepping still returns to exactly 100%. Cost: the cast on phones changes size slightly, and small
   fits get few levels (1x fit at 2x density: 50, 100, 150%).
4. **Label zoom as pixel scale (2x, 3x, ...).** Honest for pixel art, but 100% no longer means the fit, and the
   percentage consistency the owner asked for is lost.

## Recommendation

Option 3, labels rounded to whole percents (63%, 88%), with fallbacks:

- Keep the current `ZOOM_STEPS` when the generated ladder has fewer than three levels, or when `devicePixelRatio` is
  fractional and few whole-pixel scales exist.
- A pinch snaps to the nearest generated level on release (replacing the 4% band).

Only `ZOOM_STEPS` and its consumers change; `zoomStep`, the shared bounds, head-keeping and swipe logic stay.

## Rollout without regressions

1. **Measure first.** Screenshot 100% against 110% on a 1x monitor with a small fit (for example 1280x720 at 1x). If the
   difference is not visible, close the card.
2. Unify the fit (the riskiest step): Characters uses Customize's fit rule. Compare screenshots on phone and desktop,
   portrait and landscape, dark and light, before continuing.
3. Generate the ladder from the shared fit and `devicePixelRatio`; recompute on resize and display change.
4. Add the fallbacks and pinch snapping.

## Testing

- **Unit** (`app/test/unit/experience-zoom.test.ts`): generate ladders for fits 1x to 8x and `devicePixelRatio` 1, 1.25,
  1.5, 2 and 3. Every generated level times fit times density is an integer; the ladder contains exactly 1; it stays
  within 50 to 150%; the fallback applies below three levels; stepping out and back returns to 1.
- **End-to-end** (`app/test/e2e/scene-zoom.spec.ts`): at every level, the selected sprite's device-pixel width divided
  by its art width is an integer on both screens; the existing round-trip, cross-screen, resize and swipe tests keep
  passing unchanged.
- **Visual:** a screenshot matrix of levels across 320x568, 390x844, 844x390, 1280x720 and 1920x1080, both themes,
  `deviceScaleFactor` 1 and 2, checking outlines and a walk cycle for shimmer.
- **Regression:** the full `npm run e2e` suite, since the Characters fit change touches cast layout, the carousel and
  hit regions.
