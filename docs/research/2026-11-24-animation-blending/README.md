# Attack while moving: blending, split bodies, and what to build

Date: 2026-11-24
Status: research spike, no implementation approved
Question: the live views let you attack in one direction while walking in another, and the character slides because the attack clip owns the whole body. Should PixelDoll add optional upper/lower body blending, and if so in which form?

This folder contains three inputs:

- [research-industry.md](research-industry.md): what the games industry does, with sources and confidence labels.
- [architecture-map.md](architecture-map.md): the exact runtime, live-view and export mechanics a blend has to fit into, with file and line references.
- [composite-probe.md](composite-probe.md): an offline pixel experiment on the bundled demo character that renders the candidate composites and inspects them.

## 1. Answer in one page

**Agree on the problem, disagree on the mechanism.**

The slide is real and worth fixing. It comes from one specific decision: `WorldStage.svelte:1303-1307` replaces the whole presentation with the attack while `integrateMovement` keeps translating the actor at full speed (`WorldStage.svelte:1180-1190`). Nothing about the sprite art is broken; the code is playing a planted animation while moving the character.

**Do not build general runtime upper/lower pixel blending as the primary fix.** Three independent lines of evidence say it is the wrong tool:

1. The two clips have no shared seam row. In the probe, the punch's fists and forearms occupy rows 35-42 while its torso narrows to 10 px at row 44; the walk frame's hips are 25 px at that same row. A cut low enough to keep the whole arm (below row 42) cuts where the silhouettes differ by 15 px. A cut high enough to match hip widths amputates the last rows of both fists. There is no row where the halves meet (`evidence/05`, `evidence/06`).
2. A perfect mask does not fix pose mismatch. The punch is a lunge with a twisted waist 10-14 px wide where the walk frame's shorts are 25 px wide. The probe shows a visible step and a detached waist band even with a leg-shaped replacement window (`evidence/07`, `evidence/08`, `evidence/10`, `evidence/11`).
3. The only way to keep the legs walking in the travel direction under a torso facing the aim is a **strafe** animation. A baked directional Walk is drawn for travel along its own facing. Moving east while the body faces north does not exist in the art set. No amount of masking creates it.

Point 3 is the part the original idea misses. There are two separate problems and blending only addresses neither well:

| Problem | Cause | What actually fixes it |
|---|---|---|
| The character slides during an attack | code translates at walk speed while a planted clip plays | movement policy (root, slow, or lunge) |
| Facing and travel differ | baked directional art has no strafe or backpedal set | authored strafe, backpedal, or combined clips; or accept a common facing |

Body-part compositing cannot create missing strafe art. It can only mix two existing directional drawings, and mixing two projections is exactly what looks broken.

**What to build, in order:**

- **Tier 0, free and immediate: an action locomotion policy in the API.** Root or slow the character during an attack, or commit a short lunge, with an opt-out. This is the dominant convention (brawlers, Zelda-likes, Souls-likes, Solarus, Flare), costs zero generations, renders identically in every engine, and cannot look broken. It replaces the current documented "continue moving at normal speed" promise, which must be amended.
- **Tier 1, high quality and paid: generated "action over locomotion" clips.** Use the per-cell keypoints PixelDoll already stores to build a mixed skeleton sequence (walk legs, attack upper body, attack timing) and render it with skeleton-v3. The result is one coherent baked clip with no seam. Cost is roughly 5 to 12 generations per drawn facing for the body plus item posing cost, and it is opt-in per move.
- **Tier 2, experimental: a layered region API with capability gating.** Define the forward-compatible shape now (`playLayered`, named regions, per-channel facing and clock policy, capability probe). Implement pixel splitting only if an authored overlay test passes the seam bar. Never cut at a fixed row; derive the cut from keypoints and the garment boundary, and refuse when geometry or coverage is missing.

If someone still wants the literal effect ("legs keep walking one way, torso attacks another"), the honest implementation is **new art**, not runtime blending: either a dedicated strafe/backpedal set, or a generated asymmetric clip where the character's hips and shoulders are actually drawn at that relative rotation.

