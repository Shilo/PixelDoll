# Two-handed items and dual wielding: design

Status: proposed, waiting for the owner's approval (Stop 1 of [the handoff](fable-handoff.md)). No app code has changed and no
PixelLab generation has been spent. Mock-up: [mockup.html](mockup.html). Offline evidence:
[scripts/offline-check.ts](scripts/offline-check.ts) (its images and JSON land in `out/`, which git ignores).

## Summary

- **Two-handed is a switch on the item.** A Main hand or Off hand item gets a **Two-handed** switch in its ⋮ menu, as the owner
  suggested. A two-handed item takes both hands: wearing it takes off whatever the other hand held, and wearing something in
  the other hand takes the two-handed item off. This is the rule nearly every game uses. The switch is free and undoable.
- **It is stored with a rule the app already has.** Any item can already hide another slot while it is worn (a hood hides
  hair), and the preview and every export already honor that. A two-handed item hides the other hand, so no file format
  changes, and a game that equips both anyway still shows only one. One gap gets closed in the preview and the four engine
  scripts: two items that hide each other's slot both vanish today; the Main hand one will stay visible.
- **Dual wielding stays two items, one per hand.** That already works today. What is missing is a matching pair, so a hand item
  gets **Make one for the Off hand…** (or the Main hand), which draws the same design for the other hand at the normal price.
- **Carried in one hand, wielded with both.** PixelDoll never redraws the body, so an item cannot pull the arms together. Where
  a move already brings the hands together, stored frames show the item reads as held in both. In Idle and Walk the hands are
  apart, and whether a long item can still be drawn across both hands there is an open question only a live test can answer.
- **Live PixelLab tests decide the drawing questions before they ship:** how a two-handed item is best drawn, whether a
  matching pair really matches, and twin weapons moving together. Budget asked: up to 1,800 generations, spent in stages.

## How held items work today

Read from the code and from the earlier research ([held audit](../../research/2026-11-07-paperdoll-cycle/audit-held.md),
[hand wording tests](../../research/2026-11-07-paperdoll-cycle/hand-wording-ab.md),
[known issues](../../known-issues.md)).

- There are two hand slots. Main hand is the character's right hand and Off hand the left. Each slot wears one item, and both
  can be worn together (`SLOTS` in `app/src/lib/items/items.ts`).
- An item is drawn once on a single-color copy of the standing body, with a red dot on the wrist that should hold it and the
  words "exactly one held item; the arms stay exactly as they are". It is then posed onto every move from that drawing, and
  cut out by color.
- The body never changes. Every item layer has to fit the same frozen body frames, which is what lets layers be swapped.
- Checks and cleanup look at one wrist: the hand check compares the distance to each wrist and expects the slot's own hand,
  the rotation check compares the item with that forearm, and cleanup keeps the largest piece plus pieces next to that wrist.
- Where the two hand items overlap, the app draws the hand nearer the viewer on top (`slotLadder`).
- "One grip per hand" is a recorded limit: a greatsword or bow is drawn in one hand.
- Tried and rejected before, so not proposed again: describing the grip in words alone (in paid rounds of 22 to 203 calls it
  moved the item to the wrong hand or moved the arm), forcing a direction ("pointing down" drew candles upside down), and
  choosing behavior from the words of the description (rejected as a policy: the app must not assume what an item is from its
  wording).

## Research

### Games and character creators

Checked against the linked pages unless marked unverified.

