# A3: User-owned storage providers for PixelDoll library sync (browser-only, zero developer cost)

Research date: 2026-11-22. Sources are official docs/pricing pages unless marked **[secondary]** (forum, third-party, SDK docs) or **[unverified]** (could not confirm against a current official page; test before relying on it).

Workload assumed: JSON manifests plus thousands of small immutable PNGs named by SHA-256, 10-500 MB per library, written directly from a static SPA on https://pixeldoll.app with no backend.

---

## 1. Google Drive API v3

**Free storage.** 15 GB per Google Account, shared by Gmail, Drive and Photos. https://support.google.com/googleone/answer/9312312

**Browser/CORS.** Drive REST calls are made from browsers with a bearer token (this is how the official JS/GIS flow works). Media downloads (`files.get?alt=media`) and uploads (`/upload/drive/v3/files`) are also called directly. No API key or secret is needed for user-authorized calls. Neither the uploads guide nor the errors guide says anything about CORS, so this rests on common practice rather than an explicit statement.

**OAuth for a static SPA. This is the weak spot.**
- Google Identity Services (GIS) **token model**: browser-only, returns a short-lived access token (example `expires_in` 3600) and **no refresh token**. To renew, call `requestAccessToken()` again "from a user-driven event, such as a button press". The page describes no silent/no-UI renewal mode. https://developers.google.com/identity/oauth2/web/guides/use-token-model ; https://developers.google.com/identity/oauth2/web/guides/how-user-authz-works
- The overview page says client-side JavaScript apps get no refresh token: "When it expires, the application repeats the authorization process." https://developers.google.com/identity/protocols/oauth2
- The implicit grant endpoints are "strongly discouraged" and "provided only for legacy support". https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
- GIS **code model** (refresh tokens) requires "your platform", a backend, to exchange the code and store the refresh token. https://developers.google.com/identity/oauth2/web/guides/use-code-model
- PKCE without a secret for a *Web application* client: a Google representative stated Google "does not support public applications under the Web Application profile". The token endpoint demands `client_secret` even with PKCE. **[secondary]** https://discuss.google.dev/t/authorization-code-flow-without-client-secret/168113 ; https://ktaka.blog.ccmp.jp/2025/07/oogle-oauth2-and-pkce-understanding.html
- **Net:** without a backend, users get an hourly re-auth popup that needs a user gesture. Long-lived background sync is impossible browser-only.
- Refresh-token rules (relevant only if a backend is ever added): Testing status gives 7-day refresh tokens, a token unused for 6 months dies, and each account/client is capped at 100 tokens (the oldest is silently revoked). https://developers.google.com/identity/protocols/oauth2

**Scopes and verification.**
- `drive.file` (only files the app created or the user opened with it) and `drive.appdata`/`drive.appfolder` (hidden app data folder) are both **non-sensitive**. `drive` and `drive.readonly` are **restricted** and need a security assessment (CASA, annual) if data is stored or transmitted server-side. https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Non-sensitive scopes need only **brand verification**: a homepage on a verified domain, a privacy policy on the same domain, Search Console domain ownership and Google sign-in branding. There is no video and no CASA, and it is free. https://support.google.com/cloud/answer/13464321
- The 100-new-user lifetime cap and the "unverified app" screen apply when *sensitive or restricted* scopes are used unverified. https://support.google.com/cloud/answer/7454865
- **appDataFolder vs portability:** appDataFolder is hidden from the user and from the Drive UI. Only the creating app can access it. Its files cannot be shared, moved or trashed. Users can delete it, and uninstalling the app deletes it. https://developers.google.com/workspace/drive/api/guides/appdata . This conflicts with "storage the user owns and can take elsewhere". **Use `drive.file` with a visible `PixelDoll/` folder instead.** It is still non-sensitive.

