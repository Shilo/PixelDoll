# Full image mockups — Obsidian / Porcelain Bronze

2026-10-23. The main suite contains **20 full-resolution screens**: five screens × two appearances × two viewport layouts. There are **12 supplemental states** and four raster overview boards. Desktop images are 1920 × 1080; phone images are 900 × 1600, designed at 2× a 450 × 800 logical viewport. Boards are navigation aids; inspect individual images for text and pixel detail.

## Overview boards

| Appearance | Desktop | Mobile |
| --- | --- | --- |
| Obsidian Bronze — recommended default | [Five screens](images/board-obsidian-desktop.png) | [Five screens](images/board-obsidian-mobile.png) |
| Porcelain Bronze — coordinated light appearance | [Five screens](images/board-porcelain-desktop.png) | [Five screens](images/board-porcelain-mobile.png) |

## Full-resolution screens

| Screen | Obsidian desktop | Obsidian mobile | Porcelain desktop | Porcelain mobile |
| --- | --- | --- | --- | --- |
| Characters | [Image](images/obsidian-desktop-selection.png) | [Image](images/obsidian-mobile-selection.png) | [Image](images/porcelain-desktop-selection.png) | [Image](images/porcelain-mobile-selection.png) |
| Create character | [Image](images/obsidian-desktop-creation.png) | [Image](images/obsidian-mobile-creation.png) | [Image](images/porcelain-desktop-creation.png) | [Image](images/porcelain-mobile-creation.png) |
| Preview | [Image](images/obsidian-desktop-preview.png) | [Image](images/obsidian-mobile-preview.png) | [Image](images/porcelain-desktop-preview.png) | [Image](images/porcelain-mobile-preview.png) |
| Top-down | [Image](images/obsidian-desktop-topdown.png) | [Image](images/obsidian-mobile-topdown.png) | [Image](images/porcelain-desktop-topdown.png) | [Image](images/porcelain-mobile-topdown.png) |
| Side-scroller | [Image](images/obsidian-desktop-side.png) | [Image](images/obsidian-mobile-side.png) | [Image](images/porcelain-desktop-side.png) | [Image](images/porcelain-mobile-side.png) |

| Supplemental state | Obsidian | Porcelain |
| --- | --- | --- |
| Create, mobile size/camera scroll position | [Image](images/obsidian-mobile-creation-size.png) | [Image](images/porcelain-mobile-creation-size.png) |
| Create, mobile directions/seed scroll position | [Image](images/obsidian-mobile-creation-directions.png) | [Image](images/porcelain-mobile-creation-directions.png) |
| First visit, desktop demo only | [Image](images/obsidian-desktop-selection-first.png) | [Image](images/porcelain-desktop-selection-first.png) |
| First visit, mobile demo only | [Image](images/obsidian-mobile-selection-first.png) | [Image](images/porcelain-mobile-selection-first.png) |
| Desktop appearance/overflow menu | [Image](images/obsidian-desktop-preview-more.png) | [Image](images/porcelain-desktop-preview-more.png) |
| Mobile expanded character prompt | [Image](images/obsidian-mobile-preview-description.png) | [Image](images/porcelain-mobile-preview-description.png) |

The three phone creator images are scroll positions of **one form**, retaining the name header and Create/cost footer. They are not wizard steps.

## Lead assessment and screen decisions

**Recommend Obsidian as default, with Porcelain as its matching light appearance.** The dark simulation floor supports the source sprites and restrained bronze hierarchy. Porcelain keeps the same content, actor scale and control locations. Themes replace environment plates and UI colors; they never alter character pixels.

Characters and Preview share one environment plate per theme. Create also uses it here, with stronger local backing for inputs. Top-down shows continuous ground from an elevated view; Side-scroller shows a level view with a lower ground line. The grid is part of the floor, not a toggleable overlay. No structures or props were added.

The floor is more textured than a perfectly smooth holodeck. It is quiet enough in these stills; the movement proof must test distraction during scrolling. The actual demo east-facing frame suits this study but does not establish a separately generated side-camera rig.

