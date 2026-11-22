# PixelLab plan policy

Maintain endpoint restrictions and account concurrency in [`app/src/lib/pixellab/plans.ts`](../app/src/lib/pixellab/plans.ts). Components must not contain endpoint entitlement rules.

## Account concurrency

| Account                         | Jobs at once |
| ------------------------------- | -----------: |
| Free / Trial (local tier 0)     |            1 |
| Tier 1                          |            8 |
| Tier 2                          |           10 |
| Tier 3 and higher               |           20 |
| Unknown / unnumbered enterprise | 3 (fallback) |

`PLAN_JOB_LIMITS` contains maintained defaults requested on 2026-10-23, not limits returned by `/balance`. Balances are not entitlement or concurrency limits. Activity shows the effective automatic concurrency footnote. Existing shared backoff remains in effect.

`accountTier` parses complete numeric tiers, including future tiers. Trial, none and expired statuses override stale paid labels. Unrecognized and unnumbered enterprise accounts stay unknown, not Free. A successful unknown account response remains server-authoritative. The reviewed provider contract includes expiry grace and enterprise/team access, but the app does not invent grace timestamps or numeric enterprise tiers from insufficient account data.

## Plan prices for cost estimates

`PLAN_PRICES` holds the published monthly prices and generation allowances the cost estimate divides to get USD per generation. The owner confirmed them on 2026-11-22 from the [PixelLab pricing page](https://www.pixellab.ai/); `/balance` reports neither. Free / Trial, unknown and unnumbered accounts are estimated at Tier 1 rates. When the connected account is on the picked tier, its own monthly total from `/balance` (`subscription.total`) replaces the published allowance, because accounts can hold more than the catalog lists (a Tier 2 account reported 20,000 on 2026-11-22). USD credits are endpoint-specific and are added as PixelLab reported them.

| Tier | List price | Lowest discounted price | Generations per month | USD per generation |
| ---- | ---------: | ----------------------: | --------------------: | -----------------: |
| 1    |        $12 |                      $9 |                 2,000 | $0.0045 to $0.0060 |
| 2    |        $24 |                     $22 |                 5,000 | $0.0044 to $0.0048 |
| 3    |        $50 |             no discount |                10,000 |            $0.0050 |

## Verified restriction matrix (2026-11-17)

At the owner's request, an isolated reviewer checked the provider checkout and returned only endpoint access contract facts. No provider source, paths, snippets or implementation details were shared with the coordinating agent or stored here. These facts are **verified in the reviewed checkout, not live deployment verification**. No generation request was sent for this audit.

`ENDPOINT_MINIMUM_TIERS` intentionally lists only supported operations with known restrictions. All paths below are POSTs under `/v2`.

| Endpoint                                                    | Minimum tier |
| ----------------------------------------------------------- | -----------: |
| `/edit-animation-v2`, including standing and anchored edits |            1 |
| `/transfer-outfit-v2`                                       |            1 |
| `/inpaint-v3`, both sides at most 256 px                    |            1 |
| `/inpaint-v3`, either side over 256 px, up to 512 px        |            2 |

No subscription-tier restriction was found for these supported operations in the reviewed checkout:

- Character creation: `/create-character-v3` (text and reference registration), `/create-character-pro`, `/create-character-pro-flash`.
- Prompt enhancement: `/enhance-character-v3-prompt`.
- Managed motion: `/characters/animations` and its `/animate-character` alias, with v3, skeleton-v3 or pixminimax modes.
- Raw motion and measurement: `/animate-with-skeleton-v3`, `/animate-with-text-v3`, `/animate-pixminimax`, `/estimate-skeleton`.
- Balance, character-library/detail/ZIP, job-status and Pro Flash cost reads, plus job cancellation.

This replaces earlier local rules inferred from published extension-tool documentation, which disagreed with the reviewed REST contract for skeleton and PixMiniMax. The public [OpenAPI](https://api.pixellab.ai/v2/openapi.json) has no machine-readable entitlement matrix. An unlisted endpoint means **no known local restriction**, not guaranteed provider acceptance. Credit balance does not satisfy a paid-plan requirement.

Tier 0 requests remain subject to quotas, balance, concurrency, daily trial limits and temporary restrictions during high demand. These are separate from subscription-tier access. A completed Free animation is not evidence that its output is suitable for paper-doll equipment.

The State routes `/create-character-state`, `/edit-image-pro-flash` and `/edit-image-pixen` were not covered by the provider access audit. Check the connected account's available capabilities where documented; do not infer entitlement or quote equivalence from the model family. `/edit-images-v2` keeps PixelDoll's Tier 1 requirement. For State edits, quote the concrete endpoint and all batches before submitting; an accepted or uncertain attempt never triggers a fallback request.

## Workflow preflight and notices

`requestTier` combines endpoint rules, actual inpaint dimensions and the workflow's declared minimum. Activity tags never grant or restrict access. `workflowTier` takes the maximum across mandatory requests. Item planning uses its actual grid layout; move repair layouts and item-creation layouts are deliberately different. Preflight must use the same geometry as submission, including padding and protected reference cells.

Compute the requirement before the first generation request, not after charging an allowed first step. Preserve it in queue metadata and recheck every actual request before transport. Optional grid repairs do not increase an otherwise eligible workflow's minimum. Their own explicit action is priced and checked separately. Do not change packing or quality gates merely to fit a lower tier.

Explicit Studio repair can divide one facing across Tier 1 canvases without resizing the target frames or standing reference. The quote includes every batch. Each request uses its own protected copy of the same reference. PixelDoll evaluates the assembled facing before saving, including palette drift between batches. Tier 2 can use a larger single canvas when it fits. If one full frame plus its reference cannot fit within 256 px per side, the action still needs Tier 2. Draft and imported frozen-grid workflows are separate from explicit repair.

Explicit repairs that pass hard quality checks save automatically. A complete candidate flagged by those checks is kept locally for comparison in Moves; it does not replace accepted artwork or enter exports until the user chooses **Use repaired frames**. **Keep current** leaves the old frames intact. Neither decision sends a repair request, and hiding the review leaves it available after reload. Previously queued work waits for the decision. Malformed or incomplete output cannot replace a facing. A new paid attempt is always a separate user action.

New equipment always needs Tier 1 because its standing design uses `/edit-animation-v2`. Anchored extensions also need Tier 1. Skeleton-only posing of an already purchased item can be eligible without a paid plan; mandatory frozen-grid dressing needs Tier 1 or 2. There is no verified Free equipment-generation fallback among the allowed models. Character creation, setup and body-only moves have no known tier restriction.

**Redraw item** is an explicit alternative using `/edit-images-v2`. PixelDoll requires Tier 1 for this action even though the reviewed provider checkout does not impose that minimum. It uses a single square sheet through 512 px at native resolution, with an estimated 10, 15, or 25 generations depending on the sheet size. Unlike Repair item, the provider can redraw any part of the submitted sheet. PixelDoll extracts equipment only within the local stencil and keeps the original body. Grip, alignment, or silhouette can still change inside the stencil, so a complete usable redraw always goes to comparison before it can replace the current facing. Estimates are not live billing guarantees.

The square Redraw sheet uses the provider's Pro Edit thresholds (256 and 341 px), not the inpaint estimate calibrated from different request shapes. Tier 2 live testing returned the quoted charges for an eight-frame 80 px worn item (240×240, 10 generations) and a padded 112 px held item (336×336, 15 generations) on both routes. Free and Tier 1 behavior was exercised with offline fixtures, not live credentials.

`TierNeed` and `tierDecision` are shared by UI and queue policy. Required takes precedence over recommended; recommendations never block or change queue requirements. A successful unknown account is not labeled Free or promised access. Missing or failed initial checks hold restricted queue requests until verification succeeds.

`TierNotice.svelte` reacts to account and numeric workflow requirements and contains no endpoint switches. Upgrade notices appear only when a known account tier is below the required or recommended tier. They use the same `NoticeLink.svelte` presentation as the affiliation notice: the entire surface opens PixelLab plans in a new tab, with keyboard access and Bronze hover, pressed and focus states. Checking and verification errors remain static informational notices, not upgrade links. Required notices persist and explain disabled controls. Recommendations explain a real limitation without another modal, setting or stored dismissal. The existing cost review remains the place to authorize spending. Free generation recommendations disclose trial limits rather than claiming that the same endpoint costs more on Free.

`withKey` takes a numeric minimum. Missing credentials open Connect. Known insufficient accounts stay in context, with an explicit tier explanation; Connect is not a subscription paywall. A canceled or blocked pending connection does not replay a spending action after upgrading. Local dressing, recoloring, export and imports remain available.

## Provider failures and spending safety

Restricted requests can be accepted as background jobs and then fail. HTTP 202 does not establish entitlement. A generic failed job or reported zero usage does not establish the cause. Keep authentication, credits, content refusal, capacity, network and unexplained failures distinct from known tier requirements.

The matrix is preventive, not authoritative runtime discovery. Retain provider errors and durable Activity details when a deployment differs. Do not invent an upgrade requirement from generic error text, cache inferred denials, silently retry, or switch endpoints after a potentially paid attempt. Only say "No request sent" for a local pre-submit block. Missing usage is unknown, not zero.

Queue records with accepted job IDs continue polling after downgrade without resubmission. Queued restrictions can resume after a verified upgrade. Persisted historical workflow minima remain explicit restrictions until canceled; preview data receives no migration.

## Offline verification

Policy and workflow regression tests cover numeric tiers, recommendations, 256/257 px boundaries, mandatory later steps, activity-tag independence, anchored equipment, body-only motion, account verification and queue safety. The Free/Trial browser regression proves contextual equipment blocking without a POST; permitted prompt enhancement remains covered separately. All API responses in these tests are fixtures.

## Bounded live verification

On 2026-11-17, the owner authorized live calls after offline smoke checks. A Trial account with no USD credits successfully completed 48 px V3 character creation (2 generations) and a three-frame raw skeleton animation (2 generations). A single equipment edit reproduced HTTP 202 followed by a generic failed job, code 3006, with reported USD 0 and no observed generation-balance change. The generic failure is not an independently established tier-error signature.

The balance moved from 27 to 23. No paid request was resent. Inpainting was not live-submitted, and no Free equipment/grid fallback was qualified. These sampled calls establish access for those inputs, not exhaustive deployment parity or professional animation quality. Receipts, limits, screenshot timing and reproduction safety are recorded in [the live verification report](research/2026-11-17-free-tier/README.md).
