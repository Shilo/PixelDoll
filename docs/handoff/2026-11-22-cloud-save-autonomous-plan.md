# Cloud Save: autonomous implementation plan

Written 2026-11-22 for an autonomous agent team.
- **Board card:** [Add cloud sync storage such as Google Drive](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=313269813)
- **Research it builds on:** [docs/research/2026-11-22-storage-sync/README.md](../research/2026-11-22-storage-sync/README.md). Read its "Update after the owner's review" first.
- **Policy:** PLAN.md D31 (one stateless OAuth token endpoint is allowed).

This plan says what to build and how. It is not a set of facts: every claim in it, including the research, must be re-verified by the team before code depends on it (section 4).

---

## 1. Goal

**Give every PixelDoll user an optional, automatic cloud copy of their library in their own Google Drive or Dropbox. It backs up continuously and keeps their devices in sync, and local saving stays exactly as it is.**

Product rules, in priority order:
1. **Local first, always.**
   - IndexedDB stays the only working copy. Every save commits locally first and never waits on the network.
   - Turning sync off, losing the connection, a full cloud or a provider outage never blocks, slows or deletes local work.
2. **Optional.** Nothing changes for someone who never connects. No prompts beyond one quiet suggestion, and no sync code downloaded until it is needed (section 7).
3. **Automatic.** After one sign-in per device, backup and sync just happen. No keys to paste, no manual uploads, no repeated sign-ins (no hourly or per-visit prompts).
4. **Never lose work.**
   - Concurrent edits merge where safe and keep both versions where not.
   - A delete never beats an edit.
   - Browser eviction or "Delete local work" never propagates as deletes.
5. **The user owns the data.** Files live in a visible PixelDoll folder in their own account, readable without PixelDoll (gzipped JSON and standard ZIPs of PNGs).
6. **$0 for the owner.** Free tiers only, nothing that can bill automatically.

Providers:

