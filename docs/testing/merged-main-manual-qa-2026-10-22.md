# Merged main: manual Codex browser QA — 2026-10-22

Manually exercised the Studio in the visible Codex in-app browser on Windows, using real UI clicks, file choosers, downloads, resizing, scrolling, screenshots and read-only DOM measurements. This was not just a unit or scripted browser test run. The user restricted this pass to offline and free checks. No real API key was entered and no paid request was submitted.

Started on normal Vite `localhost:5173`, then used production preview `localhost:5181`. Concurrent source edits disrupted the development session, so the committed `27e78ce` snapshot was independently built and checked at `localhost:5182`. Retested after the later merged direction-grid and QA-summary commits. Final runtime source/build is main `010647b`; other contributors' remaining documentation edits were left untouched. Production assets: `index-Dc8_eSSV.js`, `index-oZx9Qn5I.css`.

## Findings fixed in this pass

| Reproduction | Result and commit |
| --- | --- |
| Set up character → edit appearance and reference → Set up without a key → Cancel Connect → reopen setup | Values previously reset. Preserve the project-scoped draft in memory. `e87ef48` |
| Add a move → choose Cast, describe a move → Add without a key → Cancel Connect → reopen | Description, authored action and item exclusions previously reset. Preserve the project-scoped draft and capture the target character. `b187ab1` |
| 1024 × 768 desktop, both sidebars open, eight directions | Move selector collapsed to a 1.84 px wrapper and overlapped direction buttons. Toolbar now uses measured stage width to choose compact controls. `4602c43` |
| Open Developer pages from a production build | Changed the URL but remained in Studio because the harness is development-only. Hide the unavailable production menu entry. `27e78ce` |
| Phone portrait, latest merged eight-direction grid, Wizard hat missing north frames | Warning covered the grid's north row. Reserve layout space for the warning, remove inherited main padding, and allow short previews to scroll safely above the controls. `010647b` |

## Manual coverage

| Area | Actions and observed result |
| --- | --- |
| Inspector animation and overflow | Selected cape, helmet, hat, sword, hair and vest while playing. Each eight-direction preview wrapped inside its panel. For each item, 100 read-only geometry samples yielded one strip/action position and no canvas overflow. Blank north hat preview matches its missing-frame warning. |
| Oversize equipment | Imported the stored S5 fixture with genuine 96 × 96 weapon layers. Walk and Slash, all four directions, desktop Inspector and phone Item sheet stayed contained. Another 100 mobile samples yielded one geometry state, no overflow. |
| Inspector navigation | Item/Colours/Moves, long scrolls, item changes, Details disclosures. Tabs remained at y=60 while content scrolled 819 px; switching item/tab returned the new heading to the top, scrollTop=0. |
| Dressing and layers | Wear/take off, same-slot replacement, None, Forward/Backward/Reset, direction-specific ordering, hide Hair, Undo/Redo, Remove → Keep. Visible stage and controls updated. |
| Colours | Per-item and global palettes, Original, custom colour input, Random and Reset; base Shirt/Shorts/Skin and multiple item materials. Checked desktop and phone. |
| Outfits | Save named look, switch to Base only, restore saved look, delete outfit and undo deletion. Reload retained saved local state. |
| Playback | Play/Pause, Space, comma/period stepping, numbered direction keys, all-direction grid and click-to-focus, Walk/Cross punch/Slash. Sparse Cross punch disabled unavailable directions and returned to south. |
| Stage controls | Zoom out/in/fit, checker/plain background, panel toggles, portrait/landscape transitions. Narrow desktop Move and Direction controls remained separately usable after the fix. |
| Character form | Description, skin, build, four/eight directions, 48/56 px, name and seed. Estimate changed from 35–50 to 57–75 gens. Keyless handoff and cancellation preserved choices. No generation submitted. |
| Item form | All eight categories and their suggestions, shield suggestion → Off hand, exact slot, name, colour hint, empty-prompt disabled state, estimates and Details. Demo gate and free editable demo copy worked. Keyless handoff retained the draft. |
| Move/setup forms | Imported an explicitly offline fixture combining stored S5 artwork with S4 keypoints to reach the full move form. Authored/described move estimates and already-added disabled choices worked. Setup rejected a standing clip missing directions. Retested both draft fixes manually. |
| Device import | Valid editable fixture and downloaded Godot ZIP, new local name, setup-next opt-out, import preview and editable result. A PNG file was rejected without replacing the current character. |
| PixelLab import | Keyless library gate, direct-link form, invalid-link error and connection cancellation. No live library/account request in this task. |
| Character management | Switch, rename, empty-name Save guard, reload persistence; Delete character warning, Cancel and Export a copy handoff. Permanent deletion was not executed manually. |
| Export | Downloaded Godot, Unity, Phaser, PNG+JSON and Aseprite ZIPs. Opened Details, toggled baked outfits, rapidly switched engines, inspected ZIP entries, and re-imported a downloaded archive with its editable layers. Phone download succeeded. |
| Welcome/theme | Welcome return, primary actions, Try the demo explicitly loaded the demo, editable copy, light/dark toggle and persistence. |
| Activity/connect | Empty keyless Activity, Details, parallel-call input, Connect handoff/cancel, empty-key disabled submission. No running paid jobs existed. |

