# Attack while moving: layering, split bodies, and what to build

Date: 2026-11-24
Status: research spike, no implementation approved
Revised after the independent [GPT-6.2 Sol review](review-gpt62/README.md)

Question: the live views let you attack in one direction while walking in another, and the character slides because the attack clip owns the whole body. Can PixelDoll combine an action animation with locomotion animation, at high quality, on baked directional sprite frames, and expose that as an optional runtime capability on every export platform?

Inputs in this folder:

- [research-industry.md](research-industry.md): industry practice with sources and confidence labels.
- [architecture-map.md](architecture-map.md): runtime, live-view and export mechanics with file and line references.
- [composite-probe.md](composite-probe.md): the rendered pixel experiment, now including corrections.
- [review-gpt62/](review-gpt62/README.md): an independent reviewer's own research, 384 phase comparisons, engine source inspection, API design and disagreement notes.

## 1. Answer

**In plain terms.** The attack picture is a single drawing of the whole body, so simply sawing it in half at the waist cuts through hands, swords and capes. But you do not have to saw the attack in half. You can keep the attack's upper body whole, throw away only its own legs, and put the walking legs underneath, lining up the hips frame by frame. Arms and weapons stay intact because they belong to the upper picture. That is the cheap way, and a careful test showed the join can be about one pixel off rather than a visible gash, as long as both halves face the same direction. What it cannot do is make the chest face one way while the legs walk another; that pose was never drawn. And anything that hangs across the waist (cape, long coat, low-held two-hander) has no clear owner at the join, so those characters need a different approach.

Technical summary follows.

An interactive visual explainer using the real frames is in [layering-explainer.html](layering-explainer.html): drag the cut line to see the straight-cut failure, then compare the leg-only removal.

**The requested capability is achievable for the case that matters most, if it is treated as authored, reviewed layering rather than an automatic split.**

- **Same-facing action layering works as a pilot.** Keep the Walk legs and gait, play the attack's upper body over them, both facing the same direction. The independent review's fitted per-frame graft reached a **1 px median and 2 px maximum junction edge step** on the south pair, with no detached fragments in most phase pairs. That is reviewable art, not a broken cut.
- **Layering removes the slide by construction**: the legs are still walking while the body translates. No gameplay policy is needed for the core case, which answers the owner's objection that rooting or slowing is a workaround.
- **Independent aim (torso facing the aim while legs walk elsewhere) needs new art.** Either a torso drawn at the relative angle to the pelvis, or an authored strafe/backpedal gait, plus occlusion and depth for items that cross the join. Two directional drawings cannot be combined into a pose that was never drawn.
- **Automatic, general splitting of existing clips is rejected.** Fixed cuts clip fists and weapons; cross-direction pairs do not join; equipment that crosses the seam (cape, long coat, two-handed weapon) has no owner.

So the honest product answer is three tiers, in this order: reviewed same-facing layering from existing art (free), authored independent-aim parts (small paid art), and whole-body moving-action clips for pelvis-driven attacks (larger paid art). A per-game movement policy remains a fallback setting for characters without any of these, not the fix.

## 2. Corrections to the first version of this spike

The first version was wrong in two ways, both caught by the review. They are recorded here instead of quietly fixed.

1. **The cross-direction evidence was invalid.** The fixture's punch sheet has only a south row; its east and north rows are fully transparent (0 opaque pixels). The first probe used that blank row as an "east attack", so its cross-direction image was mostly empty and the "missing head" was an artifact of empty input. The corrected test uses a populated south punch over east walk legs and still fails, but on real evidence: a front-facing torso on a profile gait, narrower overlapping legs, a stray fragment.
2. **A numeric comparison was invalid.** The first version compared the punch's 10 px torso at row 44 to a "25 px pelvis" on the walk frame. The 25 px span includes the arms hanging at the sides, so it is a silhouette extent, not a pelvis width. The seam mismatch is smaller than claimed and, per the review, reduces to about 1 px after per-frame registration.

The review also raised the quality estimate for same-facing layering and lowered the need for a general channel API. Sections 5 to 9 reflect that.

## 3. Why the naive approaches fail, with evidence

