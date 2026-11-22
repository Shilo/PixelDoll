# PixelDoll storage and sync: independent lead research (B)

Date: 2026-11-22. No repo files changed; nothing run besides read-only greps. Confidence tags: [V] verified on a primary source this session, [C] community or secondary source, [K] my prior knowledge, not re-verified.

## Bottom line

Do not adopt a sync database. PixelDoll's data is already shaped for a small custom protocol: images are immutable and content-addressed (sha256), and the only mutable thing is one manifest JSON per character. Build a thin, provider-agnostic sync layer (about 1,500 lines plus heavy tests) where each device writes only its own files, blobs upload before manifests, merging is a three-way merge per item (per cell where possible) and any true conflict keeps both versions. Remote = the user's own Google Drive (first) and Dropbox (second), using app-scoped permissions. Keep the existing ZIP backup as the always-available exit.

## (1) Repo assessment

- Persistence is IndexedDB database `pixeldoll` with three stores (app/src/lib/store/db.ts): `projects` (key `rig-<id>`, value StoredProject: id, savedAt, manifest, skeletons, rigQa, restoredFrom ...), `blobs` (sha256-hex keyed Blobs), `jobs` (PixelLab queue ledger).
- Blobs are immutable and named by pixels. Union-merge, idempotent upload and "interrupted upload" safety come for free. GC (`gcBlobs`) is local and must not mirror to the remote automatically.
- Mutable state is the manifest (app/src/lib/store/manifest.ts): `items[]` each with stable `id`, `slot`, `status`, `layers`, `coverage: CellKey[]` (`anim/dir/frame`), `provenance`, `frameEdits`. Per-item and per-cell merge is plausible. Whether `layers` is keyed by CellKey or an array decides how clean the "frame 1 vs frame 2" merge is: [unverified, needs a look at `Layer`].
- A character is one record, so today any edit rewrites the whole record. Sync needs a stored "last synced base" per character to do three-way merges.
- Do NOT sync: `jobs` (the paid ledger uses leader election via BroadcastChannel; syncing it risks two devices re-sending the same paid generation; REQUEST_TEXT versioning also ties it to a build), the PixelLab key (`localStorage['pixellabApiKey']`, per docs/shared-token-security.md; never in a remote file), `pixeldoll.agentKey`, locale, per-device UI state. Sync: characters, referenced blobs, export settings (`export-settings.ts`), maybe outfits/preset prefs if they live outside the manifest.
- Existing backup/restore (backup.ts, workspace.ts, zip.ts): private ZIP `pixeldoll-backup/1`, additive restore, `characterFingerprint` content hashing, `restoredFrom` lineage. Reusable: the fingerprint for change detection, zip for the manual escape hatch and for provider migration. It is manual only; docs/known-issues.md line ~279 says "no account or cloud sync".
- Gaps: no `navigator.locks` use (queue uses BroadcastChannel; add a Web Lock for the sync leader); no `storage.persist()` call visible except `askPersist` in db.ts (exists, check it is used); no device id; no tombstones; `deleteCharacter` is a hard delete.
- No-backward-compat rule in AGENTS.md means the sync metadata can be added as new fields/stores without migrations.

## (2) Library comparison

| Option | Writes to user's own drive? | Dev-funded server needed? | Blobs | Conflicts | Verdict |
|---|---|---|---|---|---|
| RxDB 17 Drive/OneDrive replication plugins | Yes (Drive `drive` or `appDataFolder`, OneDrive) [V rxdb.info/replication-google-drive.html] | No | Base64 inside the doc JSON (+33%, one file per doc) | RxDB conflict handler, "master-slave" assumption, lock file, 10s timeout | Beta ("may break without major version"), needs migrating PixelDoll's whole IndexedDB layer to RxDB, premium status of parts unclear. Closest off-the-shelf, still reject. |
| remoteStorage.js 2.0 beta | Dropbox and Google Drive backends exist [V docs; C maintenance] plus remoteStorage servers | No | Path documents, ETag-based | Protocol uses ETag/If-Match, last-writer-wins style folder sync | Old, still beta, Drive/Dropbox backends lightly maintained (last fixes 2022-23 seen) [C]. Poor fit for megabytes of blobs. |
| Automerge / Yjs | No (needs own transports; automerge-repo storage adapters could target Drive with custom code) | Relay for live sync | Not designed for blobs | Auto-merge CRDT | Overkill: want "keep both", not silent merges; JSON arrays like `baseCut` merge badly. |
| Jazz | Jazz Cloud or self-hosted sync | Yes (Cloud free tier terms unclear, alpha) [C] | Yes | CRDT | Vendor/relay dependence violates "stay functional if discontinued" and zero-dev-cost. |
| Evolu | Relay (free test relay, self-host) | Yes | Unclear | CRDT (SQLite) | Same. |
| TinyBase | Synchronizers over WS/BroadcastChannel; no drive | Needs server for cross-device | No | CRDT-ish | No. |
| Dexie Cloud | Hosted | Yes, 3 free production users [C] | Limited | Per-field | Developer or user-paid hosted backend. Reject. |
| PouchDB/CouchDB | Needs CouchDB | Yes | Attachments | Rev tree | Needs a server. Reject. |
| Firebase / Supabase BYO project | User creates own project | No but heavy setup | Yes | Custom | Casual users will not create backend projects; Supabase free projects pause after a week idle [V supabase docs]; Firebase Storage free terms unclear [C]. Reject as default. |
| File System Access API to a locally synced folder | Via desktop sync clients | No | Plain files | None | Chromium only; Safari/iOS and Firefox unsupported [V caniuse]. No phones. Optional desktop extra only. |
| WebDAV | Some hosts | No | Yes | ETag | CORS rarely enabled on consumer WebDAV. Advanced users only. |
| Improved manual backup | n/a | No | ZIP | n/a | Keep; fails "automatic" and "recover after wipe without having kept a file". |
| Custom thin engine (recommended) | Yes | No | Native | Item/cell three-way, keep both | Chosen. |

