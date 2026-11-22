# Cloud Save decision log

One entry per decision: date, question, options, evidence, decision, dissent, reversal trigger. Plan: [../2026-11-22-cloud-save-autonomous-plan.md](../2026-11-22-cloud-save-autonomous-plan.md).

## 1. Team substitution (2026-11-22)

- **Question:** the plan names Codex Sol 6.2 (Co-lead) and DeepSeek V4.1 Flash (Challenger). Neither is reachable from this Claude Code session.
- **Decision:** Lead is Claude Opus 5.5. Independent verification and specialist work run as Claude sub-agents with narrow briefs (Sonnet for verification, Opus for adapters and auth). The Challenger role is a separate Claude reviewer that sees the code, not the Lead's conclusions.
- **Dissent:** none possible. **Reversal:** a session with Codex or DeepSeek access may rerun the reviews.

## 2. Section 4 claims (verified 2026-11-22 from primary docs)

| #   | Claim                                                                                        | Result                                                                                                                                                                                                                                                                                 | Consequence                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Google browser apps get no refresh token; code exchange needs the secret                     | Confirmed (token model docs; samples always pass the secret; no Google-sanctioned secret-less Web-client path)                                                                                                                                                                         | Keep the D31 endpoint for /exchange and /refresh                                                                                                                           |
| 2   | drive.file sees app-created files from a second device; appProperties query; about.get email | appProperties query documented (private to the app); about.get allows drive.file but `emailAddress` "may not be present"; second-device visibility not stated in docs                                                                                                                  | Request `openid email` and read the email from the id_token. Second-device visibility goes on the owner phone/desktop test.                                                |
| 3   | prompt=consent per device; revoke; 7-day Testing; 6-month idle; 100-token cap                | prompt=consent confirmed; 7-day Testing expiry applies to drive.file; 6 months and 100 tokens (oldest silently invalidated) confirmed; **revoke removes the whole grant** and the revoke endpoint has **no CORS**                                                                      | "Disconnect this device" deletes local tokens only. "Disconnect everywhere" revokes through the endpoint's /revoke. invalid_grant means Reconnect.                         |
| 4   | Drive Range and resumable uploads from the browser                                           | Documented, but no CORS statement for Range or for reading the resumable `Location` header                                                                                                                                                                                             | No Range reads in v1 (decision 6). Multipart upload up to 5 MB; resumable above (packs stay ≤ 4 MB so resumable is not on the normal path). Real-browser check in Phase 9. |
| 5   | Drive quota units                                                                            | Confirmed: download 200, list 100, edit 50, 400M units/day threshold; "planned to incur charges ... later in 2026". Projects created on or after 2026-05-01 get the new quotas; no statement on a missing billing account                                                              | Keep request counts low (packs, one list per idle sync). Recheck billing terms before release (owner checklist).                                                           |
| 6   | Dropbox PKCE offline refresh without secret                                                  | Confirmed (Dropbox authorization guide example)                                                                                                                                                                                                                                        | No endpoint for Dropbox                                                                                                                                                    |
| 7   | Dropbox app folder, sessions, CORS                                                           | Upload sessions and scopes confirmed (files.metadata.read, files.content.read, files.content.write, account_info.read); docs recommend `arg`/`authorization` URL parameters to avoid preflights; revoke is per token                                                                   | Adapter follows the CORS guidance; Disconnect everywhere links to Dropbox's connected apps page                                                                            |
| 8   | Cloudflare Workers Free                                                                      | Confirmed: 100,000/day, 10 ms CPU, error 1027 over the limit, workers.dev needs no zone, `[[ratelimits]]` binding (Free availability not stated), observability on by default so it must be disabled explicitly                                                                        | wrangler.toml sets both; the owner's deploy confirms the binding                                                                                                           |
| 9   | iOS Home Screen full-page redirect                                                           | Unverifiable: forum reports of the callback landing in Safari as late as 2026                                                                                                                                                                                                          | Build the redirect; owner phone test decides; fallback "connect from Safari" noted in known issues                                                                         |
| 10  | Safari 7-day storage cap, Home Screen exemption                                              | Confirmed (WebKit blog)                                                                                                                                                                                                                                                                | Cloud Save is the recovery path; reconnect is quiet                                                                                                                        |
| a   | Unverified-app screen for drive.file only                                                    | Inference: the screen is tied to sensitive scopes; branding verification still needed                                                                                                                                                                                                  | Owner checklist keeps brand verification                                                                                                                                   |
| b   | RFC number                                                                                   | RFC 10017 (BCP 212, August 2026), section 6.2 token-mediating backend                                                                                                                                                                                                                  | Cite it in the privacy page and docs                                                                                                                                       |
| 11  | Repository facts                                                                             | Checked against 53c0a4d57: stores `projects`/`blobs`/`jobs`, delete fence by version, `pixeldoll-storage` presence lock, backup caps 64 MiB / 5,000 entries / 500 records, `askPersist()` ignores its result, pwa-worker serves the root for any navigation to `/` regardless of query | As in the research, plus decisions 3-5                                                                                                                                     |

