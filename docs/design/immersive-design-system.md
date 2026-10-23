# Immersive design system

Updated 2026-10-23. This is the reusable styling and interaction contract for the approved Obsidian / Porcelain Bronze direction. It describes the implemented isolated prototype and the target for future app integration. Production Studio has not been migrated. The [current design record](2026-10-22-redesign/round-4-discussion/current-design.md) controls product decisions; this document controls their reusable visual treatment.

Latest refinement: [GlassKit evaluation and comparisons](2026-10-22-redesign/round-6-prototype/glasskit-study.md). The user authorized this isolated experiment after the previous no-GlassKit direction. Restrained material is the implemented recommendation; larger radii remain a comparison only.

**Full-app foundation recommendation:** [Owned Bronze theme and component/state coverage](2026-10-22-redesign/round-6-prototype/theme-foundation.md) extends this contract to production workflows after research and independent challenge. Prefer PixelDoll-owned semantic tokens, selective materials and existing native-first Svelte components. This is a migration recommendation, not an implemented replacement or new user approval. The current GlassKit prototype remains the reference until a bounded component/state proof demonstrates parity. The source ownership table below describes today's prototype.

## Sources of truth

| Responsibility | Source |
| --- | --- |
| Semantic UI colors, world palette, mode application | [theme.mjs](2026-10-22-redesign/round-6-prototype/theme.mjs) |
| Fonts, geometry, control states, responsive layout | [styles.css](2026-10-22-redesign/round-6-prototype/styles.css) |
| Pinned GlassKit token/material adaptation and accessibility fallbacks | [glass-theme.css](2026-10-22-redesign/round-6-prototype/glass-theme.css) |
| Shared material/component application and review-only variants | [material.mjs](2026-10-22-redesign/round-6-prototype/material.mjs) |
| Button, icon, field and mode-selector markup | [ui.js](2026-10-22-redesign/round-6-prototype/ui.js) |
| Shared equipment surface and slot metadata | [equipment.js](2026-10-22-redesign/round-6-prototype/equipment.js) |
| Creator rendering, prompt composition and draft sizing helper | [creator.js](2026-10-22-redesign/round-6-prototype/creator.js) |
| Direction metadata, labels, preset sets and angular selection | [directions.mjs](2026-10-22-redesign/round-6-prototype/directions.mjs) |
| Keyboard vector for Preview and gameplay | [input.mjs](2026-10-22-redesign/round-6-prototype/input.mjs) |
| Playback timing, Preview presentation, gameplay fallbacks | [motion.mjs](2026-10-22-redesign/round-6-prototype/motion.mjs) |
| Replaceable scene assets and code-only reflection/motion configuration | [config.js](2026-10-22-redesign/round-6-prototype/config.js) |

Use these components and tokens when extending the prototype. During Svelte integration, translate the same contracts into shared components rather than copying each screen's markup or maintaining two permanent token sources. No new framework or design-system dependency is needed for this proof.

## Appearance

| Role | Dark / Obsidian | Light / Porcelain |
| --- | --- | --- |
| Background | `#111317` | `#EEEAE2` |
| Local surface / gradient color | `#202329` | `#FAF7F0` |
| Primary text | `#F2EEE6` | `#25282D` |
| Secondary text | `#B8B5AD` | `#5E625F` |
| Bronze action/selection accent | `#C9A66B` | `#76562F` |
| Text on accent | `#111317` | `#FFFFFF` |
| Quiet divider | Secondary text at 26% opacity | Secondary text at 28% opacity |

The table documents the values; executable values live in theme.mjs. `applyTheme` supplies CSS variables and native control color-scheme. Scene floor, seam and fog values live beside those tokens. World-specific colors are intentionally quieter than UI accent colors; they are not an alternative UI palette. Fallback canvas fills read the same surface token rather than carrying a second hardcoded theme branch.

The overflow contains exactly one ordinary **Light mode / Dark mode** action. Its sun/moon icon and label describe the destination. Apply immediately and remember the preference. Do not add an Appearance category, named-theme menu, or shader/light control.

Actor and equipment pixels never consume appearance tokens. Preserve source colors and nearest-neighbor integer scaling. Optional reflections are separate copies configured in code, never a player-facing switch. The sample equipment palette is authored artwork data, not a theme palette, and does not change on hover or theme switching.

## Typography and visual hierarchy

- Georgia is the display face for character/screen headings; Segoe UI with system sans-serif fallback serves controls and body text. Font families are defined once as `--font-display` and `--font-ui`.
- At 1920 × 1080: studio view labels reach 23 px; equipment modes 21 px; categories/item labels 19 px; identity context/prompt 20/21 px; character heading 58 px. Creator inputs use 20 px, labels 17 px and editor modes 22 px. These are CSS sizes, not measured glyph-height accessibility thresholds.
- On narrow portrait phones: equipment modes are 14 px; categories and item names 13 px; view labels 14.5 px. Keep the display heading distinct. Do not scale desktop UI down as one bitmap.
- Selected modes use bronze, stronger weight and an underline. Selection must not rely only on color. Secondary text remains readable, not decorative filler. Use functional headings and actual character information; omit slogans and invented classes.
- Maintain local reading gradients over the world. Creator fields get a quieter surface across the form area. Gradients remain behind the sprite canvas so they cannot tint actor pixels.

## Geometry, states and responsive composition

Control, panel and dialog radii are shared tokens. Current restrained material uses **8 / 12 / 16 px**; baseline 5/8/10 and larger 16/24/24 remain review variants. Standard borders and focus outlines use shared tokens too. Circular palette swatches, joystick rings and square pixel artwork are purposeful exceptions.

