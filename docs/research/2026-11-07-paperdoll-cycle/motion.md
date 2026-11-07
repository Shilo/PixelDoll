# Motion and held-equipment geometry (2026-11-07 cycle)

Researcher: motion and equipment geometry. Scope: production posing path, offline challenges on stored frames, outside mechanisms, ranked changes. No PixelLab requests, no app edits, no board changes. Claims carry one label: **[source]** (read in code or a primary document), **[repro]** (offline reproduction with the scripts below), **[inference]**, **[untested]**.

Scripts (repo root, Node, no network): `docs/research/2026-11-07-paperdoll-cycle/scripts/motion/held-geometry-probe.ts`, `grip-mirror-check.ts`, `foot-contact.ts`, `render-sheets.ts`. Outputs (JSON, contact sheets): `C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/motion/`. The probe replays the frozen benchmark's real held outputs (`app/test/fixtures/bench`: `a-sword96`, `a-axe96`, `a-bow96`, 15 clip-directions, 120 posed frames) through `app/scripts/bench.ts` `runCase` (production `extractCell`, `postProcess`), applies synthetic damage with known ground truth, and re-gates with production `itemQa` plus `dirGate`. Run on Node 25.0.0 (the pinned 24.22.1 was not active); results are deterministic integer image operations.

## 1. Production posing path

| Stage | Where | Notes |
|---|---|---|
| Keypoint storage | `app/src/lib/rig/rig.ts:20-22` | `ClipSource.keypoints` = requested sequence (rig-cell 0..1), `measured` = re-estimate on frozen frames. Rest pose in `rig.rest[dir].keypoints`. 18 labels only; no hand-direction or weapon label exists in the API enum (`SkeletonLabel`, `docs/research/pixellab/pixellab-openapi-v2.json`) **[source]**. |
| Anchor tracks, mirroring | `app/src/lib/rig/freeze.ts:91-130`, mirror at `:122`; `app/src/lib/rig/skeleton.ts:13` | Mirrored directions flip x and keep labels, so a mirrored `hand_r` is the flipped source hand (handedness flips, accepted in `docs/known-issues.md:66`) **[source]**. |
| Pose plan, batching | `app/src/lib/items/items.ts:207-247`, `app/src/lib/rig/clips.ts:123-132` | Held items keep one move per call; >15 frames split evenly; 1-2 frame clips repeat the last pose to 3. |
| Request building | `items.ts:46-57` (`itemRoute.pose`), `run.ts:200-206`, `run.ts:622` | Dressed keyframe as `first_frame`, rest keypoints as `first_frame_keypoints`, stored keypoints moved onto the padded canvas by `padKeypoints` (`items.ts:139`). Frame 0 sent last when within 1 px of rest (`f0Last`, `items.ts:151`), undone by `unrotate` (`run.ts:408`, `:629`). |
| Padding and pivot | `padOf` `items.ts:130`; layer cell/pivot `items.ts:1216`; placement `compose.ts:15`; export mirror check `export/generic.ts:98` | Held pad is 16 until the frame exceeds 224, then shrinks (240 -> 8, 256 -> 0). `autoFrame` (`studio/characterConfig.ts:33`) reaches 256 for bodies >= 208 **[source]**. |
| Extraction, cleanup | `extractCell` `items.ts:704` (1 px re-registration `:709-712`), `postProcess` `:641`: `attachHeld` `:530`, `closeGrip` `:558`, `repairDropped` `:589`, stencil clip `:388` | |
| Grip side (G8) | `handTrack` `items.ts:903-907`, `nearest` `:795-799`, decision `:951-970` | Absolute thresholds: 6 px contact, 2 px side margin. |
| Weapon axis (G9) | `axisOf` `:801`, `angleDiff` `:812` (folds to 0-90), `:971-1017` | Unsigned axis relative to the forearm; locomotion only (`checkShape`, `:986`, via name regex `isAction` `:763`). Playlist edges used, loop seam warns only. |
| Area, border | G4/G5 `:933-945`; G7 `:881-887` (warning only) | |
| H4 | `dirGate` `:1125`; held, feet, legs return before H4 at `:1173` | Held items get only G6 palette warnings from `dirGate`. |
| Grid fallback trigger | automatic: `frozenGrid` `items.ts:217` (imported-pose issues, non-held only), `gridable` `run.ts:183`; manual: ItemPane repair (`studio/ItemPane.svelte:38`, held allowed) -> `regridClip` `run.ts:741` -> `gridReq` `run.ts:149` | Held repair mask is a disc of **fixed radius 34 px** around the measured wrist (`run.ts:172`), enforced as a hard stencil (`items.ts:388`) **[source]**. |

## 2. Offline challenges (counts)

All mutations apply to real bench frames after production cleanup; "caught" means a new fail or warning message naming that clip.

