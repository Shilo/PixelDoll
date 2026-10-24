# Approved mockup / playable parity review

2026-10-23. Review only; implementation belongs to the lead. Compared `round-5-mockups/render.mjs` with the initial round-six CSS/rendering source and inspected all four same-resolution `evidence/parity-before/*-comparison.png` sheets: five screens × two devices × two appearances, **20 visual pairs**. Also opened individual approved/prototype selection, Preview, Top-down and Side-scroller images at full size. Lead corrections were underway during review; findings below describe the preserved **before** baseline, not the final implementation.

## Main finding

The user's typography concern is supported by source and images. The playable retains the broad composition but systematically shrinks desktop controls and typography, weakens selected-tab weight, narrows the equipment region and reduces hero emphasis. This is a parity regression, even though the initial prototype remains usable. Both rounds specify **Georgia for display headings and Segoe UI for controls**; restoring scale, hierarchy and weight is the appropriate correction. A new font family or aesthetic redesign is unnecessary.

Desktop values below are actual px at 1920 × 1080. Approved phone images are 900 × 1600; phone values are normalized to a 450 CSS px viewport by dividing mockup values by two. The new comparison images preserve the same output dimensions; raw image pixels must not be mistaken for CSS font size.

| Element | Approved desktop → initial playable | Approved phone → initial playable | Priority / action |
| --- | --- | --- | --- |
| View tabs | 23 → 15 px; active weight 600 → inherited normal | 14.5 → 12 px; active weight also lost | **P1:** restore type and 600 active hierarchy. |
| Identity eyebrow / prompt | 20 / 21 → 13 / 13 px | 12.5 / 12.5 → 11 / 11 px | **P1:** restore supporting text rather than relying on a large name alone. |
| Character name | 58 → max 54 px | 24.5 → 29 px | Desktop reduction is modest; phone name is already larger. Do not blindly enlarge every phone heading. |
| Wardrobe modes / categories | 21 / 19 → 13 / 12 px | 14.5 / 13.5 → 12 / 11 px | **P1:** restore legible labels and selected mode weight. |
| Item title / count | 23 / 18 → 18 / 12 px | 15.5 / 12.5 → 14 / 11 px | **P1–P2:** recover the intended hierarchy. |
| Item labels | 19 → 13 px | 13 → 11 px after the compact-phone override | **P1:** restore labels with room for real item names. |
| Primary action label | 21 → 15 px | 14.5 → 12 px in compact wardrobe | **P1:** restore action salience. |
| Selected library row | 23 → 16 px | Full list intentionally hidden in portrait | **P1:** scale desktop list to match the scene; retain mobile cast navigation. |
| Equipment region | 414 px wide, 56 px right margin → 310 px, 32 px | Bottom zone starts around 61.5% → 62% after local refinement | **P1 desktop:** restore width/margins. Phone zone start is already close; avoid unnecessary relocation. |
| Item card | 198 × 172 → about 149 × 139 px | 130 × 83 → about 131 × 88 px | Desktop cards shrank materially. Phone cards are close; the smaller content within them is the issue. |

The prototype equipment images fit an uncropped 64 px cell into a 116 px desktop / 82 px compact-phone box. Approved thumbnails use occupied artwork at a larger scale. Helmet/hat art therefore looks much smaller even where phone card bounds match. **P1–P2:** restore useful occupied-art scale for thumbnails. A thumbnail crop is acceptable; preserve the fixed frame/pivot for the animated world actor.

## Screen-by-screen verdict

Each row was inspected in both Obsidian and Porcelain. Shared-source changes affect both appearances consistently; no theme-specific font system is needed.

| Screen | Desktop comparison | Phone comparison |
| --- | --- | --- |
| Characters | **Worse:** compressed library, smaller actor/name context and CTA pulled up below the three demo rows instead of near the lower right. Selection hero scale is 9× in the mockup versus 7× from the initial 1080p formula; side actors are proportionally too competitive. | **Worse:** selected actor scale is 4× normalized versus 3×; the cast hierarchy weakens. Name text is not too small. CTA is wider and lower than approved; restore deliberate placement without recreating a fixed six-character limit. |
| Create character | **Worse:** form labels 19–22 → 13 px; input values 22 → 15 px; size diagram width 228 → 180 px; direction preset grouping becomes more compressed. | **Worse:** too much horizon/material remains visible through the reading region. The mockup adds strong local backing behind the long form. **Better/intentional:** genuinely scrollable form rather than separate still continuation views. |
| Preview | **Worse:** modes, item art, labels and playback strip become miniature within the large scene. Studio actor 8× → 7× at 1080p. | **Mixed:** world framing and actor scale remain broadly comparable; the initial screenshot's different outfit is not a scale defect. Labels and thumbnails shrink. Recent three-column None/item layout restores the approved equipment structure. |
| Top-down | **Worse:** shared typography/control shrinkage. **Intentional:** real continuous world-coordinate ground replaces a still plate; exact seam arrangement need not match. | **Worse:** smaller category/mode/item text. **Intentional:** active joystick appears at touch location rather than permanently occupying the pictured mockup position. Device hint should say drag in the world, rather than only WASD/arrows. |
| Side-scroller | **Worse:** shared typography/control shrinkage. **Intentional/better:** open Preview atmosphere and continuing floor remove the earlier enclosure/pillar mismatch and support real travel. | **Worse:** shared label/thumbnail shrinkage. **Intentional:** lower ground horizon suited to live side movement, actual available side frame, temporary joystick and camera motion. No demand to restore a stationary perspective image. |

