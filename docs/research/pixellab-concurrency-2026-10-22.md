# PixelLab account concurrency — 2026-10-22

## What the public API can detect

Primary sources checked live, alongside the repository API snapshot:

- [REST v2 OpenAPI](https://api.pixellab.ai/v2/openapi.json): `GET /balance` returns `subscription.status` and nullable `subscription.plan`. The example identifies `Tier 2: Pixel Artisan`. `Subscription` describes active/trial/expired/none and enterprise statuses. Generation balances are billing quantities, not concurrency limits.
- [PixelLab pricing](https://www.pixellab.ai/): Tier 2 advertises up to 10 concurrent background jobs; Tier 3 advertises up to 20. Free and Tier 1 do not publish a numeric concurrency ceiling here.
- [Official API guide](https://api.pixellab.ai/v2/llms.txt): the only Account route is `/balance`; individual accepted jobs are polled by ID.

The current OpenAPI has no public account-limit, subscription-detail, utilization or active-job-list endpoint. Therefore exact live available slots, custom enterprise limits, and dynamically earned account capacity cannot be discovered using the supported public API. Website-only internal endpoints are not a supported browser API and were not called. No inferred rate-limit header, guessed JSON field, generation balance, or website session is used as authoritative account capacity.

## Decision

Use the active plan label from the existing free balance read: Tier 2 → 10, Tier 3 → 20. Unknown, expired, enterprise, Tier 1 and free plans retain a conservative default of 3; this is a fallback, **not** a claim about their actual limit. Detect the plan before the first queued burst. Refresh through a free background balance read when pending work exists and account information is at least one minute old; polling and submissions continue using an already known ceiling during that read. Reset detection on key change and leadership takeover; ignore stale reads from a previous key.

The plan ceiling is not a reservation. Website, Aseprite, other integrations, browsers and devices compete for the same account. Same-origin PixelDoll tabs already elect one queue leader using Web Locks and share an IndexedDB ledger. Keep that design and broadcast the leader's capacity and cooldown to followers. Separate origins/devices cannot coordinate locally; the server's acceptance/rejection remains authoritative.

## Admission and rejection handling

- Count accepted unfinished background job IDs, and reserve expected job slots during transport. Managed character animation creates one job per requested direction. Existing Studio flows request each direction separately. Remote completion releases a slot even while a CDN download is pending.
- Fill the detected ceiling immediately when unthrottled. On HTTP 429 or 529, keep the request queued with its existing identity and inputs. Apply a queue-wide exponential backoff (jitter, 1–60 seconds) so fresh requests cannot bypass a busy account. Honor exposed `Retry-After` seconds or HTTP dates as a lower bound, including delays longer than 60 seconds.
- Keep polling accepted jobs while submissions wait. After the deadline, probe with one request at a time; each accepted probe expands local occupancy. Full occupancy or five consecutive accepted probes restores the full dispatch ceiling, so short/synchronous jobs do not remain limited to one submission per tick forever. A capacity refusal resets that success streak; late original-burst successes never count as probes. Capacity refusals have no finite retry-count failure threshold. Users can cancel waiting jobs.
- Persist the refusal/deadline on the queued record, restoring the shared deadline after reload or takeover. Balance refresh and Resume do not remove capacity backoff.
- The existing observed `Failed to start any animation jobs` response explicitly says no job started; it follows the same queue-wide wait path. Other paid network errors, timeouts and ambiguous 5xx responses remain unknown outcomes and are **never automatically resubmitted**.

## Safety findings

The live schema documents 429 as concurrency exhaustion on current generation routes, and 529 as rate-limit refusal on several routes including skeleton estimation. It does not document an actual limit or occupancy in those responses. Consequently a temporary 429 is not used to permanently downgrade the inferred subscription ceiling.

The prior client considered every 503 a definite refusal. The live schema describes a busy renderer specifically on `/vfx` and temporary upstream unavailability on `/image-to-text`; that does not justify treating arbitrary 503 responses on paid generation routes as uncharged. Blanket 503 resubmission was removed. The safe cases are explicit 429/529 refusal, existing 423 lock handling, and the observed explicit no-jobs-started message. Known accepted job IDs are only polled, never regenerated automatically.

`Retry-After` may be unavailable to browser JavaScript if the API does not expose the header through CORS. Backoff works without it. Legacy multi-direction requests larger than the detected ceiling can run alone and rely on server admission; Studio's one-direction requests avoid this case. There is no claim of knowing every account's exact live maximum or guaranteeing a custom account limit from the public API.

## Verification

Deterministic unit tests cover tier selection, key changes, full occupancy, external traffic, queue-wide cooldown, repeated 429/529, Retry-After, recovery to 20, multi-job reservations, overlapping ticks, reloads and ambiguous paid outcomes. A dev-only offline fixture runs the actual Studio, transport, persistent queue and Web Locks against an intercepted PixelLab API. It supports browser checks without consuming credits or exposing a token. See the corresponding [verification report](../testing/account-concurrency-2026-10-22.md).
