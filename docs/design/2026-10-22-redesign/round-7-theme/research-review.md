# Owned Bronze theme — research and independent challenge

Reviewed 2026-10-23. Scope: the isolated owned-theme showcase and its foundation; no production migration, dependency adoption or PixelLab requests. This is the research pass. Runtime review findings, when available, belong at the end of this document and must distinguish observed results from recommendations.

## Recommendation

Use PixelDoll-owned semantic CSS and the existing native-first Svelte behavior, preserving the approved Obsidian / Porcelain palette, Georgia display headings, system UI controls, open world composition and 8 / 12 / 16 px geometry. Both appearances are first-class implementations, including native controls and overlays. Keep a small material vocabulary: open scene, quiet work surface, restrained floating surface. A successful component gallery must prove those roles under states and real reading conditions; a grid of attractive idle buttons is insufficient.

This recommendation is not based on custom code being inherently faster, more accessible or cheaper. The strongest reason is that PixelDoll already owns most approved appearance and domain behavior. Local ownership removes an adapter boundary only if the replacement stays smaller and coherent. Preserve the pinned GlassKit reference so this remains falsifiable.

## External systems: what survives challenge

| Source | Useful evidence | What does not follow | PixelDoll decision |
| --- | --- | --- | --- |
| Apple Liquid Glass | Separates floating interaction/navigation from content; uses adaptable material for legibility | A CSS blur reproduces Apple's optical system, or every panel should look translucent | Sparse floating material; opaque dense forms; original character pixels untouched |
| GlassKit | Shared recipes, token vocabulary, dark/light support; a working approved experiment | Component count proves accessibility or production coverage | Keep the reference; own only the recipes this application needs |
| Material 3 Expressive | Strong hierarchy, deliberate emphasis, semantic roles and visible state | Google's research validates this specific Bronze screen, or PixelDoll needs pill shapes and spring motion | Borrow role discipline and clear selection; keep approved identity |
| Native HTML and WAI | Browser mechanics and explicit interaction patterns | A role name implements interaction, or native markup absolves application focus/labels | Native controls first; test the remaining application contract |

Apple's current guidance reserves Liquid Glass for a distinct control/navigation layer, discourages overuse, and recommends its regular variant for text-heavy contexts such as popovers and alerts. Clear material is for rich media and can require dimming. **Interpretation:** our near-opaque floating recipe is closer to the useful hierarchy principle than a transparent pane over every equipment row. This is inspiration, not a claim of native Liquid Glass parity. [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials).

GlassKit is Jungherz's independent library. Its docs describe CSS recipes, custom properties and dark/light themes; the fetched public docs identify 1.27.0 while PixelDoll's reference pins 1.30.0. This mismatch reinforces using the local artifact as comparison evidence. CSS does not implement the product's modal, input-shortcut, selection or paid-request lifecycle. Elements provides additional real behavior, as the [previous source review](../round-6-prototype/theme-foundation-review.md) records; rejecting it as merely styling would be inaccurate. [GlassKit docs](https://glasskit.jungherz.com/docs.html).

