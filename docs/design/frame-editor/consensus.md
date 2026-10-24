# Frame Editor: agreement and decision record

Date: 2026-10-23. Status: agreed planning direction; not implemented. User scope: a separate standalone-feeling editor embedded inside PixelDoll, supporting body/character and item frames, alignment, pixel drawing/erasing, joints, saving and return. This task covers brainstorming, research/spike planning, documentation and a scoped commit only.

## Participants and evidence of agreement

| Participant | Independent contribution | Final position |
| --- | --- | --- |
| Review paper doll skeleton editing — coordinating chat | Prior skeleton/pipeline research, canonical synthesis, current-source checks, primary-source research and package review. | AGREE with the canonical product, data, research and delivery contracts. |
| Evaluate pixel editing scope — existing chat | [Peer pixel-scope review](peer-pixel-scope-review.md); initial position, canonical README review, five concrete data/integration objections, final package agreement and ownership addendum. | Explicit AGREE after reviewing all four canonical documents and resolving material objections. |
| Unified editor challenger — independent sub-agent | [Peer editor challenge](peer-editor-challenge.md); independent mental model/current-code challenge, group-scope debate, final four-document signoff and ownership addendum. | Explicit AGREE; no remaining substantive planning blocker. |

The coordinator explicitly consulted the named existing chat at the user's request and used another sub-agent. Participants wrote independently before reviewing the common draft. This record does not infer agreement merely from parallel document creation. Their owned reports preserve the objections and superseding final signoffs.

The agreed canonical package is [product/UX](README.md), [data and safety](data-and-safety.md), [research/spikes](research-and-spikes.md) and [delivery plan](delivery-plan.md). This record summarizes their decisions; their detailed contracts remain authoritative for implementation planning.

## What changed through the debate

| Question or objection | Resolution | Reason |
| --- | --- | --- |
| Should body art remain permanently locked? | No. Both body and equipment editing are required in the first coherent local editor; safety is revision/impact review. | Equipment-only would fail the user's expanded requirement. |
| Separate repair modes or one tool? | One full editor screen, one document/draft/history, visible target/frame/scope and Move/Draw/Erase/Joints. | A wrist, body pixel and sword often need correction together. Repeating a wizard fragments that work. |
| What does Whole character move? | Body plus all compatible stored wardrobe alternatives in chosen cells, not only equipped parts; membership visible and stamped. | Outfit-dependent alignment would break hidden alternatives on later swaps. Body-only and item-local moves remain separate. |
| Allow clipping to complete a group move? | Reject any member's nontransparent edge loss; name blocking item/frame and allow a smaller move or narrower target. | No partial group success, hidden crop or pivot hack. |
| Can a generic all-frames scope apply every brush stroke? | No. Painting is one active cell; broad transforms/copy operations require explicit selection and preview. | Repeated pixel coordinates do not represent the same anatomy in another pose. |
| What happens to edited body and old gear? | Preserve old pixels, record review, allow same-draft repair or Reviewed compatible; unfinished work can Save without paid regeneration. | Hash relabelling is not proof of fitting; deleting old art destroys useful work. |
| Can first release export safe portions of an unresolved item? | Conservatively exclude the whole unresolved item until review is complete; retain unaffected cells for editing/inspection. | Today's coarse compatibility model does not establish fine partial export. |
| Would export exclusion lose portable work? | Two projections: coherent filtered engine output, full accepted editable project/history including unfinished gear. | Runtime safety and editable backup have different purposes. Neither may contain dangling references or silently drop unfinished assets. |
| How should unresolved gear look after returning? | Suppress affected unreviewed cells in ordinary preview with an actionable note; retain selection/card. Editor WIP comparison exposes the retained art explicitly. | Avoid presenting uncertain overlap as verified or hiding the reason for its absence. |
| Does joint dragging move pixels? | Detected corrections and pose drafts are free metadata operations with distinct labels. Only explicit candidate generation can redraw. | PixelDoll has a conditioning skeleton, not weighted raster mesh deformation. |
| Are custom RGB/IK essential initially? | Existing source colours, including fixed outline shades and region-aware body writes, ship first. New colour ownership and optional IK are qualified extensions. | Preserve exact ramps/B15 and simple controls without pretending unrestricted RGB can be mapped safely. |
| What does autosave mean? | Recoverable working draft only; explicit Save publishes. Undo after Save creates a dirty draft; Done/Back protect unpublished work. | Prevent accidental publication and misleading Saved labels. |
| What about mirrors, new items and other tabs? | Reflected translation algebra, unique source resolution, full-row independence, transaction-time membership/read/write checks and session draft IDs. | A naive per-cell loop or entry stamp misses double transforms, phantom additions and stale writers. |
| Are old audit defects still release blockers? | Reuse current structural guards, atomic item publication and replacement-move invalidation; do not repeat them as unfixed. | Earlier reports describe their original snapshot. |
| Does candidate Save accept generated content? | No. Candidate-owned editing returns to the original Keep/finish flow with structural guards. | The editor cannot become a bypass for generation review or trigger successful paid work again. |
| Do fitted-copy edits change the reusable library? | No. They change that local character item; immutable snapshots/lineage remain. A new reusable design is explicit. | Prevent surprising changes to other characters and source assets. |

## Agreed implementation boundary

The core release is an embedded **Frame Editor**, not merely a renamed inspector or several modal tools. It includes body/item local pixel editing, safe alignment and direct detected-joint correction, shared filmstrip/context and durable Save/return. It uses existing TypeScript/Svelte/custom app appearance, IndexedDB, content-addressed images and transactional/candidate infrastructure.

The delivery order is offline UX/data spikes → revisions/recovery/archive foundation → screen/context → body/item local tools → joint/fitting integration → coherent local release. Optional mapped replacements, custom-colour ownership, finer masks/partial export and explicitly paid pose candidates extend that same editor later. Body editing is not permanently deferred, and paid quality limitations do not remove free local controls.

No backend, GlassKit, new animation engine, full illustration suite, mesh weighting, arbitrary rig topology or automatic all-direction propagation is needed. The agreed credential policy remains unchanged. The editor never spends while drawing/dragging or automatically resends a paid request.

## What is settled versus still to learn

Settled: product boundary, one-screen mental model, target/tool/scope, body inclusion, movement semantics, accepted-versus-draft state, fit review, initial export policy, source identity, candidate ownership and dependency/concurrency safeguards.

Still to learn through the planned S1–S6 investigations: precise responsive arrangement and novice task success, large-wardrobe interaction/storage costs, bounded history limits, exact archive migration representation, optional fixed-colour ownership, pair-specific masks, and paid pose temporal/identity quality. Those are explicit experimental gates. They are not hidden disagreements about whether the editor should support the body or whether dragging a skeleton redraws art.

All implementation/spike checkboxes remain unstarted. Documentation/source investigations performed in this round are identified separately in the research record. Neither design consensus nor the historical mock-up establishes production usability, engine parity or live-model quality.

## Verification and commit boundary

The coordinator checks local documentation links, Markdown fence/whitespace consistency, agreement records and the staged path list. Current task changes are the planning package plus narrow PLAN/TODO/review-index links. No application code, dependency, token, paid request, production build, deployment or release belongs in this commit. The shared checkout contains unrelated ongoing experience/UI work; it must remain unstaged and uncommitted by this task.

No unrelated application test suite needs rerunning for a documentation-only change. The future implementation must use the required pinned toolchain and its acceptance matrix before making any implementation claim.
