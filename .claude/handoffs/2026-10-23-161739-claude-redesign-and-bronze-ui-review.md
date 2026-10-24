# Claude handoff: independently challenge PixelDoll’s redesign and Bronze UI

## Current State Summary

This is a new, independent design and quality audit request, not a continuation that should assume the previous verdicts were correct. The user wants Claude to heavily review and challenge the entire immersive PixelDoll playable prototype and the entire standalone Bronze UI theme repository: visuals, usability, professionalism, minimalism, consistent interaction, native light/dark theming, and the experience of creating and testing game characters. Earlier reviews missed visible regressions; passing tests and prior agent confidence are evidence to examine, not approval to inherit.

Created 2026-10-23. PixelDoll checkout: `C:/Programming_Files/Shilocity/PixelLab/PixelDoll`, branch `codex/ui-ux-redesign`, HEAD `a0c9990` at handoff creation. Theme checkout: `C:/Programming_Files/Shilocity/bronze-ui`, branch `main`, HEAD `d811d35`, published version 0.2.0. Recheck both repositories before beginning because other work may continue.

Act as a senior game character-creator UI/UX designer and a skeptical frontend/theme reviewer. Review first and deliver evidence and recommendations. This handoff alone does not request a production migration, new visual direction, code fixes, releases or remote publication. If the user subsequently asks for fixes, follow the ownership and verification workflow below. Do not stop at a plan or repeat the existing documentation as your findings.

## Important Context

- The target is an immersive full-screen character creator/playground, with the world and genuine character artwork as the focus. It should feel polished and game-like, not like a dashboard or a large form floating over a wallpaper.
- “Minimal” means purposeful, understandable controls with restrained presentation. It does not excuse unclear buttons, hidden capabilities, weak contrast, tiny targets, missing feedback or excessive discovery effort.
- The prototype is separate from the production Svelte Studio. Review production controls to establish real workflow and component coverage; do not claim the prototype implements production generation, storage, validation or export behavior.
- Bronze UI is a separate MIT CSS-first package with optional Svelte components. The prototype consumes its published archive through the app manifest and lockfile. Production Studio still uses its existing custom CSS.
- Do not add GlassKit to the current application. Its old study is historical evidence only. Apple Liquid Glass, Material and game references are useful counterexamples and sources, not authorities that make a treatment correct for this product.
- Do not use paid PixelLab calls, expose credentials, inspect or copy secret values, or screenshot secrets. This audit can run entirely with the local demo fixture and sanitized showcase examples. Read the current AGENTS.md and CLAUDE.md before working.
- Screenshots and generated art are local assets. Do not overwrite historical evidence, reinterpret a different baseline as the requested baseline, or silently recreate missing art. Record unavailable evidence explicitly.

## Immediate Next Steps

1. Read repository instructions, confirm Git state, installed theme version, current server URLs and available evidence in BOTH repositories. Preserve unrelated changes. Identify what changed since the hashes above.
2. Read the current ownership/design decisions and inspect the actual prototype and standalone showcase in a browser. Walk every screen once before drawing conclusions from source code or static screenshots.
3. Inventory current production Studio controls and workflows against the prototype and theme showcase. Mark implemented, representative-only, absent and intentionally out of scope. Do not equate a generic button example with every real workflow state being covered.
4. Review the correct before/current gallery, then original image mockups. Compare identical screen, viewport and appearance. Explain differences in typography, hierarchy, materials, alignment and interaction; separate intentional improvements from regressions.
5. Execute the review matrix below, recording screenshots and reproducible interactions. Read DOM semantics, computed styles and event/state behavior in addition to inspecting pixels.
6. Research disputed design decisions using current primary sources. Produce prioritized findings with counterarguments, ownership, concrete recommendations and verification criteria. Deliver a coherent verdict for each screen and each theme family, including explicit untested areas.

## Decisions Made

These are the user’s current product direction. Challenge implementation quality and surface tradeoffs, but do not silently replace the direction with your preferences.

