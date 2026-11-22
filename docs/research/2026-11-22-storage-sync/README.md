# Local-first storage, cloud backup and cross-device sync

Research date: 2026-11-22. Board card: [Add cloud sync storage such as Google Drive](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=313269813).

## Answer in one paragraph

No existing library fits. PixelDoll should keep IndexedDB as the only working copy, and add a small sync engine of its own over the user's own cloud folder: Google Drive first (through one stateless sign-in endpoint; see the update below), Dropbox second, OneDrive only if asked for. Remote files are of two kinds. Most are immutable and named by their content: artwork packs, item objects, and one small revision file per character save. The rest are one small "heads" file per device, written only by that device. Because no file is ever written by two devices, the design needs no compare-and-swap. Google Drive has none, so this matters. A lagging listing, a duplicate file or an interrupted upload can only delay a sync, never corrupt one. Concurrent edits merge three ways against their common ancestor:
- Different items merge.
- Different frames merge.
- The same field edited on two devices keeps both values and is flagged.
- A delete never beats an edit.

A runnable proof of concept passes all twelve scenarios in the handoff, plus corruption, lagging listings, eviction, long catch-ups, storage growth and a 300-run randomized three-device test ([poc/](poc/), 33 tests). It is simulated: no real provider, phone or browser was tested (see [G](#g-proof-of-concept-results)). Developer cost stays at $0 at 10,000 users, with one watch item: Google's planned Drive API charges, which packing keeps far away.

## Update after the owner's review (same day)

The owner wants Google Drive as the main provider, and won't accept signing in every visit or every hour. A second round of reviewers checked sign-in, terms of service, no-OAuth options, a separate library and hosting, then an adversarial reviewer attacked the combined plan ([notes/R2-*](notes/), [notes/R3-*](notes/)). Changes to the plan:

**Google Drive first, through one tiny token endpoint.** A pure static page cannot stay signed in to Drive within Google's rules ([R2-google-auth](notes/R2-google-auth.md)):
- Google gives browser apps 1-hour tokens and no refresh token.
- Renewing needs a popup on a click, and on iPhone Home Screen apps that popup often never returns.
- Shipping the client secret in the page, or using the TV-style device flow, breaks Google policy.

The fix is a ~30-line stateless function on a free host, such as Cloudflare's `workers.dev`:
- It holds the Google client secret and only exchanges the sign-in code and refreshes tokens.
- It stores nothing. The refresh token stays in the browser's IndexedDB, and all files go browser to Google directly.
- It is Google's own designed route: its code-model docs do the exchange on a backend. RFC 10017 lists a "token-mediating backend" as acceptable, and diagrams.net does the same ([R2-relay-terms](notes/R2-relay-terms.md)).

Cost: about 40,000 requests a day at 10,000 users, against a free limit of 100,000. It does conflict with AGENTS.md "never add a backend", so that rule needs the owner's amendment. If the function goes down, Google sync pauses within about an hour, and local work and the Drive files are unaffected.

**Token in IndexedDB, not a cookie.** A cookie on a subdomain would need DNS moved from Porkbun to Cloudflare, and Safari caps such cookies at 7 days ([R3-hosting](notes/R3-hosting.md)).

**Dropbox second,** as the provider that needs no PixelDoll infrastructure at all. **OneDrive** only if asked for.

**OAuth is necessary.** Without it no phone can sync automatically ([R2-no-oauth](notes/R2-no-oauth.md)). Registering costs nothing, but brings ongoing upkeep:
- **Google:** Production status and brand verification (about 2-3 days; needs a privacy policy page).
- **Dropbox:** a free review after 50 users.

**Adopted from the adversarial review** ([R3-adversary](notes/R3-adversary.md)):
1. A **1-2 day sign-in spike gates the build:**
   - real iPhone Home Screen, Android and desktop round trips for Google (throwaway endpoint) and Dropbox
   - whether a second browser sees the same `drive.file` folder
   - what revoking does to other devices
2. **Recovery if the Google app registration is lost or suspended:** under `drive.file` the files stay in the user's Drive but become invisible to a new registration. So add a Google Picker re-link and "import a downloaded copy of the sync folder".
3. **Google token details:**
   - request `prompt=consent` on each new device so it gets its own refresh token
   - offer "Disconnect this device" separately from "Disconnect everywhere"
   - publish to Production, since Testing tokens die after 7 days
   - handle tokens left unused for 6 months and the 100-token cap
4. **Find the real root folder by an `appProperties` tag, not its name.** Adopt the oldest when two devices raced to create it. Treat a trashed folder as "rebuild?", never as "delete everything". Show the account email.
5. **Drop the desktop folder-backup idea.** Under `drive.file` it carries nothing over to Drive sync, and it only helps desktop Chrome and Edge. Lift the backup ZIP's 64 MiB and 5,000-entry caps instead.
6. **Merge at item level in v1.** Concurrent edits to one item become a keep-both conflict. Frame-level merging, which the PoC proves possible, waits until mixed clips can be re-checked automatically.

**The library stays in this repo** ([R2-library-repo](notes/R2-library-repo.md)):
- About 85% of the PoC is general, but there is one user and no proven demand.
- A separate repo would add a release-and-bump loop to every sync fix, like bronze-ui, and freeze the cloud format early.
- Build it as a self-contained folder (`core/`, `providers/`, `auth/`) with no imports from the Studio.
- Extract it when a second app needs it, someone outside asks for it, or it has been stable with real users for a couple of months.

**Owner decision (2026-11-22):** the stateless token endpoint is approved. AGENTS.md now allows it as the only server piece (PLAN.md D31).

### What the owner sets up (one time, free)

OAuth is required, and it is what gives users a one-click sign-in instead of creating and pasting keys.

**Google Drive:**
1. **Create the Google project.** Sign in at [console.cloud.google.com](https://console.cloud.google.com/) and create a project named PixelDoll. Don't add a billing account: with none attached, there is nothing to charge (expected, not verified: over-quota calls would fail instead).
2. **Enable the API.** Turn on the Google Drive API.
3. **Set up the consent screen** (Google Auth Platform > Branding):
   - app name PixelDoll, support email, logo
   - home page https://pixeldoll.app/
   - privacy policy page (the agent writes it; it ships with the app)
   - authorized domain pixeldoll.app
4. **Prove the domain.** Verify pixeldoll.app in [Google Search Console](https://search.google.com/search-console) with a TXT record at Porkbun.
5. **Add the permission.** Under Data Access, add only the `drive.file` scope (non-sensitive: no security review).
6. **Create the Web client.** Create an OAuth client of type "Web application":
   - JavaScript origin https://pixeldoll.app
   - plus `http://localhost:5199` for agent testing
   - the redirect URI the agent gives you
7. **Hand over the keys.** Give the agent the **client ID**, which is public. Put the **client secret** only into Cloudflare (step 9), never into the repo or chat.
8. **Go public.** Publish the app to Production and submit brand verification (about 2-3 business days). Testing mode logs everyone out after 7 days. Whether an unverified `drive.file` app shows Google's "unverified app" screen is disputed; verify it.
9. **Set up Cloudflare.** Create a free account. Then deploy the token function the agent writes (one command), and store the secret with `wrangler secret put`. No card is needed.

**Dropbox (later):**
1. **Create the app.** At [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps): Scoped access, **App folder**, named PixelDoll.
2. **Configure it.** Add the redirect URI and allow PKCE. Dropbox needs no secret and no server.
3. **Hand over the key.** Give the agent the **App key**, which is public.
4. **At 50 connected users,** submit the free production review within 2 weeks.

**Testing:** have a spare Google account and a spare Dropbox account ready, so sync tests never touch your own files. Then run the 1-2 day sign-in spike on your iPhone (Home Screen app), an Android phone if available, and desktop. An agent can drive the desktop part. On phones you tap through sign-in yourself.

### What users do

**Google Drive:**
1. **Connect.** Settings > Sync > **Connect Google Drive**.
2. **Choose an account.** Google's own page opens; the user picks their account.
3. **Allow access.** Google shows: "PixelDoll wants to see, edit, create and delete only the specific Google Drive files you use with this app." The user taps **Continue**.
4. **Done.** Back in PixelDoll, a `PixelDoll` folder appears in their Drive and syncing starts.
5. **On another device:** the same three taps with the same account, and the library downloads.

**Dropbox:**
1. **Connect.** Settings > Sync > **Connect Dropbox**.
2. **Sign in.** The user signs in on Dropbox's page, which asks to let PixelDoll access "its own folder" (`Apps/PixelDoll`). The user taps **Allow**.
3. **Done.** Syncing starts.

No keys, no copying and no pasting. A user signs in again only if they:
- disconnect
- revoke access in their Google or Dropbox account
- don't use PixelDoll on that device for 6 months (Google)
- clear the browser's data

The sign-in spike confirms this on an iPhone Home Screen app before any of it is built.

The sections below are the original report. Where they say "Dropbox first", the plan above replaces them.

Contents: [A Repository](#a-repository-assessment) · [B Libraries](#b-library-comparison) · [C Providers](#c-cloud-provider-comparison) · [D Protocol](#d-protocol-and-synchronization-strategy) · [E Architecture](#e-proposed-architecture) · [F Cost](#f-cost-analysis) · [G Proof of concept](#g-proof-of-concept-results) · [H Roadmap](#h-implementation-roadmap) · [I Recommendation](#i-final-recommendation) · [Disagreements](#unresolved-disagreements) · [Decisions for the owner](#decisions-for-the-owner) · [Notes](#how-this-was-researched)

---

## A. Repository assessment

Verified against the code at commit 6ff0567aa. Details and file:line citations are in [notes/A1-repo.md](notes/A1-repo.md).

**What exists**

- **IndexedDB `pixeldoll`** has three stores: `projects`, `blobs` and `jobs` (app/src/lib/store/db.ts:1, 33-37).
  - It is opened without a version number. The version only goes up as the fence for "Delete local work".
- **One `projects` record is one character** (`rig-<uuid>`). It holds the pixeldoll/3 manifest plus skeletons, QA and device-local receipts.
  - The same store also holds device-local flow records: `studio-drafts`, `studio-create:*`, `library-archive:*` and others.
- **Artwork blobs are content-addressed and never changed in place.**
  - Character cells are keyed by SHA-256 of their **decoded RGBA pixels**, not their PNG bytes (rig/rig.ts:143).
  - Queue blobs are keyed by byte hash.
  - A local mark-and-sweep (`gcBlobs`) removes unreferenced blobs.
- **Every save rewrites the whole character record.**
  - No record carries a revision or device id, and `savedAt` is unreliable.
  - A deleted character leaves no tombstone.
- **Ids:**
  - Characters have random ids.
  - Item ids are slugs of the item name, unique only within one character on one device.
  - Outfit ids change when an outfit is renamed.
  - Frames are positions (`move/direction/index`).
- **Backup** (`pixeldoll-backup/1`, backup.ts) is a manual ZIP of characters and blobs.
  - Restore never overwrites: it previews add, copy, skip or blocked per character, then commits in one transaction.
  - The handoff's claims are half right:
    - The 64 MiB limit is real, plus 5,000 entries, 128 MiB expanded and 500 records (zip.ts:100-102, workspace.ts:40-41). A big library hits the 5,000-entry cap first.
    - "Opens a temporary copy" applies only to the Developer-mode "Open backup as a copy". Normal "Restore from backup" adds into IndexedDB.
- **Multi-tab coordination is already there:**
  - the `pixeldoll-storage` presence lock and the delete fence
  - the queue leader lock and channel
  - per-character generation locks
  - BroadcastChannels for identity, export settings and auth
- **`navigator.storage.persist()`** is requested and its result ignored. `estimate()` is never called.

**What to sync** (allow-list, never a store dump)

| Data | Sync? | Why |
| --- | --- | --- |
| Character records (`rig-*`), minus `creationSpec`, `moveRecovery`, `moveReviews`, `stateGeneration` | Yes | The user's work. The stripped fields are paid-attempt receipts that only make sense on the device that made the call. Exports already strip them (workspace.ts:235, 389-393). |
| Their artwork blobs | Yes | Immutable, so they never conflict |
| `studio-export-settings`, prompt suggestions, creation defaults | Later, optional | Small preferences. Last-writer-wins is fine. |
| `jobs` ledger, drafts, flow records, crash buffers | **Never** | Another device would resubmit queued records as new paid calls (queue.ts:1-10, 1077-1112) |
| `pixellabApiKey`, agent key, cloud tokens | **Never** | Credentials stay per device (docs/shared-token-security.md) |
| `library-archive:*` | No | Old-format data kept only for download |

**What can be reused**
- the content-addressed blob store (upload only hashes the remote lacks)
- the backup ZIP writer and reader
- the restore planner's keep-both model and character fingerprints
- the lock and channel patterns

**What must change**
1. Sync metadata needs a place to live: base revision per character, pending uploads, device id, remote index.
   - Use a separate database, `pixeldoll-sync`. Adding a store would need a version upgrade, and the version is the delete fence.
   - Delete local work must also clear it.
2. Deletes need to be recorded as sync tombstones. Only an explicit user delete should create one, never an empty or evicted database.
3. Ids must be stable and unique across devices:
   - random item ids instead of name slugs
   - outfit ids that survive a rename
   - The PoC copes with slug collisions by keeping both items, but stable ids remove the cause.
4. Remote changes must wait while generation work or unsaved edits hold a character. `editIdleCharacter` already enforces that for local edits.
5. Verifying a downloaded cell means decoding the PNG and hashing its pixels. Alternatively, also record the byte hash next to the pixel hash.

**Risks**
- **Devices on different builds:** the no-backward-compatibility rule means they cannot read each other's manifests. Sync needs a format check that pauses with "Update PixelDoll on this device" rather than merging across formats.
- **Eviction:** browser eviction must not look like mass deletion. It doesn't in this design (see the eviction test).
- **Request counts:** large libraries are tens of thousands of small cells. That is why the design uses packs.

## B. Library comparison

Every serious candidate was checked against its docs, releases and source. Sizes were measured where marked. Full table and sources: [notes/A2-libraries.md](notes/A2-libraries.md). A bounded hands-on run of the strongest candidate is in [notes/A5-rxdb-handson.md](notes/A5-rxdb-handson.md).

| Candidate | Needs its own server | User-owned drives | Wraps existing IndexedDB | Binary artwork | Conflicts | Activity, license | Size (gzip) | Fit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **RxDB 17** + replication-google-drive / -onedrive | No | Drive, OneDrive (beta). **No Dropbox.** | No: migrate into RxDB collections (rewrite db.ts) | base64 inside each document's JSON (+33%); one Drive file per document | Pluggable handler; default keeps remote, drops local | 17.6.0 (2026-10-05), Apache-2.0, plugins free | 154 kB measured | Closest. Fails on migration, request counts per cell, Drive v2 dependence and beta status. |
| remoteStorage.js 2.0 | No (or a remoteStorage server) | Dropbox, Drive | No: own cache | Yes | Remote wins | 2.0.0-beta.10, MIT | ~ | Drive backend hard-codes the restricted `drive` scope; still beta |
| Automerge 3 + automerge-repo | Peer or sync server for networking; storage pluggable | None shipped (adapter possible) | No | Bytes in documents, heavy | CRDT, keeps conflicting values | 3.5.0, MIT | **1,117 kB WASM** measured | Too heavy for this, and every save would become CRDT operations |
| Yjs | Provider or relay | None | No | Poor | CRDT, LWW per key | MIT, active | ~30 kB | Built for live text collaboration |
| TinyBase | Synchronizer over WebSocket/BroadcastChannel | None | No | No | LWW (mergeable store) | MIT, active | small | LWW breaks "keep both" |
| Dexie Cloud | **Hosted** | No | Dexie only | Yes | Per field | Free tier 3 production seats | | Developer-paid backend |
| PouchDB / CouchDB | **CouchDB** | No | No | Attachments | Revision trees | 9.0.0 (2024-06) | | Needs a server |
| Replicache/Zero, Jazz, PowerSync, ElectricSQL, Evolu, Triplit, LiveStore, Kinto | **Yes** (relay/backend) | No | No | Varies | Varies | Varies | | Break zero cost and "works if discontinued" |
| SignalDB, drivestash, dexie-syncable, IDBSideSync | No | Thin, LWW, or unmaintained | | | LWW | dexie-syncable unmaintained since 2023; IDBSideSync dead since 2022 | | No |
| **Custom engine over a 4-method adapter (recommended)** | No | Any provider with list/get/put/delete | Yes, beside the existing stores | Native Blobs, packed | Three-way merge, keep both | Ours | ~10-15 kB est. | Smallest change; the PoC engine and merge are ~650 lines |

**Verdict:**
- No maintained library syncs both ways, with keep-both conflicts, against Dropbox, Drive and OneDrive from a static page, while leaving PixelDoll's IndexedDB layer alone.
- RxDB comes closest:
  - It would replace db.ts, the delete fence and the job-ledger isolation.
  - It stores each cell as base64 JSON in its own Drive file.
  - It still needs a custom conflict handler, which is the hard part anyway.
- **RxDB, tested hands-on** (17.6.0 against its own `google-drive-mock` 1.2.0, no real Google account; [notes/A5-rxdb-handson.md](notes/A5-rxdb-handson.md)):
  - **Default conflicts:** in cases B, C and E the first device to sync won the whole document. The other edit was lost with no error.
  - **Custom handler:** it receives the common base and can merge per field, so this is fixable.
  - **Request overhead:**
    - every sync start costs 17-24 requests (an idle sync is 24; the PoC needs 1)
    - every write is uploaded twice (write-ahead log, then document file)
    - a one-field edit rewrote the whole document (40 requests)
  - **Cells as 500 documents:** 515-753 requests to push and 559-663 to pull on a fresh device. That is per-file cost again, plus base64 (pushes put ~3.1× the raw bytes on the wire).
  - **Data loss with 500 attachments on one document:** changing one attachment rewrote the file with data for only one attachment. New devices then failed to load the document (reproduced 3 times).
  - **Stalls:** a failed upload left the lock held, and sync stalled until restart.
  - **Bundle:** the plugin pulls in simple-peer and needs a Node `events` polyfill for Vite (+72 KB gzip).
  - **Verdict:** not production-ready for PixelDoll without patches. This confirms the paper verdict.
- The automerge-repo storage-adapter idea was considered, and it is feasible: several repos may share one store. But it would turn manifests into CRDT documents with a 1.1 MB WASM runtime, and still leave artwork, packing and provider auth to custom code.
- What real apps on dumb storage do (Joplin, Super Productivity, Remotely Save, Actual, YNAB4) points the same way. Each device should write its own files. Never trust timestamps. Never let an empty device overwrite the remote. Keep both versions.

## C. Cloud provider comparison

Primary sources are cited in [notes/A3-providers.md](notes/A3-providers.md). Key claims were rechecked for this report on 2026-11-22.

| | **Dropbox** | **Google Drive** | **OneDrive (personal)** | Box | iCloud | WebDAV/Nextcloud | S3-compatible (own keys) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Free storage | 2 GB | 15 GB shared with Gmail and Photos | 5 GB shared with Outlook | 10 GB | 5 GB | Varies | Pay as you go |
| Static page can call it | Yes (CORS) | Yes | Yes, but `/content` redirects fail CORS; use `@microsoft.graph.downloadUrl` | Token exchange needs a client secret: **backend needed** | CloudKit JS needs the $99/yr Apple program | Usually no CORS | Yes with bucket CORS |
| Sign-in without a backend | PKCE, no secret. Refresh tokens available with `token_access_type=offline`, though Dropbox's guide recommends short-lived tokens for browser apps | Token model only: ~1 h access tokens, **no refresh token**. Renewing needs a user gesture (or a silent attempt that fails under cookie blocking). PKCE code exchange reportedly needs a client secret (unverified) | PKCE; browser-app refresh tokens **die after 24 h**, then a full-page redirect | | | Basic auth | Access keys typed in |
| Least-privilege visible folder | App folder `/Apps/PixelDoll` | `drive.file` + visible `PixelDoll/` folder (non-sensitive, no security assessment). `drive.appdata` is hidden from the user, so rejected | `Files.ReadWrite.AppFolder` | | | | |
| Approval | Production review after 50 linked users (free, 2-week window) | Brand verification (free). Testing mode limits refresh and users, so publish | Publisher verification needed for many work tenants | | | | |
| Conditional write | `update(rev)` compare-and-swap; `add` without autorename | **None** in v3; duplicate names allowed | `if-match` on upload sessions | | | ETag | If-Match / If-None-Match (AWS, R2) |
| Change feed | `list_folder/continue` + longpoll | `changes.list` polling | `delta` | | | | |
| Version history | 30 days | ~30 days / 100 revisions | Yes | 1 version | | | Optional |
| Developer cost | None | **Quota units:** download 200, list 100, edit 50. Free under 400M units/day/project. Charges for projects created on or after 2026-05-01 are "planned ... later in 2026" with 90 days' notice ([limits](https://developers.google.com/workspace/drive/api/guides/limits), checked 2026-11-22) | None | | $99/yr | | User pays the bucket |
| Verdict | **First** | **Second** | Third, on demand | Excluded | Excluded | Power users only | Power users only |

**Why Dropbox first** even though Drive has more free space:
- It is the only major provider where a static page can stay signed in, so automatic sync really is automatic.
- Its visible app folder is the cleanest "the user owns the files".
- It has true compare-and-swap, as a safety net.
- It never bills the developer per call.

Drive's hourly sign-in click makes it backup-on-open rather than automatic sync, and its planned billing must be watched (see [F](#f-cost-analysis)).

**Same layout everywhere: yes.** The design uses only lowercase-hex names, three folders and no renames, appends or locks. The Drive adapter maps paths to file ids and drops duplicate names, which are harmless because duplicates are identical immutable content. Switching providers copies files. Immutable files make the copy resumable (PoC test T10).

## D. Protocol and synchronization strategy

**Is there a standard? No.**
- remoteStorage is still an individual Internet-Draft.
- WebDAV and CouchDB replication need a server that speaks them, and none of the three drives does.
- RFC 9110 `If-Match` is the right primitive, but Drive lacks it.

The established approach that fits is the one git, restic and automerge-repo storage use:
- immutable content-addressed objects
- per-writer refs
- three-way merge against a common ancestor (as git, Unison and Syncthing do)

PixelDoll adds no new protocol, only a file layout.

**Rejected alternatives** (analysis in [notes/A4-protocol-browser.md](notes/A4-protocol-browser.md)):
- **One shared index updated with compare-and-swap:** silently loses updates on Drive, and is a hot file.
- **Per-record files that two devices both rewrite:** has the same lost-update window.
- **A full CRDT:** the product wants "detect and keep both", not silent auto-merge, and the manifest already arrives as whole snapshots.
- **Last-writer-wins files:** the PoC baseline shows it silently drops a recolor in case B.

**How revisions work**
- Each sync turns a changed character into a new **revision**: `{record, parents[], deleted, body, conflicts}`.
  - Its id is the SHA-256 of exactly those fields, so the device and time are not part of the identity.
  - It is written once to `revs/<character>/<depth>.<revId>.<parent ids>.json.gz` and never changed. Because the name carries depth and parents, one listing gives the whole graph.
  - Its body stores each item as a reference to an immutable `objects/<sha256>.json.gz`, like git trees. Unchanged items are shared between revisions, so a one-field edit stores one item (15 KB measured) rather than the whole character (142 KB).
- Each device keeps `devices/<deviceId>.json` = `{character: headRevId}` and rewrites it after each push. No other device ever writes it.

**How changes are detected**
- A sync lists `devices/` (one request) and re-reads only the heads files whose ETag changed.
- It then fetches head revisions it doesn't have. To merge, it lists that character's revision folder once and downloads only the common ancestor's body. Catching up after 150 syncs elsewhere took 8 requests (test; the first version of the PoC walked the history and needed 151).
- An idle check is one list request (measured).
- Provider change feeds (Dropbox longpoll, Drive `changes.list`, Graph `delta`) can replace the list later as an optimization.

**Keeping local and remote consistent**
- **Push order:** artwork first, then revisions, then the heads file. A reader never sees a head whose revision or cells are missing.
- **Applying a remote revision:** only when every cell it references has been downloaded and verified. Until then, the local copy stays.
- **Pending revisions** are tracked locally until uploaded, so an interrupted sync resumes. Uploads are idempotent because names are content hashes (T6: zero duplicate uploads).
- **Repair:** if a device's own heads file has vanished (a wiped or restored folder), the device lists what exists and re-uploads everything its heads need (T8). Provider switching uses the same step (T10).

**Simultaneous editing**
1. Several heads for one character means concurrent edits.
2. The engine merges them pairwise against their nearest common ancestor: the deepest shared revision, ties broken by id. Merge rules:

| Data | Rule |
| --- | --- |
| Objects | Merge per key |
| Arrays of objects with unique `id` (items, slots, materials, outfits) | Merge per id. Order follows whichever side reordered. |
| Frame lists (`items/*/layers/*/cells/<move>/<direction>`) | Merge per position, so frame 1 vs frame 2 both survive (case D) |
| Palette ramps, coverage, everything else | Atomic |
| Same id added on both sides with different content (name-slug collisions) | Keep both; the second gets a derived id |

3. A field both sides changed differently is a **conflict**:
   - Side A's value stays live. A is the head with the larger revision id, so every device computes the identical merge revision and converges without coordination (tested).
   - Both values are stored in the revision's `conflicts` list until the user picks one.
   - The user's choice is an ordinary save, so the resolution syncs like any edit (T4).
   - Conflict notes merge three ways too, so a note resolved on one device does not come back.
4. If a merge breaks the manifest's own rules (an outfit naming an item the other side removed), the merge falls back to keeping A whole with B whole in the note.
5. Mixing frames from two devices can break a clip's motion continuity, and leaves the item's `qa`, `provenance`, `frameEdits`, `baseCut` and `dressed` describing neither side. The production engine must mark such a clip for review and rerun the existing offline item checks. The PoC does not do this yet.
6. A criss-cross history has several common ancestors, and the PoC picks one deterministically. Two randomized runs (150 and 300 seeds) found no lost write, but that is not a proof. If a real case appears, merge the ancestors into a virtual base, as git's recursive strategy does.

**Deletion**
- A user delete is a tombstone revision.
- Delete against an untouched copy: the character is deleted.
- Delete against an edited copy: the edit wins and a "deleted on another device, kept because it was edited" note is shown (T11, case E).
- An evicted or wiped database creates no tombstones. It just looks like a new device and is restored (eviction test).
- Remote artwork and revisions are never deleted automatically in v1.

**Backup and restore**
- The cloud folder is the backup: every revision of every character, all its art, and a heads file per device.
  - Restoring after browser data loss means connect and sync (T7).
  - "Restore a previous version" means picking an older revision of a character.
  - The provider's own version history (Dropbox 30 days, Drive ~30 days) also protects the heads files.
- The manual `pixeldoll-backup/1` ZIP stays as the provider-independent export. Its 64 MiB and 5,000-entry caps should be lifted (streamed ZIP64 or split archives) so it can hold a whole library.

**Long offline periods (case F)** need nothing special.
- The returning device's revision chain merges against the common ancestor (T5: five offline days against five online days).
- If revisions are ever pruned, a device offline past the retention window merges two-way: everything that differs becomes a conflict. That is noisier, but it still loses nothing.

**Browser and mobile constraints that shape the triggers** ([notes/A4-protocol-browser.md](notes/A4-protocol-browser.md)):
- **Background Sync and Periodic Background Sync are Chromium-only.** Firefox, Safari and iOS have neither, and without a server there is no push. So sync runs in the foreground:
  - on open
  - on `visibilitychange` to visible
  - a few seconds after a save (debounced)
  - on `online`
  - every 60 s while visible
  - a best-effort small push on `pagehide`
- **One sync per browser:** a Web Lock `pixeldoll-sync` (T12), with a BroadcastChannel to refresh other tabs.
- **Safari deletes all script-writable storage of a site left unused for 7 days of Safari use.** Home Screen apps keep their own counter. On iOS, Safari and the Home Screen app have separate storage and act as two devices. Cloud sync is the recovery path, which is a strong argument for shipping it.
- **Storage requests:** call `persist()` after the first save or connect, and show `estimate()` in Settings. Handle `QuotaExceededError` as "device storage full".
- **iOS Home Screen app sign-in:** use a full-page redirect with PKCE and test it on a real iPhone. Popups and old reports of the redirect landing in Safari are the main risk.

## E. Proposed architecture

```
 Studio (Svelte) ──save──▶ db.ts ──▶ IndexedDB "pixeldoll"  (projects, blobs, jobs: unchanged, the working copy)
                              │
                              └─ bumps a local version per character
                                                         │
 IndexedDB "pixeldoll-sync"  ◀──────── sync engine ───────┘   (one tab at a time: Web Lock "pixeldoll-sync")
  device id, base revision per character,                  │   triggers: open, visible, save+3 s, online, 60 s
  revisions cache, pending uploads, remote pack index      │
                                                          ▼
                                    adapter { list, get(range), put, del }      ~150-300 lines each
                                     ├─ Dropbox  (/Apps/PixelDoll, PKCE + offline refresh)
                                     ├─ Google Drive (drive.file, visible PixelDoll/ folder, path→id map)
                                     └─ OneDrive (approot, delta; on demand)

 Cloud folder (identical on every provider, all owned by the user)
  pixeldoll-sync.json                                format marker (create-only)
  packs/<sha256>.zip                                 artwork: immutable stored-ZIP packs of <pixelhash>.png, ≤ 4 MB
  objects/<sha256>.json.gz                           immutable item objects, shared by every revision that has them
  revs/<character>/<depth>.<rev>.<parents>.json.gz   immutable revisions: the manifest with item refs, or a tombstone
  devices/<deviceId>.json                            this device's head per character; only it writes the file
```

- **Packs are standard uncompressed ZIPs.**
  - Users can open them with any unzip tool, and PixelDoll's zip.ts already writes them.
  - Ranged reads fetch single cells. A pack's central directory index is cached locally and can be listed in the revision that introduced it.
  - The PoC uses a simpler pack header with the same request pattern.
- **Data flow:**
  - Saving is unchanged and never waits on the network. The engine diffs against the base revision at sync time, so the save path needs no per-field stamps.
  - Applying a remote revision goes through the same idle-character write as a local edit and is refused while generation work holds the character.
  - Revisions and item objects are cached in `pixeldoll-sync`, so merges after a reload need no downloads.
  - Downloaded cells are verified by decoding the PNG and hashing its pixels, the same key the app uses.
- **Local database changes:**
  - the new `pixeldoll-sync` database, cleared by Delete local work
  - tombstones on user delete
  - random item ids and rename-stable outfit ids
- **Authentication:**
  - Per-provider OAuth with PKCE, with tokens in `pixeldoll-sync`, never in the PixelLab key slot and never synced or broadcast.
  - Disconnect revokes the token with the provider, then deletes it locally. Local data and the cloud folder are both kept. "Delete cloud copy" is a separate, explicit action.
  - Scopes are app-folder only.

## F. Cost analysis

**Developer recurring cost:**
- GitHub Pages hosting is free.
- OAuth app registration and API access are free on all three providers. Dropbox production review and Google brand verification cost nothing.
- There is no server, database or bucket.

**The only scaling exposure is Google's planned Drive quota billing**, which applies per developer project. Estimates use the published unit costs: list 100, download 200, edit 50.

| Per active user per day (packed design) | Units |
| --- | --- |
| 60 idle checks (1 h visible, 60 s interval): 60 lists | 6,000 |
| 10 syncs with changes: ~3 uploads + ~3 downloads + 1 list each | 8,500 |
| **Typical day** | **~15,000** |
| Full restore of the 76,800-cell "large" workspace with packs (~370 requests, mostly downloads) | ~70,000 |
| The same restore with one file per cell | **~15,400,000** |

| Daily active users | Packed design | One file per cell | Developer pays |
| --- | --- | --- | --- |
| 100 | 1.5M units/day (0.4% of the 400M free threshold) | fine unless dozens of restores a day | $0 |
| 1,000 | 15M (4%) | 26 large restores a day exhaust the threshold | $0 packed |
| 10,000 | 150M (38%) | not viable | $0 packed; watch the 60 s poll interval |

- **When to act:** past roughly 25,000 daily Drive users, the polling interval (or `changes.list`, which also costs units) is what to tune.
- **Unverified:** what happens at the threshold when no billing account is attached. Expect quota errors, which pause sync, not charges. Confirm before launch.
- **Dropbox and Microsoft** publish no per-call fees, only per-user rate limits.

**User cost:** each user's library lives in their own free tier. Remote size is about the size of their art (the large synthetic workspace needed 99 MB for 87 MB of cells) plus revisions.
- The first revision of a large character (3,840 cells) is about 142 KB. Each later edit adds about 15 KB per changed item (measured).
- Fifty edits a day to one character is under 1 MB. v1 still debounces to at most one revision per character per minute, and the roadmap adds retention (keep 30 days, then daily).

| Provider | Free | Large workspaces that fit |
| --- | --- | --- |
| Dropbox | 2 GB | ~15 |
| OneDrive | 5 GB (shared) | ~40 |
| Google Drive | 15 GB (shared) | ~100 |

When full, the provider refuses writes; sync shows "Cloud storage full" and pauses, and local work continues (T9). Nothing is ever bought automatically.

## G. Proof-of-concept results

What it is: [poc/](poc/). The engine and merge are ~650 lines of TypeScript, the simulator ~130, and the tests and benchmark the rest. It runs on Node 24+ with no dependencies, against an in-memory simulated drive that counts requests and bytes, and can:
- cut an upload off midway
- fill the quota
- lag listings
- corrupt files
- take one device offline

Run it from the repo root:

```powershell
node --test docs/research/2026-11-22-storage-sync/poc/
```

```powershell
node docs/research/2026-11-22-storage-sync/poc/bench.ts large
```

**Tests: 33 passed, 0 failed** (2026-11-22, Node 25.0.0). The twelve handoff tests ran once with per-file artwork and once with packs. One of the 33 is the randomized test (300 runs).

| Test | Result |
| --- | --- |
| T1 create on desktop, phone downloads, artwork byte-identical | Pass |
| T2 phone edits, desktop retrieves | Pass |
| T3 different items edited (helmet color vs boots), plus frame 1 vs frame 2 of one item | Pass: all merged, no conflict |
| T4 same item edited on both | Pass: conflict on both devices, both images kept locally and remotely, identical live value, resolution syncs |
| T5 phone offline 5 "days" while desktop edits | Pass: reconciled, both sides' work kept |
| T6 upload cut off midway, resumed | Pass: nothing half-written visible, zero duplicate uploads |
| T7 browser data cleared | Pass: all characters and artwork restored |
| T8 disconnect; cloud folder wiped | Pass: local work untouched, folder rebuilt from local |
| T9 cloud full | Pass: state `cloud-full`, local saves continue, resumes when space returns |
| T10 provider switch | Pass: all files and both revisions copied; a rerun copies nothing new |
| T11 delete vs unsynced edit | Pass: edit survives and is flagged; delete of an untouched copy deletes |
| T12 two tabs | Pass: the lock serializes; without it, extra uploads (130 vs 131 per-file, 3 vs 5 packed) |
| Deterministic merge | Pass: two devices merging the same heads write one shared revision |
| Same item added on two devices (slug collision) | Pass: both kept |
| Corrupt remote cell or revision | Pass: never applied |
| Lagging listings | Pass: only delays |
| Eviction | Pass: does not propagate as deletes |
| Catch-up after 150 syncs elsewhere | Pass: 8 requests, 2 downloads |
| Storage growth | Pass: one-field edit adds 15 KB vs a 142 KB first revision |
| Randomized: 3 devices, random edits, syncs and lagging listings, 300 runs ([fuzz.test.ts](poc/fuzz.test.ts), written by the A4 reviewer) | Pass: all converge, no write lost |
| Baseline last-writer-wins | Loses the desktop recolor in case B (asserted) |

**Benchmark** (identical seeded datasets; cells are 0.9-1.3 KB random data; network time is a model: requests ÷ parallelism × RTT + bytes ÷ bandwidth, desktop 80 ms/6 parallel/10 up/50 down Mbps, phone 4G 150 ms/4 parallel/5/20 Mbps):

| Large workspace: 20 characters, 76,800 cells, 87 MB | Requests | MB moved | CPU ms | Est. desktop | Est. 4G phone |
| --- | --- | --- | --- | --- | --- |
| Initial backup, one file per cell | 77,023 | 87.4 up | n/a* | 18 min | 50 min |
| Initial backup, packs | 244 | 93.7 up | 440 | 78 s | 2.7 min |
| Full restore, one file per cell | 77,120 | 87.4 down | 2,177 | 17 min | 49 min |
| Full restore, packs | 306 | 101.3 down | 1,952 | 20 s | 52 s |
| Idle check, nothing changed | 1 | 0 | 36-40 | 0 | 0 |
| 20 edited cells, push / pull (packs) | 6 / 9 | 0.04 / 0.06 | 47 / 39 | <1 s | <1 s |
| Concurrent edits on both devices: merge / catch-up (packs) | 13 / 9 | 0.05 / 0.03 | 67 / 41 | <1 s | <1 s |
| Phone back after 30 desktop syncs (packs) | 118 | 0.5 down | 168 | 2 s | 5 s |
| Restore after clearing data (packs) | 370 | 101.5 down | 4,063 | 21 s | 55 s |
| Last-writer-wins baseline: restore / 20-cell push | 76,898 / 99 | 90.4 / 0.32 | | 17 min / 2 s | 49 min / 4 s |
| Duplicate object uploads, whole run | 0 | | | | |

\* The per-file initial backup's CPU (18 s) is an artifact of the simulator's quota accounting, which is quadratic in file count. It is not engine cost.

- **Item objects:** most of the packed restore's 306 requests are item objects, one request each. Bundling a character's item objects into its first upload would bring this back near the 86 that the pre-object version needed. That version moved 4.5 MB instead of 0.5 MB after 30 syncs, which is why objects were kept.
- **Other workspace sizes:** medium (11,520 cells) and small (1,728 cells) show the same ratios ([poc/results.md](poc/results.md)).
- **CPU:** dominated by SHA-256 of every cell plus gzip, about 2-4 s to verify 76,800 cells on a desktop CPU.
- **Sync off versus on:** saving is unchanged, since the engine only bumps a counter on save, and all sync work runs later in the background.

**Not verified**, and needed before shipping:
1. No real provider. The Dropbox, Drive and OneDrive adapters, OAuth and the iOS Home Screen redirect were not exercised. That needs a registered OAuth app per provider and a test account, which are the owner's to create.
2. No real browser or phone. Mobile CPU, memory and iOS Safari behavior are unmeasured. The engine uses only `crypto.subtle`, `CompressionStream` and Blobs, which all target browsers support.
3. Real character sizes. The cells are synthetic noise. Real pixel-art PNGs are smaller and compress better, so these numbers lean pessimistic on bytes.
4. Revision pruning, pack compaction and remote garbage collection are designed but not implemented.
5. Integration with the real db.ts write path, generation locks and the Studio UI.
6. The PoC's merge has no mixed-clip flag, keeps its caches in memory, and verifies cells by byte hash rather than the app's pixel hash.

## H. Implementation roadmap

Smallest useful steps first. Each is shippable on its own.

1. **Protect local data (no cloud).**
   - Call `persist()` after the first save and report its result.
   - Show `estimate()` and "device storage full" handling in Settings.
   - Give Safari tab users a nudge toward the Home Screen app or a backup.
2. **Complete backup and restore.**
   - Lift the 64 MiB / 5,000-entry caps in `pixeldoll-backup/1` by streaming or splitting.
   - Keep restore's never-overwrite preview.
   - This is the provider-independent export, and it is also what step 5's migration falls back to.
3. **Make the data sync-ready.**
   - random, permanent item ids and rename-stable outfit ids
   - tombstones on user delete
   - the `pixeldoll-sync` database inside the delete fence
   - the allow-list strip of paid receipts
4. **Dropbox backup and sync, one direction at a time.**
   - Port the PoC engine, adding the pieces the cross-review asked for:
     - the revision and object cache in `pixeldoll-sync`
     - pixel-hash verification of downloaded cells
     - the mixed-clip review flag that reruns the item checks
     - manifest validation covering slots, presets, clips, zOverrides and baseCut
     - "Forget this device"
   - Add the Dropbox adapter and PKCE sign-in, with the triggers in D.
   - Add the status states: saved locally, syncing, synced, offline, failed, conflict, cloud full.
   - Then test on a real iPhone Home Screen app and Android Chrome.
5. **Conflict review UI.**
   - A badge on characters with open notes.
   - Per conflict: Keep this, Keep the other, Keep both as a copy.
   - "Restore a previous version" from the revision list.
6. **Google Drive adapter.** Path-to-id map, `drive.file` folder, hourly sign-in renewal on a user gesture. Then provider switching (copy files, then flip).
7. **Retention.** Revision pruning (keep 30 days, then daily), with three limits:
   - never prune a revision that a live device's heads file names
   - never prune that revision's ancestry back to the newest common ancestor of all live heads
   - devices offline past the window merge two-way, flagged
   - Also compact small packs and garbage-collect unreferenced packs and objects after a grace period.
8. **OneDrive**, only if users ask.

Estimated size: engine 800-1,500 lines with tests, plus 150-350 lines per adapter and 100-150 per sign-in flow (A2 and B estimates; the PoC engine and merge are ~650 lines).

## I. Final recommendation

**One primary architecture: immutable content-addressed objects plus per-device heads, in the user's own cloud folder, behind a four-method adapter, with a small PixelDoll-owned engine.**

**Why it is the best choice:**
- It is the only design examined that is correct on all three providers without compare-and-swap, servers or locks.
- It leaves the existing IndexedDB layer and save path in place.
- It merges at the granularity PixelDoll's data actually has: items, outfits, palettes and frames.
- It gives history and "restore a previous version" for free.
- Duplicate transfers are measured at zero, and incremental edits cost a handful of requests.

**Why the alternatives were rejected:**
- **Every sync library examined** either needs a server (Dexie Cloud, PouchDB, Jazz, PowerSync, ElectricSQL, Evolu, Replicache), lacks keep-both conflicts (TinyBase, SignalDB), or would replace the storage layer and store art as base64 per cell (RxDB). RxDB, tested hands-on, silently lost edits under its default handler, made 24 requests per idle sync, and lost attachment data for new devices.
- **A shared mutable index** loses updates on Drive.
- **Last-writer-wins** loses work (measured).
- **A full CRDT** costs 1.1 MB and still leaves artwork to custom code.
- **File System Access to a desktop sync folder** is Chromium desktop only.
- **Bring-your-own Firebase or Supabase** is too much setup for casual users.
- **WebRTC peer to peer** is not a backup.

**Libraries to use:** none new. Platform APIs only: IndexedDB, `crypto.subtle`, `CompressionStream`, Web Locks, BroadcastChannel, fetch with Range. Plus the existing zip.ts.

**Custom code:**
- the engine (revisions, merge, packs, push/pull)
- three thin adapters
- OAuth PKCE flows
- the conflict UI

**No separate library repository.** It is small and shaped by PixelDoll's manifest. Revisit only if a second app wants it.

**Expected maintenance:** the merge rules must follow manifest changes. Each new keyed collection or positional list needs a line in the merge policy and a test. Beyond that, provider API changes are the main ongoing cost.

**Expected experience:** after one sign-in, changes appear on the other device within seconds of opening it or switching back to it.
- Most concurrent edits merge silently.
- Rare same-field edits show a badge with both versions.
- Nothing is lost when offline, full or disconnected.

**Portability:** the folder holds plain gzipped JSON and standard ZIPs of PNGs that any tool can open. Local work stays intact if sync is turned off or PixelDoll disappears.

## Unresolved disagreements

1. **Which provider first: Dropbox (lead, A3 providers, C challenger) or Google Drive (B independent lead).**
   - For Drive: the largest free tier, and most users already have Google.
   - Against Drive: no refresh token from a static page, so sync needs a tap every hour; no conditional writes; and the only developer-billing exposure.
   - Original resolution: Dropbox first for automatic sync; Drive second.
   - Revised after the owner's review: Google Drive first through one stateless token endpoint, which removes the hourly sign-in, with Dropbox second. A real-device sign-in spike for both comes before building. See the update at the top.
2. **History in the sync format (lead) versus per-device head files overwritten in place with no history (B, A4).**
   - Overwriting stores less, and gets about 30 days of history from the provider's own file versioning.
   - Revisions give restore-any-version on every provider and simpler N-device merges, but need pruning.
   - After the cross-review, both B and A4 ranked the revision design first. The growth they measured (126-142 KB per sync) was cut to 15 KB per changed item with item objects.
   - Mostly settled: revisions stay, with retention in roadmap step 7. A4 keeps its overwrite design as a fallback only if growth proves unmanageable in real use.
3. **Conflict representation: keep A live with both values in notes (lead), versus fork theirs into a sibling copy item (B), versus a multi-value register shown with a badge (A4).**
   - Settled: B conceded that automatic sibling copies do not converge (two devices merging the same heads fork different copies), and adopted notes.
   - The conflict UI's "Keep both as a copy" gives B's result when the user asks for it.
4. **Packing in v1 (lead, A3, C) versus later (B).** Settled: the benchmark (77,000 versus 86 requests per restore) and Drive's per-request units changed B's position.
5. **Per-key version stamps at save time (A4) versus diffing against a base at sync time (lead, B).** Settled: A4 withdrew save-time stamps.

Item 1 was the last open disagreement. It is now resolved in favor of Google Drive first, conditional on the token endpoint.

Cross-review: [notes/cross-review.md](notes/cross-review.md).

## Decisions for the owner

1. **Amend the "never add a backend" rule:** approved 2026-11-22 (AGENTS.md, PLAN.md D31).
2. **Token storage:** decided. Refresh tokens stay on the device in IndexedDB, unencrypted like the PixelLab key, and are never synced or broadcast. The owner rejected signing in every visit.
3. **OAuth app registration** for Google, and later Dropbox: a Google Cloud project with a Web client and published consent screen, a Dropbox app, and spare test accounts. Only the owner can create these. They are free, and the sign-in spike is blocked until they exist.
4. **Stable ids migration:** under the no-backward-compatibility rule, old characters could simply be re-saved with random item ids, or the conversion could happen at first sync.

## How this was researched

- **Team substitution:** the handoff named Codex Sol 6.4 and OpenCode DeepSeek V4.1 Flash. Neither was reachable from this session; no other agent was running.
  - **Lead:** Claude Opus 5.5, which wrote the PoC, did the synthesis and coordinated four Opus area researchers: repository, libraries, providers, protocol and browser.
  - **Second independent lead:** Claude Sonnet 5.5, run without access to the other work.
  - **Independent challenger:** Claude Haiku 5.5.
  - **Hands-on test:** one Opus agent ran RxDB against its own mock.
- **Cross-review:** each lane then reviewed the competing designs.
- **Evidence:** each lane's report is kept unedited in [notes/](notes/) with its sources. Claims tagged secondary or unverified there stay unverified here unless this report says it rechecked them.
