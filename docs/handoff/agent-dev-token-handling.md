# Handoff: agent-only PixelLab token handling (`PIXELLAB_TOKEN_AGENT_DEV`)

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

1. **One variable name in both projects:** `PIXELLAB_TOKEN_AGENT_DEV` (name of the token → surface → environment).
   Rename any older name (`PIXELLAB_API_KEY`, `PIXELLAB_SECRET`, `VITE_*`, etc.) everywhere, including `.env.example` if any.
2. **It lives only in the repo-root `.env`**, which is git-ignored. It is never committed, never in CI secrets, and never in a
   `.env.*` file that a bundler loads automatically.
3. **A separate agent-only dev command** (`npm run dev:agent`) is the *only* path that reads it. The normal `npm run dev` must
   behave exactly like production regarding the token: no endpoint, no button, no auto-fill.
4. **Read server-side, per request.** The dev server reads `.env` itself and serves the token only to same-origin loopback
   requests. The token is **never injected through the bundler's env system** (no `VITE_`/`PUBLIC_`/`NEXT_PUBLIC_` prefix,
   no `define`), because that inlines it into JavaScript.
5. **The bundler loads no `.env` files at all** (Vite: `envDir: false`), so `import.meta.env` never carries the token, in any mode.
6. **The client-side auto-connect code is guarded by a compile-time constant** that is false in every non-agent mode
   (Vite: `import.meta.env.DEV && import.meta.env.MODE === 'agent'`), so production bundles contain no trace of it.
7. **Building in agent mode is refused** (the config throws).
8. **CI never sees the token.** It defines no secrets or env for it. After building, a **dist guard** step fails the build if
   the output contains the endpoint path, the variable name, agent markers, any `.env*` file, or source maps.
9. **Visible agent indicator.** In agent mode the app shows an "Agent mode" badge, so a human never mistakes it for the
   normal app.
10. **Keyless automation stays keyless.** Test scripts that must not spend credits set a kill switch
    (`localStorage['pixeldoll.agentKey'] = 'off'`) before the app loads, even on the agent server.
11. **Human token UX (production and normal dev):** the token is kept in memory for the tab by default. "Remember on this
    device" (localStorage) is opt-in. It is sent only as `Authorization: Bearer` to `https://api.pixellab.ai`, and never put
    in URLs, logs, exports, project files, job ledgers or provenance.
12. **Agents never print, log, screenshot or commit the token.** Agents check `GET /balance` (free) unless the task needs
    generations.

## 3. How PixelDoll implements it

### `app/package.json`
```json
"dev": "vite",
"dev:agent": "vite --mode agent --port 5199 --strictPort"
```

