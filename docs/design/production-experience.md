# Production game experience

Implemented on `feat/game-experience-rework`, 2026-10-23. This is the production integration of the approved [Obsidian / Porcelain Bronze direction](2026-10-22-redesign/round-4-discussion/current-design.md) and [round-six playable reference](2026-10-22-redesign/round-6-prototype/README.md). Earlier research and mockups remain decision history.

## Experience and preserved workflows

Apply [simplicity-first design](../usability-principles.md) to changes in these workflows: keep common tasks direct, reveal necessary secondary options in context, and preserve costs, errors, accessibility and recovery. The guide defines interaction principles; this document retains the workflow and theme ownership contracts.

- **Characters:** full-screen world, actual locally saved characters and bundled demo, south-view thumbnails, selection by click, focused WASD/arrows or wheel. A second click on the selected character customizes it. No invented demo identities or simulated saved characters.
- **Create:** the complete production CharacterForm in a full-screen scene-backed surface. Name, linked Appearance/Prompt, help, API preview/copy, Enhance/Undo, body/frame, camera, original direction/mirror controls, seed, validation, costs, results and recovery retain their real behavior.
- **Customize:** a single persistent shell with Preview, Top-down and Side-scroller; identity/prompt left and all equipment controls right on desktop. Mobile uses an expandable bottom area. View tabs remain intrinsic width.
- **Preview:** animation choice, pause/play, declared facing controls, Still feedback for an unavailable selected clip/facing, and Inspect. Requested facing remains selected even if the chosen animation has no artwork there.
- **Live views:** continuous elapsed-time movement, camera following, touch joystick, nearest-direction animation resolver and deliberate fallbacks. Missing movement animation never disables movement. Equipment unavailable for a sequence is hidden for that presentation only, without changing the saved outfit. Deliberately sparse direction sets are normal; genuine coverage gaps have deduplicated feedback and details.
- **Inspect:** the original precise direction grid, frame stepping, zoom and checkerboard tools in a native modal. The world and equipment layout remain consistent when it closes. This is intentionally separate from the immersive, uncluttered Preview.
- **Wardrobe / Colors / Outfits / Moves:** real existing components and actions, including item details, quality notes, layer controls, shared designs, fitting, generation and recovery. More contains all extra production slots, not only the prototype's reduced demo categories. Moves is hidden in live views.
- **Item thumbnails:** saved and generating items show an item-only, transparent-bound crop fitted to the existing artwork area without clipping. A draft shows its first usable extracted preview even before it is worn; the progress ring overlays it only while generation runs. Static thumbnails use native backing pixels with nearest-neighbor CSS containment, favoring available space over uniform device-pixel block widths. Frame selection and cropping depend on artwork changes, not playback, progress ticks or viewport measurements; the stage retains its existing pixel scaling.
- **Import, setup, rename/delete, account, Activity, API disclosure, export:** existing dialogs, state and storage implementations remain in use. Paid-request safeguards are not replaced by the presentation runtime.
- **Share preview:** Move/Direction and Size/Animated use matching equal-width, wrapping control rows. A Bronze divider separates settings from Copy PNG/Share to actions and the full-width Download action. Sizes are 1x, 2x, 3x, 4x, 6x, 8x and 10x; the download label identifies PNG or GIF and shows the actual pixel resolution. All outputs preserve frame padding and use nearest-neighbor scaling. Animated sharing and all app views repeat continuously, including moves set to play once on export. Copy PNG stays visible in either mode and copies the fixed first GIF frame when Animated is on, or the static output when off. PNG data is prepared before activation to preserve clipboard user permission. No control tooltips or permanent first-frame explanation are shown. Per-frame output is limited to 16,777,216 pixels to bound working raster memory; oversized selections show an error and can be reduced.
- **Export:** Settings/Back stays on the left and Close stays on the right in one native dialog. Format, Include dressed character sheets and Play animation once names are global preferences persisted in IndexedDB by `lib/store/export-settings.ts`. Playback checkboxes list unique canonical names across saved characters, the current character and remembered selections. Names match case-insensitively without aliases or semantic guesses; unselected names loop. Renamed/new names use their own rule, and deleting a character retains remembered names for future characters. Opening or reactivating Export refreshes metadata; atomic single-field saves merge concurrent changes, with cross-tab invalidation. Export resolves preferences only on a manifest copy, including the editable copy shipped in the ZIP; importing a file never changes global preferences. App previews and shared GIFs always loop. Combined sheets are extra PNGs for the current look and saved outfits; disabling them retains separate layers and outfit definitions. Current settings remains concise and Files included has its own disclosure. Dialog height stays stable when navigating, with reduced-motion support.

