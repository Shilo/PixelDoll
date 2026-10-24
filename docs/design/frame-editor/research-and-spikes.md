# Frame Editor: research, arguments and spike agenda

Date: 2026-10-23. Planning/research only. This document distinguishes documentation evidence, source inspection, design conclusions and experiments that have not run.

## Question and decision

Can PixelDoll provide a powerful embedded editor without becoming a general art application or misleading users about skeletons?

**Yes: one paperdoll-document editor, with visible target/frame/tool choices and one recoverable draft.** Its scope is defined by the synchronized character/equipment document, not by whether the screen resembles a standalone editor. Body and items are both editable. Raster alignment, painting and joint metadata share selection/history/save infrastructure but retain different effects.

This is a reasoned design agreement, not proof that users find the result intuitive. The offline prototype and user tasks below must establish that before production claims.

## Primary sources and adaptation

Official sources were inspected for the earlier skeletal/pixel reviews and the additional documentation investigation in this planning round. No competing application was installed or benchmarked, and no source/UI assets are proposed for copying.

| Source | Documented behavior | Design inference for PixelDoll | Boundary |
| --- | --- | --- | --- |
| [Aseprite Move tool](https://www.aseprite.org/docs/move-tool/) | Cel movement, axis constraints and movement of selected cels through the timeline. | Keep Move consistent for a selected artwork target; disclose multi-cell translation through the filmstrip. | PixelDoll bakes into fixed cells/pivots; it does not need arbitrary runtime cel offsets. |
| [Aseprite linked cels](https://www.aseprite.org/docs/linked-cels/) | Editing linked images affects their linked cels; unlinking allows independent edits. | Explicitly disclose repeated logical source cells. Use copy-on-write for merely deduplicated image hashes. | Hash sharing in PixelDoll is storage reuse, not user-authored linkage. |
| [Aseprite timeline](https://www.aseprite.org/docs/timeline/) | Layers, frames and cels share persistent navigation. | Keep frame navigation while switching tools/targets; one draft can repair more than one cell. | Do not add general timeline/timing authoring just to edit existing clips. |
| [Aseprite onion skinning](https://www.aseprite.org/docs/onion-skinning/) | Previous/next frames can be shown as editing references. | Optional ghosts and animation review protect temporal consistency. | A good repaired still is not evidence of a good loop. |
| [Spine tools](https://esotericsoftware.com/spine-tools) | Selection/manipulation, numeric transform input, keyboard adjustment and distinct transform/pose operations. | Combine a small toolbar with contextual precision controls; users should not need separate editor documents. | Auto-select-and-drag behavior is risky for pixel repair; explicit target selection is safer by default. |
| [Spine IK](https://esotericsoftware.com/spine-ik-constraints) | One/two-bone constraints position bones toward targets; bend direction is explicit. | Optional hand/foot posing assist after direct placement, with a visible parent and bend choice. | No bone/mesh data currently deforms PixelDoll's frozen body deterministically. |
| [Spine skins](https://esotericsoftware.com/spine-skins), [Spriter quickstart](https://brashmonkey.com/spriter_manual/quickstart.htm) | Attachment substitution and pivots support modular character workflows. | Preserve stable slots and common-pivot frame alignment when switching equipment. | An attachment pivot does not reconstruct hidden cloth or repair an incorrectly generated anatomy. |
| [Godot 2D skeletons](https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html) | Rest/hierarchy and weighted geometry are separate rigging concerns. | Distinguish calibration, desired motion and raster authoring. | Adding mesh/weight authoring is a new product burden; this tutorial also carries an outdated-content notice. |
| [Game Character Hub](https://www.gamecharacterhub.com/portfolio-edition-features/) | Character assembly coexists with pixel/frame/layer editing. | A focused editor fits a character-creator product. | The breadth of another tool does not justify copying its whole toolbox. |
| [PixelLab ways to use](https://www.pixellab.ai/docs/ways-to-use-pixellab) | PixelLab integrates with fuller pixel editors. | Keep mapped external finishing as an escape hatch while making small in-context edits easy. | Do not duplicate a general pixel editor simply because its code exists. |
| [PixelLab skeleton guide](https://www.pixellab.ai/docs/tools/animate-with-skeleton) | Estimated skeletons can need manual touchups; frame-by-frame correction is part of its workflow. | Joint correction/rescue addresses a real model limitation. | This guide includes older template/freeze workflows; it does not authorize forbidden legacy endpoints. |
| [REST OpenAPI](https://api.pixellab.ai/v2/openapi.json), [local snapshot](../../research/pixellab/pixellab-openapi-v2.json) | Skeleton-v3 specifies 18 joints per frame and 3–15 requested poses from a reference. | Separate free pose drafting, actual submitted batch and selected candidate replacement. | Minimum-three padding is request plumbing, not proof of seamless one-frame repair. Snapshot/version/date and current prices need rechecking before a later paid spike. |

These sources support interaction patterns and service constraints. The product workflow and prioritization are team inferences. They do not establish demand, usability, runtime performance or model output quality.

## Options challenged

| Option | Strongest argument for it | Why we did not choose it |
| --- | --- | --- |
| Keep only accept/reroll | Smallest UI and existing automation flow. | No precise correction of good-but-imperfect output; can spend to replace many already-good frames. |
| External editors only | Mature drawing/rigging tools with minimal in-app maintenance. | Mapping/recovery friction and loss of paperdoll context for a one-pixel fix; current backup import is not replacement import. |
| Three separate repair tools/screens | Each can have a tailored interface. | Fragmented selection/history/save and repeated navigation for one body/wrist/sword repair. |
| Mandatory guided wizard | Easy to introduce a novice to one issue. | Users must classify failures and repeat steps across frames; a wizard obstructs iterative multi-target work. Use contextual hints in the one editor instead. |
| Equipment-only final editor | Lowest fitting risk. | Fails the expanded user requirement to modify character frames. Body safety must be built into saving, not used to exclude the body permanently. |
| Full embedded illustration/animation app | Maximum feature breadth. | Adds arbitrary layer graphs, brushes, effects, mesh weights and timeline authoring that do not serve the immediate paperdoll tasks. |
| Automatically deform pixels from joints | Feels immediate and powerful. | Requires segmentation/weights or resampling not present in the raster model; can destroy pixel structure and misrepresent output control. |
| Unified document editor | One context, precise small tools, safe body/item edits and future candidate review. | Requires honest data/fit/history work. Chosen because those requirements are necessary even for a smaller safe editor. |

## Specific arguments resolved

1. **Whole character should include all alternatives.** Initial peer suggestions included moving equipped/selected gear only. The final command covers all compatible stored alternatives at chosen cells, including hidden/unequipped items, with a frozen visible membership set. Otherwise later wardrobe swaps break alignment. Body-only remains available.
2. **Body edits do not force paid regeneration.** Save can retain affected gear as Needs fitting review. Manual repair and Reviewed compatible are valid local outcomes. Structural failures cannot be waived. Export initially excludes unresolved items as a whole rather than inventing partial compatibility.
3. **Power comes from coordinated operations, not a large toolbox.** Body pixels, sword movement and joint correction share one draft and Undo sequence. A small toolset can address several related failures without nested workflows.
4. **Draft autosave is not project publication.** It protects work without leaking unreviewed body pixels into generation/export. Explicit Save and Done are sufficient; no extra Apply stage.
5. **Detected joints and desired poses need labels.** They share an overlay but represent different records. Drafting a pose never pretends to move existing pixels or silently spends credits.
6. **Palette restrictions must be honest.** Existing exact source shades, including unassigned outline colors, are supported first. Custom fixed colors require an ownership representation, particularly when their RGB collides with a recolor ramp; the extension is planned, not silently approximated.
7. **Current fixes count.** Structural acceptance guards, replacement-move invalidation and atomic item publication already exist. The plan extends them with editor-specific revisions rather than repeating old bug lists or replacing the queue.

## Completed read-only investigation spikes

These were completed in this planning round. They are source/document investigations, not runtime prototypes or paid output experiments.

| ID | Investigation | Evidence inspected | Result and limit |
| --- | --- | --- | --- |
| R1 | Can one screen fit the app? | `app/src/App.svelte`; `studio/Studio.svelte`; `studio/experience/state.svelte.ts`; immersive appearance/navigation docs. | A dedicated app-owned screen is appropriate; production routing currently renders Studio for all non-dev routes. Implementation must introduce editor screen/history handling deliberately and suspend world shortcuts. No new app/service is needed. |
| R2 | Are save/revision foundations reusable? | `store/project.ts`, `db.ts`, `equipment/copy.ts`, `items/run.ts`, `studio/replaceMove.ts`. | Atomic publication, stamps, explicit color-repair history and invalidation exist. Draft history, body-cell review and all-writer integration still need design/implementation. No storage behavior was executed here. |
| R3 | Do current archives preserve proposed editor state? | `store/import.ts`, `loadProject`, GC traversal and `ImportedCharacter.extra`. | Fields and image families are explicit; new hash strings alone are insufficient for loading/export. Plan an archive migration spike. |
| R4 | Can service guidance promise one-frame pose redraw? | `AnimateWithSkeletonV3Request` and its `keypoints` description in local snapshot; current official skeleton guide. | Local schema inspection confirms 18 joints and 3–15 poses. Paid quality and current pricing were not revalidated; legacy UI examples are not the REST v3 contract. |
| R5 | Is the interaction recommendation shared? | Independent peer documents, canonical proposal and challenge rounds. | Agreement must reference the final package in [consensus.md](consensus.md). It is design review evidence, not casual-user usability evidence. |

Existing [repair concept source](../../reviews/frame-repair-mockup.html) and its dated verification remain useful interaction evidence for nudges, erasing and guide-only dragging. That concept edits only an illustrative equipment layer and wrist and lacks the complete body/save contract. It is not the new standalone editor prototype and must not be relabeled as one.

## Planned offline spikes before implementation commitment

All following spikes are **not run** by this planning task. They may use fixtures/synthetic data, no live token or model calls, and produce isolated evidence rather than permanent application features. Their results refine implementation details without reopening the agreed core body/item requirement.

### S1 — One-screen task prototype

Build an isolated interaction prototype using stored frames, matching the app's current appearance. Demonstrate one session that edits body + sword + detected wrist, switches frames, undoes, reviews fitting impact, saves locally and returns to the originating outfit. Include Whole character membership, source/as-worn view, phone layout and a conflict/error state.

Compare against the earlier repair concept and external finishing flow. Run mouse, keyboard and browser-emulated touch tasks. A proposed small moderated trial uses five casual character-creator users: at least four should finish the basic item/body repair without coaching, and all must correctly identify target/scope and understand that joint dragging does not redraw pixels. Record baseline/task times and failures; do not claim statistical generality or invent time-savings percentages. A failed safety-understanding task blocks release and prompts a UI revision.

### S2 — Coordinates, mirrors and group alignment

Synthetic/fixture matrix: 32/64/96/256 px cells/layers, unequal valid pivots, repeated playlist cells, shared image hashes, sparse directions, intentionally transparent versus missing cells, source/mirror simultaneous selection and an unequipped alternative at the edge.

Pass when operations target actual cells once, pivot conversions round-trip, source translation reflects `dx`, any edge loss rejects the whole group, metadata transforms are coherent and non-target bytes remain identical. Record one blocking-item example to verify the error message. Profile a realistic large wardrobe: pending-transform rendering during drag, one encode/hash batch per completed operation; define a measured performance budget before release rather than adding a framework pre-emptively.

### S3 — Draft, revision and portable recovery

Exercise body/item/joint draft changes, autosave failure, Save, Undo after Save, second-tab edits, late generation, a deleted target, no-op save, draft identity, reload, GC and editable ZIP recovery. Prototype the smallest versioned project-envelope change; check old/new reader behavior and allocation limits.

Pass when accepted state is never partially published, conflicts preserve the draft, originals/history stay reachable and loaded/exported, and Undo after Save creates a dirty draft. Keep export accepted-only versus recovery-draft behavior explicit. Choose and document bounded history limits from measured storage impact.

### S4 — Body fitting and generation readiness

Cases: known RGB role mapping, unrestricted RGB stroke, alpha erasure, body-only translation, body-region movement, lossless all-wardrobe translation, edited reference, missing estimates and repaired gear in the same draft. Include an already-stale item and a newly added alternative during the session.

Pass when fitting statuses reflect only proven or reviewed relationships, no legacy stale item is promoted, unresolved items remain visible for review and excluded explicitly from export, and raster editing/export can succeed while rig generation remains unavailable. Verify all candidate publishers reject stale input stamps.

### S5 — Source color and overlap

Cases: B15 Shirt/Shorts encoding, skin pixels, fixed existing outline colors, two source roles with the same preview RGB, linked materials, imported partial alpha, logical fg/bg movement, front/back transfer, hair-tuck preview and a missing pre-cleanup stage.

Pass when source identity/recolors survive Save/reload/export, pixel transfer preserves its defined union, outfit-only clipping does not alter shared art and Restore never fabricates unavailable pixels. Investigate optional custom fixed-color ownership with ramp-RGB collisions; if it needs masks, define the minimum representation before offering arbitrary RGB. Pair-specific masks remain deferred until every exporter reproduces them.

## Later paid spike, outside this planning task

S6 would compare selected-frame and full-clip candidate repair using allowed v3/editing routes. Recheck current API contracts/tier/cost first. State the exact request budget and stop condition; preserve unknown outcomes and never auto-resend. Test repeated-pose versus neighboring-context batches, reference calibration, identity, temporal seams, unaffected-byte preservation and stale candidate acceptance.

This review does not authorize or perform that spend. When a later implementation task requires generation, its scope must justify the calls under the repository rules. If selective pose quality is unreliable, ship honest full-clip candidate comparison in the same editor and retain precise local pixel tools; do not claim continuity from valid batching alone.

## Research boundaries

No runtime/library reuse from Spine, Aseprite, Spriter or DragonBones is required. Their availability or license does not justify adding an animation engine. Keep implementation original and independently review any future third-party reuse. The editor remains client-only and inherits the intentional shared-origin credential policy without adding token channels, encryption or another unlock flow.

No source, schema, game-engine export or UI behavior is implemented by this package. Planned gates become verified evidence only after commands/artifacts/results are recorded for the actual implementation snapshot.
