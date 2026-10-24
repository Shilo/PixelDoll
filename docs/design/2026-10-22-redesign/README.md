# PixelDoll — character creator design studies

**2026-10-22 · design proposal, not a production UI replacement.**

**Latest: [round three — immersive HD simulation worlds, image-only](round-3/README.md).** The user rejected round two's flat tool-like presentation. This round restores Camp's immersive hierarchy and Quiet Stage's restraint, groups equipment on the right, and gives customization/gameplay one shared shell. Eleven selected raster mockups, three world directions, desktop and phone flows. **Obsidian Holodeck** is the new recommendation. No new interactive HTML or gameplay implementation.

**Historical: [round two — six pixel-art world and prototype-stage studies](round-2/README.md).** Its Calibration Yard recommendation is superseded by round three. The first-round recommendation below is retained as design history.

Recommendation: **Moonlit Camp**, with Quiet Stage available as the neutral inspection background. The character library becomes a paged in-world cast; creation becomes its own scene; dressing uses one active equipment category and one contextual choice panel. The world creates atmosphere, while visible controls keep every action direct.

## Review the work

- [Interactive prototype](index.html) — three concepts, three screens, desktop and phone framing. Open the file in a browser, or run the local server below.
- [Visual gallery](gallery.html) — every desktop/mobile mockup at its original resolution, plus extra Camp states.
- [Lead design recommendation and critique](design-direction.md).
- [Current app audit](current-audit.md) — 23 screenshots, measured layout findings, and a capability inventory.
- [2D/pixel-art research](research-2d.md) — five game families and two creator tools.
- [RPG/MMORPG research](research-3d.md) — seven games, evidence classifications, source links and rejected patterns.
- [Prototype verification](verification.md).
- [Artwork provenance and prompts](assets/README.md).

## Three curated alternatives

| Concept | Selection | Creation | Customization | Judgment |
| --- | --- | --- | --- | --- |
| Moonlit Camp | Three-character tableau, page arrows, searchable full library | Separate scene with example scale guide and focused form at the edge | Stable actor, named category rail, compact contextual panel | Best fit for an immersive character creator; recommended |
| Lantern Atelier | Single hero with a compact portrait roster | Broad workbench across the bottom | Horizontal garment tray beneath the hero | Warm and playful; vertical control stacking is the main weakness |
| Quiet Stage | Searchable compact roster and one hero | Clear left-to-right form and preview | Quiet stage with contextual tools | Clearest for inspection; least distinctive as a game experience |

Each has **selection, creation and customization** at **1440 × 900** and **390 × 844**: 18 primary mockups. Extra Camp captures show review, export, small-phone and landscape states. These alternatives share functional vocabulary intentionally; they are different compositions, not different feature sets.

## Preview locally

From the repository root:

```powershell
node docs/design/2026-10-22-redesign/serve.mjs
```

Open **http://127.0.0.1:5201/**. The review bar changes concept, screen and phone framing. For a clean full-window view, use `?capture=1&concept=camp&screen=select` (concepts: `camp`, `atelier`, `quiet`; screens: `select`, `create`, `dress`). The server is bound only to localhost. The prototype works directly from `index.html` as well; no network assets are required.

Try selecting a character, searching the full cast, changing headgear, switching directions, playing Walk, recoloring, opening All parts on a phone, opening Inspect and its plain backdrop, and stepping through the simulated appearance review. Generation, import, fitting, exports, and advanced settings are explanatory design states; they do not run the production pipeline. This prototype has no token field, calls no PixelLab endpoint, and saves nothing to the app's storage.

## Scope and ownership

The lead authored the concepts, original environment briefs, layouts, interaction prototype, design decisions and final review. Three **GPT-6 Sol / High** research subagents supplied the current-app audit, 2D research and 3D research; they also challenged the rendered concepts. Their visual-only critiques were evaluated by the lead rather than accepted automatically.

All design work is under this directory, with a link added to the main docs index. Existing untracked research in `docs/research/character-creator-design-research-2026-10-22.md` and `docs/testing/create-character-review-2026-10-22.md` was preserved. Those earlier proposals are not proof of supported features. No production source, dependencies, endpoint routing, manifest format or PixelLab configuration was changed.