| Mutation (15 clips each) | Fail | Warn | Silent |
|---|---:|---:|---:|
| 180-degree reversal about the gripping wrist, frame 3 | 0 | 1 | 14 |
| same, persistent frames 4-7 | 0 | 1 | 14 |
| tip/hilt swap about item centroid, frame 3 | 0 | 0 | 15 |
| item mirrored about pivot (other side), frame 3 | 8 | 6 | 1 |
| detach from hand 2 / 3 / 4 px | 0 / 0 / 0 | 0 / 1 / 1 | 15 / 14 / 14 |
| detach 5 / 6 / 8 px | 0 / 0 / 0 | 4 / 5 / 5 | 11 / 10 / 10 |
| truncate blade to 80% / 60% of reach | 2 / 6 | 1 / 1 | 12 / 8 |
| reversal + playlist skipping odd cells | 2 | 2 | 11 |
| controls: ping-pong, holds playlists, identity | 0 | 0 | 45 / 45 |

**[repro]** The reversal is unmistakable in the contact sheet (`a-sword96-walk-reversal.png`: blade across the torso in south, pointing backward in east), yet 28/30 reversed clips are silent. Cause **[source + repro]**: a reversal about the wrist leaves the principal axis unchanged (max axis change 0.00 deg over 118 frames), and on locomotion G9 replaces the IoU test with the axis test whenever an axis exists (`items.ts:998-999`), although the centroid-aligned IoU of the reversal falls below the 0.3 gate in 53/118 frames. On actions G9 is skipped entirely. The playlist controls show no false rejections from timeline handling.

**Signed control [repro].** Orienting the production axis from the wrist toward the item centroid and comparing consecutive frames relative to the forearm separates cleanly on sword and axe locomotion: real max 16.1 deg (39 pairs), reversed min 163.9 deg (78 pairs); a 90 deg threshold gives 0 false and 78/78 true. On slash, real max 101.5 deg (axe slash south 2->3, a valid overhead-to-chest swing, visually confirmed in `a-axe96-slash-south-real.png`); at 120 deg, 0/42 real and 72/84 reversed. The bow (grip at the center) is not separable (real 125.1 deg pair); the descriptor abstains when the centroid is within 25% of the reach from the wrist (17/120 real frames abstained).

**Grip side under mirroring [repro].** Exact horizontal mirroring of frames and keypoints (labels kept, as production does) should be invariant. Production G8 changed the per-frame decision on 11/120 frames and turned `a-sword96 walk/east` from pass to warn:G8. With pixel-center distances the count is 0/120. Root cause **[source]**: `nearest` (`items.ts:795-799`) measures from pixel indices, while `handTrack` (`:903-907`) supplies continuous keypoint coordinates; the half-pixel bias against the 2 px side margin flips decisions. `attachHeld` (`:540`) and `heldVisibility` already use pixel centers. With anatomically swapped labels, G8 fails every sword and axe S/N clip as expected (8/8), confirming G8 itself detects a true hand swap in front and back views.

**Contact [repro].** Real wrist-to-item gaps: median 2.01, p95 2.69, max 3.98 px (120 frames). G8 warns only above 6 px from *either* wrist (`:959`), so 3-4 px detachments are silent in 28/30 clips and an 8 px detachment in 10/15 (inference: the other wrist is within 6 px in side and front views).

**Cropping and scale.** Real frames keep at least 8 px from the 96 canvas edge (0/129 touching) **[repro]**. Cropping by 20% of the reach is silent in 12/15 clips; real per-clip reach ratio is below 0.8 in only 4/120 frames, all in clips that already fail or warn. **[repro + inference]** The bench body (48 px in a 64 cell) reaches 29.4 px from the wrist; scaling equipment with body size, the fixed 34 px held repair disc truncates every supported body from 56 px up, and the stencil clip deletes the excess silently. Under the same scaling, held padding is short for 22 body sizes from 160 px (`padOf` cap plus `autoFrame` 256 ceiling).

**Padding and pivot round trip [repro].** Adding common padding 4 or 8 px to base, layer and keyframes with the pivot shifted accordingly gives identical verdicts and messages for all 3 held cases, and composites through `layerFrame`/`unionFrame`/`over` differ by 0 bytes. The current oversize pivot contract is consistent; no change proposed.

**Foot contact [repro, inconclusive].** In east walks of all four bench bodies (64, 80, 80, 160 px cells) the requested right ankle is lower than the left in 8/8 frames, so ankle height cannot identify the support foot in low top-down side views; the lowest opaque row moves up to 7 px (body N). Sliding needs image contact detection; not ranked.

## 3. Outside mechanisms (query log and sources)

Queries: "Spine point attachment position rotation weapon spawn"; Aseprite slices docs; Unity Sprite Swap docs; Godot RemoteTransform2D and 2D skeleton docs; "Contact-Aware Retargeting of Skinned Motion Villegas ICCV 2021"; "Starbound humanoid frames handPosition weapon"; "third order central moments 180 degree orientation ambiguity".

