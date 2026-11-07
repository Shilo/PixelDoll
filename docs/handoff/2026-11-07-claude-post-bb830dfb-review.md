# Counter-review of the post-qualification improvements

November 7, 2026. Review the evidence below critically before changing production behavior. The objective is better paper-doll quality, consistency and accuracy without preserving one benchmark by breaking other equipment, body types, colors, movements or recovery paths.

## Scope and outcome

The baseline is Codex's last prior commit, `bb830dfb9ac6e7347200e487302b60b2d779f457`. This review covers **all 31 subsequent commits through `0992bae7aab684b969880be481a96ff8876d2801`**, including implementation, tests, experiment scripts and documentation. The [machine-readable inventory](../reviews/2026-11-07-post-bb830dfb/commits.json) identifies their exact paths and IDs. Three documentation commits arrived during review and are included below. Later commits, including the commit that delivers this report, are outside the reviewed range.

The functional probes pin `8ea08c28d92d9a8d41524dcd78f379c38699ea63`; the subsequent `2611cc34`, `f26751bf` and `0992bae7` do not alter the functional code under test. They add CharacterForm help text, accepted-limit disclosures and padding/wording experiment reports. The complete changed call chains were reviewed by the coordinator and three domain reviewers. This is a commit-range review, not a fresh audit of every unchanged subsystem.

**Seven distinct findings survived challenge: four P2 and three P3.** Shared-checkout checks passed but omit the counterexamples below. Isolated pinned-export full runs retained failures disclosed under validation. No production source or production test was changed, no dependency was installed, and no PixelLab generation was submitted by this review. The next step is your independent counter-review, not automatic acceptance of our proposed fixes.

The owner expressly instructed us not to read the reusable improvement-cycle document. We did not read it, and this handoff does not require it. Read the current repository instructions and the linked evidence. Preserve unrelated work, use the board's matching/ownership rules, and commit only your own changes.

## Findings to reproduce and challenge

P2 means a meaningful supported behavior can be incorrect and deserves correction. P3 means a smaller user-facing or invalid-data robustness defect. None of these results establishes a provider-wide failure frequency. Synthetic cases are labeled explicitly; passing existing tests does not refute a counterexample they do not exercise.

### R1. P2: cleanup deletes a substantial held part across a thin connector

**Source:** `app/src/lib/items/items.ts:566`, especially the eligibility floor before traversal around lines 568 and 580. Introduced by `45d0b4e0`.

The independent authored fixture declares a stylized dotted-link flail as valid equipment. A 100-pixel main component reaches a 20-pixel terminal head through a two-pixel link within the existing three-pixel attachment neighborhood. A real opaque synthetic body and bent arm reach the grip without bridging the component gaps. The standing reference contains the same complete design. Each of six candidate frames is identical in pose and intended equipment.

- Baseline: 122 input pixels become 120; it already loses the tiny link, but retains the entire 20-pixel head.
- Reviewed implementation: 122 become 100; the floor prevents traversing the link and strands the valid larger head. No specific deletion warning is emitted. The per-clip median cannot detect identical loss in every frame.
- Detached-head negative control: both versions correctly remove an unconnected head.
- Body-repaint negative control: the baseline wrongly keeps a buckle reached through a small fleck; the new version correctly removes it.

The last control matters: **a blanket revert or unconditional small-component retention reintroduces the original bug**. Challenge whether dotted-link equipment belongs to the supported item domain, then distinguish connectivity evidence from ownership of retained pixels. Trusted reference evidence or an uncertainty/review path may help, but no replacement algorithm has been qualified here. Require the valid terminal and both invalid controls to pass at several native scales and grip positions.

Evidence: [IQ2, full geometry and declarations](../reviews/2026-11-07-post-bb830dfb/item-quality/README.md), [executable fixtures](../reviews/2026-11-07-post-bb830dfb/item-quality/probe.mts), [counts and hashes](../reviews/2026-11-07-post-bb830dfb/item-quality/results.json). This demonstrates cleanup behavior, not a complete paid-provider session.

The later grip disclosure's phrase “Nothing is cut from the item” should be scoped to grip/layer composition. It is not a defensible blanket statement about extraction and cleanup. That is documentation impact of this finding, not another code defect.

### R2. P2: one unrelated measured joint can disable the walk's held-shape checks

