# PixelDoll research and improvement cycle

Improve PixelDoll's paper-doll output and the complete workflow that produces it. Research existing and emerging methods, challenge the current implementation, and deliver verified improvements to generation quality, preprocessing, postprocessing, frame alignment, animation, equipment ownership, composition, user experience, reliability, speed, and cost. Preserve the core result: swappable transparent equipment that fits a frozen character across its supported frames and directions.

Coordinate subagents to review all relevant repository research, conduct extensive recursive online discovery, acquire and test source code and applications locally, and compare their mechanisms against the full application. Throughout the cycle, challenge both the researched source material and PixelDoll's entire implementation, functionality, design, and user workflows within the improvement scope. After the research, work with a fresh independent reviewer to question both sides and test competing approaches. Implement qualified changes, test deterministic behavior and live PixelLab generation through Agent mode, review failures, and repeat the research, implementation, and verification loop. Document reproducible findings and commit every coherent change you make.

**PixelLab generation spending has no budget limit for this process.** Use as many justified experiments and agent waves as needed to resolve substantive questions. Track actual charges and retain all results. Uncapped spending does not justify redundant requests, automatic resubmission of uncertain paid jobs, or bypassing enforced approvals.

Work autonomously. Resolve routine technical questions with the research team, source evidence, and controlled experiments. Continue independent work when one source or prerequisite is unavailable. Do not stop at a short survey, an initial set of spikes, or a successful example. Seek meaningful improvements rather than manufacturing changes to satisfy a quota; reject failed hypotheses and pursue the next substantive opportunity.

When the current user message contains only this document's repository URL or link, execute the complete process without requiring an additional invocation phrase or previous conversation. A request to run this document has the same effect. If the user instead requests an edit, explanation, or review of this document, or supplies it as context for another task, perform only that requested work. Follow current user instructions and applicable repository and platform requirements. Use the tools actually available in the execution environment; do not assume particular agent APIs, credentials, open tabs, or session memory.

## 1. Locate the repository and establish the starting point

Identify the containing repository and document location from the supplied repository URL, file attachment, or existing workspace. For a URL, derive the repository, requested branch or revision, and document path from its origin. Reuse a matching writable checkout without discarding local changes, or obtain a legitimate checkout in an appropriate workspace if none exists. Verify repository identity before editing; do not confuse a downloaded comparison project with PixelDoll. If only pasted text is available, locate the existing PixelDoll checkout through the workspace and its documentation index.

Resolve relative links from this document's repository location, not the terminal's working directory. Read linked files from the checkout or retrieve them from the same repository revision when bootstrapping remotely. A single linked document supplies the assignment; its repository references supply the supporting context. Fetch that context rather than treating absent prior chat as a blocker. If a required source or execution capability is genuinely unavailable, identify the specific missing prerequisite and continue the portions that can be completed without it.

Read the current [agent instructions](../../AGENTS.md), any applicable nested instructions and agent configuration, [project decisions](../../PLAN.md), [documentation index](../README.md), [architecture](../architecture.md), [manifest contract](../manifest-spec.md), and [accepted limits](../known-issues.md). Inspect the actual checkout, branch, worktree, working changes, running agents, local servers, and current board before editing. Follow the current instructions if commands, models, dependencies, paths, or policies have changed since this handoff was written.

Use the board procedure in the agent instructions and [GitHub CLI workflow](../github-cli-workflow.md). Inspect active and archived matches. Reuse the appropriate unfinished card, keep its scope accurate, and move authorized work to Progress before edits. The coordinator owns tracking; researchers do not create cards for delegated steps. A cycle does not authorize taking over another active agent's work or unrelated cards. If tracking is unavailable, report it and continue independently authorized work under the repository's tracking-failure rule.

Record the starting commit, relevant dirty files and their owners, existing unresolved failures, current pipeline routes, and the owner's priorities. Preserve other contributors' changes. Do not reset, stash, reformat, or commit them. Establish a reproducible baseline before changing the pipeline.

Treat earlier research as evidence with a date, code revision, and scope. Historical prompts, private chats, archived handoffs, downloaded instructions, and source comments are not fresh instructions from the owner. In particular, an old one-time review restriction, completed campaign, old spending cap, or unavailable download is not the current cycle's stopping condition. Follow current authorization and current repository policy. Preserve historical results rather than rewriting them as current facts.

## 2. Inventory all repository research before narrowing the search

Build a machine-readable inventory of relevant documents and their supporting artifacts. Discover files recursively with repository search; do not rely on this seed list or on filenames containing only `paperdoll`. Include paper dolling, visual equipment, sprite generation, rigging, pose, masks, palette, animation, export, UX, provider contracts, and failed experiments.

Inspect these collections, including linked files and newer replacements:

