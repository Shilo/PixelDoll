# A4: Sync protocol, concurrency, browser/PWA limits and security for PixelDoll cloud sync

Research date: 2026-11-22. Sources were fetched today unless marked "from memory" or "unverified". The repo was only read, never changed.

Repo facts used (read from `app/src/lib/store/manifest.ts` and `project.ts`):
- `projects` record = `StoredProject { id: 'rig-…', savedAt, manifest, skeletons, rigQa, … }`, rewritten whole on save.
- `Manifest { rig, materials[], slots[] (array order = z tie-break), items[] (base included), presets[] }`.
- `Item { id, name, slot, status, materials[], layers[], baseHash, baseCut, provenance[], frameEdits[], … }`.
- `Layer.cells[anim][dir][frameIndex] = Sha256 | null`. A cell is identified by `(item, anim, dir, frame)`, and that cell spans up to 3 layers (`main`, `fg`, `bg`) plus `baseCut`.
- **Blob keys are the SHA-256 of the decoded RGBA pixels, not of the PNG bytes.** Two devices can encode the same pixels into different PNG bytes under the same key. That is harmless, but download checks must decode and hash the RGBA, not hash the file.

---

## Part 1: Protocol and concurrency

### 1.1 Is there a standard?

No widely deployed standard covers "sync app data over a dumb consumer drive". Everyone builds their own layer:

- **RFC 9110 conditional requests** (ETag, `If-Match`, `If-None-Match: *`, 412) are the right primitive: compare-and-swap on one resource. But they work only where the provider implements them on content writes. https://www.rfc-editor.org/rfc/rfc9110#name-conditional-requests
- **remoteStorage** is still an individual Internet-Draft: draft-dejong-remotestorage-27, 12 June 2026, "not endorsed by the IETF", intended RFC status "(None)". It specifies strong ETags, folder ETags that change when any descendant changes, `If-Match`/`If-None-Match` on PUT/DELETE, and leaves conflict resolution to the client. No mainstream drive implements it. https://datatracker.ietf.org/doc/draft-dejong-remotestorage/
- **WebDAV** (RFC 4918) adds collections, ETags and LOCK, but Google Drive, Dropbox and consumer OneDrive do not offer it as a supported API (Nextcloud and ownCloud do).
- **CouchDB replication** handles conflicts well. It keeps a revision tree, picks a deterministic winner "so that the same choice will be made on all peers", keeps losing revisions as `_conflicts`, keeps deletes as `_deleted` tombstone leaves, and leaves the merge to the app. But it needs a CouchDB-speaking server on the other end. https://docs.couchdb.org/en/stable/replication/conflicts.html
- **What shipping apps do:**
  - Syncthing renames the older side of a conflict to `.sync-conflict-<date>-<time>-<device>`. When a modify races a delete, the modified copy survives as a conflict copy. https://docs.syncthing.net/users/syncing.html
  - Joplin runs its own synchronizer over a generic file API for Dropbox, OneDrive, WebDAV and filesystem targets. It keeps per-item sync times, uses heuristics for properties, and has a separate lock spec. https://joplinapp.org/help/dev/spec/sync

Conclusion: we build a thin layer ourselves. It should use only the lowest common denominator: list, get, put, and atomic whole-file replace.

### 1.2 Provider capability matrix (relevant to concurrency)

| | Google Drive v3 | Dropbox v2 | OneDrive (Graph) |
|---|---|---|---|
| Addressing | by **file ID**. Names are not unique, so two concurrent creates of `x.json` make **two files** | by path | by path or ID |
| CAS on content write | **None documented.** The v3 `files.update` reference has no If-Match, ETag or precondition (checked today) | `WriteMode.update(rev)`: overwrites only if rev matches. `add` mode does not overwrite. `autorename=false` returns an error instead of a "conflicted copy" | `if-match` eTag/cTag with 412 is documented on PATCH (metadata). Current PUT-content docs no longer list it, so **treat it as unverified** for content |
| Create-if-absent | No (duplicates by name) | `add` mode | `@microsoft.graph.conflictBehavior=fail` (from memory) |
| Change feed | `changes.getStartPageToken` / `changes.list` (+ `watch`, which needs a webhook server) | `list_folder/continue` cursor + `longpoll` | `delta` with deltaLink, `token=latest`. 410 forces a resync. "The same item may appear more than once" |
| App-private area | `drive.appdata` (hidden, user cannot open the files) or `drive.file` (visible, per-file grant) | App Folder access type | `Files.ReadWrite.AppFolder` (`/drive/special/approot`), visible to and editable by the user |

