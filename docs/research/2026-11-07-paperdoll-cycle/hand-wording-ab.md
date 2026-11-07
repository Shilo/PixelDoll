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
