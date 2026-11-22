# App bars: goals review (Opus)

Scope: commits 56fdba257 and 4a824e6cf against f68530198, judged against the owner's goals and the "As built" and "Owner revisions" sections of [plan.md](plan.md). No tests, builds or servers were run. No key was connected and nothing was generated.

## How it was tested

I used my own T3 preview tab on the running dev server (http://localhost:5241/). Screenshots worked, so I looked at the pages and also measured them with `preview_evaluate` (bounding boxes, visibility, disabled state, focus, horizontal overflow). Sizes: 1440x900, 1280x800, 1200x800 (extra), 844x390, 390x844 and 320x568. Dark was the default. For light, I set `data-theme="light"` on the root, so the app's own theme setting was not used. I looked at New character and Export in light at 320x568 and measured everything else in dark.

Covered in the browser: the top bar on Characters and Customize; Random look, then repeated Undo and Redo, with focus handoff; New character (Back, Escape in the Name field, browser Back, the Discard changes prompt, Settings over the creator, its X); Export and Export > Settings (Back, browser Back twice); Settings (backdrop click); Activity (Escape and focus return); Connect from More; Share (outside click); item Details; the slot menu; the phone More menu.

Not reachable on the demo without writing to the shared profile: Add move, Edit slot (the demo slot menu only offers Move, Hide and Make a custom copy) and a real running job. I reviewed those in code only. I simulated the Activity button's width with a 64 px stand-in.

Side effect to note: I pressed Random look on the demo character several times. Undo history reset when I left Customize, so the demo's current colors may differ from where they started. Equipped items match what they were when I first looked.

## What holds up (verified)

- Full screen and More sit at the same coordinates on Characters, Customize and New character at every size (for example 1328/1372 at 1440, 736/780 at 844x390, 294/338 at 390, 224/268 at 320).
- Bar order matches the owner's revision: Redo, Undo, Mount, Random look, Share, Export, Full screen, More. Pressing Undo until its stack empties leaves it in its slot (hidden and disabled) and moves focus to Redo. Pressing Redo until its stack empties removes Redo and moves focus to Undo. Nothing to their right moved in any step (1440, 1280, 844x390).
- Every sheet I opened has one 44x44 X at the end, and none has a dismiss action in its footer. The previous review's 40 px X and 49 px Share header are fixed: Share's header is now 57 px like the sheets.
- Export: Settings sits at the start (text on desktop, icon only on phones). Inside Settings it becomes "Back to Export". Browser Back first returns to Export, with focus on the Settings button, then closes the sheet.
- New character: Back, X-equivalents, Escape inside the Name field and browser Back all ask Discard changes? when Name is typed. Keep editing is focused, and Discard returns to Characters. The X on Settings opened over the creator now keeps the draft (Name "Zed" survived), so the previous review's data-loss finding is resolved.
- New character's fixed chrome is much smaller than in the last round: at 844x390 the bar is 60 px and the form scrolls under the footer, compared with 142+60 px before. At 320x568 the bar plus the Name row is 116 px.
- Escape, backdrop clicks and outside clicks closed Activity, Settings and Share, and focus returned to More after Activity.
- No horizontal page overflow on any surface at any size.

## Findings

### 1. Medium: Redo sits left of Undo, against every convention, and the two orders conflict

- Where: `app/src/studio/Toolbar.svelte:266-288`; the phone More menu lists them in the other order.
- Seen: at 1440x900 and 844x390, after one Undo empties the stack, the bar shows a lone right-pointing Redo arrow, then a 44 px hole, then Mount. With both present, the arrows read "→ ←", pointing at each other. In the phone More menu the same pair reads Random look, Undo, Redo. Every editor users know (Docs, Figma, Photoshop, Aseprite) puts Undo first, and the icons themselves point outward from that order.
- Why it matters: the goal is predictability. The order was flipped to solve a real problem (repeated Undo clicks landing on Redo), but it fixes one surprise by adding another, which shows every time history is used. The hidden-Undo hole (Redo, gap, Mount) also looks like a rendering glitch.
- Better choice: keep the conventional Undo, Redo order and make the pair a unit. It appears on the first change. After that, both buttons stay for the session and are shown dimmed and disabled when their stack is empty, instead of hidden. Nothing ever moves under the pointer, there is no hole, and the order matches the More menu and every other app. This costs one 44 px dimmed Redo after the first change.
- Against: the owner explicitly chose this order and asked for no idle gaps. It survives because a dimmed control is not an idle gap: it is the standard signal that an action exists but is unavailable. The current design already keeps a hidden gap, which is worse.

### 2. Medium: New character's floating footer note prints over form text on phones

- Where: `app/src/studio/experience/layout.css:1538-1550` (gradient from transparent to 88% canvas at 40%, with the note inside the fade).
- Seen right after opening, without scrolling:
  - 390x844 dark: "~2–5 gens" is printed across the base-prompt text ("white underwear set, bare~2–5 gens hair, no").
  - 320x568 light: the note sits inside the Build select and reads like its value ("Not set ~2–5 gens ▼").
  - 844x390 dark: the note lands on the Kind select.
- Why it matters: the cost note is a paid-cost disclosure, and here it is the hardest text on the screen to read. The overlap also makes the form look broken.
- Fix: give the footer an opaque canvas background and move the fade into a short (16 to 24 px) `::before` strip above the footer's box. The form still scrolls under it, and the note is always on a solid background. Alternatively, on phones put the note in the Create button's row.
- Against: the user can scroll the form so it no longer overlaps. It survives because it happens in the resting state of every phone size and in both themes.

### 3. Medium: background work shifts the view switch and the character name on desktop

- Where: `Toolbar.svelte:248-262` (Activity enters at the start of the end-anchored group) together with `centerOnStage` (`Toolbar.svelte:139-174`), which pushes the view switch away from the actions.
- Seen, with a 64 px stand-in for the Activity button:
  - 1280x800 with Redo: the Preview, Top-down and Side-scroller tabs moved from x 349 to 281 (68 px), and the name button shrank from 338 to 310.
  - 1200x800 with Undo and Redo: the tabs moved from 310 to 242, and the character name became truncated.
- Why it matters: the owner's rule protects controls to the right, but the view switch is a primary control. Here it jumps because a job started or finished in the background, with no user action. The previous design reserved Activity's slot to prevent exactly this. The revision traded that for no idle gap, but only the right side kept its stability.
- Fix: let the view switch keep its stage-centered position while it still clears the name's minimum width, and truncate the name first. Or, below about 1300 px, use the phone pattern there too (Activity in More, with the dot on More), which already exists.
- Against: it was measured with a stand-in, not a real job, because no key was connected. The real control (ring plus count) may be a little narrower. It survives because any width above about 10 px causes the shift at 1280.

### 4. Low: Settings opened from New character hides the form it returns to

- Where: `Sheet.svelte` `canReturnToCreator`/`returnToCreator`. The creator sheet is replaced rather than stacked.
- Seen (1440x900): New character's More > Settings shows a centered Settings sheet over the Characters screen, not over the form. The header has "Back" (to New character) and an X that leaves both. The draft survives, but nothing on screen shows that the form still exists.
- Fix: keep the creator visible under the Settings sheet (dimmed), or label Back with its destination even on desktop ("Back to New character" is only the accessible name today).
- Against: nothing is lost, and Back works. It is kept as Low because users may think their form is gone.

### 5. Low (pre-existing): phones keep Mount settings on the bar but move Undo and Random look into More

- Where: `experience/layout.css:267-305` (Undo and Random look drop at 430 px or less; Mount stays).
- Seen (390x844 and 320x568): the bar has Back, name, Mount settings, Export, Full screen and More. Undo, Redo and Random look are in More.
- Why: Mount settings (a test-mount toggle) is the least frequent of these controls, while Random look and Undo are the most frequent pair. The owner's complaint was too many actions, so priority matters.
- Fix: on phones, swap Mount settings into More and keep Random look on the bar. Undo then stays one tap away in More, beside Random look.
- Against: the plan said the phone overflow is unchanged. It survives only as a recommendation.

### 6. Low: Export > Settings hosts the whole 720 px Settings layout in the 560 px Export sheet

- Where: `ExportSheet.svelte` (sheet height 680 px and the 560 px default width); the label CSS is at `SettingsContent.svelte:637` (pre-existing).
- Seen (1280x800): all eleven categories render in a two-column layout, and the Export pane's "Export Adventurer character..." button wraps mid-word ("Expor / t", 233x77 px). That button also opens Export, the sheet the user just came from.
- Fix: while Settings is shown inside Export, widen the sheet to the Settings width and hide the "Export character" row there, since Back already does that job.

### 7. Low: New character's Back has no destination in its accessible name

- Where: `BackButton.svelte:26` (no `to` passed for the creator screen).
- Seen: the creator's Back is named "Back". The top bar's equivalent is named "Characters", and sheet Backs are named "Back to ...". This screen can be opened from Characters or Customize, so the name should say which.
- Fix: pass `backTo` with the screen that opened it.

## Considered and dropped

- Name field in the bar with no visible label once it is filled: the "New character" title beside it makes its purpose clear, and the owner chose this layout.
- Export's icon-only Settings opener in the Back slot on phones: it has an accessible name and a tooltip, and the owner chose this placement explicitly.
- Item Details opens a sheet titled "Item": this predates the change.
- Escape inside the Name field asks Discard changes? instead of only leaving the field: this is consistent with the single close request and protects typed input.

## Verdict

Mostly met. The shared chrome now does what the owner asked for: one X at the end, Back only for inner panes, Full screen and More fixed on every screen, footers without dismiss actions, and one close request behind X, Escape, backdrop and browser Back. It is clearly more consistent than before at every size. Three things still work against "predictable":

- the reversed Undo/Redo order and its hole (finding 1);
- the footer note printing over the form on phones (finding 2);
- background work moving the view switch on desktop (finding 3).

Fix finding 2 before shipping, because it hides a cost disclosure. I recommend findings 1 and 3 because they undercut the goal this work set out to meet.