| Area | Approved direction and review obligation |
| --- | --- |
| Visual identity | Obsidian / Porcelain Bronze: dark by default with a complete light mode. High-quality HD prototype-world / holodeck / graybox atmosphere, coherent bronze accents, minimal floating controls. Challenge visual coherence, perspective and hierarchy in both modes. |
| Composition | Moonlight Camp-inspired immersive layout, Quiet Stage-like inspection clarity. Desktop information left, equipment and customization tabs right, character centered within the actual remaining stage. Mobile uses a compact bottom equipment area. Test center alignment through resize and changing content. |
| Worlds | Keep selection/Preview world identity consistent; Top-down and Side-scroller use camera-appropriate projections of the same world. No unrelated pillars, scenery styles, decorative structures, grid/bounds/proof toggles or unrequested features. Grid is ground design. |
| Artwork | Actual demo sprites only. Character pixels remain unlit, unshaded and unfiltered by themes. Intentional equipment recoloring is distinct from theme colors. Reflection is a separate rendering layer, controlled in code, not an added UI setting. |
| Navigation | Launch into character selection. Selecting a different character selects it; clicking an already selected row/world actor opens customization, so double-clicking a new selection also enters. South-facing thumbnails support identification. Selection rows may remain borderless at rest if affordance stays clear. |
| Studio | One interface with Preview / Top-down / Side-scroller. Equipment controls and character switching remain available in every view. Playback, clip and facing controls appear only in Preview. No redundant Customize/Play mode buttons. |
| Copy | Useful screen titles, character identity and concise technical information. No invented classes or slogans. Tab order: Wardrobe, Colors, Outfits, Moves. Additional equipment trigger: More; popup heading: Additional equipment; entries only Back and Held item. |
| Input | Selection uses arrows and WASD; Escape/Backspace go back with appropriate overlay/editable-field handling. Studio view shortcuts must be verified, including whether Tab behavior compromises standard keyboard access. Preview arrows/WASD choose among the character’s declared directions independently of clip availability. |
| Gameplay | Continuous movement and camera following, not frame-by-frame movement simulation. Keyboard movement plus a dynamic touch joystick initiated in the world outside UI. Equipment can be changed while moving. No extra movement/action panels. Challenge touch discoverability and accessible alternatives without adding bulky controls by default. |
| Fallbacks | Dynamic angular direction resolution, previous-facing tie breaks and velocity/action state. Intentional 1/2/4/8-direction rigs map gracefully without notices. Missing expected artwork falls back through valid movement/idle/still artwork while movement continues; deduplicated notices only for real coverage gaps. Do not freeze movement. Missing equipment may temporarily hide while retaining its equipped identity, then restore on compatible frames. |
| Prompt | Concise prompt excerpt with recoverable full text. User discussed compact-line expansion on hover/tap; current prototype uses explicit click/tap/keyboard disclosure. Treat optional hover as a documented gap, not an already implemented behavior. Avoid accidental popups or disappearing essential information. |
| Theme switch | One conventional sun/moon action labeled Light mode or Dark mode, naming the destination. No named-palette options or Appearance category. Background and UI may change; character pixels may not. |
| Materials | Readable local gradients, restrained floating surfaces and opaque reading/work surfaces where needed. Native transparent-track scrollbar. Consistent semantic colors, focus treatment, boundaries, shadows and radii; values such as 8/12/16px are decisions to evaluate, not universal standards. |
| Modularity | Shared appearance belongs upstream in Bronze UI; layout and domain behavior belong in PixelDoll. DRY, KISS and YAGNI: reuse without building an oversized component framework. |

## Architecture Overview

The prototype is a small independent Vite/JavaScript UI under `docs/design/2026-10-22-redesign/round-6-prototype/`. It imports the app’s real fixture loader/compositor. HD environments are rendered with WebGL2, actual sprites with a separate nearest-neighbor Canvas2D layer, and interactive controls with HTML/CSS. The world must remain legible and coherent during camera movement, not only in a stationary screenshot.

