# Theme foundation — independent challenge

Reviewed 2026-10-23. This is a research and architecture recommendation, not a production migration. The approved restrained prototype remains the visual reference. No implementation, vendor files, dependencies or API requests were changed for this review.

## Recommendation

**Own PixelDoll's production theme and component contracts, using the approved Bronze design and native-first Svelte UI.** Use shared semantic tokens and a small set of material recipes across the whole app. Prefer local CSS for those recipes when integrating production; preserve the pinned GlassKit prototype as the reference until visual and behavioral parity is demonstrated.

This is a firm ownership recommendation, not a claim that a replacement has already proved cheaper. Retaining pinned GlassKit CSS behind the same contracts is a viable fallback if a bounded implementation comparison shows lower total burden while preserving the approved result. Adopting GlassKit Elements is a separate, currently untested option; it is not implied by the successful CSS experiment.

“Comprehensive” means complete for PixelDoll's real workflows and states. It does not mean building a general UI framework, wrapping every native element in a component, or styling every region as glass. Simple buttons and fields can share CSS classes; repeatable behavior and semantics belong in shared Svelte components. The existing app already provides useful starting points.

## The strongest case on each side

| Approach | Strongest evidence in its favor | Main cost / unanswered question | Assessment |
| --- | --- | --- | --- |
| Retain GlassKit CSS beneath PixelDoll components | Already produced an approved restrained result; locally pinned MIT source; tokenized form and surface recipes; no required JavaScript runtime | PixelDoll still owns the adapter, theme, layout, interaction and validation. Does reuse remove more maintenance than the bridge adds? | Reasonable fallback, not the preferred production foundation |
| Adopt GlassKit Elements | Actual native-dialog, form-association and popover behavior exists; selective imports and shared styles are available | New component lifecycle, Shadow DOM styling and state/event boundary must be integrated and tested with existing Svelte workflows | Credible option, insufficient present need/evidence to recommend adoption |
| Own theme + existing/shared Svelte UI | Matches the exact approved visual language and existing app architecture; one owner for product states and semantics | PixelDoll must maintain consistency, interaction details and accessibility tests; custom code is not automatically correct or cheaper | Preferred production direction |

The library is not being rejected because it has JavaScript, uses custom elements, or is unfamiliar. Svelte already supplies a runtime, and Web Components can interoperate with it. The question is which parts of PixelDoll's existing responsibility the additional layer would actually replace.

## What the experiment established

The [material study](glasskit-study.md), [independent review](glasskit-review.md) and [design contract](../../immersive-design-system.md) support the restrained appearance. They do not establish a full-app component foundation.

Current responsibility is visible in the source:

| Responsibility | Actual owner in the prototype |
| --- | --- |
| Obsidian / Porcelain Bronze colors, world palette, theme switching | `theme.mjs` |
| Responsive composition, typography, screen hierarchy | `styles.css` |
| 8 / 12 / 16 px geometry, solid primary action, field fills/borders, filter policy, focus outlines, preference fallbacks | `glass-theme.css` |
| Button/field markup, state and labels | `ui.js` and application renderers |
| Native dialog lifecycle, dismiss behavior, opener restoration, notifications | Application code |
| Upstream visual component rules and token defaults | Pinned GlassKit CSS |

For example, `.glass-surface` is defined by PixelDoll's adapter; per-field filters are removed; primary actions become solid Bronze; the library loads in a lower-priority cascade layer. These are legitimate adaptations, but consistency comes from their shared ownership, not from importing a stylesheet alone. The experiment also fixed pre-existing token-scope and focus problems; those improvements must not all be credited to glass.

The adapter's general input selector excludes only checkbox and range. It would also select radio, color and file inputs if carried into wider markup unchanged. That is an experiment-mapping limitation, not an upstream defect. Production needs explicit field families, including import and palette controls.

GlassKit's broader recipes can still save work: structured tables, readable prose and disclosures may help API inspection or quality notes. Calendar/date-strip recipes have no demonstrated present need. Counting components does not measure coverage of the compass, equipment slots, exact palette ramps, animation coverage, generation recovery or gameplay shortcuts.

