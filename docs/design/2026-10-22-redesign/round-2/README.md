# PixelDoll — six pixel-world design studies

**Historical exploration, superseded by [round three](../round-3/README.md).** The user rejected this round's flat tool-like framing. Preserve it as research history, not the active visual or gameplay direction. In particular, the per-press movement study is not the requested continuous gameplay design.

2026-10-22. A second visual design round, following the request for two Moonlit Camp alternatives and four Quiet Stage alternatives built around pixel-art prototype worlds. These are standalone design prototypes, not a production UI replacement.

**Recommendation: Calibration Yard as the main creation/customization space, with Moonwell Grove as an optional character-collection backdrop.** The yard best combines a small playable-looking world with clear inspection. It gives PixelDoll an identity without asking decorative scenery to compete with equipment. The grove makes choosing a character feel welcoming. A transition between them should preserve the selected character, outfit, direction and working state; it should not become a navigation task.

## Review

- [Full gallery](gallery.html): all six directions, each with desktop and phone selection, creation and customization.
- [Interactive study](index.html?concept=yard&screen=dress): switch concepts and screens in the review bar. For an uninterrupted full-window view, append `&capture=1`.
- [Two world concepts](board-worlds.html), [four prototype stages](board-stages.html), [future test worlds](board-future.html).
- [Research with inspected visual sources](research-prototype-worlds.md).
- [Artwork provenance and generation prompts](assets/README.md).
- [Baseline UI audit](../current-audit.md) and [first-round functional design](../design-direction.md).

Run `node docs/design/2026-10-22-redesign/serve.mjs` from the repository root, then open `http://127.0.0.1:5201/round-2/gallery.html`. This uses the existing localhost-only design server. Use the explicit `index.html` for interactive links. No application server or PixelLab connection is needed.

## Six curated alternatives

| Concept | World and layout | Best use | Lead critique |
| --- | --- | --- | --- |
| 01 Moonwell Grove | Chunky forest clearing, muted teal ground; edge category rail and right item panel | Character collection and casual dressing | Strongest emotional entry. Perimeter detail can still interfere with unusual silhouettes; use neutral proofing for decisions about edges and palette. |
| 02 Ember Outpost | Dusk courtyard, warm lanterns, purple-gray paving; edge controls | A more social, inhabited dressing world | The most atmospheric option, but the architecture, paving and warm scene colors exert more influence on outfit judgment. Not my default inspection workspace. |
| 03 Calibration Yard | Low-contrast green-gray tiles, simple raised field, sparse blocks and steps; left categories, right choices | Default creation and customization | Best balance. Remove unnecessary stage decoration, keep a calm patch behind the actor, and provide native-size proofing. Recommended. |
| 04 Blueprint Field | Dark cyan tile lattice, map boundary and ruler ticks; horizontal equipment tray | Deliberately digital training-space identity | Clear prototype language. The larger grid competes more than Yard, and stacked bottom tools reduce vertical breathing room. Useful alternative, not the default. |
| 05 Claybox Courtyard | Pale blockout room, simple wall and cuboids; left item panel and right categories | Inspecting dark silhouettes against a light world | A useful light counterpart. Broad pale areas can fatigue users and wash out pale equipment; provide a darker proof background. |
| 06 Test Islands | Sparse void, floating tile modules, short bridges; lower equipment tray | A playful future testing-space direction | Suggests movement between activities, but bridges must not become required navigation. Bottom tray shares Blueprint's vertical-density weakness. |

All six use pixel-art environments and the same real fixture sprites. The four inspection worlds use original integer-coordinate map geometry, not cinematic backplates. The two scenic concepts use generated pixel-art scene studies rendered on the same nearest-neighbor stage. They would need a production tile/palette pass before shipping.

## Selection, creation, customization

**Selection:** three characters stand together on desktop, with page navigation and a searchable full library. Phone focuses one character at a time; arrows cycle through all six examples. Names and the Customize action stay visible. No required walking, camera manipulation or hidden hotspots to choose a character.

**Creation:** a separate scene keeps an example body visible while collecting name, appearance and direction count. It explicitly labels the body as an example, not a live generated preview. The intended order is drawing-cost review, appearance approval, then animation. Advanced request details remain reachable before paying. The actual quote and generated-result review require production integration.

**Customization:** the character remains stable while categories and a contextual item picker change around it. Named modes preserve Wardrobe, Colours, Moves and Outfits. Headgear selection, local recolor demonstration, direction changes, animation playback, grid/bounds controls and native-size inspection are interactive. Additional categories and advanced workflows demonstrate placement and information hierarchy rather than implementing the pipeline.

Phone uses a visible actor above a compact lower picker. All parts and a labeled New action remain discoverable. Narrow or short viewports scroll within the contextual panel instead of shrinking all the controls. Desktop alternatives deliberately compare side browsing and bottom browsing; the phone structure converges because preserving room for the actor matters more than maintaining decorative layout differences.

## Keep the core capability contract

