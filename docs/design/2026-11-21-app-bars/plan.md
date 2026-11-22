# App bars and surface chrome: contract v2

Status: approved by the owner on 2026-11-21 and implemented (the owner moved Random look to the right of Undo and Redo). Implementation notes: New character stays a full-window dialog whose own bar repeats the top bar (Back at the start, Full screen and More at the end), because a modal makes the real bar inert; sheets opened over it step Back to it with the draft kept. Phones keep Activity in More and dot the More button. Evidence: [sol-research.md](sol-research.md), [deepseek-research.md](deepseek-research.md); challenge round: [sol-review.md](sol-review.md), [deepseek-review.md](deepseek-review.md). Mockup: [mockup.html](mockup.html).

## Root cause

`Sheet.svelte` places the dismiss control from its label key (`common.done`/`common.close` trail, everything else leads), and callers swap that label by state (Create: Cancel, Hide, Close; Frames: Done, Cancel). Callers also inject free `leading`/`trailing` snippets. Placement follows copy, not meaning. The fix is fixed slots filled with typed content.

## Rules

| Question                    | Rule                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Way out of a sheet or panel | One X icon button at the top-right (logical end), 44 px, name and tooltip "Close", on every sheet and popover panel. Never text, never on the left, never disabled except during an atomic save (with a visible "Saving..." reason).                                                                                          |
| What X does                 | Exactly what Escape and the backdrop do, through one close request. If leaving would lose typed input or a prepared review, it asks first: "Discard changes?" with Keep editing, Discard. Running generations are never lost: X closes and the body says "Keeps running in Activity" (linked to X with `aria-describedby`).   |
| Browser Back                | Walks back one inner pane when there is one, otherwise sends the same close request.                                                                                                                                                                                                                                          |
| Back                        | Chevron plus "Back" at the top-left, only inside an inner pane (Export settings, Settings panes on phones, Frames review, Move skeleton review). Never closes. Nothing else sits top-left in a sheet.                                                                                                                         |
| Header                      | Back slot, centered title (plus an optional inline field such as Name), one tools slot left of X for icons (API calls in Developer mode), X. The title truncates; X never moves.                                                                                                                                              |
| Footer exists               | Only when the surface has a commit. Read-only, live-applied (Settings) and running-only states have none.                                                                                                                                                                                                                     |
| Footer order                | Note (cost, size, status) at the start, then up to two more actions, primary always last. The order never changes by width, state or locale. Cancel, Close, Hide, Done, Later and Not now never appear in a footer.                                                                                                           |
| Narrow footer               | Two columns while both labels fit on two lines (labels wrap, 44 px minimum). Narrower: stack in the same order, primary at the bottom, note above. Safe-area padding and the software keyboard (`interactive-widget=resizes-content`) never cover it.                                                                         |
| Third actions               | Actions tied to an artifact (Discard draft, Restore original frames, Download frames, Edit setup, Queue another) sit next to that artifact in the body.                                                                                                                                                                       |
| Initial focus               | First text field on fine pointers for short forms (today's rule); otherwise the title. Never X, never a paid or destructive button.                                                                                                                                                                                           |
| Confirm alert               | Centered at every size. No header controls and no X. Body: consequence. Footer: safe action (Cancel, or a specific one such as Keep editing or Keep generating), then the named action last, danger-colored if destructive. Safe action focused; Escape picks it; backdrop dismiss only when the action is not consequential. |
| Menus                       | No header, X or footer. Escape, outside press or the trigger closes.                                                                                                                                                                                                                                                          |
| Toast                       | Bronze Notice keeps its own dismiss X, last; optional single action before it. Only the alignment is matched.                                                                                                                                                                                                                 |
| Vocabulary                  | Close (X name), Back, Cancel or a specific safe verb (alerts only), named primaries (Create, Save, Make item, Download ZIP, Replace frames, Delete). Done only as a primary that finishes a flow. Hide, Later and Not now are retired.                                                                                        |

## Global top bar

Start to end: navigation and identity, centered view tabs, then the trailing group `[screen actions] [Undo Redo] [Share Export] [Activity] [Full screen More]`.

- Full screen and More are last on every screen, including New character. Full screen is present whenever the browser supports it; support never changes during a session, so nothing moves.
- Undo and Redo each keep their slot and use `visibility: hidden` plus `disabled` when their stack is empty. A focused button that empties its stack passes focus to its partner or More.
- Activity gets a reserved slot on wide layouts, hidden with `visibility` when idle, so starting a job moves nothing. On phones it stays in More with a badge on the More button.
- The existing phone overflow (Redo, Share, Random, Undo into More at today's breakpoints) is unchanged. Within one breakpoint nothing moves.

## New character becomes a screen

A modal makes the top bar inert (`showModal()`), so Full screen and More can only be present if New character is a screen: top bar with Back (returns to where it was opened from), title, Full screen, More; the form as content; its footer action bar. Draft and result state move above the screen so opening Settings, Connect or Activity from More keeps them. This is the largest change and lands last, as its own step.

## Surface changes (behavior kept)

| Surface                                                                                  | After                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create (until it becomes a screen)                                                       | X; Name stays in the header field slot; wardrobe options move into the form; footer: note, Create                                                                |
| Export                                                                                   | Back only inside Export settings; the settings opener is a body row; footer: note, Download                                                                      |
| Settings                                                                                 | X closes Settings; phone panes get Back; Reset all is the last row of the index; Library backup restore keeps its own confirm                                    |
| Add move                                                                                 | Form: footer note, Generate. Running: no footer, progress plus "Keeps running in Activity" and Queue another in the body; Stop stays on the job in Activity      |
| Move review                                                                              | X keeps the checkpoint; footer: Discard draft (secondary), Save; skeleton step has Back                                                                          |
| Frames                                                                                   | Picker: X. Review: Back preserves the prepared review; X asks if it would be lost; footer: note, secondary, Replace frames; Download and Restore sit in the body |
| Activity                                                                                 | X; Cancel request is a body action beside the waiting job; closing still cancels the waiting click, and the message says so                                      |
| Connect                                                                                  | X; Connect is the footer primary; body says the offer stays in More                                                                                              |
| Setup                                                                                    | X; failed run offers "Dismiss failed setup" in the body                                                                                                          |
| New item, Rename, Slots edit, Slots add, Directions, Adjust frame, State capture, Import | X; footer: note, optional secondary, named primary; Import's staged review gets Back                                                                             |
| Item, Details, Workspace, Item review                                                    | X instead of Done; no footer                                                                                                                                     |
| Share popover                                                                            | Title plus X; output row keeps Copy PNG, Share to, Download last                                                                                                 |
| API calls panel, Reference picker                                                        | Title plus X                                                                                                                                                     |
| PWA dialog and notice                                                                    | Same header and footer; keeps its busy shield and recovery link                                                                                                  |
| Delete and cancel confirms (ItemMenu, Library, PixelLab Forget, Saved actions)           | Confirm alert rule; guarded bulk delete keeps its two steps                                                                                                      |
| Phone grabber                                                                            | Removed (no drag gesture exists)                                                                                                                                 |

## Component plan

- `CloseButton.svelte` and `BackButton.svelte`: the only X and Back.
- `SurfaceHeader.svelte`: `back?`, `title`, `field?`, `tools?`, `onclose`, `locked`. Used by Sheet, Share, API calls panel, Reference picker, PWA dialog.
- `SurfaceActions.svelte`: `note?`, `actions` (one to three, primary last) in fixed DOM order with the narrow stacking rule. Used by sheet footers, ConfirmDialog, Share, New character.
- `exitGuard`: one close request per surface (X, Escape, backdrop, browser Back) with an optional `dirty` check that opens the Discard confirm. Replaces `cancel`/`cancelDisabled`; `locked` keeps the `ui.sheetBusy` duty that holds browser Back.
- `Sheet.svelte` keeps native dialog, focus, presentation and backdrop logic; drops `leading`, `trailing`, `cancel` and `cancelDisabled`.
- `Toolbar.svelte`: reserved Undo, Redo and Activity slots; pinned Full screen and More rendered on every screen.
- New locale keys: `common.back`, `common.discardChanges`, `common.keepEditing`, `sheet.keepsRunning`.
- Bronze UI owns appearance; PixelDoll owns slots, order, spacing and logic. A new shared X style, if needed, ships from Bronze first.

## Implementation order

1. Shared primitives, Sheet and ConfirmDialog migrated, every sheet header converted (X and Back), dirty-exit guard.
2. Footers and labels per surface (table above).
3. Top bar: Undo/Redo visibility, Activity slot, pinned pair.
4. Share, API calls panel, Reference picker, PWA.
5. New character as a screen.

Tests: update the e2e specs that click Cancel, Done, Hide or Later in sheets; add one unit or e2e check per new rule (Undo/Redo slot stability, dirty-exit confirm, footer order). Full e2e suite runs once at the end (cross-cutting).

## Open decisions for the owner

1. New character as a screen (recommended) or a full-viewport sheet that repeats Full screen and More inside its own header.
2. Sheet titles centered (today, recommended) or start-aligned.
3. Remove the decorative phone grabber (recommended) or implement swipe-to-close.

## As built (review outcomes)

Both implementation reviews ([sol-code-review.md](sol-code-review.md), [deepseek-code-review.md](deepseek-code-review.md)) were checked against the code; fixed findings are not repeated here. These rows replace the plan above where they differ:

- Footers hold a note and up to three actions, primary last. Artifact actions that already lived there (Frames Download and Restore, Move review Regenerate, Create recovery Edit setup) stay, because moving them would change workflows the owner did not ask to change. No footer holds a dismiss action.
- Running states may keep a footer note (Create's estimate, Move's "Keeps running in Activity" with Queue another) instead of a body note.
- Footers use the shared `.sheet-foot` rules in `studio.css` rather than a `SurfaceActions` component: every footer already renders note-then-actions markup, so a wrapper would add a layer without changing behavior.
- Back from a review pane (Frames, Import) discards the prepared review, so it asks Discard changes? first, like the X.
- Small anchored pickers (Reference source, playback, mount and slot pickers) keep light dismissal without a header. The API calls panel is a developer tool and keeps its own compact header (tools, then its X last).
- The app update dialog uses the shared header; its Install and Update actions stay inline with their explanations.
- Forms with an inline submit next to their only field (Connect's key, Add slot) keep it there.
- State capture and Add slot do not ask before discarding; their input is a short name.
- Final reviews ([opus-final-review.md](opus-final-review.md), [sol-final-review.md](sol-final-review.md)): a sheet over New character asks Discard changes? before its X drops the creator's typed draft; browser Back answers the topmost alert first; the X is a 44px target at every size. Kept on purpose: confirm alerts still cancel on a backdrop press (an earlier owner-approved card), narrow phones show Back as its chevron only (its accessible name keeps the destination), and running notes are not yet linked to the X with `aria-describedby`.
- New character's wardrobe options moved into its own More menu (Wardrobe settings), the same place as on every other screen, rather than into the form.
