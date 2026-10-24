# R6 — Code review of `app/src/**` (review only, no code changed)

Reviewer: R6 · Date: 2026-10-21 · Base: `main` @ `3e0d2b9` plus the uncommitted T3/B11 working tree at review time
(`aseprite.ts`, `g2Fails`, pages workflow). Line numbers refer to that snapshot and may shift by a few lines.

Read: PLAN.md, architecture v1.3, manifest-spec v1.3.1, every file under `app/src`, `index.html`, `vite.config.ts`, `scripts/`.
Ran: `npm run selftest` (all pass), `npm run check` (0 errors, 0 warnings), `vite build` into a scratch dir (425 KB JS / 146 KB gz),
a sourcemap size breakdown, and a node probe of the queue (`r6_queue_checks.ts`, in the session scratchpad, no network). Results
of the probe are quoted where used.

**CONFIRMED** = reproduced by a probe or followed end to end in the code. **PLAUSIBLE** = the code path exists, but the trigger
depends on timing or on server behavior I could not reproduce offline.

## Summary

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | P1 | Every tab resumes drafts, creates and moves: duplicate re-rolls, a stale tab overwrites `studio-drafts`, and the leader submits same-seed requests from two tabs twice | CONFIRMED |
| 2 | P1 | "Clear finished" deletes ledger records that live drafts, creates and moves still depend on, so a resume pays again or the item is lost | CONFIRMED |
| 3 | P1 | A paid POST is resubmitted after a network error or 5xx, although the server may already have created the job | CONFIRMED (2 POSTs); charge PLAUSIBLE |
| 4 | P1 | On a shared `*.github.io` origin, any same-origin page can get the memory-only key with one `BroadcastChannel` message | CONFIRMED |
| 5 | P1 | Project records are read-modify-written in separate IndexedDB transactions; `addBodyClip` holds a long window, so an item accepted during it is lost | PLAUSIBLE |
| 6 | P1 | `gens.splice(gens.indexOf(g), 1)` with -1 removes an unrelated draft (Discard clicked while Keep it is in flight) | CONFIRMED |
| 7 | P2 | "Try again" can never fix a bad but *done* seeded result: create/move retries reuse the cached record; item poses ignore the move seed | CONFIRMED |
| 8 | P2 | The leader ignores a new key typed in a follower tab after its own key was rejected; Forget key in a follower does not stop the leader | CONFIRMED |
| 9 | P2 | A failing storage download is retried every 1 s forever (59 GETs/min, job stays `running`) | CONFIRMED |
| 10 | P2 | A missing input blob leaves a record stuck in `submitting` (holds a slot; a reload calls it "may have run") | CONFIRMED |
| 11 | P2 | A malformed `completed` response (no or invalid base64) becomes a `done` record with partial results | PLAUSIBLE |
| 12 | P2 | `main.ts` top-level `await queue.connect()` has no catch: blank page when IndexedDB is unavailable | PLAUSIBLE |
| 13 | P2 | `poseItemClip` silently drops a direction after two frame-count mismatches (empty cells, still saved) | CONFIRMED |
| 14 | P2 | Ledger cost: the whole `jobs` store is read every 1.5 s and deep-cloned on every emit, and it never shrinks | CONFIRMED |
| 15 | P2 | No blob garbage collection, and every frame is stored twice (output PNG + normalized cell) | CONFIRMED |
| 16 | P2 | Dev harnesses (M1–M5, `#/selftest`) ship in prod: about 90–100 KB of 425 KB, and the harness routes can spend credits | CONFIRMED |

No P0 found. Verified OK: no `{@html}` anywhere; the dev-key plugin is `apply: 'serve'`, its fetch is `import.meta.env.DEV`-gated,
and grep finds no `__dev`/`pixellab-key` in the prod bundle. The key appears only in the `Authorization` header and is never in
the ledger, provenance, exports or logs (`ApiError` messages carry path, status and server text only). Export names are escaped
(Godot `JSON.stringify` plus sanitized node names; Unity/Phaser sanitize too). Item ids are slugs and anim ids are
regex-validated, so zip paths cannot traverse. Project zip **import does not exist** (`unzip` is only called by its self-test),
so zip import has no path-traversal or zip-bomb surface today.

---

## 1. Correctness

