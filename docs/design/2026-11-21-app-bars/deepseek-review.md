# Review: app bars and surface chrome draft contract

Role: review sub-agent for the merged draft. Reviewed `plan.md`, `mockup.html`, `deepseek-research.md`, `sol-research.md`, and the current components under `app/src/studio/`. I wrote no code, ran no tests, builds or servers, and did not touch the board. Every file line cited below was read in this checkout.

Verdict: the structural core is right and should be approved after the blocking fixes in section 3. The contract is currently too small for the surfaces it governs (footers with three real actions, monitor footers with no commit, dirty exits) and too confident about two things it does not control (Fullscreen API availability, browser Back for the converted New character screen). The mockup also carries one false claim and several CSS rules that contradict the plan's own phone and wrapping rules.

## 1. What the draft gets right

- Meaning replaces copy: `cancelTrailing` in `Sheet.svelte:66` is the mechanical cause of side drift. Removing label-keyed placement and free-form `leading`/`trailing` is the correct root fix.
- One X at logical end, one Back at logical start, no text dismiss, no Cancel in a footer, fixed secondary then primary, centered alerts with the safe action focused: these are coherent, teachable and match the strongest web evidence.
- Undo/Redo reserved with `visibility: hidden` plus `disabled` is exactly what the owner asked for and is strictly better than today (`Toolbar.svelte:295`, `:303`).
- Capping the alert at two actions and keeping PaidReview-style confirms out of the sheet chrome is right.

## 2. My earlier positions, revisited

I withdraw three of four. The owner's demand outranks my earlier preferences, and the draft's choices are defensible once the gaps below are fixed.

1. **Full screen in More: withdraw.** The owner explicitly wants Full screen and More always visible, so moving Full screen into More fights the brief. But the draft's promise is still false as written (finding 8): the control is capability-gated at runtime, so "pinned on every screen and width" does not hold. Fix the capability gap, do not move the control.

2. **Hide as a visible verb: revise and effectively withdraw.** One X with one accessible name is the consistent answer. Keep `Close` everywhere, and carry the consequence with `aria-describedby` on the body note (`Keeps running in Activity`) for monitors, and the dirty-exit prompt for forms. Screen readers then get "Close, keeps running in Activity" without a second visible or spoken label that changes per state. That is better than my earlier "Hide" name and better than a bare `Close`.

3. **Stacked phone footers with primary on top: withdraw.** One row with the note above it is more predictable, matches "never swapped", and is a smaller change from the desktop row than a direction flip. Two conditions: the buttons must actually wrap (finding 15), and no destructive primary may live in a phone footer (finding 16). Today the phone footer already stacks via `column-reverse` (`studio.css:1291-1293`), so the draft knowingly changes this; that is acceptable, but it must be called out as a visible change, not an incidental one.

4. **Footer "Not now": withdraw with one condition.** The Connect form is the surface itself, nothing is lost by leaving, and the entry point persists in More and the character menu. A text "Not now" next to X is exactly the duplicate the owner wants gone. Condition: the Connect body must say the connection can be made later, and the contract must resolve where Connect's commit lives (finding 10).

## 3. Blocking contract defects

**1. `SurfaceActions` cannot express footers that already exist.** The plan gives it `note?`, `secondary?`, `primary` (`plan.md:54`). Real footers need more: `FramesSheet.svelte:439-470` renders Restore (quiet), Download (outline) and Import (primary) in one footer; `SharePopover`'s footer has Copy PNG, Share to, Download, and the plan's own mockup draws all three (`mockup.html:241`); `AdjustFrameSheet` has Download backup plus Save; `MoveSheet.svelte:1331-1370` has Cancel, New setup, Generate again. Fix: add an `extra` slot rendered between the note and the secondary, restricted to quiet or outline styling, and state that exactly one action may carry primary and it is always last. Keep the two-action cap for alerts only. Alternatively enumerate each three-action footer and say which action moves into the body; silence here guarantees drift back.

