# Prompt trim A/B (2026-11-08)

Owner request: keep every hard-coded word sent to PixelLab only where it is needed. Agent mode on a new account, new
"Prompt Test" character (64 px body in an 80 px frame, four views, west mirrored, low top-down), production request builders run in the browser with
only the tested words swapped. Judged by eye and by the app's checks (G2/G3 body kept, G4 to G9, H4).

## Dress prompt words (`chromaPrompt` in app/src/lib/image/chroma.ts)

Then current: "This pixel art character is a solid bright green mannequin. The bright green color is intentional (a chroma key)
and must stay exactly the same bright green in every frame. Add only {item}, drawn in its own natural colors (no bright green
on the item), identical design in all frames. Cells in order: ... Keep every other pixel, the pose, the outline and the
transparent background unchanged."

18 dress calls (standing views): "a huge wide-brimmed purple wizard hat", "a pair of large white feathered angel wings" and
"a glowing cyan crystal circlet", seeds 8101 and 9101.

| Arm | Change | Result |
| --- | --- | --- |
| base | none | 6 of 6 pass or warn (one G7 border warning) |
| D1 | "drawn in its own colors" (no "natural") | 6 of 6 pass or warn; images look the same as base |
| D2 | D1 plus "Keep every other pixel, the pose and the transparent background unchanged" (no "the outline") | Wings and hats drawn larger, touching the frame edge more (G7 on 4 of 6), one H4 fail |

Wings and big hats already extend past the body under the base wording, so "the outline" does not limit item shape; it stays.
"natural" has no measurable effect either way; it is dropped so the prompt does not steer neon or glowing designs.

## Colors the chroma key cannot read (`pickKey`)

| Item | Key picked | Result |
| --- | --- | --- |
| "una capa verde" | green | Cape erased with the key: G3 and G4 fail in every view; the app suggests magenta for Try again (`retryKey`) |
| "a cape the color of fresh spring leaves" | green | Green cape, G3 fail; magenta suggested |

The measured collision check (`measuredKeyCollision`, run.ts) catches colors the English word list misses, at the cost of one
failed dress call before the suggested key is used. Kept as is.

## Item pose wording on a slash (`itemRoute.pose` in app/src/lib/items/items.ts)

Then current request to animate-with-skeleton-v3 for a worn item: description "solid bright green mannequin (chroma key color)
wearing {item}, empty hands, no weapon", action "{move}, empty hands, no weapon, no effects". Arm P1 sent the action as the
move alone ("slash"). "an iron knight helmet" and "a long red cape", slash in three views, same dress and pose seeds (12 pose
calls, the dress calls shared).

| Item | Then current | Action without the suffix |
| --- | --- | --- |
| Helmet | fail: body changed in south/3 and east/2 to 3 (G2); a sword drawn into the side-view swing | fail: the same plus south/6 and 7, and a sword also in the front view south/3 (H4 "looks like the opposite view") |
| Cape | fail: G2 south/3, east/2 to 3; a sword in the side-view swing | fail: G2 also north/2, bigger body change east/3 (0.826 against 0.947) |

PixelLab draws a sword into a worn item during a side-view slash even with "empty hands, no weapon" in both fields; the
gates fail those items. Removing the action suffix made it slightly worse, so both stay.

## Described moves: PixelLab returns one extra motion frame

Every pixminimax motion call for a described move returned frame_count + 1 frames (9 for 8, `keep_first_frame: false`): all 9
calls over three descriptions ("casts a spell with both hands" seeds 7171 and 7272, "swinging a sword overhead" seed 8383),
three views each. `motion()` in app/src/studio/create.ts rejected the count mismatch, so described moves failed before the
body render until the fix below. Offline follow-up on the stored jobs: after the same normalization `motion()` applies, frame 0 is byte-identical to the
character's standing view in all 9 jobs (three descriptions, three views), so it is the reference start frame the schema
says `keep_first_frame: false` strips. `motion()` now drops one extra frame only when it is pixel-identical to the standing
view and still fails on any other count (unit test in targeted-move.test.ts). Rerunning "casts a spell with both hands"
(seed 7272, motion replayed from the ledger) then measured 8 frames per view and saved a clean, prop-free body move with no
warnings.

## Body render action for described moves (`bodyAction` in app/src/studio/create.ts)

Question: should the raw skeleton-v3 body render send the user's description as its `action` instead of the move label (the
first two words as an id, e.g. "swinging-a")? The motion request already gets the full description. With the motion step
blocked by the extra frame above, the render was tested directly on the stored slash poses (same rest view, keypoints,
description and seed 6262 as the saved slash body), every action ending in ", empty hands, no weapon, no props, no effects".
12 new render calls, one view each: the two descriptions and the two labels ("swinging-a", "casts-a") in south, east and
north. The "slash" row is the stored body, not a new render; the "casts-a" renders were not reviewed.

| Action | Front | Side | Back |
| --- | --- | --- | --- |
| "slash" (saved body) | a sword sliver in one frame | a sword in 2 frames | clean |
| "swinging-a" (label) | not compared | a sword in 2 frames | clean |
| "swinging a sword overhead" (description) | a sword in one frame | a sword in 3 frames | a sword in 3 of 4 frames |
| "casts a spell with both hands" (description) | clean | clean except two spark specks | not compared |

The raised arm of a slash invites a sword in the side view whatever the action says. A description without props renders a
little cleaner, but one that names a prop draws it into the frozen body from every side, where nothing can remove it later.
Users name weapons in move descriptions, so the body render keeps the label and the description stays in the motion request
only. The move sheet now says "The body is drawn with empty hands and no effects. Add weapons and props as items." and a
description in another script (empty label) gets the first free "move-N" id.

## Decisions

- Kept: the body bare-suffix on moves, "the outline" in the dress prompt, the item pose action suffix, and the English color
  words plus the measured key-collision check.
- Changed: "natural" removed from the dress prompt; the repair grid's back-slot line is now "it never wraps around or
  follows the arms" (no cape-only "hangs from the shoulders down the back"); described moves in any script get an id; one
  `bodyAction` builds the body render action for rendering, recovery and the API preview; one `frameOrder` sorts job
  results everywhere.
- Fixed: the extra pixminimax start frame (described moves failed).
- Fixed: the motion frame count stays strict except for that one pixel-identical start frame.
- Open: props drawn into body slash frames. The body palette note now names that possible cause; a small prop, or one in
  body colors, is not caught because the color check measures the whole move.