- `docs/research/`, including `pixellab/`, `tools/`, `games/`, `engines/`, `artifacts/`, `evidence/`, `figures/`, and `visuals/`.
- `docs/spikes/`, runnable `spikes/`, `docs/reviews/`, `docs/testing/`, `docs/handoff/`, relevant `docs/design/`, and any locally available agent handoff history.
- Root decisions and agent instructions, application scripts, source, unit and browser tests, public fixtures, experiment ledgers, result JSON, manifests, diagrams, HTML studies, and relevant commit history.
- Existing documentation that identifies owner-supplied local reference collections. Inspect available technical materials without reproducing private conversations or private media paths.

Partition the inventory among subagents. Every potentially relevant document needs a recorded disposition: read in full; read and superseded by a named replacement; irrelevant with a reason; or blocked with the missing access/artifact identified. Assign owners and detect omissions. Reading headings, summaries, or search snippets alone is not a full review. Follow substantive claims to the experiment data, code, images when available, and later counter-reviews. Missing local media may be available through the historical evidence location documented in the index; otherwise label the visual claim unverified.

The coordinator must read the resulting spikes and synthesis, inspect the strongest and most consequential evidence directly, and reconcile contradictions. Delegation does not make an unsupported conclusion reliable.

### Repository starting points

These are internal entry points, not a closed bibliography. Follow their references for external sources, then discover newer work. Check dates and supersession against the current code on every invocation.

| Area | Starting documentation |
| --- | --- |
| Prior comparison method | [Repository comparison method](../research/paperdoll-repos-review-2026-10-27.md), [tool review](../research/tool-review-2026-11-06.md) |
| End-to-end generation findings | [Deep quality review](../research/deep-paperdoll-review-2026-11-06.md), [pipeline review](../research/generation-pipeline-review-2026-10-25.md), [quality campaign](../research/generation-quality-campaign-2026-10-25.md), [follow-up campaign](../research/generation-quality-round2-2026-10-25.md) and their later rounds |
| PixelLab capabilities and policy | [Provider review](../research/deep-paperdoll-provider-2026-11-06.md), [local API documentation index](../research/pixellab/README.md), [plan policy research](../pixellab-plans.md) |
| External generation and wardrobe tools | [Generation spike](../research/tool-spikes-2026-11-06-generation.md), [tool survey](../research/tools/paperdoll_tools_survey.md), [Python integration review](../research/tools/pixellab_pip/pixellab_pip_paperdolling_review.md) |
| Chroma, extraction, and conditioning | [Chroma and occlusion spike](../research/tool-spikes-2026-11-06-chroma-and-occlusion.md), [conditioning experiments](../research/deep-paperdoll-conditioning-2026-11-06.md), [clean-layer feasibility](../spikes/S2_clean_layers.md) |
| Geometry, composition, and equipment ownership | [Geometry research](../research/deep-paperdoll-geometry-2026-11-06.md), [layering spike](../research/tool-spikes-2026-11-06-layering.md), [ownership follow-up](../research/deep-paperdoll-ownership-followup-2026-11-06.md), [modern ownership sources](../research/deep-paperdoll-modern-ownership-sources-2026-11-06.md) |
| Modern AI and sprite processing | [Vision and temporal research](../research/deep-paperdoll-vision-2026-11-06.md), [modern sprite sources](../research/deep-paperdoll-modern-sprite-sources-2026-11-06.md) |
| Native application comparisons | [Native tool experiments](../research/deep-paperdoll-native-followup-2026-11-06.md), [LPC generator review](../research/tools/lpc/lpc_generator_review.md), [Fralonra review](../research/tools/fralonra/fralonra_paperdoll_review.md) |
| Games and runtime visual equipment | [Game survey](../research/games/games_paperdolling_survey.md), [verified Ultima paper-doll research](../research/games/ultima_online/ultima_online_paperdolling_verification.md) and the engine research directory |
| Equipment designs, fitted copies, and compatibility | [Shared equipment and fitted-copy plan](../research/shared-equipment-fitted-copies-plan.md), [shared-equipment verification](../testing/shared-equipment-2026-10-22.md) |
| Interactive correction and authoring | [Frame-editor research and spikes](../design/frame-editor/research-and-spikes.md), [frame-editor consensus](../design/frame-editor/consensus.md); distinguish research proposals from approved product scope |
| Motion, skeletons, and held items | [Motion spike](../research/tool-spikes-2026-11-06-motion.md), [rig feasibility](../spikes/S3_skeleton_rigging.md), [held-item feasibility](../spikes/S5_held_items.md), [custom skeleton work](../research/2026-11-01-custom-skeleton-v3.md), [animation closeout](../research/2026-11-02-animation-closeout.md) and their linked authoring, grip, and engine experiments |
| Paid comparisons and counterfactuals | [Matched live trials](../research/deep-paperdoll-live-trials-2026-11-06.md), [target-palette trials and offline controls](../research/deep-paperdoll-target-palette-2026-11-06.md) |
| Independent review history | [Reviews index](../reviews/README.md), [joint counter-review](../reviews/2026-11-02-joint-counter-review-and-fixes.md), [complete-session challenge](../reviews/2026-11-02-complete-session-counter-review.md), [final motion review](../reviews/2026-11-02-final-motion-review.md) |
| Product and design | [Production experience ownership](../design/production-experience.md), [usability principles](../usability-principles.md), current design decisions and relevant design research linked from the documentation index |
| Live testing and credentials | [Agent token contract](agent-dev-token-handling.md), [shared token handling](../shared-token-security.md), [test performance guidance](../testing/test-performance.md) |

