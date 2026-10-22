import { svelte } from '@sveltejs/vite-plugin-svelte'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

// Same-origin requests from this machine only (Host = localhost, Sec-Fetch-Site = same-origin, loopback socket).
const localSameOrigin = (req: IncomingMessage) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
  /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '') &&
  req.headers['sec-fetch-site'] === 'same-origin'

// Dev-only fixtures (s1, s4rig, s5): served at /fixtures/<name>/... by the dev server, never copied into dist.
const DEV_FIXTURES = fileURLToPath(new URL('./dev-fixtures', import.meta.url))
const TYPES: Record<string, string> = { json: 'application/json', png: 'image/png', txt: 'text/plain' }

// Dev server (any mode): /__dev/save (test sheets -> docs/testing/img), dev-fixtures and a CSP that allows Vite's HMR websocket.
// `apply: 'serve'` keeps it out of `vite build`.
function devTools(): Plugin {
  return {
    name: 'pixeldoll-dev-tools',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"),
    configureServer(server) {
      // POST body = PNG bytes -> docs/testing/img/<name>.png
      server.middlewares.use('/__dev/save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? ''
        if (req.method !== 'POST' || !localSameOrigin(req) || !/^[a-z0-9_.-]+\.png$/.test(name)) { res.statusCode = 403; return res.end() }
        const parts: Buffer[] = []
        req.on('data', (c: Buffer) => parts.push(c))
        req.on('end', () => {
          const dir = new URL('../docs/testing/img/', import.meta.url) // local-only (gitignored), may not exist in a fresh clone
          mkdirSync(dir, { recursive: true })
          writeFileSync(new URL(name, dir), Buffer.concat(parts))
          res.end('ok')
        })
      })
      // /fixtures/<name>/... -> app/dev-fixtures when the file exists there (else falls through to public/)
      server.middlewares.use('/fixtures', (req, res, next) => {
        let file: string
        try { file = resolve(DEV_FIXTURES, '.' + decodeURIComponent(new URL(req.url ?? '', 'http://x').pathname)) } catch { return next() }
        if (!file.startsWith(DEV_FIXTURES + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('content-type', TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream')
        res.end(readFileSync(file))
      })
    },
  }
}

// AI-agent automation only (`npm run dev:agent` = `vite --mode agent`): serves PIXELLAB_TOKEN_AGENT_DEV from ../.env at
// /__dev/pixellab-key. Not registered at all for `npm run dev` (humans paste their key like in production) or any build.
// The key is read server-side per request, never through Vite's env (no VITE_ prefix, nothing inlined).
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

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'agent') throw new Error('mode "agent" is dev-server only; never build with it')
  return {
    base: './', // ponytail: relative base so GitHub Pages subpath just works
    envDir: false, // never load .env files: nothing reaches import.meta.env, in any mode
    plugins: [svelte(), devTools(), command === 'serve' && mode === 'agent' && agentKey()],
  }
})
