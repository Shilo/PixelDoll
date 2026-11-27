# First-run onboarding: tips

Decided 2026-11-26 and revised the same day into a reusable tips module. This record replaces the unmounted full-screen
Welcome page and the unmerged hint-card attempt on `t3/quickstart-onboarding` (commits `e4254ec57`, `83cbc9022`).

## What ships

1. **Characters, first visit.** The app opens on Characters with the bundled Adventurer selected; the first tip points
   at its Customize button. Characters stays the first screen: it shows both paths (the demo and Add character) and is
   where saved characters live.
2. **No pre-release warning on a first visit.** The startup "Saved characters may stop working" toast waits for a later
   visit (its own `pixeldoll.visited` flag, independent of tips). Any saved character or an unreadable library shows it
   at once.
3. **Create says it is paid before the form.** The Add character menu's Create row reads "Needs a PixelLab key and
   uses paid generations" under its label (its accessible description).
4. **Nine tips, one at a time,** each an arrow callout on the control it is about, with the Bronze UI accent rim. Each
   is stored once by id, whatever control it points at on a given screen size. When several apply, the lower number
   shows; the tip on screen stays while it still applies.

   | #   | Tip                    | Points at                                                                                | Shows when                                                                                                  | Done when                                                         |
   | --- | ---------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
   | 1   | Dress up the demo      | Customize on Characters                                                                  | Demo selected; only the demo saved and nothing being created (or tips asked for again)                      | Any character's Customize opens, by any control                   |
   | 2   | Make your own          | Add character on Characters                                                              | Same library rule, on a later arrival on Characters after #1 is done (not in the same breath as closing #1) | The Add character menu opens, or a character of your own is saved |
   | 3   | What is PixelLab?      | Start free trial in Connect's first-open guide (Get Secret API Key on later opens)       | Connect's key form                                                                                          | A PixelLab link followed, a key typed or pasted, or a connection  |
   | 4   | Try on gear            | A whole Wardrobe tile: unworn first (ready for the move on screen first), then worn      | Any character's Customize, in Preview, Wardrobe open                                                        | The outfit changes from what was worn on arrival                  |
   | 5   | Take it into your game | Export, or More options when the bar has moved Export into it                            | Same place, after #4                                                                                        | Export opens                                                      |
   | 6   | Add gear               | A slot's + (the New tile is easy to find and disappears once the slot has gear; + stays) | Your own character's Wardrobe (never the bundled demo)                                                      | New item opens                                                    |
   | 7   | Fit gear to this move  | The ⋮ of a move whose menu offers Generate items, kept visible while the tip shows       | Your own character's Moves                                                                                  | Generate items opens                                              |
   | 8   | Add a move             | New move                                                                                 | Your own character's Moves                                                                                  | New move is pressed                                               |
   | 9   | Add a state            | New State                                                                                | Your own character's States                                                                                 | New State is pressed                                              |

   Every tip also ends on its X. A tip's action ends it even when it never showed. Someone who creates a character
   first never sees #2; on that character's empty Wardrobe, #6 comes first and #4 follows once an item exists. An
   editable copy of the demo counts as your own character. #6 to #9 show at most one per arrival on a tab: on Moves,
   #7 comes first when a move's gear lacks frames for it, and #8 waits until the person leaves the tab and comes back.

   Copy marks control names and key words in bold (`**…**` in the strings), and `{more}` / `{menu}` draw the More
   options (⋯) and row menu (⋮) icons inline, so people can tell which words name something on screen.

