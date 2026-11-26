# First-run onboarding: demo tips

Decided and implemented 2026-11-26. This record replaces the unmounted full-screen Welcome page and the unmerged
hint-card attempt on `t3/quickstart-onboarding` (commits `e4254ec57`, `83cbc9022`).

## What ships

1. **Characters, first visit.** The app still opens straight on the bundled Adventurer. With only the demo in the
   library and tips not yet seen, one quiet line sits above Customize: "Try on gear, then export it for your game. No
   PixelLab key needed." The Customize button keeps its normal label.
2. **No pre-release warning on a true first visit.** The startup "Saved characters may stop working" toast waits while
   the library holds nothing but the demo and the tips are unseen: a newcomer has no saved work at risk. Any saved
   character, an unreadable library, or a later visit shows it as before.
3. **Create from scratch says it is paid before the form.** The New character menu row reads "Needs a PixelLab key and
   uses paid generations" under its label (its accessible description).
4. **At most two tips in the demo's Customize, one at a time,** for a newcomer only (nothing saved or being created).
   Bronze popover surface with an arrow, a lightbulb, a title, one sentence and an X. No Next buttons, progress dots or
   scrim. Each tip ends by itself when the person does what it suggests (Apple TipKit's model):
   - **Try on gear:** "Choose an item in the Wardrobe to put it on or take it off." Only beside a docked panel. Points
     at the first fully visible tile of a complete item (frames in every move; never the demo's Wizard hat), preferring
     one not worn yet; with no whole tile in view, at the list without an arrow; with none at all (a search with no
     match), nowhere. Ends on any outfit change.
   - **Take it into your game:** "Export can save the body and each item as separate spritesheets." ("can": some formats
     combine layers.) Points at Export, or at More options with "Find Export in More options. ..." when the bar has
     moved Export into More. Ends when Export opens (opening Export at the first tip also ends both).
5. **Dismiss and replay.** The X ("Dismiss tips") ends both; closed by keyboard, focus goes to the Wardrobe tab or the
   Export control rather than the page. Finishing or dismissing writes `pixeldoll.welcomed`. Leaving the demo's
   Customize suspends the tips until the next visit. **More options > Help > Demo tips** opens the demo's Customize in
   Preview at once and starts over (at Export over a bottom sheet). The request is used up immediately, so it can never
   act on a later press. Workspace copies never show them.

## Placement and access

- Tips cover no control. They stay inside the open scene: below the top bar, view switch and zoom controls, above the
  Preview controls, beside the panel (floating-ui `boundary`). A tip that cannot fit there (a phone held sideways) waits
  instead of covering something. Tips also wait in Top-down and Side-scroller, whose stage has its own game controls,
  and while the scene is zoomed away from its fit, when the character fills it.
- Desktop docks: the gear tip sits just outside the panel edge, level with its tile. The Export tip sits under the top
  bar at the scene's edge and drops its arrow when it cannot line up with Export without covering the panel.
- Phone bottom sheet: no gear tip. There is no room beside the gear that keeps the character clear, the Characters note
  just said to try gear on, and the Wardrobe fills the sheet. After the first outfit change the Export tip sits below
  the view switch, its arrow toward More options, only when the scene has room for it and the character (at least three
  tip heights); at 320 x 568 it waits. Checked at 1280 x 800, 390 x 844 and 320 x 568, dark and light.
- The tip is a plain fixed layer, not a popover: the app treats any open popover as an open menu and pauses stage keys,
  scene zoom and refocusing for it.
- Tips never take focus: focus stays on the tile the person used, and WASD keeps driving the stage. Each tip is
  announced once through a polite status region; the X is a real 44 px button placed before the panel in the tab
  order. Escape keeps its existing meanings. Reduced motion removes the short fade-in.

## Why this form

| Option                                   | Verdict                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Full-screen welcome or slideshow         | Rejected. Delays the first edit, hides the character, and is mostly skipped; nothing here needs setup first. |
| Coach-mark tour with Next buttons        | Rejected. Interrupts, teaches controls before they matter, and overlays tend to cover what they explain.     |
| Checklist panel                          | Rejected. A second interface competing with the Wardrobe for a two-step loop.                                |
| Hint cards inside the Wardrobe (earlier) | Rejected. Pushed gear down 84 px at 390 x 844, lived only in Wardrobe, took focus and broke WASD.            |
| Preset helmet and relabeled tile         | Rejected. Changes the demo's saved look and ties a generic tile to one outfit.                               |
| Anchored, self-ending tips (chosen)      | The real demo is the lesson; two cues cover the loop (swap gear, export layers) and then get out of the way. |

A third tip for Top-down was considered and dropped: it adds a required stop for an optional mode that is already a
visible button. Completion on download was dropped too: the app cannot confirm a browser download, and opening Export is
the discovery the tip promotes.

Evidence: Apple HIG [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) (teach by
doing, keep it brief and optional), [Onboarding for games](https://developer.apple.com/app-store/onboarding-for-games/)
(start at launch, no splash or disclaimers, one step at a time, replayable), WWDC23
[Make features discoverable with TipKit](https://developer.apple.com/videos/play/wwdc2023/10229/) (short actionable
tips, invalidate on the action, never several at once), NN/g [mobile tutorials](https://www.nngroup.com/articles/mobile-tutorials/)
(70-user test: tutorials did not improve success and made tasks feel harder) and
[onboarding tutorials](https://www.nngroup.com/articles/onboarding-tutorials/) (pull over push, easy dismiss and
recall). Precedents for sample-first: Linear's demo workspace, Figma's starter files, Procreate's sample art.

## Process

Two independent proposals (Claude Opus and GPT 6.2 Sol, medium) and a review of the earlier attempt with its author
session, then a debate round. Sol's points adopted: two tips not three, complete-item anchoring, Export-in-More copy,
open-not-download completion, deferring the warning only while nothing is saved, the paid note on Create. Sol's
preset-helmet, tile relabel and temporary toolbar reshuffle were rejected as changes to the product itself.

## Independent review

GPT 6.2 Sol reviewed `ba177d921` in a browser at five sizes, both themes and docks. Fixed: a Help replay requested in
a live view stayed pending and later sent Characters back into Customize; the X sat 66 Tab presses away and dropped
focus on close; after scrolling, the arrow could stay on the list midpoint; the Export copy overpromised separate
layers; at 320 x 568 the phone gear tip covered the character's head. Also adopted: tips start on their own only for
a newcomer. Challenged and kept: Sol proposed dropping the gear tip everywhere and testing it against an Export-only
flow. It stays where it can point at its tile without covering anything (docked panels), because the editor opens on a
dense panel and the tip names the one action to start with; over a bottom sheet it is dropped. Not changed: at
320 x 568 the Wardrobe sheet opens with only part of its first tile in view, an existing layout limit outside this
record.

## Untested assumptions

- No first-time-user study; the flow was checked by agents in the browser and by end-to-end tests.
- Screen-reader announcement was checked through the accessibility tree, not with a live screen reader.
- Whether the gear tip helps on desktop was argued, not measured; an Export-only flow is the alternative to test.
