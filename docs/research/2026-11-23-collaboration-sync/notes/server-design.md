# Opt-in PixelDoll server sync with teams: product and technical design

Research date: 2026-11-23. Scope: design, not hosting prices (a separate note covers those). Repository facts are
checked against `feat/cloud-save` at b8f9d808a. External facts carry a link; anything marked **unverified** needs a
primary-source check before it drives a decision. This is not legal advice; section 5 needs a lawyer's read before launch.

## Summary

- The sync engine can run **unchanged** against the owner's server. The server only has to implement the existing
  five-method `Provider` contract per library, plus sign-in, membership checks and a "something changed" ping.
- "Within a couple of seconds" needs a WebSocket ping that calls the existing `syncNow()`, plus a shorter save debounce
  for this provider. True live co-editing (CRDT, cursors) is not needed and would fight the item-atomic merge.
- Teams are **separate libraries** (one IndexedDB working copy each, one active at a time), with owner, editor and
  viewer roles, expiring invite links and server-enforced revocation. The same layout maps to a shared GitHub repo or
  shared folder later.
- Holding user artwork makes the owner a data controller and a host: privacy policy, terms, DMCA agent, EU notice and
  action, deletion and export. It needs a new decision (draft D32 below) that narrows AGENTS.md's "no server stores user
  data" rule for this one opt-in, time-limited service.
- Naming: rename to **Cloud Sync**, and list the server as a destination named **PixelDoll (preview)**.

## 1. Engine against a server-backed provider

### What the engine assumes (from the code)

- `app/src/lib/sync/providers/types.ts`: a provider is `list(prefix) / get(path) / put(path, bytes) / del(path) /
destroy()` over a flat, path-addressed folder. Every file is immutable (content-named) or single-writer
  (`devices/<device>.json`), so **no compare-and-swap is ever needed**. Errors map to `SyncErrorCode`
  (`offline`, `reconnect`, `cloud-full`, `update`, `missing`, `failed`).
- `app/src/lib/sync/core/engine.ts`: pull reads changed `devices/*.json` (by etag), then the head revisions it lacks;
  reconcile merges heads three ways; push uploads packs, objects, revisions, then this device's heads file last.
  `EngineOptions.writes: false` already exists (read-only import), and `account` already forces a full re-upload on a
  provider switch.
- `app/src/lib/sync/client.ts`: triggers are open, visible, `online`, 3 s after a save (`AFTER_SAVE_MS`) and 60 s while
  visible (`INTERVAL_MS`); one syncing tab per browser via the `pixeldoll-sync` Web Lock.

Conclusion: a `PixelDollServer` provider (a new `ProviderKind`, e.g. `'pixeldoll'`) slots in beside Google Drive and
Dropbox. Nothing in `core/` changes. Teammates are just more devices: each writes only its own heads file, so the
single-writer rule still holds with many people.

### Minimal server API

One root per library. All routes need a session and a membership check.

