# Automatic account concurrency verification — 2026-10-22

Scope: plan-based capacity, admission across tabs, shared rate-limit cooldown, safe resubmission and Studio feedback.

## Research and implementation

See [primary-source research and limitations](../research/pixellab-concurrency-2026-10-22.md). The public API exposes plan identity, but no exact current free-slot count or custom account ceiling. Active Tier 2 uses 10 jobs; active Tier 3 uses 20; other plans use a labeled conservative fallback of 3. No paid API calls or real generation credits were used for verification. All simulated generation requests were intercepted in the dev-only fixture.

## Checks

- Node 24.22.1 and npm 11.19.1 were obtained from official distributions in an ignored local cache; package versions and lockfile remain unchanged.
- Shared working copy: all **202 unit tests** pass, including **22 new concurrency tests**. Svelte and both TypeScript checks pass with no errors or warnings.
- Production build and dist token-leak guard pass. Vite reports the existing bundle-size advisory.
- New Playwright two-tab test passes: select Tier 2/3, fill external slots, enqueue from follower, observe shared waiting, release slots, reach 20 remote jobs, and complete all work without failed jobs.
- Codex in-app browser: observed 10 on Tier 2, 20 on Tier 3, shared busy-account countdown, no failure on rejection, recovery to exactly 20 remote jobs, follower leadership notice, and all 25 jobs completed afterward. Local screenshot: `docs/testing/img/concurrency-20-codex.png` (media remains gitignored under repository policy).
- The first broad browser run on the shared working copy passed 25 existing checks and failed six in concurrently edited creator/API-peek flows; the new test initially had an ambiguous `status` locator matching its fixture output as well as the notice. The locator was corrected and the test passed. A committed-code-plus-concurrency snapshot then passed **all 32 browser tests**, including those six cases. The final short-job throughput refinement was separately checked with unit regressions and the two-tab browser test.

## Independent challenge review and resolution

The requested reviewer compared the task changes against pre-task snapshots, checked the public API constraints, and reproduced edge cases using the real Queue class. We discussed and agreed on these fixes:

1. **Slow recovery probes could overlap.** Planning serialization alone did not protect the full transport lifetime. Each probe now has an identity held until transport settles. A stale probe cannot clear a new account's probe identity. Delayed-POST regression passes.
2. **First key connection after ledger restore cleared cooldown.** The initial test used the opposite lifecycle order from memory-only/agent startup. Restore now preserves both the saved deadline and probe mode, including after the deadline expires; initial key connection retains them. The production-order regression adds fresh work and confirms it cannot bypass the restored wait.
3. **Old-key responses could pause or throttle a new key.** Submissions capture their credential before preparation, check it again before transport, and only apply current-account effects when it still matches. Tests cover late 429, 401, 402 and network responses. Poll auth/network side effects are guarded too.
4. **Slow capacity reads could stall polling.** Initial detection gates the first burst; periodic reads are single-flight background work. Polling and known-ceiling submissions continue while a periodic read is unresolved. A key change invalidates the old read identity. The delayed-read regression passes.

5. **Short jobs could remain in probe mode indefinitely.** I challenged the occupancy-only recovery condition: fast/synchronous jobs might never fill every slot. We agreed to restore full dispatch after five accepted probes as well. The reviewer challenged counting late successes from the original burst, so the counter uses the captured probe identity and resets on a capacity refusal or key change. A 60-request synchronous regression verifies late successes do not count, a refusal resets the streak, and five subsequent acceptances restore a full 20-request burst.

The reviewer independently reran all 22 concurrency tests and the original reload/stale-response reproductions, then approved the scoped change with no remaining material findings. We also agreed that guessing undocumented custom limits or retrying ambiguous paid 503 outcomes would be unsafe; these limitations remain explicit.
