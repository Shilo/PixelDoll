# Final engineering review closure

November 2, 2026. Branch `codex/motion-lab`. Implementation commit `0865c0b6`; preceding reconciliation documentation commit `458d14e6`. The owner supplied Claude's final response and instructed Codex to validate it against both reviews, finish remaining agreed fixes and document the outcome, with no more broad research or paid generations.

**Outcome: the agreed engineering fixes and this review exchange are complete. No remaining agreed code fix or engineering blocker was identified.** The experimental animation presets remain unqualified. This is not completion of the original arbitrary-humanoid professional-animation ambition, permission to enable the rejected presets, or a claim that the branch was merged or deployed.

## Final response validated against both reviews

The response was checked against the [original independent review](2026-11-02-independent-paperdoll-quality-review.md), its [joint reassessment](2026-11-02-joint-review-reassessment.md), Claude's [initial response](2026-11-02-claude-paperdoll-quality-review-response.md), the [counter-review and fixes](2026-11-02-joint-counter-review-and-fixes.md), and the recorded code and offline evidence. Agreement was not treated as a replacement for verification.

| Final Claude position | Validation and final disposition |
| --- | --- |
| All final frames share B-starV2; generation provenance differs | Matches both fresh eight-frame recomposition checks: zero differences in all final composites. The earlier733 generation bodies differ by0/0/1/18 pixels in their four poses. Accept the revised wording: mixed generation provenance, observed continuity variation, cause unproven. No code change is required. |
| The15% adjacency threshold was an uncalibrated judgment | Matches the independent critique. Perspective, occlusion and deliberate art can change projected dimensions. Keep such values only as candidate-specific authoring hypotheses. Do not add a universal gate or single-job requirement. |
| Keep cleanup RulesA/B deferred until negative controls are resolved | Matches the independently reproduced body-rim false positives and redundant post-clipping containment predicate. Another positive weapon family is not sufficient evidence. Do not adopt the prototype, loosen global thresholds or start another control matrix. |
| x28/D inputs are source/log corroborated, not proven byte-identical by encoded lengths | Matches the reviewed body-frame loader and the limitation of matching lengths. Codex's blanket input-mismatch objection was withdrawn. Output-change, palette, skin-layer and old registration findings remain separate supported concerns. Historical documentation has been corrected. |
| Engineering fixes complete, experimental assets unqualified | Consistent with implemented changes and the parent's validation record. Claude explicitly relied on reported checks and did not inspect the new commits or rerun tests; this is agreement on disposition, not a second independent test execution. |

## Agreed fixes checked in the current branch

- The production inpaint extraction boundary remains enforced through cleanup and body cuts. Restored masks retain their hash/input/canvas checks. No semantic mask or anatomy guarantee was substituted for the permission invariant.
- Cached `stencil` and `cut` arrays are copied before returned cells can be mutated. The maintained cache tests cover mutation isolation and changing a valid saved mask on the same draft/result identity.
- Fetch and response-body interruptions share normalized transport handling. An unread response uses status0 for uncertainty even if its headers looked like429; the received status is metadata. Paid outcomes are retained as possibly charged without automatic resubmission. Free GET recovery and parsed accepted-ID/rejection precedence remain intact.
- Exact-coordinate stencil extraction intentionally retains a hard G10 failure for a shifted redraw. The existing unbounded route can still apply its prior one-pixel registration. Both behaviors are asserted.
- Provenance wording, cleanup-removal descriptions and historical preservation claims were corrected. No new manifest schema, paid quality retry, dependency, backend, model or default preset was added.

Source inspection confirmed these changes are present. `git diff --name-only 0865c0b6..458d14e6 -- app` returned no application changes, and the working tree was clean on entry. Therefore no new implementation was necessary for this final response. This closure changes documentation only.

## Verification and spending

The actual implementation verification remains: pinned Node24.22.1/npm11.19.1; strict checking with zero errors/warnings;126 unit files with **1,413 passed and one preexisting skip**; production build and distribution guard passed; a fresh full browser run with **166 passed, zero failed**. The earlier146-pass/20-failure run was invalidated by coordinator edits triggering development hot reloads, preserved, then replaced by the clean run. It was not silently counted as successful.

The fresh Playwright `.last-run.json` still records `passed` with no failed IDs. No app checks were rerun for this documentation-only closure, no assertions were weakened, and no new output-quality claim follows from the test results.

**Zero paid calls and zero generations were used for final validation and closure.** No live balance, status or generation request was necessary. Historical additional-phase usage remains153.25 actual and196 conservative held, with no ledger reset. The owner's latest instruction stops further broad research and paid generations for this task; the unused historical allowance is not permission to resume spending during closure.

## Final disposition and boundaries

Engineering review closed. No further Claude round, paid discriminator, replication, seam study, palette experiment or new workflow investigation is scheduled. Any later request would be new explicit scope, not an automatic continuation of these reports.

Managed B and the mixed733/736 family remain research controls. The737 substitutions remain rejected. No experimental preset is enabled in Studio, no equipment layer acquires a hidden skin patch, and no old body/joint contract is silently replaced. The original broader preset goal remains unmet and must not be marked Done on the strength of this engineering closure.

All changes stay on `codex/motion-lab`. No push, merge or deployment was performed. The main checkout's unrelated work was left untouched. Board active/archived/matching-card reads were retried and still lack project scope; no account access expansion or board mutation occurred. Tracking synchronization remains pending, without blocking this independently authorized documentation closure.

## Record of the owner-relayed final Claude response

Claude agreed to distinguish generation-time bodies from final composition and revised F1 to “spliced generation provenance; continuity variation observed; cause unproven.” It acknowledged that its15% threshold was a judgment rather than a calibrated limit, to be used only with a candidate's declared art/motion intent. It agreed to defer RulesA/B pending labeled body-rim, smear and broad-permission negative controls, recognizing that a second successful family would not resolve those issues. It revised x28/D provenance to corroboration by source and logged lengths rather than exact request-byte proof.

Claude's concluding recommendation was that mask containment, cache-array copies, response uncertainty and exact-coordinate regressions can be considered complete, with no concrete blocker from its side. It explicitly said it had not rerun the checks or inspected the new commits, and continued to classify the experimental presets as unqualified. This record captures that limited endorsement without inventing a new independent verification.
