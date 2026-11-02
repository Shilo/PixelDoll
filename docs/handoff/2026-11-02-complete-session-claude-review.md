# PixelDoll complete animation session review handoff

Prepared by Codex for the owner's Claude reviewer, November 2, 2026. This is a comprehensive transfer of the animation investigation, application changes, failed experiments, reciprocal reviews, subsequent eight-direction implementation and final integration. The owner will return your review to Codex for evidence-based challenge and any justified fixes.

**Current conclusion:** several concrete conversion, extraction, spending-safety, playback and authoring defects were fixed and deployed. The experimental eight-direction body pack is importable, with still Idle, Walk and one curated attack. Professional automatic animation and equipped attacks for arbitrary humanoid sprites are **not solved**. No experimental pack or new motion route became the Studio default.

## 1 Assignment and review boundary

Read this handoff, its historical appendix, the linked evidence and actual code. Heavily challenge correctness, experiment design, visual acceptance, cost assumptions, product complexity and unsupported claims. The historical appendix preserves the detailed earlier handoff, including findings and measurements that would otherwise be lost in a short recap. Its old branch, deployment, budget and API statements have chronological scope; sections 2 through 18 below give the final state and corrections.

This is one substantial review returned through the owner. Do not start another broad research cycle. Use retained artwork and offline reproductions. **Do not submit paid requests, reroll, install dependencies, change the app, expand account permissions, read credentials or bypass a worktree guard.** If current code has moved, identify the reviewed commit and separate newer work. An existing account token or unused research budget is not permission for this review to spend.

Your role is adversarial review, not endorsement. Codex will assess your claims against this evidence, the earlier Claude review, the independent reviews and current source. Valid in-scope findings will be reproduced and fixed or retested; unsupported or superseded findings will be challenged. Disagreement should end in an explicit disposition, not repeated research until both agents agree.

## 2 Exact code and integration state

The review baseline is committed `main` at **`3bbc61eebef42f0f123a87e886dfb8c54065055f`**. Its application code is identical to final implementation commit **`7806be10e73e905b5dae3e30e27ee99af6edec1c`**. Later integration commits are documentation only.

Primary checkout:

```text
C:\Programming_Files\Shilocity\PixelLab\PixelDoll
```

Retained research worktree, detached at the review baseline:

```text
C:\Users\shilo\.codex\worktrees\motion-lab\PixelDoll
```

