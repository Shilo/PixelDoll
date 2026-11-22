# R2: Google Drive sign-in-once from a static page (research, 2026-11-22)

Legend: [doc] = current official Google page, [test] = I checked it live today, [community] = forum/GitHub reports, [unverified] = could not confirm.

## Verdict on the prior claim

| Part | Verdict |
|---|---|
| GIS token model gives ~1 h access tokens | Mostly true. Google promises only "short-lived"; lifetime comes back in `expires_in` and is set by Google [doc: how-user-authz-works]. ~3599 s is typical [community]; implicit-flow doc sample shows 3920. |
| No refresh token in the token model | True [doc: how-user-authz-works, use-token-model]. |
| Code flow needs a client secret for "Web application" clients | True in practice, but Google's docs contradict themselves: REST tables mark `client_secret` "Optional" [doc: web-server], and the implicit-flow page recommends "the GIS code model ... authorization code flow with PKCE" [doc: javascript-implicit-flow]. Yet the GIS code model page puts the exchange "On your backend server" [doc: use-code-model], and developers consistently get `invalid_request: client_secret is missing` for Web and even Desktop clients with PKCE, still reported in 2025-2026 [community]. Not tested with a real client. |
| So a static site cannot get refresh tokens | False technically, true legitimately. The token endpoint is CORS-enabled for any origin [test], so a page can exchange a code and refresh if it ships a secret. That breaks Google policy (below). |
| Renewal needs a popup from a user click | True. Docs: get a new token "by calling requestAccessToken() from a user-driven event such as a button press" [doc: use-token-model]. |

## 1. GIS token model (`initTokenClient`)

- Popup only: "only the dialog UX is supported" [doc: use-token-model]; no redirect mode.
- `prompt: ''` = "prompted only the first time"; `none` = no screens [doc: js-reference]. Even so the popup still opens and auto-closes ("flash") when consent and a Google session exist [community]; with `login_hint` the account chooser is skipped [doc: js-reference].
- Without transient user activation, browsers block `window.open`; GIS reports `popup_failed_to_open` [doc: js-reference]. So no background renewal: after ~1 h, sync stalls until the next click.
- Third-party cookie blocking (Safari ITP, Firefox partitioning) does not break the popup itself (first-party google.com window). It does break the old hidden-iframe `prompt=none` silent renewal (gapi.auth2 era, StackEdit), which GIS does not offer [unverified for current iframe behavior].
- iOS home-screen PWA: popups open in a separate Safari context, `window.opener` can be null (iOS 17.5+), callback never arrives [community, Apple forums]. Token client has no redirect fallback.
- FedCM migration covers Sign In With Google / One Tap (ID tokens), not `google.accounts.oauth2` authorization; no change to token lifetime or refresh [doc: gsi fedcm-migration; no source says the token client is affected].

## 2. Code flow + PKCE and other client types

- Client types: Web, Android, iOS, Desktop, Chrome Extension, TVs/limited input [doc: support 15549257]. No "SPA/public web" type. Secrets are hashed and shown once; clients inactive 6 months are auto-deleted [doc: same].
- Desktop: public client, PKCE required, secret "Optional" in docs but reported required in practice; redirect must be loopback `127.0.0.1`/`[::1]` [doc: native-app]. A page on pixeldoll.app cannot receive a loopback redirect. Not viable.
- iOS/Android: custom schemes "no longer supported" (Android/Chrome) and loopback deprecated [doc: native-app]; a web page cannot receive the redirect. One 2021 report used an iOS client from JS [community], but it needs manual copy and misuses the client type.
- TVs/limited input (device flow): no redirect at all; `drive.file` and `drive.appdata` are allowed; "refresh tokens are always returned"; polling needs `client_secret` (non-confidential for devices) [doc: limited-input-device]. `/device/code` preflight allows any origin [test], so it is technically plausible from a page [unverified end to end]. Costs: user types a code at google.com/device, and it violates policy (next bullet).
- Policy [doc: policies]: "You must choose the client type that best matches the platform"; protect the secret "just as you would a password"; never commit credentials to public repos. Installed-app secrets are "obviously not treated as a secret" [doc: oauth2 overview], but that applies to installed apps, not a web origin. Shipping a Web, Desktop or TV secret in an MIT repo is a policy breach with suspension risk.

## 3. GIS code model (`initCodeClient`)