Export reports invalid saved preferences and offers an explicit reset of only those preferences, preserving characters and outfits. An unrelated character with invalid animation names is omitted from the global name catalog with an identifying warning; it does not prevent exporting the current character. Invalid current-character data remains blocking. Loading or unavailable settings never display default values as though they were saved choices.

## Full screen

The shared header offers a quiet Lucide expand/contract button immediately before More on Characters,
Preview, Top-down and Side-scroller. This is a global presentation action, so a stable header position
keeps entry discoverable and exit one tap away on touch devices. Putting it inside More would reduce
header density but add a second interaction to both entry and exit. It uses the existing Bronze button
recipe and a minimum 44px width, with an accessible action name and native title. From 761px through
1279px, view tabs stay in the character details flow so they cannot overlap Full screen, running
Activity or the character name on shorter displays. Native modal sheets
retain their existing Close/Cancel controls; the header follows the same modal accessibility rules as More.

Entry is optional and starts only from activation. Nothing is saved or automatically restored. The
standard Fullscreen API targets `document.documentElement`, keeping the scene, dialogs, popovers and
notifications together. Browser `fullscreenchange` events determine the icon/action, including browser-owned
exits. Pending requests cannot overlap, and failures show an error notification with a recovery suggestion.
Escape remains browser-owned; app navigation does not also handle Escape while API fullscreen is active.
No keyboard/pointer lock, orientation lock, custom shortcut, dependency or CSS imitation of fullscreen is needed.

Research and PWA handoff (2026-11-02):

- Browser/PWA chrome varies by platform. An in-app control supplies a consistent location; desktop
  [Window Controls Overlay](https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API)
  exposes title-bar space only for installed desktop PWAs and would add a separate layout contract.
  It does not solve browser tabs or mobile access, so it is unnecessary here.
- The [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) and
  [requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen) require
  support/permission and transient user activation. Feature detection hides the button where unavailable
  or prohibited. Requesting `navigationUI: 'hide'` expresses the immersive preference; the browser controls
  the resulting UI. No vendor-prefixed compatibility layer is added.
