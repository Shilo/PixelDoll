# R7: agent-only token review (`PIXELLAB_TOKEN_AGENT_DEV`), PixelDoll + PixelLab Backpack

Date: 2026-10-21. Reviewer: R7 (review + test only, no tracked files edited, nothing committed).
Scope: PixelDoll (`C:\Programming_Files\Shilocity\PixelLab\PixelDoll`, reference) and PixelLab Backpack
(`C:\Programming_Files\Shilocity\PixelLab\pixellab-gallery`), against `docs/handoff/agent-dev-token-handling.md`.

Safety: the token was never printed, logged or screenshotted. Every check that touched the value ran in a scratch script
that read `.env` and printed only counts or booleans. PixelLab use: free GETs only (PixelDoll `GET /balance`; Backpack's
auto-connect is its read-only list check: 7 list GETs plus 4 `/mcp/tilesets/*/image` 302s). No generations.
Servers: my own instances on spare ports (PixelDoll agent :5311, human :5312, preview :4311; Backpack agent :5281 via the
real `npm run dev:agent`, human :5322, preview :4312, preview `--mode agent` :4313; hostile page :5401), all bound to
`localhost` and all stopped at the end. The PM's servers on :5199, :5173 and :4173 were not touched. PixelDoll's agent
instance ran `npx vite --mode agent --port 5311 --strictPort`, which is the `dev:agent` script with a different port.

## Verdict

Both projects meet the stated goal. There is **no P0, P1 or P2**. The token reaches only same-origin loopback pages on the
agent dev server. It never shows up in the human dev server, any build, the live Pages sites, browser storage, the working
trees (ignored files included), or the full git history of either repo. All findings are P3 hardening or parity items.

## Static review (checklist 1)

- Env reads: the only `.env` readers are the two `agentKey()` plugins and PixelDoll's `node --env-file=../../.env` spikes
  (`spikes/api/lib/run.mjs` → `process.env.PIXELLAB_TOKEN_AGENT_DEV`; the logger strips nothing sensitive because headers are
  never logged; errors carry only method, path, status and body). Neither repo has `loadEnv`, `envPrefix`, a `VITE_`/`PUBLIC_`
  read, `define` of the token, or `process.env` in app code. `envDir: false` is set in both. `import.meta.env` is used only
  for `DEV`/`MODE`.
- Old names (`PIXELLAB_API_KEY`, `API_KEY_OVERRIDE`, `DEV_API_KEY`, `devkey`): none in code or config, in either repo. They
  appear only in historical docs and in Backpack's guard marker list. Both `.env` files hold exactly one non-comment line,
  the new variable name, unquoted, 36 characters, no CR. The two files hold the same value.
- No tracked `.env*` or `*.map` in either repo. `.gitignore` covers `.env` and `.env.*` in both.
- Token value scan: 0 hits in the PixelDoll working tree (13,597 files incl. ignored `dist/`, `spikes/api/out/`, `docs/testing/img/`) and the
  Backpack tree (958 files incl. `.local/`, `test-results/`, `dist/`, `mockups/`); zip entries inflated; `node_modules`,
  `.git` and the root `.env` skipped. Searched for the raw value, its base64, its URL encoding and an 18-char prefix and suffix.
  0 hits in `git log -p --all --reflog` (PixelDoll 364 MB, Backpack 505 MB of patch text). No stashes.

## Test matrix: PixelDoll

