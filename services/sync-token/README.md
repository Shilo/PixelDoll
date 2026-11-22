# sync-token

The one server-side piece of PixelDoll Cloud Save ([PLAN.md](../../PLAN.md) D31). Google gives browser-only apps no
refresh token, and exchanging a sign-in code needs the OAuth client secret, which a public web page cannot hold. This
Cloudflare Worker holds the secret and forwards three calls to Google:

| Route            | Forwards to                             | Used for                     |
| ---------------- | --------------------------------------- | ---------------------------- |
| `POST /exchange` | `oauth2.googleapis.com/token` (code)    | finishing a Google sign-in   |
| `POST /refresh`  | `oauth2.googleapis.com/token` (refresh) | a new one-hour access token  |
| `POST /revoke`   | `oauth2.googleapis.com/revoke`          | "Disconnect everywhere" only |

It answers only `https://pixeldoll.app` and `http://localhost:5199` (any other origin gets 403), accepts JSON bodies of
at most 4 KB, allows only the two app roots as redirect URIs, limits each IP to 30 requests a minute, and returns
Google's status and body unchanged. Dropbox needs no endpoint: its PKCE sign-in returns refresh tokens directly.

## What it stores and logs

Nothing. It has no storage bindings and no console calls, and `wrangler.toml` turns observability off. Refresh tokens
pass through only in transit; they are stored on the user's device alone. Files never pass through it: the browser
talks to Google Drive directly.

## Deploy (owner, once)

From this folder, on a free Cloudflare account (no billing, no domain needed; it runs on workers.dev):

1. Put the Google OAuth client ID in `GOOGLE_CLIENT_ID` under `[vars]` in `wrangler.toml` (it is public).
2. Run:

   ```sh
   npx wrangler@4 login
   npx wrangler@4 deploy
   npx wrangler@4 secret put GOOGLE_CLIENT_SECRET
   ```

   The last command prompts for the client secret; it is stored as a Cloudflare secret, never in the repository.

3. Copy the printed `https://pixeldoll-sync-token.<account>.workers.dev` URL into `tokenEndpoint` in
   `app/src/lib/sync/config.ts` and into the app's CSP `connect-src`.

## Test

From `app/`: `npm test -- sync-token`. The tests import `worker.ts` directly in Node with a mocked Google endpoint and
a fake rate limiter; no Cloudflare runtime is needed.
