# Historical Bronze theme style guide

**Historical evidence — not the current theme owner.** New theme work belongs in [Bronze UI](https://github.com/Shilo/bronze-ui), following its [current style guide](https://github.com/Shilo/bronze-ui/blob/main/docs/STYLE-GUIDE.md) and [live showcase](https://shilo.github.io/bronze-ui/). This frozen guide records the pre-extraction implementation; retain its tokens, component contracts and evidence as originally reviewed.

2026-10-23. Original implementation contract for the isolated component showcase. See the [inventory](control-inventory.md), [research and challenge](research-review.md), and [coverage review](coverage-review.md). Ownership and extension instructions below describe that historical source, not a second maintained theme implementation.

## Ownership and native appearance

`theme.css` owns semantic colors, typography, shared geometry, materials and preference fallbacks. `components.css` owns reusable control recipes. `components/*.svelte` owns repeated behavior: labeled fields, help, dialogs, exclusive choices and notices. `showcase.css` owns only this gallery's composition and the explicitly scoped bridge to the existing `RequestFields` component. `App.svelte` supplies local example data and interactions.

Dark and light are complete native modes. Set `data-theme` on the document root and its matching `color-scheme`. All authored UI uses semantic variables; native inputs, selects and scrollbars receive the same scheme. Default to dark, retain an explicit choice, and expose one ordinary sun/moon button labeled **Light mode** or **Dark mode**, naming the action. Do not expose palette names as switcher options. The lab uses a separate storage key from the application.

Never implement light mode by inverting, tinting or filtering a container. Theme changes replace scene assets and UI roles; actual source character pixels remain unchanged. Equipment palette colors are artwork data, not theme tokens. Reflection is a separate optional rendering layer, never a shader over the source sprite.

| Semantic role | Dark | Light | Use |
| --- | --- | --- | --- |
| Canvas | `#111317` | `#EEEAE2` | App backing and scene reading gradients |
| Surface / field | `#202329` | `#FAF7F0` | Work surfaces and legible inputs |
| Text | `#F2EEE6` | `#25282D` | Primary text and icons |
| Muted | `#B8B5AD` | `#5E625F` | Useful secondary text; never imply disabled by this role alone |
| Accent | `#C9A66B` | `#76562F` | Primary action, focus, selected marker |
| On accent | `#111317` | `#FFFFFF` | Text/icons on the filled action |
| Success | `#84C79A` | `#226C43` | Confirmed successful state |
| Warning | `#E7BC75` | `#775319` | Reviewable concern |
| Danger | `#F2A099` | `#A3312F` | Failure/destructive action |
| Information | `#9BBCE5` | `#345F8E` | Neutral explanation |

These values are documented here for review; CSS is their runtime source. Never copy these literals into a new control. Derive field borders from 80% muted + surface, decorative dividers from 27%, selected fill from 13% accent and hover fill from 7% text. A subtle divider is not a sufficiently visible field boundary. Status always includes readable text and, where appropriate, a distinct icon.

## Three material roles

1. **Scene:** open world with local reading gradients, no enclosing dashboard card. Identity on the left; equipment controls on the right on desktop. Preserve the character as the focal point.
2. **Floating:** a small playback bar, contextual popover or toast. Use 92% surface backing with a restrained 12 px backdrop blur, one rim and one small elevation shadow. Legibility must come from the backing, not the blur. Never nest floating filters or filter a sprite ancestor.
3. **Work:** opaque surface for forms, review, request data and dialogs. Long reading tasks do not benefit from distracting scenery through their text.

Apple Liquid Glass inspires separation of content and controls, not optical imitation. Material 3 Expressive informs semantic roles and emphasis, not a new visual identity. GlassKit remains a historical comparison, not a dependency of this implementation. The [research review](research-review.md) records evidence and counterarguments.

## Typography, geometry and visual hierarchy

- System UI (`Segoe UI`, system fallback), 16 px body and 14 px secondary text, line height 1.5. Use Georgia only for display names/section headings; action labels and dense dialog titles stay in the UI face. Monospace belongs to data/code. Numerals align with tabular figures where compared.
- Control / panel / dialog radii: 8 / 12 / 16 px. A switch and color swatch are deliberate circular exceptions. Avoid making every action a capsule. Corners express grouping, not a hierarchy of decoration.
- Spacing scale: 4, 8, 12, 16, 24, 32 px. Joined direction/mirror controls share their boundary; groups retain breathing room. Catalog cards are specimen groupings, not a proposal to put cards around every in-world control.
- Ordinary controls are at least 44 px high. Touch controls should be at least 44 × 44 px including landscape; a small icon may sit inside that target. Desktop compact controls can be narrower when clearly separated. Do not expand invisible targets into neighbors.
- Use a border for identifying an input; reserve shadows for elevation. Primary emphasis should be scarce. Disabled opacity is not a usable secondary-text treatment: show the reason nearby and retain context.
- Keyboard focus uses a 2 px accent outline with 3 px offset. Scrollports need at least 5 px paint room. Do not clip palette selection rings or focus to solve alignment problems.

## Component and state contract

| Family | Shared recipe / behavior | Required states and rules |
| --- | --- | --- |
| Actions | `.pd-btn`, primary / quiet / danger | Default, hover, pressed, focus, disabled, busy. Preserve an action label while busy; stop duplicate activation. Destructive actions use explicit consequences and confirmation where warranted. |
| Text/search/password/number/select/textarea | `Field`, `.pd-input`, `.pd-unit` | Persistent label, hint/error association, editable, disabled; invalid text + visual marker on the joined wrapper. Readonly is a demonstrated extension, not an assertion that every current form uses it. |
| Checkbox / switch | Native inputs, `.pd-check`, `.pd-switch` | Label is part of the target. Switch is an immediate on/off setting, checkbox a form choice. Keep keyboard semantics and visible on/off shape. |
| Exclusive choices | `ChoiceGroup` | Radios with checked state, checkmark and roving focus; arrows/Home/End operate the group. Do not announce radio semantics without implementing behavior. |
| Tabs | `.pd-tabs` + creator tab handler | Active marker, `aria-selected`, matching labeled panels retained with `hidden`, roving focus and arrows/Home/End. Put Help outside the tablist. |
| Direction/mirror | Joined buttons | Independent pressed/selected semantics, accessible direction labels, reversible mirror action, coarse-pointer targets. This lab is a style sample, not production rig logic. |
| Color / ramps | Native color input, `.pd-swatch`, `.pd-ramp` | Accessible names, selected ring, unclipped focus, real Reset. Art ramp colors remain outside semantic UI palette. |
| File | Native file input | Reachable browser picker and visible filename. A custom wrapper must not break native selection or imply an upload occurred. |
| Lists/cards | `.pd-row`, `.pd-list-item` | South-frame thumbnail, stable item identity through filtering, selected vs worn state, empty/search states. Separate row actions from selection; do not nest buttons. |
| Disclosure/data | Native `details`, `.pd-data`, `.pd-table`, `.pd-code` | Long text wrapping, named keyboard-scroll regions, readable identifiers. Existing `RequestFields.svelte` is reused directly with a scoped token bridge. |
| Activity | Native progress, `.pd-spinner`, `.pd-steps` | Determinate progress only with known values; text for indeterminate and reduced-motion states. Distinguish queued, running, failed, completed, cancelled and unknown outcomes. |
| Feedback | `Notice`, `.pd-badge`, `.pd-toast` | Severity has text/icon, not hue alone. Announce new relevant feedback, not every static showcase notice. Keep recovery information after a toast disappears. |
| Dialog | `Dialog` / native `showModal()` | Named modality, contained keyboard focus, reachable scrolling/footer, Escape, explicit close and focus return. Return to the visible popup owner if launched from its action list. |
| Action/API popovers | Native `popover=auto` | Light dismiss and Escape; allow Tab to leave. Native `popovertarget` supplies relationships. Do not claim menu semantics for a generic action list. |
| Help | `Help` / native manual popover | Pointer hover, keyboard focus and activation/tap; readable hoverable content; outside pointer or Escape dismisses it. First Escape closes help before its parent dialog. |

Mobile dialogs become bottom sheets; shallow landscape uses a side panel. These are the same shell and behavior, not duplicate implementations. Work fields retain the same tokens in every presentation. Blocking dismissal during the short local export simulation demonstrates a busy state; production must decide cancelability based on the actual operation, especially paid work. This is not blanket permission to trap a user in a long request.

## Accessibility and rendering fallbacks

Scrollbars use one shared pair: muted Bronze thumb (60% secondary text + 40% accent), transparent track, as explicitly requested. The thumb sits over the existing page/panel instead of adding a background strip. The result is warm and quiet in both modes without bright glow, gradients or decorative glass. Standard `scrollbar-color` inherits through nested scrollports; keep `scrollbar-width:auto` so the browser retains native hit areas and OS overlay behavior. Do not hide scrolling or shrink the grab target just to look minimal. Browsers without standard color support use a 14 px prefixed fallback with an inset rounded thumb. Forced colors returns to `auto`. Native popup/OS picker chrome remains browser controlled. [MDN scrollbar color](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-color), [Chrome scrollbar styling](https://developer.chrome.com/docs/css-ui/scrollbar-styling).

Normal body text targets 4.5:1 against its actual backing; meaningful boundaries/focus/state indicators target 3:1 where the criterion applies. Decorative dividers need not meet the same threshold. Test composited text/fill contexts, not only token swatches. Contrast math does not replace keyboard and screen-reader verification. [WAI text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

With reduced transparency or increased contrast, floating surfaces become opaque and lose the blur. Unsupported backdrop filtering also receives opaque backing. Forced colors replaces semantic colors with system colors in **both** schemes; necessary selection outlines remain. Reduced motion removes decorative transitions/spinners while labeled user-controlled sprite playback remains available. Browser propagation of OS preferences varies; default styling must already be legible.

Use native HTML first. Prefer real buttons, labels, details, dialog and popover to recreated generic div controls. Still test labels, focus restoration and custom keyboard behavior: native elements do not solve application state mistakes. [MDN color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme), [WAI dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [hover/focus content](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Adding a control

1. Find its existing family in the inventory and reuse its recipe/behavior. A one-off layout is not a reason for a new generic framework component.
2. Add a semantic role only when existing roles cannot express its purpose. Define both themes and preference fallbacks together.
3. Add its real states to the showcase with clear local sample behavior. Do not fabricate paid results, progress or coverage.
4. Verify dark/light, keyboard, touch portrait/landscape, 320 px reflow, long text, native overlays, errors and high contrast. Capture equal-size evidence and request independent review.
5. Update this guide and the coverage matrix. Do not claim the whole app migrated when only a specimen was added.

See [README](README.md) for commands, test evidence and limits. Physical-device GPU/battery, full assistive-technology testing, actual paid/recovery workflows and specialized production layouts are outside this isolated proof.