| # | Test | Result | Evidence |
|---|---|---|---|
| a1 | Agent server, same-origin `GET /__dev/pixellab-key` | PASS | 200, length 36, equals the `.env` value, `cache-control: no-store` |
| a2 | Agent app auto-connect (Playwright Chromium) | PASS | 1 endpoint call 200, then `GET /v2/balance` 200 ×2 with `Bearer <token>` (two balance calls per load: nit) |
| a3 | Badge | PASS | `.agent-badge` visible, text "Agent mode" |
| a4 | Nothing persisted | PASS | token count 0 in localStorage, sessionStorage, cookies, URL, DOM, every IndexedDB store (`pixeldoll` ledger incl.), Cache Storage; same after reload (reload re-fetches, re-connects) |
| a5 | Kill switch `pixeldoll.agentKey=off` | PASS | no endpoint request, no API call. The badge still shows (see F6) |
| a6 | Built-in browser profile (persistent, shared across sessions) | PASS | origins :5173, :5199, :4173 hold no `pixeldoll.apiKey` (no remembered key left over from earlier agent sessions) |
| b1 | Human dev server, endpoint | PASS | not handled: SPA fallback `index.html` (200, 1423 B, not the token) for every header combination; POST 404 |
| b2 | Human dev app | PASS | no endpoint request, no API call, no badge, token count 0 in all storage/DOM/URL; 0 dev/agent-key affordances. The served `/src/main.ts` still contains the dead `fetch('/__dev/pixellab-key')` (runtime `MODE` is `development`, and the endpoint does not exist), which is harmless |
| c1 | `vite build` (production) | PASS | 19 files, 0 token hits, 0 maps, 0 `.env*`, 0 markers (`__dev`, `pixellab-key`, var name, `pixeldoll.agentKey`, `agent-badge`, "Agent mode", `sourceMappingURL`, `import.meta.env`, `__queue`); CI guard replica exit 0 |
| c2 | `vite build --mode development` | PASS | same scan clean (Vite 8 builds with DEV false here; agent block absent) |
| c3 | `vite build --mode agent` | PASS (refused) | exit 1, "mode "agent" is dev-server only; never build with it" |
| c4 | `vite build --mode Agent` (case variant) | PASS | builds, but the scan is clean (`MODE === 'agent'` is case-sensitive, so the agent block is compiled out) |
| c5 | Preview of production build | PASS | `/__dev/pixellab-key` and `/.env` → SPA `index.html` (200, 1434 B); no endpoint call, no API call, no badge, storage clean |
| c6 | Live Pages `https://shilo.github.io/PixelDoll/` | PASS | `/PixelDoll/__dev/pixellab-key` 404, `/PixelDoll/.env` 404; live bundle hash `index-Dw9XoXp9.js` = local build; 0 token hits, 0 markers |
| d1 | curl-like (Host only, no `Sec-Fetch-Site`) | 403 | |
| d2 | Other localhost port page (`Sec-Fetch-Site: same-site`) | 403 | Vite's default CORS still echoes `Access-Control-Allow-Origin: http://localhost:5401`, so the `Sec-Fetch-Site` check is the control that matters here |
| d3 | Cross-site, `none` (typed URL / top-level nav) | 403 / 403 | |
| d4 | Foreign Host `evil.example`, `localhost.evil.example` (DNS rebinding) | 403 | Vite's own host check answers first (142/162 B "Blocked request"), so this is two layers |
| d5 | Host `foo.localhost`, `[::1]` | 403 / 403 | fail-closed (see note under F5) |
| d6 | No Host header | 400 | |
| d7 | Real browser page on :5401: `fetch` cors / credentials / no-cors / `import()` of `/src/main.ts` | 403 / TypeError / opaque / TypeError | 0 API calls |
| d8 | **Real browser page on :5401 that iframes the agent app** | **frame auto-connects** | inside the frame: endpoint 200 (token), `GET /v2/balance` ×2 with the token, badge shown; the parent cannot read the frame (SecurityError). See F1 |
| d9 | Spoofed loopback proxy (`Sec-Fetch-Site: same-origin` + `X-Forwarded-For` + `X-Forwarded-Host`) | 200 + token | See F2 |
| d10 | `.env` exposure via Vite static serving, 28 variants (`/.env`, `/.ENV`, `/.env.`, `/.env::$DATA`, `?raw`, `?import&raw`, `?raw??`, `/@fs/<root>/.env`, lower-case root, backslash root, `..%2f`, `%2e%2e`, `/fixtures/..%5c..`, `.git/config`) on agent and human servers | PASS | none returned the token: either SPA fallback or 403 `fs.deny`/allow-list |
| d11 | Path variants on agent server (`/`, upper-case, `?x=1`) | 200 + token (same guard, fine); `%5F%5Fdev` and `//__dev` → SPA fallback | |

## Test matrix: PixelLab Backpack

