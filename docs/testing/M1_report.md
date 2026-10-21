# M1 test report: key + queue (B1, 2026-10-20)

Scope: architecture §14 M1 + the foundation modules (§8–§11). Code is in `app/`. Tested live in the Claude built-in browser
against the Vite dev server (`npm run dev`, port 5173), plus the production build via `vite preview`.

## What was built

| Area | Files |
|---|---|
| Shell, hash routing (`#/`, `#/m1`, `#/m2`–`#/m5` placeholders, `#/selftest`), top bar (key status, `/balance`, queue counts, session spend) | `src/App.svelte`, `src/ui/TopBar.svelte`, `src/ui/Home.svelte` |
| PixelLab client (Bearer auth, typed `ApiError` kinds: auth / credits / invalid / policy / retry / notfound) | `src/lib/pixellab/client.ts` |
| Typed route builders (create-character-v3, characters/animations, GET characters/{id}, estimate-skeleton, inpaint-image-pro-flash, inpaint-v3, edit-animation-v2, edit-images-v2, transfer-outfit-v2, balance, background-jobs get/delete) and job result extraction | `src/lib/pixellab/routes.ts` |
| Job queue (§9) | `src/lib/pixellab/queue.ts` |
| IndexedDB (`projects`, `blobs` sha256-keyed, `jobs`), zip writer/reader (store + deflate-raw, CRC32), SHA-256, PNG decode/encode/binary alpha | `src/lib/store/db.ts`, `src/lib/store/zip.ts`, `src/lib/image/hash.ts`, `src/lib/image/png.ts` |
| Key handling (memory by default, opt-in localStorage, forget) | `src/lib/app.svelte.ts`, `src/ui/M1.svelte` |
| Dev-only key endpoint `/__dev/pixellab-key` (`apply: 'serve'`) + CSP websocket allowance in dev | `vite.config.ts` |
| CSP meta | `index.html` |
| M1 page | `src/ui/M1.svelte`, `src/ui/BlobImg.svelte` |
| Self-checks: `npm run selftest` (node 25, native TS type stripping, no dep) and `#/selftest` (browser, adds PNG + IndexedDB) | `src/lib/selftests.ts`, `scripts/selftest.ts` |

Queue behaviour: concurrency default 3 (user 1–8), 429 → `max(1, n−1)` and +1 back after 5 clean submits; backoff
2 s → 60 s with jitter on 429/423/5xx/network submit errors; 401 / 402 pause the queue; 422 and policy code 5000 are terminal;
polling every 5 s; record persisted (`submitting`) before the POST, job ids persisted right after; inline base64 results go to
`blobs` in the same handler that sees `completed`, storage URLs are persisted first and then downloaded (retried on failure);
reload resumes polling; a record that was `submitting` when the page died becomes `lost` (never auto-resubmitted);
input images are stored as blobs and the ledger keeps `{$blob: sha}` refs; request-hash cache for seeded requests;
per-job usage (gens and/or USD); cancel = `DELETE /background-jobs/{id}`.

## Results

| # | Test | Result |
|---|---|---|
| 1 | `npm run check`, `npm run build` | pass (0 errors, 0 warnings) |
| 2 | `npm run selftest` (node) and `#/selftest` (dev + prod build) | all pass (hash, zip, client, routes, queue with fake API, png, db) |
| 3 | Dev key button → `/balance` through the CSP | pass: `4718.51/10000 gens · $22.51` shown |
| 4 | Dev key endpoint guard | `curl` without `Sec-Fetch-Site: same-origin` → 403; page fetch → 200 |
| 5 | Production build: dev key code absent | `grep __dev\|pixellab-key dist` = 0 hits; key value not in `dist`; no dev button in `vite preview` |
| 6 | CSP enforced (prod) | `fetch('https://example.com')` blocked with a CSP violation; `api.pixellab.ai` reachable |
| 7 | Create test base (`create-character-v3`, S1 prompt, 64×64, seed 1234) | **done, 2 gens, 239 s**; 8 rotations downloaded from `backblaze.pixellab.ai`, all 64×64 |
| 8 | Reload during the base job | the record came back as `running` with the same job id; with no key the queue waits; after the key is set again it polls `background-jobs/1bd62ec6…` only (resource timing: no `create-character-v3` request after reload); progress 5 % → 26 % → completed |
| 9 | Animate: idle (`breathing-idle`) + walk (`walking-8-frames`) × south, east, north | 2 POSTs → 6 background jobs. **idle: $0.0338, 84 s, 3 × 4 frames; walk: $0.0440, 140 s, 3 × 8 frames**, all 64×64, shown as each direction finished |
| 10 | Reload during both animation calls (6 jobs) | resumed polling all 6 jobs, no `/characters/animations` re-POST, both finished |
| 11 | Frames shown | 44 images (8 rotations + 12 idle + 24 walk), `image-rendering: pixelated` |
| 12 | Request-hash cache: "Create test base" again with seed 1234 | "cache hit: reused 058854bd", 0 requests sent |
| 13 | 422 terminal | first attempt with `n_directions: 4` → 422, marked `failed`, not retried, free |
| 14 | Bogus key | top bar `rejected (401)`, `balance error` |
| 15 | Key storage | memory key: not in localStorage, IndexedDB ledger, URL or DOM (checked in-page); "remember" → localStorage; "forget key" → removed |

Screenshots: `img/m1_1_base_running.jpg`, `img/m1_2_after_reload_no_key.jpg`, `img/m1_3_resumed_same_job.jpg`,
`img/m1_4_ledger_done.jpg`, `img/m1_5_frames.jpg`.

## Bugs found and fixed

1. `create-character-v3` with `n_directions: 4` (text only) → 422 "direction_images and n_directions=4 need reference_image".
   Text-only v3 always makes 8 directions (2 gens). M1 now omits `n_directions`; routes.ts notes the constraint.
2. Switching keys kept the previous key's balance on screen. `setKey` now clears balance and error.
3. Progress showed 111 % (`last_response.progress` goes above 1). Clamped to 100 % in the UI.

## Costs

Job-reported usage: base 2 generations; idle $0.0338; walk $0.0440 (template animations report USD in `job.usage`, not generations).
Total M1 spend ≈ **2 gens + $0.078**, plus a free 422. `/balance` deltas could not be attributed because S1 spent in parallel
(the balance went 4718.51 → 4690.51 gens during the run). S1 measured template animations at ~1–1.5 subscription gens per direction
by balance delta, so the USD figure in `job.usage` may not be the full charge.

## Known gaps

- Cancel (`DELETE`) and the 429 / adaptive-concurrency path are covered by code and the fake-API self-test, not live.
- Concurrency counts calls, not background jobs: one `/characters/animations` call starts one job per direction (Tier 3 limit is
  20 active jobs). Fine at default 3; revisit if M3 fans out wide.
- The session spend counter is in memory and resets on reload (ledger rows keep per-job cost).
- With a memory-only key, resumed jobs wait until the key is entered again (by design).
- `rgba_bytes` results are stored raw, not re-encoded to PNG (no route has returned them yet).
- The `projects` store and `zip.ts` exist and are self-tested but unused until M2/M5.
