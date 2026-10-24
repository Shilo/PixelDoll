# Lead design direction

Date: 2026-10-22. Status: curated proposal for review. The research is comparative evidence, not user testing, and the prototype is not a functioning replacement for Studio.

## The recommendation

Build **Moonlit Camp**: a fullscreen place where your characters live, and a focused dressing experience that follows the selected character. Use the quiet neutral stage as an inspection mode. Keep the forest optional in production so non-fantasy characters and users who prefer less visual detail are equally supported.

The character should be the reason to look at the screen. Atmosphere establishes a place, the selected sprite owns the composition, and controls appear where they help the current choice. No walking between stations, camera travel, quests, stats, loot rarity, unlock gates or fictional currencies. The interface is immediate even when the environment is evocative.

This is my design judgment, not a measured conversion or usability result. The mockups test visual hierarchy and task organization; the next validation must involve people unfamiliar with PixelDoll.

## What the current design gets wrong—and what to retain

The [audit](current-audit.md) found a 248 px wardrobe and 300 px inspector occupying 38% of a 1440 px desktop. Layer order, hide rules and extensive palettes compete with the character before the user asks for them. On phones, the preview sits above a similarly large controls region. Creation opens over a dimmed, already dressed demo, which makes it unclear whether the user is editing that character or describing a new one.

The existing system also has valuable strengths: instant local equipment changes, clear missing-frame warnings, real palette ramps, undo/redo, an offline demo, saved designs, outfits and multi-engine exports. Those capabilities must survive. A pleasing front-facing sprite cannot replace proof that every layer aligns across directions and moves.

## Evidence translated into decisions

