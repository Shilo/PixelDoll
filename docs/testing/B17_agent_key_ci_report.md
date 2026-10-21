# B17 — Agent-only key mode, CI + Pages, PWA plan (2026-10-21)

No PixelLab generations. The only API call was `GET /balance` (free) from the agent server. The key was never printed.

## What changed

| Area | Change | Files |
|---|---|---|
| Agent key server | `agentKey()` plugin registered only when `command === 'serve' && mode === 'agent'`. Reads `../.env` per request, server-side; serves `/__dev/pixellab-key` only to loopback + `Host: localhost/127.0.0.1` + `Sec-Fetch-Site: same-origin`; `cache-control: no-store`. `envDir: false`: Vite loads no `.env` file in any mode, so nothing (`VITE_` or otherwise) can be inlined. `vite build --mode agent` throws. `/__dev/save` stays dev-only and now has the same Host check (closes R6 P3). | `app/vite.config.ts` |
| Script | `dev:agent` = `vite --mode agent --port 5199 --strictPort` | `app/package.json` |
| Client | `main.ts` auto-connects (`setKey(key, false)` = memory only, then `/balance`) only `if (import.meta.env.DEV && import.meta.env.MODE === 'agent' && !app.key)`, unless `localStorage['pixeldoll.agentKey'] === 'off'`. `App.svelte` shows an "Agent mode" badge under the same condition (inline style, so no CSS rule survives into the build). "Use dev key" buttons removed from ConnectSheet and M1. | `app/src/main.ts`, `app/src/App.svelte`, `app/src/studio/ConnectSheet.svelte`, `app/src/ui/M1.svelte` |
| Launch configs | `app-dev` (human, :5173, keyless) + new `app-dev-agent` (:5199). Removed the stale per-builder `app-dev-b9/b10/b15` dev configs. | `.claude/launch.json` |
| Scripts | e2e, probe-tabs, shoot-mvp set `pixeldoll.agentKey = 'off'` in every context, so they stay keyless (and cannot spend) on any server. e2e gains a final B17 step: on the agent server a fresh context without the opt-out must show the badge and a loaded balance; on other servers there must be no badge and no dev-key option in Connect. e2e tolerates missing dev-only `window.__queue/__studio`, so it also runs on production builds. | `app/scripts/*.mjs` |
| CI | `pages.yml` ("CI and Pages"): on every push/PR/dispatch: `npm ci`, `check`, `selftest`, `build`, dist guard; configure/upload/deploy Pages only on push to `main`. Top-level `contents: read`; deploy job `pages: write`, `id-token: write`, concurrency group `pages`. Checkout without persisted credentials. No secrets, no `env:`. Action majors unchanged (checkout@v7, setup-node@v7 Node 24, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5). | `.github/workflows/pages.yml` |
| Docs | AGENTS.md "Agent testing"; README (human vs agent dev, CI + guard, https://shilo.github.io/PixelDoll/, custom domain recommended, MIT); PLAN D11–D13 + "PWA" section; TODO B17 + "PWA (planned)"; root `LICENSE` (MIT, Copyright (c) 2026 Shilo). user-guide: no dev-key wording existed, unchanged. | |

## Verification

| # | Check | Result |
|---|---|---|
| 1 | `npm run dev` (:5173) `GET /__dev/pixellab-key`, same-origin and cross-site | Not handled: Vite SPA fallback `200 text/html` (index.html, 811 B), no key, `no-cache` |
| 1 | Built-in browser on :5173 | No "Agent mode" badge, toolbar shows **Connect**, Connect sheet buttons = `Cancel`, `Connect` only, no `[data-testid=dev-key]`, no remembered key |
| 2 | `npm run dev:agent` (:5199) `GET /__dev/pixellab-key` | same-origin: `200`, 36 B, `cache-control: no-store` (value not printed); `Sec-Fetch-Site: cross-site`: `403`; `Host: evil.test`: `403` |
| 2 | Built-in browser on :5199 | Badge "Agent mode" bottom-left (desktop 1280×800 and phone 375×812), toolbar shows "N gens" (auto-connected, `/balance` only), key not in localStorage, tab = leader |
| 3 | `npm run build` + guard (`grep -rlE '__dev\|pixellab-key\|PIXELLAB_TOKEN_AGENT_DEV\|pixeldoll\.agentKey\|agent-badge'`, `.env*`, `*.map`) | exit 0, 0 hits; also 0 hits for `Agent mode`/`agentKey`/`.env`; only "agent" substrings are `userAgent` and `magenta`. Key value: 0 files in `app/dist`, `app/src`, `.github`, docs |
| 3 | Guard negative test (dist copy + planted `.env` and `fetch('/__dev/pixellab-key')`) | guard = 1 (fails as intended) |
| 3 | `npx vite build --mode agent` | refuses: `mode "agent" is dev-server only; never build with it` |
| B | `pages.yml` parsed with PyYAML | triggers push/pull_request/workflow_dispatch; jobs build, deploy; deploy perms pages:write + id-token:write |
| B | `dist` served only under `/PixelDoll/` (scratch node server on 127.0.0.1:8790, everything else 404) in the built-in browser | Demo "Adventurer (demo)" loads, stage canvas renders, no console messages (no CSP errors), all 19 requests under `/PixelDoll/` incl. `assets/ticker.worker-*.js` and `fixtures/s2/fixture.json` |
| — | `npm run check` | 0 errors, 0 warnings (220 files) |
| — | `npm run selftest` | all self-tests passed |
| — | `node app/scripts/e2e-studio.mjs` on :5173 / :5199 / `127.0.0.1:8790/PixelDoll` (prod build, sub-path) | 22/22 ok, "all passed" on each; :5199 ends with "agent server: badge shown, auto-connected (balance loaded)" |
| — | `node app/scripts/probe-tabs.mjs` on :5173 and :5199 | 6/6 ok each |
| — | `git check-ignore .env` | ignored by `.gitignore:2` |

## Notes

- Agent auto-connect uses the agent server's own browser storage (`localhost:5199` is a separate origin from `:5173`). If that
  origin's job ledger holds queued jobs, connecting resumes them, as it would for a human pasting a key. Tests use fresh
  contexts; reset the origin's storage before agent work if in doubt.
- Only one agent server port (5199, `--strictPort`). Parallel agents would need a second script/port; not added (YAGNI).
- Not done here: commit, remote, push, enabling Pages in repo settings, PWA implementation.