**Source:** `app/src/lib/items/items.ts:859`, `decisiveAction`, and its use by `isAction` and the locomotion checks. Introduced by `edc604be`.

The new classifier accepts a complete measured skeleton sequence, then treats sufficiently large displacement of any joint in any frame as decisive action evidence. A complete, finite, in-bounds estimate can still contain a bad joint. Classification affects the entire clip and suppresses G5/G9.

The authored fixture keeps the frozen humanoid raster, requested poses and item pixels constant. One frame reverses a one-sided blade by 180 degrees while its arm does not move. Then only one measured RIGHT EYE coordinate in another frame changes to `(0.95, 0.95)`; all labels and coordinates remain valid-schema.

| Control | Baseline | Reviewed implementation |
| --- | --- | --- |
| Valid static blade | Pass | Pass |
| Reversed blade, normal estimates | G9 failure | G9 failure |
| Same reversed pixels, one measured-eye outlier | G9 failure | **Pass with no warnings** |

The source `clipQa` also passes these frozen-body measurements with zero reported arm-adherence error. It does not independently reject the outlier. The result files retain identical pixel hashes to isolate metadata as the cause.

Challenge robust multi-joint or temporal agreement, agreement with the frozen/requested motion, and explicit uncertainty rather than one larger magic threshold. Preserve genuine slash/cast/fall action behavior, hand-swap detection, jumping/hip-relative locomotion and the whole-word vocabulary improvements. An uncertain action estimate must not silently bless an otherwise demonstrable equipment defect.

Evidence: [IQ1](../reviews/2026-11-07-post-bb830dfb/item-quality/README.md) and its probe/results. This is a synthetic estimator-error counterexample, not an observed PixelLab incidence rate or full browser session.

### R3. P2: an intentional front-only charcoal detail is treated as corruption

**Source:** `app/src/lib/items/items.ts:1257` (`grayShare`) and `:1281` (`smudgedViews`). Dark-interior rule introduced by `45d0b4e0`; the cross-view change in `4bc9f3fb` does not resolve it.

The valid instruction is “a blue tunic with a charcoal medallion on the front.” The authored front contains the requested 9 by 9 `[20,20,20]` motif; side/back views correctly contain only blue cloth. Baseline flags no view. The reviewed code measures a front gray share of `0.109375` and flags that front while accepting the other views. The same neutral motif in every view passes. The same front patch under a plain-blue instruction correctly triggers the corruption warning.

This isolates the new dark-interior path. The existing research already discloses a related asymmetric off-white-emblem limitation; that inherited example is not a second new regression. D1 changes review/failure metadata and can invite a retry. **It neither automatically spends credits nor necessarily prevents posing**, so do not overstate the impact.

Challenge the assumption that intended neutral material must appear similarly in all views. Preserve detection of the unrequested patch and distinguish ambiguity from evidence of corruption. Adding only `charcoal` to a word list would leave the general intent/asymmetry problem unresolved. Test front/back emblems, black edging, white insignia, mixed materials and genuinely view-specific mannequin repaint.

Evidence: [IQ3 and inherited-case distinction](../reviews/2026-11-07-post-bb830dfb/item-quality/README.md), probe/results.

### R4. P2: combined provider failure and save conflict hides free frame recovery

**Source:** `app/src/lib/items/run.ts` around lines 706–707 and `app/src/studio/MoveSheet.svelte:55`. Interaction of `e951da85` partial-direction publication and `666f489a` saved skeleton-frame recovery.

An offline queue fixture completes south with three images, fails north on malformed cardinality, and injects an unrelated rig-metadata change that makes publication conflict without changing the generated walking request. The code combines the first direction error before `ITEM_MOVE_SAVE_CONFLICT`. The UI exposes **Use saved frames** only when the error starts with that conflict string, so the combined case hides it.

South remains unpublished. A normal fresh-seed paid retry can therefore buy that already completed view again. The independent control calls the existing `savedOnly` path with the exact saved requests: it publishes south, leaves north missing and performs **zero additional enqueues**. No actual charge or real browser race occurred in this reproduction.

Preserve the conflict discriminator or derive the recovery capability independently of incidental message order. A small prefix-preserving correction may suffice; a generic error framework is not required. Add the combined failure/conflict case, verify free recovery remains discoverable after reload, assert zero generation POSTs, and ensure the next explicit paid quote includes only genuinely missing views. Retain exact request-hash/seed matching and conflict protection. Never auto-resubmit ambiguous paid work.