| Evidence | Adopt | Challenge / reject |
| --- | --- | --- |
| [WoW Warbands](https://worldofwarcraft.blizzard.com/en-us/news/24061008/the-war-within-warbands-preview) stages four favorites while keeping a larger searchable roster | A small, named cast on a coherent stage; explicit total count and direct full-library access | A fixed visible cast is not a storage cap. Do not copy game realms, levels, account systems or the entire right-hand list by default. |
| [FFXIV's manual](https://na.finalfantasyxiv.com/game_manual/start/) separates appearance choices from pose, gear and background preview | Preview context is distinct from editing; facing and motion stay near the character | Continuous orbit and fine facial sliders would misrepresent 2D frames and probabilistic generation. |
| [Picrew's documented anatomy](https://support.picrew.me/en/create_imagemaker/create_first) separates parts, items, layers and supported operations | Show one selected category and only applicable options | Static image transforms are not safe defaults for frame-aligned paperdolls. |
| [Stardew's sprite documentation](https://wiki.stardewvalley.net/Modding:Farmer_sprite) describes frame-dependent layers and hair/hat behavior | View the whole outfit, then inspect occlusion and direction-specific issues | A front view alone cannot certify a fitted item. |
| [EA's Sims 4 guide](https://cdn-assets-ts4.pulse.ea.com/Guide/TheSims4_PlayersGuide_ENGLISH.pdf) describes Styled Looks | Keep named whole-outfit presets and one-click application | No invented catalog of hundreds of instant items: PixelDoll only has what the user has generated/imported. |
| [ArenaNet's Fashion Templates article](https://www.guildwars2.com/en/news/coming-soon-fashion-templates/) describes whole looks and individual pieces | Outfits and part-level editing coexist | No equipment stats, unlock economy or paid cosmetic friction. |

Source access and visual-evidence limitations are recorded in the two research notes. In particular, the Sims guide was text-referenced but not visually inspected by the researcher; BG3 and Dragon's Dogma 2 did not supply inspected creator UI screenshots. Those examples inform behavior, not layout claims. The lead's additional Blizzard fetch returned 403; the agent's documented source inspection is retained, and the lead independently read FFXIV and Picrew.

## The alternatives, challenged

### Moonlit Camp — recommended

**Selection:** a three-person stage, one prominently selected character, readable names, previous/next pages, a total count and “All characters” search. Clicking another actor changes selection; Customize explicitly opens their wardrobe. This avoids accidental navigation and gives keyboard/touch users the same clear action. On phones the selected actor stays large and companions suggest a broader cast.

**Creation:** a distinct fullscreen scene. Name and appearance description form the main input. A labeled example explains 64 px frame scale; it is never presented as a generated preview. Supported size and direction choices remain accessible, and cost review precedes a paid action. The proposed journey is Imagine → Review appearance → Bring to life.

**Dressing:** a named category rail on desktop, a compact item panel, and a stable hero. On phones, three frequent categories and All parts avoid hiding Back/Hands in a clipped strip. Wardrobe, Colors, Moves and Outfits are consistent mode names. Inspect opens a multi-view check and a plain background.

**Weaknesses:** fantasy scenery can bias the product toward medieval characters; dark detail can conceal stray pixels. The fixture cast uses one base in different outfits, so it does not validate recognizability across diverse body types. The production art should be simpler and less visually detailed than this concept plate, and the plain stage must be one direct action away.

### Lantern Atelier

The single hero and portrait roster give it a more intimate dressing-room character. A horizontal workbench and garment tray connect the controls to the place. Warm light is friendly and makes this a plausible alternative for a cozy creator.

I do not recommend it as the default. Its category bar, garment tray and bottom modes stack vertically; the screen spends more space explaining the control hierarchy. It is attractive on a tall monitor, but short screens require more aggressive reflow. Its roomy interior also risks becoming more visually memorable than the tiny sprite.

### Quiet Stage

The least distracting alternative: a restrained ground plane, compact character list and focused form. It works well across character genres, has the lowest background-production cost, and makes color/edge judgments easier.

I would retain its value as a proofing/background option rather than the main identity. It is closest to a conventional tool and provides less of the playful world the brief asks for. It also does not justify a second implementation of every workflow: use shared components with a quieter stage.

## The experience from first visit to export

1. **First visit:** an inviting camp with one clearly labeled demo. “Try dressing” is immediate and free. New character and Import are visible alternatives. A demo is not silently saved as the user's creation. If the user wants to generate on it, explain the local-copy and rig-setup requirements together before proceeding, rather than serial surprise gates.
2. **Returning visitor:** open their cast, remembering selection and page. One character is still a real selection screen, not a fake multi-character collection. For zero saved characters, show demo/create/import; for one, omit pagination; for many, keep search and sortable list access. No invented four- or six-character storage cap.
3. **Imagine:** collect appearance intent with a useful default. Keep text honest about body identity versus removable hair/clothing. Build and skin hints are optional text guidance, not exact shape/color promises. Seed and exact submitted prompt belong in a reachable details surface on every viewport. The frame/output format must be understandable before drawing.
4. **Review cost and draw:** show connected state, quote scope, estimate uncertainty and the single paid action. Never invent a price or imply an estimate is a guaranteed cap. Closing a dialog cannot silently repeat a job.
5. **Review appearance:** compare available source views, mark missing/mirrored views, and accept the base before additional animation work. Rejecting it prompts a new quote; it does not silently redraw. This split requires a pipeline/state-machine change; it is not implemented by the visual prototype.
6. **Bring to life:** select initial moves and directions with their cost; preserve accepted artwork and frozen frames. Show real progress steps and resumable state, not fake percentages or invented completion times. Failed work offers a scoped, explicit retry with cost, or keeps the usable result.
7. **Dress:** selecting already-made equipment changes the actor immediately. None is ordinary. New item opens prompt → quoted generation/fitting → multi-view review → Keep. Saved designs show whether a free compatible copy or paid fitting is required. A different base is a new character, not a body slider that preserves equipment compatibility.
8. **Refine:** named local palette ramps, optional exact-color editing, outfit save/apply, undo/redo and contextual layer/visibility controls. Fit/QA warnings appear at the affected item, not solely at export.
9. **Export:** choose engine/format, see what is included and any missing coverage, then download layers and manifest. The current format, pivot, frame grid, oversize-weapon rules and engine packaging remain authoritative. Exporting a backup must be distinguishable from exporting a game-ready asset set.

## Core functionality map

| Existing capability | Proposed home | Required safeguard |
| --- | --- | --- |
| Project list, rename, delete | Camp → full library / character actions | Local storage disclosure, backup route, separate confirmed delete |
| Offline demo / demo copy | Labeled sample in first-run camp | No token request to try dressing; explain copy/setup before generation |
| New base body, size/directions/seed | Dedicated creation scene and drawing details | Only supported pipeline choices; no precision promises |
| Import project / PixelLab character | Camp → Import | Preview file and compatibility; preserve full project data where available |
| Base rig setup | Imported character's readiness action | Show missing requirements and scope/cost before starting |
| Generated swappable equipment | Wardrobe → category → New item | One frozen base, quality review, no automatic paid resend |
| Save/reuse/import/export designs | Wardrobe → saved designs / item actions | Distinguish compatible copy from fitting; base hash compatibility |
| Equipment None, visibility and z order | Item choice and contextual Layer & visibility | Direction-specific overlap rules and hidden-slot dependencies |
| Exact palette-ramp recolor | Quick swatches → Colors → exact editor | Local deterministic operation; preserve ramp shading and alpha |
| Outfit save/apply/delete | Outfits mode and character actions | Reversible parts, clear current versus named saved look |
| Add moves, play/pause, frame step | Moves mode and preview strip | Frozen frames remain unchanged; expose item work for added moves |
| Discrete direction / all-view preview | Preview strip → Inspect | 4/8 actual directions; missing and mirrored status; no fake orbit |
| Alignment/grip/stray-pixel/coverage QA | Item review → Inspect; export summary | Neutral or checkerboard view, native scale, frame stepping; no blanket green check |
| Engine sheets, manifest, project ZIP | Export / backup actions | Godot, Phaser, Unity, Aseprite, PNG + JSON preserved |
| Balance, activity, failed/resumed jobs | Settings / nonblocking activity indicator | Show consequential state at action point; preserve offline behavior |
| Undo/redo, keyboard, theme | Persistent shortcuts and contextual controls | Focus, Escape/back, no hover-only actions, genuine light palette |

The prototype concretely illustrates entry points but does not implement every operation in this table. In particular, real project persistence, deletion, rig setup, API costing, retries, eight-view assets, advanced ramp editing, history, downloads and import parsing remain production work.

## Visual and interaction contract for implementation

- **Fullscreen app shell:** use the viewport, including safe areas, rather than a scrolling marketing page. Fullscreen means an edge-to-edge layout; do not automatically invoke the browser's fullscreen permission. The scene is background, never a click-to-move surface.
- **Scale:** use native pixel resolution with integer device-pixel magnification. Fit 96 px held-item layers around the same pivot without cutting them off. Offer 1× game-scale proofing beside a large editing preview. Do not upscale generated artwork or export the background.
- **Typography:** a restrained serif is limited to character/story headings; readable system sans for every control. Essential copy should generally be 14–16 CSS px in production, with secondary labels no smaller than 12. The study includes some smaller concept annotations; those are not a final accessibility spec.
- **Color:** ink/teal surfaces, off-white type, one warm selection/accent color. Selected state also has a check, outline or text. Controls need sufficient opaque backing; avoid a GlassKit/glass-panel redesign. Existing custom CSS and Lucide remain the implementation approach.
- **Focus:** one stable actor, one active category, one editing surface. Do not duplicate a large wardrobe and inspector. Put advanced controls behind a clearly named detail action rather than hiding them entirely.
- **Motion:** only the selected actor plays by default, and only after deliberate playback in the prototype. In production honor reduced motion, pause offscreen/background animation, and stop clocks when appropriate. Avoid ambient particles, camera sweeps, autoplay sound and continuous parallax.
- **Touch:** primary controls should target about 44 × 44 CSS px; do not rely on hover or swipe. Small direction targets in the prototype still need a final target-size pass. [WCAG minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) and [Apple guidance](https://developer.apple.com/design/tips/) use different thresholds/units; do not describe this as certified conformance.
- **Navigation:** Escape/back dismisses transient surfaces before leaving a scene; preserve focus and draft inputs. A paid job keeps its persisted identity across reloads. Dialog focus is trapped and returned; prompts/results announce meaningful changes, not animation frames.
- **Dark/light:** dark is the primary art direction. Production light mode needs proper light controls, contrast and a coordinated backdrop. The prototype's appearance toggle is a limited color study, not a verified complete light theme.

## Responsive behavior

| Context | Intended arrangement | Priority |
| --- | --- | --- |
| Wide desktop | Character left of contextual item choices; narrow category rail | Actor and complete gear silhouette remain dominant |
| Tablet / medium desktop | Reduce secondary text; narrower single panel; collapse roster to direct list action when needed | Do not squeeze the actor between two fixed columns |
| Phone portrait | Large upper actor, compact preview controls, lower item tray; All parts lists every category | Keep item changes visible; one deliberate scroll region |
| Short phone / keyboard open | Compact example/preview, scrollable form or tray, reachable sticky commit action | No clipped essential fields; input focus scrolls into view |
| Phone landscape | Preview on the left; one compact right panel; persistent navigation | Reflow instead of shrinking a portrait screen |

The supplied primary phone mockups are 390 × 844. Additional Camp captures cover 320 × 568 and 844 × 390. A real software keyboard, screen reader, browser zoom, notch/safe-area device and real touch input were not tested. Those are explicit implementation acceptance checks, not inferred successes from screenshots.

## Lead review of the researchers' challenges

| Challenge | Lead decision and action |
| --- | --- |
| “A scenic stage hides dark edges and stray pixels.” | Accepted. Added visible **Inspect** text, all-view comparison and a world/plain-backdrop switch. Require native-scale/frame inspection in production. |
| “The full library is not visible.” | Qualified. **All characters · 6** already opens a working searchable library and is tested. A permanent full list would reintroduce the bulky software framing; retain direct access and counts instead. Atelier/Quiet explore the compact-list alternative. |
| “Mobile Back/Hands disappear beyond the category strip.” | Accepted. Replaced implicit horizontal overflow with three direct categories and **All parts**, opening a complete labeled picker. |
| “Tiny item thumbnails cannot support comparison.” | Accepted. Crop thumbnails to their nontransparent bounds and enlarge using nearest-neighbor rendering; never move/scale actual equipment on the body. |
| “Mobile color dots lose their meaning.” | Accepted. Restored a material label, retained a distinct Colors mode, and separated creation hints from local changes. Final implementation needs named ramp/selected value announcements. |
| “Atelier stacks too many navigation layers.” | Accepted as the reason not to select it. Keep it as a genuine alternative rather than cosmetically converging all three layouts. |
| “Mirroring can be missed.” | Accepted. West carries a mirrored-state note in preview; missing wizard-hat north frames expose a direct Review action. Eight-view layouts must use actual available diagonals. |

## What needs validation before production

Run task-based tests with casual creators and asset-producing developers, on phones and desktop: find one of many characters; change headgear; remove it; make a new item; distinguish recolor from generation; understand a quote; inspect a missing direction; save an outfit; and export for a chosen engine. Measure successful completion, wrong-character edits, missed cost/coverage information and time to find controls. The desired result is a clear first attempt with little explanation; do not substitute subjective “looks like a game” ratings for successful tasks.

Implementation can preserve the current state/store/pipeline modules while replacing the view hierarchy. The major non-visual dependency is the split draw/review/animate flow. Prototype that state transition with existing stored frames before spending credits. Do not add arbitrary body sizes, new rig templates, unsupported models, a backend or a new UI framework as part of the visual redesign.
