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
  is from 2026-10-20. The [November 2 contract capture](research/pixellab/2026-11-02-managed-custom-v3-contract.json)
  supersedes its managed custom `/characters/animations` description; see the folder's [contract note](research/pixellab/README.md).

## Generation and quality

- **Automatic dye correction trades coverage for detail.** Close, unambiguous owned shades can be matched to the approved standing palette. A clip-wide veto keeps an existing visible RGB boundary from collapsing, so some generated shades remain outside exact dye ramps. This does not identify semantic pixel ownership or recover a missing motif. Global palette snapping remains unqualified. See the [palette experiment and boundary safeguard](research/deep-paperdoll-target-palette-2026-11-06.md).
- **Thin held-item fragments can be lost inside an allowed mask.** Conservative outline and held-component cleanup can
  remove valid rear handle or pommel pixels. Mask containment limits where pixels may survive; it is not a semantic
  weapon matte. Proposed restoration Rules A/B remain deferred because they restore known body-rim false positives.
  See the [joint reassessment](reviews/2026-11-02-joint-review-reassessment.md).
- **Experimental art still needs visual acceptance.** The east axe retains its complete head and geometric body contact,
  but raised fists merge with the skull, some hip grips are ambiguous, and body/lighting changes can pop. The starter
  attack may read as a punch and crouch rather than a chop; walk faces vary between frames. Rejected breathing idle also
  shows reported belly inflation and mouth artifacts. These still-image observations do not justify repainting frozen
  bodies or promoting an equipped preset. See the [complete-session review and disposition](reviews/2026-11-02-complete-session-counter-review.md).
- **Research spending has separate ledgers.** The starter enforces its local 150-unit motion counter. Remaining user
  allowances and older campaigns are reconciled manually; that counter is not a cross-campaign account cap. Estimates
  do not limit provider billing. A missing job record is not proof of non-submission and cannot release an uncertain hold.

- **The eight-direction starter pack is experimental and body-only.** One humanoid style and camera were tested.
  Standing idle reuses the frozen reference; generated breathing added unwanted effects and was rejected. Walk and the
  curated attack retain native artwork, but other proportions, cameras and body shapes are unqualified. The pack contains
  no weapon layers and does not replace Studio's default generation route. See the
  [starter evidence](research/2026-11-02-eight-direction-starter-pack.md).
- **Matching walk cadence does not prove planted feet.** Live walking now follows analog movement strength, fixing the
  half-speed movement/full-speed gait mismatch. Absolute stride speed still depends on sprite scale, projection and the
  destination game. The reviewed east sample had a 0.75 px boundary residual at an explicitly chosen native speed, while
  each held frame still represented 2.25 px of travel. Hidden or ambiguous feet remain unmeasured; neither result is a
  universal contact threshold. See the [closeout and measurements](research/2026-11-02-animation-closeout.md).
- **Held-item guards validate geometry, not anatomy or perspective.** Unmarked/off-body targets, transparent rigid-source
  anchors and known source clipping are blocked. These checks cannot identify fingers, supply hidden-hand positions,
  create missing directional weapon artwork or detect an axe head already absent from its source PNG. Native frame art
  and source/view-specific visual review remain necessary before equipped attacks become default presets. The single
  authored east axe is not evidence that weapons work correctly in all eight views.

- **Experimental motion retargeting is not universally qualified.** The dev-only Motion Lab now covers all 54 available native body/action/view profiles and supports authored contacts, measured soles and explicit weapon grips/masks. Equipped attacks and rendered foot planting still fail in some cases. A two-frame frozen-body grid repair is promising; full-clip quality, independent west/diagonal artwork and repeatability remain unqualified. Two older experimental walk reviews are retained. See the [targeted results and limitations](research/2026-10-28-motion-targeted-authoring.md).
  The [controlled November 1 comparison](research/2026-11-01-workflow-reconciliation.md) favors managed custom V3 body motion, but its equipment test adds a new hand and fails after weapon extraction. Exact protected pixels do not establish correct grip; neither route is a qualified Studio replacement.
  The [November 2 weapon-aware experiment](research/2026-11-02-weapon-aware-grip.md) deliberately authors the gripping hand and reuses known original body pixels elsewhere. Production inpaint extraction now enforces the exact submitted mask, including through cleanup and body cuts. Inside-mask anatomy, hidden grips, other views and transfer to other bodies still require review; the new custom-body workflow remains experimental.
  The later [clean-grip control](research/2026-11-02-clean-grip-qualification.md) removed the old sword cue, protected all body pixels and supported complete desired heads in narrow masks. It still omitted one axe head and changed the other shaft. Both raw artwork and extracted layers fail; no full-clip or repeat was purchased. Presets remain unqualified despite exact pixel preservation.

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
- **Combinations of body cuts.** Exports include the union of hidden body pixels for every valid equipment combination, including mirrored views. At most 256 body variants are generated. An inventory needing more combinations fails before generating sheets and asks for fewer designs that hide body pixels. Items made before round 3 keep showing the ears until re-dressed. See the [combined cut qualification](research/deep-paperdoll-ownership-followup-2026-11-06.md).
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
  not from the first idle frame as on older characters, and moves added later keep it. **Add idle + walk** picks a new
  random seed on every tap; the character's seed no longer reaches its moves, so an earlier attempt cannot be reproduced.
- **Items made before idle and walk exist** (a Default-only character) have no frames for those moves until the user taps
  the item's priced **Make for Idle + Walk** offer; nothing is posed automatically. **Add idle + walk** adds body moves only;
  each item keeps its own priced offer for the new moves.
- **Garment regions use a 1/255 blue nudge** to keep shirt/shorts colors disjoint (D10). Invisible, but it alters
  PixelLab pixels; upgrade path = per-layer region mask in the manifest.
- **The authored east axe is an experimental import.** Its full clip can now be opened and inspected in Studio, but only one body/view is supported and rear-foot contact is unknown in two merged poses. The source PNGs and Studio's garment-tagged images have distinct pixel identities. See the [Studio integration evidence](research/2026-11-02-studio-axe-integration.md); it is not a universal preset.

## Exports

- **Aseprite repeat metadata.** Play animation once exports tag repeat `1`; looping exports repeat `0`, which loops in the editor. Aseprite interprets `0` as unspecified for its own later export, so users must choose repetition there when exporting again. See [Aseprite tag repeats](https://www.aseprite.org/api/tag#tagrepeats).

## Imports

- **No Default on older characters.** Characters saved before Default (and the demo) are not upgraded and have no Default
  move; recreate or reimport them to get it.
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
