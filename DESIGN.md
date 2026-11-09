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
  title:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  action:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
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
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    height: "46px"
  button-customize:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "12px"
    height: "56px"
  button-outline:
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
    typography: "{typography.action}"
  item-tile:
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
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "12px 16px"
---

# Design System: PixelDoll

All shared appearance (colors, materials, states, focus, borders, radii) comes from `@shilo/bronze-ui` 0.2.8 (`styles/tokens.css` and `styles/components.css`). The tokens above mirror its `--bu-*` variables; Bronze is the source of truth, and a change to them belongs in the Bronze repository first. Translucent materials (outline, tile, floating, action hover, selected) are derived Bronze roles, so they are described in prose and in `.impeccable/design.json` rather than as frontmatter colors. PixelDoll owns layout, geometry, spacing and the world scene (`app/src/studio/experience/layout.css`, `config.ts`, `ground.ts`), plus a few local rules noted below. The workflow contract is [docs/design/production-experience.md](docs/design/production-experience.md).

This file records the current interface; it is not a new direction. Verified against the running app on 2026-11-09 (Characters, Customize with Preview, Top-down and Side-scroller, Wardrobe, Colors, Export, More and New character, at 1440×900 and 390×844, dark and light) and against the CSS cited here. Other sizes come from the stylesheets, not new captures.

## Overview

**Creative North Star: "In character views, the character is prominent and controls are grouped around it."**

Characters and Customize share a full-window world background: a photographic floor that fades into mist (dark stone in dark mode, pale polished stone in light mode). Characters centers the selected character beside the library. Customize places the character's name and description at the upper left, equipment and colors in a column on the right, and the playback controls in a small floating bar under the character. New character instead uses a full-screen form over the same world background. On phones the pieces stack: header, name, view tabs, a shorter stage, and an expandable bottom panel for equipment.

The look is calm and modern: system sans-serif text, Lucide line icons, thin borders, and a single warm bronze accent. The only serif is Georgia for screen titles and character names. The character's pixels are never lit, tinted, filtered or resized with smoothing. Internally the two world themes are called Obsidian (dark) and Porcelain (light), together "Obsidian / Porcelain Bronze" ([approved direction](docs/design/2026-10-22-redesign/round-4-discussion/current-design.md)).

Density is low around the stage and moderate in the right column, where people do most of their work: picking items, recoloring and adding new items.

**Key Characteristics:**

- Full-window world background with the character as the visual focus of character views.
- Dark by default, with a complete light theme (not an inverted filter).
- One accent color, bronze, used for selection, focus, links and primary actions.
- Georgia only for titles and names; Segoe UI / system sans-serif for everything else.
- Controls mostly sit straight on the scene as text and icons; borders appear where you choose something.
- Native dialogs and menus with Bronze styling; bottom sheets on phones.

## Colors

A warm neutral palette (charcoal and parchment) with one bronze accent and four muted status colors, each defined separately for dark and light.

### Primary

- **Bronze** (`accent` in dark, `accent-light` in light): selected tabs and their underline, selected equipment tiles and their check mark, focus outlines, links, selected direction buttons, and the fill of primary actions (Customize, New head item, Create character, Download). Text on a bronze fill uses `on-accent`.

### Neutral

- **Canvas** (`canvas`, `canvas-light`): page background behind the world image and inside code blocks.
- **Surface** (`surface`, `surface-light`): dialogs, menus, inputs, toasts and the base for every translucent material.
- **Text** (`text`, `text-light`): primary text and icons.
- **Muted** (`muted`, `muted-light`): secondary text such as descriptions, counts, captions and placeholders.
- **Derived roles** (Bronze `--bu-*` roles computed with `color-mix`, not separate colors): line (muted at 27% over surface) for dividers and outlined buttons; border (muted at 80%) for inputs and fields; rim (muted at 38%, translucent) for dialogs, menus and tiles; hover (text at 7% over surface); selected (accent at 13% over surface); outline (surface at 40%, translucent) for outlined buttons; tile (surface at 65%) for equipment cards; floating (surface at 92%) for the playback bar and popovers; action hover (surface at 80%) for quiet buttons; direction selected (accent at 14%) for the current facing.

