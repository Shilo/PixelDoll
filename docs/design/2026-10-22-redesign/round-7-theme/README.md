# Owned Bronze component-state showcase

Isolated Svelte showcase, 2026-10-23. Implements native light/dark theme roles while preserving the approved Bronze palette, restrained geometry and immersive scene. No GlassKit import, new dependency, production UI migration, backend or PixelLab request. The approved playable reference remains at port 5202.

## Open and run

From repository root, using Node 24.22.1 and the existing exact `app/` dependencies:

```powershell
node docs/design/2026-10-22-redesign/round-7-theme/run.mjs
```

Open **http://127.0.0.1:5203/**. Choose Scene, Controls, Creator, Library, Feedback or Overlays. Use the ordinary Light mode / Dark mode button. `?theme=light&page=creator` is a reproducible review link; without that override the saved mode is retained. The server binds localhost, ignores environment files and does not start the API agent path.

```powershell
node docs/design/2026-10-22-redesign/round-7-theme/run.mjs --build
node docs/design/2026-10-22-redesign/round-7-theme/verify.mjs --capture
node docs/design/2026-10-22-redesign/round-7-theme/verify.mjs --webkit
```

Use the installed managed Playwright browser location through `PLAYWRIGHT_BROWSERS_PATH` where needed. `--no-report` reruns verification without modifying committed reports. Build/cache/evidence directories are intentionally ignored. Existing round-5 world PNGs are local design media and must be present to run/build; fresh checkouts need those original assets restored. Sprite fixtures and the reused compositor are repository sources. Screenshots can be regenerated with `--capture` and browsed through [review.html](review.html).

## What the proof covers

- Single token owner, shared CSS recipes, native-first Svelte behavior and separate catalog layout. Both modes include native controls, dialogs, popovers, feedback and accessibility fallbacks.
- Scene uses actual unshaded demo sprites, interchangeable headwear, frame playback and a separate reflection. It is a material/context specimen; use the existing playable prototype for camera/movement testing.
- Controls, Creator and Library exercise field families, tabs, compass/mirror choices, palettes, thumbnails, outfits, design compatibility, frame strips, ramps, request disclosures and an activity ledger.
- Feedback and Overlays exercise busy/disabled/error/recovery states, native modal focus, responsive sheets, action/API popovers, hover/focus/tap help and notification samples.
- `RequestFields.svelte` is the **actual production component** with a scoped bridge. Other behavior primitives are new isolated examples; domain workflows are represented, not cloned or migrated. Generic Import/New equipment/Connect/Design details dialogs are clearly illustrative.

The Creator specimen uses 32–248 px body bounds to fit its deliberately fixed 8 px padding under a 256 px frame. This is not a change to production V3 limits or its more capable auto/manual sizing workflow. No real credentials should be entered; the token example is disabled.

## Design and review record

- [Style guide and extension contract](STYLE-GUIDE.md)
- [Actual app inventory](control-inventory.md)
- [Apple, GlassKit, Material 3 Expressive research and independent runtime challenge](research-review.md)
- [Coverage review and remaining specialized contexts](coverage-review.md)
- [Chromium verification](verification-chromium.json), [WebKit verification](verification-webkit.json)
- [Screenshot gallery](review.html): matched desktop/mobile captures in dark/light, including validation, dialogs and API inspection.

The theme is a representative component-family proof, not an accessibility certification or a complete production workflow replica. Detailed job cost states, specialized all-direction/oversize review layouts, every Sheet variant, screen-reader combinations and physical-device rendering need verification at integration. The guide records how additions should preserve consistency without building a speculative widget framework.

## Verification record

The lead reviewed the live app visually and through its DOM in the Codex in-app browser, including phone Creator, dark Export sheet, transparent scrollbar tracks and both scene appearances. Two GPT-6.1 Sol High reviewers challenged the design and actual control coverage. Corrections included stable filtered selection, invalid joined-field styling, consistent field heights, unclipped focus, 44 px touch controls in both orientations, native popover semantics, pointer/keyboard help behavior, and explicit dialog opener restoration for WebKit. Native dialog maximum width was also corrected after the visual review revealed an undersized phone sheet.

The verification suite exercises six sections in both modes at 1920 × 1080, 390 × 844, 320 × 568 and 844 × 390, in Chromium and WebKit. It checks genuine nonempty actor pixels before comparing unchanged artwork across themes, persisted mode, nested themed scrollbars, controls, validation, modal/popover focus and preference fallbacks. The final reports record results; 36 matched screenshots cover the two main viewport sizes plus validation/dialog/popover states. A prior concurrent run timed out waiting for demo artwork; a clean sequential Chromium run completed all 48 combinations. Evidence capture now explicitly waits for artwork after reload, so an empty canvas cannot pass visual parity.

The isolated production build completed with no warnings. Its complete lab bundle (including Svelte, example interactions, fixture compositor and actual RequestFields) is approximately 22.91 kB CSS / 116.19 kB JS before gzip, 5.52 / 40.99 kB after gzip; the two existing world PNGs add about 3.45 MB. These are lab totals, not claims about a theme-only payload or physical-device performance.