Answers to the challenges: a library cannot do it today without the dev hosting a relay, or without adopting a beta DB. CRDTs are overkill because the product's stated conflict behavior is "detect and keep both", edits on the same item across devices are rare, and content-addressed blobs need no CRDT. A custom engine is justified but small, because the hard parts (immutable blobs, single-writer files) are designed away.

## (3) Provider comparison

| | Google Drive | Dropbox | OneDrive (personal) | Box / pCloud / others |
|---|---|---|---|---|
| Free storage | 15 GB shared with Gmail/Photos [K] | 2 GB; Basic limits linked devices to 3 [C, 2019 sources, no removal found] | 5 GB shared with Outlook/Office [V Microsoft FAQ search] | Not evaluated; consumer API/CORS support unknown |
| App-scoped access | `drive.file` and `drive.appdata` are both non-sensitive [V]; appData folder is hidden from user, files cannot be shared/trashed [V] | App folder permission [K] | `Files.ReadWrite.AppFolder`, personal accounts only, "preview" [V] | |
| Verification burden | Non-sensitive scopes: no security review; need consent screen published, privacy policy, domain [K]. Testing mode tokens expire in 7 days [K] | Dev apps start limited; production approval needed past a user threshold [K] | Multi-tenant app registration, free; publisher verification optional [K] | |
| SPA OAuth | GIS token model: ~1h access tokens, no refresh token; renewal needs a re-request (silent when session allows, else popup gesture) [V docs: "no refresh tokens" for token model]. Code flow + PKCE still demands `client_secret` for Web clients [C, reported by several 2025 sources] so no secret-free refresh | PKCE without secret for SPAs [V]; refresh tokens possible with `token_access_type=offline`, though Dropbox's guide recommends short-lived PKCE tokens for browser apps [V] | Auth code + PKCE with `spa` redirect, CORS on token endpoint [V]; refresh token hard-capped at 24h, then a top-level redirect re-auth (no third-party cookies in Safari) [V] | |
| CORS | Yes [K] | Yes for API; `list_folder/longpoll` must use `notify.dropboxapi.com`, preflight issues reported [C] | Yes (Graph) [K] | |
| Conditional write / CAS | None documented on `files.update` (no If-Match param in v3 reference) [V] | `mode: update` + `rev` fails on mismatch (autorename false by default) [C] | If-Match ETag on item updates [K, unverified for content PUT] | |
| Change feed | `changes.getStartPageToken` + `changes.list`, polling; `changes.watch` is a webhook needing a server, so unusable [V] | `list_folder/get_latest_cursor` + longpoll [K/C] | `/delta` + deltaLink; webhooks need a server; docs advise at most daily periodic checks when webhooks exist [V] | |
| Quotas / rate | 325k units/user/min, 1M/project/min; writes 50 units; 750 GB/day upload; no per-file write limit documented [V] | Per-user rate limiting, specifics not verified [K] | 429/503 with Retry-After; app must pause all calls [V] | |
| Quota-full signal | 403 `storageQuotaExceeded` [K] | `insufficient_space` [K] | 507 / frozen account when over quota [V partial] | |

Multiple providers: the protocol below only needs list, get, put-new, overwrite-own-file, delete, so adding a provider is an adapter (~200 lines). Ship one first (Google Drive, biggest free tier and reach), add Dropbox second (best API, secret-free refresh), OneDrive only on demand (24h refresh, AppFolder preview, personal-only). User-owned drives are the right remote because they are the only place that gives free quota, per-user billing, no backend, and a recovery path independent of the browser. The cost: SPA auth friction, no server push.

