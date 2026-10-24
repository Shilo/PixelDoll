# Independent audit: immersive PixelDoll prototype and Bronze UI 0.2.0

2026-10-23. Reviewer: Claude (Opus 5.5), with three read-only helper agents for Studio inventory, package integrity and primary-source research. Review only: no prototype, theme, dependency or production code was changed.

Scope: the isolated prototype at `docs/design/2026-10-22-redesign/round-6-prototype/` (PixelDoll `codex/ui-ux-redesign` at `a0c9990`), Bronze UI `main` at `d811d35` (published 0.2.0, installed archive verified byte-identical to that commit), and the production Studio (`app/src/studio/`) as the workflow reference. Commit `628b6e8` (repository housekeeping) landed during the audit. It changes no prototype or theme source. The rerun of `verify-bronze.mjs` rewrote the timestamp in the tracked `bronze-verification.json`; the rerun copy is in `evidence/suites/` and the committed file was restored. Coverage, states and untested areas are listed in [coverage-matrix.md](coverage-matrix.md).

## Verdict

The visual direction holds up. On desktop and tablet, selection and Preview look like a calm, game-like stage: the real sprite is the focal point, the bronze accents are restrained, both appearances are designed rather than inverted, and light/dark contrast over the actual scene mostly measures well above 4.5:1. The prototype also matches the approved round-five mockups closely, and continuous movement, camera follow, equipment changes while moving and hat hide/restore all work.

**It is not ready to be called professional or accessible yet.** Four blockers are invisible in screenshots and are not caught by any of the existing suites, all of which pass:

1. **Keyboard users cannot operate the studio.** From the world, Tab cycles Preview → Top-down → Side-scroller forever and never reaches a control (F1).
2. **Enter on the selection screen always opens the studio for the *already selected* character**, whatever is focused: New character, More options, or a different character row (F2).
3. **Every activation drops focus to `<body>`** because the whole UI is re-rendered through `innerHTML`. Popovers never receive focus (F3).
4. **On small and short screens the character is painted underneath the UI**: invisible behind the view tabs and playback at 320×500; overlapped by the prompt line in short landscape and at 200% zoom (F4).

Bronze UI 0.2.0 is a clean, honest artifact with good token contrast and forced-color behavior. As a reusable contract it still has an unthemed native picker icon, a select border below its own boundary rule, a busy Dialog that closes on the third Escape press, host-reset fragility, documentation drift, and a showcase that does not show the controls the product actually uses (F10, F12–F15).

## Representative evidence

| What | Image |
| --- | --- |
| 320×500 Preview: the actor is painted behind the view tabs and playback | [obsidian-320x500-preview](evidence/matrix-chromium/obsidian-320x500-preview.png) |
| Phone and landscape Preview, 320/390/450 wide and 568×320/844×390 | [sheet-phone-preview](evidence/sheet-phone-preview.png), [sheet-landscape-preview](evidence/sheet-landscape-preview.png) |
| Small-screen selection: Mira overlaps Import at 320×500; heading overlaps actors at 568×320 | [sheet-phone-selection](evidence/sheet-phone-selection.png) |
| Playback bar, pre-Bronze `003bef2` (top) vs current `274f737` (bottom), 1920×1080 actual pixels | [playback-before-after](evidence/crops/playback-before-after.png) |
| Top-down in motion: a "showing a still pose" toast stays up while the character walks | [motion-topdown-sequence](evidence/motion-topdown-sequence.png) |
| Side-scroller moving west; Wizard hat hidden on north walk with a notice | [motion-side-and-hat](evidence/motion-side-and-hat.png) |
| Round-five mockup (top) vs current (bottom), same screen and resolution | [Preview](evidence/mockup-vs-current-obsidian-preview.png), [Porcelain Top-down](evidence/mockup-vs-current-porcelain-topdown.png) |
| 200% zoom (683×384 CSS) and forced colors | [zoom200-sheet](evidence/zoom200-sheet.png), [forced-preview](evidence/forced-preview-small.png) |
| Wrong-theme first paint with light mode stored | [theme-first-paint](evidence/gameplay/theme-first-paint-light-stored.png) |
| Bronze showcase, all tabs × appearances × 1440/390 | [evidence/showcase/](evidence/showcase/) |