## 2. What "blending" means here, and what we would actually be adding

"Animation blending" is a 3D and skeletal term: weighted mixing of poses, additive deltas, or layer masks over bones. None of those apply to a PNG frame. The three operations people usually mean are:

| Operation | Is it available to PixelDoll? | What it really is |
|---|---|---|
| Crossfade two clips (alpha blend) | No, and already rejected | Ghosted frames and off-palette colors. `docs/design/2026-10-22-redesign/round-4-discussion/animation-resolver.md:9` explicitly chose discrete frame-aligned presentation with no crossfade. |
| Layer mask over bones (Spine track 1 keys only the arms) | No | Needs a skeleton and per-bone keys at runtime. PixelDoll has joint positions, not bone weights, and exports raster sprites. |
| Split one composited frame into parts and composite parts from two clips | Technically yes, aesthetically risky | This is **pixel compositing with a mask**, not animation blending. It is the operation evaluated here. |

So the feature the idea describes is a masked body-part composite. It deserves a straighter name than "blending" in the API, because a game developer reading "blend" will expect crossfades.

## 3. Industry practice, verified

Full detail and URLs are in [research-industry.md](research-industry.md). The short version, with the sources I checked directly in engine code added:

**Melee games commit the body.** Brawlers and Souls-likes root or heavily slow the character during the active frames. The attack is the commitment. This is the highest-confidence recommendation in the industry report.

**Solarus (open source, ALTTP-like engine).** Verified in source: the hero is several synchronized sprites (`HeroSprites.cpp:193-208`, `263-275`) and the sword is its own sprite with its own animation (`set_animation_sword`, `SwordSwingingState.cpp:50`), drawn over the tunic. But `SwordSwingingState` replaces the walking state, so the hero does not walk while swinging; movement that continues is only external push. This is a shipped, verifiable example of "separate weapon layer, committed body".

**Flare (open source ARPG, paper-doll equipment).** Verified in source: hero layers are separate images (`Avatar.cpp:178-206`, `961-973`) but every layer switches to the same named animation at once (`setAnimation`, `Avatar.cpp:940-951`). The attack is a separate state (`AVATAR_ATTACK`, `Avatar.cpp:502-540`) with no movement processing. A shipped paper-doll game with equipment layering still does not split the body.

**Twin-stick games decouple the aim, not the torso.** Enter the Gungeon and Nuclear Throne rotate a separate gun toward the cursor and keep the body in its locomotion pose. Cheap, readable, and only works for ranged or stylized attacks.

**Commercial 8-direction packs ship whole-body sets.** Eight-direction idle and walk, often only four-direction attack, and combined walk-and-attack sheets are rare. If runtime splitting were practical, packs would not need to ship complete sets.

**Dead Cells looks baked but is authored from 3D.** Its flexibility comes from the 3D source pipeline before export, not from runtime compositing. PixelDoll has no 3D source.

**Backpedal by reversing a walk is a known approximation, not a correct gait.** The heel strike, toe-off and knee bend reverse, and secondary motion (cape, hair, skirt) swings the wrong way. Spine's own documentation notes reverse playback needs a special path, which is telling. It is used deliberately in low-detail art (the Punchy mod), which is evidence that it is cheap, not that it looks right.

**PixelDoll's own mount work already tested hip cuts and rejected the simple result.** The mount cut is "a lower-body crop with hand protection, not semantic leg segmentation or equipment qualification" (`docs/research/2026-11-16-mounts/runtime-occlusion.md:5`). An offline check of 88 stored walk cells found 73 frames with nearly tied pixel ownership between the two leg capsules and 99 frames where a one-pixel joint perturbation changed ownership (`:75-76`). Visual review recorded a "torso-only waist-cutoff result" and rejected the heuristic (`:96`). That is the closest thing this repository has to direct evidence, and it is negative for a naive hip cut.