Do not confuse the unrelated Android PixelLab text editor with the PixelLab AI service. Prefer verified corrections over earlier game/tool descriptions that were later disproved. Read historical one-time handoffs as review history, not as the operating protocol for this reusable cycle.

## 3. Organize a research team and an independent challenge team

Use as many agent waves as the work requires, within actual concurrency and tool limits. Group related sources so each researcher can compare mechanisms deeply. Do a brief source triage before assigning the heavy work. Avoid assigning the same broad task to everyone.

Start with distinct responsibilities, splitting or combining them according to the repository and current gaps:

1. **Provider and generation:** current PixelLab REST/MCP contracts, routing, reference conditioning, prompts, palettes, job behavior, cost, reproducibility, and provider limitations.
2. **Extraction and ownership:** chroma preprocessing, masking, registration, body cuts, occlusion, hair passes, compositing, material and dye ownership, pixel-level QA.
3. **Motion and equipment geometry:** skeleton creation/estimation, pose authoring, retargeting, frame timing, contacts, directional consistency, weapon grip and padding, imported motion, 3D-to-pixel methods.
4. **External ecosystems and modern AI:** source repositories, games, generators, editors, virtual try-on, segmentation, temporal correspondence, asset/export contracts, and native tool execution. Split into focused clusters as discovery grows.
5. **Product and implementation mapping:** full production call chains, user workflows, queue/storage/recovery, exports, performance, accessibility, simplicity, and the gap between research prototypes and ordinary user behavior.

Each assignment must identify its source group, research questions, required local experiments, application areas to inspect, evidence standard, and output file ownership. Researchers must know they share a checkout and must not undo others' changes. The coordinator manages integration and board status. Give concurrent browser suites separate ports and output directories under current testing instructions.

When the research spikes are ready, start a **fresh independent reviewer** who did not author their conclusions. The coordinator and reviewer must read all spikes and independently challenge both the outside material and PixelDoll's entire relevant source tree, functionality, architecture, design, and user experience. Review the existing application as critically as proposed changes, including assumptions and behaviors that its current tests accept. Debate disagreements through specific evidence and reproductions. Bring in another specialist when a disagreement crosses domains. An agent agreeing with another agent is not validation.

Require the independent reviewer to look for missing sources, incorrect causal claims, source/license mistakes, favorable-case selection, unsafe extraction, mismatched controls, ineffective metrics, product regressions, and code paths that never use the proposed mechanism. Re-review the implemented result after testing. Stop completed agents or reuse them for explicit follow-ups; do not leave idle research agents running. Close unused task browser tabs while keeping the working localhost application tab open for iteration.

## 4. Search the wider ecosystem systematically and recursively

Online research is a major part of every cycle, not a few searches to confirm existing ideas. Use current web search and available connected tools. Expand beyond the links already collected. Search both current developments and older mechanisms that solve problems modern generators still have.

Maintain a query and coverage log with search date, query family, channel, useful results, excluded duplicates, and remaining gaps. Search multiple terminology families:

- Paper doll, paperdoll, visual equipment, equipment sprites, modular character, layered sprite, dress-up, wardrobe, character generator, avatar customization, armor overlays, and equipment animation.
- Pixel-art sprite-sheet editing, animation retargeting, reference-guided generation, image editing, outfit transfer, inpainting, multi-view and temporal consistency, pose conditioning, and palette conditioning.
- Chroma key, semantic masks, trimaps, matting, amodal segmentation, occlusion ownership, depth ordering, foreground/background hair, alpha fringes, outlines, and tiny-part preservation.
- Pixel correspondence, optical flow, dense matching, landmark constraints, contact-aware motion, foot sliding, hand-object contact, rigging, 3D-to-2D projection, and per-pixel depth.
- Virtual try-on, garment identity, human identity preservation, accessory transfer, disentangled materials, recoloring, uncertainty, and model evaluation.
- Engine-specific equipment renderers, sprite formats, runtime attachments, layer ordering, pivots, animation timing, palette swaps, and authoring/export integrations.
- Equip regions, coverage masks, hide rules, skin placeholders, attachment substitution, reusable designs versus fitted instances, and body/rig compatibility signatures.
- Constrained covering arrays, pairwise and higher-order interaction testing, metamorphic testing, equivariance, and idempotence.
- Digital topology, 4/8-connectivity, pixel clusters, negative space, topology-preserving morphology, RotSprite, texel centers, pixel-grid phase, atlas extrusion, texture bleeding, premultiplied alpha, and color-space conversion.
- Material-ID maps, indexed sprites, palette lookup tables, semantic recoloring, palette-index preservation, and protected material boundaries.
- Interactive segmentation, corrective clicks and scribbles, selective prediction, risk versus coverage, confidence calibration, correction propagation, and time to an acceptable result.

