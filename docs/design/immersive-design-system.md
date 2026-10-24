# Immersive design system

Updated 2026-10-23. This is the reusable styling and interaction contract for the approved Obsidian / Porcelain Bronze direction. The [production integration](production-experience.md) now applies it to the real Studio on the feature branch. The [current design record](2026-10-22-redesign/round-4-discussion/current-design.md) controls product decisions; this document controls their reusable visual treatment.

Latest refinement: [independent review challenge and accepted repairs](../reviews/2026-10-23-claude-redesign-audit/response.md). The prototype consumes the published Bronze UI dependency. GlassKit experiments remain historical comparisons; GlassKit is not loaded by the current prototype.

**Full-app foundation:** [Owned Bronze theme and component/state coverage](2026-10-22-redesign/round-6-prototype/theme-foundation.md) records the design research. Shared component recipes and native light/dark tokens live upstream in Bronze UI; scene layout and workflows remain here.

## Sources of truth

Production sources: [theme adapter](../../app/src/studio/experience/theme.css), [responsive layout](../../app/src/studio/experience/layout.css), [world configuration](../../app/src/studio/experience/config.ts), [movement](../../app/src/studio/experience/movement.ts), [presentation resolver](../../app/src/studio/experience/presentation.ts) and [focus/popover placement](../../app/src/studio/experience/focus.ts). Production uses existing Studio components and state for real workflows; the following table preserves the isolated prototype reference implementation.

| Responsibility | Source |
| --- | --- |
| World palette and mode application | [theme.mjs](2026-10-22-redesign/round-6-prototype/theme.mjs) |
| Consumer geometry and responsive layout | [styles.css](2026-10-22-redesign/round-6-prototype/styles.css) |
| Bronze package imports and semantic aliases | [bronze-theme.css](2026-10-22-redesign/round-6-prototype/bronze-theme.css) |
| Shared recipe application | [bronze.mjs](2026-10-22-redesign/round-6-prototype/bronze.mjs) |
| Stable focus restoration | [focus.mjs](2026-10-22-redesign/round-6-prototype/focus.mjs) |
| Measured available stage | [stage-layout.mjs](2026-10-22-redesign/round-6-prototype/stage-layout.mjs) |
| Button, icon, field and mode-selector markup | [ui.js](2026-10-22-redesign/round-6-prototype/ui.js) |
| Shared equipment surface and slot metadata | [equipment.js](2026-10-22-redesign/round-6-prototype/equipment.js) |
| Creator rendering, prompt composition and draft sizing helper | [creator.js](2026-10-22-redesign/round-6-prototype/creator.js) |
| Direction metadata, labels, preset sets and angular selection | [directions.mjs](2026-10-22-redesign/round-6-prototype/directions.mjs) |
| Keyboard vector for Preview and gameplay | [input.mjs](2026-10-22-redesign/round-6-prototype/input.mjs) |
| Playback timing, Preview presentation, gameplay fallbacks | [motion.mjs](2026-10-22-redesign/round-6-prototype/motion.mjs) |
| Replaceable scene assets and code-only reflection/motion configuration | [config.js](2026-10-22-redesign/round-6-prototype/config.js) |

Use these components and tokens when extending the prototype. During Svelte integration, translate the same contracts into shared components rather than copying each screen's markup or maintaining two permanent token sources. No new framework or design-system dependency is needed for this proof.

## Appearance

Bronze's versioned `styles/tokens.css` and [style guide](https://github.com/Shilo/bronze-ui/blob/main/docs/STYLE-GUIDE.md) are authoritative for colors, fonts, radii, focus, surfaces and accessible preference fallbacks. Do not maintain a duplicate palette here. The adapter maps semantic roles without copied color literals. `applyTheme` changes mode attributes; an early guarded head script applies the stored scheme before module loading.

World floor, seam and fog colors live in `theme.mjs`. They remain quieter than UI accents and never recolor character artwork. Canvas fills read the shared surface role.

The overflow contains exactly one ordinary **Light mode / Dark mode** action. Its sun/moon icon and label describe the destination. Apply immediately and remember the preference. Do not add an Appearance category, named-theme menu, or shader/light control.

