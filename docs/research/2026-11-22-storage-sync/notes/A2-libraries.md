# A2: Sync libraries for user-owned cloud storage (PixelDoll)

Research date: 2026-11-22. Facts were checked against primary sources (official docs, GitHub API, npm registry, package source) on that date. Bundle sizes come from bundlephobia unless marked "measured" (esbuild, minified, gzip level 9, browser target, done in a scratch folder).

PixelDoll today: hand-written raw IndexedDB layer (`app/src/lib/store/db.ts`, about 1,190 lines, no Dexie/idb dependency) with a `projects` store of per-character JSON manifests and a `blobs` store of PNG Blobs keyed by SHA-256. Any library that owns its own storage means migrating that layer.

---

## 1. Bottom line

- **There is exactly one maintained library that does bidirectional sync with conflict handling to Google Drive and OneDrive from a static browser app: RxDB 17's `replication-google-drive` and `replication-microsoft-onedrive` plugins.** They ship in the free Apache-2.0 `rxdb` package (not `rxdb-premium`), but both are labeled **beta**. There is no Dropbox plugin. Its real-API bugs in 2026 (issues below) and its design (base64 attachments inside per-document JSON, Drive v2 API for ETags, remote-wins default) make it a poor fit for PixelDoll's binary-heavy, already-built IndexedDB layer.
- **remoteStorage.js** (MIT, active, but `2.0.0-beta.10`) syncs to Dropbox and Google Drive (no OneDrive) with ETag checks. It needs data moved into its own cache, its Google Drive backend requests the **restricted** full `drive` scope, and on conflict the remote version wins by default.
- Every other serious candidate (Dexie Cloud, PouchDB, Replicache/Zero, Jazz, PowerSync, ElectricSQL, Evolu, Triplit, LiveStore, Kinto) **needs a sync server or relay** that someone hosts. CRDT libraries (Automerge, Yjs, TinyBase) have no cloud-drive provider but can sit on a small custom adapter.
- **Recommendation: none fits well, so write a small engine.** Build a provider-neutral "dumb blob store" adapter (list/changes, get, put with an optional if-match, delete) plus a PixelDoll-specific merge layer: immutable content-addressed blob files, per-character manifest records with version vectors, three-way merge, keep-both on same-field conflicts, and tombstones that never beat an edit. Do not adopt a database or CRDT framework. Details in section 6.

---

## 2. Comparison table