Assign a researcher to challenge the search vocabulary and coverage map themselves. Search adjacent terminology used by game engines, sprite formats, graphics research, artist workflows, and newer AI systems; follow mechanisms and citation/code links absent from this list. Record newly discovered terms, why they matter, and investigated or rejected leads in the cycle index so later runs expand the taxonomy rather than merely repeat it.

Search official documentation, repositories and forks, source indexes, release notes, issues and discussions, primary papers and accompanying code, game technical writeups, creator devlogs, app marketplaces, playable demos, native tools, workflow repositories, and videos with descriptions/transcripts. Follow citations, project dependencies, implementation references, competing approaches, and linked failures. Search for the exact failure mechanisms found in PixelDoll, not just the generic product category.

For technical claims, prioritize primary sources and inspect actual implementation. A marketing page, screenshot, generated showcase, or paper abstract establishes a lead, not proven transferability. Record contradictions and failed reproductions. Check whether a newly popular technique helps low-resolution pixel art, arbitrary equipment swaps, client-side operation, and the allowed PixelLab routes rather than only high-resolution portraits or fixed composited outfits.

Map coverage across the following dimensions and open further agent waves for weak areas:

| Dimension | Questions to challenge |
| --- | --- |
| Frozen base and rig | Are body identity, frame registration, proportions, facing, keypoints, pose timing, and contacts preserved? |
| Conditioning and generation | Which input bitmap, reference, mask, palette, prompt, and allowed route best preserves item identity and motion? |
| Preprocessing | Does key selection, luminance normalization, quantization, packing, padding, or cropping destroy useful evidence? |
| Extraction | Which pixels are gear, body, skin shading, contact shadows, unchanged source, or uncertainty? Can the method abstain? |
| Layer semantics | Do hair, capes, shields, weapons, hands, and clothing require front/back passes, body cuts, or per-frame visibility? |
| Item interactions | Do arbitrary combinations work, including removing an occluder, swapping a body palette, and changing item order? |
| Compatibility and fitted assets | Which coverage, substitution, hide, body, and rig rules make an item usable? Is a reusable visual design being mistaken for pixels already fitted to another character? |
| Postprocessing | Are outline, alpha, motif, highlight, palette ramps, tiny parts, and intentional asymmetry preserved? |
| Pixel structure and rendering | Are intentional connections, holes, gaps, and clusters preserved? Can decoded-pixel damage be distinguished from browser or engine sampling, alpha, compression, and color-space differences? |
| Animation | Does equipment stay coherent through turns, action extremes, holds, loops, reordered playback, and all stored frames? |
| Runtime/export | Are pivots, padding, trim bounds, material ownership, cut composition, timing, and manifests correct in real consumers? |
| User workflow | Can an ordinary user create, dress, inspect, repair, recolor, recover, and export with clear feedback and few decisions? |
| Operational behavior | Are costs, retries, receipts, persistence, cancellation, caching, concurrency, memory, and progress truthful and robust? |

There is no predetermined source-count target. Continue discovery while it yields materially different mechanisms, unresolved contradictions, or untested high-value leads. Document saturation by topic and search approach. Never claim to have read the entire internet or tested every possible output.

Develop original hypotheses as well as adaptations of existing tools. Investigate combinations such as geometry-guided AI conditioning, explicit ownership uncertainty, multiple reference views, separate conditioning and approved-art representations, or selective repair constrained by trusted pixels. Test whether these mechanisms solve failures that simpler baselines cannot. Keep experiments within current model and infrastructure policy, and require evidence before adding complexity or changing a default.

## 5. Acquire and test relevant materials locally

Download and inspect relevant feasible projects, source code, tools, apps, workflows, samples, documentation, and evaluation assets. Do not stop at browsing a project landing page when runnable or readable materials are available. Reuse existing local acquisitions only after verifying their version and provenance.

Create an ignored temporary source workspace, verify its ignore status before downloading, and keep it outside production source and tracked evidence. Prefer official repositories, official releases, and legitimate freely available builds. Pin repository commits; record release versions, file hashes, licenses, dependencies, platform requirements, source locations, and acquisition dates. Do not add vendor source trees, installers, private media, or model weights to Git by accident.

Inspect acquired code's installation and build hooks before execution. Use available execution isolation to prevent third-party programs from reading PixelDoll credentials, private assets, or unrelated data. Do not pass secrets to these programs or weaken platform restrictions to run them. If safe native execution is unavailable, record it as blocked and continue with source analysis.

For each source, distinguish:

- Description read; source read; representative algorithm replayed locally; project built; official app run; export created; native output independently checked.
- Provider-supplied samples versus assets generated in your own controlled test.
- A public metadata page versus the actual downloadable workflow, graph, checkpoint, or project archive.
- A browser demonstration versus a native application and its exported layer files.

