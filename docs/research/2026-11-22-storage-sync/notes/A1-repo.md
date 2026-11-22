# A1: PixelDoll local persistence, assessed for cross-device cloud sync

Date: 2026-11-22. Read-only review of worktree `claude/pixeldoll-storage-sync-1a251c` (HEAD 6ff0567aa). Paths are relative to
`app/src/` unless they start with `docs/` or `app/`. Nothing was run; record sizes are estimates, not measurements.

---

## 1. IndexedDB schema

**One database, `pixeldoll`, with three object stores: `projects`, `blobs`, `jobs`** (lib/store/db.ts:1, 15, 22, 36-37).

- Every store uses out-of-line string keys, with no keyPath and no indexes (`db.createObjectStore(s)`, db.ts:36-37).
- The database is opened **without a version number** (db.ts:33). `onupgradeneeded` only creates any stores that are missing.
- The version number serves as the fence for Delete local work: each delete raises it by one (db.ts:16-21, 737, 777-781).
- Any future schema change "must open at max(current version, its own)" (db.ts:19-21).

### `projects` store (key/value; mixed record kinds told apart by key)
| Key | Value | Source |
|---|---|---|
| `rig-<uuid>` (also `rig-<12 hex of baseHash>` for the demo copy) | `StoredProject` = one **character** | project.ts:14-35; create.ts:1256, 4556; import.ts:1012; backup.ts:488 |
| `studio-drafts` | `{id, gens: Gen[]}`: **one shared record holding every item draft for every character** | state.svelte.ts:2560-2565 |
| `m3-drafts` | dev-page item drafts | lib/items/drafts.ts:6 |
| `studio-move`, `studio-setup` | the single in-flight move flow / rig-setup flow, plus its queue | state.svelte.ts:3753-3775, 4344 |
| `studio-create:<id>` (`CREATE_DRAFT_PREFIX`) | an unfinished character creation | incompatible.ts:6; state.svelte.ts:3577 |
| `dress-fixture:s2` | demo outfit state (`kind:'dress'`) | lib/dress/project.ts:283-320 |
| `dress-archived:<uuid>` | earlier-format dress record, preserved | dress/project.ts:309-316 |
| `studio-export-settings` | `{engine, dressedCharacterSheets, playOnce[]}` | export-settings.ts:8-23 |
| `library-archive:<sha256>` (`RETAINED_ARCHIVE_PREFIX`) | `{id, data: Uint8Array}`: an opaque ZIP (up to 64 MB) of earlier-version data | incompatible.ts:7; backup.ts:33-72; db.ts:297-313 |
| `equipment-*`, legacy `studio-create`, old-format `rig-*`/`dress-*` | incompatible records: kept, never opened | incompatible.ts:1-43 |
| Motion Lab / item-trial pins | dev-only | ui/item-trial/trial.ts:400; ui/motion-lab/starter-pack.ts:126 |

**One "project" record is one character**, not the whole library. Fields (project.ts:14-35):
- `id`
- `savedAt` (ISO)
- `manifest` (pixeldoll/3: rig, materials, slots, items including the base body, presets/outfits; manifest.ts:21-32)
- `skeletons` (keypoints per cell)
- `rigQa`
- `character` (PixelLab character id/looks)
- `dress.current` (what the character is wearing now; project.ts:222-224)
- `restoredFrom`
- `origin: 'studio'|'dev'`
- Internal device-local receipts: `creationSpec`, `moveReviews`, `stateGeneration`, `managedStates`, `moveRecovery`

The listing filters on `rig-` plus a supported format (project.ts:49-52).

**Size (estimate).** The record is JSON-like, with no pixels inline. It still grows with cell count, because of:
- per-cell keypoints (`skeletons`, `ClipSource.keypoints/measured`)
- per-cell QA (`ItemQa.cells`)
- provenance request params (images are replaced by `{sha256}`; run.ts:1494-1506)
- Fix-frames and palette-repair history

A mature 8-direction character with several moves and around 10 items probably sits in the hundreds of KB to low-MB range. It references thousands of cell hashes. This is unmeasured.

