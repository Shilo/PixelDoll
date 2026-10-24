# Bronze UI 0.2.0 — shared appearance belongs upstream

2026-10-23. This supersedes the narrow ownership classification in the 0.1.1 report. A recipe need not be a package defect to belong in the theme: reusable appearance also belongs upstream.

## Ownership

Bronze UI now owns filled/outline/tile/quiet action appearance; pressed, selected, hover and disabled states; tab indicators; field and native dropdown materials; focus outlines; palette selection rings; paired-control seams; dialog surfaces; and semantic sheet, scene-reading, diagram and gesture materials. The light/dark values and accessibility fallbacks live in the theme repository, not this prototype.

The prototype maps its controls to those recipes in `bronze.mjs`. It retains workflow behavior, labels, layout, target dimensions, responsive typography, stage positioning, popup placement and gradient geometry. Scene art and sprite colors are application content. Screen-specific semantic text hierarchy remains local. The optional package document reset is not imported. Components are imported unlayered after local geometry styles; no local control appearance recipes compete with them.

Source: [Bronze UI](../../../../../../bronze-ui/README.md), [style guide](../../../../../../bronze-ui/docs/STYLE-GUIDE.md), [upstream extraction review](../../../../../../bronze-ui/docs/EXTRACTION-0.2.0.md). Release commit: `d811d35`.

## Deliberate visual differences

The palette, fonts, scene art and sprite pixels are unchanged. Shared primary-button hover uses an inset contrast cue rather than a consumer brightness filter. Read-only fields now show the package's dashed boundary. Dialog content uses the package's opaque work surface rather than the translucent floating-menu surface. Creator Appearance/Prompt tabs use the same selected weight as other navigation. These are intentional shared conventions, not new screen layouts.

## Preventing recurrence

- Fix shared appearance in Bronze UI, test its independent showcase/contracts, publish an immutable version, then update the dependency and lockfile here. Never edit installed package files.
- `verify-theme-ownership.mjs` parses all three consumer stylesheets and rejects known control material/state declarations, including nested media rules. It includes negative fixtures. This is an ownership tripwire, not a complete CSS correctness proof.
- `verify-bronze.mjs` runs that guard and verifies the release URL, lockfile version, installed CSS hashes and the actual CSS served by Vite. Restart the prototype server after package upgrades.
- The upstream no-reset fixture tests hostile host foregrounds, compact consumer dimensions, action states, focus, joined pairs/singletons, dropdowns and dialogs independently of PixelDoll's CSS.
- Keep browser interaction/composition checks and matched screenshot review. Package correctness alone cannot prove screen layout correctness.

## Evidence

Before: immutable captures from `ac192d3` with Bronze UI 0.1.1. After: the published 0.2.0 dependency. Desktop 1920×1080 and phone 450×800, dark/light, all screens and transient states. Original evidence remains unchanged.

[Comparison gallery](http://127.0.0.1:5202/polish-review.html?round=theme-0.2.0&device=mobile&theme=obsidian&screen=preview).

Verification completed:

- Bronze UI: zero Svelte errors/warnings, build and isolated packed CSS/Svelte consumers passed. Chromium and WebKit each passed 48 showcase combinations, four new appearance/geometry cases, the original form contract and eight code/native-picker cases.
- Prototype: 26 regression combinations and six focused phone combinations passed in each browser. Focused screenshot contrast checks measured normal creator text at least 5.09:1. Existing keyboard, character switching, centering, menu dismissal, joined controls and dropdown interaction checks passed.
- Published dependency: eight appearance/viewport cases passed, including CSS byte identity between installed package and running server. The source guard passes and rejects negative examples, including the original tab-state selector pattern caught by final review.
- Production PixelDoll build and distribution guard passed. The existing large-bundle advisory remains; no Studio styling was migrated.
- Evidence: 68 matched states plus 12 supplemental states per capture; all 160 source image hashes/dimensions and 17 runtime hashes verified. No measured major layout box changed by more than 1px. Desktop creator and phone preview comparisons were visually reviewed, along with the live creator/customization UI and public showcase in the Codex browser.
- Intentional visual details are listed above. The GPT-6.1 Sol High final review found no remaining UI blocker. Its source-guard coverage finding was fixed with an ARIA-state negative test.
- [Release workflow](https://github.com/Shilo/bronze-ui/actions/runs/40023255862) and [Pages workflow](https://github.com/Shilo/bronze-ui/actions/runs/40023252951) succeeded. The public showcase includes the new host-sized action specimens. Installed [v0.2.0 archive](https://github.com/Shilo/bronze-ui/releases/tag/v0.2.0); lockfile integrity is recorded in bronze-verification.json.
