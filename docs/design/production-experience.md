# Production game experience

Implemented on `feat/game-experience-rework`, 2026-10-23. This is the production integration of the approved [Obsidian / Porcelain Bronze direction](2026-10-22-redesign/round-4-discussion/current-design.md) and [round-six playable reference](2026-10-22-redesign/round-6-prototype/README.md). Earlier research and mockups remain decision history.

## Experience and preserved workflows

- **Characters:** full-screen world, actual locally saved characters and bundled demo, south-view thumbnails, selection by click, focused WASD/arrows or wheel. A second click on the selected character customizes it. No invented demo identities or simulated saved characters.
- **Create:** the complete production CharacterForm in a full-screen scene-backed surface. Name, linked Appearance/Prompt, help, API preview/copy, Enhance/Undo, body/frame, camera, original direction/mirror controls, seed, validation, costs, results and recovery retain their real behavior.
- **Customize:** a single persistent shell with Preview, Top-down and Side-scroller; identity/prompt left and all equipment controls right on desktop. Mobile uses an expandable bottom area. View tabs remain intrinsic width.
- **Preview:** animation choice, pause/play, declared facing controls, Still feedback for an unavailable selected clip/facing, and Inspect. Requested facing remains selected even if the chosen animation has no artwork there.
- **Live views:** continuous elapsed-time movement, camera following, touch joystick, nearest-direction animation resolver and deliberate fallbacks. Missing movement animation never disables movement. Equipment unavailable for a sequence is hidden for that presentation only, without changing the saved outfit. Deliberately sparse direction sets are normal; genuine coverage gaps have deduplicated feedback and details.
- **Inspect:** the original precise direction grid, frame stepping, zoom and checkerboard tools in a native modal. The world and equipment layout remain consistent when it closes. This is intentionally separate from the immersive, uncluttered Preview.
- **Wardrobe / Colors / Outfits / Moves:** real existing components and actions, including item details, quality notes, layer controls, shared designs, fitting, generation and recovery. More contains all extra production slots, not only the prototype's reduced demo categories. Moves is hidden in live views.
- **Import, setup, rename/delete, account, Activity, API disclosure, export:** existing dialogs, state and storage implementations remain in use. Paid-request safeguards are not replaced by the presentation runtime.

## Ownership

`@shilo/bronze-ui` 0.2.1 remains the owner of semantic colors, light/dark surfaces, component states, borders, focus, shadows, radii, scrollbars and transparent scrollbar tracks. No GlassKit and no new theme dependency.

`app/src/studio/experience/theme.css` imports package tokens/components without reset and aliases existing production workflow variables. `layout.css` owns composition, responsive constraints, reading-gradient placement and component sizing. Native controls receive Bronze recipes rather than a second palette. Shared-theme defects must be fixed and released in the Bronze repository; workflow geometry and scene artwork stay here.

`config.ts` owns per-state background URLs, floor projection art values and code-only reflection settings. Both source backgrounds are copied unchanged from the approved reference, with hashes recorded in `app/public/worlds/README.md`. Shared URLs reuse browser/cache resources. Top-down and side-scroller use different projections of the same world material; no unrelated pillars or new scene theme.

`WorldStage.svelte` owns canvas/input coordination. `movement.ts` and `presentation.ts` resolve vectors, facing, body/equipment coverage and animation timing independently of UI. Production compositor, pivots, oversize layers, recoloring and saved variants remain authoritative. No world lighting, tint or filtering is applied to actor pixels. Reflection is a separate optional copy. Resize, blur, modal entry and view/character changes release input safely.

Actor fitting uses the complete frame around its actual pivot so equipment and long animations do not jump in size or collide with controls. Integer physical-pixel scale is preferred; large imported frames can minify with nearest-neighbor sampling when the viewport cannot contain one physical pixel per source pixel. Selected names and playback controls center within the world area, excluding the equipment rail. On compact phones, Redo remains available in More.

`focus.ts` restores actual activation targets, including WebKit pointer behavior, and positions native top-layer popovers against their trigger with viewport clamping. `appearance.js` restores the saved light/dark choice before the app initializes, including native color-scheme.

## Intentional differences from a mockup

The prototype's fake three-character cast becomes the user's actual library. Real equipment categories and all workflow forms remain accessible. The creator has working validation and cost/recovery states rather than decorative fields. Short phones reserve space for the actual painted sprite and permit equipment scrolling/expansion; the sprite is not enlarged through overlapping controls. Source pixels and original clip proportions take precedence over generated mockup embellishment.

## Verification gates

Run `npm run check`, `npm test`, `npm run build` and the standard browser suite from `app/`. The focused `playwright.experience.config.ts` runs against an already-served normal app (`BASE`, default port 5207): five screens × desktop/mobile × light/dark, real equipment/Undo/outfits, import/export, form validation, direction fallback, camera/input/focus, and painted-sprite clearance on short phones. All tests use isolated storage and blocked or mocked PixelLab traffic.

Review native dialogs and popovers, not only the five hero screens. Test 320×568 and 844×390 alongside 390×844 and desktop; confirm text/control bounds, native select colors, attached mirror edges, unclipped swatches, focus restoration and scroll reachability. Keep screenshots local under ignored test results; record outcomes in the [integration verification report](../testing/production-experience-2026-10-23.md).