| Candidate | Hosted server needed? | User-owned cloud targets | Wraps existing IndexedDB? | Blobs | Conflict model | Last release (npm) / activity | License / paid | Size (min+gz) | Fit |
|---|---|---|---|---|---|---|---|---|---|
| **RxDB 17** + Google Drive / OneDrive replication | No (signaling also goes through Drive files and WebRTC) | Google Drive (`drive` or `appDataFolder`), OneDrive. **No Dropbox.** | No. Data must live in RxDB collections (free storage is Dexie-based, max 13 open collections in the free tier) | Attachments supported; stored **base64 inside the doc's JSON file** (`_attachments_data`), no documented size limit | Revision + `assumedMasterState` check, lock file `transaction.json` with an ETag; pluggable `conflictHandler` (default: **remote wins, local fork dropped**) | 17.6.0, 2026-10-05; repo pushed 2026-11-22; plugins **beta** since 17.0.0 | Apache-2.0 core (plugins included); Premium $99+/mo is not required | core + Dexie storage + attachments **81.6 kB** (measured); + Google Drive plugin **153.9 kB**; + OneDrive **156.2 kB** (measured; pulls in simple-peer and readable-stream) | Possible but heavy; needs migration; beta |
| **remoteStorage.js** | No for Dropbox/Drive (optional rS servers) | Dropbox, Google Drive, remoteStorage servers. **No OneDrive** | No. Uses its own IndexedDB/localStorage cache and BaseClient paths | Binary supported (ArrayBuffer); Dropbox max 150 MB per file, folders over 10k files are a problem | ETag/If-Match on sync; conflict event with `lastCommonValue`; **default "remote wins"** | 2.0.0-beta.10, 2026-08-12; repo pushed 2026-11-20 | MIT, free | 38.4 kB | Closest "multi-provider" lib, but beta, wrong scope on Drive, no OneDrive |
| **Dexie.js 4.4 + Dexie Cloud** | **Yes** (Dexie Cloud SaaS or €3,495+ on-prem server) | None | Dexie wraps IndexedDB (would replace db.ts) | Dexie Cloud blob offloading to its own S3/Postgres | Server-side, per-property merge | dexie 4.4.7 / addon 4.4.16, Oct 2026 | Apache-2.0 addon; service: free tier only 3 production seats, Pro €0.12/user/mo | dexie 30.4 kB; addon 72.4 kB | Violates "no developer-hosted server / no recurring cost" |
| dexie-syncable / Dexie.Observable | Yes (you implement ISyncProtocol to a server) | None | Dexie | n/a | Pluggable | 4.0.1-beta.13, **Jan 2023**; marked "legacy/unmaintained" in Dexie 4.4.3 notes | Apache-2.0 | n/a | Dead |
| **PouchDB 9** | **Yes** (CouchDB-protocol server) | None directly | No (own stores) | Attachments, revision trees | Revision trees, deterministic winner, conflicts kept | 9.0.0, **2024-06-21** (repo now apache/pouchdb, pushed 2026-11-05) | Apache-2.0 | pouchdb-browser 37.5 kB | Would need a CouchDB emulator over Drive: large |
| **Automerge 3** + automerge-repo | Network adapters expect a peer or sync server; storage adapters are pluggable | None shipped | No (Automerge docs) | Bytes in docs are possible, but heavy; not for PNG libraries | CRDT (keeps conflicting values accessible) | automerge 3.5.0 (2026-09-16); repo 2.6.0-alpha.3 tagged `latest` (2026-11-20), 3.0 pre-releases | MIT | **WASM 1,117 kB gzip** (measured from the 3.5.0 tarball; bundlephobia reports 1.6 MB for the base64-inlined build) | Too heavy for the manifest use case |
| **Yjs** + y-indexeddb | Providers need a server (y-websocket) or WebRTC signaling | None (no Drive/Dropbox provider found) | No (Y.Doc) | Uint8Array values possible, bloats docs | CRDT; concurrent writes to the same map key pick one winner deterministically (no keep-both) | yjs 13.6.33 (2026-09-23); y-indexeddb 9.0.12 (**2023-11**) | MIT | yjs 27.5 kB; y-indexeddb 1.4 kB | Possible merge core, but same-field conflicts lose a value |
| **TinyBase 10** MergeableStore | No for custom persisters/synchronizers | None (custom persister needed) | No (own store; IndexedDB persister) | No binary | HLC timestamps, **last write wins** | 10.1.0 (Nov 2026), very active | MIT | 16.5 kB | LWW loses same-field edits; no blobs |
| **Replicache / Zero** | **Yes** (your push/pull server; Zero needs zero-cache + Postgres) | None | No | No | Server-authoritative rebase | replicache 15.3.0 (maintenance mode, old repo archived); @rocicorp/zero 1.12.0 | Replicache custom terms; Zero Apache-2.0 | n/a | Server required |
| **Jazz** | **Yes** (Jazz Cloud or self-hosted sync server) | None | No | FileStream (chunked) | CRDT (CoValues) | jazz-tools 2.0.0-beta.0 (2026-11-22) | MIT | n/a | Server required |
| **PowerSync** | **Yes** (PowerSync Service + Postgres/MongoDB/MySQL backend) | None | No (SQLite in browser) | No | Server-authoritative | @powersync/web 2.7.0 (Nov 2026) | Apache-2.0 client; service paid or self-host | n/a | Server required |
| **ElectricSQL** | **Yes** (Electric service reading Postgres) | None | No | No | Read-path sync; writes go through your API | @electric-sql/client 1.5.28 (Sep 2026) | Apache-2.0 | n/a | Server required |
| **Evolu** | **Yes** (relay; free test relay may delete data; self-host Docker) | None | No (SQLite) | No | LWW per column (Evolu docs), append-only history | @evolu/common 8.30.0 (2026-11-21) | MIT | 116.7 kB | Relay required |
| **Triplit** | **Yes** (Triplit server) | None | No | No | Server-mediated | @triplit/client 1.0.50 (**2025-07**); repo pushed 2026-01 | AGPL-3.0 | n/a | Server required, slowing |
| **LiveStore** | Custom SyncBackend possible, but needs a **globally ordered** event log with "server ahead" rejection | None shipped (Cloudflare, Electric, S2) | No (SQLite, event sourcing) | No | Event log, local events rebased on pull | 0.5.0 (2026-11-21) | Apache-2.0 | n/a | Could run over a CAS head file, but large engine for this app |
| **SignalDB** + @signaldb/sync | No; any backend via `pull`/`push` | None shipped | No (own collections; IndexedDB adapter) | No | "Replay" local changes over pulled data, **last change wins** | core 2.0.2, sync 2.0.0 (Oct/Nov 2026) | MIT | core 50.4 kB + sync 3.3 kB | LWW; migration required |
| **Kinto** (kinto.js) | **Yes** (Kinto server) | None | No | Attachments via server plugin | Revision timestamps; manual/server/client strategies | kinto 17.1.1 (2025-12) | Apache-2.0 | n/a | Server required |
| **Fireproof** | No for custom gateways (get/put/delete + CAS register) | S3/R2 and others; no Drive/Dropbox | No | Files supported | Merkle CRDT over encrypted CAR files | 0.24.19 (2026-04), pivoting to "vibe coding database" | AFL-2.0 (npm) / Apache-2.0 (repo) | n/a | Interesting design, churny, migration required |
| drivestash | No | Google Drive appDataFolder only | IndexedDB primary | Unknown | Per-record LWW by timestamp | 0.4.0 (2026-03), ~650 downloads | MIT | n/a | Too immature; LWW |
| IDBSideSync | No | Google Drive | **Yes, proxies existing object stores** | No | HLC oplog, CRDT-ish LWW | **Dead since 2022-12** | none | n/a | Shows that wrapping existing stores works; not usable |
| Super Productivity `@sp/sync-core` + `@sp/sync-providers` | No | Dropbox, OneDrive, WebDAV, Nextcloud, local file (no Google Drive) | n/a (app-internal) | n/a | Op-log + vector clocks + field-level LWW, provider revs (Dropbox rev, WebDAV ETag) | **Not published to npm** (workspace packages, v1.0.0) | MIT | n/a | Best real-world reference code to read, not a dependency |