**2. Monitor footers have no commit, but primary is required.** The plan's running row says Stop generating is an explicit footer secondary (`plan.md:20`); the Add move row shows `[note] [Stop generating...] [Generate]` (`plan.md:43`); the running code has no Generate, its footer is note, Queue another, Hide (`MoveSheet.svelte:1372-1379`); and the mockup promotes Queue another to a filled primary (`mockup.html:200`), making the loudest control on a running job a new paid action. Fix: make `primary` optional; define the monitor footer as note plus Stop generating (quiet danger) only, with Queue another as an `extra` or a body action; separate the form row and the running row in the changes table.

**3. X on a dirty transaction silently discards work, and no rule covers it.** Removing every footer Cancel (`plan.md:17`) is right, but the plan never says what X does to unsaved input. `FramesSheet` resets a prepared review on close, `SlotsSheet`, `NewItemSheet` and `CreateSheet` hold typed input, and `StateCaptureSheet` already warns before a discard. Fix: add a Dirty exit row. X, Back, backdrop, Escape and browser Back at a dirty root ask once through `ConfirmDialog` with the safe action focused ("Keep editing") and a specific destructive verb ("Discard"). List the dirty surfaces. This is the largest behavior hole in the draft.

**4. Browser Back is absent from the contract and the New character screen would break it.** `Studio.svelte:195-231` pushes one history entry per open sheet and consumes `popstate`; `ui.sheetBusy` and `backFromSettings()` arbitrate. A screen is not a sheet, so on the New character screen the phone's main exit would leave the app and drop the draft. Fix: add a Browser Back row; the screen pushes its own entry and pops to its opener under the same leave guard, and Back walks one pane before the root exit.

**5. "Back to Characters" is wrong at three of the entry points.** Create is opened from the Characters bar and the character menu (`Toolbar.svelte:268`, `:676`), from `NewItemSheet.svelte:257`, `StageNote.svelte:151` and `Welcome.svelte:30`. Fix: capture the return screen in state, return there, and state whether the previously open sheet is reopened (do not reopen it; keep the create draft instead).

**6. The screen conversion is a routing change with a closed union behind it.** `Screen` is `'characters' | 'studio'` (`geometry.ts:5`), `layout()` branches on it (`:93-152`), Toast placement calls `layout()` with the screen (`Toast.svelte:87`), Experience's focus effect assumes two screens (`Experience.svelte:495-502`), and Toolbar branches on `screen === 'studio'` in about a dozen places. Fix: either add the third screen and list every derived dependency plus the required full end-to-end run, or keep the existing full-viewport sheet and accept that global bar actions are unavailable during creation. Make that an explicit owner decision, not a line in the component plan.

**7. `locked` does not preserve `cancelDisabled`'s second job.** `Sheet.svelte:42` publishes `ui.sheetBusy`, which `Studio.svelte:225` uses to hold browser Back; `DeleteSheet.svelte:16` sets it outside Sheet. Fix: state that `locked` still sets `ui.sheetBusy`, that alerts keep doing so, and that `locked` may only mean an atomic local write. Audit the callers so a running job never locks the exit. Otherwise the plan's "X stays enabled while a generation runs" and "X is disabled while saving" cannot both be implemented.

**8. Full screen availability contradicts the pinned promise.** `FullscreenButton.svelte:64` renders nothing unless `available`, recomputed on `fullscreenchange` and `display-mode` change (`:20-35`). The bar loses a 44 px item and More moves, which is the owner's complaint. Fix: always render the slot; when the API is unavailable or a request is pending, keep the geometry with `visibility: hidden` and `aria-hidden` and keep More fixed, and explain availability in More. If "always visible" is literal, the alternative is a CSS fill-viewport fallback, which is more work and needs an owner decision.

**9. Settings, Export and Account still have two different exits, and the plan does not resolve the origin model.** `settingsNavigation.svelte.ts:54-111` tracks `fromExport`, `accountOpen`, `activityOpen` and `exportOpen`; browser Back uses `backFromSettings()` (`Studio.svelte:225`) while Escape uses the sheet's `onclose`. X, Back and browser Back must not diverge. Fix: define task root versus inner pane per surface (Export's root is Export; Settings opened from Export, Account opened from Settings, Activity opened from Settings are inner panes), and route Escape, X and browser Back through one root-exit function that consults that stack.

