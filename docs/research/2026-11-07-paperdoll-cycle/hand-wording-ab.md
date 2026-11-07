# Hand wording A/B

Date: 2026-11-07. Paid, Agent mode, 22 `edit-animation-v2` dress calls at $0.08 each.

## Question

The held-item dress prompt (`heldPhrase` and `oneHeld` in `app/src/lib/items/items.ts`) describes every held object as a weapon
"pointing down and slightly outward", with "exactly one weapon, ... no shield" in the main hand. The audit
([audit-held.md](audit-held.md) section 2) asked whether item-neutral wording draws non-weapons better without hurting swords.

## Setup

- Body: the 80 px "Live Test" character from the live run (low top-down, four views, west mirrored), rest views south, east and
  north, padded 16 px per side as production pads held items. Requests were built by the production helpers in the browser
  (`baseCell`, `inputCell`, `padImg`, `itemPrompt`, `itemRoute.edit`), green key from `pickKey`, and sent through the app's queue.
- Items: a steel longsword, a burning wooden torch, a bouquet of red and yellow flowers (main hand), a round wooden shield with an
  iron rim (off hand). Seeds 7101 and 7202, the same seed for every wording.
- Wordings (only the hand clause differs):
  - **A (current):** "held in the character's right hand, pointing down and slightly outward; exactly one weapon, no other
    weapons, no scabbard, no shield; the arms stay exactly as they are".
  - **B (audit proposal):** "held in the character's right hand, carried naturally at the side, continuing the forearm; exactly
    one held object, nothing in the left hand; the arms stay exactly as they are".
  - **C (no orientation):** "gripped in the character's right fist at the side; the arms stay exactly as they are; exactly one
    held object, nothing in the left hand". Sword, torch and bouquet only.
- Scoring: production `extractCell` (held, padded) for key outside the body (G3), plus the item's distance to each rest wrist and
  its extent above and below the requested wrist.

## Results

| Item | A (current) | B (neutral) | C (no orientation) |
| --- | --- | --- | --- |
| Sword | Right hand, pointing down, key outside 0 | Same as A, one seed smaller | Same as A |
| Shield (off hand) | Left hand, key outside at most 0.001 | Same as A | not run |
| Torch | Right hand but upside down (flame at the bottom); one north view drew a second torch in the other hand | Upright, but the arm bends: key outside 0.026 to 0.107 (G3 fails), and 3 of 6 views hold it in the left hand | Upright, key outside up to 0.037, but the left hand in 4 of 6 views (both seeds, front and back) |
| Bouquet | Right hand, hanging head down; one seed key outside 0.014 to 0.023 | One seed in the left hand (front and back) | Seed 7101 in the left hand (front and back); seed 7202 right hand, clean |

Without "pointing down", PixelLab puts an upright object in the character's left hand even when the prompt names the right
hand, and B also bends the forearm the body pose must keep. Swords and shields are unaffected by the wording.

## Decision

Keep the current wording. The orientation clause is what keeps a main-hand object in the requested hand; the neutral wordings
trade an upside-down torch for a wrong hand or a moved arm, which the grip and body checks then fail. Torches and bouquets
still draw upside down under the current wording; a fix needs another route (for example an off-hand default for upright
objects, which PixelLab draws in the left hand anyway), not a wording change.

## Follow-up: upright objects in the off hand

12 more dress calls ($0.96), seeds 7101 and 7202, torch, bouquet and "a lit wax candle in a brass holder":

- **D (off hand):** "held upright in the character's left hand, gripped in the fist; exactly one held item, nothing in the right
  hand; the arms stay exactly as they are". Torch upright in the left hand in both seeds (key outside 0.011 to 0.018), candle
  upright in the left hand in both seeds (at most 0.013), bouquet in the left hand in one seed and the right hand in the other.
- **E (main hand):** the same wording for the right hand. Wrong hand in 4 of 6 runs, and side views reach key outside 0.051 to
  0.080 (G3 fails at 0.05).

On the dress call alone, D looked right: 5 of 6 runs correct and upright.

## Full pipeline check of D: rejected

The off-hand default and wording D were implemented and run through production `runItem` (dress plus idle and walk poses in
three views; 21 calls, $0.62; nothing saved). All three items failed:

| Item | Result |
| --- | --- |
| Torch | Front views drawn in the right hand (G8 fails on idle and walk south); the side keyframe moved the body (G2 0.966, G3 key outside 0.040 over the 0.02 keyframe gate); walk east G5 |
| Candle | Drawn in the right hand in every view (G8 fails on 5 clips); G9 turns of 59 and 65 degrees |
| Bouquet | Walk east fails G4 (area 15 % of median), G5 and G9: the left hand is the far side and the body hides it, the pattern round 3 saw for upright off-hand bows; K1 on its green leaves |

The dress-only A/B did not predict posing: the hand side flips between seeds, and the far-side hand in side views is occluded.
The change was reverted. Upright objects keep the current wording: the requested hand, drawn pointing down (recorded in
docs/known-issues.md). A fix needs something other than wording.