### Status

- **Success, Warning, Danger, Info** (`success`, `warning`, `danger`, `info` and their `-light` pairs): toast and notice edge stripes and icons, badges, invalid field borders and destructive buttons. Warning is also the tone of the preview notice.

### Named Rules

**The One Accent Rule.** Bronze marks selection, focus, links and primary actions. Ordinary headings and body copy stay neutral. Some recovery and item-review states show more than one bronze-filled action.

**The Untouched Sprite Rule.** UI colors never reach the character. No lighting, tint, glow, shadow or color grading is applied to actor pixels; palette changes happen only through the user's own recoloring.

**The User Color Rule.** Palette swatches show the user's data, not the theme. A selected palette ramp gets a text-colored outline (2px, offset 2px), not a bronze one, so it stays visible against any ramp.

## Typography

**Display Font:** Georgia (with Times New Roman, serif)
**Body Font:** Segoe UI (with system-ui, sans-serif)
**Mono Font:** ui-monospace (with Consolas, monospace)

**Character:** A book-like serif for names; everything you operate is in the system sans-serif so it reads as a normal, familiar app.

### Hierarchy

- **Display** (Georgia 400, 1.15): Characters and the current character's name at the upper left use `clamp(28px, 3.2vw, 44px)` with component-specific responsive overrides. New character uses `clamp(28px, 2.3vw, 40px)` on desktop and 28px in the phone layout.
- **Headline** (Georgia 400, normal line height): the selected character's name below the Characters stage. 30px by default, 38px above 1100px wide when at least 541px tall, 28px in the phone layout and 24px in short landscape.
- **Title / headings** (Segoe UI, sized per component; the `title` token is the equipment heading): 19px weight 600 equipment headings ("Headwear", "Character colors"), 18px standard dialog headings ("Export") and 24px weight 600 for "Your characters".
- **Body** (Segoe UI 400, 16px, 1.4): tab labels, item names and form text in panels. The app does not load Bronze's base stylesheet; its own default is 14px with a 1.4 line height. Inputs stay at 16px or larger so phones do not zoom.
- **Action** (Segoe UI 600, 16px, 1.4): labels of bronze-filled primary actions on the scene (14px in the phone layout).
- **Label** (Segoe UI 400, 14px, 1.4): header actions, small descriptions, counts and the muted "Customize character" eyebrow.
- **Caption** (Segoe UI 400, 12px, 1.4): help hints, field sub-labels, costs ("~2-5 gens") and keyboard hints on the live views.
- **Mono** (13px, 1.6): API call previews and other code.

### Named Rules

**The Names Are Serif Rule.** Georgia is only for screen titles and character names. Buttons, tabs, labels and data are always sans-serif.

**The No Pixel Type Rule.** Interface typography and functional icons are never pixel fonts or pixel icons; character and equipment artwork remain pixel art (PLAN.md D9).

## Layout