---

## 3. Candidate notes (skeptical)

### RxDB 17: Google Drive and OneDrive replication
- Shipped in RxDB 17.0.0 (2026; release page last updated 2026-03-31). Both plugins say: "This feature is in beta and may have breaking changes without a major RxDB version release."
- Free: the `rxdb@17.3.0` package.json (license Apache-2.0) exports `./plugins/replication-google-drive` and `./plugins/replication-microsoft-onedrive`. The Premium page does not list them.
- Layout: `folderPath/docs/[primaryKey].json` (one file per document), `signaling/` for WebRTC, and `transaction.json` as a write lock (default timeout 10 s). Google Drive can use `space: 'appDataFolder'` with the non-sensitive `drive.appdata` scope (added in 17.3.0). OneDrive needs `Files.ReadWrite`.
- Conflicts: the upstream path compares each pushed row's `assumedMasterState` with the current file content and returns conflicts to RxDB's conflict handler. The transaction lock is taken with an ETag via the **Drive v2** endpoint, and document updates use `PUT /upload/drive/v2/files/{id}` with `If-Match`, because Drive v3 dropped `etag`. The maintainer's reply in issue #8413: "We use a mix of v2 and v3 intentionally. I do not believe google can ever drop v2 support".
- The default conflict handler resolves to `realMasterState` (source: `src/replication-protocol/default-conflict-handler.ts`). That silently drops the local edit unless you write a custom handler. The handler gets base, fork and master states, so a three-way merge is possible, but "keep both" means inserting a copy document as a side effect.
- Attachments: base64 inside the document JSON (33% inflation; every attachment change rewrites the whole document file). PixelDoll would model each PNG as its own document holding one attachment.
- Pull checkpoint uses file `modifiedTime` plus same-time ids, not the Drive `changes` feed. Issue #8608 reported rate-limit and scalability concerns ("won't work with more than that"); a fix landed in PR #8637.
- Real-API bugs found in 2026 (the plugin was developed against `google-drive-mock`): #8413 / #8606 (`Invalid field selection etag`, 412 failures with the `drive.file` scope), #8453. Fixed in 17.2.0, which fetches etags through v2. OneDrive got a race fix in 17.4.0 and "make realtime sync reliable" in 17.5.0.
- Bundle (measured, rxdb 17.6.0): core + Dexie storage + attachments 81.6 kB gz; + Google Drive 153.9 kB gz; + OneDrive 156.2 kB gz. The Drive plugin needs an `events` polyfill under a browser bundler because it bundles simple-peer.
- Mobile Safari: RxDB's Dexie storage runs on IndexedDB; WebRTC signaling is optional for correctness (only speeds up change discovery).
- Fit: it does the job for Drive and OneDrive, but forces a rewrite of db.ts into RxDB schemas, costs about 150 kB gz, adds no Dropbox, and inherits beta churn.
- Sources: https://rxdb.info/replication-google-drive.html, https://rxdb.info/replication-microsoft-onedrive.html, https://rxdb.info/releases/17.0.0.html, https://github.com/pubkey/rxdb/releases, https://rxdb.info/premium/, https://cdn.jsdelivr.net/npm/rxdb@17.3.0/package.json, https://cdn.jsdelivr.net/npm/rxdb@17.3.0/src/plugins/replication-google-drive/upstream.ts, https://cdn.jsdelivr.net/npm/rxdb@17.3.0/src/plugins/replication-google-drive/document-handling.ts, https://github.com/pubkey/rxdb/issues/8413, https://github.com/pubkey/rxdb/issues/8606, https://github.com/pubkey/rxdb/issues/8608