The current official Google direction is **Material 3 Expressive**, described as an expansion of Material 3. It extends expressive shape, type, motion and component choices; it is not a reason to invent a Material 4 migration. Google's published research concerns its studied designs and tasks. It supports testing emphasis and grouping, not transferring every claimed benefit to PixelDoll. [Official introduction](https://m3.material.io/get-started), [Google's research account](https://design.google/library/expressive-material-design-google-research).

The particularly useful Material distinction is **outline versus outline variant**: important control boundaries differ from decorative dividers. Map semantic foreground/background pairs in both modes, and keep their roles stable across breakpoints. Do not import all Material tokens: three material roles and a compact application palette are enough here. [Material color roles](https://m3.material.io/styles/color/roles).

Design guidance is separate from implementation availability. Google's Material Web repository currently states maintenance mode pending new maintainers. No full Expressive web-component adoption follows from the design site's prominence. PixelDoll has no demonstrated need for that additional stack. [Official Material Web repository](https://github.com/material-components/material-web).

## Concrete material and contrast challenge

The existing 92% fill is doing most of the floating surface's legibility work. A 12 px blur is an aesthetic enhancement; it cannot guarantee contrast. Keep it only at a floating material root, and give nested fields opaque/quiet backing. Never filter a sprite/canvas ancestor. A work panel can use its surface hierarchy without a gloss edge or shadow on every field.

Preserve the small shared shadow for actual elevation and one stronger dialog shadow where useful. Do not require every component to cast a shadow, or use shadow as its only boundary. Shadows may disappear in high-contrast presentation; a necessary identifying edge/state must remain perceivable. In light mode, verify that rims do not look dirty or produce a double outline. In dark mode, avoid stacking pale rims that make the control layer louder than the actor. These are design judgments for the parity comparison, not externally mandated pixel values.

Calculated from the approved solid surface/text colors using WCAG relative luminance; values rounded for reporting:

| Pair | Dark | Light |
| --- | ---: | ---: |
| Primary text / surface | 13.61:1 | 13.82:1 |
| Secondary text / surface | 7.69:1 | 5.79:1 |
| Bronze / surface | 6.86:1 | 6.25:1 |
| On-action text / Bronze | 8.10:1 | 6.68:1 |
| Existing 74%-secondary field border / surface | 4.87:1 | 3.31:1 |
| Existing quiet divider / surface | 1.74:1 | 1.48:1 |

At 92% surface backing over flat white in dark mode or flat black in light mode, secondary text remains approximately 6.04:1 / 4.85:1. This bounds those specified text/fill pairs, not every hover, feedback tint, border or reading gradient. Real composited contexts still need checking. The light field border has less margin; arbitrary opacity reductions can turn a passing token into a failing boundary.

Do not promote the quiet divider token to a field outline, checkbox edge or selection indicator. Decorative rules may be subtle; identifying controls and state indicators need the relevant contrast. WCAG does not require every decorative edge to reach 3:1, nor hover and idle colors to contrast 3:1 against one another. [WAI non-text contrast explanation](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Required semantic and state proof

1. **Appearance:** set semantic values for both modes; apply the matching root `color-scheme` so native select controls, scrollbars and browser UI participate. Confirm explicit mode choice survives reload and wins over OS preference. Dark default is already approved; adding an unrequested system-mode option is unnecessary. `color-scheme` does not recolor authored custom UI by itself. [MDN color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme).
2. **Actions:** primary, quiet and destructive; hover, active, keyboard focus, disabled and busy. Busy must communicate the action and block duplicate activation without turning the whole surface into a spinner. Paid work remains an application responsibility.
3. **Fields:** explicit text/search/password/number/textarea versus select/checkbox/radio/range/file/color families. Preserve labels, hints, invalid values, error association and keyboard behavior. Never apply text-input recipes to every `input` through exclusions alone.
4. **Choices:** selected state has a visible marker beyond hue. Use pressed buttons for independent toggles, radios for exclusive form choices, and actual tabs only when their keyboard contract is implemented. Focus and selection remain independently visible.
5. **Overlays:** actual named modal dialog; initial/return focus; Escape; scrolling long content; no scene movement while editing. Native auto popovers are nonmodal and dismissible; do not trap Tab merely because the surface looks like a small dialog. [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), [MDN popover](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover).
6. **Feedback:** text and icon carry severity; success/warning/danger/information receive separate semantic pairs. Persistent errors remain actionable after any toast expires. Pending and disabled are neutral, distinct states. Do not invent a percentage for indeterminate work.
7. **Targets/reflow:** prefer 44 px touch areas for ordinary controls, with smaller visual icons. WCAG 2.2 AA's minimum criterion is 24 px with exceptions; 44 px is this product's usability target. Invisible enlarged targets must not overlap. Verify portrait, shallow landscape and zoom with readable text and reachable scrolling. [WAI target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
8. **Fallbacks:** default must be legible even if a preference query never fires. `prefers-reduced-transparency` remains limited availability; supporting it is useful but does not prove every OS preference propagates. With reduced transparency/increased contrast use opaque backing and no filter; with forced colors preserve visible system-color focus, selection and boundaries. Reduced motion removes decorative transitions without freezing useful user-controlled frame playback. [MDN reduced transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency).

## Acceptance and limits

Compare equal-size owned and pinned-reference screens in both modes. Reject the owned theme if hierarchy flattens, dense text loses contrast, focus clips, native controls use the wrong scheme, or radii inflate without a concrete benefit. A showcase may use illustrative states, but working modal/popover/field behaviors must remain real. Clearly identify examples that do not execute production workflows.

Measure total owned styling and behavior responsibility rather than comparing only library download bytes. A single filtered layer is a reasonable containment policy, not evidence of acceptable GPU or battery cost. Physical mobile rendering, assistive-technology reading and paid-generation recovery remain separate verification areas; desktop screenshots cannot certify them.

Do not build a token compiler, generic window manager, universal input component or configurable design framework. Repeated semantic behavior warrants a component; simple shared appearance may remain CSS. A small showcase should make future additions predictable, while leaving unused hypothetical widgets unimplemented.

## Runtime review

Independently inspected the actual Svelte showcase at `http://127.0.0.1:5203` using managed headless Chromium and Node 24.22.1, on the first runtime pass. Captured and visually inspected dark/light desktop, portrait and shallow-landscape screens; exercised controls rather than judging idle screenshots alone. This is an isolated lab, not a production migration or accessibility certification.

### Observed strengths

- All five sections in dark/light at 1440 × 1000, 390 × 844 and 844 × 390 had no horizontal document overflow or page errors. A separate 320 px narrow-width pass also found no document overflow in any section.
- Root native `color-scheme` switched correctly between dark and light. Readable work surfaces, modest geometry and Georgia/system UI hierarchy remained coherent in both appearances. The world view stayed open rather than boxing the actor and equipment in matching cards.
- Native export dialog entered browser modality; Escape closed it and restored its opener. The API popover allowed Tab to leave, correcting the older production inspection concern rather than copying its trap.
- A help popover inside the long review dialog appeared above it in the top layer. The first Escape dismissed help while retaining the dialog; the next dismissed the dialog. The pointer-enter/leave implementation now gives the help surface a real hover persistence path.
- The character canvas used exact stored artwork at integer CSS scales: 64 px source rendered at 256 px desktop or 192 px portrait. Scene and control colors were separate.

### Findings sent to the lead before acceptance

| Finding | Reproduction / evidence | Required resolution |
| --- | --- | --- |
| Filtered character selection changes identity | Controls initially selects Adventurer; searching `Mira` makes Mira `aria-pressed=true` without selecting her | Store selected stable identity, not the index in filtered results |
| Number-unit invalid recipe is missing | Body `33` → Validate sets `aria-invalid=true` and error text, but the unit container keeps neutral border and no invalid marker | Apply the shared invalid treatment to the unit wrapper; keep the semantic attribute on the input |
| Paired fields misalign and stretch | Body/Frame inputs have different vertical positions; validation made their top coordinates differ by 36 px | Align field content at its start; retain consistent input height and leave hints/errors below |
| Color input shrinks to 20 × 20 px | `.pd-check input` overrides `.pd-color`; visible sample looks like a tiny dash instead of the intended color field | Scope checkbox/radio sizing explicitly or give color family its own deliberate selector |
| Forced-colors light tokens are not overridden | In forced-colors + light, computed semantic vars retain `#76562f`, `#faf7f0`, `#25282d` | Give preference/forced-color overrides sufficient selector specificity; verify actual controls as well as token strings |
| Inactive tab panel IDREF is absent | Prompt tab points to `panel-Prompt` while Appearance is selected, but that element is not rendered | Keep the associated panels in DOM with `hidden`, or otherwise maintain valid relationships; keep Help outside the tablist |
| Touch widths fall below product goal | Playback buttons are 36 px wide; mirrors 32 px desktop / 36 px phone | Widen coarse-pointer targets toward 44 px without overlapping adjacent hit regions; this is product quality, not a claim of automatic WCAG failure |
| Focus paint room is tight | Tab strip has 4 px padding, but outline + offset requires 5 px | Reserve enough paint space around the scrollport without shifting the actual content unexpectedly |
| Body size range is internally inconsistent | Body allows 256, while frame must be at least body + 8 and at most 256 | Synchronize maximum feasible body, displayed bounds and auto-frame helper |
| Equipment thumbnails use fractional scale | Natural 32 × 32 sources render at 80 × 80 (2.5×) | Render at 64 or 96 px, preserving integer pixel geometry within the open tiles |

The initial 30 screenshot captures were temporary reviewer working files. The accepted implementation's final capture/test record should be maintained by the lead, rather than retaining duplicate snapshots of every pre-fix state.

These findings are bounded to the first reviewed source/runtime. Fixes and final verification must be recorded before calling them resolved. They do not imply that changing libraries would fix application semantics, state identity or selector specificity.

### Independent correction recheck

Rechecked the revised showcase with all six sections, including Library, in dark/light at 1440 × 1000, 390 × 844, 320 × 740 and touch-capable 844 × 390. No horizontal document overflow or page errors occurred. The first-pass findings are resolved except for the orientation qualification noted below:

- Stable character identity: filtering to Mira leaves her unselected until activated.
- Invalid number units: Body 33 produces the danger border plus inset marker in both modes; the input retains its associated error. Body/Frame inputs share the same top coordinate and 44 px height, including after validation.
- Color family: custom input measures 44 × 44 px. Checkbox/radio sizing no longer overrides it.
- Forced colors: light-mode semantic accent/surface resolve to `Highlight` / `Canvas` rather than Bronze and Porcelain.
- Tabs: both controlled panels exist, the inactive panel is hidden, and Help is outside the tablist. The shared tab strip now reserves 6 px paint padding.
- Sample bounds: Body maximum is 248 with matching error text; padded frame maximum remains 256.
- Pixel thumbnails: 32 px equipment sources render at 96 px, an integer 3× scale.
- Portrait targets: playback controls measure 44 × 44 px, and portrait mirror controls use the larger target recipe. Narrow 320 px composition reflows without horizontal page overflow.

Additional working behavior was verified: the Library exclusive choice uses arrow-key selection with roving focus; opening Rename from Character actions and pressing Escape returns focus to the visible owning action; hovering then clicking Help keeps it open; simulated export busy state disables close/submit, resists Escape while busy and reaches an explicit completion state. The reflection is a separate canvas and does not apply a filter to the actor pixels.

Library provides useful real content pressure: actual production `RequestFields` rendering, outfit primary/secondary actions, keyboard-scrollable stored frames and a compact activity table. Its light portrait view retained the same hierarchy and quiet work material as the original sections. This is stronger evidence than a new collection of unrelated decorative controls.

Two final points were returned to the lead before sign-off:

1. **Coarse-pointer landscape sizing:** the 844 × 390 touch context still measured 36 px playback buttons and 32 px mirrors because the larger recipe depended on width ≤700 px. The 44 px product target should follow coarse-pointer capability across orientation, while preserving desktop density. These measurements do not alone establish a WCAG AA failure.
2. **Action-popup semantics:** `aria-haspopup="true"` on Character actions announces a menu, while its generic action list intentionally does not implement a menu role/keyboard contract. Prefer a native popover trigger and synchronized expanded state without the unimplemented menu promise, or implement the full promised pattern only if genuinely needed.

Both final points were fixed and independently rechecked: touch-capable 844 × 390 now measures every playback and mirror button at 44 × 44 px. Character actions uses native `popovertarget="project-menu"`, carries no false menu assertion, positions its open surface within the shallow viewport after the toggle event, and still returns focus to its visible owner after the nested Rename dialog closes.

**Final verdict:** the owned showcase demonstrates the intended visual/material contract and resolves the substantive findings from this independent review. No outstanding blocker was found in the tested isolated scope. This supports the owned Bronze recommendation, not a claim that the production app has migrated or that custom CSS is inherently superior. Physical-device performance, assistive-technology reading and production workflow integration remain outside this review's evidence. The lead's separate cross-browser test report owns that broader automated evidence.

### Requested themed-scrollbar refinement

The restrained scrollbar treatment is appropriate for the requested game-tool feel. It uses shared semantic thumb/track roles rather than a simulated scrollbar widget. The 60% secondary / 40% Bronze thumb gives approximately **8.64:1 dark** and **5.37:1 light** against the canvas track. Independent Chromium inspection confirmed that the same colors inherit into the nested frame strip, standard width remains `auto`, and forced colors resets to `auto`.

Keep platform variation intentional: styling does not promise identical visibility or overlay behavior on every OS. The main standard recipe leaves geometry to the browser; the 14 px prefixed fallback deliberately supplies fixed geometry only where the standard color property is unsupported. Avoid thinner handles, scroll hiding, permanently glowing rails or custom drag logic. These would add interaction cost without improving this design. [MDN scrollbar-color](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-color), [MDN prefixed scrollbar fallback](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::-webkit-scrollbar).

The subsequent dialog change explicitly captures the activating element rather than assuming pointer activation moved focus. Source inspection confirms activation events supply `returnTo`, popover actions map back to the owning trigger, and disconnected openers fall back to the focusable main region. This directly addresses the WebKit behavior reported by the lead. The lead's cross-browser suite supplies runtime evidence for that browser-specific correction; this review does not relabel it as independently repeated WebKit testing. Neither refinement changes the final no-blocker verdict for the isolated scope.


Lead follow-up: the user subsequently requested **no scrollbar background**. The track role is now transparent; the thumb inherits the same Bronze blend and is composited over its actual page/panel backing. The above numeric canvas comparisons are historical bounds for that background, not a claim of a colored rail. The prefixed fallback clips thumb fill inside its transparent border. Native width and forced-color handling are unchanged.

Lead visual/DOM review also found the native dialog default `max-width: calc(100% - 38px)` constraining the phone sheet. An explicit `max-width:100%` now lets its mobile width fill the available document area; the browser suite asserts this geometry.
