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
    fontSize: "20px"
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
    padding: "6px 6px 9px"
    height: "112px"
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

All shared appearance (colors, materials, states, focus, borders, radii) comes from `@shilo/bronze-ui` 0.2.8 plus its unreleased additions pending release as 0.3.0 (rail tabs, item tiles, sticky section headers with `stickyFade`, edge fades and the top toast region) (`styles/tokens.css` and `styles/components.css`). The tokens above mirror its `--bu-*` variables; Bronze is the source of truth, and a change to them belongs in the Bronze repository first. Translucent materials (outline, tile, floating, action hover, selected) are derived Bronze roles, so they are described in prose and in `.impeccable/design.json` rather than as frontmatter colors. PixelDoll owns layout, geometry, spacing and the world scene (`app/src/studio/experience/layout.css`, `config.ts`, `ground.ts`), plus a few local rules noted below. The workflow contract is [docs/design/production-experience.md](docs/design/production-experience.md).

This file records the current interface; it is not a new direction. Updated 2026-11-11 for the approved Studio refinement ([UI lab 5](docs/design/2026-11-11-ui-refinement/ui-lab-5.html)) and checked against the running app at 1920×1080, 2560×1080, 1440×900, 1280×720, 1024×768, 768×1024, 390×844, 844×390 and 320×568 in dark and light.

## Overview

**Creative North Star: "In character views, the character is prominent and controls are grouped around it."**

Characters and Customize share a world background: a photographic floor that fades into mist (dark stone in dark mode, pale polished stone in light mode). It is scaled uniformly, never stretched, with its horizon on the character's eye line and its vanishing line on the character, so the feet always stand on its floor. Characters centers the selected character beside the library. Customize has an immersive top bar (no solid bar) with the character's name menu, the view tabs and the actions; equipment and colors sit in a column on the right, and the playback controls in a small floating bar just under the character's feet. New character instead uses a full-screen form over the same world background. On phones and portrait tablets the panel becomes a bottom sheet and the view tabs float under the bar.

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

- **Display** (Georgia 400, 1.15): the character's name in the top bar's name menu, 20px (18px on phones), and the Characters title in the bar, 19px (17px on phones). New character uses `clamp(28px, 2.3vw, 40px)` on desktop and 28px in the phone layout.
- **Headline** (Georgia 400, 1.2): the selected character's name below the Characters stage, 30px (24px on phones).
- **Title / headings** (Segoe UI, sized per component): 14px weight 600 sticky section headers in Wardrobe and Colors ("Head", "Character") and 18px standard dialog headings ("Export"). Panels have no title rows.
- **Body** (Segoe UI 400, 16px, 1.4): tab labels, item names and form text in panels. The app does not load Bronze's base stylesheet; its own default is 14px with a 1.4 line height. Inputs stay at 16px or larger so phones do not zoom.
- **Action** (Segoe UI 600, 16px, 1.4): labels of bronze-filled primary actions on the scene (14px in the phone layout).
- **Label** (Segoe UI 400, 14px, 1.4): header actions, small descriptions and counts.
- **Caption** (Segoe UI 400, 11 to 12px, 1.4): the facts line under the name ("64 px · 4 directions · 2 moves · 6 items", hidden under 900px wide or 540px tall), 11px slot rail labels, help hints, field sub-labels, costs ("~2-5 gens") and keyboard hints on the live views.
- **Mono** (13px, 1.6): API call previews and other code.

### Named Rules

**The Names Are Serif Rule.** Georgia is only for screen titles and character names. Buttons, tabs, labels and data are always sans-serif.

**The No Pixel Type Rule.** Interface typography and functional icons are never pixel fonts or pixel icons; character and equipment artwork remain pixel art (PLAN.md D9).

## Layout

