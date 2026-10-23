# Bronze UI dependency integration

Current ownership contract: [Bronze UI 0.2.0](./theme-ownership-0.2.0.md). Shared appearance, including scene-backing material strengths, is now upstream; consumer layout remains local. Earlier entries below describe their historical state.

> **Follow-up:** the user identified defects the original visual checks missed. See [regression repair](regression-repair.md) for root causes, corrected styling contracts and new evidence. The parity conclusions below describe the original limited checks and are superseded by that review.

2026-10-23. The round-six playable prototype consumes the extracted MIT `@shilo/bronze-ui` package. Its approved immersive composition, scene assets, original fixture pixels, creator controls, movement and native dialog behavior remain owned by this prototype. This integration has no PixelLab requests or production Studio behavior changes.

## Package boundary

The single consumer adapter is `bronze-theme.css`. It imports package `tokens.css` and `components.css`, aliases existing layout variable names to semantic `--bu-*` roles, and retains the established component dimensions. The optional package document reset is deliberately omitted because this prototype already owns headings, icons, native controls and scene layout. No copied Bronze palette or GlassKit stylesheet is needed by the default runtime.

The root uses `data-theme="dark|light"`; the body's `obsidian|porcelain` names select existing world artwork. Scene floor/fog/seam values and authored equipment ramps remain separate from UI color roles. Canvas surface backing reads the package's computed surface role. CSS opacity uses full-color `color-mix()` rather than a parallel RGB-channel palette.

`run.mjs` resolves the dependency from the normal `app/node_modules` install. The isolated server still binds only to `127.0.0.1:5202`, disables environment-file loading and uses existing fixture data. A fresh checkout needs `npm ci` in `app/` and the previously documented local round-five generated environment images.

Final verification uses the published **0.1.0** [GitHub release archive](https://github.com/Shilo/bronze-ui/releases/download/v0.1.0/shilo-bronze-ui-0.1.0.tgz), declared in the app manifest and lockfile. The lockfile integrity is `sha512-yIG7wArjYFSyRzHgUMGXbnxPNtPTFbHQsEFY3EfoazgN5NWEinmAxALYI/o+WF+EUtFF2VD9Xw7VB5vrBoScSg==`. A freshly launched keyless server served both CSS exports with SHA-256 digests identical to the installed files; [bronze-verification.json](bronze-verification.json) records the release URL, integrity and installed/served digests.

## Before and after evidence

Before changing the active runtime, `capture-bronze.mjs before` captured **68 browser images** from actual screen controls: both appearances at desktop **1920 × 1080** and phone **450 × 800**, device scale **1** in every capture. The set contains all five screens, Colours/Moves/Outfits panels, More/character/prompt/parts menus, export/animation/about dialogs, the missing-equipment toast and two phone creation scroll details. No external requests or page errors occurred.

The ignored `evidence/bronze-dependency/` directory holds **68 untouched before PNGs, 68 after PNGs, 68 equal-size comparison pairs and four complete review boards**, with JSON manifests containing image SHA-256 digests, capture dates, viewport metadata and major layout bounding boxes. The after manifest reports geometry differences above 1 px: **none** across the captured major surfaces. All four boards were visually reviewed. Screenshots are evidence from live scenes; moving-toast actor position may vary slightly with browser scheduling.

The final after capture began **2026-10-23 17:58:30 UTC**, after the published dependency installation. All after images, pairs and boards were refreshed; original before files were preserved and every before PNG still matches its original manifest digest. The SHA-256 of the original `before.json` bytes followed by its 68 PNG files in manifest order is `59bdd40959e40991c309f0f9d9ce26c24e24adf1ff7a1b87a937bde5cb7c35f4`, unchanged across this refresh. Final visual review covered all four boards plus full-size Obsidian phone Preview, Porcelain desktop Preview and Porcelain phone Creation pairs. No new clipping, alignment, sprite-color or material regression was found.

Open [the comparison gallery](http://127.0.0.1:5202/bronze-review.html) with the isolated server running. Reproduce from the repository root with Node **24.22.1**:

```powershell
# Before is a provenance step: run against the pre-integration revision only.
node docs/design/2026-10-22-redesign/round-6-prototype/capture-bronze.mjs before
node docs/design/2026-10-22-redesign/round-6-prototype/capture-bronze.mjs after
```

The capture script rejects a before run against the new runtime, preserving the original provenance. Use this capture utility with the pre-integration runtime files restored to reproduce the before flow. The earlier [GlassKit study](glasskit-study.md), adapter source, vendored license, verification report and captures remain historical evidence. Its material URL variants are superseded by the dependency integration; reproduce those studies from the corresponding earlier Git revision. Historical GlassKit capture/verification scripts also reject the current runtime so they cannot overwrite old evidence with new styling.

## Verification

Run with the isolated server active:

```powershell
node --test docs/design/2026-10-22-redesign/round-6-prototype/motion.test.mjs
node docs/design/2026-10-22-redesign/round-6-prototype/verify.mjs
node docs/design/2026-10-22-redesign/round-6-prototype/verify-bronze.mjs
```

Before and after integration: **12 unit tests and 18 existing browser checks passed**. The dependency checks in [bronze-verification.json](bronze-verification.json) pass **eight appearance/viewport cases** and record SHA-256 fingerprints of the installed package CSS. They verify the exported styles compiled into the consumer response, absence of GlassKit resources, semantic-role resolution, no inline palette copies, native dark/light form and scrollbar schemes, creator field sizes/focus, filter budget, menu bounds, native modal focus/Escape/return and reduced-transparency/contrast/forced-color fallbacks. Worst-case floating-surface text contrast is at least **4.86:1**; primary labels are at least **6.68:1**. The existing browser suite verifies authored sprite RGB in both appearances, animation/input and real multi-touch behavior.

The complete **12 unit / 18 existing browser / eight theme-viewport** suite was rerun successfully against the published installation. Both browser reports and the 68-image capture manifest contain no page errors or external requests. The existing sprite comparison checked **997 opaque source pixels** in its first comparison and passed in both appearances.

The component stylesheet is imported in a named cascade layer so established responsive control sizes win over generic recipe defaults. Package floating-surface rules own their materials; obsolete local playback/popover/toast material declarations were removed. An explicit native-dialog overlay maximum width retains the approved phone panel bounds.

These are local automated browser and visual checks. They do not establish physical-device performance or screen-reader certification.
