# Challenger findings: storage sync for PixelDoll (2026-11-22)

Verification key: [V] verified in a fetched or searched official/primary source; [S] secondary (forum, blog); [P] prior knowledge, not re-verified today.

## 1. Google Drive

- drive.file is non-sensitive per Google's Drive scope guide, so no CASA and no sensitive-scope review. Basic app verification still applies for production use. [V] https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- drive.file covers files the app creates, plus existing files the user opens with the app or shares with it through Picker or the app's file picker. [V] same URL. Cross-device visibility is NOT stated on that page. [P] Files created by an OAuth client are visible to that same client ID for that user on any device, so one client ID works across phone and desktop. Confirm with a two-device test before relying on it.
- drive.appdata: hidden app-only folder, same cross-device behavior. Good for the manifest/ledger-free sync store if you do not want users to see files. [V] scope description; [P] hidden-folder semantics.
- "Testing" status: refresh tokens for test users expire 7 days after consent. Moving to production removes the limit. [V] https://support.google.com/cloud/answer/15549945 (via search summary).
- Unverified-app cap of about 100 users and the unverified-app warning screen: [P]. Verify on the consent-screen page.
- Token model (Google Identity Services): no refresh token; access token lasts about 1 hour; silent re-auth via requestAccessToken, which needs an active Google session and generally a user gesture, and third-party-cookie blocking breaks it. [V] https://developers.google.com/identity/oauth2/web/guides/use-token-model (token model issues no refresh token; code model needs a backend).
- Code model with PKCE and no client secret from a browser: NOT verified. Google documents PKCE for Desktop, iOS and Android client types, where no secret is needed. For "Web application" clients, Google's token endpoint has historically required client_secret for code exchange. Treat as a blocker until tested with a throwaway client. [S/P]
- Silent hourly re-auth: with the token model, a popup or prompt roughly hourly is the default outcome, unless prompt-none silent re-issue works in that browser. This is the biggest "automatic" risk. [V for no refresh token; P for silent-success rate]
- iOS standalone PWA: the home-screen app has separate storage from Safari, so a redirect-based OAuth round trip may land in Safari with a different storage context. Popups are unreliable. [P]. Test on a real iPhone.
- Rate limits: per-user 325,000 quota units per minute; create and update cost 50 units, so about 6,500 writes per minute per user (about 108 per second sustained). Project total 1,000,000 units per minute, about 20,000 writes per minute. No per-second limit is documented on the limits page. Backoff: truncated exponential with jitter; 403 "User rate limit exceeded" and 429 are the throttle responses. [V] https://developers.google.com/workspace/drive/api/guides/limits
- Implication: thousands of small files is fine for one user at sustained speed, but each file costs a create call plus HTTP overhead. Pack blobs into a few archives instead.
- Conditional writes: no If-Match, ETag precondition or revision check on files.update appears in the Drive upload guide. Drive has no documented compare-and-swap. [V for absence on the guide page; P that no such parameter exists in v3]

## 2. Dropbox and OneDrive

Dropbox:
- PKCE with offline refresh tokens is supported (token_access_type=offline). A Dropbox staff forum reply says a PKCE refresh token can be exchanged with client_id alone, no secret. [S] https://community.dropbox.com/en/discussion/comment/846684 (not official docs; verify).
- Development status: linking limited to the owner, up to 500 linked accounts. After 50 linked users, the owner has about two weeks to get production approval, or new linking stops. [S, forum summary, date unknown]
- App folder: app gets read/write to /Apps/<AppName> only. [V-ish from dev guide summary]
- Dropbox access-token lifetime differs by thread (one says dev status does not change lifetime; another says it does). Unresolved. [S conflict]
- CORS: Dropbox API endpoints support browser calls, including the content upload endpoints with a Dropbox-API-Arg header. [P]. Dropbox upload calls go through content.dropboxapi.com. Test.
- Conditional write: YES, the closest true compare-and-swap in this set. files/upload with mode "update" and a rev parameter fails with a conflict if the file's current rev differs. [P; the official HTTP doc page fetched today was empty of content, so verify on the docs page.]

OneDrive / Graph:
- SPA-registered Entra apps: refresh tokens last 24 hours, with no sliding renewal, and no supported extension. Each renewal inherits the remaining lifetime. Expect an interactive sign-in about once a day. [V] MSAL.js token-lifetimes docs and Microsoft Q&A (via search summary); https://learn.microsoft.com/en-us/entra/msal/javascript/browser/token-lifetimes
- Personal accounts are supported. App folder access uses the approot permission (Files.ReadWrite.AppFolder) [P].
- Conditional write: the PUT /content "replace" doc fetched today documents no If-Match header. Only the request headers Authorization and Content-Type are listed. So simple-content PUT is NOT a documented CAS. Graph PATCH on driveItem may accept If-Match with eTag; not verified here. Upload is 250 MB per simple PUT. [V for the simple-upload page content; P for PATCH If-Match]

## 3. Which provider gives true compare-and-swap

