# Historical Bronze component-state showcase

**Historical evidence — superseded by [Bronze UI](https://github.com/Shilo/bronze-ui).** Current theme tokens, CSS recipes, reusable Svelte behaviors, style guidance and component verification are maintained in that standalone MIT repository and its [live showcase](https://shilo.github.io/bronze-ui/). This directory preserves the original implementation, reviews and test records; do not update its theme or regenerate its evidence. The [round-six playable prototype](../round-6-prototype/bronze-integration.md) consumes the package for PixelDoll's integration proof.

The isolated Svelte showcase below was implemented on 2026-10-23, before extraction. It demonstrated native light/dark roles while preserving the approved Bronze palette, restrained geometry and immersive scene. It made no PixelLab requests or production UI changes.

## Historical reproduction

The current `run.mjs` and `verify.mjs` entry points stop before starting a server, building or writing evidence. To reproduce the original lab, use pre-extraction commit [`003bef2`](https://github.com/Shilo/PixelDoll/tree/003bef2/docs/design/2026-10-22-redesign/round-7-theme) in a separate checkout and follow the original commands below. For current component development, use the standalone Bronze UI repository.

Original commands, from the repository root with Node 24.22.1 and the exact `app/` dependencies:

```powershell
node docs/design/2026-10-22-redesign/round-7-theme/run.mjs
```

The historical server used **http://127.0.0.1:5203/** with Scene, Controls, Creator, Library, Feedback and Overlays sections. `?theme=light&page=creator` selected a reproducible appearance/page; otherwise the saved mode was retained. It bound localhost, ignored environment files and did not start the API agent path.

```powershell
node docs/design/2026-10-22-redesign/round-7-theme/run.mjs --build
node docs/design/2026-10-22-redesign/round-7-theme/verify.mjs --capture
node docs/design/2026-10-22-redesign/round-7-theme/verify.mjs --webkit
```

Historical reproduction needs the managed Playwright location through `PLAYWRIGHT_BROWSERS_PATH` where applicable, plus the original local round-five world PNGs. Sprite fixtures and the reused compositor are repository sources. Build/cache/evidence directories remain ignored. Browse existing local screenshots through the [historical gallery](review.html); missing media must be restored from the original evidence, not replaced with captures of the extracted package.

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
