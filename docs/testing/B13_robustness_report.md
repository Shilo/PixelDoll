# B13 — Robustness fixes for the R6 review

Builder: B13 · Date: 2026-10-21 · Work list: [R6_code_review.md](R6_code_review.md) (six P1s plus P2s) · 0 gens spent (fake-API self-tests and
an isolated Playwright context only) · Not committed.

## Verification

| Check | Result |
|---|---|
| `npm run selftest` | all pass. The queue self-test gains `robustTest()` (P1-2/P1-3/P2-9/10/11) and new `lockTest` cases (P1-1 merge dedupe, P1-4 key ask, P2-8 key hand-off and forget, mirror by record id). Mutation check: with the old retry rule and no merge dedupe, 4 asserts fail. |
| `npm run check` | 0 errors, 0 warnings (218 files) |
| `npm run build` | JS **432.39 kB / 148.98 kB gz → 317.11 kB / 111.36 kB gz** (−27 %). CSS 35.9 → 30.4 kB. The bundle has no `selfTest`, `selftest`, `__dev` or `pixellab-key` strings, and no M1–M5 harness code. |
| `app/scripts/e2e-studio.mjs` | 18/18 on the production preview (`vite preview`, 127.0.0.1:4183; 4173 was taken) and 18/18 on the dev server :5173 |
| `app/scripts/probe-tabs.mjs` (new, dev server only) | 6/6: persisted duplicate drafts heal and loadGens twice gives one entry per id; the follower mirrors the drafts once; Create in a follower is refused with a toast; a same-origin `{ask:true}` gets no key; the follower takes over when the leader closes, with drafts still unique; `db.update` with 20 concurrent increments ends at 20; `gcBlobs` keeps the referenced blob and drops the unreferenced one |

## P1

| # | Finding | Fix | Evidence |
|---|---|---|---|
| P1-1 | Every tab resumed drafts, creates and moves. The leader's `merge()` adopted same-request records from two tabs and paid twice. | `state.svelte.ts`: one guard, `follower()`, sits in `withKey` (every spending action goes through it) and in `acceptGen`/`discardGen`. It shows the toast "PixelDoll is open in another tab…". `loadGens` runs drafts only in the leader. `resumeCreate`/`resumeMove` return early in a follower. A queue subscription mirrors `studio-drafts` in followers and calls `takeOver()` when the tab becomes leader. Queue `adopt()`: an incoming queued record whose `requestHash` matches one of mine that is live, or done with a seed, is marked `cancelled` ("duplicate of <id>"). | lockTest "leader drops the other tab's duplicate" (1 POST); probe "follower: Create is refused" |
| P1-1 regression (found by T3) | `takeOver()` ran `gens.splice(0, gens.length, ...(await readGens()))`. `gens.length` is read **before** the await, so a takeover during load appended the list a second time (4 drafts became 8). | One synchronous `setGens()` is now the only place the list is replaced; it dedupes by `spec.id`. `readGens()` dedupes too, so stored duplicates heal. `loadGens()` returns one shared promise per page, the watcher waits for `gensReady`, and `drive()` runs once. `runningGens` still allows one runner per id. | `model.ts` selfTest `uniqueBy`; probe steps 1, 2 and 5 |
| P1-2 | "Clear finished" deleted ledger records that live drafts, creates and moves still need, so a later resume pays again. | `queue.clearFinished(keep)` now needs a keep predicate and does nothing in a follower. `state.cleanUp()` keeps records referenced by drafts (`gens` plus `m3-drafts`, `recId` and `old`), and, while a create or move is pending (in memory or `studio-create`/`studio-move`), every record tagged `studio-base`/`studio-rig`/`studio-move`/`m2-skel`. Activity and M1 call `cleanUp()`. | robustTest "clear finished keeps referenced and live records" |
| P1-3 | A paid POST was resent after a network error or 5xx. | `client.rejected()` = 423/429/503/529 (the OpenAPI spec documents 429/529 as rate limits and 503 as "renderer busy"). Only those, or a non-POST request, are requeued with backoff. A paid POST that gets status 0, another 5xx or a timeout becomes **`lost`**: "no clear answer… may have run and been charged (check pixellab.ai); not resent". Activity shows "unknown: may have run, check pixellab.ai". `api()` now has `AbortSignal.timeout(120 s)`. PixelLab v2 has no endpoint that lists jobs (only `GET`/`DELETE /background-jobs/{id}` and `/balance`), so automatic reconciliation is not possible. The flows' "Try again" is the resubmit. | robustTest: `/net` and `/gw` (502) lost after 1 POST in 70 s; `/busy` (503) resent; GET `/characters/…` retried |
| P1-4 | Key exposure on a shared origin. | The `ask` responder and the leader's `{ask:true}` are removed, and so is the follower's startup broadcast. A key crosses tabs only when the user types it, or presses Forget key (`''`), in a follower. README Deploy has a new section "Serve PixelDoll from its own origin" (custom domain or a user/org root site, never a `*.github.io` project path next to pages you do not control). The Connect sheet warns when Remember is on at a `*.github.io` project path, and its key fact line now says what is shared. | lockTest "nobody hands the key to an ask"; probe step 4 |
| P1-5 | Project records were updated with read-modify-write in separate transactions. | `db.update(store, key, fn)`: get and put in one readwrite transaction, with a synchronous mutator; a throw aborts. Used by `saveItem` (blobs first), `deleteItem`, `saveDress`, `renameProject` and `addBodyClip`. `addBodyClip` grafts only rig, base cells, base provenance, `baseHash` moves, skeletons and rigQa onto the **current** record. | db selfTest (3 concurrent updates = 3, throw aborts); probe: 20 concurrent = 20 |
| P1-6 | `splice(indexOf(g), 1)` returned −1 when Discard was clicked during Keep it. | A `settling` set by draft id makes the second action a no-op. `drop()` uses `findIndex` and splices only if `>= 0`. GenCard disables Try again and Discard while `busy`. | code; check |