### `blobs` store
- Key: 64-hex sha256 with no `sha256:` prefix. Value: a `Blob` (normally `image/png`) (db.ts:856-863; project.ts:1-2).
- **Two hash domains, which cannot be swapped for each other** (docs/architecture.md:446-447):
  - **Character cells/artwork:** key = sha256 of the **decoded RGBA pixel buffer**, not of the PNG bytes (`cellHash`, rig/rig.ts:143-144). The stored value is a PNG re-encoded by the app's own encoder (project.ts:196-201; import.ts:1014-1018).
    - Archive import re-checks this by decoding the PNG and comparing RGBA hashes (workspace.ts:454-476).
    - So identical pixels from two app versions may produce **different PNG bytes under the same key**.
  - **Queue inputs/results:** `putBlob` = sha256 of the **exact PNG/raw bytes** (db.ts:856-862; queue.ts:301-309, 1734).
- **Blobs are never mutated in place.**
  - `putBlob` skips keys that already exist (db.ts:859).
  - `addCharacters` adds only keys that are missing (db.ts:294-295).
  - `updateCharacter` uses `put`, but under a content key, so it writes the same pixels (db.ts:356).
  - "cells are never changed in place (edits make new images)" (project.ts:54-56; manifest.ts:297).
  - Old pixels stay referenced from history (`frameEdits`, `paletteRepairs`; manifest.ts:123-125, 157-186).
- **Garbage collection (`gcBlobs`, db.ts:822-854)** is a single-transaction mark-and-sweep over `projects`+`jobs`+`blobs`.
  - Marking is a **conservative deep string scan**: any string matching `^(sha256:)?[0-9a-f]{64}$` in any record pins a blob, so request hashes can pin too (incompatible.ts:65-88).
  - Retained archives are opaque and pin nothing (db.ts:679-683).
  - Its only caller is `cleanUp()` (Activity "Clear finished"). It runs on the queue **leader** only, and only while nothing is generating, saving or flowing in this tab (state.svelte.ts:3210-3247; ActivitySheet.svelte:36).
  - Writers publish blobs and their referencing record in one transaction so GC cannot sweep the gap (db.ts:208-229, 326-374; project.ts:184-220).
- Delete local work deletes only the blobs referenced by the records it removes (db.ts:808-809). Deleting a character leaves its blobs until the next GC (db.ts:502-511).

### `jobs` store (paid PixelLab ledger)
- `JobRec` keyed by `id` (`crypto.randomUUID()`, or a deterministic `estimate-recovery-<sha>`) (queue.ts:75-105, 1117-1120).
- Fields:
  - `state` (queued/submitting/running/done/failed/canceled/lost)
  - `params` (request body with images replaced by `{$blob: sha}`, never the key)
  - `inputs`
  - `requestHash`
  - `jobs[]` (PixelLab `background_job_id`s with results `{label, sha}`)
  - `gens`, `usd`, `costUnknown`
  - `tag`
  - `activityScope`
- Ledger rules (queue.ts:1-10):
  - A record is persisted before submit.
  - A record that has job ids is never resubmitted.
  - An ambiguous paid POST is marked `lost` and never resent.
- `enqueue` deduplicates by `requestHash`. A done match is reused, and a terminal or unknown match is returned instead of resubmitting (queue.ts:1077-1112).

### Workspace copy mode (in-memory stand-in)
- With `?workspace-copy` in the URL (workspace-mode.ts:1-2), `installWorkspaceCopy` swaps every store for in-memory Maps (db.ts:25-29).
- `open()` throws in this mode (db.ts:49-50). `askPersist` and `gcBlobs` are no-ops (db.ts:827, 867).

---

## 2. Granularity of a save

**Every save is a whole-character read-modify-write.** `db.update` reads the full record, the callback edits it, and the whole record is `put` back in one transaction (db.ts:574-644). There is **no partial or field-level write and no per-item record**.

