# Known issues and limits

Accepted limitations and standing risks. They are not tasks: open work lives on the [PixelDoll board](https://github.com/users/Shilo/projects/7).

## Credentials and hosting

- **Intentional shared-origin trust.** Every app on this origin may use the optional remembered `pixellabApiKey`. A
  compromise in any such app can expose it. App-generated channel notifications contain no token, and Forget clears
  cooperating open apps. Origin isolation and encryption are not part of the current UX. See
  [shared token contract](shared-token-security.md).
- **Agent-only key mode is a convention.** `npm run dev:agent` reads `.env` for AI agents; humans use `npm run dev` (no
  key path). Builds refuse agent mode; the CI guard fails if key code or `.env` reaches `dist/`.

## PixelLab credits and API

- **Credits are real money.** Query the balance before paid work. Creating a character costs about 2–5 gens up to a
  128 px body (the Default standing views only); **Add idle + walk** then costs about 11 gens per drawn view before items and retries (55 on
  the default Top-down 8, 33 on Top-down 4, 88 on Unique 8). Item and move estimates depend on route and coverage. Some calls bill dollars; estimates are not caps. Lost responses may have run or charged and are never
  auto-resent.
- **Unknown paid outcomes.** Three Cast body joint-measurement outcomes remain unknown; do not infer their charges from
  the shared balance or resend them. Fitting records both generations and USD, including rejected attempts and explicit
  retries. See the [shared-equipment ledger](testing/shared-equipment-2026-10-22.md).
- **API drift.** Template list, prices and Pro/Pro Flash behavior change; the OpenAPI snapshot in `research/pixellab/`
  is from 2026-10-20.

## Generation and quality

- **Generation is not bit-repeatable.** Same request + seed ≠ same pixels, so base frames are frozen and never
  regenerated; changing the base (`baseHash`) makes existing items stale.
- **Mirrored directions flip handedness and one-sided items** (west holds the sword in the left hand; an eyepatch, a single
  pauldron, a side part or a quiver on one shoulder moves to the other side). New forms default to Top-down 8, which
  mirrors the west views; Unique 8 or turning off a mirror gives independent views, and old projects stay mirrored.
  Independent views avoid the forced flip, but generated anatomy and grip still need review: the idle sword keeps a
  west-profile ambiguity, and the repaired Slash keeps its item review warnings. An item-only toggle cannot repair old
  flipped actions.
- **Historical item QA.** Older saved items lack replaceable checks; after an edit they stay marked for review with an
  explicit incomplete-check notice. Retained historical totals may omit old additions or include replaced frames until
  all older coverage is replaced. No paid recheck or silent reconstruction is performed.
- **A few item colors have no safe key color.** Items are drawn on a single-color stand-in body (green, else magenta, else
  blue, else azure) and separated by that color. An item whose words ban all four keys keeps magenta, and parts in those
  colors can be removed as if they were background. Two words can be enough ("a teal and red tunic": teal bans green, blue
  and azure). Colors the prompt never names (a goblin's green skin) are not seen at all. Workaround:
  describe one color differently, or review the item. Azure sits near blue-gray steel shading: steel stays gray since the
  round 3 despill fix (a green and purple plume on a steel helmet, a tabard over steel plate).
- **Hidden body pixels with two covering items.** A hood or great helm hides the ear tips it covers (round 3). Wearing two
  such items from different slots (a hooded cloak and a helm), the Studio hides both sets but a game engine draws one baked
  body, so one item's ear tips can show; export warns. Items made before round 3 keep showing the ears until re-dressed.
- **Long held items lose size where the body hides them.** Bows change size between walk frames and may turn against the
  hand, mostly in the side view, where a left-hand bow is behind the body; some of these clips are real flips of the bow, so
  the size and turn checks keep flagging the clip for repair. An upright-bow wording looked better but did not reduce failing
  clips enough (round 3 arm V).
- **Bare bases vary by seed.** New characters are drawn fully bare; some seeds add tattoo-like blotches, gray skin or a
  background scene, and PixelLab occasionally adds a hair tuft or smoke to single animation frames. Re-roll the character
  ([bare-skin wording](research/bare-skin-base-wording-2026-10-25.md)).
- **Small accessories seen from the front only.** An empty back view of a small item (glasses from behind) is a review
  warning, not a re-roll; an empty front or side view always fails, so a small item worn only at the back of the head (a hair
  clip) fails its front view and ends in review ([round 5](research/lexingel-paperdoll-findings-round5-2026-10-25.md)).
- **Action poses invent props.** Slash poses draw swords and motion streaks even for helmets and capes; cleanup removes them
  from the saved layers, but streaks across the face can still fail the helmet's consistency check. Changing the action
  wording had no reliable effect (round 2 arm A).
- **Default-only characters (round 10, D26).** All standing views arrive together, because PixelLab draws every rotation
  in one job; the creator cannot show them one by one. The pivot comes from the standing south view (`default/south/0`),
  not from the first idle frame as on older characters, and moves added later keep it. **Add idle + walk** sends the seed
  the character was drawn with, as creation did, so a creation interrupted before Default-first reuses its paid idle and
  walk from the ledger (an imported character uses its rig setup's seed).
- **Items made before idle and walk exist** (a Default-only character) have no frames for those moves until the user taps
  the item's priced **Make for Idle + Walk** offer; nothing is posed automatically. **Add idle + walk** poses the items the
  character has when it is tapped (the ones it is priced for). Held items split over several dress calls pose only after
  every dress call passed, as before, so a late key switch never wastes poses.
- **Garment regions use a 1/255 blue nudge** to keep shirt/shorts colors disjoint (D10). Invisible, but it alters
  PixelLab pixels; upgrade path = per-layer region mask in the manifest.

## Imports

- **Default on older characters.** Characters saved before every character had Default get it when opened. Equipment
  without dressed standing views (anchor, grid and diff items, fixtures) has no free source for it and stays hidden on
  Default; remake it to fill it. The demo has no standing views, so it has no Default move. A character with unfinished
  item drafts is upgraded once they are kept or discarded.
- Old imports may have wearable frames but no dressed standing references, and incomplete body views are a character
  setup/import limit. Arbitrary PNG-folder or spritesheet ZIPs are not supported character import formats; they would
  need a user-confirmed layout mapper.

## Shared equipment guardrails

Preserve: immutable pinned design snapshots; safe source/library deletion; independent target materials/outfits; exact
per-cell pixel/geometry proof for free copying; reuse of approved target rest references; generation of only missing
cells; palette normalization before fit planning; durable review and atomic wardrobe publication; honest
incomplete-measurement/provenance labels; and no automatic resubmission of uncertain paid requests.

"Shared" means this browser origin's local library plus portable design ZIPs; there is no account or cloud sync.
Clearing browser storage can lose unexported work. Cloud sync, a public gallery and universal automatic retargeting are
out of scope.

## Testing scope

Physical-phone testing is out of scope by user decision (2026-10-22). The live site passed the keyless Studio
regression in Edge, including emulated phone and tablet layouts; no physical-device or real-key claim.
