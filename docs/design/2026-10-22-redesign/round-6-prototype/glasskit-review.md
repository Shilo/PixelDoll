# GlassKit adoption challenge and implementation review

2026-10-23. Independent reviewer research for the isolated round-six experiment. The user explicitly authorizes trying GlassKit here; this does not migrate production Studio. This review owns no implementation files. Final status: **restrained implementation recommended for this isolated proof; review findings corrected; no remaining blocker within the reviewed scope**.

## Recommendation before implementation

Keep the immersive world as the dominant surface. Trial one restrained floating playback group and the temporary overflow/popover, dialog and toast surfaces. Keep character information, item artwork, equipment labels, tabs and world presentation visually open. Use native form elements on quiet, substantially opaque fills; do not give every Creator field an independent glass lens.

This is a design judgment, not an Apple requirement: the existing world already establishes depth, and the primary task is comparing tiny, exact sprite pixels. Repeated shiny boundaries compete with that task. The approved 5/8/10 px geometry, Georgia headings, Segoe controls, bronze accents and Obsidian/Porcelain palette should remain recognizable. A dependency is useful only if its selected components improve those tasks without requiring a parallel theme system.

## What official guidance actually supports

Apple places Liquid Glass in a separate functional layer for navigation and controls, recommends using custom effects sparingly, and distinguishes more legible regular glass from clear material over rich media. Text-heavy temporary surfaces therefore need substantial tonal support. A visually busy world is not, by itself, a reason to make every surface clearer. [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials).

Apple's presentation describes background-responsive tint, contrast and optical behavior, including independent adaptation of light/dark material and accommodation for accessibility preferences. Plain CSS glass does not inherit those operating-system behaviors. We must judge GlassKit as its own web implementation, not presume Apple's native guarantees transfer. Apple also describes avoiding competing glass layers and maintaining one coherent functional plane. [Apple: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/).

The gaming/editor fit is an inference from the existing PixelDoll task, rather than an Apple endorsement: playback is a good bounded media-control use; a wardrobe full of reflective item cards weakens direct artwork comparison. Do not apply a filter, opacity or blend effect to actor canvases or their ancestors. Material behind text is separate from alteration of source artwork.

## Upstream facts checked