Run the actual tools and inspect their inputs, intermediate layers, outputs, exports, and failure cases when feasible. Compare the same task to PixelDoll. If a source cannot be installed or run, inspect its source and samples and label precisely what remains untested. Never describe a reimplementation of an algorithm as execution of the original app.

Resolve routine setup issues autonomously with subagents. Follow legitimate access and license requirements. Do not circumvent authentication, payment, download restrictions, security review, or licensing. An inaccessible source should not stop unrelated research. Record the blocker and pursue other mechanisms. Unlimited PixelLab experiment authorization does not authorize unrelated purchases, recurring subscriptions, account changes, or redistribution of third-party assets.

Use owner-supplied private material only to extract nonsensitive technical mechanisms. Do not save private-chat quotations, identities, private attachments, image references, image filenames, or private media paths in research reports. Do not upload private assets to a provider without authorization. Prefer public or synthetic fixtures for retained and shared experiments.

## 6. Reconcile PixelLab documentation with live capabilities

Read the complete relevant local PixelLab research and vendored schemas through the [API documentation index](../research/pixellab/README.md), then check current official API documentation and available live MCP discovery. Discover the actual tools exposed in this environment. Do not assume REST and MCP tools have identical capabilities, limits, pricing, or model names.

Record relevant schema drift: required fields, accepted sizes, frame counts, seeds, directions, reference semantics, masks, palettes, skeleton coordinate conventions, output cardinality, asynchronous jobs, errors, cost estimation, subscription accounting, and model availability. Verify provider statements against current request builders and observed receipts. Distinguish a supported parameter from evidence that it improves output.

Read the current allowed-model and client-only policies before any endpoint call. New provider capabilities are research leads, not permission to bypass those policies. Study outside models for transferable methods; qualify changes through the permitted PixelLab pipeline unless the owner explicitly authorizes a policy change. Never add a backend or quietly route production through a third-party generation service.

Trace the current implementation from user intention to persisted export: configuration, quotes, queue, frozen inputs, request signatures, provider adapters, polling, raw storage, decoding, registration, extraction, gates, publication, review/repair, dye, composition, and engine export. Include alternative routes and failure recovery. A prototype only qualifies as an application improvement when the ordinary production path uses it correctly.

## 7. Write research spikes with reproducible evidence

Create a uniquely named cycle directory under `docs/research/`, based on the actual run date and an unambiguous suffix if needed. Keep an index and durable resumption note. Store text, small structured results, and reproducible scripts according to repository policy; keep large generated media and downloaded projects in ignored locations with content hashes. Do not invent portable links to files that only exist on one machine.

Maintain these artifacts, combining files where that improves clarity:

1. Scope, starting revision, current constraints, document inventory, source registry, and search coverage log.
2. Research spikes grouped by mechanisms, each with its local acquisition and execution status.
3. A production code map and a gap matrix linking observations to actual callers and current coverage.
4. Experiment plans, immutable input identities, outputs, evaluation results, failures, and a deduplicated billing ledger.
5. Synthesis, independent challenge findings, accepted/rejected/deferred decisions, implementation evidence, verification, and resumption state.

These are research records, not a replacement TODO list or shadow roadmap. Track independent outcomes on the board under current repository rules. Add a discoverable link from the documentation index. Preserve previous campaigns and link corrections rather than erasing negative results.

Every substantive spike must answer:

- What problem and hypothesis does this investigate? Which previous claim or application weakness does it challenge?
- Which sources were read in full, downloaded, built, run, or unavailable? What exact versions and licenses apply?
- How does the mechanism work, including assumptions, intermediate representations, and failure behavior?
- Which current PixelDoll files and call chains already do something similar? What is missing or incorrect?
- What controlled local test was performed, with what inputs, parameters, ground truth, output identities, and measurements?
- What failed, contradicted the hypothesis, or remained ambiguous? Could the metric reward a damaged output?
- What could transfer to PixelDoll, at what complexity, runtime cost, paid cost, UX burden, and licensing constraint?
- What discriminating experiment or implementation follows? What would disprove the recommendation?

Label claims as documented contract, source observation, native execution, offline reproduction, paid experiment, inference, or untested hypothesis. Cite the external primary sources in the resulting research documents and record exact local provenance. This reusable handoff itself deliberately links only to repository documentation.

## 8. Challenge both the research and the whole application

After the source spikes, the coordinator and a fresh reviewer must produce a ranked gap matrix through a two-way challenge:

- **Challenge the researched material:** question its claims, code, demonstrations, evaluation, assumptions, failure cases, and applicability to PixelDoll. Reproduce its mechanisms rather than trusting its documentation or showcase results.
- **Challenge PixelDoll:** inspect the complete relevant implementation and functionality, including architecture, generation, preprocessing, postprocessing, scripts, quality gates, design, settings, feedback, recovery, and export. Question existing decisions and accepted behavior, not just whether new source ideas fit the current design. Look for weaknesses even when no outside project offers a ready-made fix.
- **Compare and synthesize:** test both approaches on equivalent tasks and explicit user needs. Neither the existing app nor the outside source is the default authority. Retain what works, replace what fails, and investigate a simpler or original alternative when both approaches are inadequate.

