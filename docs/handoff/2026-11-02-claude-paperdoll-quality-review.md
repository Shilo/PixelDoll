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
