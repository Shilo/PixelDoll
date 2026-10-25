# Handoff: agent-only PixelLab token handling (`PIXELLAB_API_KEY_AGENT_DEV`)

Audience: an AI agent working on **another project** that also uses the PixelLab API. Your job is to change that project's
environment-variable and PixelLab-token handling so it matches the contract below, which PixelDoll already implements.
Both projects must behave the same way.

Reference implementation: https://github.com/Shilo/PixelDoll (Svelte 5 + Vite 8 + TypeScript, client-only, GitHub Pages).

## 1. The goal

The PixelLab token in `.env` exists **only so AI agents (Claude, Codex, others) can test the app automatically in
development**, generating images without a human pasting the token into the running app.

| Who / where | Gets the `.env` token? |
|---|---|
| AI agent, development, agent-only command | **Yes**: the app connects automatically |
| Human, development (normal dev command) | **No**: `.env` is ignored; paste the token in the app like a production user |
| Production build / CI / GitHub Pages | **No**: no code that reads env or serves the token may exist in the build output |

## 2. The contract (must-haves)

1. **One variable name in both projects:** `PIXELLAB_API_KEY_AGENT_DEV` (service → credential → surface → environment).
   Rename any older name (`PIXELLAB_API_KEY`, `PIXELLAB_SECRET`, `VITE_*`, etc.) everywhere, including `.env.example` if any.
2. **It lives only in the repo-root `.env`**, which is git-ignored. It is never committed, never in CI secrets, and never in a
   `.env.*` file that a bundler loads automatically.
3. **A separate agent-only dev command** (`npm run dev:agent`) is the *only* path that reads it. The normal `npm run dev` must
   behave exactly like production regarding the token: no endpoint, no button, no auto-fill.
4. **Read server-side, per request.** The dev server reads `.env` itself and serves the token only to same-origin loopback
   requests, and never through a proxy (see section 3, `agent-key.ts`). The token is **never injected through the bundler's env system** (no `VITE_`/`PUBLIC_`/`NEXT_PUBLIC_` prefix,
   no `define`), because that inlines it into JavaScript.
5. **The bundler loads no `.env` files at all** (Vite: `envDir: false`), so `import.meta.env` never carries the token, in any mode.
6. **The client-side auto-connect code is guarded by a compile-time constant** that is false in every non-agent mode
   (Vite: `import.meta.env.DEV && import.meta.env.MODE === 'agent'`), so production bundles contain no trace of it. It also
   skips when the app is framed (`window.top === window`): another page could embed the agent app and clickjack it.
7. **Building in agent mode is refused** (the config throws).
8. **CI never sees the token.** It defines no secrets or env for it. `npm run build` ends with a **dist guard** script that
   fails the build if the output contains the endpoint path, the variable name (or an old name), agent markers, any `.env*`
   file, or a source map (file or inline `sourceMappingURL`). CI runs `npm run build`, so it runs the guard too.
9. **Visible agent indicator.** In agent mode the app shows an "Agent mode" badge, so a human never mistakes it for the
   normal app.
10. **Keyless automation stays keyless.** Test scripts that must not spend credits set a kill switch
    (`localStorage['pixeldoll.agentKey'] = 'off'`) before the app loads, even on the agent server.
11. **Human token UX (production and normal dev):** the token is kept per tab by default (in memory or sessionStorage).
    "Remember on this device" (localStorage) is opt-in. It is sent only as `Authorization: Bearer` to `https://api.pixellab.ai`, and never put
    in URLs, logs, exports, project files, job ledgers or provenance.
    Both apps use only `localStorage['pixellabApiKey']` for remembered keys. Do not read, migrate, write or remove older
    app-specific API-key entries. Forget removes the shared saved key and notifies cooperating open apps using the
    credential-free protocol in `docs/shared-token-security.md`. Keys remain plaintext by explicit user decision;
    Remember is optional, with no passphrase or extra unlock step.
12. **Agents never print, log, screenshot or commit the token.** Agents check `GET /balance` (free) unless the task needs
    generations.

## 3. How PixelDoll implements it

### `app/package.json`
```json
"dev": "vite",
"dev:agent": "vite --mode agent --port 5199 --strictPort"
```