| Provider | v1? | Notes |
| --- | --- | --- |
| Google Drive | **Yes, first** | Uses the D31 token endpoint so users stay signed in |
| Dropbox | **Yes, second** | Browser PKCE with refresh tokens, no endpoint needed |
| OneDrive (Microsoft's free 5 GB) | Deferred | Browser refresh tokens last 24 h (silent full-page redirect daily); work and school accounts often need publisher verification |
| iCloud | Deferred, likely never | CloudKit JS requires the paid Apple Developer Program ($99/yr), against the $0 rule. Re-verify; record the finding. |

**Non-goals for v1** (each goes on a Later card if it is still wanted):
- live collaboration
- syncing settings, the paid-job ledger, drafts or credentials
- frame-level merging (item level only)
- revision pruning and pack compaction (measure growth; build retention only if v1 data shows the need)
- a devices list with "Forget device"
- a Google Picker re-link (it needs extra CSP script and frame sources and an API key)
- share-sheet export
- an iOS Home Screen hint
- a storage-usage display
- a push on `pagehide`

## 2. Name and terminology

Recommended name: **Cloud Save**, a term players already know from game platforms. It fits PixelDoll's game-like experience and says what it does: your saves, in the cloud.

| Place | Text (English source; localize every string via app/src/locales/) |
| --- | --- |
| Settings section | Cloud Save |
| Connect buttons | Connect Google Drive · Connect Dropbox |
| Status: local only | Saved on this device |
| Status: working | Saving to the cloud… |
| Status: done | Saved to the cloud |
| Status: no network | Offline, will save when back online |
| Status: sign-in expired | Reconnect to keep saving |
| Status: needs a choice | Needs your attention (conflict) |
| Status: provider full | Cloud storage full |
| Status: failed | Couldn't save to the cloud (with the reason and a Retry) |
| Actions | Disconnect this device · Disconnect everywhere (Google only) · Delete cloud copy · Restore an earlier version |
| Conflict choices | Keep this one · Keep the other · Keep both |

**Team task (Phase 0):** challenge the name and labels against docs/usability-principles.md. Check the alternatives "Sync", "Backup & Sync" and "Cloud Backup", and confirm the labels read naturally in the existing locales (the glossary folder in app/src/locales/glossary). Keep "Cloud Save" unless the team finds a concrete problem. Record the outcome in the decision log.

## 3. Team, roles and autonomy rules

| Member | Model | Role |
| --- | --- | --- |
| **Lead** | Claude Opus 5.5, medium effort | Coordinates, owns the board card and decision log, implements, breaks ties |
| **Co-lead** | Codex Sol 6.2, medium effort | Independent researcher and implementer; reviews every Lead change and is reviewed in turn |
| **Challenger** | DeepSeek V4.1 Flash, low effort | Reviews and challenges only; never writes production code |

Both leads launch **specialized sub-agents** with narrow briefs. Each brief names the files, the goal, the exact commands it may run (AGENTS.md: a sub-agent runs no checks unless its brief names the command), and what done looks like. Suggested specialists:
- engine
- provider adapters
- auth and token endpoint
- UI (Svelte specialist, using the Svelte MCP tools)
- localization
- test author
- security reviewer
- performance and bundle reviewer

**Autonomy rules:**
1. **No human until the end.**
   - Never stop to ask the owner.
   - Any step that truly needs a human (accounts, consoles, phones, DNS, secrets, merging to main) goes on the **owner checklist** (section 10).
   - Work continues on everything else, using fakes and local substitutes, until only checklist items remain.
2. **Blockers are solved by the team.** A blocker, concern or disagreement is written to the decision log and argued between the leads, with the Challenger attacking both positions. Resolve it by evidence, in this order:
   - a passing or failing test, or a measurement
   - primary documentation fetched that day
   - source code
   - argument

   If the team is still split after one round, the Lead decides, records the dissent and the reversal trigger, and work continues.
3. **Verify, don't trust.** Each phase starts with both leads independently re-verifying the claims it depends on (section 4). A claim found wrong changes the plan: record it, adjust, continue.
4. **Hard limits that no autonomy overrides** (AGENTS.md and the safety rules apply in full):
   - never spend money
   - never create or sign in to any real account. Real-provider tests use refresh tokens the owner put in `.env`, injected through a dev-only hook, so no agent ever opens a sign-in page.
   - never enter real credentials
   - never touch the owner's real cloud files
   - never push to main or merge
   - never print, log or commit a token or secret
   - never spend PixelLab credits (no generations are needed for this work)
   - never weaken a test to pass
   - never run new executables or servers that would trigger a Windows Firewall prompt (stay on localhost, and use Node and Playwright, which are already approved)
5. **Commit early and often.**
   - Integration happens on `feat/cloud-save`. Each lead works in its own worktree and branch, and the Lead merges the Co-lead's branch into the integration branch after review. Never two writers on the same files.
   - Commit after every green step with Conventional Commits, and push the branches as an off-machine backup.
   - Never commit what you did not make, and format only changed files.
   - Each phase ends with a commit whose message names the phase.
6. **Board** (AGENTS.md "Tasks"):
   - The owner's request for this plan is a standing explicit continuation of this card, so any new team session may resume it in Progress (after the live-duplicate check).
   - The Lead moves the card to Progress at Phase 0.
   - At the Phase 9 stop, make the card body's first line "Blocked: owner checklist".
   - Add a "Left: …" line as phases complete.
   - Split independent outcomes into their own cards only where the rules say to (for example the local-protection work in Phase 1 ships on its own).
   - Sub-agents never touch cards.

**Decision log:** docs/handoff/cloud-save/decisions.md. One entry per decision: date, question, options, evidence, decision, dissent, reversal trigger. Create it in Phase 0; it is the team's shared memory across sessions.

**Session continuity:** at the end of every working session, the Lead updates docs/handoff/cloud-save/status.md with:
- phase and step
- what is green
- what is in flight
- the next three actions
- open disagreements

A new session reads this plan, the decision log and status.md first. Check ListAgents for a live duplicate before resuming.

## 4. Claims to re-verify before they are relied on

Record each result in the decision log with sources.

**Google (auth, Drive API, verification):**
1. Google's browser token model gives no refresh token, and the Web-client code exchange needs the client secret.
2. `drive.file` lets a second browser or device using the same OAuth client see files the app created. Also check that `appProperties` queries and `about.get` (account email) work under `drive.file`.
3. Each new device needs `prompt=consent` to get its own refresh token. Find out what revoking does to other devices. Testing-mode tokens expire after 7 days. Unused tokens die after 6 months. There is a cap of 100 tokens per account per client.
4. Drive Range downloads and resumable uploads work from the browser (CORS on preflight with Range and Content-Range).
5. Drive quota units (download 200, list 100, edit 50) and the 400M-units-a-day threshold. Find out what happens with no billing account attached.

**Dropbox:**

6. PKCE with `token_access_type=offline` returns a refresh token usable without a secret.
7. App-folder behavior, upload sessions and Range downloads, all CORS-checked.

**Token endpoint:**

8. Cloudflare Workers Free gives 100,000 requests a day and 10 ms CPU. Over the limit it returns error 1027, with no charge. Confirm a `workers.dev` endpoint works with CORS locked to https://pixeldoll.app and http://localhost:5199.

**iPhone and Safari:**

9. A full-page OAuth redirect from an installed iOS Home Screen app returns to the app (not Safari). This can only be fully verified on a device, so build for it and put the device test on the checklist.
10. Safari's 7-day storage deletion and the Home Screen exemption.

**This repository:**

11. Every repository fact the research states (stores, ids, fences, backup caps, multi-tab locks) still matches the code.

## 5. Architecture

From the research, adjusted by its update section. The PoC in docs/research/2026-11-22-storage-sync/poc/ is the reference implementation of the engine; port it, don't copy blindly.

```
app/src/lib/sync/                 self-contained, imports nothing from studio/, locales or db.ts internals
  core/                           provider-neutral engine
    engine.ts                     pull → reconcile → push; status machine; Web Lock leader; triggers
    merge.ts                      three-way merge with a declarative policy
    objects.ts                    content-addressed revisions, item objects, ZIP packs (reuse lib/store/zip.ts)
    store.ts                      IndexedDB "pixeldoll-sync" (meta, revisions, objects, pending, tokens)
  providers/
    types.ts                      { list(prefix), get(path, range?), put(path, bytes), del(path) } + typed errors
    google-drive.ts               path→id cache, appProperties root tag, resumable upload ≥ 5 MB
    dropbox.ts                    app folder, upload sessions, Range downloads
    sim.ts                        the simulated provider from the PoC, used by unit tests and the fuzz test
  auth/
    google.ts                     full-page redirect + PKCE, endpoint exchange/refresh, revoke
    dropbox.ts                    full-page redirect + PKCE, offline refresh, revoke
  pixeldoll.ts                    the ONLY PixelDoll-specific file: allow-list, field stripping, merge policy,
                                  manifest validation, pixel-hash verification, apply-through-db.ts adapter
app/src/studio/CloudSaveSettings.svelte   lazily loaded Settings section (SettingsSection 'cloud')
services/sync-token/              the D31 token endpoint (outside app/, so it never ships in the app bundle)
  worker.ts                       ~30-60 lines: POST /exchange, POST /refresh; Origin allow-list; no storage, no console calls
  worker.test.ts                  run by app's Vitest (add the path to its include) with a mocked Google token
                                  endpoint, so CI covers it; no workerd needed. Add services/** to pages.yml paths.
  wrangler.toml                   name, compatibility date, [observability] enabled = false, a Workers Rate Limiting
                                  binding (WAF rules need a Cloudflare zone, which DNS at Porkbun doesn't give);
                                  the secret is set by the owner at deploy time
```

**Key decisions already made** (re-verify, don't re-litigate without new evidence):
- **Remote layout:**
  - `PixelDoll/` folder tagged with `appProperties` on Drive; the root is the app folder on Dropbox.
  - `pixeldoll-sync.json` (format marker)
  - `packs/<sha>.zip` (stored ZIP of `<pixelhash>.png`)
  - `objects/<sha>.json.gz`
  - `revs/<character>/<depth>.<rev>.<parents>.json.gz`
  - `devices/<id>.json`
- **Writes:** only immutable or single-writer files, so no compare-and-swap is needed.
- **Push order:** artwork, then objects, then revisions, then the heads file.
- **Merge granularity: item level in v1.**
  - Items, slots, materials and outfits merge per id.
  - A concurrent change inside the same item is a keep-both conflict.
  - Deterministic winner by revision id; a delete loses to an edit.
  - Name-slug id collisions keep both.
  - The frame-position merge rule from the PoC stays out of v1.
- **What syncs:** character records (`rig-*`) minus device-local receipts (`creationSpec`, `moveRecovery`, `moveReviews`, `stateGeneration`), plus their artwork. Never the `jobs` ledger, drafts, flow records, credentials or settings.
- **Applying remote changes:** only through the same idle-character write path as local edits. Refused while generation work or unsaved edits hold the character; retried next sync.
- **Repair:** a vanished own-heads file triggers verify-and-reupload. A trashed root folder asks "Rebuild cloud copy?" and is never read as deletes.
- **First connect with existing data:**
  - A device with a library connecting to a cloud copy that already has data merges by id: characters by their `rig-` id, items by id.
  - It never duplicates. Two pre-existing libraries become one, and only true same-item differences become keep-both conflicts.
  - Existing item ids (name slugs) stay as the permanent ids. Only new items get random ids (Phase 2). Without this, two devices converting the same old items would get different ids, and everything would be duplicated.
- **Sign-in redirect:**
  - The redirect URIs are the app roots: `https://pixeldoll.app/` and `http://localhost:5199/`. pwa-worker.js already serves the root for navigations, so there is no new path and no GitHub Pages 404.
  - The startup check spots `?code&state`, lazy-loads `auth/`, finishes the exchange, then removes the query with `history.replaceState`.
  - Keep the PKCE verifier and `state` in IndexedDB, keyed by `state` with a 10-minute lifetime, not in sessionStorage. On iOS the redirect may land in another context.
  - Use a code once. Broadcast "connected" to other tabs, never the token.
  - Google: `access_type=offline` and `prompt=consent` on every new device, or no refresh token is returned.
- **Triggers:**
  - open
  - visible
  - 3 s after a save
  - `online`
  - every 60 s while visible
- **One tab:** a single sync tab per browser (Web Lock `pixeldoll-sync`) tells the other tabs to refresh through a BroadcastChannel.
- **Tokens:**
  - Refresh tokens live in `pixeldoll-sync` (IndexedDB), unencrypted by owner decision. They are never synced, broadcast or logged, and separate from `pixellabApiKey`.
  - Access tokens stay in memory.
  - "Disconnect this device" deletes local tokens only.
  - "Disconnect everywhere" is Google only: it revokes with Google, after saying it signs out every device. Dropbox revoke covers one token only, so for Dropbox link to the account's connected-apps page instead.
- **Hidden until release:**
  - Cloud Save is visible only in Developer mode until the final release.
  - This lets the privacy page and the sync code ship to production early, for Google's review and the phone tests, without users seeing an unfinished feature.

## 6. Phases

Every phase runs the same loop:
1. **Verify:** both leads independently check the phase's claims (section 4).
2. **Challenge:** the Challenger attacks the phase design, and the leads answer in the decision log.
3. **Implement:** specialists work in parallel where files don't overlap.
4. **Cross-review:**
   - Each lead reviews the other's diff.
   - The Challenger reviews both and looks for regressions, YAGNI violations and missing tests.
5. **Fix,** then run that phase's checks (section 8).
6. **Commit and push the branch.** Update status.md and the card.

A phase is done only when its acceptance criteria pass and no review finding is open (fixed, or rejected with a recorded reason).

### Phase 0: Setup and verification
- **Setup:**
  - Create the worktree and `feat/cloud-save`.
  - Move the card to Progress.
  - Create decisions.md and status.md.
- **Research:**
  - Both leads independently verify section 4 and the research report's repository facts.
  - Settle the name (section 2).
  - Inventory the CSP (app/index.html `connect-src`) and service-worker (app/pwa-worker.js) changes needed.
  - The CSP blocks requests before Playwright's fakes can see them, so add the Google and Dropbox hosts in the same commit as the first sync e2e test.
  - The endpoint URL is one constant. Its CSP entry and value are filled in once the owner deploys it (checklist).
- **Exit:** a decision log entry for every section 4 claim.

### Phase 1: Protect local data (no cloud)
- **Persistence:**
  - Request `navigator.storage.persist()` after the first save and record the result.
  - Handle `QuotaExceededError` as "device storage full".
- **Backup:**
  - Lift the `pixeldoll-backup/1` caps (64 MiB, 5,000 entries, 500 records) with streaming or splitting, so a complete library can be backed up and restored. This was a requirement of the original handoff.
  - Restore keeps its never-overwrite preview.
- **Tests:** unit tests for the cap lift, plus the existing backup e2e (see AGENTS.md for the spec that covers it).

### Phase 2: Sync-ready data (no cloud)
- **Ids:**
  - Existing item ids stay as they are, permanently. New items get random ids. Outfit ids survive a rename.
  - Never rewrite the ids of existing items: two devices doing that to the same library would duplicate everything on first sync.
- **Tombstones:** a user's character delete records a tombstone for sync. Eviction or Delete local work records none.
- **Sync database:**
  - `pixeldoll-sync` lives inside the Delete-local-work fence.
  - Add the allow-list and field stripping in `sync/pixeldoll.ts`.
  - Check the format version: a device on an incompatible build pauses with "Update PixelDoll on this device".
- **Tests:** unit tests for id stability, tombstones and the fence.

### Phase 3: Engine (fakes only)
- **Port the PoC engine into `sync/core`** with:
  - the IndexedDB cache
  - pixel-hash verification
  - item-level merge policy
  - manifest validation (slots, presets, clips, zOverrides, baseCut)
  - ZIP packs
  - status machine, triggers, Web Lock and BroadcastChannel
  - repair
  - first-connect merge of an existing library
- **Tests:**
  - Bring over the PoC's sync tests and fuzz test, running against `sim.ts`, adapted to item-level merging.
  - Add a regression test for every finding in notes/cross-review.md that applies.

### Phase 4: Provider adapters (fakes only)
- **Contract test suite:** one suite, in `providers/contract.test.ts`, that every adapter must pass. It covers:
  - list paging
  - Range get
  - large put
  - duplicate names (Drive)
  - missing files
  - quota errors mapping to `cloud-full`
  - 401 mapping to `reconnect`
  - 429/5xx backoff
- **Google Drive adapter:** test against a recorded-response fake (fetch interception), modeled on primary docs and, where useful, google-drive-mock.
- **Dropbox adapter:** a hand-written fake from the documented endpoints.
- **Real-provider runs:** the same suite runs against real providers later, gated on env tokens (section 10).

### Phase 5: Auth and token endpoint (fakes only)
- **Endpoint:** `services/sync-token/worker.ts`, unit-tested in Node against a mocked Google token endpoint:
  - CORS allow-list
  - method and path allow-list
  - no logging of bodies
  - rate-limit headers
- **Client auth:**
  - Full-page redirect flows (not popups) for both providers, with PKCE `state` and `code_verifier` in sessionStorage.
  - One-time code use, guarding against duplicate callbacks.
  - `prompt=consent` per new Google device.
  - Refresh on 401, then "Reconnect" on `invalid_grant`.
- **Tooling:** a deploy script and README for the endpoint. The owner runs them in section 10.

### Phase 6: Cloud Save UI
- **Lazy loading:** a Settings › Cloud Save section, loaded on demand like the existing sheets (`() => import(...)`).
- **Contents:**
  - the connect buttons
  - account email, status, last saved
  - Disconnect this device, and Disconnect everywhere (Google)
  - Delete cloud copy (confirmed, explains it cannot be undone)
  - Restore an earlier version of a character (the original handoff requires it)
  - Import a downloaded copy of the sync folder (the recovery path if the Google OAuth client is ever lost)
- **Visibility:** the section shows only in Developer mode until release.
- **Conflict review:** a small badge on characters with open conflicts, opening a side-by-side choice (Keep this one / Keep the other / Keep both).
- **Status:**
  - a quiet status indicator, consistent with the minimal game layout (no editor-like chrome)
  - the always-visible states from section 2
  - errors that explain what happened and what to do
- **Copy and checks:**
  - All copy goes through the locales.
  - Bronze UI owns shared appearance; layout and spacing stay local.
  - Check in the browser: dark and light, phone and desktop, keyboard and screen reader labels (AGENTS.md "Theme").

### Phase 7: Privacy, docs and release readiness
- **Privacy:**
  - Add a privacy policy page shipped with the app, at a stable URL such as https://pixeldoll.app/privacy.html. Google's consent screen needs it.
  - It states what is stored where, that the token endpoint sees tokens only in transit and stores nothing, how to disconnect and delete, and that no analytics exist.
- **Docs:**
  - user guide section
  - docs/known-issues.md entries for accepted limits
  - architecture notes
  - D31 follow-up: update the "no backend" statements in PRODUCT.md, README.md and docs/architecture.md.
- **CSP:** add `connect-src` entries for www.googleapis.com, oauth2.googleapis.com, api.dropboxapi.com, content.dropboxapi.com and the endpoint origin.
- **Agent dev wiring:**
  - Mirror docs/handoff/agent-dev-token-handling.md: the agent dev server reads test refresh tokens from the repo-root `.env` (`GOOGLE_SYNC_TEST_REFRESH_TOKEN`, `DROPBOX_SYNC_TEST_REFRESH_TOKEN`) and injects them into `pixeldoll-sync` through a dev-only hook.
  - Agents run real-provider tests without ever opening a sign-in page.
  - Add the names to the MARKERS list in app/scripts/dist-guard.mjs, so they can never reach a build.
  - Add a one-time helper script the owner runs to mint those tokens from the test accounts.
- **Owner checklist:** fill in exact values (redirect URIs, origins, scopes, app names) so the owner copies, never decides.

### Phase 8: Full verification with fakes
- **Multi-device e2e:** Playwright, using two browser contexts as two devices and a third as a fresh device, against fetch-intercepted fake providers and a fake endpoint (no new server processes). It runs the twelve scenarios from the research:
  - create, edit and restore
  - two pre-existing libraries connecting to one cloud copy (no duplicates)
  - independent and same-item edits
  - offline days
  - interrupted upload
  - cleared data
  - disconnect
  - cloud full
  - provider switch
  - delete versus edit
  - two tabs
- **Full suite:** the whole e2e suite (`npm run e2e -- --all`), because storage and studio state are cross-cutting. Then `npm run check` and `npm test`.
- **Performance budgets:** record before and after numbers in status.md.
  - The entry chunk grows by at most 2 KB gzipped (the startup check). All other sync code is a separate chunk.
  - Saving is not slower with sync on (benchmark the save path).
  - A no-change sync is 1 request.
  - The large-workspace restore stays within the research benchmarks.

### Phase 9: The owner checklist, then real-provider verification
Everything before this phase is complete, green and committed, with Cloud Save hidden behind Developer mode. The Lead:
- writes docs/handoff/cloud-save/owner-checklist.md (section 10)
- marks the card "Blocked: owner checklist"
- stops

When the owner reports it done, the team resumes autonomously:
1. Fill in the endpoint URL constant and its CSP entry (from checklist step 9).
2. Run the provider contract suite against real Google Drive and Dropbox, using the test accounts' tokens from `.env`. Fix what fails.
3. Run desktop two-browser sync against the real providers. Tokens are injected; no agent signs in.
4. Read the owner's phone test notes, fix what they found, and repeat only the failing steps. Each fix that phones must see needs another owner merge, so batch fixes into as few rounds as possible.
5. Run the final cross-review and final full checks.
6. Prepare the release summary. The final owner merge removes the Developer-mode gate.

## 7. Engineering principles applied

- **KISS and YAGNI:**
  - no sync library (the research rejected all candidates; don't re-adopt one without new evidence)
  - no options the user doesn't need
  - no provider abstraction beyond the four methods
  - no retention, compaction or frame merge until data shows the need
  - OneDrive and iCloud stay deferred
- **DRY:**
  - Reuse lib/store/zip.ts, the hash helpers, the backup ZIP format pieces, existing Settings components and the lock and channel patterns.
  - Extract only at the second caller.
- **Lazy loading:**
  - `app/src/lib/sync/**` and `CloudSaveSettings.svelte` load only through dynamic import:
    - at startup, after first paint, when a connection exists
    - otherwise when Cloud Save is opened
  - The startup path may import at most a tiny "is a connection stored?" check.
  - Enforce it with a build check (extend app/scripts/dist-guard.mjs or a test that the entry chunk has no sync code).
- **Self-contained:** `app/src/lib/sync/` never imports from `studio/` or locale files. Only `sync/pixeldoll.ts` knows PixelDoll's data. This keeps a later extraction into its own repo cheap (triggers: a second app needs it, an outside request, or two stable months with real users), without paying for it now.
- **Surface errors:**
  - Every failure maps to a status the user can see and act on.
  - No silent catch, except documented intended fallbacks.

## 8. Testing

Follow AGENTS.md "Testing" exactly. In particular:
- cheapest level first
- one regression test per bug
- never weaken a test
- one e2e run per machine at a time
- name exact commands in sub-agent briefs

| Level | What | Command |
| --- | --- | --- |
| Unit | merge policy, engine against `sim.ts`, fuzz (3 devices, 300 seeds), adapters against fakes, auth state machine, endpoint worker, allow-list | `npm test -- sync` and `npm test -- sync-token` (from app/; Vitest includes services/sync-token) |
| Contract | each adapter against its fake (always), and against the real provider when tokens exist (Phase 9) | `npm test -- contract` |
| E2E | two-context devices with fake providers; Settings UI wiring; one case per control | `npm run e2e -- cloud-save`, and in Phase 8 `--all` |
| Browser checks | Cloud Save page in dark and light, phone and desktop, keyboard | preview tools against `npm run dev:agent` (port 5199) |
| Bundle and perf | entry chunk unchanged, save path unchanged, request counts | `npm run build` + the guard; bench script |
| Real devices | iPhone Home Screen, Android, desktop sign-in round trips | owner, Phase 9 |

New e2e tests go in a new `cloud-save` spec. Read docs/testing/test-performance.md first, and register the spec in the CI shard balancing.

## 9. Security and privacy

- **Scopes:**
  - Google: `drive.file` only. Never `drive` or `drive.appdata`, since the user must see the folder.
  - Dropbox: App folder only.
- **Endpoint:**
  - It holds the Google client secret as a Cloudflare secret, never in the repo.
  - Only `/exchange` and `/refresh`, with POST only.
  - Origin allow-list, no storage, no request or body logging.
  - A Cloudflare rate-limit rule (owner checklist).
  - It never sees PixelLab tokens or files.
- **Client tokens:**
  - Refresh tokens are in IndexedDB `pixeldoll-sync`, and access tokens in memory.
  - Never broadcast, logged or exported. The backup ZIP must exclude them (extend the existing key-in-export check).
- **Disconnect, revoke, delete:**
  - Disconnect this device: local only.
  - Disconnect everywhere: revoke with the provider.
  - Delete cloud copy: explicit, confirmed, never automatic.
- **Data paths:** artwork and manifests go browser to provider directly. No third-party analytics.

## 10. Owner checklist (the only human steps; done once, at the end)

The Lead fills in every value before handing over. The owner only copies and clicks. Everything is free; attach no billing account and no card.

**Release A (first)**

0. **Merge the release A pull request.** The team opens it, merging `feat/cloud-save` with Cloud Save hidden behind Developer mode and the privacy page live at https://pixeldoll.app/privacy.html. The home page links to the privacy page. Google's brand review needs both live, and the phone tests need the code on pixeldoll.app, since phones can't reach a localhost dev server.

**Google**

1. **Create the project.** At console.cloud.google.com, create the project "PixelDoll". Attach no billing account.
2. **Enable the API.** Turn on the Google Drive API.
3. **Branding** (Google Auth Platform › Branding):
   - app name PixelDoll, support email, logo (the file the team prepared)
   - home page https://pixeldoll.app/
   - privacy policy https://pixeldoll.app/privacy.html
   - authorized domain pixeldoll.app
4. **Verify the domain.** In Search Console, signed in with the same Google account that owns the Cloud project, add the TXT record it shows at Porkbun DNS. Skip this if the team's `nslookup -type=TXT pixeldoll.app` check already found a google-site-verification record.
5. **Data Access:** add the `drive.file` scope only.
6. **Clients:** create a Web application client with:
   - origins https://pixeldoll.app and http://localhost:5199
   - redirect URIs (the exact list from the team)
7. **Audience:**
   - Publish to Production. Testing mode expires sign-ins after 7 days.
   - Submit brand verification (about 2-3 business days).
8. **Hand over** the client ID (public) to the repo config.

**Cloudflare**

9. **Deploy the endpoint.** Create a free account. In `services/sync-token/`, run the deploy command from its README, then `wrangler secret put GOOGLE_CLIENT_SECRET`, pasting the secret in the terminal only. Give the team the `workers.dev` URL it prints. Rate limiting is built into the deploy config; there is no separate step.

**Dropbox**

11. **Create the app.** At dropbox.com/developers/apps, create the app "PixelDoll": Scoped access, App folder.
12. **Configure it.**
    - Turn on "Allow public clients (Implicit Grant & PKCE)" and add the redirect URIs from the team.
    - On Permissions, enable `files.metadata.read`, `files.content.read`, `files.content.write` and `account_info.read`. The team confirms the exact list.
13. **Hand over** the App key (public) to the repo config.
14. **Later:** at 50 connected users, submit the free production review within 2 weeks.

**Tests and release**

15. **Test accounts.** Create (or reuse) a spare Google account and a spare Dropbox account. Run the token helper script once to put their test refresh tokens into the repo-root `.env`. Never paste them in chat.
16. **Phones** (on production, with Developer mode turned on):
    - Install PixelDoll to the Home Screen on an iPhone, and on Android if available.
    - Follow the team's phone test script: connect both providers, edit on phone and desktop, check the results.
    - Note anything that failed in docs/handoff/cloud-save/phone-test.md, or tell the team.
17. **Merge the fix rounds** the team prepares from the phone tests, then the final release that removes the Developer-mode gate.

## 11. Risks the team must watch

- **iOS Home Screen redirect sign-in:** unproven on a device. Build the redirect flow, keep a "finish sign-in in Safari, then reopen the app" fallback in mind, and decide after step 16.
- **Losing the Google OAuth client:** suspension or recreation would leave users' files invisible under `drive.file`. v1 ships "Import a downloaded copy of the sync folder", plus a known-issues entry. A Picker re-link is deferred.
- **Claims under doubt** (verify in Phase 0; don't build on them blindly):
  - Drive's quota-unit costs and the planned 2026 charges. The lead checked Google's limits page on 2026-11-22, but a reviewer doubted it.
  - Whether an unverified app with only `drive.file` shows Google's "unverified app" screen.
  - The RFC number for the browser-apps best practice.
- **Google Drive API billing** planned for later in 2026: keep request counts low (packs, 60 s idle poll, no per-file listing) and track units per sync in a dev counter.
- **Storage growth:** about 15 KB per changed item per revision. Measure real libraries, and build retention only if needed.
- **Mixed builds across devices:** the format check pauses sync rather than merging across formats.
- **Endpoint outage or free-tier exhaustion:** Google sync pauses, and local work and Dropbox are unaffected. Show "Reconnect"-style status only after real failure, not on a single blip.

## 12. Definition of done

1. Every phase's acceptance criteria pass.
2. All checks are green: `npm run check`, `npm test`, `npm run e2e -- --all`, the endpoint tests, and the bundle guard.
3. Real-provider contract and desktop sync tests pass, along with the owner's phone tests.
4. No open review finding.
5. Decision log complete.
6. Docs and privacy page published.
7. The card has no "Left:" line and moves to Done.
8. The owner has the merge summary.