**Quotas (changed in 2026, material for zero cost).**
- 1,000,000 quota units/min/project. 325,000 units/min/user/project.
- Unit costs: read 5, list 100, edit/create 50, **download (`alt=media`) 200**.
- **Billing threshold: 400,000,000 units/day/project** ("before charges apply", cannot be raised) and **egress 1 TB/day/project** before charges. "Exceeding the quota request limits is planned to incur charges to your Google Cloud billing account later in 2026", with at least 90 days' notice. Projects created on or after 2026-05-01 get the new quotas. Standard use is "at no additional cost". https://developers.google.com/workspace/drive/api/guides/limits
- Implication: a full restore of a 5,000-PNG library costs 5,000 x 200 = 1M units, so about 400 full restores/day/project fit under the threshold. 1 TB/day egress is about 2,000 restores of 500 MB. Fine at small scale, but at scale **developer billing becomes possible**, which conflicts with the zero-recurring-cost goal. Mitigate with local caching, diffing by manifest and never re-downloading blobs already present.
- Daily upload limit 750 GB/user. Max file size 5 TB. https://developers.google.com/workspace/drive/api/guides/limits

**Uploads.** Simple/multipart is for files of 5 MB or less. Resumable sessions last 1 week and use 256 KB chunk multiples. Pre-generated IDs make retries idempotent (a retry after success returns 409). https://developers.google.com/workspace/drive/api/guides/manage-uploads
**Batch:** up to 100 calls per batch, but **media upload/download is not supported in batch**, and each call counts separately against quota. https://developers.google.com/workspace/drive/api/guides/performance

**Change detection.** `changes.getStartPageToken` plus `changes.list`. `spaces` accepts `drive` and `appDataFolder`, page tokens don't expire, pageSize max is 1000, and `drive.file`/`drive.appdata` tokens are accepted. Whether results are filtered to app-visible files under `drive.file` isn't stated, so test it. There is no long-poll; push notifications (`changes.watch`) need an HTTPS webhook receiver, which means a backend. https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list

**Conditional writes / CAS: none documented.** The `files.update` reference lists no If-Match, ETag or precondition parameter or header. https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update . The v2 to v3 migration dropped `etag` from resources, and an open Google developer forum question (2026) asking exactly this for appDataFolder has no answer. **[secondary]** https://discuss.google.dev/t/google-drive-api-v3-atomic-conditional-updates-in-appdatafolder-with-drive-appdata-scope/410707 . Treat Drive as **last-writer-wins**: read `headRevisionId`/`md5Checksum`/`version` first, but there is a race window.

**Revisions/trash/duplicates.**
- Binary revisions are kept "typically 30 days", or purged earlier once there are 100 revisions. Up to 200 can be marked keepForever, and those count toward storage. https://developers.google.com/workspace/drive/api/guides/manage-revisions . `keepRevisionForever` is available on update. https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update
- Trash is standard Drive trash for `drive.file` files. appDataFolder files cannot be trashed.
- **Duplicate names are allowed.** Files are ID-addressed, so two devices creating `manifest.json` concurrently yields two files. rclone ships `dedupe` for this. **[secondary]** https://rclone.org/commands/rclone_dedupe/ . File IDs are stable. https://developers.google.com/workspace/drive/api/guides/about-files

**Quota errors/reading quota.** `403 storageQuotaExceeded`, `403 userRateLimitExceeded`, `403/429 rateLimitExceeded`, `403 dailyLimitExceeded`. Folder child limit is 500,000 and account item limit is 500M. https://developers.google.com/workspace/drive/api/guides/handle-errors . `about.get` returns `storageQuota.limit/usage/usageInDrive/usageInDriveTrash`, where `limit` is absent if unlimited. https://developers.google.com/workspace/drive/api/reference/rest/v3/about

**Developer cost.** No per-call fee today, and brand verification is free. Future billing applies above the daily thresholds.

---

## 2. Dropbox API v2

**Free storage.** Basic plan is 2 GB. https://www.dropbox.com/plans . Version history and deleted-file recovery are **30 days** on Basic, and version history doesn't consume storage. https://help.dropbox.com/delete-restore/version-history-overview ; https://help.dropbox.com/account-settings/data-retention-policy

