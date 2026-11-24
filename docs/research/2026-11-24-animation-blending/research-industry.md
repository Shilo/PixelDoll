# Animation blending for baked sprite frames: industry practice and PixelDoll options

**Date:** November 24, 2026. Research conducted November 23, 2026.
**Scope:** Whether PixelDoll can or should split upper and lower body animation at runtime for baked, frame-aligned sprite clips, and what games actually do instead. Covers the live Top-down and Side-scroller previews, the effect on exported spritesheets, and generation cost.
**Method:** Read the PixelDoll rig, presentation, attack, mount, and cost sources in this repository. Searched and read engine documentation (Unity, Unreal, Godot), 2D skeletal runtime documentation (Spine), combat design references, a Dead Cells production postmortem, sprite-asset conventions, and locomotion references. No tests, builds, servers, or paid generations were run. Claims I could not verify from a primary or credible secondary source are marked **unverified**.

## Bottom line

1. **True runtime upper/lower body splitting of independently generated clips is not viable for PixelDoll.** The blocker is not alpha masking. The two clips were drawn as different poses, often in different projections, with different hip width, torso lean, vertical bob, shading, and equipment placement. A perfect mask still produces a visibly assembled character.
2. **The industry does not solve this with runtime sprite compositing.** Baked-sprite games commit the body to the attack, separate the aim into a rotating weapon or arm, author eight-direction sets, or bake combined animations from a 3D or skeletal source.
3. **The cheapest correct fix is movement commitment, not blending.** Root the character during the attack, or allow a short lunge, optionally with a dodge cancel. This is code-only and export-neutral.
4. **The only quality path to genuine attack-while-moving is new art:** a dedicated moving-attack clip per aim direction, or a separate aim overlay authored to align with the walk body. Both cost generations.

## 1. Terminology

"Animation blending" is an umbrella term. Most techniques that make attack-while-moving trivial in 3D or skeletal 2D depend on a skeleton and per-bone weights. Baked PNG frames have neither at runtime.