## Resolutions visually inspected

Desktop: 1920 × 1080, 1440 × 900, 1280 × 720, 1024 × 768. Intermediate: 700 × 650, 600 × 600. Tablet portrait: 768 × 1024. Phone portrait: 390 × 844 and 320 × 568. Phone landscape: 844 × 390. Checked dark and light appearance, scrolling sheets and fixed actions. Viewport overrides reset after testing.

The latest fixed grid uses compass positions with an empty centre for eight directions. On short phone stages it scrolls; the top warning stays outside that scroll area, and the bottom views can be brought completely above the preview toolbar.

## Validation and limits

- Required Node 24.22.1 and npm 11.19.1 used for checks/builds.
- Final type check: zero errors/warnings. Production build and dist guard passed.
- Unit suite: 89 passed on the merged runtime before the final layout adjustment; the earlier isolated `27e78ce` suite passed 80 tests.
- Isolated committed-main Studio suite: 8 passed. Final Inspector/resize/draft regressions including the warning overlap: 3 passed.
- Full final browser suite: **17 passed (46.6 s)** against the final production assets and a dedicated keyless development server. Includes the new warning/grid regression and the imported-character pipeline with mocked API responses.
- Windows sandbox initially prevented test-cache renames and ZIP downloads; rerunning the local offline tests outside that sandbox resolved those infrastructure failures. The default browser-suite port was occupied by a contributor, so final tests used a temporary config with dedicated local ports instead of stopping or reusing their server.
- No console warnings/errors were captured in the final keyless production session.

This pass does **not** certify paid generation output, live authentication/account balances, real library pagination, active-job cancellation/resume, or generated-item review/acceptance. Those require live data or paid jobs. Offline form checks reached their connection boundaries only. Permanent item/character deletion was inspected and cancelled manually; disposable deletion is covered by the offline browser suite. Engine downloads were verified as archives; this was not a manual import into each external game engine. Phone checks used responsive browser viewports, not physical touch devices or Safari.

## Local evidence

Screenshots remain gitignored under `docs/testing/img/`, following the existing testing-report convention:

- `merged-main-final-desktop.jpg`, `merged-main-final-mobile.jpg`
- `merged-main-final-desktop-96px.jpg`, `merged-main-final-mobile-96px.jpg`
- `merged-main-1024-toolbar-before.jpg`, `merged-main-1024-toolbar-after.jpg`
- `merged-main-mobile-grid-warning-after.jpg`
- `merged-main-setup-draft.jpg`, `merged-main-mobile-move-draft.jpg`

Temporary ZIP fixtures, build snapshots and test configs are local-only. All source commits named above contain only this task's changes.
