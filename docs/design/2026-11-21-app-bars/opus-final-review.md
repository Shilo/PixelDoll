# App bars: final adversarial review (Opus)

Scope: the uncommitted app-bars change against [plan.md](plan.md) including "As built", plus the owner's late request (Random look right of Undo/Redo). Read the full `git diff` and the new files (BackButton, CloseButton, SurfaceHeader, GlobalActions, MoreMenu, activityStatus, historyText, sheetExit). No tests, builds or servers were run. No key was connected and nothing was generated.

## How the visual pass was done

The T3 window was hidden, so `preview_resize` did not change the viewport and screenshots failed. The app refuses to run in an iframe (`main.ts` checks `window.top`). So I drove same-origin popup windows sized to exactly 1280x800, 390x844, 844x390 and 320x568 from my own tab. In each one I measured every header and footer control (position, size, visibility, disabled state), initial focus, and horizontal overflow. I checked dark and light by reading computed colors with `data-theme`. Because nothing was rendered to look at, judgments about appearance (focus rings, materials, how crowded things feel) are **not** verified; only geometry and computed styles are. Synthetic clicks do not move focus to the trigger, so focus-restore results are only trusted where the code sets focus explicitly.

Covered at all four sizes: the top bar on Characters and Customize, Export, Export > Settings (Back), Settings plus a pane (Back on compact), Activity, Connect, Share, item Details, Add slot, New character, the Discard changes confirm (Back with a typed Name), and Settings opened over New character.

Not reachable on the demo without changing the owner's data (the demo blocks deleting items and moves, has no Add move, and its slot menu has no Edit slot): Add move, Edit slot, the Delete item confirm, Frames, Import and Move review. I reviewed those in code only. Making a demo copy would have written to the shared profile, so I did not. The Discard changes confirm uses the same ConfirmDialog, and I measured it at every size.

## What holds up (verified)

- Full screen and More sit at identical coordinates on Characters, Customize and New character at every size (1168/1212 at 1280, 736/780 at 844x390, 294/338 at 390, 224/268 at 320). New character's Back lands exactly where the top bar's Characters button is.
- Undo and Redo keep their slots (`visibility: hidden` plus `disabled`). Random look, Undo, Redo and the empty stacks did not move anything. When Undo empties, focus passes to Redo. Random look sits right of Redo as the owner asked.
- Every sheet has exactly one X at the end, and no footer has a dismiss action. Back appears only in inner panes (Export settings; Settings panes on compact only; sheets over New character). Initial focus is never the X: it is the title, or the first field on fine pointers.
- Discard changes: order Keep editing, Discard (danger); Keep editing is focused, Escape keeps editing and the Name value survives. Discard closes. The `sheetExit` getter makes browser Back answer an open Discard prompt with Keep editing.
- Settings opened from New character's More shows "Back to New character", and Back restores the typed Name.
- No horizontal page overflow on any measured surface at any size.

## Findings

### 1. High: X or Escape on a sheet opened over New character silently throws away the typed draft

