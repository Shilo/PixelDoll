# Competing research: chrome, dismissal and action placement

Role: independent challenger. This is not the main proposal. It argues for a rule set that is deliberately less HIG-literal than the conventional answer, and it marks where I expect to disagree.

Scope: dialog and sheet chrome, top bar actions, dismiss labels, footer order, busy/parkable jobs, multi-step navigation, destructive confirms. No production code was written and no tests, builds or servers were run. Evidence comes from reading the current Svelte components and from published platform and product guidance.

## 1. Ground truth in this checkout

### 1.1 `Sheet.svelte` decides placement from the label key

`app/src/studio/Sheet.svelte` has one header grid and one `cancel` prop. Placement is inferred from the translation key, not from the action's semantics:

```ts
// Sheet.svelte:65
const cancelTrailing = $derived(
  cancel === "common.done" || cancel === "common.close",
);
```

Consequences:

| Input                    | Leading slot   | Trailing slot             | Actual meaning                               |
| ------------------------ | -------------- | ------------------------- | -------------------------------------------- |
| `cancel="common.cancel"` | text Cancel    | none                      | dismiss, but looks like a transaction cancel |
| `cancel="common.done"`   | none           | text Done                 | dismiss or acknowledge                       |
| `cancel="common.close"`  | none           | text Close                | dismiss                                      |
| `cancel="common.hide"`   | text Hide      | none                      | dismiss while work continues                 |
| `cancel="sheet.later"`   | text Later     | none                      | defer an offer                               |
| caller passes `trailing` | caller decides | caller decides            | auto close suppressed                        |
| caller passes `leading`  | caller decides | auto close still possible | navigation and dismiss can coexist           |

This one line is the mechanical cause of "left vs right, text vs X" drift. Any copy change that swaps a key (`sheet.later` to `common.close`) also moves the control. The same surface can change sides when its state changes, for example `FramesSheet.svelte:222` uses `prepared ? 'common.cancel' : 'common.done'`, so the dismiss control jumps from trailing Done to leading Cancel when entering review.

Two more structural facts matter:

- `leading` replaces the auto dismiss entirely. Callers use that slot for Back, Settings, Reset and account navigation. So the leading edge is already the navigation edge, not a free dismiss edge.
- `cancelDisabled` is doing three jobs: block dismissal while saving, block dismissal while a paid job runs, and publish `ui.sheetBusy` to block browser Back. It is a state flag, not a policy.

### 1.2 Surface inventory

| Surface                | Component                    | Header dismiss                                                                                                   | Footer                                           | Notes                                                                    |
| ---------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Create character       | `CreateSheet.svelte:200`     | Cancel before start, Hide while creating, Close when a project exists; custom trailing Close duplicates the prop | none                                             | label changes three times in one flow                                    |
| Export                 | `ExportSheet.svelte:780`     | leading Settings or Back, trailing X (always)                                                                    | primary Download plus status note                | X and `cancel="common.close"` describe the same dismissal                |
| Settings               | `SettingsSheet.svelte:27`    | leading `SettingsHeader` (Reset), trailing Close text                                                            | none                                             | settings apply live                                                      |
| Add move               | `MoveSheet.svelte:1437`      | Hide while running, Cancel otherwise                                                                             | Hide, Queue another, primary Generate, cost note | Hide appears in header and footer at the same time                       |
| Move checkpoint        | `MoveReviewSheet.svelte:322` | Done on items step, Later on review                                                                              | Save/Replace plus discard choices                | parking versus completion is encoded in the header                       |
| Item details           | `ItemPane.svelte:332`        | Done                                                                                                             | none                                             | read-only review                                                         |
| Slots                  | `SlotsSheet.svelte:271`      | default Cancel                                                                                                   | primary Save                                     | Cancel plus Save is the clearest transactional case                      |
| New item               | `NewItemSheet.svelte:231`    | default Cancel                                                                                                   | primary Make                                     | Cancel plus Make                                                         |
| Setup                  | `SetupSheet.svelte:118`      | Hide while active or failed, Later otherwise                                                                     | none                                             | parkable job                                                             |
| Connect                | `ConnectSheet.svelte:187`    | Not now, Cancel while replacing, Done otherwise                                                                  | none                                             | decision label in the dismiss slot                                       |
| Frames                 | `FramesSheet.svelte:220`     | Done in picker, Cancel in review                                                                                 | none                                             | review Cancel actually goes Back one step                                |
| Activity               | `ActivitySheet.svelte:138`   | Done, or Cancel request while waiting for a tab                                                                  | none                                             | action label in the dismiss slot                                         |
| Delete and destructive | `ConfirmDialog.svelte:59`    | none                                                                                                             | Cancel then destructive verb                     | no X; backdrop dismiss enabled                                           |
| Share                  | `SharePopover.svelte:303`    | none                                                                                                             | three actions in the surface                     | `role="dialog"` with no visible close control                            |
| Toast                  | `Toast.svelte:142`           | icon dismiss injected by Bronze `Notice`                                                                         | optional action button                           | transient, not modal                                                     |
| Top bar                | `Toolbar.svelte:202`         | n/a                                                                                                              | n/a                                              | conditional Full screen and Activity; Undo/Redo are disabled, not hidden |