## 4. What the pixel probe shows

[composite-probe.md](composite-probe.md) renders the candidate composites on the demo character: plain shirt, plain shorts, barefoot, no cape, coat, or weapon. Details and limits are in that file; the four findings that drive the decision:

1. A hard horizontal cut amputates the attack's arms, because the punch's arms cross the waist (`evidence/05`, `evidence/06`).
2. A leg window preserves the arms but exposes a hip step, because the attack's twisted waist and the walk's hips have different silhouettes (`evidence/07`, `evidence/08`).
3. An east-facing torso over south-facing legs is not anatomically meaningful and loses the head (`evidence/09`).
4. Even the worst-case rectangle cut reads at 1x as "punching while shuffling". It is not catastrophic at game zoom, and it fails at 2x review and on any outfit whose garment crosses the seam. This is the honest ceiling of the technique.

The probe deliberately did not use keypoint masks, so a real implementation would do somewhat better at the edges. It cannot fix the waist step, the pose mismatch, or the missing strafe art.

## 5. The user's preferred variant, challenged

The suggestion was: turn the **whole body** to the attack aim, keep the bottom half walking, and reverse the walk cycle when travel opposes the facing.

This is not a third mechanism; it collapses into the same split plus extra problems:

- **If the whole body plays the attack, there are no walk legs to keep.** To have walking legs, the body must still be split. So it is the same-direction split (A2), not an alternative to it.
- **Facing the aim while travelling elsewhere is a strafe.** Baked directional Walk is drawn for travel along the facing. Facing north while moving south needs a backpedal set; facing north while moving east needs a strafe set. Neither exists.
- **Reversing the walk cycle is not a backpedal.** See section 3. At 48 to 64 px with a visible ground contact, the reversed heel-toe sequence is large relative to the figure.
- **The body turn itself is a snap.** In top-down four-direction art, an east walk plus a north attack flips the entire sprite from profile to back view in one frame. The current attack resolution already allows this; the slide is what makes it read as an error.
- **North and south attack art may not exist.** Attacks are generated for a chosen direction subset. Facing the body at the aim can land on a direction with no attack frames, which today produces a fallback or a missing-direction notice.

So the preferred variant costs more than the policy fix, still needs new art to look correct, and adds a second new animation (backpedal).

## 6. The generalized design worth adopting (even if only part of it ships)

The useful idea behind the request is not "cut the sprite". It is **channels**: locomotion and actions are independent streams, and the runtime decides how they combine. That framing survives even when the mechanism changes, and it is what makes the API feel intentional rather than a pile of flags.

### 6.1 Model

```
doll.locomotion({ velocity, direction?, policy? })   // what the legs/body are doing
doll.play(move, direction, { motion? })              // what the action channel does
doll.playLayered([channel, ...], options?)           // advanced, N channels
doll.capabilities()                                  // what this export can actually do
```

A channel is:

```ts
interface Channel {
  move: string;              // exported clip id
  direction: DirectionName;  // facing for this channel
  region: RegionName;        // 'body' | 'lower' | 'upper' | 'head' | 'arms' | 'weapon'
  clock?: 'own' | 'follow';  // own timing, or follow the base channel's elapsed time
  sync?: 'none' | 'phase' | 'contact'; // normalized phase, or foot contact to travel
  facing?: 'follow' | 'independent';   // independent requires authored part sets
  restart?: boolean;
}
```

Compositing rule: channels are ordered, regions must not overlap, and the first channel with `region: 'body'` supplies everything not claimed by a later channel. A later channel that claims an overlapping region replaces it (hard mask, no alpha). No weights, no crossfade. That keeps the pixel-art contract and the existing no-crossfade decision intact.

### 6.2 Regions must come from geometry and garments, not from a number

Regions map to pixel masks derived per cell, per direction, from data PixelDoll already has:

