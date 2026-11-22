# App chrome goals review

Reviewed `4a824e6cf` and `56fdba257` against `f68530198`, using the contract's As built and Owner revisions. The live server followed a shared checkout with concurrent fixes. Findings distinguish browser evidence from source-only inspection.

## Findings

### P2. Short landscape makes the character opener untappable

**Customize, 601 × 390, light.** After two Random looks and one Undo, the name button was only 8 × 44 px at x=68–76. The Preview tab covered it (x=61–105); hit-testing at (72, 30) returned Preview. It also happened with only Redo, while Undo's slot was reserved. `app/src/studio/experience/geometry.ts:96` switches off phone overflow above 600 px and keeps tabs inline at short heights. `app/src/studio/experience/layout.css:44` gives actions their max-content width at the expense of the start. **Fix:** Switch to compact actions or float the tabs before their widths consume the opener's minimum target. Keep Full screen and More pinned. **Against:** 844 × 390 and the requested portraits held up, and truncating a name is legitimate. Here another action receives the tap just above the compact breakpoint.

### P2. Repeating keyboard Undo activates Redo

**Customize, 1440 × 900, dark.** With one history entry, I focused Undo Random look and pressed Enter. Focus moved to Redo Random look; one more Enter redid the randomization. Pointer slots held at Undo x=936 and Redo x=888, but `app/src/studio/Toolbar.svelte:116` defeats that protection for keyboard input. **Fix:** When focused history disappears, move focus to a stable, non-activating target in the group, leaving the inverse action one intentional navigation away. **Against:** Focus on Redo is handy when correcting an overshoot. It also gives the same repeated input the opposite effect after the last Undo, the failure the slot design was meant to prevent.

### P2. Settings' X exits the creator as well as Settings

**New character → More → Settings, 844 × 390 and 390 × 844, light.** With a typed Name, browser Back returned to the creator with Name intact. Settings' X returned directly to Characters with no Discard changes alert. Reopening restored the name, so this is a silent exit, not loss of typed text. `app/src/studio/Sheet.svelte:75` supplies a creator Back but guards Close only with the current sheet's `dirty` prop; `app/src/studio/state.svelte.ts:305` clears the return context on `null` and can retire a finished attempt. **Fix:** Close back to the creator and restore its opener. If X must exit both, guard the combined exit with creator draft state and make Discard clear the draft, as As built specifies. **Against:** The draft survives and Back works. But X looks like Close Settings, not Exit the creator, and current behavior implements neither coherent option.

### P2. Browser Back skips visible popups

**New character → More, 844 × 390, light.** A real `history.back()` with a typed name and More open raised Discard changes rather than dismissing More. A second Back correctly took Keep editing. **Settings → Appearance → Language, same size, dark.** Back closed Language and stepped from Appearance to the index. `app/src/studio/Studio.svelte:223` routes history directly to `app/src/studio/sheetExit.ts:27`, whose stack has no popovers. **Fix:** Dismiss the top eligible transient surface and restore its opener; apply pane or dirty-close rules on the next Back. **Against:** Small pickers are intentionally headerless and light-dismiss. That argues for closing only the popup, not for making Android Back behind it more consequential than Escape.

### P2. Standalone alerts and PWA dialogs fall outside browser Back

**Source only.** `app/src/studio/ConfirmDialog.svelte:47` registers an alert, but `app/src/studio/Studio.svelte:196` creates the history guard only for `ui.sheet` and ignores popstate without it. A wardrobe item-menu delete alert, for example, uses local state (`app/src/studio/ItemMenu.svelte:485`). Escape takes the safe action; registering it alone cannot make Back take that action. The native install/update dialog has neither history registration nor shared backdrop dismissal (`app/src/studio/PwaRuntime.svelte:173`); idle X and Escape close, but the backdrop is ignored and Back can traverse underlying history. **Fix:** Tie the guard to the active modal stack even without `ui.sheet`. Register PWA and unify idle close requests while retaining the busy lock. **Against:** Independent PWA commit behavior and inline actions are intentional. Neither requires an idle PWA dialog or a wardrobe alert to let Back navigate behind it.

### P2. Some locked saves give no visible reason for the disabled X