- The [Fullscreen standard](https://fullscreen.spec.whatwg.org/) reserves an exit mechanism for the user.
  Its state/events are authoritative; window/screen dimensions are not used to guess fullscreen.
- Prefer manifest `display: standalone` when PWA support is added, retaining this optional game-style
  toggle. [Manifest fullscreen is independent of API fullscreen](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display):
  the app can already occupy the screen with `fullscreenElement === null`. `exitFullscreen()` cannot
  turn that launch mode into a window. Hide the control whenever
  [`(display-mode: fullscreen)`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/display-mode)
  matches without an API fullscreen element, including browser-owned fullscreen. Watch both display-mode
  changes and API events. Standalone/window-controls-overlay launches retain the toggle when supported.
- Platform support remains uneven. [WebKit's Safari 16.4 notes](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
  introduced unprefixed element fullscreen on macOS and iPadOS;
  [MDN's compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json)
  still identifies the iPhone limitation. A home-screen standalone app removes browser navigation UI
  without requiring this API. Real iPhone/iPad/Android and installed-PWA behavior needs device validation
  during PWA delivery; browser automation covers actual Chromium API transitions and simulated launch modes.

## Ownership

`@shilo/bronze-ui` 0.2.2 remains the owner of semantic colors, light/dark surfaces, component states, borders, focus, shadows, radii, scrollbars and transparent scrollbar tracks. No GlassKit and no new theme dependency. UI design contract: [Design Contract to Preserve](../../.claude/handoffs/2026-10-23-production-parity-ui-ux-continuation.md#design-contract-to-preserve).

`app/src/studio/experience/theme.css` imports package tokens/components without reset and aliases existing production workflow variables. `layout.css` owns composition, responsive constraints, reading-gradient placement and component sizing. Native controls receive Bronze recipes rather than a second palette. Shared-theme defects must be fixed and released in the Bronze repository; workflow geometry and scene artwork stay here.

`config.ts` owns per-state background URLs, floor projection art values and code-only reflection settings. Both source backgrounds are copied unchanged from the approved reference, with hashes recorded in [Production world artwork](world-artwork.md). Shared URLs reuse browser/cache resources. Top-down and side-scroller use different projections of the same world material; no unrelated pillars or new scene theme.

`WorldStage.svelte` owns canvas/input coordination. `movement.ts` and `presentation.ts` resolve vectors, facing, body/equipment coverage and animation timing independently of UI. Production compositor, pivots, oversize layers, recoloring and saved variants remain authoritative. No world lighting, tint or filtering is applied to actor pixels. Reflection is a separate optional copy. Resize, blur, modal entry and view/character changes release input safely.

Actor fitting uses a cached union of painted bounds across the body's poses and currently visible equipment, measured around the real pivot. Transparent oversize padding must not make the hero unnecessarily small. The union stays stable through playback; full compositor frames and exported pixels are unchanged. Integer physical-pixel scale is preferred; large imported artwork can minify with nearest-neighbor sampling when necessary. Selection scales with viewport height and available stage width. Selected names and playback controls center within the world area, excluding the equipment rail. On compact phones, Redo remains available in More.

The [direct prototype parity review](production-prototype-parity.md) corrects the first integration's typography, hierarchy, scale and creator composition. Desktop view navigation sits at the top center, independent of the identity block. The right rail uses stacked category icons, a category heading/count, large equipment cards, a separate None action and contextual creation/design actions. Phones retain search and Import/New actions above the cast; the studio uses the compact lower rail. Native dialog content scrolls while its action footer remains accessible.

`focus.ts` restores actual activation targets, including WebKit pointer behavior, and positions the menus, Share panel and API Peek inspector against their triggers with four-side collision handling and the Bronze pointer. Help tooltips use the same pointed shell with top/bottom placement. Native selects and modal sheets keep their native presentation. `appearance.js` restores the saved light/dark choice before the app initializes, including native color-scheme.

## Intentional differences from a mockup

The prototype's fake three-character cast becomes the user's actual library. Real equipment categories and all workflow forms remain accessible. The creator has working validation and cost/recovery states rather than decorative fields. Short phones reserve space for the actual painted sprite and permit equipment scrolling/expansion; the sprite is not enlarged through overlapping controls. Source pixels and original clip proportions take precedence over generated mockup embellishment.

## Verification gates

Run `npm run check`, `npm test`, `npm run build` and the standard browser suite from `app/`. The focused `playwright.experience.config.ts` runs against an already-served normal app (`BASE`, default port 5207): five screens × desktop/mobile × light/dark, real equipment/Undo/outfits, import/export, form validation, direction fallback, camera/input/focus, and painted-sprite clearance on short phones. All tests use isolated storage and blocked or mocked PixelLab traffic.

Review native dialogs and popovers, not only the five hero screens. Test 320×568 and 844×390 alongside 390×844 and desktop; confirm text/control bounds, native select colors, attached mirror edges, unclipped swatches, focus restoration and scroll reachability. The original [integration verification report](../testing/production-experience-2026-10-23.md) is historical evidence, not proof of visual parity. Use the [direct parity review](production-prototype-parity.md) and its matching-size capture script for subsequent changes. Keep screenshots local under ignored test results.