| # | Test | Result | Evidence |
|---|---|---|---|
| a1 | `npm run dev:agent` (:5281), same-origin endpoint | PASS | 200, length 36, equals `.env` value, `no-store` (also on 403) |
| a2 | Auto-connect | PASS | endpoint 200 → `library.connect(token, {memoryOnly:true})`: `GET /v2/characters` 200 (the key test), then the open check (`ui-assets`, `objects`, `tilesets`, `tilesets-sidescroller`, `tiles-pro`, `isometric-tiles`, all 200 with `Bearer <token>`); 4 MCP image 302s without the token |
| a3 | Badge | PASS | `.agent-badge` visible, "Agent mode" |
| a4 | Nothing persisted | PASS | token count 0 in localStorage, sessionStorage (no `pixellab-backpack:key`), cookies, URL, DOM, IndexedDB (`pixellab-backpack`), Cache Storage; same after reload |
| a5 | "Keep me signed in" while holding the agent token (`library.setKeepSignedIn(true)` through the dev module URL) | PASS | `keepSignedIn` stays `false`, storage still clean (`store()` returns early on `memoryOnly`) |
| a6 | Kill switch `backpack.agentKey=off` | PASS | no endpoint request, no API call; badge still shows (F6) |
| a7 | Built-in browser profile, origin :5281 | PASS | only `pixellab-backpack:api-count` in localStorage, no key |
| a8 | Unit tests `tests/unit/agent.test.ts` + `http.test.ts` | PASS | 51/51 (cover guard folding, memory-only, kill switch, `no-store` same-origin fetch) |
| b1 | Human dev (:5322) endpoint | PASS | SPA fallback (200, 624 B, not token) for every header combination; POST 404 |
| b2 | Human dev app | PASS | key screen only, 0 dev/agent affordances, no endpoint call, no API call, no badge, storage clean |
| c1 | `vite build` (production / development / `Agent`) | PASS | 5 files each, 0 token hits, 0 maps, 0 `.env*`, 0 markers; `scripts/dist-guard.mjs` "clean" |
| c2 | `vite build --mode agent`, also with `NODE_ENV=development` | PASS (refused) | exit 1 both |
| c3 | Preview (:4312) and `vite preview --mode agent` (:4313) | PASS | endpoint and `/.env` → SPA `index.html` (1114 B); no endpoint call, no API call, no badge (preview never calls `configureServer`) |
| c4 | Live Pages `https://shilo.github.io/pixellab-backpack/` | PASS | `__dev/pixellab-key` 404, `.env` 404, 0 token hits, 0 markers |
| d1–d6 | Same header matrix as PixelDoll | identical results | 403 for curl-like, same-site, cross-site, none, foreign Host, `foo.localhost`, `[::1]`; 400 without Host |
| d7 | Hostile :5401 page fetch / import | 403 / TypeError / opaque / TypeError | |
| d8 | **Hostile :5401 page iframes the agent app** | **frame auto-connects** | endpoint 200 in the frame, 11 API calls with the token (all read-only); parent blocked (SecurityError). F1 |
| d9 | Spoofed loopback proxy headers | 200 + token | F2 |
| d10 | `.env` exposure, 28 variants (Backpack's Vite root **is** the repo root, so `/.env` is a real file there) | PASS | all 403 (`fs.deny`) or SPA fallback, token never returned, on the human server too |
| d11 | Same-origin HTML other than the app | served | `/mockups/recommended/index.html` → 200 `text/html` on :5281. F4 |

## Findings

| ID | Project | Sev | Status | Failure scenario | Proposed minimal fix |
|---|---|---|---|---|---|
| F1 | both | P3 | CONFIRMED (d8) | While an agent server runs, any page the browser visits (another localhost port, or a public site where the browser allows local-network framing) can embed `http://localhost:5199/` (or :5281) in an iframe. The framed app fetches the token same-origin (`Sec-Fetch-Site` is computed from the frame, not its ancestors) and connects. The parent cannot read the token, but it can clickjack the framed app. In PixelDoll that means paid generation buttons (credit spend). In Backpack it means read-only calls and the daily-cap counter. Neither dev server sends `X-Frame-Options`/`frame-ancestors`, and a meta CSP cannot. | Skip auto-connect when framed: add `window.top === window &&` to both agent guards (one token each). Optionally also set `server.headers: { 'X-Frame-Options': 'DENY' }` for `serve`+`agent` only. |
| F2 | both | P3 | PLAUSIBLE (d9 shows the check passes) | A human or agent tunnels the agent port (VS Code/Dev Tunnels port forwarding, cloudflared, `ngrok --host-header=rewrite`, an SSH `-R`). The tunnel client connects from loopback with `Host: localhost:<port>`, and the remote visitor's own fetch is same-origin to the tunnel URL, so all three checks pass and every remote visitor's browser gets the token. Backpack AGENTS.md says "Never expose the agent server beyond localhost". PixelDoll AGENTS.md does not. | In `localSameOrigin`, also reject any request with `forwarded`, `x-forwarded-for`, `x-forwarded-host` or `via` headers. Add the "never expose beyond localhost" sentence to PixelDoll AGENTS.md "Agent testing". |
| F3 | PixelDoll | P3 | CONFIRMED (negative test) | The CI dist guard (inline bash) misses an inline source map: an injected `//# sourceMappingURL=data:...` passed (exit 0), while Backpack's guard failed it. An inline map's `sourcesContent` is base64, so it would ship the full `main.ts`, agent block included, without matching any marker. It is not the token, but it breaks contract item 8. The guard also lacks the old names (`API_KEY_OVERRIDE`, `DEV_API_KEY`, `devkey`). It runs only in CI, not in `npm run build`, so a local build that gets deployed by hand is never checked. | Port Backpack's `scripts/dist-guard.mjs` (with PixelDoll's kill-switch key), run it from `"build": "vite build && node scripts/dist-guard.mjs"`, and drop the inline bash step. |
| F4 | both (wider in Backpack) | P3 | CONFIRMED (d11), accepted risk? | The endpoint trusts the whole origin, so any HTML that the agent Vite server serves runs same-origin and can read the token. Backpack's Vite root is the repo root, so that covers `mockups/**`, `.local/`, `test-results/`, `playwright-report/` and `node_modules/**/*.html`. In PixelDoll it covers `app/public`, `app/node_modules` (dev-fixtures are served only as json/png/txt/octet-stream). Today no mockup loads a remote script, so nothing is exploitable now. A future mockup with a CDN `<script>`, opened on :5281, would hand its CDN the token. | Document it in AGENTS.md: "open only the app on the agent server". Optionally, Backpack could refuse to serve `text/html` outside `/` and `/index.html` in agent mode (a 3-line middleware). |
| F5 | both | P3 | CONFIRMED | The `Sec-Fetch-Site` header check is the only control that stops other localhost ports from reading the token: Vite's default CORS allows every `localhost` origin (ACAO echoed even on the 403). There is no test of the server-side `localSameOrigin`/middleware in either repo (Backpack tests only the client). A future "simplification" that drops the header check would silently expose the token to every localhost page. Also, the Host regex accepts `127.0.0.1` (Vite listens only on `[::1]` on this machine) and rejects `[::1]`. That fails closed, so it is cosmetic. | Add one assertion-style self-check for `localSameOrigin` in each repo (same-site → false, no SFS → false, foreign Host → false, non-loopback socket → false, valid → true), or extract it into one shared tiny module per repo and unit-test it. |
| F6 | both | P3 | CONFIRMED (a5) | With the kill switch `off`, the "Agent mode" badge still shows. PixelDoll's tooltip says "auto-connected with the agent key", which is false for keyless runs and in screenshots made by keyless scripts. | Render the badge text/title from the same `off` check ("Agent mode (keyless)"), or document that the badge means "agent server", not "connected". |
| F7 | PixelDoll | P3 | PLAUSIBLE (code reading) | The kill switch is per page load, but `app.setKey()` shares a key typed (or auto-loaded) in a follower tab with the leader (`queue.setKey(key, share=true)`). Scenario in one browser profile on :5199: tab A loads with `off` (keyless test, leader). The switch is removed. Tab B loads, auto-connects and posts the token to A, and A starts running its ledger with the real token. Separate Playwright contexts are not affected (separate BroadcastChannel partition). | Pass `share=false` for the agent auto-connect (export a `setKey(key, remember, share)` or call `queue.setKey(key, false)` from the agent block): every agent tab fetches its own copy anyway. |
| F8 | Backpack | P3 | CONFIRMED (code) | Backpack reads `.env` from `join(server.config.root, '.env')`, PixelDoll from the config file's location. `vite --mode agent <dir>` or a future `root:` setting would move Backpack's lookup (fails closed, 404), and the two implementations differ for no reason. | `readFileSync(new URL('./.env', import.meta.url), 'utf8')` in Backpack. |
| F9 | both | P3 (nit) | CONFIRMED | Both clients accept any `r.ok` body as the token without checking it. If agent-mode client code ever ran against a server without the plugin (SPA fallback 200), the HTML would be sent as `Bearer` to `api.pixellab.ai`. It fails as a 401 and leaks nothing secret. PixelDoll also issues 2× `GET /balance` per auto-connect. | Optional: require `r.headers.get('content-type')` to be absent or `text/plain`, or check the length is under 200. Not needed for the goal. |