The live npm registry and direct GitHub fetch on 2026-10-23 identify **1.30.0**. Reviewed upstream main commit: `9be4ef3a801331cfdf0ec6de0c7fb964db6febc6`. Search/browser caches returned older raw files and documentation headers; the live homepage said 1.30.0. Pin an exact release locally and record its checksum/license instead of using `latest` or a moving CDN. [Package registry](https://registry.npmjs.org/@jungherz-de/glasskit/latest), [reviewed upstream revision](https://github.com/JUNGHERZ/GlassKit/tree/9be4ef3a801331cfdf0ec6de0c7fb964db6febc6).

GlassKit is a dependency-free CSS foundation with optional droplet JavaScript and separate Elements/Web projects. Its documented defaults use larger rounded geometry and transparent surfaces; its solid-surface and compact-density options can be customized. Do not bring in Elements, Astro, the sample background or droplet behavior for this proof. They add no needed functionality to the current native controls. [GlassKit documentation](https://glasskit.jungherz.com/docs.html), [project README](https://github.com/JUNGHERZ/GlassKit).

Source inspection found an explicitly acknowledged default primary-text contrast problem, 14/16/24 px input/button/card radii, individual field blur, and `outline:none` in component rules. It has component-specific reduced-motion handling, but no reduced-transparency, forced-colors or filter-support queries. These are integration concerns, not proof the proposed implementation fails. Map on-primary ink and restore focus explicitly; do not assume setting bronze alone is enough. [Reviewed GlassKit CSS](https://github.com/JUNGHERZ/GlassKit/blob/9be4ef3a801331cfdf0ec6de0c7fb964db6febc6/glasskit.css).

## Placement decisions and objections

| Surface | Trial decision | Specific challenge / acceptance evidence |
| --- | --- | --- |
| Preview playback | Good candidate, one group | Preserve compact position and legibility over light/dark ground. Parent owns the material; child controls remain flat. Show no extra bloom or moving lens. |
| Overflow / prompt disclosure | Good candidate | More opaque than playback if text-heavy. Opening must cancel movement; Escape/Backspace and focus return must still work. |
| Modal | Conditional | One readable dialog surface over a dimming backdrop. Avoid two nested blur layers; maintain native focus containment and a visible close control. |
| Toast | Conditional | Persistent enough to read; no essential result available only in a briefly displayed toast. Glass cannot substitute for live-region/status behavior. |
| Creator fields | Prefer flat fill | Independent lenses repeat throughout an already dense form and add filters. Use native controls; preserve labels, font sizes, number steppers, select popup and editing shortcuts. |
| Studio view/equipment modes | Keep existing treatment | Bronze plus weight and underline already express selection. A pill/droplet bar would change approved hierarchy and can collide with scene shortcuts. |
| Item cards, swatches, character metadata | Keep open | Artwork remains exact and comparable; selection/focus outlines must stay visible through scrolling. |
| Wardrobe sheet/rail | Keep existing treatment initially | A broad frosted panel would hide more world than the accepted gradients. Reconsider only with before/after evidence showing a task improvement. |
| Background / world / sprite | Never glass content | Maintain full world composition, integer scaling, original colors and unlit actor pixels. |

## Checks that can overturn the trial

1. **Typography or geometry drift.** Import order must not silently shrink labels, replace display typography, round every control or change native button semantics. Compare the same viewport and scene state before/after. Broad rectangular fills that merely look fashionable do not justify the added paint.
2. **Dynamic contrast.** Inspect playback, menu, modal and fields against bright horizon, dark ground and moving content in both themes. Measure text against the final composite, not just CSS color tokens. WCAG AA calls for 4.5:1 normal text and 3:1 large text; required component/state cues also need 3:1. A quiet divider does not automatically need the component threshold. [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
3. **Fallbacks.** Reduced transparency should produce opaque, readable surfaces with no blur; increased contrast and forced colors should retain real borders, selected indicators and focus. Unsupported-filter fallback must be readable without blur. Reduced motion should remove decorative material transitions. Do not add another user settings menu solely for this trial. Browser support for reduced-transparency preference is not universal, so default readability remains necessary. [MDN reduced transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency).
4. **Layering and interaction.** A backdrop filter creates a stacking context and can establish a containing block. Verify popover/dialog placement, overflow, hit testing, focus rings, mobile scrolling and the second-finger equipment interaction. Keep decorative pseudo-elements pointer-transparent. Test native Enter/Space, text editing, Escape and Tab before adopting any sample markup. [Backdrop filter behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter).
5. **Performance.** Screenshots cannot demonstrate frame pacing. Compare identical live-motion runs with glass enabled/disabled; count active filter regions, measure frame intervals and inspect mobile hardware before claiming no regression. Avoid full-viewport blur and stacked filters. The static glass asset byte size is not the rendering cost. Chrome's guidance explicitly warns backdrop filters can harm performance. [Chrome/web.dev backdrop-filter guidance](https://web.dev/articles/backdrop-filter).
6. **Original actor colors.** Re-run the existing opaque-source-RGB check in both themes. Also inspect visual overlap: a filter on an overlay can distort an actor behind it even when the actor canvas's own pixels stay exact. Do not claim canvas sampling alone proves the displayed sprite is unchanged everywhere.

## Initial review conclusion

The strongest case for GlassKit is limited, coherent treatment of temporary functional surfaces, while the existing open immersive composition remains intact. The weakest case is adopting its full component visual language, then accumulating overrides to reconstruct the approved PixelDoll design. Compare the concrete implementation before deciding whether the library earns its maintenance cost.

At the initial research pass, implementation screenshots/code had not yet been reviewed. The independent implementation and correction reviews below supersede that preliminary status. No accessibility or performance certification is implied by this document.

## Independent implementation review

Reviewed `material.mjs`, `glass-theme.css`, `theme.mjs`, `index.html`, dialog/render paths in `main.js`, unmodified vendored CSS and `verify-glass.mjs`. Reviewed paired baseline/restrained screenshots for both desktop Previews, both phone Previews, dark desktop Creator, light phone Creator, dark desktop/light phone menus and dialogs, dark phone/light desktop toasts. Also compared dark desktop and light phone rounded Preview pairs. Baselines were captured before the implementation, rather than reconstructed by deleting visible classes afterward.

Independent runtime spot checks used Node 24.22.1 and the project's managed Chromium, at 450 × 800 and 1920 × 1080. These supplement the lead's wider verification; they do not duplicate the complete suite or test physical mobile GPUs.

### Design verdict

**Choose restrained as the default.** Its playback rim and shadow supply a clearer boundary against the Porcelain floor while the world, actor and wardrobe still dominate. Menu/dialog surfaces gain useful separation without changing their content structure. The typography and open equipment hierarchy otherwise remain recognizable. Solid bronze primary actions are coherent beside glass utility surfaces; consistency of hierarchy and interaction matters more than making every button translucent.

The rounded variant is useful comparison evidence, but its segmented navigation makes the interface noticeably busier. In the desktop pair, the view choices also contract into a tighter, smaller-looking group. In the phone pair, the pill sits immediately under the prompt and reads as another heavy horizontal boundary. Neither improves the character comparison task. Do not promote it to the default on the strength of the word “Apple”.

The restrained 8/12/16 px radii are an acceptable modest softening in the reviewed frames, **not preservation of the previous 5/8/10 px contract**. This judgment is visual, not a measurable usability advantage. Update the shared design contract if retained. The 16/24/24 alternative softens the primary action and playback group more than this pixel-focused editor needs. No additional pill conversions are warranted.

The Creator becomes visibly more outlined after import. Most of that change comes from moving tokens to the root, which repairs previously invalid border aliases; it is not an intrinsic GlassKit benefit. Real field boundaries improve affordance, but the form's compass/preset outlines are now more visually active. Keeping their geometry restrained and avoiding per-field blur contains that cost. Removing accidental item/None borders was the correct correction: equipment artwork stays open to the world.

### Findings raised with the implementer

| ID | Priority / state at first inspection | Finding and evidence | Requested response |
| --- | --- | --- | --- |
| G1 | Medium, correction required | Mobile field fonts regress: baseline Name/textarea/custom-size are 15 px; both new variants yield 13/14/14 px. Selects remain 15 px. Desktop stays 20 px. Independent computed-style check confirms the screenshot impression; `--gl-font-size-base: inherit` makes some controls inherit smaller label text. | Restore mobile field text at shared component/context level; retain desktop 20 px. Add an assertion that would catch the observed regression, and refresh affected Creator evidence. |
| G2 | Medium, evidence gap | The original 120-frame Top-down measurement moves east with default helmet and no toast/menu. Restrained has no active blurred surface in that state, so this compares gameplay with little of the new material cost. | Keep it as a gameplay smoke check; add playing Preview and/or northward movement with the Wizard-hat coverage toast visible. Report headless timing as a smoke measurement, not a GPU benchmark or proof of no regression. |
| G3 | Low, correction justified | Reduced-contrast/transparency fallback uses `blur(0px)`. Its visible blur disappears, but the filter remains non-`none`, including its stacking-context behavior. | Use explicit `none` for these fallback surfaces and test the resulting computed style. This simplifies the stated guarantee that filters are removed. |
| G4 | Accessibility limitation | Normal-state field borders use low-opacity muted colors. Their visible improvement over baseline does not prove required field identification reaches 3:1. Light-mode fields in particular remain subtle. | Measure the final composite if claiming WCAG non-text compliance; if the border is the identifying cue, strengthen a **field-specific** border rather than every decorative material rim. |
| G5 | Existing keyboard limitation | Enter on focused Export, Escape, then one animation frame leaves focus on `BODY` in both baseline and restrained. `showDialog` rerenders/removes the opener before native `showModal` can remember it. | Either restore the invoking action explicitly or document the inherited limitation. Containment/Escape checks alone cannot establish a complete native focus lifecycle. |

G1–G5 were sent to the implementer before final evidence. The resolution pass below records independently checked corrections rather than assuming that accepting a request verifies it.

### Confirmed strengths and bounded conclusions

- Parent-only playback material, flat child controls, no nested field blur, no droplet JavaScript and no aurora/background replacement follow the selective scope.
- The root bridge uses the actual Obsidian/Porcelain tokens while GlassKit receives dark/light identifiers. Primary ink is mapped to the existing contrast-conscious ink role and the gradient is reduced to solid bronze.
- Keyboard modality spot check: baseline Export has no visible outline because the old alias was invalid; restrained produces a solid 2 px bronze outline. This is a verified improvement. Text field checks alone would have missed the button distinction.
- Native `dialog.showModal()` and the named heading are retained. The full-screen wrapper now has `backdrop-filter:none`, with blur confined to the content panel; upstream makes the native `::backdrop` transparent, so the overlay does not accidentally double the dimmer.
- The coverage toast's important message remains in the wardrobe after the temporary toast disappears, as shown in the northward-movement evidence. Its status live region remains in `index.html`.
- New field outlines add approximately 2 px to desktop outer heights because the old border aliases did not resolve. The reviewed form remains scrollable; do not describe the before/after as geometrically identical.

### Remaining acceptance limits

The screenshots support selecting the restrained direction. They do not certify all transparency/contrast/motion preferences, zoom states, screen readers, physical-device performance or Safari/Firefox rendering. The lead's automated scenarios should state exactly what they cover. Verify byte size from the vendored artifact: current upstream CSS has grown well beyond the stale small-size marketing claim; describe the actual delivered bytes rather than copying that claim.

Source actor pixels and the full world are unchanged by the adapter; existing RGB tests still need to remain green. A material overlay can intentionally obscure art behind its rectangle, so exact source-canvas checks alone must not be described as proof that every displayed sprite pixel is untouched beneath all overlays.

## Final correction verification

Read the fresh source after the lead's corrections and independently repeated runtime checks in **eight combinations**: restrained/rounded × Obsidian/Porcelain × 450 × 800 / 1920 × 1080. All spot checks passed. No implementation source was edited by this reviewer.

| Finding | Final outcome |
| --- | --- |
| G1 typography | **Closed.** The unchanged vendor stylesheet is imported in the named `glasskit` cascade layer, allowing established unlayered typography to win. Name, details and custom-size fields are independently confirmed at **15 px on phone and 20 px on desktop**, in both variants and themes. Field filters remain `none`. This is a cleaner correction than per-field font overrides. |
| G2 performance evidence | **Closed as an evidence gap.** Fresh test source now measures playing Preview plus continuous northward movement while the real missing-equipment toast is visible. The current successful report contains all six material/scenario samples. These are relevant headless smoke samples; physical-device/GPU performance remains unproven. |
| G3 actual filter removal | **Closed.** Isolated CDP emulation of reduced transparency reports a matching media query, opaque playback background and computed `backdrop-filter:none` on playback **and menu**, independently checked in all eight combinations. Fresh source also applies explicit `none` for increased contrast and forced colors. |
| G4 field boundaries | **Addressed for the controlled design.** Dedicated opaque field-border colors now mix muted at 74% with the theme surface; fields use a 92% fill. Analytical boundary contrast against their own theme surface is approximately **4.87:1 dark / 3.31:1 light**. Decorative panel rims retain their quieter 38% opacity. The text bound in the test is separately valid: muted text over a worst-case 92% backing remains **6.04:1 dark / 4.85:1 light**. Do not conflate text and boundary guarantees. |
| G5 dialog focus return | **Closed for the reviewed Export path.** The handler remembers the invoking `data-action` before rerender, then focuses the replacement control on close. Independent keyboard tests confirm solid 2 px bronze focus and restoration to Export after Escape in every combination. |

The light field boundary would be approximately 2.77:1 against a hypothetical pure-black backdrop transmitted through its 92% fill. This is not a blocker for the current controlled bright Creator environment, but it means the boundary result must not be advertised as a universal 3:1 guarantee over arbitrary imported/dark content. Likewise, explicit opener restoration for actions that disappear with their popover should not be assumed from the Export check alone.

The lead is recapturing final screenshots after these corrections. Earlier pairs remain the basis for the layout/geometry preference; final typography, field fill/border and fallback outcomes above are verified directly from fresh browser computation. The initial mobile typography screenshots therefore must not be delivered as evidence of the corrected field sizes.

**Final verdict:** retain the restrained 8/12/16 direction and open underlined navigation as the default; retain rounded only as a comparison. The limited glass treatment has earned a trial in this isolated proof. The remaining limits concern production integration, full accessibility evaluation and physical-device performance, not an unresolved blocker to presenting this experiment.