**Source only, Rename and Move review.** `app/src/studio/RenameSheet.svelte:126` locks during the asynchronous save, but the disabled primary still says Save (`app/src/studio/RenameSheet.svelte:180`). `app/src/studio/MoveReviewSheet.svelte:324` locks during a decision commit while the action row only disables its normal controls (`app/src/studio/MoveReviewSheet.svelte:287`). X, Escape, backdrop and Back honor `locked`; the user is not told why none works. **Fix:** Pair the lock with a visible, announced saving status. **Against:** Local writes are often short and Adjust frame already changes its primary to Saving. The lock exists to cover the slow case, precisely when the difference between saving and hanging matters.

### P3. Export Settings loses the requested caption

**Export, ≤420 px, both themes, source verified.** The gear opener shares `.surface-back` and `.surface-back-label` with Back (`app/src/studio/SurfaceHeader.svelte:54`). `app/src/studio/studio.css:1270` clips that caption. The accessible name remains but sighted users get just a gear. **Fix:** Give the opener separate layout behavior and keep Settings visible where the slots fit. Handle exceptional translation widths deliberately instead of hiding the English label by default. **Against:** Icon-only Back is an approved compact exception. It covers a familiar repeated action, not discovery of the only route to Export settings, for which the owner explicitly requested a caption.

### P3. Phone overflow keeps the old order and reserves space unnecessarily

**Customize, 390 × 844, both themes, and 431 × 844, light.** More displayed Random look, Undo, Redo, Share, with two disabled history rows when idle. Undo and Redo stayed at y=212 and y=256 as history changed, so pointer activation did not jump to the inverse. At 431, exhausting Undo left a blank 44 px before Mount (x=151–195); the name stayed 91 px wide even though Redo was in More and could never take Undo's place. See `app/src/studio/MoreMenu.svelte:87` and `app/src/studio/experience/layout.css:270`. **Fix:** Mirror the owner's relative order in More, reserve Undo only alongside visible Redo in the same surface, and remove both rows when idle. **Against:** Stable positions and discoverability matter. Two disabled rows push Settings and Activity down, and the 431 px gap protects against an action in another surface. Preserve positions when they prevent an actual mistaken activation.

### P3. The creator's Name row and focus order disagree

**New character, 390 × 844, light.** From Name, Tab went up to Full screen; More precedes the rest of the form. Visually the first row holds Back, Full screen and More, then Name and the form. `app/src/studio/SurfaceHeader.svelte:60` leaves Name before end actions in DOM order; `app/src/studio/experience/layout.css:1499` places it below them. Back from Settings launched by the creator's More also focused Name instead of More because the creator remounts and reapplies initial focus. **Fix:** Align sequential focus with the compact row order and restore More on return from its child. Keep Name autofocus for a fresh entry with a fine pointer. **Against:** Name-first autofocus is useful and the field is only one row down. Initial focus and sequential order serve different purposes: once editing, users should not have to go back up through global actions just to reach the next field.

## Verification and verdict

- Checked geometry and DOM in a dedicated T3 preview tab at 1440 × 900, 844 × 390, 390 × 844 and 320 × 568 in the app's dark and light themes, with extra samples at 601 and 431 px. The screenshot tool stopped producing frames, so this is not a full pixel or contrast review. Browser history traversal exercised `popstate`, not a physical Android gesture. No key, paid jobs, new server, builds, checks or automated tests.
- Full screen and More stayed pinned in the target measurements. Name matched the form edges (304 px at 320 and 374 px at 390); the form cleared the floating footer once scrolled and settled. No second generic footer dismiss surfaced in the reviewed sheets: Move's successful Done completes an attempt and Activity's Cancel acts on a job.
- Export → Settings → All settings → Appearance stepped back one pane at a time; Back from Export Settings restored focus to the gear. Browser Back from Connect and Activity returned to the PixelLab settings pane, with Activity focus restored to its row. Escape in a dirty creator focused Keep editing; backdrop dismissal took that safe choice and preserved Name. Export Escape and backdrop dismissal worked. Locked paths were inspected in source, not forced live. The approved small-picker and API panel header exceptions are not defects.

**Verdict:** Shared headers and pinned actions are a clear improvement. The consistency goal is not yet met: Back can skip a layer, repeated keyboard Undo reverses direction, and the short-landscape breakpoint can make the character opener untappable.