## P2

| # | Fix |
|---|---|
| P2-7 | Create and Move "Try again" use a new seed. `poseItemClip(…, moveSeed)` adds the move seed to `seedOf`, so a move retry re-rolls item poses instead of reading the cached ones. With no seed, the old seeds are kept, so a resume still re-attaches. Note: create "Try again" therefore redraws the character (full price). |
| P2-8 | The leader adopts a key from a follower when it has none **or** is paused on `auth`. Forget key in a follower posts `''`, and the leader clears its key. `app.svelte.ts` mirrors `queue.key` into `app.key`, so the leader's UI shows the change. |
| P2-9 | Result downloads back off with `backoff(tries)` (via `lastPoll`). After 10 failures the sub-job is `failed`, with "Download manually: <urls>". robustTest: 10 GETs in 10 min, not 59/min. |
| P2-10 | Rehydrating the input blob now happens inside the `try`. Non-API errors are `failed` ("input image … missing from storage; nothing was sent"), never stuck in `submitting`. robustTest: failed, 0 POSTs. |
| P2-11 | A completed job with no images, or with inline base64 that is not a PNG (signature, IHDR, 1–2048 px) or has the wrong rgba length, becomes a `failed` sub-job with "malformed result" and no partial results. `decodePngBytes` checks the signature and IHDR and caps the size at 4096. robustTest "malformed result is not done". Frame-count checks stay with the callers, where they re-roll. P2-13: `poseItemClip` now throws instead of saving a direction with empty cells. |
| P2-12 | `main.ts` catches `queue.connect()` and shows a short static "PixelDoll can't open its storage" screen (details through `textContent`). `db.ts` adds `onblocked` (reject) and `onversionchange` (close). On PM request there is **no timeout**: a slow open in a big or hidden tab is not a failure. |
| P2-14 | The 1.5 s full `jobs` read is gone. `save()` posts `{rec: id}` and other tabs `get` only that record. A full re-read runs every 30 s as a fallback (1.5 s only without BroadcastChannel). On leader start, `cleanUp(7 days, false)` prunes finished records older than a week that nothing references. lockTest "follower mirror follows the leader by record id". Snapshot copies per emit are kept on purpose: Svelte keyed each-blocks need new item objects to re-render. |
| P2-15 | `db.gcBlobs()`: mark-and-sweep in one transaction over projects, jobs and blobs. Any 64-hex or `sha256:<hex>` string in any record counts as a reference (conservative). It runs **only** from "Clear finished" in the leader, and only while nothing is generating or saving in that tab (queue idle, no running drafts, no accept, no create/move). Ceiling, marked with a `ponytail:` comment: a follower's demo copy writes its blobs one transaction before its record. |
| P2-16 | `App.svelte`: M1–M5, Home, TopBar and SelfTest are dynamic imports inside `import.meta.env.DEV ? {…} : {}`. In prod, every route is the Studio. All harnesses still work in dev. |

## Simplifications (dead code only)

- `routes.ts`: removed `inpaintProFlash`, `inpaintV3`, `editImagesV2`, `transferOutfitV2`, `balance`, `job`, `cancelJob`, their request interfaces, and the unused `SkeletonResponse`/`Keypoint`. `CharacterAnimation.mode` narrowed to `BaseAnimMode`, so the banned template/pro modes no longer type-check.
- `zip.ts`: removed `unzip` (only its self-test used it; there is no project import). The zip self-test now checks headers, CRC and method.
- `create.ts`: the duplicate `terminal`/`settled` helpers are replaced by `queue.settled()` and `live()`. `run.ts` keeps its copy: it is T3's file, so I made only the two surgical edits (seed, P2-13).
- Not touched: `diff.ts`, `itemRoute.ts`, the `route === 'none'` branches (T3 and M3 use them), and canvas `encodePng` (the browser PNG test uses it).

## Docs

README Deploy (origin isolation), architecture §7 (retry and lost rules, download give-up).

## Open

- `app/public/t3-dev.js` (untracked, T3) sits in `public/`, so `vite build` copies it into `dist/` and the Pages deploy would publish it. Move it out before deploying.
- Activity "Stop" in a follower still sends DELETE with the follower's key (R6 P3). Followers can no longer start work, so this is rare.
- There is no one-click "Resubmit" for a `lost` record. The flows' "Try again" (new seed) covers it.
