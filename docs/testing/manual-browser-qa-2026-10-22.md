# Manual Codex browser QA — 2026-10-22

Tested the current local checkout through the visible Codex in-app browser at `http://localhost:5173/`. Used the normal, keyless Vite server. No paid PixelLab generation requests were sent. Existing contributor changes were preserved; fixes were committed by explicit file paths after checking the diffs.

## Visual and functional coverage

| Viewport | Manual checks |
| --- | --- |
| 1280 × 720, 1440 × 900 desktop | Welcome, item selection and wearing, recolour, playback, directions, all-direction grid, move switching, missing-frame warnings, zoom, theme, Inspector tabs, saved outfits, random look and undo, connection handoff, export options and download |
| 900 × 600, 700 × 650, 600 × 600 desktop | Resize from wide desktop with both panels open, panel toggles, preview and toolbar bounds |
| 768 × 1024 tablet portrait | Stacked preview, moves panel, character menu |
| 375 × 812 phone portrait | Slot strip, item cards and details, recolour controls, demo copy and loading state, keyless Make → Connect → Cancel, bottom sheets |
| 320 × 568 short phone | Welcome actions, move controls, export scrolling and footer, ZIP selection and import preview, project import |
| 812 × 375 phone landscape | Preview, scrolling side column, Wardrobe/Moves tabs, toolbar stability |

Downloaded an Aseprite PixelDoll ZIP, selected it through the browser file chooser, named the imported copy “Manual QA roundtrip,” and verified that it opened with its item layers and recoloured current look. Created editable demo copies and saved a local “Manual QA look” outfit. These are local browser test records.

## Findings and fixes

1. **Desktop Inspector and scrolling panels changed width when scrollbars appeared.** The desktop Inspector tab strip measured 260 px on Item and 275 px on Moves. Stable scrollbar gutters now keep it at 260 px in both states, and prevent the same reflow in phone panels, landscape columns and sheet bodies.
2. **The phone demo-copy sheet jumped while copying.** Replacing “Copy the demo body” with the shorter “Copying…” let the action buttons fit on one row. Reserved label space now holds the button at 169.34 px wide and y=752 in both states at 375 × 812. The later transition to the editable item form is intentional.
3. **The mobile welcome import action appeared ahead of the primary creation/demo actions.** Its CSS order now keeps the primary actions first.
4. **Canceling connection discarded generation form inputs.** Item prompt, colour, name, slot and group, and character description, appearance, name, seed, size and direction choices now survive the connection handoff in memory. Manually verified item prompt/colour after Cancel and character options after browser Back; the automated regression additionally changes the item group.
5. **Canceled connection left a deferred spending callback.** Code inspection found that a later ordinary connection could execute the canceled generation. Connect teardown now clears that callback and ignores late balance completion. A synthetic-key regression verifies a later connection closes normally and sends no generation request.
6. **Resizing wide desktop to 700 px retained both panels and overlapped preview controls with the Inspector.** Medium layouts now show one side panel at a time. Inspector toggle and Ctrl+Alt+I switch away from the wardrobe; wide layouts retain both. Verified manually at 700 × 650 and 600 × 600 and with toolbar-bound assertions.
7. **Welcome’s “Try the demo” resumed the current editable character.** Returning to Welcome from a local copy and choosing the demo now explicitly opens the demo project. Verified in the Codex browser and added to the cancellation/navigation regression.

## Local screenshots

Screenshots are local, gitignored evidence under `docs/testing/img/`:

- `manual-qa-desktop-final.jpg`: desktop preview, all directions, saved outfit, Inspector.
- `manual-qa-desktop-light.jpg`: light desktop layout.
- `manual-qa-narrow-before.jpg` / `manual-qa-narrow-after.jpg`: narrow-desktop overlap and repaired layout.
- `manual-qa-item-draft.jpg`: retained item description and colour after canceled connection.
- `manual-qa-copy-loading.jpg`: stable phone loading state.
- `manual-qa-phone-welcome.jpg`: primary actions first on a short phone.

## Supporting checks

- `npm run check`: passed, zero errors or warnings.
- `npm run build`: passed, dist guard clean.
- `npm test -- --testTimeout=15000`: all 49 tests passed. The default five-second suite run timed out in the existing editable ZIP round-trip test; that run had 48 passes and one timeout. No test timeout configuration was changed.
- Playwright: existing Studio workflow passed, plus new desktop-resize and canceled-connection regressions (3 tests total). These ran against the local keyless dev server with a temporary configuration that omitted server startup, because another contributor already occupied the standard test server port. The temporary file was removed.
- Codex browser warnings/errors: none in the final inspection.

## Limits

This pass used the Codex Chromium browser and responsive viewport overrides, not physical touch devices, Safari or Firefox. Paid character, item and move generation and a real PixelLab library import were not exercised. Connection success in the regression used a synthetic key and mocked balance response. This report does not establish that all possible visual or functional bugs are absent.

## Inspector follow-up after user clarification

The first pass missed the animated item preview problem. The user clarified that the preview itself sometimes overflowed the panel and changed height continuously, shifting all controls beneath it.

Reproduced at 1366 × 768 desktop: the Red cape preview cycled through heights 60.09, 61.09, 62.09 and 63.09 px, moving the action row between y=239.28 and y=242.28. The crop and scale were recalculated from only the current frame. The unwrapped direction strip also had no provision for eight views or larger sprites.

The preview now computes one shared crop across every direction and frame of the selected clip, caches those images, and advances playback within those fixed bounds. Direction figures wrap within the available width and diagonal labels are distinct. The Codex browser measured a single 63.09 px height and action-row y=242.28 across 150 consecutive cape samples after the fix. An offline eight-direction fixture, using duplicated stored east frames for its diagonals, showed all eight previews in two rows: its scroll width and available width were both 260 px, and its height stayed at 122.19 px across 100 samples. No generation was involved.

Additional Inspector checks found that its tabs scrolled away and that a pending “Remove for good” state carried from one selected item into the next. Tabs now sit outside the scrolling content; changing the selected item or project recreates the content, resetting scroll position and item-specific action state.

Supporting verification: the focused crop unit regression passed; the Inspector animation/eight-direction browser regression passed; the existing desktop resize regression passed; production build and dist guard passed. The browser regression steps through all eight clip frames, checks that the pixels change while preview/action bounds stay constant, checks every preview is contained in the strip, and verifies fixed tabs and cleared removal confirmation. Its first run reached the import step but timed out on another contributor's newly added optional pose-setup dialog; the layout fixture now opts out of that dialog and the rerun passed.

Local evidence: `img/inspector-preview-eight-directions-after.jpg` and `img/inspector-confirmation-before.jpg`. The synthetic ZIP under `img/` is disposable layout evidence, not a generated eight-direction character.

A final whole-checkout check overlapped another contributor's unfinished `test/unit/rig-setup.test.ts`: type checking and the full unit command stopped on its line-25 parse error, while 51 runnable tests passed. That file was left untouched. The focused Inspector unit/browser tests and production build above passed; the integration coordinator will repeat whole-checkout validation after the other contributor's checkpoint.
