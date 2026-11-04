# Imported character setup concurrency

Date: 2026-11-04. Scope: independent joint measurements during imported-character rig setup, using the existing account queue. No paid API requests were sent for this work.

## Cause and evidence

`app/src/studio/setup.ts` awaited each `joints()` call and its cached provenance receipt inside a sequential loop. Only after that frame completed could the next request enter the shared queue. The queue's 20-job capacity therefore did not accelerate setup.

The original loop and comment date to commit `5c27a0fae` on 2026-10-22. The comment cites UI responsiveness and stopping before character registration if a frame cannot be rigged. Those are valid safeguards, but neither requires serial independent measurements. The complete set of unique frozen body images is available before measurement begins, and each result is associated with its image hash. No frame needs another frame's joint result.

The [official v2 OpenAPI](https://api.pixellab.ai/v2/openapi.json), checked on this date, describes an image input and a synchronous keypoints/usage response for estimate-skeleton, with rate-limit responses. It describes no dependency between these requests. This supports the independent-call model; it does not establish measured server throughput or a numeric estimator-specific concurrency allowance. Numeric account defaults remain maintained policy in `app/src/lib/pixellab/plans.ts`. The server remains authoritative when it throttles.

## Change and safety decisions

Setup now uses a worker window derived from the largest supported `PLAN_JOB_LIMITS` value, currently 20. This bounds prepared work and is not a second account concurrency policy. All measurements still use the same `joints()`, `run()` and shared queue. Actual account capacity, other queued work, cross-tab leadership, plan restrictions, rate-limit backoff, cached receipts and uncertain paid outcomes retain their existing behavior.

One completed frame admits another without waiting for slower siblings. Results remain keyed by original frame hash. Provenance is stored in source-frame order rather than completion order, and successful progress counts increase monotonically. Registration, rig attachment and the atomic publication transaction remain after complete measurement success. Existing artwork and current playback choices retain their prior publication safeguards.

The first failure observed by a setup worker stops admission of new frames. All already admitted workers settle before setup rejects, so no old continuations overlap a newly resumed setup or report late progress. No new paid retry or cancellation policy was introduced.

An initially considered reuse of `parallelGeneration` was rejected during adversarial review: canceling queued sibling requests without a new attempt/recovery contract can leave terminal canceled records that setup's resume-safe lookup will not reopen. Publishing all 411 requests at once would also admit unnecessary spending after a failure is observed. The bounded draining window avoids both changes.

The tradeoff is explicit: already admitted **queued** checks can still start after the first observed failure. They are not limited to requests already sent. The window bounds outstanding work, not the total work that can finish before a delayed failure is discovered. A slow check or delayed lookup of a cached failed receipt can be observed only after most or all other checks in the approved plan have completed. Those requests remain approved work and their receipts are cached. An authentication, credits or offline pause can delay draining and therefore delay the final setup error. Registration and saving still do not proceed after failure. This preserves resume semantics rather than adding an unreviewed queue cancellation protocol.

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

## Additional independent challenge and agreed fixes

The owner requested a fresh adversarial review after the initial delivery. An independent reviewer ran 14 additional offline probes and 18 focused setup/rig tests. The implementation owner independently reran 56 queue/capacity/resume tests. Root repeated both actual-queue browser cases five times each: all 10 repetitions passed in 35.3 seconds with the normal four workers. No paid service requests were made.

The new probes exercised failures after measurement during encoding, receipt lookup and provenance creation; first-error preservation; changed-body publication; setup-controller overlap prevention; shared Tier 1 capacity with six existing jobs leaving two setup HTTP slots; authentication pauses; queued Cancel; late responses; and synchronous 429 cooldown. The 429 case accepted exactly 41 distinct measurements plus one refused attempt, without resending accepted work. One initial probe-harness failure came from advancing the queue only once while rows were still persisting. Repeating ticks as production does corrected the harness without changing application behavior or weakening its request-count assertions. Probe code/config are ignored under `spikes/api/out/setup-concurrency-review-2026-11-04/`.

The reviewer and root challenged and agreed on these findings:

| Finding | Evidence and counter-challenge | Agreed action |
|---|---|---|
| Delayed failure discovery | A cached failed receipt was seeded for frame zero, with its encoding/identity lookup held. Concurrent setup completed the other 40 approved checks before observing that failure; the identical serial baseline started none. Peak outstanding work remained 20, the failed request was not resent, and registration/publication never occurred. | Clarify **first observed failure** and distinguish the outstanding-work bound from total completed work before observation. A new all-request preflight or serial barrier was rejected as a different scheduling policy, not a fix for a demonstrated bound or consent violation. |
| Pending Stop is a no-op | Activity offered Stop for `submitting`, while `Queue.cancel` handles queued and running records. The same behavior occurs in the pre-change serial baseline; a pending synchronous response becomes done because it was never canceled. | Fix the truthful UI affordance. Disable Stop during submission with a visible, accessible explanation. Preserve queued Cancel and running background-job Stop. No transport abort, canceled-outcome fiction or new queue policy. |
| Cancellation/receipt and drain concerns | Canceling an unsent queued check retained its canceled receipt after sibling responses; only 19 checks in that window were accepted. No refill, registration, publication or slot leak followed. A paused draining setup could not be replaced or dismissed; after rejection, a fresh setup could start without old callbacks overwriting it. | Keep the existing pool and queue behavior. No concurrency implementation defect was reproduced. |

Both reviewers challenged an initial wording suggestion that requests were already sent: `submitting` also covers input preparation before transport. The final state-neutral explanation is **Stop is unavailable until PixelLab responds.** It appears once in the Generating section and is connected to each disabled Stop with `aria-describedby`. It does not rely on hover or focus on a disabled control. The original progress and cost assertions remain, with added checks for disabled pending Stop, enabled queued Cancel and enabled known-running Stop.

After the agreed UI-only fix, strict checking again returned zero errors/warnings, all 1,807 unit tests passed with the same one existing skip, and all three focused Activity/setup browser cases passed. The final complete run passed **232 of 232 browser tests in 4.4 minutes**, four workers, fresh ports 5503/5504 and `TEST_OUTPUT_DIR=test-results-joints-review-final`. No tests were excluded and no assertions, deadlines or retries were relaxed. The production build and distribution guard passed. The concurrency pool implementation remained unchanged throughout this review.

Codex browser additionally checked the original 411-frame archive on isolated localhost:5193 with synthetic API responses. It observed exactly 20 pending Stop controls, all disabled and all linked to the visible explanation. Offline QA captures of the final controls and completed setup are under ignored `app/test-results-joints-review-proof/`. The reviewer, implementation owner and root agreed on the final diff with no remaining blocker.