Bronze UI exports tokens, component recipes and an optional document reset separately. The prototype omits the reset and imports tokens/components unlayered after its own geometry styles. `bronze.mjs` maps domain controls to shared classes/variants. Shared Svelte field/dialog/help/choice/notice behaviors live in the theme package. Check whether this division actually prevents drift and works in independent consumers without accidental host inheritance.

## Critical Files

Use the following local roots when resolving paths. Read the most recent source and decisions first; several older reports contain superseded conclusions.

| Root / path | Purpose |
| --- | --- |
| `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/AGENTS.md` and `CLAUDE.md` | Project constraints, safe testing and theme ownership |
| `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/design/2026-10-22-redesign/round-6-prototype/` | Entire active prototype, tests and review pages |
| Prototype `main.js`, `ui.js`, `creator.js`, `equipment.js` | Rendering, workflow, labels, overlays and control composition |
| Prototype `styles.css`, `creator.css`, `bronze-theme.css`, `bronze.mjs` | Consumer geometry, responsive layout and theme adapter |
| Prototype `world.js`, `assets.js`, `config.js`, `stage-layout.mjs` | Ground, sprite compositing, reflection, asset reuse and stage centering |
| Prototype `motion.mjs`, `directions.mjs`, `input.mjs` | Gameplay/Preview input, directions and missing-art resolution |
| Prototype `theme-ownership-0.2.0.md`, `composition-polish.md`, `regression-repair.md` | Latest theme boundary and previous user-reported repairs |
| Prototype `pre-bronze-comparison.md`, `pre-bronze-review.html` | Correct historical before/current comparison and provenance |
| `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/design/2026-10-22-redesign/round-4-discussion/` | Workflow, design decisions, feasibility and resolver specification |
| `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/design/2026-10-22-redesign/round-5-mockups/` | Approved image mockups, image index and background provenance |
| `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/design/2026-10-22-redesign/round-7-theme/control-inventory.md` | Earlier inventory; recheck against current app instead of assuming complete |
| `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/studio/` | Current real workflow and component coverage reference |
| `C:/Programming_Files/Shilocity/bronze-ui/styles/` | Semantic tokens, optional base reset and reusable CSS recipes |
| `C:/Programming_Files/Shilocity/bronze-ui/src/lib/` | Public Svelte components and their behavior |
| `C:/Programming_Files/Shilocity/bronze-ui/showcase/` and `tests/` | Independent visual examples, hostile-host contracts and package/browser tests |
| `C:/Programming_Files/Shilocity/bronze-ui/docs/STYLE-GUIDE.md` | Shared contract; verify documentation against actual 0.2.0 source |
| `C:/Programming_Files/Shilocity/bronze-ui/docs/RESEARCH.md`, `C:/Programming_Files/Shilocity/bronze-ui/docs/COVERAGE.md`, `C:/Programming_Files/Shilocity/bronze-ui/docs/EXTRACTION-0.2.0.md` | Research, limitations and ownership review; historical coverage is not exhaustive proof |
| Both manifests/lockfiles; theme README, LICENSE, NOTICE and workflows | Dependency integrity, API/package contract, asset licensing and published showcase |

## Review Method: challenge claims with evidence

For each important choice, ask: what user task does it serve, what cost does it impose, what evidence supports it, what is the simplest alternative, and what breaks at another viewport, state or theme? Defend an existing choice when the alternative is worse. Do not manufacture findings to appear critical, and do not dismiss a concrete regression because it was intentional.

Use screenshots for visual facts, DOM/computed styles for causes, interaction traces for behavior, and source inspection for ownership. A screenshot alone cannot prove focus trapping, continuous movement or shader-free sprite pixels; a DOM bounding-box test cannot prove a professional visual hierarchy. Measure relevant contrast over the actual rendered scene and states; a token-pair calculation does not validate translucent content over arbitrary scenery.

Research Apple Human Interface Guidelines/Liquid Glass, current Material guidance, WCAG 2.2/WAI patterns, MDN/native web behavior and relevant game creator examples when they help resolve a finding. Verify current versions and primary sources, date your sources, distinguish normative requirements from guidance and aesthetic preference, and explain why a rule applies here. Do not imitate Apple, Google or a game UI just because it is recognizable. Do not use the original mockups’ generated typography or embellished sprites as exact implementation specifications.