### remoteStorage.js
- Versions: 2.0.0-beta.10 (2026-08-12) is "Latest"; the 2.0 line has been in beta through 10 releases. The repo is active (pushed 2026-11-20).
- Backends: remoteStorage protocol servers, Dropbox (scoped app, PKCE, refresh tokens since beta.5) and Google Drive. No OneDrive. The docs list drawbacks: worse sync performance than rS servers, and no permission model. Dropbox caveats: files over 150 MB are not supported, and listing or deleting folders with more than 10,000 files causes problems.
- `src/googledrive.ts` hardcodes `AUTH_SCOPE = 'https://www.googleapis.com/auth/drive'`. Google classifies that scope as **Restricted**, which requires restricted-scope verification (a security assessment if data touches servers). PixelDoll should only request `drive.appdata` or `drive.file`, which are non-sensitive.
- Conflicts: ETag/If-Match puts. On a 412, a `change` event fires with origin `conflict`, carrying old, new and `lastCommonValue`. The documented default is "remote wins", and the app may revert it.
- Backends are internal classes, not a public plugin API. Adding OneDrive means forking or contributing (the Drive backend is about 750 lines, Dropbox about 1,226).
- Sources: https://github.com/remotestorage/remotestorage.js/releases, https://remotestorage.io/rs.js/docs/dropbox-and-google-drive.html, https://raw.githubusercontent.com/remotestorage/remotestorage.js/master/src/googledrive.ts, https://remotestoragejs.readthedocs.io/en/latest/js-api/remotestorage.html, https://developers.google.com/workspace/drive/api/guides/api-specific-auth

