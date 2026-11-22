# R3: Adversarial review of the storage and sync plan (2026-11-22)

Read-only. Markers: **[verified]** checked today against a primary source; **[secondary]** forum, vendor blog or community; **[unverified]** reasoning or memory, test before relying on it.

## Verdict in brief

The overall shape is right: local-first, files in the user's own cloud, a small engine in the repo, Google reached through a token relay. Four parts of the plan are wrong or under-specified enough to cause real failures:

1. The cookie option for the refresh token.
2. The step 1 desktop folder backup "in the same layout as cloud sync".
3. Treating Google "Disconnect" like Dropbox's.
4. The plan's silence on how a device finds, or loses, the Drive folder under `drive.file`.

The iOS Home Screen redirect is still unproven for **both** providers, so it is a launch gate, not a reason to pick one provider over the other.

## Ranked problems

### 1. HIGH: the Drive folder is tied to one OAuth client ID forever
- `drive.file` lets an app see only files that the same app (client ID) created, or files the user opened with it through the Picker. Anything else returns 404 **[secondary: rclone forum, discuss.google.dev; Google's scope page says only "files that you open with an app"; verified that drive.file is non-sensitive]**.
- **Good news:** a new device or browser using the same client ID sees the existing folder. This answers the brief's question, but **[unverified end to end]**: test it with two browsers before building.
- **Bad news, and the plan misses it:** if Google suspends or deletes the OAuth client, or the owner must recreate it, every user's existing PixelDoll folder becomes invisible to the new client. The data still sits in the user's Drive, but the app cannot read it.
  - Mitigations: a "Re-link my PixelDoll folder" flow through the Google Picker (whether picking a folder grants access to its children is **[unverified]**), and an import that reads a downloaded copy of the sync folder (see 6).
  - Dropbox recovers more easily: the app folder is plain visible files, and a new app can read anything the user moves into its folder.
- The same rule breaks step 1's carry-over (see 3).

### 2. HIGH: the HttpOnly-cookie option for the refresh token
- **Safari caps response-set cookies at 7 days** when the subdomain is CNAME-cloaked to a third party **[verified: WebKit CNAME-cloaking post]**. Secondary sources say the same cap also applies to subdomains served from an unrelated IP range **[secondary]**.
  - auth.pixeldoll.app on Cloudflare would sit on a different network from pixeldoll.app on GitHub Pages. On iPhone, the cookie would likely die after 7 days without use, which is exactly the "sign in again" the owner rejects.
- **A Workers Custom Domain needs an active Cloudflare zone** **[verified: Cloudflare docs]**. Using auth.pixeldoll.app would mean moving pixeldoll.app's nameservers from Porkbun to Cloudflare.
- **The alternative, workers.dev, makes the cookie cross-site**, so third-party cookie blocking kills it.
- **Fix:** keep the refresh token in IndexedDB `pixeldoll-sync`, which the owner accepts security-wise. The relay then becomes a truly stateless proxy on a `*.workers.dev` URL (or Netlify or Deno Deploy), and DNS stays untouched. Home Screen apps are exempt from Safari's 7-day script-storage wipe [verified earlier in R2-no-oauth via WebKit].

### 3. HIGH: the step 1 desktop folder backup as specified
- "Same file layout as cloud sync" means the sync engine (packs, objects, revisions, heads) must exist first. That contradicts "ship first".
- On Google Drive it carries nothing over: files written by Drive for desktop were not created by PixelDoll's client ID, so `drive.file` cannot read them (1). Users end up with two PixelDoll folders.
  - On Dropbox it would carry over only if the user picked `Dropbox/Apps/PixelDoll`, and then a second, non-protocol writer shares the folder.
- **Low value:**
  - It serves only desktop Chrome and Edge, the users least at risk of eviction and the ones cloud sync will serve anyway.
  - Permission needs a click on each visit unless the app is installed or the user chose "allow on every visit" [R2-no-oauth, verified there].
- **Recommendation:** drop it.
  - If cloud sync is more than about two months away, at most add "save the backup ZIP to a folder every N minutes", reusing backup.ts, with no layout promise.
  - Put the effort into lifting the ZIP's 64 MiB and 5,000-entry caps. Today a large library cannot even be exported in one file.

### 4. HIGH: the iOS Home Screen sign-in is unproven for both providers
- **Evidence is mixed:**
  - A 2024 vendor note says Google sign-in "works just fine in installed PWAs on iOS". It also warns of duplicate callbacks that reuse the code and fail with `invalid_grant` **[secondary, Progressier 2024-06]**.
  - Long-running reports say the redirect lands in a Safari tab, not the app.
  - A December 2025 Apple forum thread with no answers reports that a sign-in which hands off to an authenticator app reopens in Safari **[secondary]**.
- **Consequences:**
  - Popups are out on iOS standalone (R2-google-auth).
  - Storage is separate from Safari, so the user types their Google password and 2-factor code inside the app once.
  - Dropbox's authorize URL may hand off to the Dropbox app as a universal link, which is exactly the failure in the 2025 thread **[unverified]**.
- **This is not a reason for Dropbox first.** Make it a gate: a 1-day spike on a real iPhone (current iOS) for both providers before any engine work.
- Design for it:
  - redirect on iOS standalone, popup elsewhere
  - a callback that tolerates a repeated code
  - PKCE verifier and state in IndexedDB, not sessionStorage

### 5. HIGH: Google Disconnect and multi-device token issuance are underspecified
- **A refresh token comes only on the first consent.** A second device using `access_type=offline` without `prompt=consent` gets **no refresh token** **[verified: Google web-server docs]**. Every device's first connect must send `prompt=consent`.
- **Revocation is broad.** Google's docs say revocation "removes all OAuth 2.0 scopes previously granted to a project", for all clients in it **[verified quote; exact per-user effect unverified]**. The report's "Disconnect revokes the token with the provider" would, on Google, likely sign out **every** device.
  - Fix: "Disconnect this device" deletes the token locally only. "Disconnect all devices" calls revoke and says so.
  - Dropbox `token/revoke` is per token.
- **The 100-token cap** per account per client ID drops the oldest token silently **[verified]**. That is harmless unless reconnect loops churn tokens, so don't re-consent automatically on errors.
- **Refresh tokens unused for 6 months die** **[verified]**. Show a "Reconnect Google Drive" state, not a generic failure.
- **Testing mode** issues 7-day tokens **[verified]**, so the app must be published to Production.
  - Unverified apps with only non-sensitive scopes: whether a warning screen or user cap applies is **[unverified]**. Google's page says brand verification applies to all apps, with listed exemptions.
  - Budget for brand verification: a privacy policy disclosing the relay, a verified pixeldoll.app (DNS TXT at Porkbun works), and about 2-3 business days.

### 6. MEDIUM: "Works if discontinued" is partly broken by the relay, and the escape hatch is missing
- If the relay or the Google client dies, Google sync stops within about an hour. Local work and the files in Drive survive.
- An installed PWA keeps working, and keeps syncing with Dropbox, with no developer infrastructure at all. That is the strongest argument for adding Dropbox soon after Google.
- **Missing everywhere:** restore by importing a downloaded copy of the sync folder (packs, objects, revisions), so a user can get out with no relay, no OAuth and no PixelDoll cloud code working. Without it, "the user owns the files" is true only in theory: gzipped revisions plus content-hashed packs are not something a user can reassemble by hand.
- **$0 holds:** Workers Free allows 100,000 requests a day, and refresh is about 1 call per active user-hour [R2-relay-terms, verified there]. The cost is maintenance, not money:
  - a Cloudflare account
  - a secret (Google allows two secrets for rotation without downtime **[verified: Google help]**; existing refresh tokens surviving the old secret's disablement is **[unverified]**)
  - a privacy-policy disclosure
  - answering Google compliance mail

### 7. MEDIUM: Drive folder discovery and multiple accounts
- **Two devices connecting at once** can each create a root `PixelDoll` folder, and Drive allows duplicate names. The plan needs:
  - deterministic adoption: the oldest `createdTime` among folders carrying a marker
  - a merge of the other folder into it
  - the marker set in `appProperties`, found by `appProperties has {...}` rather than by name, so a user rename or move does not orphan it **[unverified that appProperties queries work under drive.file; very likely]**
- **Trash:** a user-trashed folder must read as "folder gone, rebuild?", never as "everything deleted".
- **Multiple Google accounts:** desktop on account A and phone on account B silently gives two separate clouds that never meet. Show the connected account's email (Drive `about.get` `user.emailAddress` under drive.file is **[unverified]**; otherwise add the `email` scope) and pass `login_hint` on reconnect.

### 8. MEDIUM: the plan skips the prerequisites and over-scopes the v1 merge
- **Steps 2 and 3 silently assume sync-ready data:**
  - stable random item ids and rename-stable outfit ids
  - tombstones
  - the `pixeldoll-sync` database inside the delete fence
  - the receipt-stripping allow-list
  - a format or build-version check that pauses instead of merging across manifest versions (the no-backward-compatibility rule makes this mandatory)

  These belong in the plan as their own step before any provider.
- **The frame-position merge is overbuilt for v1.** The report admits it leaves `qa`, `provenance`, `frameEdits`, `baseCut` and `dressed` describing neither side, and that the PoC does not flag it. Ship v1 with items and outfits merged by id, and an item as the atomic unit (same item changed on both sides = conflict note). Add frame merge only if real users hit it. For a solo user, concurrent edits of the same item's different frames are rare.

### 9. LOW: relay hardening
- Prefer the minimal relay: forward `POST /token` with the secret injected, accepting only `authorization_code` with the fixed redirect URI, and `refresh_token`.
  - Google's token endpoint already allows CORS [R2-google-auth, tested there].
  - Turn Worker request logging off for bodies.
- An Origin allowlist does not stop non-browser callers. It is acceptable because a caller still needs a stolen refresh token.
- Other apps on the pixeldoll.app origin can read IndexedDB and use the relay. The owner accepts this, and drive.file limits the blast radius.

### 10. LOW: Google versus Dropbox first
- **For Google first:** it is the owner's priority and what most users have. Drive is also the hardest adapter (no compare-and-swap, duplicate names, path-to-id mapping), so building the engine against it first proves the worst case first.
- **Against:** it needs the relay, the backend-rule amendment and brand verification.
- **Dropbox's only remaining structural edge** is that it needs no infrastructure. Its secret-free PKCE refresh is confirmed by a Dropbox staff forum answer, while the official examples show a secret **[secondary]**. Its 50-user production review is another gate.
- **Both at launch: no.** It doubles the iOS sign-in QA and the support surface. **Agree with Google first and Dropbox second**, provided problems 1-5 are addressed, with Dropbox following closely as the no-infrastructure fallback.

### 11. LOW: library in the repo
Agree with R2-library-repo:
- one folder with a hard import boundary and its own tests
- a format marker from day one
- extract only on a real trigger

Do not spend effort on generality options now.

## Recommended plan

0. **Spike (1-2 days, before anything else).** On a real iPhone Home Screen app, Android Chrome and desktop:
   - a Google redirect round trip through a throwaway relay, with a Testing-mode client
   - the same for Dropbox PKCE
   - two browsers on one Google account: confirm the second sees the first's drive.file folder
   - confirm what revoke does to the other device's token

   Go or no-go for Google first rests on this.
1. **Ship now, no OAuth:**
   - `persist()` with the result shown in Settings, plus `estimate()`
   - lift the backup ZIP caps (streaming or split)
   - export through the share sheet (`canShare` fallback to download)
   - a "last backup N days ago" nudge
   - the iPhone Home Screen nudge

   **Drop the desktop folder backup** (or reduce it to a periodic ZIP into a picked folder).
2. **Make the data sync-ready:** stable ids, tombstones, the `pixeldoll-sync` database in the delete fence, the allow-list, and the format check.
3. **Google Drive sync:**
   - Amend AGENTS.md to allow "one stateless OAuth token endpoint that stores and logs no user data, holds only the Google client secret, and can be removed without data loss".
   - Host it on workers.dev; DNS stays at Porkbun.
   - Keep the refresh token in IndexedDB, with no cookie.
   - Send `prompt=consent` on each device's first connect.
   - Use an `appProperties` folder marker with deterministic adoption.
   - Show the account email.
   - Offer "Disconnect this device" (local) separately from "Disconnect everywhere" (revoke).
   - Add a "Reconnect" state for expired or revoked grants.
   - Include import from a downloaded sync folder.
   - Merge at item granularity.
   - Publish to Production with brand verification.
4. **Dropbox next**, reusing the engine. It is the survivability fallback that keeps working without any PixelDoll infrastructure.
5. **OneDrive only on demand. Frame-level merge, retention and the Picker re-link flow** when needed.
6. **Engine stays in the repo** behind a boundary.

## Sources
- Google drive.file scope (non-sensitive): https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google web-server flow (refresh token only on first consent, prompt=consent, revocation note): https://developers.google.com/identity/protocols/oauth2/web-server
- Google OAuth overview (6 months, Testing 7 days, 100 tokens): https://developers.google.com/identity/protocols/oauth2
- Google secret rotation: https://support.google.com/cloud/answer/15549257 ; https://developers.googleblog.com/en/usability-and-safety-updates-to-google-auth-platform/
- Google verification: https://support.google.com/cloud/answer/13464321
- drive.file per-client visibility [secondary]: https://forum.rclone.org/t/google-drive-changing-client-id-and-scope-drive-file-write-access/6693 ; https://discuss.google.dev/t/visibility-of-files-and-folder-using-the-google-drive-api/328507
- WebKit CNAME cloaking 7-day cap: https://webkit.org/blog/11338/cname-cloaking-and-web-privacy/ ; IP-range variant [secondary]: https://ppc.land/safari-cuts-server-set-cookies-to-7-days-on-cloaked-tracking-subdomains/
- Cloudflare Workers Custom Domains need an active zone: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- iOS PWA sign-in [secondary]: https://intercom.help/progressier/en/articles/9519381-google-oauth2-is-not-working-in-my-pwa-on-ios-why ; https://developer.apple.com/forums/thread/810832 ; https://developer.apple.com/forums/thread/100407
- Dropbox PKCE offline refresh [secondary]: https://dropbox.tech/developers/using-oauth-2-0-with-offline-access ; https://dropboxforum.com/discussions/101000014/using-refresh-token-without-client-secret/584036