Evidence: [Studio report](../reviews/2026-11-07-post-bb830dfb/studio-recovery/review.md), [fixture generator](../reviews/2026-11-07-post-bb830dfb/studio-recovery/prepare-race-tests.mjs), [one intentionally failing expectation plus passing free-recovery control](../reviews/2026-11-07-post-bb830dfb/studio-recovery/mixed-recovery-results.json). This is an incomplete newly added recovery path, not a claim that the pre-range UI handled it.

### R5. P3: article-plus-pair descriptions lose the equipment noun

**Source:** `app/src/studio/model.ts:141`, particularly lines 142–145. Introduced by `82b0f424`.

`a pair of leather boots`, `a pair of boots` and `the pair of leather gloves` become **Pair**. The article remover consumes one prefix, then the new `of` split truncates the remaining noun phrase. Baseline retains an informative name. The existing bare `pair of leather boots` control passes, and the intended iron-lantern attachment-name correction works.

Normalize article plus count phrase before attachment splitting. Preserve informative singular names, the corrected lantern case and intentional names involving `of`. The shortened display label must not replace the full generation instruction. This is label loss, not artwork or billing loss.

Evidence: [IQ4](../reviews/2026-11-07-post-bb830dfb/item-quality/README.md), independently duplicated by the Studio reviewer in [naming results](../reviews/2026-11-07-post-bb830dfb/studio-recovery/naming-results.json). Count it once.

### R6. P3: a shield noun in a decoration changes the actual weapon's slot default

**Source:** `app/src/studio/model.ts:33`, `heldSlotFor`. Introduced by `4bc9f3fb`.

`a scutum` correctly gains an off-hand default. But `a steel sword with a scutum emblem` also changes from `main_hand` to `off_hand`: the alias matcher scans the whole instruction rather than the described object's head. The default remains editable, which bounds the impact. Retaining it can still select a different hand, prompt and gate policy.

Challenge object-head versus decoration/attachment intent rather than removing real shield support or adding another exception word. Preserve direct shield and bow defaults, the improved `shield-breaker axe` control, and explicit user slot overrides. The spaced `shield breaker axe` ambiguity exists in both versions and is not a newly introduced defect.

Evidence: [IQ5 and lexical controls](../reviews/2026-11-07-post-bb830dfb/item-quality/README.md), probe/results.

### R7. P3: zero-width repair input now hangs in the layout search

**Source:** `app/src/lib/items/items.ts:85`, especially the loop around line 92. Introduced by `f7c771fa`.

`repairGridLayout({ w: 0, h: 64 }, 8, 1)` previously throws an invalid-arguments error. Now `Math.floor(512 / cell.w)` is `Infinity`, and decrementing it cannot terminate the synchronous loop. The isolated historical-source child times out after approximately 2.5 seconds; valid 64-pixel controls return the same layout on both versions.

ZIP import and normal rig validation reject these dimensions. **No normal valid-project or ordinary validated-import path was demonstrated.** Persisted manifest loading trusts its fields, so malformed local records can reach estimation. This is an invalid-data robustness regression, not a proven ordinary paid workflow failure.

Validate finite positive dimensions and supported counts before computing loop bounds. Do not simply restore the fixed-four-column `gridEstimate` call first: it would reject valid newly supported layouts such as 160-pixel cells needing three columns. Require fast invalid-input rejection and valid alternative-layout controls.

Evidence: [CG1](../reviews/2026-11-07-post-bb830dfb/chroma-grid/README.md), [historical-source probe](../reviews/2026-11-07-post-bb830dfb/chroma-grid/probe.mts), [timings and oracle results](../reviews/2026-11-07-post-bb830dfb/chroma-grid/results.json).

## Changes that held up, and boundaries not to inflate into defects