### Dexie (Dexie Cloud, dexie-syncable)
- Dexie 4.4.7 (Oct 2026) is healthy. Dexie Cloud needs the Dexie Cloud server: either SaaS (free tier is 3 production seats, 100 MB, 1,000 blob writes a month; Pro €0.12 per user per month) or on-prem (€3,495 / €7,995 one-time, which still means running a server). Blob offloading (4.4) stores blobs in Dexie Cloud's S3/Postgres, not in the user's drive.
- dexie-syncable / dexie-observable are marked "legacy/unmaintained" in the v4.4.3 release notes; the last publish is 4.0.1-beta.13 from Jan 2023.
- Sources: https://dexie.org/cloud/pricing, https://github.com/dexie/Dexie.js/releases, https://dexie.org/docs/cloud/blob-offloading, https://dexie.org/docs/Syncable/Dexie.Syncable.js

### PouchDB
- 9.0.0 (2024-06-21) is still the latest release, though the repo (now apache/pouchdb) has commits through Nov 2026. Revision trees and attachments are strong, but replication speaks the CouchDB HTTP protocol (`_changes`, `_revs_diff`, `_bulk_docs`). Targeting Drive means emulating a CouchDB server in the browser over files. Obsidian LiveSync's "Journal Sync" (PouchDB changes packed into S3 objects) shows this can work, but it is labeled experimental and is S3-only.
- Sources: https://github.com/pouchdb/pouchdb/releases, https://github.com/vrtmrz/obsidian-livesync, https://community.obsidian.md/plugins/obsidian-livesync

### Automerge + automerge-repo
- The `StorageAdapterInterface` has six methods (`load`, `save`, `remove`, `loadRange`, `removeRange`, optional `close`) with string-array keys. The docs say adapters are "safe to use concurrently ... multiple Repos talking to the same storage". That makes a Drive- or Dropbox-backed storage adapter a plausible "storage as sync medium", but the repo does not watch storage: "Tabs won't update live, but changes merge on refresh". You would need to poll and re-load.
- Adapter size estimate: 150 to 250 lines per provider (key-to-path mapping plus prefix listing).
- Cost: the WASM is 1.1 MB gzip (measured), manifests must be migrated into Automerge docs, and automerge-repo's npm `latest` tag is an alpha (2.6.0-alpha.3), with 3.0 in experimental pre-release.
- Sources: https://automerge.org/docs/reference/repositories/storage/, https://automerge.org/automerge-repo/interfaces/_automerge_automerge-repo.StorageAdapterInterface.html, https://github.com/automerge/automerge-repo/releases, https://tonsky.me/blog/crdt-filesync/

### Yjs
- There is no Drive or Dropbox provider. The Yjs docs describe writing a custom "database provider". The common pattern is per-device update files merged with `Y.mergeUpdates`. Concurrent sets of the same map key converge on one winner, so "keep both versions" needs app logic. y-indexeddb was last published in Nov 2023.
- Sources: https://docs.yjs.dev/tutorials/creating-a-custom-provider, https://docs.yjs.dev/api/document-updates, https://github.com/gmcfall/yjs-firestore-provider

### TinyBase
- MergeableStore is a CRDT based on HLC timestamps with "last write wins". `createCustomPersister` and `createCustomSynchronizer` make a Drive adapter easy (about 100 lines), but LWW violates "same-field edits keep both", and there is no binary type.
- Sources: https://tinybase.org/guides/synchronization/using-a-mergeablestore/, https://tinybase.org/api/persisters/functions/creation/createcustompersister, https://tinybase.org/api/synchronizers/functions/creation/createcustomsynchronizer/

### SignalDB
- `pull`/`push` against "any backend"; conflict strategy is replay with "last change operation wins". Easy to target Drive, but it is LWW and needs a migration.
- Source: https://signaldb.js.org/sync/