Matched before/current pairs for all 68 states remain in the existing gallery (`http://127.0.0.1:5202/pre-bronze-review.html`, provenance in [pre-bronze-comparison.md](../../design/2026-10-22-redesign/round-6-prototype/pre-bronze-comparison.md)). That baseline was reused as-is, not recaptured. New captures live under [evidence/](evidence/); see "Reproduce".

## Findings

Severity: **Blocker** (prevents a core task or fails WCAG A/AA on a primary path), **High**, **Medium**, **Low**. Confidence reflects how directly it was reproduced. Owners: *theme* (Bronze UI), *consumer* (adapter/cascade), *screen* (layout/workflow), *renderer* (world/sprites), *content*, *docs*, *verification*.

### A. Functional and accessibility defects

**F1 — Studio Tab key switches views and traps keyboard users.** Blocker · confirmed · screen.
- Observed: in the studio, Tab with focus on `<body>`, the world, or a view tab calls `changeView` and `preventDefault` (`main.js` keydown handler, `k === 'tab'` branch). Because every re-render leaves focus on `<body>` (F3), the probe's six Tab presses cycled topdown → side → preview → … with focus never leaving `BODY` ([keyboard-probe-chromium.json](evidence/keyboard-probe-chromium.json), case D).
- Expected: Tab moves focus (WCAG 2.1.1 Keyboard, Level A; APG keyboard practice: Tab moves between components, shortcuts must not replace navigation).
- Impact: keyboard-only and switch users cannot reach equipment, the menu, Light/Dark mode or Back except through the Escape shortcut.
- Fix: delete the Tab binding. The view tabs are already buttons. If a view shortcut is still wanted, use keys that are not navigation keys (for example `1`/`2`/`3` while the world has focus), shown in the Help text.
- Counterargument: game UIs often bind Tab. Here Tab is the only way to reach the HTML controls, so the conflict is direct.
- Verify: on Studio load, the first Tab focuses Back; continued Tab reaches every visible control without changing `state.view`.

**F2 — Enter on the selection screen is hijacked.** Blocker · confirmed · screen.
- Observed: the window keydown handler maps Enter to `customize` and arrows/WASD to previous/next on the selection screen whenever the target is not an editable field. In the probe:
  - Enter on **New character** opened the studio for Adventurer.
  - Enter on the **Mira** row opened Adventurer, not Mira.
  - Enter on **More options** opened the studio.
  - Space works because it is not intercepted (cases B, C, C2, C3).
- Impact: keyboard users land on the wrong character or screen. This also contradicts the approved "select, then open the selected row" rule.
- Fix: only treat Enter/arrows as stage shortcuts when focus is on `<body>` or the world canvas, never on a button, link or input.
- Verify: Enter on each header control performs that control's action; Enter on an unselected row selects it; Enter again opens it.

**F3 — Focus is lost after every action, and popovers and dialogs don't manage focus.** Blocker (with F1) · confirmed · screen.
- Observed: `render()` replaces `#ui.innerHTML` on every action, so focus falls to `<body>` after Space on a category, a facing button, a tab, and so on (case E).
- Observed: the More, character, prompt and Additional-equipment popovers are appended at the end of the DOM, and focus is not moved into them (case F).
- Observed: closing the About dialog returns focus to `<body>`, because its opener lived inside the now-closed menu (case H).
- Only the clip select and dialog openers that still exist restore focus.
- Fix (smallest): after `render()`, refocus the element with the same `data-action` if one existed before. On opening a popover, focus its first item; on Escape or outside click, return focus to the trigger. When a dialog's opener no longer exists, return focus to the More trigger.
- Verify: Space on Hair leaves focus on Hair. Opening More moves focus to Light mode. Escape returns focus to More.

**F4 — The character is painted under the UI on small and short screens.** Blocker for phones/landscape · confirmed · renderer + screen.
- Observed:
  - **320×500:** the actor's feet sit behind the view tabs and the two-row playback. The sprite is effectively invisible ([image](evidence/matrix-chromium/obsidian-320x500-preview.png)).
  - **568×320 and 844×390:** the prompt line text runs across the actor's head.
  - **200% zoom (683×384):** playback wraps to two rows and covers the stage.
  - **Selection at 320×500:** Mira's sprite overlaps the Import button.
  - **Selection at 568×320:** the side actors overlap "Characters / 3 demo outfits".

  The metrics are in [metrics.json](evidence/matrix-chromium/metrics.json) (`overlapActor`).