- Where: `app/src/studio/state.svelte.ts:317`, `Sheet.svelte` (`guarded` only checks the sheet's own `dirty`).
- Seen (1280x800, dark): I typed Name "Zed" in New character, opened More > Settings and pressed its X. There was no Discard prompt, and reopening New character showed an empty Name. The same path exists through Connect and Activity opened from the creator's More, and through Escape and backdrop clicks. Back from Settings to the creator was itself correct.
- Why it matters: New character's own X/Back asks Discard changes?, but one step away the same input is lost without asking. That is the exact unpredictability the contract is meant to remove. It is also new: before this change those sheets could not be opened over the creator.
- Fix: in `Sheet`, treat `canReturnToCreator() && formDrafts.character` holding typed text (the same `typedText !== blankText` test CreateSheet uses, moved to a shared helper) as `dirty`, so the close request asks Discard changes? first. Alternative: let the X of a sheet over the creator return to the creator. That breaks "X leaves" and makes X and Back the same, so I prefer the prompt.
- Against: "X leaves both" is written in the code as intended. It survives anyway, because the plan's rule is that leaving with typed input asks first, and here it does not.

### 2. Medium: the sheet X is 40x44 on desktop and landscape, not 44x44

- Where: `studio.css:161` `.btn.icon { width: var(--ctl-h) }` (specificity 0,2,0) beats `.surface-close { width: 44px }` (0,1,0) at `studio.css:1249`.
- Seen: Close measured 40x44 at 1280x800 and 844x390 on every sheet. Full screen and More next to it are 44x44, and the phone sizes are 44x44 only because `--ctl-h` is 44 there. The contract says 44 px.
- Fix: drop `icon` from CloseButton's class list, or raise the selector to `.btn.surface-close`.
- Against: 40 px clears WCAG 2.5.8. It survives because the plan sets 44 and the X is the one control that must look the same everywhere.

### 3. Medium: sheet titles neither truncate nor wrap safely, so a long word runs over Back and X

- Where: `studio.css:1277` `.sheet-title` has no `min-width: 0`, ellipsis or `overflow-wrap`. The old Sheet's scoped `overflow-wrap: anywhere` was deleted with its `<style>` block.
- Seen (320x568, title text replaced in the DOM to simulate a German compound): "Bildwiederholungsfrequenzeinstellungen" laid out at x -7..326, under both Back (8..52) and X (268..312), and overflowed the dialog. A two-word long title wrapped to two lines instead, growing the header from 57 to 63 and moving X down 3 px. The plan says "The title truncates; X never moves". Titles that include user names (item Details, Rename) are at risk in every locale.
- Fix: `.sheet-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`, with the full title in `title` or as already exposed through `aria-labelledby`.
- Against: I did not see a real locale string overflow, only a simulated one. It survives because the protection existed before and was removed.

### 4. Medium: New character on short screens is more cramped than before

- Where: `experience/layout.css:1450` and its media variants at `:1712` and `:1768`.
- Seen: the header plus footer take 142+60 of 390 px at 844x390 (188 px left for the form) and 190+97 of 568 px at 320x568. Before, the landscape head padding was 52 px plus the title row. Now a full 44 px bar row, a gap and the title row stack, adding about 30 px of fixed chrome where height is scarcest. The head does not scroll with the body.
- Fix: below about 541 px of height, place the title and Name in the bar row between Back and Full screen (the top bar's centered region), or let `.sheet-head`'s title row scroll with `.sheet-body` and keep only the bar row fixed.
- Against: the bar row is required so Full screen and More line up. It survives because only the bar row needs to be fixed; the title row does not.

### 5. Low-medium: the running-work dot never shows on New character's More on phones

- Where: `GlobalActions.svelte:42-55` is scoped to `:global(.phone-layout)`, but the sheet dialog sits under `div.studio-app` and outside `div.experience.phone-layout` (I walked the ancestor chain at 390x844).
- Seen: inside New character on phones, the More button can never show the activity dot. On wide screens the creator bar has no Activity slot either. So while the creator covers the bar, nothing shows other running work (moves, items, setup) or stopped work that needs attention.
- Fix: drive the dot from state rather than an ancestor class, for example `data-compact={ui.size === 'compact'}` on `.global-actions`. On wide screens, either accept the gap or render the same reserved Activity slot before GlobalActions in the creator bar.
- Against: the creator shows its own progress inline. It survives for other jobs and for stopped work.

### 6. Low: idle reserved slots squeeze the character name in phone landscape

- Where: `Toolbar.svelte:510` (`.header-activity { min-width: 64px }`), plus the Undo and Redo slots.
- Seen (844x390, idle): 152 px of invisible slots (Undo, Redo, Activity) while the name is cut to 156 px. At 1280 the hidden Activity leaves a visible 64 px hole between Export and Full screen.
- Fix: keep the no-shift rule but make Activity's reserve 44 px, with the count as a badge on the ring instead of a text cell beside it.
- Against: the owner explicitly chose no layout shift. It survives only as a size tweak that keeps that rule.

### 7. Low: Settings X is disabled while reviewing a library backup (not an atomic save)

- Where: `SettingsSheet.svelte:38` `locked={busy}`, where `busy` includes `reviewingBackup` and `resetScope`.
- Effect: during the backup restore review, X, Escape and browser Back are all dead, and the only exit is the body's Cancel. The contract allows a disabled X only during an atomic save with a "Saving..." reason. This predates the change (`cancelDisabled={busy}`), but the change now promises otherwise.
- Fix: lock only on `saving || libraryBusy`. Make X during review run the review's own leave (`leaveReview(false)`), or add `dirty` for it.
- Against: it is pre-existing. It survives as a contract mismatch to note in "As built" if it is kept.

### 8. Low: the Share popover header does not match the sheet header

- Where: `share.css:8`.
- Seen: the Share header is 49 px tall against 57 for sheets, and its X sits 5 px inside the sheet and top bar X column (333 against 338 at 390; 519 against 524 at 844). Its X is also 40 px wide at 844 and 1280 (finding 2).
- Fix: use the same `min-height: 56px` and padding, or note it in "As built" as a panel exception.
- Against: it is a popover and not full width, so an exact match is not expected. Kept as a nit.

### 9. Low: the empty Export footer note adds a blank row on phones

- Where: `ExportSheet.svelte:618` together with `dialog.sheet.bottom .sheet-foot > .foot-note { flex-basis: 100% }`.
- Seen (390x844 and 320x568): while preparing, an empty 0 px note still takes a full row plus an 8 px gap (footer 81 px). When the note text arrives, the footer grows and the primary moves.
- Fix: render the note only when it has text, or give it a fixed line height so the footer height never changes.

## Functional review notes (code)

- `sheetExit` is a single global slot. That is fine because only one Sheet is mounted at a time, and ConfirmDialogs do not claim it. Browser Back then handles inner panes, the Discard prompt, `ui.sheetBusy` and the history re-push correctly as traced (popstate, Discard, `history.back()` lands on the base entry).
- Escape and X on Connect, Activity or Export opened from Settings now close everything, while Back and browser Back return to Settings. That matches the plan ("X leaves", Back walks one pane), and I keep it. Losing the place on Escape is the expected cost.
- The native `close` handler in `Sheet` (`if (!unmounting && !locked) onclose()`) bypasses `dirty`. No sheet closes natively today (no `method="dialog"` or `closedby`), so this is safe, but it is a trap if a form ever adds one.
- MoveSheet `dirty` ignores a restored draft (`textAtStart`). That is fine because drafts only live across Connect.
- MoreMenu: one instance at a time (`Toolbar` hides its own while `ui.sheet === 'create'`), so there are no duplicate `#experience-options`. During one scripted 320x568 run the menu was missing from the DOM after Export. A fresh run at the same size did not reproduce it, and I attribute it to my overlapping popup runs, not the app. I am not reporting it.
- Recovery footers now say "Discard" (Create, Move, Setup) at the footer start. That is honest wording, but it still dismisses a failed run without a confirm, as Cancel did before.

## Verdict

The bar contract (pinned Full screen and More, slot-stable Undo/Redo/Activity, Random placement, one X, Back only in panes, ordered footers) holds at every measured size. Fix finding 1 before shipping, because it is real data loss and new with this change. Findings 2 and 3 are quick CSS fixes that the contract itself calls for. Findings 4 and 5 are worth one more pass on the New character screen. The rest are nits or contract notes.