5. **Show tips again** clears every done tip and lets them show again from where the person is (nothing navigates).
   Tips that otherwise greet only a newcomer show for the rest of that visit. It is in **More options > Help** and
   **Settings > Appearance** (searchable). Workspace copies (someone's backup opened for a look) never show tips and
   hide both rows.

## How it is built

The tips system observes the app and the page; the app never reports to it. Svelte runes are already signals, so
tips read existing app state read-only instead of the app emitting tip events.

- `app/src/studio/tips/tips.svelte.ts` stores done tip ids in `localStorage['pixeldoll.tips']` (a JSON array; unknown
  ids are ignored; blocked storage keeps them for the visit only) and offers `showTipsAgain()`.
- `app/src/studio/tips/catalog.svelte.ts` defines every tip in priority order: `anchor` (finds the control), `placement`
  (preferred side; flips to the opposite side, then across), `when` (the app context), `after` (tips done first),
  `doneWhen` (app state meaning the action happened) and `doneOn` (controls whose press, typing or paste means it
  happened), `fallbacks` (sides to try when the preferred one has no room), `reveal` (point at a hover-only control and
  keep it shown) and `onePerVisit`, plus copy keys. Conditions only read app state and the page.
- `app/src/studio/tips/TipsHost.svelte`, mounted once in Studio, completes tips on a rising `doneWhen` (so a reset is
  never consumed by a state that already held) or a delegated `doneOn` event, and shows at most one tip: the first
  whose context holds and whose control is whole on screen (`visibility.ts`) and not under an open dialog or menu.
  After an X it stays quiet until the screen, mode, tab, sheet or character changes. It looks again on DOM changes,
  scrolling, resizing and menu toggles, one frame later.
- `app/src/studio/tips/Tip.svelte` draws one tip in its control's layer (inside an open dialog when the control is in
  one) with floating-ui, announces it once and never takes focus.
- App-side integration is only the `<TipsHost />` mount, the two Show tips again rows and four `data-tip-anchor`
  attributes where no stable selector existed (slot +, New move, New State, Generate items). Deleting `tips/` and those
  lines leaves the app working unchanged.

## Why per-tip state, and not "seen" or a single flag

- A single "onboarded" flag cannot say which tip is still useful, so closing one tip would end all of them, and adding
  a tip later would never reach people who finished the old set.
- Recording a tip when it is **shown** loses it when the person never noticed it (navigated away, a menu covered it).
  A tip is recorded when it is **done**: the person did what it suggests, or closed it. That is Apple TipKit's model
  (a tip is invalidated by the action, not by display).
- No display counter, no per-visit cap and no "turn tips off" setting: each tip ends on a single action and the
  discovery tips appear only where their feature is, so a cap would only hide them from people who need them later
  (KISS). Show tips again is the one control people need.

## Placement

- Every tip points at its control: the arrow tip lands on it, centered when space allows. Default side is below; a
  tip names another side when below would cover what it is about (the gear tip goes above its tile so the gear list
  stays visible; the PixelLab tip goes above its button so the key field stays usable). With no room it flips to the
  opposite side, then the sides across.
- A tip may cover nearby controls until it is done or closed: pointing at the exact control is worth more than keeping
  every neighbor clear. It never covers its own control or takes focus. Tips wait in Top-down and Side-scroller (game controls) and while a sheet or menu is
  open over them.
- The tip is a plain fixed layer, not a popover: the app reads an open popover as an open menu and pauses stage keys,
  scene zoom and refocusing for it. It is drawn at the end of the page (or of the open dialog), out of reach of
  transformed or clipping app containers; keyboard order is mended by hand: Tab from the control reaches the tip's X,
  and Tab from the X carries on after the control. Tips never take focus, and closing one by keyboard returns focus to
  its control.
- A control counts as on screen only when it is whole inside the viewport and every clipping ancestor, not inert, and
  actually on top at its center (a sticky header over it hides it). Open sheets and menus hold tips back; passing hints
  (help tooltips, drag previews) do not.
- Checked at 1280 x 800, 1440 x 900, 390 x 844, 844 x 390 and 320 x 568, dark and light, English and German (also by a
  GPT 6.2 Sol hands-on pass with screenshots). At 320 x 568 the collapsed Wardrobe sheet is shorter than a tile plus
  its sticky section header, so the gear tip waits until the sheet is expanded rather than point at a covered tile.
  With a phone held sideways, the PixelLab tip sits beside Start free trial so the key field stays clear.

## Best practices for future onboarding

