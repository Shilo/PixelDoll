# Item details rework (2026-11-26)

The item window (`app/src/studio/ItemPane.svelte`) was rebuilt from a joint study by Claude and a GPT reviewer ("Bob"),
after two earlier attempts: design A (merged as 472829e17) and design B (branch `t3/item-detail-redesign`, merged into
this work as its code base). Board card: "Rework the item details window from a joint design study".

## Owner problems it answers

Clutter and verbose text; buttons that seemed to do the same thing; broken layer order and hide rules; single-move
generation; confusing Fill missing / Repair / Redraw; misplaced Wear, Edit, Create a variant, Trash and Fix frames; a
checkbox that should be a switch; plain accordions; name, slot and status on separate lines; no full-size sprite view.

## Findings that shaped it

- **Layer order was not broken in the data, only invisible.** A step moved past the next raw draw entry, including other
  items' back layers and layers that do not overlap, so most presses changed nothing on screen and Backward rarely
  disabled (four presses moved the wizard hat from z 130 to 9 with one visible change). Steps now cross only a layer whose
  move changes the real composite (`composeCell`) in some frame of the shown move and facing, simulated with the exact
  overrides the step saves (per-frame depths, body cuts and tucks count).
- Hide rules worked on worn items but showed nothing on unworn ones, and "Show" silently removed another item's rule.
- "Missing 3 moves" counted partly drawn clips (a north gap in every move); rows now name the missing facings.
- Design A buried actions in disclosures; design B grouped unrelated jobs under Artwork and showed "Fix frames" three
  times. B's viewer, move checklist and switches were kept.

## Decisions

| Topic        | Decision                                                                                                                                                                                      | Rejected                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Header       | Name, category and one status (fit > review > generating > stale > incomplete > accepted > clean); ⋮ menu beside Close                                                                        | Separate worn badge; status inside sections only                                                                                                 |
| Footer       | Wear / Take off only                                                                                                                                                                          | Recolor or Trash in the footer                                                                                                                   |
| Scope        | A move picker and one facing choice for the whole window, starting from the stage and leaving it alone                                                                                        | Sharing the stage's move and facing (closing would lose the outfit the player was comparing); a second picker per section                        |
| Viewer       | Any facing tile opens `SpritePreview.svelte` over the window: true frame numbers, missing frames in place, facing and frame controls                                                          | An "Inspect this view" action inside the viewer                                                                                                  |
| Sections     | Moves & States, Quality, Outfit, About, styled like the API calls popover rows with state on the right                                                                                        | A grab-bag Artwork section; Technical details as a separate top row                                                                              |
| Generation   | Checkbox per missing move, staged move (else the first) preselected, one priced Generate button                                                                                               | Fill all / one move only; empty preselection                                                                                                     |
| Fixes        | Free before paid: Match colors, Fix frames, then Repair this view (keeps the design) and Redraw this view (new attempt compared before keeping), with request counts and the price difference | "Repair pose" (the repair is an item-area inpaint); a separate paid review step (every paid button in the app starts on click with its estimate) |
| Outfit       | Outfit preview beside layer order, facing switch, Reset order and Hide while worn switches                                                                                                    | A full layer stack list; a segmented scope control                                                                                               |
| Re-fits      | Notes show their frame on the stage (fit needs the body); unfitted items offer Make one for the character in the notice                                                                       | Item-only viewer for fit notes                                                                                                                   |
| Return paths | Fix frames, Edit appearance and Rename go Back to the same view of the window                                                                                                                 | Starting over after each sheet                                                                                                                   |

Costs stay in generations, as on every other paid button; leading with dollars app-wide is a separate change.

## Verification

- Real generations on the agent account (about 56 gens): a two-move batch from the picker (Idle and Walk, the item became
  complete), Repair this view (held issues for review), Redraw this view (side-by-side review, Use redrawn frames saved),
  plus Accept as is, the hide flow, layer steps, the viewer and every ⋮ action.
- Bob reviewed three rounds (scores after round 2: roles 8, hierarchy 8, simplicity 8, consistency 9, accessibility 7;
  final verdict: ship, better than A and B). Two of his rounds crashed on provider errors and were rerun.
- Checked at 1440×900, 1024×768, 390×844 and 844×390 in dark and light; keyboard (one Tab stop for the facing choice,
  Escape and focus return in the viewer).
- `npm run check`, all unit tests, and the studio, characters and shared-equipment end-to-end specs.

## Open

- Rename's own X still closes the whole flow (Back returns), as in Edit appearance.
- At 844×390 the sections start just below the fold under a long notice.