## 3. Name (2026-11-22)

- **Options:** Cloud Save, Sync, Backup & Sync, Cloud Backup.
- **Evidence:** "Sync" says nothing about safety and collides with nothing in the glossary; "Backup" already names the manual ZIP (Library > Back up), so "Cloud Backup" and "Backup & Sync" would blur the two. "Cloud Save" is a known game term, short, and distinct from the ZIP backup.
- **Decision:** keep **Cloud Save**. **Reversal:** a translator or user reports confusion with "Save".

## 4. Tombstones reuse Recently deleted (2026-11-22)

- **Question:** the plan asks for a tombstone written on a user's character delete.
- **Evidence:** the only user character delete (`deleteCharacter` in db.ts, called from studio/state.svelte.ts) already writes a durable `recently-deleted:` entry of kind `character` with the `projectId`, in the same transaction. Eviction and Delete local work remove those entries too.
- **Decision:** a character missing locally is a delete to sync only while such an entry exists for it; any other absence (eviction, Delete local work, an archived old-format record) is "missing here" and the cloud copy is restored. No db.ts change.
- **Accepted limit:** deleting and then emptying Recently deleted before the next sync (both offline) brings the character back from the cloud. Known issue.
- **Reversal:** a second delete path appears that writes no Recently deleted entry.

## 5. Random item ids deferred (2026-11-22)

- **Question:** Phase 2 asks new items to get random ids.
- **Evidence:** existing slug ids stay permanent anyway, so the merge must handle two devices adding the same slug (it keeps both under a derived id). Random ids only lower how often that happens, and touch item creation, export ids and many tests. Item and outfit renames already keep their ids (rename edits `name`); only editing an outfit's export ID changes its id, which merges as remove plus add (at worst both kept).
- **Decision:** no id changes in v1. **Reversal:** keep-both item duplicates show up in real use.

## 6. Packs are downloaded whole, no Range reads (2026-11-22)