Actor and equipment pixels never consume appearance tokens. Preserve source colors and nearest-neighbor scaling in integer physical pixels, with origins snapped to the device-pixel grid. Optional reflections are separate copies configured in code, never a player-facing switch. The sample equipment palette is authored artwork data, not a theme palette, and does not change on hover or theme switching.

## Typography and visual hierarchy

- Georgia is the display face for character/screen headings; Segoe UI with system sans-serif fallback serves controls and body text. Font families are defined once as `--font-display` and `--font-ui`.
- Desktop type scales by the documented responsive CSS, not browser-wide transform scaling. Inspect computed typography at the reference viewport when changing it; source CSS is authoritative over old screenshot annotations.
- On narrow portrait phones: equipment modes are 14 px; categories and item names 13 px; view labels 14.5 px. Keep the display heading distinct. Do not scale desktop UI down as one bitmap.
- Selected modes use bronze, stronger weight and an underline. Selection must not rely only on color. Secondary text remains readable, not decorative filler. Use functional headings and actual character information; omit slogans and invented classes.
- Maintain local reading gradients over the world. Creator fields get a quieter surface across the form area. Gradients remain behind the sprite canvas so they cannot tint actor pixels.

## Geometry, states and responsive composition

Control, panel and dialog radii are shared tokens. Use the installed Bronze recipes; earlier radius studies are historical comparisons. Standard borders and focus outlines use shared tokens too. Circular palette swatches, joystick rings and square pixel artwork are purposeful exceptions.

Translucent materials are limited to playback and temporary menus/toasts; dialog reading surfaces remain opaque. Keep recommended view labels open and underlined. Do not enclose equipment in shiny cards. Forms use the shared field material and meaningful boundaries without per-field filters. Solid bronze actions use existing on-accent ink. Original sprite pixels/world imagery remain independent of the material.

The current adapter imports Bronze tokens/components without the optional document reset. Shared materials, native fields, selected states, borders and focus belong upstream. The quiet select variant is used only inside the already bounded playback toolbar. Native select affordances remain native. Consumer focus restoration and navigation remain application responsibilities.

Buttons, icon buttons, fields and mode selectors use the same markup helpers. Native buttons keep Enter/Space behavior; action labels and disabled states remain explicit. Mode rows look like tabs but use native pressed buttons, so scene arrow keys are not misrepresented as an unimplemented ARIA tablist controller. A future proper tablist must include its full keyboard behavior and resolve that shortcut conflict explicitly.

Desktop information stays left and equipment stays in one right-hand zone. The rail reaches 414 px at the reference desktop size and narrows responsively. Portrait uses one expandable bottom sheet with three item cards including None; shallow landscape uses a right rail. Preserve real scroll access to remaining controls instead of shrinking labels to fit every field at once.

The same equipment component renders in Preview, Top-down and Side-scroller. Hide only controls that do not apply to gameplay. Selected character thumbnails use the current composite's south still frame and update with equipment. Do not replace them with generated portraits or stale initial-outfit images.

### Paint overflow without alignment changes

The outer wardrobe is the layout anchor and permits visible overflow. Its shared inner scrollport extends 8 px beyond each inline content edge, with equal internal padding. Content coordinates stay unchanged while selection and focus outlines get paint room. This is deliberate: CSS `overflow-x:visible` combined with `overflow-y:auto` does not provide independent visible horizontal painting.

Keep the selection ring and focus outline external to the swatch. Do not shift palette labels/swatches to disguise clipping, and do not remove vertical scrolling. Hover keeps each swatch's own color; generic button surface rules must not override it. Verify the ring in both themes, portrait, landscape and a scrolled sheet.

## Direction and presentation contracts

Preview and live modes share keyboard vectors, compass metadata and nearest-direction mathematics. WASD/arrows support chords; opposite keys cancel, diagonals normalize, and ties retain the previous supported facing. On release, preserve facing. Letter/arrow shortcuts require focus on the labelled world canvas. Focusing UI controls clears held keyboard input; blur and context changes clear all movement. Touch movement may continue while a second finger operates equipment.