| Term | What it means | Applies to baked sprite frames? |
|---|---|---|
| **Animation blending** | Weighted mixing of poses or clips at runtime ([Unity](https://docs.unity3d.com/Manual/AnimationLayers.html), [Godot](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html)). | Only as an image crossfade, which pixel art rejects because it produces ghosting and off-palette colors. |
| **Additive animation** | A delta pose added on top of a base pose. Unreal's Aim Offset is an additive blend space ([Unreal](https://dev.epicgames.com/documentation/en-us/unreal-engine/aim-offset-in-unreal-engine)). | No. It needs per-bone deltas. A separate overlay image is compositing, not additive animation. |
| **Layered animation / layer mask** | Clips on separate layers, each restricted to bones or tracks. Unity Avatar Masks, Unreal Layered Blend per Bone, Godot blend filters ([Unity](https://docs.unity3d.com/Manual/class-AvatarMask.html), [Unreal](https://dev.epicgames.com/documentation/unreal-engine/animation-blueprint-blend-nodes-in-unreal-engine)). | No, unless the sprite was authored as separate body-part layers on a shared rig. A mask over a flat image is a pixel cut. |
| **Upper/lower body split** | A waist mask so legs play locomotion while the torso and arms play an action. | Only as a hand-authored or generated pair of aligned layers. Deriving it from whole-body frames is the risky operation evaluated here. |
| **Strafe set** | Locomotion clips for sideways movement relative to facing, without turning the body. | Yes, as extra clips. Standard in 8-direction packs. |
| **Aim offset / aim space** | Additive aim poses, usually pitch and yaw, layered on locomotion. | No. The 2D equivalent is a separate arm or weapon layer, or extra aim frames. |
| **Turn in place** | A rotation animation played while stationary. | Yes, as an extra clip. Polish, not a fix for attack-while-moving. |
| **Backpedal / reverse walk** | Locomotion for moving backward relative to facing, authored separately or approximated by reversing the forward cycle. | Yes. A dedicated clip is real art; reversal is a cheap approximation with known artifacts. |
| **Animation canceling** | Allowing an action to be interrupted during startup or recovery. | Yes, as state-machine logic. No art cost. |
| **Root motion** | The animation drives world displacement rather than code moving an in-place clip ([Unreal](https://dev.epicgames.com/documentation/en-us/unreal-engine/root-motion-in-unreal-engine)). | Partially. PixelDoll frames are in place, so a lunge would have to be authored as an offset or curve. |
| **Motion warping** | Runtime adjustment of root motion to align an attack to a target ([Unreal](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-warping-in-unreal-engine)). | No. It depends on a root bone. |
| **Frame crossfade** | Drawing two frames at partial opacity. | Technically possible, aesthetically disallowed. PixelDoll already chose discrete, frame-aligned presentation with no crossfade ([animation-resolver.md](../../design/2026-10-22-redesign/round-4-discussion/animation-resolver.md)). |
| **Paper doll** | Compositing equipment layers over a body, all aligned to the same frames and pose. | Yes. This works because every layer is drawn on the same pose, not because arbitrary layers can be mixed. |
| **Bone mask** | Data saying which bones a layer affects. | No runtime equivalent for flat images. PixelDoll's per-cell keypoints are joint positions, not per-pixel weights. |

The key distinction: a **layer mask** says "apply this animation only to these bones." A **pixel cut** says "use these pixels from image A and those from image B." The first preserves one coherent pose. The second must reconcile two independently drawn poses.

## 2. How 2D games actually solve attack-while-moving

| Game / family | Approach | Evidence | Source |
|---|---|---|---|
| **Dead Cells** | 3D models rendered to low-resolution sprites. Animations are authored pose-to-pose, then interpolation frames are added. Attacks are tuned in the 3D source, not split at runtime. | Verified by the artist's postmortem | [Game Developer](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-) |
| **Dead Cells combat** | Attacks commit; dodge cancels recovery. Players describe dodge-cancel as central to the feel. | Player and press reports; frame data **unverified** | [Steam](https://steamcommunity.com/app/588650/discussions/3/1700542332341314384/), [80.lv](https://80.lv/articles/interview-with-the-developers-of-dead-cells) |
| **Enter the Gungeon** | Directional body sprite; separate gun rotates around the character to aim. Body facing and aim are decoupled for the weapon, not the torso. | Rotation verified; exact layering **unverified** | [Wiki](https://enterthegungeon.fandom.com/wiki/Guns), [Stack Overflow](https://stackoverflow.com/questions/54619432/how-to-realize-rotaiton-weapon-like-enter-the-gungeon) |
| **Nuclear Throne** | Four-direction body; weapon rotates toward the cursor and swaps hands. The body does not rotate to the aim. | Community reimplementation; official internals **unverified** | [Careless Labs](https://carelesslabs.wordpress.com/2018/04/03/nuclear-throne-style-weapon-movement-libgdx-gamedev/) |
| **Streets of Rage 4** | Lane-based movement. Attacks are committed animations; no independent aim while walking. Animation and gameplay windows are tuned together. | Observed; interview confirms the relationship, not frame data | [PlayStation Blog](https://blog.playstation.com/2020/04/30/streets-of-rage-4-how-three-studios-revived-a-legendary-series/) |
| **Zelda-like and Souls-like 2D action** | Sword swings root or heavily slow the character during active frames. Commitment buys readability and weight. | Observed; pattern documented by combat design references | [GDKeys](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/) |
| **Commercial 8-direction packs** | Packs commonly ship 8-direction idle and walk but only 4-direction attack and block. Combined "walk and attack" sheets are rare. | Verified by asset listings | [itch.io](https://itch.io/game-assets/tag-8-direction) |

**Melee commits the body.** An attack is a self-contained statement: anticipation, strike, recovery. Splitting it at the waist removes the hip drive and torso rotation that make the strike read. Brawlers and Souls-likes accept that the player stops or slows, and tune the timing so commitment feels deliberate. GDKeys describes the three phases and the risk-reward of commitment, noting that in games like Dark Souls a triggered attack cannot be canceled, making anticipation and recovery the player's vulnerability ([GDKeys](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/)).

**Twin-stick games decouple the aim, not the torso.** Gungeon and Nuclear Throne keep the body in locomotion and rotate a separate weapon toward the cursor. The character reads as aiming because the gun points at the target, even though the shoulders do not. This is a much smaller lie than a waist seam, and it is cheap: one weapon sprite, one pivot, one hand swap. It only works for ranged weapons or a stylized "arm points" attack, not a full-body sword swing.

**The 8-direction pack convention is telling.** If runtime upper/lower splitting were practical, packs would ship one walk and one attack per direction and let the engine combine them. They ship complete sets, often with fewer attack directions than walk directions, because attacks are expensive and are expected to commit ([itch.io](https://itch.io/game-assets/tag-8-direction)).

**Dead Cells is the exception that proves the rule.** At runtime it is a baked sprite game: the artist exports each frame to PNG and the game plays those frames ([Game Developer](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-)). The flexibility comes from the 3D authoring pipeline before export, not from runtime blending. PixelDoll has no 3D source.

## 3. Technical feasibility for PixelDoll's baked frames

### 3.1 The object being split

PixelDoll stores, per clip direction, frame cells and optional per-cell keypoints (`keypoints` for the sequence sent to skeleton-v3, `measured` for joints re-estimated on the frozen frames). See `app/src/lib/rig/rig.ts`. Those keypoints include hips, knees, legs, shoulders, and neck. They are 18 joint positions per cell, not per-pixel bone weights, and they are not guaranteed for imported clips or every native route.

The live preview already separates travel from aim: `resolveAttack` picks an attack clip and facing from the aim vector while leaving the walking facing alone (`app/src/studio/experience/attack.ts`). The design document says to "continue moving at the normal speed" during the attack (`docs/design/live-view-controls-plan.md`, line 41). That is why the character slides.

Equipment is also frame-aligned per clip. Every worn item has layer cells for each clip, direction, and frame, with its own cell and pivot (`app/src/lib/runtime/paperdoll.js`, `layerFrame`). A body split would have to split every equipment layer at the same seam, or the clothing would betray the cut.

### 3.2 Option A: full split with different facings

Legs play Walk facing travel, torso and arms play Attack facing aim, and the halves can face different compass directions.

What breaks, in order of severity:

1. **Projection mismatch.** South-facing legs show two legs side by side; an east-facing torso shows a narrower hip and one shoulder line. Hip widths, leg counts, and silhouette centers do not match. The torso's bottom edge was drawn to meet the south hip, not the east hip. You get an overhang, a notch, or an extra leg.
2. **Seam ownership.** At the waist, a shirt hem, belt, sash, or skin tone can straddle the line. A hard cut leaves a one-pixel horizontal outline that exists in neither source. A soft cut produces blended colors outside the palette.
3. **Pose mismatch.** The walk frame is mid-stride with a specific hip height and lean. The attack is in a lunge with different hip height, shoulder rotation, and head angle. Aligning by hip keypoint moves the torso vertically but does not reconcile the lean or lunge. The attack loses its weight; the torso can look like it floats.
4. **Equipment.** Pants and boots are drawn for the walk. A shirt or cape is drawn for the attack. Waistbands, hems, and occlusion order will not agree. A long coat or skirt crosses the seam and cannot be assigned cleanly.
5. **Held weapons.** PixelDoll's held items use a dynamically padded layer that shares the body pivot. A sword swing crosses the waist. If it goes with the torso, the grip may miss the new hand position. If it goes with the legs, it swings from the hip.
6. **Bob and drift.** Per-frame hip position changes within both clips, and jump, crouch, and lunges move it much further. A fixed cut line fails; a per-frame cut makes the seam move, which is more visible.
7. **Palette and shading.** The clips share a palette but not necessarily a shading pattern. Light direction and dithering can differ, especially between directions. Palette gates flag the mismatch; the image still looks assembled.
8. **Readability.** Anticipation and follow-through are body-wide. A lunge without legs is a torso twitch.

**PixelDoll-specific evidence.** The mount work already tested hip-line cuts on real frames. The November 17 follow-up calls the result "a lower-body crop with hand protection, not semantic leg segmentation or equipment qualification." The offline check covered 88 stored walk cells. The heuristic study found 73 frames where opaque pixels near both leg segments had nearly tied distance, and 99 frames where a one-pixel joint perturbation changed pixel ownership. Visual review found a "torso-only waist-cutoff result" and rejected the simple heuristic as an automatic open-saddle solution (`docs/research/2026-11-16-mounts/runtime-occlusion.md`). That is the best available evidence about cutting PixelDoll frames at the hip, and it is negative.

**Verdict:** Reject. It is not a masking problem that better keypoints can solve. It is a "two independent drawings" problem.

### 3.3 Options A2 and B: same-facing split, strafe, and backpedal

Option B as stated ("whole body turns to face the attack aim; legs still play Walk in reverse/backpedal style when walking opposite the facing, no split facing") deserves a direct challenge. If the whole body plays the attack clip, the legs are the attack clip's legs, so there is no walk and no backpedal. If the legs play a walk clip while the torso plays the attack clip, that is a same-facing split (A2). **B is either A2 or C/D. It is not a third mechanism.**

A2 removes the projection mismatch, so hip width and leg count agree better. It does not remove the pose mismatch between a walk frame and an attack frame, the hip height and bob mismatch, the equipment seam, the loss of the lunge, or the need for per-frame masks and a stable anchor.

The one case where A2 can look acceptable is an attack that is mostly arms and weapon, with a nearly upright torso and little hip translation. That is a narrower animation than a typical slash. If the attack is that narrow, you are better off authoring a separate upper-body overlay or slash VFX (Option F), because you do not need the attack's legs at all.

B's backpedal requirement adds art. If the player walks opposite the aim while the body faces the aim, the legs need a backpedal cycle. That cycle does not exist in a normal Walk clip, and reversing Walk is not equivalent (Section 4). B costs a new backpedal set plus a split, which is more work than C or D with a worse result.

**Verdict:** A2 is prototype-grade with a low ceiling. B is not a distinct mechanism and is dominated by C/D plus, if needed, a dedicated backpedal clip.

### 3.4 Option C: movement commitment

The character stops, or is heavily slowed, for the attack's active frames. Variants:

- **Full root for the whole clip.** Simple and readable.
- **Root through anticipation and strike, release during recovery.** Keeps some flow.
- **Short forward lunge.** Advance a fixed distance in the aim direction during the strike. Preserves momentum without a walk cycle and reads as intentional, close to how Souls-like attacks use root motion for commitment ([MoCap Online](https://mocaponline.com/blogs/mocap-news/root-motion-vs-in-place-animation)).
- **Dodge or jump cancel during recovery.** Dead Cells uses recovery canceling to keep combat fluid; the player pays with startup and active frames, then regains control. GDKeys describes this as a deliberate cancel window ([GDKeys](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/)).

Costs and risks: it changes the current promise of normal-speed movement. It can feel unresponsive if the attack is long or the root starts too early. It needs per-attack tuning. But it needs no new art, works identically in every export, and is honest about what the animation shows.

**Verdict:** Recommended as the default fix. It is the only option that is both cheap and high quality.

### 3.5 Option D: movement damping

Keep movement enabled but multiply speed during the attack, for example to 0.25 or 0.5, or zero it only during the strike frames. This reduces sliding and keeps momentum.

It does not eliminate the artifact. At any nonzero speed, the attack clip's planted feet are dragged. At low speed the drag is less obvious, but it still reads as skating, especially in the side-scroller where the ground is visible. Damping is best used as a tuning layer inside C, not as the primary answer.

**Verdict:** Useful tuning, not a solution on its own.

### 3.6 Option E: authored combined clips and 8-way sets

This is the standard escape hatch for baked sprites: make the animation you need.

- **E1, dedicated moving-attack clips.** Generate a clip where the legs step and the torso attacks, per aim direction. It is a coherent drawing, so there is no seam. It only matches travel in the aim direction; if the player strafes or backpedals, the legs are wrong again.
- **E2, 8-direction locomotion plus attack sets.** Generate walk and run in all eight directions and attacks in the supported directions. This is what commercial packs do. It solves strafing with real art but not attacking while moving.
- **E3, combinatorial moving attacks.** Aim direction times travel direction. Eight directions each means up to 64 clips per attack per character; four directions means 16. Not a default feature. Possible as a premium option for one or two signature moves.
- **E4, authored upper/lower pair.** Generate lower-body walk and upper-body attack as two aligned layers, with a deliberate overlap band (belt or tunic hem) to hide the join. This is not a runtime split of existing clips; it is a new asset pair. It is the most promising form of "split" and is really a variant of F.

**Verdict:** High quality ceiling, high cost. Viable as an opt-in premium generation, not as default behavior.

### 3.7 Option F: independent aim layer, arm overlay, or slash VFX

This is the twin-stick solution adapted to a generator.

- **F1, slash or shot VFX only.** Keep the body in Walk. Spawn a slash arc, projectile, muzzle flash, or weapon trail in the aim direction, with a timed hitbox. The body does not visibly swing, but the attack reads through the effect. Cheap, seam-free, works with every locomotion clip and direction. Good for stylized and ranged attacks; weaker for heavy melee.
- **F2, separate arm and weapon overlay.** Generate an arm-plus-weapon layer that rotates or swaps sides to aim, like Gungeon's gun. The body keeps walking. Natural for ranged and light melee. The overlay needs a shoulder anchor that follows the walk bob, and it must respect sleeves, gloves, and the held-item pivot. PixelDoll already has held-item layers with a dynamic pivot, so the weapon part is close to existing machinery. The arm is new art.
- **F3, authored upper-body attack overlay.** Generate a torso-and-arms attack layer drawn over a transparent lower body, designed to sit on top of walk legs with a deliberate waist overlap. This is the "good" version of A2: instead of cutting an existing whole-body attack, ask the generator for an upper-body-only attack designed to composite. It still needs per-frame hip and shoulder registration and still fails on long coats and weapons crossing the waist, but the seam is authored rather than discovered. It is reusable across all walk frames and travel directions for that aim direction, which makes it far cheaper than E3.

**Verdict:** F1 is the cheapest good-enough solution for ranged and stylized melee. F2 is the best fit for twin-stick ranged. F3 is the only credible "split" and should be tested before any runtime cut.

### 3.8 Option G: runtime skeletal

Spine, Godot's 2D skeletons, Unity, and Unreal all support the real version. Spine states: "an animation that does not key everything can be played on a higher track, overriding the lower track only for what is keyed. Track 0 could have a walk... and track one could have a shoot animation that keys only the arm and gun firing" ([Spine](https://en.esotericsoftware.com/spine-applying-animations)). Godot's blend filters do the same for 2D skeletons ([Godot](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html)).

PixelDoll cannot use this at runtime. It has joint keypoints and an offline motion solver, but no per-pixel weights, no runtime skeleton, and no skeletal renderer. Its exports are spritesheets and manifests for Godot, Phaser, Unity, Aseprite, and raw PNG/JSON. Adding a skeletal runtime would be a new product with a new export contract. Re-posing with `animate-with-skeleton-v3` is a generation-time operation that costs generations.

**Verdict:** Out of scope.

## 4. Reverse and backpedal walk cycles

The idea: when walking opposite the facing, play the Walk clip backward. It is free and used in some games.

It does not read as a correct backpedal. A forward cycle has heel strike, planted stance, toe-off, and swing. Reversed, the foot lifts at the toe, travels backward while planted, and strikes heel last. The knee bends in the wrong phase relative to travel, and the body's forward lean is wrong. The result is the classic moonwalk.

Animation references say this explicitly. The Blender wiki notes that "a human's backward walk is not just a reversed forward walk" ([BlenderWiki](https://archive.blender.org/wiki/2015/index.php/Doc:2.4/Manual/Animation/Techs/Armatures/Stride/)). Gait research describes backward walking as distinct control and kinematics, not a simple reversal ([ResearchGate](https://www.researchgate.net/publication/7770259_Effect_of_Age_on_Characteristics_of_Forward_and_Backward_Gait_at_Preferred_and_Accelerated_Walking_Speed)).

Even skeletal 2D treats reverse playback as a special case. Spine's AnimationState "can handle most animation playback needs, except for playing backward. If reverse playback is needed, the Timeline API can be used directly or the animation can be duplicated and reversed in Spine using box select scaling" ([Spine](https://en.esotericsoftware.com/spine-applying-animations)). If reversal were free and natural, it would not need a special API path.

There is precedent for using it anyway. The Punchy! Moves mod documents `"backward": { "clip": "my_walk", "reverse": true }` and says "the backward walk is the forward clip played backward at the same pace, so you animate one clip instead of two" ([Punchy](https://wiki.punchymod.com/moves/recipes/walk-cycle)). That is a deliberate low-cost choice in a blocky, distant-camera art style. It is evidence that reversal is used, not evidence that it looks correct.

At PixelDoll's scale the artifacts are likely visible. Body sizes run from 48 to 128 pixels, with clear foot placement and a visible ground shadow. A reversed heel-toe sequence and a backward-bending knee are large relative to the figure. Secondary motion also reverses: hair, capes, and skirts swing opposite to travel.

Foot sliding is not fixed by reversal. If stride length does not match travel speed, the feet slide regardless of direction. Reversing changes the phase, not the mismatch.

**Recommendation:** If a backpedal state is needed, author a dedicated four-to-eight-frame backpedal clip or use a minimal shuffle with little leg motion. Do not ship a reversed Walk as the production answer.

## 5. Cost comparison for a generator

PixelDoll's cost model is measured in PixelLab generations. The internal cost study gives concrete numbers:

- A native body draw at 64 px and 8 frames is about 1 generation per view plus about 0.8 for joint checks (`docs/research/2026-11-19-animation-model-audit.md`).
- A skeleton-v3 Walk is about 7.6 generations per 8-frame view for body and checks including the motion source, at 64 px (same source).
- Skeleton-v3 raw motion is 3 generations for a 6-frame view (`docs/research/2026-11-23-item-move-route-cost.md`).
- Posing one item on a 6-frame view with skeleton-v3 is 3 generations. The anchored edit-animation route is 10 per call, two calls per view, so about 60 per item for three views. The all-view sheet route is about 15 to 30 per item (`docs/research/2026-11-23-item-move-route-cost.md`).
- For a dressed character, item cost dominates. The measured example is 15 generations per item for a 6-frame walk in 3 views at 92 px on the sheet route, against 60 on the anchored route.

Approximate costs for one new moving-attack clip:

| Approach | New art per character | Approximate generations | Engineering | Quality ceiling |
|---|---|---:|---|---|
| **C, commitment** | None | 0 | Low: state machine and tuning | Medium-high. Honest and readable, but not attack-while-moving. |
| **D, damping** | None | 0 | Very low | Low-medium. Reduces slide, does not remove it. |
| **A, cross-direction split** | None, but needs per-frame masks and anchors | 0 | Very high: segmentation, registration, equipment cuts, preview and export contract | Low. Assembled silhouette, seam, lost lunge. |
| **A2, same-direction split** | None, but needs masks | 0 | High | Low-medium. Better seam, still pose mismatch. |
| **B, strafe/backpedal sets** | Dedicated gaits | Roughly 10 to 80 for body plus item re-posing | Medium-high | Medium. Correct gait, but still needs a split for the torso. |
| **E1, moving attack per aim direction** | Body plus every worn item | Roughly 50 to 250 per move for 4 items | Medium: reuse the move pipeline | High. Coherent drawing. |
| **E3, aim times travel** | Up to 16 to 64 clips | Multiplies E1 by the number of combinations | High: content explosion | High, but impractical as a default. |
| **F1, slash or shot VFX** | One effect per attack family | 0 to 10, or none if authored | Low-medium | Medium-high for stylized combat. |
| **F2 or F3, aim overlay** | One overlay set per aim direction | Roughly 10 to 80 per aim set, reusable | Medium to medium-high | High for ranged; medium-high for melee if the seam is designed. |
| **G, runtime skeletal** | New rig, weights, renderer | 0 PixelLab generations, new architecture | Very high | High, but out of scope. |

The E1 range needs explanation. A 6-frame body clip in three views is about 9 to 12 generations on the skeleton route, or about 5 on the native route. Four worn items at 3 generations per item per view times three views is 36 on the skeleton route, or up to 240 on the anchored route. Add a weapon, and the total lands between roughly 50 and 250 generations per move. Eight directions use five drawn views instead of three, raising cost by roughly 1.7 times. These are estimates from measured unit costs, not receipt quotes.

Commitment costs zero generations and can be done today. A runtime split costs zero generations but enormous engineering and produces a worse image. A moving-attack clip costs tens to hundreds of generations per character per move and only solves travel toward the aim. A VFX or overlay costs less and is reusable.

## 6. Recommendation ranking and confidence

Confidence means confidence in the recommendation, not confidence that the feature is easy.

1. **C, movement commitment (highest confidence).** Root during the attack, or root anticipation and strike and release recovery. Add a short lunge if the attack needs momentum. Allow a dodge or jump cancel if the game needs fluidity. Matches brawlers, Zelda-likes, and Souls-likes. No art cost, clean export. Risk is feel, tunable in the preview.
2. **D, movement damping as a tuning layer (high confidence).** Use a speed multiplier if commitment feels too heavy. Do not rely on it alone.
3. **F1 and F2, independent aim (medium-high for feel, medium for PixelDoll feasibility).** A slash or shot VFX over a walking body is the cheapest twin-stick feel. A separate arm and weapon overlay is the correct long-term answer for ranged. Both need a spike for alignment against walk frames and equipment.
4. **E1, limited moving-attack clips (medium confidence).** Generate only for the directions and moves where it matters, and only when the player travels toward the aim. A premium opt-in, not a default.
5. **B, strafe and backpedal sets (low-medium confidence).** Only if the game needs true strafing. Requires new gait art and still does not solve the torso split. Reversed Walk is not acceptable at PixelDoll's scale.
6. **A and A2, runtime splits (low confidence, reject).** Mount work already showed hip cuts are ambiguous and equipment-unaware. Cross-direction splits add projection mismatch. A2 is a research prototype.
7. **G, runtime skeletal (out of scope).** Correct for a different product.

**The uncomfortable conclusion:** the current design says the character keeps moving at normal speed during an attack. That promise cannot be kept with a whole-body attack clip. Something has to give: the movement (C/D), the body art (E/F), or the expectation that the attack is a full-body action.

## 7. Explicitly unverified claims

- **Exact internals of Gungeon, Nuclear Throne, Hyper Light Drifter, and Streets of Rage 4.** Behavior is observable; I found no source code or developer statement describing sprite layering. Gungeon's gun rotation is well supported; body composition is not.
- **Whether other cited-adjacent games use skeletal or baked animation.** I avoided claims about them.
- **Exact visual severity of a PixelDoll hip seam.** No offline composite was run. The estimate rests on the mount study and stored-frame geometry, not a rendered test.
- **Whether a reversed walk is acceptable at PixelDoll sizes (48 to 128 px).** Gait literature and the Punchy precedent point in opposite directions for stylized art. Needs a visual test.
- **Whether PixelLab can generate a coherent "walking and attacking" clip with a stable hip anchor.** No paid trial was run. The routes exist; output consistency is unproven.
- **Cost in US dollars.** PixelDoll's study uses generations. I did not convert because plan pricing is out of scope.

## 8. Open questions to validate with a spike

All of these can start offline, on stored frames, with zero generations.

1. **Hip seam composite test.** Take a stored Walk and Attack in the same direction. Cut both at the per-frame hip keypoint, align by the hip, composite lower Walk over upper Attack, and inspect at 1x, 2x, and 4x. Record silhouette discontinuities, hip width mismatch in pixels, pixels belonging to neither half, equipment crossing the cut, and whether the lunge survives. Repeat with different directions to measure projection mismatch.
2. **Reverse cycle test.** Play a stored Walk backward at the speed that matches travel. Inspect foot contact, knee bend, heel-toe order, and secondary motion against the forward clip. This settles whether reversal is usable at PixelDoll's scale.
3. **Commitment feel test.** Add a preview-only movement lock with three variants: full root, root through the strike then release, and a short lunge. Measure whether the attack reads as weighty or unresponsive. Code and UX only.
4. **Aim overlay alignment test.** Composite an existing held weapon layer over a stored Walk and rotate or offset it toward a synthetic aim. Measure grip alignment across frames and occlusion. This tests F2 without new art.
5. **Only if the above justify it: one paid combined-clip trial.** Generate one "walking and slashing" clip on one character in one direction with one or two worn items. Budget roughly 5 to 12 generations for the body and 9 to 60 per item, depending on route. Do not run before the free tests, and do not auto-retry.
