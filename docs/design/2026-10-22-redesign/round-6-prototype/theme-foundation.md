# Theme foundation: owned Bronze design system

Date: 2026-10-23. Research and design recommendation, not a production migration. Lead review with an independent GPT-6.1 Sol High challenger. The user's new request asks whether the approved GlassKit experiment can provide a consistent, complete application theme.

## Decision and scope

**Recommend a PixelDoll-owned Obsidian / Porcelain Bronze theme for production, using existing native-first Svelte components and a small set of shared material rules. Preserve the approved restrained glass appearance.** Keep the pinned GlassKit prototype unchanged as the visual and behavior reference until a replacement demonstrates parity. Do not install GlassKit Elements or a headless library now.

This refines, rather than retracts, the earlier result: selective GlassKit was a successful visual experiment. That result did not establish it as the lowest-maintenance foundation for every production workflow. A library can enforce its own consistency, but it cannot supply our domain-specific interaction contract. Conversely, owning CSS does not automatically make a design consistent, accessible or cheaper.

This document specifies the target component coverage and ownership. It does **not** claim the catalog has been implemented or tested. Existing production Studio has not acquired the new visuals. The current prototype still uses GlassKit 1.30.0; the previous screenshots and tests remain valid evidence of that implementation.

## Options challenged

| Option | Strongest benefit | Cost or limitation for this project | Recommendation |
| --- | --- | --- | --- |
| GlassKit CSS as the whole styling foundation | Shared tokens and broad recipes; no required JS runtime; useful forms, lists, notices and overlays | Still needs Svelte behavior and bespoke game controls; current approved style overrides much of its material, type and geometry | Viable, but not preferred production foundation |
| GlassKit CSS behind PixelDoll components | Preserves approved experiment and contains vendor details | Two token vocabularies and an adapter; all currently unadapted families still need a parity pass | Keep as reference and viable fallback if a bounded comparison shows lower total work |
| GlassKit Elements | Adds real web-component behavior and native form participation, not merely styles | Separate adoption from the tested CSS; Shadow DOM styling, events, slots, form state and focus need Svelte integration checks | No current need to replace existing working primitives |
| **Owned theme + existing native/Svelte primitives** | Matches approved art direction, reuses existing workflows and keeps game-specific behavior in one system | We own maintenance, accessibility work and coverage; must prove parity | **Preferred production direction** |
| Owned theme + selective headless primitives | Can avoid implementing a genuinely complex widget ourselves while retaining appearance | New dependency, integration and regression work; no demonstrated missing widget yet | Revisit for a concrete complex widget, not pre-emptively |

No numeric score pretends to quantify unmeasured maintenance. The choice follows the existing codebase and the amount of approved styling already owned by PixelDoll. A greenfield app with different styling goals could reasonably choose GlassKit.

## Research findings

Apple's material is **Liquid Glass**. GlassKit is Jungherz's independent interpretation, not an Apple-supported CSS framework. Apple's guidance puts glass in the floating control/navigation layer, discourages glass-on-glass and describes adaptive legibility behavior in the native material. We adopt the hierarchy principle; our CSS does not implement Apple's adaptive optical system. [Apple, Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/).