Gets an authorization code (popup or redirect; popup recommended) for a backend that exchanges it for access + refresh tokens and stores the refresh token [doc: use-code-model, how-user-authz-works]. It requires a backend.

## 4. How real apps do it

- diagrams.net: server servlet holds the client secret and keeps the refresh token in a one-year `auth-token` cookie (`TOKEN_COOKIE_AGE = 31536000`), refreshing server-side [source: jgraph/drawio `src/main/server/java/com/mxgraph/online/AbsAuth.java`].
- StackEdit: implicit flow (`response_type: 'token id_token'`) with `prompt: 'none'` silent re-auth [source: benweet/stackedit `googleHelper.js`]; depends on third-party-cookie-era iframe behavior.
- Obsidian plugins: either a hosted token proxy holding the secret (Obsidian-Google-Drive via ogd.richardxiong.com, Drive on Demand, Vectrola, GemiHub) or user-supplied client ID/secret stored locally (OmniDrive, NSync) [READMEs/community listings].
- rclone: desktop installed app, embedded non-confidential secret, loopback redirect.
- Excalidraw OSS, Joplin, TiddlyWiki: no official Google Drive sync found [unverified, not deeply searched].
None of the found apps achieves silent long-lived Drive access from a pure static page within policy.

## 5. Refresh token lifetime rules [doc: oauth2 overview, web-server]

- External app in "Testing": refresh token expires in 7 days (unless only basic profile scopes). Must publish to Production.
- Expires if unused 6 months; on revoke; on password change only for Gmail scopes; when time-based access the user chose expires (`refresh_token_expires_in`); Workspace admin session control can force reauth.
- 100 refresh tokens per Google Account per client ID; the oldest is silently invalidated.
- `drive.file` is non-sensitive and recommended [doc: Drive api-specific-auth], so no full verification; brand verification only to show name/logo [doc: support 13463073].

## 6. Other ways

- Drive Picker / One Tap: Picker needs an access token from GIS; One Tap gives ID tokens only. Neither helps renewal.
- `chrome.identity`: extensions only.
- TWA: still web content; native Android Identity (AuthorizationClient) can authorize silently but only in a native app [unverified details].

## Conclusion

Fully automatic, sign-in-once Drive sync from a pure static page with no server is not possible within Google's rules. Within policy, the best static option is GIS token model with `prompt: ''` + `login_hint`, renewing inside the next user click after expiry: one consent, no repeated consent screens, but an hourly popup flash, no background sync after expiry, and broken iOS home-screen PWA behavior.

Minimal fix: a tiny stateless token endpoint holding the Web client secret (for example a Cloudflare Worker on a same-site subdomain such as auth.pixeldoll.app) that does only code exchange and refresh. Keep the refresh token either in the browser (IndexedDB) or, safer, in an HttpOnly same-site cookie set by that endpoint (diagrams.net pattern). Files still go browser to Drive directly. Note: this conflicts with AGENTS.md "Keep the app client-only; never add a backend", so it needs an owner decision. Policy-breaking alternatives (embedding a secret, device flow from a page) work technically but risk client suspension.

## Sources

- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/identity/oauth2/web/guides/how-user-authz-works
- https://developers.google.com/identity/oauth2/web/guides/use-code-model
- https://developers.google.com/identity/oauth2/web/reference/js-reference
- https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://developers.google.com/identity/protocols/oauth2/limited-input-device
- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/identity/protocols/oauth2/policies
- https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- https://developers.google.com/identity/gsi/web/guides/fedcm-migration
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://support.google.com/cloud/answer/15549257
- https://support.google.com/cloud/answer/13463073
- https://discuss.google.dev/t/authorization-code-flow-without-client-secret/168113
- https://discuss.google.dev/t/is-it-ok-to-put-a-client-secret-in-a-desktop-app/296820
- https://github.com/manfredsteyer/angular-oauth2-oidc/issues/812
- https://github.com/jgraph/drawio (src/main/server/java/com/mxgraph/online/AbsAuth.java)
- https://github.com/benweet/stackedit (src/services/providers/helpers/googleHelper.js)
- https://github.com/RichardX366/Obsidian-Google-Drive
- https://developer.apple.com/forums/thread/759487
- Live CORS checks: OPTIONS/POST https://oauth2.googleapis.com/token and OPTIONS https://oauth2.googleapis.com/device/code returned Access-Control-Allow-Origin echoing the origin.
