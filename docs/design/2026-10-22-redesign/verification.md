# Design-study verification

Date: 2026-10-22. Scope: the standalone mockups and their illustrative interactions, not the production app's generation pipeline.

## Completed

- **18 primary screenshots:** all three concepts × selection/creation/customization × 1440 × 900 desktop and 390 × 844 portrait phone.
- **Six additional responsive screenshots:** Moonlit Camp's three screens at 320 × 568 and 844 × 390.
- **Three additional state screenshots:** appearance review, export review and neutral inspection/mirrored facing.
- **Three six-screen comparison boards:** personally inspected by the lead after the last rendering pass.
- **24 viewport checks:** no horizontal document overflow reported. This check alone cannot prove the absence of internal clipping; it was paired with visual review and layout adjustments.
- **13 interaction assertions:** choose character; equip wizard hat; change facing; open export; filter library; cost gate; appearance review; recolour; four-view inspection; plain backdrop; mirrored-state notice; phone All parts; phone New item.
- No uncaught page errors in the primary screenshot matrix or added interaction pass.
- JavaScript syntax checked with `node --check`.
- The [current-app audit](current-audit.md) separately documents 23 offline screenshots of the original interface. Those are baseline evidence, not redesigned screens.

Machine-readable results: [mockups/verification.json](mockups/verification.json). Reproduction script: [capture.mjs](capture.mjs). The prototype serves entirely from local files and contains no PixelLab API or token entry code.

## Changes made after visual/research review

1. Removed overlapping Quiet Stage creation headings.
2. Enlarged equipment thumbnails by cropping transparent padding for display.
3. Added a phone-accessible New item action.
4. Fixed searchable-library filtering (`hidden` was initially overridden by display styling).
5. Replaced unlabeled inspection icon with visible Inspect text; added a four-direction proof view and neutral backdrop.
6. Exposed All parts on phones, plus a category picker from the panel title for landscape layouts.
7. Added mirrored-West and missing-north-view notices.
8. Restored mobile material-colour labeling.
9. Expanded Atelier's creation workbench so cost information fits.
10. Reflowed the short-phone and landscape layouts; compact panels intentionally scroll instead of squeezing every control into the viewport.

## Deliberate limits

The prototype uses real stored demo sprite layers, but its six names/outfits are illustrative cast entries. Selecting a head item, facing, Walk playback, sample recolouring, simple outfit application and search work locally; many secondary buttons demonstrate a proposed explanatory state. It does not persist real projects, parse imports, quote jobs, generate/fix/fit equipment, run QA, save real palette ramps or create export files. Exact prompt serialization, draft restoration, full undo/redo, eight-direction assets and native-scale inspection remain implementation requirements.

The appearance toggle is only a limited colour study, not a tested complete light theme. The creation preview is explicitly an example. Final production type sizes, touch targets, contrast, screen-reader behavior, safe areas, 200% zoom and a real mobile keyboard require further validation. No accessibility certification or user-study result is claimed.

The smoke scripts used the available Node **25.0.0** host and the repository's Playwright **1.64.1** with managed Chromium from the user's browser cache. The production project still requires Node **24.22.1**; no runtime/dependency configuration was changed. Production unit/build suites were not run because only design documents and the standalone prototype were added. The current app was not replaced or deployed.

No PixelLab credits were used. Environment plates were created separately using the built-in image generation tool; exact prompts and provenance are in [assets/README.md](assets/README.md).