- Cause: `World.layout()` picks the feet position and scale from fixed fractions of `innerHeight` (`y = h * .52`, `.575`, `.65` …). `stage-layout.mjs` measures only the horizontal rail. The vertical free space between the identity/tabs and the bottom sheet/playback is never measured.
- Fix: extend `measureStage` to record the top and bottom of the free stage (bottom of identity/view tabs, top of playback/bottom sheet), and derive `y` and `scale` from that rectangle.
- Counterargument: 320×500 is an extreme case. However, 568×320 and 200% zoom are ordinary (phone landscape, low-vision zoom), and WCAG 1.4.4 has no game exemption for the UI text.
- Verify: the actor's painted rectangle intersects no visible control across the matrix in [coverage-matrix.md](coverage-matrix.md).

**F5 — Drag is the only touch input for movement.** High · confirmed by code · screen · **needs user agreement**.
- Observed: touch movement exists only as the dynamic drag joystick. WCAG 2.5.7 (Dragging Movements, AA) requires a single-pointer alternative, and keyboard alternatives "do not automatically meet" it (Understanding doc, updated 10 Aug 2026). XAG 107 (updated 17 Jun 2026) recommends click-to-move for hold-and-drag movement.
- Smallest fix within the "no extra panels" direction: **tap-to-move** (tap a floor point to walk there). It adds no visible UI.
- Counterargument: the "essential" exception might be argued for a game, but the function is movement, not dragging.
- Verify: on a touch-emulated phone, a single tap on the floor moves the actor to that point and stops there.

**F6 — Movement keys are global.** Medium · confirmed · screen · needs agreement.
- Observed: WASD/arrows are handled on `window` for every non-editable target. WCAG 2.1.4 (Character Key Shortcuts, A) is satisfied only when the shortcut is active just while its component has focus, or can be turned off or remapped.
- Fix: make the world canvas focusable (`tabindex=0`, labeled) and scope movement to it; or add an off switch in Help. Keep Preview's arrow facing on the playback group.
- Verify: with focus on a header button, `d` does nothing; with focus on the world, `d` moves the actor.

**F7 — No Undo on phones.** Medium · confirmed · screen.
- Observed: `.top-actions .desktop-only { display:none }` under 760px hides the only Undo (`styles.css:632`). A mistaken equipment change on a phone cannot be reverted except by re-selecting the item.
- Fix: keep Undo as an icon button in the phone header (it already fits beside Export and More).

**F8 — Notices describe states that are no longer true.** Medium · confirmed · screen/content.
- Observed:
  - "Idle missing — showing a still pose" appears on the first entry to Top-down or Side-scroller for each character, before any input, and stays visible for 4.8 s while the character walks ([image](evidence/motion-topdown-sequence.png)).
  - The Side-scroller hint says "WASD / arrow keys to move", but only A/D/←/→ do anything there.
- Fix: clear the idle notice as soon as movement resumes, as the equipment notice already does. Consider not toasting a fixture-wide absence that the Moves panel already states. Word the Side hint as "A/D or ←/→ to move".
- Verify: walking within 1 s of entering removes any idle notice. A rig with no Idle shows the notice at most once per session, after the first stop.

**F9 — Pixel art is uneven at 125% Windows scaling.** Medium · confirmed by pixel analysis · renderer.
- Observed: the scale is an integer in CSS pixels, not device pixels. At DPR 1.25, one art pixel is 7.5 device pixels, and the measured sprite columns alternate 7 and 8 px wide. At DPR 1.5 the sprite origin falls on half device pixels (x = 481.5) ([gameplay-probe.json](evidence/gameplay-probe.json), `actor-dpr-*.png`).
- Why it matters: 125% and 150% are common Windows laptop defaults, and the sprite is the product.
- Fix: choose `scale` so that `scale × devicePixelRatio` is an integer (in device pixels) and snap draw positions to `1/dpr`.
- Verify: horizontal run-length analysis of a flat color row shows a single width at DPR 1, 1.25, 1.5 and 2.

