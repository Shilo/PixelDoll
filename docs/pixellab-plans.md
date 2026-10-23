# PixelLab plan policy

**Edit [`PLAN_JOB_LIMITS` in `app/src/lib/pixellab/plans.ts`](../app/src/lib/pixellab/plans.ts) to change account concurrency defaults.** This is the single maintained table, also linked from AGENTS.md. Do not put numeric limits in Studio components or request builders.

| Account | Jobs at once |
|---|---:|
| Free / Trial (local tier 0) | 1 |
| Tier 1 | 8 |
| Tier 2 | 10 |
| Tier 3 and higher | 20 |
| Unknown / unnumbered enterprise | 3 (fallback) |

The four known-plan defaults are the user's requested policy (2026-10-23), consistent with the supplied MCP plan chart for paid tiers. They are **not** numeric values returned by the API. `/balance` identifies subscription status and plan; balances are not concurrency or entitlement limits. `trial`, `none` and `expired` use the Free/Trial policy even if an old paid-plan label remains. Active numbered plans parse the full tier number (Tier 30 is Tier 3+, not Tier 3). Missing/unrecognized data remains unknown; we do not invent an enterprise entitlement or reject it as Free.

Activity shows one automatic, read-only footnote: **Up to 20 jobs at once.** It contains no plan explanation or editable concurrency setting. Existing shared backoff and safe retry behavior remains in effect when other tools occupy account capacity.

## Endpoint audit (2026-10-23)

The supplied picture lists MCP tools. PixelDoll calls REST v2 directly. The live [OpenAPI](https://api.pixellab.ai/v2/openapi.json) was fetched and compared with actual request builders and call sites; the schema does not expose account concurrency limits or machine-readable per-plan entitlements. The [previous live account check](testing/img/account-capacity-live-2026-10-23.json) returned Tier 3 identity and no numeric-capacity field. It cannot prove how a Free account is enforced.

| Actual REST operation | PixelDoll use | Plan handling |
|---|---|---|
| `GET /balance` | Validate key and identify plan | Available without generation spending |
| `GET /characters`, character detail/ZIP reads | Library browsing and imports | No local paid-tier block |
| `POST /create-character-v3` | Base drawing and registration | No standalone route block; full Studio creation declares Tier 1 **before its base drawing** because the following animation needs it |
| `POST /enhance-character-v3-prompt` | Optional prompt enhancement | No local paid-tier block; still costs generations |
| `POST /characters/animations` | `skeleton-v3` walking/idle and `pixminimax` custom motion | Tier 1 for those engines; no blanket restriction on `v3` mode |
| `POST /animate-with-skeleton-v3` | Render body/item poses | Tier 1 skeleton-tool policy |
| `POST /estimate-skeleton` | Measure joints | No separately confirmed paid-tier rule; standalone estimation remains allowed; full Studio rig workflows declare their Tier 1 dependency |
| `POST /edit-animation-v2` | Dress equipment keyframes and anchor-cell edits | No standalone paid-tier block; skeleton-based equipment declares Tier 1 before dressing, while anchor-cell editing remains available |
| `POST /transfer-outfit-v2` | Fitted equipment rest previews | Tier 1 outfit-transfer policy from the supplied chart; REST schema does not advertise entitlement |
| `POST /inpaint-v3` | Packed-grid fallback | Tier 1 through 256 px on each side, Tier 2 if either side exceeds 256 px |

Primary documentation cross-checks:

- [Skeleton animation](https://www.pixellab.ai/docs/tools/animate-with-skeleton), Limitations: requires Tier 1. The supplied chart also identifies skeleton-v3 as Tier 1. The REST v3 schema itself does not advertise this restriction; this is maintained published-tool policy, not a live permission probe.
- [API guide](https://www.pixellab.ai/pixellab-api), PixMiniMax section: requires Tier 1. Applying that engine's restriction to managed `mode: pixminimax` is a documented engine-level inference.
- [Inpaint v3](https://www.pixellab.ai/docs/tools/inpaint-v3), Limitations: explicitly identifies REST `POST /v2/inpaint-v3`, excludes Free Trial, and specifies 256 px per side for Tier 1 / 512 for Tier 2+. This confirms the picture's size restriction is per side, not area.
- [Transfer outfit](https://www.pixellab.ai/docs/tools/transfer-outfit-pro) describes the operation and generation cost but omits a tier rule. The Tier 1 rule comes from the supplied MCP chart; its application to REST outfit transfer is maintained tool policy, not a verified Free-account rejection.
- [Public account schema](https://api.pixellab.ai/v2/openapi.json): status/plan/credit balances, with no numeric concurrency or entitlement endpoint. No paid generation requests were used to test entitlement rejection, and a Tier 3 key cannot validate Free-account rejection behavior.

## Free accounts and queued work

A valid Free/Trial key remains connected. Connect explains the unavailable tools and offers **Continue with limited access**; it is not reported as an invalid key. Free users retain library imports, local dressing/recolour/export, prompt enhancement and eligible anchor-cell editing. Buying credits does not change a subscription's tool entitlement.

New Studio character/move/rig-setup and skeleton-equipment workflows declare `minimumTier: 1` before their first paid request. This prevents spending on an allowed first step and getting stranded at the restricted animation step. Eligible free operations use `withKey(..., false)`; actions known to need the rig tools use `withKey(..., true)`. A blocked connection discards its pending spending callback and retains the form draft; upgrading does not silently replay a previously cancelled action.

The queue enforces the request/workflow policy before transport, preserves restricted jobs as queued with a clear reason, and continues allowed calls and polling of accepted jobs. Requirements are persisted with records and strengthened when a retained queued call is attached to a stricter workflow, including cross-tab updates and duplicates. Legacy Studio flow tags protect retained pre-policy base requests. Dependent workflows wait while a queue account check is pending, and after a failed initial check until an account response succeeds. Checks repeat at most once per minute while pending work exists; a plan change between checks can still be enforced by PixelLab. Fresh balance data after an upgrade makes queued work eligible again. Unknown/enterprise account responses remain server-authoritative.

Tests: `app/test/unit/plan-policy.test.ts`, existing queue-capacity tests, and `app/test/e2e/concurrency.spec.ts`. Changes to the table or access policy should update these cases and this document together.
