# App bars review (adversarial)

Snapshot: 2026-11-21 19:36 local, uncommitted tree based on f68530198. Files were still changing during the review (Sheet.svelte, FramesSheet.svelte, CreateSheet.svelte, plan.md all changed between passes). Every finding below was re-read against the tree at that timestamp; re-check line numbers before editing. Nothing was run, built, served, or edited except this file.

Contract: [plan.md](plan.md), approved version, including the owner's move of Random look to the right of Undo and Redo.

## Findings that survive

### 1. Frames footer still carries the two artifact actions (high)

- Where: `app/src/studio/FramesSheet.svelte:427` footer, `:441-453` Restore, `:455-463` Download.
- Contract: plan line 50: "footer: note, secondary, Replace frames; Download and Restore sit in the body"; rule 21 repeats it.
- Why: the picker footer is Restore + Download + Import files, so Import (the commit) competes with two artifact actions, and the prepared review footer has no note or secondary at all. The shape of the footer changes by state even though the surface's commit does not.
- Fix: move Restore and Download into the `.frames` body next to the grid; keep one footer shape: note + Replace frames (prepared) or note + Import files (picker), primary last.
- Counterargument: keeping Restore and Download in the footer makes them reachable without scrolling, and their order is technically valid (two secondaries, primary last). Rejected: the plan names these two by name as body actions, and the current prepared footer drops the note and secondary the plan requires.

### 2. Add move still renders a footer while it runs (high)

- Where: `app/src/studio/MoveSheet.svelte:1373-1377`, footer wiring `:1457`.
- Contract: rule 18 ("running-only states have none"), rule 21, plan line 48 ("Running: no footer, progress plus 'Keeps running in Activity' and Queue another in the body").
- Why: the running branch is a footer with a note and a non-primary Queue another button. It is the only footer in the app with no commit and no primary, so the bottom bar stops meaning "this surface commits something". The keeps-running sentence and the next action are also separated from the progress they describe.
- Fix: return `footer={undefined}` while `progress && !moving.done`, and render the keeps-running note plus Queue another in the body beside the progress.
- Counterargument: the note is status and Queue another is a convenience, so the footer is harmless. Rejected: the rule exists to keep footer semantics stable, and this is the one branch that breaks it.

### 3. Create still renders a footer while it runs (medium)

- Where: `app/src/studio/CreateSheet.svelte:425-428`, footer `:373`.
- Contract: rule 18; rule 14 wants the running message in the body, tied to the exit.
- Why: a running-only state renders a footer whose only child is a note. It looks like an action bar with nothing to press, and it keeps the running message away from the progress it explains.
- Fix: move the estimated + keeps-running note into the body above the progress; render no footer while `running`.
- Counterargument: the note is useful pinned above the safe area. Rejected: pinned status is what the body and the Activity entry are for, and rule 18 is explicit.

### 4. "Keeps running in Activity" is never tied to the exit (medium)

- Where: `app/src/studio/CloseButton.svelte:13-21`, `app/src/studio/SurfaceHeader.svelte:44-50`, `app/src/studio/MoveSheet.svelte:1374`, `app/src/studio/CreateSheet.svelte:426-427`, `app/src/studio/SetupSheet.svelte:234`.
- Contract: rule 14: "X closes and the body says 'Keeps running in Activity' (linked to X with `aria-describedby`)".
- Why: neither CloseButton nor SurfaceHeader accepts a description id, and no caller wires one. Move and Create put the sentence in the footer; Setup's running text is `setup.keepWorking`, which does not mention Activity. A screen reader landing on the X hears only "Close".
- Fix: add an optional `describedby` to CloseButton/SurfaceHeader and render an id'd note in the body of every running state (Create, Move, Setup, Activity waiting), worded with the Activity destination.
- Counterargument: the note is still in the accessibility tree and the label "Close" is truthful. Rejected: the contract asks for the relationship specifically, and on Move/Create the note is in a different landmark from the X.