**OAuth for a static SPA. Best in class.**
- PKCE is explicitly intended for "pure JavaScript single-page apps", desktop/mobile apps without a server and open source apps. Enable "Allow public clients". Add `token_access_type=offline` to get a `refresh_token`. Access tokens are short-lived (the exact expiry is returned by `/oauth2/token`), and approval "remains valid until explicitly revoked". https://docs.dropboxapi.com/dropbox-api/docs/oauth
- Refresh tokens "can be repeatedly re-used and [don't] expire automatically". https://dropbox.tech/developers/using-oauth-2-0-with-offline-access . They are not rotated on refresh, and with PKCE no app secret is needed to refresh. **[secondary: Dropbox staff on forum]** https://www.dropboxforum.com/discussions/101000042/oauth2-w-refresh-tokens-for-hybrid-apps/512806
- **No backend needed for long-lived auth.** The refresh token sits in browser storage, so the same XSS caveat applies as for the PixelLab token.
- CORS: the official dropbox-sdk-js runs in browsers (PKCE browser example). Standard headers (Authorization, Dropbox-API-Arg) are on the CORS allow-list. There is also a documented "URL-parameter" trick to avoid preflights, but some users report it intermittently failing. **[secondary]** https://www.dropboxforum.com/t5/Discuss-Dropbox-Developer-API/CORS-pre-flight-workaround-is-giving-us-400-errors/td-p/672538 . Use the normal headers.

**Scopes/approval.**
- **App folder** access type: "read and write access to this folder only", at `/Apps/<AppName>/`. It is visible to and portable by the user. https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide
- Development status allows up to 500 linked users. **Once 50 users link, you have two weeks to get production approval or linking freezes**, and only approval unfreezes it. Review needs 50 linked users (early review is possible), an app icon and compliance with branding and terms. The name can't be changed after approval. https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide . Branding guide: don't use "Dropbox" in the app name. https://www.dropbox.com/developers/reference/branding-guide . No fee.

**Rate limits.** Unpublished. Limits are per authorization (per linked user). 429 `too_many_requests` comes with `Retry-After`. **`too_many_write_operations`** is namespace lock contention from parallel writes, so batch it. Batch upload: `upload_session/start_batch` (up to 1,000 entries), parallel `append_v2`, then one `finish_batch` (may be async, then call `/check`). Use `/files/upload` for files under 150 MB. https://docs.dropboxapi.com/dropbox-api/docs/performance . Upload session max was raised from 350 GiB to 2 TiB. **[secondary]** https://www.dropboxforum.com/discussions/101000014/api-file-size-limit/705297/replies/853611

**Change detection.** `list_folder` (recursive) with a cursor, then `list_folder/continue`. **`list_folder/longpoll`** blocks until a change, which suits a browser tab. `get_latest_cursor` is available. An expired cursor returns 409 `reset`. Webhooks need a server. It works on the app folder (the app root is "/"). https://docs.dropboxapi.com/dropbox-api/docs/detecting-changes

**Conditional writes / CAS: yes, true CAS.** `WriteMode.update(rev)` "overwrite[s] if the given rev matches the existing file's rev". With `autorename=false` a mismatch fails with an `UploadError path/conflict` instead of writing a conflicted copy. `WriteMode.add` plus `autorename=false` gives atomic create-if-absent. **[secondary: SDK docs and staff answers; the official endpoint page returned 403 to the fetcher]** https://docs.rs/dropbox-sdk/latest/dropbox_sdk/files/enum.WriteMode.html ; https://www.dropboxforum.com/t5/Dropbox-API-Support-Feedback/V2-API-s-DbxFiles-WriteMode-update-does-not-created-conflicted/td-p/133340 . `content_hash` is available for blob verification.

**Duplicates.** Path-addressed, so one file per path (case-insensitive paths).

**Quota.** `users/get_space_usage`. A full disk fails uploads with `insufficient_space`. **[unverified against the official page]**

**Developer cost.** None. Risk: production approval review and the 50-user freeze.

---

## 3. Microsoft Graph: OneDrive (personal + work/school)