## Flip about the grip: rejected

A main-hand torch with the current wording through the full pipeline (7 calls, about $0.2; nothing saved) passed every check
with no warning. PixelLab drew it angled low and outward with the flame burning upward at its end, which reads naturally.
Mirroring each frame's item vertically about the frame's wrist turned that flame downward. Whether the flame ends up at the
bottom depends on the seed (the dress-only samples above had it at the bottom), so a blind flip breaks the good cases. A fix
would first need to detect which end is the flame; not attempted.

## Padding test: the sword direction comes from the wording

Question: does the sword point to a bottom corner because the 16 px held padding leaves no room? Same Live Test body, "a steel
longsword", seeds 7101 and 7202, dress call only (4 new calls, $0.32; the 16 px arm reattached the earlier A jobs for free).
Blade direction is the angle from the wrist to the farthest item px (90 degrees = straight down, negative = up).

| Arm | South | East | North | Room left to the canvas edge |
| --- | --- | --- | --- | --- |
| 16 px padding, current wording | 131 to 136 | 27 to 34 | 44 to 47 | 14 to 26 px |
| 48 px padding, current wording | 132 to 137 | 30 to 34 | 47 | 36 to 59 px |
| 48 px padding, no "pointing down" | -137 | -39 to -44 | -41 to -154 | 33 to 50 px |

More padding left the direction unchanged in every view (one seed drew a longer blade, reach 46 to 48 px instead of 34 to 37).
Removing the orientation clause raised every sword (reach 51 to 77 px), but seed 7101 drew two swords from behind and moved the
arm in the side view (key outside 0.070, over the 0.05 limit). The bottom-corner direction is the wording "pointing down and
slightly outward", chosen in S5 to keep the arms frozen; it is not a lack of space.

## Straight-down sword: rejected

"pointing straight down beside the leg" (2 dress calls and 6 pose calls through production `runItem`, $0.37; nothing saved)
drew vertical blades in every view (86 to 90 degrees) with no body disturbance, but one seed drew a short blade (reach 21 px
against 37), the side view put the blade across the leg, and the posed clip failed G5 on walk south (area CV 0.16) with an
unclear grip in idle east. The owner judged both the straight and the raised poses awkward; the wording stays as it was.

## Minimal and negative hand wordings: rejected

The owner asked whether the held prompt could be just the hand ("held in the character's right hand", left for the off hand),
letting PixelLab choose the pose, and then whether Pro's negative prompting ("not the left hand") would keep the hand. Seven
items on the 80 px Live Test body: sword, axe, torch and a deliberately right-hand shield in the main hand; shield, lantern and
bow in the off hand. Current wording (A) and the minimal wording (M) ran through production `runItem` (dress plus idle and walk
poses in three views; A one seed, M two seeds); M2 to M5 ran the dress call only, two seeds. 203 calls, $8.98, one PixelLab pose
failure (A axe).

Wordings (main hand; the off hand swaps right and left):
- A (current): "..., held in the character's right hand, pointing down and slightly outward; exactly one weapon, no other
  weapons, no scabbard, no shield; the arms stay exactly as they are"
- M: "..., held in the character's right hand" (pose and grid prompts also lost their one-item clause)
- M2: M + "; the left hand is empty"
- M3: M2 + "; the arms stay exactly as they are"
- M4: "..., held in the character's right hand, not the left hand"
- M5: M4 + "; the arms stay exactly as they are"

Dressed standing views, front and back of the six items whose hand is checkable (the right-hand shield is listed apart): a view
is bad when the item is in the wrong hand or drawn in both hands.

| Wording | Bad views | Where | Largest key outside (body moved) |
| --- | --- | --- | --- |
| A | 0 of 12 | none | 0.02 |
| M | 5 of 24 | torch wrong hand (both seeds), two axes | 0.13 (torch, east) |
| M2 | 3 of 24 | torch wrong hand, a second torch | 0.06 |
| M3 | 6 of 24 | axe wrong hand (both seeds), torch | 0.03 |
| M4 | 5 of 24 | torch wrong hand, an axe in the left hand and a second axe | 0.11 (axe, east) |
| M5 | 6 of 24 | torch wrong hand (both seeds), a second axe, a lantern in the right hand | 0.10 (torch, east) |

The right-hand shield went to the left hand in every wording, A included, so removing "no shield" does not let a shield sit
in the right hand; PixelLab holds shields in the left hand. Without an orientation, PixelLab raises swords, axes and torches
(reach up to 65 px against about 30), and a raised torch goes to the left hand whatever the prompt says, negative prompt
included. Full pipeline: A passed or warned on 2 of 6 scored items; M passed none of 14 (torches and bows failed the body
checks G2 and G3 in every idle frame, swords and axes failed G5 or G9, and the right-hand shield failed G8).

Decision: keep the current wording. Its direction and one-item clauses are what keep the item in the requested hand and the
frozen arm in place; dropping them makes PixelLab's own default (a raised, larger item, often in the left hand) the result.