**F10 — Native select: unthemed picker icon, weak boundary, regressed playback select.** Medium · confirmed · theme + consumer.
- Observed:
  - Bronze opts selects into `appearance: base-select` but leaves `::picker-icon` at the user-agent `disclosure-open` triangle (computed in the live page). That renders a heavy ▼ unlike the Lucide chevrons elsewhere.
  - `select.bu-select` uses `--bu-rim`, measured at 2.30:1 (dark) and 1.74:1 (light) against the field. That contradicts STYLE-GUIDE's own field-boundary rule; `.bu-input` uses `--bu-border` at 5.45:1 and 3.74:1.
  - In the playback bar, the pre-Bronze inline "Walk ⌄" became a boxed, smaller-text select inside a boxed toolbar ([before/after crop](evidence/crops/playback-before-after.png)). That is a demonstrable regression against both the pre-Bronze prototype and the round-five mockup.
- Fix:
  - *Theme:* style `::picker-icon` with a chevron mask using `currentColor`, and use `--bu-border` for standalone selects.
  - *Consumer:* use a quiet/inline select variant inside the playback toolbar. If the package lacks one, it belongs upstream as a recipe.
- Verify: an open-and-closed picker screenshot in Chromium, with the WebKit fallback checked separately; boundary contrast ≥3:1.

**F11 — Light-mode users see a dark first paint.** Low–Medium · confirmed · consumer.
- Observed: `index.html` hard-codes `data-theme="dark"`, and the stored preference is applied only after the module graph loads ([image](evidence/gameplay/theme-first-paint-light-stored.png)).
- Fix: a two-line inline head script that reads `bronze-prototype-theme` before the stylesheets apply.

**F12 — Bronze `Dialog` busy guard fails on repeated Escape.** High for production · confirmed in Chromium and WebKit (helper agent) · theme.
- Observed: `Dialog.svelte:18` blocks Escape only through `cancel` `preventDefault`. Browsers stop honoring that after repeated presses without user activation, and the third Escape closed a busy dialog. `tests/showcase.mjs:105` presses Escape once.
- Impact: a paid generation or export dialog can be dismissed mid-operation.
- Fix: add a keydown Escape `preventDefault` while `busy`, and test four presses.

**F13 — Bronze consumer independence.** Medium · confirmed by a hostile-host fixture (helper agent) · theme.
- `:where()` zero-specificity nets lose to ordinary host resets. With `* {box-sizing:content-box}`, `.bu-input` overflowed a 360px container by 26px. `button {all:revert}` dropped the font.
- Without `base.css`, `.bu-badge` and `.bu-steps` icons render at 24px, and Field's error paragraph inherits a 28px margin.
- `tokens.css` sets document-wide `color-scheme` and scrollbars, including a `::-webkit-scrollbar` fallback. That forces classic scrollbars in WebKit, contradicting the style guide's transparent-track intent.
- Fix: declare `box-sizing` inside the recipes that own padding and width; extend the icon sizing selector; scope or remove the WebKit scrollbar fallback; document layer import (`@import … layer(bronze)`).

### B. Demonstrable visual regressions and composition

- **Playback bar** (F10): heavier and less legible than both the pre-Bronze prototype and the mockup.
- **Palette label lost its meaning.** The mockup's "Metal" (the ramp of the selected item) became the generic "Palette". The swatches look selectable, show a selected ring, and then open a "not connected" dialog. Either label them by ramp and show them as unavailable, or remove them until recoloring is connected. Owner: content/screen. Low.
- **Reflection in Top-down.** A flipped reflection under an overhead-camera actor reads as a rendering error; the mockup had none. `REFLECTION.topdown = false` is a one-line code change and keeps the approved code-only control. Owner: renderer. Low, **subjective**.
- **Selection perspective.** The background's vanishing point and central floor seam are centered on the window, but actors are centered on the free stage (correctly, per the approved rule). In Porcelain a bright vertical seam therefore runs beside the hero rather than under it ([image](evidence/matrix-chromium/porcelain-1366x768-selection.png)). Owner: renderer (horizontally offset the backdrop by the stage center). Low, **subjective**.

### C. Information architecture and content (needs user agreement)