## (4) Sync protocol and conflict strategy

Principles: local write first, always; sync is a background reconciliation; no operation requires CAS or atomic multi-file commit.

Remote layout (identical on every provider, under an app-owned `PixelDoll/` folder; Drive: `drive.file`, a visible folder so the user can see plain PNG/JSON if sync is discontinued):
- `b/<aa>/<sha256>.png` immutable blobs. Upload = create if absent (list/lookup by name first; a duplicate-name race on Drive is harmless, readers dedupe by name; Dropbox `add` mode).
- `c/<characterId>/<deviceId>.json` the head of that character as last written by that device: `{ rev: n, basedOn: { deviceX: rev, ... }, savedAt, deleted?, record }`. Each device overwrites ONLY its own file (single writer, so no CAS needed).
- `d/<deviceId>.json` device registry (name, last seen) for the "forget device" action.
- `meta.json` format version (create-only).

Device-local: `deviceId` (random), per-character `base` snapshot (last merged state, with the version vector), `dirty` flag, an upload queue of blob hashes, provider cursor.

Cycle (under `navigator.locks.request('pixeldoll-sync', {ifAvailable:true})`, one leader tab; others show the state via BroadcastChannel):
1. Pull: list `c/` (Drive changes.list, Dropbox cursor, OneDrive delta; fallback full list by modifiedTime), read changed heads.
2. For each character: if only local changed, push; if only remote heads changed and dominate (our rev is in their basedOn), fast-forward local; if concurrent, merge.
3. Push order: upload missing blobs (concurrency 4-6, resumable for large files), then write own head. A manifest therefore never references a missing blob; an interrupted upload leaves orphan blobs only, retried next cycle.
4. Download blobs for any newly referenced hash before applying the merged record locally (local app never sees a record whose art is missing).

Merge (three-way, base = stored last-synced record, ours, theirs):
- Character fields: per field; both changed to different values then last-saved wins for trivia (name), but record it.
- `items[]` matched by item id: only one side changed means take it. Both changed: compare per cell (`coverage`/`layers` keyed by CellKey): disjoint cells then merge (frame 1 vs frame 2); overlapping cells or other fields then CONFLICT.
- Conflict resolution never discards: keep ours in place, add theirs as a sibling copy item "Name (from <device>, date)" status `draft`/unequipped, and surface a banner; the user keeps one or both. State `conflict` persists until reviewed.
- Delete vs edit: delete is a tombstone `deleted:true` (head file) or item removed from `items`; if the other side edited after the base, the edit wins and the item/character reappears with a notice. Deletes only win when the other side did not change that item since base.
- Never use wall clocks for ordering (device skew); use version vectors (`basedOn`) per head.
- Blob GC remotely: never automatic. A user-initiated "Free up cloud space" computes the set of hashes referenced by all heads and deletes the rest.

Status mapping: saved locally (dirty, no provider), syncing, synced, offline (navigator.onLine or fetch failure), failed (non-retryable or auth expired: needs sign-in tap), conflict, cloud full (quota error: pause pushes, keep queue, keep pulling). Triggers: debounced on save (3-5 s), app open, `visibilitychange`/focus, `online`, 60 s while visible. Long offline: no problem, because merge is base-relative. Provider switch: pull everything from old provider to local (all blobs), connect new one, push everything. Disconnect: revoke token (Drive/Dropbox revoke endpoints), keep local data, drop cursor/base. Cleared browser data: sign in, list, pull everything; only the provider choice must be remembered by the user (the sign-in button lists providers).

## (5) Preferred architecture (one)

Local: unchanged IndexedDB (add `sync` store: deviceId, per-character base + vector, queue, cursor; request `navigator.storage.persist()`, show a one-time "install to Home Screen on iOS" nudge because Safari may evict script-writable storage after 7 days without use for non-installed sites [C WebKit]). Sync engine in a Web Worker or main thread module behind one `Provider` interface: `{ auth(), list(prefix, since?), get(path), putNew(path, bytes), putOwn(path, bytes), remove(path), changes?(cursor) }`.
Provider 1: Google Drive via GIS token client, scope `drive.file`, visible `PixelDoll/` folder. Provider 2 later: Dropbox PKCE, App folder. Layout and protocol exactly as section 4. Free manual ZIP remains. Offer File System Access "backup to folder" only as optional desktop add-on if requested.
Discontinuation: all data is local and complete; remote files are plain PNG/JSON in the user's own drive; ZIP export unchanged; removing the sync module deletes nothing.

## (6) Cost model