None of these block the goal. If the PM takes only one, take **F1** (a one-token client guard that removes the only
browser-reachable way to make the token act for another page). F2 and F3 are next: one header check, and one copied script.

## Parity table

| Aspect | PixelDoll | Backpack | Verdict |
|---|---|---|---|
| Variable / location | `PIXELLAB_TOKEN_AGENT_DEV`, repo-root `.env` | same | consistent |
| Agent command / port | `dev:agent` → `vite --mode agent --port 5199 --strictPort` | `--port 5281` | fine (project-specific) |
| Human command | `dev` → `vite` | same | consistent |
| Endpoint path | `/__dev/pixellab-key` | same | consistent |
| Guard (`localSameOrigin`) | identical expression | identical | consistent |
| `.env` lookup | `new URL('../.env', import.meta.url)` | `join(server.config.root, '.env')` | inconsistent (F8) |
| `no-store` | on 200/404 only | on every response | fine |
| Registration | `command==='serve' && mode==='agent'` | same | consistent |
| Agent build refused | throws | throws | consistent |
| `envDir: false` | yes | yes | consistent |
| Client guard | `DEV && MODE==='agent' && !app.key`, in `main.ts` | same shape, `!library.hasKey`; fetch lives in exported `http.ts#agentKey()` (tree-shaken, verified absent in dist) | fine |
| Kill-switch key | `pixeldoll.agentKey` | `backpack.agentKey` | fine (project prefix) |
| Verification path | `setKey(token,false)` → `refreshBalance()` (the human path: keep, flag if rejected) | `library.connect(token,{memoryOnly:true})` (the human verify-then-keep path) | fine: each uses its own human path |
| Memory-only | `remember=false` | `memoryOnly` flag blocks both stores and Keep-signed-in | consistent in effect |
| Cross-tab | key shared follower → leader (BroadcastChannel) | never shares the key (bare messages) | inconsistent; F7 |
| Human default store | memory (tab) | sessionStorage (tab) | differs from contract §11 wording ("memory"); not agent-related, flag for the PM |
| Badge | bottom-left, inline style, title mentions auto-connect | top-centre, glass classes | fine; both show with kill switch (F6) |
| Dist guard | inline bash in CI only; no old names, no inline-map check | `scripts/dist-guard.mjs` in `npm run build`; old names + `sourceMappingURL` | inconsistent (F3) |
| CI triggers / Node | every push + PR, Node 24 | push to main + PR, `lts/*`, concurrency group | fine |
| CI secrets/env | none | none | consistent |
| Launch configs | `app-dev` :5173, `app-dev-agent` :5199, `app-preview` :4173 | `app-dev` :5173, `app-dev-agent` :5281 | fine. Both human configs use :5173, so the two apps share one origin (a human's remembered key in one is readable by the other's dev pages). Not agent-related; consider different human ports |
| AGENTS.md "Agent testing" | present; lacks "never expose beyond localhost" | present ("Agent testing with the real key"), has it, plus "read-only" rule | inconsistent wording (F2 doc part) |
| `.gitignore` | `.env`, `.env.*`, `!.env.example` | `.env`, `.env.*` | fine |
| Node scripts using the token | spikes via `--env-file` (agent research only) | none | fine |
| Keyless automation | `e2e-studio.mjs`/`shoot-mvp`/`probe-tabs` set the kill switch; one documented context checks auto-connect (balance only) | Playwright runs `build && preview` (no agent code at all), API mocked | consistent |