## Visual and interaction audit matrix

### Every screen and composition

Review selection, character creation, Preview, Top-down and Side-scroller in both appearances. Inspect all four customization tabs, equipment categories, None/unselected/selected states, character chooser, prompt disclosure, overflow menu, native select popup, help, toasts and dialogs. Inspect creator Appearance and Prompt paths, all scroll positions, name, details, Kind/Build/Proportions/Skin, body size/presets, padding/Auto/frame units, size guide, camera, seed, direction presets, individual arrows, attached mirrors, enhancement/undo/help/API/copy states, cost/action placement and validation/quality-note coverage against production.

Assess professional finish: clear hierarchy, type family/weight/size, line length, optical and mathematical alignment, spacing rhythm, baseline alignment, icon consistency, outlines, radius relationships, surface opacity, elevation, state transitions and density. Identify arbitrary exceptions and visual noise. Evaluate world-to-sprite perspective, scale, contact, reflections, floor seams, shimmering and camera comfort. Check that the character remains the focal point without burying controls.

Desktop equipment navigation should not force repeated travel across opposite edges. Center actor, caption and playback in actual free stage space, not the window. Check long names/prompts, one/many characters, filtering/no results, varied equipment counts and text wrapping with safe local test data. Preview/live switching and character switching must preserve appropriate state, clear stale movement and close inappropriate overlays.

### Themes and all component states

Build a control-family × state × context coverage table from current production needs and the package: buttons/links/icon controls; text/search/number/password/textarea/file/color/select; unit/Auto/joined fields; checkbox/radio/switch/choices; tabs; tiles/rows/thumbnails; swatches/ramps; disclosure/code/table/structured request data; badges/notices; progress/jobs/loading; tooltips/popovers/toasts; modals/sheets/confirmation/review panels; import/export/account/recovery/quality flows.

For each applicable family inspect default, hover, pressed/active, selected/checked, keyboard focus, disabled, busy/loading, readonly, invalid/error, warning/success, empty and long-content states. Distinguish conceptual examples from fully functioning behavior. Check disabled explanations, selection versus activation/equipped state, non-color state markers, icon alignment, native field schemes and picker rendering. Inspect Files disclosure for fragmented borders, wrapped paths and scroll behavior.

Challenge whether translucent tiles and quiet controls have sufficient local backing, whether selected/focus states remain distinguishable, and whether dark/light states are independently designed rather than inverted. Test theme persistence, first load, flash, scrollbars with transparent tracks, reduced motion/transparency, increased contrast and forced colors. Check nested blur, expensive filters, unsupported backdrop-filter/native-picker fallbacks, borders/seams and host-style leakage. Test package components with and without base.css and within a hostile inherited font/foreground context. The source-ownership regex is a tripwire, not a proof that every appearance rule is upstream.

### Responsive and accessibility testing

Use a representative minimum matrix: 320×500, 390×844, 450×800 portrait; 568×320 and 844×390 landscape; 768×1024 and 1024×768 tablet; 1280×720, 1366×768, 1469×889 and 1920×1080 desktop; plus a larger display. Inspect breakpoint boundaries around 760/1000/1350px and short heights around 540px, and resize with menus/forms open. Test browser zoom/text enlargement, OS display scaling/DPR, safe areas and virtual keyboard effects where tools permit. Do not imply emulation proves physical-device behavior.

Use keyboard-only and touch as well as mouse. Check logical focus order, visible/unclipped focus, labels/names/roles, announced state/errors/status, Escape dismissal and focus return, modal containment, nonmodal exit and editable-field shortcut suppression. Specifically challenge whether the studio Tab shortcut steals normal focus navigation. Measure effective hit areas, not just visible icon size; distinguish minimum accessibility requirements, exceptions and a comfortable touch target. Check that small palette chips and attached mirror buttons remain operable. Evaluate dragging alternatives and alternatives for a user who cannot use WASD or a joystick.