**10. Connect's commit lives in the body, which contradicts the footer rule.** The plan says a footer exists only when there is a commit (`plan.md:16`), but `ConnectSheet` keeps Connect/Replace in the form row and gets no footer in the changes table (`plan.md:46`). Same for Setup, Rename, Add slot and `NewStatePanel`. Fix: either give every committing form a `SurfaceActions` footer, or add a stated exception for form submits that belong to the field they submit, and say which surfaces are exempt.

**11. Toast chrome is already owned by Bronze.** `Toast.svelte:18-20` only relabels `.bu-notice-dismiss`; Bronze renders that X last with a 44 px control (`Notice.svelte`, `components.css:120`). The plan makes `CloseButton.svelte` "the single X (sheet, popover, toast)" (`plan.md:55`). Using it inside a toast would replace or duplicate theme-owned chrome, which AGENTS.md forbids. Fix: state that Toast keeps Bronze's dismiss control, that the plan only asserts its order and localized name, and drop toast from `CloseButton`'s scope.

## 4. Accessibility and semantics

**12. Initial focus is unspecified, and the new header makes the default worse.** `Sheet.svelte:53` focuses the first text field only on fine pointers; otherwise native `showModal()` focuses the first focusable element, which after this change is Back or X. Keyboard and screen-reader users would land on the exit control before the title. Fix: define focus per class. Form: first field on fine pointers, heading (`tabindex=-1`) on coarse or long content. Monitor, read-only and list panes: heading. Alert: safe action (already correct, `ConfirmDialog.svelte:48`). Menu: first item. Popover panel: heading or first control. Toast: never focus.

**13. A disabled X during a save is a dead target with no reason.** `plan.md:19` disables X and Back; `Sheet.svelte:95` already does this to the text control. Fix: keep the X enabled and route it through the same leave guard, announce "Saving..." in the existing status region, and close when the write settles; if it must be disabled, give it `aria-describedby` pointing at the busy note and keep the 44 px target. Never disable the only exit silently.

**14. Consequence text must be programmatically tied to X.** The monitor's "Keeps running in Activity" and the dirty-exit prompt are the only places a user learns that X does not stop or save. Fix: give the X an `aria-describedby` to that note in the monitor, and to the guard's description in the dirty case. This replaces the retired Hide name without changing the visual control.

**15. Icon-only tools need names, and focus order must be stated.** The tools slot (API, wardrobe) is icon-only and sits between the title and X (`plan.md:15`). Fix: require an accessible name and tooltip per tool icon, and state the header's DOM order (back, title/field, tools, close) so tab order matches visual order in LTR and RTL.

## 5. Keyboard and focus

**16. Escape ownership is implicit and collides with four existing handlers.** `Sheet.svelte:82-85` handles cancel and backdrop; `ConfirmDialog.svelte:66` stops keydown; `Experience.svelte:505-535` owns Escape and Backspace with a fullscreen guard; `ItemMenu.svelte:338` returns to the parent menu on Escape; `ApiPeek.svelte:221` has its own. The plan mentions Escape only for menus, confirms and the busy lock. Fix: add an Escape row with a one-owner chain (innermost open popover or menu, then open alert, then sheet or screen root), forbid new surface-local handlers, and state that Escape never exits fullscreen through the app and is inert during a lock.

**17. Enter in forms is undefined while `SurfaceActions` advertises native form submit.** Fix: state that alerts are not forms, the safe button holds focus, Enter never activates the destructive action, and every header control is `type="button"` so it cannot submit an enclosing form. `ConfirmDialog.svelte:79-88` already behaves correctly; the contract must keep it that way.

**18. Backspace on a screen is undefined.** `Experience.svelte:531-534` returns to Characters only when `screen === 'studio'`; a new screen changes that. Fix: Escape does nothing on a clean screen, Backspace stays native inside fields, and browser Back is the exit.

## 6. Touch, software keyboard, safe areas

**19. The mockup forbids the wrapping the plan requires.** `mockup.html:23` sets `height: 44px` and `white-space: nowrap`; `mockup.html:62-64` makes the note take a full phone row and the buttons `flex: 1`. The first rule wins, so long labels overflow. German `Weitere Animation vormerken` (27 characters) next to `Abbrechen` at 320 px cannot fit one line. Fix: `min-height: 44px; height: auto; white-space: normal; overflow-wrap: anywhere; min-width: 0`, equal heights for the row, and a 320 px German check.