Map each finding to current production code and actual user behavior, not an outdated pipeline description. Record the outside source's strengths and limitations, PixelDoll's strengths and limitations, competing explanations, comparison evidence, and the resulting decision. Include cross-feature interactions and workflows that isolated source examples or existing tests miss. Identify duplicated helpers, dead research paths, misleading defaults, incorrect quality gates, and interactions with persistence, recovery, composition, and export.

For each candidate, record the observed failure, likely root cause, competing explanations, smallest shared fix, offline control, paid experiment if needed, expected benefit, risks, and acceptance/rejection criteria. Prioritize improvements by evidence, user impact, generalization, and implementation simplicity. Do not prefer a spectacular new feature over a proven correction to the core output pipeline.

Carry forward lessons from earlier challenges, then verify whether they still apply:

- Perfect palette membership can coexist with body-key failure, collapsed highlights, erased motifs, or incorrect equipment ownership.
- Preserving raw alpha during recoloring does not prove extracted alpha is preserved. Run the complete downstream pipeline.
- An approved transparent layer and a conditioning bitmap have different purposes. Re-extraction can alter an already approved layer.
- Equal requested seeds do not establish deterministic output or shared random noise across different routes.
- Whole-image similarity can be dominated by the body and conceal a damaged buckle, hand, blade, or garment motif.
- Off-key pixels are not automatically equipment. Skin, shading, outlines, and provider mistakes can survive a color key.
- A perfect solo recomposition does not prove arbitrary item swaps. Remove occluders and test combinations with known ownership.
- A global layer order may be impossible when front/back relationships change within a frame or across a move.
- An unsigned principal axis can miss a 180-degree weapon reversal. Diagnose signed orientation and grip-side evidence.
- A frame-average or clip-average score can hide one visibly broken cell. Evaluate every returned frame and intended playback.
- Pixel thresholds and cleanup rules can destroy valid one-pixel details or penalize small sprites purely because of scale.
- A passing isolated function does not establish correct publication, cached request reconstruction, receipt recovery, or exported playback.

Treat these as adversarial test questions, not permission to freeze old solutions forever. Seek new mechanisms, but challenge new metrics and postprocessing at least as strongly as the baseline.

## 9. Test deterministic behavior before buying new samples

Replay stored public or authorized outputs, build synthetic ground-truth fixtures, and run free counterfactuals first. Reuse shared production helpers rather than maintaining a flattering research-only pipeline. Retain raw inputs and outputs so preprocessing, provider behavior, extraction, and later repairs can be evaluated separately.

Cover the current supported domain and its meaningful boundaries:

- Body shapes and frame sizes; supported directions and projections; moves with action extremes; asymmetric clothing and equipment; small and large silhouettes.
- Skin and gear colors near the key; key violations; outlines; partial alpha; anti-aliasing; hue changes; shading and palette-ramp collisions; cyan-colored valid gear; loss of contrast from quantization.
- Thin straps, tiny buckles, gaps, eye and eyebrow protection, hair shading, front/back hair, capes, two-handed items, mirrored views, weapon tip polarity, grip side, contact and padding.
- Empty or corrupt frames, provider size/cardinality errors, missing references, sparse visible body witnesses, near-total occlusion, registration ambiguity, boundary contact, and cropped exports.
- Multiple items with overlapping cuts; arbitrary combinations; occluder removal; item swaps; palette changes; layer permutations; all frames contributing to bounds.
- Explicit fitting and compatibility contracts: hide/substitution rules, unsupported combinations, and preflight rejection. Matching dimensions or rig topology alone do not prove that equipment fits another body.
- Measured interaction coverage across items, bodies, directions, moves, and materials. Use constrained pairwise or higher-order cases plus targeted known failures; do not treat pairwise coverage as proof of arbitrary compatibility. Test valid metamorphic relations, such as equip/unequip restoration, repeated normalization, or adding common padding while preserving artwork and world-space registration through the corresponding pivot/offset adjustment. State each relation's preconditions rather than assuming all item ordering, mirroring, or poses are interchangeable.
- Intentional components, one-pixel bridges, holes, and negative space under declared connectivity conventions. Compare decoded pixels, browser playback, and native exports for sampling phase, filtering, atlas fringes, alpha interpretation, and color-space changes. Topology measures are diagnostics, not universal hard gates across poses where valid occlusion changes connectivity.
- Authored timing, holds, reordered/repeated cells, one-shot and loop transitions, direction changes, natural motion, foot sliding, hand contact, and pose consistency.
- Queue cancellation and completion races, persistence conflicts, concurrent edits, repeated sessions, cache identity, unknown paid outcomes, recovery using saved frames, and export/import contracts where currently supported.