- **Characters:** demo available immediately, cast standing in the world, selected name and Customize action. Populated examples named Rowan, Mira, Finn, Ash and Echo represent illustrative saved copies, not actual user records or newly generated characters. Visible side actors use alternate equipment on the same demo body. Desktop adds a compact searchable list on the right; phone keeps world pagination and search. First-visit images show only the demo.
- **Create:** current Appearance/Prompt workflow, header name, Help/API/Copy, Enhance, four traits, exact-prompt excerpt, body presets/custom input, Auto/custom frame, schematic size guide, camera, five direction presets, individual arrows, reversible mirrors, Seed last and Create with muted cost. This is a populated draft; untouched traits still default to Not set. Enhance becomes Undo when the current workflow permits. The guide is not a prediction of generated artwork. The quote is illustrative, not a guaranteed charge.
- **Preview:** name switcher and expandable base prompt at left; equipment at right or in the mobile sheet; clip playback and stored directions below the actor. Wardrobe, Colours, Moves and Outfits remain available. All parts reaches other equipment categories. The fixture supplies four cardinal walk directions; the mockup does not invent eight-direction artwork.
- **Live modes:** identity, view tabs and equipment stay in place. Playback, facing controls and Moves disappear; Outfits retains its position. The joystick is shown during an active world touch only. No movement-button bank or frame-stepping UI is introduced.
- **Disclosure:** appearance selection lives inside overflow with GitHub and Settings. The character prompt stays one line until expanded into a bounded copyable surface. Creation's exact prompt remains stable form content, with full editing in the linked Prompt tab.
- **Reflection:** only a faint vertically flipped copy below selection/Preview actors. It is configured in code, with no UI toggle. Live views omit it here. No actor light, tint, shader or new contact shadow is applied; painted shading already in the source is retained.

## Review and corrections

Two GPT-6.1 Sol / High researchers reviewed the source workflow and visual presentation. The lead owns final composition and curation. Their findings are in the [creator checklist](research-creator-checklist.md) and [visual review](research-visual-review.md).

Applied corrections: kept Outfits stationary when Moves hides; restored mobile saved-design access; removed duplicate size-guide text; retained the actual base-body prompt; added mobile prompt disclosure and excerpt scroll cues; restored trait/Frame/Seed help; enlarged mirror strips; separated Seed from the sticky footer; removed first-visit pagination arrows; retained appearance overflow on Characters.

The final mobile mirror strips are 88 raster pixels wide, equivalent to 44 logical pixels at the illustrated viewport. Seed ends at raster y1348, before the footer fade starts at y1400. The creator reviewer reopened the revised desktop Create and mobile Directions images and found no remaining blocking clipping/content issue. The lead inspected the revised prompt, size, Preview, menu and overview imagery. Research review was visual, not a runtime or accessibility certification.

## Source fidelity and reproduction

Environment plates were generated separately using the built-in image generation tool. [Exact prompts](environment-prompts.json) and [asset provenance](asset-provenance.json) retain generation references and hashes. The tool selected its model; its internal model identifier was not exposed. No character was generatively redrawn.

Actors come from `app/public/fixtures/s2`, assembled with the existing `composeCell` compositor and frozen offsets. PNGs are cropped to occupied pixels and enlarged by whole-number nearest-neighbor scaling. The hero is walk/south frame 0; Top-down uses south frame 2; Side-scroller uses east frame 2. Head thumbnails are actual demo layers.

[render.mjs](render.mjs) composes backgrounds, exact sprites, UI and a separate reflection layer into PNGs with headless canvas. It is an offline artifact, not an interactive HTML mockup or an app implementation. Browser network access is blocked. [Lucide icon data](assets/lucide.json) came from Iconify, under the existing [Lucide license](../assets/lucide-LICENSE).

[verification.json](verification.json) records source hashes and actor checks. Across 32 actor placements, **31,224 opaque source pixels** were sampled at the center of enlarged blocks and matched RGBA values, including a second check after all UI and gradients. This verifies sampled actor colors were not repainted or covered. It does not certify semitransparent pixels, every enlarged block edge, text contrast or gameplay.

With installed app dependencies, Playwright Chromium and all six local background plates, re-render from the repository root:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:/Users/shilo/AppData/Local/ms-playwright'
node docs/design/2026-10-22-redesign/round-5-mockups/render.mjs
```

The first render used the available Node 25.0.0 runtime. On 2026-10-23, all six environment plates were reviewed, Porcelain Side-scroller was corrected to remove pillar-like architecture, and all 32 screens plus four boards were re-rendered under the required Node **24.22.1**. Source-pixel checks passed again. See [correction provenance](../round-6-prototype/environment-correction.json). Production tests were not run for this documentation/image task.

PNGs remain local and ignored under repository policy. Documentation, prompts, hashes, icon data and rendering source are committed. A fresh checkout needs the local environment assets restored; prompts cannot recreate identical generative output. No unrelated production changes are included, and no PixelLab generations were needed.

## After image review

The separately scoped visual proof should test retained shared backgrounds, mode-specific projection, continuous movement/camera, touch ownership, actual animation fallback coverage, equipment synchronization and code-configured reflection. Also verify moving-background contrast, full prompt scrolling, focus, safe areas and actual touch regions. These are runtime checks; the still images establish visual direction only.