- `rig.animations[].sources[dir].measured[cell]` and `.keypoints[cell]`: 18 joints including hips, knees, ankles, neck, shoulders, elbows, wrists.
- `rig.anchors.hip[clip][dir][cell]`: a per-cell hip point tracked at freeze for any move with cell 0 art.
- `mountLegs.ts`: an existing, reviewed implementation of a leg-shaped capsule cut with fragment cleanup.

A fixed row is the wrong abstraction. Two better rules, in order of quality:

1. **Anatomical capsule** around hip, knee and ankle, exactly as the mount cut does, so the mask follows the leg contour.
2. **Garment-boundary cut**: stop the leg mask at the lowest row where the leg material (skin, trousers, boots) ends and the torso garment begins, identified from the material ramps PixelDoll already tracks. This puts the seam where the art already has a horizontal boundary, which is the only place a seam can hide. This is the single most promising novel idea in the spike and it is PixelDoll-specific, because no other tool knows its garment materials.

When neither rule can be resolved (no keypoints, no measured geometry, long coat or skirt crossing the line, cape or held weapon spanning the split), the capability is unavailable for that clip. Report it and fall back; do not guess. This follows the repository's existing rule in `mountLegs.ts:162` and `javascript-runtime.md:143-160`.

### 6.3 More than two channels

N channels are useful in exactly three cases:

- **Head and arms**: a head-only channel for "look at the aim" while the body walks. It needs neck geometry and a head mask, and the neck seam is worse than the waist seam; not recommended.
- **Weapon**: held items are already separate layers with their own padded pivots. A weapon-only channel timed to the aim is the twin-stick solution and it is the cheapest credible overlay, but it needs the hand to be where the weapon is drawn, so it only works with authored aim frames.
- **Upper and lower plus a third**: only worth it if a garment or cape is authored as its own overlay set.

Three channels multiply coverage requirements. Every item must have cells for every channel clip, or it hides for the whole composite, which is the existing attack item-pop problem generalized. The API should allow N channels but the default and documented path should be two.

### 6.4 Timing policies are as important as pixels

- `clock: 'own'` gives legs natural cadence and the attack its authored speed. This is what the live view already does with three clocks.
- `sync: 'phase'` maps normalized phase, used when changing direction inside one clip (already implemented in `advancePlayback`, `presentation.ts:647-666`).
- `sync: 'contact'` ties foot plants to travel speed. PixelDoll already scales walk playback by travel (`livePlaybackDelta`, `presentation.ts:624-645`). This is what prevents skating, and it belongs in the contract whether or not regions ever ship.

### 6.5 API shape across engines

Every platform gets the same operations and the same failure semantics. Only the host-language conventions differ, as they already do.

| Operation | JavaScript (Phaser, generic) | GDevelop | Godot | Unity |
|---|---|---|---|---|
| Set locomotion | `locomotion({velocity, policy})` | `d.locomotion(...)` | `set_locomotion(...)` | `SetLocomotion(...)` |
| Play action | `play(move, dir, {motion, restart})` | `d.play(...)` | `play_anim(...)` | `Play(...)` |
| Layered play | `playLayered(channels)` | `d.playLayered(...)` | `play_layered(...)` | `PlayLayered(...)` |
| Capability query | `capabilities()` | `d.capabilities()` | `capabilities()` | `Capabilities()` |
| Invalid input | throws before mutation | throws before mutation | warning + `false` | warning + `false` |

Rules that keep the four implementations honest, mirroring `javascript-runtime.md:127-170`:

- The same channel object shape is parsed in every engine; no engine invents aliases.
- Unavailable region, missing cells or missing geometry is a capability result, not a silent substitution. `capabilities()` reports per move, per direction, per region.
- Pixel results are identical across engines. The composites are pre-baked at export, so engines blit textures; they never run mask math at runtime. This is the only way to keep native parity cheap and testable.
- Adding an operation requires native conformance checks, not source identity. Godot and Unity are independent ports.

## 7. Recommended architecture: bake the split, never compute it at runtime

