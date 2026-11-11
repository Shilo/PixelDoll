# Known issues and limits

Accepted limitations and standing risks. They are not tasks: open work lives on the [PixelDoll board](https://github.com/users/Shilo/projects/7).

## Credentials and hosting

- **Intentional shared-origin trust.** Every app on this origin may use the optional remembered `pixellabApiKey`. A
  compromise in any such app can expose it. App-generated channel notifications contain no token, and Forget clears
  cooperating open apps. Origin isolation and encryption are not part of the current UX. See
  [shared token contract](shared-token-security.md).
- **Agent-only key mode is a convention.** `npm run dev:agent` reads `.env` for AI agents; humans use `npm run dev` (no
  key path). Builds refuse agent mode; the CI guard fails if key code or `.env` reaches `dist/`.
- **A reopen at the instant the last tab closes can stall once (Chromium).** Closing every app tab activates a waiting
  update. A navigation that starts within a few milliseconds of that close sometimes never sees the activation and spins
  until reload; a reload or a new tab then loads normally. No PixelDoll worker code runs in that window, and a person
  reopening by hand is far slower. The end-to-end test waits for activation before reopening (2026-11-10 stress runs).

## PixelLab credits and API

- **Credits are real money.** Query the balance before paid work. Creating a character costs about 2–5 gens up to a
  128 px body (the Default standing views only); **Add idle + walk** then costs about 11 gens per drawn view before items and retries (55 on
  the default Top-down 8, 33 on Top-down 4, 88 on Unique 8). Item and move estimates depend on route and coverage. Some calls bill dollars; estimates are not caps. Lost responses may have run or charged and are never
  auto-resent.
- **Unknown paid outcomes.** Three Cast body joint-measurement outcomes remain unknown and cannot be reconciled (the
  synchronous endpoint returned no job IDs to query); do not infer their charges from
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
- **The hand covers the grip of a held item.** The body stays frozen, so a sword or lantern is drawn as two layers: the part
  off the body behind or beside it, and the part over the body on top of everything. Where PixelLab draws the fist over the
  grip, those pixels stay body, so the grip shows under the fingers, as a real grip would. The layering cuts nothing from the
  item at the grip; extraction cleanup can still drop small detached parts elsewhere.
- **Older characters' Off hand layer order.** Characters saved before Main hand and Off hand were split keep their
  earlier Off hand layer order, so **Layer order** shows **Reset** on their Off hand items until pressed; there is no
  migration.
- **Side views can put an Off hand item in the main hand.** In east views PixelLab sometimes draws a lantern, shield or bow
  in the hand nearest the viewer, the sword hand, instead of the far left hand behind the body. The hand check
  (G8) flags it for review; keeping the item keeps the wrong hand, and a mirrored west copies it. Try again or a repair of
  that view draws a new one (2026-11-07 live test: the lantern in east).
- **Historical item QA.** Older saved items lack replaceable checks; after an edit they stay marked for review with an
  explicit incomplete-check notice. Retained historical totals may omit old additions or include replaced frames until
  all older coverage is replaced. No paid recheck or silent reconstruction is performed.
- **A few item colors have no safe key color.** Items are drawn on a single-color stand-in body (green, else magenta, else
  blue, else azure) and separated by that color. An item whose words ban all four keys keeps magenta, and parts in those
  colors can be removed as if they were background. Two words can be enough ("a teal and red tunic": teal bans green, blue
  and azure). Colors the prompt never names (goblin-green armor) are now measured on the dressed views: a view whose colors
  lean toward the key gets a review note and Try again uses a measured key. The measure misses collisions that leave few
  near-key shades (one recorded magenta jester at 2 to 6 %), and the two recorded collisions it catches read 21 to 29 %, just
  above the 20 % note threshold.
  Workaround: describe one color differently, or review the item. Azure sits near blue-gray steel shading: steel stays gray since the
  round 3 despill fix (a green and purple plume on a steel helmet, a tabard over steel plate).
- **Combinations of body cuts.** Exports include the union of hidden body pixels for every valid equipment combination, including mirrored views. At most 256 body variants are generated. An inventory needing more combinations fails before generating sheets and asks for fewer designs that hide body pixels. Items made before round 3 keep showing the ears until re-dressed. See the [combined cut qualification](research/deep-paperdoll-ownership-followup-2026-11-06.md).
- **Long held items behind the body.** Since 2026-11-07 the part of a bow or spear that reappears past the body is kept
  (the frozen side-view bow keeps all its expected pixels; it lost a limb in 6 of 8 frames before). Bows may still turn
  against the hand in the side view; some of these clips are real flips of the bow, so the turn check keeps flagging them. An upright-bow wording looked better but did not reduce failing
  clips enough (round 3 arm V).
- **Bare bases vary by seed.** New characters are drawn fully bare; some seeds add tattoo-like blotches, gray skin or a
  background scene, and PixelLab occasionally adds a hair tuft or smoke to single animation frames. Re-roll the character
  ([bare-skin wording](research/bare-skin-base-wording-2026-10-25.md)).
- **Small accessories seen from the front only.** An empty back view of a small item (glasses from behind) is a review
  warning, not a re-roll; an empty front or side view always fails, so a small item worn only at the back of the head (a hair
  clip) fails its front view and ends in review ([round 5](research/lexingel-paperdoll-findings-round5-2026-10-25.md)).
- **Action poses invent props.** Slash poses draw swords and motion streaks even for helmets and capes; cleanup removes them
  from the saved layers, but streaks across the face can still fail the helmet's consistency check. Changing the action
  wording had no reliable effect (round 2 arm A). The body move itself is
  not immune: a slash body rendered on 2026-11-08 kept a sword in two side-view frames and a sliver in one front frame
  despite "empty hands, no weapon, no props, no effects", and the body has no prop cleanup. Its review note now names
  a weapon, prop or effect as a possible cause of colors missing from the standing body; a small prop, or one in body
  colors, is not caught because the color check measures the whole move
  ([prompt trim A/B](research/2026-11-07-paperdoll-cycle/prompt-trim-ab.md)).
- **PixelLab sends the start frame back on described moves.** Despite `keep_first_frame: false`, pixminimax returned 9
  motion frames for 8 on every described move on 2026-11-08, frame 0 being the standing view. The app drops that frame
  only when it is pixel-identical to the standing view; any other extra frame still stops the move before the body is
  drawn ([prompt trim A/B](research/2026-11-07-paperdoll-cycle/prompt-trim-ab.md)).
- **Default-only characters (round 10, D26).** All standing views arrive together, because PixelLab draws every rotation
  in one job; the creator cannot show them one by one. The pivot comes from the standing south view (`default/south/0`),
  not from the first idle frame as on older characters, and moves added later keep it. **Add idle + walk** picks a new
  random seed on every tap; the character's seed no longer reaches its moves, so an earlier attempt cannot be reproduced.
- **Items made before idle and walk exist** (a Default-only character) have no frames for those moves until the user taps
  the item's priced **Make for Idle + Walk** offer; nothing is posed automatically. **Add idle + walk** adds body moves only;
  each item keeps its own priced offer for the new moves.
- **Small held objects can vanish behind the body in the back view.** Held items are no longer forced to point down: a red
  dot on the intended wrist picks the hand and the item's own description decides how it is held (a candle stays upright).
  A small object carried in front of the body can then be hidden in the standing back view, and the back-view moves may
  invent it, sometimes in the other hand; the hidden-view and hand checks flag those frames for review, and Try again draws
  a new one. See the [hand wording A/B](research/2026-11-07-paperdoll-cycle/hand-wording-ab.md).
- **Dark thin items over deep skin can lose pixels on non-green backgrounds.** The outline guard drops dark generated pixels
  over dark body pixels because PixelLab's redraws of the stand-in body are dark too. On the green background a dark strap
  is kept when it forms a straight line in a non-green color (a 1 px black strap keeps about 94 % on the deepest LPC tone),
  but on magenta, blue and azure backgrounds, and for dark bronze or teal straps, the old gap remains (as low as 32 % on the
  deepest tone). See [rim guard and skin tone](research/2026-11-07-paperdoll-cycle/fairness.md).
- **Near-black outlines tinted toward the key are recovered only when the stand-in does not use that shade.** PixelLab
  draws dark item outlines over the body in a near-black shade of the key (green (4,19,0)); they are kept when they touch
  the item, unless the same shade also appears on the bare stand-in 3+ px from the item, which marks it as the stand-in's own
  outline (magenta draws its outline that way). A stand-in outline seen only next to the item is still kept (about 4 neck
  px per frame on one magenta tunic walk view), and one stray far pixel of the item's outline shade costs that view its
  recovery (1 hair view in 356). Item outline px that stay within 40 of the key ramp are still keyed out, so long braids keep
  short dashed gaps (about 13 px per walk frame); a flat bright mannequin with no dark shades avoided this in a live test but
  made the model draw olive folds into red cloth, so it was rejected. See the [chroma key reference](research/2026-11-09-paperdoll-video-review/chroma-key.md).
- **The body outline can show 1 px beside posed garment edges.** On posed frames the base's dark outline (sometimes a
  sliver of shirt or skin) can sit just outside a torso garment, boot or cape edge, so the edge reads 2 px thick and flickers
  in motion (torso garments 1.77 px per frame; 30 % of posed torso frames have 3 or more). Hiding those body pixels fixed
  boots and capes but not torso garments, and would multiply exported base variants past the export cap, so it was not
  adopted. See the [paper-doll system review](research/2026-11-10-paperdoll-system-review/README.md#3-the-1-px-rim-qualified-and-rejected).
- **A 1 px key-tinted fringe can stay on item rims next to transparency.** Despill now only touches saturated, very dark or
  bright-key-adjacent tinted pixels, so blue-gray steel keeps its color on azure and blue keys. A faint fringe whose only removed
  neighbor is dark keeps its tint: 31 olive pixels on one frame of a red cloak on the green key (they were grayed before; the right
  color would be the cloak's dark red). See the [chroma key reference](research/2026-11-09-paperdoll-video-review/chroma-key.md).
- **The gray-smudge check (D1) compares views.** With three or more drawn views, a view is flagged only when it is much
  grayer than the item's least gray other view, so a neutral emblem drawn in every view passes. A smudge the provider adds
  to every view is therefore not flagged; items with one or two drawn views keep the stricter per-view rule. Lit gray px
  whose color is drawn in at least two other views count as design, so a smudge close to such a gray part (or one drawn in
  three or more views) is missed too: all 8 such synthetic smudges that the older rule caught. See the
  [word-list review](research/2026-11-07-paperdoll-cycle/review-word-lists.md) and the
  [2026-11-10 review](research/2026-11-10-external-layer-research-review/README.md).
- **One wrong dressed view can save as clean.** The dress call draws one keyframe per drawn view, and every item check
  compares a direction only with its own keyframe. A view drawn wrong is posed into that whole direction, passes every
  gate and auto-saves.
  - Live 2026-11-10: 3 of 79 views across 25 dress calls. The back of "a red cape" came out dusty rose on one seed and
    maroon on another (2 of 3 seeds), and a robe was drawn open in one view. All 3 items saved as clean.
  - Rejected checks: leave-one-out palette distance (one dress call shares one palette, so a recolor only reweights shared
    colors), extent and area outliers (fox tails, backpacks and cape backs legitimately differ by view), and a weighted
    foreign-color share (caught the cape, but its margin over a legitimate front-only crest was 0.056 on one prompt).
  - Item-specific prompts or notes, such as "check the back view" for capes, are rejected: they assume what the item is
    from its wording.
  - Workaround: inspect every direction before exporting; Try again redraws the item.
  - Revisit with more independent failing prompts before testing another check. See the
    [2026-11-10 review](research/2026-11-10-external-layer-research-review/README.md).
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

## Shared items between characters

Free sharing copies only onto byte-identical frozen body cells with the same geometry and slot semantics; any other body
needs the item made for it at normal cost. Preserve: exact per-cell proof for copying; independent ids, materials and
outfit choices on each copy; safe deletion of the source character; and no generation without the New item sheet's
estimate and consent.

Main hand and Off hand items can also get a free approximate re-fit: each frame moves by the offset between the two
bodies' wrists (measured joints when stored, else the requested ones), without resampling, and the copy is marked
**Needs a look** with the frames to check. Limits: only the same canvas size and camera (each rig maps its keypoints
through its own pivot, so pivots may differ); both characters need stored skeleton keypoints, and every target move must
exist on the source with the same frame count (or stand still); a pixel pushed off the canvas, a missing wrist or
forearm, or mirrored hand labels reject the item; forearm angle, body overlap and occlusion checks may fail on up to a
quarter of the frames, more rejects it; the grip is approximate (whole-pixel wrist offset, no rotation); items that hide
body pixels or slots never re-fit; head items never re-fit (head sizes differ by 2 to 5 px on the same canvas). Offline
check over the stored real characters (2026-11-10): the bench adventurer's axe re-fits the Ranger with 7 of 36 frames to
check; its sword (13 of 36) and bow (11 of 36) on the Ranger and its axe on the imported Ragnarok (8 of 27) fail more
than a quarter; its sword on Ragnarok leaves the canvas; the other pairs differ in moves or hand labels.

Sharing covers this browser origin's saved characters only; there is no account or cloud sync. Clearing browser storage
can lose unexported work.

## Testing scope

Physical-phone testing is out of scope by user decision (2026-10-22). The live site passed the keyless Studio
regression in Edge, including emulated phone and tablet layouts; no physical-device or real-key claim.
