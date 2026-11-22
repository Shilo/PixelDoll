# Cloud Save: owner checklist

Everything the team could do without you is done, tested and committed on `feat/cloud-save`. Cloud Save is visible only in Developer mode. These steps need a person. Every value is filled in; copy, don't decide. Everything is free: attach no billing account and no card anywhere.

When done, tell the team "checklist done" with the four values from steps 8, 9 and 13 (all public). Never paste a secret or a refresh token in chat.

## Release A

**0. Merge the release A pull request** into main (the team's PR for `feat/cloud-save`). It ships:

- Cloud Save, hidden behind Developer mode
- the privacy policy at https://pixeldoll.app/privacy.html, linked from the home page

Google's brand review needs both live, and the phone tests need the code on pixeldoll.app.

## Google (console.cloud.google.com, signed in with the account that will own the app)

**1. Create the project.**

- Project name: `PixelDoll`
- Attach no billing account.

**2. Enable the API.** APIs & Services › Library › **Google Drive API** › Enable.

**3. Branding** (Google Auth Platform › Branding):

| Field                           | Value                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| App name                        | `PixelDoll`                                                               |
| User support email              | your email                                                                |
| App logo                        | [google-logo-120.png](google-logo-120.png) (120 × 120, from the app icon) |
| Application home page           | `https://pixeldoll.app/`                                                  |
| Application privacy policy link | `https://pixeldoll.app/privacy.html`                                      |
| Authorized domains              | `pixeldoll.app`                                                           |
| Developer contact email         | your email                                                                |

**4. Verify the domain.** The team checked: pixeldoll.app has no TXT records yet (`nslookup -type=TXT pixeldoll.app`, 2026-11-22), so verification is needed.

1. Open [Google Search Console](https://search.google.com/search-console) with the same Google account, add a **Domain** property `pixeldoll.app`.
2. Copy the `google-site-verification=…` TXT value it shows.
3. Porkbun › pixeldoll.app › DNS: add a record. Type `TXT`, Host empty (the root), Answer the copied value, TTL 600.
4. Back in Search Console, Verify (DNS can take a few minutes).

**5. Data Access** (Google Auth Platform › Data Access › Add or remove scopes): tick only

- `.../auth/drive.file` (See, edit, create and delete only the specific Google Drive files you use with this app)
- `openid` and `.../auth/userinfo.email` (shown as non-sensitive; the app displays the account email)

**6. Clients** (Google Auth Platform › Clients › Create client):

| Field                         | Value                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Application type              | Web application                                                                 |
| Name                          | `PixelDoll web`                                                                 |
| Authorized JavaScript origins | `https://pixeldoll.app` and `http://localhost:5199`                             |
| Authorized redirect URIs      | `https://pixeldoll.app/` and `http://localhost:5199/` (with the trailing slash) |

Keep the client secret window open for step 9; do not save it anywhere else.

**7. Audience** (Google Auth Platform › Audience):

1. User type: External.
2. **Publish app** (to Production). Testing mode signs everyone out after 7 days.
3. Branding › **Submit for verification** (about 2 to 3 business days; Google emails you).

**8. Hand over** the **Client ID** (public, ends in `.apps.googleusercontent.com`).

## Cloudflare (dash.cloudflare.com)

**9. Deploy the token endpoint.**

1. Create a free account (no card).
2. In `services/sync-token/wrangler.toml`, set `GOOGLE_CLIENT_ID` to the Client ID from step 8.
3. From `services/sync-token/` in a terminal:
   ```powershell
   npx wrangler@4 login
   ```
   ```powershell
   npx wrangler@4 deploy
   ```
   ```powershell
   npx wrangler@4 secret put GOOGLE_CLIENT_SECRET
   ```
   Paste the Google client secret (step 6) only at that prompt.
4. Hand over the `https://pixeldoll-sync-token.<your-subdomain>.workers.dev` URL `deploy` printed. Rate limiting is in the deploy config; if `deploy` reports the rate-limit binding is unavailable on Free, tell the team (it will remove the binding and rely on the origin check).

## Dropbox (www.dropbox.com/developers/apps)

**11. Create the app.** Create app › **Scoped access** › **App folder** › name `PixelDoll`.

**12. Configure it.**

- Settings › OAuth 2 › Redirect URIs: add `https://pixeldoll.app/` and `http://localhost:5199/`.
- Settings › OAuth 2 › **Allow public clients (Implicit Grant & PKCE)**: Allow.
- Permissions: tick `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write`, then Submit.

**13. Hand over** the **App key** (public).

**14. Later:** when the app reaches 50 connected users, Dropbox asks for a production review; apply (free) within 2 weeks.

## Tests and release

**15. Test accounts.** Use a spare Google account and a spare Dropbox account, never your own. After the team has put the values from steps 8, 9 and 13 in the app, from `app/` with nothing running on port 5199:

```powershell
node scripts/sync-test-token.mjs google
```

```powershell
node scripts/sync-test-token.mjs dropbox
```

Each prints a sign-in URL: open it in a private window, sign in with the spare account, then paste the address the browser lands on (an error page at localhost:5199 is expected). The token goes into the repo-root `.env`, never on screen.

**16. Phones** (on https://pixeldoll.app with Developer mode on in Settings › Developer):

1. Install PixelDoll to the Home Screen on an iPhone (Share › Add to Home Screen), and on Android if available.
2. In the installed app: Settings › Cloud Save › Connect Google Drive, sign in with the spare account. Note whether you came back to the installed app or ended up in Safari.
3. Make a copy of the demo character on the desktop (connected to the same account). Within a minute it should appear on the phone.
4. Rename it on the phone; check the desktop.
5. Repeat 2 to 4 with Dropbox (disconnect Google first).
6. Write what failed in `docs/handoff/cloud-save/phone-test.md`, or tell the team.

**17. Merge** the fix rounds the team prepares from the phone tests, then the final release that removes the Developer-mode gate.

## Before the final release

- Recheck Google's Drive API quota and billing page (https://developers.google.com/workspace/drive/api/guides/limits): charges were "planned ... later in 2026" when the team checked.