**20. The phone footer can sit under the software keyboard.** `app/index.html` has no `interactive-widget=resizes-content`, so `dvh` does not shrink for the keyboard on Android Chrome and a fixed bottom-sheet footer can be covered. Fix: choose one mechanism (the viewport hint, or sizing the sheet from `visualViewport.height`) and add the "narrow translated footer with the keyboard open" scenario to acceptance.

**21. Safe area insets are inert today.** `app/index.html` has no `viewport-fit=cover`, so `env(safe-area-inset-bottom)` (`studio.css:1203`) resolves to 0. Fix: do not add `viewport-fit=cover` in this work, because it would change every screen. State that the footer clears the browser chrome through the default inset, and treat edge-to-edge as separate work.

**22. Destructive primaries must not sit in a phone footer.** A one-row footer puts a filled destructive button at the bottom right, the easiest accident for a thumb. Fix: destructive commits stay in centered alerts (Cancel plus named action); any footer primary that would destroy must open a confirm instead.

**23. Menu rows are below the 44 px floor and are not in scope.** `mockup.html:75` gives menu rows 9 px vertical padding at 14 px text, about 34 px. Menus are the most-tapped phone lists. Fix: state whether menu row height is in scope; if yes, it belongs in the Bronze row recipe, not local CSS.

## 7. Localization

**24. `common.back` does not exist.** `app/src/locales/en.json` has `common.close`, `common.cancel`, `common.hide`, `common.done`, `common.discard`, but no `common.back`; today "Back" only exists as `moveSheet.skeleton.back`. Fix: name the new key, add it to all 11 locales and the glossary, and reuse `toast.dismiss` ("Dismiss notification") rather than inventing "Dismiss".

**25. Retiring labels leaves live call sites.** `common.hide` is still used at `MoveSheet.svelte:1378` and `SetupSheet.svelte:281`; `sheet.later` at `SetupSheet.svelte:120` and `MoveReviewSheet.svelte:324`; `connectSheet.notNow` at `ConnectSheet.svelte:189`; `common.done` as a header dismiss at `DetailsSheet.svelte:58`, `GenCard.svelte:231`, `ItemPane.svelte:332`, `StageNote.svelte:101` and `WorkspaceSheet.svelte:20`. Fix: update those call sites in the same change, keep alert Cancel, and delete only the header and footer uses.

**26. "Done" is specified three ways on one page.** `plan.md:17` forbids Done in a footer, `plan.md:24` allows it as a primary that finishes a flow, and `mockup.html:276` retires it only as a dismiss button. `MoveSheet.svelte:1304-1312` is a legitimate single Done primary. Fix: forbid Done only as a dismiss or secondary control and say so once.

**27. Ellipses invent a second convention.** The mockup adds `...` to Stop generating, Queue another, New character, Details and Try again. The app marks surfaces that open another surface with `SurfaceChevron` and `openerLabel`, not with ellipses. Fix: drop the ellipses from commands; keep chevrons for openers.

**28. RTL is asserted but untestable.** The locales are de, en, es, fr, id, ja, ko, pt-BR, tr and zh-Hans; none is RTL. Fix: keep logical properties as a code requirement, require the physical Back chevron to flip under `[dir=rtl]`, and mark RTL as reviewed by inspection only, not as an acceptance criterion.

## 8. Flows in app/src/studio the plan breaks or forgot

**29. Create drops its three flow states.** The changes table lists only the form (`plan.md:40`), but `CreateSheet.svelte:202` switches Cancel, Hide and Close across form, running and saved. Under a screen: define Back while running (return to the opener, job continues, Activity entry), Back after failure (failed run stays recoverable), Back after success (project opens), and keep the paid review (`PaidReview.svelte`) intact.

**30. Create loses two header controls.** The Name field lives in the heading slot and the wardrobe-visibility button in the trailing slot (`CreateSheet.svelte`, `creation-wardrobe`). A screen has no sheet header, so both need a home. Fix: name it (name in the form, wardrobe visibility in More or a body disclosure) in the changes table.