- **F16 Customization tabs.**
  - *Colors* is an empty explanation, while the palette sits under *Wardrobe*.
  - *Outfits* lists "Adventurer / Mira / Rowan", so a character's name is applied as an outfit to a different character.
  - *Moves* duplicates the playback clip select and holds developer notes ("Walk: four directions…" in 12–13px).

  Recommendation, keeping the approved order Wardrobe · Colors · Outfits · Moves: put the item's ramp under Colors; name demo outfits by look ("Knight", "Wizard", "Plain"); make Moves the add/inspect-moves surface that production needs. Medium.
- **F17 Redundant or empty actions.** The creator header has both "← Characters" and "Cancel" with the same effect. The "PixelDoll" header button on the selection screen does nothing. Low.
- **F18 Navigation surprises.** Escape inside the creator's Name field leaves the creator (probe case G), and Backspace on any focused studio button leaves the studio (case K). The draft survives in memory but not a reload. Recommendation: Escape in an editable field should blur or do nothing; keep Backspace-back only when focus is on `<body>` or the world. Medium.
- **F22 Typography identity.** `--bu-font: 'Segoe UI', system-ui` and `--bu-display: Georgia` resolve to different families on macOS, iOS and Android, so the product's identity depends on the OS. Georgia headings read more editorial-blog than game. A bundled display face (or a deliberate system-only decision) should be chosen explicitly. Owner: theme. **Subjective; needs agreement.**
- **Showcase spelling.** The Bronze showcase uses "colour" ("Equipment & colour", "Reset colours"), while the approved product copy is "Colors". Low.

### D. Scope gaps (not bugs; do not count as production features)

From the Studio inventory ([coverage-matrix.md](coverage-matrix.md) §3):
- The prototype represents selection, equipping, playback, undo and a visual creator draft.
- It does not represent connect/token, rig setup and repair, add moves, item generation, quality review (keep/retry/discard), item details, recolor editing, shared designs, import, export, activity/queue, or API inspection.
- The creator does not validate. You can deselect every direction, mirror an unselected direction or both sides of a pair, and type a body size of 7 px.
- Its Auto frame behavior (readonly field) differs from production (typing switches to manual) and from the showcase (checkbox, disabled field).

Bronze lacks a sheet shell matching `Sheet.svelte`, a segmented control, a selected-vs-worn split for rows and tiles, job/queue states, a menu (`menuitemradio`) recipe, notice actions, and pill/count badges. ChoiceGroup has no icons, disabled options or counts. Help has no text trigger or `show()`. These must be closed before claiming Bronze can serve the Studio.

### E. Documentation drift and maintainability

- **F15 Bronze docs.**
  - `STYLE-GUIDE.md` still opens with "v0.1.1".
  - `docs/COVERAGE.md` is the historical PixelDoll lab review, yet the README links it as the package's coverage.
  - 23 shipped classes are undocumented (dialog, notice, choice group, popover, floating, progress, file, error, and more), as is `--bu-tab-stroke`.
  - `.bu-popover` silently needs `.bu-floating`.
  - There is no recorded 0.2.0 artifact hash.
  - The CHANGELOG omits the new material tokens.
  - The local `.evidence` tarball differs from the released one only by CRLF line endings.

  Low–Medium.
- **F14 Showcase is not a faithful specimen.**
  - The showcase creator uses "Cardinal 4 / All 8 / Side 2" presets, mirrors on the right of every direction, and an "Automatic frame padding" checkbox. The prototype uses "Top-down 8 / Top-down 4 / Diagonal 4 / Side-scroller 2 / Unique 8", outer-edge mirrors and an Auto toggle with a readonly field.
  - Its equipment tiles are styled locally (`showcase.css:52-54`) rather than through `.bu-action[data-variant=tile]`, so the scene specimen shows borderless tiles the product does not use.
  - Its main page imports `base.css`, masking the F13 defects.

  Medium; owner theme.
- **F25 Prototype CSS and render architecture.**
  - `styles.css` is 1,448 lines with 11 media blocks: `(max-height:540px) and (orientation:landscape)` appears three times and `(max-width:760px) and (orientation:portrait)` twice.
  - It has 13 `!important` declarations (for example `.character-row`, `styles.css:1037-1041`), plus inline `style=` attributes in `equipment.js` and `creator.js`.
  - The whole-UI `innerHTML` re-render is the root of F3.
  - Before production migration, consolidate each breakpoint into one block and give components stable DOM (or move to the Svelte components the Studio already uses).

  Medium.