- **Evidence:** Range CORS is unverified on Drive; a pack is ≤ 4 MB and named by the SHA-256 of its bytes, so a whole download verifies the pack in one hash, then every cell is checked by its pixel hash (`cellHash`, the app's own key) before it is stored.
- **Decision:** whole-pack downloads only. **Reversal:** measured restores or incremental pulls download far more than they use.

## 7. Change detection at sync time (2026-11-22)

- **Decision:** the save path is untouched. A sync compares each character's synced body (stable JSON of the stripped record) with its base revision. **Reversal:** sync CPU for large libraries exceeds the Phase 8 budget.

## 8. What a revision body holds (2026-11-22)

- Studio characters only (`studioCharacter`: `rig-*` with origin `studio`), the same set the backup exports.
- Stripped (device-local or volatile): `creationSpec`, `moveRecovery`, `moveReviews`, `stateGeneration`, `savedAt`. `savedAt` is set locally when a remote revision is applied.
- `dress` (what the character wears now) syncs, with no conflict notes: side A wins.

## 9. Item-level merge policy (2026-11-22)

- Keyed arrays (arrays of objects with unique string `id`: items, slots, materials, presets, moves) merge per id, and each element is atomic: two different changes to one element are one conflict. Objects merge per key. Every other array is atomic.
- A merged manifest that fails validation falls back to side A whole, with side B whole in the conflict note.

## 10. PKCE state in IndexedDB (2026-11-22)

- **Question:** section 5 says IndexedDB keyed by state; Phase 5 says sessionStorage.
- **Decision:** IndexedDB (`pixeldoll-sync`), since on iOS the redirect may land in another browsing context that has no sessionStorage of the first. 10-minute life, read-and-delete before the exchange.

## 11. Order of work (2026-11-22)

- **Decision:** the engine, adapters, auth and UI come first. Phase 1's backup cap lift is its own outcome with its own board card, done after the Cloud Save core. `persist()` result recording and the quota error are small and done with Phase 2.
- **Reversal:** the owner reprioritizes.

## 12. A fifth provider method, destroy() (2026-11-22)

- **Decision:** "Delete cloud copy" needs one call to remove the root folder; listing and deleting thousands of files one by one would cost quota and time. `destroy()` is the only addition to list/get/put/del.

## 13. Same item id added on two devices is a conflict (2026-11-22)

- **Options:** the PoC kept both automatically under a derived id; or treat it as an ordinary conflict.
- **Evidence:** a derived copy shares the original's export id and material ids, so the merged manifest fails its own checks and the merge falls back to whole-record notes anyway. The app already has an item-copy helper (`copyShell`) that makes clean copies.
- **Decision:** a conflict like any other; "Keep both" in the conflict review makes the copy with `copyShell`. **Reversal:** users hit this often enough to want it automatic.

## 14. Challenger review, round 1 (2026-11-22)

Independent reviewer (code only, no Lead conclusions). Outcomes:

| Finding                                                                                                                       | Severity | Outcome                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A revision made just before the tab closed was never uploaded, while the heads file named it                                  | Critical | Fixed: revisions carry `up` once read from or written to the cloud; `make()` requeues one without it. Regression test fails without the fix.                                                                                                                                                                    |
| A device that stopped syncing made every idle sync list revision folders (1 + N requests)                                     | Major    | Fixed: heads already merged into the base are remembered per character and skipped. Regression test fails without the fix.                                                                                                                                                                                      |
| Resolve or Restore in a non-syncing tab raced the syncing tab's state                                                         | Major    | Fixed: every engine call runs under the Web Lock `pixeldoll-sync-state`.                                                                                                                                                                                                                                        |
| A trashed Drive folder was rebuilt silently after a reload                                                                    | Major    | Fixed: a device that wrote to this account before and finds the format marker gone reports `missing` and waits for Rebuild. Only a missing heads file with the marker present re-uploads by itself, after reading the file to rule out a lagging listing. Provider or account switches re-upload by themselves. |
| A remote delete hard-deleted locally and skipped Recently deleted; "Keep the other" on a whole-character delete did not stick | Major    | Fixed: a synced delete writes a Recently deleted entry in the same transaction, which also marks it as the user's delete.                                                                                                                                                                                       |
| The user's own saves during a long sync waited for the 60 s timer                                                             | Minor    | Fixed: only writes made by sync's own apply are ignored.                                                                                                                                                                                                                                                        |

UI review of the client (by the UI specialist): tabs not connected now listen for another tab's connect; import errors carry the engine's message instead of a status name; the version list marks the current version explicitly.

## 15. Startup bundle budget (2026-11-22)

- **Measured:** the entry chunk (`bootstrap-*.js`) is 403.23 KB gzipped against 401.15 KB on main at 53c0a4d57: +2.08 KB. The Cloud Save section's English copy accounts for about 1.2 KB of that, because the app always bundles English. The code part (startup check, Settings entry, attention dot, save trigger) is under the 2 KB budget. All sync code is in a separate `client-*.js` chunk (13 KB gzipped), plus `CloudSaveSettings-*.js` (4.9 KB gzipped). The dist guard fails a build whose startup chunks carry sync markers.
- **Decision:** accept. The 0.08 KB over the literal budget is copy, not code. **Reversal:** the owner wants copy counted, then move the section's strings into a lazily loaded catalog.

## 16. Spec name inside this worktree (2026-11-22)

`npm run e2e -- cloud-save` in a worktree whose path contains "cloud-save" selects every spec (Playwright matches the filter against the full path). Use `npm run e2e -- e2e/cloud-save` here; in other checkouts the short name works.
