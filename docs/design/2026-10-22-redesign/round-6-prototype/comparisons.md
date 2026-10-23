# Mockup versus live prototype

2026-10-23. The user requested preserved readability, professionalism and immersion, not identical pixel placement. Each pair places the **approved image on the left** and a **real browser screenshot on the right**, without resizing either source. Desktop halves are 1920 × 1080. Phone halves are 900 × 1600 (450 × 800 CSS pixels at 2× density). A 56 px caption strip is outside the screenshots. These are actual live UI captures, not repainted mockups.

## Direct comparisons

| Screen | Dark desktop | Light desktop | Dark phone | Light phone |
| --- | --- | --- | --- | --- |
| Characters | [Pair](evidence/parity-after/obsidian-desktop-selection-pair.png) | [Pair](evidence/parity-after/porcelain-desktop-selection-pair.png) | [Pair](evidence/parity-after/obsidian-mobile-selection-pair.png) | [Pair](evidence/parity-after/porcelain-mobile-selection-pair.png) |
| Create character | [Pair](evidence/parity-after/obsidian-desktop-creation-pair.png) | [Pair](evidence/parity-after/porcelain-desktop-creation-pair.png) | [Pair](evidence/parity-after/obsidian-mobile-creation-pair.png) | [Pair](evidence/parity-after/porcelain-mobile-creation-pair.png) |
| Preview | [Pair](evidence/parity-after/obsidian-desktop-preview-pair.png) | [Pair](evidence/parity-after/porcelain-desktop-preview-pair.png) | [Pair](evidence/parity-after/obsidian-mobile-preview-pair.png) | [Pair](evidence/parity-after/porcelain-mobile-preview-pair.png) |
| Top-down | [Pair](evidence/parity-after/obsidian-desktop-topdown-pair.png) | [Pair](evidence/parity-after/porcelain-desktop-topdown-pair.png) | [Pair](evidence/parity-after/obsidian-mobile-topdown-pair.png) | [Pair](evidence/parity-after/porcelain-mobile-topdown-pair.png) |
| Side-scroller | [Pair](evidence/parity-after/obsidian-desktop-side-pair.png) | [Pair](evidence/parity-after/porcelain-desktop-side-pair.png) | [Pair](evidence/parity-after/obsidian-mobile-side-pair.png) | [Pair](evidence/parity-after/porcelain-mobile-side-pair.png) |
| Creator: size/camera | — | — | [Pair](evidence/parity-after/obsidian-mobile-creation-size-pair.png) | [Pair](evidence/parity-after/porcelain-mobile-creation-size-pair.png) |
| Creator: directions | — | — | [Pair](evidence/parity-after/obsidian-mobile-creation-directions-pair.png) | [Pair](evidence/parity-after/porcelain-mobile-creation-directions-pair.png) |

Overview sheets are scaled navigation aids; use individual pairs above to assess typography at native resolution:

| | Original versus before fixes | Original versus revised prototype |
| --- | --- | --- |
| Dark desktop | [Before](evidence/parity-before/obsidian-desktop-comparison.png) | [Revised](evidence/parity-after/obsidian-desktop-comparison.png) |
| Light desktop | [Before](evidence/parity-before/porcelain-desktop-comparison.png) | [Revised](evidence/parity-after/porcelain-desktop-comparison.png) |
| Dark phone | [Before](evidence/parity-before/obsidian-mobile-comparison.png) | [Revised](evidence/parity-after/obsidian-mobile-comparison.png) |
| Light phone | [Before](evidence/parity-before/porcelain-mobile-comparison.png) | [Revised](evidence/parity-after/porcelain-mobile-comparison.png) |

## What was worse and changed

Both versions already used **Georgia headings and Segoe UI controls**. The regression was scale, weight and spacing. Measurements below describe desktop at 1920 px width, not every breakpoint.