**Free storage.** 5 GB per Microsoft account, shared across OneDrive files/photos, **Outlook.com attachments** and Microsoft 365 apps. Outlook.com mail itself has a separate 15 GB. https://support.microsoft.com/en-us/office/microsoft-storage-faqs-8fca6272-3427-4cce-a437-2c5ed84550a9 . Work/school quota is set by the tenant.

**OAuth for a static SPA.** Auth code plus PKCE as an `spa` redirect URI (MSAL.js). There is no secret and the token endpoint supports CORS. **SPA refresh tokens live 24 hours** and refresh tokens acquired from them inherit that expiry. The app must "rerun the authorization code flow using an interactive authentication to get a new refresh token every 24 hours". It is usually invisible ("just a reload of your application") but needs a **top-level navigation**, because third-party-cookie blocking kills iframe renewal. Other clients get 90 days. https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens . **Net:** no backend needed, but every 24 h the app does a full-page redirect to login.microsoftonline.com (silent if the MS session cookie is alive).

**Scopes.**
- `Files.ReadWrite.AppFolder` gives `/me/drive/special/approot`, which is `Apps/<Entra app name>` and visible to the user. Users can rename, move or delete it. It counts against the user's quota. https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder ; https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder
- Work/school support is **conflicting**. The 2025 Graph guide says the app folder "works across OneDrive for work or school and OneDrive for home". The older permissions reference says the delegated scope is "only valid for personal accounts" (preview). Test with a business tenant; fall back to `Files.ReadWrite` there. A Graph SDK issue reports large-upload problems with only AppFolder scope. **[secondary]** https://github.com/microsoftgraph/msgraph-sdk-javascript/issues/917
- **Publisher verification:** since Nov 2020, with risk-based step-up consent, users in many tenants can't consent to newly registered unverified multitenant apps. Verification is free but needs a Microsoft AI Cloud Partner Program account and an MFA-protected tenant user, which is hard for an individual OSS developer. It mostly affects work/school; personal accounts just see "Unverified". https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview . App registration now needs an Entra directory; personal-account-only registrations are gone. **[secondary]** https://learn.microsoft.com/en-us/answers/questions/1663127/question-regarding-notification-about-being-requir

**CORS gotcha on download.** `/content` returns 302 to a pre-authenticated URL, and a 302 after a preflighted request is blocked. JS apps must fetch `@microsoft.graph.downloadUrl` (obtainable via `$select`, including in children listings) and GET that without an Authorization header. The URL expires within minutes. https://learn.microsoft.com/en-us/graph/api/driveitem-get-content

**Uploads.** Simple PUT handles up to 250 MB. https://learn.microsoft.com/en-us/graph/api/driveitem-put-content . Upload sessions need fragments in 320 KiB multiples under 60 MiB. Don't send Authorization on the PUT to `uploadUrl`. `fileSize` over quota returns **507 Insufficient Storage**. `conflictBehavior` is `fail` (default) / `replace` / `rename`. https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession . JSON batching handles up to 20 requests per `$batch`. https://learn.microsoft.com/en-us/graph/json-batching

**Rate limits.** Graph defers OneDrive/SharePoint limits to SharePoint throttling guidance. Throttled calls get 429/503 with `Retry-After`, plus `x-ms-throttle-*` headers. https://learn.microsoft.com/en-us/graph/throttling-limits

**Change detection.** `driveItem: delta` uses deltaLink/nextLink, `token=latest` and `410 Gone` resync. Track items by ID. https://learn.microsoft.com/en-us/graph/api/driveitem-delta . The App Folder doc lists `GET /drive/special/approot:/{path}:/delta` as supported. https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder . OneDrive for Business historically supported delta only on the drive root **[unverified; the current page doesn't state it]**. There is no long-poll in the browser (webhooks need a server).

**Conditional writes / CAS: yes.** `createUploadSession` documents `if-match: etag`, which returns **412 Precondition Failed** on mismatch, and `if-none-match`. The commit-by-`sourceUrl` call honors `If-Match`. https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession . PATCH metadata also documents `if-match`. https://learn.microsoft.com/en-us/graph/api/driveitem-update . The current simple PUT page no longer lists `if-match`, so for manifests use an upload session with `if-match` (it works for small files too). Use the cTag (content) rather than the eTag (which also changes on metadata) where possible. `conflictBehavior=fail` gives create-if-absent.