### 1.3 Top bar mechanics that create unpredictability

- `FullscreenButton.svelte:57` renders nothing unless the Fullscreen API is usable. Availability is runtime-dependent (manifest fullscreen, iOS, embedded webviews), so the actions cluster can gain or lose a 44 px item for reasons the user cannot see.
- `Activity` is inserted only when busy or stopped (`Toolbar.svelte:326`), so the rest of the cluster shifts when a job starts or ends.
- Undo and Redo use `disabled={!undoLabel}` (`Toolbar.svelte:295`). They keep their width, which is good, but they do not hide. The request to hide them without layout shift is therefore not implemented.
- `layout.css:270` moves Redo and Share into More on phones; `layout.css:291` and `:297` move Random and Undo into More at 430 px. The same action changes home as the window narrows. That is the strongest source of "where did it go" complaints.
- More is unconditional in markup. If it appears to vanish, suspect clipping or an overflowing cluster rather than a conditional.
- Share and Export lose their text labels below 1200 px and become icon-only, but keep their positions. That is a good model: change presentation, not membership.

## 2. What the standards actually say

| Source                                                                                                        | Relevant claim                                                                                                                                                                                                          | Why it does not settle our case alone                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Apple HIG: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)                     | On iOS, Cancel belongs on the leading edge, Done on the trailing edge; do not show Cancel, Done and Back together; prolonged or complex flows should consider full screen instead of a sheet                            | The leading Cancel is an iOS toolbar convention. A web app that already uses leading for Back and Settings cannot copy it without a collision.                            |
| [Apple HIG: Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts)                     | Most likely button trails, Cancel leads, use a specific verb, never make Cancel the default; destructive style only when the user did not deliberately choose the action                                                | Written for short system alerts. PixelDoll confirms also cover paid jobs and blocked prerequisites, which need a different busy and disabled model.                       |
| [Apple HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)                 | Use the standard Close symbol, do not use a text label that says Close; group critical actions; aim for at most three groups                                                                                            | This directly supports an icon X over header text, even on Apple platforms.                                                                                               |
| [Apple HIG: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)                   | Do not assign the primary role to a destructive action                                                                                                                                                                  | Applies to Enter-key default, not only color. Our confirm already focuses Cancel.                                                                                         |
| [Material 3: Dialogs](https://m3.material.io/components/dialogs/guidelines)                                   | Maximum two actions; buttons trail; confirmation nearest the edge; dismissive left of confirming; never disable dismissive actions; avoid vague Done/OK/Close as the confirmation; full-screen dialogs use a close icon | "Never disable the confirmation" assumes a simple decision. Our Generate button must be disabled until a cost estimate and tier check exist.                              |
| [Material 3: Bottom sheets](https://m3.material.io/components/bottom-sheets/guidelines)                       | Modal sheets dismiss by scrim, swipe, or a close affordance in the app bar when full screen; drag handle must have a non-drag alternative                                                                               | We have a grabber with no drag behavior (`Sheet.svelte:90` only draws it). That is a broken affordance on phones.                                                         |
| [Material 3: Buttons](https://m3.material.io/components/buttons/guidelines)                                   | Text buttons are the low-emphasis dialog action; align to trailing edge                                                                                                                                                 | Text-only actions in a complex, cost-bearing footer lose the hierarchy that a filled primary provides.                                                                    |
| [Fluent 2: Dialog](https://fluent2.microsoft.design/components/web/react/core/dialog/usage)                   | Add a top-right Close only if there is no Cancel button that closes; do not include redundant options; header and footer persist on scroll                                                                              | This is the strongest published argument against X plus footer Cancel. It assumes both do the same thing.                                                                 |
| [Fluent 2: Button](https://fluent2.microsoft.design/components/web/react/core/button/usage)                   | Primary placement left of other actions in LTR; only one primary per layout; specific responses to the title                                                                                                            | Windows order conflicts with Apple and Material. It proves button order is platform convention, not a universal truth.                                                    |
| [Windows dialogs](https://learn.microsoft.com/en-us/windows/apps/design/controls/dialogs-and-flyouts/dialogs) | "Do it" actions left, safe action rightmost; every dialog needs a safe exit                                                                                                                                             | The exact inverse of Apple's alert order. Again: platform convention.                                                                                                     |
| [WAI-ARIA APG: Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)                                | Focus enters the dialog, Tab is trapped, Escape closes, focus returns to the trigger; strongly recommend a visible button that closes the dialog                                                                        | Makes the SharePopover's missing close control a real defect, not a style choice.                                                                                         |
| [WAI-ARIA APG: Alert Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/)                           | Use for brief, important messages; focus the least destructive action when the result is not easily reversible                                                                                                          | Confirms the existing Cancel-first focus in `ConfirmDialog`.                                                                                                              |
| [NN/g: Cancel vs Close](https://www.nngroup.com/articles/cancel-vs-close/)                                    | The X is ambiguous; use explicit text when work could be lost; save intermediate work; a running timer can be dismissed without stopping it; if X must be used, save and offer a separate Cancel                        | This is the best support for treating Hide as a distinct third verb, not a synonym for Close.                                                                             |
| [NN/g: OK-Cancel or Cancel-OK](https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/)                      | Follow the platform; the choice matters less than consistency; name the action, do not use generic OK; do not default a dangerous action                                                                                | Our product is cross-platform web, so the "platform" is the web and the product's own convention. Pick one and never move it.                                             |
| [NN/g: Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/)                           | Reserve confirms for serious, irreversible or costly actions; be specific; prefer response labels over Yes/No; avoid a default Yes                                                                                      | Paid generations and character deletion qualify. Routine sheet dismissal does not.                                                                                        |
| [NN/g: Modal and nonmodal](https://www.nngroup.com/articles/modal-nonmodal-dialog/)                           | Modals interrupt and cost context; use them only when justified                                                                                                                                                         | Argues against turning every settings detour into a modal task.                                                                                                           |
| [GitHub Primer: Dialog](https://primer.style/product/components/dialog/guidelines/)                           | Close button is required and may not be visually hidden; header close at top right; primary actions right, secondary left; centered becomes bottom sheet on narrow viewports                                            | A real, documented web product that uses X top right and footer primary right at the same time.                                                                           |
| [Atlassian: Modal dialog](https://atlassian.design/components/modal-dialog/usage)                             | Close button in header should always be used; footer Cancel or Close is optional; footer buttons right, primary right of secondary; focus starts on header close                                                        | Shows that X plus an optional footer dismissal is a deliberate, accessible pattern, not redundancy by definition.                                                         |
| [Shopify Polaris: Modal](https://shopify.dev/docs/api/app-home/latest/web-components/overlays/modal)          | Footer primary-action slot and secondary-actions slot; X, Cancel, Esc and outside click close; no more than two footer buttons                                                                                          | A third real web product with X plus footer dismissal. Its mobile app has known layout failures when footer actions meet a floating toolbar, a caution for bottom sheets. |

### Real product comparison

| Product                     | Close affordance                   | Footer order                       | Mobile adaptation                             | Lesson                                                                 |
| --------------------------- | ---------------------------------- | ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| GitHub                      | Required X at top right            | Secondary left, primary right      | Centered dialog becomes bottom sheet          | X and a footer primary coexist without a footer Cancel                 |
| Jira / Atlassian            | Required X in header at right      | Secondary then primary, both right | Modal stays modal, responsive                 | Footer cancel is optional; X is mandatory for accessibility            |
| Shopify Admin               | X plus Cancel/Esc/outside click    | Secondary then primary, right      | Footer actions can collide with mobile chrome | X plus footer Cancel is normal; duplicate effects are the real problem |
| Apple iOS sheet             | Text Cancel leading, Done trailing | n/a in the header model            | Same                                          | Platform-specific, and it forbids all three of Cancel, Done, Back      |
| Material full-screen dialog | Close icon leading                 | Confirming nearest trailing edge   | Bottom sheet on compact                       | Close side follows reading direction and platform                      |
| Fluent / Windows            | X top right                        | Primary left of safe action        | Same                                          | Do not duplicate dismissals; Windows order is the inverse of Apple     |

The three documented web products agree on the web convention: X at the top right, primary at the footer's trailing edge, secondary to its left. They disagree on whether a footer Cancel is required. That disagreement is the useful opening for a competing proposal.

## 3. Competing rule set

### 3.1 Classify first, then style

| Class             | Examples                                                                | Dismiss semantics                   | Close control                         | Footer                             |
| ----------------- | ----------------------------------------------------------------------- | ----------------------------------- | ------------------------------------- | ---------------------------------- |
| Alert             | Delete character, delete item, cancel a paid job                        | answer a question; no state to keep | none                                  | Cancel + explicit destructive verb |
| Transaction sheet | Create before generation, Connect key form, Slots rename, Frames review | leave uncommitted input             | X = discard, with confirm if dirty    | primary commit + optional discard  |
| Live sheet        | Settings, Details, Item review, Wardrobe, Share                         | leave; changes already applied      | X only                                | none, or one acknowledgment        |
| Monitor sheet     | Create while running, Add move while running, Setup                     | park; work continues                | Hide                                  | status + Queue another + Hide      |
| Popover           | Share, menus, mount options                                             | light dismiss                       | X only if it declares `role="dialog"` | actions inside the surface         |
| Notification      | Toast, PWA notice                                                       | auto or manual dismiss              | X with accessible label               | optional text action               |

The class determines the words. The class must be a prop or a variant, not inferred from a label key. This is the central disagreement with the current design: placement should be a property of the surface's job, not of its copy.

### 3.2 Header slots

Keep the existing centered three-column grid. Assign each column one job:

| Slot     | Allowed                                                                                          | Forbidden                                                              |
| -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Leading  | Back, parent navigation, account/settings root, destructive reset in a settings root             | any dismissal that also exists elsewhere; text Cancel for a live sheet |
| Center   | title, optional page title, optional inline name field                                           | actions                                                                |
| Trailing | one dismiss control (X with accessible name), plus at most one secondary icon button to its left | the committing primary action for a form; two dismiss controls         |

Rules:

1. Dismiss is always trailing in LTR and mirrors logically in RTL. One component, one position, every class except Alert.
2. The dismiss control is an icon, not header text, for every class except an offer/defer decision that genuinely belongs to the body. This removes the localization-width problem: German, Finnish and Japanese labels currently push or wrap the centered title.
3. Leading Back replaces any leading Cancel. Back never dismisses; it changes step. This is exactly the `ExportSheet` pattern (leading Back, trailing X) and should become the general pattern, not the exception.
4. Never render two dismiss affordances with the same effect. If the footer needs a discard, the header X must be that discard, or the footer button must say what is actually different.
5. The title stays centered even when one side is empty. Keep the `1fr auto 1fr` grid; do not let the trailing cluster pull the title off center.

Why trailing, against Apple's leading Cancel: this is a web app, not an iOS sheet, and the leading slot already does navigation work in `ExportSheet`, `SettingsSheet`, and `SlotsSheet`. A leading Cancel would sit next to Back and Settings and be misread as "go back". Apple's own toolbar guidance prefers the standard Close symbol to the word Close, so the strongest defense of a leading text Cancel is narrower than the HIG headline suggests. The source of the owner's complaint is not that dismiss is on the wrong side; it is that the side changes. Trailing is the web convention in all three documented products above and gives one stable answer.

### 3.3 Footer slots and order

| Position (LTR row) | Slot      | Content                                                                           |
| ------------------ | --------- | --------------------------------------------------------------------------------- |
| far left           | status    | cost estimate, file size, readiness, "free" note, progress                        |
| middle             | tertiary  | queue another, back one step, learn more (rare)                                   |
| right, first       | secondary | Cancel/Discard/Keep/Not now, only if it has a distinct effect                     |
| far right          | primary   | the class's commit action, filled, never destructive styling for a routine action |

Rules:

1. Footer order is fixed: secondary then primary in DOM and on screen. Never swap based on width, state or label. This alone fixes "confirm and secondary swap sides."
2. The primary is the only filled button in the footer. Tertiary actions are quiet text. Destructive verbs use danger styling but stay in the primary position.
3. Side by side down to 360 px when both labels fit. Below that, or when either label exceeds roughly 14 characters, stack: primary on top, secondary below. This matches Material's stacked order (confirming above dismissive) and Apple's "most likely at the top of a stack." It also leaves the safe action at the bottom edge, which is easier to reach and harder to hit by accident than a filled destructive button at the thumb.
4. Do not put three actions in a footer unless the class is Monitor. Material's two-action cap is right for alerts and transactions; monitors legitimately need Hide, Queue another, and Try again. If a third action is a navigation, move it to the header (Back) or the body.
5. Use logical CSS (`margin-inline-start`, `inset-inline-end`, `flex-direction` with `column-reverse`) so RTL mirrors without a second code path.
6. A footer Cancel is allowed only when the body holds uncommitted edits and losing them is possible. It is forbidden on live sheets, where it implies a revert that does not exist.

### 3.4 Label vocabulary

| Label                    | Use                                                       | Do not use for                        | Visible as                                                           |
| ------------------------ | --------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| Close                    | dismiss a live sheet, keep applied changes                | discarding a form                     | X icon, accessible name "Close"                                      |
| Hide                     | dismiss a monitor while work continues                    | ending a job                          | X icon, accessible name "Hide", or a text button in a monitor footer |
| Cancel                   | abandon uncommitted input, or stop a process              | leaving a read-only or live sheet     | footer secondary, or alert secondary                                 |
| Done                     | acknowledge a completed review or a finished flow         | a sheet that never completed anything | footer primary or, sparingly, header trailing text                   |
| Back                     | move to the previous step                                 | dismiss the sheet                     | header leading, icon plus accessible name                            |
| Not now / Later          | defer a voluntary offer that has a persistent entry point | dismiss a running job                 | footer secondary, not the header dismiss                             |
| Discard                  | throw away uncommitted edits                              | close a live sheet                    | footer secondary or a dirty-state confirm                            |
| Stop / Cancel generation | stop a paid process                                       | park a paid process                   | alert destructive verb                                               |

Specific changes this vocabulary forces:

- `ActivitySheet` "Cancel request" is an action, not a dismissal. Move it to the body or footer as a secondary, and keep the header X as Close.
- `ConnectSheet` "Not now" is a decision about connecting, not a way to close chrome. Put it in the footer as the secondary, and let the header X close. If the sheet is only an offer, "Not now" is acceptable as the footer secondary.
- `FramesSheet` review "Cancel" returns to the picker. It is Back. Put Back in the leading slot and X trailing; remove the fake Cancel.
- `MoveReviewSheet` "Later" parks a checkpoint. Keep it only if a persistent entry point exists; otherwise Close. Never use Later as the header dismiss for a running job; that is Hide.
- `SetupSheet` "Later" is a deferral of a not-yet-started setup. It is acceptable as a footer secondary if More or the character screen shows the pending setup. The header dismiss should still be X.
- `ItemMenu` "Keep" is a good specific label for a destructive confirm's secondary. Keep it in the footer, never in the header.
- "Done" on `ItemPane`, `GenCard`, `DetailsSheet`, `ActivitySheet` and `WorkspaceSheet` is an acknowledgment, not a commit. Since the surface is read-only, either Done or X is defensible. Prefer X for consistency, unless the flow genuinely finishes something and the user needs the word "Done" to know it is safe to leave.

### 3.5 Per-surface matrix (target state)

| Surface           | Class            | Leading                  | Trailing | Footer order                           | Keyboard                                                             |
| ----------------- | ---------------- | ------------------------ | -------- | -------------------------------------- | -------------------------------------------------------------------- |
| Create, form      | transaction      | none                     | X Close  | primary Create                         | Enter in a field does not create; Esc discards with confirm if dirty |
| Create, running   | monitor          | none                     | X Hide   | status, Queue another (optional), Hide | Esc = Hide, never cancel the job                                     |
| Create, review    | live             | none                     | X Close  | primary Open                           | Enter opens; Esc closes                                              |
| Export            | transaction/live | Settings or Back         | X Close  | status, primary Download               | Esc closes; Back only changes page                                   |
| Settings          | live             | Settings root / Reset    | X Close  | none                                   | Esc closes unless saving                                             |
| Add move, form    | transaction      | none                     | X Close  | cost, primary Generate                 | Enter in prompt queues; Esc closes                                   |
| Add move, running | monitor          | none                     | X Hide   | progress, Queue another, Hide          | Esc = Hide                                                           |
| Move checkpoint   | transaction      | Back when not first step | X Close  | discard, Save/Replace                  | Esc = Close, confirm if dirty                                        |
| Frames, review    | multi-step       | Back                     | X Close  | Save                                   | Esc = Back? No: Esc closes, Back is explicit                         |
| Slots edit        | transaction      | none                     | X Close  | primary Save                           | Enter submits; Esc closes with dirty confirm                         |
| New item          | transaction      | none                     | X Close  | note, primary Make                     | Enter in prompt only with modifier                                   |
| Setup, running    | monitor          | none                     | X Hide   | status, Hide                           | Esc = Hide                                                           |
| Connect, form     | transaction      | none                     | X Close  | Not now, Connect                       | Enter submits; Esc closes                                            |
| Activity          | live             | none                     | X Close  | Cancel request (if waiting)            | Esc closes                                                           |
| Delete confirm    | alert            | none                     | none     | Cancel, Delete                         | Esc cancels; focus Cancel; no scrim dismiss                          |
| Share popover     | popover dialog   | none                     | X Close  | Copy, Share, Download                  | Esc closes; focus returns to the Share button                        |
| Toast             | notification     | none                     | X        | optional action                        | focus pause while hovered or focused                                 |

### 3.6 Top bar: a fixed membership model

The bar should answer "what can I always find here", not "what fits right now". Proposed model:

**Right cluster, one order, every studio screen:**

| Rank | Action        | Wide pointer                              | Compact / phone         | Behavior when unavailable                         |
| ---- | ------------- | ----------------------------------------- | ----------------------- | ------------------------------------------------- |
| 1    | More          | always                                    | always, last            | never absent                                      |
| 2    | Undo          | fixed slot                                | fixed slot              | `visibility: hidden`, slot reserved               |
| 3    | Redo          | fixed slot                                | fixed slot              | `visibility: hidden`, slot reserved               |
| 4    | Export        | icon plus label at >=1200, icon after     | inside More             | disabled with reason, never removed               |
| 5    | Activity      | slot only when busy in the current design | badge on More           | prefer a persistent slot with a dot; no insertion |
| 6    | Share         | icon after 1200                           | inside More permanently | disabled when no manifest                         |
| 7    | Mount, Random | visible on wide                           | inside More permanently | disabled when no manifest                         |
| 8    | Full screen   | inside More at every size                 | inside More             | never in the bar                                  |
| 9    | Inspect       | playback bar, not header                  | inside More             | n/a                                               |

Rules:

1. An action has one home per layout class. It may move when the class changes (wide to phone), but never within a class because of state, history, capability or job status.
2. Undo and Redo reserve their 44 px slots and use `visibility: hidden` when there is no history. `display: none` would reflow the cluster; `disabled` alone leaves a dead control visible, which is what the owner sees now. Keep them in the tab order only when visible. When history exists but the action is temporarily invalid, show them disabled rather than hidden.
3. Full screen moves into More permanently. It is low-frequency, capability-dependent, and currently the only bar action that can appear or disappear for environmental reasons. Removing it from the bar is the simplest way to make the bar stable, and it costs one tap in a rare flow. This disagrees with the production-experience note that Full screen always stays on the bar; I am flagging that tradeoff rather than silently overriding it.
4. Activity must not insert a new button. Either give it a permanent slot with a dot/count and an idle state, or put its badge on More. A cluster that changes width whenever a job starts is a direct cause of "the bar is crowded and unpredictable."
5. Cap visible actions: at most four right-side slots on phones (More, Undo, Redo, Export or Activity) and at most seven on wide screens. Everything else lives in More, permanently. Share and Export may lose text below 1200 px, but must not change slot or order.
6. More is first-class, not a junk drawer for leftovers that also appear in the bar. If an action is in More on phones, do not also show it in the bar on phones. Today `mobile-share` and `mobile-redo` duplicate `header-share` and `header-redo`; the duplication is hidden by CSS, but it is the mechanism that makes the same action move around.
7. Never hide More. If the cluster overflows, let the name truncate first, then drop labels, then move the lowest-ranked action to More at the next layout class. Test 320, 360, 430, 900, 1200 and 1600 px in both orientations.

Why this beats a HIG-only answer: HIG says put frequent commands in the toolbar and group related actions. That is true, but it does not tell you what to do when capability varies and the viewport is 320 px. The stable-membership model is a stronger fit for a tool that is used on a phone beside a desktop, where users build spatial memory across sessions. A disabled or hidden slot that never moves is easier to learn than an action that is sometimes in the bar and sometimes in More.

### 3.7 Busy and parkable jobs

Paid generation is the hardest case and the one where HIG-only advice fails hardest. Apple says prolonged flows should consider full screen; we cannot, because the user needs the stage while a job runs. The correct model is a monitor, not a modal task:

- Header dismiss is X with the accessible name "Hide". Keep the word "Hide" available as a tooltip and, on the first run, as a one-line hint near the progress. Do not use "Close", which implies stopping, and do not use "Cancel" unless it stops the job.
- If a footer Hide exists, remove the header Hide or vice versa. Today `MoveSheet` has both. One surface, one dismiss affordance.
- A stopping action is destructive and paid: label it "Stop generation" or "Cancel generation", place it as the alert destructive verb, and warn that spent credits are not refunded. `ItemMenu` already does this well; reuse that pattern.
- On hide, keep a persistent Activity button with a spinner/count and a toast action "Show" or "Activity". The job must be findable without reopening the same sheet.
- Do not disable Escape while a job runs unless there is a genuinely blocking save. Escape should mean Hide. `Sheet.svelte` already routes Escape to `onclose`; the fix is the label and the copy, not a new key handler.
- Do not disable backdrop dismissal while a job runs. It should mean Hide too. While a save is genuinely in flight, block dismissal and say so; `cancelDisabled` currently conflates the two.
- When the job finishes while hidden, do not steal focus. Update Activity and show a non-blocking toast; the user returns when ready.

### 3.8 Multi-step flows

- Step 1: no Back. Trailing X closes. If the flow is transactional, the footer primary is disabled with a reason until the step is valid.
- Step 2 and later: leading Back replaces nothing; trailing X stays. This is the one place where two navigation controls coexist, and they mean different things: Back changes step, X leaves the flow.
- Never put Back in the footer. Never show Cancel, Done and Back together in the header (Apple's explicit rule).
- Show step position in the body or as a small subtitle, not by adding a third header control.
- If a step has unsaved input, Back asks once before discarding it. X does the same. Do not silently drop a prepared plan; `FramesSheet` resets `prepared` on close, which is a real data-loss path if the user expected to keep the review open.
- `ExportSheet` is the model to copy: leading Back or Settings, trailing X, footer primary. Its only flaw is that the X and the `cancel` prop duplicate the same callback.

### 3.9 Destructive confirms

- Keep `ConfirmDialog` centered at every size, with `role="alertdialog"`, focus on Cancel, Escape cancels, and Enter never destroys. These are already right.
- Remove backdrop dismissal for alerts. Material alerts and Apple alerts do not dismiss on outside click, and on touch a scrim tap is easy to produce accidentally. The safe exit (Cancel) is already one tap away.
- Title states the object and the act ("Delete character Mae?"). Body states the consequence in one or two lines ("Its outfits and changes are removed from this browser. This cannot be undone."). Do not repeat the title.
- Buttons: Cancel leading, specific verb trailing, danger styling. Never "OK" or "Yes". `DeleteSheet` and `ItemMenu` already do this.
- If the action is blocked, keep the dialog open, explain why, and offer a single escape hatch (view pending work). Do not disable both buttons without a route out. `DeleteSheet` does this well.
- If the action is running, disable both buttons, show progress in the label, and keep the dialog open. A failed cancel stays open with the reason, as `ItemMenu` already does.

### 3.10 Keyboard, focus and dismissal

- Every dialog has a visible close control (APG). This makes the SharePopover non-compliant today: it declares `role="dialog"` with no close button. Either add a trailing X or change the role to a non-dialog region. Given its complexity (preview, picker, three actions), add the X.
- Focus enters at the first field for forms on pointer-fine, which `Sheet.svelte:53` does. For monitors, focus the title or the Hide button, not a disabled action.
- Focus returns to the opener. `Sheet.svelte` already restores the trigger; keep it when the sheet was opened from More and More closes, not just when it was opened from a toolbar button.
- Escape maps to the header dismiss: Close for live, Hide for monitors, Cancel for alerts, Back only if the user explicitly chooses Back.
- Tab is trapped in every modal. Popovers keep light dismiss but still return focus.
- Announce busy changes with a polite live region; do not move focus when a job progresses.
- Do not use `aria-label` to invent a visible label that contradicts the control. If the visible label is an X, the accessible name is Close or Hide; if the visible label is Cancel, the accessible name is Cancel.

## 4. Where I expect to disagree with the HIG-only proposal

| #   | Conventional HIG-only answer                                           | My competing position                                                                                                          | Why it is wrong here                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Put Cancel on the leading edge, text, top left                         | Put the dismiss control trailing as an X, always                                                                               | PixelDoll is a web app; leading is already Back/Settings in three sheets. A leading Cancel next to Back is ambiguous and causes the exact left/right flip the owner reported. Apple's own toolbar guidance prefers the Close symbol. |
| 2   | Use text "Done" for completion                                         | Use X Close for read-only sheets; reserve Done for a real finished step                                                        | Most PixelDoll sheets apply changes live. Done implies a save that already happened and competes with the footer primary. It also does not fit at 360 px beside a title.                                                             |
| 3   | A top close and a footer Cancel are redundant, keep only one           | Remove the footer one when effects are identical; keep both only when the footer means Discard                                 | Fluent and Atlassian disagree with each other. The discriminator is effect, not geometry. PixelDoll's live sheets need only X; its dirty forms need a distinct Discard.                                                              |
| 4   | Primary action belongs in the header (Done trailing)                   | Primary belongs in the footer for every form and paid action                                                                   | The footer carries the cost estimate, file size and readiness note. Moving Generate to the header separates the price from the button, which is unacceptable for real money.                                                         |
| 5   | Footer order follows Apple: Cancel then action; on Windows the inverse | One order everywhere: secondary then primary, never swapped                                                                    | Cross-platform web cannot follow two native orders. NN/g says consistency beats the local optimum. Pick the web-documented order and keep it at every width.                                                                         |
| 6   | Never disable the confirming action; explain instead                   | Disable Generate or Save when a prerequisite, price or required field is missing, with `aria-describedby` and a visible reason | Material's rule assumes a free, simple decision. A paid generation with no estimate or no key must not be clickable.                                                                                                                 |
| 7   | Dialogs should have at most two actions                                | Allow three only on the Monitor class                                                                                          | A running job legitimately needs Hide, Queue another and Try again. The fix is to stop calling it a dialog, not to delete a needed action.                                                                                           |
| 8   | Prolonged work should use a full-screen view instead of a sheet        | Keep a parkable sheet with Hide and a persistent Activity entry                                                                | Full screen would block the stage, which is the context the user needs while waiting. The problem is not sheet modality; it is that the dismiss is mislabeled.                                                                       |
| 9   | X should be used only when there is no Cancel in the footer            | Allow X plus a footer action only when the footer action is not a dismissal                                                    | The X means Hide on a monitor and Close on a live sheet. Neither is Cancel. When both close the same state, delete one.                                                                                                              |
| 10  | A destructive action should be visually prominent, primary styling     | Destructive verb in the primary position but danger styling, never the Enter default                                           | Apple and NN/g both warn against defaulting a destructive action. PixelDoll spends credits and deletes local work; the safe action must win focus and Return.                                                                        |
| 11  | Keep the toolbar full; hide only when there is no room                 | Keep a fixed action membership; hide Undo/Redo with reserved space and put capability-dependent actions in More permanently    | Actions that move between the bar and More destroy spatial memory. A stable, slightly sparser bar is more learnable than a dense bar that reflows.                                                                                   |
| 12  | More is for rarely used overflow; frequent actions stay in the bar     | More is a permanent, labeled home; an action is either always in the bar for that layout class or always in More               | The current breakpoint swapping (Redo and Share at phone, Random and Undo at 430) is the mechanism of the complaint. Duplicating an action in both places and toggling CSS visibility is not a design.                               |

## 5. Concrete inconsistencies found, ranked

1. **Placement is keyed to copy.** `Sheet.svelte:66` moves the dismiss control because the label string is `common.done` or `common.close`. Any state-dependent label change moves the control. Fix: a `dismiss` variant or a `dismissPlacement` prop, never a key comparison.
2. **The same surface presents two dismissals.** `MoveSheet` header Hide plus footer Hide. `ExportSheet` X plus a `cancel` prop that resolve to the same callback. `CreateSheet` passes Close and then renders a custom trailing Close instead of using it. Pick one visible control and keep one code path.
3. **Frames review is mislabeled.** `FramesSheet` uses Cancel in review, but the action returns to the picker step. That is Back. The current code also resets the prepared plan, so the user can lose work while reading the label as "go back."
4. **Share is a dialog with no exit.** `SharePopover` has `role="dialog"` and no close control. APG strongly recommends a visible close button for dialogs. Add one or stop calling it a dialog.
5. **Busy semantics are split.** `MoveSheet` says Hide while running; `SetupSheet` says Hide; `MoveReviewSheet` says Later; `ActivitySheet` says Cancel request; `CreateSheet` says Hide then Close. The user cannot predict whether leaving stops the job.
6. **Top bar membership is viewport-dependent.** Redo and Share leave the bar on phones; Random and Undo leave at 430 px; Full screen disappears when the API is unavailable; Activity appears and disappears with jobs. This is the root of "crowded and unpredictable."
7. **Undo/Redo do not hide.** They are disabled and occupy space. The requested behavior (hidden but reserved) is not implemented in `Toolbar.svelte`.
8. **The grabber promises a gesture that does not exist.** `Sheet.svelte:90` renders a grabber on phones, but no drag handler is attached. Material requires the handle to be operable or absent. Either implement drag or remove the handle.
9. **Backdrop dismiss is inconsistent with platform alert behavior.** `ConfirmDialog` dismisses on scrim click. For a destructive alert, outside click should not be a dismissal path.
10. **`cancelDisabled` mixes saving with running.** A monitor that is running should hide, not refuse to close. A save in flight may refuse. The flag cannot express both, so surfaces pick different behaviors.

## 6. Migration sketch (design only, no code)

1. Add a `surface` variant to `Sheet` with values `transaction`, `live`, `monitor`, `multiStep`. Derive the dismiss control, label and placement from the variant. Delete `cancelTrailing`.
2. Add one `SheetHeader` and one `SheetFooter` layout primitive. Header accepts `back`, `title`, `dismiss`, `secondary`. Footer accepts an ordered action list with `emphasis`. Document the order once.
3. Replace every `cancel={...}` call with the variant plus, only where needed, a translation key for the dismiss accessible name. Keep a single `dismissLabel` override for Hide.
4. Make the top bar a fixed ordered list per layout class. Render hidden-but-reserved slots for Undo/Redo. Move Full screen into More permanently. Replace the `mobile-*` duplicate rows with one source list and a per-class filter.
5. Fix labels in this order: Frames review (Back), MoveSheet (remove duplicate Hide), Activity (Cancel request to footer), Connect (Not now to footer), Create (one Close).
6. Add the Share popover close control.
7. Change Alert backdrop behavior to Escape and explicit buttons only.
8. Only after the structure is stable, revisit the visual treatment (X size, quiet styling, spacing). The theme owns appearance; this work is structure and wording.

## 7. Verification this proposal implies

- One unit test for the variant-to-dismiss mapping: every surface class yields one dismiss control, and its accessible name is one of Close, Hide, Cancel or Back.
- One unit test for the footer order function: LTR and RTL, one/two/three actions, stacked versus row.
- End-to-end for the reported flows only: open a monitor, Hide, confirm the Activity badge persists, reopen from Activity; open Frames review and confirm Back returns to the picker while X closes; open Share and confirm a visible close control focuses and returns focus.
- Visual checks at 320, 360, 430, 768, 1200 and 1600 px, portrait and landscape, dark and light, pointer fine and coarse.
- A screenshot comparison is justified here because the complaint is layout stability, not logic. That is the one place where a visual regression baseline earns its cost.

## 8. Limits and open questions

- I did not run the app or inspect it in a browser, so the exact pixel crowding at 320 px is untested. The `layout.css` breakpoints and the 44 px minimum make the arithmetic tight but plausible.
- I did not audit localization files for label lengths. German and Finnish are the likely breaking cases for header text buttons.
- The owner's note that More "hides on some screens" is not explained by `Toolbar.svelte`, where More is unconditional. It may be clipping by an ancestor with `overflow: hidden`, a `display` rule outside the searched CSS, or a different screen build. Treat it as an unverified report and inspect before changing it.
- Moving Full screen into More contradicts `docs/design/production-experience.md` as quoted in `layout.css:267`. This is a deliberate challenge, not an oversight; it needs an owner decision.
- Three documented web products agree on X top right and primary right, but none of them is a paid, asynchronous generation tool. The monitor class and the Hide verb are my synthesis from NN/g's timer guidance, not a platform standard. They should be validated with a small usability test or at least a click-through of the real flows.

## Sources

- Apple HIG: Sheets, https://developer.apple.com/design/human-interface-guidelines/sheets
- Apple HIG: Alerts, https://developer.apple.com/design/human-interface-guidelines/alerts
- Apple HIG: Toolbars, https://developer.apple.com/design/human-interface-guidelines/toolbars
- Apple HIG: Buttons, https://developer.apple.com/design/human-interface-guidelines/buttons
- Apple HIG: Modality, https://developer.apple.com/design/human-interface-guidelines/modality
- Material 3: Dialogs, https://m3.material.io/components/dialogs/guidelines
- Material 3: Bottom sheets, https://m3.material.io/components/bottom-sheets/guidelines
- Material 3: Buttons, https://m3.material.io/components/buttons/guidelines
- Fluent 2: Dialog, https://fluent2.microsoft.design/components/web/react/core/dialog/usage
- Fluent 2: Button, https://fluent2.microsoft.design/components/web/react/core/button/usage
- Windows dialogs, https://learn.microsoft.com/en-us/windows/apps/design/controls/dialogs-and-flyouts/dialogs
- WAI-ARIA APG: Dialog (Modal), https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- WAI-ARIA APG: Alert Dialog, https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/
- NN/g: Cancel vs Close, https://www.nngroup.com/articles/cancel-vs-close/
- NN/g: OK-Cancel or Cancel-OK, https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/
- NN/g: Confirmation Dialogs, https://www.nngroup.com/articles/confirmation-dialog/
- NN/g: Modal and Nonmodal Dialogs, https://www.nngroup.com/articles/modal-nonmodal-dialog/
- GitHub Primer: Dialog guidelines, https://primer.style/product/components/dialog/guidelines/
- Atlassian Design System: Modal dialog, https://atlassian.design/components/modal-dialog/usage
- Shopify Polaris: Modal, https://shopify.dev/docs/api/app-home/latest/web-components/overlays/modal
- Shopify Polaris React: Modal, https://polaris.shopify.com/components/modal