| Route                                                     | Maps to   | Server rules                                                                                                                                                                                                                        |
| --------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/libraries/:lib/list?prefix=p/`                   | `list`    | One level, every page in one response (or a cursor). Returns `{path, size, etag}`; etag = stored object's hash or version                                                                                                           |
| `GET /v1/libraries/:lib/files/*path`                      | `get`     | 404 maps to `null`. Served as `application/octet-stream`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`                                                                                                      |
| `PUT /v1/libraries/:lib/files/*path`                      | `put`     | Editor or owner only. Path must match the engine's grammar (lowercase hex, digits, dots, dashes, slashes; known top-level folders). Content-named files are write-once. `devices/<id>.json` is bound to the first user who wrote it |
| `DELETE /v1/libraries/:lib/files/*path`                   | `del`     | Editor or owner; missing is not an error                                                                                                                                                                                            |
| `DELETE /v1/libraries/:lib`                               | `destroy` | Owner only ("Delete cloud copy")                                                                                                                                                                                                    |
| `GET /v1/libraries/:lib/live` (WebSocket)                 | (new)     | Sends `{changed: true}` after another member's successful `PUT` of a `devices/*.json` file (the last step of every push)                                                                                                            |
| `/v1/auth/*`, `/v1/me`, `/v1/libraries`, invites, members | (new)     | Sign-in, session, library list, membership; see sections 2 and 3                                                                                                                                                                    |

Storage: objects in a bucket keyed `libraries/<lib>/<path>`; a small database for users, libraries, members, invites,
usage counters. One Durable Object per library is a natural fit for the WebSocket fan-out: Cloudflare's WebSocket
Hibernation API keeps sockets open while the object is evicted from memory, which cuts duration charges
([Cloudflare docs](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)), and Durable Objects
are on the Workers Free plan with SQLite storage only, 5 GB per account
([changelog 2025-04-07](https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/),
[limits](https://developers.cloudflare.com/durable-objects/platform/limits)). Prices are the other note's job.

### Near real time: two levels

| Level                            | What it gives                                                                                                                        | Cost                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Change ping** (recommended) | Teammate sees a saved change in roughly 1 to 3 s: save, debounce, push, ping, pull. Works offline-first; polling stays as a fallback | One socket per open library; the client calls `syncNow()` on a ping. Set the save debounce to about 1 s for this provider. Small client change, no engine change                           |
| B. Live co-editing               | Keystroke-level merges, cursors, presence, shared undo                                                                               | Replace the manifest store with a CRDT (Yjs about 30 kB; Automerge measured at 1,117 kB WASM in `docs/research/2026-11-22-storage-sync/README.md`), a relay server, and new conflict rules |

Figma, the reference for live design tools, is not a true CRDT either: a central server orders edits and the last
write to a property wins ([Evan Wallace, 2019](https://madebyevan.com/figma/how-figmas-multiplayer-technology-works/)).
For PixelDoll, level B buys little: the unit of work is an item (layer artwork plus metadata that must match it), and
items are produced by minutes-long generation jobs, not keystrokes. Level A plus a "presence-lite" hint over the same
socket ("Alex is editing Knight") covers the realistic team case.

### What the per-item merge cannot do (`core/merge.ts`)

- **Same item, same moment:** two different edits to one keyed element (one item, one outfit) are a conflict. Side A
  (ordered by revision id, so deterministic, not "latest") stays live and both values are kept as a conflict note.
  Nothing is lost, but there is no field-level mix and no "who was last" intuition.
- Non-keyed arrays are atomic: concurrent changes to one are always a conflict.
- No awareness: users cannot see that someone else is mid-edit, so conflicts are discovered after the fact.
- A remote change to a character that is busy (generation work or unsaved edits) waits (`Library.apply` returns false
  until `studioHooks.mayWrite`), so "live" stops while a job runs.
- PixelLab jobs are per user's own token and are never synced (`LOCAL_FIELDS` strips `creationSpec`, `moveRecovery`,
  `moveReviews`, `stateGeneration`); a teammate sees the finished item, not the job.

Mitigation without a CRDT: a soft "editing" lease per character broadcast on the socket, shown as a badge, never a hard
lock. Measure the conflict-note rate in the preview before considering level B.

## 2. Shared libraries

### Model

- **Library**: a set of characters with one remote root. Every user has a **Personal** library; teams add more.
- **Roles**: owner (invite, change roles, delete library, transfer ownership), editor (read and write), viewer (read
  only, enforced by the server refusing `PUT`/`DELETE`; the client runs the engine with `writes: false`). Obsidian's
  shared vaults show the simpler extreme: up to 20 collaborators, all with owner rights except inviting
  ([Obsidian Help](https://obsidian.md/help/sync/collaborate)). Three roles are enough; skip custom permissions.
- **Invite links**: random 128-bit token, role-bound, expires (7 days default), optionally single-use, stored hashed,
  revocable from the members list. Joining requires signing in; an invite never grants anonymous access.
- **Revoke**: the server deletes the membership, closes that user's sockets and refuses their requests at once.
- **Local copy after removal**: a client-side app cannot claw back what was downloaded. Be honest about it at invite
  time ("People you invite can keep copies of what they download"). On the next sync, the removed member sees "You no
  longer have access to <Team>" with two choices: **Keep a copy in Personal** (detached, stops syncing) or **Remove
  from this device**. Figma-style revocation is only possible because Figma keeps no full offline copy.

### How libraries coexist in the app

Today the working copy is one IndexedDB database with a fixed name (`const DB = 'pixeldoll'` in
`app/src/lib/store/db.ts`) and the engine syncs every Studio character in it.

| Option                                                  | Pros                                                                                                                                    | Cons                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **One active library, one database each** (recommended) | Engine and `pixeldoll.ts` unchanged; removal or leaving deletes one database; clear mental model (Obsidian vaults, Figma team switcher) | `db.ts` needs a library-scoped database name; switching reloads the Studio; no mixed view                |
| Several libraries mixed in one database                 | One list of everything                                                                                                                  | Every character needs a library tag; the engine must filter per provider root; removal must find records |

Recommendation: a library switcher (Personal plus team names) near the character list, one active at a time. "Copy to
<library>" moves a character between them as a new character. Unverified: the cost of making `db.ts` and the
`pixeldoll-storage` presence lock library-scoped; inspect before planning.

### Mapping to a shared repo or folder later

The remote layout is already provider-neutral, and each device writes only its own heads file, so any shared store
with `list/get/put/del` works:

- **GitHub**: a library is a repo; members are collaborators; read, write and admin map to viewer, editor, owner; invites
  and revocation are GitHub's.
- **Shared folder**: members of a Dropbox or Drive shared folder. **Unverified**: Drive's `drive.file` scope may not see
  a folder another user created without the Google Picker, and a Dropbox app folder may not be shareable; check before
  promising this.

## 3. Accounts and auth

- **No passwords.** Offer **Sign in with Google** and **Sign in with GitHub** first (the audience is game developers);
  add **email magic link** later for people with neither (needs a transactional email sender, a new subprocessor).
  Passkeys are a good later addition but need an email for recovery anyway.
- **Server-side code exchange.** Google web clients need the client secret for the code exchange (decision log 2, item
  1, `docs/handoff/cloud-save/decisions.md`). Unlike the D31 endpoint, this server is allowed to keep state, so it does
  the exchange, reads the verified email from the id token, and keeps no provider tokens beyond sign-in. Request only
  `openid email` from Google and `read:user user:email` from GitHub; never Drive scopes.
- **Sessions in a browser-only app.** Host the API on a subdomain of the app's own domain (for example
  `sync.pixeldoll.app`), so it is same-site with `pixeldoll.app` and a `HttpOnly; Secure; SameSite=Lax` session cookie
  works without third-party cookies; the WebSocket upgrade carries it too. Add CSRF defense (Origin allow-list plus a
  custom header on writes). Fallback if cookies prove fragile on iOS Home Screen apps (unverified): a device-held
  refresh token behind the existing `TokenSource` contract, like Dropbox today. Sessions last 90 days, sliding, listed
  in account settings with "Sign out everywhere".
- **Relation to D31.** Keep the D31 token Worker (`services/sync-token/`) separate and untouched, so its "stores and logs
  nothing" promise stays auditable. The new service is its own deployment with its own data. They may share the Google
  OAuth client (another redirect URI) and Cloudflare account. The PixelLab token never goes to either.

## 4. Abuse, quotas and safety

- **No public links in the preview.** Every read requires a signed-in member, which removes the main file-hosting abuse
  vector (anonymous sharing of arbitrary files).
- **Quotas** (starting values, tune with the price note): per-user owned storage cap (for example 1 GB), library
  member cap (for example 10), pack size at most 4 MiB (`PACK_LIMIT`), request and byte rate limits per user and per IP,
  daily upload byte cap. Over cap maps to the existing `cloud-full` error, so no new UI state.
- **Upload validation** (only what the engine produces): path grammar and known folders; size limits per kind;
  `*.json.gz` must gunzip to JSON under a size cap; `packs/*.zip` must be a stored ZIP whose entries are only
  `<64 hex>.png` with a PNG signature and sane IHDR size; content-named files are checked against their name where the
  hash is over the stored bytes. Full PNG decode is optional (CPU limits); the client already verifies every cell by
  pixel hash before use.
- **Serving**: never as a renderable type, separate origin from the app, `nosniff`, `attachment`.
- **Reporting**: a "Report content" address and form, a documented response time, and a takedown tool that can disable
  a library. US providers must report apparent child sexual abuse material they know of to NCMEC's CyberTipline
  ([18 U.S.C. 2258A](https://www.law.cornell.edu/uscode/text/18/2258A)).
- **End-to-end encryption**: better privacy, but blocks server-side validation and moderation. Not for the preview;
  record as a decision.
- **Account deletion**: one click in Settings; deletes owned libraries (after warning members or offering an ownership
  transfer), memberships, sessions and usage rows at once, and bucket objects within a stated window (for example 30
  days for backups).

## 5. Privacy, legal and policy

### What the owner takes on (verify with a lawyer)

- **Controller of personal data**: email, provider user id, IP addresses in rate limits, and user artwork. Needs a
  privacy policy section (what, why, where, how long, subprocessors such as Cloudflare), terms of service for the
  service (preview, no warranty, a narrow license to store and transmit content, acceptable use, termination), and an
  age floor (13+; some EU states set 16 for consent-based processing, unverified whether it applies here).
- **GDPR rights**: access and portability (the backup ZIP plus an account JSON), erasure (account deletion), and data
  location stated (an EU jurisdiction setting for storage is worth checking in the price note; unverified).
- **CCPA** likely does not apply to a free app: its revenue threshold is $26,625,000 from 2025
  ([CPPA](https://www.cppa.ca.gov/regulations/cpi_adjustment.html)); the other prongs (data of 100,000 consumers,
  selling data) are unverified here. Honoring deletion and export for everyone costs nothing extra.
- **DMCA safe harbor** for user-stored content needs a designated agent with the US Copyright Office: $6 per filing,
  renewed every three years ([Federal Register 2016](https://www.govinfo.gov/content/pkg/FR-2016-11-01/html/2016-26257.htm);
  fee unverified for 2026), plus a takedown and repeat-infringer policy.
- **EU Digital Services Act**: a hosting service needs a point of contact and a notice-and-action mechanism (Art. 16)
  with statements of reasons; the micro and small enterprise relief covers the online-platform section, not Art. 16
  (secondary sources, e.g. [Cooley](https://www.cooley.com/services/practice/european-tech-regulation/digital-markets-competition-consumers/the-digital-services-act/future-act);
  check EUR-Lex). Private team libraries are hosting, not public dissemination, which keeps it out of the platform
  section (unverified).

### Rules that must change

- PLAN.md D1: "No backend, ever (except D31's stateless OAuth token endpoint)."
- PLAN.md D31: "Everything else stays client-side."
- AGENTS.md Rules: "Keep the app client-side ... no server stores user data, artwork, tokens or logs. The sole exception
  is a stateless OAuth endpoint ... add no other server code, route or analytics."
- Also the "no backend" statements D31 lists in PRODUCT.md, README.md and docs/architecture.md.

Draft decision:

> D32 (date, user): narrows D1 and D31 for one opt-in preview service. PixelDoll stays client-side by default: local
> IndexedDB is the primary copy and every feature works without an account. Users may opt in to "PixelDoll (preview)"
> sync, a server run by the maintainer that stores only the files the sync engine writes (character data and artwork),
> sign-in identity, team membership and usage counters, to sync devices and share libraries with teammates. It never
> receives PixelLab tokens or other credentials, runs no analytics and keeps request logs only as long as rate limiting
> needs. It is temporary: it carries a published end date, gives at least 60 days' notice before shutdown, offers
> one-click moves to Google Drive, Dropbox or a backup file, and deletes all stored data within 30 days after shutdown.
> The D31 token endpoint stays separate and stateless.

AGENTS.md Rules wording: "Keep the app client-side: PixelLab calls go browser-direct with the user's own token. Server
code is limited to the D31 stateless OAuth endpoint and the opt-in D32 preview sync service; neither may store
PixelLab tokens or add analytics, and no other server code or route may be added."

### Cleanest temporary preview

- **Labeling**: the destination reads "PixelDoll (preview)" with "Available until <date>" under it, and a one-line
  disclosure before connecting: "Stored on the PixelDoll server until <date>. Your work also stays on this device."
- **Removable at any time**: "Delete from server" per library (the existing `destroy()`), "Delete account", and
  "Disconnect" (stop syncing, keep local).
- **Moving out is one click** because local is complete: connecting Google Drive or Dropbox is already a provider
  switch that re-uploads everything (engine `account` state). Team libraries move to a shared folder or repo once
  section 2's mapping exists; until then each member keeps a full local copy and can export the backup ZIP.
- **Shutdown sequence**: in-app banner and email at 60 and 14 days; new sign-ups closed at notice; read-only 7 days
  before (sync pulls only, so everyone converges); after the end date, the app hides the destination and shows "Move
  your work" until the user connects elsewhere; all server data deleted 30 days later. Accounts inactive for 180 days
  get one email, then deletion.
- **Kill switch**: the app reads the service status from the server itself; an unreachable or "closed" server never
  blocks local work (it maps to `offline` today).

## 6. Naming

| Product  | Term                                                                                                                          | Lesson                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Steam    | "Steam Cloud"; setting "Enable Steam Cloud synchronization" ([Steamworks](https://partner.steamgames.com/doc/features/cloud)) | Players say "cloud saves" for game state the cloud holds                        |
| Obsidian | "Obsidian Sync", "shared vaults" ([help](https://obsidian.md/help/sync/collaborate))                                          | Local-first notes app; "Sync" names the device link, sharing is a vault feature |
| Apple    | "iCloud", per-app "Sync this iPhone" (unverified current wording)                                                             | The brand is the place, the verb is sync                                        |
| Figma    | No sync name; "Share", teams, multiplayer                                                                                     | Cloud-native apps name sharing, not storage                                     |
| Aseprite | No built-in cloud (unverified for 2026); files on disk                                                                        | The closest pixel-art tool leaves sync to the user                              |

"Cloud Save" suggests the cloud holds the work, which is backwards for PixelDoll (local first) and fits single-player
game saves. "Sync" alone is vague in Settings. "Cloud & Teams" couples a permanent feature to a temporary service.

**Recommendation: "Cloud Sync"**, with destinations "Google Drive", "Dropbox" and "PixelDoll (preview)". Team features
live on the library switcher ("Share", "Members"), not in the section name, so they survive a server shutdown or a move
to GitHub or shared folders. Rename the `cloudSave` locale keys and docs in one change (unverified: no other feature
uses the term).

## Phased plan (smallest useful first)

1. **Decide and rename (no server).** Owner approves D32 and the rule changes; rename Cloud Save to Cloud Sync. Draft
   privacy policy, terms and shutdown policy; file the DMCA agent before any user content is stored.
2. **Personal server sync.** New service (separate from the D31 Worker): Google and GitHub sign-in, session cookie on
   a `pixeldoll.app` subdomain, per-library `list/get/put/del/destroy`, validation, quotas, account deletion and export.
   Client: a `'pixeldoll'` provider and Connect entry. Engine unchanged. Proves the preview with one user and several
   devices.
3. **Change ping.** One Durable Object per library with hibernating WebSockets; ping after a heads-file `PUT`; client
   calls `syncNow()` and uses a 1 s save debounce for this provider. Polling stays.
4. **Team libraries.** Library-scoped local databases and a switcher; members, roles, invites, revoke; viewers run
   `writes: false`; removal flow (keep a copy or remove); presence-lite "editing" badges over the socket.
5. **Exit paths.** "Move to Google Drive or Dropbox" polish, shutdown banner and read-only mode, automatic deletion;
   then the same team model over a shared GitHub repo or shared folder.
6. **Only if measured conflicts warrant it:** field-level merge for specific item fields, or a CRDT for live editing.