Glass is limited to playback and temporary menus/dialogs/toasts. Keep recommended view labels open and underlined. Do not enclose equipment in shiny cards. Forms use shared 92% surface fills and stronger field borders without per-field filters. Solid bronze actions use existing on-accent ink. Original sprite pixels/world imagery remain independent of the material.

GlassKit 1.30.0 is locally pinned, MIT-licensed and loaded in a lower-priority cascade layer. Theme colors live on root so derived tokens resolve correctly. Adaptations belong in the documented adapter, not vendor source or per-screen copies. Native modality, focus return, labels and live regions remain application responsibilities. Keep native hints and Help dialogs: the pinned library supplies no tooltip component.

Buttons, icon buttons, fields and mode selectors use the same markup helpers. Native buttons keep Enter/Space behavior; action labels and disabled states remain explicit. Mode rows look like tabs but use native pressed buttons, so scene arrow keys are not misrepresented as an unimplemented ARIA tablist controller. A future proper tablist must include its full keyboard behavior and resolve that shortcut conflict explicitly.

Desktop information stays left and equipment stays in one right-hand zone. The rail reaches 414 px at the reference desktop size and narrows responsively. Portrait uses one expandable bottom sheet with three item cards including None; shallow landscape uses a right rail. Preserve real scroll access to remaining controls instead of shrinking labels to fit every field at once.

The same equipment component renders in Preview, Top-down and Side-scroller. Hide only controls that do not apply to gameplay. Selected character thumbnails use the current composite's south still frame and update with equipment. Do not replace them with generated portraits or stale initial-outfit images.

### Paint overflow without alignment changes

The outer wardrobe is the layout anchor and permits visible overflow. Its shared inner scrollport extends 8 px beyond each inline content edge, with equal internal padding. Content coordinates stay unchanged while selection and focus outlines get paint room. This is deliberate: CSS `overflow-x:visible` combined with `overflow-y:auto` does not provide independent visible horizontal painting.

Keep the selection ring and focus outline external to the swatch. Do not shift palette labels/swatches to disguise clipping, and do not remove vertical scrolling. Hover keeps each swatch's own color; generic button surface rules must not override it. Verify the ring in both themes, portrait, landscape and a scrolled sheet.

## Direction and presentation contracts

Preview and live modes share keyboard vectors, compass metadata and nearest-direction mathematics. WASD/arrows support chords; opposite keys cancel, diagonals normalize, and ties retain the previous supported facing. On release, preserve facing. Shortcuts ignore text/select inputs, open menus and dialogs; blur and context changes clear held input.

Character selection reuses the same key mapping: A/W/Left/Up select the previous character; D/S/Right/Down select the next. Each key press advances once, with existing wraparound; held-key repeats do not race through characters. Enter opens customization. Search fields, menus, dialogs and modified shortcuts retain their normal behavior.

Escape and Backspace dismiss the topmost dialog or menu first; otherwise they return creation/studio to character selection. Backspace in editable controls remains editing, and neither shortcut navigates browser history at the selection root. Repeats do not cascade through multiple navigation levels. Studio Tab cycles Preview → Top-down → Side-scroller, and Shift+Tab reverses, when the scene or view-selector button has focus. Elsewhere Tab retains native focus traversal. View switching uses the same transition as clicking a mode, including movement cancellation and camera reset. Modified browser shortcuts remain untouched.

Preview changes **facing only**. It does not translate the actor or camera, change the selected clip, reset playback preference, or derive permitted directions from the current animation. Every declared character direction remains selectable by keyboard and button.

If the requested Preview clip lacks the requested direction, retain both selections, show a valid stored still for that facing when available, display **Still** in playback and show a persistent coverage note. If no artwork exists for that facing, say so rather than display another direction as if it matched. Normal gameplay has its own continuous movement/fallback policy. Preview fallback does not manufacture export coverage.

The current manifest's compass supports up to eight named angles; any nonempty subset (including one, two, three, five or seven directions) works. Canonical `north-east` IDs and legacy `northeast` aliases share metadata while preserving the supplied rig ID. New arbitrary angles need explicit metadata, not guessed labels or assumptions based on a direction count.

## Change discipline and known limits

**Owned-theme successor proof (2026-10-23):** the isolated [Bronze component showcase](2026-10-22-redesign/round-7-theme/README.md) now implements the [full component style guide](2026-10-22-redesign/round-7-theme/STYLE-GUIDE.md). It owns native light/dark roles, restrained floating/opaque surfaces, themed scrollbars, reusable controls and overlay behaviors without GlassKit. Use that guide for new theme work. The round-six vendor boundary described below remains historical and still applies to that unchanged playable reference; neither prototype is a completed production migration.

1. Change a token or shared component at its source; do not paste per-screen color/layout overrides.
2. Keep breakpoint overrides that express real responsive differences. Avoid redundant declarations and history-based patch stylesheets. The former style.css/parity.css stack is consolidated into styles.css. The separate glass-theme.css is a deliberate vendor boundary, not an arbitrary patch sheet.
3. Keep asset URLs in the dedicated `backgrounds` map. Preload only that map; a theme label or color string must never be fetched as an image.
4. Verify representative selection, creator, Preview and both live modes in dark/light and desktop/phone. Check missing-animation behavior, original actor colors, pointer cancellation and paint overflow when their code changes.
5. Update this guide and the design decision record with accepted changes. Save screenshots and test reports separately; old reviews remain historical evidence.

The creator is still an editable visual draft, not the production validation/generation pipeline. Its approximate auto-frame helper and limited fixture coverage are documented prototype limits. This refactor does not certify accessibility, all GPU/device combinations or full importer support. It establishes concrete shared ownership without inventing a general-purpose framework.