1. **Teach in the real product.** Use the working demo, not screens about it. Skip splash pages, slideshows and tours.
2. **One idea per tip, at most a few tips.** Teach the core loop only; leave the rest to discovery and the user guide.
3. **Point at the exact control.** The arrow must land on the thing the tip names, so nobody has to search. If the
   control is not on screen, wait; never point at a region, a list or an edge.
4. **End on the action.** Complete a tip when the person does what it suggests, even if the tip was not visible.
   Never require a Next button.
5. **One at a time.** Order tips by prerequisite (a later tip waits for the earlier one to be done).
6. **Never block.** No scrim, no focus theft, no covering the control or the field needed next. Pause in modes where
   the tip would compete (live views, open menus). Zoom does not matter: tips point at controls, which zoom never moves.
7. **Persist per tip, by completion.** Store done ids, not "seen". Unknown ids are ignored, so tips can be added or
   removed without migrations.
8. **Always recoverable.** X closes one tip for good; Help > Show tips again restores them all.
9. **Respect who already knows.** Tips that start on their own target newcomers (nothing saved, first open of
   Connect); anyone can ask for them again.
10. **Accessible.** Announce each tip once through a polite status region; the X is a real 44 px button with a label;
    closing by keyboard hands focus to the control; reduced motion removes the fade.
11. **Copy:** title states the goal ("Take it into your game"), body says the action in one sentence and discloses
    cost where it applies ("using generations from your PixelLab account").

## Why this form

| Option                                   | Verdict                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Full-screen welcome or slideshow         | Rejected. Delays the first edit, hides the character, and is mostly skipped; nothing here needs setup first. |
| Coach-mark tour with Next buttons        | Rejected. Interrupts, teaches controls before they matter, and overlays tend to cover what they explain.     |
| Checklist panel                          | Rejected. A second interface competing with the Wardrobe for a two-step loop.                                |
| Hint cards inside the Wardrobe (earlier) | Rejected. Pushed gear down 84 px at 390 x 844, lived only in Wardrobe, took focus and broke WASD.            |
| Preset helmet and relabeled tile         | Rejected. Changes the demo's saved look and ties a generic tile to one outfit.                               |
| Anchored, self-ending tips (chosen)      | The real demo is the lesson; a few cues cover the loop (swap gear, export layers, meet PixelLab).            |

Evidence: Apple HIG [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) (teach by
doing, keep it brief and optional), [Onboarding for games](https://developer.apple.com/app-store/onboarding-for-games/)
(start at launch, one step at a time, replayable), WWDC23
[Make features discoverable with TipKit](https://developer.apple.com/videos/play/wwdc2023/10229/) (short actionable
tips, invalidate on the action, never several at once), NN/g [mobile tutorials](https://www.nngroup.com/articles/mobile-tutorials/)
(70-user test: tutorials did not improve success and made tasks feel harder) and
[onboarding tutorials](https://www.nngroup.com/articles/onboarding-tutorials/) (pull over push, easy dismiss and
recall). Precedents for sample-first: Linear's demo workspace, Figma's starter files, Procreate's sample art.

## History

- First version (`ba177d921`, `5c3900eed`): two demo tips kept inside the open scene, beside the panel. GPT 6.2 Sol
  reviewed it (replay, keyboard order, small-phone overlap and copy fixes adopted).
- Revision: the owner found the tips did not always point at their control (the gear tip pointed at the panel edge
  level with the Empty tile; on phones the Export tip sat below the view switch with no arrow). Tips now point straight
  at their control, the system became a module with per-tip saved state and Show tips again, and Connect gained the
  PixelLab tip.
- Decoupling: tips moved from components spread across the app into one catalog and host that observe the app, with
  the Make your own tip and four own-character tips added. Designed and reviewed with GPT 6.2 Sol.

## Untested assumptions

- No first-time-user study; the flow was checked in the browser and by end-to-end tests.
- Screen-reader announcement was checked through the accessibility tree, not with a live screen reader.
- Importing a move or State from a ZIP does not end the Add a move or Add a state tip; only their buttons do.
- On a first visit the gear tip points at the Wizard hat, the demo's only unworn item. It lacks some frames, so its
  back view hides it with a "missing frames" note; trying on something new was judged worth that.