| Existing capability | Proposed access |
| --- | --- |
| Character library, import and restore | In-world selection, searchable library, header Import and settings |
| Body generation and immutable base | Separate creation flow, explicit paid-step review and accepted appearance |
| Equipment generation and fitting | Named category → New → describe → quote drawing/fitting → review frames |
| Palette ramps and local recolor | Contextual palette choices, Colours mode, exact-ramp details |
| Direction and frame coverage | Facing controls, Inspect, missing-view notice, move coverage review |
| Moves and animations | Moves mode, local Walk preview, Add a move with scoped paid work |
| Outfits and reusable designs | Outfits mode; contextual saved designs and fitting details |
| Layer order, hiding and oversized held items | Contextual layer details; retain the existing pivot and direction-specific rules |
| Engine exports and manifest | Persistent Export action, coverage review, engine-format choice |
| Token, local storage, backups, activity | Settings and explicit connection before paid work; not permanent dashboard panels |

This is a navigation and visual contract. It does not certify those workflows as fully implemented in the standalone study. No production model, rig, manifest, exporter or storage contract changes here.

## Future test worlds

The [Asemulator](https://maplegecko.itch.io/asemulator) examples suggested a valuable extension: try the character in a simple map immediately after dressing it. Its separate [side-scroller](https://maplegecko.itch.io/asemulator-side-scroller) and [top-down](https://maplegecko.itch.io/asemulator-top-down) presentations support exploring both projections. The research records observed images separately from maker claims; the extensions were not installed or play-tested.

Every concept includes desktop top-down and side-scroller mockups. Calibration Yard also includes both at phone size. The interactive studies move the actor with arrow keys/WASD or touch buttons and show existing walk frames. They deliberately use a **2× world preview**, compared with larger dressing previews, so the character can be judged in context. This is not a simulated game engine: collision, jumping, gravity, occlusion sorting and camera following are absent.

- Top-down needs complete stored directions and equipment coverage. The sample has south/east/north plus mirrored west; eight directions are not fabricated.
- The side study uses the existing east/west sample as a visual proxy. A dedicated side-view rig, compatible equipment and jump/fall/landing clips are future work.
- Switching worlds should preserve the outfit; returning to Dress should keep the user's working state. Camera and physics settings belong to the future test view, not the everyday dressing layout.
- Importing a sprite must not imply it has clips or views that are missing. A test world should expose coverage gaps before offering unsupported actions.

The remembered MMO space may be Lost Ark's Trixion; the researcher found an official class-test image and Training Center references. That is a plausible match, not a confirmed identification of the user's memory. Its bounded stage in a void influenced Test Islands; its combat HUD and ornate environment were rejected.

## Review decisions and challenges

A GPT-6 Sol / High research subagent examined Asemulator, prototype tilemaps, game training spaces, licensing constraints and eight rendered studies. The lead authored and selected all six concepts, layouts, environment briefs, prototype geometry and interactions.

| Challenge | Lead decision |
| --- | --- |
| First-round scenic art overwhelmed the small sprites | Constrain the scenic palettes and pixel scale, and build four actual tile-map stages as alternatives. |
| Yard's floor seams and Blueprint/Clay grids competed with equipment | Remove structural seams from large floor slabs, lower the central grid contrast and remove illegible miniature map lettering. Keep readable labels in the interface. |
| Hat thumbnail appeared much smaller than helmet | Crop to the item's opaque bounds and enlarge at integer scale; enlarge phone previews too. This thumbnail normalization does not change actual equipment size on the actor. |
| Phone New item relied on a small plus | Add a visible New label and retain access through every part picker. |
| Walking view appeared to promise more than the fixture supports | Keep the actual available walk poses, state the 2× scale, and prominently disclose absent physics and missing side-view rig. Reject the suggestion to make all movement static: the stored directional walk frames can support a useful limited movement study. |
| Research inspirations could turn into copied assets or borrowed mechanics | Use references only. No Asemulator or other reference-game artwork is included. In particular, do not use the Petixel pack whose license excludes game-making tools. |
| A world metaphor could make routine actions slower | Keep direct labeled controls. Movement and bridges are optional preview experiences, never prerequisites for editing, selection or export. |

## Validation and limits

- 36 primary mockups: six concepts × selection/creation/customization × 1440×900 desktop and 390×844 phone.
- 14 future-map mockups: both projections for six desktop concepts, plus both phone projections for Yard.
- Six additional Yard regression captures at 320×568 and 844×390; three family/future comparison boards. 59 image artifacts total.
- `capture.mjs` checks 50 primary/future viewports for document overflow and browser exceptions. `verify.mjs` checks 18 interactive behaviors, six additional viewport layouts, and renders the comparison boards. Results: [viewports](mockups/verification.json), [interactions](mockups/interaction-verification.json).
- The lead visually inspected all six desktop customization concepts, representative selection/creation/future states, phone layouts, small/landscape layouts and comparison boards. This is not a full accessibility or production end-to-end certification.
- Checks use the repository's existing Playwright package and managed Chromium. The available host runtime was Node 25.0.0; production's pinned Node 24.22.1 was not available. No dependency installation or production source changes were required.
- Only sample headgear swapping and simplified recolor are wired; other equipment choices explain their design state. Native proof shows sample facing frames, not every animation frame or actual quality gates. Generation, saving, importing, fitting and export are simulations. No requests, credits or app storage are involved.

Reproduce from the repository root with `node docs/design/2026-10-22-redesign/round-2/capture.mjs`, then `node docs/design/2026-10-22-redesign/round-2/build-gallery.mjs`, then `node docs/design/2026-10-22-redesign/round-2/verify.mjs`, while the design server is running. Configure `PLAYWRIGHT_BROWSERS_PATH` for the installed managed browser if needed.