GlassKit has useful tokens and a broad CSS catalog, including buttons, fields, selections, sheets, notices and progress. This is meaningful visual coverage, not proof of complete application behavior. The experiment uses its pinned CSS in a lower-priority cascade layer. Documentation snapshots expose inconsistent version/count labels; evaluate the pinned source, not a component count or size slogan. [CSS docs](https://glasskit.jungherz.com/docs.html), [pinned source](https://github.com/JUNGHERZ/GlassKit/blob/9be4ef3a801331cfdf0ec6de0c7fb964db6febc6/glasskit.css), [local provenance](vendor/glasskit/README.md).

The reviewer's source audit found real dialog, form and popover behavior in **GlassKit Elements**. Its Shadow DOM and action-slot handling are integration seams to test, not demonstrated defects. Adding it to our existing Svelte app would be a new engineering decision, not an automatic extension of the CSS experiment. [Elements](https://glasskit-elements.jungherz.com/), [review and exact source evidence](theme-foundation-review.md).

Native HTML is a useful starting point: modal dialog provides browser modality, and native auto popovers provide top-layer display and dismissal. They still require appropriate labels, initial/return focus decisions, positioning and state synchronization. ARIA roles do not implement keyboard behavior. [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), [MDN popover](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover), [WAI role/behavior guidance](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/).

Bits UI is a relevant alternative if a complex accessible Svelte widget becomes necessary: it separates behavior from styling. This is an option, not a dependency recommendation or a claim of audited compatibility with this app. [Official introduction](https://www.bits-ui.com/docs/introduction).

## What the current implementation proves—and does not

- `glass-theme.css` already owns our colors, radii, field backing/borders, solid primary actions, blur policy and focus treatment. `styles.css` owns responsive layout and typography. `theme.mjs` remains the palette source. The visual identity is already ours.
- `material.mjs` maps a small subset of recipes. Its broad input selector excludes checkbox/range but would still assign text-input styling to radio/color/file inputs. That is an **experiment adapter limitation**, not a GlassKit defect; it must not become the production field contract.
- Production `Sheet.svelte` already uses native dialog, responsive center/bottom/side layouts and opener restoration. `ApiPeek.svelte` uses native popover; `CharacterForm.svelte` has linked editor tabs; `Help.svelte` supports help disclosure. Reuse and review these, rather than start over.
- Production `studio.css` already includes shared buttons, fields, chips, notices, progress, menus and sheets. It is an older visual theme, so reuse behavior and consolidate styling rather than copy its blue palette into Bronze.
- Missing evaluation areas include actual paid-generation failure/retry states, rich API inspection, long quality notes, dense import/export flows and full keyboard/screen-reader use. Happy-path prototype screenshots cannot certify those.

Concrete review flags for migration: Help currently hides on trigger pointer leave and its tooltip has `pointer-events:none`; validate hover persistence/dismissal against WCAG rather than assuming it is solved. ApiPeek traps Tab inside a nonmodal popover; choose and test the intended nonmodal behavior rather than inherit this automatically. The prototype's scene/view Tab shortcut must not be copied into a true ARIA tablist, where Tab should leave the widget and arrows navigate it. These are source-review concerns, not a completed runtime accessibility audit. [Hover/focus content](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html), [tabs behavior](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

## One theme, three material roles

Consistency means the same role receives the same treatment. It does not mean every element is equally translucent.

| Role | Treatment | Use |
| --- | --- | --- |
| Scene | Open typography/controls over bounded local reading gradients; no card around every section | Character identity, world selection, equipment layout, view navigation |
| Floating | Approved restrained rim/shadow; initial reference is 92% surface fill and 12 px blur; one filtered ancestor | Playback, brief popover, small notification, short dialog |
| Work | Quiet opaque or near-opaque surface; no inner blur; stronger input boundaries | Long creation/import/export forms, API details, queue failures, quality review, extended help |

These are internal material roles, not extra user theme choices. A large dialog uses the work treatment when reading density demands it. A field inside a panel is not a second glass sheet. Never trade readability for stronger transparency. The world is prominent because the composition leaves space for it, not because dense text becomes hard to read.

Maintain the existing **8 / 12 / 16 px** control/panel/dialog radii; circular palette swatches and pixel thumbnails remain purposeful exceptions. Desktop and phone share components with responsive layout, not identical dimensions. Keep the approved Georgia display and system UI faces; do not shrink form typography merely to fit more controls.

## Token contract

Use one executable source for UI semantic values, with the existing approved palette documented in [the design system](../../immersive-design-system.md). During production migration consolidate rather than maintain independent prototype and app theme tables indefinitely. No token generator, theme framework or runtime observer is justified now.

| Token family | Required roles |
| --- | --- |
| Color | Canvas; scene scrim; work/floating/field surfaces; primary/secondary text; placeholder; action fill/on-action/text; selected fill/marker; decorative divider; control border; focus |
| Feedback | Success, warning, danger, information: foreground, supporting fill, border and icon/text treatment; neutral pending/disabled separately |
| Geometry | Control/panel/dialog radius; spacing scale; control density; icon size; target area; field padding; max reading width |
| Type | Display/UI/mono families; heading/body/label/help roles; responsive sizes and line heights; tabular numeric values |
| Material | Surface opacity; one blur radius; rim; shadow; reading gradient; scrim; opaque preference/support fallback |
| Interaction | Hover, active, focus, selected, disabled, read-only, invalid and busy states; reduced-motion duration |
| Layering | World, scene UI, floating controls, browser top-layer dialog/popover, associated help/feedback; explicitly test actual stacking |

Bronze communicates primary action/selection, not every status. Errors need distinct meaning. Candidate feedback foregrounds below are **proposed**, not applied or visually approved. Calculated WCAG relative-luminance contrast is against solid `#202329` dark / `#FAF7F0` light, not arbitrary transparent backgrounds or every state.

| Role | Dark foreground / ratio | Light foreground / ratio |
| --- | --- | --- |
| Success | `#84C79A` / 7.96:1 | `#226C43` / 5.96:1 |
| Warning | `#E7BC75` / 8.88:1 | `#775319` / 6.47:1 |
| Danger | `#F2A099` / 7.69:1 | `#A3312F` / 6.46:1 |
| Information | `#9BBCE5` / 8.04:1 | `#345F8E` / 6.18:1 |

Use concise text and an appropriate icon with status color. Supporting tints and their composite contrasts still need a visual/state test before adoption. Source sprites and equipment palettes never consume theme colors. World materials use their own scene roles mapped to the same appearance family; they are not control-state colors.

## Component coverage for actual workflows

The coverage target is **component × state × context**, not a universal widget library. Existing files below are evidence of need and starting points, not mandatory final filenames or proof of completion. Simple styles can be shared CSS; use a Svelte primitive where repeated semantics, markup or behavior benefit from one owner.

| Family | Existing use/evidence | Shared contract and states |
| --- | --- | --- |
| Text, headings, links, icon labels | Studio, CharacterForm, GenCard, RequestFields | Functional hierarchy; truncation with recoverable full content; readable paragraphs/code; disabled text remains distinguishable |
| Buttons and icon actions | Toolbar, CreateSheet, ExportSheet | Primary/secondary/quiet/destructive; hover/active/focus/disabled/busy; accessible name; action+cost; no duplicate paid submit |
| Fields and validation | CharacterForm, ConnectSheet, RenameSheet | Text/password/search/number/textarea; label/hint/error association; units; min/max/step; read-only distinct from disabled; pending and invalid states |
| Select, checkbox, radio, range | CharacterForm, ExportSheet, Stage | Native semantics first; checked/mixed where used; selected/disabled/focus; range has label/value/keyboard support; native picker popup may retain OS appearance |
| File and color input | ImportSheet, DesignLibrary, Colours | Explicit families, not text-field styling; browse alternative to drag; file type/size/error feedback; theme never changes authored swatch pixels |
| Mode and choice groups | CharacterForm, Inspector, studio views | Tabs versus pressed choices versus radio semantics chosen deliberately; selected marker beyond color; keyboard behavior matches role |
| Character/equipment/outfit rows | Wardrobe, PhonePanel, Outfits, DesignLibrary | Real thumbnail; selected, equipped, empty, unavailable, loading and error; optional secondary action; focus and selection rings cannot clip |
| Palette, compass, frame/size preview | Colours, CharacterForm, SizePreview | Domain composites using shared choices/fields; exact color values and source artwork; mirror/coverage/disabled states explicit |
| Playback and live controls | Stage and isolated prototype | Common button/select styles; separate application movement resolver; UI focus/overlay cancels or blocks scene input; no accidental movement while editing |
| Modal, sheet and panel | Sheet, CreateSheet, ExportSheet, DeleteSheet | One responsive shell for center/bottom/side; long body scroll; accessible name; initial/return focus; dismissal rules; working/error/success; critical copy stays visible |
| Popover and action menu | Toolbar, ApiPeek | Shared placement/edge handling; dismissal and return focus; simple action lists need not pretend to be ARIA menus; true menus implement their full keyboard contract |
| Tooltip and help | Help, editor assistance | Short noninteractive hint on focus/hover, dismissible and hoverable when required; touch help uses explicit activation; long/interactive help uses popover/panel; essential instructions remain visible |
| Notice, toast and status badge | Studio, GenCard, ImportSheet, FitDesignSheet | Severity+text+icon; transient confirmation distinct from persistent actionable failure; live-region announcement without focus theft; deduplicate coverage notifications |
| Progress, job row, empty/loading state | ActivitySheet, GenCard, Moves, DesignLibrary | Indeterminate/determinate; queued/running/paused/cancelled/failed/complete; do not invent progress; persistent retry/cancel details; reduced-motion alternative |
| Disclosure and structured data | RequestFields, ApiPreview, GenCard | Native details where appropriate; labels/values, quality notes, safe code wrapping/scroll; long data must not expand the whole page |

No draggable desktop window manager, calendar, date picker, arbitrary dock layout, rich-text editor or all-purpose data grid is proposed. Add a new family only when a real workflow requires it. Modules/windows in this design mean purposeful dialogs, panels and sheets.

## Behavior and accessibility rules shared across the theme

- Native buttons and form controls retain platform keyboard behavior. CSS cannot implement labels, focus restoration or selection mechanics. A modal makes background UI inert; a nonmodal popover must have a deliberate, escapable focus path. Use one shared dismissal/input policy without inventing a general window manager. [Dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- An invalid field shows what is wrong in text and keeps its value. Relevant hints/errors connect to the field; a toast alone is not a form error. Pending work identifies the action and state; visual appearance does not change business validation or paid-request authorization. [Error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html).
- Routine status updates use a polite announcement; urgent errors are distinguished deliberately. Preserve actionable failures in the form/activity context after a toast expires. Do not announce every animation frame or movement remap. [Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
- Target 44 px touch hit areas where practical; visual icons can be smaller. This is our usability target, not a claim that WCAG AA universally requires 44 px. WCAG 2.2's minimum target criterion is 24 px with specified exceptions. Do not enlarge overlapping invisible targets. [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Text aims for at least 4.5:1 for ordinary text and 3:1 for qualifying large text; necessary identifying control boundaries and states aim for 3:1 against adjacent colors. Test actual composites, not only token swatches. Optional new backgrounds must pass these checks or use a stronger backing. [Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- Forms and reading surfaces reflow at narrow/zoomed widths; a spatial game canvas does not exempt the surrounding controls and instructions. Test virtual keyboard, safe areas and long text. [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Reduced transparency/increased contrast/forced colors produce opaque, usable surfaces; reduced motion removes cosmetic motion. Preserve the character's functional animation unless the player pauses it. Unsupported filters fall back to a readable fill. Test mobile editable text on a physical device rather than assuming headless screenshots certify input comfort.

## Implementation and acceptance sequence

1. **Reference:** preserve the approved restrained prototype and its five-screen light/dark phone/desktop comparisons. Do not remove the working vendor integration merely because the recommendation changes.
2. **Component/state atlas:** create one local development-only catalog using actual production primitives plus representative composites. Include every family above, relevant states and a moving-world backing. Do not manufacture a second production app or fake PixelLab calls.
3. **Bounded owned-theme proof:** move the existing palette/material/geometry into owned tokens and recipes for that catalog; exercise existing Sheet, a creator section, equipment, API inspection and status/error examples. Prefer owned recipes; any intentional upstream code reuse must retain MIT provenance and attribution.
4. **Comparison gate:** compare the owned proof with the pinned reference at equal dimensions. Required outcome: no loss of hierarchy, field/readability/focus, sprite identity or context. Record actual CSS/dependency size and implementation burden; local ownership is not a presumed performance win. If the vendor-backed version is demonstrably simpler at equal quality, retaining it behind PixelDoll components remains acceptable.
5. **Migrate incrementally:** only after that proof, replace repeated styling with the shared contracts while keeping existing validation, save, queue and generation behavior. Consolidate token sources during integration and remove experiment-only class scanning from production paths. Do not maintain two permanent component systems.
6. **Completion:** all known families/states render in both appearances and narrow/desktop/landscape contexts; keyboard, touch, focus, motion/transparency and screen-reader checks pass for representative flows; physical-device rendering is measured. New components enter through the catalog and shared tokens, with a documented reason for any visual exception.

A complete theme is an enforceable contract with verified examples and an extension process. It cannot guarantee every hypothetical future widget. This work records that contract and the library decision; it does not present the future atlas or migration as already completed.

## Independent challenge

The reviewer defended GlassKit reuse and exposed real Elements behavior; the lead accepted that correction. The lead rejected removal for architectural purity, and challenged the claim that structured-data recipes are irrelevant—API/quality inspection needs them. Both agreed to retain the experiment and recommend owned production styling because of existing Svelte workflows and the already-owned visual language. Both require accessibility revalidation and a bounded parity proof before any replacement. [Full reviewer record](theme-foundation-review.md).
