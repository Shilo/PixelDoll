# R2: Separate repo for the sync engine? (2026-11-22)

## Verdict
Not now. Build it in PixelDoll as a package-shaped folder with a hard import boundary and its own tests (middle path). Revisit extraction on a concrete trigger (below). Never publish a "general library" speculatively.

## 1. Market gap
Demand is real but diffuse; supply is thin and mostly framework-coupled.
- RxDB 17 ships Google Drive and OneDrive replication plugins. The Drive docs label it beta, possibly breaking changes without a major bump; one JSON file per doc, lock file for writes, uses RxDB conflict handlers; it only works inside RxDB. https://rxdb.info/replication-google-drive.html , https://rxdb.info/replication-microsoft-onedrive.html
- remoteStorage.js added Dropbox/Google Drive backends in 1.x; its own docs list sync performance and no permission model as drawbacks; 2.0 is still beta (2.0.0-beta.6 on npm). I could not confirm the Drive/Dropbox backends survived into 2.0. https://remotestorage.io/rs.js/docs/dropbox-and-google-drive.html
- Super Productivity syncs via WebDAV, Dropbox, local file. Its "unpublished sync-providers" I could not verify; treat as unconfirmed.
- Indie one-offs: Obsidian plugins (NSync with Drive appDataFolder, Vync, Air Sync) and DEV posts of browser-only Drive sync engines noting Drive has no real-time conflict detection. Each reinvents the same thing, which is evidence of a gap and of no standard answer. https://dev.to/dean0224/how-i-built-google-drive-sync-without-a-backend-and-the-3-bugs-that-almost-broke-me-1c2n
- Demand signals: Logseq forum thread "Sync directly with OneDrive, Dropbox, GoogleDrive, iCloud" (users ask; staff/commenters call it a mammoth task) https://discuss.logseq.com/t/sync-directly-with-onedrive-dropbox-googledrive-icloud/4685 ; Joplin has Dropbox/OneDrive/WebDAV but no native Drive, with long-running sync-conflict complaints (https://www.ctrl.blog/entry/joplin-notes-sync/); local-first essay HN thread ~883 points (July 2025). I found no HN thread specifically for this library niche.
- Honest read: users want "sync without an account", but app authors usually solve it with a framework (RxDB, Yjs) or their own cloud. A standalone, framework-free engine with a content-addressed blob layer is a plausible niche (drawing/game-asset/PWA apps with binary assets), but unproven: no one has requested "this library". Note the blob-heavy + JSON-manifest shape is rarer than note-text sync, so the niche is smaller.

## 2. What is general vs PixelDoll-specific (from the PoC)
General:
- provider.ts: 4-method adapter (list/get-with-range/put/del), Entry{path,size,etag}, QuotaError/NetworkError, SimProvider fault injection (quota, cut connection, listing lag), copyAll. ~125 lines. Real Drive/Dropbox/OneDrive adapters and OAuth (PKCE, token refresh, Drive appDataFolder scope) are not in the PoC yet and are the bulk of generic value and of maintenance.
- engine.ts: content-addressed blobs, packs with range-read index, immutable revision files with depth/parents encoded in filenames (DAG without downloads), per-device heads files (no CAS needed), deterministic merge id, LCA, status machine, rebuild/verify, lock via Web Locks. Essentially all generic if `Local` becomes a storage interface.
- merge.ts: stableStringify, three-way object merge, keyed-array merge by `id`, keep-both on add/add collision, deterministic A/B choice. Generic.
PixelDoll-specific (small, but wired in):
- `frameLists` default `positional` predicate (items/*/layers/*/cells path shape) in merge.ts, already injectable as a parameter.
- engine.ts `flatten`/`expand` hardcode `body.items` as separate objects (git-tree-like). Generalizable to a declared "split these paths into objects" option.
- `blobRefs` regex `sha256:<hex>` (convention, easy to parametrize).
- README exclusions: jobs ledger, drafts, flow records, crash buffers must never sync (paid-call resubmission risk). That is a `Local`/record-selection policy, not engine code.
- `Local` class mirrors IndexedDB stores (projects, blobs, sync meta); the real one would be an interface PixelDoll implements.
Estimate: ~85% of engine+merge+provider is generic; the seams needed are 3 options (positional predicate, split paths, blob-ref matcher) plus a storage interface. Cheap to do now inside the repo.

## 3. Costs vs benefits for a solo maintainer
Costs of a separate repo now:
- Release loop: change engine, tag, publish/npm, bump + lockfile in PixelDoll. AGENTS.md already enforces exactly this for bronze-ui ("fix there, release a new version, then update the dependency") and bans local patching; that rule is the precedent for the friction. Sync bugs will be found only in PixelDoll flows (conflicts, quota, listing lag across two real devices), so most fixes would be cross-repo.
- API stability pressure once public: format version of on-cloud layout is a data compatibility promise; PixelDoll's "no backward compatibility, preview app" stance conflicts with a published library's semver.
- CI x2, docs, README/examples, security reports on an OAuth+token library, strangers' issues for three provider APIs that change (Google verification/scope review, Dropbox short-lived tokens, Graph throttling).
- Provider reality tests need real accounts; cannot run in public CI without secrets.
- Premature generality: the design is unproven against even a second PixelDoll data shape; one consumer gives no evidence of the right abstraction.
Benefits:
- Enforced boundary, isolated tests (already `node --test`), visibility, possible contributors for the adapters (the tedious part), clean story for "backup anywhere".
- Adapters+OAuth are useful alone.
Net: benefits are mostly achievable with a folder boundary; costs are only avoided by waiting.

## 4. Middle path (recommended)
1. In PixelDoll, `app/src/lib/sync/` (or `packages/cloud-sync/` workspace) with: `core/` (engine, merge, blob/pack store), `providers/` (drive, dropbox, onedrive, sim), `auth/`. Zero imports from Studio, db.ts, locales or PixelDoll types; lint rule or tsconfig project reference to enforce.
2. PixelDoll-specific code lives outside: policy file (positional predicate, split paths `items`, blob-ref pattern, excluded stores, validate), `Local` adapter over IndexedDB.
3. Keep fuzz/sync tests and SimProvider in the module's own test folder runnable alone; use MIT headers and a short README so extraction is `git subtree split`/`git filter-repo`, history preserved.
4. Version the on-cloud format (`format: 1` marker file) from day one: that is what a future library would need anyway.
5. Optional later step: publish only provider adapters+OAuth helpers (generic, least PixelDoll-coupled, highest standalone value) if someone asks. Still defer until adapters are proven with real accounts.

## 5. Trigger to extract
Any one of: (a) a second real app (the owner's, or an external contributor/user) needs it; (b) an outside party asks to depend on it or contributes an adapter; (c) the module has run stable through 2+ months with real users and the format is frozen with no PixelDoll-driven changes for several releases. Until then "later", and "never" is acceptable if (a)-(c) never happen: the cost was only a clean folder.

## Caveats
Market evidence is circumstantial; I did not find an HN thread or GitHub issue specifically requesting this library. Super Productivity "sync-providers" and remoteStorage 2.0 backend status unverified. Reviewed the PoC code (merge.ts, provider.ts, engine.ts); did not run the tests.