- **Bronze magic numbers.** `components.css` inlines `color-mix` percentages that bypass the token layer and its reduced-transparency fallbacks. Several public tokens (`--bu-gesture-*`, `--bu-diagram`, `--bu-sheet`, `--bu-reading-*`) exist for one consumer only and are untested. Low.

### F. Verification gaps

- **F26.** All existing suites passed during this audit: 12 motion unit tests; `verify`, `verify-theme-ownership`, `verify-bronze`, `verify-regressions` and `verify-polish` in Chromium; `verify-regressions` and `verify-polish` in WebKit ([logs](evidence/suites/)). The keyboard probe reproduces F1, F2, F3 and F18 identically in WebKit ([keyboard-probe-webkit.json](evidence/keyboard-probe-webkit.json)). There, closing a dialog leaves focus on its Close button inside the closed dialog. None of the existing suites:
  - presses Tab from the world;
  - presses Enter on a focused selection control;
  - checks focus after an activation;
  - asserts actor/control overlap at 320×500, 568×320 or 200% zoom.

  The dialog check accepts focus on `<body>` as a pass (`verify-bronze.mjs:93`). Add the probe cases from [scripts/keyboard-probe.mjs](scripts/keyboard-probe.mjs) and the `overlapActor` metric from [scripts/matrix.mjs](scripts/matrix.mjs) as assertions.
- **The ownership guard is a regex tripwire.** It passed while the select `::picker-icon` and select boundary (F10) remain unowned. Treat it as a guard, not proof.

### Measured contrast (rendered scene, text hidden then sampled)

[contrast-chromium.json](evidence/contrast-chromium.json) covers both appearances × 1366×768 and 390×844 × selection, Preview, Top-down and creator.

- **Dark:** every sampled label is at least 5.1:1 at its worst pixel.
- **Light:**
  - Muted 14–15px labels sit at the floor: character-row "Demo outfit" 4.48:1 at the worst pixel (4.57:1 at the 10th percentile).
  - Over Top-down grid seams: category labels 4.11:1 and eyebrow 4.15:1 worst-pixel (≥5.27:1 at p10).
- **Small text on phones:** footnote 10px, toast 11px, stage navigation 12px, eyebrow 12.5px.

These pass at typical pixels but leave no margin. Raise light `--bu-muted` slightly, or give those labels local backing (owner: theme), and set a 12px floor on phones (owner: screen). Low.

### Target sizes (measured)

- **Phone palette chips:** 19×19 with a 9px gap. They pass WCAG 2.5.8 through the spacing exception (28px center distance), but are far from a comfortable 44px touch target; they are also non-functional.
- **Phone sheet handle:** measures 12px tall across the full width. It is the only expand control, so it does not qualify for the "equivalent" exception; give it a 24px+ hit area.
- **Other controls:** every other visible control met 24×24 at all sizes.

## Keep (and why)

- **Composition** on desktop and tablet: the selection and Preview stage with the actor in the measured free stage (verified across 1024–2560 widths). It is the approved Moonlight Camp / Quiet Stage direction and it works.
- **Sprite rendering:** real, unshaded sprites with nearest-neighbor rendering; theme-independent pixels (existing RGB test, rechecked visually in both appearances and forced colors). Reflection as a separate layer with code-only control.
- **Movement:** continuous movement, a normalized diagonal (0.707, 0.707), smooth camera follow, Side-scroller ignoring W/S, joystick release outside the world stopping movement, and drags starting on UI not moving the actor ([gameplay-probe.json](evidence/gameplay-probe.json)).
- **Equipment coverage:** equipment hides on missing north frames and restores on south.
- **Selected markers:** the selected tile carries a check mark, a non-color cue that survives forced colors.
- **Theme switching:** one Light mode / Dark mode action naming the destination; native `<dialog>`; status toasts use `role="status"`.
- **Bronze UI:** the exact published artifact; strong token contrast (text 13.6/13.8:1, accent 6.9/6.3:1); forced-color mapping; `@supports`-gated base-select and backdrop fallbacks; native controls rather than JS replacements.
- **Hierarchy:** the two-level hierarchy of identity (left) and wardrobe (right) on desktop; equipment remains reachable across views.

