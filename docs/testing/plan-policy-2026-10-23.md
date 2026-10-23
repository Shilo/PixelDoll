# Account plan policy verification — 2026-10-23

Implementation: `6157d26` (`feat(pixellab): centralize plan limits and guard paid-tier workflows`). Policy and endpoint evidence: [PixelLab plans](../pixellab-plans.md).

## Account and API evidence

The agent-development account's earlier free `GET /balance` returned active **Tier 3: Pixel Architect**; the queue selected **20**. It made one balance request, zero generation requests, and exposed no numeric capacity fields or rate-limit headers. Local evidence: [sanitized result](img/account-capacity-live-2026-10-23.json). No token is stored in this report or evidence.

The supplied MCP chart was compared with actual REST call sites, live public OpenAPI, and official tool documentation. There is no public machine-readable concurrency or entitlement endpoint in the inspected schema. Limits remain a maintained tier table (1/8/10/20), not numeric API discovery. A Tier 3 account cannot establish whether a Free account would receive a server rejection; no paid entitlement probes were sent.

## Adversarial review

A read-only sub-agent reviewed the implementation after the implementation commit. We discussed and agreed on four valid findings:

- Hold dependent spending during an in-flight queue plan refresh and after a failed initial account check. Recheck after both asynchronous persistence steps before transport.
- Preserve stricter eligibility from follower updates and duplicate records without replacing the leader's payload or transport state.
- Add the actual `/transfer-outfit-v2` operation to the endpoint audit and tier policy. Its Tier 1 policy comes from the supplied chart; official REST entitlement is not claimed.
- Document minute-based cache freshness and leave unknown/enterprise account responses server-authoritative.

The reviewer independently reran 43 targeted tests after the fixes and reported no remaining material concerns.

## Validation

- 231 unit tests passed, including six additional regressions for the review fixes.
- Svelte check: zero errors/warnings. App, test and Node TypeScript checks passed.
- Production build and agent-key dist guard passed; existing bundle-size advisory remains.
- All 50 browser tests passed on the implementation. After review fixes, all three concurrency/Free-account browser cases passed again, including two-tab leadership, external saturation/recovery, and permitted pending enhancement.
- Codex browser visually verified the one-line **Up to 20 jobs at once.** footnote and the valid-Free-account warning/limited-access flow. [Activity screenshot](img/plan-footnote-2026-10-23.png), [Free warning screenshot](img/free-plan-warning-2026-10-23.png).

All implementation and regression tests used mocks with real generation traffic blocked. No PixelLab credits were spent.