- **Two-handed is a fixed property of the item nearly everywhere.** World of Warcraft, Old School RuneScape, Diablo, Path of
  Exile, Baldur's Gate 3, Skyrim and Final Fantasy XIV all work this way. RPG Maker MZ builds it from a trait: "This allows you
  to create things such as 'Two-handed Weapons' which seals shield equipment"
  ([MZ help](https://rpgmakerofficial.com/product/MZ_help-en/01_08_15.html)).
- **The conflict is resolved for the player by taking the other item off, never refused.** "If the character equips a
  two-handed weapon, any item in the off-hand slot will un-equip" ([Warcraft Wiki](https://warcraft.wiki.gg/wiki/Two-hand)).
  In RuneScape a two-handed item "occupies both the weapon and shield slots, so when equipped, both items will be removed"
  ([OSRS Wiki](https://oldschool.runescape.wiki/w/Worn_Equipment)).
- **Players want the other slot to show that it is taken.** The Warcraft Wiki notes the off hand "is not usable when a
  two-handed weapon is equipped, even though the slot will appear empty". Baldur's Gate players asked for the slot to gray out
  instead of an error message ([forum 1](https://forums.beamdog.com/discussion/comment/358343/),
  [forum 2](https://forums.beamdog.com/discussion/comment/727927)).
- **Carrying in one hand is accepted.** Baldur's Gate 3, following the D&D rule, says a two-handed weapon "must be wielded
  with both hands when making an attack with it, but can still be just carried in one"
  ([BG3 wiki](https://bg3.wiki/wiki/Weapons)).
- **Dual wielding is usually just a second one-handed weapon in the off hand** (Baldur's Gate 3, Path of Exile, Skyrim;
  [BG3 wiki](https://bg3.wiki/wiki/Weapons), [PoE2 wiki](https://poe2wiki.net/wiki/Dual_wield)).
- **A pair as one item exists too.** Final Fantasy XIV rogue weapons "consist of 2-handed dual daggers"
  ([wiki](https://ffxiv.consolegameswiki.com/wiki/Rogue%27s_Arm)), and with an Elden Ring paired weapon the character will
  "pull out a a copy of the same weapon in the other hand" ([wiki](https://eldenring.wiki.gg/wiki/Paired_Weapons)).
- **Choosing the grip per moment** (D&D versatile weapons, Elden Ring two-handing) is a combat stance, not an equipment rule
  ([5e SRD](https://dandwiki.com/wiki/5e_SRD:Weapon)).
- **Sprite and character creators have no hand rules.** The Universal LPC generator's weapon definitions have no hand,
  two-handed or exclusion field (checked in its
  [repository](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator): the spear is
  `type_name: weapon` with layers at depth 140 and 9), and weapon and shield are independent picks.
- Not verified: a ghosted copy of the weapon in Diablo's off-hand slot; how Hero Forge, VRoid and Picrew treat held items.

### How 2D sprite pipelines draw items in two hands

- **A two-handed grip is a different body drawing, not an item setting.** Mana Seed's character base ships a "Full alternate of
  page 1 while holding a 2-hand weapon" and another "while holding a spear or polearm" as separate body sheets
  ([itch page](https://seliel-the-shaper.itch.io/character-base)). Diablo II picks a whole different animation set per weapon
  class ([earlier survey](../../research/games/games_paperdolling_survey.md)). LPC has one weapon and one shield type and no
  dual wielding.
- **Front and back are separate layers per item.** LPC gives each weapon a layer in front of the body and one behind it (spear
  140 and 9, bow 140 and -1). Mana Seed says "your game will need to be able to switch the equipment to in-front-of or behind
  the character sprite". Terraria uses three depths for a held item
  ([tModLoader source](https://github.com/tModLoader/tModLoader/blob/1.4.4/patches/tModLoader/Terraria/DataStructures/PlayerDrawLayers.tML.cs)).
  PixelDoll already stores a front and a back layer per held item.
- **The weapon shares the body's frame and pivot**, not a grip point, in LPC, Mana Seed and RPG Maker. PixelDoll does the same.
- Not verified: a published rule for which parts of a two-handed weapon go in front per direction; Stardew Valley and Time
  Fantasy draw order.

### Game engines and exports

- Godot, Unity, Phaser and Aseprite do not tie an item to a slot or limit its layers; draw order is a number per sprite
  ([Godot CanvasItem](https://docs.godotengine.org/en/stable/classes/class_canvasitem.html),
  [Phaser Container](https://docs.phaser.io/api-documentation/class/gameobjects-container),
  [Unity Aseprite Importer](https://docs.unity3d.com/Packages/com.unity.2d.aseprite@1.1/manual/ImporterFAQ.html)).
- The slot rules live in PixelDoll's own exported scripts, and those already apply "hide this slot while that item is worn"
  (`godot.ts`, `phaser.ts`, `unity.ts`, `gdevelop.ts`; Aseprite sets layer visibility from it; RPG Maker and PNG sheets are
  baked by the same composer as the preview; the manifest documents it as invariant 9 in
  [manifest-spec.md](../../manifest-spec.md)).

### What PixelLab's allowed tools can and cannot do

- **They cannot move the arms.** The item is drawn onto the frozen body, and any arm movement fails the body checks. A grip
  where both hands hold the item is only possible where the body's hands can already both reach it.
- **They can reuse a design.** The editing call that draws an item accepts a leading reference frame with "Frame 1 already
  wears the item: copy exactly that design, colors and size" (`chromaPrompt`, already used to keep 8-direction items consistent
  and to add moves to imported items). A matching pair can use it.
- **Unknown until tested live:** whether marking both wrists and asking for both hands gives a better two-handed item without
  moving the arms, and whether a reference frame that shows the item in one hand keeps the copy in the other hand. Earlier
  notes say two-handed grips "have never run on real art".

## Evidence from stored frames (offline, no spend)

`node docs/design/2026-11-11-two-handed-items/scripts/offline-check.ts`, on the frozen real PixelLab outputs in
`app/test/fixtures/bench` (a sword and an axe in the Main hand, a bow in the Off hand, walk and slash, three views).

| Question                                                                         | Result                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do the hands ever meet on the frozen body?                                       | Standing and walking, front and back: wrists 15 to 18 px apart on a 48 px tall body. In the Slash they come within 3 to 8 px for two frames per view.                                                                                                                                                                                                 |
| What does a one-hand item look like where the hands meet?                        | The stored sword and axe have pixels within 0.1 to 3.9 px of **both** wrists in those frames (2 frames in front and back views, 5 in the side view). Nearness is not proof of a grip: the bow, carried across the body, also passes near the other wrist in 17 of 24 walk frames. By eye the slash frames read as a two-handed grip; see the mock-up. |
| Do today's checks object?                                                        | 15 real clips, 120 frames: no hand failure, and the item is within reach of its own hand in 120 of 120 frames. Two side-view clips get the review note "grip side is unclear"; one-handed items get the same note in side views, where one arm covers the other.                                                                                      |
| Can a pair be one item?                                                          | A synthetic pair of swords drawn as one Main hand item loses up to 37 % of its pixels to cleanup (the second sword is deleted in the front walk, 11.5 % over all clips) and fails the rotation check in 3 of 6 clips.                                                                                                                                 |
| Can a pair be two items?                                                         | The same two swords as one item per hand: nothing removed, no failure, in all 6 clips.                                                                                                                                                                                                                                                                |
| What if an item is in both fists in some frames and along one forearm in others? | A synthetic staff drawn that way passes five clips but **fails the rotation check in the side walk**, where the wrists move in and out of reach. If PixelLab draws a real two-handed item inconsistently, this check will send it to review, as it should.                                                                                            |
| Do two real hand items draw in a sensible order together?                        | The stored sword and bow composited in the app's draw order overlap by up to 24 px per frame with the near hand on top; the sheet shows no broken order.                                                                                                                                                                                              |

Limits of this evidence: one 64 px body, three views, no diagonals or mirrored views, no stored spear, staff, greatsword or
off-hand sword. The synthetic shapes follow the wrists perfectly and do not model the body hiding the far hand, so they test
the cleanup and checks, not what PixelLab draws.

## Recommended design

### Two-handed items, for the user

1. **The switch.** The ⋮ menu of every Main hand and Off hand item gets a **Two-handed** switch (mock-up, section 1). It works
   on any item at any time, including the demo's, costs nothing and is one undo step. The menu's status line reads
   "Wearing · Two-handed".
2. **Wearing it takes both hands.** Whatever the other hand held comes off in the same step, with a message: "Took off Round
   shield: Steel greatsword is two-handed". The other hand's category shows one line under its title, "Held by Steel
   greatsword (two-handed)." (mock-up, section 2).
3. **Putting something in the other hand takes the two-handed item off**, in the same step: "Took off Steel greatsword
   (two-handed)". This covers tapping an item, that category's Random, and saving a newly made item. What you tapped last is
   what you wear, nothing is ever refused, and Undo restores the previous look.
4. **Previewing a new draft for the other hand** shows the draft and not the two-handed item, for as long as the draft is
   previewed. Drafts are display only today and stay so: discarding the draft brings the two-handed item back, and nothing is
   changed until the draft is saved (then rule 3 applies).
5. **Switching an item to two-handed while it is worn** takes the other hand's item off, with the same message. When an outfit
   or Random look picks two conflicting items at once, the Main hand item stays.
6. **Which hand?** The item keeps the hand it was made for: a greatsword, spear or staff is a Main hand item, a bow an Off hand
   item (the hand that holds a bow). The switch works from either.
7. **What it does not do.** It does not redraw the item or the body. How a two-handed item is drawn is the pipeline question
   below.

### Dual wielding, for the user

1. **One item per hand, as today.** A sword and a shield, a sword and a torch, two different daggers: wear one in each hand.
2. **A matching pair.** A hand item's ⋮ menu gets **Make one for the Off hand…** (on Off hand items, "…the Main hand…"),
   marked Paid like Try again (mock-up, sections 1 and 3). It opens the usual New item sheet with the other hand, the same
   description and its price. The result is a normal second item, so either one can also be worn with something else.
3. The row is not shown on a two-handed item, on the demo, or on an item with no description.

### How the pipeline produces it

**The rule.**

- The switch adds or removes the other hand's slot in the item's existing "When worn, hide" list (`Item.hides`). An item is
  two-handed exactly when it is a hand item that hides the other hand. The same state shows as a chip under Details. No new
  field, no new slot, no file format change.
- One small function settles the two hands (rules 2 to 5). It runs where the Studio already commits every change to what is
  worn, when a character is opened, when the preview overlays a draft, and when an export writes saved outfits. So the Studio
  never keeps a hidden item in a hand, and no outfit reaches a game with a conflict in it.
- **Exported scripts keep the same result when game code equips anything.** They already hide the other hand when a two-handed
  item is equipped. The gap is two items that hide each other's slot: today both disappear (this is already reachable through
  the Details chips). The shared hide rule gets one tie-break, in the preview composer and in the Godot, Phaser, Unity and
  GDevelop scripts: of two worn items that hide each other, the one in the later slot stays visible, which for the hands is
  the Main hand. The manifest spec's hide rule records it.
- A game that equips a shield while a two-handed sword is on gets the shield hidden, not the sword removed. Taking items off
  is the game's inventory decision; the export READMEs will say which rule applies and that `hides` carries it. A hidden item
  keeps acting as a cover for other layers there, as hidden items already do today (manifest spec, invariants 9, 11 and 12).

**The drawing of a two-handed item.** Two candidates, decided by live test 1 with the criteria in the budget section:

- **Own hand (today's drawing).** The item is drawn in its own hand and posed as today. In frames where the move brings the
  hands together it lies in both fists; elsewhere it is carried in one hand. Stored frames show this for a sword and an axe.
  Nothing in generation changes, and the switch stays free for existing items.
- **Both hands marked.** For a two-handed item, the first drawing marks both wrists and asks for an item held in both hands
  without moving the arms, and the posing description says the same. A long item (spear, staff, bow) might then be carried
  across both hands even in Idle and Walk. The risk is the one earlier wording tests hit: the model moves the arms or draws a
  second item. If this candidate wins, how an item is drawn depends on the switch, so the New item sheet also gets the switch,
  and flipping it on an existing item offers Try again to redraw it.

I recommend shipping the own-hand drawing unless the test shows the both-hands drawing is clearly better and no worse on any
check. Either way the existing checks stay as they are: the hand check keeps expecting the item in its own hand.

**The matching pair.**

- The other hand's first drawing call leads with the source item's saved standing drawing as a reference frame, the mechanism
  the app already uses to keep a design consistent ("Frame 1 already wears the item: copy exactly that design").
- Two things must change for it to fit, and both are in the price shown to the user: the first call has to leave room for the
  reference (on the padded 96 px canvas a call takes four frames, so four drawn views need two calls instead of one), and the
  wording has to separate "copy this design" from "hold it in the other hand", because the reference shows it in the wrong
  hand.
- Live test 2 decides between no reference, the reference as it is, and the reference mirrored so the item sits on the other
  hand's side.
- An item with no saved standing drawing (a free copy fitted from another character) does not offer the row.

### Everywhere an item shows up

| Place                             | Behavior                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wear, take off, swap              | Rules 2 to 5 above; every change is one undo step with a message.                                                                                                                                                                                                                           |
| Outfits                           | An outfit stores what is picked per hand, as today. Saving one can no longer capture a conflict; applying an older one settles it (Main hand stays).                                                                                                                                        |
| Random look, category Random      | Covered by rules 3 and 5.                                                                                                                                                                                                                                                                   |
| Every move and direction          | No per-move data. The rule covers all moves and views; mirrored views flip both hands together as today.                                                                                                                                                                                    |
| New items and drafts              | Rule 4: a previewed draft is never invisible, and discarding it loses nothing.                                                                                                                                                                                                              |
| Quality checks                    | Unchanged.                                                                                                                                                                                                                                                                                  |
| Recolors                          | Unchanged. Each item of a pair has its own colors; recolor both to keep them matching (a limit, see Risks).                                                                                                                                                                                 |
| Sharing between characters        | Exact copies keep the Two-handed state. The free re-fit onto a different body stays unavailable for two-handed items, as it already is for any item that hides a slot: the re-fit moves an item by one wrist and cannot keep a second hand in place. "Make one for" that character remains. |
| Share images                      | Drawn by the same composer as the preview.                                                                                                                                                                                                                                                  |
| Godot, Phaser, Unity, GDevelop    | Their scripts already hide the other hand on equip. They gain the one tie-break above; their self-tests cover it.                                                                                                                                                                           |
| Aseprite, RPG Maker, PNG and JSON | Layer visibility and baked sheets already follow the hide rule through the shared composer; the manifest already carries it.                                                                                                                                                                |

## Alternatives rejected

- **A third "Two hands" category.** Clear on screen, but it adds a slot to every saved character, manifest and engine script,
  still needs a grip hand per item (a bow is held in the left hand, a greatsword in the right), and puts the choice at creation
  where it cannot be changed without paying again.
- **Keeping the other hand's item picked but hidden**, so a shield returns when the greatsword comes off. This was my first
  choice and the review broke it: a tap on the hidden shield would take it off instead of showing it, a hidden item still
  hides, tucks and cuts other layers in today's composer, and drafts and Undo would need new state to restore the look.
  Taking the item off is what players already expect, and Undo covers a change of mind.
- **Relaxing the hand check for two-handed items** so that touching both hands is never flagged. Nearness to a wrist is not
  proof of a grip, and the two notes it would remove also appear on one-handed items in side views. The check stays.
- **Deciding from the description** ("greatsword", "bow"). Already rejected as a policy; a staff can be a walking stick.
- **A stance switch on the character** (Elden Ring style). It is not a property of the item, so outfits and games would need a
  new piece of state.
- **Drawing new arms into the item layer.** It would give a real two-handed grip in Idle and Walk, but the arms would carry the
  body's skin and sleeves, cover gloves and armor, and break the frozen-body rule every other layer depends on.
- **Automatic two-handed body moves.** Professional packs do this with separate body sheets. Here it would add paid body moves
  and paid frames for every worn item. Users can already add a move described with both hands together.
- **A pair as one item in both hands.** Matches for free and is a known game convention, but stored-frame evidence shows
  today's cleanup deletes the second weapon and the rotation check fails. It would need every held-item step to work per
  hand, which is the parallel path the handoff rules out, and the two weapons could not be mixed with other items.
- **A free mirrored copy for the other hand.** Wrong wherever one arm is behind the body, and the arms swing in opposite
  phase.

## How I will prove it works

- **Unit tests first** for: the Two-handed state read from the hide list; the function that settles the hands (every case in
  rules 2 to 5, including outfits, Random, opening a character and a previewed draft); the tie-break for two items that hide
  each other, in the composer and in each exported script's self-test; an export of an outfit that picks two conflicting
  items; the matching-pair call plan and price with a reference frame for three, four and five drawn views; and that re-fit
  still refuses a two-handed item.
- **End-to-end** (on the demo and fixtures, no key): the switch in the menu, the other hand's line, both swap directions with
  their messages and Undo, a draft preview and discard, an outfit round trip, the Make one for the Off hand sheet with its
  price, and dark, light and phone layouts in the browser. Because Studio state changes, the full end-to-end suite runs, not
  only the `studio` spec.
- **Existing suites** stay green: `npm run check`, `npm test`, and the frozen-frame benchmark with unchanged verdicts.
- **Live tests** below, judged on the frames by the app's own checks and by eye in every view.

## Generation budget

The test account has 16,600 generations left (checked 2026-11-11, nothing spent). Offline frames cannot answer these questions
because they contain no spear, staff, greatsword, off-hand weapon or matching pair, and earlier research showed that the
first drawing alone does not predict how an item poses.

Prices come from the app's own planners: an item's first drawing is 10 generations per call on a canvas up to 128 px, and
posing one move in one drawn view is 3 (`editGens`, `poseCallGens`). On a body with four drawn views, one item with four
moves is 10 + 4 x 4 x 3 = 58.

| Stage                            | What it settles                                                                                                                                                                                                                                                                                                                                                          | Arithmetic                                                                               | Estimate              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------- |
| Setup A                          | A new 64 px test character with four drawn views (no mirror, so left-side views are real): Idle, Walk, Slash and one move described with both hands together.                                                                                                                                                                                                            | body 5, Idle and Walk 44, two moves about 18 each                                        | 85                    |
| 1. How to draw a two-handed item | A greatsword and a spear (Main hand) and a longbow (Off hand), on all four moves, drawn two ways: own hand, and both hands marked. Plus the own-hand drawing posed with both-hands wording on the two moves where the hands meet, a second seed of both drawings for the greatsword, and one small trial of redrawing a move's frames directly from the standing design. | own hand 3 x 58, both hands 3 x 58, wording 3 x 24, second seed 2 x 58, direct redraw 60 | 600                   |
| 2. Matching pair                 | A sword and a dagger with their twins. The twin's first drawing three ways (same words only, reference as is, reference mirrored), two seeds each; then the best one posed on Idle, Walk and Slash beside its Main hand twin.                                                                                                                                            | Main hand items 2 x 46, twin drawings 4 x (10 + 20 + 20), twins posed 2 x 36             | 365                   |
| 3. Sword and shield control      | The existing two-item case on the same body and moves, reusing the sword from stage 2.                                                                                                                                                                                                                                                                                   | shield 10 + 36                                                                           | 50                    |
| Setup B                          | A second character: 96 px, the default 8 directions with mirrored left side (five drawn views), Idle, Walk, Slash. Covers diagonals, mirrored views and a second size.                                                                                                                                                                                                   | body 5, Idle and Walk 55, Slash about 20                                                 | 80                    |
| 4. Final pass                    | The finished feature with the chosen drawing: a two-handed greatsword, a two-handed staff and a pair of daggers on character B, and the staff on character A.                                                                                                                                                                                                            | on B: 65 + 65 + 65 + 75; on A: 58                                                        | 330                   |
| Reserve                          | The app's own automatic retries (about 15 %) and repeats of anything inconclusive.                                                                                                                                                                                                                                                                                       |                                                                                          | 290                   |
| **Total asked**                  |                                                                                                                                                                                                                                                                                                                                                                          |                                                                                          | **1,800 generations** |

- **Spending is staged.** Stage 1 starts with the greatsword alone. If the both-hands drawing clearly fails there (arms moved
  or a second item in both seeds), the spear and bow skip it, which saves about 190.
- **Criteria for stage 1.** The both-hands drawing replaces the own-hand drawing only if, over the three items: no body check
  fails more often; the item is one object in every frame; the rotation and hand checks fail no more often; and by eye, in
  every view, the second hand is on the item in more frames. A tie keeps the own-hand drawing.
- **Criteria for stage 2.** A reference variant ships only if the twin is in the requested hand in every view of both seeds
  and looks like the same design by eye and by palette distance; otherwise the row ships with the same description only and
  says small details can differ, or is held back if the twins look unrelated. I will report which.
- PixelLab bills some calls in dollars instead of generations; the cap for those is $10. I stop and ask before going over
  either number.

## Risks and limits

- **Idle and Walk may show a one-hand carry.** If the both-hands drawing does not win stage 1, a greatsword is carried in one
  hand wherever the body's hands are apart, the same thing sprite packs solve with separate two-handed body sheets. A
  two-handed carry in every move would then be a different, larger feature (two-handed body moves) and its own card.
- **A two-handed grip is judged by eye.** No check can tell a fist on a handle from a blade passing near a wrist. The live
  tests are reviewed frame by frame in every view, and the limit goes into the known issues.
- **A pair may not match exactly.** PixelLab is not repeatable; stage 2 decides what the row can promise.
- **A reference frame showing the item in one hand may pull the copy into that hand.** That is why the mirrored variant is in
  the test, and the hand check catches a wrong hand.
- **Taking an item off instead of hiding it forgets the other hand's pick.** Undo restores it; an outfit is the way to keep a
  sword-and-shield look next to a greatsword look.
- **The tie-break changes exported scripts.** It only affects two worn items that hide each other, a case that shows nothing
  today; each script's self-test will pin both the old and the new cases.
- **Recolors of a pair are independent.** Linking the two items' colors is possible later; it is not in this change.
- **Not in this change:** a hint in the New item sheet ("Greatswords and bows are usually two-handed"), like the existing Off
  hand hint. It is cheap to add later if the menu switch proves hard to find.

## Independent review

GPT 6.1 Sol reviewed the first version of this design against the code without seeing my reasoning. Its findings and what
changed:

| Finding                                                                                                                                           | Answer                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker: hiding the other hand is not the same as an item held with both hands, and separated hands do not rule out a shared grip on a long item. | Accepted. The drawing is now an open question with two candidates and explicit criteria (stage 1), "carried" is separated from "wielded", and the reduced scope is an explicit owner decision. |
| Blocker: exported scripts let two two-handed items hide each other, and do not follow the Studio's rule.                                          | Accepted. The shared hide rule gets a tie-break in the composer and all four scripts; outfits are settled before export; the READMEs state what `hides` does.                                  |
| Major: an item kept picked but hidden still hides, tucks and cuts other layers.                                                                   | Accepted. The Studio now takes the other item off instead of hiding it.                                                                                                                        |
| Major: tapping a hidden pick would take it off instead of showing it.                                                                             | Resolved by the same change: there is no hidden pick.                                                                                                                                          |
| Major: draft preview and Undo need their own contract.                                                                                            | Accepted. Rule 4 keeps drafts display only, so nothing has to be restored.                                                                                                                     |
| Major: the reference frame does not fit the four-frame cap, and the wording calls the reference "already wearing" the item in the wrong hand.     | Accepted. The plan reserves room for the reference, the price reflects it, and the wording is part of stage 2.                                                                                 |
| Major: nearness to a wrist is not proof of a grip; the hand check change could hide a wrong grip.                                                 | Accepted. The check is no longer changed, and the evidence table says what nearness does and does not show.                                                                                    |
| Major: a free re-fit keeps only one hand in place.                                                                                                | Accepted. Two-handed items stay out of the free re-fit, as items that hide a slot already are.                                                                                                 |
| Major: the synthetic staff's failed rotation check was not reported; the test matrix lacked a staff, diagonals, mirrored views and a second size. | Accepted. The failure is in the evidence table; stage 4 and character B add the missing coverage; the full end-to-end suite runs.                                                              |
| Minor: the budget rows could not be reproduced.                                                                                                   | Accepted. Each row now shows its arithmetic from the app's planners.                                                                                                                           |

The review confirmed that the existing hide rule reaches the composer, Aseprite visibility, baked sheets and all four engine
scripts, that no schema change is needed, and that the offline numbers reproduce.

## Owner answers (2026-11-12)

- Conflict rule: the standard MMO rule. Wearing a two-handed item takes the other hand's item off, and the reverse.
- Idle and Walk: accepted that a two-handed item is held in one hand where the body's hands are apart. No both-hands drawing
  test is needed.
- Label: "Two-handed".
- "Make one for the Off hand…" is wanted, and "Make one for the Main hand…" on Off hand items.
- Dual wielding means one generation that draws a pair, one weapon in each hand. Proposed below, pending confirmation.
- Budget: only the generations that are necessary. Revised below, pending confirmation.

## Decisions for the owner (first version)

1. **Approve the design**: a Two-handed switch in the ⋮ menu, stored as the existing hide rule; dual wielding as one item per
   hand with "Make one for the Off hand…".
2. **The conflict rule**: wearing a two-handed item takes the other hand's item off, and the reverse (recommended, the usual
   game rule), or keep the other item picked but hidden so it returns later (more forgiving, but it needs new state for taps,
   drafts and Undo).
3. **The scope of "held with both hands"**: let live test 1 choose between the own-hand drawing and the both-hands drawing by
   the stated criteria, and accept a one-hand carry in Idle and Walk if the both-hands drawing does not win (recommended); or
   ask for two-handed body moves as a separate, larger card.
4. **Approve the live test budget**: up to 1,800 generations in stages, and up to $10 if PixelLab bills some calls in dollars.
5. **The label**: "Two-handed" (recommended, the usual game term) or "Uses both hands".
