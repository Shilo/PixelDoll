---
name: PixelDoll
description: Dress up 2D game characters with pixel-perfect paper dolling.
colors:
  canvas: "#111317"
  surface: "#202329"
  text: "#f2eee6"
  muted: "#b8b5ad"
  accent: "#c9a66b"
  on-accent: "#111317"
  success: "#84c79a"
  warning: "#e7bc75"
  danger: "#f2a099"
  info: "#9bbce5"
  canvas-light: "#eeeae2"
  surface-light: "#faf7f0"
  text-light: "#25282d"
  muted-light: "#5e625f"
  accent-light: "#76562f"
  on-accent-light: "#ffffff"
  success-light: "#226c43"
  warning-light: "#775319"
  danger-light: "#a3312f"
  info-light: "#345f8e"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(28px, 3.2vw, 44px)"
    fontWeight: 400
    lineHeight: 1.15
  headline:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.15
  title:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: "8px"
  panel: "12px"
  dialog: "16px"
  round: "50%"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  button-quiet:
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  tab:
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: "8px 0"
    height: "44px"
  tab-selected:
    textColor: "{colors.accent}"
    typography: "{typography.body}"
  item-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "12px 6px"
    height: "148px"
  item-tile-selected:
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  palette-ramp:
    rounded: "{rounded.control}"
    width: "44px"
    height: "24px"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.dialog}"
    padding: "24px"
  toast:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.panel}"
    padding: "12px 16px"
---

# Design System: PixelDoll

All shared appearance (colors, materials, states, focus, borders, radii) comes from `@shilo/bronze-ui` 0.2.8 (`styles/tokens.css` and `styles/components.css`). The tokens above mirror its `--bu-*` variables; Bronze is the source of truth, and a change to them belongs in the Bronze repository first. PixelDoll owns layout, geometry, spacing and the world scene (`app/src/studio/experience/layout.css`, `config.ts`, `ground.ts`). The workflow contract is [docs/design/production-experience.md](docs/design/production-experience.md).

Verified against the running app on 2026-11-09: Characters, Customize (Preview, Top-down, Side-scroller), Wardrobe, Colors, Export, More and New character, at 1440×900 and 390×844, dark and light.

## Overview

**Creative North Star: "The character stands center stage; the tools sit at the edges"**

That line is a plain summary of the layout, not a theme. Every main screen is a full-window scene: a photographic floor that fades into mist (dark stone in dark mode, pale polished stone in light mode) with the pixel-art character large in the middle. The interface is placed around it: navigation along the top, the character's name and description at the upper left, equipment and colors in a column on the right, and playback controls in a small floating bar under the character. On phones the same pieces stack: header, name, view tabs, a shorter stage, and an expandable bottom panel for equipment.

The look is calm and modern: system sans-serif text, Lucide line icons, thin borders, and a single warm bronze accent. The only serif is Georgia for screen titles and character names. The character's pixels are never lit, tinted, filtered or resized with smoothing. Internally the two world themes are called Obsidian (dark) and Porcelain (light), together "Obsidian / Porcelain Bronze" ([approved direction](docs/design/2026-10-22-redesign/round-4-discussion/current-design.md)).

Density is low around the stage and moderate in the right column, where people do most of their work: picking items, recoloring and adding new items.

**Key Characteristics:**

- Full-window world scene with the character as the largest element on screen.
- Dark by default, with a complete light theme (not an inverted filter).
- One accent color, bronze, used for the selected state, focus and the single main action.
- Georgia only for titles and names; Segoe UI / system sans-serif for everything else.
- Controls mostly sit straight on the scene as text and icons; borders appear where you choose something.
- Native dialogs and menus with Bronze styling; bottom sheets on phones.

## Colors

A warm neutral palette (charcoal and parchment) with one bronze accent and four muted status colors, each defined separately for dark and light.

### Primary

- **Bronze** (`accent` in dark, `accent-light` in light): selected tabs and their underline, selected equipment tiles and their check mark, focus outlines, selected direction buttons, and the fill of the one main action on a screen (Customize, New head item, Create character, Download). Text on a bronze fill uses `on-accent`.

### Neutral

- **Canvas** (`canvas`, `canvas-light`): page background behind the world image and inside code blocks.
- **Surface** (`surface`, `surface-light`): dialogs, menus, inputs, toasts and the base for every translucent material.
- **Text** (`text`, `text-light`): primary text and icons.
- **Muted** (`muted`, `muted-light`): secondary text such as descriptions, counts, captions and placeholders.
- **Derived roles** (computed in Bronze with `color-mix`, not separate colors): line (muted at 27% over surface) for dividers and outlined buttons; border (muted at 80%) for inputs and fields; rim (muted at 38%, translucent) for dialogs, menus and tiles; hover (text at 7% over surface); selected (accent at 13% over surface); floating (surface at 92%, translucent) for the playback bar and popovers; tile (surface at 65%, translucent) for equipment cards.

