# Isolated immersive character playground

Current ownership contract: [Bronze UI 0.2.0](./theme-ownership-0.2.0.md). Shared appearance, including scene-backing material strengths, is now upstream; consumer layout remains local. Earlier entries below describe their historical state.

**Theme patch 0.1.1:** [Upstream ownership audit and verification](theme-patch-0.1.1.md). Native dropdown recipes now come from the published dependency; the More popup says Additional equipment and phone view tabs have explicit clearance below the prompt.

**Current UI foundation:** [Bronze UI dependency integration](bronze-integration.md) · [all-screen before/after gallery](http://127.0.0.1:5202/bronze-review.html). The prototype now consumes MIT `@shilo/bronze-ui` tokens and CSS recipes through one layout-preserving adapter. Dark/light modes come from the installed package. Production Studio is unchanged. The [GlassKit study](glasskit-study.md), source and captures remain historical evidence; its material URL variants are superseded.

2026-10-23. Implements the user-approved visual proof using Obsidian / Porcelain Bronze and the actual bundled S2 demo sprites. Production Studio is not integrated or changed by this prototype.

**Shared implementation contract:** [Immersive design system](../../immersive-design-system.md) documents theme values, typography, geometry, responsive rules, Preview keyboard behavior and module ownership. Shared controls, creator/equipment renderers, input/direction rules and theme tokens now have dedicated modules; styles.css replaces the previous two-sheet override stack. Latest verification: **12 unit tests and 18 browser checks**.

**Visual refinement:** [Direct mockup/live comparisons and exact change record](comparisons.md) cover all five screens in both themes and viewport layouts, plus mobile creator scroll states. Larger typography, restored hierarchy, south-facing character thumbnails and one conventional Light mode / Dark mode action supersede the first playable iteration. Latest verification: 12 unit tests and **18 browser checks** passed.

## Run and try it

From the repository root, with Node **24.22.1**, installed app dependencies and the local round-five environment PNGs:

```powershell
node docs/design/2026-10-22-redesign/round-6-prototype/run.mjs
```

Open **http://127.0.0.1:5202**. The server binds only to localhost, disables Vite environment-file loading and uses neither the app server configuration nor PixelLab credentials. It imports the existing fixture loader/compositor directly. There are no paid requests, project writes or production storage changes. Only this prototype's appearance preference persists.

1. Select an actor in the world, then Customize. The three actors are outfit variants of the same genuine demo body, not newly generated characters. Click the character name to switch actors.
2. In Preview, select Walk or Cross-punch, play/pause and use WASD/arrows or the facing buttons. Directions come from the character, not the selected animation. Missing clip/facing frames show an explicitly identified still for that facing; the requested clip remains selected and the world stays still.
3. In Top-down, use WASD/arrows or press and drag anywhere in the world outside controls. Side-scroller uses horizontal movement. Position changes continuously while authored animation frames play at their stored timing; the camera follows.
4. Change equipment while moving. On touch screens, the first world finger owns movement and a second finger can operate equipment. Release stops movement. Modal opening, blur, hiding the page, view changes and resizing also clear input.
5. Open the overflow menu and choose **Light mode** or **Dark mode**. One action shows the destination mode; there is no Appearance category or named-theme selector. New character opens the editable visual form; generation is deliberately disabled.

Views and character changes reset world position for repeatable comparisons. This proof has no jumping, combat, collisions, elevation or scene objects.

## Consistent world and exact actors

All six round-five environment plates were visually reviewed. Porcelain Side-scroller was corrected to remove the pillars/ribs and retain Preview's open ivory atmosphere and bronze floor. All **32 screens and four boards** were re-rendered after the correction under Node 24.22.1. See [correction provenance](environment-correction.json) and the [image index](../round-5-mockups/image-index.md).

The playable implementation shares each theme's Preview source for its atmosphere and surface material. Top-down and Side-scroller use distinct camera projections over continuous procedural ground. This keeps the same world identity across modes without stretching a static screenshot to simulate travel. There are no added structures, grid switches or bounds controls.

[config.js](config.js) independently maps background URLs for selection, creation, Preview, Top-down and Side-scroller. Decoded images are cached by URL, so equal sources survive screen changes without another image load. Different replacement sources may require tuning the horizon and material sample rectangle.

The environment uses WebGL 2; actual actors use a separate, unlit Canvas2D layer with nearest-neighbor integer scaling. Themes and gradients do not shade, tint or recolor the body/equipment. The fixed 64 px frame and bottom pivot remain stable between animation frames. Reflection is a separate faded, flipped copy with contact at the same pivot, controlled only by `REFLECTION` in config.js. Disable it globally or per supported view in code; there is no user-facing reflection toggle.

## Coverage and scope

The fixture provides Walk in south/east/north and authorized mirrored west, plus south-only Cross-punch. It has no Idle clip or stored rest views. Stopping therefore displays a valid Walk still. The Wizard hat has no north Walk coverage: it temporarily disappears while remaining equipped, then restores on compatible movement. Transparent frames inside a valid sequence remain legitimate; an entirely empty legacy item sequence is treated as absent.

The resolver uses velocity, declared directions, angular proximity and stable previous-facing tie breaks. Missing movement presentation falls through suitable Walk, Idle and valid still artwork while movement continues. Tests include intentional one/two-direction rigs and unexpected gaps. This fixture adapter is not a complete production importer, and this proof does not exercise the full production stored-rest/anchor formats described in the [resolver specification](../round-4-discussion/animation-resolver.md).

Equipment selection, None, outfits and Undo operate locally. Import/export, new equipment, saved designs, palette editing, account/costs and paid enhancement/generation are unconnected and identify that limit in the UI. The creator demonstrates controls, input and layout; it is not a replacement for the production creator's validation, enhancement or save pipeline. Prompt disclosure currently uses click/tap/keyboard activation; optional hover behavior remains future integration work.

## Verification and evidence

Run while the isolated server is active:

```powershell
node --test docs/design/2026-10-22-redesign/round-6-prototype/motion.test.mjs
node docs/design/2026-10-22-redesign/round-6-prototype/verify.mjs
node docs/design/2026-10-22-redesign/round-6-prototype/verify-bronze.mjs
```

Playwright uses the existing app dependency and installed managed Chromium. Set `PLAYWRIGHT_BROWSERS_PATH` to the local managed-browser directory if necessary. Validation under Node **24.22.1**: **12 unit tests, 18 existing browser checks and eight Bronze theme/viewport cases passed**. [Behavior report](verification.json) · [dependency/theme report](bronze-verification.json).

Browser checks cover animation playback, background reuse, exact opaque source RGB in both appearances, continuous movement/camera, normalized diagonals, stopping/blur, item hiding/restoration, reflection disabling without actor changes, responsive overflow, real multi-touch equipment use and pointer cancellation. No page errors or external requests occurred in the primary test context. This is isolated-prototype validation, not a production app build or full accessibility/performance audit.

| Evidence | Image |
| --- | --- |
| Obsidian selection | [Desktop](evidence/desktop-obsidian-selection.png) |
| Obsidian Preview | [Desktop](evidence/desktop-obsidian-preview.png), [phone](evidence/mobile-obsidian-preview.png) |
| Porcelain Preview and matching Side-scroller | [Preview](evidence/desktop-porcelain-preview.png), [Side-scroller](evidence/desktop-porcelain-side-moving.png) |
| Top-down | [Desktop](evidence/desktop-obsidian-topdown.png), [landscape](evidence/landscape-porcelain-topdown.png) |
| Creator draft | [Desktop](evidence/desktop-obsidian-create.png), [phone directions](evidence/mobile-porcelain-create-directions.png) |
| Real multi-touch test | [Phone](evidence/phone-touch-tested.png) |

Two GPT-6.1 Sol / High researchers supplied [fixture/geometry findings](asset-review.md) and a [visual review](visual-review.md); the lead implemented and tested the proof. Actual-device camera comfort, long touch sessions, seam shimmer across GPUs, zoom/legibility and non-drag touch access still need evaluation before production integration. WebGL 2 is required by this prototype.

Generated backgrounds and screenshots remain local and ignored under repository policy. Source, documentation and provenance are committed. A fresh checkout must restore the local round-five PNGs before running; generation prompts alone do not reproduce identical artwork.

## Regression review

See [regression-repair.md](regression-repair.md) for the current layout/theme contract and [regression-review.html](http://127.0.0.1:5202/regression-review.html) for the preserved baseline, reported version and repaired UI. Run `node docs/design/2026-10-22-redesign/round-6-prototype/verify-regressions.mjs` for control-level regression checks.

The subsequent [composition and interaction contract](composition-polish.md) documents shared stage centering, select-then-open behavior, the **More** category, panel order, attached controls and creator contrast materials. Run `node docs/design/2026-10-22-redesign/round-6-prototype/verify-polish.mjs` for those checks. Both corrective suites accept `BROWSER=webkit` when that managed browser is installed. [Matching follow-up screenshots](http://127.0.0.1:5202/polish-review.html) retain the prior repair as their before reference.