| Approach | Result |
| --- | --- |
| Fixed horizontal cut at the hip, any row | Fists occupy rows 35-42 and the torso narrows right above the seam. Cuts at 40-42 clip both fists; cuts at 44+ leave a step. Median junction loss 0.36-0.45 of occupied x positions across directions. |
| Cross-direction split (e.g. south torso, east legs) | Projection mismatch survives any registration: front torso on profile gait, legs overlap, old arm remnants, stray fragment. |
| Different facing per half with existing art | Same projection problem, plus the hip joint was never drawn at that relative angle. Requires authored relative-angle art. |
| Reverse a walk for backpedal | Side view reads as a restrained backpedal (foot spread 2 px over three cells); reversing while still travelling forward slides the foot 12 px. Not a general substitute, and untested for north/south. |
| Automatic split with equipment | A y46 cut deletes 77-87 sword pixels and 105-196 cape pixels per action cell; the intact sword looks materially better; the cape leaves holes and old outlines. |
| Pixel crossfade | Already rejected by the project: ghosting and off-palette colors. |

Two findings matter more than the seam numbers:

- **Silhouette continuity does not validate a pair.** The east pair shows no disconnected pixels by the connectivity metric yet keeps old arm remnants under the punching arm; the north pair scores as well as south while showing the back of the trousers under a visible face.
- **Equipment, not the waist, is the blocker.** Some items cross the seam cleanly (vest, hair, helmet), some do not (cape), and a held weapon must stay intact and follow the hand. That means per-pair, per-outfit eligibility, not a global algorithm.

## 4. Industry practice

Full detail and URLs are in [research-industry.md](research-industry.md). The review added direct source inspection of Teeworlds, OpenRA, Flare, OTClient and LPC. The verified picture:

- **Melee games commit the body.** Brawlers, Zelda-likes and Souls-likes root or slow the character during active frames. This is a real convention, but it is a design choice, not an animation capability. It should not be sold as the fix.
- **Teeworlds is the closest verified precedent for layering.** The body and feet animate from walk phase, while the hammer or ninja slash is added from attack ticks and the hand or weapon is drawn from the aim vector. Crucially, the parts are **authored separately** (body, feet, hands, eyes) and overlap intentionally, with no anatomical waist boundary. It is not a runtime cut of a whole-body sprite.
- **OpenRA contrasts two approaches in one engine.** Turrets rotate independently from a mount position; infantry switch one whole-body animation between stand, move and attack. Both are valid because the art contract differs.
- **Flare and OTClient/ LPC** are layered paper dolls whose layers share one animation state and one facing. Separate gear images do not create independently animated anatomy.
- **Spine, Unity and Godot** can layer because their inputs are independently addressable (bones, tracks, sprite parts). One baked frame property offers no such separation.
- **Commercial 8-direction packs** ship complete walk and attack sets; combined walk-attack sheets are rare. If runtime splitting were practical, the asset market would look different.

## 5. The three tiers, practically

### Tier 1: reviewed same-facing action layering (free, pilot)

**What it actually is, mechanically.** Not "cut both animations at the hip". The steps per frame are:

1. Start from the attack picture for this direction and frame. Keep everything except the attack's own legs and the parts of clothing that belong to those legs.
2. Start from the walk picture for the same direction. Keep only the lower body: legs, feet, and the bottom of shorts or trousers.
3. Move the walk legs so the hip line matches the attack's hip line for that frame. The shift is a whole number of pixels, computed per frame, so it does not wobble by fractions.
4. Overlap the two pieces by one row at the joint, so the darker belt or shorts edge covers the seam.
5. Repeat for every worn layer with the same joint, so the vest comes from the attack picture and the boots come from the walk picture.

**Why the arms are no longer a problem.** The earlier objection was about cutting a single attack drawing at the waist, which severs an arm or weapon that crosses that line. In this method the attack drawing is never cut across its middle. Its arms, weapon and torso stay in one piece, exactly as drawn. Only the legs at the bottom are removed, and the walk supplies replacement legs. A sword held in the hand stays with the hand.

**Why some outfits still fail.** A cape, skirt or long coat can pass in front of one leg and behind the other. At the joint it cannot belong to both pictures, so it has to be authored with alternate depth or excluded. The same applies to a weapon held so low that it overlaps the legs. The review measured this: a fixed cut destroyed 77-87 sword pixels and 105-196 cape pixels per action frame, while vest, hair and helmet were almost untouched.

**What it costs.** No PixelLab generations. The work is a small offline alignment tool, a manual pass to approve each character, walking animation, attack and direction, storing the two halves in the export, and a runtime switch. Each approved combination is recorded, so an unapproved outfit simply keeps today's behavior.

What the player sees: the character keeps walking (legs and gait unchanged) while the upper body punches, slashes or casts, both facing the same direction. The slide is gone because the legs genuinely walk. Aim and travel still have to agree on facing; this tier does not give independent aim.

What PixelDoll must build:

- An **offline art gate** on stored frames: for each candidate (gait, action, facing), place the action's upper body over the walk's lower body using a per-frame upper socket, integer `dx,dy` registration and a one-row overlap junction. Trim dangling walk pixels outside the shorts/hem span. Reject pairs with duplicate hands, exposed cut edges, disappearing items or dropped depth. Review all phase pairs, not one.
- A **recipe registry** in the export: recipe id, locomotion clip, action clip, facing rows, per-frame junction data, lower playback order, and the reviewed outfit constraints. Validate at export and load; fingerprint the source art so a replacement invalidates the review.
- **Pre-split cells** at export (upper and lower fragments per frame), so the runtime only selects cells and draws them at integer offsets. No engine does mask math.
- An API to sample both clocks explicitly (see section 6), default off, with an honest fallback when there is no recipe or the outfit is unsupported.
- Studio-side review tooling: a seam preview at 1x and 2x, per-pair approve/reject, and coverage validation that fails the whole recipe rather than dropping gear.

Cost: zero generations. Engineering is the export format, the registry, the four controller paths and the review tooling. Expected quality: 3/5 after review, with jitter and garment bridging as known limits. The review's south alignment proves the concept; east and north need their own review, and diagonal facing is unverified.

Limits: same facing only, no cape or long outerwear, held weapons must be intact and follow the hand, and each supported pair needs review. `evidence/` in the probe shows the before state.

### Tier 2: authored independent aim or strafe gaits (small paid art)

What the player sees: the original request. Legs walk in the travel direction while the torso attacks toward the aim, or the body faces the aim while the legs strafe or backpedal.

What PixelDoll must build:

- Either an **authored relative-angle torso** per aim/travel pair: the torso is drawn for the actual rotation between shoulder line and pelvis, with the hip junction designed to overlap the gait. This is a new art contract, not a cut.
- Or **authored strafe and backpedal gaits** indexed by facing and travel, so the body can face the aim while the legs move laterally or backward. A reversed side-profile walk is acceptable only for a reviewed opposite-travel pair; reversal cannot produce side-stepping.
- The same layered runtime and registry as Tier 1, extended to approve off-axis pairs and gait pairings.
- Occlusion and depth treatment for items that cross the join, and alternate fragments or authored repair for capes and coats.

Cost: authored or generated parts per supported direction. A skeleton pose is quoted at 3 generations per independently posed layer per drawn direction; a one-direction body plus two items pilot is about 9 generations before repairs, and four drawn directions about 36. Budget per pair, not per character.

Expected quality: 3-5/5 when the art contract is respected; low if reused from unrelated drawings. Coverage: advertise only the pairs that passed review.

### Tier 3: coupled whole-body moving-action clips (larger paid art)

What the player sees: an attack that visibly drives from the pelvis and feet, with a lunge, weight shift or cloth motion, while travelling. One coherent drawing, no seam.

What PixelDoll must build:

- Generation of a combined clip from mixed keypoints: walk leg and hip keypoints plus the action's upper keypoints, resampled to a common timeline, rendered with skeleton-v3. Stored as a normal clip, so no manifest or controller change.
- A strategy for entry and recovery phases, because a single combined clip cannot respond independently to both the gait clock and the action clock.
- QA for foot contact against travel, silhouette continuity, and item posing on the new frames.

Cost: 3 generations per 4-12-cell pose per drawn direction for the body on a successful pass, 9-12 with independently posed items, more for redress and retries; dressed characters in earlier estimates land at 45-250 per move. Expected quality: 4-5/5. This is the tier for capes, coats, two-handed weapons and any attack whose weight is in the lower body.

## 6. API shape, consistent across engines

The review's pilot shape is simpler than a general channel API and should be adopted first: a **recipe registry plus an explicit two-clock sample**. Keep the richer channel idea as a later generalization only if Tier 2 art exists.

```js
doll.getMotionCapabilities()
// { enabled: false, recipes: [{ id, locomotion, action, pair, equipment }], reasons: {...} }

doll.setActionLayerEnabled(true)
doll.presentMotion({
  recipe: "walk-punch",
  locomotion: { clip: "walk", travel: "south", elapsedMs: 375 },
  action: { clip: "cross-punch", aim: "south", elapsedMs: 125 }
})
// { status: "layered" } | { status: "fallback", reason: "noRecipe" | "unsupportedPair" | "unsupportedEquipment" | "disabled" }
```

Rules:

- The caller supplies finite, nonnegative elapsed ms for both clocks. One call returns a draw or a fallback; it never ticks, schedules, emits hit events or moves the root. Same inputs, same pixels.
- The action is once-only; at its total duration the doll renders locomotion. Undefined action time means locomotion. Locomotion loops.
- Preserve lower phase across action start, end and aim changes by passing unchanged locomotion time. Reversing a gait means reversing its cell/duration list, with an authored phase offset when needed.
- Default off. Legacy `play()` remains available and exits manual mode. Unsupported pairs fall back to the whole-body action (or locomotion) with a stable reason. Invalid input or a manifest mismatch is rejected atomically and preserves the previous presentation. Never drop gear or pick another aim silently.
- Same names in JS/Phaser and GDevelop, snake_case in GDScript, PascalCase with typed inputs in C#. Same fields, same behavior.
- Exports without a registry expose no recipes, so old exports behave exactly as today.

Native implementation is only texture selection at integer offsets: Phaser stops its body animation driver and selects atlas cells; GDevelop bypasses its single-clip elapsed update; Godot pauses the body AnimatedSprite and sets ordered region sprites; Unity bypasses the Animator clock sprite and assigns imported attachments. No native masking, no anatomical inference. This keeps parity testable.

Later generalization, only if Tier 2 art exists: named regions (`lower`, `upper`, `head`, `arms`, `weapon`), N ordered channels, and per-channel facing. It is not needed for Tier 1 and it adds coverage and review burden.

## 7. Plan

### Phase 0: this spike (done)

Documents and evidence in this folder, including the corrected probe and the independent review. Decision requested in section 9.

### Phase 1: offline art gate (free)

- Implement the fitted graft as a scratch tool over stored frames: per-frame upper socket, integer registration, junction trims, phase-grid review, continuous playback at several action start phases.
- Cover south, east and north (west mirrors), at least one dressed character with trousers, a vest, a cape, a held sword and a helmet.
- Pass criteria: no exposed cut hand, no duplicate limb, no disappearing item, no dropped depth, junction edge step within 1-2 px where the silhouette is intentional, and a documented list of unsupported outfits.
- Verdict per pair: approved or rejected, recorded as data.

### Phase 2: runtime and export pilot (free if Phase 1 passes)

- Export pre-split upper/lower fragments and the recipe registry; validate coverage and fingerprint the art.
- Implement `getMotionCapabilities`, `setActionLayerEnabled` and `presentMotion` in the canonical JS, then Phaser, GDevelop, Godot and Unity.
- Dogfood in the live view with a temporary toggle, keeping the existing whole-body attack as the fallback.
- Native conformance checks: expected packet sequences plus real in-engine pixels at integer origins, including repeated cells, unequal durations, completion and reversal boundaries, toggle mid-action, aim change at unchanged gait time, unsupported gear fallback, padded mirrored weapon, palette and depth, atomic rejection, and return to legacy playback.

### Phase 3: art expansion for independent aim (paid, opt-in)

- Author or generate relative-angle torso parts or strafe/backpedal gaits for one signature move in four directions, with one or two items.
- Extend the registry to approve off-axis pairs and gait pairings; publish only what passed.
- Add Studio review for these pairs and a per-pair cost estimate before spending.

### Phase 4: coupled variants (paid, selective)

- Generate whole-body moving-action clips for attacks whose weight or clothing needs a single pose, and select them with the same API.
- Consider a skeletal or cutout asset format only if authored attachment demand justifies a second pipeline.

## 8. Budget

| Item | Generations | Notes |
| --- | ---: | --- |
| Phase 1 offline gate | 0 | Scratch scripts on stored frames |
| Phase 2 pilot (same-facing, approved pairs) | 0 | Pre-split cells, registry, four controllers |
| Tier 2 relative-angle torso or gait, 1 direction, body only | about 3 | One successful skeleton-v3 pose, 4-12 cells |
| Same, body plus two independently posed items | about 9 | Plus redress and retries |
| Tier 2, four drawn directions | about 12-36 | Before repairs |
| Tier 3 combined moving-action clip, dressed | 45-250 per move | Dominated by item posing; quote per project first |

All numbers are estimates from measured unit costs, not quotes. No paid trial has confirmed mixed-pose silhouette or foot contact.

## 9. Decision requested

1. Approve Phase 1, the free offline art gate on stored frames, with a pass/fail verdict per pair.
2. If it passes, approve the pre-split export format and registry plus the four-engine pilot, default off.
3. Treat independent aim as art work (Phase 3), not as a runtime algorithm.
4. Keep a per-game movement policy as a documented fallback setting only, and do not present it as the fix.