| User action | Records written | Citation |
|---|---|---|
| Dress/outfit, recolor (material variants), layer order, hides, wardrobe slot edits | the whole `rig-<id>` record (manifest.materials/presets/slots + `dress.current`); autosave debounced 400 ms; a localStorage crash snapshot `pixeldoll.unsaved.<id>` until the save lands. **`savedAt` is NOT bumped** | state.svelte.ts:1064-1105; dress/project.ts:280-366; state.svelte.ts:723 |
| Accept/keep an item | whole record + new cell blobs in one tx; `savedAt` bumped | project.ts:188-220 |
| Delete items | whole record; `savedAt` bumped | project.ts:226-266 |
| Add a move / publish body / setup / frames / reframe / directions | whole record (+blobs) via `updateCharacter` / `saveIdleCharacter` (optimistic check: `stableStringify(original)` must equal stored) | db.ts:329-374, 513-560; moveActions.svelte.ts:209, 291; setup.ts:203; frames/save.ts:217; rig/reframe.ts:525 |
| Rename character/item/move (and export IDs) | whole record via `db.update`; BroadcastChannel `pixeldoll:identity` notifies tabs; `savedAt` not bumped | state.svelte.ts:2466-2488; identity.ts:150-189 |
| Rename outfit | dress state (undoable), saved by autosave; **changes `Preset.id`** | state.svelte.ts:2491-2498; identity.ts:191-214 |
| Delete character | deletes `rig-<id>`, rewrites `studio-drafts`/`m3-drafts` without its drafts; refused while generation work holds it; blobs left for GC; **no tombstone** | db.ts:376-385, 421-511 |
| Item draft progress | the shared `studio-drafts` record (all characters) | state.svelte.ts:2560-2565 |

**Revision fields.**
- Records carry only `savedAt`, and it is unreliable as a revision: dress saves and renames skip it (state.svelte.ts:723).
- There is no version counter, ETag or updatedAt per record, item, move or outfit.
- Concurrency control is either (a) one IDB transaction or (b) a full-content `stableStringify` comparison (db.ts:522-541; backup.ts:311-314).
- Provenance holds a per-call `createdAt` (manifest.ts:253-264). That is not an edit revision.

**Stable IDs.**
| Entity | ID | Stable? Globally unique? |
|---|---|---|
| Character | `rig-<uuid>` | Yes/yes. **Exception:** the demo copy is `rig-<baseHash[0..12]>` (create.ts:4556), so every device makes the *same* id with divergent edits |
| Item | slug from name/prompt, `_2` suffixes, unique **within the character on this device** (items/run.ts:211-223) | Stable after creation (rename changes `name`/`exportId` only; project.ts:208-213). **Not globally unique**: two devices can independently create `red_hat` |
| Move (`RigAnimation.id`) | internal key, "never changes" (rig types; lib/runtime/sources.ts) | Stable; derived from a name or template, so collisions are possible across devices |
| Outfit (`Preset.id`) | equals its export ID; slug of name (state.svelte.ts:1771-1779) | **Not stable**: rename rewrites `id` (identity.ts:211) |
| Material | `id`, `owner` = item id | tied to item ids |
| Frame/cell | positional `CellKey` `anim/dir/index`; layer cells are arrays (manifest.ts:16, 247) | No frame identity; content is a hash |
| Fix-frames edit | `ItemFrameEdit.id` | yes |
| Job | uuid | yes |

---

## 3. Every other piece of persistent state, classified

### IndexedDB
| State | Class | Why |
|---|---|---|
| `rig-*` character records (`origin:'studio'`) | **SAFE TO SYNC, after stripping** | The library itself. Strip the device-local receipts `creationSpec`, `moveRecovery`, `moveReviews`, `stateGeneration` (and probably `managedStates`), as exports already do (workspace.ts:235, 389-393; backup.ts:291-304). `stateGeneration` is a pending **paid** State attempt; replicating it would let another device resume paid work. Exclude `origin:'dev'` rigs (workspace.ts:131-132) |
| `blobs` referenced by synced characters | **SAFE TO SYNC** | Immutable, content-addressed |
| `jobs` ledger | **DEVICE-LOCAL ONLY** | Another device's leader would submit `queued` records (duplicate paid calls), poll another account's job ids, or treat `lost`/terminal records as dedup hits (queue.ts:1077-1112). The leader lock and handoff are per-origin, per-device (queue.ts:5-10). The token is never shared (docs/shared-token-security.md). At most, export a read-only audit summary |
| `studio-drafts`, `m3-drafts`, `studio-move`, `studio-setup`, `studio-create:*` | **DEVICE-LOCAL ONLY** | Live paid flows tied to ledger record ids and `REQUEST_TEXT` (db.ts:16-18, 387-417). One shared drafts record covers all characters. Only the leader runs drafts (state.svelte.ts:2567-2571) |
| `studio-export-settings` | **SAFE TO SYNC** | Small, validated (export-settings.ts:65-89), merged per field (export-settings.ts:116-141) |
| `dress-fixture:s2` (demo outfit) | **NEEDS CARE** (optional) | Tied to the bundled demo; small |
| `library-archive:*` | **NEEDS CARE** | Immutable and content-addressed, so syncing is safe, but up to 64 MB each, and it holds old-format data meant for download only |
| Incompatible records (`equipment-*`, old formats, `dress-archived:*`) | **DEVICE-LOCAL** | Never opened; download-only (incompatible.ts:1-3) |

