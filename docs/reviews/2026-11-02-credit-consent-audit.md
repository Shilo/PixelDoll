# Generation consent audit and bounded finish plan

November 2, 2026, branch `codex/motion-lab`, product baseline `0acd88ab`, review-handoff commit `592e3dfe`. The owner reaffirmed that extra paid quality regenerations require user permission and asked for a timely finish rather than indefinite experimentation.

## Finding

No new automatic paid quality-regeneration path was found in the audited implementation. The shared stencil, exact-mask extraction, cleanup and raw-body observations perform local work. They do not enqueue generations. Failed quality or structural checks retain the original result for review rather than starting an extra dress, pose, key change or refinement. A retry is a separate user request.

The Studio retry path captures reviewed scope, project/rig/artwork identity and the current estimated generation cost. If the content or price changes while waiting for Connect, the attempt must be reviewed again. Accepting flagged artwork, recoloring with existing local data, inspecting results and exporting are not authorization for a paid retry. The new Lab controls dispatch through explicit render actions with displayed reservations, fixed request identities and one-shot receipts; importing a packet, opening the page or exporting evidence does not submit that render.

This is an evidence-based audit of the listed paths and tests, not a guarantee about every future code change or external provider billing.

## Important consent distinctions

- One approved generation plan can include several planned calls, directions or batches. Those are the requested operation, not quality-triggered extra attempts. The UI should continue disclosing the planned estimate and scope.
- Free status/balance reads, result downloads and polling existing accepted jobs can repeat automatically. They do not authorize new generation.
- The shared queue can retry an already approved request after a clear rate-limit rejection, or the narrowly recognized animation response stating that no jobs started. This is transport recovery under the original request, not a quality reroll. Accepted-job evidence overrides that classification. The behavior relies on the provider's rejection contract; it is not a promise that the provider can never misbill.
- An accepted paid request or an uncertain paid transport outcome is not automatically resent. Its receipt remains available; unknown outcomes are not treated as free. Generic server errors, timeouts and connection uncertainty must not cause a duplicate generation.
- Old queued quality extras without player-requested consent are blocked on reload and cross-tab adoption. A new consent marker cannot silently upgrade an old queued record.
- Consent is tied to the reviewed operation. A quality failure, an existing API token or a large research allowance is not blanket permission for production quality retries.

No product-code changes were needed for this audit. The previous Claude handoff/bundle remains a valid frozen code snapshot. This addendum does not start a second external review exchange.

## Verification actually run

Pinned Node24.22.1/npm11.19.1. Ten existing unit files passed, **232 tests total**:

```text
automatic-recovery.test.ts
paid-retry.test.ts
item-review-consent.test.ts
queue-generation-consent.test.ts
queue-resume.test.ts
measurement-retry.test.ts
measurement-recovery.test.ts
fixed-inpaint.test.ts
research-budget.test.ts
item-stencil.test.ts
```

Four existing mocked browser scenarios passed in `studio.spec.ts`: reload of failed create/move/setup without paid submissions; current-plan pricing and unavailable-price blocking for draft retry; changed artwork/price blocking after Connect; and reviewed joint-check recovery with disclosed cost and durable consent before work. Production build and distribution guard passed as prerequisites. Separate test ports5591/5592 and output directory `app/test-results-credit-consent-audit` were used.

These tests use mocked services. **No live PixelLab generations were used.** Strict checking and the entire application/browser suites were not rerun for this documentation-only audit; their preceding results remain in the research report. No assertion or configuration was weakened.

Relevant implementation: `app/src/lib/items/{items,run}.ts`, `app/src/studio/state.svelte.ts`, `app/src/lib/pixellab/{client,queue}.ts`, and `app/src/ui/motion-lab/{fixed-inpaint,research-budget,WeaponAwareProbe.svelte}`. The unit and browser cases distinguish planned batches, extra quality calls and uncertain transport outcomes.

## Bounded completion proposal

1. **Freeze new motion research while Claude reviews.** Retain the verified extraction fix, current evidence, original failures and unchanged preset defaults. No new body, direction, source-library or broad generation matrix is scheduled. The consent audit is now complete.
2. **Consume Claude's single review once.** Produce an accept/reject/defer table with evidence, prioritize actual correctness, spending and stability defects, and implement accepted in-scope fixes in one focused phase. Do not add optional architecture or cosmetic work to this phase. Revisions needed to make a concrete fix pass are part of verification, not permission to expand the research program.
3. **Allow at most one final discriminating animation experiment for this completion phase, if the review supplies a credible, materially different hypothesis.** Prepare its inputs, cost reservation and pass/fail/stop criteria offline first. The existing allowance remains authorized, but current stage capacity and failed gates cannot be bypassed. No experiment is currently scheduled, and no automatic quality retries may follow it. A failed result rejects that candidate for this release; it does not initiate another reroll series.
4. **Finish with integration readiness and an honest disposition.** Required code checks pass; no unresolved automatic-spending defect remains; accepted production fixes are documented; experimental assets remain separated. A preset becomes eligible only if its entire supported clip, grip/occlusion, design continuity, contact/root/timing and export contract pass within the declared body/view envelope. Otherwise keep that preset unqualified and state the remaining limitation explicitly. Do not mark the original broad animation goal complete merely because the extraction patch is ready.

The deliverables can be bounded now; a guarantee of professional animation for arbitrary humanoids cannot be made from the current evidence. If the bounded family cannot pass, the useful decision is to narrow supported presets or propose a distinct prepared-art workflow, rather than keep spending on near-identical prompts. No calendar estimate for unknown Claude findings is asserted.

Tracking remains on the existing motion-quality scope. Active, archived and matching-card reads were retried and still lack project access. No account-permission change or board mutation was attempted. Board synchronization remains pending.