- **Repair layout and estimates:** an independent oracle found zero policy-selection mismatches across 14,288 feasible configurations. Seven raw stored 480 by 240 receipts report 25 generations, matching the corrected helper. Quote and request use the shared layout helper. The numerical mean-side billing model remains an inference; we independently recovered one of the reported eleven unique shapes, not all eleven. Do not turn “Est.” into an exact provider price guarantee or claim universally cheapest cash billing.
- **Chroma changes:** 17 stored cases / 627 cells show 11 added pixels, zero dropped pixels and zero shared-pixel recolors under the new extractor. This reproduces the documented 10 plus 1 delta. The corpus has no independent per-pixel ownership labels, so additions are not automatically correct equipment. Across 960 authored controls, straight green-key black straps improve over deep skin, but bent dark lines, compact rings, bronze/teal and other keys remain limited. Preserve valid thin features alongside explicit mannequin-redraw negatives. Identical observations can have different intended ownership; a color heuristic cannot resolve that by itself.
- **Safer chroma retry:** measured problematic color selects a retry key used consistently by quote and request. The inspected path remains explicit user retry, not automatic rerolling. Revalidate this if changing request identity or queue resume behavior.
- **Partial saves and exact saved-frame recovery:** ordinary sibling-direction failure preserves completed directions, and matching cached skeleton requests can recover without enqueue. R4 concerns their combination with publication conflict. Do not discard these protections to simplify the fix.
- **Concurrent review results:** merging after the await preserves independently completed draft reviews. Existing regression passed; no additional stale-result defect was established.
- **First-open lifecycle:** a suspected persistent lost split was rejected by a full completed-path race. Actual `splitBase` / material normalization preserves split cells when the operation completes. An injected read failure immediately after publication leaves a temporary region mismatch of 308 decoded pixels; a real reopen normalization repairs it without spending. There is no ordinary post-publication cancel action, only Hide. Keep this as a bounded durability caveat unless a meaningful unhealed user path is demonstrated. See [interruption evidence](../reviews/2026-11-07-post-bb830dfb/studio-recovery/first-open-interrupted-measurements.json).
- **Hidden back equipment:** the new flat-backpack allowance changes an absent front from failure to an explicit “check that the view hides it” warning, not a clean pass. Geometry alone cannot establish requested front straps. Preserve both the valid hidden pack and required-visible-detail countercase when extending it.
- **G15 detail checks:** warning-only color-presence checks correctly detect complete loss of a qualifying unique-color motif. One surviving same-color pixel can defeat the warning; tiny motifs can fall below the scale threshold; shared colors and incorrect placement are not judged. Literal slash/slot extension is not general action visibility qualification. Do not market this as semantic design preservation.
- **Held prompt experiments:** the rejected upright/off-hand and vertical-flip prototypes correctly remain rejected. Dress-only success did not predict posed hand correctness; flipping broke a valid torch. Keep final-pipeline validation and preserve unchanged good cases.
- **Padding experiment tail:** `f26751bf` supports a narrow result for one body, one longsword and two seeds at dress stage: extra padding did not reverse the downward orientation, while removing the wording raised swords with some duplicates/body drift. “Direction unchanged” means qualitatively similar, not identical angles. It does not prove padding is never limiting, isolate all interactions, qualify animation, or justify a universal orientation rule. Its added four-call / $0.32 report was read; the new receipts were not independently re-audited in this review.
- **Straight-down wording tail:** `0992bae7` records a rejected full-pipeline variant, not a production change: vertical blades still produced short reach, body overlap, a failed walk-area gate and unclear side grip. Reported calls and $0.37 cost were not independently receipt-audited. Keep it as a negative result for the specific paired experiment, not proof that all vertical grips or all wording approaches fail. Owner preference and measured gate failures are separate evidence.
- **Design research:** the Bronze audits and instruction updates are research/guidance, not an implemented redesign. They do not change the theme dependency. Expressive-design experiments and vendor prompting advice are not proof of PixelDoll usability gains. Keep shared appearance in Bronze and test real tasks, accessibility and responsive recovery before accepting a redesign. No fresh manual aesthetic or screen-reader audit was performed here.

The central generality risk is not the existence of every fixed bound or noun list. It is accepting a narrow example as evidence for ownership, semantic intent or every item family. Require independently labeled positive and negative cases, resolution and geometry rationale, uncertainty handling, and preservation of the original bug fix.

## Complete commit disposition

“No additional defect established” is a scoped review result, not a correctness guarantee. Documentation scripts were inspected as experimental evidence, not silently promoted to production behavior. Exact path membership is in the linked inventory.