### P1-1 Cross-tab: duplicated orchestration and lost draft writes — CONFIRMED
- `studio/state.svelte.ts:316-323` (`loadGens`), `:424-429` (`resumeCreate`), `:459-465` (`resumeMove`). They are called from
  `Studio.svelte:31-37` in **every** tab. `runningGens` is per tab only.
- Scenario A (double pay): the browser restores two PixelDoll tabs. Both tabs call `runItem` on the same running draft. When a
  gate fails, each tab calls `rerollCall` with its **own random seed** (`run.ts:110-118`) and enqueues a different paid request.
  Then both call `saveGens`, the last writer wins, and the other tab's re-roll is paid but orphaned.
- Scenario B (lost draft): tab B loaded `gens` earlier. Any `saveGens` from tab B (progress persist) writes B's stale list over
  A's newer list (`state.svelte.ts:310`). A draft started in tab A disappears after a reload, and its paid calls are orphaned.
- Scenario C (same seed): even identical seeded requests (create/move resume) are paid twice. The follower's dedupe only sees
  its 1.5 s-old mirror, and the leader's `merge()` (`queue.ts:224-232`) adopts every unknown record without checking
  `requestHash`. Probe 3: two tabs enqueue `/create-character-v3` with seed 42 → **2 POSTs**.
- Fix: (a) run `loadGens`/`resumeCreate`/`resumeMove` only when `queue.role !== 'follower'`, and re-run them when a follower
  becomes leader (`lead()`). (b) In `merge()`, when an incoming record's `requestHash` equals one of mine that is
  queued/running, or done and seeded, mark the incoming one `cancelled` with `error: 'duplicate of <id>'` and let the
  follower's waiter follow the original. The lazy version: `settled()` in run/create looks up by `requestHash`, not id.
  About 10 lines.

### P1-2 "Clear finished" breaks live work — CONFIRMED
- `queue.ts:490-497` deletes every terminal record. `ActivitySheet.svelte:68` exposes it.
- Drafts reference records by `recId` (`run.ts:104` `if (!recOf(recId)) submit(...)`). Create and move rely on the
  seeded-request cache in the same ledger.
- Scenario: an item is generating (dress done, poses running). The user clicks **Clear finished**, then reloads, or the runner
  re-evaluates:
  - `runCall` finds no record for the dress and the done poses, so it **re-POSTs** them (10 + 3×n gens).
  - The new dress has a different design from the poses already done.
  - Without a reload, `evaluateItem` skips the missing calls, `acceptItem` throws "not all calls are done", and the item is lost.