Use mutation tests with known damage to show that a metric catches the intended failure and does not reject valid tiny details. Measure raw provider fidelity, corrected fidelity, and the cost of correction separately. If a method abstains, preserve uncertainty and make review/recovery useful; do not silently turn low-confidence pixels into approved gear.

For experiments involving ownership or recoloring, use independent pixel labels and deliberately conflicting examples. A detector and its evaluation cannot both define correctness using the same color-key assumption. Keep alpha, body identity, material ownership, shape, palette, and contrast as separate observations.

Compare explicit material/owner labels and indexed representations with RGB inference, including identical RGB values belonging to different materials and protected outlines. Qualify how labels are acquired separately from how accurately their palettes are reconstructed; a palette index is not automatically a semantic material identity.

Measure practical correction effort alongside automatic quality: time, actions, paid calls, preserved pixels, and final accepted output. Distinguish agent-operated correction-time proxies from measured artist effort. Study corrective interaction and confidence-based abstention using false acceptance and review coverage by defect class. Retain authorized corrections as reviewed regression evidence. Do not assume confidence scores are calibrated or that a correction can propagate safely across directions, poses, or items. Research these mechanisms without presuming a new learned model or editor feature is approved.

## 10. Run live Agent-mode experiments and real user workflows

Use the current agent-only development command and local launch configuration documented in the [agent instructions](../../AGENTS.md) and [token contract](agent-dev-token-handling.md). Verify Agent mode and loopback-only hosting. Use the agent's live browser to exercise the app through actual controls, inspect outputs, recover failures, and test changes iteratively. Direct API probes supplement this; they do not replace end-to-end user workflow tests.

Prefer a **host-integrated browser**, meaning a browser embedded in or directly available through the agent's host application, such as the Codex in-app browser or a browser integration available to Claude. Discover the current host's actual browser capabilities. If that browser is unavailable or unsuitable for accessing the local app, choose another available agent-controlled browser that can reach localhost. Record the browser used and any fallback in the test evidence. Keep PixelDoll in Agent mode and preserve loopback-only access regardless of browser choice.

Never reveal a token through logs, screenshots, request dumps, exports, agent messages, or commits. Do not read or print secret values to establish that access exists. Use safe connection status and the permitted balance check. Keep the agent server private to localhost. Do not grant account scopes or change credential handling just to make an experiment easier.

Run keyless tests under the repository's required off switch. The switch is origin-wide and read on page load; isolate keyless automation from a live paid browser rather than breaking an active run in another tab. Keep the localhost app tab available during iteration. Close obsolete external research tabs and unused agents as their tasks finish.

### Paid experiment design and spending

There is **no PixelLab generation budget limit** for this cycle. Do not inherit an earlier campaign's dollar limit or request count. The user's request to execute this process authorizes deliberate PixelLab experiments needed for the work, subject to current repository and tool requirements. Do not impose an arbitrary monetary or sample-count stopping point; let evidence determine the next experiment. This does not authorize spending indefinitely without learning or override a later explicit instruction from the user.

Before each campaign:

1. State the hypothesis and decision that the experiment can change. Reject redundant calls that existing outputs or offline counterfactuals already answer.
2. Freeze input images, approved source gear, body cuts, rig, pose sequence, view, slot, prompt, palette, route, and seed where supported. Hash inputs and exact sanitized requests. Change one factor at a time, or predeclare a factorial design and its interpretation.
3. Select representative bodies, item types, directions, moves, and multiple seeds or repeats. Include high-occlusion, asymmetric, and difficult examples. Separate pilot exploration from held-out qualification.
4. Define acceptance criteria and independent evaluation before seeing candidates. Include fidelity and failure rates alongside cost and latency.
5. Quote expected scope and cost using current provider semantics. Track actual cash and subscription-generation charges separately, including failed, canceled, or ambiguous outcomes.

Submit deliberately through the authorized app workflow. Never automatically resend a paid request after a timeout, failed upload, unknown receipt, reload, or lost response. Reconcile receipts and completed artifacts first. A replacement or repair is a separately justified experiment with a new identity and explicit lineage, not an invisible retry. Do not release an uncertain reservation merely to make a budget display look correct.

Respect enforced approval reviews and human-only payment actions. Do not switch tools, invoke an alternate endpoint, or automate a rejected final click to evade them. If such a handoff is actually required, prepare the concrete batch, preserve state, briefly explain the requirement and its source, and continue independent work while awaiting the action. Do not repeatedly ask for approval already provided when the available workflow can proceed under it.

Retain every requested sample and its status, including unattractive outputs, provider errors, and partial results. Deduplicate reused controls in both statistics and billing. Store raw provider output separately from repaired/extracted candidates. Do not select the best seed while reporting an average benefit.

### Evaluation in the live app

Review every returned cell at native resolution and integer zoom, and review actual animation playback. Compare label-blind candidates when practical, with the mapping sealed until judgments are recorded. Use an independent reviewer who has not been told the favored hypothesis. Inspect equipment fidelity, silhouette, motif, colors, contrast, outlines, skin leakage, body changes, contact, occlusion, and temporal stability.

