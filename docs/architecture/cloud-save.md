# Cloud Save architecture

Optional backup and sync of the library to the user's own Google Drive or Dropbox, layered on unchanged local saving.
Decisions: [docs/handoff/cloud-save/decisions.md](../handoff/cloud-save/decisions.md). Research:
[docs/research/2026-11-22-storage-sync/](../research/2026-11-22-storage-sync/README.md). Policy: PLAN.md D31.

## Pieces

| Path                              | Role                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/src/lib/sync/connection.ts`  | The only sync code in the startup bundle: loads `client.ts` after first paint for a connected device or a returning sign-in; deletes sync data with Delete local work; Studio hooks                       |
| `app/src/lib/sync/client.ts`      | Connection, one syncing tab per browser (Web Lock `pixeldoll-sync`, BroadcastChannel `pixeldoll:sync`), triggers (open, visible, 3 s after a save, online, 60 s while visible), Settings actions          |
| `app/src/lib/sync/core/engine.ts` | Pull, reconcile, push; revisions, item objects, ZIP packs, repair, status                                                                                                                                 |
| `app/src/lib/sync/core/merge.ts`  | Three-way merge: objects per key, keyed arrays per id with atomic elements, conflicts keep side A live                                                                                                    |
| `app/src/lib/sync/core/store.ts`  | IndexedDB `pixeldoll-sync` (`kv`, `revs`, `objects`)                                                                                                                                                      |
| `app/src/lib/sync/pixeldoll.ts`   | The only PixelDoll-specific file: which records sync, stripped fields, artwork refs and pixel-hash verification, writes through `editIdleCharacter`, manifest checks, merge policy                        |
| `app/src/lib/sync/providers/`     | `list/get/put/del/destroy` over Google Drive (`drive.file`, `PixelDoll` folder found by `appProperties`) and Dropbox (app folder); shared retry rules in `http.ts`; `sim.ts` for tests and folder imports |
| `app/src/lib/sync/auth/`          | Full-page redirect with PKCE; Google exchange, refresh and revoke through the token endpoint; Dropbox offline refresh tokens                                                                              |
| `services/sync-token/`            | The D31 Cloudflare Worker: POST `/exchange`, `/refresh`, `/revoke`; origin allow-list; rate limited; no storage or logs                                                                                   |

`app/src/lib/sync/` imports nothing from `studio/` or the locales. The Studio sets `studioHooks` (connection.ts) so a
remote change never overwrites a character open with unsaved edits, and reloads it after a write.

## Remote layout

```
pixeldoll-sync.json                               format marker ("pixeldoll-sync/1")
packs/<sha>.zip, packs/<sha>.json.gz              stored ZIP of <pixelhash>.png (≤ 4 MB), and its hash list
objects/<sha>.json.gz                             one item, shared by every revision that has it
revs/<character>/<depth>.<rev>.<parents>.json.gz  one revision or deletion; the name carries the graph
devices/<device>.json                             this device's head per character; only this device writes it
```

Every file is immutable or single-writer, so no compare-and-swap is needed. Push order: artwork, items, revisions, heads.
A revision is applied only after every cell it needs is downloaded and verified (pack SHA-256, then each cell's pixel hash).

## What syncs

Studio characters (`rig-*`, origin `studio`) minus `creationSpec`, `moveRecovery`, `moveReviews`, `stateGeneration` and
`savedAt`. Never jobs, drafts, flow records, settings or credentials. A character missing locally is a delete only while
its Recently deleted entry exists; any other absence restores it from the cloud.

## Changing the manifest

Each new keyed collection (an array of objects with unique `id`) merges per id automatically. A field that must never
raise a conflict goes in the `quiet` policy in `pixeldoll.ts`. A new manifest format number makes older devices pause
with "Update PixelDoll on this device" instead of merging across formats.

## Tests

- Unit: `npm test -- sync` (engine scenarios and a 300-seed fuzz, provider contract against fakes, auth) and
  `npm test -- sync-token` (the Worker).
- End-to-end: `npm run e2e -- cloud-save` (two browser contexts as devices against fetch-intercepted fake providers).