The architectural conclusion from [architecture-map.md](architecture-map.md) is that runtime masks are expensive in every engine: Phaser needs a second body node and a mask, GDevelop Sprite objects expose no clipping, Godot needs `clip_children` or a shader, Unity needs `RectMask2D` or a second camera. Each is a different implementation of the same pixel math, and each must be verified natively.

So if regions ever ship, **export pre-split cells**:

- At export, for each `(clip, direction, cell)` and each configured region, produce a part image and store its hash. The manifest gains `regions: RegionName[]` and per-cell part references.
- The controller composes parts by drawing textures at the same pivot, in fixed order. No mask math, no shaders, identical pixels everywhere.
- Costs: roughly 2x the cell storage for two regions (same pixels split, plus PNG overhead), a new export manifest field, and export-time mask generation that can be reviewed in the Studio.
- This makes region support a per-character, per-export opt-in, which is exactly the "end users decide" requirement.

The generated-clip route (Tier 1) needs none of this: it is a normal clip with normal cells, so it works in every current export with no manifest change.

## 8. Plan

### Phase 0: this spike (done)

Documents and evidence in this folder. Decision required from the owner: accept Tier 0 as the default fix, accept Tier 1 as an opt-in generation, and park Tier 2 behind a test.

### Phase 1: action locomotion policy (free, ships first)

Goal: no more sliding, with no art risk and no new pixels.