Inspect actual screenshot contrast for primary/muted text and meaningful boundaries in both themes, including the brightest/darkest moving backgrounds. Check outline clipping and scrollbar visibility without adding a track against the user's direction. Record real assistive-technology/device checks separately from automated assertions; never claim certification from a browser script.

### Package integrity and maintainability

Review public CSS/Svelte exports, declarations, optional peer dependencies, CSS side effects, CSS-only use, reset opt-in, scoped selectors, specificity and repeated material formulas. Test the packed artifact rather than only a local source import. Check that showcase-only styles do not mask missing package rules, and that the theme works without PixelDoll-specific dependencies. Review semantic token names, state APIs, backwards compatibility, documentation drift, licenses/asset notices and release/showcase reproducibility. Challenge unnecessary abstractions and inconsistent CSS escape hatches. Treat a theme as a reusable contract, not merely a visually pleasing demo.

Test content resilience with long filenames, identifiers, translated-length labels, Unicode/RTL character names, empty lists and failed asset loads where appropriate. Check safe text rendering and links for user-provided content. Evaluate loading, offline and rendering failure feedback so blank canvases or unavailable art do not leave users without an understandable state. Distinguish verified current capabilities from proposed future support.

### Gameplay and animation behavior

Test continuous WASD/arrow movement, diagonals, normalization, release, direction transitions, stopping, camera follow and equipment changes while moving. Test mouse/touch origin inside and outside UI, multi-touch ownership, second-finger equipment use, release outside the canvas, pointer cancel, blur/tab visibility, resize, view change and modal opening. Check that gameplay input never edits fields or clicks UI accidentally.

Exercise deliberate one/two/four/eight-direction configurations and irregular declared direction sets with local fixtures/unit cases. Distinguish normal directional mapping from missing declared clip coverage. Test last-facing ties near vertical input for two-direction rigs, jitter, absent Idle/Walk, idle still fallback, per-action coverage and equipment disappearance/restoration. Check toast deduplication, timing and whether notices interrupt play or hide required information. Do not propose freezing movement or noisy toasts for every normal fallback.

Verify source sprite pixels remain unchanged across light/dark, overlays and reflections. Check integer scale, pivots, equipment layering, retained background image identity, optional per-view backgrounds and code-only reflection disabling. Inspect perceived frame pacing/performance during movement and scrolling; instrument when useful and report measurement limits. A fixed background screenshot is not evidence of a continuous playable world.

## Work Completed and Existing Verification

Bronze UI 0.2.0 moved reusable action variants, tabs, compact selects, palette rings, joined seams, focus/forced-color rules, dialogs and backing materials upstream. Prototype overrides were removed and the published dependency was pinned. Theme commit `d811d35` and release/Pages workflows succeeded; prototype integration commit `274f737` records the consumer changes.

Existing local checks passed: theme Svelte check/build/package consumers; 48 showcase combinations in each of Chromium/WebKit; isolated form contracts plus four appearance/host-geometry cases and eight material cases per browser; prototype 26 regression cases and six focused phone cases per browser; eight dependency/theme cases; app production build and dist guard. Earlier gameplay work reports 12 unit and 18 browser checks. These are historical results, not proof that this new audit has run or that every screen/state is accessible or visually correct. A known large-bundle build advisory is not newly introduced by the theme.

The latest correct comparison has 68 fresh before images and 68 current images, with verified hashes/dimensions and joined pairs, plus four overview boards. It was committed as `a0c9990` (gallery/helpers/docs; media stays local). Prior tests once missed obvious user-visible issues, so challenge the adequacy of their assertions and state coverage.

## Files Modified

No production code or theme changes are requested by this handoff itself. Recent relevant implementation files and rationale are recorded in `theme-ownership-0.2.0.md`; comparison-helper/gallery changes are recorded in `pre-bronze-comparison.md`. This handoff is the only new task artifact being authored now. Inspect both Git diffs before auditing so unrelated export/security/workflow research is not mistaken for your work.