**Revisions/trash.** Personal: about 30 days of versions and a 30-day recycle bin. Work/school: 93-day recycle bin and versions per tenant policy (500 by default historically). **[partly secondary]** https://support.microsoft.com/onedrive/restore-your-onedrive-files ; https://learn.microsoft.com/en-us/sharepoint/document-library-version-history-limits

**Quota.** `GET /me/drive` returns `quota {total, used, remaining, deleted, state}` (standard driveItem/drive resource). Over quota returns 507 `insufficientStorage`/`quotaLimitReached`.

**Developer cost.** None for delegated Graph file calls. Publisher verification and partner program enrollment are free but require a business identity.

---

## 4. Box

- Free Individual plan: 10 GB, **250 MB upload limit**, **1 file version**. https://www.box.com/pricing ; https://support.box.com/hc/en-us/articles/360043697314
- OAuth: every documented token exchange includes `client_secret`. There is no documented PKCE, and an open feature request asks for it. **[secondary]** https://developer.box.com/guides/authentication/oauth2/without-sdk ; https://pulse.box.com/forums/909778-help-shape-the-future-of-box/suggestions/50572956-add-pkce-support-for-oauth2-applications . **A backend is needed** to hold the secret.
- Refresh tokens: 60 days, single-use. https://developer.box.com/guides/authentication/tokens/refresh
- CORS: a per-app allow-list of origins in the developer console. https://developer.box.com/guides/security/cors
- **Verdict: excluded** (needs a backend).

## 5. pCloud

- Free: starts at 2 GB and goes up to 10 GB via tasks/referrals. **[secondary]** https://allaboutcookies.org/pcloud-review
- OAuth: `response_type=code` or `token` (implicit). The code exchange (`oauth2_token`) takes `client_secret`. Implicit tokens arrive in the fragment. Access tokens "do not expire" in the current implementation. Users are region-routed (`api.pcloud.com` US / `eapi.pcloud.com` EU). https://docs.pcloud.com/methods/oauth_2.0/authorize.html ; https://docs.pcloud.com/methods/oauth_2.0/oauth2_token.html
- Browser: the `pcloud-sdk-js` SDK is isomorphic. CORS is not documented. **[unverified]**
- No documented CAS, no long-poll in the browser **[unverified]**, small developer ecosystem.
- **Verdict:** possible later via the implicit flow, but low priority.

## 6. Other options