Complete the ordinary workflow: create or load a body, dress it, add moves, change directions, combine items, recolor, review/repair, save/reload, recover stored results, and export. Verify costs and receipts in Activity and trial evidence rather than assuming a completed image means a completed transaction. Compare the exported layers and manifest to Studio playback, including native engine or editor execution when feasible. Do not label a generated HTML preview as native engine verification.

## 11. Implement qualified changes and repeat the loop

Use research to improve the actual application, including generation routing and conditioning, preprocessing, extraction, gates, postprocessing, scripts, workflows, recovery, and exports. A new option is not automatically an improvement. Prefer strong defaults and the smallest shared root-cause fix supported by evidence.

Before implementation, search for existing helpers, types, and constants. Keep the app client-only and comply with current model policy, credential rules, theme ownership, and data-compatibility policy. Read the [usability principles](../usability-principles.md) before changing user-facing behavior. Keep technical experiment controls on appropriate development surfaces; ordinary users should not need to understand research parameters to dress a character.

Preserve immutable frozen body and approved source evidence. Do not hide body redraws inside equipment layers, overwrite accepted art with a conditioning copy, or introduce a global cleanup that destroys valid materials. Retain exact request/output provenance and make any new default compatible with current cache/recovery semantics. If changing data representation is necessary, follow current repository policy instead of adding speculative migrations or abstractions.

Implement coherent changes with clear ownership. Remove code made dead by your change, surface failures, and preserve accessibility and consequential cost disclosures. Add meaningful regression tests for established failure mechanisms. Never weaken an assertion or conceal a failed result to qualify a hypothesis.

Run the checks required by the current agent instructions. For application changes this includes the prescribed type and unit checks plus affected end-to-end coverage; run the full local end-to-end suite when current cross-cutting rules require it. Read [test performance guidance](../testing/test-performance.md) before changing test configuration or adding expensive tests. Use isolated ports/output directories for concurrent suites. For UI changes inspect relevant viewport sizes, orientations, themes, keyboard operation, and recovery feedback.

Compare before/after on stored failures and held-out cases. Repeat paid testing only when the change introduces a new provider-facing question or existing samples cannot establish the result. A deterministic downstream correction may qualify entirely on retained samples; a nondeterministic generation default needs representative live evidence beyond one attractive output.

Have the fresh reviewer challenge the final implementation and validation. Resolve confirmed findings, reproduce disputed ones, and record unresolved uncertainty. Commit every coherent change you make using Conventional Commits after appropriate verification. Stage only your own files. A new finding starts another research/implementation/test loop; it does not disappear because the first batch finished. Push, deploy, purchase unrelated tools, or change product policy only when the current authorization covers that action.

## 12. Completion, honest limits, and the next invocation

Do not stop after a short web survey, the first round of subagents, a document bundle, one passing seed, or one successful test run while substantive authorized work remains. Continue through source discovery, local execution, controlled experiments, independent challenge, implementation, and verification. Expand the team or change hypotheses when useful evidence remains.

An invocation is a finite execution of this repeatable process. It is not a claim of permanent perfection or an unbounded background task. Close the cycle when the researched opportunities have received reasoned dispositions, qualified changes have been delivered and independently reviewed, required checks pass, and further progress needs a genuinely new hypothesis, inaccessible prerequisite, or a future cycle. Explain why remaining leads were rejected, deferred, blocked, or require more evidence. Time spent, agent counts, passing metrics, or money spent alone are not completion criteria.

Before closing, have the independent reviewer identify the strongest remaining opportunity and challenge the proposed stopping point. If a productive research lead, feasible discriminating experiment, or confirmed fix remains within the authorized work, continue the loop. Do not defer a discoverable hypothesis merely because the first research wave, implementation, or paid batch finished.

Update the board truthfully under current instructions. Do not mark a larger outcome Done while requested review, testing, or implementation remains. Preserve a durable resumption note containing current revision, commits, artifact locations, active-job and receipt state, unresolved failures, and the most useful next discriminating experiments. A future invocation must reconcile that state before submitting anything new; unknown historical jobs must not be silently retried.

Report concisely to the owner, with links to the detailed evidence:

- Concrete improvements and the measured or observed benefit, including tradeoffs.
- Research coverage, locally inspected/built/executed sources, fresh discoveries, and untested or inaccessible areas.
- Experiments, retained failures, rejected hypotheses, independent review conclusions, and remaining limits.
- Actual paid costs and subscription usage, separately stated; distinguish confirmed charges from unresolved outcomes.
- Commits and checks actually run, including failures, fixes, and explicitly skipped checks.
- The current resumption document and next substantive opportunities.

Do not claim exhaustive internet coverage, universal item compatibility, perfect ownership, deterministic model output, or native execution without evidence. Leave the application and evidence stronger, keep the localhost tab available for continued iteration, and make the next invocation start from what was learned rather than repeating the same shallow survey.