- **Scene first.** Characters and Customize fill the viewport (`100dvh`, no page scroll). The world image covers the background, and two reading gradients (from the top and from the right) keep text and controls readable over it. They start at 85% and 88% surface in dark mode and 90% and 92% in light mode, and fade out.
- **Header.** Characters shows the brand with Import, New character, Full screen and More. Customize shows the Characters back action, undo/redo, Share, Export, Full screen and More, with Activity while jobs run. From 761px wide (and at least 541px tall) the header sits 20px from the top in a 44px row; above 1100px wide and at least 541px tall it sits 28px from the top in a 50px row. On phones the header actions become icons, and on compact phones Redo moves into More.
- **View tabs.** From 1280px wide and at least 541px tall, Preview / Top-down / Side-scroller sit at the top center of the header. From 761px to 1279px wide (at least 541px tall) they stay in the character details below the name, so they cannot overlap header actions.
- **Desktop columns.** The identity block sits at the left from about 14% down. A right column of `clamp(300px, 21.56vw, 414px)` holds the cast list or the equipment panel and scrolls on its own. The stage and playback bar center in the space left of that column. Side margins are `clamp(28px, 2.92vw, 56px)` on wide desktop; up to 1100px wide the margin is 24px and the column a fixed 300px.
- **Equipment grid.** Desktop uses two columns with 16px gaps and a full-width None action below the items. Phones use three columns with 8px gaps, compact cards, and None as a grid cell.
- **Phones (760px wide or less, at least 541px tall).** Margins drop to 20px. The equipment panel becomes a bottom sheet under a shorter stage, opened and closed with an expand/collapse button at its top edge (a click, not a drag), over a gradient from the floating to the sheet material. On Characters, search, New and Import sit above the cast and Customize is pinned at the bottom.
- **Short landscape (540px tall or less, at least 600px wide).** The stage stays beside the controls so the sprite keeps its space. At 500px tall or less (and 601px wide or more), dialogs open as a full-height right-side sheet.
- **New character.** A full-screen form: four columns on wide desktop (size guide, appearance, body geometry, directions), three at 1250px, two at 1000px, stacked on phones. Cost and Create stay in the action footer.
- **Key scene and creator breakpoints:** 360, 600, 760/761, 1000, 1100, 1250 and 1279/1280px wide; 500, 540/541 and 700px tall.
- **Spacing rhythm.** Bronze steps of 4, 8, 12, 16, 24 and 32px, with gaps of 8 to 20px inside panels.

## Elevation & Depth

Depth comes from the world scene, not from stacked cards. Panels on the scene are flat or translucent; shadows appear only on things that float above everything else: popovers, menus, toasts, the playback bar and dialogs.

### Shadow Vocabulary

- **Floating** (`0 8px 28px rgb(0 0 0 / .18)` dark, `/ .1` light): menus, popovers, tooltips, toasts and the playback bar, with a backdrop blur of `--bu-blur` (12px) on floating surfaces.
- **Dialog** (`0 20px 64px rgb(0 0 0 / .32)` dark, `/ .2` light): Export, Inspect and other modal sheets, over a scrim of black at 50% (34% in light).

### Named Rules

**The Flat Scene Rule.** Nothing on the scene gets a shadow except floating layers. With reduced transparency or more contrast, translucent materials become solid surface and blur is removed. In forced-colors mode, semantic UI roles switch to system colors; artwork and user color data are separate from those roles.

### Motion

State transitions use `--bu-duration` (140ms). With reduced motion, Bronze sets it to 0ms and PixelDoll removes CSS transitions and animations. This does not stop user-controlled sprite playback.

## Shapes

Gently rounded and consistent: 8px for controls, buttons, inputs, tiles and palette ramps; 12px for menus, popovers, toasts and tooltips; 16px for dialogs (top corners only when they open as a phone bottom sheet). Toggles and color pickers are fully round. Borders are 1px. Tabs use an underline instead of a box. Notices and toasts use a 3px colored stripe on the leading edge. Popovers point at their trigger with a small arrow.

## Components

### Buttons

- **Primary:** Bronze accent fill, on-accent text (dark in dark mode, white in light mode), weight 600, 8px corners. Hover keeps the fill and adds a 2px inset on-accent ring. Geometry varies by component: New item is at least 46px tall on desktop and 44px in the phone layout; Customize is at least 56px tall. Sheet actions (Create character, Download) also keep legacy Studio `btn primary` classes for their sizing; that older darkening hover is overridden by the Bronze primary-hover rule.
- **Outline:** header actions such as Import, New character, Share and Export. Bronze outline material with a 1px line border; hover fills with the hover color and a stronger border.
- **Quiet:** text or icon with no border (Characters back link, undo/redo, More, Random, Reset). Hover shows the action-hover material. Disabled controls drop to about 42 to 50% opacity and show the not-allowed cursor.
- **Focus:** a 2px bronze outline. PixelDoll's general focus rule uses a 2px offset; Bronze's standalone default is 3px, and some components set their own offset.

### Tabs

- **Style:** view and panel-mode buttons (Preview/Top-down/Side-scroller; Wardrobe/Colors/Outfits/Moves) use `aria-pressed`; the selected one is bronze, weight 600, with a 1px bronze underline. Appearance/Prompt in New character is a tablist with `aria-selected` and a 2px underline.
- **Category tabs:** Head, Hair, Body and More stack a Lucide icon (27px on desktop, 20px on phones) over the label. They use tab semantics with `aria-selected` and the same 1px bronze underline.