| Commit | Reviewed change and disposition |
| --- | --- |
| `45d0b4e0` | Held floor traversal and D1 dark interiors. R1 and R3; original buckle-repaint improvement retained as a required control. |
| `abcecf0e` | Measured color, safe retry key, route/quote/UI integration. Explicit retry and shared override retained; no additional defect established. |
| `edc604be` | Whole-word move classification and measured decisive motion. R2; substring, swap and jump improvements must survive correction. |
| `236876cc` | Hanging/waving/body-hidden held-item uncertainty and summary propagation. Review warnings are useful; no extra confirmed regression. |
| `cd107b77` | Frame-count gate investigation/script. Boundary probe covers 1, 2, 3, 14, 15, 16, 29, 30, 31 cells; batching covers all cells and meets limits. Not a live billing guarantee. |
| `38fc7f02` | Bronze identity and AI-design research. Research claims, applicability and no-production-theme-change boundary reviewed. |
| `41411fca` | First-open move lifecycle and version comparison. Completed-path loss hypothesis rejected; interrupted-publication caveat retained. |
| `a461988d` | Self-contained visual-design instruction guidance. Does not implement a theme or override existing ownership. |
| `82b0f424` | Description-head naming and plain hand summary. R5; lantern and readable hand summary improvements retained. |
| `258afdb0` | Distinguishes Bronze goals from PixelDoll priorities. No app behavior change or additional defect established. |
| `2dbbbf80` | Preserve concurrent review results. Call-chain review and existing race control passed. |
| `a2313016` | Live Agent-mode cycle evidence. Read as historical evidence, not replayed live or treated as universal quality proof. |
| `15e6d993` | Hidden flat back attachments. Explicit warning behavior reproduced; prompt/geometry limitations retained. |
| `4bc9f3fb` | Cross-view gray checks, item words and off-hand aliases. R3 and R6; preserve actual shield and intended negation improvements. |
| `77b863e9` | Light thin-item outline recovery. Historical-source replay and stored-corpus delta agree; redraw ambiguity remains bounded. |
| `0baa1ac3` | Mean-side rectangular repair estimates. Shared quote/request paths and seven receipts support 480 by 240 correction; model remains inferred. |
| `e951da85` | Preserve fulfilled directions after sibling failure. Ordinary path holds; R4 identifies combined conflict gap. |
| `e4cc1a69` | Paid hand-wording A/B report. Negative results justify retaining current behavior for now, not ruling out all future wording routes. |
| `e3a8834c` | Live small-blade gate evidence. Narrow artifact qualification; not proof all thin held details survive. |
| `b1175564` | Lost-detail warning, metadata and summary integration. Presence/resolution limitations challenged; no new standalone defect beyond documented bounds. |
| `83231919` | Research resumption record. Historical status read against later commits, not a command to resume experiments. |
| `f7c771fa` | Repair-layout optimizer. Valid-input oracle passes; R7 invalid-width nontermination. |
| `fa315b2a` | Rejected upright held-object experiment. Full pipeline rejects dress-only success; no rejected prototype reintroduced. |
| `666f489a` | Exact saved skeleton-frame recovery. Zero-enqueue control passes; R4 error-ordering discoverability gap. |
| `4981d2cd` | Rejected upright-object flip. Valid natural torch is a counterexample to blind geometric repair. |
| `2fbe38eb` | Detail warning extended to slash for over-body items. Existing source/merge tests pass; literal action/visibility assumptions remain bounded. |
| `d8030391` | Thin dark green-key straps over deep skin. Straight-line improvement reproduced; bent/ring and other-color cases remain unresolved. |
| `8ea08c28` | Flip-prototype ledger entry. Documentation-only accounting update, not a new implementation qualification. |
| `2611cc34` | Held grip/side-view/mirrored-hand disclosure and CharacterForm copy. Helpful limits; scope the “nothing cut” phrase as noted under R1. |
| `f26751bf` | Padding/wording dress-only follow-up. Qualitative narrow conclusion supported by reported angles; raw follow-up charges and generality not independently qualified. |
| `0992bae7` | Rejected straight-down sword wording. Full-pipeline failure and owner preference documented separately; no production prompt change. |

## Validation and reproduction

See the [verification record](../reviews/2026-11-07-post-bb830dfb/verification.md) for commands, exact counts, isolated-export provenance and failures. The initial shared-checkout run passed type checks, all 1,993 executed unit tests and all 248 browser tests. The first isolated export run passed 245 browser tests and failed three, including our omitted external ZIP fixtures and two UI timeouts. After adding the fixtures, the isolated full run passed 247 and failed one QA fixture that remained at Ready. All five affected cases passed a focused single-worker rerun. The pinned full suite therefore has an unresolved stability qualification, not a clean pass. Independent probes intentionally expose other cases absent from those suites. Domain test counts overlap with the full suite and must not be added together.