## Correct Comparison Evidence

- Primary requested comparison: http://127.0.0.1:5202/pre-bronze-review.html — left pre-Bronze prototype `003bef2`, right current prototype `274f737` with Bronze UI 0.2.0. Identical 1920×1080 desktop / 450×800 phone resolutions. Use actual pixels when assessing typography and control edges.
- Original image mockups: local round-five image index/render outputs; also inspect the first Moonlight Camp / Quiet Stage imagery when assessing the original immersion intent. Use actual source images; never substitute a theme showcase for the app.
- `polish-review.html?round=theme-0.2.0` compares Bronze 0.1.1 with Bronze 0.2.0. It is useful only for extraction parity, NOT the user's requested pre-Bronze baseline.
- `bronze-review.html` is the old first-integration gallery. Its after image is historical, NOT the current prototype.
- Preserve timestamps/manifests; identify source commit, theme version, viewport, device scale, state and browser for every new capture. Keep full-screen evidence alongside any useful crops. Before/after must use the same screen and resolution and be directly adjacent. Animation pose timing differences are not automatically regressions.

## Environment State and Commands

Verify services instead of assuming they are running. Current prototype: http://127.0.0.1:5202/. Standalone public theme: https://shilo.github.io/bronze-ui/ ; repository: https://github.com/Shilo/bronze-ui . Local theme dev has used 5204; built preview has used 5205 with base /bronze-ui/. Historical snapshot server 5206 was stopped after capture. Port 5203 is an older in-project theme lab, not the authoritative upstream package showcase.

Use Node 24.22.1 and npm 11.19.1. On this workstation Node is `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/.runtime.tmp/node-v24.22.1-win-x64/node.exe`; prepend its directory to PATH. Browser caches: Chromium `C:/Users/shilo/AppData/Local/ms-playwright`; WebKit `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/.runtime.tmp/playwright`. Set PLAYWRIGHT_BROWSERS_PATH appropriately. No credentials are needed.

From PixelDoll root, after checking dependency installation:

```powershell
node docs/design/2026-10-22-redesign/round-6-prototype/run.mjs
# Other terminal, against that loopback server:
node --test docs/design/2026-10-22-redesign/round-6-prototype/motion.test.mjs
node docs/design/2026-10-22-redesign/round-6-prototype/verify.mjs
node docs/design/2026-10-22-redesign/round-6-prototype/verify-theme-ownership.mjs
node docs/design/2026-10-22-redesign/round-6-prototype/verify-bronze.mjs
node docs/design/2026-10-22-redesign/round-6-prototype/verify-regressions.mjs
node docs/design/2026-10-22-redesign/round-6-prototype/verify-polish.mjs
# Repeat supported suites with BROWSER=webkit and its cache.
# POLISH_CREATOR_BOUNDARIES=1 selects the creator boundary matrix.
```

From the Bronze UI repository:

```powershell
npm run check
npm run build
npm test
# Serve the built showcase at an unused loopback port, then set BRONZE_BASE_URL.
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5205 --strictPort
# Other terminal: BRONZE_BASE_URL=http://127.0.0.1:5205/bronze-ui/
node tests/showcase.mjs
node tests/showcase.mjs --webkit
node tests/contracts.mjs --chromium
node tests/contracts.mjs --webkit
node tests/materials.mjs --chromium
node tests/materials.mjs --webkit
```

Set the browser cache separately for each engine on this workstation. Avoid rebuilding/changing source during visual captures or tests against a mutable dev server. Preserve tracked reports before scripts overwrite them; keep audit-specific evidence in a new directory. Restart the prototype after dependency upgrades and compare served CSS hashes with installed files. A changed lockfile alone is not proof of updated live styles.

## Root-Cause and Fix Ownership

Classify every finding as theme package, consumer integration/cascade, screen layout/workflow, world/sprite renderer, content/copy, documentation, or verification gap. Shared colors, materials, states, focus, boundaries, radii and generic behavior should be fixed in Bronze UI when authorized. Do not hide reusable defects with prototype overrides or edits in node_modules. Conversely, do not push PixelDoll-specific positioning, action semantics or fixture details into a generic theme.