- **Scene first.** Characters and Customize fill the viewport (`100dvh`, no page scroll). The world image is scaled uniformly from its source size (one `WORLD_SIZE` in `config.ts`). Its horizon (per theme in `WORLDS`) sits on the character's eye line, 0.86 of the visible sprite height above the feet, and its vanishing line (x 0.5) on the character; the floor is a uniform plane, so the feet always stand on it. The scale is the largest of the world's own proportions and what covers the viewport width, the top and the covered bottom with no gaps (down to just under the phone sheet on Customize, the whole height on Characters). It grows up to 1.3x that to keep the vanishing line on the character; past that it stays at 1.3x and is clamped to the viewport edge instead (short landscape beside the rail), so the scale changes continuously while resizing. Top-down and Side-scroller draw the sky with the same placement, and the side view's floor horizon is the same eye line. Two reading gradients (from the top, and from the right beside a rail) keep text and controls readable. They start at 85% and 88% surface in dark mode and 90% and 92% in light mode, and fade out.
- **One geometry source.** `app/src/studio/experience/geometry.ts` computes margins, header, rail, sheet, stage, the character's feet and the world placement for every size; CSS receives them as custom properties on `.experience`, and the actor canvas, cast and toasts read the same numbers.
- **Margins and header.** Side margins are 16px on phones (600px wide or less), 20px under 1100px, 24px on desktop and 32px from 1920px. The header sits 8px from the top on phones and short landscape and 12px otherwise, in a 44px row (48px elsewhere). Touch targets stay 44px.
- **Top bar (Customize).** Back icon, then the name menu (Georgia name, chevron and the facts line); the prompt with Copy prompt, rename and the other character actions live in that menu. The view tabs are underline tabs centered in the bar (icons only under 1000px). Then Random look (dice), Undo, Redo, Share and Export (with text from 1100px, icons below), Activity while jobs run, Full screen and More. On phones (600px and below) Redo and Share move into More so the name stays readable (Share's popover then points at More); Random look follows up to 430px and Undo up to 360px. Export and Full screen always stay on the bar.
- **Top bar (Characters).** "PixelDoll | Characters" with the character count, then New character (beside search on phones), Full screen and More. New character opens Create from scratch…, Import from device… and Import from PixelLab…. The same menu opens from a shorter row at the bottom of the character list, with its plus icon and text aligned to the character rows. Device and PixelLab imports have separate dialogs without source tabs. Neither screen has a left identity block.
- **Desktop columns.** The right column is `clamp(340px, 24vw, 420px)` from 1100px wide, 320px from 900px and 300px below. It starts 12px under the header (4px in short landscape) and ends one margin from the bottom. The stage is everything left of it, and toasts center over it (over the whole width in short landscape).
- **Character size.** The largest whole-device-pixel scale that fills 75% of the free stage height (header to playback bar) on Customize and about 60% on Characters, at most 62% of the stage width. The feet sit 14px above the playback bar in every view.
- **Bottom sheet.** Phones (760px wide or less) and portrait tablets (1024px wide or less) use a bottom sheet of `clamp(45% of the height, 240px, height - 250px)` with a decorative handle, and the view tabs float under the bar as an icon row. On Characters the cast list starts at 60% of the height. Short landscape (540px tall or less) keeps the side rail. A phone too short for a 200px sheet (a phone held sideways) moves the panel beside the stage when a 200px stage still fits; otherwise the sheet keeps 200px when the stage still fits above it, and hides until the window grows when it does not (never a 1-199px sheet).
- **Panel.** Full-width underline tabs Wardrobe, Colors, Outfits and Moves, with no title rows below them. Wardrobe and Colors are each one continuous list with sticky section headers; Outfits ends with a "Save current look" row and Moves with "Add a move".
- **Equipment grid.** At most four columns of tiles at least 88px wide (84px on phones), up to 112px tall, with 8px gaps.
- **New character.** A full-screen form: four columns on wide desktop (size guide, appearance, body geometry, directions), three at 1250px, two at 1000px, stacked on phones. Cost and Create stay in the action footer.
- **Key scene breakpoints:** 360, 400, 600, 760, 900, 1000, 1024 (portrait), 1100 and 1920px wide; 540px tall. The creator also uses 1250px wide and 500px tall.
- **Spacing rhythm.** Bronze steps of 4, 8, 12, 16, 20, 24 and 32px, with gaps of 8 to 16px inside panels.

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
- **Outline:** header actions such as New character, Share and Export. Bronze outline material with a 1px line border; hover fills with the hover color and a stronger border.
- **Quiet:** text or icon with no border (Characters back link, undo/redo, More, Random, Reset). Hover shows the action-hover material. Disabled controls drop to about 42 to 50% opacity and show the not-allowed cursor.
- **Focus:** a 2px bronze outline. PixelDoll's general focus rule uses a 2px offset; Bronze's standalone default is 3px, and some components set their own offset.

### Tabs

- **Style:** the view switch (Preview/Top-down/Side-scroller) is a group of `aria-pressed` buttons over one stage; the full-width panel tabs (Wardrobe/Colors/Outfits/Moves) are a tablist with a real panel, `aria-selected` and arrow-key movement. Both show the current choice in bronze, weight 600, with a 1px bronze underline. Moves keeps its position in live views behind an invisible placeholder. Appearance/Prompt in New character is a tablist with a 2px underline.
- **Slot rail:** navigation (`<nav>` with `aria-current`, arrow keys move and show) on the right of Wardrobe, one Bronze rail tab per category in `GROUPS`: a custom gear-shape line icon (22px, `GroupIcon.svelte`) over an 11px label that wraps to two lines. Selected is bronze with a thin underline under the label; a small bronze dot marks a category with something worn. It scrolls by wheel or touch with no visible scrollbar and shows edge fades only where more slots exist. Tapping a slot scrolls its section to the top (instantly under reduced motion); the rail follows the section under the sticky header. The Body category is shown as Chest.
- **Section headers:** sticky, with no backing; content fades from 10px inside the header's lower edge to 10px below it (Bronze `stickyFade`). A Wardrobe header shows the category icon, name, item count, category Random (shuffle, disabled when there is no other item) and + (New item, which shows its cost in the dialog). A Colors header shows Random colors and Reset.

### Item tiles

- **Style:** Bronze item tiles: 1px rim border, tile material, 8px corners, the item's pixel art (nearest-neighbor) filling the space above a label on a shared bottom baseline. Item art renders as tiles come near the list's viewport.
- **Selected:** bronze border, selected background, bronze name and a bronze check mark in the top-right corner.
- **Empty:** always the first tile; dashed and muted, or selected (solid bronze) when nothing in the category is worn. Its accessible name is fixed ("Empty head"); `aria-pressed` carries whether nothing is worn.
- **New:** an outline-material tile beside Empty, only when the category has no items. There is no New item button under the list.
- **Options (⋮):** every saved item tile has an always-visible Bronze `.bu-tile-more` button in its top-left corner (the worn check stays top-right), a sibling of the tile button, with a 44px hit area (Bronze also guarantees 44px under coarse pointers). It, a right-click on the tile or ⋮, Shift+F10 and a touch/pen long-press open the same arrowed Bronze popover at every size (no bottom sheet); the same ⋮ toggles it closed. The header shows the item's art, name and a status line ("Wearing" first when worn, then any warning or Hidden by another item, else the category) and a Wear toggle at its right: one fixed name, "Wear {item}", with `aria-pressed` for the state and an empty circle (not worn) or a checked circle (worn). Then Details…, Try again… (paid, priced in the next sheet), other applicable item actions, Download ZIP and Remove… last (confirmed in place). A long-press release leaves the menu open without wearing the item; scrolling or moving cancels the hold. Escape returns focus to the ⋮; Tab or Shift+Tab out of the menu closes it. After a removal, focus moves to the next tile in the category, else the previous one (Empty at least), else the category heading, never the paid + button. A press on a tile while the menu is open only closes the menu (it never also wears or takes off that tile). When the ⋮ scrolls out of view the menu closes and focus stays on the ⋮ without scrolling back. Empty, New, draft and shared tiles have no ⋮; the demo hides Try again and Remove as before.
- **Status:** a warning glyph (`.bu-tile-status[data-tone=warning]`) for Needs a look, Made for another body or missing frames in moves the body has ("Missing some Walk frames", "Missing frames in 2 moves"; Details names the directions); dimmed art and an eye-off glyph (`.bu-tile[data-dim]`) for an item hidden by another worn item. There is no Demo badge on tiles and no separate selected-item row. Status words join the tile's accessible name ("Wizard hat, needs a look"); worn state is `aria-pressed`. Tiles stay single-select: a tap wears or replaces.
- **Random:** the top bar's Random look changes every item and color; a category's Random wears a different item of that category with new colors for it; Colors' Random changes colors only. Each press is one undo step with a scoped label ("Random head item").

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

A floating bar under the character in Preview: play/pause, a native move select, direction buttons (S, E, N, W and diagonals when present) with the current one on the direction-selected material, and Inspect. Every control is a 44px target. On a stage 430px wide or less (`geometry.ts` compactPlayback) Inspect moves into More, the separators and the Still word go (the world note explains it) and the move select takes the remaining room; under 300px (phone landscape beside the rail) one 44px facing button shows the current direction's letter, is named "Facing: South" and steps to the next direction on each press, so the bar is always one row. Inspect opens the precise direction grid, frame stepping, zoom and checkerboard tools in a native modal, separate from the immersive Preview. The live views replace the bar with a short keyboard hint at the lower left, with a plain note under it when a move is missing ("No Idle move yet, so the character stands still"). There the Moves tab stays in place but is aria-disabled, with its reason as its description (outside the tab list) and a toast on tap: movement picks idle or walk. Tab still reaches it; arrows step past it without selecting it.

### Dialogs and notices

- **Dialogs:** surface, 1px rim, 16px corners, dialog shadow, sticky header and footer separated by 1px lines; full-width bottom sheets on phones.
- **Toasts and notices:** surface with an 8% tone tint, 12px corners, a 3px tone stripe and tone-colored icon, 14px text with a 1.5 line height (Bronze sets toast type itself) and a dismiss button. Toasts are top-anchored 8px under the header (under the floating view tabs on phones), centered over the stage column beside a tall rail and over the whole width in short landscape (on Customize starting under the panel tabs, so it never covers them) or over a phone sheet (wider, so shorter), at most 420px wide, with a scrollable height that never reaches down over the phone sheet or within 12px of Preview's playback bar (Bronze `.bu-toast-region`). Inside a sheet they sit under its title and close button.

### Character stage

The character is drawn on a canvas at an integer pixel scale where possible, with nearest-neighbor sampling, centered over the world floor. Every world actor has a separate faint, camera-side reflection anchored to its standing body's painted feet, independent of transparent padding and worn gear. `experience/reflection.ts` owns the shared rendering and code-only settings: floor-aware opacity of 8–16%, compressed height and standing-height fade. More overhead views shorten and weaken the reflection. All reflections sit underneath all actors; there is no user-facing reflection control. Checkerboard inspection previews remain unchanged. See [Ground reflections](docs/design/production-experience.md#ground-reflections). On Characters, the selected character is large with the others smaller beside it, and its name sits below in the headline serif.

### Icons

Lucide line icons for functional icons, at the size each component sets (for example 16px in header actions and Inspect, 18px in playback). Equipment categories use custom gear-shape line icons drawn on the same 24px grid with a 1.6 stroke. Bronze's shared recipes use 20px icons with a 1.6 stroke where they apply.

## Do's and Don'ts

### Do:

- **Do** take every color, border, radius, shadow and state from Bronze tokens; fix shared appearance in `@shilo/bronze-ui`, release it, then update the dependency.
- **Do** keep the character's visual prominence and the existing reading gradients on character views.
- **Do** use bronze for selection, focus, links and primary actions.
- **Do** use Georgia only for screen titles and character names, and Lucide for functional icons at the size their component sets.
- **Do** keep primary touch targets about 44px and inputs at 16px or larger on phones.
- **Do** check every visual change in dark and light at desktop and phone sizes (including 320×568 and 844×390).
- **Do** keep scene geometry in `geometry.ts`; don't hard-code stage, feet, rail or sheet positions in CSS.

### Don't:

- **Don't** light, tint, filter, shadow or smoothly scale character or equipment pixels.
- **Don't** use pixel fonts, pixel icons or pixel-style borders for interface text and controls.
- **Don't** add a second palette, local color overrides or new theme dependencies in PixelDoll.
- **Don't** add decorative glows, gradients or glass effects in routine work; keep the existing Bronze materials, reading gradients and phone sheet treatment.
- **Don't** put boxes and shadows around panels that sit on the scene, or add unrelated scenery or props to the world.
- **Don't** use bronze for ordinary headings, body copy or decoration.