### 5. Reference picker still has no title and no X (medium)

- Where: `app/src/studio/ReferenceField.svelte:228-252` (the popover surface), snippet supplied at `app/src/studio/MoveSheet.svelte:1260-1302`.
- Contract: plan line 57 ("API calls panel, Reference picker: Title plus X"), line 65 lists SurfaceHeader as its header.
- Why: this is the only `role="dialog"` popover besides Share without a header and a visible way out. It closes only on Escape, outside press, or choosing an option, which is the menu rule, not the panel rule.
- Fix: render SurfaceHeader in the popover surface with the field label as title and `onclose` hiding the popover, then the picker rows below. SurfaceHeader already exists; no new component is needed.
- Counterargument: the picker has two or three rows, and a title plus X is heavier than the content. Rejected: the plan names it, and a dialog without a visible dismiss is the inconsistency the owner asked to remove.

### 6. PWA dialog got the shared header but not the shared footer (medium)

- Where: `app/src/studio/PwaRuntime.svelte:183-255`.
- Contract: plan line 58 ("Same header and footer").
- Why: Install, Open updated app, and Update now are body buttons, so this surface keeps the pre-contract layout for its commit while every sheet now commits in a footer. The dialog also disables its X while busy with no described reason, which rule 13 limits to an atomic save with a visible "Saving..." reason.
- Fix: add the shared footer (note plus the mode's primary last, 44 px targets) and keep the recovery link and mode copy in the body; add a description for the disabled X while updating.
- Counterargument: the dialog's action changes by mode and a body button is clearer next to its explanation. Rejected: the plan explicitly promises the same footer, and the same objection would apply to Connect, which does use a footer.

### 7. Slots add has its commit in the body and no footer (medium)

- Where: `app/src/studio/SlotsSheet.svelte:387-433` (Create slot at `:427-432`).
- Contract: plan line 54 groups "Slots add" with the footer surfaces: "X; footer: note, optional secondary, named primary".
- Why: the primary sits mid-body, ahead of the built-in slot list, so the last thing in the sheet is a list, not the action. Slots edit (`:266-277`) uses a footer, so the two slot surfaces disagree about where their commit lives.
- Fix: add a footer with a note and the Create slot primary (Show slot when unhiding), primary last; keep the built-in list in the body below the form.
- Counterargument: the form's submit is naturally inline and the built-in list is a separate section. Rejected: the plan lists this surface, and the same owner-facing asymmetry appears between edit and add today.

### 8. Dirty guards are missing on two typed forms (medium)

- Where: `app/src/studio/StateCaptureSheet.svelte:151-157` and `app/src/studio/SlotsSheet.svelte:387-411`.
- Contract: rule 14 ("If leaving would lose typed input ... it asks first"), applied by Rename, Slots edit, New item, Directions, Adjust frame, and Import.
- Why: State capture has a name field and move choices; Add slot has a slot name and a behavior. X and browser Back discard them silently. The one-field Rename sheet asks, so the amount of typing is not the differentiator.
- Fix: pass a computed `dirty` (typed name and changed source for State capture; non-empty add name for Add slot) and let Sheet's existing guard run. Back on a multi-pane state capture should use `backDiscards` only if Back really drops the pane.
- Counterargument: State capture may be prefilled and Add slot is one field, so prompting adds friction. Rejected: Rename is one field and already prompts; predictability matters more than one extra alert here.

### 9. New headers moved initial focus onto the X, and the API panel's X is named differently (medium)

- Where: `app/src/studio/SharePopover.svelte:316-321` with `app/src/studio/experience/focus.ts:160-171`; `app/src/studio/ApiPeek.svelte:163` and `:450-458`.
- Contract: rule 22 ("Initial focus ... Never X"), rule 13 ("name and tooltip 'Close'").
- Why: popoverFocus focuses the first button in DOM order, and the new Share header puts the X before every control, so a keyboard user opening Share lands on Close. ApiPeek still explicitly focuses its X and names it "Close API calls" (tooltip "Close"), so the same control has two names across panels.
- Fix: make popoverFocus skip `.surface-close` (focus the surface or first content control), have ApiPeek focus its surface/title instead of the X, and either name the X "Close" everywhere or amend the contract to allow a descriptive name.
- Counterargument: an inspector benefits from starting at its exit, and "Close API calls" is clearer out of context. Rejected: the Share case is an accidental regression from adding the header, and the contract is explicit on both the name and the focus.

### 10. Move review has a third footer action (low)

- Where: `app/src/studio/MoveReviewSheet.svelte:287-317` (Discard draft, Regenerate, Save).
- Contract: plan line 49 names the footer as "Discard draft (secondary), Save"; rule 19 allows the note plus up to two more actions; rule 21 puts artifact actions such as Regenerate in the body.
- Why: Regenerate competes with Save at the decision point, and it is tied to the reviewed candidate, not to the act of keeping or discarding it.
- Fix: move Regenerate next to the candidate preview and warnings; footer stays Discard draft then Save.
- Counterargument: "two more actions" may mean two besides the primary, and Regenerate is a legitimate third choice. Rejected: the surface table is narrower than the general rule, and two destructive buttons plus a commit in one row is the exact crowding the contract is avoiding.

### 11. The X is 40 px on fine pointers, not 44 (low)

- Where: `app/src/studio/CloseButton.svelte:13-21`, `app/src/studio/studio.css:161-163` and `:1248`, `app/src/studio/experience/theme.css:14` and `:48-55`.
- Contract: rule 13 ("44 px").
- Why: `.btn.icon` takes `width: var(--ctl-h)` and `.btn` takes `height: var(--ctl-h)`. `--ctl-h` is 40 px outside the coarse-pointer/760 px query, so desktop sheets get a 40 px target. Only `.global-actions` explicitly forces 44.
- Fix: give `.surface-close` a 44 px box (`min-inline-size`, `min-block-size`, and a matching height) instead of inheriting `--ctl-h`, or raise the sheet's control height for chrome buttons.
- Counterargument: 40 px is usable and keeps the 56 px header from growing. Rejected: the contract fixes 44, and the header already has room.

### 12. `import.chooseAnother` is now dead in all ten locales (low)

- Where: `app/src/locales/*.json` (`en.json:1242`), after the last use was removed from `ImportSheet.svelte`.
- Contract: task locale check plus the repo rule to delete code a change makes dead.
- Why: the six new keys are present in every locale and the retired keys are unreferenced, but this key is left behind with no caller.
- Fix: delete it from all ten files.
- Counterargument: it costs nothing and may be reused. Rejected: it is exactly the kind of leftover this pass is meant to remove, and it will drift in translation.

### 13. Activity waiting copy does not say that leaving cancels (low)

- Where: `app/src/studio/ActivitySheet.svelte:243-252`, `app/src/locales/en.json:1874-1876`.
- Contract: plan line 51 ("closing still cancels the waiting click, and the message says so").
- Why: `activity.waitingBody` says to keep Activity open but never says the request is cancelled on close, while X now takes exactly that action.
- Fix: adjust the body string (all locales) to say that closing Activity cancels the request, next to the new Cancel request button.
- Counterargument: "Keep Activity open" implies the consequence. Rejected: the plan asks for the explicit statement, and the X is now the primary way out.

### 14. Frames Back contradicts the plan's "preserves the prepared review" (low, doc or behavior)

- Where: `app/src/studio/FramesSheet.svelte:224-226`, `app/src/studio/Sheet.svelte:78-80`.
- Contract: plan line 50: "Review: Back preserves the prepared review; X asks if it would be lost".
- Why: Back now goes through the same discard confirm and then `reset()` clears `prepared`, so Back loses exactly what X asks about. There is no pane state that could show the picker with `prepared` intact, so the plan sentence cannot be implemented as written.
- Fix: either amend the plan to "Back asks before discarding the review, like X", or add a real picker pane that keeps `prepared` while the picker is shown.
- Counterargument: `backDiscards` makes Back safe, so the spirit is met. Rejected: the plan draws a distinction between Back and X here, and the code does not, so the contract and the build disagree.

## Considered and dropped

- Activity's queued job says "Cancel" while a running job says "Stop" for the same `queue.cancel` (`ActivitySheet.svelte:348-356`, `:386-390`): pre-existing, and the plan itself uses "Stop on the job" and "Cancel request" for different states.
- Header title centering can drift when the developer tools slot is wide (`studio.css:1220`): the equal `1fr` side tracks keep the title centered as long as content fits, and overflow only appears in Developer mode at very narrow widths. Not reproducible on paper, so not kept.
- Create error footer keeps "Edit setup" beside Discard and Generate again: rule 21 names Edit setup as a body action, but this is the failed-attempt recovery cluster where all three decisions belong together, and the footer still has at most three actions. Not kept.
- Settings/Export Back on wide layouts: both stacked-sheet cases have a real return target, and Settings' internal page Back is correctly compact-only. Not kept.
- `SurfaceActions.svelte` is listed in the component plan (line 66) but was never created; footers are hand-rolled. Not a user-visible break today because the CSS enforces order, but see the note below.

## Plan deviations worth recording (not counted as findings)

- No `SurfaceActions.svelte`: the contract's shared footer primitive does not exist, so footer order is held only by each caller and `studio.css`. The next surface can drift.
- No test asserts footer order or the keeps-running description; the plan's test bullet asks for one check per new rule. The Undo/Redo slot test and the dirty-exit test were added (`studio.spec.ts:2055`, `:1527`).
- Locale keys were implemented as `common.keepsRunning`, `common.discardChangesTitle`, `common.discardChangesBody`, and `common.backTo` instead of the plan's `sheet.keepsRunning` and `common.discardChanges`. Names only; all ten files agree.

## Checks that came back clean

- Sheet headers: every `<Sheet>` renders through `SurfaceHeader`; no text dismiss, no `leading` text button, and no control top-left except Back.
- ConfirmDialog: centered, no header or X, safe action first and focused, named action last; the two-button flex wrap keeps order at every width.
- Top bar: `mount`, Undo, Redo, Random (right of Undo/Redo, as the owner asked), Share, Export, Activity, Full screen, More. Undo/Redo keep their slots with `visibility: hidden` plus `disabled`; Activity keeps a reserved slot and is hidden on phones where More carries the dot (`layout.css:270-282`, `GlobalActions` derives it from `activityStatus`).
- Mobile CSS: no remaining `.sheet-trailing`, `.has-developer`, `.grabber`, `.sheet-head > .btn`, or `.sheet-head > span:last-child` rules; no `column-reverse` or `order:` on `.sheet-head` or `.sheet-foot`. The remaining `order:` rules target `.stage-note`, the creator grid, and the hero, not chrome.
- Locales: the six added keys exist in all ten files; `common.hide`, `connectSheet.notNow`, `export.sheet.close`, `create.sheet.keepWorking`, `moveSheet.keepWorking`, and `sheet.later` are gone and unreferenced; every e2e expectation was updated to the new labels.
- Focus and exits: Sheet routes X, Escape, backdrop, and browser Back through one close request; `locked` holds browser Back; `backDiscards` now protects the Frames and Import reviews on Back; the New character screen's Back closes to where it was opened and keeps its draft when a sheet is opened over it.
- Dirty guards now cover Create (including a restored draft), Move, Rename, Slots edit, Directions, Adjust frame, New item, Frames, and Import.
- Share and API calls panels have the shared title plus X; Share's output row still ends with Download.