## Action order

**Blockers (straightforward repairs, no design decision needed):**
1. F1: remove the Tab view shortcut.
2. F2: scope selection Enter/arrows to body/world focus.
3. F3: restore focus after render; manage popover focus.
4. F4: measure the vertical free stage and drive actor placement from it.
5. Add the F26 assertions so they stay fixed.

**High-value polish:**
6. F10: themed picker icon and select boundary upstream, then an inline playback select.
7. F12: busy Escape guard upstream.
8. F9: device-pixel-integer sprite scale.
9. F8: notice lifecycle and Side hint copy.
10. F7: phone Undo.
11. F11: theme first paint.
12. F13: Bronze host independence.
13. F15/F14: docs and showcase fidelity.

**Design changes needing your agreement:**
- F5: tap-to-move.
- F6: world-focused movement keys.
- F16: tab contents.
- F18: Escape/Backspace policy.
- F22: typography.
- Top-down reflection off.
- Selection backdrop offset.

**Optional experiments:** none of the above require new UI chrome. Physical-device touch comfort and screen-reader passes are the next evidence to gather, not new features.

## Ownership boundary

Fix shared appearance and behavior in Bronze UI, release a new immutable version, then bump the pinned archive and lockfile here: F10 (icon/border), F12, F13, F14, F15, a quiet select variant, light `--bu-muted` margin, and any segmented/worn-state recipe. Fix layout, workflow, input, renderer and copy in the prototype: F1–F9, F11, F16–F18, the playback select placement, reflection config. Neither repo should copy the other's fixes.

## Sources (accessed 2026-10-23)

- W3C Understanding WCAG 2.2:
  - [2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
  - [2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html), updated 23 Feb 2026
  - [2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), updated 10 Aug 2026
  - [2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), updated 11 May 2026
  - [1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), updated 6 Sep 2026
  - [1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
  - [4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
  - Normative.
- WAI-ARIA APG: [keyboard interface practice](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/), [dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/). Guidance.
- [Xbox Accessibility Guidelines 107 Input and 102 Contrast](https://learn.microsoft.com/gaming/accessibility/xbox-accessibility-guidelines/107), updated 17 Jun 2026. Guidance.
- [Apple HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials): Liquid Glass for the control layer, not content; use sparingly. Guidance and aesthetic.
- MDN: [customizable select](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select), [`::picker-icon`](https://developer.mozilla.org/en-US/docs/Web/CSS/::picker-icon), [`devicePixelRatio`](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio), [`<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog).

Browser-support dates for newer features came from the research helper's reading of MDN browser-compat-data and were not independently re-verified here.

## Reproduce

Requirements:
- Node 24.22.1 on PATH.
- `PLAYWRIGHT_BROWSERS_PATH` set per engine (see the handoff).
- The prototype served by `node docs/design/2026-10-22-redesign/round-6-prototype/run.mjs` on 127.0.0.1:5202.
- The Bronze showcase preview on 127.0.0.1:5205.

No credentials or paid calls are involved. From the repository root:

```bash
node docs/reviews/2026-10-23-claude-redesign-audit/scripts/keyboard-probe.mjs
```

The other scripts in `scripts/` run the same way:

| Script | What it does |
| --- | --- |
| `matrix.mjs` | 2 themes × 12 viewports × 5 screens, with layout metrics; `BROWSER=webkit` and `SIZES=` supported |
| `contrast.mjs` | Rendered-scene text contrast |
| `gameplay-probe.mjs` | Motion, joystick, DPR pixel integrity, first paint, reduced motion |
| `modes-probe.mjs` | Forced colors, `prefers-contrast`, 200% zoom |
| `showcase-capture.mjs` | Bronze showcase tabs |

All captures were taken with Playwright Chromium 156.0.8078.4 headless at device scale 1 (except the DPR cases), from source `a0c9990` / Bronze `d811d35`, on 2026-10-23. Screenshots and raw probe outputs stay local under `evidence/`, which is git-ignored by this folder's `.gitignore` under the repository's generated-media policy. In a fresh checkout, the `evidence/` links resolve only after rerunning the scripts above.