### Item tiles

- **Style:** cards with a 1px rim border, the Bronze tile material, 8px corners, and the item's pixel art (about 90px tall on desktop, nearest-neighbor) above its name.
- **Selected:** bronze border, selected background, bronze name and a bronze check mark in the top-right corner.
- **None:** removes the item; full-width row below the grid on desktop, a grid cell on phones.

### Palette ramps

Each color choice is a small 44×24px rounded chip showing the whole ramp from shadow to highlight, with a 1px border and a faint inner light ring so dark ramps stay visible. Chips grow to 48×44px on touch screens. The selected chip has a 2px text-colored outline. A "+" chip opens a custom color.

### Inputs / Fields

- **Style:** surface fill, 1px border, 8px corners, 44px minimum height, 16px text, muted placeholder.
- **Focus:** 2px bronze outline. **Invalid:** danger border with a 3px danger stripe on the left. **Read-only:** dashed border.
- **Selects:** native selects with Bronze picker styling where the browser supports it.
- **Choice groups:** option buttons (body size, direction presets, export formats) use bronze border, bronze text and selected background when chosen.

### Navigation

The header is the only global navigation (see Layout for its contents per screen). More opens a menu with Activity, API calls, Connect PixelLab, the Light/Dark mode switch, source code and version.

### Playback bar

A floating bar under the character in Preview: play/pause, a native move select, direction buttons (S, E, N, W and diagonals when present) with the current one on the direction-selected material, and Inspect. Inspect opens the precise direction grid, frame stepping, zoom and checkerboard tools in a native modal, separate from the immersive Preview. The live views replace the bar with a short keyboard hint at the lower left.

### Dialogs and notices

- **Dialogs:** surface, 1px rim, 16px corners, dialog shadow, sticky header and footer separated by 1px lines; full-width bottom sheets on phones.
- **Toasts and notices:** surface with an 8% tone tint, 12px corners, a 3px tone stripe and tone-colored icon, 14px text with a 1.5 line height (Bronze sets toast type itself) and a dismiss button. Toasts are centered horizontally near the upper content area, placed to avoid the header and identity controls, with a scrollable height limited by the viewport or the phone equipment panel.

### Character stage

The character is drawn on a canvas at an integer pixel scale where possible, with nearest-neighbor sampling, centered over the world floor. A faint reflection (12% opacity) is a separate rendered copy, configured only in code and currently enabled; there is no user-facing reflection control. On Characters, the selected character is large with the others smaller beside it, and its name sits below in the headline serif.

### Icons

Lucide line icons for all functional icons, at the size each component sets (for example 16px in header actions and Inspect, 18px in playback, 27px for desktop categories). Bronze's shared recipes use 20px icons with a 1.6 stroke where they apply.

## Do's and Don'ts

### Do:

- **Do** take every color, border, radius, shadow and state from Bronze tokens; fix shared appearance in `@shilo/bronze-ui`, release it, then update the dependency.
- **Do** keep the character's visual prominence and the existing reading gradients on character views.
- **Do** use bronze for selection, focus, links and primary actions.
- **Do** use Georgia only for screen titles and character names, and Lucide for functional icons at the size their component sets.
- **Do** keep primary touch targets about 44px and inputs at 16px or larger on phones.
- **Do** check every visual change in dark and light at desktop and phone sizes (including 320×568 and 844×390).

### Don't:

- **Don't** light, tint, filter, shadow or smoothly scale character or equipment pixels.
- **Don't** use pixel fonts, pixel icons or pixel-style borders for interface text and controls.
- **Don't** add a second palette, local color overrides or new theme dependencies in PixelDoll.
- **Don't** add decorative glows, gradients or glass effects in routine work; keep the existing Bronze materials, reading gradients and phone sheet treatment.
- **Don't** put boxes and shadows around panels that sit on the scene, or add unrelated scenery or props to the world.
- **Don't** use bronze for ordinary headings, body copy or decoration.
