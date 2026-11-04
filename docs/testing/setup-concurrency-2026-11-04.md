# Imported character setup concurrency

Date: 2026-11-04. Scope: independent joint measurements during imported-character rig setup, using the existing account queue. No paid API requests were sent for this work.

## Cause and evidence

`app/src/studio/setup.ts` awaited each `joints()` call and its cached provenance receipt inside a sequential loop. Only after that frame completed could the next request enter the shared queue. The queue's 20-job capacity therefore did not accelerate setup.

The original loop and comment date to commit `5c27a0fae` on 2026-10-22. The comment cites UI responsiveness and stopping before character registration if a frame cannot be rigged. Those are valid safeguards, but neither requires serial independent measurements. The complete set of unique frozen body images is available before measurement begins, and each result is associated with its image hash. No frame needs another frame's joint result.

The [official v2 OpenAPI](https://api.pixellab.ai/v2/openapi.json), checked on this date, describes an image input and a synchronous keypoints/usage response for estimate-skeleton, with rate-limit responses. It describes no dependency between these requests. This supports the independent-call model; it does not establish measured server throughput or a numeric estimator-specific concurrency allowance. Numeric account defaults remain maintained policy in `app/src/lib/pixellab/plans.ts`. The server remains authoritative when it throttles.

## Change and safety decisions

Setup now uses a worker window derived from the largest supported `PLAN_JOB_LIMITS` value, currently 20. This bounds prepared work and is not a second account concurrency policy. All measurements still use the same `joints()`, `run()` and shared queue. Actual account capacity, other queued work, cross-tab leadership, plan restrictions, rate-limit backoff, cached receipts and uncertain paid outcomes retain their existing behavior.

One completed frame admits another without waiting for slower siblings. Results remain keyed by original frame hash. Provenance is stored in source-frame order rather than completion order, and successful progress counts increase monotonically. Registration, rig attachment and the atomic publication transaction remain after complete measurement success. Existing artwork and current playback choices retain their prior publication safeguards.

The first failure stops admission of new frames. All already admitted workers settle before setup rejects, so no old continuations overlap a newly resumed setup or report late progress. No new paid retry or cancellation policy was introduced.

An initially considered reuse of `parallelGeneration` was rejected during adversarial review: canceling queued sibling requests without a new attempt/recovery contract can leave terminal canceled records that setup's resume-safe lookup will not reopen. Publishing all 411 requests at once would also admit unnecessary spending after a bad result. The bounded draining window avoids both changes.

The tradeoff is explicit: already admitted **queued** checks can still start after the first failure. They are not limited to requests already sent. They remain approved, bounded work and their receipts are cached. An authentication, credits or offline pause can delay draining and therefore delay the final setup error. Registration and saving still do not proceed after failure. This preserves resume semantics rather than adding an unreviewed queue cancellation protocol.

## Review and verification

Three agents separately investigated implementation, queue safety and setup integration, then challenged each other's proposals. Root counter-review checked the worker admission boundary, failure guards after asynchronous steps, ordered provenance, and the distinction between orchestration-window tests and actual transport concurrency. No queue, account policy, retry or credential code changed.

Eight new unit cases cover a 411-frame plan, a full held window and refill, out-of-order frame/keypoint/provenance association, transport failure, invalid points, an undefined rejection, progress-consumer failure, request identity/resume flags and an empty plan. Together with the existing rig-setup cases, 18 focused tests passed. The mock request-identity test does not by itself prove actual HTTP cache reuse.

Two actual-queue browser tests use 41 distinct PNGs. Tier 3 holds 20 simultaneous computations and Tier 1 holds eight. They release later checks in reverse order while retaining the first check, verify refill and monotonic visible progress, and prove that registration waits for the final measurement. Registration itself is then held to prove publication also waits. Exactly 41 distinct measurement inputs and one registration are submitted, and frozen layer cells, image hashes and base hash remain unchanged. Tier 3 additionally fails the final publication transaction once, reloads the failed setup and resumes successfully without another measurement or registration POST. The fixture releases a mock service slot when its held computation ends, before waiting for Playwright's fulfillment acknowledgment, so tool latency cannot inflate the active count.

The first focused browser run passed both tests. Final strict checking returned zero errors and warnings, and all 148 unit files passed with 1,807 passed tests and one existing skip. Production build and distribution guard passed. Existing full-suite queue tests cover additional plan limits, shared jobs, leadership, key changes, rate-limit handling and unknown-outcome safeguards.

Codex browser independently imported the owner's original Muskoka ZIP in an isolated localhost:5191 fixture. Setup showed 411 unique body frames. Activity displayed the 20-job allowance and exactly 20 active Finding joints rows while mock responses were held. Releasing them completed setup, and reopening Set up character showed Ready. The fixture uses synthetic credentials and intercepts every PixelLab request locally; unexpected remote requests are rejected. Its mock keypoints test orchestration and publication, not the model's anatomical accuracy. The owner's actual account and running setup were not controlled or used for this verification.

Live estimator throughput, billing and model quality were not exercised. A server rate limit can still reduce effective concurrency. Existing in-progress JavaScript continues using its loaded implementation until a new version is loaded; this change does not rewrite that running loop.

## Final regression results

The complete browser suite ran all 232 cases on fresh servers at ports 5493/5494, with four workers and `TEST_OUTPUT_DIR=test-results-joints-concurrency-final`. It finished with 231 passes and one failure in 7.2 minutes. Both new account-capacity tests passed, including the publication-failure reload/resume case. The failing unrelated startup-update test stopped in `cachedApp` at its first `page.goto`, with `net::ERR_NO_BUFFER_SPACE`, before application code loaded. The unchanged `npm run e2e -- --last-failed` rerun passed that test in 2.4 seconds, with a 5.7-second complete run. No source, timeout, retry setting or assertion changed for this rerun. There is no unresolved application assertion failure from these runs.

The eight-case setup-concurrency unit file and the latest browser fixture instrumentation were included in the final strict/unit/full-browser pipeline. The fixture counts remote computation occupancy rather than Playwright acknowledgment latency. No tests were excluded. Other PixelDoll chats were idle in the checked inventory; no additional coordination or unrelated edits were needed.

Offline supplemental screenshots of the same original-archive fixture are stored under ignored `app/test-results-joints-proof/`: `twenty-joint-checks.png` and `setup-ready.png`. These are QA captures with synthetic responses, not proof of real service throughput or anatomical accuracy.