Developer recurring cost is $0 at every scale: GitHub Pages hosts the static app; OAuth client registrations and Drive/Dropbox API access are free; there is no server. Developer one-time costs are time (engine, tests, OAuth consent setup, possible Dropbox production review).
Assumption: 20-50 MB per active character library [my estimate, measure it].

| Users | Storage (who pays) | API quota | Operational notes |
|---|---|---|---|
| 100 | 2-5 GB total, each user's own free quota; dev $0 | Trivial | Testing-mode OAuth is fine for friends but tokens expire after 7 days, so publish the consent screen early |
| 1,000 | 20-50 GB across users' own drives; dev $0 | Well under per-user 325k units/min and project 1M units/min, since sync is event-driven | Need published consent screen; Dropbox production approval |
| 10,000 | 200-500 GB across users' own drives; dev $0 | Peak bursts only; project cap about 20k writes/min of 50 units | Users above their free tier (Dropbox 2 GB) hit "cloud full" and either pay their provider or choose another; support load is the real cost |

## (7) Shortcomings of this recommendation

- A hand-written merge engine is a long-term maintenance and correctness liability; needs property-based tests with simulated devices and fault injection. A bug could duplicate or resurrect items (mitigated: never delete automatically).
- Google SPA auth: 1h tokens with no refresh; background silent renewal can fail without a gesture, so sync pauses until the user opens/taps ("failed: sign in again"). A tiny token-exchange backend is the usual fix and is forbidden here.
- No server push on Drive: freshness is poll-based (focus/60 s). Not real-time collaboration.
- Many small PNG requests: first sync of a big library can take minutes and hit rate limiting; pack files (reuse zip.ts) are a later optimization.
- Cross-file consistency is eventual; Drive list-after-write lag is possible [unverified].
- Per-user free quota may be tiny (Dropbox 2 GB); the user must buy space or switch.
- Privacy: provider can read the art (no encryption; could add client-side encryption later, but then key loss means data loss).
- Version-vector heads accumulate per device; stale-device cleanup is manual.
- Visible Drive folder lets users break the layout; the engine must tolerate and report corrupt/missing files ("failed", not silent).
- The recommendation leaves Safari/iOS eviction only mitigated, not solved; sync is the actual mitigation, but only if it ran before eviction.

## (8) Claims I am least sure about

1. Google Web OAuth clients still require `client_secret` with PKCE, so no secret-free refresh (community reports only; Google docs say refresh tokens are "not typically used" client-side; test live before deciding).
2. `drive.file` visibility semantics after the user clears the app's local data and signs in again on a new device (same client id should see its own files) and the exact consent-screen/verification steps for non-sensitive scopes without a 100-user cap.
3. Whether OneDrive honors If-Match on content PUT, and OneDrive AppFolder still being "preview, personal only".
4. Dropbox: production-approval thresholds, exact rate limits, whether API-app links count against Basic's 3-device limit, and CORS behavior of `files/upload` with `mode update` from browsers (docs pages did not render for my fetcher).
5. Whether Drive `appDataFolder` counts against the user's quota (page silent; I believe yes).
6. RxDB 17 plugin licensing (premium or not) and maturity beyond "beta".
7. Safari home-screen installed apps being exempt from the 7-day eviction (conflicting sources); `storage.persist()` effect on iOS.
8. My per-user storage estimate (20-50 MB) and whether `layers` allows per-cell merge.

## Sources

- https://developers.google.com/workspace/drive/api/guides/appdata
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/api/guides/limits
- https://developers.google.com/workspace/drive/api/guides/manage-changes
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update
- https://developers.google.com/identity/oauth2/web/guides/overview and /use-token-model
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://discuss.google.dev/t/authorization-code-flow-without-client-secret/168113 and https://ktaka.blog.ccmp.jp/2025/07/oogle-oauth2-and-pkce-understanding.html (community)
- https://docs.dropboxapi.com/dropbox-api/docs/oauth
- https://www.dropboxforum.com/discussions/101000014/list-folderlongpoll-not-working-with-cors/658737 (community)
- https://help.dropbox.com/storage-space/over-quota ; https://www.dropbox.com/free
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/permissions_reference
- https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/scan-guidance
- https://support.microsoft.com/en-us/onedrive/microsoft-storage-faqs
- https://rxdb.info/replication-google-drive.html ; https://rxdb.info/replication-microsoft-onedrive.html
- https://remotestorage.io/rs.js/docs/dropbox-and-google-drive.html
- https://dexie.org/cloud/pricing ; https://jazz.tools/pricing ; https://evolu.vercel.app/docs/relay
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://caniuse.com/mdn-api_window_showdirectorypicker
- https://webkit.org/?p=14403 ; https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