### Status

- **Success, Warning, Danger, Info** (`success`, `warning`, `danger`, `info` and their `-light` pairs): toast and notice edge stripes and icons, badges, invalid field borders and destructive buttons. Warning is also the tone of the preview notice.

### Named Rules

**The One Accent Rule.** Bronze marks what is selected, focused or the main action. It is not used for decoration, headings or large fills, and each screen has at most one bronze-filled button.

**The Untouched Sprite Rule.** UI colors never reach the character. No lighting, tint, glow, shadow or color grading is applied to actor pixels; palette changes happen only through the user's own recoloring.

**The User Color Rule.** Palette swatches show the user's data, not the theme. A selected palette ramp gets a text-colored outline (2px, offset 2px), not a bronze one, so it stays visible against any ramp.

## Typography

**Display Font:** Georgia (with Times New Roman, serif)
**Body Font:** Segoe UI (with system-ui, sans-serif)
**Mono Font:** ui-monospace (with Consolas, monospace)

**Character:** A book-like serif for names gives each character a title-page feel; everything you operate is in the system sans-serif so it reads as a normal, familiar app.

### Hierarchy

- **Display** (Georgia 400, `clamp(28px, 3.2vw, 44px)`, 1.15): screen titles and the current character's name at the upper left ("Characters", "Adventurer", "New character").
- **Headline** (Georgia 400, 30px, 38px on wide desktop): the selected character's name under the stage on Characters.
- **Title** (Segoe UI 600, about 19 to 20px, 1.3): panel and dialog headings ("Headwear", "Character colors", "Export").
- **Body** (Segoe UI 400, 16px, 1.5): tab labels, item names, form text. Inputs stay at 16px or larger so phones do not zoom.
- **Label** (Segoe UI 400, 14px): header actions, small descriptions, counts and the muted "Customize character" eyebrow.
- **Caption** (Segoe UI 400, 12px): help hints, field sub-labels, costs ("~2-5 gens") and keyboard hints on the live views.
- **Mono** (13px, 1.6): API call previews and other code.

### Named Rules

**The Names Are Serif Rule.** Georgia is only for screen titles and character names. Buttons, tabs, labels and data are always sans-serif.

**The No Pixel Type Rule.** The UI never uses pixel fonts or pixel icons; the character sprite is the only pixel art on screen (PLAN.md D9).

## Layout

- **Scene first.** Main screens fill the viewport (`100dvh`, no page scroll). The world image covers the background and two "reading" gradients (from the top and from the right, about 85 to 88% surface fading out) keep text and controls readable over it.
- **Desktop (761px and wider).** Header pinned 20px from the top with a 44px row: back or brand at the left, view tabs (Preview, Top-down, Side-scroller) centered, then undo/redo, Share, Export, Full screen and More at the right. The identity block sits at the left from about 14% down. A right column of `clamp(300px, 21.56vw, 414px)` holds the cast list or the equipment panel and scrolls on its own. The stage and playback bar center in the space left of that column. Side margins are `clamp(28px, 2.92vw, 56px)`.
- **Phones (760px and narrower).** Margins drop to 20px. Header icons replace text labels. The equipment panel becomes a bottom sheet with a drag handle under a shorter stage; on Characters, search, New and Import sit above the cast and Customize is pinned at the bottom.
- **Short landscape (540px tall or less).** The layout keeps the stage beside the controls so the sprite keeps its space; at 500px tall or less, dialogs open as a full-height right-side sheet.
- **Breakpoints used:** 360, 600, 760/761, 1000, 1100, 1250 and 1279px wide; 540/541 and 700px tall.
- **Spacing rhythm.** Bronze steps of 4, 8, 12, 16, 24 and 32px. Gaps of 8 to 20px inside panels; equipment tiles in a two-column grid with 16px gaps.
- **Forms.** New character uses a full-screen form in three columns on desktop (size guide, appearance, body and directions) with the cost and Create button pinned bottom right.

## Elevation & Depth

Depth comes from the world scene, not from stacked cards. Panels on the scene are flat or translucent and borderless; shadows appear only on things that float above everything else: popovers, menus, the playback bar and dialogs.

### Shadow Vocabulary

- **Floating** (`0 8px 28px rgb(0 0 0 / .18)` dark, `/ .1` light): menus, popovers, tooltips, toasts and the playback bar, together with a 12px backdrop blur on floating surfaces.
- **Dialog** (`0 20px 64px rgb(0 0 0 / .32)` dark, `/ .2` light): Export, Inspect and other modal sheets, over a scrim of black at 50% (34% in light).

### Named Rules

**The Flat Scene Rule.** Nothing on the scene gets a shadow except floating layers. Translucent materials fall back to solid surface when the user asks for reduced transparency or more contrast, and all colors switch to system colors in forced-colors mode.

