# Prototype regression repair — 2026-10-23

This review supersedes the earlier integration report's conclusion that visual parity established a correct UI. The previous tests missed popup paint order, native option rendering, control affordance and intermediate creator widths. Matching the old rectangles also preserved old usability defects.

## Diagnosis and decisions

- **Dependency regression:** the adapter dropped the old popup z-index. Item labels at z-index 1 painted above the new floating surface. The prototype now owns explicit popup layering; item label layers are contained inside their cards.
- **Inherited defects:** the previous adapter also removed item/None outlines, left Moves rows without a resting boundary, and overrode character/prompt menu anchors with `left:auto`. These were present before Bronze and are repaired rather than preserved for parity.
- **Creator sizing:** both historical and integrated versions used Segoe UI and Georgia on Windows. There was no demonstrated primary-font change. Existing desktop overrides made form text 20px, tabs 22px and the heading 48px. Independently positioned title and Name overlapped at 1101px and 1175px widths. Keep the font families; replace that composition with one grid and use 16px fields, 14px labels and independent 44px ordinary targets. Large scene titles and the existing scene hierarchy remain.
- **Native menus:** both versions declared the correct native color scheme, but transparent option backgrounds did not guarantee a readable OS popup. Set matched theme foreground/background colors. Progressively style the browser's native `base-select` picker where supported, retaining plain options, native selection/checkmarks/keyboard handling and browser positioning. Unsupported engines retain their system picker. This is a consumer enhancement, not a JavaScript listbox replacement.
- **Input ownership:** Escape in a focused select belongs to the select; it must not leave the screen. Animation selection restores focus to the rerendered select. Back navigation still works from the world and other existing controls.
- **Small screens:** the narrow phone playback toolbar uses two rows to retain all controls. Short landscape retains header New/Import icons because the portrait action row is hidden. Popovers scroll within the remaining viewport instead of clipping at its bottom.

The installed Bronze UI 0.1.0 token/component files match the published source. No package-level defect requiring a release was demonstrated. Keep the package and lockfile unchanged; fix the consumer's layout, layering and recipe application. No new dependency, palette copy, paid generation or production Studio change is needed.

## Ongoing styling contract

1. `bronze-theme.css` owns the adapter and native-picker presentation. Use package semantic colors, materials, radii and focus roles; do not copy a second color palette.
2. `styles.css` owns scene geometry and overlay order. `.popover` defines its viewport budget from `--popover-top`; variants set that variable and their anchor, not contradictory absolute positions.
3. `creator.css` owns the creator composition and controls. Do not add competing creator rules to the general scene media queries. Title and Name share grid tracks; the form scrolls independently of its footer. Responsive columns change before control contents require clipping.
4. Use a quiet boundary/backing for standalone item choices and action rows. Keep strong bronze selection plus the existing checkmark/pressed semantics. Navigation tabs may use text and an underline rather than boxes everywhere.
5. Ordinary field text stays 16px independently of viewport width. Touch targets and padding are separate choices. The native option rows use at least 44px; attached mirror toggles use 44px width on coarse pointers.
6. Native picker support is progressive. Do not replace native keyboard/touch semantics merely to force identical popup pixels across operating systems. Test actual open pickers in supporting browsers and test the unsupported fallback separately.
7. Verify control-level intersections, complete labels, overlay hit order, reachable scroll content and focus continuity, not just outer container bounds. Preserve historical captures and label intentional redesigns separately from regression fixes.

## Review and evidence

Independent GPT-6.1 Sol High reviews: [baseline audit](regression-audit.md), [package boundary and research](package-regression-review.md). The reviewers challenged menu anchors, picker label fitting, editor-tab selection, small-screen actions and focus restoration in addition to the reported defects.

[Three-way comparison gallery](http://127.0.0.1:5202/regression-review.html): actual pre-dependency revision `003bef2`, reported integrated prototype before repair, and repaired prototype, at matching 1920×1080 and 450×800 resolutions. The original baseline screenshots remain unchanged. Supplementary captures show the Prompt editor and opened native customizable pickers; no historical screenshot is invented where the original evidence lacks that state.

Validation results will be appended after the final stable capture and checks. Tests are local, keyless and do not claim physical-device or assistive-technology certification.

## Sources

The design follows browser semantics rather than treating a library's defaults as proof of usability. [MDN stacking contexts](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context), [native color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme), [customizable selects and their fallback](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select), [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) informed the review. A 16px field is our design decision, not an automatic accessibility certification.

Additional paired creator captures at 1175×711 and 1469×889 reconstruct revision `003bef2` through local browser request overrides. Reproduce from the repository root with `node docs/design/2026-10-22-redesign/round-6-prototype/capture-intermediate.mjs`. This preserves the current checkout and uses no remote APIs.


## Final validation

- 12 motion/input unit tests passed.
- 18 existing browser behavior checks passed after the repair, including continuous movement, camera following, real multi-touch equipment changes, reflections and original fixture RGB in both themes (1003 opaque source pixels checked in the first comparison).
- Eight dependency/theme/viewport cases passed, including focus, native schemes, contrast roles, reduced-transparency/forced-color fallbacks, dialog semantics and unchanged published package CSS hashes.
- The corrective matrix passed **26 Chromium cases and 26 WebKit cases**: both themes at 320×500, 320×568, 390×844, 450×800, 568×320, 760×800, 844×390, 1100×800, 1101×800, 1175×711, 1280×800, 1469×889 and 1920×1080. Chromium's final run additionally asserts the full-width portrait CTA and coarse-pointer mirror targets. Focused final WebKit checks confirmed the 410px phone CTA fills its 410px footer in both themes.
- Thirty additional creator select interactions and thirty Escape checks passed. Native customizable dropdowns were opened and visually inspected in the Codex browser in both themes. Unsupported OS-native picker rendering remains platform-controlled; computed fallback colors do not certify every OS popup.
- Final evidence capture ran **2026-10-23 18:54:38–18:55:45 UTC**: 68 matched states plus 12 supplements, with zero page errors/external requests and stable hashes for all 16 runtime files. The builder verified all 204 three-way source images, generated four boards and nine baseline/repair pairs; all 80 repaired PNG hashes/dimensions and gallery states were checked.
- Full-size review covered the creator at 1175/1469/1920 widths, equipment/None, Moves, popup occlusion, both appearances' open pickers, phone creator/directions/character menu and footer. The final phone review caught a real adapter specificity issue: `.bu-btn.primary` defeated the intended full-width creator CTA. The corrected selector is now covered by the tests above.

The earlier transient browser runs were interrupted by Vite reloading pages when the evidence gallery HTML changed. Capture and corrective-test contexts now disable only the development HMR client; runtime source hashes still guard capture stability. This does not alter the live prototype's behavior. Final runs completed against stable source without relaxing failed UI assertions.

Screenshots stay local under `evidence/`, consistent with the project's generated-media policy. The committed utilities, audit and style contract preserve how to reproduce and interpret the checks. The actual full app and published theme package were not modified by this repair.