- Fix: skip records referenced by `gens[*].draft.calls[*].{recId,old}`, by the active create/move, or created in the last
  N minutes. Or turn "Clear finished" into a view filter (hide, don't delete). About 5 lines.

### P1-3 Paid POST resubmitted after network error / 5xx — CONFIRMED (2 POSTs), charge PLAUSIBLE
- `client.ts:22` classifies `0`, `423`, `429` and `>=500` as `retry`. `queue.ts:367-370` then puts the record back to `queued`
  and POSTs again.
- Status `0` means `fetch` rejected after the request may already have reached PixelLab (connection reset, tab sleep, a gateway
  502/504 without CORS headers that surfaces as `TypeError`). Probe 5: `/edit-animation-v2` with a network error → **2 POSTs**.
- Architecture §7 says both "backoff on 5xx/network submit errors" and "resubmit a paid POST only when the job reports
  `failed`". These conflict, and the code follows the first.
- Fix: auto-retry only `429`/`423`, which are definitely rejected. On `0`/`502`/`504` for a POST, set the state `uncertain`
  ("may have run, check pixellab.ai"), the same as the existing `submitting` → `lost` rule. Offer a one-click Resubmit in
  Activity. Also add an `AbortSignal.timeout` (e.g. 120 s) so a hung POST cannot hold a slot forever.

### P1-5 Lost updates on project records — PLAUSIBLE
- `store/project.ts:50-62` (`saveItem`), `:64-69` (`deleteItem`), `dress/project.ts:56-64` (`saveDress`),
  `state.svelte.ts:289-297` (`renameProject`) and `studio/create.ts:294 → 332` (`addBodyClip`) all do `get` → modify → `put`
  in two separate transactions.
- `addBodyClip` reads `fresh` and then awaits about 30 `cellHash` + PNG encode + blob writes before its `put`. Meanwhile the
  Studio says "you can keep working":
  - an **item accepted** in that window is dropped (a paid item is lost);
  - autosaved dress edits in that window are reverted.
- Fix: one helper, `db.update(store, key, (rec) => rec)`, that does `get` + `put` in one `readwrite` transaction with a
  synchronous mutator. Do all async work (hashing, blob writes) first, then call `update`. About 10 lines in `db.ts`, plus
  5 one-line call-site changes.

### P1-6 `splice(indexOf(g), 1)` with -1 — CONFIRMED
- `state.svelte.ts:371` (`acceptGen`) and `:377` (`discardGen`).
- Scenario: the user clicks **Keep it**. `acceptGen` awaits `loadProject` and `acceptItem` (decoding every cell takes about
  1 s). The **Discard** button is not disabled during this, and the user clicks it: `discardGen` removes `g`. When
  `acceptGen` resumes, `indexOf` is -1, so `splice(-1, 1)` removes the **last draft in the list**, which can be a different,
  still-running item. Its paid calls are orphaned.
- Fix: `const i = gens.indexOf(g); if (i >= 0) gens.splice(i, 1)`. Also disable Discard/Try again while `busy`.

### P2-7 Retries reuse cached "done but bad" results — CONFIRMED
- `create.ts:111`: `motion()` throws "PixelLab dropped the direction (busy). **Try again.**" But "Try again"
  (`CreateSheet.svelte:118`, `MoveSheet.svelte:42`) reuses `creating.spec`/`moving.spec` with the **same seed**. `enqueue`
  returns the cached done record (`queue.ts:285`), so the same error repeats forever. The same applies to `renderClip`'s
  "wrong number of frames" (`create.ts:102`): both attempts (`seed + attempt*7919`) are cached.
- `run.ts:269`: `seedOf(item/anim/dir/attempt)` ignores `MoveSpec.seed`, and authored keypoints depend only on the rest pose.
  So re-adding a move with `replace` re-uses the **same two cached item poses**, and a bad item pose can never be re-rolled.
- Fix: "Try again" bumps `spec.seed` (one line in each sheet). Include `spec.seed` in `seedOf`. Optionally, enqueue with
  `{ fresh: true }` to skip the cache.

### P2-8 Key hand-off between tabs — CONFIRMED
- `queue.ts:185` adopts a broadcast key only `if (!this.key)`. A leader that has paused on `auth` keeps its rejected key, so a
  new key entered in a follower tab is ignored. Probe 4 confirms the condition. The follower UI shows "connected", but jobs
  stay paused.
- `app.svelte.ts:216` `forgetKey()` in a follower clears only that tab. The leader keeps spending with the key the user just
  "forgot".
- Fix: adopt when `!this.key || this.paused === 'auth'`. Broadcast `{ forget: true }` on forget, and have the leader clear its
  key. About 3 lines.

### P2-9 Download retry storm — CONFIRMED
- `queue.ts:330`: a sub-job with `remoteDone` runs `download()` on **every 1 s tick**, with no backoff, attempt count or
  terminal state. Probe 2: a 403 from storage → **59 GETs in 60 ticks**, and the record stays `running` forever.
- A CSP block (a storage host outside `connect-src`) shows the same behavior.
- Fix: reuse `lastPoll` + `backoff()`. After about 10 failures, mark the sub-job failed with the URL kept (and "download
  manually" in the error).

### P2-10 Missing input blob → stuck `submitting` — CONFIRMED
- `queue.ts:342-353`: the `$blob` rehydration happens **before** the `try`. A missing blob throws into `guard` (logged only).
  The record stays `submitting` in memory, so its concurrency slot is gone. After a reload, `load()` rewrites it to
  `lost: page closed during submit; the job may have run`, which is wrong, because nothing was sent. Probe 1: state
  `submitting`, 0 POSTs.
- Fix: move the hydration inside the `try`, and map the error to `failed` (`input blob missing`).

### P2-11 Malformed `completed` response → partial `done` — PLAUSIBLE
- `queue.ts:415-423` sets `remoteDone = true` before decoding the inline images.
- `base64ToBytes(im.b64 ?? im.rgba!.b64)` throws on `undefined` or invalid base64 (`png.ts:170`). The next tick's `download()`
  then marks the sub-job `done` with the images saved so far.
- Downstream G1 catches this and re-rolls, which costs gens.
- Fix: validate first (`typeof im.base64 === 'string'`), and set `remoteDone` only after the loop. If validation fails, set
  `s.error` and `failed`.
- Related hardening: `decodePngBytes` (`pngraw.ts:233`) does not check the PNG signature or IHDR, and does not cap the size,
  so a bogus blob can try to allocate `w*h*4` from random bytes. Check the signature and `w,h <= 1024`. `fetchBytes` should
  check `content-type`.

### P2-12 Blank page without IndexedDB — PLAUSIBLE
- `main.ts:8` calls `await queue.connect()` before `mount`.
- If `indexedDB.open` rejects (blocked site data, some private modes, quota) or never resolves (blocked by an
  old-version tab; `db.ts` has no `onblocked`/`onversionchange`), the app never mounts.
- Fix: `queue.connect().catch(e => console.error(e))` without `await`, and mount anyway. Add `db.onversionchange = () =>
  db.close()` for the first schema bump.

### P2-13 Silent missing direction in `poseItemClip` — CONFIRMED
- `run.ts:286-300`: if both attempts return the wrong frame count (`continue`), `last = []` and no provenance is pushed.
- If at least one other direction worked, `buildItem` fills that direction with `null` cells and `saveItem` writes it. The item
  vanishes in that view of the move.
- `missingAt` only notices if the whole layer has no cells there.
- Fix: throw for that direction, or return it in `q.warnings` and surface "X has no <move> <dir> frames" in the move result.

### P3 correctness notes
- `queue.ts:469-471`: a follower's `cancel` of a running record calls DELETE with the follower's key, which is often empty, and
  swallows the error, so nothing happens. A follower's cancel of a record its stale mirror still shows as `queued` writes the
  whole stale record over the leader's (`save(r)`). It self-heals on the leader's next save. Send cancels to the leader over
  the channel instead.
- `queue.ts:404-414`: only `failed`/`cancelled`/`completed` are terminal. Any other server status (e.g. `error`, `expired`) is
  polled every 5 s forever. Add a max age (architecture §7 says up to 40 re-polls; the code has no limit).
- `run.ts:58`, `create.ts:65`: outputs are sorted by `+label`. Labels like `south/3` give `NaN` and rely on stable-sort
  insertion order. Parse the trailing index (create.ts already does) in `outputsOf` too.
- `run.ts:175`: the module-level `decoded` image cache is unbounded (16–36 KB per frame, every re-roll, all session).
- `ConnectSheet.svelte:15-17`: `setKey(k, remember)` stores the key in `localStorage` **before** the balance check, so a
  rejected key stays remembered. It also calls `/balance` twice (inside `setKey` and again in `use`).
- `state.svelte.ts:122-150`: two quick `openProject` calls race, and the slower one wins (the stage can show A while the menu
  says B). Guard with a request counter.
- `deleteItem` (`project.ts:64`) leaves the item's materials in `m.materials` (owner gone). They still claim colors in
  `deriveMaterials` and are exported.
- `acceptGen`/`removeItem` → `openProject` clears undo/redo. Fine for an MVP, but worth knowing.
- Provenance formats differ: base clips store raw `params` with `{$blob}` (`create.ts:120`), while items map to `{sha256}`
  (`run.ts:243`). Use one `toProv` for both.
- Docs drift: arch §7 says concurrency default **8** (code `queue.ts:128` is 3), "re-poll up to 40×" (unlimited), and the
  §4.2 `inpaint-grid` fallback (not implemented: `retry()` goes re-roll → key switch → review). The project zip import is not
  implemented either.

Checked and fine: pivot/cell math (normalize floor pad, `pivotOf`, `layerFrame`/`unionFrame`, Godot `offset = -pivot`, Unity
`(x/w, 1 − y/h)` with bottom-left rects, Phaser normalized pivot); mirroring (pixel `flipX = w−1−x` vs continuous `w − x` is
consistent; the export validator rejects off-center oversize layers on mirrored rigs); straight-alpha `over`; fg/bg split
recomposes exactly; binary alpha everywhere (premultiply loss is irrelevant); undo/redo snapshots (`dressOf`/`applyDress`
round-trip; slots without overrides are written as `[]`, items without hides as `null`).

## 2. Security and privacy

### P1-4 Key and project data on a shared GitHub Pages origin — CONFIRMED (by reading)
- The pages workflow being added deploys to `https://<user>.github.io/PixelDoll/`. The **origin is shared by every Pages
  project of that account**.
- Any page on that origin (another repo, a demo with third-party scripts, an XSS anywhere) can:
  - run `new BroadcastChannel('pixeldoll-queue').postMessage({ask:true})` and receive the **memory-only** key
    (`queue.ts:186` answers anyone who asks);
  - read `localStorage['pixeldoll.apiKey']`;
  - read the whole IndexedDB (projects, ledger, prompts).
- This undercuts "memory by default". `ConnectSheet` says "Sent only to api.pixellab.ai".
- Fix before any public deploy:
  1. Serve from a dedicated origin (custom domain, or a dedicated `*.github.io` user/org site with nothing else on it).
  2. Drop the `ask` responder: followers send the key only when the user types it (`setKey` share). Then a passive same-origin
     page cannot pull the key.
  3. Say "shared with other PixelDoll tabs on this site" in the Connect sheet.

### P2 Privacy and security notes
- Provenance and `CREDITS.csv` in exports carry PixelLab `jobId`s, `character_id` (`/characters/animations` params) and full
  prompts. This is intended (credits trail, spec §5) and contains no secret, but the user should know a shared export carries
  account-linked ids. Mention it in the export README, or drop `character_id` from exported params.
- The pages workflow publishes `public/fixtures` (S1/S2 team outputs). D7 says the demo is "private mockup phase; revisit before
  public release". Decide before enabling Pages.
- Clickjacking: GitHub Pages cannot send `frame-ancestors`/`X-Frame-Options`, and `<meta>` CSP ignores `frame-ancestors`. A
  hostile site could frame PixelDoll and redress "Make · 37 gens". A 2-line `if (top !== self)` guard on spending actions is
  enough.

### P3 CSP (`index.html:7`)
- `connect-src 'self' https://api.pixellab.ai https://backblaze.pixellab.ai https://supabase.pixellab.ai https://cdn.pixellab.ai`
  is adequate: all 19k storage URLs in the spikes are `backblaze.pixellab.ai`. With P2-9 fixed, an unexpected host fails
  cleanly instead of storming.
- `img-src https://*.pixellab.ai` is unused (all images are blob/canvas). Tighten it to `'self' blob: data:`.
- There is no `worker-src`; the fallback to `script-src 'self'` covers the same-origin ticker worker.
- Add `form-action 'none'`.
- `style-src 'unsafe-inline'` is required by Svelte `style:` directives. That is acceptable, because no remote strings reach
  styles.

Other P3 notes:
- `vite.config.ts:334` `/__dev/save` lacks the Host check that `/__dev/pixellab-key` has. Vite 8's `allowedHosts` already blocks
  DNS rebinding, so this is defense in depth only.
- XSS: every remote or user string (item names, prompts, `r.error`, server `errorText`) goes through Svelte text interpolation.
  No `{@html}`, `innerHTML` or `eval`. OK.

## 3. Over-engineering and dead code (ponytail lens)

| Cut | Where | Replace with | Saves |
|---|---|---|---|
| Dev harness pages in prod | `ui/M1–M5`, `TopBar`, `Home`, `SelfTest`, `BlobImg` (1,572 lines); `App.svelte` routes | Delete them (the Studio supersedes M1/M3/M4/M5; keep M2 only if rig debugging still matters), or `if (import.meta.env.DEV) await import('./ui/M2.svelte')` | ~1,500 lines, ~55 KB min JS |
| `#/selftest` in prod | `lib/selftests.ts` imports every module's `selfTest` | Browser self-tests only in DEV (dynamic import); node `npm run selftest` unchanged | ~35 KB min JS (61 KB of selfTest source) |
| Helpers only harnesses use | `keyHeatmap`, `contactSheet`, `skeletonOf`, `dress/project.ts listSources/FIXTURES`, `BlobImg` | Go with the harnesses | ~60 lines |
| Diff extractor | `image/diff.ts` (95), the `route === 'none'` branches in `items.ts`/`run.ts` (~15) | Reachable only from M3 (the Studio always picks a chroma key) | ~110 lines |
| Unused route builders | `routes.ts`: `inpaintProFlash`, `InpaintV3`, `EditImagesV2`, `TransferOutfitV2`, `balance`/`job`/`cancelJob`; `mode: 'template' \| 'pro'` (banned by D8) still in the type | Delete; narrow `mode` to the allowed models so banned modes do not type-check | ~45 lines |
| `unzip` | `store/zip.ts:84-111` (only its self-test calls it) | Delete until project import exists | ~28 lines |
| Canvas `encodePng` | `image/png.ts:146-151` + test | `encodePngBytes` is used everywhere | ~8 lines |
| One-implementation interface | `studio/itemRoute.ts` (`ItemRoute` + `chromaEdit` + `itemRoute = chromaEdit`) | Call `run.ts` directly; move `coverage()` next to `newDraft` | ~35 lines |
| Duplicated helpers | `terminal`/`settled` (`run.ts:49-57` = `create.ts:46-55`); `pipe` (`zip.ts` = `pngraw.ts`); `dilate` (`diff.ts`, `items.ts`); "set of opaque colors" ×4 (`clips.rgbOf`, `items.colors`, `diff.palette`, `palette.colorCounts`); `slug` ×3 (`run.ts`, `MoveSheet`, `savePreset`); `lsGet` ×3 (`app.svelte.ts`, `state.svelte.ts`, `ExportSheet`/M4); `putCell` (`create.ts`) vs the blob loop in `saveItem` | One exported copy each: `queue.settled(id)`, `pngraw.pipe`, `chroma.dilate`, `palette.colorCounts`, `model.slug`, one `ls` helper, `project.putCell` | ~60–80 lines |
| Deprecated field still written | `Item.extractor` (`items.ts:672`) | Drop (v1.3 has `route`) | 2 lines |
| Dead ternary | `Stage.svelte:23` `phone ? 64 : 64` | `const barH = 64` | — |

Total: roughly **1,900 lines** deletable and about **90–100 KB** (23 %) off the prod JS, with no user-visible change.
`items.ts` (780 lines) is the one file that has earned its size; its gate code could move to `items/qa.ts` (G1–G10 + H4,
about 300 lines) for readability. That is an optional, cosmetic change.

## 4. Performance

- **Bundle** (sourcemap breakdown of 396 KB mapped minified JS):

  | Part | Size | Share |
  |---|---|---|
  | `src/studio` | 116 KB | 29 % |
  | `src/ui` harnesses | 55 KB | 14 % |
  | Svelte runtime | 53 KB | 13 % |
  | `lib/items` | 42 KB | 11 % |
  | `lib/rig` | 24 KB | 6 % |
  | `@lucide/svelte` | 20 KB | 5 % |
  | `lib/export` | 20 KB | 5 % |
  | dress / pixellab / image | 18 + 18 + 15 KB | |

  Lucide **is** tree-shaken: 51 icon modules at about 390 B each through `studio/icons.ts`. Biggest wins: the harness and
  selftest split (§3). Optionally `import()` the exporters when the Export sheet opens (−20 KB).
- **P2-14 Ledger polling**:
  - The leader `merge()` (`queue.ts:224`) runs `db.all('jobs')` every 1.5 s. A follower `sync()` does the same.
  - `snapshot()` deep-copies every record on every `emit`, and there are several emits per tick. Each emit fans out to every
    subscriber: Svelte `$queue`, `run.ts`'s module subscription, and every pending `settled()` waiter (each does a `find`).
  - The ledger grows by about 40 records per item and is never pruned. Pose records hold 8×18 keypoints (about 5 KB each).
    After a few items, that is megabytes structured-cloned every 1.5 s on the main thread.
  - Fix: followers post `{ enq: id }` / `{ cancel: id }` on the BroadcastChannel and the leader `get`s only those ids (keep a
    30 s full merge as a fallback). Snapshot lazily (version counter). Auto-prune done records that no draft, create or move
    references, older than 7 days.
- **P2-15 IndexedDB growth**:
  - Nothing ever deletes a blob (`del('blobs')` appears only in the self-test).
  - Every frame lands twice: the job output PNG keyed by file hash (`queue.putBlob`) and the normalized cell keyed by RGBA
    hash (`putCell`/`saveItem`).
  - Re-rolls, discarded drafts, removed items and cleared jobs all leave their blobs.
  - Fix: a mark-and-sweep `gcBlobs()` (refs = rest views + layer cells + dressed keyframes of every project, plus `inputs` and
    `results` of the remaining job records). Run it after `clearFinished`/`removeItem`/`discardGen`. About 25 lines.
- **Main-thread image work**:
  - `evaluateItem` (`run.ts:181`) extracts and gates about 100 cells per item on the main thread. `bestShift` runs twice per
    cell (9 IoU passes each), `trimToKeyframe` 25 shifts, `simAligned` 9 passes. That costs hundreds of ms per evaluation. It
    runs after each call batch and again on load for every draft in review.
  - Fine for an MVP. Later, move `evaluateItem` into a Worker (it is pure over `Img`). At minimum, reuse the first
    `bestShift` result for `shifted` in `extractCell` (`items.ts:385` vs `:402`).
- **Recolor LUT**: `View.project` (`state.svelte.ts:107`) re-runs `recolor` on every `doc.rev`. The index table is cached
  per image (`dress.ts:101`), but `applyIndex` allocates a **new image for every cell of every recolored item** on every edit,
  including Wear/Take off, which changes no colors. Fix: key the derived value on `doc.variants` only, or cache by
  `(img, table signature)`.
- **Canvas redraw**: one compose per visible sprite per frame tick (every 100–150 ms) is fine. For each mirrored layer,
  `cellImg` allocates a `flipH` copy every tick (`compose.ts:66`). `Sprite.svelte:15` copies the pixel buffer again before
  `ImageData`. A `Map` of composites keyed by `rev|anim|dir|cell`, cleared on `rev` change, removes all steady-state
  allocation (about 6 lines).

## 5. Maintainability and AGENTS.md consistency

- **Stack matches AGENTS.md:** Svelte 5 + Vite 8 (no SvelteKit), TypeScript, fully client-side, relative `base: './'` for
  Pages. `npm run check` is clean, and `selftest` covers every lib module plus the queue's lock protocol.
  Suggestion: add `npm run check` to the pages workflow (it runs only selftest + build).
- **File sizes are OK for a spike:**

  | File | Lines | Note |
  |---|---|---|
  | `items.ts` | 780 | |
  | `queue.ts` | 615 | 115 of them tests |
  | `state.svelte.ts` | 469 | |
  | `create.ts` | 345 | |
  | `unity.ts` | 353 | mostly C# template text |
- **Line length is the main readability cost:** many 200–400 character one-liners (e.g. `items.ts:551`, `:666`;
  `queue.ts:81`; `run.ts:14`; `ActivitySheet.svelte:40`). They are hard to review and diff, and they hid two of the bugs above
  (`splice(indexOf)`, hydration outside `try`). A formatter at `printWidth: 140` would fix this mechanically.
- **Comments are dense and evidence-tagged (S3, B9, T1 …).** That is good for provenance, but some comments have become
  changelogs ("B7 live: …", "M3: …"). Keep the rule and drop the history.
- **Two vocabularies for one concept:** `Method = 'skel' | 'anchor'` (`items.ts`) and manifest `route = 'skeleton-pose' |
  'ea2-anchor'`. `slot.class` uses `rigid`, while the architecture table says `head`. Pick the manifest words.
- **Trust-boundary typing:** responses are cast (`r.response as {...}`) and never validated. Examples: `estimate-skeleton`
  keypoints (`create.ts:77`; NaN x/y would pass `hasAll` and be clamped to NaN by `toApi`), and `character_id`. A 10-line
  `num(x)` / `str(x)` guard at the two parse sites is enough.
- **In-flight work (not reviewed in depth):** `aseprite.ts` and the `g2Fails` change belong to T3/B11. `ExportSheet` already
  lists "Aseprite". Make sure the engine produces a `.aseprite` file before that option ships.

## Suggested order

P1-6 and P2-10 (one line each) → P1-2 (protect referenced records) → P1-1 (role-gated resume + merge dedupe) → P1-3 (no
automatic resubmit on 0/502/504) → P1-5 (`db.update` single-transaction helper) → P1-4 (deployment origin + drop `ask`) →
P2-7/8/9 → harness/selftest split (bundle −23 %) → blob GC and ledger pruning.