- Dropbox: yes, via update mode with rev (verify).
- Google Drive: no documented precondition. Read headRevisionId or modifiedTime, then write, is racy.
- OneDrive/Graph: not documented for simple PUT; maybe for PATCH with eTag (verify).
- Design answer that avoids needing CAS: store every manifest version as a new immutable file (for example manifests/<charId>/<manifestSha>.json), plus a small head pointer. Two devices can both create versions. If there are two heads, deterministically pick a winner (for example newest by a vector clock or by a fork-marker) and keep the other as a conflict copy the user can see. Blobs are SHA-256 keyed and immutable, so blob conflicts do not exist. Only the manifest set needs merge logic.

## 4. Dismissed simple options

(a) File System Access API to a folder synced by the desktop Dropbox/Drive/iCloud client:
- Chrome and Edge desktop: yes. Chrome for Android: caniuse says from version 155, while the File System Access table says not supported at 144; versions conflict. [S]
- Safari iOS: not supported; Apple forum post. Firefox desktop and Android: not supported. [V via caniuse summary]
- Meets phone and desktop? NO for iPhone and Firefox. Automatic? Only on Chromium desktop. Dev cost zero. Good as an optional "pick a folder" mode on desktop Chromium, not as the main design.

(b) remoteStorage.js:
- Only a 2.0.0 beta line was found (beta.5, beta.6). No stable 2026 release confirmed. Dropbox and Google Drive backends are documented, and they require registering your own OAuth app ID. [V for beta line; P for backend health]
- Meets constraints? Dropbox/Drive backends would inherit the same OAuth limits above. Adds a dependency with uncertain maintenance. Dismiss unless the owner wants that dependency.

(c) Better manual export/import plus share sheet to Files/iCloud:
- Works everywhere including iOS (file input and share sheet). Zero cost. Not automatic. This is the simplest honest baseline and can ship first. Phone-to-desktop via iCloud Drive is user-owned storage the user already has.

(d) Each user brings a free BaaS project (Firebase, Supabase, PocketBase):
- Firebase: free Spark tier, but it requires a user-created project and Google Cloud console steps, which is a poor onboarding story; Firestore conflicts are solvable with transactions. Supabase free tier pauses inactive projects after about a week of inactivity. PocketBase needs a server, so the user must host it. Meets "no developer cost": yes if the user pays nothing. Meets "automatic" and "phone and desktop": yes. Meets "simple for end users": NO. [P for pause and console steps; verify current tiers.]

(e) P2P WebRTC sync with a free public signaling service:
- Needs both devices online at the same time, or a relay. Free public signaling servers are unreliable and can be shut down. Good for pairing, not for backup. Automatic only when both are open. Fails "automatic backup". [P]

## 5. Recommended architecture (simplest that survives)

1. Ship (c) first: an export and import of an encrypted-free ZIP, plus a share-sheet target. Already partly present (backup.ts and archive ZIP format). Zero cost, works on iOS.
2. Add one provider, Dropbox first, because it has real CAS (update with rev), an app folder, and PKCE with a refresh token. Keep the refresh token out of plain localStorage; the project rule requires plaintext credentials to stay in optional localStorage only, so put the refresh token in IndexedDB or the same class as the PixelLab key and document it. Confirm that rule with the owner.
3. Storage layout: blobs packed into a few immutable archives keyed by SHA-256 (matches the existing archives/<sha>.zip idea). Manifests as immutable versioned files plus a head pointer. The job ledger (projects/jobs stores) is excluded by an explicit allow list, not a deny list.
4. Sync loop: upload new packs, then write the manifest version; on the update-with-rev conflict, fetch the head, merge, and write again. A fork is kept as a visible conflict copy.
5. Google Drive and OneDrive as later providers, gated on verifying the code-model PKCE question for Google and accepting a daily re-auth for OneDrive.

## Top 5 risks others will underestimate

1. Google token model is not automatic: no refresh token, roughly hourly re-auth, and it breaks under third-party cookie blocking. A PKCE code flow with no secret on a Web client is not verified and may be refused.
2. iOS standalone PWA cannot reliably complete OAuth (popup and storage separation). It may force the user into Safari for setup, which is outside the "phone" promise. Test on a real device first.
3. OneDrive SPA refresh token dies every 24 hours with no extension, so "automatic" for OneDrive means a sign-in prompt about once a day.
4. Per-file upload fan-out. Thousands of small PNGs means thousands of create calls, rate-limit backoff, and slow first sync. Pack blobs; upload only missing hashes.
5. Conflicts and CAS: Google and (verify) OneDrive have no documented compare-and-swap, so naive read-then-write will lose updates. Use immutable manifest versions with fork detection, and avoid depending on provider CAS except Dropbox update mode.

## Unverified items (not checked today)

- Google Web-client PKCE without secret (official answer not found).
- Google unverified-app 100-user cap and warning screen wording.
- Dropbox HTTP API official text for update mode and rev (fetched page was empty of content).
- Dropbox production-approval rule and access-token lifetime conflict.
- OneDrive app folder permission name and Graph PATCH If-Match support.
- Chrome for Android File System Access version (sources conflict).
- Drive cross-device visibility of drive.file for the same client ID (inferred, not stated on the fetched page).
- iOS standalone PWA OAuth behavior (no source checked).