**31. Every entry into Create now needs a draft and return path.** `Welcome.svelte:30`, `NewItemSheet.svelte:257` and `StageNote.svelte:151` open Create from inside other flows. Since More and Settings are reachable from the new screen, an in-progress form must survive those detours (`formDrafts.character` is consumed on mount today). Fix: state draft persistence across Settings, Language and More, and clear it only on discard or success.

**32. Settings' "Reset all" would move to the end of a long body.** The plan moves it out of the header (`plan.md:42`) but the body is sectioned and scrollable. Fix: place it at the end of the General section, as the mockup does (`mockup.html:192`), not at the end of the whole body, and keep the confirm.

**33. Body commits are not classified.** `ItemPane` and `GenCard` keep Wear, Keep, Generate again and Discard in the body, and the plan must not pull them into footers to satisfy the commit rule. Fix: add a sentence that body commits are content and stay in the body, with the listed surfaces.

**34. Activity's waiting-for-tab state is the riskiest label move.** Today the header says Cancel request (`ActivitySheet.svelte:140`). Moving it to the body is right, but leaving must not silently cancel or strand a handover. Fix: specify the waiting state as a body action with a live status and say what X does while waiting.

**35. Frames review loses prepared work on X.** `FramesSheet.svelte:223` locks during busy, and closing a prepared review discards it. Fix: cover it with the dirty-exit rule from finding 3.

**36. Toast placement on a screen needs a check.** `Toast.svelte:79-99` uses `sheetBox` inside a dialog and `layout()` outside it; on the New character screen the toast must not land under the fixed action bar. Fix: add it to acceptance.

## 9. Mockup and evidence defects

**37. The delete alert promises an undo that does not exist.** `mockup.html:230` says "You can undo from the toast"; character deletion has no undo (`DeleteSheet.svelte` copy says the outfits and changes are removed; only imports, frame restore and adjust frame offer toast undo). Fix the copy or restrict that sentence to the surfaces that do.

**38. Share is drawn as a sheet but implemented as a light-dismiss popover.** `SharePopover.svelte:304-310` is a nonmodal popover with `role="dialog"`, no X, and first focus on the clip trigger (`:250`). Give X and a header, but keep outside press and Escape as exits, keep first focus where it is, and decide whether compact portrait converts it to a sheet (sol's proposal) or keeps it anchored. The plan currently implies sheet chrome without saying which dismissal model wins.

**39. The mockup's bar omits two live actions and disagrees with itself on Activity.** The normative order (`plan.md:28`) omits Mount settings and Random look (`Toolbar.svelte:270-289`), and the Characters mockup omits Activity although `Toolbar.svelte:326-340` renders it on both screens. Fix: make the order list exhaustive, and say whether Characters has a transient slot.

**40. The phone bar mockup contradicts the overflow rule.** `mockup.html:159` shows an Undo ghost slot at a 300 px width, but `layout.css:297-302` moves Undo into More below 430 px. Fix the mockup to the rule, then test 320, 360, 430 and 431 px with a running job.

## 10. Acceptance checks to add

- 320, 360, 430, 768 and 1200 px, both themes, with a running job and an empty history stack: More never moves; no bar item is clipped; Undo/Redo slots never collapse.
- iPhone Safari and a PWA window: Full screen absent does not move More.
- A dirty form and a prepared Frames review: X, Back, Escape, backdrop and browser Back each ask once and discard only after confirmation.
- A running Add move: X hides, the job appears in Activity, Stop generating opens the paid confirm, and no footer action gains primary emphasis.
- Open Create from Characters, from the character menu, from New item and from Welcome: Back returns to the invoking screen with the draft; browser Back matches.
- Export, then Settings, then Account: Back, X and browser Back each take one documented step and never jump to a different origin.
- German at 320 px with the software keyboard open: the footer stays reachable and labels wrap without truncation.
- Screen reader pass: X's name and description, alert role and description, heading focus per surface, and focus return to the opener including from More.

## 11. Limits

No browser, screen reader, keyboard, RTL or real-device test was run. Label-length evidence comes from key lengths in `app/src/locales/*.json`, not rendered text. The Full screen fallback decision is an owner call. The `screen` conversion cost is estimated from the closed union and the dependent `screen === 'studio'` branches, not from a build. The claim that Frames review discards prepared work on close is from the earlier audit plus `FramesSheet.svelte:223`; recheck it when implementing the dirty guard.