## Fair treatment of GlassKit Elements

The CSS experiment did **not** test Elements. The official [Elements documentation](https://glasskit-elements.jungherz.com/docs.html) describes selective imports, native form participation and managed popovers. Inspection of source at [`741a76a723cedd35abe13615e75a22c8212360b5`](https://github.com/JUNGHERZ/GlassKit-Elements/tree/741a76a723cedd35abe13615e75a22c8212360b5) confirms meaningful behavior:

- [`GlkFormElement`](https://github.com/JUNGHERZ/GlassKit-Elements/blob/741a76a723cedd35abe13615e75a22c8212360b5/src/base.js) uses `ElementInternals`, forwards validity, handles disabled/reset/restore state, and adopts shared component styles. Root token defaults and theme/density/surface synchronization are explicit.
- [`glk-modal`](https://github.com/JUNGHERZ/GlassKit-Elements/blob/741a76a723cedd35abe13615e75a22c8212360b5/src/components/feedback/glk-modal.js) uses a named native dialog and `showModal()`, handles cancellation and scroll locking, and projects body content. Its action buttons are cloned into the shadow tree, synchronized and forwarded to the original buttons.
- [`glk-popover`](https://github.com/JUNGHERZ/GlassKit-Elements/blob/741a76a723cedd35abe13615e75a22c8212360b5/src/components/feedback/glk-popover.js) manages open state, trigger `aria-expanded`, outside clicks and Escape. This is actual interaction code, beyond visual CSS.
- [`glk-segmented`](https://github.com/JUNGHERZ/GlassKit-Elements/blob/741a76a723cedd35abe13615e75a22c8212360b5/src/components/forms/glk-segmented.js) provides form-associated exclusive choice with native pressed buttons and updates selected state without rebuilding the buttons.

These are strengths. They also identify concrete integration seams: PixelDoll's scoped/unlayered selectors cannot directly style shadow-internal fields; inherited tokens or exposed parts would need to carry the approved appearance. Cloned modal actions require verification with dynamic Svelte labels, disabled state, focus and action handlers. Those are **risks to test, not demonstrated failures**. The current source includes work intended to handle framework changes; no claim of general Svelte incompatibility is justified.

Existing Svelte components already implement much of the needed behavior. Replacing them with Elements would therefore require an evidenced benefit beyond fewer markup lines. No presently missing complex widget has been identified that requires that migration.

## Material and semantics are different decisions

Apple's [Materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) and [Meet Liquid Glass, 12:46–13:34](https://developer.apple.com/videos/play/wwdc2025/219/?time=766) reserve Liquid Glass principally for controls/navigation above content and discourage glass on glass. That supports keeping character art and equipment content open, using quiet work surfaces and a bounded floating-control material. It does not require any particular web library. GlassKit is an independent CSS interpretation, not Apple's adaptive native rendering system.

The sufficient production material vocabulary is:

| Role | Treatment |
| --- | --- |
| Scene | Open to the world with local reading gradients where required; original artwork colors remain independent |
| Floating control / transient overlay | Current 92% backing, restrained rim/shadow and one 12 px blur at the material root; opaque fallback |
| Work / dense content | Opaque or near-opaque backing with clear field boundaries; no nested blur |

All roles share the approved palette, type, geometry, focus and state language. Error, warning, busy, disabled and selected states need semantic treatment too, especially around paid generation and recovery.

Native HTML reduces mechanics but does not supply a complete product interaction contract. The [HTML dialog standard](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element) provides modal machinery; the [popover standard](https://html.spec.whatwg.org/multipage/popover.html) still leaves authors responsible for appropriate semantics and custom menu keyboard behavior. The [WAI role guidance](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/) warns that ARIA roles do not supply their promised keyboard behavior. A visual segmented row is not automatically a tablist.

## Existing code is an asset, not a certification

Source inspection found reusable production work in `app/src/studio/`:

- `Sheet.svelte` already uses native modality, a named heading, responsive presentation and opener return.
- `CharacterForm.svelte` has real Appearance/Prompt tab/tabpanel semantics, roving tab stops and Left/Right/Home/End handling. Preserve or deliberately revise that behavior during visual integration; do not replace it with visual-only tabs. Compare against the [WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
- `ApiPeek.svelte` uses a native nonmodal popover, a named dialog region, disclosure content and explicit focus handling. It also wraps Tab within the panel: revalidate whether that is the intended nonmodal interaction and how a keyboard user returns to the rest of Studio.
- `Help.svelte` already supports focus, pointer, click, Escape and a described tooltip. It hides on trigger pointer-leave and gives the tip `pointer-events:none`; this is a concrete hoverability concern under [WCAG 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html). Ownership must include fixing or redesigning that lifecycle, not merely recoloring it. Native `title` hints alone are not a replacement for essential instructions.

These observations are source evidence, not a new runtime accessibility audit. [WAI dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) also makes clear that initial focus and return must follow the workflow, including cases where the original control disappears.

## Debate and corrections

1. **Reviewer initially proposed choosing the renderer after a maintenance comparison.** The lead challenged this as too indecisive for a requested recommendation. Resolution: recommend PixelDoll ownership and local production theme now, with parity/maintenance proof as an integration gate rather than postponing the architecture decision.
2. **Reviewer challenged “CSS-only library” as an incomplete argument.** Elements supplies real behavior and form infrastructure. Resolution: evaluate CSS and Elements separately and acknowledge their concrete strengths; reject neither because it has a runtime.
3. **Lead challenged the assumption that broad content recipes were irrelevant.** Tables/prose/disclosures could serve inspection and quality content. Resolution: assess actual structured-content needs, while excluding speculative widgets.
4. **Both challenged custom-system optimism.** Existing native/Svelte code reduces starting cost but retains known interaction questions. Resolution: require component-state evidence; do not claim accessibility or lower cost from ownership alone.
5. **Lead rejected a wrapper for every native element and identified the broad input selector.** Resolution: CSS for simple visual reuse; shared Svelte only where behavior/semantics repeat; explicit field-type contracts.

## Integration gates and limits

Before replacing the prototype's renderer or calling the production theme complete:

1. Inventory the actual component/state families across selection, creation, equipment, moves, recolor, import/export, connection, activity and recovery. Record intentional native appearance, including OS select menus. Avoid speculative window managers and unused generic widgets.
2. Build a bounded atlas of the approved primitives and their hover/focus/pressed/disabled/busy/error states in dark/light, desktop, portrait and shallow landscape. Compare the same states against the pinned prototype. Measure total local CSS/components/adapter responsibility, not vendor bytes alone.
3. Preserve current visual approval: open equipment and navigation, 8/12/16 geometry, type hierarchy, quiet fields, original sprite RGB, scroll/focus paint room and material placement. Dependency removal is not permission to redesign.
4. Test dialog focus lifecycle, dismiss ordering, tooltip hoverability/touch access, nonmodal escape routes, tab keyboard behavior, gameplay-shortcut isolation and status/error announcements. Test labels, contrast over supported worlds, zoom/reflow and accessibility preferences. Use relevant browser/assistive-technology combinations.
5. Repeat relevant animated-scene performance checks with visible material on physical mobile hardware before claiming acceptable GPU/battery cost. Existing headless smoke and Windows WebKit evidence are bounded; they do not certify iOS devices or all GPUs.

Source/version caveat: the experiment pins GlassKit **1.30.0** at [`9be4ef3a801331cfdf0ec6de0c7fb964db6febc6`](https://github.com/JUNGHERZ/GlassKit/tree/9be4ef3a801331cfdf0ec6de0c7fb964db6febc6). Its [vendor record](vendor/glasskit/README.md) gives the actual artifact size/hash/license. Public landing pages, cached docs and component counts are inconsistent; they are not reliable evidence of the exact installed release. This review inspected current Elements source at the separate commit above without installing or running it. It makes no security, accessibility-conformance, runtime-compatibility or lower-maintenance certification for either production option.