Sources:
- Drive files.update: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update
- Drive changes: https://developers.google.com/workspace/drive/api/guides/manage-changes
- Drive appdata: https://developers.google.com/workspace/drive/api/guides/appdata
- Dropbox WriteMode/autorename (SDK doc and forum): https://dropbox.github.io/dropbox-sdk-java/api-docs/v5.4.3/com/dropbox/core/v2/files/WriteMode.html and https://www.dropboxforum.com/t5/Dropbox-API-Support-Feedback/V2-API-s-DbxFiles-WriteMode-update-does-not-created-conflicted/td-p/133340
- Dropbox `strict_conflict` ("Be more strict about how each WriteMode detects conflict"): https://dropbox-sdk-python.readthedocs.io/en/latest/api/files.html
- Graph update if-match: https://learn.microsoft.com/en-us/graph/api/driveitem-update?view=graph-rest-1.0
- Graph PUT content: https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0
- Graph delta: https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0
- OneDrive app folder: https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder?view=odsp-graph-online

**The decisive fact: Google Drive has no portable CAS and allows duplicate names.** Any design whose correctness needs CAS is wrong on Drive. Any design where two devices create the same filename produces duplicates on Drive.

### 1.3 Building blocks assessed for this data model

| Mechanism | Fit for PixelDoll |
|---|---|
| ETag/If-Match | Good where available (Dropbox, maybe OneDrive). Not available on Drive, so it can only be an optimization, never a correctness requirement. |
| WebDAV, remoteStorage | Not offered by the target providers. Their ideas (strong ETags, folder ETags, client resolves) are sound but unusable here. |
| CouchDB revision trees | Right semantics (keep conflicts as siblings, deterministic winner, tombstones). Needs a server; we would re-implement a subset anyway. |
| Version vectors / dotted version vectors | Core tool for telling "concurrent" from "superseded". Dotted version vectors (Preguiça, Baquero et al., arXiv:1011.5808) track sibling values precisely without one entry per client write. With one entry per device (a handful of devices), plain VVs plus one dot per value are enough. https://arxiv.org/abs/1011.5808 |
| LWW-register map | Simple, but **fails case C**: the same field edited on two devices silently loses one edit. Acceptable only for UI-ish fields like ordering hints, never for artwork. |
| Multi-value (MV) register | Exactly case C: concurrent writes are all kept and the app shows a conflict. A write that saw the earlier values replaces them. |
| OR-set / observed-remove | Right semantics for E: a delete removes only what it observed, so a concurrent edit survives. The naive OR-map "resurrects a fragment" (only the edited fields come back), so use soft-delete plus edit-wins (see 1.6). |
| Automerge / Yjs | They solve rich-text and list editing. Our data is a tree of records with immutable blob references, plus whole-manifest saves. Automerge 3 cut memory more than 10x (https://automerge.org/blog/automerge-3/), but it would still add a dependency, a binary doc format users cannot read, and history growth for no gain on our data. Both default to an LWW-ish winner per map key, and Automerge exposes conflicts but does not force review. **Not needed (YAGNI).** |
| OT | Irrelevant: needs a central server to order operations. |
| Content-addressed immutable objects | Ideal for the PNG cells. Write-once, idempotent, and any device may write them. Two devices writing the same key write equivalent pixels. Removes all blob races. |
| Tombstones and GC | Needed for deletes. Safe GC needs causal stability (every live device has seen the delete). See 1.6. |
| Three-way merge with a stored base (git, Unison, Dropbox clients) | Works when you can atomically publish the merge result (git push = CAS on a ref). On Drive, without CAS, two devices can both merge against the same base and overwrite each other. |

### 1.4 The three candidate designs against cases A-F (providers without reliable CAS, with eventually consistent listings)

#### (a) Per-device append-only change logs

Layout: `devices/<deviceId>/log/<seq>.json`. Each segment is immutable, written once, and holds ops with dots `(deviceId, seq)` and, per op, the dots of the values it replaced. Periodic `devices/<deviceId>/snapshot-<seq>.json` files exist for bootstrapping and compaction.

- **No write races at all.** Only the owner writes under its prefix, and segment names are never reused.
- **Eventually consistent listing:** a reader may see segment 7 before 6. Apply strictly in per-device seq order and wait on gaps. Stale listings only delay convergence.
- **A (sequential devices):** device 2 read device 1's ops first, so its ops list device 1's dots as replaced. No conflict.
- **B (different items):** different keys, so ops commute.
- **C (same field):** both ops have dots not covered by the other, so both values are kept (MV register).
- **D (frame 1 vs frame 2):** different cell keys merge cleanly. The same cell on both devices is case C.
- **E (delete vs offline edit):** the delete op lists what it observed. The offline edit has a newer dot, so the edit survives.
- **F (days offline):** the outbox grows locally and is uploaded later. Merge is unchanged.
- **Costs:**
  - many small files, which providers rate-limit;
  - gap handling;
  - snapshots and compaction are mandatory, or a new device replays everything;
  - log GC needs every device's progress.

  It is more machinery than PixelDoll needs, because the app already saves whole manifests (there is no op stream to capture).

#### (b) Single shared index with compare-and-swap

Layout: one `index.json` (or one per character). Read, merge, PUT with `If-Match`, and on 412 retry.

- **On Dropbox/OneDrive** it is correct, git-push style. On **Drive it is not.** Two devices read rev 5 and both write: the second silently wins, so a lost update breaks **B, C and E**. Creating the index the first time on two devices yields two `index.json` files.
- Even with CAS it still needs per-record merge logic for B/C. It also makes one hot file that every save rewrites, so offline devices pay a retry on every sync.
- Reading back after writing to "detect" a lost update is unreliable under eventual consistency, and Drive's revision list is pruned.
- **Verdict: rejected** as the primary mechanism.

#### (c) Per-record files with revision ids and three-way merge

Layout: `characters/<id>/items/<itemId>.json` with a rev. The device keeps the last-synced base.

- **With CAS:** good. Contention is per item, so B never conflicts, and C/E are found by three-way merge against the base.
- **Without CAS (Drive):** the same lost-update window as (b), only smaller. Concurrent first creation duplicates files.
- **Fix:** make each device write its own copy of each record (`items/<itemId>/<deviceId>.json`) with its version vector. That stops being (c) and becomes (a) with per-record state, so the fix converges on the design below.
- A three-way merge also needs a stored base per record per device. If the base is lost (cleared data), the merge degrades to two-way and every difference looks like a conflict.

#### (a') Recommended: per-device *state* files (a state-based CRDT), shared content-addressed blobs

This is (a) with the log collapsed into "the latest state of each device".

```
PixelDoll/                        (app folder)
  format.json                     {format:"pixeldoll-sync/1"}  written once. A duplicate on Drive is harmless (identical content)
  blobs/<rgbaSha256>.png          write-once and immutable. Any device may write it
  devices/<deviceId>/library.json the character list (ids, names, soft-delete flags) with per-key dots and version vector
  devices/<deviceId>/chars/<characterId>.json   full merged state of one character as this device knows it, plus its VV
```

- **Only the owning device ever writes `devices/<deviceId>/…`.** It overwrites its own file with an atomic whole-file replace. No CAS is needed on any provider, and two devices never write the same mutable file.
- **Merge is a join** (commutative, associative, idempotent). This makes it robust to:
  - **eventually consistent listings and stale reads:** merging an older state of device X does nothing, because it is subsumed later;
  - **duplicate files on Drive:** joining two copies of the same device file is harmless; prefer the higher VV and delete the extra;
  - **re-delivery and retries:** re-merging the same file is harmless.
- **The causal context is a plain version vector, with no dot clouds.** A device's file at counter n contains all its own writes 1..n, and devices merge whole files, so every causal context is contiguous. The VV is the causal context of the delta-state CRDT papers (Almeida, Shoker, Baquero, "Delta state replicated data types", JPDC 2018; from memory).
- **It fits the existing app.** The app already rewrites a whole manifest on save. Sync diffs the previous manifest against the new one per key, gives each changed key a new dot (`deviceId:++counter`, in the same IndexedDB transaction as the save), and records the dots the key had before as replaced.
- **Upload order:** referenced blobs first, then the state file. A crash in between leaves only orphan blobs, never a state file pointing at missing pixels.
- **Download check:** decode the PNG and compare its RGBA SHA-256 with the key. Never trust the name.

Cases:
- **A** VV dominance, so no conflict.
- **B** different keys, so a clean merge.
- **C** MV register, so both values are kept and flagged.
- **D** separate cell keys, so a clean merge. Then re-run the existing offline item checks on clips that now mix cells from concurrent writes (see 1.5).
- **E** soft-delete with edit-wins (1.6).
- **F** nothing special. The device's file just carries more dots when it returns.
- **Interrupted upload:** each PUT is atomic and blobs go first. Resumable sessions on all three providers commit only on finalization (from memory).
- **Cleared browser data:** the device gets a **new** random deviceId (the old one is never reused), merges every `devices/*/chars/*.json`, and is fully restored except for edits never synced. The old device's file stays and keeps contributing its last state. That is correct, and it is how recovery works.
- **Multiple tabs:** they share one deviceId and IndexedDB. Dots are allocated inside the IDB readwrite transaction that saves (IDB transactions serialize). Only one tab syncs, holding `navigator.locks.request('pixeldoll-sync', {ifAvailable:true})`, and it announces merges over BroadcastChannel.
- **Cloned device ID** (OS or profile restore, a copied profile): on each sync, read your own cloud file. If it holds dots above your local counter, you are a clone or were restored from an older backup. Take a new deviceId and give new dots to unsynced local changes. This check is cheap and prevents silent dot collisions.

Cost: each device uploads a full character state per sync, which is the size of the manifest plus dots (tens to hundreds of KB). A reader fetches only the device files the change feed says changed, so the scale is O(devices x characters), not O(edits).

### 1.5 Merge granularity for PixelDoll

Rule: **one register per independently edited value that has a stable id**. Arrays of id'd records become maps keyed by id. Ordering becomes a field of its own.

| Data | Key | Type |
|---|---|---|
| Character name, rig settings | `char.name`, `rig.*` field | MV register |
| Base body (`rig`, skeletons, base item cells) | `rig` as **one** value | MV register. The body is regenerated as a unit and items depend on `baseHash`, so it should not merge field by field |
| Item scalar fields (`name`, `slot`, `status`, `mirror`, `hides`, `materials`, `prompt`, `key`, `route`…) | `item/<id>/<field>` | MV register |
| Item cell artwork | `item/<id>/cell/<anim>/<dir>/<frame>`, value `{main, fg, bg, cut}` | MV register. One value spans all layers and the `baseCut` of that cell, because a Fix-frames edit changes them together (`ItemFrameEdit.frames[].layers` + `cut`) |
| `provenance[]`, `frameEdits[]` | union keyed by `requestHash`/`id` | grow-only set. These are append-only history: never conflicts, keeps cost accounting complete |
| `qa` | per item | derived. Recompute after merge instead of syncing as truth, or use LWW |
| Slots, materials | `slot/<id>/<field>` | MV register. Array order → an `order` field (fractional index) as LWW: an order conflict is low value and easy to redo |
| Presets/outfits | `preset/<id>/name`, `preset/<id>/items/<slot>` | MV register per slot, so two devices changing different slots of one outfit merge |
| Palettes/recolor | per material id or ramp | MV register |
| Item existence | `item/<id>/deleted` with the VV observed at delete | soft-delete tombstone (1.6) |

**Frame vs clip.** A clip (item x anim x direction) is generated and checked as a set (frame and direction consistency gates). Merging frame 1 from device A with frame 2 from device B can therefore produce a valid-looking but inconsistent clip. Two options:

- **Recommended:** keep keys per cell, so no work is lost and case D auto-merges. After a merge, mark any clip whose cells carry dots from concurrent writers as needing review (reuse `status: 'stale'` or the existing review path) and re-run the offline gates on the stored frames. Nothing is paid.
- Simpler alternative: one key per clip, so case D becomes a conflict for the user to resolve. This is safer for generated clips but loses the "both edits kept automatically" property.

**Cross-key invariants.** Item cells are fitted to a particular base (`item.baseHash`). If the body was republished on device A while device B dressed a new item on the old body, the merge is syntactically clean but semantically stale. Reuse the existing stale-item detection after every merge. Sync must never "fix" this silently.

**What "keep both" looks like for an image layer.**
- An MV register for `item/hat/cell/walk/south/2` holds two values `{main: sha256:A…, fg: null, bg: null, cut: …, dot: phone:41}` and `{main: sha256:B…, …, dot: laptop:17}`.
- Both blobs stay referenced, so no GC can remove them.
- **Rendering and export use a deterministic display winner** (highest hybrid wall time, ties broken by deviceId; this choice never decides dominance), and the item shows a conflict badge.
- The resolution UI shows both frames side by side or flips between them (per cell, or the whole clip when several cells conflict), with three actions:
  - **Keep this** (writes a new value whose replaced-set covers both dots);
  - **Keep the other**;
  - **Keep both as a copy**: forks the item into a new item id that takes the losing values for the conflicted cells and the shared values elsewhere. A lone cell cannot stand as an item.

  This mirrors CouchDB's "winner plus `_conflicts`" and Syncthing's conflict copy, but inside the data model instead of as stray files.

### 1.6 Deletes, tombstones and GC

- **Character delete** = `library/<charId>/deleted = {vv: <VV observed>}`. **Item delete** = `item/<id>/deleted`.
- **Edit-wins resurrection:** after a merge, an item or character is live if any of its keys holds a dot not covered by the delete's VV. When resurrected, the UI says it was "restored because it was edited on <device>". Because deletes are soft, all fields are still present, so no partial fragment comes back. This satisfies **E** with no work lost.
- **Tombstone GC (optional, later):** purge a soft-deleted record's fields after a trash retention period, and only once every *active* device's VV (from its device file) covers the delete. A device not seen for a long time (for example 180 days) leaves the stability set. If it returns, it treats its unsynced local changes as new writes with fresh dots, so they show as concurrent: conflicts instead of loss. It re-uploads any blobs it holds that have since been GC'd.
- **Blob GC: none in v1.** PNG cells are small. The safe-GC race (device X uploaded a blob whose state file has not landed yet) needs grace periods and repair passes, which is YAGNI. A later manual "Clean up cloud storage" can delete unreferenced blobs older than 30 days.

---

## Part 2: Browser and PWA limits

### 2.1 Quotas and eviction (MDN, WebKit, web.dev)

| Browser | Per-origin quota | Eviction | `persist()` |
|---|---|---|---|
| Chrome, Edge (desktop and Android) | 60% of total disk (best-effort and persistent). The browser total is 80%. Incognito is about 5%. With "clear on exit", about 300 MB | LRU of best-effort origins under storage pressure or above the browser total. Persisted origins are skipped | **No prompt.** Heuristics: engagement, installed or bookmarked, notification permission |
| Firefox | Best-effort: the smaller of 10% of disk or a 10 GiB group (eTLD+1) limit. Persistent: 50% of disk, up to 8 TiB | LRU of best-effort origins | **Prompts the user** |
| Safari 17+ / iOS 17+ (macOS 14) | Browser apps: about 60% per origin, 80% total. Embedded WebViews: 15%/20%. **Home Screen/Dock web apps get the browser quota** | LRU; plus **ITP proactive eviction**: no user interaction in the last 7 days of Safari use deletes all script-created storage (IDB, localStorage, SW registrations, Cache) | Heuristics, **no prompt**. "Opened as a Home Screen Web App" is a named signal. Persisted origins are excluded from LRU and overall-quota eviction |
| Safari < 17 | About 1 GiB, then a prompt | same 7-day ITP rule | the API exists from 15.2 |

- Eviction is all-or-nothing per origin.
- **Home-screen web apps** "have their own counter of days of use", and WebKit says it would consider deletion of their first-party data "a serious bug". In practice they are exempt from the 7-day cap.
- **Unverified:** whether a *Safari-tab* origin in persistent mode is exempt from the ITP 7-day deletion. The WebKit storage-policy post lists ITP as an eviction trigger and lists persistent mode as excluded from eviction, but never states the combination explicitly. Treat Safari-tab data as deletable.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- https://webkit.org/blog/14403/updates-to-storage-policy/
- https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- https://web.dev/articles/storage-for-the-web
- https://web.dev/articles/persistent-storage

**`storage.estimate()`** returns an estimate only. Browsers pad cross-origin (opaque) data, and Chrome always reports quota as 60% of the disk regardless of free space (an anti-fingerprinting measure). Use it for display and early warnings, and always handle `QuotaExceededError`.

**Implications for PixelDoll:**
1. Safari-tab users who don't open PixelDoll for 7 days of Safari use lose everything. Cloud sync is their recovery path, and the UI should tell Safari-tab users to sync or install.
2. Request `persist()` after the user saves a first character or connects a cloud (Chromium grants it by heuristics; Firefox shows a prompt, so ask in context).
3. On iOS, Safari and the Home Screen app have **separate storage** (WebKit bug 181849: https://bugs.webkit.org/show_bug.cgi?id=181849), so they are two sync devices. That is fine under design (a').

### 2.2 Background execution

| Capability | Chrome/Edge desktop | Android Chrome | Firefox | Safari macOS | iOS Safari / iOS Home Screen PWA |
|---|---|---|---|---|---|
| Background Sync (one-off) | yes (Chrome 49+) | yes | **no** | **no** | **no** (none through iOS 27.2 per caniuse) |
| Periodic Background Sync | installed PWA only, engagement > 0, known networks only, browser-chosen timing | same | no | no | no |
| Web Push | yes | yes | yes | yes | Home Screen web apps only (16.4+). The only background wake-up there |
| Web Locks | 69+ | yes | 96+ | 15.4+ | 15.4+ |
| BroadcastChannel | 54+ | yes | 38+ | 15.4+ | 15.4+ |

Sources:
- https://caniuse.com/background-sync
- https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API
- https://developer.chrome.com/docs/capabilities/periodic-background-sync
- https://caniuse.com/mdn-api_lockmanager
- https://caniuse.com/broadcastchannel
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API (Baseline since March 2022)
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

**Service worker lifetime.** The spec says "The lifetime of a service worker is tied to the execution lifetime of events", and a UA "may terminate service workers at any time" when no event is pending (https://w3c.github.io/ServiceWorker/). Chromium kills idle workers after about 30 s and caps a single event (from memory for web SWs; the documented 30 s/5 min figures are for extension SWs: https://developer.chrome.com/blog/longer-esw-lifetimes). Never run a long multi-file sync inside a SW event unless it is chunked and resumable.

**Page lifecycle.**
- `visibilitychange` to hidden is "the last event that's reliably observable by the page" (https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event).
- `unload` is "extremely unreliable" on mobile. Use `pagehide`, not `unload`.
- Frozen pages stop timers and fetch callbacks, and discarded pages run no code (`document.wasDiscarded` tells you on reload). Guidance: release Web Locks and close IDB/BroadcastChannel on freeze (https://developer.chrome.com/docs/web-platform/page-lifecycle-api).
- `fetch(..., {keepalive:true})` / `sendBeacon` bodies are capped at **64 KiB in flight** by the Fetch spec. That is enough for a small state file at best, never for blobs.

**`online` event / `navigator.onLine`:** a hint only. `true` means only that a network interface exists. Use it to *try*, with backoff, never as proof (MDN, from memory).

**OAuth in an iOS standalone PWA.**
- The PWA has its own cookie jar and storage, separate from Safari.
- Out-of-scope navigation opens an in-app Safari View Controller (WWDC23, cited via https://progressivewebapps.com/platforms/ios-safari/). When that view navigates back into scope, it closes and the page loads in the standalone window (reported since iOS 12.2: https://medium.com/@firt/whats-new-on-ios-12-2-for-progressive-web-apps-75c348f8e945).
- `window.open` popup flows that rely on `opener`/`postMessage` or shared storage are unreliable there. Developers keep reporting OAuth that completes in Safari and never returns (https://developer.apple.com/forums/thread/100407, https://github.com/pocketbase/pocketbase/discussions/2429).
- Recommendation: use a **full-page redirect with PKCE**, with `code_verifier`/`state` in IDB or sessionStorage of the standalone context, and a redirect URI inside the manifest scope. **Must be tested on a real device on current iOS.** No current Apple doc confirms the behavior.

**Google Identity Services.**
- The token model ("implicit") issues **access tokens only**, with no refresh token. "A user gesture triggers the token flow", and only the dialog (popup) UX is supported (https://developers.google.com/identity/oauth2/web/guides/use-token-model).
- Lifetime is about 3600 s (https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow). That page now calls the implicit flow insecure for SPAs and says to use **Authorization Code with PKCE**.
- **Unverified:** whether Google's token endpoint accepts a secret-less code exchange from a browser "Web application" client. Reports conflict (https://github.com/manfredsteyer/angular-oauth2-oidc/issues/812 reports `client_secret is missing`). This decides whether Google sync can renew without a click every hour. Test it before committing to Google.
- FedCM migration applies to One Tap and the Sign in with Google button, not documented for the oauth2 token client (https://developers.google.com/identity/gsi/web/guides/fedcm-migration).
- **Third-party cookies:** Chrome is keeping them. In April 2025 Google dropped the deprecation and the standalone prompt, and later retired most Privacy Sandbox APIs (https://privacysandbox.google.com/blog/update-on-plans-for-privacy-sandbox-technologies). Safari and Firefox block them by default, so any **hidden-iframe silent renewal** (old gapi.auth2, MSAL `ssoSilent`) fails there.
- Microsoft states that SPA refresh tokens expire after **24 h** and renewal needs a top-level visit to the sign-in page "due to privacy features in browsers that block third party cookies" (https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens).

**Large Blob memory on iOS.**
- Apple publishes no per-page memory limit.
- Known canvas limits: 16,777,216 px (4096 x 4096) per canvas, and a total canvas memory cap that varies by device and version (224-576 MB in reports) (https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/, https://bugs.webkit.org/show_bug.cgi?id=195325).
- PixelDoll cells are tiny. To stay safe: upload one Blob per request straight from IDB (`fetch(url,{body: blob})`), never base64, never build a whole-library ZIP in memory for sync, limit concurrency (for example 4 uploads), and decode for verification one cell at a time (the existing LRU decode cache is 96 MB).

### 2.3 What can reliably trigger sync, per platform

| Trigger | Chrome/Edge desktop | Android Chrome | Firefox | Safari macOS | iOS Safari tab | iOS Home Screen PWA |
|---|---|---|---|---|---|---|
| App start / page load (pull + push) | reliable | reliable | reliable | reliable | reliable | reliable |
| Debounced after each local save (push, 2-5 s) | reliable while visible | reliable while visible | reliable | reliable | reliable while visible | reliable while visible |
| `visibilitychange` → visible (pull) | reliable | reliable | reliable | reliable | reliable | reliable |
| Poll or long-poll while visible (Drive changes, Dropbox longpoll, Graph delta; for example 30-60 s) | reliable | reliable | reliable | reliable | reliable | reliable |
| `visibilitychange` → hidden (best-effort push of small state files only) | best-effort | best-effort | best-effort | best-effort | best-effort (often frozen quickly) | best-effort |
| `online` event | hint | hint | hint | hint | hint | hint |
| Background Sync (flush outbox after the tab closes) | yes, optional | yes, optional | no | no | no | no |
| Periodic Background Sync | installed only, unpredictable | installed only, unpredictable | no | no | no | no |
| Push-triggered sync | needs a push server (we have none) | same | same | same | same | same |

**Conclusion: design for foreground-only sync everywhere.**
- Use start, resume, a debounced save, and polling while visible.
- Treat "hidden" as a best-effort final flush.
- Background Sync is an optional Chromium-only extra. It also needs a usable access token in the SW, which Google's 1 h, click-to-renew token model often won't provide.
- Without a server there is no push, so iOS can never sync in the background.
- Show "last synced" and "N changes waiting" so foreground-only behavior is visible.

---

## Part 3: Security

**Least-privilege scopes.**
- Google `drive.appdata`:
  - non-sensitive;
  - a hidden folder: the user **cannot** open the files in the Drive UI;
  - no sharing or trash inside it;
  - deleted when the user removes the app.
- Google `drive.file`:
  - non-sensitive, per-file access to files the app created or the user opened with it;
  - visible in Drive, so the user can open their own PNGs;
  - Google recommends it over the restricted `drive` and `drive.readonly`.
  - https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Dropbox: the **App Folder** access type with only the files content and metadata read/write scopes.
- OneDrive: `Files.ReadWrite.AppFolder`, plus `offline_access` if refresh tokens are used.
- Recommendation: a visible app folder (`drive.file`, Dropbox App Folder, OneDrive AppFolder). Users keep plain, browsable PNGs and JSON, which matches "user-owned data" and works as a manual backup.

**Token storage.**
- RFC 10017 (OAuth 2.0 for Browser-Based Apps, BCP 212, August 2026; formerly draft-ietf-oauth-browser-based-apps):
  - malicious JS "has the same privileges as the legitimate application code";
  - no frontend mechanism prevents an XSS attacker from running a new authorization flow;
  - it recommends a BFF, which we cannot have;
  - browser-only clients are public and must use PKCE;
  - holding the refresh token in a Web Worker blocks simple exfiltration of the refresh token, and DPoP with a non-extractable key prevents simple token theft.
  - https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/
- RFC 9700 (Security BCP, §2.1.1 and §2.2.2): public clients MUST use PKCE, and public-client refresh tokens must be sender-constrained or rotated (https://datatracker.ietf.org/doc/html/rfc9700).
- **Per provider:**
  - Google: access tokens only, no refresh token in the browser.
  - Microsoft: rotating SPA refresh tokens capped at 24 h.
  - Dropbox: PKCE clients *can* get long-lived refresh tokens with `token_access_type=offline`, but Dropbox advises pure JS web apps to use short-lived tokens without refresh tokens (https://docs.dropboxapi.com/dropbox-api/docs/oauth).
- **Practical recommendation:**
  - Keep access tokens in memory.
  - If a refresh token is stored (Dropbox, Microsoft) to avoid reconnecting every visit, store it in IndexedDB under its own key, **separate from `localStorage['pixellabApiKey']`**. Never broadcast it, never log it, and delete it on Disconnect with provider revocation.
  - Be honest that XSS anywhere on pixeldoll.app exposes it, exactly as the PixelLab key is already exposed by design. The marginal risk is that the attacker also gets read/write on the PixelDoll app folder, not the whole drive, *if* scopes stay narrow.
  - A non-extractable WebCrypto key wrapping the refresh token protects only against at-rest copying (disk forensics, profile sync), not XSS. That is consistent with the project's decision to avoid encryption and unlock theater for the PixelLab key.
  - The best mitigations are narrow scopes, a strict CSP, no third-party scripts, and short-lived tokens.
- **Revocation:**
  - Dropbox: `auth/token-revoke`.
  - Google: `https://oauth2.googleapis.com/revoke` (from the implicit-flow doc).
  - Microsoft: user or admin revocation of refresh tokens. Rotated tokens do not revoke old ones automatically, so the app must delete old ones.
  - Disconnect = revoke, then delete local tokens, then optionally keep or delete cloud files (ask).

**Client-side encryption (WebCrypto AES-GCM).**
- How: a 256-bit AES-GCM key derived from a passphrase (PBKDF2-SHA-256 with high iterations), a random 96-bit IV per file, and the file key or ID as additional authenticated data to prevent swaps.
- Pro: the provider cannot read the art or prompts.
- Cons:
  - the user can no longer open their own PNGs or JSON in Drive, Dropbox or OneDrive;
  - a lost passphrase means lost data;
  - extra UI (passphrase on every new device);
  - content-addressed dedup must use a keyed hash (HMAC) for file names, or the names leak which known images you have;
  - it conflicts with "no extra unlock step" and simplicity-first.
- The data is low sensitivity (sprite art and prompts) and already sits in the user's own account. **Recommendation:** no encryption in v1, with readable files. If wanted later, make it an opt-in per cloud folder, recorded in `format.json`, not the default.

---

## Recommendation summary

1. **Mechanism:** per-device, per-character state files (state-based CRDT: a map of multi-value registers with version-vector causal context, soft-delete tombstones with edit-wins), plus a shared write-once blob store named by RGBA SHA-256. No CAS, locks, logs or server needed. Works identically on Drive, Dropbox, OneDrive (and WebDAV) and tolerates eventually consistent listings, duplicates and retries.
2. **Granularity:**
   - field-level for item, slot, preset and palette fields;
   - per-cell for artwork (`item/anim/dir/frame`, all layers plus cut as one value);
   - the base body as one unit;
   - append-only union for provenance and frame-edit history;
   - re-run offline gates or mark stale after merges that mix concurrent cells or touch the body.
3. **Conflicts:** keep both values; render a deterministic winner with a badge. Resolve with Keep this / Keep other / Keep both as a copy (forks the item).
4. **Sync triggers:** foreground only (load, resume, debounced save, poll while visible, best-effort hidden flush). Background Sync is an optional Chromium-only extra.
5. **Browser must-dos:**
   - one sync leader per origin via Web Locks, notifying other tabs over BroadcastChannel;
   - allocate dots in the IDB save transaction;
   - new deviceId after cleared data, with a clone check;
   - `persist()` after first save or connect;
   - warn Safari-tab users about 7-day eviction.
6. **Open items to verify before building:**
   - (i) a Google secret-less PKCE code exchange from a browser client (otherwise a click every hour);
   - (ii) OneDrive `If-Match` on content PUT (only an optimization under this design);
   - (iii) a redirect-based OAuth round trip in an iOS 18/26 Home Screen app on a real device;
   - (iv) whether Safari persistent mode exempts a tab origin from ITP 7-day deletion.