- Spine point attachments: a named point with a rotation, stored per skin, followed at runtime (e.g. a weapon muzzle); the point is keyed through its bone, not separately **[source]** ([Spine points](https://esotericsoftware.com/spine-points)). Supports exporting a per-frame grip point plus direction rather than only a shared pivot.
- Aseprite slices carry a pivot and per-frame keys in the exported JSON `meta` **[source]** ([Aseprite slices](https://www.aseprite.org/docs/slices/)). A ready format for per-frame hand anchors in exports.
- Unity Sprite Resolver swaps sprites by category and label keyed in clips; swapped skinned sprites must share an identical skeleton **[source]** ([Unity sprite swap](https://docs.unity3d.com/Packages/com.unity.2d.animation@10.1/manual/SpriteSwapIntro.html)). Godot `RemoteTransform2D` pushes position and rotation from a hand node to an item node **[source]** ([Godot](https://docs.godotengine.org/en/stable/classes/class_remotetransform2d.html)). Both assume rigid items driven by a transform; PixelDoll's posed layers are drawn per frame, so transform attachment is an export option, not a replacement.
- Starbound weapon stances declare `armRotation` and `weaponRotation`; `activeItem.handPosition` maps item-relative offsets to the owner **[source, community docs]** ([starbounder](https://starbounder.org/Modding:Custom_Weapons), [activeitem.md](https://git.aria.coffee/aria/Starbound/raw/branch/main/doc/lua/activeitem.md)). Commercial attachment systems carry a signed weapon rotation, not an unsigned axis.
- Contact-aware retargeting preserves self and ground contacts as optimization constraints **[source]** ([Villegas et al.](https://openaccess.thecvf.com/content/ICCV2021/html/Villegas_Contact-Aware_Retargeting_of_Skinned_Motion_ICCV_2021_paper.html)). Relevant to hand-item contact as a measured constraint; no 3D geometry exists here **[inference]**.
- Second-order moments leave a 180-degree ambiguity; third-order moments (skew) can resolve it ([CVonline moments](https://homepages.inf.ed.ac.uk/rbf/CVonline/LOCAL_COPIES/SHUTLER3/node7.html)). PixelDoll has a better polarity cue, the known grip point, which the control above uses.

## 4. Ranked candidates

1. **Signed weapon orientation in G9.** Failure: reversals silent in 28/30 clips. Root cause: unsigned axis replaces IoU (`items.ts:998-999`), actions skipped (`:986`). Smallest fix: orient `axisOf` from the wrist toward the centroid, compare consecutive playlist frames relative to the forearm; fail above 90 deg on locomotion, warn above 120 deg on actions; abstain when centroid offset < 25% of reach. Control: `held-geometry-probe.ts` reversal rows. Risks: grip-centered items (bow, staff), true flips of throwables, small masks. Accept: 0 new fails on the 20-case bench and all 120 real frames; >= 95% of synthetic reversals caught on blades.
2. **Pixel-center grip distances.** Failure: 11/120 G8 decisions change under exact mirroring. Root cause: `nearest` (`:795-799`) vs continuous keypoints (`:903-907`). Fix: measure from pixel centers when the track comes from keypoints (anchor tracks are pixel indices and must keep their convention). Control: `grip-mirror-check.ts`. Accept: 0/120 flips, bench verdicts unchanged or explained.
3. **Scale the held repair disc.** Failure: fixed 34 px radius (`run.ts:172`) is below the scaled reach for bodies >= 56 px; the stencil silently deletes the blade tip. Fix: radius from the dressed keyframe's measured reach plus margin, capped by the canvas. Control: probe `scale` section plus a synthetic 128 px case. Risk: larger edit region invites body edits (protected by K/U checks). Accept: no dressed-keyframe pixel outside the mask in any direction. Paid validation optional.
4. **Contact and reach review warnings, scale-aware.** Failure: 3-8 px detachments and 20% crops mostly silent. Fix: gate contact against the item's own hand, threshold relative to cell (real max 3.98 px at 64); warn when distal reach falls below 0.8 of the clip median outside occlusion. Accept: no new warnings on currently passing bench clips (measured 0 for reach).
5. **Export per-frame grip anchor and direction** (Spine point / Aseprite slice key style) from stored wrist keypoints plus the signed axis. Untested in engines; lower priority than gates.

**Rejected:** a pad/pivot registration defect (0 byte diff, identical QA under +4/+8 padding); third-order moment polarity in place of the grip cue (redundant when the wrist is known, ambiguous on symmetric blades) **[inference]**; adding weapon keypoints to requests (not in the API enum); ankle-height foot contact (ambiguous in 32/32 side frames); tightening G9 IoU instead of signing the axis (reversal IoU spans 0.09-0.31 p05-p50, overlapping legitimate swings).
