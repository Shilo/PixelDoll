# Token modes verification — `PIXELLAB_TOKEN_AGENT_DEV` (2026-10-21)

PM test after the user renamed the `.env` variable. The token value was never printed: only its length, HTTP statuses and
yes/no checks were recorded.

| Mode | Command / server | Key endpoint `/__dev/pixellab-key` | App holds token | Badge | Stored token | Result |
|---|---|---|---|---|---|---|
| Agent dev | `npm run dev:agent` → :5199 | 200, 36-char token (not HTML) | yes: queue key 36 chars, role leader; PixelLab `/balance` 200 with it | "Agent mode" shown | none (memory only) | ✅ uses token |
| Human dev | `npm run dev` → :5173 (restarted, sole tab = leader) | not handled (SPA `index.html` fallback) | no | none | none | ✅ ignores token; Connect = paste field + Remember only |
| Production | `npm run build` + `vite preview` → :4173 | not handled (SPA fallback) | no; no `window.__queue` | none | none | ✅ ignores token |
| Production build files | `app/dist` | — | — | — | — | ✅ guard markers 0 matches; no `.env*`/`*.map`; token value found in **0** files |
| Agent build | `vite build --mode agent` | — | — | — | — | ✅ refused ("mode \"agent\" is dev-server only") |
| Live Pages | https://shilo.github.io/PixelDoll/ (earlier today) | 404 | no | none | — | ✅ |