### localStorage / sessionStorage
| Key | Class | Citation / reason |
|---|---|---|
| `pixellabApiKey` | **DEVICE-LOCAL, NEVER SYNC** | Shared plaintext credential contract (shared-auth.ts:3; docs/shared-token-security.md:3-7; AGENTS rules) |
| `pixellabAuthForget` | DEVICE-LOCAL | Forget marker (shared-auth.ts:4) |
| `pixeldoll.agentKey` | DEVICE-LOCAL | Agent spend kill switch (bootstrap.ts:52-62) |
| `pixeldoll.unsaved.<id>` | DEVICE-LOCAL | Crash buffer. Sync must `flushSave()` first (`prepareWorkspaceExport`, state.svelte.ts:1020-1027) |
| `pixeldoll.studio.project`, `pixeldoll.welcomed`, `pixeldoll.pixelLabConnectOpened` | DEVICE-LOCAL | View/onboarding state (workspace-mode.ts:12-16; state.svelte.ts:232) |
| `pixeldoll.developerMode` | DEVICE-LOCAL | developerMode.svelte.ts:3 |
| `pixeldoll.theme`, `pixeldoll.locale` | NEEDS CARE (optional) | Per-device preferences are reasonable (workspace-mode.ts:13; i18n.ts:21) |
| `pixeldoll.promptSuggestions.v1` | SAFE TO SYNC | User-authored content (promptSuggestions.svelte.ts:13) |
| `pixeldoll.creation.<section>` | SAFE TO SYNC | Creation defaults (model and method affect price, but every paid action is confirmed) (creationSettings.ts:62) |
| `pixeldoll.mount` | SAFE TO SYNC | Includes per-character `poses` keyed by character id (mountStorage.ts:6-15) |
| `pixeldoll.wardrobe.hideShared`, `.showDemo` | optional | wardrobeVisibility.svelte.ts:4-5 |
| sessionStorage `pixeldoll.startupUpdate:<base>` | DEVICE-LOCAL | startup-update.ts:33 |
| Motion Lab / item-trial keys (ledgers, budgets, journals) | DEVICE-LOCAL | Dev-only paid-research accounting (ui/motion-lab/*, ui/item-trial/trial.ts:362-373) |

**Service worker / Cache Storage.** The worker "caches shipped bytes only, never user data or requests" (app/pwa-worker.js:1). It has no bearing on sync.

---

## 4. Backup/restore and workspace ZIP: verifying the two claims

**Claim 1: "workspace ZIP has a 64 MB size limit". TRUE, and there are more limits besides.**
- `MAX_ZIP_BYTES = 64 * 1024 * 1024` (zip.ts:100), enforced on read (zip.ts:116-118) and on pack (workspace.ts:398, 411, 427-435).
- Other limits:
  - `MAX_ZIP_ENTRIES = 5000` (zip.ts:101); in practice this caps artwork at about 4,998 blobs.
  - 128 MiB expanded (zip.ts:102).
  - No ZIP64 (zip.ts:1, 134-137).
  - 500 records (workspace.ts:40).
  - 64 Mpx total artwork, with each PNG at most 2048² (workspace.ts:41, 461).
- The error tells users to "Use individual character ZIPs instead" (workspace.ts:73-76; backup.ts:121-125).
- The UI also checks size up front (OpenWorkspace.svelte:44-45; en.json `librarySettings.tooLarge`).
- **For sync this is a hard ceiling.** A large library may exceed the 5000-entry limit long before reaching 64 MB.

**Claim 2: "opening a workspace ZIP opens a temporary workspace copy rather than restoring into normal IndexedDB". TRUE only for "Open backup as a copy"; restore is a separate, real path.**
- **Open backup as a copy** (Developer mode only):
  - It opens a new tab with `?workspace-copy` (SettingsBackupCopy.svelte:11-15; workspace-mode.ts:4-10).
  - It reads the ZIP (`readBackupCopy`, backup.ts:263-287) and calls `installWorkspaceCopy` into **in-memory Maps** (OpenWorkspace.svelte:46-51; db.ts:26-29).
  - IndexedDB is never opened (db.ts:50), and the queue has no locks (queue.ts:464).
  - "Any changes to the copy are discarded when you close or reload this tab" (en.json `openWorkspace.privacy`).
- **Restore from backup** (Library settings): `planRestore` and `restoreCharacters` **write into normal IndexedDB**, additively (backup.ts:361-524; LibrarySettings.svelte:181-200).
  - It accepts `pixeldoll-backup/1` and `pixeldoll-workspace/1`, taking only the characters (backup.ts:1-2, 195-211).
- **`exportWorkspace` (`pixeldoll-workspace/1`) has no app caller.** Only tests reference it (workspace.ts:327; test/unit/character-backup.test.ts, workspace-diagnostics.test.ts, test/e2e/export-picker.spec.ts). The UI produces `pixeldoll-backup/1` (downloadLibraryBackup.ts:9-14).

**What backup.ts does.**
- **Export** (backup.ts:133-157):
  - Reads one snapshot of every Studio character (`readWorkspaceSnapshot`, db.ts:158-206).
  - Validates each record and verifies each blob by decode + RGBA hash. Failures are dropped and reported (`hasOmissions`, `missing`) (workspace.ts:209-247, 362-437).
  - Includes history artwork (`history=true`).
  - Bundles retained and incompatible archives as `archives/<sha256>.zip`.
  - Refuses to export if any field contains the connected or remembered key (workspace.ts:419-425).
- **Excludes:** preferences, the demo outfit, export settings, drafts, jobs, credentials, diagnostics (backup.ts:133-135; en.json `librarySettings.scope`).
- **Format:** a stored, uncompressed, unencrypted ZIP:
  - `backup.json` = `{format:'pixeldoll-backup/1', build:'<version> (<commit>)', characters:[[id, StoredProject]...], missing:[hex], omitted?}` (backup.ts:104-112)
  - `blobs/<hex>` holds the PNG bytes
  - `archives/<sha256>.zip`
- **"Restore without replacing anything" + conflict preview:**
  - `planRestore` (backup.ts:361-424) fingerprints each character by sha256 of `stableStringify` of its content, excluding id/savedAt/receipts/restoredFrom/dress/origin (backup.ts:291-308).
  - It gives each character an action:
    - `skip`: the same content already exists under its id, or in a restored copy of it
    - `add`: id free
    - `copy`: a new `rig-<uuid>`, renamed "(restored copy)", when the id holds different content or an earlier restored copy was edited
    - `blocked`: artwork missing in both the file and local storage
  - Warnings: `unreadable`, `editedRestore`.
  - `restoreCharacters` (backup.ts:444-524) writes every add and copy in **one transaction** via `addCharacters`, using IDB `add`, which never overwrites (db.ts:241-324).
  - If any saved record changed since the preview (`stateKey` compare), it aborts with `RestoreChangedError` carrying a fresh plan (backup.ts:426-434, 476-483, 519).
  - Restored records get `restoredFrom {id, fingerprint, copyFingerprint, at, build}` (project.ts:31-44).
- **Portable and self-describing?**
  - Partly. It carries a format tag and build string, and the artwork is integrity-checkable.
  - But the payload is the app's **internal `StoredProject`/pixeldoll/3 schema**, and only `CURRENT_FORMAT` is accepted (manifest.ts:17-19).
  - Under the no-backward-compat policy, a later format bump makes old backups unreadable apart from opaque archival.
  - Another tool would need docs/manifest-spec.md.
  - The per-character editable ZIP (`pixeldoll-project/1`: `project.json` + `cells/<hex>.png`; import.ts:173-190) is the smaller portable unit.

---

## 5. Multi-tab coordination a sync engine must respect

- **Storage presence lock `pixeldoll-storage`** (shared, held for the page's lifetime before opening IndexedDB) and **intent lock `pixeldoll-storage-delete`** (db.ts:57-110).
  - Delete local work does the following (db.ts:699-820):
    - takes the intent lock
    - seals this page's writes (`writable()` throws when `sealed`, db.ts:112-120)
    - takes `pixeldoll-storage` exclusively
    - deletes inside a **version-change** transaction (version+1)
  - That transaction closes every other connection (`onversionchange → close`, db.ts:40) and makes earlier-version pages fail to open.
  - A sync engine, worker or second database must:
    - hold presence before opening
    - write only through `writable()` and the existing helpers
    - open without a fixed version
    - close on versionchange
  - After a delete, it must **not re-download the deleted library**. That needs tombstones or an explicit "delete remote too / unlink" choice.
- **Queue leader lock `pixeldoll-queue` plus BroadcastChannel `pixeldoll-queue`** (queue.ts:5-10, 241, 461-466, 590-680).
  - Followers mirror the ledger (record-id notifications, plus a full re-read every 30 s).
  - Handoff: a follower with a waiting click posts `{handoff:true}`, and an idle leader steps back (queue.ts:617-625, 911-925).
  - Messages are credential-free.
  - **Only the leader** runs drafts, moves, creates and GC (state.svelte.ts:2567-2571, 3217).
  - Sync should likewise run in one tab per device; leader election via Web Locks is the precedent.
- **BroadcastChannels:**
  - `pixeldoll:identity`: renames, `{libraryRestored:true}` (state.svelte.ts:346-381, 1029-1031, 2486)
  - `pixeldoll-export-settings` (export-settings.ts:24-53)
  - `pixellab-auth` (shared-auth.ts:5; docs/shared-token-security.md:15-25)
  - A sync engine applying remote changes should post `libraryRestored` (or similar) so open tabs refresh.
- **Per-character locks:**
  - `pixeldoll-clip:<project>:<id>` (clipName.ts:16-31)
  - `pixeldoll-state:<project>` (stateGeneration.ts:138-145, 533-534)
  - `pixeldoll-state-fit:<project>` (stateJointFit.ts:194-205)
  - Applying a remote change to a character with live generation work must be refused or deferred. Precedent: `editIdleCharacter` refuses while `generationWork` holds the character (db.ts:421-500).
- **Autosave and visibility refresh** (state.svelte.ts:383-395, 1064-1105):
  - debounce, then `flushSave`
  - re-read shared data when a tab becomes visible again
  - three-way slot merge (`mergeSlotEdits`, state.svelte.ts:1033-1062), the existing field-level merge precedent
- The service worker uses its own `pixeldoll-cache-metadata:<scope>` lock (app/pwa-worker.js:11, 21-25) and touches no user data.

## 6. navigator.storage

- `persist()` is requested once per page, swallowing errors and ignoring the result (db.ts:865-870).
- It is called at bootstrap (bootstrap.ts:5, 11) and after restore, import and create (backup.ts:522; import.ts:1028; create.ts:1552). It is skipped in workspace copies.
- **There is no `estimate()` and no `persisted()` anywhere** in app/src. Quota is never measured or shown.

---

## 7. Assessment for incremental remote sync

**Reusable as is:**
- **Blob store, as content-addressed immutable storage.**
  - "Upload only hashes the server lacks" works directly, and so does download-on-demand.
  - Dedupe across characters is already free, and the conservative-reference GC never deletes something a record mentions.
  - Hash keys could double as remote object names.
- **Restore planning**: fingerprints, `restoredFrom` lineage, all-or-nothing transactions and the changed-since-preview abort. This is a working "keep both on conflict" model.
- **Archive validation** (decode + RGBA verify, key scan, `recoverRecords`) as the ingest firewall for remote data.

**Caveats on the blob store:**
1. **Cell keys hash pixels, not bytes.**
   - The server cannot verify an upload by hashing bytes; that needs a client-side or server-side PNG decode.
   - Equal keys may carry different bytes, so byte-level ETags or checksums will disagree.
   - Queue blobs use a different (byte) hash domain. They should not sync at all.
2. **Local `gcBlobs` is local-only.** It must never drive remote deletion. Remote GC needs its own reference set across all devices' latest records plus a grace period.
3. The reference scan is a deep string scan. Any sync-metadata record stored in `projects` that lists hashes would **pin** those blobs. That can be used on purpose (pin pending downloads), or it becomes a leak.
4. Blob counts are large (thousands per character), which matters for request rate and listing APIs. Blobs are small (a few KB each).

**What must change:**
- **Per-record revision and sync metadata.**
  - There is none today, and `savedAt` is unreliable (dress saves and renames skip it).
  - Add a monotonic `rev`/`updatedAt` plus a device id on every write path. All writes funnel through db.ts (`update`, `updateCharacter`, `saveIdleCharacter`, `putCharacter`, `addCharacters`, `editIdleCharacter`), so stamping there is feasible.
  - Alternatively, keep a separate sync-state record (last synced fingerprint/rev per character) and detect local change by `characterFingerprint` (backup.ts:307).
- **Tombstones.** Character delete (db.ts:503-511) and Delete local work (local-work.ts) leave no trace. Without tombstones, sync resurrects deleted characters.
- **Merge granularity.**
  - Whole-record last-writer-wins would discard edits made concurrently on two devices: a recolor on A against an item added on B.
  - Options:
    - (a) record-level conflict that keeps both, as a copy (backup.ts semantics, cheapest)
    - (b) three-way merge per sub-collection (items by id, moves by id, materials, presets, slots; `mergeSlotEdits` is the model)
  - (b) needs a stored common ancestor, plus globally unique item/move/outfit ids. Today:
    - item ids are name slugs (run.ts:217-223)
    - outfit ids change on rename (identity.ts:211)
    - the demo copy id is deterministic (create.ts:4556)
- **Where sync metadata lives.**
  - A new object store needs an explicit version upgrade. That collides with the version-as-fence design (db.ts:19-21) and closes other tabs' connections.
  - A separate database (e.g. `pixeldoll-sync`) avoids that, but must be added to the Delete-local-work fence.
  - Reserved keys in `projects` must avoid `workKey`, `incompatibleKind` and the hash-pinning scan.
- **A strip/allow-list on upload**, the same as the exports: drop `creationSpec`, `moveRecovery`, `moveReviews`, `stateGeneration`, `managedStates`, and `origin:'dev'` records. Never touch `jobs` or flow records. Run the key scan (workspace.ts:419-425).
- **Remote apply must respect live work.** Defer while `generationWork` holds a character (db.ts:400-417), while a per-character lock is held, or while an unsaved buffer exists (`flushSave` first).

**Risks:**
- **No backward compatibility** (AGENTS rules; `supportedFormat` accepts only `pixeldoll/3`; manifest.ts:17-19).
  - A format bump on one device makes its uploads unreadable to an older device and vice versa.
  - Remote data written by an old build becomes "incompatible" and is never upgraded (incompatible.ts:1-3).
  - Sync needs a format/build gate per record and a rule for mixed-version devices.
- **`REQUEST_TEXT`** (db.ts:16-18) only matters for device-local flows. As long as drafts and jobs stay device-local it does not affect character sync. Syncing flows would break it.
- **The schema version is a fence, not a schema version.** Version numbers diverge per device and mean nothing across devices.
- **Large workspaces.** The ZIP route hits 64 MB, 5000 entries and 500 records (zip.ts:100-102; workspace.ts:40-41). Per-object sync avoids that, but the initial upload is thousands of small objects.
- **Quota.** No `estimate()`; `persist()` may be denied. Eviction on one device looks like mass deletion unless that is distinguished from tombstones.
- **Paid-state leakage.** `stateGeneration`/`moveReviews` inside character records, and the job ledger's `requestHash` dedupe, mean that careless syncing could resend or skip paid calls.
- **Credentials.** The token must never enter synced data. Backups already refuse it, but cloud auth must be separate from the PixelLab key (docs/shared-token-security.md).