Both former task branches, `codex/motion-lab` and `codex/eight-direction-presets`, were merged into main and deleted. The latter was also deleted on origin. Main was pushed normally, without force. [Main CI and Pages run 41481991458](https://github.com/Shilo/PixelDoll/actions/runs/41481991458) passed build, all sixteen browser shards and deployment at integration commit `1f83fcfb4c0037fcfd4891f77b0e11ceee850895`. The subsequent `3bbc61ee` commit records cleanup only. This handoff will itself add documentation after that baseline, not a new app implementation.

**Do not include these unrelated, uncommitted main-checkout files in the reviewed task or commit them:**

- `app/agent-key.ts`
- `app/scripts/dist-guard.mjs`
- `app/vite.config.ts`
- `docs/handoff/agent-dev-token-handling.md`
- `app/test/unit/agent-key.test.ts` (untracked at the checkpoint)

They belong to concurrent work, were preserved through integration and were excluded from our commits. Review committed source when discussing this session. Historical integration commits also contain coordinated application workflow fixes; their presence is not proof that every line was authored by this motion investigator.

Task-board synchronization remains pending. Active and archived board reads with saved GitHub authorization fail for missing project scope. No scope expansion or uncertain board mutation was performed. The historical motion card is `PVTI_lAHOAAg2ds4Boo7NzhDj-kA`. Repository delivery and CI are complete; board state must not be invented.

## 3 Owner goals and constraints

The original complaint was visibly unnatural skeleton-v3 animation after converting a 3D source into 2D joints: limbs moved incorrectly, animation looked uncanny and professional source motion did not survive conversion. The owner asked for extensive documentation, CC0 asset and MIT tool research, live testing within explicit budgets, an offline Motion Lab if useful, fixes, independent challenges, and concise human-language conclusions.

Later the owner explicitly selected a smaller initial product scope: **Idle, Walk and one attack**, preferably all eight directions; custom user animations can come later. Quality and stability matter more than consuming a research budget. The owner specifically rejected examples with a missing axe head or an axe that appeared outside the hand. Those objections were valid and must not disappear behind passing metrics.

Nonnegotiable constraints:

- Free, MIT, fully client-side Svelte 5/Vite app. No backend. No production dependence on a Codex or Claude connector.
- PixelLab returns composited raster images, not semantic body/equipment layers. The app derives transparent equipment for traditional frame-based paper dolling.
- Frozen bodies stay frozen. A separately authored gripping-hand body is a new asset contract, not an unchanged old body. Skin/finger patches in item layers are not an accepted general shortcut.
- Eight-view qualification requires actual retained views, not silently mirrored substitutes. Hidden fingers, prop perspective and anatomical sides cannot be inferred from a label alone.
- Allowed modern PixelLab models only, with Pro for editing existing artwork. No legacy template/pro creation workflow.
- Extra quality generations require explicit user consent with reviewed scope/cost. Quality failures, Connect, export, imports and page reloads do not authorize rerolls.
- Unknown paid outcomes retain uncertainty and receipts. Never automatically resend an accepted or possibly charged request.
- Keep casual-user workflows simple. Per-frame expert authoring can prepare curated assets; requiring it for every ordinary item would defeat the product goal.
- No new dependencies, engine, UI kit, migrations or backend were introduced by the final animation work. Bronze UI retains shared appearance ownership.
- Do not weaken tests, hide failed art, substitute metrics for visual judgment or claim universal support from one body/camera.

## 4 What changed in the actual application

These are the practical production improvements. Most generation experiments and authoring panels remain development-only.

| Application change | Previous failure | Final behavior and limit |
| --- | --- | --- |
| Exact inpaint permission containment | Extraction, cleanup or repair could retain equipment/body cuts outside the submitted allowed edit pixels. | The actual submitted mask bounds extraction, alpha, cuts and post-processing in shared item paths. A permission mask still does not identify the right item or repair bad art inside it. |
| Saved-mask validation and cache identity | Restored data or a changed mask could be applied without the complete intended ownership/identity protection. | Validate canvas, binary mask, saved blob/hash/input attribution; mask identity participates in extraction caching. Missing/corrupt permissions fail visibly. |
| Cache-array ownership | Returned cached `cut` and `stencil` arrays shared mutable storage. | Copy both arrays and test mutation isolation. This was a low-severity ownership defect, not a reproduced current user containment exploit. |
| Exact-coordinate contract | Automatic registration could move content relative to a fixed submitted mask. | Mask-bounded output stays in raw coordinates. A body redrawn one pixel away intentionally fails G10 instead of being realigned. Unbounded extraction retains its existing registration behavior. |
| Paid response uncertainty | A partial/unread response, including headers resembling a rate-limit rejection, could be treated as a clear rejection. | Normalize unread-body transport outcomes to uncertainty, retain received status as metadata and avoid paid resubmission. Fully parsed clear rejection, accepted IDs and free GET recovery keep their explicit contracts. |
| Reviewed retry consent | Scope, artwork or price could change after review or while waiting for Connect; old quality work could resume without current consent. | Preserve the scope/cost/artwork-bound retry and queue-consent protections integrated during this session. No automatic quality reroll was added by the animation fixes. |
| Raw held-body observations | Useful evidence of provider-redrawn key-colored anatomy was lost before registration. | Retain compact informational Details/manifest observations. A broad warning was tested and rejected because it flagged every ordinary held-item control. This is not a semantic extra-hand detector. |
| Visible frame inspection | Difficult to inspect the exact bad body-plus-item frame. | Studio Inspect has Previous/Next frame controls, counters and existing timing behavior, with desktop/mobile coverage. Preview looping remains intentional and distinct from engine metadata/export preferences. |
| Native clip integrity | Imported native review assets could be described more strongly than their evidence. | Actual source/placed pixels, timing, warnings and export are checked. Existing B15 garment-region encoding is accounted for explicitly, not disguised as exact original RGBA. |
| Analog walk cadence | Half-strength joystick movement traveled half as far while legs played at full speed. | Walk playback scales with the same clamped analog magnitude as travel. Keyboard/full-strength motion, idle/fallbacks, nonlocomotion and Preview keep their timing. This fixes a real sliding contributor, not absolute physical stride calibration. |

The converter corrections are genuine shared rig-code changes, but the researched motion library did not replace the normal Studio default. The new managed eight-direction pack is a dev-tool export, not an automatic new creation flow. No full eight-direction equipped preset ships from this work.

### Coordinated application changes included in the integration history

The owner also asked to preserve and integrate related work already being done in other chats. These changes are part of the delivered history and must be reviewed, without claiming sole authorship for the motion investigator:

| Commit or group | Integrated change and evidence |
| --- | --- |
| `1c12e883` | Save PixelLab imports in the current project format so item recoloring does not inherit the old global-palette rule; skip unused tucked-hair copies for excluded/stale items or covers that hide hair; remove unused FIT_PROFILES. See the linked paper-doll repository review and import/tuck tests. |
| `2e21f28e` | Correct Phaser export timing. Nonzero per-frame duration is the complete interval in tested releases, not an addition to a base interval. The old 80/180/100 ms sequence became 80/100/20. Export now supplies full durations and correct total; native clock/layer/loop checks cover Phaser 3.80.1, 3.90.0 and 4.1.0. See [Phaser verification](../testing/phaser-playback-2026-10-28.md). |
| `6c3a47fc` | Correct Unity's extra terminal sample and replay of the same completed once animation. Final hold key is one sample before the intended end when needed; active/looping repeated Play calls preserve progress. Historical verification used Unity 6000.4.0f1, 884 Editor and 700 Windows Mono standalone checks after the owner resolved license activation. This is not a new engine execution on the later axe pack. See [Unity verification](../testing/unity-playback-2026-10-28.md). |
| `909db658` | Test actual renderer/process crashes, durable export preferences, surviving-tab leadership and accepted-job GET recovery without POST replay. Test-created browsers only were terminated. Synthetic unknown submissions remain lost across repeated restarts; no paid crash generation was performed. See [integration and crash record](../testing/integration-and-crash-2026-10-28.md). |
| `a8feda85`, `12d463dc` | Add equipment design/torso consistency observations and recovery work, then avoid false smudge classification on tiny facial features. Preserve final quality-consent behavior below: the earlier automatic-recovery implementation is not the final permission contract. |
| `0b7ede7b`, `d4c5785f` | Replace unrequested quality retries with player-reviewed operations; enforce queue/reload/cross-tab consent and bind equipment retry to current source, scope and estimate, including Connect delays. Earlier automatic paid quality-recovery behavior is superseded. |
| `417e4e77`, `a8751b03`, `9b807439` | Coordinate committed main/worktree work without reverting concurrent edits. These integration commits are not new independent art experiments or permission to claim all adjacent features as this agent's work. |

The manifest's 53-commit history includes the earlier repository comparison, external Skeleton Tool/Ultima review briefs, documentation-only checkpoints and every changed path. These briefs preserve useful candidates and exclusions; they do not mean all proposed tools or features were implemented. The main review's import/tuck fixes are real, while body-template/shared-item product decisions and most cross-body fitting work remain separate scope.

## 5 Original diagnosis and corrected conversion

Detailed measurements and initial controls are preserved in the historical appendix and [diagnosis](../research/2026-10-27-animation-diagnosis.md). The conclusion was not simply that the prompt or all joints were wrong.

Proven defects included XY and depth derived from different poses, abrupt support selection, incorrect rest/camera/proportion assumptions, world rotations applied to differently oriented drawn limbs, unstable projected bone angles, foreshortening and boundary-clamp issues, and inappropriate uniform timing through fast actions. Some authored poses also requested almost stationary legs under large arm movements, so missing weight transfer was partly the motion input.

At zero motion gain, old XY could stay fixed while depth varied by up to 59 units south/23 east in one control. The coherent target geometry makes zero-gain depth change zero. A support-boundary vertical step fell from approximately 0.856 to 0.00479195 pixels. A later horizontal contact/source-stride mismatch correction reduced a dense run angle spike from about 61 to 30 degrees. These are meaningful geometric fixes, not measurements of perceived professionalism.

The first live diagnosis had 30 completed requests, 270 returned images and 86 attributable units. Deliberately wrong reference joints hurt agreement. The tested prompt/depth changes did not cure the bad attack. Stationary lying targets could be coherent while a moving fall still broke at repeated final poses. That establishes sequence-specific rendering failure alongside conversion defects, not that every repeated pose fails or every prompt is irrelevant.

Implementation used coherent target points, fixed 3D segment lengths, continuous support, calibrated camera/projection, explicit invalid/overflow errors, stance constraints, two-bone IK and feasible shared pelvis adjustment without stretching. Contact plans are source/body/view bound and invalidated on calibration changes. Event-focused sampling captures short stances. Sparse manual edits do not silently inherit an unverified dense-contact guarantee.

Main code: `app/src/lib/rig/{motion,planting}.ts`. Research scripts and original controls remain under `spikes/api/mocap/`. The directory's historical “mocap” label does not prove that every Quaternius source clip came from human motion capture.

## 6 Offline Motion Lab and targeted authoring

The dev-only `/motion-lab.html` now supports source/target geometry and puppet preview, exact reference overlays, body/view camera calibration, FK/IK, pose and timeline editing, contact authoring, grip/axis/occlusion controls, native sole annotations, Undo/Redo, local draft/document import/export, candidate review, exclusions, holds and evidence exports.

Rest calibration is bound to exact artwork/view and converter revision; pose/timing documents remain separate. Invalid/stale inputs surface errors. Changing calibration invalidates dependent plans. Source controls include the independent KayKit skeleton, not only the original Quaternius source.

The broad campaign covered 84 profiles across three body families and six actions, with native south/east plus adult north and supplemental fall samples. A later catalog selected 42 candidates; the targeted image-backed catalog covered 54 native profiles across three bodies, six actions and three views. Earlier “144 cases” language was corrected to 72 image-backed documents: 54 native and 18 mirrored. These are coverage counts, not that many professionally approved animations.

Some idle/walk outputs were usable; others shuffled. Attacks could turn the torso or obscure the striking arm. Falls could invent an extra connected upper body. Connectivity, area and palette cannot catch all anatomy. Equipment remained weaker: later targeted comparisons had 13 pass, 6 fail, 2 warn across 21 contexts, but gates did not certify grip/action quality.

Visible soles were measured separately from requested ankle locks. Under an unchanged proposed root, east walking stance spans changed from 2.01/1.96 pixels to 2.76/1.88; one worsened. Run measurements had sparse support samples. A frozen frame held while a world root moves can still skate. No universal “foot planting solved” conclusion is supported.

Rigid attachment preserves a prop's raster design better than rerendering but cannot invent hidden handle material, wrist rotation, grip fingers, foreshortened surfaces or correct front/back order. The initial source sword itself lacked pixels occluded by its hand. Some missing material was explicitly authored before controls. Root withdrew the earlier broad recommendation that rigid placement was a universal answer.

References: [implementation](../research/2026-10-28-motion-lab-implementation.md), [follow-up](../research/2026-10-28-motion-followup.md), [targeted authoring](../research/2026-10-28-motion-targeted-authoring.md), their numerical results/catalogs and the historical appendix.

## 7 Free assets and rigging tool findings

The survey was broad and prioritized, not literally every possible library. License findings apply to inspected packs/versions and notices. No licensing or API claim is freshly revalidated by writing this handoff.

| Asset or tool | Useful finding | Adoption boundary |
| --- | --- | --- |
| Quaternius Universal Animation Library 1/2 | Specific free Standard packs declare CC0 and provide useful motion sources. | Do not call every advertised Pro/Source animation free, all packs identical, or all motion human mocap. Pinned local GLB has 127 clips, not a verified current free-edition count. |
| KayKit Character Animations Free 1.1 | Downloaded archive's CC0 notice verified; separate skeleton mapped, 72 offline cases checked. | Six controls, no new live KayKit output qualification; later alignment/gain changes were confounded. |
| Kenney selected packs | Official CC0 proportion/art controls. | No demonstrated universal sprite auto-rig or equivalent complete motion inventory. |
| Three.js and SkeletonUtils | MIT source-loading/sampling/retargeting building blocks. | Cannot recover hidden anatomy or force PixelLab temporal/pixel adherence. |
| glTF Transform and ozz-animation | MIT processing/IK implementation references. | No demonstrated production dependency need; ancillary documentation/assets can have separate licenses. |
| Animated Drawings | MIT implementation, relevant ARAP/projection/BVH ideas. | Archived Python/OpenGL research stack; dataset rights differ, no pixel/eight-view guarantee. |
| DragonBonesJS and Godot Skeleton2D | MIT runtime/engine routes for prepared cutout/mesh art. | Need segmented artwork, slots/weights and authored motions; different art/output workflow. |
| Rigby2D, Rive, Flare | Permissive-code candidates described in the survey. | Editor/examples/dependency/export/maintenance boundaries require separate verification; not qualified integrations. |
| Blender | Valuable offline rig/proxy/render authoring option. | GPL application, separate output/asset rights. GPL does not prove an independently written browser proxy is impossible. |
| Mixamo, CMU, Spine, Babylon.js | Potential references outside the strict shortlist. | Mixamo is not CC0 redistribution; CMU exact terms were not established; Spine has separate terms; Babylon.js is Apache-2.0. |

Pinned source hashes and primary references are in [rigging sources](../research/2026-10-27-animation-rigging-sources.md) and the appendix. The owner-linked YouTube video could not be fetched/watched; do not claim its choreography was evaluated. No surveyed tool established professional rigging for arbitrary single-image humanoids. Prepared cutouts and fitted 3D proxies remain distinct possible art workflows, not implemented universal solutions.

## 8 Custom skeleton V3 and the API correction

Three routes must remain distinct: managed skeleton-v3 with a provider template ID; raw skeleton-v3 with requested reference/per-frame joints; and managed custom skeleton-v3 without a template ID.

Earlier direct-browser MCP experiments showed that a browser can be a structured protocol client without being an AI agent or calling the Codex connector. Deployed MCP accepted explicit `poses`, `move` and `scale`. Technical research access did not establish product support, plan parity or dependable future availability. No MCP dependency was added to production.

**The later November 2 official REST schema changed the practical recommendation.** `POST /characters/animations`, `mode:skeleton-v3`, without `template_animation_id`, accepts `action_description` to create one 3D motion shared by directions. Later views use `animation_group_id`. The new fixed-action starter uses direct REST and does not require MCP or the old per-direction conversion/redraw chain.

The compact [contract capture](../research/pixellab/2026-11-02-managed-custom-v3-contract.json) records the live schema hash `71480968f253d33474b34d0163c50377bfc87f5fcd9d585071e13ad7524eb704` and prior October hash `445a1ec4adb5b4f25b44a848616aafae6ff32d44d23bcfeafca57f45a8c29b7a`. This does not prove REST parity for MCP's explicit pose/move/scale fields, a release date, per-frame dynamic rig access, authoritative FPS or pivot metadata.

“Custom” means motion authoring, not an arbitrary custom bone hierarchy. A static estimated 3D skeleton is not the missing dynamic rig. Same prompt/seed does not guarantee identical reusable motion or pixels on every body. `animation_group_id` binds views of this action/character, not all future characters.

Existing Unique 8 retains eight returned views. Default Top-down 8 retains five independent views and derives three mirrors, even though modern initial v3 creation requests eight. Mirroring changes visible anatomical handedness. “Native” here means a separately returned view retained without an app flip, not a proven description of the provider's internal mechanism.

Older statements that custom V3 is unavailable through API or necessarily requires MCP are superseded for this fixed-action route. Read the dated sequence rather than treating an old snapshot as current.

## 9 Earlier Claude workflow and controlled comparisons

A sub-agent reviewed all available local history matching **Paper doll system optimization (fork 4)**: 75,943,273 bytes, 13,257 records and 443 assistant text blocks, including inherited/compacted history. Available substantive history was October 26 through 28 UTC with October 29 fork metadata; later cloud-only messages were not established. Private transcript data was not committed.

The armed-animation-then-split approach did not exactly reconstruct all 16 stored originals. South recompositions differed at 737 to 1,064 visible RGBA pixels; east 532 to 706. Palette changes account for many differences, so these numbers alone do not prove all anatomy bad. However, skin in weapon layers and disarm recoloring undermine claims of exact separation. Claude later reproduced/retracted its earlier exact-preservation claim.

Exact-artwork A/B/C controls compared corrected raw source-depth, managed custom, and raw static-provider-depth routes. Raw controls shared action/camera/times/seed; managed motion authoring differed and had no equivalent exposed seed in that experiment. It was not a renderer-only causal ablation. Managed B looked better in anticipation/downstroke/recovery but retained crouch, hidden grips and timing uncertainty.

A frozen-grid equipment test protected 111,882 black pixels exactly and still failed contact on the original hand. Generated green hand geometry was removed during extraction, exposing a sword far from the frozen fist. Exact black retention is therefore a meaningful permission invariant and insufficient animation/art qualification.

The old x28/D real-frame experiment was designed to use the same body-frame loader for input and final composition. Logged lengths corroborate that; equal encoded lengths do not prove byte-identical historical request bodies. Codex withdrew a blanket input-mismatch objection. Output changes remain independently measured. Claude also corrected its old face-paint claim, caused by alignment error, and its “zero body changes” measurement artifact.

See [workflow reconciliation](../research/2026-11-01-workflow-reconciliation.md), its results and the appendix for exact metrics and experimental confounds.

## 10 Weapon aware authoring and rejected generations

The weapon-aware sequence intentionally authored a new gripping-hand body, then froze it. It did not pretend the original body stayed unchanged. Raw provider data, corrected sources, masks and authored bodies remain distinct.

| Seed | Purpose | Actual units | Disposition |
| --- | --- | ---: | --- |
| 732 | Disarm poses 1/3/4/6 | 15 | Improved visible hand, uncertain source boundaries remain. |
| 733 | Hatchet on that body | 15 | Improved local contact; hidden grip and extraction issues remain. |
| 734 | Armed missing poses 0/2/5/7 | 25 | Rejected raw source; added posterior anatomy including a 114-pixel rear region. |
| 735 | Disarm corrected missing poses | 15 | Green posterior stubs; raw bare body rejected. |
| 736 | Complete hatchet references on authored B-star V2 | 25 | Mixed-family research control; no rear-leg recurrence, continuity/reach issues remain. |
| 737 | Two-frame axis repair | 15 | Axis closer to declared target, but broken/small/displaced head. Rejected. |
| 738 | Clean frozen bare-hand source plus complete prop guide | 15 | One raw result omitted the metal head; the other changed shaft/design. Rejected and stopped. |

The first six calls belong to the older 1,000-unit phase; 738 belongs to the later 500-unit allowance. Do not count them all as new 500 spending.

The B-star V2 body explicitly restores known original transparency and documents 50 changed pixels relative to actual disarm output across the eight-frame family. Source corrections to other missing poses restored 144 recorded transparent samples; raw data remain separate. Newly authored skin color is not magically recovered original skin. Old joints are not certified on the new hand.

The full-eight 733/736 assembly has mixed **generation provenance**, but every final composite rebuilds on the same B-star V2 family with zero RGBA differences. Earlier generation-time bodies differ from V2 by 0/0/1/18 pixels in their four poses. Observed handle variation is real; its cause is unisolated because pose, projection, occlusion and job provenance change together. A nine-pixel projected hand-slide observation is not physical ground truth.

The 737 sword-axis target was an explicit, questionable authoring hypothesis, not proven axe choreography. Even with the full reference head inside its mask, raw output failed shape/placement. A permission mask says where the model may edit, not where it must draw or erase.

For 738, the complete 85-pixel reference head fitted each target; all opaque body pixels were protected and preserved. All 82,426 black-mask pixels and protected references were exact. Frame 3 still had no neutral head component; frame 4 had a thicker changed shaft. Shared research extraction removed zero candidate pixels. The missing head was in raw provider output, not clipping or cleanup. The first discriminator's failure stopped full-clip/repeat purchases.

The user's visual objections were therefore correct. Passing body/mask invariants had never established a complete axe or convincing grip. No rejected generated image became an accepted preset.

References: [weapon aware](../research/2026-11-02-weapon-aware-grip.md), [clean grip](../research/2026-11-02-clean-grip-qualification.md), their results, native before/after figures and the historical appendix.

## 11 Reciprocal review and accepted engineering fixes

The earlier Claude review inspected snapshot `0acd88ab`, not all subsequent commits. A separate sub-agent reviewed and challenged implementation, and later reassessed Claude's findings. Codex reproduced actionable claims and challenged causal overreach. The owner supplied Claude's final response; it agreed with the following closure.

| Issue | Final disposition |
| --- | --- |
| Production mask containment | Keep; no demonstrated defect in the intended invariant. |
| Cached optional-array aliases | Fix with defensive copies and maintained mutation/cache-identity tests. |
| Unread paid HTTP response | Fix uncertainty classification, preserve accepted evidence, never automatically resend possibly charged calls. |
| One-pixel body redraw with a fixed mask | Document/test intentional hard G10 failure; do not translate mask or output to manufacture alignment. |
| Claimed two-body final splice | Correct to mixed generation provenance; final common V2 composites are exact. |
| Splice caused shape discontinuity | Unproven cause; keep observed continuity issue. |
| Universal 15 percent adjacent-size limit | Reject universal gate. Only candidate-specific criteria with declared projection/art intent. |
| Only single-job clips may qualify | Reject; provenance alone neither guarantees nor prevents continuity. |
| Thin rear shaft/pommel cleanup loss | Real limitation. Research and production variants differ; production probe used substituted authored grips where rig wrists were unavailable. |
| Cleanup Rule A | Defer. It restores five known body-rim false positives, despite recovering some desired prop pixels. |
| Cleanup Rule B | Defer. “Wholly inside stencil” is redundant after clipping and does not prove semantics. |
| Another positive weapon family validates both rules | Reject as sufficient evidence; labeled body rim, smear and broad-mask negative controls are needed. |
| Encoded input lengths prove exact historical request bytes | Reject proof claim; accept source/log corroboration. |
| Raw 736 extra-leg suspicion | Withdrawn after pixel/ROI audit; do not repeat as a measured failure. |
| White pixel in final research frame 4 | Reproduced ordering artifact: outline absorption lets a component survive before restrictive S clipping leaves white. No general white-pixel deletion follows. |

The production cleanup probe removed 18/18/0/16 pixels after extraction in completion frames 0/2/5/7 **with an authored grip substituted as wrist**. The gallery's `posed:false` extraction was not the full production held cleanup. This distinction must remain in any claim about lost material.

Claude's final acceptance explicitly relied on Codex's reported strict/unit/browser checks; it did not rerun them or inspect new commits. It is agreement on reasoning, not independent execution. The accepted engineering fixes were complete at `0865c0b6`; later docs reconciled the review. The art stayed unqualified.

Read [independent review](../reviews/2026-11-02-independent-paperdoll-quality-review.md), [Claude response](../reviews/2026-11-02-claude-paperdoll-quality-review-response.md), [counter-review and fixes](../reviews/2026-11-02-joint-counter-review-and-fixes.md), [independent reassessment](../reviews/2026-11-02-joint-review-reassessment.md), and [closure](../reviews/2026-11-02-final-review-closure.md). These are required evidence, not a consensus you must accept.

## 12 Native axe repair and actual Studio integration

After the model failed, dev authoring gained a per-frame transparent PNG override. It uses exact native canvas pixels, no resizing/rotation/cleanup, shared preview/export rendering and body-only occlusion. Wrong dimensions, partial alpha and invalid imports fail. Returning a frame to source placement is explicit. Native art and source-based placement coexist independently per frame. Exports retain body/item/composite, durations, authored PNG hashes and `qualified:false`.

This restored complete source artwork, but the first examples still perched the handle against the hand. The user caught that. The [palm correction](../research/2026-11-02-palm-grip-correction.md) moved the source anchor six pixels into the shaft, approximately `(93,82)` to `(98.335,84.745)`, and used actual target palms for the two control poses. Body-only occlusion then hid 27/21 item pixels versus 0/1 earlier. No body or finger pixels were painted into the item. Full heads remained. Raster rotation already explains the 85/83 head sample count difference before occlusion.

All eight east poses were reviewed and exported, with authored holds `[120,120,80,80,80,120,100,220]` ms. Those are not provider timing. This is one local art-control improvement, not new automatic universal gripping or qualified attack anatomy. Thumb/foreshortening, hidden feet and motion appeal remain visual judgments.

The exact native review asset was packaged into a real Studio project and engine exports. Actual import, wear/remove, frame stepping, mobile controls, warnings, real ZIP download and exported pixels were exercised. No fake rig/joints or provider motion evidence was invented.

Existing B15 garment normalization changes the low blue bit in some dark body pixels. The first unconditional original-RGBA assertion correctly failed. Final checks derive that existing transformation exactly and reject any red, green, alpha or higher-blue-bit change. Source-native identity and normalized Studio identity are separately named. The classifier is a heuristic, not proof those dark pixels are clothing.

One front sole mark `(76.5,106.5)` is stable in all eight frames with fixed root. A rear point `(77.5,100.5)` is measured in six frames and unmeasured in overlapping frames 4/5. Full support-edge review found no measured frame-boundary drift. None establishes weight transfer, hidden anatomy or engine contact.

A subsequent independent review found a genuine stale-preview bug: a failed render could keep an old successful composite visible. The shared failure path now clears stale output and shows an error. No further concrete art repair was justified by that bounded evidence; it was not reclassified as professional.

References: [native frames](../research/2026-11-02-native-frame-authoring.md), [palm correction](../research/2026-11-02-palm-grip-correction.md), [Studio integration](../research/2026-11-02-studio-axe-integration.md), [final challenge](../reviews/2026-11-02-final-motion-review.md), numerical audits and retained ZIPs in section 16.

## 13 New eight direction starter implementation

After first merging the motion branch, the owner requested a new branch for simple Idle/Walk/one-attack support with eight directions, independent brainstorming/challenge, implementation and proper testing. Work continued on `codex/eight-direction-presets`, subsequently merged/deleted.

Main files: `app/src/lib/rig/starter-presets.ts`, `app/src/ui/motion-lab/StarterPack.svelte`, `app/src/ui/motion-lab/starter-pack.ts` and `app/src/ui/motion-lab/starter-project.ts`. Tests: `starter-presets.test.ts`, `starter-project.test.ts`, `starter-session.test.ts`, and browser `selftests.spec.ts`.

### Source and paid request controls

- Require a true Unique 8 source with all eighteen rest joints, exact source pixels/cell/pivot and matching camera/model metadata before submission. No mirrored substitution.
- Fixed managed actions share one animation group across all views. Retain distinct labeled direction jobs and expected frame counts.
- Explicit south/east pilot reserves eight motion units; expansion to the remaining six views reserves 24 only after source/group/frame-hash-bound review. No automatic continuation or quality reroll.
- Repeated free preparation is idempotent. It preserves seed, plan identity and unresolved reservations instead of minting a fresh paid attempt.
- Source/action changes clear review. Displayed source must match the actual paid target. Queue/enqueue failure, missing outcomes and unknown billing cannot silently become new jobs.
- Validate finite nonnegative generation/USD usage and overflow. Hold the greater of known generations/reservation; unknown or dollar-only results keep the hold. An estimate is not a guaranteed bill cap.
- Motion allocation is 150 reserved/known units within the existing remaining allowance, not a new allowance; source create/register spending is separately included in total accounting.
- Pin the exact source and PNG blobs atomically in a hidden dev project so source deletion/editing and blob garbage collection cannot strand free review/export. Paid work still requires the original selected source; a pin is not permission to animate another source.

### Native layout and pack integrity

- Retain provider body frames directly. Do not estimate joints and rerender each view through the old raw route.
- The provider actually returned north on 96 px and other views on 112 px. An initial cross-view uniformity rule failed after completed jobs; read-only receipt/blob recovery preserved outputs without another paid call. Final validation is uniform **within each view**, with native per-view sizes recorded.
- Author a shared square 32 to 256 px canvas, standing translation and per-action/view integer translations. Pivot derives from the source pivot plus standing placement. No scaling, per-frame recentering, fractional translation or visible clipping.
- Preview and export use the same placement helper. Invalid placement clears output, surfaces error and invalidates approval; stale successful art is not proof.
- One source-frame map per action is shared across all views. Deduplicate complete repeated poses into cells plus an explicit playlist. Raw rejected frames stay in evidence, not playable cells.
- Experimental project metadata contains warnings/unmeasured QA, no fabricated frame joints, pose-adherence scores, provider FPS or stale server-character identity after canvas changes.
- Free still idle uses the exact placed Default hash and placement, not a generated image or misleading negative provider-frame sentinel.
- A malformed optional rejected-idle archive cannot block required walk/attack in standing-idle mode. Omission is visible in the journal. Generated-idle mode remains strict. Required missing views never become synthetic “complete” outputs.

### Concrete implementation defects caught and corrected

The independent challenge caught source-target mismatch, unbound pilot review, preparation changing seeds, invalid billed usage and model/camera mismatch. Browser checks caught Svelte proxies passed into `structuredClone`, stale invalid-placement canvases, and optional idle corruption blocking the free pack. Source-durability review caught an IndexedDB garbage-collection problem despite hashes saved in localStorage. All were fixed at their shared intended paths and regressed.

Test harness mistakes were corrected without weakening product assertions: combobox label matching, existing 60-character import-name truncation, and earlier Inspector/None/Export selectors. Body-only QA does not have a fictional equipment “Needs a look” badge; tests check real experimental naming, saved QA and export warning.

## 14 Actual eight view results and rejected alternatives

One moderate-proportion 48 px humanoid in an 80 px standing canvas, one camera, eight native source views was created/registered once. Source seed was `20261102`; motion seed `328964`. Local source `rig-starter-live-20261102-native8`; provider character `5c32760c-bc9c-4c54-87fc-132ca131f90d`.

| Action | Shared group | Result |
| --- | --- | --- |
| Attack | `a1d61c62-e68b-4a3e-99c3-d53deeafb324` | Raw anomaly samples rejected. Shared whole-pose map retained as experimental attack. |
| Breathing idle | `7c8053e9-948b-420f-b730-f361189004c4` | Unwanted effects across several directions. Entire generated idle rejected. |
| Walk | `59a5b094-b39a-41fb-86b2-e51d237daf7a` | Eight-view candidate retained; no gross reroll-worthy defect identified in inspected sequences, physical contact/naturalness unqualified. |

**Attack:** south raw sample 0 had five exact gray pixels, three detached; east raw sample 2 had 56, 48 detached. Connected gray could be malformed forearm/hand anatomy, not disposable effects. An attempted offline cleanup failed its own guard before writing a corrected image. The reviewer withdrew the generic gray-deletion assumption. No pixels were repainted or removed to produce playable attacks.

The shared source map is `[7,1,1,3,4,5,6,7]`, compiled to six unique poses `[7,1,3,4,5,6]` and playlist `[0,1,1,2,3,4,5,0]`. This replaces whole questionable poses with complete native poses/holds consistently across directions. It preserves raw samples 0/2 outside playback. An earlier different map per direction was rejected because it mismatched action phases.

The retained sequence reads as preparation, overhead anticipation, strike, crouch/lunge and recovery in the reviewed strips. At 100 ms per authored slot it is 800 ms, not provider-reported timing. Alpha of the ready pose matches standing in six directions and differs by one alpha pixel in NE/SW, but 91 to 185 RGB pixels differ by view. This is not exact frozen-standing color identity. Hidden hands and biomechanical correctness remain unqualified.

**Idle:** south/east pilots missed failures in later directions. SE, NE, N, W and SW contain breath puffs despite no-effects instructions. Exact gray counting reports zero for these puffs, proving that metric cannot certify no effects. No common clean generated idle sample was available. Keep raw evidence, reject the generated idle and use an explicitly labeled free still idle: one exact standing cell with four 150 ms holds.

**Walk:** all 64 returned frames had one connected opaque component and no exact gray pixels. Those facts do not prove anatomy or naturalness. A silhouette-difference concern at 7-to-0 was reviewed against neighboring actual poses: one-pixel top/bottom seam changes were not exceptional, and south 3-to-4 had a larger bottom change. No frame deletion/remap was justified from counts. The full eight-frame walk stayed unchanged.

**Actual UI proof:** all 24 action/view previews, exact still-idle equality, real ZIP download and actual Studio import were tested using retained live art with PixelLab requests blocked. Inspect showed eight directions and Default/Idle/Walk/Slash. Raw evidence contains 168 PNGs: eight standing, 32 rejected breathing, 64 walk, 64 attack. A free recommended pack without an optional prior idle contains 136 raw PNGs. No raw failure was erased to improve acceptance.

The isolated live test-browser profile used localhost-only agent port 5201, leaving existing 5199 intact. A walk continuation driver initially raced connection and stopped **before any POST, reservation or queue record**. Read-only reconciliation proved non-submission before the one actual continuation. That is distinct from replaying an uncertain paid request. No token/profile was exported. The image tool exposed a GIF's first frame; do not claim independent human real-time animation judgment from that alone.

See [starter report](../research/2026-11-02-eight-direction-starter-pack.md) for all stages, receipts, billing, CI and rejection details.

## 15 Final cadence and native hand and foot review

The last implementation pass fixed analog cadence in production and connected managed native frames to hand/foot review without inventing dynamic skeletons. Main source locations: `WorldStage.svelte`, `presentation.ts`, `AttachmentEditor.svelte`, `attachment.ts`, `equipment.ts`, `StarterPack.svelte`, `NativeContactEditor.svelte`, `native-contacts.ts`; focused tests include `experience-presentation`, `authored-attachment`, `native-contacts` and browser selftests.

Native review is bound to source/action/view, layout, exact ordered placed RGBA hashes, frame map, pivot and durations. Changing any relevant selection invalidates/closes it. It uses all eight playback slots including holds, not six attack cells paired with eight unrelated durations. Async preparation snapshots/guards selection changes. Frame joints remain empty rather than guessed.

**Hand authoring safeguards:**

- Missing target palms begin unmarked. Current bare body and source stay visible, with no fake wrist guide or weapon.
- Unmarked drafts may be saved, but rendering/export, including native overrides, refuses missing grips. Held repair-mask preparation fails before any paid request.
- Clicked target must be an opaque body pixel. Review found typed/imported coordinates could bypass the click guard; shared rendering validation now enforces it for both native and rigid paths.
- Rigid source anchors must also fall on opaque item pixels. The retained axe's default image-center `(72,72)` is transparent, a real floating-item negative control. Source artwork stays visible/clickable to correct it.
- Invalid contacts show the current bare body and error, clearing stale composites/guides. An opaque sole pixel is geometric contact, not automatically a palm; no semantic palm classifier is claimed.
- Native artwork bypasses source rotation/placement and preserves pixels, while still requiring the explicit body target contract. All eight earlier calibrated axe frames replay with zero archived-layer differences and zero clipped source pixels.
- Known clipped source pixels block the authored ZIP. This catches a blade cut by our canvas, not a blade already absent from input art.

**Native foot review:** A/B label visible contours, not guessed anatomical sides. Authors mark heel/toe, stance and frame. Hidden/ambiguous marks stay absent. Both speed components start unset; units are native pixels/second, not recovered provider/world velocity. Actual image hashes, opaque mark pixels, timing and binding are validated on import/save/export; async validation snapshots all inputs.

For a manually named stance with at least two distinct frames and consistent landmark, measure sampled span of `point + velocity * playbackStartTime`. Report held-frame travel separately. Coverage remains partial unless both tracks cover all frames with usable evidence. Even complete bookkeeping stays `qualified:false`; it does not prove support windows.

Actual east walk annotations: A frames 0 through 3 `(64,90),(62,90),(60,90),(58,90)`; B frames 4 through 6 `(64,87),(61,87),(59,87)`. At an explicit test velocity `(22.5,0)` native px/s, each sampled stance spans 0.75 px, with about one pixel of landmark uncertainty. Frame 7 was ambiguous and left unmarked. Each held 100 ms frame still covers **2.25 native pixels of root travel** at that speed, so a small sampled span is not continuously planted feet. App motion speed remains 95 world units/s; no measured camera/scale conversion equates it with 22.5.

Actual-artwork keyless UI testing observed zero PixelLab requests and zero page errors, seven bound foot marks, missing/off-body grip export refusal and zero downloads for invalid import. A separate source-anchor negative control used an opaque body point, not a certified palm. The half-strength cadence illustration uses production playback helpers and labeled illustrative native floor travel, not a recovered app camera measurement.

See [closeout](../research/2026-11-02-animation-closeout.md), its ZIP and [known issues](../known-issues.md).

## 16 Durable evidence and complete change inventory

The accompanying [session manifest](2026-11-02-complete-session-evidence.json) lists dated reports, results, catalogs, handoffs, reviews, retained figures/artifacts and their SHA-256 hashes at the review baseline. It also records every commit and changed path in the selected integrated-history window. This is an audit trail of integrated work, not blanket authorship attribution. Read per-commit diffs for exact modifications rather than treating this prose as a patch listing.

| Artifact | Purpose |
| --- | --- |
| [East axe native ZIP](../research/artifacts/2026-11-02-gripped-axe-east.zip) | Eight exact body/item/composite frames, authored contacts/timing and unqualified source. |
| [East axe Studio ZIP](../research/artifacts/2026-11-02-east-axe-studio.zip) | Importable warning-labeled single-direction review project. |
| [East axe engine ZIP](../research/artifacts/2026-11-02-east-axe-engine.zip) | Layer/project/manifest export; not a fresh game-engine execution claim. |
| [Eight-direction body project](../research/artifacts/2026-11-02-eight-direction-starter.pixeldoll.zip) | Importable Default/still Idle/Walk/curated Slash, receipts/layout/hashes, all 168 raw PNGs. |
| [Eight-direction review ZIP](../research/artifacts/2026-11-02-eight-direction-starter-review.zip) | Raw failures, sheets, timing illustrations, billing and actual UI evidence. |
| [Final closeout ZIP](../research/artifacts/2026-11-02-animation-closeout-review.zip) | Native foot JSON, negative controls, UI captures, exact old-axe replay and cadence illustration. |

Eight-direction body ZIP SHA-256: `7adb8a87fea7af4dd52b52d9fb2b363b6c43f6ea583700642ba99954dff93c29`. It stayed unchanged during final guard fixes/integration. Other archive hashes are in the manifest and dedicated reports.

Large early receipts/galleries and some supporting reviewer scripts remain ignored under `spikes/api/out/`, including `animation-research-2026-10-27`, `motion-lab-2026-10-28`, `motion-targeted-2026-10-28`, `motion-custom-v3-2026-11-01`, `workflow-reconciliation-2026-11-01`, `weapon-aware-2026-11-02`, `claude-review-2026-11-02`, `clean-grip-2026-11-02`, `studio-axe-2026-11-02`, and `eight-direction-presets-2026-11-02`. A clone may lack them. Older evidence media can be recovered from commit `1f95029`. Do not fabricate missing inputs or call an unrun script reproduced. Committed artifacts and selected native figures preserve the principal recent comparisons.

The user's ambient browser URL `test-results-weapon-aware-review/qualification.html` is an **older checkpoint**, not proof of the new pack or latest fixes. Local ignored galleries can outlive code, be stale, or disappear. Native PNGs are authoritative for pixels; GIF quantization/timing and first-frame-only tools need their stated limits.

### Navigation through all research phases

Read paired results/catalog JSON for detailed values, not just prose:

1. `2026-10-27-animation-diagnosis`, `2026-10-27-animation-rigging-sources`, `2026-10-27-animation-test-summary`.
2. `2026-10-28-motion-lab-implementation`, `2026-10-28-motion-lab-results`, `2026-10-28-motion-followup`, `2026-10-28-motion-followup-results`, `2026-10-28-motion-preset-catalog`, `2026-10-28-kaykit-comparison`.
3. `2026-10-28-motion-targeted-authoring`, `2026-10-28-motion-targeted-results`, `2026-10-28-motion-targeted-catalog`.
4. `2026-11-01-custom-skeleton-v3` and results; `2026-11-01-workflow-reconciliation` and results.
5. `2026-11-02-weapon-aware-grip`, `2026-11-02-clean-grip-qualification`, their results.
6. `2026-11-02-native-frame-authoring`, `2026-11-02-palm-grip-correction`, `2026-11-02-studio-axe-integration`, their results.
7. `2026-11-02-eight-direction-starter-pack`, `2026-11-02-animation-closeout`, and dated managed REST contract.
8. The November 2 review reports/results listed in the manifest, including credit consent, both independent reviews/reassessments, Claude response, counter-review, engineering closure and final motion challenge.

All research basenames above live in `docs/research/`; review files live in `docs/reviews/`. The manifest resolves exact names/extensions. PLAN.md, docs/known-issues.md, docs/README.md and AGENTS.md supply product/working context. Related preexisting generation-pipeline and tool-review briefs are context, not proof all their content was implemented in this task.

## 17 Cost and verification accounting

### Reported paid generation units

| Authorization phase | Actual units | Source of accounting |
| --- | ---: | --- |
| Original 1,000 | 998 | 86 diagnosis + 720 implementation + 186 targeted + 6 custom comparison. |
| Additional 1,000 phase before clean grip | 153.25 | Thirteen settled calls: 43.25 initial workflow + 110 weapon-aware; 196 conservative held. |
| Latest 500, clean-grip discriminator | 15 | One completed 738 request; stopped on failure. |
| Latest 500, eight-view source and actions | 74.25 | Two source create/register POSTs cost 2.25; six action pilot/continuation POSTs cost 72 total across 24 direction jobs. |
| Final closeout, integration, this handoff | 0 | Offline/software/documentation work. |

These recorded phase actuals sum to **1,240.50 units**. This is the sum of the documented attributable research jobs, **not** an account-wide billing reconciliation or all concurrent application work. Do not sum reservations into actual charges or infer spending from balance changes. The latest 500 allowance has 89.25 used and 410.75 unspent. Older unused funds stay in their own ledgers; allowances are ceilings, not goals or production auto-retry consent.

The starter's motion ledger conservatively holds 96 against its 150 allocation, while actual motion billing was 72; source 2.25 is outside that stage counter but included in campaign total. Rejected breathing idle cost 24, retained as research; recommended future still idle avoids buying that stage. Actual pricing here does not guarantee a universal formula. Unknown/USD-only outcomes keep conservative holds.

### Checks actually executed at the relevant checkpoints

| Checkpoint | Verification record |
| --- | --- |
| Original handoff at 0acd88ab | 1,403 unit passes/one skip; 10 relevant selftests. Earlier full browser run 165 passes plus startup failure, unchanged last-failed test passed separately. Do not rewrite as one clean 166 run. |
| Joint engineering fixes | Strict checks; 1,413 unit passes/one skip; fresh clean 166 browser passes. A preceding 146/20 run invalidated by concurrent dev hot reload is documented, not counted clean. |
| Clean-grip UI correction | Strict; 1,436 passes/one skip; final 11 relevant selftests. No repeat of full Studio suite for isolated dev delta. |
| East axe Studio integration | Strict; 1,439 passes/one skip; focused actual-native integration and full 168 browser passes. No game-engine runtime execution claimed. |
| Starter implementation | Strict; 1,493 passes/one skip; 12 relevant selftests and actual saved-artwork import/export; branch CI full shards passed. |
| Final code 7806be10 | Strict zero errors/warnings; 1,508 unit passes/one existing skip across 131 files. Full local 169 browser passes after cadence/bridge; final 12 selftests after final body/source/clipping guards. Build/dist guard passed. |
| Final remote code | [Run 41476761164](https://github.com/Shilo/PixelDoll/actions/runs/41476761164): build and all sixteen shards passed on final branch code. [Main run 41481991458](https://github.com/Shilo/PixelDoll/actions/runs/41481991458): build, all sixteen shards and deployment passed. |
| This transfer | Documentation/reference/hash/diff checks only. No new app test run or generation is claimed. |

Tests verify the specified implementation, not artistic or anatomical quality. Some independent reviewers inspected source/images without rerunning test commands; their reports disclose that. Do not count reported results as independent execution. The final half-strength movement regression was also tested red by deliberately restoring the old full-rate gait, then restoring the fix. No weakened timing/quality threshold was used to pass.

Use the pinned Node 24.22.1/npm 11.19.1 environment. Existing repo commands from `app/` are `npm run check`, `npm test`, and `npm run e2e -- selftests` for relevant dev changes. Assign unique E2E_PREVIEW_PORT, E2E_DEV_PORT and TEST_OUTPUT_DIR if running concurrently. Follow AGENTS.md for broader scope on shared state/storage/queue changes and read `docs/testing/test-performance.md` before test config changes. Keep keyless browser testing opted out with `pixeldoll.agentKey=off`, block/count PixelLab calls, and never expose agent servers beyond localhost.

Offline scripts cited by the reports prepare/evaluate retained inputs; some require ignored historical files or Node's experimental type transformation. Do not run a generation script as a substitute for missing evidence. Standard checks need no token. No credential, environment file, profile or private transcript belongs in the returned review or evidence bundle.

## 18 Remaining concerns and recommended stopping point

**Engineering is integrated; universal animation quality is not complete.** The most defensible deliverable is corrected software plus a small experimental native body pack and internal tools, not a promise of professional automatic output for every sprite.

Remaining concerns:

1. Only one new body/camera has eight-view managed evidence. Extreme/chibi proportions, other sizes/cameras and arbitrary humanoid shapes are unqualified.
2. The eight-view pack has no weapon layers. The single east axe cannot supply other views' hidden surfaces and grip drawings. A hand pixel check is geometric, not semantic or finger closure.
3. Still idle is intentional; breathing idle failed. The attack excludes two raw poses through a disclosed common map and remains experimental. Continuous naturalness and authored timing need actual visual acceptance, not only screenshot metrics.
4. Foot contact is source-bound, partial and 2D. Corrected analog cadence helps, but no general stride/camera/world-speed contract or physical planting was established.
5. Valid thin item pixels can still be removed inside an allowed region. Existing proposed restoration rules have known anatomy false positives, so they remain deferred.
6. AI redrawing within valid permissions can omit a head, alter a shaft or invent anatomy. Mask containment prevents leakage, not those semantic errors.
7. Manual art labor was substantial. Bespoke pixel decisions for each body/view/weapon are not a scalable casual-user generation promise.
8. Imported Studio B15-normalized pixels differ from unnormalized source by a defined low-bit transform. Do not confuse exact native PNG identity, placed image identity, file encoding identity and normalized Studio identity.
9. Provider metadata/API behavior may evolve. Dated contract capture is evidence for the tested implementation, not a permanent promise or explicit MCP-field parity.
10. Board metadata is unsynchronized despite successful Git integration/deployment. Other-agent dirty main files are outside this delivery.

Recommendation: retain deployed engineering and internal authoring tools; keep the body pack explicitly experimental and keep defaults unchanged. Finish this review against current code. If a concrete defect is proven, fix it narrowly using retained inputs. Defer new art support to a specific declared body/action/view with human visual acceptance and directional artwork, not another broad paid matrix. No further spending is needed for this transfer.

## 19 Required Claude response

Return **one self-contained, detailed review** with a short plain-language verdict first. Avoid a request for another broad investigation. Save it to a durable allowed path such as `docs/reviews/2026-11-02-complete-session-claude-response.md` if your checkout/guards permit; otherwise use a permitted scratch path and give the owner the full path. Never bypass a stale hook. Do not modify source or existing evidence.

Required contents:

1. **Inspection record:** exact commit, clean/dirty distinction, code/docs/artifacts actually opened, tests actually executed, missing evidence, and whether you personally viewed timed playback. Identify report-only observations.
2. **Claim audit:** claim, agree/disagree/unknown, precise file/line/frame/measurement, confidence and practical consequence. Audit both Codex and your earlier claims. Give special attention to the dated API correction and production-versus-dev distinction.
3. **Actionable findings:** severity, trigger, actual/expected behavior, minimal reproduction or counterexample, affected callers, proposed minimal fix, regression test and falsifier. Separate a current code defect from old fixed code, art judgment, missing qualification, product decision and hypothesis.
4. **Mask/cache/transport/consent challenge:** test ownership, mask provenance, fixed coordinates, restored jobs, body cuts, post-processing, valid mask replacement, mutation isolation, response interruption and accepted-ID precedence. Distinguish an approved batch/clear rejection recovery/free GET from a paid quality reroll or unknown paid replay.
5. **Starter durability and cost challenge:** source snapshot/GC/delete behavior, selected-versus-paid source, plan/group/frame binding, idempotent prepare, missing/unknown jobs, malformed optional idle, invalid usage/overflow, separate source cost, native per-view canvases and approval invalidation.
6. **Native artifact challenge:** independently verify raw-to-placed and placed-to-export pixels, six-cell/eight-slot attack semantics, same map across all views, standing-idle provenance, no mirror substitution, no fake joints/provider timing, declared B15 normalization and actual warning state.
7. **Hand/foot/playback challenge:** missing, typed and imported grips; source-opacity and clipping guards; stale rendering; native override independence; source-bound async validation; coverage versus physical qualification; half-strength cadence and fallback timing. Explain what the controls do not prove.
8. **Visual review:** cite actual body-plus-item frames, source art and complete ordered sequences. Challenge grip, occlusion, head/material continuity, anatomy, perspective, weight transfer, loop seam and attack timing. Do not propose global thresholds or delete ambiguous anatomy just to improve a metric.
9. **Earlier review reconciliation:** explicitly revisit common final V2 body versus mixed generation provenance, unknown seam causation, arbitrary 15 percent threshold, x28/D byte-proof limitation and Rules A/B negative controls. Explain any new evidence that changes the previously agreed dispositions.
10. **Recommendation:** keep/fix/defer/reject table; blockers versus nonblockers; at most three prioritized next actions, using offline checks first. State whether deployed engineering should remain and whether the experimental art should be promoted. No automatic default switch or generation recommendation based solely on test success.

Do not label a missing universal feature a new regression. Conversely, do not excuse a real current bug because a previous review agreed with it. A minimal failing case is more useful than a long list of hypothetical possibilities. If no concrete blocker is found, say so while preserving unresolved art limits.

## 20 Codex follow through after the owner returns the review

Codex will compare every actionable recommendation with the current committed code, the old Claude response, both independent reviews and retained native evidence. Each receives **accept, partially accept, reject, superseded, needs evidence, or needs product decision**, with reasons.

For accepted current defects, reproduce offline where possible, make the smallest root-cause fix shared by affected callers, add meaningful regression coverage, run repository-required checks, and document the final result. Preserve original failed controls, cost history, ownership and user consent. For disputed findings, provide an exact counterexample or source/evidence reference. Unavailable evidence remains unknown instead of being invented.

This is a bounded completion pass, not a new broad research program. A reviewer recommendation alone does not authorize new generations, dependencies, backend architecture, global threshold weakening or a product/default promotion. The owner will receive a concise plain-language outcome after the detailed record is updated.

## Historical handoff appendix

The following archived handoff is included verbatim so this transfer preserves the full earlier reasoning, measurements, source references, failures and review instructions. It describes snapshot `0acd88ab`. Its unmerged-branch state, older test counts, earlier remaining budgets, proposed next experiment and pre-November-2 API conclusions are **historical only**. Sections above supersede those status statements. The exact original remains separately versioned as `2026-11-02-claude-paperdoll-quality-review.md` and is hashed in the accompanying manifest.

# One-time Claude challenge review: PixelDoll motion and paper doll quality

Prepared by Codex on November 2, 2026. Product/code snapshot: commit `0acd88ab`, branch `codex/motion-lab`. This handoff's own documentation commit follows that snapshot. This document is intended to be read in full by the owner's existing Claude paper doll optimization session.

## 1. Assignment and one-time return protocol

The owner wants you, Claude, to perform a deep, skeptical review of this work and reconcile it with your own paper doll generation research. Do not merely endorse the conclusions. Inspect the actual code, native images, failed cases, measurements, assumptions and product constraints. Challenge incorrect experiments, weak claims, missed root causes, unnecessary complexity, cost assumptions and recommendations that ordinary users could not use.

This is **one detailed transfer and one detailed review returned through the owner**, not a continuing agent-to-agent conversation. The owner will bring your completed review back to this Codex chat. Codex will then challenge your reasoning, reproduce actionable findings, classify agreement and disagreement, implement accepted changes within the authorized scope, and document verification. Neither agent's authority or confidence substitutes for evidence. No mutual endorsement is an acceptance gate.

For this review, inspect and analyze without modifying the product or spending generations. You can run offline reproductions and relevant tests in an isolated checkout. Produce one self-contained final review with the return structure in section 17. Do not require the owner to coordinate repeated questions, read the entire research archive or learn the technical vocabulary. State missing evidence explicitly and provide a bounded recommendation despite uncertainty. Do not expand account permissions or read credentials.

If this is the same Claude session that previously investigated the application, use that knowledge, but identify conclusions superseded by newer code or contradictory measurements. If you lack the old session, do not invent its contents. The local-history review described below covered only the history that was available on this computer.

## 2. Owner's goal and nonnegotiable product constraints

The original complaint is that 3D animation projected onto PixelLab skeleton-v3 produced uncanny motion: limbs flailed, proportions and poses felt wrong, and animations did not resemble a professional result. The owner asked whether reference joints, prompts, conversion or PixelLab caused this, and requested extensive documented research into CC0 animation assets and MIT rigging tools.

The desired outcome is a consistent set of natural-looking preset animations and swappable equipment layers that align on every frame. The long-term ambition includes different humanoid shapes and sizes. That ambition has not been achieved by these experiments. Review whether a useful, honestly bounded product can be delivered, and which parts require an explicit product decision.

- PixelDoll is a free, MIT, fully client-side Svelte/Vite application, not SvelteKit. No backend is authorized by this research.
- Users supply their own PixelLab token. Generation costs real money. Ordinary creation and dressing should remain simple, with usable streaming results, optional moves and explicit scope/cost consent for retries.
- PixelLab returns composited images, not editable body/equipment layers. PixelDoll derives frame-based transparent paper doll layers from those outputs.
- The base body is frozen. Equipment must fit that exact base. A skin/finger patch hidden in a weapon layer changes that contract and couples the weapon to skin color and anatomy; it is not an accepted extraction shortcut.
- A deliberately newly authored gripping-hand body can become a different frozen asset. It cannot silently replace an existing body and preserve claims that its old joints/items still align.
- Internal one-time expert authoring can be reasonable for curated presets. Requiring every casual user to mark every hand, finger and pixel on every ordinary generated item is not a viable general product answer.
- Use only repository-approved PixelLab models. Pro is for editing existing images, never creation from scratch. Keep raw skeleton-v3, managed skeleton-v3 and their template/custom distinctions clear.
- Bronze UI owns shared visual appearance. This work did not add an alternative UI kit or restyle the normal application.
- Respect current AGENTS.md, no backward-compatibility machinery for preview data, no unrequested refactors, no weakened tests, no token exposure, no automatic paid resends and no claim that a passing pixel metric certifies professional art.
- Asset licenses and implementation licenses are separate. A free pack is not necessarily CC0. An MIT runtime does not establish rights to its editor, examples, models or datasets.

## 3. Workspace, scope and integration state

Primary review checkout:

```text
C:\Users\shilo\.codex\worktrees\motion-lab\PixelDoll
branch: codex/motion-lab
reviewed product head: 0acd88ab
main checkout: C:\Programming_Files\Shilocity\PixelLab\PixelDoll
```

All implementation described here is committed locally on the research branch. It has not been pushed, merged into main or deployed by this task. A current main checkout may contain later work, so compare commits rather than assuming identical branches. Committed main was synchronized into the research branch at `9b807439` from `d4c5785f`; that preserved Default-first optional moves, consistency checks and scope/cost-bound retries. Those features are not all inventions of this motion research and must not be regressed.

The research worktree was clean at the last checkpoint. The following unrelated main-checkout work was deliberately left untouched and uncommitted by Codex: `app/agent-key.ts`, `app/scripts/dist-guard.mjs`, `app/vite.config.ts`, `docs/handoff/agent-dev-token-handling.md`, and untracked `app/test/unit/agent-key.test.ts`. Recheck before touching any tree. Never revert, stash, reformat or commit another agent's changes.

The matching historical board card is `PVTI_lAHOAAg2ds4Boo7NzhDj-kA`, “Replace skeleton-v3 animation for natural motion.” Active/archived board reads still fail because the saved GitHub credential lacks project-read scope. No scope expansion or uncertain board mutation occurred. Tracking reconciliation is pending; this is not evidence that the card is complete. Follow the board rules before future code edits.

The last generation-bearing agent server was stopped. A normal Vite preview was started on localhost5199, and Motion Lab reloaded in offline mode with generation disabled without a connection. The agent tab was closed. Static review pages require no credential. Server processes and browser tabs may no longer exist when you read this; local files are the durable evidence.

## 4. Read order, evidence availability and temporal traps

Start with this handoff, then inspect the following repository documents in order. Dates matter: earlier reports retain intermediate statements that later reports explicitly refine.

| Document | Why it matters |
| --- | --- |
| `docs/research/2026-11-02-weapon-aware-grip.md` and matching `-results.json` | Latest source authoring, actual application fix, all eight east poses, failed final guide control, costs and verification |
| `docs/research/2026-11-01-workflow-reconciliation.md` and matching `-results.json` | Available Claude-history review, armed/split contradiction, exact-artwork raw/custom comparison and first failed managed-body equipment test |
| `docs/research/2026-11-01-custom-skeleton-v3.md` and matching `-results.json` | Live browser MCP findings, REST/MCP distinction and initial custom body experiment |
| `docs/research/2026-10-28-motion-targeted-authoring.md` and matching `-results.json` | Actual rendered sole marks, contact/attachment tools, all 54 native raw profiles and two-frame frozen-grid result |
| `docs/research/2026-10-28-motion-followup.md` | Persisted calibration, independent KayKit control, rigid attachment limits and explicit remaining work |
| `docs/research/2026-10-28-motion-lab-implementation.md` | Converter repairs, original/final measurements, 84-profile qualification and equipment failures |
| `docs/research/2026-10-27-animation-diagnosis.md` and `2026-10-27-animation-test-summary.json` | Proven old conversion bugs, controlled prompt/depth/reference/fall tests and limitations |
| `docs/research/2026-10-27-animation-rigging-sources.md` | CC0/MIT survey, exclusions, primary references and unverified sources |
| `docs/design/skeleton-pose-lab.md`, `docs/known-issues.md`, `PLAN.md`, current AGENTS.md | Tool contract, accepted limits, product decisions and working rules |

Selected before/after PNGs and a GIF are versioned under `docs/research/figures/`. Large raw evidence, derived ledgers, full local receipts and generated galleries are ignored under `spikes/api/out/`; a repository clone does not contain them automatically. The accompanying review bundle includes an explicit selection of offline evidence and code, with a SHA-256 manifest. It intentionally excludes credentials, environment files, private Claude transcripts and complete raw provider/session exports. It is a review snapshot, not a standalone runnable copy of the application.

Most important local evidence directories:

```text
spikes/api/out/animation-research-2026-10-27/
spikes/api/out/motion-lab-2026-10-28/
spikes/api/out/motion-targeted-2026-10-28/
spikes/api/out/motion-custom-v3-2026-11-01/
spikes/api/out/workflow-reconciliation-2026-11-01/
spikes/api/out/weapon-aware-2026-11-02/
```

Older media referenced by repository documentation may live only at commit `1f95029`. Do not infer that a broken old gallery link means a test never happened, or that a report alone proves an image's quality. List what you actually inspected. GIFs can quantize colors and use illustrative timing; native PNGs and source duration metadata are authoritative for pixel/timing claims.

## 5. The actual architecture and why the failure has several causes

The normal pipeline creates a base body, stores reference/keyframe skeletons, freezes animation frames, dresses an item on a chroma version of the standing body, poses that dressed reference and extracts a transparent item. Inpaint grids on real frames are an editing/fallback route. Held items use a larger layer sharing the body's pivot.

The raw skeleton equipment route supplies a dressed standing image plus requested joints. It does **not** supply each final frozen animated body image. Therefore, improving the body's prompt or fingers does not necessarily alter the item's actual provider request. The provider can redraw a different hand while producing an apparently coherent green preview; extraction removes that green hand, then compositing the item on the original body exposes the mismatch.

The 18-point skeleton does not encode a spine chain, finger closure, heel/toe geometry, a full foot orientation or an independent weapon transform. `LEFT/RIGHT ARM` are wrist labels and `LEFT/RIGHT LEG` are ankle labels, using anatomical left/right. No whole-project label swap was proven. Several hidden 3D poses can match the same 2D joints. A prompt can express intent, but cannot turn missing constraints into deterministic rendering guarantees.

Please keep these failure layers distinct:

1. Source action quality and event timing.
2. Source/target rest-pose, proportion, camera, depth and contact conversion.
3. AI renderer's anatomy, identity and temporal adherence.
4. Frozen body versus independently generated equipment alignment.
5. Semantic separation, occlusion, outline cleanup and exact extraction permissions.
6. Pivot/export/world-root/timing behavior in an engine.
7. Product burden, generation cost and repeatability.

Fixing one layer does not certify the rest. It is possible for the provider to follow an uncanny trajectory accurately, or preserve black-mask pixels exactly while inventing an extra limb inside white space.

## 6. Original diagnosis: proven defects versus renderer limits

The old retargeters remain historical controls. `retarget2.mts` built target XY from adapted geometry but depth from a different source pose. With motion gain zero, XY was fixed while depth still changed, up to59 units south/23 east in the diagnosis's control. That inconsistency is reproducible offline. Another implementation report uses a different two-sample control with56 old depth units; do not mix test scopes.

The old support rule switched the selected lowest-foot set abruptly. At source times0.5954 to0.5955 seconds, a smooth walk produced an approximately0.85 px whole-body vertical discontinuity. The first mocap walk also had much larger hip drift than the stored PixelLab walk: south hip-X range9.796 versus0.632 px, east12.212 versus1.116. These are submitted-joint measurements, not output naturalness scores.

Other defects/assumptions included transferring world-space rotations onto differently oriented drawn limbs; treating an action frame as a neutral reference; unstable projected angles for bones pointing toward the camera; per-body camera assumptions; full-length screen limbs despite foreshortening; silent boundary clamps; and uniform sampling across fast attack/fall events. Original authored Studio poses also had mostly stationary legs during large arm actions, so missing weight transfer was partly in the requested motion.

The first controlled live diagnosis comprised30 completed requests,270 returned images and86 attributable generation units. Deliberately shifting reference joints damaged agreement. Changing the attack label/empty-hand wording or removing depth/draw-order did not cure the wide off-arm swing and squat. That supports repairing trajectories instead of repeating those two prompt variations; it does not prove every prompt choice irrelevant.

Repeated stationary lying targets could remain coherent, including exact foreground areas from a lying reference. Yet the moving fall's final output still broke even when its final two requested poses were identical and the replacement endpoint was unclamped: detached pixels52/32 south/east, areas846→485 and692→377. Earlier framing limits remain a confound for overall production quality. This is sequence-specific renderer evidence, not proof that every repeated pose dissolves or that conversion alone explains every defect.

Account-wide balance changes were not used as attributable costs. Per-job reported usage was used because the account could have other activity.

## 7. Implemented converter, offline Motion Lab and qualification

New coherent target geometry lives mainly in `app/src/lib/rig/motion.ts`, with contact constraints in `planting.ts`. It derives XY/depth from the same target points, preserves fixed3D segment lengths, handles continuous support, exposes invalid calibration/overflow and permits body/view camera calibration. The reproduced support-boundary step fell from0.856 to0.00479195 px; zero-gain depth change becomes zero. A later contact correction stopped blending horizontal target feet toward a mismatched source stride, reducing a dense run angle spike from roughly61 to30 degrees. Neither is a naturalness certificate.

The development-only `/motion-lab.html` provides source/target and rough puppet previews, reference overlays, editable calibration, FK/IK, timeline/durations, contacts, grip/angle/occlusion authoring, sole marks, Undo/Redo, local save/import/export, candidate review and explicit exclusions/holds. Calibration is bound to exact artwork/view and converter revision. Pose/timing documents are separate from saved rest calibration. Stale/invalid input surfaces an error.

Contact authoring adds stance intervals/fades, world-root velocity, target-body anchors, two-bone IK and shared feasible pelvis correction. It does not stretch legs. Invalid reach, incompatible contacts, bounds and nonfinite data block rendering. Event-focused running samples capture short stance intervals; changing body calibration invalidates a stale plan. Sparse manual edits cannot silently inherit an unverified dense contact guarantee.

The first broad implementation campaign used720 units after the86-unit diagnosis, total806. It included84 body/action/view/seed profiles, three bodies, six actions, native south/east plus adult north, and supplemental13-pose falls. Eight canceled-before-transport comparisons were replaced at seed9, so the cohort is not uniformly seeds7/8. The catalog later selected42 candidates, including two agent-reviewed experimental adult south/east walks. Those are not a universally approved professional preset library.

The targeted phase then covered all54 available native profiles: three body families × six actions × three native views. The fixtures have south/east/north artwork; west is an east mirror with flipped visible handedness, and no native diagonal artwork exists. Earlier144-case geometry language was corrected to72 image-backed documents,54 native and18 mirrored. Geometry coverage is not image qualification. Mirrored views cannot purchase an independent native-view qualification.

Body findings: idle/walk can be useful, some walks shuffle, run can remain readable but vary, attacks can turn the torso or obscure the striking arm, and falls can invent a connected extra upper body. Connectivity cannot catch a connected hallucination. Raw terminal buffers are retained but excluded from reviewed playback where bad; a local frozen final hold is not a repair to the provider's raw final frame.

Equipment remains weaker than empty-handed body motion. At one corrected cohort walk passed all six adult helmet/tunic/sword × south/east gates, but attack swords collapsed to43%/18% of median area. Later targeted comparisons total21 records:13 pass,6 fail,2 warn. Same-job reuse added comparison contexts, not extra paid renders. Passing area/palette/connectivity does not establish correct grip, orientation or action appeal.

### Foot planting is still unresolved

Exact target ankle locks are not measured soles. Under the same proposed root path, adult east walk visible stance spans were2.01/1.96 px before and2.76/1.88 after; run2.99/0.26, with only two full-support samples over33 ms per stance. One walking foot worsened. A held sprite plus a continuously moving world root can still skate between sampled frame boundaries. Retiming requires a matching root trajectory in playback time. Engine speed was not automatically solved.

### Rigid attachment is an internal control, not the universal answer

Anchoring/rotating a standing sword keeps area stable but cannot infer wrist rotation, perspective surfaces, a clenched hand or front/back ordering. The extracted standing sword also lacks handle pixels hidden by the original hand; offline authoring restored22/25/20 south/east/north pixels before testing. Per-frame masks and enlarged bounds help only their specific problems. Nearest-neighbor rotation introduces raster stepping. Body turning and hidden grips persist. Codex explicitly withdrew an overly broad rigid-placement recommendation during reconciliation.

The two-frame frozen-grid edit was stronger:42,928 black pixels exact, sword areas186/181, zero registration shift and coherent visible contact in those frames. It cost15 rather than the inferred10. It did not qualify a full clip, other views, physical soles or repeatability. A full frozen clip cannot be inferred from two favorable frames.

## 8. Free-source research: useful inputs, not a missing universal rigger

The library survey was broad and prioritized, not literally exhaustive. These are historical inspected license findings, not a fresh November2 legal verification. Consult the detailed survey and exact downloaded notices before adoption.

| Source/tool | Finding and role | Caveat |
| --- | --- | --- |
| Quaternius UAL1/2 | Specific packs state CC0; free Standard editions are useful motion inputs | Do not label all advertised Pro/Source clips free. Check exact archive/changelog, elbow/export/root-motion fixes and original action quality |
| KayKit current Character Animations | Free1.1 archive downloaded, included CC0 notice verified; independent skeleton mapped and72 offline cases checked | Six controls, no new PixelLab KayKit output qualification. Source authoring still needs projection/contact adaptation |
| Kenney selected character packs | Official CC0 assets can provide proportion/source controls | Not a generic sprite auto-rigger or an established large motion inventory |
| Three.js/SkeletonUtils | MIT, useful source loading/sampling/retargeting building blocks | Does not infer hidden anatomy or make the AI obey pixel constraints |
| glTF Transform / ozz-animation | MIT code, useful processing/IK references | No demonstrated need to add production dependencies here; documentation licenses can differ |
| Animated Drawings | MIT implementation, projection groups/ARAP/BVH retargeting are relevant research | Archived Python/OpenGL research stack; dataset licenses differ. No pixel-grid/eight-view/professional guarantee |
| DragonBonesJS / Godot Skeleton2D | MIT runtimes/engine, viable prepared cutout/mesh workflows | Require segmented authored art, weights/slots/animations; adopting them changes the output workflow |
| Rigby2D / Rive / Flare | Candidate runtimes or authoring references with permissive code boundaries described in the survey | Editor/examples/dependencies/maintenance/export fit need separate verification; no integration was qualified |
| Blender | Useful optional offline CC0 motion/proxy authoring tool | GPL application code, not an MIT browser dependency; output/source-asset rights are separate |
| Mixamo / CMU / Spine / Babylon.js | Potential reference material outside the strict shortlist | Mixamo is not CC0/MIT redistribution permission; CMU exact terms were not established; Spine has separate conditions; Babylon.js is Apache-2.0 |

Pinned Quaternius GLB SHA-256: `bccd7586a5b6b088397965dd69d431d2209bc07fb3a602bafca9492a7dca69da`. Local file has127 clips, but that is not a verified current free-edition count or proof of human mocap provenance. “Mocap” is the experiment's historical folder label.

KayKit Free1.1 archive SHA-256: `65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f`. Neutral alignment and arm influence were both changed in later controls, so that improvement was not a single-factor ablation. No new library was added to the normal runtime.

The user-linked YouTube preview could not be fetched/watched. No conclusion relies on having evaluated that video. No surveyed tool establishes professional rigging for every single composited humanoid sprite. Deterministic cutout animation needs prepared parts; deterministic3D sprite rendering needs a fitted character/equipment proxy. Both are separate product/art workflows worth comparing honestly, not incidental fixes.

## 9. Custom V3, MCP and the API misunderstanding

The statement “custom V3 is not on API, therefore PixelDoll cannot use it” is incorrect. Direct browser code successfully initialized PixelLab MCP over HTTP, read deployed schemas/instructions, submitted managed custom motion and retrieved results. A web app can be a protocol client without being an AI agent. No LLM or backend is inherently required to send those structured calls. No host PixelLab connector was installed for this experiment.

Verified as of the November1 research: deployed `animate_character` MCP accepts `poses`, `move` and `scale`. Its initial character-specific instruction call reported no queued motion and no charge. Procedural moves plus pose overrides were tested. The public REST managed-animation schema described custom motion but did not declare the same explicit authoring fields and disallowed undeclared properties. Equivalent REST pose/move/scale parity was not verified. Do not paste MCP arguments into REST and assume support. Recheck official live contracts before a new integration; this handoff makes no fresh live-schema claim.

The three routes are distinct:

1. Managed skeleton-v3 using a provider animation-template ID, currently a walking source in Studio.
2. Raw skeleton-v3, with our reference joints and requested per-frame coordinates; used for final posing and raw converted-motion experiments.
3. Managed custom skeleton-v3, authored without an animation-template ID using the deployed procedural/pose workflow; tested only in the Lab.

“Custom” here is motion authoring, not an arbitrary user-defined bone hierarchy. The managed provider solves its figure-relative motion and retains a shared action for directions, but did not expose the expanded per-frame rig, authoritative frame timing or verified pivot contract in these experiments. A static estimated character3D skeleton is not that missing dynamic rig. Technical browser access does not establish long-term protocol support, plan compatibility or production readiness.

The first managed comparison used related artwork, so a later exact-artwork test corrected that confound. Original campaign spending ended at998, including6 units for the final custom comparison. That older report's statement that no Studio quality improvement had shipped was correct then; the later production mask fix below supersedes a blanket statement that this entire branch has no actual application changes.

## 10. Reciprocal challenge of the prior Claude workflow and controlled body comparison

A read-only sub-agent reviewed the full **available local** transcript matching “Paper doll system optimization (fork4)”:75,943,273 bytes,13,257 records and443 assistant text blocks, including inherited history/compaction summaries. Substantive available history was October26-28 UTC; fork metadata was October29. No substantive later cloud-only messages were established. Raw private history was not copied into committed docs or this bundle.

Codex's challenge to earlier conclusions:

- Armed-animation-then-split did not reconstruct all16 stored originals exactly. South recompositions differed at737-1,064 visible RGBA pixels; east532-706. Alpha differences0-43/7-28; common opaque changes above32 channel units24-55/8-33. Many differences are palette changes, but “exact preservation” was too strong. This does not alone prove every difference visually unacceptable.
- Older real-frame edits did not consistently use identical frozen-body references, so they were not controlled proof of unchanged anatomy.
- A later hard-mask result is stronger evidence about black pixels, not proof of the whole equipped clip.
- Forced review warnings can undermine the casual-user workflow when a low-specificity observation flags every ordinary output.
- Rigid placement was also oversold by Codex. It cannot solve all perspective/grip concerns. Both sides' claims need correction.

The later controlled experiment imported all four exact80px benchmark views. Visible decoded RGBA and canvas matched; provider PNG bytes were recompressed. South/east/north are native, west is explicitly mirrored. Eight frames in south/east were compared across A=corrected raw source-depth proxy, B=managed custom, C=raw with static provider target depth. Raw controls shared source/action/camera/times/seed731. Managed B has no exposed equivalent seed and a different motion-authoring path, so B versus A/C is not a renderer-only causal ablation.

Static provider triples were converted to canonical axes `[p0,p2,-p1]`, pelvis-centered and uniformly scaled. Cross-view rest-length variation improved for some segments: right hip13.44%→3.20%, right shoulder17.68%→3.24%, left upper arm4.29%→0.38%. Rest XY fits are zero by construction, not independent validation. Per-view best cameras disagree. The raw native-depth route still failed attack semantics and had a30-pixel detached streak in east frame1.

An independent reviewer inspected all six ordered strips before the A/B/C mapping. A/C failed action readability in both views: backward horizontal arm action in east, excessive torso turn south. B was preferred for anticipation/downstroke/recovery but retained crouch, hidden mitten-like grip and unknown timing. The independent review was still-image based; the parent saw illustrative playback. Neither is an independent professional animator certificate.

Measured visible managed-B landmarks: east toe(61,89) stable; east heel(52,89) except(53,89) at frames4/5; south drawn-left toe44→45 and back; south drawn-right toe65 stable. One native pixel of uncertainty/tolerance was declared. Hidden far feet and south heels are unknown. B was eligible only for one bounded equipment diagnostic, not approved as a production clip.

That diagnostic protected111,882 black pixels exactly, yet failed grip. In frames1/3/4/6, editable original-body pixels changed52/73/75/125, with31/15/7/21 new key-colored pixels outside the frozen body. Frame1's new green hand was above the old fist; after extraction the sword remained roughly12.10px from the original grip according to color-candidate geometry. The proper failure is the actual original-body composite, not a claim that color analysis measured a true anatomical hilt center. The global equipment gate remains failed.

## 11. Weapon-aware authoring, actual six-call sequence and rejected anatomy

The next hypothesis deliberately adopted the better gripping hand as a new body asset before freezing, rather than pretending the old body's hand was preserved. All corrections/derivatives are separate from raw provider outputs. W=confident weapon, K=protected source key-colored support, U=uncertain rim, I=verified original unarmed body, C=armed source, C-prime=explicitly corrected source, B=actual disarmed provider body, H=reviewed hand envelope, B-star=new authored body, D=edit permission, S=conservative extraction permission.

K means protected source color/geometry, not certified anatomy. D says where editing may occur, not where the final prop must exist. An exact residual reconstruction can be tautological if body pixels are copied into equipment; independent labels and counterchecks are essential.

| Seed / job | Purpose | Actual / held | Main outcome |
| --- | --- | ---: | --- |
| 732 / `bfa261ad-c040-440e-9b37-af1ba7df2a96` | Disarm source poses1/3/4/6 | 15 /25 |82,163 black pixels exact; no alpha excess; improved visible new hand;12 U boundaries prevent strict pure-W reconstruction |
| 733 / `ae4b858b-96a9-45dc-b412-7ca2f62b5200` | Hatchet on that same frozen body |15 /25 |65,310 black pixels exact; improved visible grips; extraction leaks exposed and bounded; direction/hidden grip still fail qualification |
| 734 / `b3ae338e-eef2-48ad-b563-a392e8c01348` | Complete armed poses0/2/5/7 |25 /25 |Original feet exact but frame5 invents114-pixel rear-leg/artifact region; raw source rejected |
| 735 / `564bfc22-d220-4811-bd8b-d6e48f886e76` | Disarm corrected missing poses |15 /25 |82,093 black pixels exact;10 U remain; green posterior stubs where pommel was, so raw bare body rejected |
| 736 / `43f75ed0-adc1-483c-ac76-afb0ebf06a6f` | Complete hatchet family on authored B-starV2 with actual references |25 /25 |107,254 black pixels exact; no rear-leg recurrence; full-eight research family, unresolved pommel cleanup/axis/reach issues |
| 737 / `6c4d5c1d-efa4-4028-b03b-9082a439b902` | Empirically fitted two-frame axis repair |15 /25 |82,267 black pixels exact; direction improves, head design/size/position fails; reject both replacements |

Full request/result/packet hashes are in the compact November2 results and selected analysis JSON. Critical immutable contracts: B-starV2 recipe `4458544f88245b1a96db2c1781f857a2f306271014009574bf0ac11de5fb8fd8`; final736 packet `8fb5ba7f0464f71ebb622d704490d4b223eea09bdc43d1c2ee24ddda310ba9ce`; final737 packet `dc4a43c87bc995d99390d7b3b3c8779e2c39997a4d6ea757c2122dbf0353f160`; actual737 PNG `7080e41c41df8cc6d9e52672e98341bfe893435b37356165c68115483bae684c`.

### Source corrections and B-star are authored decisions

Two isolated white samples were removed from the first source, explicitly recorded. Completing the other poses required144 individually recorded restorations of original transparent RGBA: extra posterior arm27 in frame0, white artifact1 in frame2, rear-leg/artifact114 in frame5, posterior arm2 in frame7. No original opaque pixel was overwritten or valid20-pixel raised fist removed. That fist lies10-14px from the old grip; an automatic old8px radius clamp would recreate the detached-hand defect.

Disarming can replace a brown pommel with green hand-like anatomy. Exact black retention and zero residual non-key pixels do not certify a correct bare body. B-star reuses verified I outside a reviewed old/new8px hand-envelope union H, actual B inside H, and reviewed source-K support. V1 removed32 unsupported bare-body additions but retained18 unwanted preexisting source-K pixels in frame6. V2 separately restores those18 to known original transparency and updates K. Total actual-B-to-V2 pixel changes by frame are17/0/0/0/1/0/18/14, all50 documented. One frame0 contour sample is an explicit source adoption; no universal K-to-anatomy assertion follows.

The eight pure-W reconstruction differences are3/2/1/4/4/2/2/4, totaling22 U. Full residual reconstruction is exact and confirmed body residual is zero, but uncertain boundaries were not relabeled into a pass. Newly generated skin colors are authored guesses. Some known chroma colors can be inverted exactly per frame, but a global inverse collides; nearest-neighbor color restoration for newly authored hands is not recovered original skin.

An independent audit found the same unsupported posterior fills before reading the initial recipe ledger. That helps guard against circular labeling, but does not prove anatomy or hidden wrist proportions. Old reference joints are not certified to align with the new hand. This body family needs its own exact contract before product reuse.

### Export geometry was calibrated, not guessed from padding

The provider's managed112px metadata did not establish an80px source plus16px padding or expose a verified pivot. Our own112→144 constant pad16 is exact. A new authored contract fits all eight outputs: body crop from144 at(32,32), size80, pivot(40,75); held crop at(16,16), size112, pivot(56,91). Both resolve to source(72,107). Bodies/confirmed weapons fit without clipping; this is not proof of provider pivot or foot mechanics.

Production held padding is already dynamic:64→96,80→112,112→144. “Weapons always use96px” was an incorrect universal assumption, not a demonstrated current exporter bug. Foot occupancy at source y>=100 staying exact is only an occupancy proxy. Frame734 proves that preserving the old feet does not prevent an added foot elsewhere.

### Remaining736 evidence

Initial text-only design guidance was replaced before dispatch with actual prior hatchet reference images. All target K/U and protected references were unchanged. The extra-leg region did not recur in736: a parent's first small-grid suspicion was withdrawn after enlarged pixel/ROI audit. Do not propagate that incorrect visual suspicion as a measured failure.

Existing conservative extraction removes three isolated white pixels in frame5 and also two plausible brown pommel pixels in frame7. The latter are(67,79) RGB149/90/42 and(67,80) RGB107/56/23. `dropKeyOutline`, not minimum component size, removes them; `minPx:1` does not fix it. Raw and conservative variants remain separate. The global rule was not weakened. A submitted permission mask is an upper bound, not a semantic prop matte that proves every brown pixel must be retained.

Visible grips read better in0/1/3/4/5/7;2/6 are partly hidden. This is limited visual improvement over the old detached-hand result, not professional animation. Source-sword versus hatchet axes differ82.93° in frame3 and51.48° in4. Frame4→5 front wood extent grows45.30% and grip-to-head-center44.90%, while head area grows6.25%. Different occlusion changes total brown span in the opposite direction. These are projected observations; perspective/action choices could legitimately differ. The source sword axis is an authoring hypothesis, not ground-truth physically correct choreography.

### Why737 is a meaningful failure, and what it does not prove

The first symmetric ellipse draft was never rendered. Offline review found the actual85-pixel reference head was one-sided and could be squeezed by that draft. The final packet instead preserved its measured12.09471×12.57822 projected dimensions/chirality, translated along the chosen axis to a21.92567px distal control, plus1px raster margin. Every85 reference-head point fit both targets' continuous support and actual edit mask before spending. Nearest-pixel rotation produced83/85 unique permission points, without resizing reference artwork.

The final mask included all old weapon pixels for removal plus153 transparent guide pixels per target. It kept K/U and references black. Old-W deletion permission and desired new prop support were deliberately separate. The evaluator measured every raw non-key editable candidate before any guide crop; no output was cropped into success.

Result: axis errors drop82.93→1.74° and51.48→2.19°, but largest neutral head components are24/54 versus85 in the reference, with a detached9px neutral component in frame3. Head centroid errors11.56/5.07px, head distal extents31.12/28.37 versus21.93 control, and41/42 raw item pixels outside the desired guide, all in editable old-W. Frame3 reads as a broken/chipped tool; frame4 is undersized/displaced. Both independent and parent visual reviews reject replacing frames3/4. The full-eight substitution creates design popping. Frozen body, references and bounds remain intact.

This demonstrates that the tested old-sword-source-plus-mask request can influence direction while failing desired final shape. A hard mask means “may edit,” not “must erase the old prop here.” It does not prove all PixelLab hatchet generation impossible, that the source sword direction is universally correct, or that a clean bare-hand source would fail identically. The latter is an untested future discriminator. No more paid requests are scheduled at this checkpoint.

## 12. Actual application changes versus development-only work

| Change | Code / commits | Actual effect and boundary |
| --- | --- | --- |
| Raw held-body observations | `d7b95556`; image chroma, items, QA summaries/manifest, Studio Details | Retains compact raw new-key-body observations before registration. Informational Details only; not a semantic extra-hand detector or mandatory warning |
| Shared bounded extraction | `edfe7735`; `app/src/lib/items/items.ts` | Optional copied binary stencil bounds item alpha/mask/area/body cuts. Exact raw coordinates disable bestShift. Reapplied around post-processing so repairs cannot regrow outside permission |
| Production inpaint integration | `4f050598`; `app/src/lib/items/run.ts`, `app/src/lib/image/hard-mask.ts` | Both draft inpaint evaluation and accepted-item/new-move grid repair automatically enforce their exact submitted target masks. Saved mask blob/hash/input attribution/canvas validated; missing/corrupt mask yields clear G1 failure; extraction cache includes mask identity |
| Corrected motion/contact math and offline calibration | `36fd9030`, `59a20dac`, `8d50d1e8`; rig motion/planting and Lab | Real math/tooling fixes, but these research presets/conversion changes are not a new Studio default |
| Managed MCP custom authoring / pilot controls | `48c29693`, `ae6681bd`, `4f3cd796`; Lab modules | Direct browser protocol prototype, exact-artwork controlled comparisons, reservation/receipt/export controls; no production MCP dependency |
| Fixed weapon-aware profiles | `b8466af8`, `5f7b8900`, `f0fee83f`, `d5ad5d3f` | Pinned source/body/mask/reference validation, one-shot receipts, empirical737 permission checks, budget bounds; development research controls only |
| Research evidence | `5d9b58e5`, `0acd88ab` and prior dated reports | Reproducible scripts, raw-versus-derived distinctions, costs, failures, selected media and unresolved limits |

The real production fix prevents equipment pixels and body cuts from appearing outside the exact submitted edit permission, including after cleanup/repair. It does not supply good masks, fix new anatomy inside white regions, repair a wrong grip, force final prop silhouette or solve uncertain material/outline classification. Raw skeleton posing/dressing behavior and Studio's body-motion default remain unchanged. No new preset pack is released.

The raw-body observation was initially made a warning. A benchmark showed it flagged every held sword/axe/bow clip, raising warning counts3→9,1→7,2→5 without changing extraction. That was rejected as insufficiently selective. Final behavior is informational in existing Details, preserving normal clean saving and consent behavior. Review whether it remains useful, rather than recommending the rejected broad warning again without new specificity evidence.

### Specific code-review targets for the mask fix

Inspect `extractCell`, `clipToStencil`, `postProcess`, `inpaintStencils`, `evaluateItem` and `gridItemClip`. Confirm binary/canvas validation, copied ownership, immutable raw output, reference/unused-tail handling, cut containment, area consistency, fixed raw registration, cache invalidation and restored-job provenance. Look for valid thin/occluded fragments lost inside permission, repair paths that could bypass a bound, and any intended route that stopped receiving registration unexpectedly. Distinguish a proven regression from a hypothetical one.

Unit evidence includes `item-stencil.test.ts`, `automatic-recovery.test.ts`, `grid-repair.test.ts`, `held-raw-key-review.test.ts`, `weapon-aware.test.ts`, `weapon-swap.test.ts`, `fixed-inpaint.test.ts`, `research-budget.test.ts`, motion/contact/attachment/sole tests and browser `selftests.spec.ts`. These tests establish implementation properties, not output aesthetics. Do not weaken them to accommodate a proposed change.

## 13. Budget, spending safety and exactly what remains

Original campaign:86 diagnosis +720 implementation +186 targeted +6 managed custom = **998 /1,000 actual units**. Two original units remain separate. The owner then explicitly authorized **1,000 additional units** and autonomous continuation. The allowance is a ceiling, not a target.

Additional phase `workflow-reconciliation-v1`: seven initial settled calls43.25 actual /46 conservative held; six weapon-aware calls110 actual /150 held. Final **13 settled calls,153.25 actual /196 held**, no unknown new submissions. Combined historical actual1,151.25. Additional actual remaining846.75; conservative remaining804. No account-balance-delta inference or automatic paid retry.

The internal pilot stays200, distinct from the1,000 additional allowance. Stage allocation evolved25/100/75 →25/150/25 →25/175/0 for body/equipment/replication, documented before new spending. Final holds21/175/0. A zero-cap replication stage is valid accounting and blocks positive reservations even with prerequisites approved. Historical failed gates and conservative holds were not reset to regain spending room. The global equipment gate remains failed; narrow explicitly pinned source diagnostics do not retroactively pass it.

No more paid calls are scheduled for this review. The owner's remaining budget is still authorized; a later agreed experiment within scope does not need the owner to approve the same allowance again. Nevertheless, stage allocation, prerequisites, one-shot identity and sufficient remaining reservation capacity must be resolved before another call. Never resend an accepted/unknown request just because a browser reloaded. Keep receipts and read existing status/billing for free.

The two-frame historical grid cost15 versus inferred10; subsequent uncertain bounded grids reserved25 and actually billed15 or25. Do not extrapolate a new universal price formula from these few samples. Preserve current scope/cost-bound retry consent in Studio. This review should compare quality improvement per cost, not merely recommend consuming the unused allowance.

## 14. Verification, reproducibility and limits

Last completed code checks used Node24.22.1/npm11.19.1, strict TypeScript/Svelte checking,126 unit files with **1,403 tests passed and one preexisting skipped**, production build and distribution guard passed. All **10 targeted browser selftests** passed after the final Lab changes. No test assertions, expected defect counts or art-quality thresholds were weakened to pass these changes.

After production mask integration, a full browser run had165 passes and one startup failure: a dynamic module request failed with `net::ERR_NO_BUFFER_SPACE` before Studio loaded. The preserved trace supported that attribution, and the unchanged last-failed test passed on rerun. Do not describe this as a clean166-pass single final run. An earlier pre-integration full suite passed166. The final newer changes were Lab-only and received the targeted selftests, not another full suite. Native approved test execution was needed for known Windows transform-cache/browser environment restrictions; no test configuration workaround was added.

From `app/`, standard checks are:

```powershell
npm run check
npm test
$env:E2E_PREVIEW_PORT='5541'
$env:E2E_DEV_PORT='5542'
$env:TEST_OUTPUT_DIR='test-results-claude-quality-review'
npm run e2e -- selftests
```

Read `docs/testing/test-performance.md` before changing test configuration or adding slow tests. Shared production/storage/queue changes require repository-defined broader scope. Existing dependencies suffice; do not install a new engine simply to inspect evidence. A source snapshot in the bundle is not enough to run the full app without the actual checkout/dependencies.

Offline November2 reproduction, from root with Node24 and retained local inputs:

```powershell
node spikes/api/mocap/audit-body-family.mts --v2
node spikes/api/mocap/calibrate-weapon-family.mts
node spikes/api/mocap/prepare-weapon-axis-repair.mts
node spikes/api/mocap/evaluate-weapon-axis-repair.mts
node spikes/api/mocap/package-weapon-aware-review.mts --axis-repair
```

Also inspect the original default four-pose annotation/disarm/swap scripts and completion variants. Their outputs use separate names; six original historical packet/report/PNG hashes were reproduced byte-identically after extensions. Some earlier workflow scripts may download public frame URLs from retained receipts; they do not submit paid jobs. Preparation scripts produce packets, not generations. Do not mistake a prepared/unrendered draft for an actual provider result. Dependencies between scripts and missing ignored inputs must be reported, not replaced with fabricated fixtures.

Useful current static pages if the normal server is running:

```text
http://localhost:5199/test-results-weapon-aware-review/qualification.html
http://localhost:5199/test-results-weapon-aware-review/index.html
http://localhost:5199/test-results-workflow-body-review/index.html
```

The old ambient browser tab `test-results-motion-custom-v3-review/index.html` is an older checkpoint. It is not the final November2 result. Do not interpret its contents or costs as the newest evidence.

## 15. Codex's self-critique and claims you should try to falsify

1. **Selection and scope bias:** final bodies/hands/masks were curated after failures. A good composite is not a repeatability result. Report how much expert effort per family was required and whether this can scale without burdening users.
2. **Changing causal factors:** raw versus managed changes motion authoring as well as rendering. KayKit adjustments changed reference alignment and gains together. These experiments guide a decision but do not isolate every cause.
3. **Anatomy and hidden surfaces:** B-star's hand, source contour adoption, recoloring and posterior corrections remain authored choices. Pixel proofs do not establish hidden forearm length, closed fingers, wrist rotation or biomechanical plausibility.
4. **Circular masks:** W/K/U/H need independently justified labels. A residual, guide crop, body-copy item or selective deletion can trivially improve a metric. Search for that explicitly. The737 raw audit was designed to expose rather than hide off-guide pixels.
5. **Mask meaning:** exact D containment may be a good implementation invariant while the submitted D itself is too broad, wrong or occlusion-biased. The new production fix does not automatically build semantic permissions.
6. **Palette and thin fragments:** conservative extraction removes plausible brown pommel pixels. Removing outline suppression globally could retain body noise; keeping it could damage slender items. Recommend a discriminating local counterexample, not a blanket threshold increase.
7. **Direction hypotheses:** sword-axis matching and median projected reach are drawing controls, not physical ground truth. A real axe may need different wrist rotation and foreshortening. Challenge whether737 targeted the right aesthetic problem even though it failed its own declared shape contract.
8. **Timing and contact:**100ms review GIFs are not provider timing. Native pixel anchors and exact target IK do not establish continuous world contact. A new preset needs authored anticipation/impact/recovery and an engine root contract.
9. **Provider coordinates/pivot:** static target3D and inferred padding cannot certify dynamic rig or export pivot. The authored crop/pivot is internally coherent but not a provider guarantee.
10. **Workflow complexity:** fixed experimental packets, hashes and ledgers are research controls, not a proposed everyday UI. Decide what reusable production contract is actually necessary; remove no evidence to simplify a conclusion.
11. **Remaining breadth:** custom north/diagonal views, independent west, other body proportions/sizes, other prop classes and repeated-seed robustness were not qualified. Earlier raw54 coverage does not fill those managed/equipped gaps.
12. **Review independence:** some sub-agent work used stills only and shared context. The parent knew pipeline identities. “Independent” is limited to stated methods, not blind human animation judging across every stage.
13. **Overconfidence corrections:** Codex withdrew the excess-foot-drift suspicion, broad rigid-placement advice, raw736 extra-leg suspicion and the undersized ellipse draft. Review the corrected evidence rather than defending those abandoned claims.
14. **Code versus release:** the actual production extraction fix exists on this branch, but no deployed improvement or new default is claimed. Review whether the shared path fixes the root cause for all intended callers or misses a restoration/repair case.
15. **Stopping decision:** further narrow authoring may help, but broad additional rerolls have weak expected value. Challenge whether a clean bare-hand prop guide, manual preset authoring, a prepared cutout route or a3D proxy has the best evidence/cost/product fit. Do not turn an untested alternative into a promised solution.

## 16. Provisional recommendation to challenge

Keep the shared production mask-containment fix if your code review supports it. Keep the raw-body observation informational unless stronger specificity is demonstrated. Retain the corrected converter and offline Lab as internal authoring/research tools. Do not replace the Studio motion source or release an equipped attack preset from this evidence.

Managed custom V3 is currently the leading body-authoring candidate for this tested overhead action and exact artwork, not a proven universal renderer winner. A curated body/action/grip family can deliberately author its hand once, then freeze that body and fit equipment to it. This is more defensible than silently preserving a wrong old fist or adding skin inside every item.

Before buying a larger matrix, the next plausible narrow discriminator is a verified B-star bare-hand source with a separate desired prop guide and actual design references, avoiding an old sword footprint as a competing geometry cue. Establish exactly what changes versus737 and what can be rejected before paying. Do not assume it will work. If reliable output still requires bespoke per-item per-frame edits, recommend narrowing preset support or an explicit prepared-art alternative rather than hiding that labor in product claims.

Production qualification should require the entire supported clip, meaningful motion timing, visible/unknown grip distinctions, design continuity, inside/outside-mask anatomy review, occlusion, native soles plus intended root path, pivot/export bounds and a repeat/control on another compatible weapon/body/view. Phase those checks intelligently; do not purchase every direction before the first family passes. The long-term arbitrary-humanoid requirement may need a product tradeoff, not another prompt.

## 17. Required return from Claude and Codex follow-through

Return one substantial review, suitable for the owner to paste or attach in one message. Begin with a short plain-language verdict: what definitely improves the application, what should be rejected, whether this research route is worth continuing, and the highest-value next action. Then provide the detailed evidence.

Required sections:

1. **Inspection record:** exact commit/branch, documents/code/images/tests inspected, what could not be accessed, and whether continuous playback was personally inspected. Distinguish fresh results from report-only assertions.
2. **Claims audit table:** claim, agree/disagree/unknown, evidence/path/frame or code location, confidence, consequence. Include the strongest Codex claims and relevant claims from your own earlier workflow.
3. **Prioritized findings:** severity, concrete trigger, observed versus expected behavior, minimal reproduction or counterexample, affected callers, recommended fix, and verification that would disprove your diagnosis. Separate proven bugs from art judgments and hypotheses.
4. **Production patch review:** decide whether mask ownership/provenance, post-processing containment, cache identity, restored jobs and raw coordinates are correct. Address potential thin-item loss without relaxing unrelated protections.
5. **Visual/motion review:** critique native anatomy, hand/weapon contact, material/shape consistency, occlusion, timing, foot/world-root behavior and direction/proportion limits. Cite frames. Evaluate actual body-plus-item composites, not just attractive green provider outputs.
6. **Experimental-design critique:** identify confounds, hindsight selection, circular metrics, invalid comparisons, missing negative controls and unsupported extrapolations. Say which conclusions survive them.
7. **Reconcile your prior workflow:** explicitly answer the16-pair armed/split preservation discrepancy, real-frame body-reference control, skin-in-layer issue, and user labor. Correct your own earlier claims where warranted; challenge Codex's measurements if reproducibly wrong.
8. **Options comparison:** current skeleton route, managed custom body + frozen-mask equipment, deliberate prop-aware family, prepared cutout/mesh, fitted3D proxy and any justified alternative. Compare expected quality, hidden-surface information, art labor, client-only fit, licensing, cost, repeatability and product disruption.
9. **Minimal next plan:** rank at most three concrete actions with prerequisites, expected benefit, offline checks, estimated maximum generation hold if any, pass/fail/stop rules and what would change the decision. Prefer one discriminating experiment over a broad matrix. No paid calls during this review.
10. **Implementation recommendations:** precise files/contracts to change, what to preserve, tests needed, expected app behavior and risk. Avoid unneeded architecture, global threshold weakening or an unrequested workflow redesign.
11. **Unresolved decisions and falsifiers:** only matters that need the owner's actual product judgment, versus engineering choices an agent can resolve. Do not ask for a new budget already granted.
12. **Final recommendation to Codex:** accept/keep, fix before merge, defer, or reject, with a clear readiness statement for both the application patch and the experimental presets.

When the owner returns your review, Codex should perform one documented counter-review, not blindly implement it. For every actionable recommendation, record accepted/rejected/partially accepted/needs evidence/needs product decision, reproduce where possible, and explain disagreement with concrete evidence. Implement accepted in-scope fixes on the research branch, run the repository-required checks, preserve raw failed controls and costs, update the findings and provide a concise owner summary. Architecture or product changes outside the existing request must remain explicit decisions. The one-time review loop ends with that implementation/reconciliation report; another Claude cycle is not assumed.

## Primary-source pointers for verification

These links identify the sources used by earlier research. They were not freshly browsed while writing this handoff. Current integration/licensing claims should be verified against official sources and pinned files.

- PixelLab MCP guide: <https://api.pixellab.ai/mcp/docs>
- PixelLab public REST schema: <https://api.pixellab.ai/v2/openapi.json>
- Repository REST snapshot: `docs/research/pixellab/pixellab-openapi-v2.json`
- Quaternius UAL1: <https://quaternius.itch.io/universal-animation-library>
- Quaternius: <https://quaternius.com/>
- KayKit current character animations: <https://kaylousberg.itch.io/kaykit-character-animations>
- Animated Drawings: <https://github.com/facebookresearch/AnimatedDrawings>
- Animated Drawings paper: <https://arxiv.org/abs/2303.12741>
- Three.js SkeletonUtils: <https://threejs.org/docs/pages/module-SkeletonUtils>
- ozz IK documentation: <https://guillaumeblanc.github.io/ozz-animation/documentation/ik/>
- Footskate cleanup research: <https://research.cs.wisc.edu/graphics/Gallery/FootskateSolver/footskate.html>
- Godot2D skeleton authoring: <https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html>

The requested deliverable is a rigorous, usable review. Agreement, more generated images and more dependencies are not success criteria.