### `app/vite.config.ts` (abridged; full file in the repo)
```ts
// Same-origin requests from this machine only (Host = localhost, Sec-Fetch-Site = same-origin, loopback socket).
const localSameOrigin = (req: IncomingMessage) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
  /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '') &&
  req.headers['sec-fetch-site'] === 'same-origin'

// AI-agent automation only: serves PIXELLAB_TOKEN_AGENT_DEV from ../.env at /__dev/pixellab-key.
// Not registered at all for `npm run dev` or any build. Read server-side per request, never through Vite's env.
function agentKey(): Plugin {
  return {
    name: 'pixeldoll-agent-key',
    configureServer(server) {
      server.middlewares.use('/__dev/pixellab-key', (req, res) => {
        if (!localSameOrigin(req)) { res.statusCode = 403; return res.end() }
        let key = ''
        try { key = readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^PIXELLAB_TOKEN_AGENT_DEV=(.*)$/m)?.[1]?.trim() ?? '' } catch {}
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
if (import.meta.env.DEV && import.meta.env.MODE === 'agent' && !app.key) {
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
  <div class="agent-badge" title="npm run dev:agent: auto-connected with the agent token from .env (AI-agent testing only)">Agent mode</div>
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
token. Use `GET /balance` for checks. Keyless scripts set the kill switch.

### Node scripts (spikes, outside the app bundle)
`node --env-file=../../.env script.mjs` reads `process.env.PIXELLAB_TOKEN_AGENT_DEV`. These are agent research scripts. They
are never bundled or deployed.

### `.gitignore`
```gitignore
# secrets (PIXELLAB_TOKEN_AGENT_DEV lives in .env; never commit it)
.env
.env.*
```

### CI (`.github/workflows/pages.yml`)
Runs on every push and PR: `npm ci` → `check` → `selftest` → `build` → **dist guard**. Pushes to `main` also deploy to
GitHub Pages. No secrets, no env for the token.
```bash
bad=0
if grep -rlE '__dev|pixellab-key|PIXELLAB_TOKEN_AGENT_DEV|pixeldoll\.agentKey|agent-badge' dist; then echo '::error::dev or agent-key code in dist'; bad=1; fi
if find dist -name '.env*' | grep .; then echo '::error::.env file in dist'; bad=1; fi
if find dist -name '*.map' | grep .; then echo '::error::source map in dist (could carry env or source)'; bad=1; fi
exit $bad
```

## 4. Migration checklist for the other project

Adapt names and paths to that project's stack. If it isn't Vite, keep the same shape: a separate agent-only dev command, a
server-side read of `.env`, a compile-time guard on the client code, a refused agent build, and a CI dist guard.

1. [ ] Inventory every place the project reads a PixelLab token or env (`grep -rn "PIXELLAB\|import.meta.env\|process.env\|VITE_\|.env"`).
2. [ ] Rename the variable to `PIXELLAB_TOKEN_AGENT_DEV` everywhere (code, docs, launch configs, `.env.example`). Ask the human
       to rename it in their local `.env`; don't edit or print `.env` yourself unless they explicitly allow it.
3. [ ] Remove any bundler-env exposure of the token (`VITE_*`, `define`, `loadEnv` passed to the client) and disable
       automatic `.env` loading (Vite: `envDir: false`).
4. [ ] Add the `dev:agent` script and an agent-only dev-server endpoint that reads `.env` server-side and answers only
       same-origin loopback requests, `no-store`.
5. [ ] Register that endpoint only for `serve` + `agent` mode, and make an agent-mode build throw.
6. [ ] Gate client auto-connect behind `import.meta.env.DEV && import.meta.env.MODE === 'agent'` (or the stack's equivalent
       compile-time constant). Store the token in memory only. Honour the `localStorage` kill switch.
7. [ ] Remove every human-visible dev-token affordance ("use dev key" buttons, auto-fill in normal dev).
8. [ ] Add the "Agent mode" badge.
9. [ ] Human token UX: memory default, opt-in Remember, Bearer header only to the PixelLab API, never in URLs, logs or exports;
       warn on shared `*.github.io` origins if the project deploys to Pages.
10. [ ] `.gitignore` covers `.env` and `.env.*`. Confirm no tracked file contains the token (ask the human before running
        any check that reads the token value).
11. [ ] CI: no secrets or env for the token. Add the dist guard step (adjust the grep markers to the project's endpoint path,
        badge class and kill-switch key).
12. [ ] Add an "Agent testing" section to `AGENTS.md`/`CLAUDE.md` and agent launch configs (human config + agent config).
13. [ ] Verify (section 5) and record the evidence.

## 5. Verification (what PixelDoll checked)

- `npm run dev` → `GET /__dev/pixellab-key` is not handled (normal SPA fallback, no token). Connect shows only paste +
  Remember. No badge.
- `npm run dev:agent` → endpoint returns 200 to same-origin, 403 to cross-site or a wrong Host. The app auto-connects
  (balance shows) and the badge is visible.
- `vite build --mode agent` → throws.
- `npm run build` → the dist guard finds nothing. No `.env*`, no `*.map` in `dist/`.
- Built app served under a sub-path (`/PixelDoll/`) → loads with no CSP errors.
- Live GitHub Pages deploy → `GET /PixelDoll/__dev/pixellab-key` returns 404. No badge.

## 6. Don'ts

- Don't prefix the variable for the bundler (`VITE_`, `PUBLIC_`, …) or pass it via `define`.
- Don't give humans any shortcut to the `.env` token in any mode.
- Don't put the token in CI secrets, build args, artifacts or deploy environments.
- Don't print, log, screenshot or commit the token, and don't read `.env` contents into a chat or tool output.
- Don't auto-resend paid PixelLab POSTs after network or 5xx errors (separate PixelDoll rule; worth matching too).
