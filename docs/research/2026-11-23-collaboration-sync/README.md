# Collaboration and sync destinations: research

Written 2026-11-23 after the owner asked for collaboration, an opt-in PixelDoll server and GitHub. **This is
brainstorming and research, not a plan.** Nothing here is planned or approved, and v1 Cloud Save
([plan](../../handoff/2026-11-22-cloud-save-autonomous-plan.md)) is unchanged. Read
[Owner feedback](#owner-feedback-2026-11-23) first: it parks the PixelDoll server. Prices and limits were checked on 2026-11-23; claims marked unverified in the notes must be rechecked
before code depends on them.

The full notes are:

- [notes/hosting.md](notes/hosting.md): hosting options for a PixelDoll server, with prices, reliability and speed
- [notes/server-design.md](notes/server-design.md): server API, teams, accounts, safety, legal obligations and naming
- [notes/github.md](notes/github.md): GitHub team library and Export to GitHub

## Summary

| Question                               | Answer                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                                   | Rename **Cloud Save** to **Cloud Sync**. The working copy stays on the device, and sync describes both devices and teams.                       |
| Collaboration through Drive or Dropbox | Not with the current least-privilege permissions. Shared folders need broader access, which means Google's paid audit or full-Dropbox access.   |
| The sync engine                        | It already merges several writers, so teammates count as extra devices. A new destination is a new provider. The engine itself does not change. |
| Near real time                         | Not needed now: the client's own checks bring teammates' edits within about a minute. A server change ping could cut that to seconds later.     |
| Opt-in PixelDoll server                | Parked. Hosting other people's files brings legal duties the owner does not want.                                                               |
| GitHub                                 | A GitHub App with batched commits to a separate library repo. Export to GitHub is a destination in the Export sheet, not a new format.          |

## Owner feedback (2026-11-23)

### No legal obligations: the PixelDoll server is parked

The owner wants no legal obligations or responsibilities. Hosting other people's images on the owner's server
cannot avoid them. The duties that come with it include:

- a privacy policy and terms of service
- deletion and export requests
- takedown handling
- the duty to report illegal content

This is not legal advice, but no hosting choice removes those duties. Section 2 stays as research only. Do not build
it unless the owner reverses this.

What keeps the owner out of hosting:

- **Destinations the user owns: their own Google Drive, Dropbox or GitHub.**
  - Files go straight from the browser to the user's own account.
  - The provider hosts the files and handles abuse under its own terms.
- **The D31 token Worker stays as it is.** It only passes sign-in tokens through and stores nothing.

### No change ping for now

Nobody is known to collaborate yet. The client already checks for changes by itself (on open, on return to the tab,
and every 60 s), so teammates' edits arrive within about a minute with no server. Durable Objects or WebSockets are
only worth revisiting if real teams find a minute too slow.

### Why a server needs gatekeeper code

The owner asked whether static storage with per-account folders, keyed by the sign-in email, could replace server
code. It cannot. The client can never be trusted, so anyone could edit the app to read or overwrite another person's
folder.

- **What the gatekeeper does:** on every request it checks the sign-in and allows only that person's (or that
  team's) files. That is what makes per-account folders secure.
- **Managed rules instead of code:** Firebase Storage security rules and Supabase row-level security give the same
  protection without a custom server. The owner would still be hosting the files, so the legal point above still
  applies.
- **The user's own cloud needs none of this.** Google, Dropbox and GitHub are the gatekeeper for their own accounts,
  for free.

### Sync timing: room to cut requests

**Today** (`app/src/lib/sync/client.ts`):

| When                                                | What it sends                                                   |
| --------------------------------------------------- | --------------------------------------------------------------- |
| App opens, tab is visible again, connection returns | One check                                                       |
| 3 s after the last save                             | Only what changed (about 15 KB per item) plus new artwork packs |
| Every 60 s while the tab is visible                 | One small listing                                               |
| Tab hidden                                          | Nothing                                                         |

**Already efficient:**

- The whole library is never re-uploaded.
- Artwork is uploaded once, in packs.
- An idle check is one request.

**Ideas to cut requests and bandwidth:**

1. **Back off when idle.** Go from 60 s to about 5 minutes after a few quiet checks. That cuts about 80% of idle
   requests over an 8-hour session (about 480 checks).
2. **Batch steady editing.** Wait about 30 s after a save instead of 3 s, and also sync when the tab is hidden or
   closed.
3. **One file per edit** (for a hosted server only). Bundle the item object and the revision so each edit costs one
   write instead of 2 or 3.

On Drive and Dropbox these requests cost the owner nothing. The ideas mainly save battery, data and provider rate
limits. They would matter for cost only on a hosted server.

## 1. Name: Cloud Sync

- "Cloud Save" suggests the cloud holds your work. In PixelDoll the device holds it, and the cloud is a synced copy.
- "Cloud Sync" covers devices and teammates, matching Steam Cloud synchronization and Obsidian Sync.
- Destinations would read "Google Drive", "Dropbox", "GitHub" and "PixelDoll (preview)".
- Team features (Share, Members) go on the library, not in the section name, so they outlive any one destination.
- Cost: rename the `cloudSave` locale namespace, the Settings section and the docs in one change. This can happen
  before release, since the term has not shipped.

## 2. Opt-in PixelDoll server (parked)

Kept as research. The owner does not want the legal obligations of hosting user files
([Owner feedback](#owner-feedback-2026-11-23)).

### Best host if ever revisited: Cloudflare

Use Workers, R2 storage, Durable Objects (one room per library, with hibernating WebSockets) and D1 for accounts.

| Monthly cost to the owner  | 100 users                                   | 1,000 users | 10,000 users                                                                     |
| -------------------------- | ------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| **Cloudflare**             | **$0** (Free plan stops instead of billing) | **~$6**     | **~$65** (estimated ~$25 to $45 with small JSON in D1 or Durable Object storage) |
| Hetzner server and storage | ~$8                                         | ~$21        | ~$31                                                                             |
| Supabase Pro               | $25                                         | $25         | ~$148                                                                            |
| Firebase (Blaze)           | ~$0.50                                      | ~$7         | ~$140                                                                            |

These figures assume each user stores 30 MB, makes 1,000 edits a month and does one full restore a month, using
WebSockets instead of polling. The math is in [notes/hosting.md](notes/hosting.md#3-cost-model).

|             | Cloudflare                                                                     | Hetzner                                                    | Supabase                | Firebase             |
| ----------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------- | -------------------- |
| Speed       | Edge code worldwide; data in one region per bucket or room                     | One region                                                 | One region              | Multi-region option  |
| Real time   | Built in (Durable Object rooms)                                                | Self-built                                                 | Built in                | Built in (listeners) |
| Reliability | R2 99.9% SLA on paid plans; several outages in 2025 and 2026                   | No published SLA; the owner patches, backs up and monitors | No SLA below Enterprise | Mature SLAs          |
| Bill safety | Free plan cannot bill. The paid plan has no hard cap on R2 or Durable Objects. | Fixed price                                                | Spend cap on by default | No hard cap          |
| Exit        | S3-compatible; same account as the token Worker                                | Plain files                                                | Moderate                | Moderate             |

**Why Cloudflare:** it is free to start and fast worldwide, real time comes built in, the data can be moved out, and
the token Worker already runs there.

**The trade-off:** its outage record. That risk is bounded: a server outage only pauses sync, because every device keeps
the full library. If fixed cost matters more than speed and zero ops, choose Hetzner instead.

### Design

1. **Provider.** A `pixeldoll` provider uses the same list, get, put, del and destroy as Drive and Dropbox, with one
   storage root per library. The server enforces the layout:
   - content-named files can be written once and never changed
   - each `devices/*.json` file belongs to the user who wrote it
   - only PNG packs and gzipped JSON are accepted
2. **Change ping.** After a heads-file write, the library's Durable Object pings connected members, who run the existing
   sync. For this provider the save delay drops from 3 s to 1 s. Polling stays as the fallback.
3. **Accounts.** Sign in with Google or GitHub, with an HttpOnly session cookie on a `pixeldoll.app` subdomain.
   There are no passwords. The D31 token Worker stays separate and stateless.
4. **Teams.** Each library is its own local database, and one library is active at a time.
   - Roles are owner, editor and viewer. Viewers sync read-only.
   - Invite links expire.
   - Revoking access takes effect at once. A removed member chooses "Keep a copy" or "Remove from this device".
5. **Limits the merge keeps.** Two people editing the same item at the same moment produce a kept conflict, not a
   blend. A soft "editing" badge over the socket covers most of this. A CRDT comes only if measured conflicts call
   for it.
6. **Safety.**
   - per-user storage caps and rate limits
   - no public links
   - a way to report content
   - one-click account deletion and export
7. **Temporary by design.** The destination is labeled "PixelDoll (preview)". Shutdown is a 60-day sequence:
   1. notice in the app
   2. read-only mode
   3. one-click move to Drive, Dropbox or a backup ZIP
   4. automatic deletion

   Every device already holds the full library, so a shutdown never loses work.

### What the owner takes on

These are not legal advice. Details are in [notes/server-design.md](notes/server-design.md#5-privacy-legal-and-policy).

- A privacy policy update and terms of service.
- Account deletion and export on request (GDPR and CCPA).
- A DMCA agent registration (about $6 every 3 years), EU notice-and-action, and the duty to report child sexual abuse
  material, because shared content is user content.
- **Proposed decision D32:** an opt-in PixelDoll server may store the libraries of users who choose it. The app stays
  client-side by default, and nothing is stored for anyone who does not opt in. This narrows D1, D31 and the
  AGENTS.md rule "no server stores user data". Draft wording is in the server-design notes.

## 3. GitHub

### Team library (batched, not real time)

1. **GitHub App.** It asks only for Contents read and write, on repos the owner selects. A collaborator signs in and
   installs nothing, but the app must be installed on the repo owner's account or organization.
2. **Token Worker.** Token exchange and refresh go through the D31 Worker. GitHub's token endpoint needs the client
   secret and has no CORS. Users sign in once, and refresh is automatic for about 6 months between uses.
3. **Separate library repo** (for example `my-game-pixeldoll`). Keeping it out of the game repo stops sync history from
   bloating every clone of the game. Git LFS is skipped: it has a bandwidth quota, and browser support is unverified.
4. **Batched commits.** Changes go up as one commit every few minutes or on "Sync now":
   - It costs about 5 to 7 requests, because artwork is already packed in ZIPs. That is far below GitHub's limits,
     which apply per user, so a team scales.
   - If a teammate pushed first, the commit is rebuilt on top of theirs. It never conflicts, because files are
     content-named.
   - Checking for teammates' changes is free when nothing changed.
5. **Read-only members.** A member without push access gets a read-only library.
6. **Compact.** Over time the repo grows. An owner-only "Compact" action repacks the library and squashes history into
   one fresh commit.
7. **Pull requests.** No PRs by default: the merge already combines everyone's work, and a PR per sync would flood
   reviewers. A "review before publishing" option can come later if teams ask.

### Export to GitHub

The Export sheet keeps every format (Godot, Phaser, Unity, Aseprite, PNG and JSON). The last step changes from one
button to two: **Download ZIP** or **Commit to GitHub**, where the user picks a repo, branch and folder.

- The same files the ZIP would hold go up as one commit.
- Re-exporting replaces the folder cleanly, so files that are gone from the export disappear.
- If the branch is protected, it opens a pull request instead.

It uses the same GitHub App and sign-in as the team library. It is useful on its own and can ship first.

## 4. If any of this is pursued

This is a suggested order, not a plan.

1. **Rename to Cloud Sync** before Cloud Save ships. No server is involved.
2. **Tune sync timing** (idle backoff, batched saves).
3. **Export to GitHub.** It is the smallest GitHub step and proves the GitHub App and token flow.
4. **GitHub team library.** It is free for the owner, GitHub handles permissions and hosting, and changes arrive in
   batches.

The PixelDoll server is parked.

## Open questions

1. Rename to Cloud Sync?
2. For a GitHub team library: a separate library repo, or a branch or folder inside the game repo?