## Reproduction (scratch scripts, not in the repos)

All in `C:\Users\shilo\AppData\Local\Temp\claude\C--Programming-Files-Shilocity-PixelLab-PixelDoll\5c4b3fcb-a853-4696-a7af-5796853cc022\scratchpad\`:
`envinfo.mjs` (`.env` shape booleans), `scan.mjs` (working-tree token count), `stdincount.mjs` (git history count),
`p2.mjs` (endpoint header matrix + 28 `.env` paths), `browser.mjs` (Playwright agent/human/kill/preview + storage dump counts),
`attack.mjs` (hostile :5401 page: fetch variants + iframe), `distscan.mjs` (dist markers + token count), `livescan.mjs` (live Pages bundles).

## Fixes applied (B19)

Date: 2026-10-21. Builder B19. Nothing committed. Token never printed: every check below ran in a count-only scratch script
(`b19.mjs`, plus R7's `browser.mjs` and `distscan.mjs`). PixelLab use: free GETs only (PixelDoll `GET /balance`; Backpack's
read-only open check). Servers on spare ports (PixelDoll agent :5331, human :5332, preview :4331; Backpack agent :5381,
human :5382, preview :4381; framing page :5402), all `localhost`, all stopped. The PM's :5199/:5173/:4173 were not touched.

Applied: F1, F2, F3, F5, F6, plus the handoff wording and the kill-switch sentence. Not applied (not agreed): F4, F7, F8, F9.

- F1: `window.top === window` added to both client guards (PixelDoll `app/src/main.ts`, Backpack `src/main.ts`). Backpack's
  `tests/unit/agent.test.ts` stubs `window` and gains a framed case.
- F2: the guard rejects any `forwarded` or `via` header or any header name starting `x-forwarded-`. PixelDoll AGENTS.md
  "Agent testing" gains the "never expose beyond localhost" line; Backpack's line names `--host`, tunnels and port forwards.
  The handoff doc notes that raw TCP forwards (`ssh -L/-R`, `socat`) can't be detected, so that rule is the real control.
- F3: `app/scripts/dist-guard.mjs` (port of Backpack's), run by `"build": "vite build && node scripts/dist-guard.mjs"`;
  the inline bash step is gone from `pages.yml` (CI still runs `npm run build`). Both guards now share one marker set:
  `__dev`, `pixellab-key`, `PIXELLAB_TOKEN_AGENT_DEV`, `PIXELLAB_API_KEY` (added to Backpack's), `API_KEY_OVERRIDE`,
  `DEV_API_KEY`, `devkey`, the project's kill-switch key, `agent-badge`, `sourceMappingURL` (covers inline `data:` maps),
  plus `.env*` and `*.map` files.
- F5: the predicate lives in `app/agent-key.ts` (PixelDoll, `selfTest()` run by `npm run selftest` through a new optional
  `extra` list on `runSelfTests`) and `agent-key.ts` (Backpack, `tests/unit/agent-key.test.ts`). Both `vite.config.ts` files
  import it; the tests import the same module. Backpack's `tsconfig.json` gains `allowImportingTsExtensions` so the config can
  import `./agent-key.ts` (Vite warns about extensionless imports for its future native config loader).
- F6: badge text stays "Agent mode"; title is "Agent dev server (npm run dev:agent), for AI-agent testing only" in both.
- Handoff doc: §2 items 4/6/8/11, §3 (new `agent-key.ts` block, main.ts guard, badge title, AGENTS.md summary, CI/dist guard),
  §4 items 4/6/9/11, §5 checks.

| Check | PixelDoll | Backpack |
|---|---|---|
| check / type-check | 0 errors (svelte-check + `tsc -p tsconfig.node.json`) | 0 errors |
| unit / self-tests | all self-tests passed, `ok agent-key` | 17 files, 346 tests passed |
| Mutation: drop the proxy check / the `Sec-Fetch-Site` check | 5 / 4 asserts fail | (same predicate) |
| `npm run build` | dist guard: clean; bundle hash unchanged (`index-Dw9XoXp9.js`) | dist guard: clean |
| Guard negatives (copy of dist) | inline `sourceMappingURL=data:` → exit 1; `devkey` → exit 1; `.env.local` + `.map` → exit 1 | (same script) |
| dist scan | 19 files, token-value hits 0, 0 maps, 0 `.env*`, 0 markers | 5 files, 0 / 0 / 0 / 0 |
| `vite build --mode agent` | refused, exit 1 | refused, exit 1 |
| Agent dev: same-origin endpoint | 200, is token | 200, is token |
| Agent dev: same-site | 403 | 403 |
| Agent dev: `x-forwarded-for` / `-host` / `-proto` / `-port` / `forwarded` / `via` | 403 each | 403 each |
| Agent dev app (unframed) | endpoint 200, `GET /v2/balance` 200 ×2 with the token, badge "Agent mode", storage token count 0 | endpoint 200, open check GETs 200, badge, storage 0 |
| Agent app framed by a :5402 page | 0 endpoint requests, 0 API calls (app loads, badge shown) | 0 / 0 |
| Human dev | no endpoint request, no API call, no badge, storage 0 | same |
| Preview of production build | no endpoint request, no API call, no badge, storage 0; `/__dev/pixellab-key` → SPA HTML, not token | same |
| e2e | `e2e-studio.mjs` all passed on human dev (:5332) and agent dev (:5331, incl. "agent server: badge shown, auto-connected") | `npx playwright test --workers=2`: 276 passed, 1 skipped (14.6m), exit 0 |