## Gradients and scene contrast

**P1 local fix:** the initial mobile creator uses the global studio scrim, fading to transparency through the middle of the form. In both appearances, the horizon and textured floor compete behind the Enhance/details/traits region. The approved creator applies approximately 95% local surface backing beginning around raw y=340. Restore a strong **creator-only** reading gradient/backing, retaining atmosphere at the margins. Do not place a new global overlay over actor pixels. Desktop creation likewise benefits from the intended local backing once form scale is restored.

Static Selection and Preview retain the chosen stage material and recognizable theme identity. The initial top-down repeated patch is more uniform and the side horizon has denser seam convergence than the illustrated plate, but these are renderer differences needed for a continuing surface. Check shimmer/repetition while moving and keep seam contrast restrained; they do not justify replacing the approved scene or adding props. The current core regression is UI scale and reading support, not a need for a new world aesthetic.

## Required addition versus intentional differences

- **New user requirement:** south-facing character thumbnails in library/switcher rows. The approved round-five list was also text-only, so describe these as an added requested improvement, not restoration of a pictured detail. Use the actual dressed south frame; give image and name enough space after widening the list. Keep the three demo outfits truthful.
- **Keep:** exact composed body/equipment pixels, fixed animation pivot, source shading, no theme tint/shader on the actor, authorized mirrors, real coverage hiding/restoration, code-only optional reflection and no effect toggle. The still mockups cannot define a frozen frame for every animated screenshot.
- **Keep:** unconnected paid generation, account, import/export and recolor actions are explicit prototype limits. Disabled Enhance/Create and truthful draft-only copy are deliberate; brightening them to imitate functional spending would be misleading.
- **Keep:** three actual demo outfits instead of six illustrative names, honest absence of persistent user storage, and prototype scope wording in place of “Saved on this device.”
- **Keep:** short-landscape right equipment, real scrolling, touch cancellation and keyboard focus support. They refine the approved responsive intent rather than introducing another dashboard.

## Verification after corrections

Capture the same 20 states again with the same dimensions, selected Adventurer outfit, south-facing still/defined frame, collapsed equipment state, menu closed and no stale transient notices. Pair each with its corresponding approved image; do not use changed outfits or playback phase to judge color/scale. Review all four resulting comparison sheets, then inspect any clipping or contrast concern at full size. This note records the actionable baseline; final parity must be assessed from the **after** images and current source.

## Final review of corrected comparisons

Inspected all four `evidence/parity-after/*-comparison.png` sheets against the before evidence and approved images. These cover the 20 core pairs plus Size/Camera and Directions creator scroll views in both phone appearances. Also opened corrected Obsidian mobile Preview, Porcelain mobile Directions and Obsidian desktop Create at full size, and read `parity.css` plus the current thumbnail/menu source.

**Verdict: no blocking visual regression found in the corrected comparison set.** The desktop rail is back to 414 px at 1920 px, key studio type reaches the approved 19–23 px range, and selected tabs regain weight 600. The selected actor, anchored character CTA and larger occupied-art equipment thumbnails restore the intended emphasis. Phone modes/categories/items regain readable hierarchy while the None option, palette and item actions fit within the compact equipment region. Creator-specific backing removes the competing horizon from the form's reading area. These corrections retain the approved immersive composition.

South-facing dressed thumbnails are visible in the desktop character rows. Current source explicitly composes Walk / south / frame 0 and reuses the same row function in the character switcher, supporting the requested addition there as well. The overflow now contains **one Light mode or Dark mode action**, according to the current appearance, with no Appearance group; this follows the user's latest instruction.

Describe the result as **restored visual hierarchy and corrected regressions**, not pixel-identical reproduction. Small responsive spacing/heading differences, live floor projection/camera, current animation frame, three actual demo outfits, scrollable form continuation, disabled generation and prototype-only copy remain deliberate. The Directions screenshot captures a scroll position with the Seed field continuing behind the fixed footer; it does not establish that the whole field is visible at that moment or that scrolling is broken. Any claim that every field is operable requires the parent's interaction checks, not this still-image review.

No additional aesthetic changes are requested. This is a visual parity review, not an independent certification of motion, accessibility, all breakpoints or production workflow integration.


## Lead final verification

Subsequent spacing-only refinements and regenerated captures show the complete Camera select in the mobile Size view and the complete Seed input in Directions, in both themes. The lead inspected the full-resolution final files. Text and 44 px mirror widths were preserved; geometry gaps/guide and compass spacing were reduced. All 15 browser checks passed after this final CSS change.