| Area | Before → revised | Reason |
| --- | --- | --- |
| Main view tabs | 15 → 23 px; selected weight 400 → 600 | Restore primary navigation hierarchy. |
| Identity context / prompt | 13 → 20 / 21 px | Readable information with the existing one-line disclosure. |
| Equipment modes / categories | 13 / 12 → 21 / 19 px | Clearer choices, with bronze, underline and weight for selection. |
| Equipment rail / item cards | 310 → 414 px; 139 → 172 px high | Restore room for labels and artwork; scale down responsively on narrower desktop windows. |
| Equipment artwork | Frame-centered empty padding removed in thumbnails only | Actual item pixels occupy useful space. Animated actors retain their original fixed frame/pivot. |
| Selected actor | Desktop selection 7× → 9×; Preview 7× → 8×; phone selection 3× → 4× | Restore actor prominence. Supporting actors remain smaller without tinting their pixels. |
| Character selection | 64 px south-frame thumbnails; desktop rows 94 px high; CTA anchored below list | Recognizable outfits and stable primary action. Thumbnails also update in the switcher after equipment changes. This restores an earlier-round idea requested by the user; round-five's list itself was text-only. |
| Creator desktop | Inputs 15 → 20 px; labels 13 → 17 px; tabs 15 → 22 px | Restore form readability without enlarging the already large title. |
| Creator directions | Two-plus-three preset layout and directional arrow icons restored | Avoid five cramped labels and make spatial selection easier to scan. |
| Creator mobile | Earlier form start, compact size guide, quieter local gradient | More usable content space; floor detail no longer competes with field text. |
| Mobile equipment | Modes 12 → 14 px; categories 11 → 13 px; item labels 11 → 13 px | Preserve legibility while keeping the three-card row and actions in the initial 450 × 800 view. |
| Theme menu | One Light mode / Dark mode action with sun/moon icon | Removes the Appearance heading and two named theme choices, per the user's correction. |

## Better or intentionally different

- Continuous projected floors and camera following remain. Their grid density/perspective is different from the static plates because the surface must continue during travel. The corrected open Porcelain world remains consistent; no pillars are reintroduced.
- Actual current prompt, three demo outfits, honest available directions, live fallback notices and disabled generation replace invented counts, sample text/costs and unavailable actions. A paused Preview and stopped live pose may show another authored frame than the mockup. No sprite artwork was embellished.
- Mobile keeps a scrollable equipment sheet, three item cards, practical touch targets and landscape adaptation. The creation form scrolls continuously rather than being three independent static pages. It still represents a visual draft, not the full production creator validation/help/generation pipeline.
- Reflections remain separately code-configured; original actor pixels are unchanged. No shader, theme tint or lighting is applied to characters.
- Functional gaps in the creator and unfinished full-device accessibility/performance evaluation are preserved explicitly in [README](README.md) and [creator review](creator-parity-review.md). This visual pass does not certify production integration.

## Research applied

[Microsoft's game text guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101) treats readability as size, spacing, weight, background and viewing-distance considerations. That supports fixing the hierarchy and backing rather than choosing a decorative replacement font. Its measured glyph-height thresholds are not interchangeable with CSS font-size; no XAG certification is claimed.

[W3C button guidance](https://www.w3.org/WAI/ARIA/apg/patterns/button/) distinguishes a fixed-label toggle with pressed state from a normal action button whose label changes. This prototype uses the latter: **Light mode** means switch to light, and **Dark mode** means switch to dark. It switches immediately, uses a native keyboard-operable button, and has no redundant category. [NN/g toggle guidance](https://www.nngroup.com/articles/toggle-switch-guidelines/) supports immediate application and clear labels. The internal art names remain documentation/config identifiers only.

[W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) distinguishes target area from visible icon size. Larger text is not a reason to shrink controls or remove touch padding. This pass preserves mobile mirror targets and primary actions; full target/contrast conformance was not audited.

## Reproduction and verification

Run `node docs/design/2026-10-22-redesign/round-6-prototype/capture-parity.mjs after` with the prototype server active. The script checks both images have matching native dimensions before creating each pair. It suppresses transient toasts for clear static comparison; movement and coverage notices are separately exercised by verify.mjs. Mobile captures use touch-capable browser emulation. Source screenshots remain alongside each pair.

Initial parity regression: eight motion tests and 15 browser checks, including thumbnail/update and single-theme-action checks. Research reviews: [all-screen parity](parity-review.md), [creator parity](creator-parity-review.md). Images remain local/ignored under repository policy; scripts, docs and verification are committed.

## Shared controls refinement — 2026-10-23

The latest pass preserves this visual hierarchy and consolidates colors, geometry, markup and direction handling under the [shared design-system contract](../../immersive-design-system.md). Preview WASD/arrows now select declared character facings independently of clip coverage. Missing clip directions keep the chosen facing and show a valid still with an explicit coverage note. The palette selection ring now paints outside the content edge without shifting the swatches; hover preserves artwork colors.

All 24 comparison pairs were recaptured after the refactor. Latest verification: **12 unit tests and 18 browser checks passed**; [modularity review](modularity-review.md) found no critical regression. Focused evidence: [dark palette](evidence/palette-ring-dark.png), [light palette](evidence/palette-ring-light.png), [Preview keyboard facing](evidence/preview-keyboard-north-light.png), [mobile shared controls](evidence/mobile-shared-controls-light.png). Screenshots remain local and ignored.