Run baseline/current evidence with repository-pinned Node 24.22.1. The item/chroma probes export or load the exact historical application source; they do not run the excluded process document. The Studio fixture generators reuse tracked offline test fixtures and write only ignored temporary tests. Their expected mixed-recovery failure is a finding reproduction, not permission to weaken the assertion.

```text
node docs/reviews/2026-11-07-post-bb830dfb/item-quality/probe.mts
node docs/reviews/2026-11-07-post-bb830dfb/chroma-grid/probe.mts
node docs/reviews/2026-11-07-post-bb830dfb/studio-recovery/prepare-race-tests.mjs
node docs/reviews/2026-11-07-post-bb830dfb/studio-recovery/prepare-first-open-test.mjs
node docs/reviews/2026-11-07-post-bb830dfb/studio-recovery/naming-probe.mts
```

The first two pin the historical source range and retain module hashes. The Studio generators reuse current tracked fixtures and modules; their result JSON does not retain a complete source/fixture hash set. Compare those files against `8ea08c28` before interpreting a future replay. The separate naming result contains an extracted-function hash, not a whole-Studio pin. These review tools do not establish that a later implementation is fixed merely because the historical result is reproducible. Add suitable current production regressions for corrections.

## Your counter-review and implementation criteria

1. Verify the baseline, reviewed endpoint and current checkout. Inspect later changes separately and coordinate if another agent owns them. Reproduce the seven cases. Challenge fixture intent, coordinate systems, reachability, severity, identical-pixel controls and whether a claimed regression is genuinely new. Return a supported rejection where our finding is wrong; do not treat this report as authority.
2. Challenge both the application and the research. Ask whether the current pipeline is preserving an approved design or merely pleasing a heuristic, and whether each experiment's positive and negative labels match actual user intent. Distinguish a noisy estimator, generated artifact, extractor loss, cleanup loss, QA false positive and UI recovery failure. Review the implicated cross-callers, saved-art identities, quotes and user choices together.
3. For accepted defects, propose the smallest shared correction. Preserve the original bug's negative control and add a counterexample from a different item family or body/scale. Avoid blind whole-commit reverts, another item-name exception, global threshold loosening, or automatic paid retries. Prefer explicit uncertainty over irreversible pixel deletion or silent clean QA when ownership cannot be established.
4. Validate changes in layers: authored deterministic fixtures; stored actual raw outputs and source bodies; component/queue/storage integration; then the relevant browser paths. Include multiple native sizes, body proportions and tones, all supported directions, mirrored views, long/asymmetric/detached equipment, skin/gear palette overlap, genuine actions versus walks, and intentional asymmetric details. Separate calibration examples from held-out acceptance cases. Use empty and invalid data where it can enter the relevant helper.
5. For R4, reproduce the visible free-recovery action and reload in the host application's embedded agent-controlled browser when available, then a suitable browser fallback. Verify zero generation POSTs during recovery and a missing-only quote afterward. Preserve localhost tabs needed for iteration and close unused task tabs and finished agents. Offline injected concurrency tests precede any real paid test.
6. If generation behavior changes and stored evidence cannot settle it, use the current allowed PixelLab models, local API documentation and existing Agent mode token contract. Prefer controlled paired seeds and exact frozen bodies over anecdotes. Record final-pipeline outputs, request identity and receipts; dress-only results are insufficient. Paid testing was unnecessary for this review. This review document introduces no new spending allowance: use the owner's applicable authorization and any required approval mechanism. Never expose credentials or reissue ambiguous work.
7. Run the repository-required checks for the actual scope, including full E2E for cross-cutting state/storage/queue changes. Report failures and skips, not just successful retries. Keep source, fixtures, results and assertions traceable to a commit. Commit only owned changes with Conventional Commits and keep the board scope accurate.
8. Deliver a finding-by-finding response: reproduced, refuted with evidence, corrected with tests, or still bounded/unresolved. Include exact commits and evidence links, what valid and invalid cases changed, and residual limitations. Do not close the loop with “all tests pass” if an accepted counterexample remains or a repair only covers the original named item.

This handoff asks for a technically adversarial counter-review followed by qualified corrections within the owner's requested scope. It does not claim internet research, all equipment semantics or every nondeterministic provider scenario has been exhausted.
