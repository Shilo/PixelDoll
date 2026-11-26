# First-run onboarding: tips

Decided 2026-11-26 and revised the same day into a reusable tips module. This record replaces the unmounted full-screen
Welcome page and the unmerged hint-card attempt on `t3/quickstart-onboarding` (commits `e4254ec57`, `83cbc9022`).

## What ships

1. **Characters, first visit.** The app still opens straight on the bundled Adventurer. With only the demo in the
   library and the Export tip not done, one quiet line sits above Customize: "Try on gear, then export it for your
   game. No PixelLab key needed."
2. **No pre-release warning while a newcomer is trying the demo.** The startup "Saved characters may stop working"
   toast waits while the demo tips are unfinished and nothing is saved. Any saved character or an unreadable library
   shows it as before.
3. **Create from scratch says it is paid before the form.** The New character menu row reads "Needs a PixelLab key and
   uses paid generations" under its label (its accessible description).
4. **Three tips, one at a time,** each an arrow callout on the control it is about:

   | Tip                        | Points at                                                                         | Shows when                                                              | Done when                                             |
   | -------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
   | **Try on gear**            | A whole Wardrobe tile with frames for the move on screen; an unworn one first     | Demo's Customize, Preview at normal zoom, Wardrobe open, for a newcomer | Any outfit change, shown or not; or its X             |
   | **Take it into your game** | Export, or More options when the bar has moved Export into it ("Find Export in…") | Same place, once the gear tip is done                                   | Export opens; or its X                                |
   | **What is PixelLab?**      | The "Powered by PixelLab" link in Connect (to pixellab.ai)                        | Connect's key form on its first open (the welcome view)                 | Any PixelLab link followed, a key connected; or its X |

   Copy for the third: "An AI pixel art service that draws the characters and gear you create here, using generations
   from your PixelLab account." It sits above the link, over small print only, so the key field, free-trial button and
   Connect stay clear.

5. **Help > Show tips again** clears every done tip, opens the demo's Customize in Preview with the Wardrobe, and lets
   tips show this visit even for someone who is no longer a newcomer. The request is used up at once, so it never acts
   on a later press. Workspace copies (someone's backup opened for a look) never show tips and hide the row.

## How it is built

- `app/src/studio/tips/tips.svelte.ts` owns the state: the done tips, which tip is on screen, and the Show again
  request. It is the only code that reads or writes `localStorage['pixeldoll.tips']`, a JSON array of done tip ids
  (unknown ids are ignored; blocked storage keeps done tips for the visit only).
- `app/src/studio/tips/Tip.svelte` is the one generic callout: `id`, `anchor()` (finds the control, or null), `title`,
  `body`, preferred `placement` and an app `when` condition. It shows while not done, `when` holds and the anchor is on
  screen; only one tip holds the screen at a time. It re-finds its anchor on reactive changes, DOM changes, scroll and
  resize, places itself with floating-ui (`offset`, `flip` to the opposite side and then the other two, `shift`,
  `arrow`, `hide`), and waits while the anchor is clipped or scrolled away. Its X completes it.
- The app only reports actions and decides where a tip belongs: `experience/DemoTips.svelte` holds the two demo tips
  and their completion rules (mounted only in the demo's Customize); `ConnectSheet.svelte` holds the PixelLab tip.
  Experience handles the Show again navigation. Removing a tip is deleting its `<Tip>`; nothing else in the app reads
  tip state except the Characters note and the toast deferral, which ask `tipDone('export')`.

## Why per-tip state, and not "seen" or a single flag

- A single "onboarded" flag cannot say which tip is still useful, so closing one tip would end all of them, and adding
  a tip later would never reach people who finished the old set.
- Recording a tip when it is **shown** loses it when the person never noticed it (navigated away, a menu covered it).
  A tip is recorded when it is **done**: the person did what it suggests, or closed it. That is Apple TipKit's model
  (a tip is invalidated by the action, not by display).
- No display counter, no "turn tips off" setting: with three tips that each end on a single action, both would be
  options without a need (KISS). Show tips again is the one control people need, in Help where they look for it.

## Placement

- Every tip points at its control: the arrow tip lands on it, centered when space allows. Default side is below; a
  tip names another side when below would cover what it is about (the gear tip goes above its tile so the gear list
  stays visible; the PixelLab tip goes above its link so the key form stays usable). With no room it flips to the
  opposite side, then the sides across.
- A tip may cover other content briefly; it never covers its own control, takes focus, or blocks the control it points
  at. Tips wait in Top-down and Side-scroller (game controls), while the scene is zoomed, and while a sheet or menu is
  open over them.
- The tip is a plain fixed layer, not a popover: the app reads an open popover as an open menu and pauses stage keys,
  scene zoom and refocusing for it. Place it in the same layer as its anchor (inside a sheet's dialog for a control in
  that sheet), just before the control so its X comes first in tab order.
- Checked at 1280 x 800, 390 x 844 and 320 x 568. At 320 x 568 the Wardrobe sheet shows no whole tile at first, so the
  gear tip waits until one scrolls into view rather than point at a clipped edge.

## Best practices for future onboarding

1. **Teach in the real product.** Use the working demo, not screens about it. Skip splash pages, slideshows and tours.
2. **One idea per tip, at most a few tips.** Teach the core loop only; leave the rest to discovery and the user guide.
3. **Point at the exact control.** The arrow must land on the thing the tip names, so nobody has to search. If the
   control is not on screen, wait; never point at a region, a list or an edge.
4. **End on the action.** Complete a tip when the person does what it suggests, even if the tip was not visible.
   Never require a Next button.
5. **One at a time.** Order tips by prerequisite (a later tip waits for the earlier one to be done).
6. **Never block.** No scrim, no focus theft, no covering the control or the field needed next. Pause in modes where
   the tip would compete (live views, zoom, open menus).
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

## Untested assumptions

- No first-time-user study; the flow was checked in the browser and by end-to-end tests.
- Screen-reader announcement was checked through the accessibility tree, not with a live screen reader.
- The demo has no unworn item with frames for every view, so the gear tip usually points at the worn Steel helmet
  (taking it off is the try-on). The Wizard hat is skipped on purpose: it lacks frames in its moves.