Character selection reuses the same key mapping: A/W/Left/Up select the previous character; D/S/Right/Down select the next. Each key press advances once, with existing wraparound; held-key repeats do not race through characters. Enter opens customization only when the world has focus; on a focused control it performs native activation. Search fields, menus, dialogs and modified shortcuts retain their normal behavior.

The selection screen also accepts vertical wheel input anywhere: down selects next, up previous. Wheel, arrow buttons and selection shortcuts navigate the current search results, wrapping at their ends. Wheel input normalizes pixel/line/page deltas, accumulates a 40px threshold and caps changes at one per 180ms without queuing large bursts. Reveal the chosen desktop row without moving focus. Open menus/dialogs and modified wheel gestures retain native behavior; other screens keep normal scrolling. This is consumer navigation, not a Bronze theme recipe.

Escape dismisses the topmost menu/dialog or returns a non-editing screen to selection. Editable controls retain Escape and Backspace. Backspace dismisses a popover or returns from the focused world; on ordinary controls it must not navigate the page or browser history. Repeats do not cascade through navigation levels.

Tab/Shift+Tab always traverse controls. With the world focused, 1/2/3 select Preview/Top-down/Side-scroller. View changes stop movement and reset the camera. Native button activation survives UI updates, popovers receive focus on opening, and closing overlays returns focus to a surviving trigger. A full-window world uses Bronze's inset focus-offset option so its ring remains visible.

Preview changes **facing only**. It does not translate the actor or camera, change the selected clip, reset playback preference, or derive permitted directions from the current animation. Every declared character direction remains selectable by keyboard and button.

If the requested Preview clip lacks the requested direction, retain both selections, show a valid stored still for that facing when available, display **Still** in playback and show a persistent coverage note. If no artwork exists for that facing, say so rather than display another direction as if it matched. Normal gameplay has its own continuous movement/fallback policy. Preview fallback does not manufacture export coverage.

The current manifest's compass supports up to eight named angles; any nonempty subset (including one, two, three, five or seven directions) works. Canonical `north-east` IDs and legacy `northeast` aliases share metadata while preserving the supplied rig ID. New arbitrary angles need explicit metadata, not guessed labels or assumptions based on a direction count.

## Change discipline and known limits

**Current theme owner (2026-10-23):** the extracted MIT [Bronze UI package](https://github.com/Shilo/bronze-ui), [style guide](https://github.com/Shilo/bronze-ui/blob/main/docs/STYLE-GUIDE.md) and [standalone showcase](https://shilo.github.io/bronze-ui/) own native light/dark roles, materials, themed scrollbars, reusable controls and overlay behaviors. Make new theme changes there. The [round-six playable prototype consumes that dependency](2026-10-22-redesign/round-6-prototype/bronze-integration.md); its scene and layout remain local. The [round-seven lab](2026-10-22-redesign/round-7-theme/README.md) and archived vendor boundary preserve historical evidence. Production Studio migration remains separate.

1. Change a token or shared component at its source; do not paste per-screen color/layout overrides.
2. Keep breakpoint overrides that express real responsive differences. Avoid redundant declarations and history-based patch stylesheets. The former style.css/parity.css stack is consolidated into styles.css. The current bronze-theme.css is a package adapter; glass-theme.css is archived experiment source.
3. Keep asset URLs in the dedicated `backgrounds` map. Preload only that map; a theme label or color string must never be fetched as an image.
4. Verify representative selection, creator, Preview and both live modes in dark/light and desktop/phone. Check missing-animation behavior, original actor colors, pointer cancellation and paint overflow when their code changes.
5. Update this guide and the design decision record with accepted changes. Save screenshots and test reports separately; old reviews remain historical evidence.

The creator is still an editable visual draft, not the production validation/generation pipeline. Its approximate auto-frame helper and limited fixture coverage are documented prototype limits. This refactor does not certify accessibility, all GPU/device combinations or full importer support. It establishes concrete shared ownership without inventing a general-purpose framework.

Drag-only joystick input remains a known non-drag pointer accessibility gap. Tap-to-move needs a separate interaction decision before claiming WCAG 2.5.7 conformance. Compact and expanded sheets must preserve a visible measured stage, not paint controls over the character.