For authorized fixes: add the smallest meaningful shared contract/regression test; verify the standalone package and representative real consumer; publish a new immutable version through the existing workflow; update the exact archive dependency and lockfile; restart and verify served bytes; rerun affected interaction/visual checks and capture matched before/after. Never rewrite prior evidence to conceal a regression. Conventional Commits, explicit scoped staging, and no unrelated reversions.

## Required Deliverables and Acceptance Criteria

1. An independent review report with a clear verdict and prioritized findings, not just an aesthetic score. Include a short per-screen and per-component-family assessment: keep, improve, replace, or insufficient evidence, with reasons.
2. A coverage matrix showing every actual screen/control/state reviewed across themes, viewport/input conditions and browsers. Mark tested, partial, missing and not applicable honestly. Separate automated, manually inspected and physical-device/assistive-tech evidence.
3. Direct full-screen before/current pairs at matched resolutions, with targeted crops where helpful. Include URLs/paths, provenance and exact reproduction steps. Show the world in motion as well as still scenes when judging gameplay/camera/reflection behavior.
4. For each finding: severity and confidence; observed versus expected behavior; affected screen/state/theme/viewport; screenshot and DOM/code evidence; user impact; root owner; smallest proposed correction; tradeoff/counterargument; and a concrete verification criterion. Cite current research when it materially supports the recommendation.
5. Separate functional/accessibility defects, demonstrable visual regressions, intentional tradeoffs, subjective refinements, scope gaps and documentation drift. Do not call all unconnected prototype actions bugs, and do not call them completed production features.
6. A concise action order: blockers first, then high-value polish, then optional experiments. Identify what should remain unchanged and why. Identify design changes that need user agreement separately from straightforward defect repairs.
7. Updated audit documentation in an appropriate new review location, with links to evidence and the two-repository ownership boundary. Final response should summarize the important findings and show representative screenshots directly; a wall of paths or test counts is insufficient.

Completion means every planned review area is assessed or explicitly marked unverified with a reason. Never conclude “no concerns” from passing snapshots or a showcase tour. Findings must be defensible, and retained design choices must be judged against the user's actual goals.

## Assumptions Made

The user is asking for a rigorous review briefing now, not an immediate reimplementation. The approved direction remains immersive Bronze with actual sprites. Generated local art and evidence are available on this workstation; verify availability before relying on them. Archived reports are historical context; current source and reproduced behavior decide present findings.

## Potential Gotchas and Open Concerns

- The prototype has real local equipment/movement behavior, but creation generation, paid enhancement, imports/exports, palette editing and account flows are intentionally unconnected. The demo characters are outfit variants of one real body, not independent generated rigs.
- The fixture has limited Walk and Cross-punch coverage, no true Idle/stored rest views, and a wizard-hat north coverage gap. Test the documented fallback behavior without assuming nonexistent art.
- Platform-native picker popups may not be captured by ordinary page screenshots. Verify them on the relevant browser/OS; computed styles alone do not prove their open rendering.
- Earlier review language incorrectly classified some shared appearance as consumer-only. The 0.2.0 ownership document supersedes that boundary. Review it critically rather than repeating the old claim.
- Observed documentation drift: the theme style guide opening still says v0.1.1 although it contains the 0.2.0 addition. Treat this as a starting audit lead and verify other stale descriptions/links, not as proof of runtime failure.
- Prior reviewer reports leave physical-device comfort, extended touch play, WebGL/GPU seams, zoom, screen-reader behavior and non-drag movement alternatives incompletely evaluated. Do not silently claim these are covered now.
- Current untracked material includes earlier handoffs, evidence, export/security/workflow research and review directories. Preserve all of it; do not stage or delete unrelated work.
- Generated screenshots are not committed under existing media policy. Preserve originals locally and commit source/reports only if the user requests or authorizes the audit deliverable commit.