### LiveStore
- A custom `SyncBackend` needs `pull(cursor)` and `push(batch)`, with the backend enforcing ascending sequence numbers ("process one push at a time to keep a total ordering"). Over Drive that needs a CAS-protected head file, which Drive v3 lacks.
- Sources: https://docs.livestore.dev/reference/syncing/, https://docs.livestore.dev/reference/syncing/sync-provider/custom/

### Server-required (ruled out by "zero developer-hosted servers")
- Evolu: relay required ("needs WebSockets and SQLite"); `free.evoluhq.com` is for testing only and "may be deleted". https://www.evolu.dev/docs/relay
- Jazz: Jazz Cloud or a self-hosted sync server. https://jazz.tools/docs/sync-and-storage
- Replicache (maintenance mode) and Zero (zero-cache + Postgres). https://zero.rocicorp.dev/docs/deployment
- PowerSync (https://docs.powersync.com), ElectricSQL (https://electric-sql.com/docs), Triplit (https://www.triplit.dev/docs), Kinto (https://docs.kinto-storage.org).

### Multi-provider "cloud drive abstraction" libraries
- No maintained browser library unifies Google Drive, Dropbox and OneDrive file access, let alone sync. Unifile and CloudRail are Node or server-side; Kloudless was a hosted picker; CloudBridge is Kotlin Multiplatform and unstable. remoteStorage.js is the only browser option (Dropbox and Drive). Super Productivity's provider package is the best-maintained open code for Dropbox and OneDrive from a PWA (MIT), but it is not on npm.
- Sources: https://www.npmjs.com/package/unifile, https://npmjs.com/package/cloudrail-si, https://github.com/super-productivity/super-productivity/blob/master/docs/sync-and-op-log/package-boundaries.md

---

## 4. Provider primitives that matter (for any engine)

| Primitive | Google Drive | Dropbox | OneDrive (Graph) |
|---|---|---|---|
| Conditional write (CAS) | **v3 has no `etag`/If-Match**; v2 `PUT /upload/drive/v2/files/{id}` with `If-Match` works (RxDB relies on it) | `files/upload` with `mode: update(rev)` and `autorename: false` fails with a `path/conflict` error if the rev changed | `if-match` with eTag or cTag on upload sessions and item updates returns 412 on mismatch; `@microsoft.graph.conflictBehavior: fail|replace|rename` |
| Change feed | `changes.list` with a page token (spaces=appDataFolder supported) | `list_folder` / `continue` cursors, `longpoll` | `delta` query |
| App-private area | `appDataFolder` with `drive.appdata` (non-sensitive) | App folder access type | App folder (Remotely Save's free OneDrive tier is "App Folder only") |
| Single-request size | resumable upload for large files | 150 MB per single upload | 250 MB simple PUT; upload sessions above that |

Design implication: if the engine writes only **immutable, uniquely named files** (content-addressed blobs, per-device change files), no CAS is needed and Drive v3 works without the v2 workaround. CAS is only needed if several devices rewrite the same mutable file.

Sources: https://developers.google.com/workspace/drive/api/guides/api-specific-auth, https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession, https://learn.microsoft.com/en-us/graph/api/driveitem-put-content, https://dropbox.github.io/dropbox-sdk-java/api-docs/v5.4.3/com/dropbox/core/v2/files/WriteMode.html, https://www.dropboxforum.com/t5/Dropbox-API-Support-Feedback/V2-API-s-DbxFiles-WriteMode-update-does-not-created-conflicted/td-p/133340

---

## 5. What real apps do on dumb file storage, and what breaks

| App | Approach | Reported problems |
|---|---|---|
| **Joplin** (Dropbox, OneDrive, WebDAV, S3, own server) | One file per item; local `sync_items.sync_time` vs remote `updated_time`; lock files (`<type>_<client>_<id>.json`, TTL refresh, oldest wins); a conflict creates a copy in a "Conflicts" notebook and the remote replaces the local | Floods of thousands of spurious conflicts after imports, encryption changes, Dropbox folder moves or power loss; "editing any note, even when only one computer is on, spawns a conflict" on Dropbox (timestamp heuristics). https://joplinapp.org/help/dev/spec/sync, https://joplinapp.org/help/dev/spec/sync_lock, https://discourse.joplinapp.org/t/thousands-of-conflicts-any-solution/39084, https://discourse.joplinapp.org/t/spurious-conflicts-after-dropbox-move/35029 |
| **Remotely Save** (Obsidian; S3, Dropbox, OneDrive app folder, WebDAV free; Google Drive, Box and others are PRO) | Local, remote and previous-sync state comparison (v3); free conflict choice is "newer" or "larger"; PRO "smart conflict" merges small Markdown and duplicates the rest; aborts if 50% or more of files would change | Conflicted copies with Dropbox; the safety abort (#980) exists because mass deletes happened. Repo **last pushed 2024-11-10**, "source available" license. https://github.com/remotely-save/remotely-save, https://github.com/remotely-save/remotely-save/issues/980, https://forum.obsidian.md/t/conflicted-copies-when-using-remotely-save-with-dropbox/55984 |
| **Super Productivity** (PWA plus desktop; Dropbox, OneDrive, WebDAV, local file) | Single `sync-data.json` (full state + last 500 ops) written with provider revision CAS; op-log with vector clocks and field-level LWW; opt-in split `sync-ops.json` + `sync-state.json`; local recovery points; `.bak` before overwrite | Their own doc: works "reasonably well for 2 clients", "fragile with 3+ clients", documented check-then-write (TOCTOU) race for local files, only 2 upload retries; v19.0.1 "A device with no data can no longer overwrite server data". Issues #2012 ("Conflicting data" constantly on Dropbox) and #3160. https://github.com/super-productivity/super-productivity/blob/master/docs/long-term-plans/multi-client-file-sync-reliability.md |
| **Actual Budget** | Declined Drive/Dropbox sync (issue #473, closed not planned): the maintainer called it a networked filesystem that isn't safe for this work and said the merkle trie can't be persisted atomically alongside the data; users cited YNAB4's one-file-per-device Dropbox scheme as working (rare duplicate transactions) | https://github.com/actualbudget/actual/issues/473 |
| **Logseq** (file graphs in iCloud/Drive/OneDrive folders) | Relies on OS folder-sync clients | Recurrent data loss and duplicates; staff: "OneDrive / GDrive / iCloud are messing the FS event firing / file conflict resolution". https://discuss.logseq.com/t/im-using-logseq-with-icloud-but-experiencing-data-loss-or-file-conflict-errors-whats-going-on/13393 |
| **Excalidraw** | Not dumb storage (Firebase + websocket), but a useful merge rule: per-element `version` (highest wins), random `versionNonce` tiebreak, `isDeleted` tombstones | Authors accept "jankiness" on simultaneous edits to the same element, growing tombstones, and unsolved multiplayer undo. https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature |
| **Standard Notes** | Own (self-hostable) server; creates conflicted copies | "we're seeing an increase in reports of conflicted note copies being created" (timing-dependent). https://standardnotes.org/blog/microupdate-server-status-and-conflicts |
| **Zotero** | Metadata syncs through Zotero servers; WebDAV or Zotero Storage only stores attachment files | The pattern: dumb storage holds only files, never the mergeable metadata. https://www.zotero.org/support/sync |
| **KeeWeb / KeePass family** | Whole encrypted file on Dropbox/Drive/OneDrive; client-side KDBX merge (kdbxweb) on change | Provider "conflicted copy" files on Dropbox; OS sync clients cannot merge encrypted files. https://github.com/keeweb/keeweb, https://keepass.info/help/v2/sync.html, https://www.ctrl.blog/entry/keepass-file-conflicts-android/ |
| **Obsidian Self-hosted LiveSync** | CouchDB, or experimental "Journal Sync" of PouchDB changes into S3/R2/MinIO buckets | Maintainer: it is a sync tool, not a backup. https://github.com/vrtmrz/obsidian-livesync |
| **tonsky "Local, first, forever"** | Each device writes only its own file in a synced folder; CRDT merge on read; "Dropbox will not report any conflicts" | https://tonsky.me/blog/crdt-filesync/ |

Recurring lessons:
1. Timestamp heuristics produce spurious conflicts (Joplin). Use version vectors or explicit base revisions instead.
2. Rewriting one shared mutable file races (Super Productivity, Actual's objection). Prefer immutable, per-device or content-addressed files; use CAS where a mutable pointer is unavoidable.
3. Empty or new devices overwriting good data is a top data-loss cause (Super Productivity v19 fix, Remotely Save's 50% guard). Never let an empty local state push deletes; guard mass deletions.
4. Keep both versions instead of LWW (Joplin conflict notes, Dropbox conflicted copies) and show a clear review UI.
5. Keep local recovery points; the remote is a sync medium, not a backup (LiveSync, Super Productivity).

---

## 6. Recommendation for PixelDoll

**Write a small sync engine; do not adopt a library.**

Why not the two libraries that technically qualify:
- RxDB Drive/OneDrive: beta; no Dropbox; would replace the 1,190-line db.ts and the paid-job ledger isolation with RxDB schemas; base64 attachments inside JSON for every PNG; Drive v2 dependence; default remote-wins; about 150 kB gzip. It solves what PixelDoll's data model already makes easy (immutable blobs) and leaves the hard part (merge policy) to a custom conflict handler anyway.
- remoteStorage.js: beta for years, no OneDrive, restricted full-Drive scope, own cache (migration), remote-wins default.

Why a custom engine is small here:
- **Blobs are content-addressed and immutable**, so they can never conflict. Sync means "list remote hashes, upload missing ones (create-if-absent), download missing ones". No CAS needed on any provider. Garbage collection only deletes remote blobs that no live manifest (including tombstone grace periods) references.
- **Manifests are per character**, which is a natural record. Store `projects/<id>/<deviceId>-<counter>.json` (per-device immutable versions, or a per-record file plus CAS where the provider supports it) carrying a version vector and the base version. Merge = three-way (base, local, remote): independent fields merge; a same-field concurrent change keeps both (a duplicated character or a "conflict version" entry in Activity); delete vs edit resolves to the edit, with the delete recorded as superseded.
- **The ledger never syncs** because the engine only reads the `projects` and `blobs` stores.

Adapter interface (what each provider implements):
```ts
interface CloudStore {
  list(prefix: string, cursor?: string): Promise<{ entries: { path: string; rev: string; size: number }[]; cursor: string }>;
  get(path: string): Promise<{ body: Blob; rev: string } | undefined>;
  put(path: string, body: Blob, opts?: { ifMatch?: string; ifNoneMatch?: '*' }): Promise<{ rev: string } | 'conflict'>;
  delete(path: string, opts?: { ifMatch?: string }): Promise<void | 'conflict'>;
}
```
Estimated size: Dropbox (`update(rev)`, `list_folder/continue`) about 150 to 200 lines; OneDrive (Graph approot, `if-match`, `delta`) about 150 to 250; Google Drive (appDataFolder, `changes.list`, path-to-id mapping because Drive is id-based, v2 `If-Match` only if CAS is needed) about 250 to 350. Add about 100 to 150 lines of OAuth PKCE per provider (no backend: Dropbox and Microsoft support PKCE public clients; Google Identity Services token client for browser apps). Engine: roughly 800 to 1,500 lines plus tests. Super Productivity's MIT `@sp/sync-providers` (Dropbox, OneDrive) and RxDB's Apache-2.0 Drive plugin are good references for the provider quirks.

If a library must be used anyway, the least-bad option is **RxDB's generic replication protocol** (`replicateRxCollection` with custom pull and push handlers), because its push contract (`assumedMasterState` in, conflicts out) and three-way conflict handler fit a CAS file store, and the official Drive and OneDrive plugins exist as references. That still means migrating db.ts into RxDB.
