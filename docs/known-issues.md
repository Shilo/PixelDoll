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

- **Credits are real money.** Query the balance before paid work. New characters default to Top-down 8, estimated at
  57–94 gens; Top-down 4 is 35–57 and Unique 8 (all independent) 90–149. Item and move estimates depend on route and
  coverage. Some calls bill dollars; estimates are not caps. Lost responses may have run or charged and are never
  auto-resent.
- **Unknown paid outcomes.** Three Cast body joint-measurement outcomes remain unknown; do not infer their charges from
  the shared balance or resend them. Fitting records both generations and USD, including rejected attempts and explicit
  retries. See the [shared-equipment ledger](testing/shared-equipment-2026-10-22.md).
- **API drift.** Template list, prices and Pro/Pro Flash behavior change; the OpenAPI snapshot in `research/pixellab/`
  is from 2026-10-20.

## Generation and quality

- **Generation is not bit-repeatable.** Same request + seed ≠ same pixels, so base frames are frozen and never
  regenerated; changing the base (`baseHash`) makes existing items stale.
- **Mirrored directions flip handedness** (west holds the sword in the left hand). New forms default to Top-down 8, which
  mirrors the west views; Unique 8 or turning off a mirror gives independent views, and old projects stay mirrored.
  Independent views avoid the forced flip, but generated anatomy and grip still need review: the idle sword keeps a
  west-profile ambiguity, and the repaired Slash keeps its item review warnings. An item-only toggle cannot repair old
  flipped actions.
- **Historical item QA.** Older saved items lack replaceable checks; after an edit they stay marked for review with an
  explicit incomplete-check notice. Retained historical totals may omit old additions or include replaced frames until
  all older coverage is replaced. No paid recheck or silent reconstruction is performed.
- **Some item colors have no safe key color.** Items are drawn on a single-color stand-in body (green, else magenta, else
  blue) and separated by that color. An item that names green and purple (or violet, indigo) collides with all three, so it
  keeps magenta and its purple parts can be removed as if they were background. Workaround: describe the purple as another
  color, or review the item. See the [campaign](research/generation-quality-campaign-2026-10-25.md) follow-ups.
- **Back views of full-coverage items on Studio bodies.** A hooded cloak seen from behind came out with a dark rim around
  the hood (pointed ears redrawn) and a speckled texture on the 80 px elf; the "key kept" check flags it for review.
- **Action poses invent props.** Slash poses draw swords and motion streaks even for helmets and capes; cleanup removes them
  from the saved layers, but streaks across the face can still fail the helmet's consistency check.
- **Garment regions use a 1/255 blue nudge** to keep shirt/shorts colors disjoint (D10). Invisible, but it alters
  PixelLab pixels; upgrade path = per-layer region mask in the manifest.

## Imports

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