| Option | Free tier | Browser-only auth | CAS | Verdict |
|---|---|---|---|---|
| **WebDAV / Nextcloud** | Self/host-defined | Nextcloud core sends **no CORS** for WebDAV; needs the third-party WebAppPassword app or a proxy ([app](https://apps.nextcloud.com/apps/webapppassword), [issue](https://github.com/nextcloud/server/issues/3131)) | WebDAV supports If-Match/ETag (HTTP standard) | Power-user option only; requires server admin CORS setup |
| **remoteStorage** (5apps etc.) | 5apps "currently offers free storage accounts" ([get](https://remotestorage.io/get.html)) | Built on WebFinger + OAuth implicit + CORS ([site](https://remotestorage.io/)) | Protocol uses ETag If-Match/If-None-Match **[unverified current draft]** | Philosophically ideal, tiny user base, Internet-Draft status |
| **iCloud via CloudKit JS** | 5 GB iCloud, user-billed private DB | Requires a CloudKit app and the **Apple Developer Program at $99/yr** ([membership](https://developer.apple.com/programs/whats-included/), [CloudKit JS](https://developer.apple.com/documentation/cloudkitjs)) | Record change tags | **Excluded:** recurring developer fee |
| **Proton Drive** | n/a | SDK preview; "not yet officially supported for use by third parties"; auth modules missing ([Jan 2026](https://proton.me/blog/drive-sdk-january-2026)) | n/a | **Not viable** today |
| **MEGA** | ~20 GB **[secondary]** | No third-party OAuth; the app would handle the user's MEGA password (megajs) | none documented | **Not recommended** (credential handling) |
| **S3-compatible, user's own keys** (AWS S3, Cloudflare R2, Backblaze B2) | B2 10 GB, R2 10 GB **[unverified today]** | User pastes access keys; user must configure bucket CORS | **S3: If-Match and If-None-Match on PutObject** ([AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)); **R2 supports conditionals** ([R2](https://developers.cloudflare.com/r2/api/s3/conditional-operations/)); **B2 reportedly rejects If-None-Match** **[secondary]** ([Proxmox](https://lists.proxmox.com/pipermail/pbs-devel/2025-July/014234.html)) | Good advanced option; key handling mirrors the PixelLab token model |
| **File System Access API to a locally synced Dropbox/Drive/OneDrive folder** | Whatever the sync client has | No OAuth at all | None; desktop sync clients make "conflicted copy" files | **Chromium desktop only**: Firefox negative, Safari opposes ([caniuse](https://caniuse.com/mdn-api_window_showdirectorypicker), [web-features](https://web-platform-dx.github.io/web-features-explorer/features/file-system-access)). Nice zero-config "export folder" for desktop Chrome/Edge, not a sync backend |

---

## 7. Cross-cutting: third-party cookies, iOS Safari, PWA standalone

- Microsoft states SPA renewal must happen in a **top-level frame** because browsers block third-party cookies. https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens . Avoid any design that relies on hidden-iframe silent auth (old MSAL/Google patterns).
- Dropbox (non-expiring refresh token via fetch) is unaffected by cookie policy after the first login.
- Google GIS needs a popup per renewal, plus a user gesture to avoid popup blockers.
- **iOS home-screen (standalone) PWAs:** long-standing reports that OAuth redirects open in a separate Safari context with **separate storage**, so PKCE `code_verifier`/state saved in the PWA's storage is invisible to the callback and the user ends up in Safari. **[secondary, mostly 2018-2020; re-test on iOS 26]** https://developer.apple.com/forums/thread/100407 ; https://developer.apple.com/forums/thread/649699 . Mitigation to test: start auth with a same-window redirect from the standalone app and check whether the callback returns to it. Otherwise offer "connect in Safari" and accept that tokens live in Safari's storage, not the PWA's. Dropbox's non-expiring token means this happens once. OneDrive would hit it every 24 h, and Google every hour (popup).

---

## 8. Comparison table

| | Google Drive | Dropbox | OneDrive (MS Graph) | Box | pCloud |
|---|---|---|---|---|---|
| Free storage | 15 GB, shared with Gmail+Photos | 2 GB | 5 GB, shared with Outlook.com attachments | 10 GB (250 MB/file, 1 version) | 2 GB growing to 10 GB |
| Browser-only token exchange | Token model only (no PKCE public client) | PKCE public client | PKCE `spa` | No (secret) | Implicit |
| Long-lived auth without backend | **No** (hourly popup) | **Yes** (non-expiring refresh token) | **Partly** (24 h, then top-level redirect) | No | Yes (non-expiring token) |
| Least-privilege, user-visible folder | `drive.file` + own folder (non-sensitive) | App folder `/Apps/X` | `Files.ReadWrite.AppFolder` `/Apps/X` (business support disputed) | n/a | n/a |
| Review gate | Brand verification (free) | Production approval at 50 users (free) | Publisher verification for work/school (free, needs partner account) | - | - |
| CORS caveats | none known | use headers, not URL params | download via `downloadUrl` (extra hop) | per-app allow-list | undocumented |
| Change feed in browser | changes.list (poll) | list_folder/continue + **longpoll** | delta (poll) | - | - |
| **Atomic CAS on manifest** | **No** | **Yes** (`update` rev) | **Yes** (`if-match` on upload session, 412) | Yes (If-Match, documented by Box) **[unverified]** | No **[unverified]** |
| Create-if-absent | No (duplicate names allowed) | `add` + no autorename | `conflictBehavior=fail` | - | - |
| Versions (free) | ~30 days / 100 revisions | 30 days | ~30 days (personal) | 1 version | - |
| Batch | 100/batch, no media | upload_session batch up to 1,000 | 20/`$batch` | - | - |
| Developer cost risk | **Billing above 400M units/day or 1 TB egress/day/project (planned late 2026)** | none | none | n/a | none |

---

## 9. Which provider first: **Dropbox**

1. It is the only major provider where a static SPA gets **durable auth with no backend**: PKCE public client plus a non-expiring refresh token. Google can't do that browser-only, and Microsoft forces a re-login redirect every 24 h.
2. **True CAS** (`update` with rev, create-if-absent with `add`) and a **browser long-poll** change feed make it the cleanest reference implementation of the sync protocol.
3. The App folder is **visible and portable** (`/Apps/PixelDoll`), with least privilege and no verification fees. The only gate is the free production review at 50 users. Plan for it, because linking freezes two weeks after user 50.
4. Weakness: 2 GB free. That is enough for 10-500 MB libraries, but users near full need clear `insufficient_space` handling via `get_space_usage`.

**Second: Google Drive with `drive.file`.** It has the largest audience and storage, and verification is only free brand verification. But hourly gesture-gated re-auth means "sync while you work, re-connect after an hour idle", no CAS and duplicate names. Watch the 2026 billing thresholds.
**Third: OneDrive.** It has good CAS and delta, but needs the 24 h top-level redirect and the `downloadUrl` hop, and work/school needs publisher verification.

## 10. Can the layout be identical across providers? Yes, with a portable subset

Use one logical path layout under the provider's app root (Dropbox `/Apps/PixelDoll/`, OneDrive `approot`, Drive a visible `PixelDoll/` folder created by the app, WebDAV/S3 a prefix), for example:

```
PixelDoll/
  workspace.json            # small head pointer / format version
  manifests/<id>.json       # or per-device logs: devices/<deviceId>/log-<seq>.json
  blobs/<sha256>.png        # immutable, content-addressed, flat
```

Rules to keep it portable:
- Lowercase hex names only. Dropbox and OneDrive are case-insensitive, and OneDrive forbids `" * : < > ? / \ |`.
- Keep blobs flat or 1-level sharded. Drive caps a folder at 500,000 children. https://developers.google.com/workspace/drive/api/guides/handle-errors
- On Drive, map paths to IDs and **detect and merge duplicates by name** (pick the newest or merge content).
- **Do not make correctness depend on CAS**, because Drive lacks it. Immutable content-addressed blobs never conflict. For mutable state, use per-device append-only logs or per-device head files that every client merges deterministically, and use CAS (Dropbox rev / Graph if-match / S3 If-Match) only as an optimization for a shared compacted index. Then the same protocol and layout work everywhere, including Drive and WebDAV.

## 11. Client-side migration between providers: feasible

- Blobs are immutable and SHA-256 named. Copy is idempotent and resumable: list the destination, skip present hashes, stream download from A and upload to B, verify the hash, then write manifests last and the head pointer (`workspace.json`) at the very end. A crash mid-way leaves the destination unreferenced but valid.
- The browser holds two provider tokens at once (fine). Throughput is bounded by per-file request overhead (thousands of small files). Use Dropbox upload-session batching (up to 1,000 per commit), Graph `$batch` for metadata (20), and Drive parallel requests (no media batch). Expect minutes, not hours, for 500 MB.
- Cost/limits: Drive downloads cost 200 units each (fine per user, but they add up toward the project threshold at scale). OneDrive downloads need `downloadUrl` (get it from a `children?$select=id,name,@microsoft.graph.downloadUrl` listing to avoid N extra calls). Dropbox writes should be batched to avoid `too_many_write_operations`.
- Alternatively, migrate via the local IndexedDB copy: if the device has the full library cached, upload to the new provider directly with no download from the old one.
- Hourly Google re-auth during a long migration needs a resumable job that pauses for a gesture. Run Drive migrations while the user is present.