- Add an action motion policy to the live view: `commit` (default), `commit-then-release` (recovery allows movement), `slow` (multiplier), `free` (today's behavior, kept for comparison).
- Optionally a short aim-direction lunge for `commit`, expressed as a distance over the strike window, not as a speed.
- Expose the same policy through the runtime API and all four controllers, because hosts need it too. Contract: while an action is playing with `commit`, `locomotion()` updates facing and intent but does not translate; with `free`, translation continues; with `slow`, translation scales.
- Amend `docs/design/live-view-controls-plan.md:41-42`, which currently promises normal-speed movement during an attack.
- Live View setting, saved like the other role choices (`liveSettings.ts`), plus a playable comparison so the owner can feel the difference.
- Tests: unit tests for the policy math and state transitions; `experience-movement`, `live-actions`, `experience-presentation`; E2E `experience-parity` for wiring; runtime controller tests plus native verifiers for the new operation.

Acceptance: walking speed during a committed attack is zero (or the chosen multiplier) with no teleport on release, the walk phase does not jump, and every engine agrees.

### Phase 2: generated action-over-locomotion clips (quality path, paid, opt-in)

Goal: real attack-while-moving that looks drawn, because it is drawn.

- New move option "Moving variant of <move>", or a `motionOver` field on the clip: the clip declares which base locomotion move it overlays and which regions it authors.
- Generation: take the base Walk's per-cell keypoints for legs and hips, take the action's keypoints for neck, shoulders, elbows and wrists, resample both to a common frame time, and render with skeleton-v3 against the rig reference. This reuses the existing skeleton pipeline and stores the mixed sequence in `sources[].keypoints`, so provenance and cost reporting stay intact.
- QA: joint adherence, foot contact against travel, and a silhouette continuity check at the hip seam (the socket exists in `stateJointFit.ts` and `lib/rig/pose-review.ts`).
- API: when `locomotion().velocity` is non-zero and the character has a moving variant for that action and direction, `play(move, dir, {motion:'auto'})` selects it. No new compositor.
- Cost: about 5 to 12 generations per drawn facing for the body, plus item posing on the new frames (the dominant cost, roughly 3 per item per view on the skeleton route, up to 10 per call on the anchored route). Budget 45 to 250 per dressed character per move for four to eight directions.

Acceptance: side-by-side with Phase 1, the moving variant reads as a deliberate moving attack at 1x and 2x, with no seam, no foot slide at normal walk speed, and it exports through all engines with no new manifest concept.

### Phase 3: authored region overlays or an export-time split (experimental, gated)

Only start if Phase 1 ships and the owner still wants the independent-aim look.

1. Author or generate an **upper-body-only attack** set designed to composite (research-industry option F3): transparent legs, deliberate overlap band at the waist, per-frame hip registration. This is a small generation cost and it removes the "cut a whole-body attack" problem entirely.
2. Test it over stored Walk frames at 1x, 2x and 4x, in south, east and north, with trousers, a long coat, a cape and a two-handed weapon.
3. Only if it passes: define the region masks, add the export-time split, and implement `playLayered` in the four controllers with a capability probe.

Stop rule: if the overlay test fails on capes or long coats, do not ship regions. Capes and coats are common enough that a feature that breaks on them is worse than no feature.

### Phase 4: generalize (only if three or more regions exist in practice)

`playLayered` with N channels, region catalog, timing policies, and a capability report. Not before.

## 9. Sub-agent split for implementation

Three agents, each with a written brief and an explicit "run nothing" or exact commands.

- **Coordinator (me):** owns the contract, `docs/architecture/javascript-runtime.md`, the design amendment, cross-engine parity review, final verification, and the board card.
- **Agent A, runtime and export:** canonical runtime module (new `layers.js` if regions ship), the four controller operations, `npm run runtime:sync`, native verifiers, and the unit tests that prove identical pixels. Brief must name the exact test commands; it must not invent a second compositor.
- **Agent B, Studio and generation:** locomotion policy in the live view, settings, the mixed-keypoint generation route, QA and seam review UI, and the E2E specs that cover the wiring. Brief must name `studio -g` and `experience-parity` filters.

Coordination rules: one card, no card changes by sub-agents, no paid call without an explicit approval on the card, and no test commands unless the brief names them.

## 10. Spike plan and acceptance criteria (before any implementation)

All free, on stored frames:

1. **Phase 1 feel test** in the live view: commit, commit-then-release, slow at 50 percent, free. Record whether the attack reads as weighty or unresponsive, and whether the release is jarring. Owner decides the default.
2. **Seam review** with the best available mask: build a keypoint capsule plus garment-boundary cut on the demo and on one real dressed character with trousers, a coat and a cape. Render 1x, 2x, 4x. Pass criteria: no floating limbs, no detached waist band, no visible step at the hip on more than one frame, and no item left undecided. This is the gate for Phase 3.
3. **Backpedal test**: reverse a stored Walk at travel speed in the side view. Pass criteria: an independent reviewer does not describe it as moonwalking. Expectation from the literature: fail.
4. **Overlay test**: reuse an existing held-weapon layer over Walk frames, offset and rotated toward a synthetic aim. Measure grip distance and occlusion errors. Gate for the F2 direction.
5. **One paid trial, only after 1 to 4:** one "walking slash" clip on one character in one direction, one worn item, measured against the best composite. Budget 10 to 30 generations, explicit approval, no retry.

## 11. Open questions

- Does the owner prefer committed attacks as the default, or free movement with a slower multiplier? This is a feel decision and needs the Phase 1 test.
- Is attack-while-moving a core promise of PixelDoll's API, or a convenience some games want? That decides whether Tier 1 is per-move geometry or a general feature.
- Can skeleton-v3 render a mixed keypoint sequence with a stable hip and no limb interpenetration? Unproven until the paid trial.
- Is the garment-boundary cut actually detectable from stored material data, or only from explicit per-item garment masks? Needs a data check before Phase 3.
- Should exports carry region parts at all, given that Aseprite and RPG Maker cannot use them? Generic, Phaser, Godot and Unity can; the asset-only targets would ignore regions, which is acceptable but must be documented.

## 12. Decision requested

1. Approve Tier 0 (action locomotion policy) as the default fix and the amendment to the live view design.
2. Approve the capability and layered-API shape as the documented contract, without implementing regions yet.
3. Approve the free spike items 1 to 4, then decide on the paid trial and on Tier 1.
4. Reject runtime cross-direction splitting, and treat same-direction splitting as experiment-only until the seam review passes.