### `app/agent-key.ts`: the request guard, one module for the middleware and its test
```ts
// Same-origin requests from this machine only: loopback socket, Host = localhost, Sec-Fetch-Site = same-origin, and no
// proxy headers (HTTP-aware proxies and tunnels add them).
export const localSameOrigin = (req: { headers: IncomingHttpHeaders; socket: { remoteAddress?: string } }) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
  /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '') &&
  req.headers['sec-fetch-site'] === 'same-origin' &&
  !Object.keys(req.headers).some((h) => h === 'forwarded' || h === 'via' || h.startsWith('x-forwarded-'))
```
Its `selfTest()` runs in `npm run selftest` (Backpack: `tests/unit/agent-key.test.ts` imports the same module). Cases: a valid
local request passes; `Sec-Fetch-Site` same-site / cross-site / none / missing, a foreign Host, `localhost.evil.example`, a
missing Host, a non-loopback socket and each of `forwarded`, `via`, `x-forwarded-for`, `x-forwarded-host`,
`x-forwarded-proto` are rejected. Without this test, a later "simplification" that drops the `Sec-Fetch-Site` check would
silently hand the token to every localhost page (Vite's default CORS allows every `localhost` origin).

The proxy-header check only catches HTTP-aware proxies and tunnels that add these headers. A raw TCP
forward (`ssh -L`/`-R`, `socat`) is indistinguishable from a local request, so the real control is the AGENTS.md rule:
never expose the agent server beyond localhost (no `--host`, tunnels or port forwards).

### `app/vite.config.ts` (abridged; full file in the repo)
```ts
import { localSameOrigin } from './agent-key.ts'

// AI-agent automation only: serves PIXELLAB_API_KEY_AGENT_DEV from ../.env at /__dev/pixellab-key.
// Not registered at all for `npm run dev` or any build. Read server-side per request, never through Vite's env.
function agentKey(): Plugin {
  return {
    name: 'pixeldoll-agent-key',
    configureServer(server) {
      server.middlewares.use('/__dev/pixellab-key', (req, res) => {
        if (!localSameOrigin(req)) { res.statusCode = 403; return res.end() }
        let key = ''
        try { key = readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^PIXELLAB_API_KEY_AGENT_DEV=(.*)$/m)?.[1]?.trim() ?? '' } catch {}
        res.setHeader('cache-control', 'no-store')
        res.statusCode = key ? 200 : 404
        res.end(key)
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'agent') throw new Error('mode "agent" is dev-server only; never build with it')
  return {
    base: './',
    envDir: false, // never load .env files: nothing reaches import.meta.env, in any mode
    plugins: [svelte(), command === 'serve' && mode === 'agent' && agentKey()],
  }
})
```

### `app/src/main.ts`: auto-connect, compiled out of every other mode
```ts
// Never when framed: another page could embed and clickjack the app.
if (import.meta.env.DEV && import.meta.env.MODE === 'agent' && window.top === window && !app.key) {
  let off = false
  try { off = localStorage.getItem('pixeldoll.agentKey') === 'off' } catch {}
  if (!off) fetch('/__dev/pixellab-key', { cache: 'no-store' })
    .then(async (r) => { if (r.ok) setKey(await r.text(), false) }) // false = memory only, never "remembered"
    .catch(() => {})
}
```

### `app/src/App.svelte`: badge
```svelte
{#if import.meta.env.DEV && import.meta.env.MODE === 'agent'}
  <div class="agent-badge" title="Agent dev server (npm run dev:agent), for AI-agent testing only">Agent mode</div>
{/if}
```

### Connect sheet (human flow)
- Paste field, "Remember on this device" switch (off by default).
- No dev/agent button of any kind (the old "Use dev key" button was removed).
- Warning when Remember is on and the app runs under a `*.github.io/<project>/` path, because all Pages projects of one
  account share that origin's localStorage.

### `.claude/launch.json` (agent tooling)
- `app-dev` → `npm --prefix app run dev` on :5173, for humans, no token.
- `app-dev-agent` → `npm --prefix app run dev:agent` on :5199, for agents only.

### `AGENTS.md`: "Agent testing" section
Tells every agent to use `dev:agent` / `app-dev-agent` to get the token. Humans never use it. Never print or commit the
token. Use `GET /balance` for checks. Keyless scripts set the kill switch (read at page load, it covers every tab of that
origin, so keep it set for the whole run). Never expose the agent server beyond localhost (no `--host`, tunnels or port
forwards).

### Node scripts (spikes, outside the app bundle)
`node --env-file=../../.env script.mjs` reads `process.env.PIXELLAB_API_KEY_AGENT_DEV`. These are agent research scripts. They
are never bundled or deployed.

### `.gitignore`
```gitignore
# secrets (PIXELLAB_API_KEY_AGENT_DEV lives in .env; never commit it)
.env
.env.*
```

### CI (`.github/workflows/pages.yml`)
Runs on every push and PR that changes `app/` or the workflow: `npm ci` → `check` → `selftest` → `build` (which ends with the **dist guard**). Pushes to `main`
also deploy to GitHub Pages. No secrets, no env for the token.
```json
"build": "vite build && node scripts/dist-guard.mjs"
```
`app/scripts/dist-guard.mjs` (same script as Backpack's `scripts/dist-guard.mjs`, only the kill-switch key differs) walks
`dist/`, prints file names only, and fails on any `.env*` file, any `*.map` file, or a file containing one of: `__dev`,
`pixellab-key`, `PIXELLAB_API_KEY_AGENT_DEV`, `PIXELLAB_API_KEY`, `API_KEY_OVERRIDE`, `DEV_API_KEY`, `devkey`,
`pixeldoll.agentKey`, `agent-badge`, `sourceMappingURL` (catches inline `data:` maps, whose base64 `sourcesContent` would
ship the agent block without matching any other marker). Running it inside `npm run build` also covers a local build that is
deployed by hand.

## 4. Migration checklist for the other project

Adapt names and paths to that project's stack. If it isn't Vite, keep the same shape: a separate agent-only dev command, a
server-side read of `.env`, a compile-time guard on the client code, a refused agent build, and a CI dist guard.

1. [ ] Inventory every place the project reads a PixelLab token or env (`grep -rn "PIXELLAB\|import.meta.env\|process.env\|VITE_\|.env"`).
2. [ ] Rename the variable to `PIXELLAB_API_KEY_AGENT_DEV` everywhere (code, docs, launch configs, `.env.example`). Ask the human
       to rename it in their local `.env`; don't edit or print `.env` yourself unless they explicitly allow it.
3. [ ] Remove any bundler-env exposure of the token (`VITE_*`, `define`, `loadEnv` passed to the client) and disable
       automatic `.env` loading (Vite: `envDir: false`).
4. [ ] Add the `dev:agent` script and an agent-only dev-server endpoint that reads `.env` server-side and answers only
       same-origin loopback requests without proxy headers, `no-store`. Put the request guard in its own tiny module that
       the middleware and a unit test both import.
5. [ ] Register that endpoint only for `serve` + `agent` mode, and make an agent-mode build throw.
6. [ ] Gate client auto-connect behind `import.meta.env.DEV && import.meta.env.MODE === 'agent'` (or the stack's equivalent
       compile-time constant) and `window.top === window` (no auto-connect when framed). Store the token in memory only.
       Honor the `localStorage` kill switch.
7. [ ] Remove every human-visible dev-token affordance ("use dev key" buttons, auto-fill in normal dev).
8. [ ] Add the "Agent mode" badge.
9. [ ] Human token UX: kept per tab by default (memory or sessionStorage), opt-in Remember, Bearer header only to the PixelLab API, never in URLs, logs or exports;
       warn on shared `*.github.io` origins if the project deploys to Pages.
10. [ ] `.gitignore` covers `.env` and `.env.*`. Confirm no tracked file contains the token (ask the human before running
        any check that reads the token value).
11. [ ] CI: no secrets or env for the token. Add `scripts/dist-guard.mjs` (copy it, change the kill-switch key) and run it
        from `npm run build`, so CI and local builds both run it.
12. [ ] Add an "Agent testing" section to `AGENTS.md`/`CLAUDE.md` and agent launch configs (human config + agent config).
13. [ ] Verify (section 5) and record the evidence.

## 4a. Target project: `C:\Programming_Files\Shilocity\PixelLab\pixellab-gallery`

State on 2026-10-21 (read-only survey by the PixelDoll PM; verify before editing):

- **Stack:** Svelte 5.57 + Vite 8.3 + TypeScript, `vitest` unit tests, Playwright e2e. Package name `pixellab-backpack`.
  Production CSP comes from `public/_headers` (`vite.config.ts` reuses it for `vite preview`).
- **Current env token:** `API_KEY_OVERRIDE` in the git-ignored `.env`. Nothing reads it any more: phase 4 task R17
  (`docs/plan/phase4-plan.md`) removed the old `?devkey` URL flag, the `__DEV_API_KEY__` `define` and `loadEnv`.
  That old design inlined the token into the bundle, which this contract forbids. Don't bring it back.
- **Key code:** `src/lib/api/http.ts` `setKey()` (per-mode stores) and `src/lib/data/library.svelte.ts`, which verifies a
  key before keeping it (`setKey(null)` on failure). Unit tests are in `tests/unit/http.test.ts`.
- **Missing:** no `.github/` CI, no git remote, no root `AGENTS.md`/`CLAUDE.md`, no agent dev script.

Concrete changes for pixellab-gallery:

1. Ask the human to rename `API_KEY_OVERRIDE` → `PIXELLAB_API_KEY_AGENT_DEV` in `.env`. Don't open or print `.env`.
2. `package.json`: add `"dev:agent": "vite --mode agent --port <free port> --strictPort"`. Keep `"dev": "vite"` unchanged.
3. `vite.config.ts`: switch to `defineConfig(({ command, mode }) => …)`. Keep `define: { __APP_VERSION__ }`, `build`,
   `preview.headers` and `test` exactly as they are. Add `envDir: false`, throw on `command === 'build' && mode === 'agent'`,
   and register the agent-key middleware (section 3) only for `serve` + `agent`, reading `PIXELLAB_API_KEY_AGENT_DEV`
   server-side.
4. `src/main.ts`: a gated block `if (import.meta.env.DEV && import.meta.env.MODE === 'agent')` that fetches the token and
   passes it through the **same verify-then-keep path a human uses** (`library.svelte.ts`), in the memory/session store,
   never "remembered". Honor a kill switch (e.g. `localStorage['backpack.agentKey'] = 'off'`).
5. Add an "Agent mode" badge in `App.svelte` behind the same guard.
6. Confirm the dev CSP allows the same-origin fetch (`connect-src 'self'`), so `public/_headers` needs no change for production.
7. Playwright: existing e2e specs run against mocks and must stay keyless. If a real-token smoke test is wanted, add a
   separate opt-in Playwright project whose `webServer` runs `dev:agent`, and never make it the default.
8. Add a dist-guard script (e.g. `scripts/dist-guard.mjs`, run after `npm run build`) that fails on `__dev`, the endpoint
   path, `PIXELLAB_API_KEY_AGENT_DEV`, `API_KEY_OVERRIDE`, `DEV_API_KEY`, `devkey`, the badge class, `.env*` files or `*.map`.
   Wire it into CI when CI is added.
9. Extend the phase-4 "Done when" grep to the new names. Make sure `grep -r "API_KEY_OVERRIDE\|DEV_API_KEY\|devkey" src
   vite.config.ts` stays empty, and that the agent code exists only behind the guard.
10. Add an "Agent testing" section to a root `AGENTS.md` (and `CLAUDE.md` → `@AGENTS.md`), mirroring PixelDoll's.
11. Add a `vitest` unit test that the agent block can't run outside `MODE === 'agent'`, or rely on the dist guard. Add one
    manual verification run per section 5.

## 5. Verification (what PixelDoll checked)

- `npm run dev` → `GET /__dev/pixellab-key` is not handled (normal SPA fallback, no token). Connect shows only paste +
  Remember. No badge.
- `npm run dev:agent` → endpoint returns 200 to same-origin, 403 to cross-site, a wrong Host, or any `forwarded`, `via` or
  `x-forwarded-*` header. The app auto-connects (balance shows) and the badge is visible.
- The agent app framed by a page on another localhost port → no endpoint request, no API call.
- `vite build --mode agent` → throws.
- `npm run build` → the dist guard prints "clean". No `.env*`, no `*.map` in `dist/`.
- Built app served under a sub-path (`/PixelDoll/`) → loads with no CSP errors.
- Live GitHub Pages deploy → `GET /PixelDoll/__dev/pixellab-key` returns 404. No badge.

## 6. Don'ts

- Don't prefix the variable for the bundler (`VITE_`, `PUBLIC_`, …) or pass it via `define`.
- Don't give humans any shortcut to the `.env` token in any mode.
- Don't put the token in CI secrets, build args, artifacts or deploy environments.
- Don't print, log, screenshot or commit the token, and don't read `.env` contents into a chat or tool output.
- Don't auto-resend paid PixelLab POSTs after network or 5xx errors (separate PixelDoll rule; worth matching too).
