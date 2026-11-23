# GitHub as a team library and an export destination

Research notes, 2026-11-23. Docs only; no accounts, apps, tokens or authenticated calls were made. "Unverified" marks
claims that come from memory, third-party sources or inference and need a live check before we build on them.

Scope: (a) a team library shared by repo collaborators, synced in batched commits, reusing the Cloud Save engine
(`docs/architecture/cloud-save.md`, `app/src/lib/sync/providers/types.ts`); (b) "Commit to GitHub" as an Export
destination next to Download ZIP, reusing `exportFiles()` in `app/src/lib/export/export.ts` (it already returns
`entries: ZipEntry[]` before zipping, so no export logic changes).

## 1. GitHub App vs OAuth App

|                                    | GitHub App                                                                 | OAuth App                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Permissions                        | Fine-grained: `Contents: read and write` (plus mandatory `Metadata: read`) | Coarse `repo` scope: every repo the user can reach, including private, plus more than contents |
| Repo selection                     | Installer picks "All" or "Only select repositories"                        | None; all repos the user can access                                                            |
| Token                              | User access token expires after 8 h; refresh token lasts 6 months          | No expiry until revoked                                                                        |
| Survives installer leaving the org | Yes                                                                        | n/a                                                                                            |

Sources: [Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app),
[Generating a user access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).

**Pick a GitHub App.** It is the only option that limits PixelDoll to the repos a team chose, which matters because the
token sits in a browser.

- **Installation.** Anyone can install on their personal account. Organization owners install for the org. Members and
  outside collaborators can pick the org during setup, which sends the owner an install request. Repo admins can install
  for repos they administer only if the app asks for no org permissions and not "Repository administration", and owners
  can block that. ([Installing a GitHub App from a third party](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party))
- **Collaborators.** A user access token is the intersection of what the user can do, what the app may do, and the
  accounts where the app is installed ([Authenticating on behalf of a user](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user)).
  So once the repo owner installs the app on that repo, a collaborator only has to authorize the app (the normal sign-in);
  they never install anything. A collaborator cannot install the app on someone else's personal account.
  Unverified: the doc does not say outright that the installation's "selected repositories" also narrow user tokens; I
  believe they do (`GET /user/installations/{id}/repositories` lists exactly that set). Check on a test install.
- **Commits as the user.** Yes. The Git Data endpoints for blobs, trees, commits and ref updates all accept user access
  tokens (UAT) with `Contents: write` ([Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)).
  `PATCH git/refs` has an "additional permissions" mark; likely `Workflows: write` when the change touches
  `.github/workflows/` (unverified), which we never write. GraphQL `createCommitOnBranch` "appends a commit ... as the
  authenticated user" ([Commits reference](https://docs.github.com/en/graphql/reference/commits)).