## Shapes

Gently rounded and consistent: 8px for controls, buttons, inputs, tiles and palette ramps; 12px for menus, popovers, toasts and tooltips; 16px for dialogs (top corners only when they open as a phone bottom sheet). Toggles and color pickers are fully round. Borders are 1px. Tabs use an underline instead of a box. Notices and toasts use a 3px colored stripe on the leading edge. Popovers point at their trigger with a small arrow.

## Components

### Buttons

- **Primary:** bronze fill, dark text (white in light mode), weight 600, 8px corners, at least 44px tall (56px for Customize). One per screen. Hover adds a 2px inner ring in the text-on-accent color instead of changing the fill.
- **Outline:** used in the header for Import, New character, Share and Export. Translucent surface (40%) with a 1px line border; hover fills with the hover color and a stronger border.
- **Quiet:** text or icon with no border (Characters back link, undo/redo, More, Random, Reset). Hover shows a light translucent background. Disabled controls drop to about 42 to 50% opacity and show the not-allowed cursor.
- **Focus:** every control shows a 2px bronze outline offset 3px.

### Tabs

- **Style:** text tabs with no background; the selected tab is bronze, weight 600, with a bronze underline (Preview/Top-down/Side-scroller; Wardrobe/Colors/Outfits/Moves; Appearance/Prompt).
- **Category tabs:** Head, Hair, Body and More stack a 27px Lucide icon over the label, with the same bronze selection and underline.

### Item tiles

- **Style:** two-column grid of cards with a 1px rim border, translucent tile background, 8px corners, the item's pixel art (about 90px tall, nearest-neighbor) above its name.
- **Selected:** bronze border, selected background, bronze name and a bronze check mark in the top-right corner.
- **None:** a full-width outlined row below the grid to remove the item.

### Palette ramps

Each color choice is a small 44×24px rounded chip showing the whole ramp from shadow to highlight, with a 1px border and a faint inner light ring so dark ramps stay visible. Chips grow to 48×44px on touch screens. The selected chip has a 2px text-colored outline. A "+" chip opens a custom color.

### Inputs / Fields

- **Style:** surface fill, 1px border, 8px corners, 44px minimum height, 16px text, muted placeholder.
- **Focus:** 2px bronze outline. **Invalid:** danger border with a 3px danger stripe on the left. **Read-only:** dashed border.
- **Selects:** native selects with Bronze picker styling where the browser supports it.
- **Choice groups:** option buttons (body size, direction presets, export formats) use bronze border, bronze text and selected background when chosen.

### Navigation

The header is the only global navigation: back to Characters at the left, the three view tabs centered on desktop (moved below the name on phones and mid-size screens), actions at the right. More opens a menu with Activity, API calls, Connect PixelLab, the Light/Dark mode switch, source code and version.

### Playback bar

A floating pill under the character in Preview: play/pause, the move select, direction buttons (S, E, N, W and diagonals when present) with the current one on a selected background, and Inspect. The live views replace it with a short keyboard hint at the lower left.

### Dialogs and notices

- **Dialogs:** surface, 1px rim, 16px corners, dialog shadow, sticky header and footer separated by 1px lines; full-width bottom sheets on phones.
- **Toasts and notices:** surface with a light tone tint, 12px corners, a 3px tone stripe and tone-colored icon, 14px text, a dismiss button; toasts sit centered near the bottom.

### Character stage

The character is drawn on a canvas at an integer pixel scale where possible, with nearest-neighbor sampling, centered over the world floor with an optional faint reflection. On Characters, the selected character is large with the others smaller beside it, and its name sits below in the headline serif.

## Do's and Don'ts

### Do:

- **Do** take every color, border, radius, shadow and state from Bronze tokens; fix shared appearance in `@shilo/bronze-ui`, release it, then update the dependency.
- **Do** keep the character the largest, most central element, and keep text readable over the world with the existing reading gradients.
- **Do** use bronze only for selection, focus and the single main action on a screen.
- **Do** use Georgia only for screen titles and character names, and Lucide icons at 20px with a 1.6 stroke for functional icons.
- **Do** keep primary touch targets about 44px and inputs at 16px or larger on phones.
- **Do** check every visual change in dark and light at desktop and phone sizes (including 320×568 and 844×390).

### Don't:

- **Don't** light, tint, filter, shadow or smoothly scale the character's pixels.
- **Don't** use pixel fonts, pixel icons or pixel-style borders in the UI.
- **Don't** add a second palette, local color overrides or new theme dependencies in PixelDoll.
- **Don't** add new glows, gradients or glass effects beyond Bronze's floating material and the scene's reading gradients.
- **Don't** put boxes and shadows around panels that sit on the scene, or add unrelated scenery or props to the world.
- **Don't** use bronze for headings, body text or decoration.