- **Token exchange from the browser.** The web flow supports PKCE (S256 only) but still requires `client_secret` for both
  exchange and refresh; only the device flow skips it ([Generating a user access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)).
  `github.com/login/oauth/access_token` does not send CORS headers. GitHub's docs do not say so; community reports
  agree ([Stack Overflow mirror](https://kaweah.freedombox.rocks/kiwix/content/stackoverflow.com_en_all_2023-11/a/42150336),
  [github-oauth-proxy](https://github.com/octocus/github-oauth-proxy)). Either way the secret forces a server step, so
  the existing `services/sync-token/` Worker gets a `github` provider for `/exchange` and `/refresh`. Revoke is
  `DELETE /applications/{client_id}/grant` with Basic auth (client id and secret), so it also goes through the Worker
  (unverified endpoint shape; check the REST "OAuth authorizations" docs).
- **REST from the browser.** The REST API "supports CORS for AJAX requests from any origin" and exposes `ETag`, `Link`
  and `x-ratelimit-*` headers ([Using CORS](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)).

## 2. Batched commits from the browser

### REST Git Data sequence (one commit for N files)

1. `GET /repos/{o}/{r}/git/ref/heads/{branch}` gives the head commit H. The base tree needs H's tree SHA: either
   `GET /repos/{o}/{r}/git/commits/{H}` (one more request) or a single `GET /repos/{o}/{r}/branches/{branch}`, which
   returns both (and a `protected` flag).
2. `POST /git/blobs` once per binary file, `{ content: base64, encoding: "base64" }` ([Blobs](https://docs.github.com/en/rest/git/blobs)).
   Text files (JSON) can skip this: tree entries accept inline `content` (UTF-8 text only).
3. `POST /git/trees` with `base_tree: <H.tree>` and the changed entries. Without `base_tree` every unlisted file is
   deleted; `sha: null` deletes one path, and deleting a missing path is an error ([Trees](https://docs.github.com/en/rest/git/trees)).
4. `POST /git/commits` with `tree` and `parents: [H]`.
5. `PATCH /git/refs/heads/{branch}` with the new commit and `force: false`, which "make[s] sure the update is a
   fast-forward" ([Refs](https://docs.github.com/en/rest/git/refs)).

Cost: **B + 4 requests** (B = binary files; branch endpoint for step 1), of which B + 3 are POST/PATCH. A sync batch
is small because the engine already bundles PNGs into ZIP packs of up to 4 MB: a typical push is 1 to 3 packs plus inline
JSON, so about 5 to 7 requests. An export of 40 PNGs is 44 requests.

Blob size: GitHub blocks files over 100 MiB and warns over 50 MiB ([About large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github));
`GET` blob supports up to 100 MB. No documented limit on `POST /git/blobs` or on REST request body size (unverified;
base64 adds 33%, so keep each request well under 100 MB; our 4 MB packs are far below).

### Non-fast-forward and retry

The ref update rejects a non-descendant commit with **422** (the docs list only "Validation failed"; the message
"Update is not a fast forward" is from memory, unverified). Retry: re-read the branch head H', create a new tree with
`base_tree: H'.tree` and the same entries (blobs already exist, so they are not re-uploaded), a new commit with parent
H', and PATCH again. Cost per retry: 4 requests. For sync this "rebase" can never conflict, because every remote path is
immutable or single-writer; a three-way merge of library content stays in the engine. Cap retries (for example 3, with
jitter) and report "offline/busy" after that.

### Polling and rate limits

- A conditional request that returns 304 "does not count against your primary rate limit" when authenticated
  ([Best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)). Poll
  `GET git/ref/heads/{branch}` with `If-None-Match`; a 60 s poll is free while nothing changed.
- Primary: 5,000 requests/h per user, shared by all of that user's apps and PATs. Secondary: 100 concurrent; 900
  points/min REST (GET 1, POST/PATCH/PUT/DELETE 5); 80 content-generating requests/min and 500/h
  ([Rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)). Docs advise serial
  requests and about 1 s between mutating ones. Unverified: whether blob/tree/commit creation counts as
  "content-generating". Assume it does: an 80-file export at full speed could trip the per-minute limit, so pace POSTs.

### GraphQL `createCommitOnBranch`

Input: `branch`, `message`, `expectedHeadOid` (must equal the branch head, else the mutation fails), `fileChanges`
with `additions { path, contents: Base64String }` (full contents, replaces existing) and `deletions { path }`
([Commits reference](https://docs.github.com/en/graphql/reference/commits); field details via a schema mirror,
[JSR github-schema FileAddition](https://jsr.io/@luxass/github-schema/doc/github-schema/~/FileAddition)). Binary works
(base64). Cost: 1 mutation plus 1 head query, no per-file requests; commits are signed and show as Verified (unverified
for UAT). Limits: none documented for payload size; GraphQL has a per-request timeout and CPU limits (60 of 90 CPU s per
minute), so a big payload is the risk (unverified exact cap). Cannot delete a folder by path; every file must be listed.

**Use REST Git Data as the primary path** (documented, handles any size by blobs, reuses blobs on retry). GraphQL is a
good fit for small exports; one code path is simpler (KISS), so pick REST unless measurement shows request count hurts.

## 3. Fit with the existing remote layout

- History grows forever. Every pack, object and rev stays reachable in history even after `del`. GitHub recommends
  repos "ideally less than 1 GB, and less than 5 GB is strongly recommended" ([About large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)).
- **Git LFS: avoid.** Free accounts get 10 GiB storage and 10 GiB bandwidth per month; over the bandwidth quota without
  payment, LFS is disabled until next month ([Storage and bandwidth](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-storage-and-bandwidth-usage)),
  which a team syncing every 60 s could hit. The batch endpoint (`<repo>.git/info/lfs/objects/batch`) uses custom
  content types, so it needs a preflight; nothing documents CORS for it on github.com, and I expect it is not supported
  (unverified). Would also need Worker proxying of bulk bytes, which D31 forbids.
- **Data branch vs folder vs separate repo.** A default `git clone` fetches every branch, so a `pixeldoll-data` orphan
  branch inside a game repo still makes every clone download all library history (inference from git behavior,
  unverified for GitHub-specific settings). A folder on `main` is worse (pollutes the game's history and diffs).
  **Recommend a dedicated library repo** (for example `acme/pixeldoll-library`), default branch `main` holding the sync
  layout at the root, same paths as Drive. Allow the data-branch option only if a team insists on one repo.
- **Retention.** Add a "compact" step when history passes a threshold (for example 500 MB, readable from
  `GET /repos/{o}/{r}` `size` in KB, unverified freshness): (1) engine repacks live cells into new packs and drops
  unreferenced packs, objects and old revs, (2) write a single orphan commit (`parents: []`) holding the current tree,
  (3) `PATCH` the ref with `force: true`. Every writer must then treat its cached head as gone and re-list (a forced ref
  is visible as a non-ancestor head). GitHub only reclaims storage after its own garbage collection and keeps
  unreachable objects for a while; there is no API to trigger GC (unverified; support can run it). Squash rewrites
  history, so it needs an admin or owner action with a clear warning, never automatic.
- **Game repo gets usable assets separately** through Export to GitHub (section 6): one readable commit of the engine
  export into a chosen folder of the game repo. The library repo never mixes with the game repo.

## 4. Pull requests

- **Library sync: no PRs.** Content merges happen in the engine; a PR of ZIP packs and gz JSON is unreviewable.
  Direct commits to the library branch.
- **Export to GitHub: PR when the target is protected or the user asks for review.** `GET /branches/{b}` returns
  `protected`. Flow: create branch `pixeldoll/<character>-<timestamp>` (`POST /git/refs`, 1), commit there (B + 3),
  `POST /repos/{o}/{r}/pulls` with `head` and `base` (1, needs `Pull requests: write`)
  ([Pulls](https://docs.github.com/en/rest/pulls/pulls)). So the PR costs 2 extra requests and one more app
  permission. Merging stays on github.com (keep it out of the app).
- On GitHub Free, protected branches on private repos are a Team feature ([Plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)),
  so many Free teams cannot enforce review; offer the PR option anyway as a choice.

## 5. Limits that bite teams

- Rate limits are per user, so a team scales linearly; each member has their own 5,000/h and 80 creates/min. A single
  tab syncing every 60 s with ETag polling uses almost nothing; the existing one-syncing-tab Web Lock keeps it that way.
- Repo storage: no hard cap below the 1 GB / 5 GB guidance; private repos on Free orgs are unlimited in count with
  unlimited collaborators ([Plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)).
- 8 h tokens: refresh through the Worker; refresh tokens last 6 months. Unverified: refresh tokens rotate on use (store
  the new one each time; a lost race between tabs would log the user out, the Web Lock prevents that). The app setting
  can opt out of expiring tokens, but do not: short tokens are the point in a browser.
- No push access: personal-account repos only have write collaborators; org repos can grant Read. `GET /repos/{o}/{r}`
  returns `permissions.push` for the user (unverified field for UATs; check). Show the library read-only ("You can view
  this library; ask its owner for write access") and never queue local edits for push. A repo without the app installed
  returns 404/403 ("Resource not accessible by integration"); show "Ask <owner> to install PixelDoll on this repo" with
  the install link.
- Org app approval: members can only request; until an owner approves, the library cannot connect.

## 6. Export to GitHub specifics

- One commit with all files from `exportFiles().entries` into `<folder>/` on `<branch>`.
- **Clean overwrite.** Do not enumerate old files. Build the export subtree without `base_tree` (only the new files),
  then create the root tree with `base_tree: H.tree` and one entry `{ path: "<folder>", mode: "040000", type: "tree",
sha: <subtree> }`. This replaces the whole folder, so removed files disappear and nothing outside the folder changes.
  Unverified: nested `path` with a tree entry in create-tree. Fallback: `GET /git/trees/{H.tree}?recursive=1` (limit
  100,000 entries / 7 MB, check `truncated`), then `sha: null` for every old path under the folder.
- Skip the commit when the new root tree SHA equals H.tree (nothing changed).
- Sizes: per-file 100 MiB block, 50 MiB warning; exports are spritesheets in the KB to low-MB range. Guard: refuse files
  over 50 MiB and warn when the total passes 100 MB (suggest Download ZIP).
- Never write into `.github/`; restrict the folder picker to a path under the repo root without `..`.
- Commit message: `chore(pixeldoll): export <character> for <engine>` (plain, customizable later if asked).

## Recommended design

### Team library

1. Register one GitHub App "PixelDoll": repository permissions `Contents: read and write`, `Metadata: read`,
   `Pull requests: write` (for Export PRs only); user-to-server tokens with expiry on; no webhooks; callback
   `https://pixeldoll.app/`.
2. Extend `services/sync-token/` with a `github` provider for `/exchange`, `/refresh` and `/revoke` (client secret in a
   Worker secret); the browser does PKCE and calls REST directly.
3. Add a `github` provider kind whose `put`/`del` stage into a pending batch and whose new `flush()` writes one commit
   with the REST sequence above; `list`/`get` read from the cached tree of the last fetched head. The engine's push
   (artwork, items, revisions, heads) becomes one atomic commit. This needs one small engine hook (flush after push).
4. Library = a dedicated repo chosen in Settings ("Pick a repo the PixelDoll app can access"), sync layout at the root
   of its default branch.
5. Poll the ref every 60 s while visible with `If-None-Match`; on change, read the tree and pull.
6. On 422 non-fast-forward, rebase the staged entries onto the new head and retry up to 3 times with jitter.
7. Read-only when `permissions.push` is false; clear messages for "app not installed" and "awaiting org approval".
8. Owner-only "Compact library" (repack plus orphan commit plus forced ref) when size passes a threshold, with a warning.

### Export to GitHub

1. In the Export sheet, keep the format picker; the destination becomes Download ZIP (default) or Commit to GitHub.
2. Commit to GitHub asks for repo (from the app's accessible repos), branch (default branch preselected) and folder
   (default `pixeldoll/<character>`), remembered per character.
3. Build entries with `exportFiles()`, upload binary blobs serially with pacing, inline JSON/text in the tree, replace
   the folder as one subtree, commit, fast-forward the ref.
4. If the branch is protected or the user picks "Open a pull request", commit to a new branch and open a PR; show the
   link.
5. Show the commit or PR link in the success toast; map 403/404/422 to localized, actionable messages.

## Open questions

- Do user tokens obey the installation's "selected repositories"? (Expected yes; test.)
- Exact 422 body for non-fast-forward, and whether git blob/tree/commit creation counts as content-generating.
- Do GitHub refresh tokens rotate on every refresh? Affects Worker and storage handling.
- Does create-tree accept a nested `path` for a `040000` tree entry (folder replacement), or must we nest manually?
- REST request body cap for `POST /git/blobs`, and GraphQL payload cap for `createCommitOnBranch`.
- Is the single-library-repo model acceptable to the owner, or must the data live inside the game repo?
- Should one GitHub sign-in serve both features (one app, `Pull requests: write` asked up front) or ask for it only
  when a user first opens a PR? GitHub Apps cannot ask for permissions incrementally per user, so up front is simpler.
- Is the GitHub provider a third Cloud Save provider for personal backup too, or team libraries only? (Personal backup
  is already covered by Drive and Dropbox; KISS says team only.)
